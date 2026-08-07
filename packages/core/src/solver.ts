/**
 * Whole-puzzle solving: uniqueness verification and difficulty estimation
 * (02-arquitectura §5.1 and §5.3).
 *
 * The method is the standard one. Propagate the line solver over every row and
 * column until nothing changes; if cells remain undecided, branch on the most
 * constrained one and recurse. Counting solutions up to two is enough — the
 * only question ever asked is "is this unique?".
 *
 * The same algorithm is reimplemented in Go on the server (Fase 2). The
 * `shared-tests` corpus exists so the two cannot drift (risk R4).
 */

import { LineEngine, domainSize, fullDomain, singletonColor } from './linesolver.js';
import type { Clue, Puzzle } from './puzzle.js';

export interface SolveOptions {
  /** Stop once this many solutions are found. Default 2. */
  readonly maxSolutions?: number;
  /** Give up after this many branch nodes. Default 200_000. */
  readonly nodeBudget?: number;
}

/** Metrics that feed the difficulty estimate (02-arquitectura §5.3). */
export interface SolveMetrics {
  /** How deep the search had to guess. 0 means pure line solving. */
  readonly depth: number;
  /** Constraint-propagation passes at the top level, before any guessing. */
  readonly passes: number;
  /**
   * The tightest moment: the smallest ratio of "cells resolved by this pass" to
   * "cells still unknown when the pass started", over the top-level passes.
   * A puzzle that only ever yields one cell at a time scores low here.
   */
  readonly minInfo: number;
  /**
   * The **opening**: the fraction of cells a player can fill in before they
   * have to cross-reference anything, obtained by reading each row and each
   * column once, in isolation, from a blank grid.
   *
   * This is the single best predictor of how a pure-logic nonogram *feels*. A
   * puzzle where half the board falls out of the opening is a formality; one
   * that opens with almost nothing forces the player to play rows against
   * columns from the very first move, which is where the actual difficulty of
   * this kind of puzzle lives. See {@link openingShare}.
   */
  readonly openness: number;
}

export interface SolveResult {
  /** Solutions found, capped at `maxSolutions`. Row-major colour indices. */
  readonly solutions: Uint8Array[];
  /** True when exactly one solution exists. */
  readonly unique: boolean;
  /** True when the search hit its node budget and the answer is inconclusive. */
  readonly exhausted: boolean;
  readonly metrics: SolveMetrics;
}

interface Context {
  readonly width: number;
  readonly height: number;
  readonly colors: number;
  readonly rowClues: readonly (readonly Clue[])[];
  readonly colClues: readonly (readonly Clue[])[];
  readonly engine: LineEngine;
  readonly maxSolutions: number;
  nodeBudget: number;
  solutions: Uint8Array[];
  maxDepth: number;
  topLevelPasses: number;
  minInfo: number;
  exhausted: boolean;
}

/** Read a line's domains out of the grid into a scratch buffer. */
function gatherLine(
  domains: Uint32Array,
  ctx: Context,
  isRow: boolean,
  lineIndex: number,
  out: Uint32Array,
): void {
  if (isRow) {
    const base = lineIndex * ctx.width;
    for (let x = 0; x < ctx.width; x++) out[x] = domains[base + x]!;
  } else {
    for (let y = 0; y < ctx.height; y++) out[y] = domains[y * ctx.width + lineIndex]!;
  }
}

/**
 * Run constraint propagation to a fixed point.
 *
 * @returns the number of cells resolved, or -1 on contradiction.
 */
