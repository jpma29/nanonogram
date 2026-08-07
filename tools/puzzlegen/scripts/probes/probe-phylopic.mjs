/**
 * Sample PhyloPic and see how many of its silhouettes survive the pipeline.
 *
 * PhyloPic exists to *be* silhouettes — phylogenetic ones, one per species or
 * clade, transparent background, solid fill. That is exactly what
 * `rasterizeSvg`'s alpha test expects, just delivered as PNG instead of icon
 * SVG. This is the single most promising new source of the four we scoped.
 *
 * ## Caveat — verify the API shape before trusting this end to end
 *
 * I could not get a live JSON sample from PhyloPic through the sandbox this
 * was written in (its `application/vnd.phylopic.v2+json` content type made my
 * fetch tool treat it as opaque binary). The endpoints and field names below
 * are PhyloPic v2 API's documented shape, not something I confirmed against a
 * real response. Run this with `--debug` first: it dumps the raw JSON of the
 * first list page and the first image record to `_probe-cache/phylopic-debug/`
 * so you can eyeball the actual field names before trusting the rest of the
 * run. If a field is named differently, it's a one-line fix in `toRecord()`.
 *
 * Usage:
 *   cd tools/puzzlegen
 *   pnpm add -D sharp
 *   pnpm build   # needs ../dist/index.js from the workspace build
 *   node scripts/probes/probe-phylopic.mjs --debug     # inspect the shape first
 *   node scripts/probes/probe-phylopic.mjs 80          # then sample 80 images
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { contentCrop, dedupe, generateFrom } from '../../dist/index.js';
import { CACHE_ROOT, classifyRaster, fetchCached, fetchImage, inkShare, sleep, writeReport } from './probe-common.mjs';

// No `/api/v2` path segment — that 404s/403s. The version lives in the media
// type (`application/vnd.phylopic.v2+json`), not the URL. Confirmed live: the
// bare root redirects to `?build=<n>`, and `/images` off the bare root is the
// real listing endpoint.
const API = 'https://api.phylopic.org';

/** PhyloPic licenses worth keeping. NC stays excluded — nanonogram won't be
 * commercial itself, but the policy is about not forbidding others from
 * hosting or bundling it commercially. SA is allowed: license is tracked per
 * puzzle (`SourceAttribution.license`), so one SA image doesn't obligate the
 * rest of the pack. */
const REDISTRIBUTABLE = [
  'https://creativecommons.org/publicdomain/zero/1.0/',
  'https://creativecommons.org/licenses/by/4.0/',
  'https://creativecommons.org/licenses/by/3.0/',
  'https://creativecommons.org/licenses/by-sa/4.0/',
  'https://creativecommons.org/licenses/by-sa/3.0/',
  'https://creativecommons.org/publicdomain/mark/1.0/',
];

/** PhyloPic does content negotiation on `Accept` and 403s a plain request
 * without it — this is what the earlier 403 on the API root turned out to be. */
const PHYLOPIC_HEADERS = { Accept: 'application/vnd.phylopic.v2+json' };

async function getBuild() {
  const root = await fetchCached(API, { headers: PHYLOPIC_HEADERS });
  return root.build;
}

async function listImages(build, page, pageSize) {
  // No `embed_*` param here — confirmed live that `embed_specificNode=true`
  // 400s. Left out until --debug shows the real embed syntax, if any.
  const url = `${API}/images?build=${build}&page=${page}&pageSize=${pageSize}`;
  return fetchCached(url, { headers: PHYLOPIC_HEADERS });
}

async function getImage(build, href) {
  // Confirmed live: list items already come as `{ href: "/images/<uuid>?build=545", title }`
  // — the build param is baked in, appending another `?build=` would double it up.
  const url = href.includes('?') ? `${API}${href}` : `${API}${href}?build=${build}`;
  return fetchCached(url, { headers: PHYLOPIC_HEADERS });
}

/** Best-effort mapping from a PhyloPic image record to what we need. Adjust
 * the field paths here if `--debug` shows a different shape. */
