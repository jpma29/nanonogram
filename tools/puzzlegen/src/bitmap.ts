/**
 * A binary raster and the operations the generator needs on one.
 *
 * Everything here is pure array arithmetic — no image library, no I/O — so the
 * interesting decisions can be tested without rendering anything.
 */

export interface Bitmap {
  readonly width: number;
  readonly height: number;
  /** One byte per pixel: 1 = ink, 0 = paper. Row-major. */
  readonly data: Uint8Array;
}

export function createBitmap(width: number, height: number, fill = 0): Bitmap {
  return { width, height, data: new Uint8Array(width * height).fill(fill) };
}

export function at(bitmap: Bitmap, x: number, y: number): number {
  if (x < 0 || y < 0 || x >= bitmap.width || y >= bitmap.height) return 0;
  return bitmap.data[y * bitmap.width + x]!;
}

export function inkCount(bitmap: Bitmap): number {
  let n = 0;
  for (let i = 0; i < bitmap.data.length; i++) n += bitmap.data[i]!;
  return n;
}

/** Render a bitmap as `#`/`.` rows. Used by tests, fixtures and the CLI. */
export function toRows(bitmap: Bitmap): string[] {
  const rows: string[] = [];
  for (let y = 0; y < bitmap.height; y++) {
    let row = '';
    for (let x = 0; x < bitmap.width; x++) row += bitmap.data[y * bitmap.width + x] ? '#' : '.';
    rows.push(row);
  }
  return rows;
}

/** Inverse of {@link toRows}. */
export function fromRows(rows: readonly string[]): Bitmap {
  const height = rows.length;
  const width = rows[0]?.length ?? 0;
  const data = new Uint8Array(width * height);
  rows.forEach((row, y) => {
    if (row.length !== width) throw new Error(`ragged bitmap at row ${y}`);
    for (let x = 0; x < width; x++) data[y * width + x] = row[x] === '#' ? 1 : 0;
  });
  return { width, height, data };
}

/** The bounding box of the ink, or null when the bitmap is blank. */
export function contentBox(
  bitmap: Bitmap,
): { x: number; y: number; width: number; height: number } | null {
  let minX = bitmap.width;
  let minY = bitmap.height;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < bitmap.height; y++) {
    for (let x = 0; x < bitmap.width; x++) {
      if (!bitmap.data[y * bitmap.width + x]) continue;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }
  if (maxX < 0) return null;
  return { x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1 };
}

/**
 * Crop to the ink, keeping the original proportions.
 *
 * The aspect ratio is information about the subject: a tower is tall and a
 * banner is wide. Squaring it up either distorts the picture or strands it in a
 * sea of empty rows, and empty rows are the most boring thing a nonogram can
 * contain.
 */
export function contentCrop(bitmap: Bitmap): Bitmap {
  const box = contentBox(bitmap);
  if (!box) return bitmap;
  const out = createBitmap(box.width, box.height);
  for (let y = 0; y < box.height; y++) {
    for (let x = 0; x < box.width; x++) {
      out.data[y * box.width + x] = bitmap.data[(y + box.y) * bitmap.width + x + box.x]!;
    }
  }
  return out;
}

/** Centre a bitmap inside a larger one, padding with paper. */
export function padTo(bitmap: Bitmap, width: number, height: number): Bitmap {
  if (width < bitmap.width || height < bitmap.height) {
    throw new Error(`cannot pad ${bitmap.width}x${bitmap.height} down to ${width}x${height}`);
  }
  const out = createBitmap(width, height);
  const offX = Math.floor((width - bitmap.width) / 2);
  const offY = Math.floor((height - bitmap.height) / 2);
  for (let y = 0; y < bitmap.height; y++) {
    for (let x = 0; x < bitmap.width; x++) {
      out.data[(y + offY) * width + x + offX] = bitmap.data[y * bitmap.width + x]!;
    }
  }
  return out;
}

/**
 * Crop to the bounding box of the ink, then pad to a square.
 *
 * Kept for callers that genuinely want a square; the pipeline uses
 * {@link contentCrop} so that proportions survive.
 */
