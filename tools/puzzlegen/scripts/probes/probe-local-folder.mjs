/**
 * Measure a folder of manually-downloaded sprites the same way every other
 * source in `SOURCES.md` was measured — walk it, run every image through
 * `generateFrom`, dedupe, report the acceptance rate. This is the tool
 * promised at the bottom of `README.md` for Kenney and OpenGameArt packs,
 * which have no bulk API worth automating (see that file for the download
 * instructions).
 *
 * Unlike the network probes, this one doesn't guess a licence from metadata:
 * a manually-downloaded pack's licence is whatever the source page said, and
 * you already know it by the time you've unzipped the file. Pass it in.
 *
 * As of 2026-08-07 this is also the intended way to measure a folder of
 * genuine pixel art (as opposed to icon-set vectors): `generateFrom` now
 * tries `alignToPixelGrid` before falling back to the square ladder, so a
 * sprite exported or screenshotted larger than it was drawn gets its real
 * grid back automatically — no more manual "count the pixels by eye" for
 * every candidate before it can even be measured. See `SOURCES.md`'s
 * "Pixel art: generator changes made to receive it" section for what that
 * covers and what it still doesn't (smoothly-upscaled sprites need
 * `--native-size` below).
 *
 * Usage:
 *   cd tools/puzzlegen
 *   pnpm build   # needs ../dist/index.js
 *   node scripts/probes/probe-local-folder.mjs _sources/kenney/pixel-platformer \
 *     --license CC0-1.0 --source "kenney/pixel-platformer" [--author "Kenney"]
 *
 * Options:
 *   --license   SPDX identifier, required. One value applies to every file
 *               found — run the script once per pack if a folder mixes
 *               licences (it shouldn't, if you kept the download-instructions
 *               convention of one folder per pack).
 *   --source    Label stored on every accepted puzzle. Defaults to the
 *               folder's own path relative to `_sources/`.
 *   --author    Optional, stored on every accepted puzzle.
 *   --max-cells Passed through to `alignToPixelGrid`'s pixel-grid detector.
 *               Default 35 (the generator's own ceiling) — raise it only to
 *               see what a source looks like *before* the ceiling throws
 *               work away, not to actually ship larger boards.
 */

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { extname, join, relative } from 'node:path';
import { contentCrop, dedupe, generateFrom, rasterizeSvgFile } from '../../dist/index.js';
import { classifyRaster, PUZZLEGEN_ROOT, writeReport } from './probe-common.mjs';

const RASTER_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.webp', '.bmp', '.gif']);

function walk(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) out.push(...walk(full));
    else out.push(full);
  }
  return out;
}

function parseArgs(argv) {
  const positional = [];
  const options = { maxCells: 35 };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--license') options.license = argv[++i];
    else if (arg === '--source') options.source = argv[++i];
    else if (arg === '--author') options.author = argv[++i];
    else if (arg === '--max-cells') options.maxCells = Number(argv[++i]);
    else positional.push(arg);
  }
  return { folder: positional[0], options };
}

async function main() {
  const { folder, options } = parseArgs(process.argv.slice(2));
  if (!folder || !options.license) {
    console.error(
      'Usage: node probe-local-folder.mjs <folder> --license <SPDX-id> [--source <label>] [--author <name>] [--max-cells 35]',
    );
    process.exit(1);
  }

  const files = walk(folder).filter((f) => RASTER_EXTENSIONS.has(extname(f).toLowerCase()) || extname(f) === '.svg');
  console.log(`Found ${files.length} image(s) under ${folder}.`);

  const sourceLabel = options.source ?? relative(join(PUZZLEGEN_ROOT, '_sources'), folder);
  const rows = [];
  const candidates = [];

  for (const file of files) {
    const id = relative(folder, file);
    let bitmap;
    try {
      if (extname(file) === '.svg') {
        bitmap = rasterizeSvgFile(file);
      } else {
        bitmap = contentCrop(await classifyRaster(readFileSync(file)));
      }
    } catch (err) {
      rows.push({ ok: false, id, gate: 'decode', reason: String(err) });
      continue;
    }

    const outcome = generateFrom(
      bitmap,
      { id, title: id, license: options.license, source: sourceLabel, author: options.author ?? null },
      { alignment: { maxCells: options.maxCells } },
    );

    if (!outcome.ok) {
      rows.push({ ok: false, id, gate: outcome.rejection.gate, reason: outcome.rejection.reason });
      continue;
    }
    candidates.push({ grid: outcome.puzzle.grid, value: { id, outcome }, score: -outcome.puzzle.edits });
  }

  const { kept, dropped } = dedupe(candidates);
  for (const value of kept) {
    const p = value.outcome.puzzle;
    rows.push({
      ok: true,
      id: value.id,
      title: value.id,
      license: options.license,
      width: p.width,
      height: p.height,
      difficulty: p.difficulty,
      edits: p.edits,
    });
  }
  for (const { value, duplicateOf } of dropped) {
    rows.push({ ok: false, id: value.id, gate: 'duplicate', reason: `near-duplicate of ${duplicateOf.id}` });
  }

  writeReport(`local-${sourceLabel.replace(/[\\/]/g, '-')}`, rows);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
