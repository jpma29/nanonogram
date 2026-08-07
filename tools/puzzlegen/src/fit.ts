/**
 * Choosing the grid.
 *
 * The size is not a knob to be set; it is a property of the picture. Two ways
 * to get it wrong, and both are miserable to play:
 *
 *  - **Too small.** You solve the whole thing and cannot tell what it is. The
 *    reward the game is built around simply does not arrive.
 *  - **Too big.** You work through a 30x30 to reveal a circle. The effort and
 *    the payoff do not match.
 *
 * So the question is not "how complex is this image" but "what is the smallest
 * grid on which it is still itself". That is measurable: reduce the image, blow
 * it back up, and compare against the original — on overlap *and* on topology,
 * because a shape can keep its silhouette while losing the hole that made it
 * recognisable. Taking the *smallest* size that passes rules out the second
 * failure.
 *
 * ## Two kinds of picture, two rules
 *
 * **Already at grid resolution** — a sprite whose author placed every cell by
 * hand, small enough to play as it stands. It is never resampled: each side is
 * padded out to the next multiple of five and the picture is centred. This is
 * the only case that produces a rectangular board, because the sprite's own
 * proportions are the picture.
 *
 * **Everything else** — a vector, rendered large, that has to be reduced. These
 * get a **square** grid from the ladder, with the picture centred inside it.
 * The padding falls out of the process rather than being chosen.
 *
 * ## Why multiples of five
 *
 * The board draws a heavier rule every five cells (RF-AYU-4). A grid of 16
 * leaves that rule with a ragged one-cell remainder; a multiple of five lands
 * exactly on it. The granularity lost in the fit is repaid every time the
 * player counts.
 *
 * Fidelity is **not monotone** in size — a picture can score worse at 25 than at
 * 20 if its structure happens to align with one grid and not the other — so
 * every rung is evaluated rather than assuming that failing at one size implies
 * failing at all smaller ones.
 */

import {
  type Bitmap,
  cleanup,
  contentBox,
  contentCrop,
  coverage,
  ditherCoverage,
  iou as bitmapIou,
  inkCount,
  padTo,
  thresholdCoverage,
  upscale,
} from './bitmap.js';
import { type Topology, sameTopology, topology } from './topology.js';

/** Candidate sizes, in cells. Multiples of five so the every-5 rule lands flush. */
export const SIZE_LADDER: readonly number[] = [5, 10, 15, 20, 25, 30, 35];

/** Largest board the game will generate. */
export const MAX_GRID = 35;

export interface FitOptions {
  /** Square sizes to try. Defaults to {@link SIZE_LADDER}. */
  readonly sizes?: readonly number[];
  readonly minSize?: number;
  readonly maxSize?: number;
  /** Overlap with the reference that counts as "still the same picture". */
  readonly minIou?: number;
  /** Binarisation threshold, when not dithering. */
  readonly threshold?: number;
  /** Diffuse the error instead of cutting at the threshold. */
  readonly dither?: boolean;
  /** Rounds of salt-and-pepper removal. */
  readonly cleanupRounds?: number;
  /**
   * Force the native path on or off. By default a picture is treated as native
   * when it already fits within {@link MAX_GRID} on both sides — nothing that
   * small came out of a renderer by accident.
   */
  readonly nativeResolution?: boolean;
}

export interface FitStep {
  readonly width: number;
  readonly height: number;
  readonly iou: number;
  readonly topology: Topology;
}

export interface FitResult {
  readonly grid: Bitmap | null;
  /** Longer side of the chosen grid. */
  readonly size: number | null;
  readonly width: number | null;
  readonly height: number | null;
  readonly iou: number;
  readonly topology: Topology | null;
  readonly referenceTopology: Topology;
  /** True when the picture was used as it stands and merely padded. */
  readonly native: boolean;
  readonly trace: readonly FitStep[];
  readonly rejectReason: string | null;
}

const DEFAULTS = {
  minIou: 0.9,
  threshold: 0.5,
  dither: false,
  cleanupRounds: 2,
} as const;

/**
 * The reference topology comes from a moderately reduced copy, not the
 * full-resolution render: at 256px, antialiasing artefacts and single-pixel
 * nicks invent holes and pieces that no human would count.
 */
const REFERENCE_TOPOLOGY_SIDE = 64;

/** Round up to the next multiple of five, with five as the floor. */
export function snapUpToFive(value: number): number {
  return Math.max(5, Math.ceil(value / 5) * 5);
}

/** Binarise a coverage map, by threshold or by error diffusion. */
function binarise(
  source: Bitmap,
  width: number,
  height: number,
  threshold: number,
  dither: boolean,
): Bitmap {
  const cov = coverage(source, width, height);
  return dither
    ? ditherCoverage(cov, width, height)
    : thresholdCoverage(cov, width, height, threshold);
}

/**
 * Reduce a picture into a square grid of `side` cells, preserving its
 * proportions and centring what is left over.
 */
