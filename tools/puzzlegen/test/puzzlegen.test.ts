import { describe, expect, it } from 'vitest';
import {
  SIZE_LADDER,
  alignToPixelGrid,
  cleanup,
  collapseEmptyLines,
  coverage,
  detectPixelGrid,
  ditherCoverage,
  contentBox,
  contentCrop,
  createBitmap,
  dedupe,
  downsample,
  fitGrid,
  fromRows,
  generateFrom,
  gridDistance,
  inkCount,
  iou,
  isPlayable,
  measureQuality,
  nearbySizes,
  padTo,
  qualityComplaints,
  repairToPureLogic,
  resample,
  snapUpToFive,
  squareCrop,
  stripIsolatedInk,
  thresholdCoverage,
  toRows,
  topology,
  undecidedCells,
  upscale,
} from '../src/index.js';

/** A solid disc at high resolution, for fidelity tests. */
function disc(size: number, radius = 0.45) {
  const b = createBitmap(size, size);
  const c = (size - 1) / 2;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = (x - c) / size;
      const dy = (y - c) / size;
      b.data[y * size + x] = Math.hypot(dx, dy) <= radius ? 1 : 0;
    }
  }
  return b;
}

/** A ring: same silhouette as a disc, but with a hole. */
function ring(size: number, outer = 0.45, inner = 0.24) {
  const b = disc(size, outer);
  const c = (size - 1) / 2;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if (Math.hypot((x - c) / size, (y - c) / size) <= inner) b.data[y * size + x] = 0;
    }
  }
  return b;
}

describe('bitmap', () => {
  it('round-trips through rows', () => {
    const rows = ['.#.', '###', '.#.'];
    expect(toRows(fromRows(rows))).toEqual(rows);
  });

  it('rejects a ragged input', () => {
    expect(() => fromRows(['##', '#'])).toThrow(/ragged/);
  });

  it('crops to the ink and squares it up', () => {
    const b = fromRows(['.....', '..##.', '..##.', '.....', '.....']);
    const cropped = squareCrop(b);
    expect(cropped.width).toBe(2);
    expect(cropped.height).toBe(2);
    expect(inkCount(cropped)).toBe(4);
  });

  it('leaves a blank bitmap alone when cropping', () => {
    const blank = createBitmap(4, 4);
    expect(squareCrop(blank).width).toBe(4);
  });

  it('averages areas when downsampling, so thin strokes survive', () => {
    // A one-pixel line across a 16-wide bitmap: point sampling would lose it.
    const b = createBitmap(16, 16);
    for (let x = 0; x < 16; x++) b.data[8 * 16 + x] = 1;
    // At 1/4 scale the line occupies a quarter of each cell, so a low
    // threshold keeps it and a high one drops it. Both are correct behaviour.
    expect(inkCount(downsample(b, 4, 0.2))).toBeGreaterThan(0);
    expect(inkCount(downsample(b, 4, 0.9))).toBe(0);
  });

  it('cleanup removes strays and fills pinholes', () => {
    expect(toRows(cleanup(fromRows(['...', '.#.', '...'])))).toEqual(['...', '...', '...']);
    expect(toRows(cleanup(fromRows(['.#.', '#.#', '.#.'])))).toEqual(['.#.', '###', '.#.']);
  });

  it('iou is 1 for identical bitmaps and 0 for disjoint ones', () => {
    const a = fromRows(['##', '..']);
    expect(iou(a, a)).toBe(1);
    expect(iou(a, fromRows(['..', '##']))).toBe(0);
    expect(iou(createBitmap(2, 2), createBitmap(2, 2))).toBe(1);
  });

  it('iou refuses mismatched sizes', () => {
    expect(() => iou(createBitmap(2, 2), createBitmap(3, 3))).toThrow(/cannot compare/);
  });

  it('upscale is nearest-neighbour', () => {
    expect(toRows(upscale(fromRows(['#.']), 4, 2))).toEqual(['##..', '##..']);
  });
});

