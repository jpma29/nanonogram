/**
 * The puzzle model: palette, clues, solution, and the invariants that hold for
 * every puzzle the engine will accept.
 *
 * The runtime model is *normalised*: palette keys become indices, clue colours
 * become indices, and the solution becomes a flat `Uint8Array`. The on-disk
 * canonical JSON form lives in `formats/json.ts`.
 */

import { MAX_COLORS, assertDimensions, cellIndex } from './grid.js';

/** One entry of a puzzle palette. */
export interface PaletteEntry {
  /** Single character used in the canonical `solution` strings. */
  readonly key: string;
  readonly name: string;
  /** RGB hex without the leading `#`, e.g. `"000000"`. */
  readonly hex: string;
  /** Exactly one entry per palette has this set. */
  readonly background: boolean;
}

/** A normalised palette. Index 0 is always the background. */
export interface Palette {
  readonly entries: readonly PaletteEntry[];
  /** Palette keys by colour index. `keys[0]` is the background key. */
  readonly keys: readonly string[];
}

/** A clue, with its colour already resolved to a palette index (>= 1). */
export interface Clue {
  readonly count: number;
  readonly colorIndex: number;
}

/** A fully normalised, validated puzzle. */
export interface Puzzle {
  readonly id: string;
  readonly title: string | null;
  readonly hideTitle: boolean;
  readonly author: string | null;
  readonly source: string | null;
  readonly sourceId: string | null;
  readonly license: string | null;
  readonly copyright: string | null;
  readonly width: number;
  readonly height: number;
  readonly palette: Palette;
  /** One clue list per row, top to bottom. */
  readonly rowClues: readonly (readonly Clue[])[];
  /** One clue list per column, left to right. */
  readonly colClues: readonly (readonly Clue[])[];
  /** Row-major colour indices. 0 means background (not filled). */
  readonly solution: Uint8Array;
  readonly difficulty: number | null;
  readonly verified: boolean;
  /** `null` when uniqueness has not been determined yet. */
  readonly unique: boolean | null;
  readonly published: boolean;
  readonly distributable: boolean;
  readonly contentFlags: readonly string[];
  readonly createdAt: string | null;
}

/** True when the puzzle uses more than one fill colour. */
export function isColorPuzzle(puzzle: Puzzle): boolean {
  return puzzle.palette.keys.length > 2;
}

/** Number of cells that are filled in the solution. */
export function solutionFilledCount(puzzle: Puzzle): number {
  let n = 0;
  for (let i = 0; i < puzzle.solution.length; i++) if (puzzle.solution[i]! !== 0) n++;
  return n;
}

/* -------------------------------------------------------------------------- */
/* Palette                                                                      */
/* -------------------------------------------------------------------------- */

/**
 * Normalise a palette: validate it, and reorder it so the background sits at
 * index 0 while the relative order of the fill colours is preserved.
 */
export function normalizePalette(entries: readonly PaletteEntry[]): Palette {
  if (entries.length < 2) {
    throw new Error('a palette needs at least a background and one fill colour');
  }
  if (entries.length - 1 > MAX_COLORS) {
    throw new Error(`a palette may hold at most ${MAX_COLORS} fill colours`);
  }
  const backgrounds = entries.filter((e) => e.background);
  if (backgrounds.length !== 1) {
    throw new Error(`a palette needs exactly one background entry, found ${backgrounds.length}`);
  }
  const seen = new Set<string>();
  for (const entry of entries) {
    if (entry.key.length !== 1) {
      throw new Error(`palette key ${JSON.stringify(entry.key)} must be exactly one character`);
    }
    if (seen.has(entry.key)) {
      throw new Error(`duplicate palette key ${JSON.stringify(entry.key)}`);
    }
    seen.add(entry.key);
    if (!/^[0-9a-fA-F]{6}$/.test(entry.hex)) {
      throw new Error(`palette colour ${JSON.stringify(entry.hex)} must be a 6-digit hex value`);
    }
  }
  const ordered = [backgrounds[0]!, ...entries.filter((e) => !e.background)];
  return { entries: ordered, keys: ordered.map((e) => e.key) };
}

/** Index of a palette key, or -1. */
export function colorIndexOfKey(palette: Palette, key: string): number {
  return palette.keys.indexOf(key);
}

/** The conventional two-entry black-and-white palette. */
export function monochromePalette(): Palette {
  return normalizePalette([
    { key: '.', name: 'white', hex: 'ffffff', background: true },
    { key: 'X', name: 'black', hex: '000000', background: false },
  ]);
}

/* -------------------------------------------------------------------------- */
/* Clues                                                                        */
/* -------------------------------------------------------------------------- */

/** Extract the clue list of one line of colour indices. */
export function cluesForLine(line: ArrayLike<number>): Clue[] {
  const clues: Clue[] = [];
  let runColor = 0;
  let runLength = 0;
  for (let i = 0; i < line.length; i++) {
    const c = line[i]!;
    if (c === runColor) {
      if (c !== 0) runLength++;
      continue;
    }
    if (runColor !== 0) clues.push({ count: runLength, colorIndex: runColor });
    runColor = c;
    runLength = c === 0 ? 0 : 1;
  }
  if (runColor !== 0) clues.push({ count: runLength, colorIndex: runColor });
  return clues;
}

/** Read row `y` of a row-major grid. */
export function readRow(cells: ArrayLike<number>, width: number, y: number): number[] {
  const out = new Array<number>(width);
  for (let x = 0; x < width; x++) out[x] = cells[y * width + x]!;
  return out;
}

