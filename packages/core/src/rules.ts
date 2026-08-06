/**
 * The rules that decide what an error costs and what a run is worth.
 *
 * Everything here is pure arithmetic over a handful of counters, deliberately
 * kept away from `game.ts` so the policy is readable in one screen and testable
 * without constructing a puzzle.
 */

/** Which mode a run is played in (RF-MOD-1, RF-MOD-2). */
export type GameMode = 'casual' | 'hardcore';

/**
 * Time penalties for successive Hardcore errors, in milliseconds
 * (RF-MOD-2). Configurable per instance as `penalty_ladder`; this is the
 * default, taken from Picross DS. The last rung repeats forever.
 */
export const DEFAULT_PENALTY_LADDER: readonly number[] = [
  30_000, // 1st  +00:30
  60_000, // 2nd  +01:00
  120_000, // 3rd  +02:00
  240_000, // 4th  +04:00
  480_000, // 5th and beyond  +08:00
];

/**
 * Penalty for the `n`-th error of a run (1-based). Beyond the end of the
 * ladder, the last rung repeats.
 */
export function penaltyForError(
  errorNumber: number,
  ladder: readonly number[] = DEFAULT_PENALTY_LADDER,
): number {
  if (!Number.isInteger(errorNumber) || errorNumber < 1) {
    throw new RangeError(`error number must be a positive integer, got ${errorNumber}`);
  }
  if (ladder.length === 0) return 0;
  return ladder[Math.min(errorNumber, ladder.length) - 1]!;
}

/**
 * How many "Verificar" uses a Casual run gets, by grid size (RF-MOD-1).
 *
 *   <= 10x10  -> 1     16..20 -> 3     > 25 -> 5
 *   11..15    -> 2     21..25 -> 4
 */
export function checksAllowed(width: number, height: number): number {
  const longest = Math.max(width, height);
  const raw = Math.ceil(longest / 5) - 1;
  return Math.min(5, Math.max(1, raw));
}

/** Everything the crown decision depends on (RF-MOD-4). */
export interface CrownInput {
  /** Errors recorded during the run. In Casual these are counted silently. */
  readonly errors: number;
  /** "Verificar" uses consumed. Always 0 in Hardcore, which has no such button. */
  readonly checksUsed: number;
  /**
   * Whether the puzzle is known to have a unique solution. A puzzle published
   * with `unique = false` cannot award a crown or a record (RF-BIB-6).
   */
  readonly uniqueSolution: boolean;
}

/**
 * A crown is awarded for finishing without a single error and without spending
 * a verification — in either mode.
 *
 * Note what this deliberately does *not* do: correcting a mistake does not undo
 * it. The crown rewards not being wrong, not recovering from being wrong, which
 * is what makes it mean the same thing in Casual as in Hardcore (RF-MOD-1).
 */
export function awardsCrown(input: CrownInput): boolean {
  return input.uniqueSolution && input.errors === 0 && input.checksUsed === 0;
}

/**
 * Only Hardcore runs on a uniquely-solvable puzzle set a best time
 * (RF-MOD-2, RF-BIB-6, RF-STAT-1).
 */
export function qualifiesForRecord(mode: GameMode, uniqueSolution: boolean): boolean {
  return mode === 'hardcore' && uniqueSolution;
}

/**
 * Whether error checking runs at all. A published puzzle with more than one
 * solution has it disabled in both modes: there is no single truth to check
 * against (RF-BIB-6).
 */
export function errorCheckingEnabled(uniqueSolution: boolean): boolean {
  return uniqueSolution;
}
