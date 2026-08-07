/**
 * Near-duplicate detection.
 *
 * Icon sets are full of pairs that differ by a detail the grid throws away —
 * `database-up` and `database-down` reduce to boards that differ in two cells.
 * Filtering by name would not catch them, and shipping both means a player
 * solves the same picture twice and notices.
 *
 * The comparison is on the grids themselves, at equal size, by Hamming
 * distance as a share of the board.
 */

import type { Bitmap } from './bitmap.js';

/** Fraction of cells in which two equally sized grids differ. */
export function gridDistance(a: Bitmap, b: Bitmap): number {
  if (a.width !== b.width || a.height !== b.height) return 1;
  let different = 0;
  for (let i = 0; i < a.data.length; i++) if (a.data[i] !== b.data[i]) different++;
  return a.data.length === 0 ? 0 : different / a.data.length;
}

export interface DedupeCandidate<T> {
  readonly grid: Bitmap;
  readonly value: T;
  /** Higher wins when two candidates collide. */
  readonly score: number;
}

export interface DedupeResult<T> {
  readonly kept: T[];
  /** Each dropped item with the item it duplicated. */
  readonly dropped: { readonly value: T; readonly duplicateOf: T }[];
}

/**
 * Keep one representative per cluster of near-identical grids.
 *
 * Candidates are considered best-first, so the survivor of a collision is the
 * one that scored highest — not whichever happened to come first.
 */
export function dedupe<T>(
  candidates: readonly DedupeCandidate<T>[],
  minDistance = 0.06,
): DedupeResult<T> {
  const ordered = [...candidates].sort((a, b) => b.score - a.score);
  const kept: DedupeCandidate<T>[] = [];
  const dropped: { value: T; duplicateOf: T }[] = [];

  for (const candidate of ordered) {
    const clash = kept.find((k) => gridDistance(k.grid, candidate.grid) < minDistance);
    if (clash) dropped.push({ value: candidate.value, duplicateOf: clash.value });
    else kept.push(candidate);
  }
  return { kept: kept.map((k) => k.value), dropped };
}
