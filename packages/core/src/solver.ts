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
    },
  };
}

/**
 * Map solve metrics onto the 1-5 scale stored with the puzzle.
 *
 * A puzzle that never needs a guess is 1-3 depending on how thin the deductions
 * got; one that needs guessing is 4 or 5. Size nudges the result up a little,
 * because a 50x50 that is technically line-solvable is still a long evening.
 *
 * This is a heuristic and is expected to be retuned once there is a real
 * library to calibrate against. It is deterministic, which is what matters for
 * the TS/Go corpus.
 */
export function estimateDifficulty(metrics: SolveMetrics, width: number, height: number): number {
  let score: number;
  if (metrics.depth >= 3) score = 5;
  else if (metrics.depth >= 1) score = 4;
  else if (metrics.minInfo >= 0.35) score = 1;
  else if (metrics.minInfo >= 0.2) score = 2;
  else if (metrics.minInfo >= 0.08) score = 3;
  else score = 4;

  const longest = Math.max(width, height);
  if (longest > 30) score += 1;
  else if (longest <= 10 && score > 1) score -= 1;

  return Math.min(5, Math.max(1, score));
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
      difficulty: estimateDifficulty(metrics, puzzle.width, puzzle.height),
      rejectReason: 'the clues admit more than one solution',
      matchesDeclaredSolution: true,
      metrics,
    };
  }

  return {
    verified: true,
    unique: true,
    difficulty: estimateDifficulty(metrics, puzzle.width, puzzle.height),
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
