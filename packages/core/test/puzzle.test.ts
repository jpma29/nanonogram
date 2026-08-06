import { describe, expect, it } from 'vitest';
import {
  checkCluesAgainstSolution,
  cluesForLine,
  colorIndexOfKey,
  createPuzzle,
  deriveClues,
  isColorPuzzle,
  monochromePalette,
  normalizePalette,
  readColumn,
  readRow,
  solutionAt,
  solutionFilledCount,
} from '../src/index.js';
import { colorPuzzleFrom, grid, paletteFor, puzzleFrom } from './helpers.js';

describe('palette', () => {
  it('puts the background at index 0 and keeps fill order', () => {
    const palette = normalizePalette([
      { key: 'R', name: 'red', hex: 'ff0000', background: false },
      { key: '.', name: 'white', hex: 'ffffff', background: true },
      { key: 'B', name: 'blue', hex: '0000ff', background: false },
    ]);
    expect(palette.keys).toEqual(['.', 'R', 'B']);
    expect(colorIndexOfKey(palette, 'B')).toBe(2);
    expect(colorIndexOfKey(palette, 'Z')).toBe(-1);
  });

  it('requires exactly one background', () => {
    expect(() =>
      normalizePalette([
        { key: '.', name: 'a', hex: 'ffffff', background: false },
        { key: 'X', name: 'b', hex: '000000', background: false },
      ]),
    ).toThrow(/exactly one background/);
    expect(() =>
      normalizePalette([
        { key: '.', name: 'a', hex: 'ffffff', background: true },
        { key: 'X', name: 'b', hex: '000000', background: true },
      ]),
    ).toThrow(/exactly one background/);
  });

  it('rejects duplicate keys, multi-character keys and bad hex', () => {
    const bg = { key: '.', name: 'w', hex: 'ffffff', background: true };
    expect(() =>
      normalizePalette([bg, { key: '.', name: 'x', hex: '000000', background: false }]),
    ).toThrow(/duplicate palette key/);
    expect(() =>
      normalizePalette([bg, { key: 'XY', name: 'x', hex: '000000', background: false }]),
    ).toThrow(/one character/);
    expect(() =>
      normalizePalette([bg, { key: 'X', name: 'x', hex: 'nope', background: false }]),
    ).toThrow(/hex value/);
  });

  it('needs at least two entries', () => {
    expect(() =>
      normalizePalette([{ key: '.', name: 'w', hex: 'ffffff', background: true }]),
    ).toThrow(/at least a background/);
  });

  it('recognises colour puzzles', () => {
    expect(isColorPuzzle(puzzleFrom(['#.', '.#']))).toBe(false);
    expect(isColorPuzzle(colorPuzzleFrom(['AB', 'BA'], '.AB'))).toBe(true);
  });

  it('ships a conventional monochrome palette', () => {
    expect(monochromePalette().keys).toEqual(['.', 'X']);
  });
});

describe('clue derivation', () => {
  it('reads runs off a monochrome line', () => {
    expect(cluesForLine([0, 1, 1, 0, 1])).toEqual([
      { count: 2, colorIndex: 1 },
      { count: 1, colorIndex: 1 },
    ]);
    expect(cluesForLine([0, 0, 0])).toEqual([]);
    expect(cluesForLine([1, 1, 1])).toEqual([{ count: 3, colorIndex: 1 }]);
  });

  it('splits adjacent runs of different colours', () => {
    expect(cluesForLine([1, 1, 2, 2, 0, 1])).toEqual([
      { count: 2, colorIndex: 1 },
      { count: 2, colorIndex: 2 },
      { count: 1, colorIndex: 1 },
    ]);
  });

  it('reads rows and columns', () => {
    const { cells, width, height } = grid(['#..', '.#.', '..#']);
    expect(readRow(cells, width, 1)).toEqual([0, 1, 0]);
    expect(readColumn(cells, width, height, 2)).toEqual([0, 0, 1]);
  });

  it('derives both axes', () => {
    const { cells, width, height } = grid(['##.', '..#']);
    const derived = deriveClues(cells, width, height);
    expect(derived.rows).toEqual([[{ count: 2, colorIndex: 1 }], [{ count: 1, colorIndex: 1 }]]);
    expect(derived.cols).toEqual([
      [{ count: 1, colorIndex: 1 }],
      [{ count: 1, colorIndex: 1 }],
      [{ count: 1, colorIndex: 1 }],
    ]);
  });
});