function propagate(
  domains: Uint32Array,
  ctx: Context,
  dirtyRows: Uint8Array,
  dirtyCols: Uint8Array,
  trackInfo: boolean,
): number {
  const { width, height } = ctx;
  const scratch = new Uint32Array(Math.max(width, height));
  let resolvedTotal = 0;

  for (;;) {
    let pendingBefore = 0;
    if (trackInfo) {
      for (let i = 0; i < domains.length; i++) if (domainSize(domains[i]!) > 1) pendingBefore++;
    }

    let changedThisPass = 0;
    let sawDirty = false;

    for (let y = 0; y < height; y++) {
      if (!dirtyRows[y]) continue;
      dirtyRows[y] = 0;
      sawDirty = true;
      const line = scratch.subarray(0, width);
      gatherLine(domains, ctx, true, y, line);
      const analysis = ctx.engine.analyze(ctx.rowClues[y]!, line, ctx.colors);
      if (!analysis.feasible) return -1;
      const base = y * width;
      for (let x = 0; x < width; x++) {
        const next = analysis.domains[x]!;
        const prev = domains[base + x]!;
        if (next === prev) continue;
        if (next === 0) return -1;
        const wasOpen = domainSize(prev) > 1;
        domains[base + x] = next;
        dirtyCols[x] = 1;
        if (wasOpen && domainSize(next) === 1) changedThisPass++;
      }
    }

    for (let x = 0; x < width; x++) {
      if (!dirtyCols[x]) continue;
      dirtyCols[x] = 0;
      sawDirty = true;
      const line = scratch.subarray(0, height);
      gatherLine(domains, ctx, false, x, line);
      const analysis = ctx.engine.analyze(ctx.colClues[x]!, line, ctx.colors);
      if (!analysis.feasible) return -1;
      for (let y = 0; y < height; y++) {
        const next = analysis.domains[y]!;
        const prev = domains[y * width + x]!;
        if (next === prev) continue;
        if (next === 0) return -1;
        const wasOpen = domainSize(prev) > 1;
        domains[y * width + x] = next;
        dirtyRows[y] = 1;
        if (wasOpen && domainSize(next) === 1) changedThisPass++;
      }
    }

    if (!sawDirty) break;
    resolvedTotal += changedThisPass;

    if (trackInfo) {
      ctx.topLevelPasses++;
      if (pendingBefore > 0 && changedThisPass > 0) {
        ctx.minInfo = Math.min(ctx.minInfo, changedThisPass / pendingBefore);
      }
    }
    if (changedThisPass === 0 && !sawDirty) break;
  }

  return resolvedTotal;
}

function allDecided(domains: Uint32Array): boolean {
  for (let i = 0; i < domains.length; i++) {
    if (domainSize(domains[i]!) !== 1) return false;
  }
  return true;
}

function toSolution(domains: Uint32Array): Uint8Array {
  const out = new Uint8Array(domains.length);
  for (let i = 0; i < domains.length; i++) out[i] = singletonColor(domains[i]!);
  return out;
}

function search(domains: Uint32Array, ctx: Context, depth: number): void {
  if (ctx.solutions.length >= ctx.maxSolutions || ctx.exhausted) return;
  if (ctx.nodeBudget-- <= 0) {
    ctx.exhausted = true;
    return;
  }
  ctx.maxDepth = Math.max(ctx.maxDepth, depth);

  const dirtyRows = new Uint8Array(ctx.height).fill(1);
  const dirtyCols = new Uint8Array(ctx.width).fill(1);
  if (propagate(domains, ctx, dirtyRows, dirtyCols, depth === 0) < 0) return;

  if (allDecided(domains)) {
    ctx.solutions.push(toSolution(domains));
    return;
  }

  // Branch on the most constrained undecided cell.
  let pick = -1;
  let pickSize = Number.POSITIVE_INFINITY;
  for (let i = 0; i < domains.length; i++) {
    const size = domainSize(domains[i]!);
    if (size > 1 && size < pickSize) {
      pick = i;
      pickSize = size;
      if (size === 2) break;
    }
  }
  if (pick < 0) return;

  const mask = domains[pick]!;
  for (let c = 0; c < ctx.colors; c++) {
    const bit = 1 << c;
    if ((mask & bit) === 0) continue;
    const branch = domains.slice();
    branch[pick] = bit;
    search(branch, ctx, depth + 1);
    if (ctx.solutions.length >= ctx.maxSolutions || ctx.exhausted) return;
  }
}

/** What pure line-by-line deduction alone can establish about a puzzle. */
export interface PropagationResult {
  /** True when the clues contradict each other outright. */
  readonly contradiction: boolean;
  /**
   * Cells still undecided once propagation reaches its fixed point. Zero means
   * the puzzle falls out by deduction alone, with no guessing anywhere.
   */
  readonly undecided: number;
  /** Refined domains at the fixed point. */
  readonly domains: Uint32Array;
  /** Propagation passes it took to get there. */
  readonly passes: number;
}

function contextFor(puzzle: Puzzle, options: SolveOptions = {}): Context {
  const colors = puzzle.palette.keys.length;
  return {
    width: puzzle.width,
    height: puzzle.height,
    colors,
    rowClues: puzzle.rowClues,
    colClues: puzzle.colClues,
    engine: new LineEngine(),
    maxSolutions: options.maxSolutions ?? 2,
    nodeBudget: options.nodeBudget ?? 200_000,
    solutions: [],
    maxDepth: 0,
    topLevelPasses: 0,
    minInfo: 1,
    exhausted: false,
  };
}

/**
 * Run constraint propagation only — no guessing, no backtracking.
 *
 * This answers a question the plain solver cannot: *how* a puzzle is solved,
 * not just whether it has one answer. A puzzle can have a unique solution and
 * still force the player to guess a cell and see whether it blows up ten moves
 * later. Experienced players consider that a broken puzzle, and it is the line
 * the major nonogram publishers draw: every shipped puzzle must fall out by
 * deduction alone.
 *
 * `undecided === 0` on a non-contradictory puzzle means exactly that, and it
 * implies uniqueness for free — there is nothing left to branch on.
 */
