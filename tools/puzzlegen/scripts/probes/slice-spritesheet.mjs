/**
 * Cut a spritesheet into one PNG per tile, so `probe-local-folder.mjs` can
 * measure it.
 *
 * Why this exists: the pixel-art hunt assumed Kenney packs ship a `Tiles/`
 * folder of individual sprites. The first real download disproved that — the
 * 1-Bit Pack's ZIP contains **only** spritesheets, and Kenney's advertised
 * "1078 files" counts tiles *inside* those sheets, not files on disk. The
 * download was complete; there was simply nothing per-sprite to measure. So
 * for sheet-shaped packs the pipeline needs one more step before the probe.
 *
 * The saving grace is that the geometry is exact and machine-readable, not
 * guessed: Kenney ships a `Tilesheet.txt` next to the sheets giving tile size,
 * inter-tile spacing and tile counts, and those numbers reconcile against the
 * PNG's own dimensions to the pixel. This script parses that file when it's
 * there, and **refuses to slice** when the arithmetic doesn't close — a sheet
 * cut on a grid that's off by one pixel yields 1078 sprites with a stripe of
 * their neighbour down one edge, every one of which would sail through the
 * probe as a plausible-looking, silently wrong puzzle.
 *
 * Usage:
 *   cd tools/puzzlegen
 *   pnpm add -D sharp                       # if not already installed
 *   node scripts/probes/slice-spritesheet.mjs _sources/kenney/1-bit-pack
 *   node scripts/probes/slice-spritesheet.mjs path/to/sheet.png --tile 16 --spacing 1
 *
 * Given a folder it finds the sheets and picks the best one (see
 * `rankSheets`), reporting what it chose and why. Given a file it uses that
 * file. Output goes to `<pack>/_tiles/<sheet-name>/`.
 *
 * **Point the probe at that `_tiles/<sheet>` folder, not at the pack root.**
 * `probe-local-folder.mjs` walks recursively, so from the root it would
 * measure the tiles *and* the sheets they came from — and a whole spritesheet
 * is a legitimate-looking image that will just be rejected, quietly padding
 * the denominator and understating the pack's real acceptance rate.
 *
 * Options:
 *   --tile N       Tile size in px. Required if there's no Tilesheet.txt.
 *   --spacing N    Gap between tiles in px. Default 0.
 *   --margin N     Border before the first tile. Default 0.
 *   --keep-blank   Write empty tiles too. Off by default: a sheet's grid is
 *                  mostly padding, and blank tiles are pure noise downstream.
 *   --keep-dupes   Write byte-identical tiles more than once. Off by default.
 *   --out DIR      Override the output folder.
 *   --dry-run      Report the grid and the keep/drop counts, write nothing.
 */

import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { basename, extname, join } from 'node:path';
import sharp from 'sharp';

/**
 * Which sheet to prefer when handed a whole pack folder.
 *
 * `monochrome-transparent` wins on both counts that matter: it is already
 * 1-bit (so the generator's threshold step is a no-op and cannot be blamed
 * for anything) and it has real alpha, which `classifyRaster` reads as
 * background unambiguously instead of having to infer it from a border.
 *
 * `_packed` variants are the same art with the padding squeezed out, which
 * means the uniform grid this script depends on is gone — they're excluded,
 * not merely deprioritised. So are previews and composed sample scenes, which
 * are pictures *of* the pack rather than part of it.
 */
const SHEET_EXCLUDE = /(_packed|^Sample|^Preview|legacy)/i;
const SHEET_PREFERENCE = [/monochrome-transparent/i, /monochrome/i, /colored-transparent/i, /colored/i];

function rankSheets(folder) {
  const candidates = [];
  const walk = (dir) => {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) {
        if (entry !== '_tiles') walk(full);
      } else if (extname(entry).toLowerCase() === '.png' && !SHEET_EXCLUDE.test(entry)) {
        candidates.push(full);
      }
    }
  };
  walk(folder);
  return candidates.sort((a, b) => {
    const score = (f) => {
      const index = SHEET_PREFERENCE.findIndex((re) => re.test(basename(f)));
      return index === -1 ? SHEET_PREFERENCE.length : index;
    };
    return score(a) - score(b);
  });
}

