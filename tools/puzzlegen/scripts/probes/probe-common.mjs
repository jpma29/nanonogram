/**
 * Shared plumbing for the source-probe scripts (PhyloPic, Wikimedia Commons,
 * museum "silhouette" collections).
 *
 * These are siblings of `sweep-sources.mjs` but for sources that are not one
 * npm package: they hit real network APIs, so they need fetching, retrying,
 * on-disk caching (never re-download the same URL twice), and — the part
 * `sweep-sources.mjs` didn't need — decoding PNG/JPEG into a {@link Bitmap},
 * since `raster.ts` only knows how to rasterise SVG.
 *
 * Requires `sharp` as a dev dependency of this package:
 *   pnpm add -D sharp
 *
 * All probes assume `pnpm -r build` has already produced `../../dist/index.js`.
 */

import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const HERE = dirname(fileURLToPath(import.meta.url));
export const PUZZLEGEN_ROOT = join(HERE, '..', '..');
export const CACHE_ROOT = join(PUZZLEGEN_ROOT, '_probe-cache');

/** A polite, identifiable User-Agent. Wikimedia in particular will throttle
 * or block requests that don't have one. Put a real contact in here. */
export const USER_AGENT = 'nanonogram-puzzlegen-probe/0.1 (contact: juan.arias@cpic.or.cr)';

export function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function cachePath(url) {
  const hash = createHash('sha1').update(url).digest('hex');
  return join(CACHE_ROOT, 'http', hash.slice(0, 2), hash);
}

/**
 * GET a URL with retry, backoff, and a permanent on-disk cache keyed by URL.
 * Re-running a probe after tweaking its filters costs zero extra network
 * calls for anything already fetched.
 */
export async function fetchCached(url, { json = true, headers = {}, retries = 5, timeoutMs = 20000 } = {}) {
  const file = cachePath(url) + (json ? '.json' : '.bin');
  if (existsSync(file)) {
    const raw = readFileSync(file);
    return json ? JSON.parse(raw.toString('utf8')) : raw;
  }
  let lastErr;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      // Node's fetch has no default timeout — a connection that stalls
      // instead of erroring (seen against AIC's image server) hangs forever
      // without this. AbortSignal.timeout turns that into a normal retryable
      // failure instead of a script that never finishes.
      const res = await fetch(url, {
        headers: { 'User-Agent': USER_AGENT, ...headers },
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (!res.ok) {
        // 429 means "you're going too fast", not "this is broken" — back off
        // much harder than a normal error, and honour Retry-After if the
        // server bothered to send one (upload.wikimedia.org sometimes does).
        if (res.status === 429) {
          const retryAfter = Number(res.headers.get('retry-after'));
          // Capped — an uncapped exponential backoff (3s, 6s, 12s, 24s, 48s,
          // 96s...) across `retries` attempts can add up to several minutes
          // per file with no output in between, which is indistinguishable
          // from a genuine hang. 10s is enough to be polite without that.
          const wait = Number.isFinite(retryAfter) ? Math.min(retryAfter * 1000, 15000) : Math.min(3000 * 2 ** attempt, 10000);
          await sleep(wait);
          continue;
        }
        throw new Error(`HTTP ${res.status} on ${url}`);
      }
      const body = json ? Buffer.from(JSON.stringify(await res.json())) : Buffer.from(await res.arrayBuffer());
      mkdirSync(dirname(file), { recursive: true });
      writeFileSync(file, body);
      return json ? JSON.parse(body.toString('utf8')) : body;
    } catch (err) {
      lastErr = err;
      await sleep(500 * 2 ** attempt);
    }
  }
  throw lastErr;
}

/** Download raw bytes (image, not JSON), same caching contract as {@link fetchCached}.
 * A fixed pause before every download, on top of retry/backoff, because the
 * failure mode we actually hit (429 from upload.wikimedia.org) is about
 * sustained request rate, not burst size — retrying faster doesn't help if
 * the next 79 requests are still coming in too fast. */
export async function fetchImage(url, opts = {}) {
  await sleep(250);
  return fetchCached(url, { ...opts, json: false, retries: opts.retries ?? 6 });
}

