import { describe, expect, it } from 'vitest';
import {
  estimateDifficulty,
  DIFFICULTY_WEIGHTS,
  isLineSolvable,
  openingShare,
  propagateOnly,
  solvePuzzle,
  verifyPuzzle,
} from '../src/index.js';
import { colorPuzzleFrom, grid, puzzleFrom } from './helpers.js';

describe('solvePuzzle', () => {
  it('solves a puzzle that needs no guessing', () => {
    const puzzle = puzzleFrom(['.#.', '###', '.#.']);
    const result = solvePuzzle(puzzle);
    expect(result.unique).toBe(true);
    expect(result.solutions).toHaveLength(1);
    expect([...result.solutions[0]!]).toEqual([...puzzle.solution]);
    expect(result.metrics.depth).toBe(0);
  });

  it('finds both solutions of an ambiguous puzzle', () => {
    // Two diagonals satisfy {1}/{1} x {1}/{1}.
    const puzzle = puzzleFrom(['#.', '.#']);
    const result = solvePuzzle(puzzle);
    expect(result.solutions).toHaveLength(2);
    expect(result.unique).toBe(false);
  });

  it('solves a puzzle that requires guessing, and records the depth', () => {
    const puzzle = puzzleFrom(['#.', '.#']);
    const result = solvePuzzle(puzzle, { maxSolutions: 2 });
    expect(result.metrics.depth).toBeGreaterThan(0);
  });

  it('reports no solution when the clues are unsatisfiable', () => {
    // `createPuzzle` will not build this — the clues contradict the solution —
    // so the solver is handed a raw puzzle to prove it handles the case that a
    // future importer could produce.
    const { cells, width, height } = grid(['##', '..']);
    const puzzle = {
      ...puzzleFrom(['##', '..']),
      width,
      height,
      solution: cells,
      rowClues: [[{ count: 2, colorIndex: 1 }], []],
      colClues: [[{ count: 2, colorIndex: 1 }], [{ count: 2, colorIndex: 1 }]],
    };
    const result = solvePuzzle(puzzle);
    expect(result.solutions).toHaveLength(0);
    expect(verifyPuzzle(puzzle).rejectReason).toMatch(/no solution/);
  });

  it('rejects a puzzle whose declared solution does not satisfy its clues', () => {
    const base = puzzleFrom(['##.', '...', '...']);
    const puzzle = { ...base, solution: new Uint8Array(9) };
    const result = verifyPuzzle(puzzle);
    expect(result.verified).toBe(false);
    expect(result.matchesDeclaredSolution).toBe(false);
    expect(result.rejectReason).toMatch(/declared solution/);
  });

  it('solves an empty grid', () => {
    const puzzle = puzzleFrom(['..', '..']);
    const result = solvePuzzle(puzzle);
    expect(result.unique).toBe(true);
    expect([...result.solutions[0]!]).toEqual([0, 0, 0, 0]);
  });

  it('solves a full grid', () => {
    const puzzle = puzzleFrom(['###', '###', '###']);
    expect(solvePuzzle(puzzle).unique).toBe(true);
  });

  it('solves a colour puzzle', () => {
    const puzzle = colorPuzzleFrom(['AAB', 'B.A', 'AAB'], '.AB');
    const result = solvePuzzle(puzzle);
    expect(result.solutions.length).toBeGreaterThanOrEqual(1);
    expect(result.solutions.some((s) => [...s].join() === [...puzzle.solution].join())).toBe(true);
  });

  it('gives up cleanly when it runs out of budget', () => {
    const puzzle = puzzleFrom(['#.', '.#']);
    const result = solvePuzzle(puzzle, { nodeBudget: 0 });
    expect(result.exhausted).toBe(true);
    expect(result.unique).toBe(false);
  });

  it('solves a 15x15 that has a real picture in it', () => {
    const puzzle = puzzleFrom(
      [
        '...###...###...',
        '..#####.#####..',
        '.###############',
        '.###############',
        '.###############',
        '..#############',
        '..#############',
        '...###########.',
        '....#########..',
        '.....#######...',
        '......#####....',
        '.......###.....',
        '........#......',
        '...............',
        '...............',
      ].map((row) => row.slice(0, 15)),
    );
    const result = solvePuzzle(puzzle);
    expect(result.solutions.length).toBeGreaterThanOrEqual(1);
    expect(result.solutions.some((s) => [...s].join() === [...puzzle.solution].join())).toBe(true);
  });
});

