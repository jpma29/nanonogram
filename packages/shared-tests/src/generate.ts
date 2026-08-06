/**
 * Corpus generator.
 *
 * Two kinds of case go into the corpus. The hand-written ones encode a rule
 * somebody decided on purpose — they are the semantic anchor, and each carries a
 * label naming the requirement it protects. The generated ones are bulk
 * agreement checks: they pin the current behaviour on inputs nobody thought
 * about, so the Go implementation cannot quietly differ on an edge case.
 *
 * Deterministic: same seed, same corpus.
 */

import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  CROSS,
  type Clue,
  LineEngine,
  analyzeLine,
  awardsCrown,
  checksAllowed,
  createPuzzle,
  crossoutLine,
  deriveClues,
  filledCell,
  lineDomains,
  monochromePalette,
  penaltyForError,
  serializePuzzle,
  solvePuzzle,
  verifyPuzzle,
} from '@nanonogram/core';

import { formatLine, fromEngineClues, parseLine, toEngineClues } from './notation.js';
import type { CorpusFile, CrossoutCase, LineSolveCase, PuzzleCase, RuleCase } from './types.js';

const CASES_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'cases');

/** mulberry32 — small, fast, and identical in any language. */
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const clues = (...counts: number[]): Clue[] => counts.map((count) => ({ count, colorIndex: 1 }));

/* -------------------------------------------------------------------------- */
/* line-solve                                                                   */
/* -------------------------------------------------------------------------- */

function lineSolveCase(
  id: string,
  label: string,
  clueList: Clue[],
  cellsNotation: string,
  colors = 2,
): LineSolveCase {
  const cells = parseLine(cellsNotation);
  const analysis = analyzeLine(clueList, lineDomains(cells, colors), colors);
  return {
    id,
    label,
    colors,
    clues: fromEngineClues(clueList),
    cells: cellsNotation,
    expect: analysis.feasible
      ? {
          feasible: true,
          domains: [...analysis.domains],
          startCount: [...analysis.startCount],
          firstStart: [...analysis.firstStart],
        }
      : { feasible: false },
  };
}

function handwrittenLineSolve(): LineSolveCase[] {
  const c = (label: string, clueList: Clue[], cells: string, colors = 2) =>
    lineSolveCase('', label, clueList, cells, colors);
  return [
    c('an empty clue list forces the whole line to background', clues(), '.....'),
    c('a clue spanning the line fills it', clues(5), '.....'),
    c('the classic overlap: 4 in 5 forces the middle three', clues(4), '.....'),
    c('a loose 1 in 5 deduces nothing', clues(1), '.....'),
    c('two 3s in 7 leave no slack at all', clues(3, 3), '.......'),
    c('two 3s in 9 force only the middle of each block', clues(3, 3), '.........'),
    c('same-colour clues need a separating gap', clues(1, 1), '...'),
    c('a cross at the edge shifts the only placement', clues(4), '-....'),
    c('one filled cell propagates the whole block', clues(3), '1....'),
    c('a dot constrains nothing', clues(3), '?????'),
    c('a fully crossed line cannot hold a clue', clues(3), '-----'),
    c('a clue longer than the line is infeasible', clues(6), '.....'),
    c('blocks the player drew that contradict the clues are infeasible', clues(2, 2), '1-1-1'),
    c('a solved line stays solved', clues(2, 1), '11-1-'),
    c('a 1x1 line with a 1-clue', clues(1), '.'),
    c('a 1x1 line with no clue', clues(), '.'),
    c('crosses in the middle split the line into two halves', clues(2, 2), '..---..'),
    c('a long line with a single small clue', clues(2), '..............'),
    c(
      'adjacent different colours need no gap',
      toEngineClues([
        { count: 2, color: 1 },
        { count: 2, color: 2 },
      ]),
      '....',
      3,
    ),
    c(
      'same colour twice still needs a gap, even in a colour puzzle',
      toEngineClues([
        { count: 2, color: 1 },
        { count: 2, color: 1 },
      ]),
      '.....',
      3,
    ),
    c(
      'a colour line partially drawn',
      toEngineClues([
        { count: 1, color: 1 },
        { count: 1, color: 2 },
        { count: 1, color: 1 },
      ]),
      '.2.',
      3,
    ),
    c(
      'three colours in a row',
      toEngineClues([
        { count: 1, color: 1 },
        { count: 1, color: 2 },
        { count: 1, color: 3 },
      ]),
      '...',
      4,
    ),
  ];
}

