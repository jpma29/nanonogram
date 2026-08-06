/**
 * Line solver (02-arquitectura §5.1).
 *
 * Given one line of a nonogram — its clue sequence and what is currently known
 * about each cell — this computes, in `O(n * k)`, two things:
 *
 *   1. the set of colours each cell can still take across *all* legal
 *      completions of the line, and
 *   2. for each clue, how many distinct start positions it has across those
 *      same completions.
 *
 * (2) is what makes unambiguous clue cross-out possible (see `crossout.ts`): a
 * clue with exactly one possible start position is pinned, and a clue with more
 * than one is not, no matter how suggestive the line looks.
 *
 * Cell knowledge is a 32-bit domain mask. Bit 0 is the background; bit `c` is
 * palette colour index `c`. An unknown cell has every plausible bit set; a cell
 * the player crossed out has only bit 0; a filled cell has only its own bit.
 */

import { MAX_COLORS } from './grid.js';
import type { Clue } from './puzzle.js';

/** Bit for a colour index in a domain mask. */
export function colorBit(colorIndex: number): number {
  return 1 << colorIndex;
}

/** The background bit. */
export const BACKGROUND_BIT = 1;

/**
 * A domain mask allowing the background and colours `1..maxColor`.
 *
 * The `>>> 0` matters at the top of the range: with a full 31-entry palette
 * `maxColor` is 30, and `1 << 31` wraps to a negative int32, so the plain
 * expression would return -2147483649 rather than 0x7fffffff. Writing the mask
 * straight into a `Uint32Array` happens to launder it, but a caller comparing
 * the raw return value against a mask read back out of one would not match.
 */
export function fullDomain(maxColor: number): number {
  if (maxColor > MAX_COLORS) throw new RangeError(`too many colours: ${maxColor}`);
  return ((1 << (maxColor + 1)) - 1) >>> 0;
}

/** Number of colours a domain mask allows. */
export function domainSize(mask: number): number {
  let n = 0;
  let m = mask;
  while (m !== 0) {
    m &= m - 1;
    n++;
  }
  return n;
}

/** The single colour a domain allows, or -1 when it is not a singleton. */
export function singletonColor(mask: number): number {
  if (mask === 0 || (mask & (mask - 1)) !== 0) return -1;
  return 31 - Math.clz32(mask);
}

/** Outcome of analysing one line. */
export interface LineAnalysis {
  /** False when the line, as currently marked, admits no legal completion. */
  readonly feasible: boolean;
  /**
   * Refined per-cell domains. Same length as the input, always the input
   * intersected with what the clues allow. Only meaningful when feasible.
   */
  readonly domains: Uint32Array;
  /** Number of distinct start positions for each clue across all completions. */
  readonly startCount: Int32Array;
  /** First (and, when `startCount` is 1, only) start position of each clue. */
  readonly firstStart: Int32Array;
}

const UNKNOWN = 0;
const YES = 1;
const NO = 2;

/**
 * Reusable line-solving workspace.
 *
 * The puzzle solver runs this millions of times, so the buffers are allocated
 * once and grown on demand rather than per call. An engine is not reentrant:
 * do not call `analyze` from inside a callback that also uses the same engine.
 */
export class LineEngine {
  #n = -1;
  #k = -1;

  /** Feasibility memo over (cellIndex, clueIndex), size (n+1) * (k+1). */
  #memo = new Uint8Array(0);
  /** Reachability over the same state space. */
  #reach = new Uint8Array(0);
  /** Prefix counts of "cell allows colour c", one row per colour, size (n+1). */
  #allowPrefix = new Int32Array(0);
  /** Difference arrays for marking, one row per colour, size (n+2). */
  #diff = new Int32Array(0);
  #clueCount = new Int32Array(0);
  #clueColor = new Int32Array(0);

  #ensure(n: number, k: number, colors: number): void {
    const states = (n + 1) * (k + 1);
    if (this.#memo.length < states) {
      this.#memo = new Uint8Array(states);
      this.#reach = new Uint8Array(states);
    }
    const prefixSize = colors * (n + 1);
    if (this.#allowPrefix.length < prefixSize) this.#allowPrefix = new Int32Array(prefixSize);
    const diffSize = colors * (n + 2);
    if (this.#diff.length < diffSize) this.#diff = new Int32Array(diffSize);
    if (this.#clueCount.length < k) {
      this.#clueCount = new Int32Array(k);
      this.#clueColor = new Int32Array(k);
    }
    this.#n = n;
    this.#k = k;
  }

  #allows(color: number, i: number): boolean {
    const base = color * (this.#n + 1);
    return this.#allowPrefix[base + i + 1]! - this.#allowPrefix[base + i]! === 1;
  }

  /** True when every cell in `[from, from + len)` admits `color`. */
  #rangeAllows(color: number, from: number, len: number): boolean {
    const base = color * (this.#n + 1);
    return this.#allowPrefix[base + from + len]! - this.#allowPrefix[base + from]! === len;
  }

  /** Memoised: can cells `[i, n)` be completed with clues `[j, k)`? */
  #feasible(i: number, j: number): boolean {
    const stride = this.#k + 1;
    const slot = i * stride + j;
    const cached = this.#memo[slot]!;
    if (cached !== UNKNOWN) return cached === YES;

    let result = false;
    const n = this.#n;
    const k = this.#k;

    if (j === k) {
      // Every remaining cell must be background.
      result = this.#rangeAllows(0, i, n - i);
    } else {
      // Option A: leave cell i as background.
      if (i < n && this.#allows(0, i) && this.#feasible(i + 1, j)) {
        result = true;
      }
      // Option B: start clue j at cell i.
      if (!result) {
        const len = this.#clueCount[j]!;
        const color = this.#clueColor[j]!;
        if (i + len <= n && this.#rangeAllows(color, i, len)) {
          const after = i + len;
          const needsGap = j + 1 < k && this.#clueColor[j + 1] === color;
          if (needsGap) {
            if (after < n && this.#allows(0, after) && this.#feasible(after + 1, j + 1)) {
              result = true;
            }
          } else if (this.#feasible(after, j + 1)) {
            result = true;
          }
        }
      }
    }

    this.#memo[slot] = result ? YES : NO;
    return result;
  }

