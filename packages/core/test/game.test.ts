import { describe, expect, it } from 'vitest';
import { CROSS, DOT, EMPTY, Game, filledCell } from '../src/index.js';
import { colorPuzzleFrom, puzzleFrom, ticker } from './helpers.js';

/**
 * A 3x3 plus sign. Small enough to reason about by hand, big enough to have
 * both filled and empty cells in every row.
 *
 *   .#.
 *   ###
 *   .#.
 */
const PLUS = () => puzzleFrom(['.#.', '###', '.#.'], { unique: true });

const FILL = filledCell(1);

function playSolution(game: Game, t: ReturnType<typeof ticker>): void {
  const { width, height, solution } = game.puzzle;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (solution[y * width + x] !== 0) game.setCell(x, y, 'filled', t.now());
    }
  }
}

describe('Game — lifecycle', () => {
  it('starts idle and does not run the clock until started', () => {
    const t = ticker();
    const game = new Game(PLUS(), { mode: 'casual' });
    expect(game.status).toBe('ready');
    t.advance(10_000);
    expect(game.activeMs(t.now())).toBe(0);
  });

  it('the first stroke starts the run', () => {
    const t = ticker();
    const game = new Game(PLUS(), { mode: 'casual' });
    game.setCell(1, 0, 'filled', t.now());
    expect(game.status).toBe('playing');
  });

  it('ignores strokes while paused (RF-TIME-2: the board is behind the veil)', () => {
    const t = ticker();
    const game = new Game(PLUS(), { mode: 'casual' });
    game.start(t.now());
    game.pause(t.now());
    game.setCell(1, 0, 'filled', t.now());
    expect(game.cellAt(1, 0)).toBe(EMPTY);
    expect(game.status).toBe('paused');
  });

  it('does not accrue time while paused', () => {
    const t = ticker();
    const game = new Game(PLUS(), { mode: 'casual' });
    game.start(t.now());
    t.advance(3000);
    game.pause(t.now());
    t.advance(100_000);
    game.resume(t.now());
    t.advance(2000);
    expect(game.activeMs(t.now())).toBe(5000);
  });

  it('reset clears the board, the clock, the errors and the verifications', () => {
    const t = ticker();
    const game = new Game(PLUS(), { mode: 'casual' });
    game.setCell(0, 0, 'filled', t.now()); // an error
    t.advance(5000);
    game.check();
    game.reset();
    expect(game.status).toBe('ready');
    expect(game.errors).toBe(0);
    expect(game.checksUsed).toBe(0);
    expect(game.activeMs(t.now())).toBe(0);
    expect(game.canUndo).toBe(false);
    expect([...game.cells].every((c) => c === EMPTY)).toBe(true);
  });
});

