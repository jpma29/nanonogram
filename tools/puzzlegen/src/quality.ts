/**
 * Is this grid worth playing?
 *
 * Uniqueness and pure-logic solvability say a puzzle is *valid*. They say
 * nothing about whether it is any good. These measures catch the boards that
 * are technically fine and joyless: nearly empty, nearly full, or so broken up
 * that every line is a string of ones.
 */

import { type Bitmap, contentCrop, inkCount, neighbours } from './bitmap.js';

export interface QualityMetrics {
  /** Share of cells that are ink. */
  readonly fill: number;
  /** Highest number of clue blocks in any single line. */
  readonly maxBlocks: number;
  /** Mean blocks per line across rows and columns. */
  readonly averageBlocks: number;
  /** Ink cells with no orthogonal neighbour. Should be zero. */
  readonly isolated: number;
  /** Rows and columns with no clue at all, inside the picture. */
  readonly emptyLines: number;
  /**
   * Share of ink sitting in specks — runs of one or two cells with nothing
   * attached. This is what dithering produces, and what makes a clue line
   * degenerate into a row of ones.
   */
  readonly noiseShare: number;
  /** Board cells outside the picture: padding, and not part of the puzzle. */
  readonly paddingCells: number;
}

export interface QualityThresholds {
  readonly minFill?: number;
  readonly maxFill?: number;
  readonly maxIsolated?: number;
  /** As a share of all lines, rows and columns together. */
  readonly maxEmptyLineShare?: number;
  /** Blocks in a single line, above which the clues become a wall of digits. */
  readonly maxBlocksPerLine?: number;
  /**
   * How much speckle is tolerable. A little reads as texture; past this it is
   * just noise, and every line becomes a row of ones.
   */
  readonly maxNoiseShare?: number;
}

/**
 * Calibrated against generated boards.
 *
 * These are measured over the **picture**, not the board. Grids are padded out
 * to a multiple of five (`fit.ts`), and those all-blank border rows are layout,
 * not content — a puzzle is not sparse because it has a margin. Counting them
 * once forced these thresholds to be loosened to compensate, which was a fudge
 * for a measurement error; excluding them lets the honest numbers stand.
 */
const DEFAULT_THRESHOLDS = {
  minFill: 0.25,
  maxFill: 0.62,
  maxIsolated: 0,
  maxEmptyLineShare: 0.5,
  maxBlocksPerLine: 8,
  maxNoiseShare: 0.3,
} as const;

function blocksInLine(values: readonly number[]): number {
  let n = 0;
  for (let i = 0; i < values.length; i++) {
    if (values[i] === 1 && (i === 0 || values[i - 1] === 0)) n++;
  }
  return n;
}

/** Runs of one or two connected ink cells — the signature of dithering. */
function speckledInk(bitmap: Bitmap): number {
  const { width, height, data } = bitmap;
  const seen = new Uint8Array(width * height);
  let speckled = 0;
  const stack: number[] = [];
  for (let start = 0; start < data.length; start++) {
    if (!data[start] || seen[start]) continue;
    seen[start] = 1;
    stack.push(start);
    const cells: number[] = [];
    while (stack.length > 0) {
      const index = stack.pop()!;
      cells.push(index);
      const x = index % width;
      const y = (index - x) / width;
      for (const [dx, dy] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
        [1, 1],
        [1, -1],
        [-1, 1],
        [-1, -1],
      ] as const) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
        const n = ny * width + nx;
        if (!data[n] || seen[n]) continue;
        seen[n] = 1;
        stack.push(n);
      }
    }
    if (cells.length <= 2) speckled += cells.length;
  }
  return speckled;
}

/**
 * Measure the picture, not the board.
 *
 * Blank border rows and columns are padding added to reach a multiple of five
 * and are excluded: they are not part of the puzzle, and counting them makes
 * every well-margined picture look sparse. Blank lines *inside* the picture do
 * count — those are real, and boring.
 */
export function measureQuality(board: Bitmap): QualityMetrics {
  const grid = contentCrop(board);
  const { width, height } = grid;
  const counts: number[] = [];
  let emptyLines = 0;

  for (let y = 0; y < height; y++) {
    const row: number[] = [];
    for (let x = 0; x < width; x++) row.push(grid.data[y * width + x]!);
    const n = blocksInLine(row);
    counts.push(n);
    if (n === 0) emptyLines++;
  }
  for (let x = 0; x < width; x++) {
    const column: number[] = [];
    for (let y = 0; y < height; y++) column.push(grid.data[y * width + x]!);
    const n = blocksInLine(column);
    counts.push(n);
    if (n === 0) emptyLines++;
  }

  let isolated = 0;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (grid.data[y * width + x] && neighbours(grid, x, y) === 0) isolated++;
    }
  }

  const total = width * height;
  const ink = inkCount(grid);
  return {
    fill: total === 0 ? 0 : ink / total,
    maxBlocks: counts.length === 0 ? 0 : Math.max(...counts),
    averageBlocks: counts.length === 0 ? 0 : counts.reduce((a, b) => a + b, 0) / counts.length,
    isolated,
    emptyLines,
    noiseShare: ink === 0 ? 0 : speckledInk(grid) / ink,
    paddingCells: board.width * board.height - total,
  };
}

/** Reasons this grid should not be shipped, or an empty list. */
export function qualityComplaints(
  board: Bitmap,
  metrics: QualityMetrics,
  thresholds: QualityThresholds = {},
): string[] {
  const t = { ...DEFAULT_THRESHOLDS, ...thresholds };
  const grid = contentCrop(board);
  const lines = grid.width + grid.height;
  const problems: string[] = [];

  if (metrics.fill < t.minFill)
    problems.push(`too sparse (${(metrics.fill * 100).toFixed(0)}% ink)`);
  if (metrics.fill > t.maxFill)
    problems.push(`too dense (${(metrics.fill * 100).toFixed(0)}% ink)`);
  if (metrics.isolated > t.maxIsolated) problems.push(`${metrics.isolated} isolated pixel(s)`);
  if (lines > 0 && metrics.emptyLines / lines > t.maxEmptyLineShare) {
    problems.push(`${metrics.emptyLines} of ${lines} lines are empty`);
  }
  if (metrics.maxBlocks > t.maxBlocksPerLine) {
    problems.push(`${metrics.maxBlocks} blocks in one line`);
  }
  if (metrics.noiseShare > t.maxNoiseShare) {
    problems.push(`${(metrics.noiseShare * 100).toFixed(0)}% of the ink is speckle`);
  }
  return problems;
}

export function isPlayable(grid: Bitmap, thresholds?: QualityThresholds): boolean {
  return qualityComplaints(grid, measureQuality(grid), thresholds).length === 0;
}
