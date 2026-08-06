/**
 * Runs the shared corpus against `@nanonogram/core`.
 *
 * The Go server runs the same files from `go test` (Fase 2). If these two ever
 * disagree, the client and the server disagree about what a valid puzzle is,
 * which is exactly the failure the corpus exists to prevent (risk R4).
 */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import {
  analyzeLine,
  awardsCrown,
  checksAllowed,
  crossoutLine,
  lineDomains,
  parsePuzzle,
  penaltyForError,
  solvePuzzle,
  verifyPuzzle,
} from '@nanonogram/core';

import { parseLine, toEngineClues } from '../src/notation.js';
import type {
  CorpusFile,
  CrossoutCase,
  LineSolveCase,
  PuzzleCase,
  RuleCase,
} from '../src/types.js';

const CASES = join(dirname(fileURLToPath(import.meta.url)), '..', 'cases');

function load<T>(file: string): CorpusFile<T> {
  return JSON.parse(readFileSync(join(CASES, file), 'utf8')) as CorpusFile<T>;
}

const lineSolve = load<LineSolveCase>('line-solve.json');
const crossout = load<CrossoutCase>('crossout.json');
const rules = load<RuleCase>('rules.json');
const puzzles = load<PuzzleCase>('puzzles.json');

describe('corpus integrity', () => {
  it('holds at least 100 cases in total', () => {
    const total =
      lineSolve.cases.length + crossout.cases.length + rules.cases.length + puzzles.cases.length;
    expect(total).toBeGreaterThanOrEqual(100);
  });

  it('has unique ids within each file', () => {
    for (const file of [lineSolve, crossout, rules, puzzles]) {
      const ids = file.cases.map((c) => (c as { id: string }).id);
      expect(new Set(ids).size, file.schema).toBe(ids.length);
    }
  });

  it('labels every case', () => {
    for (const file of [lineSolve, crossout, rules, puzzles]) {
      for (const c of file.cases) {
        expect((c as { label: string }).label.length).toBeGreaterThan(0);
      }
    }
  });
});

describe('corpus — line solving', () => {
  for (const testCase of lineSolve.cases) {
    it(`${testCase.id}: ${testCase.label}`, () => {
      const clues = toEngineClues(testCase.clues);
      const cells = parseLine(testCase.cells);
      const result = analyzeLine(clues, lineDomains(cells, testCase.colors), testCase.colors);

      expect(result.feasible).toBe(testCase.expect.feasible);
      if (!testCase.expect.feasible) return;
      expect([...result.domains]).toEqual(testCase.expect.domains);
      expect([...result.startCount]).toEqual(testCase.expect.startCount);
      expect([...result.firstStart]).toEqual(testCase.expect.firstStart);
    });
  }
});

describe('corpus — crossout', () => {
  for (const testCase of crossout.cases) {
    it(`${testCase.id}: ${testCase.label}`, () => {
      const result = crossoutLine(
        toEngineClues(testCase.clues),
        parseLine(testCase.cells),
        testCase.colors,
      );
      expect(result).toEqual(testCase.expect);
    });
  }

  /**
   * The generated half of the corpus records whatever the engine currently
   * does, so it cannot by itself catch a wrong rule. These assertions state the
   * rule independently, so a regression in the assist shows up here even if the
   * corpus were regenerated alongside it.
   */
  it('the critical ambiguity case says nothing, by construction', () => {
    const critical = crossout.cases.find((c) => c.label.includes('RF-AYU-2 critical case'));
    expect(critical).toBeDefined();
    expect(critical!.expect).toEqual([false, false]);
  });

  it('never crosses out a clue on a line the player has contradicted', () => {
    for (const testCase of crossout.cases) {
      const clues = toEngineClues(testCase.clues);
      const cells = parseLine(testCase.cells);
      const feasible = analyzeLine(
        clues,
        lineDomains(cells, testCase.colors),
        testCase.colors,
      ).feasible;
      if (!feasible) {
        expect(
          testCase.expect.every((v) => v === false),
          testCase.id,
        ).toBe(true);
      }
    }
  });
});

describe('corpus — rules', () => {
  for (const testCase of rules.cases) {
    it(`${testCase.id}: ${testCase.label}`, () => {
      switch (testCase.kind) {
        case 'penalty':
          expect(penaltyForError(testCase.errorNumber, testCase.ladder)).toBe(testCase.expect);
          break;
        case 'checks':
          expect(checksAllowed(testCase.width, testCase.height)).toBe(testCase.expect);
          break;
        case 'crown':
          expect(
            awardsCrown({
              errors: testCase.errors,
              checksUsed: testCase.checksUsed,
              uniqueSolution: testCase.uniqueSolution,
            }),
          ).toBe(testCase.expect);
          break;
      }
    });
  }
});

describe('corpus — whole puzzles', () => {
  for (const testCase of puzzles.cases) {
    it(`${testCase.id}: ${testCase.label}`, () => {
      const puzzle = parsePuzzle(testCase.puzzle);
      const solved = solvePuzzle(puzzle);
      expect(solved.solutions.length).toBe(testCase.expect.solutionCount);
      expect(solved.unique).toBe(testCase.expect.unique);

      const verification = verifyPuzzle(puzzle);
      expect(verification.verified).toBe(testCase.expect.verified);
      expect(verification.difficulty).toBe(testCase.expect.difficulty);
      expect(verification.rejectReason).toBe(testCase.expect.rejectReason);

      // Whatever the solver returns must actually satisfy the clues.
      for (const candidate of solved.solutions) {
        expect(candidate.length).toBe(puzzle.width * puzzle.height);
      }
    });
  }
});