describe('Game — the win condition (RF-MOD-5)', () => {
  it('completes when the filled set matches, ignoring crosses and dots', () => {
    const t = ticker();
    const game = new Game(PLUS(), { mode: 'casual' });
    // Litter the board with annotations that must not matter.
    game.setCell(0, 0, 'cross', t.now());
    game.setCell(2, 2, 'dot', t.now());
    playSolution(game, t);
    expect(game.status).toBe('completed');
    expect(game.cellAt(0, 0)).toBe(CROSS);
    expect(game.cellAt(2, 2)).toBe(DOT);
  });

  it('does not complete while a wrongly filled cell remains (Casual)', () => {
    const t = ticker();
    const game = new Game(PLUS(), { mode: 'casual' });
    game.setCell(0, 0, 'filled', t.now()); // wrong
    playSolution(game, t);
    expect(game.status).toBe('playing');
    // The game never says which cell is wrong; removing it closes the puzzle.
    game.setCell(0, 0, 'empty', t.now());
    expect(game.status).toBe('completed');
  });

  it('reports completion on the move that closes it, and only then', () => {
    const t = ticker();
    const game = new Game(puzzleFrom(['##']), { mode: 'casual' });
    expect(game.setCell(0, 0, 'filled', t.now()).completed).toBe(false);
    const last = game.setCell(1, 0, 'filled', t.now());
    expect(last.completed).toBe(true);
    expect(game.setCell(1, 0, 'empty', t.now()).completed).toBe(false);
  });

  it('stops the clock on completion', () => {
    const t = ticker();
    const game = new Game(puzzleFrom(['##']), { mode: 'casual' });
    game.start(t.now());
    t.advance(4000);
    game.setCell(0, 0, 'filled', t.now());
    game.setCell(1, 0, 'filled', t.now());
    t.advance(60_000);
    expect(game.activeMs(t.now())).toBe(4000);
  });

  it('requires the exact colour in a colour puzzle (RF-MOD-6)', () => {
    const t = ticker();
    const puzzle = colorPuzzleFrom(['AB'], '.AB', { unique: true });
    const game = new Game(puzzle, { mode: 'casual', activeColor: 1 });
    game.setCell(0, 0, 'filled', t.now());
    game.setCell(1, 0, 'filled', t.now()); // colour A where B belongs
    expect(game.status).toBe('playing');
    expect(game.errors).toBe(1);

    game.activeColor = 2;
    game.setCell(1, 0, 'filled', t.now());
    expect(game.status).toBe('completed');
  });
});

describe('Game — Casual (RF-MOD-1)', () => {
  it('counts errors silently and does not revert them', () => {
    const t = ticker();
    const game = new Game(PLUS(), { mode: 'casual' });
    const outcome = game.setCell(0, 0, 'filled', t.now());
    expect(game.cellAt(0, 0)).toBe(FILL); // the mistake stands
    expect(game.errors).toBe(1);
    expect(outcome.penaltyMs).toBe(0);
    expect(game.penaltyMs).toBe(0);
  });

  it('correcting a mistake does not refund the error, so no crown (RF-MOD-4)', () => {
    const t = ticker();
    const game = new Game(PLUS(), { mode: 'casual' });
    game.setCell(0, 0, 'filled', t.now());
    game.setCell(0, 0, 'empty', t.now());
    playSolution(game, t);
    expect(game.status).toBe('completed');
    expect(game.errors).toBe(1);
    expect(game.checksUsed).toBe(0);
    expect(game.hasCrown).toBe(false);
  });

  it('a clean Casual run earns a crown', () => {
    const t = ticker();
    const game = new Game(PLUS(), { mode: 'casual' });
    playSolution(game, t);
    expect(game.hasCrown).toBe(true);
  });

  it('undoing a mistake does not refund it either', () => {
    const t = ticker();
    const game = new Game(PLUS(), { mode: 'casual' });
    game.setCell(0, 0, 'filled', t.now());
    game.undo();
    expect(game.cellAt(0, 0)).toBe(EMPTY);
    expect(game.errors).toBe(1);
  });

  it('marking an X on a filled cell is never an error (RF-MOD-3)', () => {
    const t = ticker();
    const game = new Game(PLUS(), { mode: 'casual' });
    game.setCell(1, 1, 'cross', t.now()); // the centre of the plus IS filled
    expect(game.errors).toBe(0);
  });
});

describe('Game — verification (RF-MOD-1)', () => {
  it('allots checks by grid size and reports what is wrong', () => {
    const t = ticker();
    const game = new Game(PLUS(), { mode: 'casual' });
    expect(game.checksRemaining).toBe(1); // 3x3 -> 1

    game.setCell(0, 0, 'filled', t.now());
    game.setCell(1, 0, 'filled', t.now()); // correct
    expect(game.check()).toEqual([0]);
    expect(game.checksUsed).toBe(1);
    expect(game.checksRemaining).toBe(0);
    expect(game.check()).toBeNull();
  });

  it('using a check forfeits the crown even on a flawless board', () => {
    const t = ticker();
    const game = new Game(PLUS(), { mode: 'casual' });
    game.start(t.now());
    game.check();
    playSolution(game, t);
    expect(game.errors).toBe(0);
    expect(game.hasCrown).toBe(false);
  });

  it('is unavailable in Hardcore and while not playing', () => {
    const t = ticker();
    const hardcore = new Game(PLUS(), { mode: 'hardcore' });
    hardcore.start(t.now());
    expect(hardcore.check()).toBeNull();
    expect(hardcore.checksRemaining).toBe(0);

    const casual = new Game(PLUS(), { mode: 'casual' });
    expect(casual.check()).toBeNull(); // not started
  });
});