/** Read column `x` of a row-major grid. */
export function readColumn(
  cells: ArrayLike<number>,
  width: number,
  height: number,
  x: number,
): number[] {
  const out = new Array<number>(height);
  for (let y = 0; y < height; y++) out[y] = cells[y * width + x]!;
  return out;
}

/** Derive both clue sets from a solution grid. */
export function deriveClues(
  solution: ArrayLike<number>,
  width: number,
  height: number,
): { rows: Clue[][]; cols: Clue[][] } {
  assertDimensions(width, height);
  const rows: Clue[][] = [];
  for (let y = 0; y < height; y++) rows.push(cluesForLine(readRow(solution, width, y)));
  const cols: Clue[][] = [];
  for (let x = 0; x < width; x++) cols.push(cluesForLine(readColumn(solution, width, height, x)));
  return { rows, cols };
}

function sameClues(a: readonly Clue[], b: readonly Clue[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i]!.count !== b[i]!.count || a[i]!.colorIndex !== b[i]!.colorIndex) return false;
  }
  return true;
}

/**
 * Check declared clues against the solution. Clues are stored explicitly even
 * though they are derivable, so this is the cheap integrity check that keeps a
 * corrupt import out of the library (04-modelo-de-datos §1).
 */
export function checkCluesAgainstSolution(
  rowClues: readonly (readonly Clue[])[],
  colClues: readonly (readonly Clue[])[],
  solution: ArrayLike<number>,
  width: number,
  height: number,
): string[] {
  const problems: string[] = [];
  if (rowClues.length !== height) {
    problems.push(`expected ${height} row clue lines, got ${rowClues.length}`);
  }
  if (colClues.length !== width) {
    problems.push(`expected ${width} column clue lines, got ${colClues.length}`);
  }
  if (problems.length > 0) return problems;

  const derived = deriveClues(solution, width, height);
  for (let y = 0; y < height; y++) {
    if (!sameClues(rowClues[y]!, derived.rows[y]!)) {
      problems.push(`row ${y} clues do not match the solution`);
    }
  }
  for (let x = 0; x < width; x++) {
    if (!sameClues(colClues[x]!, derived.cols[x]!)) {
      problems.push(`column ${x} clues do not match the solution`);
    }
  }
  return problems;
}

/* -------------------------------------------------------------------------- */
/* Construction                                                                 */
/* -------------------------------------------------------------------------- */

export interface CreatePuzzleInput {
  id: string;
  title?: string | null;
  hideTitle?: boolean;
  author?: string | null;
  source?: string | null;
  sourceId?: string | null;
  license?: string | null;
  copyright?: string | null;
  width: number;
  height: number;
  palette?: Palette;
  /** Row-major colour indices. */
  solution: ArrayLike<number>;
  /** Omitted clues are derived from the solution. */
  rowClues?: readonly (readonly Clue[])[];
  colClues?: readonly (readonly Clue[])[];
  difficulty?: number | null;
  verified?: boolean;
  unique?: boolean | null;
  published?: boolean;
  distributable?: boolean;
  contentFlags?: readonly string[];
  createdAt?: string | null;
}

/** Validate and freeze a puzzle. Throws with a specific message on any problem. */
export function createPuzzle(input: CreatePuzzleInput): Puzzle {
  const { width, height } = input;
  assertDimensions(width, height);

  const palette = input.palette ?? monochromePalette();
  const maxColor = palette.keys.length - 1;

  if (input.solution.length !== width * height) {
    throw new Error(
      `solution has ${input.solution.length} cells, expected ${width * height} (${width}x${height})`,
    );
  }
  const solution = new Uint8Array(width * height);
  for (let i = 0; i < solution.length; i++) {
    const c = input.solution[i]!;
    if (!Number.isInteger(c) || c < 0 || c > maxColor) {
      throw new Error(`solution cell ${i} has colour index ${c}, outside 0..${maxColor}`);
    }
    solution[i] = c;
  }

  const derived = deriveClues(solution, width, height);
  const rowClues = input.rowClues ?? derived.rows;
  const colClues = input.colClues ?? derived.cols;
  const problems = checkCluesAgainstSolution(rowClues, colClues, solution, width, height);
  if (problems.length > 0) {
    throw new Error(`inconsistent puzzle: ${problems.join('; ')}`);
  }

  if (input.difficulty != null && (input.difficulty < 1 || input.difficulty > 5)) {
    throw new RangeError(`difficulty must be between 1 and 5, got ${input.difficulty}`);
  }

  return Object.freeze({
    id: input.id,
    title: input.title ?? null,
    hideTitle: input.hideTitle ?? false,
    author: input.author ?? null,
    source: input.source ?? null,
    sourceId: input.sourceId ?? null,
    license: input.license ?? null,
    copyright: input.copyright ?? null,
    width,
    height,
    palette,
    rowClues: rowClues.map((line) => Object.freeze([...line])),
    colClues: colClues.map((line) => Object.freeze([...line])),
    solution,
    difficulty: input.difficulty ?? null,
    verified: input.verified ?? false,
    unique: input.unique ?? null,
    published: input.published ?? false,
    distributable: input.distributable ?? true,
    contentFlags: Object.freeze([...(input.contentFlags ?? [])]),
    createdAt: input.createdAt ?? null,
  });
}

/** Colour index of the solution at a coordinate. */
export function solutionAt(puzzle: Puzzle, x: number, y: number): number {
  return puzzle.solution[cellIndex(puzzle.width, x, y)]!;
}