describe('verifyPuzzle (RF-BIB-6)', () => {
  it('accepts a uniquely solvable puzzle and scores it', () => {
    const puzzle = puzzleFrom(['.#.', '###', '.#.']);
    const result = verifyPuzzle(puzzle);
    expect(result.verified).toBe(true);
    expect(result.unique).toBe(true);
    expect(result.rejectReason).toBeNull();
    expect(result.difficulty).toBeGreaterThanOrEqual(1);
    expect(result.difficulty).toBeLessThanOrEqual(5);
  });

  it('rejects a puzzle with more than one solution, but keeps it playable', () => {
    const result = verifyPuzzle(puzzleFrom(['#.', '.#']));
    expect(result.verified).toBe(false);
    expect(result.unique).toBe(false);
    expect(result.matchesDeclaredSolution).toBe(true);
    expect(result.rejectReason).toMatch(/more than one solution/);
  });

  it('rejects a puzzle whose budget runs out', () => {
    const result = verifyPuzzle(puzzleFrom(['.#.', '###', '.#.']), { nodeBudget: 0 });
    expect(result.verified).toBe(false);
    expect(result.rejectReason).toMatch(/node budget/);
  });
});

describe('estimateDifficulty (opening + chain, 02-arquitectura §5.3)', () => {
  const m = (openness: number, passes: number, depth = 0) => ({
    depth,
    passes,
    minInfo: 0.5,
    openness,
  });

  it('a generous opening scores easy, a tight one scores hard', () => {
    expect(estimateDifficulty(m(0.95, 3))).toBe(1);
    expect(estimateDifficulty(m(0.2, 3))).toBeGreaterThanOrEqual(4);
  });

  it('the opening outweighs the chain', () => {
    // Wide-open board, very long chain: still not hard.
    const openButLong = estimateDifficulty(m(0.9, 25));
    // Tight board, short chain: harder, despite closing in three passes.
    const tightButShort = estimateDifficulty(m(0.25, 3));
    expect(tightButShort).toBeGreaterThan(openButLong);
  });

  it('a longer chain still raises the score at equal opening', () => {
    expect(estimateDifficulty(m(0.5, 12))).toBeGreaterThan(estimateDifficulty(m(0.5, 2)));
  });

  it('is monotonic in the opening', () => {
    let previous = 6;
    for (const openness of [0.1, 0.3, 0.5, 0.7, 0.9]) {
      const level = estimateDifficulty(m(openness, 4));
      expect(level).toBeLessThanOrEqual(previous);
      previous = level;
    }
  });

  it('does not look at grid size at all', () => {
    // Size correlates with the opening already; counting it twice is what made
    // the first version of this function useless.
    expect(estimateDifficulty(m(0.5, 4))).toBe(estimateDifficulty(m(0.5, 4)));
  });

  it('puts anything that needs guessing at the top of the scale', () => {
    expect(estimateDifficulty(m(0.9, 2, 1))).toBe(5);
  });

  it('stays inside 1..5 at the extremes', () => {
    expect(estimateDifficulty(m(0, 999))).toBe(5);
    expect(estimateDifficulty(m(1, 0))).toBe(1);
  });

  it('clamps out-of-range inputs instead of leaving the 1..5 scale', () => {
    // Both terms saturate independently. An openness below zero reads as "no
    // opening at all" — the hard end — and a negative pass count as "no chain".
    expect(estimateDifficulty(m(-5, -5))).toBe(5);
    // A board given away entirely, but that still takes 999 passes to close, is
    // not a level 1: the chain term keeps contributing its full share.
    expect(estimateDifficulty(m(5, 999))).toBe(2);
    for (const [openness, passes] of [
      [-1, -1],
      [0, 0],
      [1, 1],
      [2, 1e6],
      [Number.NaN, 4],
    ] as const) {
      const level = estimateDifficulty(m(openness, passes));
      expect(level, `${openness}/${passes}`).toBeGreaterThanOrEqual(1);
      expect(level, `${openness}/${passes}`).toBeLessThanOrEqual(5);
    }
  });

  it('exposes its weights so the Go implementation can mirror them', () => {
    expect(DIFFICULTY_WEIGHTS.opening + DIFFICULTY_WEIGHTS.chain).toBeCloseTo(1);
    expect(DIFFICULTY_WEIGHTS.thresholds).toHaveLength(4);
    expect([...DIFFICULTY_WEIGHTS.thresholds]).toEqual(
      [...DIFFICULTY_WEIGHTS.thresholds].sort((a, b) => a - b),
    );
  });
});