export function squareCrop(bitmap: Bitmap): Bitmap {
  let minX = bitmap.width;
  let minY = bitmap.height;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < bitmap.height; y++) {
    for (let x = 0; x < bitmap.width; x++) {
      if (!bitmap.data[y * bitmap.width + x]) continue;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }
  if (maxX < 0) return bitmap;
  const w = maxX - minX + 1;
  const h = maxY - minY + 1;
  const side = Math.max(w, h);
  const out = createBitmap(side, side);
  const offX = Math.floor((side - w) / 2);
  const offY = Math.floor((side - h) / 2);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      out.data[(y + offY) * side + x + offX] = bitmap.data[(y + minY) * bitmap.width + x + minX]!;
    }
  }
  return out;
}

/**
 * Reduce to `size` x `size` by area averaging, then threshold.
 *
 * Area averaging rather than point sampling matters: a thin stroke that misses
 * every sample point disappears entirely, while its average still registers.
 *
 * Dithering is deliberately *not* offered. It scatters isolated pixels, which
 * turn into long runs of ones in the clues, which make a puzzle tedious to
 * solve and an unreadable picture at the end. A threshold plus the morphology
 * in {@link cleanup} gives a far better result at these sizes.
 */
export function resample(source: Bitmap, width: number, height: number, threshold = 0.5): Bitmap {
  const out = createBitmap(width, height);
  const sx = source.width / width;
  const sy = source.height / height;
  for (let y = 0; y < height; y++) {
    const y0 = Math.floor(y * sy);
    const y1 = Math.max(y0 + 1, Math.floor((y + 1) * sy));
    for (let x = 0; x < width; x++) {
      const x0 = Math.floor(x * sx);
      const x1 = Math.max(x0 + 1, Math.floor((x + 1) * sx));
      let sum = 0;
      let n = 0;
      for (let yy = y0; yy < y1 && yy < source.height; yy++) {
        for (let xx = x0; xx < x1 && xx < source.width; xx++) {
          sum += source.data[yy * source.width + xx]!;
          n++;
        }
      }
      out.data[y * width + x] = n > 0 && sum / n >= threshold ? 1 : 0;
    }
  }
  return out;
}

/**
 * Area-average coverage of each target cell, before any thresholding: the
 * fraction of the source cell that is ink, in [0, 1].
 *
 * This is the greyscale the binarisation stage works from, and the input both
 * {@link thresholdCoverage} and {@link ditherCoverage} consume.
 */
export function coverage(source: Bitmap, width: number, height: number): Float32Array {
  const out = new Float32Array(width * height);
  const sx = source.width / width;
  const sy = source.height / height;
  for (let y = 0; y < height; y++) {
    const y0 = Math.floor(y * sy);
    const y1 = Math.max(y0 + 1, Math.floor((y + 1) * sy));
    for (let x = 0; x < width; x++) {
      const x0 = Math.floor(x * sx);
      const x1 = Math.max(x0 + 1, Math.floor((x + 1) * sx));
      let sum = 0;
      let n = 0;
      for (let yy = y0; yy < y1 && yy < source.height; yy++) {
        for (let xx = x0; xx < x1 && xx < source.width; xx++) {
          sum += source.data[yy * source.width + xx]!;
          n++;
        }
      }
      out[y * width + x] = n > 0 ? sum / n : 0;
    }
  }
  return out;
}

/** Plain cut: every cell above the threshold becomes ink. */
export function thresholdCoverage(
  cov: Float32Array,
  width: number,
  height: number,
  threshold = 0.5,
): Bitmap {
  const out = createBitmap(width, height);
  for (let i = 0; i < out.data.length; i++) out.data[i] = cov[i]! >= threshold ? 1 : 0;
  return out;
}

/**
 * Floyd-Steinberg error diffusion.
 *
 * Dithering keeps detail a plain cut throws away, at the cost of speckle. A
 * little of that is fine — a few scattered cells read as texture. Too much and
 * every clue line becomes a row of ones, which is tedious to solve and
 * illegible when finished, so the result is checked against
 * `maxNoiseShare` in `quality.ts` rather than being trusted.
 */