describe('clue integrity check', () => {
  const { cells, width, height } = grid(['##.', '..#']);

  it('passes on derived clues', () => {
    const derived = deriveClues(cells, width, height);
    expect(checkCluesAgainstSolution(derived.rows, derived.cols, cells, width, height)).toEqual([]);
  });

  it('reports the wrong number of lines', () => {
    const derived = deriveClues(cells, width, height);
    expect(checkCluesAgainstSolution([], derived.cols, cells, width, height)).toEqual([
      'expected 2 row clue lines, got 0',
    ]);
    expect(checkCluesAgainstSolution(derived.rows, [], cells, width, height)).toEqual([
      'expected 3 column clue lines, got 0',
    ]);
  });

  it('names the line that disagrees', () => {
    const derived = deriveClues(cells, width, height);
    const bad = [[{ count: 1, colorIndex: 1 }], derived.rows[1]!];
    expect(checkCluesAgainstSolution(bad, derived.cols, cells, width, height)).toEqual([
      'row 0 clues do not match the solution',
    ]);
  });
});

describe('createPuzzle', () => {
  it('derives clues when they are omitted', () => {
    const puzzle = puzzleFrom(['##.', '..#']);
    expect(puzzle.rowClues[0]).toEqual([{ count: 2, colorIndex: 1 }]);
    expect(solutionFilledCount(puzzle)).toBe(3);
    expect(solutionAt(puzzle, 2, 1)).toBe(1);
  });

  it('rejects a solution of the wrong size', () => {
    expect(() =>
      createPuzzle({ id: 'x', width: 3, height: 2, solution: new Uint8Array(5) }),
    ).toThrow(/expected 6/);
  });

  it('rejects a colour index outside the palette', () => {
    expect(() => createPuzzle({ id: 'x', width: 2, height: 1, solution: [0, 4] })).toThrow(
      /outside 0\.\.1/,
    );
  });

  it('rejects clues that contradict the solution', () => {
    const { cells, width, height } = grid(['##.', '..#']);
    expect(() =>
      createPuzzle({
        id: 'x',
        width,
        height,
        solution: cells,
        rowClues: [[{ count: 3, colorIndex: 1 }], [{ count: 1, colorIndex: 1 }]],
      }),
    ).toThrow(/inconsistent puzzle/);
  });

  it('rejects a difficulty outside 1..5', () => {
    expect(() => puzzleFrom(['#'], { difficulty: 0 })).toThrow(RangeError);
    expect(() => puzzleFrom(['#'], { difficulty: 6 })).toThrow(RangeError);
  });

  it('rejects a grid larger than 100 in either axis (RNF-9)', () => {
    expect(() =>
      createPuzzle({ id: 'x', width: 101, height: 1, solution: new Uint8Array(101) }),
    ).toThrow(/width/);
  });

  it('applies the documented defaults', () => {
    const puzzle = createPuzzle({ id: 'x', width: 1, height: 1, solution: [1] });
    expect(puzzle.distributable).toBe(true);
    expect(puzzle.published).toBe(false);
    expect(puzzle.verified).toBe(false);
    expect(puzzle.unique).toBeNull();
    expect(puzzle.hideTitle).toBe(false);
    expect(puzzle.contentFlags).toEqual([]);
  });

  it('builds colour puzzles', () => {
    const puzzle = colorPuzzleFrom(['AAB', 'B.A'], '.AB');
    expect(puzzle.palette.keys).toEqual(['.', 'A', 'B']);
    expect(puzzle.rowClues[0]).toEqual([
      { count: 2, colorIndex: 1 },
      { count: 1, colorIndex: 2 },
    ]);
    expect(paletteFor('.AB').keys).toEqual(['.', 'A', 'B']);
  });
});
