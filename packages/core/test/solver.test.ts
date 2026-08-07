import { describe, expect, it } from 'vitest';
import {
  estimateDifficulty,
  isLineSolvable,
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

describe('estimateDifficulty', () => {
  it('scores guess-free puzzles below puzzles that need backtracking', () => {
    const easy = estimateDifficulty({ depth: 0, passes: 2, minInfo: 0.8 }, 20, 20);
    const guessy = estimateDifficulty({ depth: 2, passes: 8, minInfo: 0.1 }, 20, 20);
    expect(easy).toBeLessThan(guessy);
  });

  it('stays inside 1..5', () => {
    expect(estimateDifficulty({ depth: 9, passes: 40, minInfo: 0 }, 100, 100)).toBe(5);
    expect(estimateDifficulty({ depth: 0, passes: 1, minInfo: 1 }, 5, 5)).toBe(1);
  });

  it('nudges large grids upward and small grids downward', () => {
    const metrics = { depth: 0, passes: 5, minInfo: 0.1 };
    expect(estimateDifficulty(metrics, 50, 50)).toBeGreaterThan(
      estimateDifficulty(metrics, 20, 20),
    );
    expect(estimateDifficulty(metrics, 8, 8)).toBeLessThan(estimateDifficulty(metrics, 20, 20));
  });

  it('is deterministic', () => {
    const metrics = { depth: 1, passes: 3, minInfo: 0.25 };
    expect(estimateDifficulty(metrics, 15, 15)).toBe(estimateDifficulty(metrics, 15, 15));
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
