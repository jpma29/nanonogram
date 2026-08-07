/**
 * Connected components and holes.
 *
 * Shape similarity alone is not enough to decide whether a picture survived
 * being reduced to a grid. A gear that loses its centre hole still scores well
 * on overlap, and is no longer a gear. Counting pieces and holes catches
 * exactly that class of loss, and it is cheap.
 */

import type { Bitmap } from './bitmap.js';

export interface Topology {
  /** Connected regions of ink, 8-connected. */
  readonly pieces: number;
  /** Enclosed regions of paper — holes — 4-connected, excluding the outside. */
  readonly holes: number;
}

/**
 * Ink is 8-connected and paper is 4-connected, which is the standard pairing.
 * Using the same connectivity for both produces the classic paradox where a
 * diagonal line is simultaneously connected and does not separate the plane.
 */
function label(
  bitmap: Bitmap,
  target: number,
  diagonal: boolean,
): { labels: Int32Array; count: number } {
  const { width, height, data } = bitmap;
  const labels = new Int32Array(width * height).fill(-1);
  const stack: number[] = [];
  let count = 0;

  const steps: [number, number][] = diagonal
    ? [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
        [1, 1],
        [1, -1],
        [-1, 1],
        [-1, -1],
      ]
    : [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ];

  for (let start = 0; start < data.length; start++) {
    if (data[start] !== target || labels[start] !== -1) continue;
    const id = count++;
    labels[start] = id;
    stack.push(start);
    while (stack.length > 0) {
      const index = stack.pop()!;
      const x = index % width;
      const y = (index - x) / width;
      for (const [dx, dy] of steps) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
        const n = ny * width + nx;
        if (data[n] !== target || labels[n] !== -1) continue;
        labels[n] = id;
        stack.push(n);
      }
    }
  }
  return { labels, count };
}

/** Count the pieces of ink and the holes enclosed by it. */
export function topology(bitmap: Bitmap): Topology {
  const { width, height } = bitmap;
  if (width === 0 || height === 0) return { pieces: 0, holes: 0 };

  const ink = label(bitmap, 1, true);
  const paper = label(bitmap, 0, false);

  // Any paper region touching the border is the outside, not a hole.
  const outside = new Set<number>();
  for (let x = 0; x < width; x++) {
    outside.add(paper.labels[x]!);
    outside.add(paper.labels[(height - 1) * width + x]!);
  }
  for (let y = 0; y < height; y++) {
    outside.add(paper.labels[y * width]!);
    outside.add(paper.labels[y * width + width - 1]!);
  }
  outside.delete(-1);

  let holes = 0;
  for (let id = 0; id < paper.count; id++) if (!outside.has(id)) holes++;

  return { pieces: ink.count, holes };
}

export function sameTopology(a: Topology, b: Topology): boolean {
  return a.pieces === b.pieces && a.holes === b.holes;
}