describe('Game — Hardcore (RF-MOD-2)', () => {
  it('reverts a wrong fill instantly and charges the escalating penalty', () => {
    const t = ticker();
    const game = new Game(PLUS(), { mode: 'hardcore' });

    const first = game.setCell(0, 0, 'filled', t.now());
    expect(game.cellAt(0, 0)).toBe(EMPTY);
    expect(first.error).toBe(true);
    expect(first.penaltyMs).toBe(30_000);

    expect(game.setCell(2, 0, 'filled', t.now()).penaltyMs).toBe(60_000);
    expect(game.setCell(0, 2, 'filled', t.now()).penaltyMs).toBe(120_000);
    expect(game.penaltyMs).toBe(210_000);
    expect(game.errors).toBe(3);
  });

  it('accepts a custom penalty ladder', () => {
    const t = ticker();
    const game = new Game(PLUS(), { mode: 'hardcore', penaltyLadder: [1000] });
    expect(game.setCell(0, 0, 'filled', t.now()).penaltyMs).toBe(1000);
    expect(game.setCell(2, 0, 'filled', t.now()).penaltyMs).toBe(1000);
  });

  it('a bad drag costs one error, not one per cell', () => {
    const t = ticker();
    // A row where only the middle cell is filled: dragging the whole row wrong.
    const game = new Game(PLUS(), { mode: 'hardcore' });
    game.beginStroke(0, 0, 'filled', t.now());
    game.strokeTo(2, 0);
    game.endStroke(t.now());
    expect(game.errors).toBe(1);
    expect(game.penaltyMs).toBe(30_000);
  });

  it('shows time and penalty separately (RF-TIME-3)', () => {
    const t = ticker();
    const game = new Game(PLUS(), { mode: 'hardcore' });
    game.start(t.now());
    t.advance(60_000);
    game.setCell(0, 0, 'filled', t.now());
    expect(game.activeMs(t.now())).toBe(60_000);
    expect(game.penaltyMs).toBe(30_000);
    expect(game.totalMs(t.now())).toBe(90_000);
  });

  it('sets a record; Casual does not', () => {
    expect(new Game(PLUS(), { mode: 'hardcore' }).qualifiesForRecord).toBe(true);
    expect(new Game(PLUS(), { mode: 'casual' }).qualifiesForRecord).toBe(false);
  });
});