function generatedLineSolve(count: number, seed: number): LineSolveCase[] {
  const random = rng(seed);
  const out: LineSolveCase[] = [];
  for (let i = 0; i < count; i++) {
    const colors = random() < 0.25 ? 3 : 2;
    const n = 3 + Math.floor(random() * 13);
    // Build a truth line, derive its clues, then hide most of it.
    const truth = new Uint8Array(n);
    for (let x = 0; x < n; x++) {
      truth[x] = random() < 0.45 ? 1 + Math.floor(random() * (colors - 1)) : 0;
    }
    const clueList = deriveClues(truth, n, 1).rows[0]!;
    const cells = new Array<number>(n).fill(0);
    for (let x = 0; x < n; x++) {
      const roll = random();
      if (roll < 0.25) cells[x] = truth[x] === 0 ? CROSS : filledCell(truth[x]!);
      else if (roll < 0.3)
        cells[x] = 2; // a dot
      else if (roll < 0.34) {
        // Deliberately introduce a wrong mark, so infeasible lines are covered.
        cells[x] = truth[x] === 0 ? filledCell(1) : CROSS;
      }
    }
    out.push(
      lineSolveCase(
        '',
        `generated line ${i}: ${n} cells, ${colors} colours`,
        clueList,
        formatLine(cells),
        colors,
      ),
    );
  }
  return out;
}

/* -------------------------------------------------------------------------- */
/* crossout                                                                     */
/* -------------------------------------------------------------------------- */

function crossoutCase(
  label: string,
  clueList: Clue[],
  cellsNotation: string,
  colors = 2,
): CrossoutCase {
  return {
    id: '',
    label,
    colors,
    clues: fromEngineClues(clueList),
    cells: cellsNotation,
    expect: crossoutLine(clueList, parseLine(cellsNotation), colors),
  };
}

function handwrittenCrossout(): CrossoutCase[] {
  return [
    crossoutCase('a block closed by the border and a cross is crossed out', clues(2), '11---'),
    crossoutCase('a block closed by crosses on both sides is crossed out', clues(2), '-11--'),
    crossoutCase('two clues each pinned to their own closed block', clues(2, 1), '-11-1-'),
    crossoutCase(
      'RF-AYU-2 critical case: a closed block that could be either of two equal clues stays quiet',
      clues(1, 1),
      '..-1-..',
    ),
    crossoutCase('the same ambiguity with blocks of two', clues(2, 2), '..-11-....'),
    crossoutCase('ruling out the alternative resolves the ambiguity', clues(1, 1), '---1-..'),
    crossoutCase('a pinned but open-ended block is not crossed out', clues(3), '111..'),
    crossoutCase('an open left edge is enough to stay quiet', clues(2), '.11--'),
    crossoutCase('a dot does not close a block', clues(1), '-1?--'),
    crossoutCase('a cross does close it', clues(1), '-1---'),
    crossoutCase('nothing is crossed out on a contradictory line', clues(2), '11111'),
    crossoutCase('nothing is crossed out on a doubly contradictory line', clues(2, 2), '11-11-11'),
    crossoutCase('an untouched line crosses out nothing', clues(3), '.....'),
    crossoutCase('an empty clue list yields an empty result', clues(), '-----'),
    crossoutCase('a clue filling the whole line is crossed out', clues(5), '11111'),
    crossoutCase('a completed line crosses everything out', clues(2, 1), '11-1-'),
    crossoutCase('a middle clue pinned between two ambiguous ones', clues(1, 3, 1), '.-111-.'),
    crossoutCase(
      'adjacent colours close each other',
      toEngineClues([
        { count: 2, color: 1 },
        { count: 2, color: 2 },
      ]),
      '1122',
      3,
    ),
    crossoutCase(
      'a block drawn in the wrong colour is not crossed out',
      toEngineClues([{ count: 2, color: 1 }]),
      '-22-',
      3,
    ),
    crossoutCase(
      'a colour block closed by crosses',
      toEngineClues([{ count: 1, color: 2 }]),
      '-2--',
      3,
    ),
  ];
}

