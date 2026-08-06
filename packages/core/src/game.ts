/**
 * The game state machine: one player, one puzzle, one run.
 *
 * This is where the rules in `rules.ts` meet the board. Everything the UI needs
 * to know about a run is derived from here, and nothing about a run is decided
 * anywhere else — no component gets to have an opinion about what counts as an
 * error or when a crown is earned.
 */

import {
  CROSS,
  DOT,
  EMPTY,
  type CellValue,
  cellIndex,
  colorIndexOf,
  decodeGrid,
  encodeGrid,
  fillSymbolsFor,
  filledCell,
  inBounds,
  isFilled,
} from './grid.js';
import { GameClock, type ClockState } from './clock.js';
import { History, type HistoryState, type Stroke, invertStroke } from './history.js';
import {
  DEFAULT_PENALTY_LADDER,
  type GameMode,
  awardsCrown,
  checksAllowed,
  errorCheckingEnabled,
  penaltyForError,
  qualifiesForRecord,
} from './rules.js';
import {
  type CrossoutState,
  computeCrossouts,
  emptyCrossoutState,
  recomputeCrossoutsFor,
} from './crossout.js';
import { type Puzzle, cluesForLine, readColumn, readRow, solutionFilledCount } from './puzzle.js';

/** Lifecycle of a run. */
export type GameStatus = 'ready' | 'playing' | 'paused' | 'completed';

/** Which state a stroke paints. */
export type PaintState = 'empty' | 'filled' | 'cross' | 'dot';

export interface GameOptions {
  readonly mode: GameMode;
  /** Palette colour index painted by `filled` strokes. Defaults to 1. */
  readonly activeColor?: number;
  /** Overrides the default Hardcore penalty ladder. */
  readonly penaltyLadder?: readonly number[];
}

/** Serialisable run state. Mirrors the `progress` row of 04-modelo-de-datos §3. */
export interface GameSnapshot {
  readonly schema: 'nanonogram.game/1';
  readonly puzzleId: string;
  readonly mode: GameMode;
  /** `v1:WxH:...` run-length encoding of the board. */
  readonly gridRle: string;
  readonly activeMs: number;
  readonly penaltyMs: number;
  readonly errors: number;
  readonly checksUsed: number;
  readonly status: GameStatus;
  /** Device-local; never synchronised. */
  readonly history?: HistoryState;
}

/** What happened as a result of a board mutation. */
export interface MoveOutcome {
  /** Cell indices whose value changed. */
  readonly changed: readonly number[];
  /** True when this move was an incorrect fill (RF-MOD-1 / RF-MOD-2). */
  readonly error: boolean;
  /** Milliseconds of penalty added by this move. Always 0 in Casual. */
  readonly penaltyMs: number;
  /** True when this move completed the puzzle. */
  readonly completed: boolean;
}

const NO_CHANGE: MoveOutcome = Object.freeze({
  changed: Object.freeze([]),
  error: false,
  penaltyMs: 0,
  completed: false,
});

export class Game {
  readonly puzzle: Puzzle;
  readonly mode: GameMode;

  #cells: Uint8Array;
  #clock: GameClock;
  #history: History;
  #status: GameStatus = 'ready';
  #errors = 0;
  #checksUsed = 0;
  #activeColor: number;
  #penaltyLadder: readonly number[];

  /** Cells filled with the colour the solution wants there. */
  #correctFilled = 0;
  /** Cells filled with a colour the solution does not want there. */
  #wrongFilled = 0;
  readonly #targetFilled: number;

  /** Cross-out state, kept incrementally in step with the board. */
  #crossouts: CrossoutState;