describe('Game — strokes (RF-GRID-2, RF-GRID-4)', () => {
  const wide = () => puzzleFrom(['#####', '.....', '.....', '.....', '.....']);

  it('locks the stroke to the first axis it moves along', () => {
    const t = ticker();
    const game = new Game(wide(), { mode: 'casual' });
    game.beginStroke(0, 0, 'filled', t.now());
    game.strokeTo(3, 0); // horizontal: locks
    game.strokeTo(3, 4); // off-axis: ignored
    game.endStroke(t.now());
    expect([...game.cells.slice(0, 5)]).toEqual([FILL, FILL, FILL, FILL, EMPTY]);
    expect(game.cellAt(3, 4)).toBe(EMPTY);
  });

  it('fills the gap when a fast drag skips cells', () => {
    const t = ticker();
    const game = new Game(wide(), { mode: 'casual' });
    game.beginStroke(0, 0, 'filled', t.now());
    game.strokeTo(4, 0); // one event, four cells
    game.endStroke(t.now());
    expect([...game.cells.slice(0, 5)].every((c) => c === FILL)).toBe(true);
  });

  it('paints the whole stroke with the state the first cell got', () => {
    const t = ticker();
    const game = new Game(wide(), { mode: 'casual' });
    game.beginStroke(0, 0, 'cross', t.now());
    game.strokeTo(2, 0);
    game.endStroke(t.now());
    expect([...game.cells.slice(0, 3)]).toEqual([CROSS, CROSS, CROSS]);
  });

  it('a whole drag is one undo (RF-GRID-4)', () => {
    const t = ticker();
    const game = new Game(wide(), { mode: 'casual' });
    game.beginStroke(0, 0, 'filled', t.now());
    game.strokeTo(4, 0);
    game.endStroke(t.now());
    game.undo();
    expect([...game.cells.slice(0, 5)].every((c) => c === EMPTY)).toBe(true);
    game.redo();
    expect([...game.cells.slice(0, 5)].every((c) => c === FILL)).toBe(true);
  });

  it('ignores out-of-bounds coordinates', () => {
    const t = ticker();
    const game = new Game(wide(), { mode: 'casual' });
    game.beginStroke(9, 9, 'filled', t.now());
    game.strokeTo(0, 0);
    expect(game.endStroke(t.now()).changed).toEqual([]);
  });

  it('a stroke that changes nothing costs no undo', () => {
    const t = ticker();
    const game = new Game(wide(), { mode: 'casual' });
    game.setCell(0, 0, 'empty', t.now());
    expect(game.canUndo).toBe(false);
  });

  it('locks a diagonal drag onto the dominant axis', () => {
    const t = ticker();
    const game = new Game(puzzleFrom(['#####', '#....', '#....', '#....', '#....']), {
      mode: 'casual',
    });
    game.beginStroke(0, 0, 'filled', t.now());
    game.strokeTo(1, 3); // mostly vertical
    game.endStroke(t.now());
    expect(game.cellAt(0, 3)).toBe(FILL);
    expect(game.cellAt(1, 0)).toBe(EMPTY);
  });

  it('starting a new stroke commits the one in progress', () => {
    const t = ticker();
    const game = new Game(wide(), { mode: 'casual' });
    game.beginStroke(0, 0, 'filled', t.now());
    game.beginStroke(1, 0, 'filled', t.now());
    game.endStroke(t.now());
    game.undo();
    expect(game.cellAt(1, 0)).toBe(EMPTY);
    expect(game.cellAt(0, 0)).toBe(FILL);
  });

  it('rejects an active colour outside the palette', () => {
    expect(() => new Game(PLUS(), { mode: 'casual', activeColor: 9 })).toThrow(RangeError);
    const game = new Game(PLUS(), { mode: 'casual' });
    expect(() => {
      game.activeColor = 0;
    }).toThrow(RangeError);
  });
});

describe('Game — cross-outs stay in step with the board', () => {
  it('updates as the player marks', () => {
    const t = ticker();
    const game = new Game(PLUS(), { mode: 'casual' });
    expect(game.crossouts.rows[0]).toEqual([false]);
    game.setCell(0, 0, 'cross', t.now());
    game.setCell(1, 0, 'filled', t.now());
    game.setCell(2, 0, 'cross', t.now());
    expect(game.crossouts.rows[0]).toEqual([true]);
  });

  it('a full recompute agrees with the incremental one', () => {
    const t = ticker();
    const game = new Game(PLUS(), { mode: 'casual' });
    game.setCell(0, 0, 'cross', t.now());
    game.setCell(1, 0, 'filled', t.now());
    const incremental = game.crossouts;
    game.refreshAllCrossouts();
    expect(game.crossouts).toEqual(incremental);
  });
});

