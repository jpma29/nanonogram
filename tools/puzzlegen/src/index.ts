/**
 * `@nanonogram/puzzlegen` — turn pictures into nonograms.
 *
 * Lives outside `packages/` on purpose: it needs an image decoder, and
 * `@nanonogram/core` is not allowed to depend on anything. This runs at build
 * time, never in the app.
 */

export {
  alignToPixelGrid,
  at,
  cleanup,
  collapseEmptyLines,
  createBitmap,
  detectPixelGrid,
  downsample,
  fromRows,
  inkCount,
  iou,
  neighbours,
  contentBox,
  contentCrop,
  padTo,
  coverage,
  ditherCoverage,
  resample,
  stripIsolatedInk,
  thresholdCoverage,
  squareCrop,
  toRows,
  upscale,
} from './bitmap.js';
export type { Bitmap } from './bitmap.js';

export { sameTopology, topology } from './topology.js';
export type { Topology } from './topology.js';

export {
  MAX_GRID,
  SIZE_LADDER,
  fitGrid,
  nearbySizes,
  snapUpToFive,
  squareCandidate,
} from './fit.js';
export type { FitOptions, FitResult, FitStep } from './fit.js';

export { blankLike, boundaryCells, repairToPureLogic, undecidedCells } from './repair.js';
export type { RepairOptions, RepairResult } from './repair.js';

export { isPlayable, measureQuality, qualityComplaints } from './quality.js';
export type { QualityMetrics, QualityThresholds } from './quality.js';

export { dedupe, gridDistance } from './dedupe.js';
export type { DedupeCandidate, DedupeResult } from './dedupe.js';

export { REFERENCE_SIZE, rasterizeSvg, rasterizeSvgFile } from './raster.js';

export { generateFrom } from './pipeline.js';
export type {
  GenerateOptions,
  GenerateOutcome,
  GeneratedPuzzle,
  RejectedPuzzle,
  SourceAttribution,
} from './pipeline.js';
