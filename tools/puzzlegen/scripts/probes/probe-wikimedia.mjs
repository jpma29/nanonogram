/**
 * Sample Wikimedia Commons categories and see how many survive the pipeline.
 *
 * Commons is not one collection but millions of files across thousands of
 * categories, each with its own per-file license in `extmetadata`. The ones
 * worth sampling are the categories that already curate toward the shape the
 * pipeline wants: solid silhouettes and pictograms, not photographs.
 *
 * The MediaWiki API is well-documented and stable, unlike the other three
 * probes in this folder — this one should work as written. The one thing
 * worth checking first is that the category names below actually exist and
 * are big enough to bother with:
 *
 *   node scripts/probes/probe-wikimedia.mjs --list-categories
 *
 * Then sample one or more:
 *
 *   node scripts/probes/probe-wikimedia.mjs "Silhouette images" 60
 *   node scripts/probes/probe-wikimedia.mjs "SVG pictograms" 60
 *
 * Requires `pnpm add -D sharp` and `pnpm build` first, same as the other probes.
 */

import { contentCrop, dedupe, generateFrom, rasterizeSvg } from '../../dist/index.js';
import { classifyRaster, fetchCached, fetchImage, inkShare, sleep, writeReport } from './probe-common.mjs';

const API = 'https://commons.wikimedia.org/w/api.php';

/** Candidates worth checking. Add or remove freely — this is just a starting
 * list of categories that should skew toward silhouettes/pictograms rather
 * than photographs. Verify with --list-categories before trusting the sizes. */
export const CANDIDATE_CATEGORIES = [
  'Silhouettes', // confirmed live, 0% accepted under the old SA-excluded policy — worth re-running now that SA is allowed
  'SVG pictograms', // confirmed live, 292 files — the best of the general categories so far
  'Silhouettes of crosses',
  'Pictograms',
  // Below: single-author/single-license icon sets hosted on Commons for
  // Wikimedia/OSM projects. Worth trying specifically *because* they're not
  // general community-upload categories — one uploader, one license, applied
  // consistently, unlike "Silhouettes" or "Pictograms". Sizes unconfirmed —
  // run --list-categories before sampling.
  'Maki icons', // Mapbox's OSM icon set, mirrored to Commons
  'Mapnik icons', // OSM's default renderer icon set
  'Tango icons', // the Tango Desktop Project's icon set
  // Not Font Awesome / Tabler — those are already in `@iconify/json` and
  // measured directly in SOURCES.md (fa6-solid 40%, fa-solid 33%) with no
  // network needed; sampling them again here would just duplicate that.
];

/**
 * Licenses worth keeping, matched against `extmetadata.LicenseShortName.value`.
 * Commons spells these inconsistently (version numbers, hyphens vs. spaces),
 * so this is pattern matching, not an exact list.
 *
 * NC is excluded outright — nanonogram won't be commercial itself, but the
 * policy is about not forbidding others from hosting or bundling it
 * commercially. GPL is excluded too: a software licence doing a data
 * licence's job, with no settled answer for what a puzzle derived from a GPL
 * image owes back. SA is allowed: license is tracked per puzzle
 * (`SourceAttribution.license`), so one SA image's obligation stays with
 * that one puzzle instead of spreading to the rest of the pack.
 */
function isRedistributable(licenseShortName) {
  if (!licenseShortName) return false;
  if (/\bNC\b|GPL/i.test(licenseShortName)) return false;
  return /CC0|CC[\s-]?BY|Public domain/i.test(licenseShortName);
}

function apiUrl(params) {
  const url = new URL(API);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  url.searchParams.set('format', 'json');
  return url.toString();
}

async function listCategoryMembers(category, limit) {
  const members = [];
  let cmcontinue;
  while (members.length < limit) {
    const params = {
      action: 'query',
      list: 'categorymembers',
      cmtitle: `Category:${category}`,
      cmtype: 'file',
      cmlimit: String(Math.min(limit - members.length, 500)),
    };
    if (cmcontinue) params.cmcontinue = cmcontinue;
    const res = await fetchCached(apiUrl(params));
    members.push(...(res.query?.categorymembers ?? []));
    cmcontinue = res.continue?.cmcontinue;
    if (!cmcontinue) break;
  }
  return members.slice(0, limit);
}

async function getFileInfo(titles) {
  const params = {
    action: 'query',
    titles: titles.join('|'),
    prop: 'imageinfo',
    iiprop: 'url|mime|extmetadata',
  };
  const res = await fetchCached(apiUrl(params));
  return Object.values(res.query?.pages ?? {});
}

async function listCategoriesMode() {
  for (const category of CANDIDATE_CATEGORIES) {
    const members = await listCategoryMembers(category, 500);
    console.log(`Category:${category} — ${members.length}${members.length === 500 ? '+' : ''} files`);
    await sleep(200);
  }
}

