/**
 * The game clock (RF-TIME-1, RF-TIME-2, RF-TIME-3).
 *
 * Two properties matter and both are structural, not incidental:
 *
 *  - **Monotonic.** Every reading comes from a caller-supplied tick, which the
 *    host takes from `performance.now()`. Wall-clock time never enters, so
 *    changing the device clock or crossing a DST boundary mid-puzzle cannot
 *    move a record. The clock also refuses to go backwards: a tick earlier than
 *    the last one contributes zero, rather than negative time.
 *
 *  - **Only counts active play.** The clock is paused whenever the player is
 *    not looking at the board — menu, background, locked screen, hidden tab.
 *    The board is veiled while paused (RF-TIME-2), which is what stops pausing
 *    from being free thinking time.
 *
 * Penalties (Hardcore, RF-MOD-2) are held separately from active time so the
 * completion screen can show `14:32 (+2:30 por errores)` (RF-TIME-3).
 */

/** Serialisable clock state. Persisted with the rest of the game. */
export interface ClockState {
  /** Active milliseconds accumulated so far, excluding pauses. */
  readonly activeMs: number;
  /** Milliseconds added by error penalties. */
  readonly penaltyMs: number;
}

export class GameClock {
  #activeMs: number;
  #penaltyMs: number;
  /** Monotonic tick at which the current run began, or null while paused. */
  #runningSince: number | null = null;

  constructor(state?: Partial<ClockState>) {
    this.#activeMs = state?.activeMs ?? 0;
    this.#penaltyMs = state?.penaltyMs ?? 0;
    if (this.#activeMs < 0 || this.#penaltyMs < 0) {
      throw new RangeError('clock state cannot be negative');
    }
  }

  /** True while active time is accruing. */
  get running(): boolean {
    return this.#runningSince !== null;
  }

  /** Begin or resume accruing active time. A no-op when already running. */
  resume(now: number): void {
    if (this.#runningSince !== null) return;
    this.#runningSince = now;
  }

  /**
   * Stop accruing active time and fold the current run into the accumulator.
   * A no-op when already paused, so a `visibilitychange` racing a menu open
   * cannot double-count.
   */
  pause(now: number): void {
    if (this.#runningSince === null) return;
    this.#activeMs += Math.max(0, now - this.#runningSince);
    this.#runningSince = null;
  }

  /** Active milliseconds, including the run in progress. */
  activeMs(now?: number): number {
    if (this.#runningSince === null || now === undefined) return this.#activeMs;
    return this.#activeMs + Math.max(0, now - this.#runningSince);
  }

  get penaltyMs(): number {
    return this.#penaltyMs;
  }

  /** Add an error penalty. */
  addPenalty(ms: number): void {
    if (!Number.isFinite(ms) || ms < 0) throw new RangeError(`invalid penalty: ${ms}`);
    this.#penaltyMs += ms;
  }

  /** What the player sees: active time plus penalties. */
  totalMs(now?: number): number {
    return this.activeMs(now) + this.#penaltyMs;
  }

  /** Reset to zero and pause (RF-GRID-6). */
  reset(): void {
    this.#activeMs = 0;
    this.#penaltyMs = 0;
    this.#runningSince = null;
  }

  /**
   * Snapshot for persistence. Folds any run in progress into the accumulator so
   * that a snapshot taken mid-play is never behind (RF-TIME-1: "al reanudar
   * tras un periodo largo se persiste el acumulado antes de seguir").
   */
  serialize(now?: number): ClockState {
    return { activeMs: this.activeMs(now), penaltyMs: this.#penaltyMs };
  }
}

/** Format milliseconds as `M:SS` or `H:MM:SS`. */
export function formatDuration(ms: number): string {
  const totalSeconds = Math.floor(Math.max(0, ms) / 1000);
  const seconds = totalSeconds % 60;
  const minutes = Math.floor(totalSeconds / 60) % 60;
  const hours = Math.floor(totalSeconds / 3600);
  const ss = String(seconds).padStart(2, '0');
  if (hours > 0) return `${hours}:${String(minutes).padStart(2, '0')}:${ss}`;
  return `${minutes}:${ss}`;
}
