/**
 * Sample the "silhouette" corner of four open-access museum APIs.
 *
 * The blanket catalogues of these museums are photographs — a much harder
 * shape to binarise than born-digital vector art, even with background-colour
 * detection (`classifyRaster` in probe-common.mjs) instead of a flat
 * dark-on-light guess. But all four
 * hold actual cut-paper silhouette portraits (an 18th/19th-century genre:
 * black paper, light mat, unmistakably high-contrast), and searching each
 * catalogue for that word specifically targets that genre instead of the
 * general collection. This probe only samples that slice, on purpose.
 *
 * These are photographs of physical objects, not born-digital vector art, so
 * expect a much lower acceptance rate than PhyloPic or Wikimedia — matting,
 * framing, aging, and photography angle all fight the fidelity gate. That's
 * the thing this probe exists to measure rather than guess at.
 *
 * ## Caveats
 *  - Met and Cleveland were confirmed reachable and shaped as coded below.
 *  - Art Institute of Chicago's search endpoint was confirmed; image URLs are
 *    built from `config.iiif_url`, also confirmed.
 *  - Smithsonian's search endpoint responds, but I could not confirm the
 *    shape of a record that actually carries a usable image URL (the sample
 *    results I saw during scoping were library catalogue entries without
 *    media). `extractSmithsonianImage()` below is a best-effort reading of
 *    their documented schema — verify against `--debug smithsonian` before
 *    trusting the full run. Get a free API key at https://api.data.gov/signup
 *    (the public `DEMO_KEY` is capped at ~30 requests/hour) and export it:
 *      export SI_API_KEY=your-key-here
 *
 * Usage:
 *   cd tools/puzzlegen
 *   pnpm add -D sharp
 *   pnpm build
 *   node scripts/probes/probe-museum-silhouettes.mjs --debug smithsonian
 *   node scripts/probes/probe-museum-silhouettes.mjs met 60
 *   node scripts/probes/probe-museum-silhouettes.mjs aic 60
 *   node scripts/probes/probe-museum-silhouettes.mjs cleveland 60
 *   node scripts/probes/probe-museum-silhouettes.mjs smithsonian 60
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { contentCrop, dedupe, generateFrom } from '../../dist/index.js';
import { CACHE_ROOT, classifyRaster, fetchCached, fetchImage, inkShare, sleep, writeReport } from './probe-common.mjs';

const QUERY = 'silhouette';

// ---------------------------------------------------------------------------
// Met Museum
// ---------------------------------------------------------------------------
async function listMet(limit) {
  const search = await fetchCached(
    `https://collectionapi.metmuseum.org/public/collection/v1/search?q=${QUERY}&isPublicDomain=true`,
  );
  const ids = (search.objectIDs ?? []).slice(0, limit);
  const records = [];
  for (const id of ids) {
    let obj;
    try {
      obj = await fetchCached(`https://collectionapi.metmuseum.org/public/collection/v1/objects/${id}`);
    } catch {
      // Search index and object records drift out of sync sometimes — a
      // 404 here just means this one ID no longer resolves, not that
      // anything is wrong with the sweep. Skip it and keep going.
      await sleep(80);
      continue;
    }
    if (!obj.isPublicDomain || !obj.primaryImage) continue;
    records.push({
      id: `met-${obj.objectID}`,
      title: obj.title || `Met ${obj.objectID}`,
      license: 'Public Domain (Met Open Access)',
      author: obj.artistDisplayName || null,
      imageUrl: obj.primaryImageSmall || obj.primaryImage,
    });
    await sleep(80);
  }
  return records;
}

// ---------------------------------------------------------------------------
// Art Institute of Chicago
// ---------------------------------------------------------------------------
async function listAic(limit) {
  const res = await fetchCached(
    `https://api.artic.edu/api/v1/artworks/search?q=${QUERY}&limit=${limit}&fields=id,title,image_id,is_public_domain,artist_display`,
  );
  const iiif = res.config?.iiif_url ?? 'https://www.artic.edu/iiif/2';
  return (res.data ?? [])
    .filter((a) => a.is_public_domain && a.image_id)
    .map((a) => ({
      id: `aic-${a.id}`,
      title: a.title || `AIC ${a.id}`,
      license: 'CC0 (Art Institute of Chicago)',
      author: a.artist_display || null,
      imageUrl: `${iiif}/${a.image_id}/full/843,/0/default.jpg`,
    }));
}

// ---------------------------------------------------------------------------
// Cleveland Museum of Art
// ---------------------------------------------------------------------------
async function listCleveland(limit) {
  const res = await fetchCached(
    `https://openaccess-api.clevelandart.org/api/artworks/?q=${QUERY}&limit=${limit}&cc0=1`,
  );
  return (res.data ?? [])
    .filter((a) => a.share_license_status === 'CC0' && a.images?.web?.url)
    .map((a) => ({
      id: `cma-${a.id}`,
      title: a.title || `CMA ${a.id}`,
      license: 'CC0 (Cleveland Museum of Art)',
      author: a.creators?.[0]?.description ?? null,
      imageUrl: a.images.web.url,
    }));
}

// ---------------------------------------------------------------------------
// Smithsonian Open Access — see the caveat in the file header.
// ---------------------------------------------------------------------------
function extractSmithsonianImage(row) {
  const media = row.content?.descriptiveNonRepeating?.online_media?.media;
  if (!Array.isArray(media)) return null;
  const image = media.find((m) => m.type === 'Images') ?? media[0];
  return image?.content ?? image?.resources?.[0]?.url ?? null;
}

async function listSmithsonian(limit) {
  const apiKey = process.env.SI_API_KEY ?? 'DEMO_KEY';
  const res = await fetchCached(
    `https://api.si.edu/openaccess/api/v1.0/search?q=${QUERY}&rows=${limit}&api_key=${apiKey}`,
  );
  const rows = res.response?.rows ?? [];
  return rows
    .filter((r) => r.content?.descriptiveNonRepeating?.metadata_usage?.access === 'CC0')
    .map((r) => ({ id: `si-${r.id}`, title: r.title, license: 'CC0 (Smithsonian)', author: null, imageUrl: extractSmithsonianImage(r) }))
    .filter((r) => r.imageUrl);
}

async function debugSmithsonian() {
  const apiKey = process.env.SI_API_KEY ?? 'DEMO_KEY';
  const res = await fetchCached(`https://api.si.edu/openaccess/api/v1.0/search?q=${QUERY}&rows=5&api_key=${apiKey}`);
  mkdirSync(join(CACHE_ROOT, 'smithsonian-debug'), { recursive: true });
  writeFileSync(join(CACHE_ROOT, 'smithsonian-debug', 'sample.json'), JSON.stringify(res, null, 2));
  console.log('Dumped smithsonian-debug/sample.json — check whether `content.descriptiveNonRepeating.online_media` exists on any row, and fix extractSmithsonianImage() if the path differs.');
}

const SOURCES = { met: listMet, aic: listAic, cleveland: listCleveland, smithsonian: listSmithsonian };

async function main() {
  const args = process.argv.slice(2);
  if (args[0] === '--debug') {
    if (args[1] === 'smithsonian') await debugSmithsonian();
    else console.log('Only smithsonian has a --debug mode; met/aic/cleveland were confirmed live during scoping.');
    return;
  }

  const source = args[0];
  const limit = Number(args[1] ?? 60);
  const lister = SOURCES[source];
  if (!lister) {
    console.error(`Usage: node probe-museum-silhouettes.mjs <${Object.keys(SOURCES).join('|')}> [limit=60]`);
    process.exit(1);
  }

  console.log(`Searching ${source} for "${QUERY}", up to ${limit}…`);
  const records = await lister(limit);
  console.log(`${records.length} candidates with a usable image.`);

  const rows = [];
  const candidates = [];

  // AIC's image CDN (www.artic.edu/iiif) 403s our descriptive UA — confirmed
  // live. It's a different host than the search API (api.artic.edu), which
  // has no problem with it, so this is a WAF rule on the CDN specifically,
  // not an API key issue. A browser UA + same-site Referer gets past it.
  const imageHeaders =
    source === 'aic'
      ? {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
          Referer: 'https://www.artic.edu/',
        }
      : {};

  for (const [n, record] of records.entries()) {
    process.stdout.write(`  [${n + 1}/${records.length}] ${record.id}… `);
    let buffer;
    try {
      buffer = await fetchImage(record.imageUrl, { headers: imageHeaders });
    } catch (err) {
      console.log(`download failed: ${err.message}`);
      rows.push({ ok: false, id: record.id, gate: 'download', reason: String(err) });
      continue;
    }

    let bitmap;
    try {
      bitmap = contentCrop(await classifyRaster(buffer));
    } catch (err) {
      console.log('decode failed/timed out');
      rows.push({ ok: false, id: record.id, gate: 'decode', reason: String(err) });
      continue;
    }
    if (inkShare(bitmap) === 0) {
      console.log('blank');
      rows.push({ ok: false, id: record.id, gate: 'blank', reason: 'no ink found — background detection likely failed on this one' });
      continue;
    }

    const outcome = generateFrom(bitmap, {
      id: record.id,
      title: record.title,
      license: record.license,
      source: `museum-${source}`,
      author: record.author,
    });

    if (!outcome.ok) {
      console.log(`rejected (${outcome.rejection.gate})`);
      rows.push({ ok: false, id: record.id, gate: outcome.rejection.gate, reason: outcome.rejection.reason });
      continue;
    }
    console.log('accepted');
    candidates.push({ grid: outcome.puzzle.grid, value: { record, outcome }, score: -outcome.puzzle.edits });
    await sleep(150);
  }

  const { kept, dropped } = dedupe(candidates);
  for (const value of kept) {
    const p = value.outcome.puzzle;
    rows.push({ ok: true, id: value.record.id, title: value.record.title, license: value.record.license, width: p.width, height: p.height, difficulty: p.difficulty, edits: p.edits });
  }
  for (const { value, duplicateOf } of dropped) {
    rows.push({ ok: false, id: value.record.id, gate: 'duplicate', reason: `near-duplicate of ${duplicateOf.record.id}` });
  }

  writeReport(`museum-${source}`, rows);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