  /** Stroke in progress, if any. */
  #stroke: {
    readonly originX: number;
    readonly originY: number;
    readonly value: CellValue;
    axis: 'none' | 'horizontal' | 'vertical';
    lastX: number;
    lastY: number;
    changes: { index: number; from: number; to: number }[];
    aborted: boolean;
    readonly errorsBefore: number;
    readonly penaltyBefore: number;
  } | null = null;

  /** Most recent monotonic tick the host handed us. */
  #lastTick = 0;

  constructor(puzzle: Puzzle, options: GameOptions) {
    this.puzzle = puzzle;
    this.mode = options.mode;
    this.#activeColor = options.activeColor ?? 1;
    this.#penaltyLadder = options.penaltyLadder ?? DEFAULT_PENALTY_LADDER;
    if (this.#activeColor < 1 || this.#activeColor >= puzzle.palette.keys.length) {
      throw new RangeError(`active colour ${this.#activeColor} is not in the palette`);
    }
    this.#cells = new Uint8Array(puzzle.width * puzzle.height);
    this.#clock = new GameClock();
    this.#history = new History();
    this.#targetFilled = solutionFilledCount(puzzle);
    this.#crossouts = emptyCrossoutState(puzzle);
  }

  /* ---------------------------------------------------------------------- */
  /* Read-only view                                                          */
  /* ---------------------------------------------------------------------- */

  /** The board. Do not mutate; use the stroke API. */
  get cells(): Readonly<Uint8Array> {
    return this.#cells;
  }

  get status(): GameStatus {
    return this.#status;
  }

  get errors(): number {
    return this.#errors;
  }

  get checksUsed(): number {
    return this.#checksUsed;
  }

  /** Remaining "Verificar" uses. Always 0 in Hardcore, which has no such button. */
  get checksRemaining(): number {
    if (this.mode !== 'casual') return 0;
    return checksAllowed(this.puzzle.width, this.puzzle.height) - this.#checksUsed;
  }

  get activeColor(): number {
    return this.#activeColor;
  }

  set activeColor(colorIndex: number) {
    if (colorIndex < 1 || colorIndex >= this.puzzle.palette.keys.length) {
      throw new RangeError(`active colour ${colorIndex} is not in the palette`);
    }
    this.#activeColor = colorIndex;
  }

  /** Active play time, excluding pauses, in milliseconds. */
  activeMs(now?: number): number {
    return this.#clock.activeMs(now);
  }

  get penaltyMs(): number {
    return this.#clock.penaltyMs;
  }

  /** What the player sees: active time plus penalties (RF-TIME-3). */
  totalMs(now?: number): number {
    return this.#clock.totalMs(now);
  }

  get canUndo(): boolean {
    return this.#history.canUndo;
  }

  get canRedo(): boolean {
    return this.#history.canRedo;
  }

  /** Unambiguous clue cross-outs for the current board (RF-AYU-2). */
  get crossouts(): CrossoutState {
    return this.#crossouts;
  }

  /**
   * Whether this run earned a crown. Only meaningful once completed
   * (RF-MOD-4).
   */
  get hasCrown(): boolean {
    return (
      this.#status === 'completed' &&
      awardsCrown({
        errors: this.#errors,
        checksUsed: this.#checksUsed,
        uniqueSolution: this.puzzle.unique !== false,
      })
    );
  }

  /** Whether this run's time is eligible to become a record (RF-STAT-1). */
  get qualifiesForRecord(): boolean {
    return qualifiesForRecord(this.mode, this.puzzle.unique !== false);
  }

  /** Value at a coordinate. */
  cellAt(x: number, y: number): CellValue {
    return this.#cells[cellIndex(this.puzzle.width, x, y)]!;
  }

  /* ---------------------------------------------------------------------- */
  /* Lifecycle                                                               */
  /* ---------------------------------------------------------------------- */

  /** Begin the run. The clock starts here, not at construction. */
  start(now: number): void {
    if (this.#status === 'completed') return;
    this.#lastTick = now;
    this.#status = 'playing';
    this.#clock.resume(now);
  }

  /**
   * Pause. Called for the pause menu and for every implicit pause — tab hidden,
   * app backgrounded, screen locked (RF-TIME-1). The board must be veiled while
   * this is true (RF-TIME-2); that is the UI's job, but the clock is what makes
   * it honest.
   */
  pause(now: number): void {
    this.#lastTick = now;
    if (this.#status !== 'playing') return;
    this.#abortStroke();
    this.#status = 'paused';
    this.#clock.pause(now);
  }

  resume(now: number): void {
    this.#lastTick = now;
    if (this.#status !== 'paused') return;
    this.#status = 'playing';
    this.#clock.resume(now);
  }

  /**
   * Wipe the board, the clock, the errors and the verifications (RF-GRID-6).
   * The crown and best time already earned live outside the run and are
   * untouched.
   */
  reset(): void {
    this.#cells.fill(EMPTY);
    this.#clock.reset();
    this.#history.clear();
    this.#status = 'ready';
    this.#errors = 0;
    this.#checksUsed = 0;
    this.#correctFilled = 0;
    this.#wrongFilled = 0;
    this.#stroke = null;
    this.#crossouts = emptyCrossoutState(this.puzzle);
  }

  /* ---------------------------------------------------------------------- */
  /* Board mutation                                                          */
  /* ---------------------------------------------------------------------- */

  /** Paint a single cell as a one-cell stroke. */
  setCell(x: number, y: number, paint: PaintState, now: number): MoveOutcome {
    this.beginStroke(x, y, paint, now);
    return this.endStroke(now);
  }

  /**
   * Begin a drag. The value painted by the whole stroke is decided here, by the
   * first cell (RF-GRID-2).
   */
  beginStroke(x: number, y: number, paint: PaintState, now: number): void {
    this.#lastTick = now;
    if (this.#status === 'ready') this.start(now);
    if (this.#status !== 'playing') return;
    this.#abortStroke();
    if (!inBounds(this.puzzle.width, this.puzzle.height, x, y)) return;

    this.#stroke = {
      originX: x,
      originY: y,
      value: this.#valueFor(paint),
      axis: 'none',
      lastX: x,
      lastY: y,
      changes: [],
      aborted: false,
      errorsBefore: this.#errors,
      penaltyBefore: this.#clock.penaltyMs,
    };
    this.#paintCell(x, y);
  }

  /**
   * Continue a drag to a new cell. The stroke locks onto the first axis it
   * moves along and ignores movement off that axis until release (RF-GRID-2).
   */
  strokeTo(x: number, y: number): void {
    const stroke = this.#stroke;
    if (!stroke || stroke.aborted) return;
    if (!inBounds(this.puzzle.width, this.puzzle.height, x, y)) return;

    if (stroke.axis === 'none') {
      if (x !== stroke.originX && y === stroke.originY) stroke.axis = 'horizontal';
      else if (y !== stroke.originY && x === stroke.originX) stroke.axis = 'vertical';
      else if (x !== stroke.originX && y !== stroke.originY) {
        // Diagonal move: lock onto whichever axis moved further.
        stroke.axis =
          Math.abs(x - stroke.originX) >= Math.abs(y - stroke.originY) ? 'horizontal' : 'vertical';
      } else return; // same cell
    }

    const targetX = stroke.axis === 'horizontal' ? x : stroke.originX;
    const targetY = stroke.axis === 'vertical' ? y : stroke.originY;

    // Paint every cell between the last position and the new one, so a fast
    // drag that skips cells between pointer events does not leave gaps.
    const stepX = Math.sign(targetX - stroke.lastX);
    const stepY = Math.sign(targetY - stroke.lastY);
    let cx = stroke.lastX;
    let cy = stroke.lastY;
    while (cx !== targetX || cy !== targetY) {
      cx += stepX;
      cy += stepY;
      this.#paintCell(cx, cy);
      if (this.#stroke?.aborted) break;
    }
    stroke.lastX = targetX;
    stroke.lastY = targetY;
  }

  /** Release the drag, committing it as a single undo entry (RF-GRID-4). */
  endStroke(now?: number): MoveOutcome {
    if (now !== undefined) this.#lastTick = now;
    const stroke = this.#stroke;
    this.#stroke = null;
    if (!stroke) return NO_CHANGE;

    const changed = stroke.changes.filter((c) => c.from !== c.to);
    if (changed.length > 0) {
      this.#history.push(changed);
      this.#refreshCrossouts(changed.map((c) => c.index));
    }

    const completed = this.#evaluateCompletion();
    return {
      changed: changed.map((c) => c.index),
      error: this.#errors > stroke.errorsBefore,
      penaltyMs: this.#clock.penaltyMs - stroke.penaltyBefore,
      completed,
    };
  }

  #valueFor(paint: PaintState): CellValue {
    switch (paint) {
      case 'empty':
        return EMPTY;
      case 'cross':
        return CROSS;
      case 'dot':
        return DOT;
      case 'filled':
        return filledCell(this.#activeColor);
    }
  }

  /**
   * Apply the stroke's value to one cell, running the error rules.
   *
   * Marking an X is never an error, in any mode (RF-MOD-3): the X is the
   * player's annotation, not a claim about the solution. Only filling is.
   */
  #paintCell(x: number, y: number): void {
    const stroke = this.#stroke;
    if (!stroke || stroke.aborted) return;
    const index = cellIndex(this.puzzle.width, x, y);
    const from = this.#cells[index]!;
    const to = stroke.value;
    if (from === to) return;

    const checking = errorCheckingEnabled(this.puzzle.unique !== false);
    const isError = checking && isFilled(to) && colorIndexOf(to) !== this.puzzle.solution[index]!;

    if (isError) {
      this.#errors++;
      if (this.mode === 'hardcore') {
        // Revert instantly, charge the escalating penalty, and end the stroke
        // so one bad drag cannot cost twelve errors (RF-MOD-2).
        this.#clock.addPenalty(penaltyForError(this.#errors, this.#penaltyLadder));
        stroke.aborted = true;
        return;
      }
      // Casual: the mistake stands, uncommented, and is counted silently for
      // the crown decision (RF-MOD-1).
    }

    this.#writeCell(index, to);
    stroke.changes.push({ index, from, to });
  }

  /** Write a cell and keep the completion counters in step. */
  #writeCell(index: number, to: CellValue): void {
    const from = this.#cells[index]!;
    if (from === to) return;
    const want = this.puzzle.solution[index]!;
    if (isFilled(from)) {
      if (colorIndexOf(from) === want) this.#correctFilled--;
      else this.#wrongFilled--;
    }
    if (isFilled(to)) {
      if (colorIndexOf(to) === want) this.#correctFilled++;
      else this.#wrongFilled++;
    }
    this.#cells[index] = to;
  }

  #abortStroke(): void {
    if (this.#stroke) this.endStroke();
  }

  /* ---------------------------------------------------------------------- */
  /* Undo / redo                                                             */
  /* ---------------------------------------------------------------------- */

  /**
   * Undo one stroke. Undoing does not refund an error: the crown rewards not
   * having been wrong (RF-MOD-1).
   */
  undo(now?: number): MoveOutcome {
    if (now !== undefined) this.#lastTick = now;
    this.#abortStroke();
    const stroke = this.#history.undo();
    if (!stroke) return NO_CHANGE;
    return this.#applyStroke(invertStroke(stroke));
  }

  redo(now?: number): MoveOutcome {
    if (now !== undefined) this.#lastTick = now;
    this.#abortStroke();
    const stroke = this.#history.redo();
    if (!stroke) return NO_CHANGE;
    return this.#applyStroke(stroke);
  }

  #applyStroke(stroke: Stroke): MoveOutcome {
    const changed: number[] = [];
    for (const change of stroke) {
      this.#writeCell(change.index, change.to);
      changed.push(change.index);
    }
    this.#refreshCrossouts(changed);
    return { changed, error: false, penaltyMs: 0, completed: this.#evaluateCompletion() };
  }

  /* ---------------------------------------------------------------------- */
  /* Verification and completion                                             */
  /* ---------------------------------------------------------------------- */

  /**
   * Spend one "Verificar" (Casual only, RF-MOD-1) and report which filled cells
   * are currently wrong. Using this forfeits the crown (RF-MOD-4).
   *
   * @returns the wrong cell indices, or `null` when no verification is
   *          available — wrong mode, none left, or the run is not in play.
   */
  check(): number[] | null {
    if (this.mode !== 'casual') return null;
    if (this.#status !== 'playing') return null;
    if (this.checksRemaining <= 0) return null;
    if (!errorCheckingEnabled(this.puzzle.unique !== false)) return null;

    this.#checksUsed++;
    const wrong: number[] = [];
    for (let i = 0; i < this.#cells.length; i++) {
      const value = this.#cells[i]!;
      if (isFilled(value) && colorIndexOf(value) !== this.puzzle.solution[i]!) wrong.push(i);
    }
    return wrong;
  }

  /**
   * The win condition (RF-MOD-5): the set of filled cells matches the solution
   * exactly, in position and in colour. Crosses and dots are ignored entirely —
   * the player never has to tidy the board.
   */
  #evaluateCompletion(): boolean {
    if (this.#status === 'completed') return false;
    const solved =
      this.puzzle.unique === false
        ? this.#satisfiesAllClues()
        : this.#wrongFilled === 0 && this.#correctFilled === this.#targetFilled;
    if (!solved) return false;
    this.#status = 'completed';
    this.#clock.pause(this.#lastTick);
    return true;
  }

  /**
   * Fallback win check for a puzzle published with more than one solution
   * (RF-BIB-6): any arrangement that satisfies every clue counts.
   */
  #satisfiesAllClues(): boolean {
    const { width, height } = this.puzzle;
    const colors = new Uint8Array(this.#cells.length);
    for (let i = 0; i < this.#cells.length; i++) colors[i] = colorIndexOf(this.#cells[i]!);

    for (let y = 0; y < height; y++) {
      if (!sameClueList(cluesForLine(readRow(colors, width, y)), this.puzzle.rowClues[y]!)) {
        return false;
      }
    }
    for (let x = 0; x < width; x++) {
      if (
        !sameClueList(cluesForLine(readColumn(colors, width, height, x)), this.puzzle.colClues[x]!)
      ) {
        return false;
      }
    }
    return true;
  }

  #refreshCrossouts(changedIndices: readonly number[]): void {
    this.#crossouts =
      changedIndices.length === 0
        ? this.#crossouts
        : recomputeCrossoutsFor(this.puzzle, this.#cells, this.#crossouts, changedIndices);
  }

  /** Recompute every line's cross-outs from scratch. */
  refreshAllCrossouts(): void {
    this.#crossouts = computeCrossouts(this.puzzle, this.#cells);
  }

  /* ---------------------------------------------------------------------- */
  /* Persistence                                                             */
  /* ---------------------------------------------------------------------- */

  serialize(now?: number, options?: { includeHistory?: boolean }): GameSnapshot {
    const symbols = fillSymbolsFor(this.puzzle.palette.keys);
    const clock: ClockState = this.#clock.serialize(now);
    const snapshot: GameSnapshot = {
      schema: 'nanonogram.game/1',
      puzzleId: this.puzzle.id,
      mode: this.mode,
      gridRle: encodeGrid(this.#cells, this.puzzle.width, this.puzzle.height, symbols),
      activeMs: clock.activeMs,
      penaltyMs: clock.penaltyMs,
      errors: this.#errors,
      checksUsed: this.#checksUsed,
      // A restored run always comes back paused, behind the veil (RF-TIME-2).
      status: this.#status === 'playing' ? 'paused' : this.#status,
      ...(options?.includeHistory ? { history: this.#history.serialize() } : {}),
    };
    return snapshot;
  }

  /** Rebuild a run from a snapshot. */
  static restore(puzzle: Puzzle, snapshot: GameSnapshot, options?: Partial<GameOptions>): Game {
    if (snapshot.schema !== 'nanonogram.game/1') {
      throw new Error(`unsupported game snapshot schema ${JSON.stringify(snapshot.schema)}`);
    }
    if (snapshot.puzzleId !== puzzle.id) {
      throw new Error(`snapshot is for puzzle ${snapshot.puzzleId}, not ${puzzle.id}`);
    }
    const game = new Game(puzzle, { ...options, mode: snapshot.mode });
    const decoded = decodeGrid(snapshot.gridRle, fillSymbolsFor(puzzle.palette.keys));
    if (decoded.width !== puzzle.width || decoded.height !== puzzle.height) {
      throw new Error(
        `snapshot grid is ${decoded.width}x${decoded.height}, puzzle is ${puzzle.width}x${puzzle.height}`,
      );
    }
    for (let i = 0; i < decoded.cells.length; i++) game.#writeCell(i, decoded.cells[i]!);
    game.#clock = new GameClock({ activeMs: snapshot.activeMs, penaltyMs: snapshot.penaltyMs });
    game.#errors = snapshot.errors;
    game.#checksUsed = snapshot.checksUsed;
    game.#status = snapshot.status === 'playing' ? 'paused' : snapshot.status;
    game.#history = new History(snapshot.history);
    game.refreshAllCrossouts();
    return game;
  }
}

function sameClueList(
  a: readonly { count: number; colorIndex: number }[],
  b: readonly { count: number; colorIndex: number }[],
): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i]!.count !== b[i]!.count || a[i]!.colorIndex !== b[i]!.colorIndex) return false;
  }
  return true;
}
