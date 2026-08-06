/**
 * Unambiguous clue cross-out (RF-AYU-2, 02-arquitectura §5.2).
 *
 * This is the assist that is easiest to implement *wrongly*. A naive version
 * crosses out a clue as soon as some closed block of the right length shows up,
 * which leaks information the player has not deduced: it silently confirms
 * which of two readings of a line is the correct one.
 *
 * The rule here is the strict one. A clue is crossed out only when both hold:
 *
 *   a) the player has a **closed block** — a maximal run of filled cells of the
 *      clue's colour, delimited at both ends by a cross or by the grid edge —
 *      whose length equals the clue's count; and
 *   b) across **every** legal completion of the line consistent with what the
 *      player has marked, that clue occupies exactly that block.
 *
 * (b) is decided by the line solver's start-position marginals: a clue that can
 * legally start in two different places is not pinned, so the assist stays
 * quiet. If the line admits no legal completion at all — the player has made a
 * mistake somewhere — nothing is crossed out and nothing is said about it.
 *
 * Note that `dot` is a soft annotation: it neither delimits a block nor
 * constrains the solver. Only `cross` does.
 */

import { CROSS, colorIndexOf, isFilled } from './grid.js';
import { BACKGROUND_BIT, LineEngine, colorBit, fullDomain } from './linesolver.js';
import type { Clue, Puzzle } from './puzzle.js';

/**
 * Translate the player's marks on one line into solver domain masks.
 *
 * - `cross` pins the cell to the background.
 * - a filled cell pins it to that colour.
 * - `empty` and `dot` leave every colour open.
 */
export function lineDomains(cells: ArrayLike<number>, colors: number): Uint32Array {
  const all = fullDomain(colors - 1);
  const out = new Uint32Array(cells.length);
  for (let i = 0; i < cells.length; i++) {
    const value = cells[i]!;
    if (value === CROSS) out[i] = BACKGROUND_BIT;
    else if (isFilled(value)) out[i] = colorBit(colorIndexOf(value));
    else out[i] = all; // EMPTY or DOT
  }
  return out;
}

/**
 * Decide which clues of a single line should appear crossed out.
 *
 * @param clues  the line's clue sequence
 * @param cells  the player's current marks for that line
 * @param colors number of palette colours including the background
 * @returns one boolean per clue, in clue order
 */
export function crossoutLine(
  clues: readonly Clue[],
  cells: ArrayLike<number>,
  colors: number,
  engine: LineEngine = new LineEngine(),
): boolean[] {
  const result = new Array<boolean>(clues.length).fill(false);
  if (clues.length === 0) return result;

  const n = cells.length;
  const analysis = engine.analyze(clues, lineDomains(cells, colors), colors);
  // The player has contradicted the clues somewhere in this line. Say nothing.
  if (!analysis.feasible) return result;

  for (let j = 0; j < clues.length; j++) {
    // (b) the clue must be pinned to a single start position.
    if (analysis.startCount[j] !== 1) continue;
    const start = analysis.firstStart[j]!;
    const clue = clues[j]!;
    const end = start + clue.count - 1;

    // (a) the player must actually have drawn that block, in that colour...
    let drawn = true;
    for (let i = start; i <= end; i++) {
      if (colorIndexOf(cells[i]!) !== clue.colorIndex) {
        drawn = false;
        break;
      }
    }
    if (!drawn) continue;

    // ...and it must be closed at both ends.
    if (!closesBlock(cells, start - 1, clue.colorIndex)) continue;
    if (!closesBlock(cells, end + 1, clue.colorIndex, n)) continue;

    result[j] = true;
  }
  return result;
}

/**
 * Whether the cell at `index` terminates a run of `colorIndex`.
 *
 * The spec words this as "delimited by an X or by the grid edge" (RF-AYU-2),
 * which is the whole story in black and white. In a colour puzzle a filled cell
 * of a *different* colour is just as definitive a boundary as a cross — the run
 * of this colour demonstrably ends there — so it closes the block too. An empty
 * cell or a dot does not: the player has not committed to anything.
 */
function closesBlock(
  cells: ArrayLike<number>,
  index: number,
  colorIndex: number,
  length?: number,
): boolean {
  if (index < 0) return true;
  if (length !== undefined && index >= length) return true;
  const value = cells[index]!;
  if (value === CROSS) return true;
  return isFilled(value) && colorIndexOf(value) !== colorIndex;
}

/** Cross-out state for a whole grid. */
export interface CrossoutState {
  /** One boolean list per row clue line, top to bottom. */
  readonly rows: boolean[][];
  /** One boolean list per column clue line, left to right. */
  readonly cols: boolean[][];
}

/** Compute cross-outs for every row and column of a puzzle. */
export function computeCrossouts(puzzle: Puzzle, cells: ArrayLike<number>): CrossoutState {
  const { width, height } = puzzle;
  const colors = puzzle.palette.keys.length;
  const engine = new LineEngine();

  const rows: boolean[][] = [];
  const line = new Array<number>(Math.max(width, height));
  for (let y = 0; y < height; y++) {
    const row = line.slice(0, width);
    for (let x = 0; x < width; x++) row[x] = cells[y * width + x]!;
    rows.push(crossoutLine(puzzle.rowClues[y]!, row, colors, engine));
  }

  const cols: boolean[][] = [];
  for (let x = 0; x < width; x++) {
    const col = line.slice(0, height);
    for (let y = 0; y < height; y++) col[y] = cells[y * width + x]!;
    cols.push(crossoutLine(puzzle.colClues[x]!, col, colors, engine));
  }

  return { rows, cols };
}

/**
 * Recompute cross-outs for only the lines touched by a set of cell changes.
 * The UI calls this after every stroke; recomputing the whole grid on a 100x100
 * board would be wasteful.
 */
export function recomputeCrossoutsFor(
  puzzle: Puzzle,
  cells: ArrayLike<number>,
  previous: CrossoutState,
  changedIndices: readonly number[],
): CrossoutState {
  const { width, height } = puzzle;
  const colors = puzzle.palette.keys.length;
  const engine = new LineEngine();

  const dirtyRows = new Set<number>();
  const dirtyCols = new Set<number>();
  for (const index of changedIndices) {
    dirtyRows.add(Math.floor(index / width));
    dirtyCols.add(index % width);
  }

  const rows = previous.rows.map((line) => line);
  for (const y of dirtyRows) {
    const row = new Array<number>(width);
    for (let x = 0; x < width; x++) row[x] = cells[y * width + x]!;
    rows[y] = crossoutLine(puzzle.rowClues[y]!, row, colors, engine);
  }

  const cols = previous.cols.map((line) => line);
  for (const x of dirtyCols) {
    const col = new Array<number>(height);
    for (let y = 0; y < height; y++) col[y] = cells[y * width + x]!;
    cols[x] = crossoutLine(puzzle.colClues[x]!, col, colors, engine);
  }

  return { rows, cols };
}

/** An empty cross-out state matching a puzzle's shape. */
export function emptyCrossoutState(puzzle: Puzzle): CrossoutState {
  return {
    rows: puzzle.rowClues.map((line) => new Array<boolean>(line.length).fill(false)),
    cols: puzzle.colClues.map((line) => new Array<boolean>(line.length).fill(false)),
  };
}
