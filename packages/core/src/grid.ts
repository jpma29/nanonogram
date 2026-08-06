/**
 * Cell state representation and grid (de)serialisation.
 *
 * A cell is encoded as a single small integer so that a whole grid fits in a
 * `Uint8Array`. The encoding leaves room for up to {@link MAX_COLORS} fill
 * colours, which is far beyond what any real nonogram needs.
 *
 *   0            `empty`  — undecided
 *   1            `cross`  — ruled out by the player (X)
 *   2            `dot`    — soft "maybe" annotation
 *   3 + (c - 1)  `filled` with palette colour index `c` (c >= 1)
 *
 * Colour index 0 is always the background and is never a *filled* state:
 * an unfilled cell is `empty`, `cross` or `dot`, never "filled with white".
 */

/** Undecided cell. */
export const EMPTY = 0;
/** Cell the player ruled out (X). Never counts as an error (RF-MOD-3). */
export const CROSS = 1;
/** Soft "maybe" annotation. Ignored by the win condition (RF-MOD-5). */
export const DOT = 2;
/** Filled cells start just above {@link DOT}: `FILLED_BASE + colourIndex`. */
export const FILLED_BASE = 2;

/** Upper bound on fill colours, imposed by the 32-bit domain bitmask. */
export const MAX_COLORS = 30;

/** Grid size bounds (RNF-9). */
export const MIN_DIMENSION = 1;
export const MAX_DIMENSION = 100;

/** A cell value as stored in the grid. */
export type CellValue = number;

/** Build the cell value for a filled cell of the given palette colour index. */
export function filledCell(colorIndex: number): CellValue {
  if (!Number.isInteger(colorIndex) || colorIndex < 1 || colorIndex > MAX_COLORS) {
    throw new RangeError(`colour index out of range: ${colorIndex}`);
  }
  return FILLED_BASE + colorIndex;
}

/** True when the cell is filled with some colour. */
export function isFilled(value: CellValue): boolean {
  return value > FILLED_BASE;
}

/** Palette colour index of a filled cell, or 0 (background) for anything else. */
export function colorIndexOf(value: CellValue): number {
  return value > FILLED_BASE ? value - FILLED_BASE : 0;
}

/** Row-major index of a coordinate. */
export function cellIndex(width: number, x: number, y: number): number {
  return y * width + x;
}

/** True when the coordinate lies inside a `width` x `height` grid. */
export function inBounds(width: number, height: number, x: number, y: number): boolean {
  return x >= 0 && y >= 0 && x < width && y < height;
}

/** Assert that a pair of dimensions is playable (RNF-9). */
export function assertDimensions(width: number, height: number): void {
  for (const [name, value] of [
    ['width', width],
    ['height', height],
  ] as const) {
    if (!Number.isInteger(value) || value < MIN_DIMENSION || value > MAX_DIMENSION) {
      throw new RangeError(
        `${name} must be an integer between ${MIN_DIMENSION} and ${MAX_DIMENSION}, got ${value}`,
      );
    }
  }
}

/* -------------------------------------------------------------------------- */
/* RLE encoding (04-modelo-de-datos §4)                                        */
/* -------------------------------------------------------------------------- */

/** Symbol for `empty` in the RLE alphabet. */
export const RLE_EMPTY = '.';
/** Symbol for `cross`. */
export const RLE_CROSS = 'x';
/** Symbol for `dot`. */
export const RLE_DOT = '?';
/** Symbol for a filled cell in a monochrome puzzle. */
export const RLE_FILLED_MONO = '#';

const RESERVED_RLE_SYMBOLS = new Set([RLE_EMPTY, RLE_CROSS, RLE_DOT, RLE_FILLED_MONO]);

/**
 * Symbols used for filled cells, indexed by palette colour index.
 * Index 0 is unused (background is never a filled cell).
 */
export type FillSymbols = readonly (string | undefined)[];

/**
 * Monochrome puzzles always use `#`, regardless of what the palette calls the
 * foreground colour. Colour puzzles use the palette keys.
 */
