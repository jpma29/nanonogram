/**
 * Property tests.
 *
 * The unit tests check cases somebody thought of. These check invariants that
 * must hold for *every* puzzle, on inputs nobody thought of — which is where
 * solver bugs actually live.
 *
 * The headline one is the Fase 0 acceptance criterion: generate 10 000 random
 * puzzles, solve each from its clues alone, and verify that the declared
 * uniqueness is real.
 */

import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  BACKGROUND_BIT,
  Game,
  LineEngine,
  analyzeLine,
  cluesForLine,
  colorBit,
  createPuzzle,
  crossoutLine,
  decodeGrid,
  deriveClues,
  encodeGrid,
  fillSymbolsFor,
  filledCell,
  lineDomains,
  monochromePalette,
  parsePuzzle,
  serializePuzzle,
  solvePuzzle,
  solutionFilledCount,
} from '../src/index.js';
import { ticker } from './helpers.js';

/** Deterministic PRNG so a failure is reproducible from the seed alone. */
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

function randomPuzzle(random: () => number, maxSide = 8) {
  const width = 2 + Math.floor(random() * (maxSide - 1));
  const height = 2 + Math.floor(random() * (maxSide - 1));
  const density = 0.25 + random() * 0.5;
  const solution = new Uint8Array(width * height);
  let filled = 0;
  for (let i = 0; i < solution.length; i++) {
    solution[i] = random() < density ? 1 : 0;
    filled += solution[i]!;
  }
  // A grid with nothing in it is trivially solved and not a puzzle; make sure
  // the generator always produces something to deduce.
  if (filled === 0) solution[Math.floor(random() * solution.length)] = 1;
  return createPuzzle({
    id: 'prop',
    width,
    height,
    solution,
    palette: monochromePalette(),
  });
}

/**
 * Fase 0 acceptance: 10 000 random puzzles, each solved from its clues, with
 * the declared uniqueness verified.
 */
describe('property: uniqueness is real', () => {
  it('solves 10000 random puzzles and verifies their declared uniqueness', () => {
    const random = rng(0xc0ffee);
    let uniqueCount = 0;
    let ambiguousCount = 0;

    for (let i = 0; i < 10_000; i++) {
      const puzzle = randomPuzzle(random);
      const result = solvePuzzle(puzzle, { maxSolutions: 2, nodeBudget: 50_000 });

      // Every puzzle built from a real grid has at least that grid as a
      // solution, so the solver must always find something.
      expect(result.exhausted, `puzzle ${i} exhausted the budget`).toBe(false);
      expect(result.solutions.length, `puzzle ${i} has no solution`).toBeGreaterThan(0);

      // Whatever it finds must satisfy the clues it was given.
      for (const candidate of result.solutions) {
        const derived = deriveClues(candidate, puzzle.width, puzzle.height);
        expect(derived.rows, `puzzle ${i} row clues`).toEqual(
          puzzle.rowClues.map((line) => [...line]),
        );
        expect(derived.cols, `puzzle ${i} col clues`).toEqual(
          puzzle.colClues.map((line) => [...line]),
        );
      }

      if (result.unique) {
        uniqueCount++;
        // A unique puzzle's one solution must be the declared one.
        expect(result.solutions[0]!.join(), `puzzle ${i} lost its own solution`).toBe(
          [...puzzle.solution].join(),
        );
      } else {
        ambiguousCount++;
        expect(result.solutions.length).toBe(2);
        expect(result.solutions[0]!.join()).not.toBe(result.solutions[1]!.join());
      }
    }

    // Sanity: the corpus is not degenerate in either direction.
    expect(uniqueCount).toBeGreaterThan(500);
    expect(ambiguousCount).toBeGreaterThan(500);
  }, 300_000);
});