/**
 * Decode a PNG/JPEG/WebP buffer into a {@link Bitmap} the pipeline understands.
 *
 * Superseded by {@link classifyRaster} below for anything new — this needs
 * the caller to already know (or guess) which mode applies, which is exactly
 * the assumption that turned out wrong for flattened images without a real
 * alpha channel. Kept as the low-level primitive `classifyRaster` builds on.
 *
 * Two modes, matching the two kinds of source we're probing:
 *  - `alpha`   — transparent PNGs (PhyloPic exports, sprite sheets). Ink is
 *                "this pixel isn't transparent", exactly like `rasterizeSvg`.
 *  - `luminance` — flattened photos with no alpha (museum JPEGs, scanned
 *                silhouette prints). Ink is "this pixel is dark", which is
 *                the right call for the actual case we're chasing — black
 *                cut-paper silhouettes on a light mat — but is a guess for
 *                anything else. `invert: true` flips it for light-on-dark
 *                material.
 *
 * Unlike `rasterizeSvg`, there is no `contentCrop` call here — callers should
 * do that themselves after deciding the bitmap looks sane, so a bad decode is
 * easy to eyeball before it's silently cropped to a 1x1 speck.
 */
/**
 * Does this image actually carry transparency, as opposed to being flattened
 * (JPEG, or a PNG that never had an alpha channel)? `sharp`'s `.ensureAlpha()`
 * *adds* a fully-opaque channel to anything that lacks one, so checking ink
 * share on the result can't tell real transparency apart from "there was
 * never any alpha to begin with" — both look like 100% opaque. This checks
 * the source metadata instead of inferring it from the decode.
 */
export async function hasAlphaChannel(buffer) {
  const meta = await sharp(buffer).metadata();
  return Boolean(meta.hasAlpha);
}

export async function decodeImageToBitmap(buffer, { mode = 'alpha', threshold = 0.5, invert = false } = {}) {
  const image = sharp(buffer).ensureAlpha();
  const { data, info } = await image.raw().toBuffer({ resolveWithObject: true });
  const { width, height, channels } = info; // channels is 4 after ensureAlpha()
  const bits = new Uint8Array(width * height);
  const cutoff = threshold * 255;

  for (let i = 0; i < width * height; i++) {
    const r = data[i * channels];
    const g = data[i * channels + 1];
    const b = data[i * channels + 2];
    const a = data[i * channels + 3];
    let ink;
    if (mode === 'alpha') {
      ink = a >= cutoff;
    } else {
      const luminance = 0.299 * r + 0.587 * g + 0.114 * b;
      ink = luminance <= cutoff; // dark pixel = ink, by default
    }
    if (invert) ink = !ink;
    bits[i] = ink ? 1 : 0;
  }
  return { width, height, data: bits };
}

/** Share of pixels that are ink. Cheap sanity check before running the full pipeline. */
export function inkShare(bitmap) {
  let n = 0;
  for (let i = 0; i < bitmap.data.length; i++) n += bitmap.data[i];
  return bitmap.data.length === 0 ? 0 : n / bitmap.data.length;
}

/**
 * For flattened photos we don't actually know whether the subject is dark on
 * light or light on dark. Decode both ways and keep whichever lands closer to
 * a playable fill share — the fidelity/quality gates will reject it later
 * regardless, this just avoids reflexively rejecting every silhouette because
 * we guessed the polarity backwards.
 *
 * Superseded by {@link classifyRaster} for new code — this only looks at
 * luminance, so a colourful subject on a colourful background (neither one
 * reliably "darker") still fools it. Kept around because it's simple and
 * still fine for genuine black-on-white/white-on-black material.
 */
export async function decodeBestPolarity(buffer, target = 0.4) {
  const normal = await decodeImageToBitmap(buffer, { mode: 'luminance', invert: false });
  const flipped = await decodeImageToBitmap(buffer, { mode: 'luminance', invert: true });
  const dn = Math.abs(inkShare(normal) - target);
  const df = Math.abs(inkShare(flipped) - target);
  return df < dn ? flipped : normal;
}

// ---------------------------------------------------------------------------
// classifyRaster — the general replacement for the mode-guessing above.
// ---------------------------------------------------------------------------

function colorDistance(r1, g1, b1, r2, g2, b2) {
  const dr = r1 - r2;
  const dg = g1 - g2;
  const db = b1 - b2;
  return Math.sqrt(dr * dr + dg * dg + db * db);
}

/** Most common colour among a list of `[r,g,b]` samples, bucketed coarsely so
 * near-identical anti-aliased shades count as the same colour. Approximates
 * "the shape's fill colour" or "the background colour" without a real
 * clustering library — reasonable for the mostly-one-or-two-colour icon and
 * silhouette material this is built for, not for photographs of scenery. */