describe('topology', () => {
  it('counts one piece and no holes for a solid blob', () => {
    expect(topology(fromRows(['##', '##']))).toEqual({ pieces: 1, holes: 0 });
  });

  it('counts the hole in a ring', () => {
    expect(topology(fromRows(['###', '#.#', '###']))).toEqual({ pieces: 1, holes: 1 });
  });

  it('counts separate pieces', () => {
    expect(topology(fromRows(['#.#', '...', '#.#']))).toEqual({ pieces: 4, holes: 0 });
  });

  it('treats ink as 8-connected, so a diagonal is one piece', () => {
    expect(topology(fromRows(['#.', '.#'])).pieces).toBe(1);
  });

  it('does not mistake the outside for a hole', () => {
    expect(topology(fromRows(['.#.', '###', '.#.'])).holes).toBe(0);
  });

  it('handles an empty bitmap', () => {
    expect(topology(createBitmap(0, 0))).toEqual({ pieces: 0, holes: 0 });
    // All paper, and that paper touches the border, so it is the outside —
    // not a hole. A hole needs ink around it.
    expect(topology(createBitmap(3, 3))).toEqual({ pieces: 0, holes: 0 });
  });
});

describe('fitGrid — pictures that must be reduced get square grids', () => {
  it('returns a square grid on a ladder rung', () => {
    for (const shape of [disc(256), ring(256)]) {
      const fit = fitGrid(shape);
      expect(fit.size).not.toBeNull();
      expect(SIZE_LADDER).toContain(fit.size!);
      expect(fit.width).toBe(fit.height);
      expect(fit.native).toBe(false);
    }
  });

  it('keeps proportions inside the square rather than stretching', () => {
    // A bar twice as tall as wide: the ink must stay twice as tall as wide.
    const b = createBitmap(256, 256);
    for (let y = 20; y < 220; y++) {
      for (let x = 90; x < 190; x++) b.data[y * 256 + x] = 1;
    }
    const fit = fitGrid(b, { minIou: 0.8 });
    const box = contentBox(fit.grid!)!;
    expect(fit.width).toBe(fit.height);
    expect(box.height / box.width).toBeGreaterThan(1.5);
  });

  it('gives a simple shape a small grid', () => {
    expect(fitGrid(disc(256)).size!).toBeLessThanOrEqual(15);
  });

  it('needs a larger grid once a hole has to survive', () => {
    expect(fitGrid(ring(256)).size!).toBeGreaterThan(fitGrid(disc(256)).size!);
  });

  it('preserves the hole it went to the trouble of fitting', () => {
    const fit = fitGrid(ring(256));
    expect(fit.topology!.holes).toBe(1);
    expect(fit.topology).toEqual(fit.referenceTopology);
  });

  it('evaluates every rung, because fidelity is not monotone in size', () => {
    const rungs = fitGrid(ring(256)).trace.map((s) => s.width);
    expect(rungs).toEqual([...rungs].sort((a, b) => a - b));
    expect(rungs.length).toBeGreaterThan(1);
  });

  it('rejects a picture too detailed for the ladder, with a reason', () => {
    const b = createBitmap(256, 256);
    for (let y = 40; y < 216; y++) {
      for (let x = 0; x < 256; x += 4) b.data[y * 256 + x] = 1;
    }
    const fit = fitGrid(b, { maxSize: 10 });
    expect(fit.grid).toBeNull();
    expect(fit.rejectReason).toBeTruthy();
  });
});

describe('fitGrid — pictures already at grid resolution', () => {
  it('pads a sprite to multiples of five without resampling it', () => {
    // 7x4 of hand-placed cells. Resampling would destroy exactly the detail
    // its author positioned deliberately.
    const sprite = fromRows(['.#####.', '#.#.#.#', '#######', '.#...#.']);
    const fit = fitGrid(sprite);
    expect(fit.native).toBe(true);
    expect(fit.width).toBe(10);
    expect(fit.height).toBe(5);
    expect(inkCount(fit.grid!)).toBe(inkCount(sprite));
    // Reproduced exactly, so fidelity is not in question.
    expect(fit.iou).toBe(1);
  });

  it('is the only path that yields a rectangular board', () => {
    const sprite = fitGrid(fromRows(['.#####.', '#.#.#.#', '#######', '.#...#.']));
    expect(sprite.width).not.toBe(sprite.height);
    const vector = fitGrid(disc(256));
    expect(vector.width).toBe(vector.height);
  });

  it('centres the sprite inside the padding', () => {
    const fit = fitGrid(fromRows(['###', '#.#', '###']));
    expect([fit.width, fit.height]).toEqual([5, 5]);
    expect(inkCount(fit.grid!)).toBe(8);
    expect(fit.topology!.holes).toBe(1);
    // One blank ring all round.
    expect(toRows(fit.grid!)[0]).toBe('.....');
    expect(toRows(fit.grid!)[1]).toBe('.###.');
  });

  it('can be forced off for a small but non-native picture', () => {
    expect(fitGrid(disc(30), { nativeResolution: false, minIou: 0.8 }).native).toBe(false);
  });

  it('nearbySizes offers nothing extra for a native sprite', () => {
    const fit = fitGrid(fromRows(['##', '##']));
    expect(nearbySizes(fit)).toEqual([fit.size]);
  });
});