function toRecord(image) {
  const license = image._links?.license?.href ?? null;
  const rasters = image._links?.rasterFiles ?? [];
  // Prefer something in the 256-1024px range: big enough to threshold cleanly,
  // small enough not to waste bandwidth on a sample sweep.
  const best =
    rasters.find((r) => r.sizes && /^(512|1024)x/.test(r.sizes)) ?? rasters[rasters.length - 1] ?? rasters[0];
  const title =
    image._links?.specificNode?.title ??
    image.attribution ??
    image.uuid ??
    'untitled';
  return {
    id: image.uuid,
    title,
    license,
    // Confirmed live: the artist's name is the top-level `attribution` string,
    // not `contributor` — that field only exists nested under `_links` as an
    // href+title pair, kept here as a fallback.
    author: image.attribution ?? image._links?.contributor?.title ?? null,
    imageHref: best?.href ?? null,
  };
}

function listItems(list) {
  // Confirmed live shape: HAL-style, items live at `_links.items`, each one
  // `{ href, title }` with no further nesting.
  return list._links?.items ?? list.items ?? list._embedded?.items ?? list.data ?? [];
}

async function debugDump() {
  const build = await getBuild();
  const list = await listImages(build, 0, 5);
  mkdirSync(join(CACHE_ROOT, 'phylopic-debug'), { recursive: true });
  writeFileSync(join(CACHE_ROOT, 'phylopic-debug', 'list-page-0.json'), JSON.stringify(list, null, 2));
  const first = listItems(list)[0];
  if (first) {
    const full = await getImage(build, first.href);
    writeFileSync(join(CACHE_ROOT, 'phylopic-debug', 'image-0.json'), JSON.stringify(full, null, 2));
    console.log('Dumped list-page-0.json and image-0.json. Inspect image-0.json, then adjust toRecord() if the license/rasterFiles paths differ.');
  } else {
    console.log('List response did not contain an items array where expected — dumped list-page-0.json anyway.');
  }
}

async function main() {
  const args = process.argv.slice(2);
  if (args.includes('--debug')) {
    await debugDump();
    return;
  }
  const sample = Number(args[0] ?? 60);

  const build = await getBuild();
  console.log(`PhyloPic build ${build}. Sampling ${sample} images…`);

  const list = await listImages(build, 0, sample);
  const items = listItems(list);
  if (items.length === 0) {
    console.error('No items found in the list response. Run with --debug and inspect the dump.');
    process.exit(1);
  }

  const rows = [];
  const candidates = [];

  for (const item of items) {
    let full;
    try {
      full = await getImage(build, item.href);
    } catch (err) {
      rows.push({ ok: false, id: href, gate: 'fetch', reason: String(err) });
      continue;
    }
    const record = toRecord(full);
    if (!record.license || !REDISTRIBUTABLE.includes(record.license)) {
      rows.push({ ok: false, id: record.id, gate: 'license', reason: record.license ?? 'no license' });
      continue;
    }
    if (!record.imageHref) {
      rows.push({ ok: false, id: record.id, gate: 'no-raster', reason: 'no raster file listed' });
      continue;
    }

    let buffer;
    try {
      buffer = await fetchImage(record.imageHref);
    } catch (err) {
      rows.push({ ok: false, id: record.id, gate: 'download', reason: String(err) });
      continue;
    }

    let bitmap;
    try {
      bitmap = contentCrop(await classifyRaster(buffer));
    } catch (err) {
      rows.push({ ok: false, id: record.id, gate: 'decode', reason: String(err) });
      continue;
    }
    if (inkShare(bitmap) === 0) {
      rows.push({ ok: false, id: record.id, gate: 'blank', reason: 'no opaque pixels found' });
      continue;
    }

    const outcome = generateFrom(bitmap, {
      id: record.id,
      title: record.title,
      license: record.license,
      source: 'phylopic',
      author: record.author,
    });

    if (!outcome.ok) {
      rows.push({ ok: false, id: record.id, gate: outcome.rejection.gate, reason: outcome.rejection.reason });
      continue;
    }

    candidates.push({ grid: outcome.puzzle.grid, value: { record, outcome }, score: -outcome.puzzle.edits });
    await sleep(150); // be polite — this is a shared, donation-funded API
  }

  const { kept, dropped } = dedupe(candidates);
  for (const value of kept) {
    const p = value.outcome.puzzle;
    rows.push({
      ok: true,
      id: value.record.id,
      title: value.record.title,
      license: value.record.license,
      width: p.width,
      height: p.height,
      difficulty: p.difficulty,
      edits: p.edits,
    });
  }
  for (const { value, duplicateOf } of dropped) {
    rows.push({ ok: false, id: value.record.id, gate: 'duplicate', reason: `near-duplicate of ${duplicateOf.record.id}` });
  }

  writeReport('phylopic', rows);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