  /**
   * Analyse one line.
   *
   * @param clues   the line's clue sequence
   * @param cells   per-cell domain masks; not mutated
   * @param colors  number of palette colours including the background
   */
  analyze(clues: readonly Clue[], cells: Uint32Array, colors: number): LineAnalysis {
    const n = cells.length;
    const k = clues.length;
    this.#ensure(n, k, colors);

    const stride = k + 1;
    this.#memo.fill(UNKNOWN, 0, (n + 1) * stride);
    this.#reach.fill(0, 0, (n + 1) * stride);
    this.#allowPrefix.fill(0, 0, colors * (n + 1));
    this.#diff.fill(0, 0, colors * (n + 2));

    for (let j = 0; j < k; j++) {
      const clue = clues[j]!;
      if (clue.count < 1) throw new Error(`clue ${j} has non-positive count ${clue.count}`);
      if (clue.colorIndex < 1 || clue.colorIndex >= colors) {
        throw new Error(`clue ${j} has colour index ${clue.colorIndex} outside 1..${colors - 1}`);
      }
      this.#clueCount[j] = clue.count;
      this.#clueColor[j] = clue.colorIndex;
    }

    for (let c = 0; c < colors; c++) {
      const base = c * (n + 1);
      const bit = 1 << c;
      let running = 0;
      for (let i = 0; i < n; i++) {
        if ((cells[i]! & bit) !== 0) running++;
        this.#allowPrefix[base + i + 1] = running;
      }
    }

    const domains = new Uint32Array(n);
    const startCount = new Int32Array(k);
    const firstStart = new Int32Array(k).fill(-1);

    if (!this.#feasible(0, 0)) {
      return { feasible: false, domains, startCount, firstStart };
    }

    this.#reach[0] = 1;
    const diffStride = n + 2;

    for (let i = 0; i <= n; i++) {
      for (let j = 0; j <= k; j++) {
        if (this.#reach[i * stride + j] === 0) continue;

        // Place clue j starting at cell i.
        if (j < k) {
          const len = this.#clueCount[j]!;
          const color = this.#clueColor[j]!;
          if (i + len <= n && this.#rangeAllows(color, i, len)) {
            const after = i + len;
            const needsGap = j + 1 < k && this.#clueColor[j + 1] === color;
            let nextI = -1;
            if (needsGap) {
              if (after < n && this.#allows(0, after) && this.#feasible(after + 1, j + 1)) {
                nextI = after + 1;
              }
            } else if (this.#feasible(after, j + 1)) {
              nextI = after;
            }
            if (nextI >= 0) {
              const cBase = color * diffStride;
              this.#diff[cBase + i] = this.#diff[cBase + i]! + 1;
              this.#diff[cBase + after] = this.#diff[cBase + after]! - 1;
              if (needsGap) {
                // The forced separator cell is background (colour 0, base 0).
                this.#diff[after] = this.#diff[after]! + 1;
                this.#diff[after + 1] = this.#diff[after + 1]! - 1;
              }
              this.#reach[nextI * stride + j + 1] = 1;
              if (startCount[j]! === 0) firstStart[j] = i;
              startCount[j] = startCount[j]! + 1;
            }
          }
        }

        // Leave cell i as background.
        if (i < n && this.#allows(0, i) && this.#feasible(i + 1, j)) {
          this.#diff[i] = this.#diff[i]! + 1;
          this.#diff[i + 1] = this.#diff[i + 1]! - 1;
          this.#reach[(i + 1) * stride + j] = 1;
        }
      }
    }

    for (let c = 0; c < colors; c++) {
      const base = c * diffStride;
      const bit = 1 << c;
      let running = 0;
      for (let i = 0; i < n; i++) {
        running += this.#diff[base + i]!;
        if (running > 0) domains[i] = domains[i]! | bit;
      }
    }

    return { feasible: true, domains, startCount, firstStart };
  }
}

/** Convenience wrapper around a throwaway {@link LineEngine}. */
export function analyzeLine(
  clues: readonly Clue[],
  cells: Uint32Array,
  colors: number,
): LineAnalysis {
  return new LineEngine().analyze(clues, cells, colors);
}

/**
 * Refine one line's domains, or return `null` when the line is contradictory.
 * The common entry point for the propagation loop in `solver.ts`.
 */
export function solveLine(
  clues: readonly Clue[],
  cells: Uint32Array,
  colors: number,
  engine: LineEngine = new LineEngine(),
): Uint32Array | null {
  const result = engine.analyze(clues, cells, colors);
  return result.feasible ? result.domains : null;
}