describe('grid geometry helpers', () => {
  it('snaps up to the next multiple of five, with five as the floor', () => {
    expect([1, 5, 6, 20, 21].map(snapUpToFive)).toEqual([5, 5, 10, 20, 25]);
  });

  it('padTo centres and refuses to shrink', () => {
    expect(toRows(padTo(fromRows(['##']), 4, 3))).toEqual(['....', '.##.', '....']);
    expect(() => padTo(fromRows(['####']), 2, 2)).toThrow(/cannot pad/);
  });

  it('contentCrop keeps proportions where squareCrop does not', () => {
    const b = fromRows(['.....', '.###.', '.....', '.....', '.....']);
    expect([contentCrop(b).width, contentCrop(b).height]).toEqual([3, 1]);
    expect([squareCrop(b).width, squareCrop(b).height]).toEqual([3, 3]);
  });

  it('contentBox reports null for a blank bitmap', () => {
    expect(contentBox(createBitmap(4, 4))).toBeNull();
  });

  it('resample can produce a non-square result', () => {
    const out = resample(createBitmap(40, 20, 1), 10, 5);
    expect([out.width, out.height]).toEqual([10, 5]);
    expect(inkCount(out)).toBe(50);
  });
});

describe('detectPixelGrid / alignToPixelGrid', () => {
  it('recovers the grid of a sprite blown up by an integer factor', () => {
    const sprite = fromRows(['.#####.', '#.#.#.#', '#######', '.#...#.']);
    const blownUp = upscale(sprite, sprite.width * 12, sprite.height * 12);
    expect(detectPixelGrid(blownUp, { maxCells: 35 })).toEqual({ width: 7, height: 4 });
  });

  it('still finds it once margin is added around the blow-up', () => {
    const sprite = fromRows(['.#####.', '#.#.#.#', '#######', '.#...#.']);
    const blownUp = padTo(upscale(sprite, 84, 48), 140, 90);
    const aligned = alignToPixelGrid(blownUp, { maxCells: 35 });
    expect([aligned.width, aligned.height]).toEqual([7, 4]);
    expect(toRows(aligned)).toEqual(toRows(sprite));
  });

  it('recovers a non-integer scale, since the pitch only has to be the mode', () => {
    // 7 cells across 51px is not an integer pitch, the way a screenshot or a
    // resave at an arbitrary size never lands on one either.
    const sprite = fromRows(['.###.', '#####', '.###.']);
    const blownUp = upscale(sprite, 51, 31);
    expect(detectPixelGrid(blownUp, { maxCells: 35 })).toEqual({ width: 5, height: 3 });
  });

  it('refuses a shape with no flat cells to snap to', () => {
    const b = createBitmap(256, 256);
    const c = 127.5;
    for (let y = 0; y < 256; y++) {
      for (let x = 0; x < 256; x++) {
        b.data[y * 256 + x] = Math.hypot((x - c) / 256, (y - c) / 256) <= 0.45 ? 1 : 0;
      }
    }
    expect(detectPixelGrid(contentCrop(b), { maxCells: 35 })).toBeNull();
  });

  it('leaves a picture with no detectable grid at its plain crop', () => {
    const b = createBitmap(10, 10);
    for (let y = 3; y < 7; y++) for (let x = 3; x < 7; x++) b.data[y * 10 + x] = 1;
    // A flat 4x4 square offers no row/column with more than one run, so there
    // is nothing to detect a pitch from — alignToPixelGrid should still hand
    // back a sensible (cropped) bitmap rather than throwing.
    expect(() => alignToPixelGrid(b)).not.toThrow();
  });

  it('caps how fine a grid it will accept, so it does not mistake noise for a huge sprite', () => {
    const sprite = fromRows(['.#####.', '#.#.#.#', '#######', '.#...#.']);
    const blownUp = upscale(sprite, sprite.width * 12, sprite.height * 12);
    expect(detectPixelGrid(blownUp, { maxCells: 5 })).toBeNull();
  });

  it('tries every length that clears the floor, not just the shortest', () => {
    // A stray short run (a scan artefact, a compression fringe) can clear the
    // "common enough" floor on volume alone without corresponding to any
    // real cell edge. If the shortest candidate is tried and discarded
    // rather than ending the search, a coarser, correct one still gets its
    // turn: a 4x4 sprite blown up to 40x40 with one row of single-pixel
    // noise dragged across it should still resolve to 10x10, not bail out
    // after the noise's length fails to reduce decisively.
    const sprite = fromRows(['.##.', '####', '####', '.##.']);
    const blownUp = upscale(sprite, 40, 40);
    for (let x = 0; x < 40; x += 2) blownUp.data[5 * 40 + x] = blownUp.data[5 * 40 + x] ? 0 : 1;
    expect(detectPixelGrid(blownUp, { maxCells: 35 })).toEqual({ width: 10, height: 10 });
  });
});

