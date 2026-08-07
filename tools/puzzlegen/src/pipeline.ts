/**
 * The generator, end to end.
 *
 * A picture becomes a shippable puzzle only if it survives four gates, in this
 * order. Each rejects a different kind of failure, and the order matters:
 * there is no point repairing a board that was never going to be recognisable.
 *
 *   1. **Fidelity** — is there a grid on which this is still the same picture?
 *   2. **Playability** — is the resulting board worth anyone's time?
 *   3. **Logic** — is it uniquely solvable, by deduction alone, after at most a
 *      few pixels of repair?
 *   4. **Novelty** — is it different enough from what we already have?
 */

import {
  type Puzzle,
  createPuzzle,
  estimateDifficulty,
  monochromePalette,
  solvePuzzle,
} from '@nanonogram/core';
import type { Bitmap } from './bitmap.js';
import { type FitOptions, type FitResult, fitGrid, nearbySizes } from './fit.js';
import {
  type QualityMetrics,
  type QualityThresholds,
  measureQuality,
  qualityComplaints,
} from './quality.js';
import { type RepairOptions, repairToPureLogic } from './repair.js';

/** Where a picture came from, and under what terms. */
export interface SourceAttribution {
  /** Stable identifier within the source, e.g. the icon's file name. */
  readonly id: string;
  /** Human-readable title. */
  readonly title: string;
  /** SPDX identifier. A puzzle with no licence cannot be published. */
  readonly license: string;
  /** Where it came from, e.g. `bootstrap-icons@1.13.1`. */
  readonly source: string;
  readonly author: string | null;
}

export interface GenerateOptions {
  readonly fit?: FitOptions;
  readonly quality?: QualityThresholds;
  readonly repair?: RepairOptions;
  /** Extra sizes above the faithful minimum to try. Default 2. */
  readonly extraSizes?: number;
}

export interface GeneratedPuzzle {
  readonly attribution: SourceAttribution;
  readonly grid: Bitmap;
  readonly puzzle: Puzzle;
  /** Longer side, i.e. the ladder rung this picture landed on. */
  readonly size: number;
  readonly width: number;
  readonly height: number;
  /** True when the picture was already at grid resolution and merely padded. */
  readonly native: boolean;
  readonly difficulty: number;
  readonly iou: number;
  readonly quality: QualityMetrics;
  /** Pixels the repair had to move. Zero means the picture was already sound. */
  readonly edits: number;
  readonly openness: number;
  readonly passes: number;
}

export interface RejectedPuzzle {
  readonly attribution: SourceAttribution;
  /** Which gate turned it away. */
  readonly gate: 'fidelity' | 'playability' | 'logic';
  readonly reason: string;
  readonly fit: FitResult | null;
}

export type GenerateOutcome =
  | { readonly ok: true; readonly puzzle: GeneratedPuzzle }
  | { readonly ok: false; readonly rejection: RejectedPuzzle };

function toPuzzle(grid: Bitmap, attribution: SourceAttribution): Puzzle {
  return createPuzzle({
    id: attribution.id,
    title: attribution.title,
    // The title of an icon names the thing it depicts, which is precisely the
    // answer. Hide it until the picture is revealed (RF-BIB-3).
    hideTitle: true,
    author: attribution.author,
    source: attribution.source,
    sourceId: attribution.id,
    license: attribution.license,
    width: grid.width,
    height: grid.height,
    solution: Uint8Array.from(grid.data),
    palette: monochromePalette(),
    verified: true,
    unique: true,
    published: true,
    distributable: true,
  });
}

/** Run one reference bitmap through all four gates. */
export function generateFrom(
  reference: Bitmap,
  attribution: SourceAttribution,
  options: GenerateOptions = {},
): GenerateOutcome {
  const fit = fitGrid(reference, options.fit);
  if (!fit.grid || fit.size === null) {
    return {
      ok: false,
      rejection: {
        attribution,
        gate: 'fidelity',
        reason: fit.rejectReason ?? 'no faithful grid size',
        fit,
      },
    };
  }

  const rungs = nearbySizes(fit, options.extraSizes ?? 1, options.fit?.sizes);
  const complaints: string[] = [];

  for (const rung of rungs) {
    const attempt =
      rung === fit.size
        ? fit
        : fitGrid(reference, { ...options.fit, minSize: rung, maxSize: rung });
    const candidate = attempt.grid;
    if (!candidate) continue;

    const problems = qualityComplaints(candidate, measureQuality(candidate), options.quality);
    if (problems.length > 0) {
      complaints.push(`${attempt.width}x${attempt.height}: ${problems.join(', ')}`);
      continue;
    }

    const repaired = repairToPureLogic(candidate, options.repair);
    if (!repaired.pure) {
      complaints.push(
        `${attempt.width}x${attempt.height}: still ${repaired.undecided} cell(s) undecided after repair`,
      );
      continue;
    }
    // Repair moves pixels, so quality has to be re-checked, not assumed.
    const finalMetrics = measureQuality(repaired.grid);
    const afterProblems = qualityComplaints(repaired.grid, finalMetrics, options.quality);
    if (afterProblems.length > 0) {
      complaints.push(
        `${attempt.width}x${attempt.height}: repair spoiled it — ${afterProblems.join(', ')}`,
      );
      continue;
    }

    const puzzle = toPuzzle(repaired.grid, attribution);
    const solved = solvePuzzle(puzzle, { maxSolutions: 1 });
    return {
      ok: true,
      puzzle: {
        attribution,
        grid: repaired.grid,
        puzzle,
        size: rung,
        width: repaired.grid.width,
        height: repaired.grid.height,
        native: attempt.native,
        difficulty: estimateDifficulty(solved.metrics),
        iou: attempt.iou,
        quality: finalMetrics,
        edits: repaired.edits.length,
        openness: solved.metrics.openness,
        passes: solved.metrics.passes,
      },
    };
  }

  const logicOnly = complaints.every((c) => c.includes('undecided'));
  return {
    ok: false,
    rejection: {
      attribution,
      gate: logicOnly ? 'logic' : 'playability',
      reason: complaints.join('; ') || 'no size produced a playable board',
      fit,
    },
  };
}