/**
 * Kenney's `Tilesheet.txt` is prose with bullet separators, e.g.
 *   Tile size                 •  16px × 16px
 *   Space between tiles       •  1px × 1px
 *   Total tiles (horizontal)  •  49 tiles
 * Parsed rather than hard-coded because the numbers differ per pack (16, 18
 * and 21 px all appear in the catalogue) and getting them from the pack
 * itself is one less thing to keep in sync by hand.
 */
function readTilesheetMetadata(folder) {
  for (const name of ['Tilesheet.txt', 'Spritesheet.txt']) {
    const file = join(folder, name);
    if (!existsSync(file)) continue;
    const text = readFileSync(file, 'utf8');
    const number = (label) => {
      const match = text.match(new RegExp(`${label}[^\\d]*(\\d+)`, 'i'));
      return match ? Number(match[1]) : null;
    };
    const meta = {
      tile: number('Tile size'),
      spacing: number('Space between tiles'),
      cols: number('Total tiles \\(horizontal\\)'),
      rows: number('Total tiles \\(vertical\\)'),
      total: number('Total tiles in sheet'),
      from: name,
    };
    if (meta.tile) return meta;
  }
  return null;
}

/**
 * Derive the grid and check it against the image's real dimensions.
 *
 * `cols * tile + (cols - 1) * spacing + 2 * margin` has to equal the width
 * exactly, and likewise for height. This is the whole safety argument of the
 * script: if it closes, every tile boundary is where we think it is; if it
 * doesn't, no amount of downstream quality gating will notice that each
 * sprite carries a sliver of its neighbour.
 */
function resolveGrid({ width, height, tile, spacing, margin, declared }) {
  const span = (n) => n * tile + (n - 1) * spacing + 2 * margin;
  const fit = (extent) => {
    // Solve span(n) = extent for n, then confirm rather than trust.
    const n = Math.round((extent - 2 * margin + spacing) / (tile + spacing));
    return span(n) === extent ? n : null;
  };
  const cols = fit(width);
  const rows = fit(height);

  const problems = [];
  if (cols === null) {
    problems.push(`width ${width} is not ${tile}px tiles + ${spacing}px gaps + ${margin}px margin (nearest fit spans ${span(Math.round((width - 2 * margin + spacing) / (tile + spacing)))}px)`);
  }
  if (rows === null) {
    problems.push(`height ${height} likewise does not reconcile`);
  }
  if (declared?.cols && cols !== null && declared.cols !== cols) {
    problems.push(`sheet metadata says ${declared.cols} columns, geometry says ${cols}`);
  }
  if (declared?.rows && rows !== null && declared.rows !== rows) {
    problems.push(`sheet metadata says ${declared.rows} rows, geometry says ${rows}`);
  }
  return { cols, rows, problems };
}

/** A tile with nothing in it: fully transparent, or a single flat colour. */
function isBlank(pixels) {
  let anyOpaque = false;
  for (let i = 3; i < pixels.length; i += 4) {
    if (pixels[i] !== 0) {
      anyOpaque = true;
      break;
    }
  }
  if (!anyOpaque) return true;
  for (let i = 4; i < pixels.length; i += 4) {
    if (pixels[i] !== pixels[0] || pixels[i + 1] !== pixels[1] || pixels[i + 2] !== pixels[2] || pixels[i + 3] !== pixels[3]) {
      return false;
    }
  }
  return true;
}

function parseArgs(argv) {
  const options = { spacing: 0, margin: 0 };
  const positional = [];
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--tile') options.tile = Number(argv[++i]);
    else if (arg === '--spacing') options.spacing = Number(argv[++i]);
    else if (arg === '--margin') options.margin = Number(argv[++i]);
    else if (arg === '--out') options.out = argv[++i];
    else if (arg === '--keep-blank') options.keepBlank = true;
    else if (arg === '--keep-dupes') options.keepDupes = true;
    else if (arg === '--dry-run') options.dryRun = true;
    else positional.push(arg);
  }
  return { target: positional[0], options };
}