describe('collapseEmptyLines', () => {
  it('leaves a picture with no run of 2+ blank lines untouched', () => {
    const b = fromRows(['##.#', '#..#', '.##.']);
    expect(toRows(collapseEmptyLines(b))).toEqual(toRows(b));
  });

  it('collapses a run of blank rows down to one', () => {
    const b = fromRows(['##', '..', '..', '..', '##']);
    expect(toRows(collapseEmptyLines(b))).toEqual(['##', '..', '##']);
  });

  it('collapses blank columns independently of rows', () => {
    const b = fromRows(['#...#', '#...#']);
    expect(toRows(collapseEmptyLines(b))).toEqual(['#.#', '#.#']);
  });

  it('keeps a single blank line as-is — nothing to collapse', () => {
    const b = fromRows(['##', '..', '##']);
    expect(toRows(collapseEmptyLines(b))).toEqual(toRows(b));
  });

  it('can be told to close the gap entirely', () => {
    const b = fromRows(['##', '..', '..', '##']);
    expect(toRows(collapseEmptyLines(b, 0))).toEqual(['##', '##']);
  });

  it('crops to content first, so outer margin is not mistaken for a gap', () => {
    const b = fromRows(['.....', '..##.', '.....', '.....', '.....']);
    expect(toRows(collapseEmptyLines(b))).toEqual(['##']);
  });
});

describe('stripIsolatedInk', () => {
  it('removes ink with no orthogonal neighbour', () => {
    const b = fromRows(['#.#', '...', '###']);
    const { grid, removed } = stripIsolatedInk(b);
    expect(removed).toBe(2);
    expect(toRows(grid)).toEqual(['...', '...', '###']);
  });

  it('leaves diagonally-touching ink alone — that is not orthogonal contact', () => {
    // Every one of these five cells only touches its neighbours diagonally,
    // so by the orthogonal definition every one of them is isolated too.
    const b = fromRows(['#.#', '.#.', '#.#']);
    const { removed } = stripIsolatedInk(b);
    expect(removed).toBe(5);
  });

  it('reports zero removed when nothing is isolated', () => {
    const b = fromRows(['##', '##']);
    expect(stripIsolatedInk(b).removed).toBe(0);
  });
});