function generatedCrossout(count: number, seed: number): CrossoutCase[] {
  const random = rng(seed);
  const engine = new LineEngine();
  const out: CrossoutCase[] = [];
  for (let i = 0; i < count; i++) {
    const colors = random() < 0.2 ? 3 : 2;
    const n = 4 + Math.floor(random() * 11);
    const truth = new Uint8Array(n);
    for (let x = 0; x < n; x++) {
      truth[x] = random() < 0.45 ? 1 + Math.floor(random() * (colors - 1)) : 0;
    }
    const clueList = deriveClues(truth, n, 1).rows[0]!;
    // Simulate a player part-way through: reveal a prefix-ish random subset.
    const cells = new Array<number>(n).fill(0);
    for (let x = 0; x < n; x++) {
      const roll = random();
      if (roll < 0.55) cells[x] = truth[x] === 0 ? CROSS : filledCell(truth[x]!);
      else if (roll < 0.62)
        cells[x] = 2; // dot
      else if (roll < 0.66) cells[x] = truth[x] === 0 ? filledCell(1) : CROSS; // mistake
    }
    const notation = formatLine(cells);
    out.push({
      id: '',
      label: `generated crossout ${i}: ${n} cells, ${colors} colours`,
      colors,
      clues: fromEngineClues(clueList),
      cells: notation,
      expect: crossoutLine(clueList, parseLine(notation), colors, engine),
    });
  }
  return out;
}

/* -------------------------------------------------------------------------- */
/* rules                                                                        */
/* -------------------------------------------------------------------------- */

function ruleCases(): RuleCase[] {
  const out: RuleCase[] = [];
  for (const n of [1, 2, 3, 4, 5, 6, 12, 100]) {
    out.push({
      id: '',
      label: `RF-MOD-2: penalty for error ${n} on the default ladder`,
      kind: 'penalty',
      errorNumber: n,
      expect: penaltyForError(n),
    });
  }
  out.push({
    id: '',
    label: 'RF-MOD-2: a custom ladder still repeats its last rung',
    kind: 'penalty',
    errorNumber: 5,
    ladder: [1000, 2000],
    expect: penaltyForError(5, [1000, 2000]),
  });

  const sizes: [number, number][] = [
    [1, 1],
    [5, 5],
    [10, 10],
    [11, 11],
    [15, 15],
    [16, 16],
    [20, 20],
    [21, 21],
    [25, 25],
    [26, 26],
    [30, 30],
    [50, 50],
    [100, 100],
    [5, 40],
    [40, 5],
  ];
  for (const [w, h] of sizes) {
    out.push({
      id: '',
      label: `RF-MOD-1: verifications allowed on ${w}x${h}`,
      kind: 'checks',
      width: w,
      height: h,
      expect: checksAllowed(w, h),
    });
  }

  for (const errors of [0, 1, 3]) {
    for (const checksUsed of [0, 1]) {
      for (const uniqueSolution of [true, false]) {
        out.push({
          id: '',
          label: `RF-MOD-4: crown with ${errors} errors, ${checksUsed} checks, unique=${uniqueSolution}`,
          kind: 'crown',
          errors,
          checksUsed,
          uniqueSolution,
          expect: awardsCrown({ errors, checksUsed, uniqueSolution }),
        });
      }
    }
  }
  return out;
}

/* -------------------------------------------------------------------------- */
/* puzzles                                                                      */
/* -------------------------------------------------------------------------- */

function puzzleCase(id: string, label: string, rows: string[]): PuzzleCase {
  const height = rows.length;
  const width = rows[0]!.length;
  const solution = new Uint8Array(width * height);
  rows.forEach((row, y) => {
    for (let x = 0; x < width; x++) solution[y * width + x] = row[x] === '#' ? 1 : 0;
  });
  const puzzle = createPuzzle({
    id,
    title: label,
    width,
    height,
    solution,
    palette: monochromePalette(),
    license: 'CC0-1.0',
    source: 'nanonogram/shared-tests',
    sourceId: id,
  });
  const solved = solvePuzzle(puzzle);
  const verification = verifyPuzzle(puzzle);
  return {
    id,
    label,
    puzzle: serializePuzzle(puzzle),
    expect: {
      solutionCount: solved.solutions.length,
      unique: solved.unique,
      verified: verification.verified,
      difficulty: verification.difficulty,
      rejectReason: verification.rejectReason,
    },
  };
}