async function processFile(page) {
  const info = page.imageinfo?.[0];
  if (!info) return { ok: false, id: page.title, gate: 'no-imageinfo', reason: 'no imageinfo block' };

  const licenseShortName = info.extmetadata?.LicenseShortName?.value;
  if (!isRedistributable(licenseShortName)) {
    return { ok: false, id: page.title, gate: 'license', reason: licenseShortName ?? 'no license metadata' };
  }

  // Categories mix in things that aren't images at all — .ogg/.ogv (Commons
  // pronunciation/video clips), .pdf, .djvu multi-page scans. Reject those
  // before ever handing them to sharp, which throws on an unsupported format
  // rather than returning an error the caller can branch on.
  const DECODABLE = /^image\/(svg\+xml|png|jpeg|gif|webp|bmp|tiff|avif)$/;
  if (!DECODABLE.test(info.mime ?? '')) {
    return { ok: false, id: page.title, gate: 'unsupported-format', reason: info.mime ?? 'no mime type' };
  }

  // `info.url` carries `?utm_source=...&utm_campaign=imageinfo&...` — analytics
  // params the API adds for humans coming from the search UI. Every sampled
  // file gets the identical utm_campaign value, which looks like scripted
  // traffic to a CDN and seems to be exactly what triggers the 429s. The
  // bare URL (no query string) is the real file and doesn't need them.
  const cleanUrl = info.url.split('?')[0];

  let buffer;
  try {
    buffer = await fetchImage(cleanUrl);
  } catch (err) {
    return { ok: false, id: page.title, gate: 'download', reason: String(err) };
  }

  let bitmap;
  try {
    if (info.mime === 'image/svg+xml') {
      bitmap = rasterizeSvg(buffer.toString('utf8'));
    } else {
      bitmap = contentCrop(await classifyRaster(buffer));
    }
  } catch (err) {
    // Belt and suspenders on top of the mime check — a mislabeled or corrupt
    // file (a stale 429/HTML error page that got cached as .bin, say) should
    // become a rejection row, not take down the whole run.
    return { ok: false, id: page.title, gate: 'decode', reason: String(err) };
  }

  if (inkShare(bitmap) === 0) {
    return { ok: false, id: page.title, gate: 'blank', reason: 'no ink found under either decode mode' };
  }

  const outcome = generateFrom(bitmap, {
    id: page.title,
    title: page.title.replace(/^File:/, '').replace(/\.(svg|png|jpg|jpeg)$/i, ''),
    license: licenseShortName,
    source: 'wikimedia-commons',
    author: info.extmetadata?.Artist?.value ?? null,
  });

  if (!outcome.ok) {
    return { ok: false, id: page.title, gate: outcome.rejection.gate, reason: outcome.rejection.reason };
  }
  return { ok: true, page, outcome };
}

async function main() {
  const args = process.argv.slice(2);
  if (args.includes('--list-categories')) {
    await listCategoriesMode();
    return;
  }

  const category = args[0];
  const sample = Number(args[1] ?? 60);
  if (!category) {
    console.error('Usage: node probe-wikimedia.mjs "<Category name>" [sample=60]');
    console.error('   or: node probe-wikimedia.mjs --list-categories');
    process.exit(1);
  }

  const members = await listCategoryMembers(category, sample);
  console.log(`Category:${category} — sampling ${members.length} files…`);

  const rows = [];
  const candidates = [];

  // Batch file-info lookups (up to 50 titles per call is the MediaWiki limit).
  for (let i = 0; i < members.length; i += 50) {
    const batch = members.slice(i, i + 50);
    const pages = await getFileInfo(batch.map((m) => m.title));
    for (const page of pages) {
      const result = await processFile(page);
      if (result.ok) {
        candidates.push({ grid: result.outcome.puzzle.grid, value: result, score: -result.outcome.puzzle.edits });
      } else {
        rows.push(result);
      }
      await sleep(100);
    }
  }

  const { kept, dropped } = dedupe(candidates);
  for (const value of kept) {
    const p = value.outcome.puzzle;
    rows.push({
      ok: true,
      id: value.page.title,
      license: value.page.imageinfo[0].extmetadata?.LicenseShortName?.value,
      width: p.width,
      height: p.height,
      difficulty: p.difficulty,
      edits: p.edits,
    });
  }
  for (const { value, duplicateOf } of dropped) {
    rows.push({ ok: false, id: value.page.title, gate: 'duplicate', reason: `near-duplicate of ${duplicateOf.page.title}` });
  }

  writeReport(`wikimedia-${category.replace(/\s+/g, '_')}`, rows);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
