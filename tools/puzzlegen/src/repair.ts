/**
 * Nudging a picture until it is a proper puzzle.
 *
 * A rasterised picture is not automatically a good nonogram. It may admit more
 * than one solution, or admit exactly one but only reachable by guessing and
 * backtracking — which serious players consider a broken puzzle, and which the
 * established publishers do not ship.
 *
 * Both faults are usually repairable by moving the outline by a pixel or two.
 * Ambiguity in a nonogram lives on the boundary of the shape, not in its
 * interior, so flipping a boundary cell reorders the clues of exactly the two
 * lines where the problem is — and leaves the silhouette alone. In practice one
 * pixel fixes the majority of cases.
 *
 * Interior cells are never touched: punching a hole in a shape is exactly the
 * kind of edit that ruins the picture.
 */

import { createPuzzle, monochromePalette, propagateOnly } from '@nanonogram/core';
import { type Bitmap, at, createBitmap, neighbours } from './bitmap.js';

export interface RepairOptions {
  /** Most pixels the repair may move. Keep small; this is a picture. */
  readonly maxEdits?: number;
  /** Reject a candidate edit that leaves an isolated pixel behind. */
  readonly forbidIsolated?: boolean;
}

export interface RepairResult {
  readonly grid: Bitmap;
  /** Cell indices that were flipped, in the order they were applied. */
  readonly edits: readonly number[];
  /** True when the result is unique and solvable by pure logic. */
  readonly pure: boolean;
  /** Cells still undecided by pure deduction. 0 means success. */
  readonly undecided: number;
  /** True when the picture was already a proper puzzle and nothing was moved. */
  readonly wasAlreadyPure: boolean;
}

function copy(bitmap: Bitmap): Bitmap {
  return { width: bitmap.width, height: bitmap.height, data: Uint8Array.from(bitmap.data) };
}

/**
 * How far pure line-by-line deduction gets on this picture.
 *
 * @returns cells left undecided, or `Infinity` when the grid is degenerate.
 */
export function undecidedCells(grid: Bitmap): number {
  const solution = Uint8Array.from(grid.data);
  let puzzle;
  try {
    puzzle = createPuzzle({
      id: 'puzzlegen',
      width: grid.width,
      height: grid.height,
      solution,
      palette: monochromePalette(),
    });
  } catch {
    return Number.POSITIVE_INFINITY;
  }
  const result = propagateOnly(puzzle);
  return result.contradiction ? Number.POSITIVE_INFINITY : result.undecided;
}

/** Cells on the outline: ink touching paper, or paper touching ink. */
export function boundaryCells(grid: Bitmap): number[] {
  const out: number[] = [];
  for (let y = 0; y < grid.height; y++) {
    for (let x = 0; x < grid.width; x++) {
      const v = grid.data[y * grid.width + x]!;
      if (
        at(grid, x - 1, y) !== v ||
        at(grid, x + 1, y) !== v ||
        at(grid, x, y - 1) !== v ||
        at(grid, x, y + 1) !== v
      ) {
        out.push(y * grid.width + x);
      }
    }
  }
  return out;
}

function hasIsolatedInk(grid: Bitmap): boolean {
  for (let y = 0; y < grid.height; y++) {
    for (let x = 0; x < grid.width; x++) {
      if (grid.data[y * grid.width + x] && neighbours(grid, x, y) === 0) return true;
    }
  }
  return false;
}

/**
 * Walk the outline downhill until the puzzle is decided by logic alone.
 *
 * At each step every boundary flip is tried and the one that leaves the fewest
 * cells undecided wins. The objective is the number of cells pure deduction
 * cannot settle: reaching zero means the puzzle is both uniquely solvable and
 * solvable without a single guess — there is nothing left to branch on.
 */
export function repairToPureLogic(grid: Bitmap, options: RepairOptions = {}): RepairResult {
  const maxEdits = options.maxEdits ?? 4;
  const forbidIsolated = options.forbidIsolated ?? true;

  const current = copy(grid);
  let score = undecidedCells(current);
  if (score === 0) {
    return { grid: current, edits: [], pure: true, undecided: 0, wasAlreadyPure: true };
  }

  const edits: number[] = [];
  for (let step = 0; step < maxEdits && score > 0; step++) {
    let bestIndex = -1;
    let bestScore = score;
    for (const index of boundaryCells(current)) {
      current.data[index] = current.data[index]! ^ 1;
      if (!forbidIsolated || !hasIsolatedInk(current)) {
        const candidate = undecidedCells(current);
        if (candidate < bestScore) {
          bestScore = candidate;
          bestIndex = index;
        }
      }
      current.data[index] = current.data[index]! ^ 1;
    }
    if (bestIndex < 0) break; // no single flip improves things; stop rather than thrash
    current.data[bestIndex] = current.data[bestIndex]! ^ 1;
    edits.push(bestIndex);
    score = bestScore;
  }

  return {
    grid: current,
    edits,
    pure: score === 0,
    undecided: score === Number.POSITIVE_INFINITY ? current.data.length : score,
    wasAlreadyPure: false,
  };
}

/** A blank grid of the same shape. Handy in tests. */
export function blankLike(grid: Bitmap): Bitmap {
  return createBitmap(grid.width, grid.height);
}