describe('property: line solver', () => {
  it('never removes a colour the truth needs', () => {
    fc.assert(
      fc.property(fc.array(fc.boolean(), { minLength: 1, maxLength: 14 }), (bits) => {
        const truth = bits.map((b) => (b ? 1 : 0));
        const clues = cluesForLine(truth);
        const cells = new Array<number>(truth.length).fill(0);
        const analysis = analyzeLine(clues, lineDomains(cells, 2), 2);
        expect(analysis.feasible).toBe(true);
        // The real line must survive propagation cell by cell.
        for (let i = 0; i < truth.length; i++) {
          const needed = truth[i] === 0 ? BACKGROUND_BIT : colorBit(1);
          expect((analysis.domains[i]! & needed) !== 0).toBe(true);
        }
      }),
      { numRuns: 800 },
    );
  });

  it('a domain the solver forces really is forced', () => {
    fc.assert(
      fc.property(fc.array(fc.boolean(), { minLength: 1, maxLength: 10 }), (bits) => {
        const truth = bits.map((b) => (b ? 1 : 0));
        const clues = cluesForLine(truth);
        const n = truth.length;
        const analysis = analyzeLine(clues, lineDomains(new Array<number>(n).fill(0), 2), 2);

        // Brute force every arrangement of the line and confirm the solver's
        // singleton cells agree with every one of them.
        const arrangements: number[][] = [];
        for (let mask = 0; mask < 1 << n; mask++) {
          const line: number[] = [];
          for (let i = 0; i < n; i++) line.push((mask >> i) & 1);
          if (JSON.stringify(cluesForLine(line)) === JSON.stringify(clues)) arrangements.push(line);
        }
        expect(arrangements.length).toBeGreaterThan(0);

        for (let i = 0; i < n; i++) {
          const values = new Set(arrangements.map((a) => a[i]!));
          const expectedMask = [...values].reduce(
            (acc, v) => acc | (v === 0 ? BACKGROUND_BIT : colorBit(1)),
            0,
          );
          expect(analysis.domains[i], `cell ${i} of ${truth.join('')}`).toBe(expectedMask);
        }
      }),
      { numRuns: 400 },
    );
  });

  it('clue start counts match brute force', () => {
    fc.assert(
      fc.property(fc.array(fc.boolean(), { minLength: 1, maxLength: 10 }), (bits) => {
        const truth = bits.map((b) => (b ? 1 : 0));
        const clues = cluesForLine(truth);
        const n = truth.length;
        const analysis = analyzeLine(clues, lineDomains(new Array<number>(n).fill(0), 2), 2);

        const starts: Set<number>[] = clues.map(() => new Set<number>());
        for (let mask = 0; mask < 1 << n; mask++) {
          const line: number[] = [];
          for (let i = 0; i < n; i++) line.push((mask >> i) & 1);
          if (JSON.stringify(cluesForLine(line)) !== JSON.stringify(clues)) continue;
          let clueIndex = 0;
          for (let i = 0; i < n; i++) {
            if (line[i] === 1 && (i === 0 || line[i - 1] === 0)) starts[clueIndex++]!.add(i);
          }
        }
        for (let j = 0; j < clues.length; j++) {
          expect(analysis.startCount[j], `clue ${j} of ${truth.join('')}`).toBe(starts[j]!.size);
          expect(analysis.firstStart[j]).toBe(Math.min(...starts[j]!));
        }
      }),
      { numRuns: 400 },
    );
  });
});

describe('property: crossout never leaks', () => {
  /**
   * The safety property, stated directly: if a clue is crossed out, then in
   * every legal completion of that line it sits exactly where the player drew
   * it. A cross-out therefore tells the player nothing they could not already
   * deduce from their own marks.
   */
  it('only crosses out clues that are pinned in every completion', () => {
    const random = rng(0xfeed);
    const engine = new LineEngine();
    for (let iteration = 0; iteration < 4000; iteration++) {
      const n = 3 + Math.floor(random() * 10);
      const truth: number[] = [];
      for (let i = 0; i < n; i++) truth.push(random() < 0.45 ? 1 : 0);
      const clues = cluesForLine(truth);
      if (clues.length === 0) continue;

      const cells = new Array<number>(n).fill(0);
      for (let i = 0; i < n; i++) {
        const roll = random();
        if (roll < 0.6) cells[i] = truth[i] === 0 ? 1 : filledCell(1);
        else if (roll < 0.65) cells[i] = 2;
      }

      const crossed = crossoutLine(clues, cells, 2, engine);
      const analysis = analyzeLine(clues, lineDomains(cells, 2), 2);
      for (let j = 0; j < clues.length; j++) {
        if (!crossed[j]) continue;
        expect(analysis.feasible, `iteration ${iteration}`).toBe(true);
        expect(analysis.startCount[j], `clue ${j} at iteration ${iteration}`).toBe(1);
      }
    }
  }, 60_000);

  it('crosses out everything on a fully and correctly marked line', () => {
    fc.assert(
      fc.property(fc.array(fc.boolean(), { minLength: 1, maxLength: 14 }), (bits) => {
        const truth = bits.map((b) => (b ? 1 : 0));
        const clues = cluesForLine(truth);
        const cells = truth.map((v) => (v === 0 ? 1 : filledCell(1)));
        expect(crossoutLine(clues, cells, 2).every(Boolean)).toBe(true);
      }),
      { numRuns: 500 },
    );
  });
});