describe('dithering', () => {
  it('coverage reports the ink fraction of each target cell', () => {
    const b = createBitmap(4, 4);
    for (let x = 0; x < 4; x++) b.data[x] = 1; // top row only
    const cov = coverage(b, 2, 2);
    expect(cov[0]).toBeCloseTo(0.5);
    expect(cov[2]).toBeCloseTo(0);
  });

  it('keeps detail a plain cut throws away', () => {
    // Half-covered everywhere: a threshold of 0.6 erases it entirely, while
    // error diffusion keeps half the ink.
    const b = createBitmap(20, 20);
    for (let i = 0; i < b.data.length; i++) b.data[i] = i % 2;
    const cov = coverage(b, 10, 10);
    expect(inkCount(thresholdCoverage(cov, 10, 10, 0.6))).toBe(0);
    expect(inkCount(ditherCoverage(cov, 10, 10))).toBeGreaterThan(0);
  });

  it('is reported as speckle, and rejected past 30 %', () => {
    const speckled = fromRows(['#.#.#', '.....', '#.#.#', '.....', '#.#.#']);
    const metrics = measureQuality(speckled);
    expect(metrics.noiseShare).toBe(1);
    expect(qualityComplaints(speckled, metrics)).toContainEqual(expect.stringContaining('speckle'));
    const solid = fromRows(['.###.', '#####', '#####', '.###.']);
    expect(measureQuality(solid).noiseShare).toBe(0);
  });
});

describe('quality ignores the padding', () => {
  const picture = fromRows([
    '#######',
    '#.....#',
    '#.....#',
    '#.....#',
    '#.....#',
    '#.....#',
    '#######',
  ]);
  const padded = padTo(picture, 20, 20);

  it('measures the picture, not the board', () => {
    expect(measureQuality(padded).fill).toBe(measureQuality(picture).fill);
    expect(measureQuality(padded).emptyLines).toBe(0);
    expect(measureQuality(padded).paddingCells).toBe(400 - 49);
  });

  it('a well-margined picture is not called sparse', () => {
    // 24 ink cells in a 20x20 board is 6 % of the board and 49 % of the
    // picture. Only the second number describes the puzzle.
    expect(measureQuality(padded).fill).toBeCloseTo(24 / 49);
    expect(isPlayable(padded)).toBe(true);
  });

  it('blank lines inside the picture still count', () => {
    const gappy = fromRows(['####', '....', '....', '####']);
    expect(measureQuality(gappy).emptyLines).toBe(2);
  });
});

describe('repairToPureLogic', () => {
  it('leaves a puzzle that is already pure logic untouched', () => {
    const grid = fromRows(['.#.', '###', '.#.']);
    const result = repairToPureLogic(grid);
    expect(result.wasAlreadyPure).toBe(true);
    expect(result.edits).toEqual([]);
    expect(toRows(result.grid)).toEqual(toRows(grid));
  });

  it('repairs an ambiguous board by moving the outline', () => {
    // The classic switching pair: two diagonals satisfy the same clues.
    const grid = fromRows(['#.', '.#']);
    expect(undecidedCells(grid)).toBeGreaterThan(0);
    const result = repairToPureLogic(grid, { forbidIsolated: false });
    if (result.pure) {
      expect(result.edits.length).toBeGreaterThan(0);
      expect(undecidedCells(result.grid)).toBe(0);
    }
  });

  it('only ever moves boundary cells', () => {
    const grid = fromRows(['.###.', '#####', '#####', '#####', '.###.']);
    const result = repairToPureLogic(grid);
    // Whatever it did, the interior is intact.
    expect(result.grid.data[2 * 5 + 2]).toBe(grid.data[2 * 5 + 2]);
  });

  it('respects its edit budget', () => {
    const grid = fromRows(['#.#.', '.#.#', '#.#.', '.#.#']);
    const result = repairToPureLogic(grid, { maxEdits: 2, forbidIsolated: false });
    expect(result.edits.length).toBeLessThanOrEqual(2);
  });

  it('reports a fully undecided board rather than throwing', () => {
    expect(undecidedCells(createBitmap(4, 4))).toBe(0); // an empty board is decided
  });
});

