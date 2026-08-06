import { describe, expect, it } from 'vitest';
import {
  DEFAULT_PENALTY_LADDER,
  awardsCrown,
  checksAllowed,
  errorCheckingEnabled,
  penaltyForError,
  qualifiesForRecord,
} from '../src/index.js';

describe('checksAllowed (RF-MOD-1)', () => {
  it('matches the table in the requirements', () => {
    const cases: [number, number, number][] = [
      [5, 5, 1],
      [10, 10, 1],
      [11, 11, 2],
      [15, 15, 2],
      [16, 16, 3],
      [20, 20, 3],
      [21, 21, 4],
      [25, 25, 4],
      [26, 26, 5],
      [50, 50, 5],
      [100, 100, 5],
    ];
    for (const [w, h, expected] of cases) {
      expect(checksAllowed(w, h), `${w}x${h}`).toBe(expected);
    }
  });

  it('uses the longer axis', () => {
    expect(checksAllowed(5, 30)).toBe(5);
    expect(checksAllowed(30, 5)).toBe(5);
  });

  it('never returns less than one or more than five', () => {
    expect(checksAllowed(1, 1)).toBe(1);
    expect(checksAllowed(100, 1)).toBe(5);
  });
});

describe('penaltyForError (RF-MOD-2)', () => {
  it('escalates 30s, 1m, 2m, 4m, 8m', () => {
    expect(penaltyForError(1)).toBe(30_000);
    expect(penaltyForError(2)).toBe(60_000);
    expect(penaltyForError(3)).toBe(120_000);
    expect(penaltyForError(4)).toBe(240_000);
    expect(penaltyForError(5)).toBe(480_000);
  });

  it('repeats the last rung forever', () => {
    expect(penaltyForError(6)).toBe(480_000);
    expect(penaltyForError(99)).toBe(480_000);
  });

  it('accepts a custom ladder', () => {
    expect(penaltyForError(1, [1000, 2000])).toBe(1000);
    expect(penaltyForError(7, [1000, 2000])).toBe(2000);
    expect(penaltyForError(1, [])).toBe(0);
  });

  it('rejects a non-positive error number', () => {
    expect(() => penaltyForError(0)).toThrow(RangeError);
    expect(() => penaltyForError(-1)).toThrow(RangeError);
  });

  it('has a default ladder of five rungs', () => {
    expect(DEFAULT_PENALTY_LADDER).toHaveLength(5);
  });
});

describe('awardsCrown (RF-MOD-4)', () => {
  const base = { errors: 0, checksUsed: 0, uniqueSolution: true };

  it('awards a clean run', () => {
    expect(awardsCrown(base)).toBe(true);
  });

  it('withholds it after a single error', () => {
    expect(awardsCrown({ ...base, errors: 1 })).toBe(false);
  });

  it('withholds it after a single verification', () => {
    expect(awardsCrown({ ...base, checksUsed: 1 })).toBe(false);
  });

  it('withholds it on a puzzle without a unique solution (RF-BIB-6)', () => {
    expect(awardsCrown({ ...base, uniqueSolution: false })).toBe(false);
  });
});

describe('records and error checking', () => {
  it('only Hardcore sets a best time', () => {
    expect(qualifiesForRecord('hardcore', true)).toBe(true);
    expect(qualifiesForRecord('casual', true)).toBe(false);
  });

  it('a non-unique puzzle sets no record and checks no errors', () => {
    expect(qualifiesForRecord('hardcore', false)).toBe(false);
    expect(errorCheckingEnabled(false)).toBe(false);
    expect(errorCheckingEnabled(true)).toBe(true);
  });
});