export function ditherCoverage(cov: Float32Array, width: number, height: number): Bitmap {
  const work = Float32Array.from(cov);
  const out = createBitmap(width, height);
  const spread = (x: number, y: number, error: number, factor: number): void => {
    if (x < 0 || y < 0 || x >= width || y >= height) return;
    work[y * width + x] = work[y * width + x]! + error * factor;
  };
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      const old = work[i]!;
      const next = old >= 0.5 ? 1 : 0;
      out.data[i] = next;
      const error = old - next;
      spread(x + 1, y, error, 7 / 16);
      spread(x - 1, y + 1, error, 3 / 16);
      spread(x, y + 1, error, 5 / 16);
      spread(x + 1, y + 1, error, 1 / 16);
    }
  }
  return out;
}

/** Square convenience wrapper around {@link resample}. */
export function downsample(source: Bitmap, size: number, threshold = 0.5): Bitmap {
  return resample(source, size, size, threshold);
}

/** Count of orthogonally adjacent ink pixels. */
export function neighbours(bitmap: Bitmap, x: number, y: number): number {
  return at(bitmap, x - 1, y) + at(bitmap, x + 1, y) + at(bitmap, x, y - 1) + at(bitmap, x, y + 1);
}

/**
 * Remove salt and pepper: drop ink with no orthogonal neighbour, and fill paper
 * surrounded on all four sides.
 *
 * A single stray pixel is the worst thing that can happen to a small nonogram.
 * It adds a `1` to two different clue lines, contributes nothing to the
 * picture, and is invariably the last cell the player finds.
 */
export function cleanup(bitmap: Bitmap, rounds = 2): Bitmap {
  let current = bitmap;
  for (let r = 0; r < rounds; r++) {
    // Fill first, strip second — never both at once. A diamond outline
    // (`.#.` / `#.#` / `.#.`) has four arms that are each orthogonally
    // isolated, so doing both in one step deletes the shape in the very round
    // that was meant to complete it. Completing structure before removing
    // noise is always the safer order.
    const filled = createBitmap(current.width, current.height);
    for (let y = 0; y < current.height; y++) {
      for (let x = 0; x < current.width; x++) {
        const i = y * current.width + x;
        filled.data[i] = current.data[i] === 1 || neighbours(current, x, y) >= 4 ? 1 : 0;
      }
    }
    const stripped = createBitmap(filled.width, filled.height);
    for (let y = 0; y < filled.height; y++) {
      for (let x = 0; x < filled.width; x++) {
        const i = y * filled.width + x;
        stripped.data[i] = filled.data[i] === 1 && neighbours(filled, x, y) > 0 ? 1 : 0;
      }
    }
    current = stripped;
  }
  return current;
}

/** Nearest-neighbour upscale, for comparing a small grid against a reference. */
export function upscale(bitmap: Bitmap, width: number, height: number): Bitmap {
  const out = createBitmap(width, height);
  for (let y = 0; y < height; y++) {
    const sy = Math.min(bitmap.height - 1, Math.floor((y * bitmap.height) / height));
    for (let x = 0; x < width; x++) {
      const sx = Math.min(bitmap.width - 1, Math.floor((x * bitmap.width) / width));
      out.data[y * width + x] = bitmap.data[sy * bitmap.width + sx]!;
    }
  }
  return out;
}

/**
 * Intersection over union of the ink of two equally sized bitmaps.
 *
 * This is the "does it still look like the original" measure. Two empty
 * bitmaps score 1: nothing was lost.
 */
export function iou(a: Bitmap, b: Bitmap): number {
  if (a.width !== b.width || a.height !== b.height) {
    throw new Error(`cannot compare ${a.width}x${a.height} with ${b.width}x${b.height}`);
  }
  let intersection = 0;
  let union = 0;
  for (let i = 0; i < a.data.length; i++) {
    const p = a.data[i]!;
    const q = b.data[i]!;
    if (p && q) intersection++;
    if (p || q) union++;
  }
  return union === 0 ? 1 : intersection / union;
}
