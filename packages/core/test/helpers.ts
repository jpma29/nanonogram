import {
  CROSS,
  DOT,
  EMPTY,
  type Clue,
  type Palette,
  type Puzzle,
  createPuzzle,
  filledCell,
  monochromePalette,
  normalizePalette,
} from '../src/index.js';

/**
 * Build a solution grid from ASCII art.
 * `#` (or any non-`.`/space character present in `keys`) is filled.
 */
export function grid(
  rows: string[],
  keys = '.#',
): { cells: Uint8Array; width: number; height: number } {
  const height = rows.length;
  const width = rows[0]?.length ?? 0;
  for (const row of rows) {
    if (row.length !== width) throw new Error(`ragged grid: ${JSON.stringify(rows)}`);
  }
  const cells = new Uint8Array(width * height);
  rows.forEach((row, y) => {
    for (let x = 0; x < width; x++) {
      const index = keys.indexOf(row[x]!);
      if (index < 0) throw new Error(`unknown grid character ${JSON.stringify(row[x])}`);
      cells[y * width + x] = index;
    }
  });
  return { cells, width, height };
}

let idCounter = 0;
function nextId(): string {
  idCounter += 1;
  return `TEST${String(idCounter).padStart(22, '0')}`;
}

/** Build a monochrome puzzle from ASCII art. */
export function puzzleFrom(
  rows: string[],
  overrides: Partial<Parameters<typeof createPuzzle>[0]> = {},
): Puzzle {
  const { cells, width, height } = grid(rows);
  return createPuzzle({
    id: nextId(),
    width,
    height,
    solution: cells,
    palette: monochromePalette(),
    unique: true,
    ...overrides,
  });
}

/** Build a colour puzzle from ASCII art using the supplied palette keys. */
export function colorPuzzleFrom(
  rows: string[],
  keys: string,
  overrides: Partial<Parameters<typeof createPuzzle>[0]> = {},
): Puzzle {
  const palette = paletteFor(keys);
  const { cells, width, height } = grid(rows, keys);
  return createPuzzle({
    id: nextId(),
    width,
    height,
    solution: cells,
    palette,
    unique: true,
    ...overrides,
  });
}

const HEXES = ['ffffff', '000000', 'ff0000', '0000ff', '00aa00', 'ffaa00'];

export function paletteFor(keys: string): Palette {
  return normalizePalette(
    [...keys].map((key, i) => ({
      key,
      name: `c${i}`,
      hex: HEXES[i] ?? '888888',
      background: i === 0,
    })),
  );
}

/** Parse a compact line notation into cell values. */
export function cells(notation: string, colorKeys = '#'): number[] {
  return [...notation].map((ch) => {
    if (ch === '.') return EMPTY;
    if (ch === 'x') return CROSS;
    if (ch === '?') return DOT;
    const index = colorKeys.indexOf(ch);
    if (index < 0) throw new Error(`unknown cell character ${JSON.stringify(ch)}`);
    return filledCell(index + 1);
  });
}

/** Shorthand for a monochrome clue list. */
export function clues(...counts: number[]): Clue[] {
  return counts.map((count) => ({ count, colorIndex: 1 }));
}

/** Shorthand for a colour clue list: pairs of [count, colorIndex]. */
export function colorClues(...pairs: [number, number][]): Clue[] {
  return pairs.map(([count, colorIndex]) => ({ count, colorIndex }));
}

/** A monotonic tick source for clock tests. */
export function ticker(start = 0): { now: () => number; advance: (ms: number) => void } {
  let t = start;
  return {
    now: () => t,
    advance: (ms: number) => {
      t += ms;
    },
  };
}