export function squareCandidate(
  content: Bitmap,
  side: number,
  threshold: number,
  dither: boolean,
  cleanupRounds: number,
): Bitmap {
  const scale = Math.min(side / content.width, side / content.height);
  const innerWidth = Math.max(1, Math.min(side, Math.round(content.width * scale)));
  const innerHeight = Math.max(1, Math.min(side, Math.round(content.height * scale)));
  const scaled = binarise(content, innerWidth, innerHeight, threshold, dither);
  return cleanup(padTo(scaled, side, side), cleanupRounds);
}

/** Find the grid for a reference bitmap. */
export function fitGrid(reference: Bitmap, options: FitOptions = {}): FitResult {
  const { minIou, threshold, dither, cleanupRounds } = { ...DEFAULTS, ...options };
  const ladder = (options.sizes ?? SIZE_LADDER)
    .filter((s) => s >= (options.minSize ?? 0) && s <= (options.maxSize ?? MAX_GRID))
    .slice()
    .sort((a, b) => a - b);

  const box = contentBox(reference);
  const content = contentCrop(reference);
  const referenceTopology = topology(
    binarise(content, REFERENCE_TOPOLOGY_SIDE, REFERENCE_TOPOLOGY_SIDE, threshold, false),
  );
  const trace: FitStep[] = [];

  const native =
    options.nativeResolution ??
    (box !== null && content.width <= MAX_GRID && content.height <= MAX_GRID);

  /* --- Already at grid resolution: pad, never resample. ----------------- */
  if (native && box) {
    // Rectangular is correct here and only here: the sprite's proportions are
    // the picture, and resampling would destroy cells its author placed by hand.
    const grid = padTo(content, snapUpToFive(content.width), snapUpToFive(content.height));
    const shape = topology(grid);
    trace.push({ width: grid.width, height: grid.height, iou: 1, topology: shape });
    return {
      grid,
      size: Math.max(grid.width, grid.height),
      width: grid.width,
      height: grid.height,
      // The picture is reproduced exactly, so fidelity is not in question.
      iou: 1,
      topology: shape,
      referenceTopology: shape,
      native: true,
      trace,
      rejectReason: null,
    };
  }

  /* --- Needs reducing: square grids off the ladder. ---------------------- */
  for (const side of ladder) {
    const grid = squareCandidate(content, side, threshold, dither, cleanupRounds);
    const ink = inkCount(grid);
    if (ink === 0 || ink === side * side) {
      trace.push({ width: side, height: side, iou: 0, topology: { pieces: 0, holes: 0 } });
      continue;
    }
    const shape = topology(grid);
    // Compare like with like: the candidate is padded to a square, so the
    // reference it is measured against is padded to the same proportions.
    const scale = Math.min(side / content.width, side / content.height);
    const innerWidth = Math.max(1, Math.min(side, Math.round(content.width * scale)));
    const innerHeight = Math.max(1, Math.min(side, Math.round(content.height * scale)));
    const paddedReference = padTo(
      content,
      Math.round((content.width * side) / innerWidth),
      Math.round((content.height * side) / innerHeight),
    );
    const overlap = bitmapIou(
      upscale(grid, paddedReference.width, paddedReference.height),
      paddedReference,
    );
    trace.push({ width: side, height: side, iou: overlap, topology: shape });

    if (overlap >= minIou && sameTopology(shape, referenceTopology)) {
      return {
        grid,
        size: side,
        width: side,
        height: side,
        iou: overlap,
        topology: shape,
        referenceTopology,
        native: false,
        trace,
        rejectReason: null,
      };
    }
  }

  const best = trace.reduce<FitStep | null>(
    (acc, step) => (acc === null || step.iou > acc.iou ? step : acc),
    null,
  );
  const topologyEverMatched = trace.some((s) => sameTopology(s.topology, referenceTopology));
  const largest = ladder.length > 0 ? ladder[ladder.length - 1] : 0;
  return {
    grid: null,
    size: null,
    width: null,
    height: null,
    iou: best?.iou ?? 0,
    topology: null,
    referenceTopology,
    native: false,
    trace,
    rejectReason: topologyEverMatched
      ? `too detailed: best overlap ${(best?.iou ?? 0).toFixed(3)} at ` +
        `${best?.width ?? 0} cells, below ${minIou}`
      : `structure does not survive: reference has ${referenceTopology.pieces} piece(s) and ` +
        `${referenceTopology.holes} hole(s), which no grid up to ${largest} cells reproduces`,
  };
}

/**
 * Rungs worth trying beyond the one that fitted. A native sprite has exactly
 * one grid, so there is nothing to offer.
 */
export function nearbySizes(
  fit: FitResult,
  extra = 1,
  sizes: readonly number[] = SIZE_LADDER,
): number[] {
  if (fit.size === null) return [];
  if (fit.native) return [fit.size];
  const ladder = [...sizes].sort((a, b) => a - b);
  const start = ladder.indexOf(fit.size);
  if (start < 0) return [fit.size];
  return ladder.slice(start, start + 1 + extra);
}
