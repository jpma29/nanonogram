/**
 * The canonical puzzle format, `nanonogram.puzzle/1`
 * (04-modelo-de-datos §1).
 *
 * This is both the interchange format and the on-disk format. It is designed to
 * diff readably in git — the solution is an array of one string per row — and
 * to be validated strictly on the way in. Nothing else in the engine is allowed
 * to assume a puzzle is well-formed; this module is where that is established.
 */

import { MAX_DIMENSION, MIN_DIMENSION } from '../grid.js';
import {
  type Clue,
  type PaletteEntry,
  type Puzzle,
  createPuzzle,
  normalizePalette,
} from '../puzzle.js';

export const PUZZLE_SCHEMA = 'nanonogram.puzzle/1';

/** A clue as it appears in the canonical JSON: colour by palette key. */
export interface ClueJson {
  count: number;
  color: string;
}

/** The canonical JSON shape. */
export interface PuzzleJson {
  schema: typeof PUZZLE_SCHEMA;
  id: string;
  title: string | null;
  hide_title: boolean;
  author: string | null;
  source: string | null;
  source_id: string | null;
  license: string | null;
  copyright: string | null;
  width: number;
  height: number;
  palette: { key: string; name: string; hex: string; background?: boolean }[];
  clues: { rows: ClueJson[][]; cols: ClueJson[][] };
  solution: string[];
  difficulty: number | null;
  verified: boolean;
  unique: boolean | null;
  published: boolean;
  distributable: boolean;
  content_flags: string[];
  created_at: string | null;
}

/** Thrown when a document is not a valid canonical puzzle. */
export class PuzzleFormatError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PuzzleFormatError';
  }
}