describe('property: round trips', () => {
  it('grid RLE round-trips any board', () => {
    const symbols = fillSymbolsFor(['.', 'X']);
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 20 }),
        fc.integer({ min: 1, max: 20 }),
        fc.array(fc.integer({ min: 0, max: 3 }), { minLength: 400, maxLength: 400 }),
        (width, height, source) => {
          const cells = new Uint8Array(width * height);
          for (let i = 0; i < cells.length; i++) {
            const pick = source[i % source.length]!;
            cells[i] = pick === 3 ? filledCell(1) : pick;
          }
          const decoded = decodeGrid(encodeGrid(cells, width, height, symbols), symbols);
          expect([...decoded.cells]).toEqual([...cells]);
        },
      ),
      { numRuns: 300 },
    );
  });

  it('the canonical JSON format round-trips any puzzle', () => {
    const random = rng(0xbeef);
    for (let i = 0; i < 500; i++) {
      const puzzle = randomPuzzle(random, 10);
      expect(parsePuzzle(serializePuzzle(puzzle))).toEqual(puzzle);
    }
  });

  it('a game snapshot round-trips at any point in a run', () => {
    const random = rng(0xd00d);
    const t = ticker();
    for (let i = 0; i < 300; i++) {
      const puzzle = randomPuzzle(random, 6);
      const game = new Game(puzzle, { mode: random() < 0.5 ? 'casual' : 'hardcore' });
      game.start(t.now());
      const moves = Math.floor(random() * 12);
      for (let m = 0; m < moves; m++) {
        const x = Math.floor(random() * puzzle.width);
        const y = Math.floor(random() * puzzle.height);
        const paint = (['filled', 'cross', 'dot', 'empty'] as const)[Math.floor(random() * 4)]!;
        t.advance(100);
        game.setCell(x, y, paint, t.now());
      }
      const snapshot = game.serialize(t.now(), { includeHistory: true });
      const restored = Game.restore(puzzle, snapshot);
      expect([...restored.cells]).toEqual([...game.cells]);
      expect(restored.errors).toBe(game.errors);
      expect(restored.penaltyMs).toBe(game.penaltyMs);
      expect(restored.crossouts).toEqual(game.crossouts);
    }
  }, 60_000);
});

describe('property: the game always closes on a correct board', () => {
  it('filling exactly the solution completes the puzzle, in either mode', () => {
    const random = rng(0x1234);
    const t = ticker();
    for (let i = 0; i < 400; i++) {
      const puzzle = randomPuzzle(random, 7);
      const mode = random() < 0.5 ? 'casual' : 'hardcore';
      const game = new Game(puzzle, { mode });
      game.start(t.now());
      for (let y = 0; y < puzzle.height; y++) {
        for (let x = 0; x < puzzle.width; x++) {
          t.advance(10);
          // Scatter crosses on the background cells: they must not matter.
          if (puzzle.solution[y * puzzle.width + x] !== 0) game.setCell(x, y, 'filled', t.now());
          else if (random() < 0.5) game.setCell(x, y, 'cross', t.now());
        }
      }
      expect(solutionFilledCount(puzzle)).toBeGreaterThan(0);
      expect(game.status, `puzzle ${i}`).toBe('completed');
      expect(game.errors).toBe(0);
      expect(game.hasCrown).toBe(true);
    }
  }, 60_000);
});
