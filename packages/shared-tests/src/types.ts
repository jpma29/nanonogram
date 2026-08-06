import type { CorpusClue } from './notation.js';
import type { PuzzleJson } from '@nanonogram/core';

export interface CorpusFile<T> {
  schema: string;
  generatedBy: string;
  cases: T[];
}

export interface LineSolveCase {
  id: string;
  label: string;
  colors: number;
  clues: CorpusClue[];
  cells: string;
  expect: {
    feasible: boolean;
    domains?: number[];
    startCount?: number[];
    firstStart?: number[];
  };
}

export interface CrossoutCase {
  id: string;
  label: string;
  colors: number;
  clues: CorpusClue[];
  cells: string;
  expect: boolean[];
}

export type RuleCase =
  | {
      id: string;
      label: string;
      kind: 'penalty';
      errorNumber: number;
      ladder?: number[];
      expect: number;
    }
  | { id: string; label: string; kind: 'checks'; width: number; height: number; expect: number }
  | {
      id: string;
      label: string;
      kind: 'crown';
      errors: number;
      checksUsed: number;
      uniqueSolution: boolean;
      expect: boolean;
    };

export interface PuzzleCase {
  id: string;
  label: string;
  puzzle: PuzzleJson;
  expect: {
    solutionCount: number;
    unique: boolean;
    verified: boolean;
    difficulty: number | null;
    rejectReason: string | null;
  };
}