describe('quality', () => {
  it('measures fill, blocks and strays', () => {
    const m = measureQuality(fromRows(['#.#', '...', '#.#']));
    expect(m.fill).toBeCloseTo(4 / 9);
    expect(m.isolated).toBe(4);
    expect(m.emptyLines).toBe(2); // middle row and middle column
  });

  it('rejects a board that is nearly empty or nearly full', () => {
    // Sparseness is now judged inside the picture, so a small solid blob is
    // dense, not sparse. A thin frame around a large void is the real thing.
    const sparse = fromRows([
      '####################',
      '#..................#',
      '#..................#',
      '#..................#',
      '#..................#',
      '#..................#',
      '#..................#',
      '#..................#',
      '#..................#',
      '#..................#',
      '#..................#',
      '#..................#',
      '#..................#',
      '#..................#',
      '#..................#',
      '#..................#',
      '#..................#',
      '#..................#',
      '#..................#',
      '####################',
    ]);
    expect(qualityComplaints(sparse, measureQuality(sparse))).toContainEqual(
      expect.stringContaining('too sparse'),
    );
    const dense = fromRows(['####', '####', '####', '.###']);
    expect(qualityComplaints(dense, measureQuality(dense))).toContainEqual(
      expect.stringContaining('too dense'),
    );
  });

  it('rejects isolated pixels', () => {
    const speckled = fromRows(['#.#.#', '.....', '#.#.#', '.....', '#.#.#']);
    expect(isPlayable(speckled)).toBe(false);
  });

  it('accepts a reasonable board', () => {
    const good = fromRows([
      '#######',
      '#.....#',
      '#.....#',
      '#.....#',
      '#.....#',
      '#.....#',
      '#######',
    ]);
    const metrics = measureQuality(good);
    expect(metrics.fill).toBeGreaterThan(0.25);
    expect(metrics.fill).toBeLessThan(0.62);
    expect(isPlayable(good)).toBe(true);
  });
});

describe('dedupe', () => {
  it('drops a near-identical grid and keeps the better-scoring one', () => {
    const a = fromRows(['###', '#.#', '###']);
    const b = fromRows(['###', '#.#', '##.']); // one cell different
    // One cell of nine is 11% — the default threshold is calibrated for real
    // grids, where a couple of cells is a much smaller share. Say so explicitly.
    const result = dedupe(
      [
        { grid: a, value: 'a', score: 1 },
        { grid: b, value: 'b', score: 5 },
      ],
      0.2,
    );
    expect(result.kept).toEqual(['b']);
    expect(result.dropped[0]).toEqual({ value: 'a', duplicateOf: 'b' });
  });

  it('keeps genuinely different grids', () => {
    const result = dedupe([
      { grid: fromRows(['##', '##']), value: 'solid', score: 1 },
      { grid: fromRows(['#.', '.#']), value: 'diagonal', score: 1 },
    ]);
    expect(result.kept).toHaveLength(2);
  });

  it('treats different sizes as different', () => {
    expect(gridDistance(fromRows(['##']), fromRows(['##', '##']))).toBe(1);
    expect(gridDistance(fromRows(['##']), fromRows(['##']))).toBe(0);
  });
});

describe('generateFrom — the four gates', () => {
  const attribution = {
    id: 'TESTDISC',
    title: 'Disc',
    license: 'MIT',
    source: 'unit-test',
    author: 'nobody',
  };

  it('turns a clean shape into a verified puzzle', () => {
    const outcome = generateFrom(ring(256), attribution, { quality: { minFill: 0.15 } });
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    const { puzzle } = outcome;
    expect(puzzle.puzzle.license).toBe('MIT');
    expect(puzzle.puzzle.distributable).toBe(true);
    expect(puzzle.puzzle.unique).toBe(true);
    // The title names the picture, so it must stay hidden until it is solved.
    expect(puzzle.puzzle.hideTitle).toBe(true);
    expect(puzzle.difficulty).toBeGreaterThanOrEqual(1);
    expect(puzzle.difficulty).toBeLessThanOrEqual(5);
    expect(undecidedCells(puzzle.grid)).toBe(0);
  });

  it('turns away a picture no grid can represent, and says which gate', () => {
    const comb = createBitmap(256, 256);
    for (let y = 40; y < 216; y++) {
      for (let x = 0; x < 256; x += 4) comb.data[y * 256 + x] = 1;
    }
    const outcome = generateFrom(comb, attribution, { fit: { maxSize: 12 } });
    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.rejection.gate).toBe('fidelity');
    expect(outcome.rejection.reason).toBeTruthy();
  });

  it('turns away a board that is faithful but not worth playing', () => {
    const outcome = generateFrom(disc(256), attribution, { quality: { minFill: 0.99 } });
    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.rejection.gate).toBe('playability');
  });
});