async function main() {
  const { target, options } = parseArgs(process.argv.slice(2));
  if (!target) {
    console.error('Usage: node slice-spritesheet.mjs <sheet.png|pack-folder> [--tile 16] [--spacing 1] [--dry-run]');
    process.exit(1);
  }

  const isFolder = statSync(target).isDirectory();
  let sheet = target;
  let declared = null;

  if (isFolder) {
    const sheets = rankSheets(target);
    if (sheets.length === 0) {
      console.error(`No usable spritesheet PNG under ${target}.`);
      process.exit(1);
    }
    sheet = sheets[0];
    console.log(`Sheets found: ${sheets.length}. Using ${basename(sheet)} (best 1-bit/alpha candidate).`);
    if (sheets.length > 1) {
      console.log(`  others: ${sheets.slice(1, 5).map((s) => basename(s)).join(', ')}${sheets.length > 5 ? ', …' : ''}`);
    }
    declared = readTilesheetMetadata(target);
  }

  if (declared) {
    console.log(`${declared.from}: ${declared.tile}px tiles, ${declared.spacing ?? 0}px spacing, ${declared.cols}x${declared.rows} = ${declared.total} tiles`);
    options.tile ??= declared.tile;
    if (declared.spacing !== null && !process.argv.includes('--spacing')) options.spacing = declared.spacing;
  }
  if (!options.tile) {
    console.error('No tile size: pass --tile N (no Tilesheet.txt found next to the sheet).');
    process.exit(1);
  }

  const image = sharp(sheet).ensureAlpha();
  const { data, info } = await image.raw().toBuffer({ resolveWithObject: true });
  const { width, height, channels } = info;

  const grid = resolveGrid({ width, height, tile: options.tile, spacing: options.spacing, margin: options.margin, declared });
  console.log(`Sheet ${width}x${height}, tile ${options.tile}, spacing ${options.spacing}, margin ${options.margin}`);
  if (grid.problems.length > 0) {
    console.error('\nGrid does not reconcile with the image — refusing to slice:');
    for (const problem of grid.problems) console.error(`  - ${problem}`);
    console.error('\nSlicing on a wrong grid produces sprites carrying a sliver of their');
    console.error('neighbour, which every downstream gate would happily accept. Fix the');
    console.error('parameters (--tile / --spacing / --margin) and re-run.');
    process.exit(1);
  }
  console.log(`Grid: ${grid.cols}x${grid.rows} = ${grid.cols * grid.rows} tiles`);

  const destination = options.out ?? join(isFolder ? target : join(sheet, '..'), '_tiles', basename(sheet, extname(sheet)));
  if (!options.dryRun) mkdirSync(destination, { recursive: true });

  const seen = new Map();
  let written = 0;
  let blank = 0;
  let duplicate = 0;
  const pad = String(Math.max(grid.cols, grid.rows)).length;

  for (let row = 0; row < grid.rows; row++) {
    for (let col = 0; col < grid.cols; col++) {
      const x0 = options.margin + col * (options.tile + options.spacing);
      const y0 = options.margin + row * (options.tile + options.spacing);
      const pixels = Buffer.alloc(options.tile * options.tile * 4);
      for (let y = 0; y < options.tile; y++) {
        const source = ((y0 + y) * width + x0) * channels;
        data.copy(pixels, y * options.tile * 4, source, source + options.tile * channels);
      }

      if (!options.keepBlank && isBlank(pixels)) {
        blank++;
        continue;
      }
      const hash = createHash('sha1').update(pixels).digest('hex');
      if (!options.keepDupes && seen.has(hash)) {
        duplicate++;
        continue;
      }
      seen.set(hash, true);

      const name = `r${String(row).padStart(pad, '0')}c${String(col).padStart(pad, '0')}.png`;
      if (!options.dryRun) {
        const png = await sharp(pixels, { raw: { width: options.tile, height: options.tile, channels: 4 } })
          .png()
          .toBuffer();
        writeFileSync(join(destination, name), png);
      }
      written++;
    }
  }

  console.log(
    `\n${written} tiles ${options.dryRun ? 'would be written' : 'written'}  (${blank} blank, ${duplicate} duplicate, of ${grid.cols * grid.rows})`,
  );
  if (options.dryRun) return;
  console.log(`-> ${destination}\n`);
  console.log('Now measure them:');
  console.log(`node scripts/probes/probe-local-folder.mjs ${destination.replace(/\\/g, '/')} \\`);
  console.log(`  --license CC0-1.0 --source ${JSON.stringify(basename(sheet, extname(sheet)))}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