function dominantColor(samples, bucket = 24) {
  const counts = new Map();
  for (const [r, g, b] of samples) {
    const key = `${Math.floor(r / bucket)},${Math.floor(g / bucket)},${Math.floor(b / bucket)}`;
    const entry = counts.get(key) ?? { n: 0, r: 0, g: 0, b: 0 };
    entry.n++;
    entry.r += r;
    entry.g += g;
    entry.b += b;
    counts.set(key, entry);
  }
  let best = null;
  for (const entry of counts.values()) if (!best || entry.n > best.n) best = entry;
  if (!best) return null;
  return { r: best.r / best.n, g: best.g / best.n, b: best.b / best.n };
}

/**
 * No real alpha channel — a flattened JPEG, or a PNG that was always opaque.
 * Sample the outer ring of pixels to find the actual background colour
 * (not just "assume it's light and the subject is dark", which is wrong for
 * a light subject on a dark background, or a colour photo where neither is
 * particularly dark). Every pixel far enough from that colour is the shape.
 *
 * If the border itself isn't consistently one colour — the subject touches
 * the edge, or it's a busy photograph with no clean margin — there's no
 * reliable background to detect, and this falls back to the old darkness
 * guess rather than pretending confidence it doesn't have.
 */
function classifyByBackground(data, width, height, channels) {
  const at = (x, y) => {
    const i = (y * width + x) * channels;
    return [data[i], data[i + 1], data[i + 2]];
  };
  const border = [];
  for (let x = 0; x < width; x++) {
    border.push(at(x, 0));
    border.push(at(x, height - 1));
  }
  for (let y = 0; y < height; y++) {
    border.push(at(0, y));
    border.push(at(width - 1, y));
  }

  const bg = dominantColor(border);
  const CONSISTENCY_THRESHOLD = 40;
  const consistent = border.filter(([r, g, b]) => colorDistance(r, g, b, bg.r, bg.g, bg.b) < CONSISTENCY_THRESHOLD);
  const borderConsistency = consistent.length / border.length;

  const bits = new Uint8Array(width * height);
  if (borderConsistency >= 0.7) {
    for (let i = 0; i < width * height; i++) {
      const r = data[i * channels];
      const g = data[i * channels + 1];
      const b = data[i * channels + 2];
      bits[i] = colorDistance(r, g, b, bg.r, bg.g, bg.b) >= CONSISTENCY_THRESHOLD ? 1 : 0;
    }
    return { width, height, data: bits, method: 'background-distance' };
  }

  // No clean border to trust — fall back to the darkness guess, both ways,
  // same idea as decodeBestPolarity but without a second full decode pass.
  const target = 0.4;
  const dark = new Uint8Array(width * height);
  const light = new Uint8Array(width * height);
  for (let i = 0; i < width * height; i++) {
    const r = data[i * channels];
    const g = data[i * channels + 1];
    const b = data[i * channels + 2];
    const luminance = 0.299 * r + 0.587 * g + 0.114 * b;
    dark[i] = luminance <= 127.5 ? 1 : 0;
    light[i] = luminance > 127.5 ? 1 : 0;
  }
  const share = (arr) => arr.reduce((n, v) => n + v, 0) / arr.length;
  const useDark = Math.abs(share(dark) - target) <= Math.abs(share(light) - target);
  return { width, height, data: useDark ? dark : light, method: 'luminance-fallback' };
}

/**
 * Has a real alpha channel. Transparent pixels are background, unambiguously.
 * Among the opaque ones, find the dominant fill colour and treat opaque
 * pixels that are *both* on the boundary (touching a transparent neighbour)
 * *and* far from that colour as clipping artefacts — a stray antialiasing
 * fringe or a mis-cut border — rather than part of the shape. Everything else
 * opaque is the shape.
 *
 * This is a heuristic, not a segmentation algorithm: a genuinely multicolour
 * icon (a two-tone flag, say) will have some of its legitimate second colour
 * misread as a clipping artefact if it happens to sit on the boundary. For
 * the single-fill-colour silhouettes and pictograms this pipeline is scoring
 * against, that trade-off comes up rarely and costs little when it does.
 */