export function propagateOnly(puzzle: Puzzle): PropagationResult {
  const ctx = contextFor(puzzle);
  const domains = new Uint32Array(puzzle.width * puzzle.height).fill(fullDomain(ctx.colors - 1));
  const dirtyRows = new Uint8Array(ctx.height).fill(1);
  const dirtyCols = new Uint8Array(ctx.width).fill(1);
  const resolved = propagate(domains, ctx, dirtyRows, dirtyCols, true);
  if (resolved < 0) {
    return { contradiction: true, undecided: domains.length, domains, passes: ctx.topLevelPasses };
  }
  let undecided = 0;
  for (let i = 0; i < domains.length; i++) if (domainSize(domains[i]!) > 1) undecided++;
  return { contradiction: false, undecided, domains, passes: ctx.topLevelPasses };
}

/**
 * The opening: what a single reading of every row and every column, each in
 * isolation from a blank grid, decides on its own.
 *
 * No information flows between lines here — that is the point. This is the
 * board as it looks to a player who has done one sweep of the clues and not yet
 * combined anything, and it measures how generous the puzzle is at the start.
 *
 * @returns the fraction of cells decided, between 0 and 1.
 */
export function openingShare(puzzle: Puzzle): number {
  const ctx = contextFor(puzzle);
  const { width, height, colors, engine } = ctx;
  const all = fullDomain(colors - 1);
  const blank = new Uint32Array(Math.max(width, height)).fill(all);
  const decided = new Uint32Array(width * height).fill(all);

  for (let y = 0; y < height; y++) {
    const analysis = engine.analyze(puzzle.rowClues[y]!, blank.subarray(0, width), colors);
    if (!analysis.feasible) return 0;
    const base = y * width;
    for (let x = 0; x < width; x++) decided[base + x] = decided[base + x]! & analysis.domains[x]!;
  }
  for (let x = 0; x < width; x++) {
    const analysis = engine.analyze(puzzle.colClues[x]!, blank.subarray(0, height), colors);
    if (!analysis.feasible) return 0;
    for (let y = 0; y < height; y++) {
      decided[y * width + x] = decided[y * width + x]! & analysis.domains[y]!;
    }
  }

  let n = 0;
  for (let i = 0; i < decided.length; i++) if (domainSize(decided[i]!) === 1) n++;
  return decided.length === 0 ? 0 : n / decided.length;
}

/**
 * True when the puzzle is solvable by pure logic: every cell is forced by
 * line-by-line deduction, never by trial and error (see {@link propagateOnly}).
 */
export function isLineSolvable(puzzle: Puzzle): boolean {
  const result = propagateOnly(puzzle);
  return !result.contradiction && result.undecided === 0;
}

/**
 * Solve a puzzle from its clues alone, ignoring its stored solution.
 *
 * Unlike {@link propagateOnly}, this will guess and backtrack when deduction
 * stalls, so it can answer "is this uniquely solvable *at all*" — a weaker
 * question than "is this solvable by logic".
 */
export function solvePuzzle(puzzle: Puzzle, options: SolveOptions = {}): SolveResult {
  const colors = puzzle.palette.keys.length;
  const ctx: Context = {
    width: puzzle.width,
    height: puzzle.height,
    colors,
    rowClues: puzzle.rowClues,
    colClues: puzzle.colClues,
    engine: new LineEngine(),
    maxSolutions: options.maxSolutions ?? 2,
    nodeBudget: options.nodeBudget ?? 200_000,
    solutions: [],
    maxDepth: 0,
    topLevelPasses: 0,
    minInfo: 1,
    exhausted: false,
  };

  const domains = new Uint32Array(puzzle.width * puzzle.height).fill(fullDomain(colors - 1));
  search(domains, ctx, 0);

  return {
    solutions: ctx.solutions,
    unique: !ctx.exhausted && ctx.solutions.length === 1,
    exhausted: ctx.exhausted,
    metrics: {
      depth: ctx.maxDepth,
      passes: ctx.topLevelPasses,
      minInfo: ctx.solutions.length > 0 ? ctx.minInfo : 1,
      openness: openingShare(puzzle),
    },
  };
}

/**
 * Weights and thresholds for {@link estimateDifficulty}.
 *
 * Fixed constants, deliberately. Difficulty has to mean the same thing on a
 * library of 100 puzzles and one of 10 000, in 2026 and in 2030, and in the Go
 * implementation on the server — so it cannot be a percentile of whatever
 * happens to be in the database today. These were calibrated once, against 703
 * generated pure-logic puzzles at 10x10, 15x15 and 20x20, and then frozen.
 *
 * That calibration produced roughly a 28 / 27 / 24 / 15 / 7 spread across the
 * five levels: a curve, with the hard end scarce, which is what a library
 * wants.
 */
