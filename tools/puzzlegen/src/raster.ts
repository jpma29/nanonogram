/**
 * The only module that knows what an image is.
 *
 * Everything else in this package works on {@link Bitmap}s, so the pipeline can
 * be tested without rendering anything and a different source format only ever
 * needs a new function here.
 */

import { readFileSync } from 'node:fs';
import { Resvg } from '@resvg/resvg-js';
import { type Bitmap, contentCrop, createBitmap } from './bitmap.js';

/** Side length of the reference render. Fidelity is judged against this. */
export const REFERENCE_SIZE = 256;

/**
 * Render an SVG to a square binary reference bitmap.
 *
 * The alpha channel is what matters, not luminance: icon sets draw with
 * `fill="currentColor"` on a transparent background, so "is there ink here" is
 * "is this pixel opaque".
 */
export function rasterizeSvg(svg: string, size = REFERENCE_SIZE, alphaCutoff = 0.5): Bitmap {
  const resvg = new Resvg(svg, { fitTo: { mode: 'width', value: size } });
  const rendered = resvg.render();
  const { width, height, pixels } = rendered;

  const bitmap = createBitmap(width, height);
  const cutoff = alphaCutoff * 255;
  for (let i = 0; i < width * height; i++) {
    bitmap.data[i] = pixels[i * 4 + 3]! >= cutoff ? 1 : 0;
  }
  return contentCrop(bitmap);
}

/** Read and rasterise an SVG file. */
export function rasterizeSvgFile(path: string, size = REFERENCE_SIZE): Bitmap {
  return rasterizeSvg(readFileSync(path, 'utf8'), size);
}