function classifyByAlphaWithClipping(data, width, height, channels, alphaCutoff = 0.5) {
  const cutoff = alphaCutoff * 255;
  const n = width * height;
  const opaque = new Uint8Array(n);
  const samples = [];
  for (let i = 0; i < n; i++) {
    if (data[i * channels + 3] >= cutoff) {
      opaque[i] = 1;
      samples.push([data[i * channels], data[i * channels + 1], data[i * channels + 2]]);
    }
  }
  const dom = dominantColor(samples) ?? { r: 0, g: 0, b: 0 };
  const CLIP_THRESHOLD = 60;

  const bits = new Uint8Array(n);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      if (!opaque[i]) continue; // stays 0
      const isBoundary =
        (x > 0 && !opaque[i - 1]) ||
        (x < width - 1 && !opaque[i + 1]) ||
        (y > 0 && !opaque[i - width]) ||
        (y < height - 1 && !opaque[i + width]);
      const r = data[i * channels];
      const g = data[i * channels + 1];
      const b = data[i * channels + 2];
      const isClip = isBoundary && colorDistance(r, g, b, dom.r, dom.g, dom.b) >= CLIP_THRESHOLD;
      bits[i] = isClip ? 0 : 1;
    }
  }
  return { width, height, data: bits, method: 'alpha-with-clip-detection' };
}

/**
 * The general-purpose raster classifier: figures out which of the three
 * cases a PNG/JPEG/WebP falls into and routes to the matching strategy.
 * Vector sources don't go through here at all — `rasterizeSvg` already
 * handles those correctly by construction (alpha, no clipping to detect,
 * nothing to guess).
 *
 *  - Real alpha channel → {@link classifyByAlphaWithClipping}: transparency
 *    is the background, and the boundary gets checked for mis-cut fringes.
 *  - No alpha channel → {@link classifyByBackground}: detect the actual
 *    background colour from the image's border and classify by distance to
 *    it, instead of assuming dark-on-light.
 *
 * Not cropped — same convention as the lower-level functions it replaces,
 * so a bad classification is visible before it gets silently cropped away.
 *
 * Two defensive measures against source images with no size limit (museum
 * archival photography can be huge, or oddly proportioned — a tall scroll at
 * a fixed width comes out very tall): the raw pixel buffer is capped at 1024px
 * on the long side before the per-pixel loops run, and the whole call is
 * raced against a timeout, because a stuck native decode wouldn't otherwise
 * surface as anything but the whole script hanging.
 */
async function classifyRasterInner(buffer) {
  const meta = await sharp(buffer).metadata();
  const { data, info } = await sharp(buffer)
    .resize({ width: 1024, height: 1024, fit: 'inside', withoutEnlargement: true })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const { width, height, channels } = info;
  return meta.hasAlpha
    ? classifyByAlphaWithClipping(data, width, height, channels)
    : classifyByBackground(data, width, height, channels);
}

export async function classifyRaster(buffer, timeoutMs = 15000) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`classifyRaster timed out after ${timeoutMs}ms`)), timeoutMs);
  });
  try {
    return await Promise.race([classifyRasterInner(buffer), timeout]);
  } finally {
    clearTimeout(timer);
  }
}

/** Write a JSONL results file plus a plain-text summary, the same shape for every probe. */
export function writeReport(name, rows) {
  mkdirSync(CACHE_ROOT, { recursive: true });
  const jsonlPath = join(CACHE_ROOT, `${name}.jsonl`);
  writeFileSync(jsonlPath, rows.map((r) => JSON.stringify(r)).join('\n') + '\n');

  const accepted = rows.filter((r) => r.ok);
  const byGate = {};
  for (const r of rows.filter((r) => !r.ok)) byGate[r.gate] = (byGate[r.gate] ?? 0) + 1;

  const lines = [
    `# ${name}`,
    `sampled: ${rows.length}`,
    `accepted: ${accepted.length} (${((accepted.length / Math.max(rows.length, 1)) * 100).toFixed(1)}%)`,
    `rejected by gate: ${JSON.stringify(byGate)}`,
    '',
    'accepted items:',
    ...accepted.map(
      (r) => `  ${r.id}  ${r.width}x${r.height}  difficulty=${r.difficulty}  license=${r.license}`,
    ),
  ];
  const txtPath = join(CACHE_ROOT, `${name}.summary.txt`);
  writeFileSync(txtPath, lines.join('\n') + '\n');
  console.log(lines.join('\n'));
  console.log(`\nFull results: ${jsonlPath}`);
}