describe('Game — persistence (RF-SYNC-1)', () => {
  it('round-trips a run in progress', () => {
    const t = ticker();
    const puzzle = PLUS();
    const game = new Game(puzzle, { mode: 'hardcore' });
    game.start(t.now());
    t.advance(12_345);
    game.setCell(1, 0, 'filled', t.now());
    game.setCell(0, 0, 'filled', t.now()); // error: +30s
    game.setCell(0, 1, 'cross', t.now());

    const snapshot = game.serialize(t.now(), { includeHistory: true });
    const restored = Game.restore(puzzle, snapshot);

    expect([...restored.cells]).toEqual([...game.cells]);
    expect(restored.activeMs()).toBe(12_345);
    expect(restored.penaltyMs).toBe(30_000);
    expect(restored.errors).toBe(1);
    expect(restored.mode).toBe('hardcore');
    expect(restored.crossouts).toEqual(game.crossouts);
  });

  /** RF-TIME-2: coming back from the background shows the veil, not the board. */
  it('always comes back paused', () => {
    const t = ticker();
    const puzzle = PLUS();
    const game = new Game(puzzle, { mode: 'casual' });
    game.start(t.now());
    expect(game.serialize(t.now()).status).toBe('paused');
    expect(Game.restore(puzzle, game.serialize(t.now())).status).toBe('paused');
  });

  it('preserves the undo stack when asked to', () => {
    const t = ticker();
    const puzzle = PLUS();
    const game = new Game(puzzle, { mode: 'casual' });
    game.setCell(1, 0, 'filled', t.now());

    expect(Game.restore(puzzle, game.serialize(t.now())).canUndo).toBe(false);
    const withHistory = Game.restore(puzzle, game.serialize(t.now(), { includeHistory: true }));
    expect(withHistory.canUndo).toBe(true);
  });

  it('keeps a completed run completed', () => {
    const t = ticker();
    const puzzle = puzzleFrom(['##']);
    const game = new Game(puzzle, { mode: 'casual' });
    playSolution(game, t);
    expect(Game.restore(puzzle, game.serialize(t.now())).status).toBe('completed');
  });

  it('refuses a snapshot from another puzzle or another schema', () => {
    const t = ticker();
    const puzzle = PLUS();
    const game = new Game(puzzle, { mode: 'casual' });
    const snapshot = game.serialize(t.now());

    expect(() => Game.restore(puzzle, { ...snapshot, puzzleId: 'other' })).toThrow(/not/);
    expect(() =>
      Game.restore(puzzle, { ...snapshot, schema: 'nanonogram.game/9' as never }),
    ).toThrow(/unsupported/);
    expect(() => Game.restore(puzzle, { ...snapshot, gridRle: 'v1:2x2:4.' })).toThrow(/2x2/);
  });
});

describe('Game — a puzzle with more than one solution (RF-BIB-6)', () => {
  /**
   *   #.
   *   .#
   * has clue set {1},{1} / {1},{1} — the anti-diagonal satisfies it too.
   */
  const ambiguous = () =>
    puzzleFrom(['#.', '.#'], { unique: false, verified: false, published: true });

  it('checks no errors and awards no crown', () => {
    const t = ticker();
    const game = new Game(ambiguous(), { mode: 'hardcore' });
    game.setCell(1, 0, 'filled', t.now()); // "wrong" against the stored solution
    expect(game.errors).toBe(0);
    expect(game.cellAt(1, 0)).toBe(FILL);
    expect(game.penaltyMs).toBe(0);
    expect(game.qualifiesForRecord).toBe(false);
  });

  it('accepts any arrangement that satisfies the clues', () => {
    const t = ticker();
    const game = new Game(ambiguous(), { mode: 'casual' });
    game.setCell(1, 0, 'filled', t.now());
    game.setCell(0, 1, 'filled', t.now());
    expect(game.status).toBe('completed');
    expect(game.hasCrown).toBe(false);
  });

  it('offers no verification either', () => {
    const t = ticker();
    const game = new Game(ambiguous(), { mode: 'casual' });
    game.start(t.now());
    expect(game.check()).toBeNull();
  });
});