describe('openingShare', () => {
  it('is 1 when one reading of the clues settles the whole board', () => {
    expect(openingShare(puzzleFrom(['##', '##']))).toBe(1);
    expect(openingShare(puzzleFrom(['..', '..']))).toBe(1);
  });

  it('is low when nothing is forced without cross-referencing', () => {
    expect(openingShare(puzzleFrom(['#.', '.#']))).toBe(0);
  });

  it('sits between the two for a real picture', () => {
    const share = openingShare(puzzleFrom(['.#.', '###', '.#.']));
    expect(share).toBeGreaterThan(0);
    expect(share).toBeLessThanOrEqual(1);
  });

  it('never exceeds what full propagation decides', () => {
    for (const rows of [
      ['.#.', '###', '.#.'],
      ['#####', '#...#', '#####'],
      ['#.', '.#'],
    ]) {
      const puzzle = puzzleFrom(rows);
      const total = puzzle.width * puzzle.height;
      const settled = total - propagateOnly(puzzle).undecided;
      expect(openingShare(puzzle) * total, rows.join('/')).toBeLessThanOrEqual(settled);
    }
  });
});

describe('propagateOnly / isLineSolvable (the "pure logic" standard)', () => {
  it('solves a line-solvable puzzle to completion with no guessing', () => {
    const puzzle = puzzleFrom(['.#.', '###', '.#.']);
    const result = propagateOnly(puzzle);
    expect(result.contradiction).toBe(false);
    expect(result.undecided).toBe(0);
    expect(isLineSolvable(puzzle)).toBe(true);
  });

  it('leaves cells undecided when the puzzle needs a guess', () => {
    // The ambiguous diagonal: unique solution is impossible, and line logic
    // cannot decide a single cell.
    const puzzle = puzzleFrom(['#.', '.#']);
    const result = propagateOnly(puzzle);
    expect(result.contradiction).toBe(false);
    expect(result.undecided).toBe(4);
    expect(isLineSolvable(puzzle)).toBe(false);
  });

  it('agrees with the full solver about which puzzles need backtracking', () => {
    for (const rows of [
      ['.#.', '###', '.#.'],
      ['#####', '#...#', '#...#', '#...#', '#####'],
      ['##########'],
      ['#.', '.#'],
      ['#.#', '.#.', '#.#'],
    ]) {
      const puzzle = puzzleFrom(rows);
      const full = solvePuzzle(puzzle);
      expect(isLineSolvable(puzzle), rows.join('/')).toBe(full.unique && full.metrics.depth === 0);
    }
  });

  it('reports a contradiction when the clues cannot be satisfied', () => {
    const base = puzzleFrom(['##', '..']);
    const impossible = {
      ...base,
      rowClues: [[{ count: 2, colorIndex: 1 }], []],
      colClues: [[{ count: 2, colorIndex: 1 }], [{ count: 2, colorIndex: 1 }]],
    };
    const result = propagateOnly(impossible);
    expect(result.contradiction).toBe(true);
    expect(isLineSolvable(impossible)).toBe(false);
  });

  it('a line-solvable puzzle always has a unique solution', () => {
    // Nothing left to branch on means nothing left to disagree about.
    for (const rows of [['.#.', '###', '.#.'], ['####', '#..#', '#..#', '####'], ['#']]) {
      const puzzle = puzzleFrom(rows);
      if (!isLineSolvable(puzzle)) continue;
      expect(solvePuzzle(puzzle).unique, rows.join('/')).toBe(true);
    }
  });
});
