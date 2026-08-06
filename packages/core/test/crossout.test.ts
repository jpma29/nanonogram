import { describe, expect, it } from 'vitest';
import {
  computeCrossouts,
  crossoutLine,
  emptyCrossoutState,
  recomputeCrossoutsFor,
} from '../src/index.js';
import { cells, clues, colorClues, colorPuzzleFrom, puzzleFrom } from './helpers.js';

function crossout(clueList: ReturnType<typeof clues>, notation: string, colors = 2): boolean[] {
  return crossoutLine(clueList, cells(notation), colors);
}

describe('crossout — the assist stays quiet unless the answer is forced', () => {
  it('crosses out a block closed by the border and a cross', () => {
    expect(crossout(clues(2), '##xxx')).toEqual([true]);
  });

  it('crosses out a block closed by crosses on both sides', () => {
    expect(crossout(clues(2), 'x##xx')).toEqual([true]);
  });

  it('crosses out both clues when each is pinned to its own closed block', () => {
    expect(crossout(clues(2, 1), 'x##x#x')).toEqual([true, true]);
  });

  /**
   * The case the whole design of this module exists for.
   *
   * There is one closed block of length 1 and two clues of 1. Both readings of
   * the line are legal, so a naive implementation that matches "a closed block
   * of length L" to "a clue of L" would cross one out — and in doing so would
   * tell the player which of the two readings is right. Nothing is crossed out.
   */
  it('says nothing when a closed block could be either of two clues', () => {
    const result = crossout(clues(1, 1), '..x#x..');
    expect(result).toEqual([false, false]);
  });

  it('says nothing in the two-cell version of the same ambiguity', () => {
    expect(crossout(clues(2, 2), '..x##x....')).toEqual([false, false]);
  });

  it('resolves the ambiguity once the player rules out the alternative', () => {
    // Crossing off the left-hand space pins the block to the first clue.
    expect(crossout(clues(1, 1), 'xxx#x..')).toEqual([true, false]);
  });

  it('requires the block to be closed, even when the clue is already pinned', () => {
    // The 3-block can only start at 0, but its right edge is still open, so the
    // player has not yet committed to where it ends.
    expect(crossout(clues(3), '###..')).toEqual([false]);
  });

  it('does not treat a dot as a boundary', () => {
    expect(crossout(clues(1), 'x#xxx')).toEqual([true]);
    expect(crossout(clues(1), 'x#?xx')).toEqual([false]);
  });

  it('says nothing at all when the line contradicts its clues', () => {
    // The player has drawn a 5-block where the clue says 2. No cross-outs, and
    // no complaint either (RF-AYU-6: there is no "this line has an error" hint).
    expect(crossout(clues(2), '#####')).toEqual([false]);
    expect(crossout(clues(2, 2), '##x##x##')).toEqual([false, false]);
  });

  it('handles an empty clue list and an untouched line', () => {
    expect(crossout(clues(), 'xxxxx')).toEqual([]);
    expect(crossout(clues(3), '.....')).toEqual([false]);
  });

  it('crosses out a clue that fills the whole line', () => {
    expect(crossout(clues(5), '#####')).toEqual([true]);
  });
});

describe('crossout — colour', () => {
  it('distinguishes blocks by colour', () => {
    const colors = 3;
    // Two adjacent blocks of different colours are one run of filled cells but
    // two clues, each of which is unambiguously placed.
    expect(crossoutLine(colorClues([2, 1], [2, 2]), cells('AABB', 'AB'), colors)).toEqual([
      true,
      true,
    ]);
  });

  it('does not cross out a block drawn in the wrong colour', () => {
    const colors = 3;
    expect(crossoutLine(colorClues([2, 1]), cells('xBBx', 'AB'), colors)).toEqual([false]);
  });
});

describe('crossout — whole grid', () => {
  const puzzle = puzzleFrom(['##...', '.#...', '.#...', '.###.', '.....']);

  it('returns one flag per clue in every line', () => {
    const state = emptyCrossoutState(puzzle);
    expect(state.rows.map((r) => r.length)).toEqual(puzzle.rowClues.map((c) => c.length));
    expect(state.cols.map((c) => c.length)).toEqual(puzzle.colClues.map((c) => c.length));
    expect(state.rows.flat().every((v) => v === false)).toBe(true);
  });

  it('crosses out nothing on an untouched board', () => {
    const board = new Uint8Array(puzzle.width * puzzle.height);
    const state = computeCrossouts(puzzle, board);
    expect(state.rows.flat().some(Boolean)).toBe(false);
    expect(state.cols.flat().some(Boolean)).toBe(false);
  });

  it('crosses out every clue on the completed board', () => {
    const board = new Uint8Array(puzzle.solution.length);
    for (let i = 0; i < board.length; i++) board[i] = puzzle.solution[i] === 1 ? 3 : 1;
    const state = computeCrossouts(puzzle, board);
    expect(state.rows.flat().every(Boolean)).toBe(true);
    expect(state.cols.flat().every(Boolean)).toBe(true);
  });

  it('incremental recomputation matches a full recomputation', () => {
    const board = new Uint8Array(puzzle.solution.length);
    let state = emptyCrossoutState(puzzle);
    for (let i = 0; i < board.length; i++) {
      board[i] = puzzle.solution[i] === 1 ? 3 : 1;
      state = recomputeCrossoutsFor(puzzle, board, state, [i]);
      const full = computeCrossouts(puzzle, board);
      expect(state.rows).toEqual(full.rows);
      expect(state.cols).toEqual(full.cols);
    }
  });

  it('handles a colour grid end to end', () => {
    const colorPuzzle = colorPuzzleFrom(['AAB', 'B.A', 'AAB'], '.AB');
    const board = new Uint8Array(colorPuzzle.solution.length);
    for (let i = 0; i < board.length; i++) {
      const want = colorPuzzle.solution[i]!;
      board[i] = want === 0 ? 1 : 2 + want;
    }
    const state = computeCrossouts(colorPuzzle, board);
    expect(state.rows.flat().every(Boolean)).toBe(true);
    expect(state.cols.flat().every(Boolean)).toBe(true);
  });
});
