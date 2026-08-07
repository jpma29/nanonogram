/**
 * Rank every redistributable icon set in `@iconify/json` by how many playable
 * nonograms it actually yields.
 *
 * The pipeline is the measuring instrument: sample N icons from a set, run them
 * through `generateFrom`, deduplicate, and the survivor count is the answer.
 * No guessing about which collections "look like" good source material.
 *
 * Usage:
 *   pnpm add -D @iconify/json          # ~440 MB unpacked, dev-only
 *   node scripts/sweep-sources.mjs [sample=60] [only=key,key,...]
 *   SHARD=0/3 node scripts/sweep-sources.mjs   # one third of the sets
 *
 * Writes a JSON array to stdout, progress dots to stderr. Shard outputs are
 * concatenated; see `data/source-ranking.json` for a stored run.
 */

import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { dedupe, generateFrom, rasterizeSvg } from '../dist/index.js';

const require = createRequire(import.meta.url);
const ICONIFY = dirname(require.resolve('@iconify/json/collections.json'));

/**
 * Licences we can ship. NonCommercial and GPL are excluded — NC because the
 * project doesn't want to forbid third parties from hosting or bundling it
 * commercially, and GPL because it's a software licence being asked to do a
 * data licence's job, with untested implications for a puzzle derived from a
 * GPL image. ShareAlike (2026-08-07: nanonogram will never be a commercial
 * project, so its bite is limited) is allowed: every puzzle already carries
 * its own `license` field independent of its neighbours, so an SA obligation
 * on one puzzle doesn't propagate to the rest of the pack or to the code.
 */
const REDISTRIBUTABLE =
  /^(MIT|Apache-2\.0|CC0-1\.0|CC-BY-4\.0|CC-BY-3\.0|CC-BY-SA-4\.0|CC-BY-SA-3\.0|ISC|OFL-1\.1|Unlicense|BSD-3-Clause|MPL-2\.0)$/;

/** Sets smaller than this are not worth a pack slot. */
const MIN_SET_SIZE = 40;

/** Deterministic sampling: the ranking has to be reproducible run to run. */
let seed = 11 >>> 0;
function random() {
  seed = (seed + 0x6d2b79f5) >>> 0;
  let t = seed;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

function sample(items, n) {
  const shuffled = [...items];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled.slice(0, n);
}

function toSvg(icon, set) {
  const width = icon.width ?? set.width ?? 16;
  const height = icon.height ?? set.height ?? 16;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}">${icon.body}</svg>`;
}

function puzzleId(setKey, iconName) {
  return `${setKey}-${iconName}`
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .padEnd(8, '0')
    .slice(0, 26);
}

function measureSet(setKey, meta, size) {
  const license = meta.license?.spdx ?? '?';
  let set;
  try {
    set = JSON.parse(readFileSync(join(ICONIFY, 'json', `${setKey}.json`), 'utf8'));
  } catch {
    return null;
  }
  const names = Object.keys(set.icons ?? {});
  if (names.length < MIN_SET_SIZE) return null;

  const accepted = [];
  const gate = { fidelity: 0, playability: 0, logic: 0 };
  const sizes = {};
  let natives = 0;
  let unreadable = 0;

  const chosen = sample(names, size);
  for (const name of chosen) {
    const icon = set.icons[name];
    if (!icon?.body) continue;
    let reference;
    try {
      reference = rasterizeSvg(toSvg(icon, set));
    } catch {
      unreadable++;
      continue;
    }
    let outcome;
    try {
      outcome = generateFrom(reference, {
        id: puzzleId(setKey, name),
        title: name,
        license,
        source: `@iconify-json/${setKey}`,
        author: meta.author?.name ?? null,
      });
    } catch {
      unreadable++;
      continue;
    }
    if (!outcome.ok) {
      gate[outcome.rejection.gate]++;
      continue;
    }
    accepted.push(outcome.puzzle);
    sizes[outcome.puzzle.size] = (sizes[outcome.puzzle.size] ?? 0) + 1;
    if (outcome.puzzle.native) natives++;
  }

  const deduped = dedupe(
    accepted.map((p) => ({ grid: p.grid, value: p, score: p.difficulty * 10 + p.size })),
    0.04,
  );
  const difficulty = [0, 0, 0, 0, 0];
  for (const p of deduped.kept) difficulty[p.difficulty - 1]++;

  return {
    key: setKey,
    name: meta.name,
    license,
    total: meta.total ?? names.length,
    sampled: chosen.length,
    accepted: accepted.length,
    kept: deduped.kept.length,
    rate: deduped.kept.length / chosen.length,
    gate,
    dif: difficulty,
    sizes,
    natives,
    unreadable,
  };
}

function main() {
  const size = Number(process.argv[2] ?? 60);
  const only = process.argv[3] ? new Set(process.argv[3].split(',')) : null;
  const shard = process.env.SHARD ? process.env.SHARD.split('/').map(Number) : null;

  const collections = JSON.parse(readFileSync(join(ICONIFY, 'collections.json'), 'utf8'));
  const results = [];
  let index = 0;

  for (const [key, meta] of Object.entries(collections)) {
    if (!REDISTRIBUTABLE.test(meta.license?.spdx ?? '?')) continue;
    if (only && !only.has(key)) continue;
    if (shard && index++ % shard[1] !== shard[0]) continue;
    const row = measureSet(key, meta, size);
    if (row) results.push(row);
    process.stderr.write('.');
  }

  results.sort((a, b) => b.rate - a.rate);
  process.stdout.write(JSON.stringify(results, null, 1));
}

main();