export function fillSymbolsFor(paletteKeys: readonly string[]): FillSymbols {
  // paletteKeys[0] is the background key.
  if (paletteKeys.length === 2) return [undefined, RLE_FILLED_MONO];
  const symbols: (string | undefined)[] = [undefined];
  for (let c = 1; c < paletteKeys.length; c++) {
    const key = paletteKeys[c]!;
    if (key.length !== 1) {
      throw new Error(`palette key ${JSON.stringify(key)} must be exactly one character`);
    }
    if (RESERVED_RLE_SYMBOLS.has(key)) {
      throw new Error(
        `palette key ${JSON.stringify(key)} collides with a reserved RLE symbol (. x ? #)`,
      );
    }
    if (key >= '0' && key <= '9') {
      throw new Error(`palette key ${JSON.stringify(key)} must not be a digit`);
    }
    symbols.push(key);
  }
  return symbols;
}

function symbolForCell(value: CellValue, fillSymbols: FillSymbols): string {
  switch (value) {
    case EMPTY:
      return RLE_EMPTY;
    case CROSS:
      return RLE_CROSS;
    case DOT:
      return RLE_DOT;
    default: {
      const symbol = fillSymbols[colorIndexOf(value)];
      if (symbol === undefined) {
        throw new Error(`no RLE symbol for colour index ${colorIndexOf(value)}`);
      }
      return symbol;
    }
  }
}

/**
 * Encode a grid as `v1:<width>x<height>:<body>`, where the body is a run-length
 * encoding in row-major order. A run of one is written without its count.
 */
export function encodeGrid(
  cells: Uint8Array,
  width: number,
  height: number,
  fillSymbols: FillSymbols,
): string {
  assertDimensions(width, height);
  if (cells.length !== width * height) {
    throw new Error(`cell buffer length ${cells.length} does not match ${width}x${height}`);
  }
  let body = '';
  let run = 0;
  let current = '';
  for (let i = 0; i < cells.length; i++) {
    const symbol = symbolForCell(cells[i]!, fillSymbols);
    if (symbol === current) {
      run++;
    } else {
      if (run > 0) body += run > 1 ? `${run}${current}` : current;
      current = symbol;
      run = 1;
    }
  }
  if (run > 0) body += run > 1 ? `${run}${current}` : current;
  return `v1:${width}x${height}:${body}`;
}

export interface DecodedGrid {
  readonly width: number;
  readonly height: number;
  readonly cells: Uint8Array;
}

/** Inverse of {@link encodeGrid}. Throws on any malformed input. */
export function decodeGrid(encoded: string, fillSymbols: FillSymbols): DecodedGrid {
  const match = /^v1:(\d+)x(\d+):(.*)$/s.exec(encoded);
  if (!match) throw new Error(`malformed grid encoding: ${JSON.stringify(encoded)}`);
  const width = Number(match[1]);
  const height = Number(match[2]);
  assertDimensions(width, height);
  const body = match[3]!;

  const symbolToValue = new Map<string, number>([
    [RLE_EMPTY, EMPTY],
    [RLE_CROSS, CROSS],
    [RLE_DOT, DOT],
  ]);
  for (let c = 1; c < fillSymbols.length; c++) {
    const symbol = fillSymbols[c];
    if (symbol !== undefined) symbolToValue.set(symbol, FILLED_BASE + c);
  }

  const total = width * height;
  const cells = new Uint8Array(total);
  let written = 0;
  let i = 0;
  while (i < body.length) {
    let count = 0;
    let sawDigit = false;
    while (i < body.length && body[i]! >= '0' && body[i]! <= '9') {
      count = count * 10 + (body.charCodeAt(i) - 48);
      sawDigit = true;
      i++;
      if (count > total)
        throw new Error(`run length exceeds grid size in ${JSON.stringify(encoded)}`);
    }
    if (!sawDigit) count = 1;
    if (count === 0) throw new Error(`zero-length run in ${JSON.stringify(encoded)}`);
    const symbol = body[i];
    if (symbol === undefined)
      throw new Error(`run count with no symbol in ${JSON.stringify(encoded)}`);
    const value = symbolToValue.get(symbol);
    if (value === undefined) throw new Error(`unknown grid symbol ${JSON.stringify(symbol)}`);
    i++;
    if (written + count > total) throw new Error(`grid encoding overflows ${width}x${height}`);
    cells.fill(value, written, written + count);
    written += count;
  }
  if (written !== total) {
    throw new Error(`grid encoding covers ${written} of ${total} cells`);
  }
  return { width, height, cells };
}