export const DIFFICULTY_WEIGHTS = {
  /** Weight of the opening. The primary signal. */
  opening: 0.7,
  /** Weight of the deduction-chain length. Secondary. */
  chain: 0.3,
  /** Passes at or below this no longer count as chain length. */
  passesFloor: 3,
  /** Passes at or above this max out the chain term. */
  passesCeiling: 12,
  /** Raw-score cutoffs for levels 2, 3, 4 and 5. */
  thresholds: [0.24, 0.37, 0.49, 0.63] as readonly number[],
} as const;

const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);

/**
 * Map solve metrics onto the 1-5 scale stored with the puzzle.
 *
 * Two terms, and the split is the whole idea:
 *
 * - **The opening** (`1 - openness`), weighted 0.7. How little the player gets
 *   for free from one reading of the clues. This is what separates a puzzle you
 *   fill in on autopilot from one that makes you play rows against columns from
 *   the first move.
 * - **The chain** (`passes`), weighted 0.3. How many times deduction has to go
 *   back and forth before the board closes. Long chains make a puzzle *long*; a
 *   tight opening makes it *hard*. Not the same thing, which is why both are
 *   here and why the opening carries more weight.
 *
 * **Grid size is deliberately not a term.** The measured correlation between
 * size and opening is strong on its own — a 20x20 opens at a median 0.45 where
 * a 10x10 opens at 0.63 — so adding a size bonus counted the same effect twice.
 * Size is also the one property the player can already see before starting.
 * Conflating "big" with "hard" is what made the first version of this function
 * useless.
 *
 * A puzzle that cannot be solved without guessing is off this scale and scores
 * 5, though such a puzzle should never have been published (see
 * {@link isLineSolvable}).
 */
export function estimateDifficulty(metrics: SolveMetrics): number {
  if (metrics.depth > 0) return 5;

  const { opening, chain, passesFloor, passesCeiling, thresholds } = DIFFICULTY_WEIGHTS;
  const openingTerm = 1 - clamp01(metrics.openness);
  const chainTerm = clamp01(
    (metrics.passes - passesFloor) / Math.max(1, passesCeiling - passesFloor),
  );
  const raw = opening * openingTerm + chain * chainTerm;

  let level = 1;
  for (const t of thresholds) if (raw >= t) level++;
  return Math.min(5, Math.max(1, level));
}

/** Result of validating a puzzle before it enters a library (RF-BIB-6). */
export interface VerificationResult {
  readonly verified: boolean;
  readonly unique: boolean;
  readonly difficulty: number | null;
  /** Why the puzzle was rejected, or null when it passed. */
  readonly rejectReason: string | null;
  /** True when the declared solution matches the one the solver found. */
  readonly matchesDeclaredSolution: boolean;
  readonly metrics: SolveMetrics;
}

/**
 * The import gate: solve from the clues, confirm the declared solution is the
 * one that comes back, and score the difficulty.
 */
export function verifyPuzzle(puzzle: Puzzle, options: SolveOptions = {}): VerificationResult {
  const result = solvePuzzle(puzzle, options);
  const metrics = result.metrics;

  if (result.exhausted) {
    return {
      verified: false,
      unique: false,
      difficulty: null,
      rejectReason: 'solver exceeded its node budget; puzzle is too hard to verify',
      matchesDeclaredSolution: false,
      metrics,
    };
  }
  if (result.solutions.length === 0) {
    return {
      verified: false,
      unique: false,
      difficulty: null,
      rejectReason: 'the clues admit no solution',
      matchesDeclaredSolution: false,
      metrics,
    };
  }

  const matches = result.solutions.some((s) => sameGrid(s, puzzle.solution));
  if (!matches) {
    return {
      verified: false,
      unique: result.solutions.length === 1,
      difficulty: null,
      rejectReason: 'the declared solution does not satisfy the clues',
      matchesDeclaredSolution: false,
      metrics,
    };
  }
  if (result.solutions.length > 1) {
    return {
      verified: false,
      unique: false,
      difficulty: estimateDifficulty(metrics),
      rejectReason: 'the clues admit more than one solution',
      matchesDeclaredSolution: true,
      metrics,
    };
  }

  return {
    verified: true,
    unique: true,
    difficulty: estimateDifficulty(metrics),
    rejectReason: null,
    matchesDeclaredSolution: true,
    metrics,
  };
}

function sameGrid(a: ArrayLike<number>, b: ArrayLike<number>): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}