function fail(message: string): never {
  throw new PuzzleFormatError(message);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function requireString(source: Record<string, unknown>, key: string): string {
  const value = source[key];
  if (typeof value !== 'string') fail(`"${key}" must be a string`);
  return value;
}

function optionalString(source: Record<string, unknown>, key: string): string | null {
  const value = source[key];
  if (value === undefined || value === null) return null;
  if (typeof value !== 'string') fail(`"${key}" must be a string or null`);
  return value;
}

function optionalBoolean(source: Record<string, unknown>, key: string, fallback: boolean): boolean {
  const value = source[key];
  if (value === undefined || value === null) return fallback;
  if (typeof value !== 'boolean') fail(`"${key}" must be a boolean`);
  return value;
}

function requireDimension(source: Record<string, unknown>, key: string): number {
  const value = source[key];
  if (typeof value !== 'number' || !Number.isInteger(value)) fail(`"${key}" must be an integer`);
  if (value < MIN_DIMENSION || value > MAX_DIMENSION) {
    fail(`"${key}" must be between ${MIN_DIMENSION} and ${MAX_DIMENSION}, got ${value}`);
  }
  return value;
}

function parsePalette(raw: unknown): PaletteEntry[] {
  if (!Array.isArray(raw)) fail('"palette" must be an array');
  return raw.map((entry, i) => {
    if (!isRecord(entry)) fail(`palette entry ${i} must be an object`);
    return {
      key: requireString(entry, 'key'),
      name: requireString(entry, 'name'),
      hex: requireString(entry, 'hex'),
      background: optionalBoolean(entry, 'background', false),
    };
  });
}

function parseClueLines(raw: unknown, label: string, keyToIndex: Map<string, number>): Clue[][] {
  if (!Array.isArray(raw)) fail(`"clues.${label}" must be an array`);
  return raw.map((line, i) => {
    if (!Array.isArray(line)) fail(`"clues.${label}[${i}]" must be an array`);
    return line.map((clue, j) => {
      if (!isRecord(clue)) fail(`"clues.${label}[${i}][${j}]" must be an object`);
      const count = clue['count'];
      if (typeof count !== 'number' || !Number.isInteger(count) || count < 1) {
        fail(`"clues.${label}[${i}][${j}].count" must be a positive integer`);
      }
      const color = requireString(clue, 'color');
      const colorIndex = keyToIndex.get(color);
      if (colorIndex === undefined) {
        fail(`"clues.${label}[${i}][${j}].color" references unknown palette key "${color}"`);
      }
      if (colorIndex === 0) {
        fail(`"clues.${label}[${i}][${j}].color" is the background colour`);
      }
      return { count, colorIndex };
    });
  });
}

/** Parse and validate a canonical puzzle document. */
export function parsePuzzle(input: unknown): Puzzle {
  if (!isRecord(input)) fail('a puzzle must be a JSON object');

  const schema = input['schema'];
  if (schema !== PUZZLE_SCHEMA) {
    fail(`unsupported schema ${JSON.stringify(schema)}, expected ${JSON.stringify(PUZZLE_SCHEMA)}`);
  }

  const width = requireDimension(input, 'width');
  const height = requireDimension(input, 'height');
  const palette = normalizePalette(parsePalette(input['palette']));

  const keyToIndex = new Map<string, number>();
  palette.keys.forEach((key, index) => keyToIndex.set(key, index));

  const clues = input['clues'];
  if (!isRecord(clues)) fail('"clues" must be an object');
  const rowClues = parseClueLines(clues['rows'], 'rows', keyToIndex);
  const colClues = parseClueLines(clues['cols'], 'cols', keyToIndex);

  const solutionRaw = input['solution'];
  if (!Array.isArray(solutionRaw)) fail('"solution" must be an array of strings');
  if (solutionRaw.length !== height) {
    fail(`"solution" has ${solutionRaw.length} rows, expected ${height}`);
  }
  const solution = new Uint8Array(width * height);
  for (let y = 0; y < height; y++) {
    const row = solutionRaw[y];
    if (typeof row !== 'string') fail(`"solution[${y}]" must be a string`);
    if ([...row].length !== width) {
      fail(`"solution[${y}]" has ${[...row].length} cells, expected ${width}`);
    }
    for (let x = 0; x < width; x++) {
      const key = row[x]!;
      const index = keyToIndex.get(key);
      if (index === undefined) {
        fail(`"solution[${y}]" contains unknown palette key ${JSON.stringify(key)}`);
      }
      solution[y * width + x] = index;
    }
  }

  const difficultyRaw = input['difficulty'];
  if (
    difficultyRaw !== undefined &&
    difficultyRaw !== null &&
    (typeof difficultyRaw !== 'number' || !Number.isInteger(difficultyRaw))
  ) {
    fail('"difficulty" must be an integer or null');
  }

  const uniqueRaw = input['unique'];
  if (uniqueRaw !== undefined && uniqueRaw !== null && typeof uniqueRaw !== 'boolean') {
    fail('"unique" must be a boolean or null');
  }

  const flagsRaw = input['content_flags'];
  if (flagsRaw !== undefined && flagsRaw !== null && !Array.isArray(flagsRaw)) {
    fail('"content_flags" must be an array');
  }

  return createPuzzle({
    id: requireString(input, 'id'),
    title: optionalString(input, 'title'),
    hideTitle: optionalBoolean(input, 'hide_title', false),
    author: optionalString(input, 'author'),
    source: optionalString(input, 'source'),
    sourceId: optionalString(input, 'source_id'),
    license: optionalString(input, 'license'),
    copyright: optionalString(input, 'copyright'),
    width,
    height,
    palette,
    solution,
    rowClues,
    colClues,
    difficulty: (difficultyRaw as number | null | undefined) ?? null,
    verified: optionalBoolean(input, 'verified', false),
    unique: (uniqueRaw as boolean | null | undefined) ?? null,
    published: optionalBoolean(input, 'published', false),
    distributable: optionalBoolean(input, 'distributable', true),
    contentFlags: (flagsRaw as string[] | undefined) ?? [],
    createdAt: optionalString(input, 'created_at'),
  });
}

/** Convenience wrapper: parse a JSON string. */
export function parsePuzzleJson(text: string): Puzzle {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (error) {
    throw new PuzzleFormatError(`invalid JSON: ${(error as Error).message}`);
  }
  return parsePuzzle(parsed);
}

/** Render a puzzle back to the canonical shape. Round-trips with {@link parsePuzzle}. */
export function serializePuzzle(puzzle: Puzzle): PuzzleJson {
  const keys = puzzle.palette.keys;
  const rows: string[] = [];
  for (let y = 0; y < puzzle.height; y++) {
    let row = '';
    for (let x = 0; x < puzzle.width; x++) row += keys[puzzle.solution[y * puzzle.width + x]!]!;
    rows.push(row);
  }
  const toJsonClues = (lines: readonly (readonly Clue[])[]): ClueJson[][] =>
    lines.map((line) => line.map((clue) => ({ count: clue.count, color: keys[clue.colorIndex]! })));

  return {
    schema: PUZZLE_SCHEMA,
    id: puzzle.id,
    title: puzzle.title,
    hide_title: puzzle.hideTitle,
    author: puzzle.author,
    source: puzzle.source,
    source_id: puzzle.sourceId,
    license: puzzle.license,
    copyright: puzzle.copyright,
    width: puzzle.width,
    height: puzzle.height,
    palette: puzzle.palette.entries.map((entry) => ({
      key: entry.key,
      name: entry.name,
      hex: entry.hex,
      background: entry.background,
    })),
    clues: { rows: toJsonClues(puzzle.rowClues), cols: toJsonClues(puzzle.colClues) },
    solution: rows,
    difficulty: puzzle.difficulty,
    verified: puzzle.verified,
    unique: puzzle.unique,
    published: puzzle.published,
    distributable: puzzle.distributable,
    content_flags: [...puzzle.contentFlags],
    created_at: puzzle.createdAt,
  };
}

/** Serialise to a JSON string. */
export function stringifyPuzzle(puzzle: Puzzle, space = 2): string {
  return JSON.stringify(serializePuzzle(puzzle), null, space);
}