function handwrittenPuzzles(): PuzzleCase[] {
  return [
    puzzleCase('PZ0001', 'a 1x1 filled cell', ['#']),
    puzzleCase('PZ0002', 'a 1x1 empty cell', ['.']),
    puzzleCase('PZ0003', 'an entirely empty 4x4', ['....', '....', '....', '....']),
    puzzleCase('PZ0004', 'an entirely filled 4x4', ['####', '####', '####', '####']),
    puzzleCase('PZ0005', 'a plus sign, line-solvable', ['.#.', '###', '.#.']),
    puzzleCase('PZ0006', 'the classic ambiguous diagonal pair', ['#.', '.#']),
    puzzleCase('PZ0007', 'a heart', ['.#.#.', '#####', '#####', '.###.', '..#..']),
    puzzleCase('PZ0008', 'a frame', ['#####', '#...#', '#...#', '#...#', '#####']),
    puzzleCase('PZ0009', 'a checkerboard, deeply ambiguous at small size', ['#.#', '.#.', '#.#']),
    puzzleCase('PZ0010', 'an arrow', ['..#..', '.###.', '#####', '..#..', '..#..']),
    puzzleCase('PZ0011', 'a diagonal line', ['#....', '.#...', '..#..', '...#.', '....#']),
    puzzleCase('PZ0012', 'a 10x10 spiral', [
      '##########',
      '#........#',
      '#.######.#',
      '#.#....#.#',
      '#.#.##.#.#',
      '#.#..#.#.#',
      '#.####.#.#',
      '#......#.#',
      '########.#',
      '..........',
    ]),
    puzzleCase('PZ0013', 'a 8x8 with sparse clues', [
      '#......#',
      '........',
      '..#..#..',
      '........',
      '........',
      '..#..#..',
      '........',
      '#......#',
    ]),
    puzzleCase('PZ0014', 'a single long row', ['##########']),
    puzzleCase('PZ0015', 'a single long column', ['#', '#', '#', '#', '#', '#', '#', '#']),
  ];
}

function generatedPuzzles(count: number, seed: number): PuzzleCase[] {
  const random = rng(seed);
  const out: PuzzleCase[] = [];
  for (let i = 0; i < count; i++) {
    const width = 3 + Math.floor(random() * 7);
    const height = 3 + Math.floor(random() * 7);
    const density = 0.3 + random() * 0.4;
    const rows: string[] = [];
    for (let y = 0; y < height; y++) {
      let row = '';
      for (let x = 0; x < width; x++) row += random() < density ? '#' : '.';
      rows.push(row);
    }
    out.push(
      puzzleCase(
        `PZG${String(i).padStart(4, '0')}`,
        `generated puzzle ${i}: ${width}x${height}`,
        rows,
      ),
    );
  }
  return out;
}

/* -------------------------------------------------------------------------- */

function withIds<T extends { id: string }>(prefix: string, cases: T[]): T[] {
  return cases.map((c, i) => ({ ...c, id: c.id || `${prefix}-${String(i + 1).padStart(4, '0')}` }));
}

function write<T>(file: string, schema: string, cases: T[]): void {
  const payload: CorpusFile<T> = {
    schema,
    generatedBy: 'packages/shared-tests/src/generate.ts',
    cases,
  };
  writeFileSync(join(CASES_DIR, file), `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  console.log(`${file}: ${cases.length} cases`);
}

function main(): void {
  write(
    'line-solve.json',
    'nanonogram.corpus.line-solve/1',
    withIds('ls', [...handwrittenLineSolve(), ...generatedLineSolve(60, 0x1a2b3c4d)]),
  );
  write(
    'crossout.json',
    'nanonogram.corpus.crossout/1',
    withIds('co', [...handwrittenCrossout(), ...generatedCrossout(60, 0x5e6f7a8b)]),
  );
  write('rules.json', 'nanonogram.corpus.rules/1', withIds('ru', ruleCases()));
  write('puzzles.json', 'nanonogram.corpus.puzzles/1', [
    ...handwrittenPuzzles(),
    ...generatedPuzzles(30, 0x9c0d1e2f),
  ]);
}

main();
