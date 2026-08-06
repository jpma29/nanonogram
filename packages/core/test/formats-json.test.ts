import { describe, expect, it } from 'vitest';
import {
  PUZZLE_SCHEMA,
  PuzzleFormatError,
  parsePuzzle,
  parsePuzzleJson,
  serializePuzzle,
  stringifyPuzzle,
} from '../src/index.js';
import { colorPuzzleFrom, puzzleFrom } from './helpers.js';

/** A minimal, valid canonical document. */
function doc(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    schema: PUZZLE_SCHEMA,
    id: '01J8ZQ3K7M4N5P6R7S8T9V0W1X',
    title: 'Corner',
    hide_title: false,
    author: 'Jane Doe',
    source: 'mikix/nonogram-db',
    source_id: 'corner-01',
    license: 'CC0-1.0',
    copyright: null,
    width: 2,
    height: 2,
    palette: [
      { key: '.', name: 'white', hex: 'ffffff', background: true },
      { key: 'X', name: 'black', hex: '000000' },
    ],
    clues: {
      rows: [[{ count: 2, color: 'X' }], []],
      cols: [[{ count: 1, color: 'X' }], [{ count: 1, color: 'X' }]],
    },
    solution: ['XX', '..'],
    difficulty: 1,
    verified: true,
    unique: true,
    published: true,
    distributable: true,
    content_flags: [],
    created_at: '2026-08-06T10:00:00Z',
    ...overrides,
  };
}

describe('parsePuzzle', () => {
  it('reads a well-formed document', () => {
    const puzzle = parsePuzzle(doc());
    expect(puzzle.id).toBe('01J8ZQ3K7M4N5P6R7S8T9V0W1X');
    expect(puzzle.width).toBe(2);
    expect([...puzzle.solution]).toEqual([1, 1, 0, 0]);
    expect(puzzle.license).toBe('CC0-1.0');
    expect(puzzle.distributable).toBe(true);
  });

  it('round-trips through serialisation', () => {
    const original = doc();
    const puzzle = parsePuzzle(original);
    const written = serializePuzzle(puzzle);
    expect(written).toEqual({ ...original, palette: written.palette });
    expect(parsePuzzle(written)).toEqual(puzzle);
  });

  it('round-trips a colour puzzle', () => {
    const puzzle = colorPuzzleFrom(['AAB', 'B.A', 'AAB'], '.AB');
    const reparsed = parsePuzzleJson(stringifyPuzzle(puzzle));
    expect([...reparsed.solution]).toEqual([...puzzle.solution]);
    expect(reparsed.palette.keys).toEqual(puzzle.palette.keys);
    expect(reparsed.rowClues).toEqual(puzzle.rowClues);
  });

  it('round-trips a puzzle built in code', () => {
    const puzzle = puzzleFrom(['.#.', '###', '.#.'], { title: 'Plus', difficulty: 2 });
    expect(parsePuzzle(serializePuzzle(puzzle))).toEqual(puzzle);
  });

  it('applies defaults for optional fields', () => {
    const minimal = {
      schema: PUZZLE_SCHEMA,
      id: 'x',
      width: 1,
      height: 1,
      palette: [
        { key: '.', name: 'w', hex: 'ffffff', background: true },
        { key: 'X', name: 'b', hex: '000000' },
      ],
      clues: { rows: [[{ count: 1, color: 'X' }]], cols: [[{ count: 1, color: 'X' }]] },
      solution: ['X'],
    };
    const puzzle = parsePuzzle(minimal);
    expect(puzzle.title).toBeNull();
    expect(puzzle.published).toBe(false);
    expect(puzzle.distributable).toBe(true);
    expect(puzzle.unique).toBeNull();
    expect(puzzle.contentFlags).toEqual([]);
  });
});

describe('parsePuzzle — rejections', () => {
  const cases: [string, Record<string, unknown> | unknown, RegExp][] = [
    ['a non-object', 'nope', /must be a JSON object/],
    ['a wrong schema tag', doc({ schema: 'nonogram/2' }), /unsupported schema/],
    ['a missing id', doc({ id: 42 }), /"id" must be a string/],
    ['a width beyond 100', doc({ width: 101 }), /between 1 and 100/],
    ['a non-integer height', doc({ height: 2.5 }), /must be an integer/],
    ['a non-array palette', doc({ palette: {} }), /"palette" must be an array/],
    [
      'a clue in the background colour',
      doc({
        clues: { rows: [[{ count: 2, color: '.' }], []], cols: [[], []] },
      }),
      /background colour/,
    ],
    [
      'a clue in an unknown colour',
      doc({
        clues: { rows: [[{ count: 2, color: 'Q' }], []], cols: [[], []] },
      }),
      /unknown palette key/,
    ],
    [
      'a zero clue count',
      doc({
        clues: { rows: [[{ count: 0, color: 'X' }], []], cols: [[], []] },
      }),
      /positive integer/,
    ],
    [
      'a non-array clue line',
      doc({ clues: { rows: 'no', cols: [] } }),
      /clues.rows" must be an array/,
    ],
    ['a missing clues object', doc({ clues: null }), /"clues" must be an object/],
    ['a solution of the wrong height', doc({ solution: ['XX'] }), /has 1 rows, expected 2/],
    ['a solution row of the wrong width', doc({ solution: ['XXX', '..'] }), /has 3 cells/],
    ['a solution with an unknown key', doc({ solution: ['XQ', '..'] }), /unknown palette key/],
    ['a non-string solution row', doc({ solution: [1, 2] }), /must be a string/],
    ['a non-integer difficulty', doc({ difficulty: 'hard' }), /"difficulty" must be an integer/],
    ['a non-boolean unique', doc({ unique: 'yes' }), /"unique" must be a boolean/],
    ['non-array content flags', doc({ content_flags: 'nsfw' }), /"content_flags" must be an array/],
    ['a non-boolean flag', doc({ hide_title: 'yes' }), /"hide_title" must be a boolean/],
    ['a non-string optional field', doc({ author: 7 }), /"author" must be a string/],
  ];

  for (const [label, input, pattern] of cases) {
    it(`rejects ${label}`, () => {
      expect(() => parsePuzzle(input)).toThrow(pattern);
      expect(() => parsePuzzle(input)).toThrow(PuzzleFormatError);
    });
  }

  it('rejects clues that contradict the solution', () => {
    expect(() =>
      parsePuzzle(doc({ clues: { rows: [[{ count: 1, color: 'X' }], []], cols: [[], []] } })),
    ).toThrow(/inconsistent puzzle/);
  });

  it('rejects invalid JSON text', () => {
    expect(() => parsePuzzleJson('{')).toThrow(PuzzleFormatError);
    expect(() => parsePuzzleJson('{')).toThrow(/invalid JSON/);
  });
});

describe('stringifyPuzzle', () => {
  it('writes the solution as one string per row, for readable diffs', () => {
    const text = stringifyPuzzle(puzzleFrom(['##.', '..#']));
    expect(text).toContain('"XX."');
    expect(text).toContain('"..X"');
    expect(JSON.parse(text).schema).toBe(PUZZLE_SCHEMA);
  });
});
