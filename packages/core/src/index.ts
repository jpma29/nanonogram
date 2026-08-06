/**
 * `@nanonogram/core` — the nonogram engine.
 *
 * Pure TypeScript. Zero runtime dependencies. No DOM, no timers, no storage,
 * no randomness: every function here is deterministic given its arguments, and
 * every notion of "now" is passed in by the host.
 *
 * That is not purism. It is what makes the engine testable without a browser,
 * replicable in Go for the server's import validator, and portable to the
 * native Anbernic client in Fase 4 (02-arquitectura §3.1).
 */

export {
  CROSS,
  DOT,
  EMPTY,
  FILLED_BASE,
  MAX_COLORS,
  MAX_DIMENSION,
  MIN_DIMENSION,
  RLE_CROSS,
  RLE_DOT,
  RLE_EMPTY,
  RLE_FILLED_MONO,
  assertDimensions,
  cellIndex,
  colorIndexOf,
  decodeGrid,
  encodeGrid,
  fillSymbolsFor,
  filledCell,
  inBounds,
  isFilled,
} from './grid.js';
export type { CellValue, DecodedGrid, FillSymbols } from './grid.js';

export {
  checkCluesAgainstSolution,
  cluesForLine,
  colorIndexOfKey,
  createPuzzle,
  deriveClues,
  isColorPuzzle,
  monochromePalette,
  normalizePalette,
  readColumn,
  readRow,
  solutionAt,
  solutionFilledCount,
} from './puzzle.js';
export type { Clue, CreatePuzzleInput, Palette, PaletteEntry, Puzzle } from './puzzle.js';

export {
  BACKGROUND_BIT,
  LineEngine,
  analyzeLine,
  colorBit,
  domainSize,
  fullDomain,
  singletonColor,
  solveLine,
} from './linesolver.js';
export type { LineAnalysis } from './linesolver.js';

export {
  computeCrossouts,
  crossoutLine,
  emptyCrossoutState,
  lineDomains,
  recomputeCrossoutsFor,
} from './crossout.js';
export type { CrossoutState } from './crossout.js';

export { GameClock, formatDuration } from './clock.js';
export type { ClockState } from './clock.js';

export {
  DEFAULT_PENALTY_LADDER,
  awardsCrown,
  checksAllowed,
  errorCheckingEnabled,
  penaltyForError,
  qualifiesForRecord,
} from './rules.js';
export type { CrownInput, GameMode } from './rules.js';

export { History, invertStroke } from './history.js';
export type { CellChange, HistoryState, Stroke } from './history.js';

export { Game } from './game.js';
export type { GameOptions, GameSnapshot, GameStatus, MoveOutcome, PaintState } from './game.js';

export { estimateDifficulty, solvePuzzle, verifyPuzzle } from './solver.js';
export type { SolveMetrics, SolveOptions, SolveResult, VerificationResult } from './solver.js';

export {
  PUZZLE_SCHEMA,
  PuzzleFormatError,
  parsePuzzle,
  parsePuzzleJson,
  serializePuzzle,
  stringifyPuzzle,
} from './formats/json.js';
export type { ClueJson, PuzzleJson } from './formats/json.js';
