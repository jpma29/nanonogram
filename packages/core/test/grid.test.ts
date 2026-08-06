import { describe, expect, it } from 'vitest';
import {
  CROSS,
  DOT,
  EMPTY,
  assertDimensions,
  cellIndex,
  colorIndexOf,
  decodeGrid,
  encodeGrid,
  fillSymbolsFor,
  filledCell,
  inBounds,
  isFilled,
} from '../src/index.js';

const MONO = fillSymbolsFor(['.', 'X']);

describe('cell encoding', () => {
  it('separates the four states', () => {
    expect(isFilled(EMPTY)).toBe(false);
    expect(isFilled(CROSS)).toBe(false);
    expect(isFilled(DOT)).toBe(false);
    expect(isFilled(filledCell(1))).toBe(true);
    expect(colorIndexOf(filledCell(4))).toBe(4);
    expect(colorIndexOf(CROSS)).toBe(0);
    expect(colorIndexOf(DOT)).toBe(0);
  });

  it('rejects colour indices outside the palette range', () => {
    expect(() => filledCell(0)).toThrow(RangeError);
    expect(() => filledCell(31)).toThrow(RangeError);
    expect(() => filledCell(1.5)).toThrow(RangeError);
  });

  it('computes indices and bounds', () => {
    expect(cellIndex(5, 2, 3)).toBe(17);
    expect(inBounds(5, 5, 4, 4)).toBe(true);
    expect(inBounds(5, 5, 5, 0)).toBe(false);
    expect(inBounds(5, 5, -1, 0)).toBe(false);
  });
});

describe('dimension limits (RNF-9)', () => {
  it('accepts 1x1 and 100x100', () => {
    expect(() => assertDimensions(1, 1)).not.toThrow();
    expect(() => assertDimensions(100, 100)).not.toThrow();
  });

  it('rejects anything larger than 100 in either axis', () => {
    expect(() => assertDimensions(101, 10)).toThrow(/width/);
    expect(() => assertDimensions(10, 101)).toThrow(/height/);
    expect(() => assertDimensions(0, 10)).toThrow(/width/);
    expect(() => assertDimensions(10.5, 10)).toThrow(/width/);
  });
});

describe('grid RLE', () => {
  it('round-trips a mixed grid', () => {
    const cells = new Uint8Array([EMPTY, EMPTY, filledCell(1), CROSS, DOT, filledCell(1)]);
    const encoded = encodeGrid(cells, 3, 2, MONO);
    expect(encoded).toBe('v1:3x2:2.#x?#');
    const decoded = decodeGrid(encoded, MONO);
    expect(decoded.width).toBe(3);
    expect(decoded.height).toBe(2);
    expect([...decoded.cells]).toEqual([...cells]);
  });

  it('collapses long runs', () => {
    const cells = new Uint8Array(100).fill(EMPTY);
    expect(encodeGrid(cells, 10, 10, MONO)).toBe('v1:10x10:100.');
  });

  it('round-trips a colour grid using palette keys', () => {
    const symbols = fillSymbolsFor(['.', 'R', 'B']);
    const cells = new Uint8Array([filledCell(1), filledCell(2), CROSS, EMPTY]);
    const encoded = encodeGrid(cells, 4, 1, symbols);
    expect(encoded).toBe('v1:4x1:RBx.');
    expect([...decodeGrid(encoded, symbols).cells]).toEqual([...cells]);
  });

  it('rejects palette keys that collide with the RLE alphabet', () => {
    expect(() => fillSymbolsFor(['.', 'R', '#'])).toThrow(/reserved RLE symbol/);
    expect(() => fillSymbolsFor(['.', 'R', '3'])).toThrow(/digit/);
    expect(() => fillSymbolsFor(['.', 'R', 'BB'])).toThrow(/one character/);
  });

  it('rejects malformed encodings', () => {
    expect(() => decodeGrid('nope', MONO)).toThrow(/malformed/);
    expect(() => decodeGrid('v1:3x2:2.', MONO)).toThrow(/covers 2 of 6/);
    expect(() => decodeGrid('v1:2x1:5.', MONO)).toThrow(/run length exceeds/);
    expect(() => decodeGrid('v1:2x1:2.2x', MONO)).toThrow(/overflows/);
    expect(() => decodeGrid('v1:2x1:.@', MONO)).toThrow(/unknown grid symbol/);
    expect(() => decodeGrid('v1:4x1:2.2', MONO)).toThrow(/no symbol/);
    expect(() => decodeGrid('v1:2x1:0.', MONO)).toThrow(/zero-length/);
    expect(() => decodeGrid('v1:200x1:200.', MONO)).toThrow(/width/);
  });

  it('rejects a cell buffer that does not match the declared size', () => {
    expect(() => encodeGrid(new Uint8Array(5), 3, 2, MONO)).toThrow(/does not match/);
  });
});
