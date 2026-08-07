/**
 * Download and unpack the raster pixel-art packs listed in
 * `pixel-sources.json` into `_sources/<pack-id>/`, ready for
 * `probe-local-folder.mjs` to measure.
 *
 * Why this exists as a script and not as a paragraph in the README: the
 * pixel-art hunt turned up ~15 packs across four hosts, each with its own
 * licence and its own set of files to exclude. Doing that by hand once is
 * fine; doing it again after a re-scope, or on another machine, is where the
 * mistakes get made — a pack unzipped into the wrong folder gets measured
 * under the wrong licence, and a licence error is the one class of bug in
 * this project that survives all the way into a release.
 *
 * Deliberately dependency-free. `node:zlib` can inflate, and both ZIP and
 * tar are simple enough to walk directly (see `unzip`/`untar` below), so
 * pulling in an archive library for this would add supply chain for nothing.
 *
 * What it will NOT do: touch itch.io or OpenGameArt. Both put downloads
 * behind a browser flow, and scraping around that is both fragile and rude
 * to hosts that are giving the art away for free. Those packs are marked
 * `manual` in the catalogue and the script prints their instructions instead.
 *
 * Usage:
 *   cd tools/puzzlegen
 *   node scripts/probes/fetch-pixel-sources.mjs --list
 *   node scripts/probes/fetch-pixel-sources.mjs --priority 2
 *   node scripts/probes/fetch-pixel-sources.mjs kenney/1-bit-pack fugue-icons
 *   node scripts/probes/fetch-pixel-sources.mjs --all
 *
 * Options:
 *   --list          Print the catalogue and exit. Downloads nothing.
 *   --all           Every automatable pack.
 *   --priority N    Every automatable pack with priority <= N (1 is best).
 *   --force         Re-download even if the target folder already exists.
 *   --dry-run       Resolve URLs and report what would happen, fetch nothing.
 *   --self-test     Exercise the ZIP/tar readers and the path guard against
 *                   archives built in memory. No network, no fixtures.
 *
 * After it finishes it prints the `probe-local-folder.mjs` command for each
 * pack, with the licence already filled in from the catalogue — copy-paste
 * rather than retype, for the reason in the second paragraph.
 */

import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, posix } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deflateRawSync, gunzipSync, inflateRawSync } from 'node:zlib';

/** Same identifiable agent as `probe-common.mjs`, duplicated rather than
 * imported: this script deliberately has no `sharp` dependency, so it can be
 * run to fetch sources before the package's dev dependencies are installed. */
const USER_AGENT = 'nanonogram-puzzlegen-probe/0.1 (contact: juan.arias@cpic.or.cr)';

const HERE = dirname(fileURLToPath(import.meta.url));
const PUZZLEGEN_ROOT = join(HERE, '..', '..');
const SOURCES_ROOT = join(PUZZLEGEN_ROOT, '_sources');
const CATALOGUE = JSON.parse(readFileSync(join(HERE, 'pixel-sources.json'), 'utf8'));

// ---------------------------------------------------------------------------
// Archive readers
// ---------------------------------------------------------------------------

/**
 * Minimal ZIP reader: locate the end-of-central-directory record, walk the
 * central directory, and inflate each entry from its local header.
 *
 * Reads the central directory rather than scanning for local headers because
 * only the central directory is authoritative — a local header is allowed to
 * carry zeroed sizes with the real values in a trailing data descriptor,
 * which a naive forward scan silently truncates.
 *
 * Zip64 is not supported. Nothing in the catalogue is anywhere near 4 GB or
 * 65 535 entries, and a half-implemented Zip64 that quietly reads the wrong
 * offsets would be worse than a clear refusal.
 */
function unzip(buffer) {
  const EOCD_SIG = 0x06054b50;
  let eocd = -1;
  for (let i = buffer.length - 22; i >= 0 && i > buffer.length - 22 - 65536; i--) {
    if (buffer.readUInt32LE(i) === EOCD_SIG) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error('not a ZIP file (no end-of-central-directory record)');

  const entryCount = buffer.readUInt16LE(eocd + 10);
  let offset = buffer.readUInt32LE(eocd + 16);
  if (offset === 0xffffffff || entryCount === 0xffff) {
    throw new Error('Zip64 archive — not supported, unzip this one by hand');
  }

  const files = [];
  for (let n = 0; n < entryCount; n++) {
    if (buffer.readUInt32LE(offset) !== 0x02014b50) {
      throw new Error(`corrupt central directory at entry ${n}`);
    }
    const method = buffer.readUInt16LE(offset + 10);
    const compressedSize = buffer.readUInt32LE(offset + 20);
    const nameLength = buffer.readUInt16LE(offset + 28);
    const extraLength = buffer.readUInt16LE(offset + 30);
    const commentLength = buffer.readUInt16LE(offset + 32);
    const localOffset = buffer.readUInt32LE(offset + 42);
    const name = buffer.toString('utf8', offset + 46, offset + 46 + nameLength);
    offset += 46 + nameLength + extraLength + commentLength;

    if (name.endsWith('/')) continue; // directory entry, nothing to write

    // The local header's name/extra lengths can differ from the central
    // directory's, so they have to be read again here rather than reused.
    const localNameLength = buffer.readUInt16LE(localOffset + 26);
    const localExtraLength = buffer.readUInt16LE(localOffset + 28);
    const dataStart = localOffset + 30 + localNameLength + localExtraLength;
    const raw = buffer.subarray(dataStart, dataStart + compressedSize);

    let data;
    if (method === 0) data = Buffer.from(raw);
    else if (method === 8) data = inflateRawSync(raw);
    else throw new Error(`unsupported compression method ${method} for ${name}`);

    files.push({ name, data });
  }
  return files;
}

/**
 * Minimal tar reader for GitHub's `codeload` tarballs. Handles ustar name
 * prefixes and pax extended headers, which is what GitHub emits for paths
 * longer than 100 characters — several Fugue icon names are.
 */
function untar(buffer) {
  const files = [];
  let offset = 0;
  let paxPath = null;

  while (offset + 512 <= buffer.length) {
    const header = buffer.subarray(offset, offset + 512);
    if (header.every((b) => b === 0)) break; // end-of-archive padding

    const str = (start, length) => header.toString('utf8', start, start + length).replace(/\0.*$/, '').trim();
    const rawName = str(0, 100);
    const size = parseInt(str(124, 12) || '0', 8);
    const type = String.fromCharCode(header[156]);
    const prefix = str(345, 155);
    const blocks = Math.ceil(size / 512);
    const body = buffer.subarray(offset + 512, offset + 512 + size);
    offset += 512 + blocks * 512;

    if (type === 'x' || type === 'X') {
      // pax extended header: "<len> path=<value>\n" records.
      const match = body.toString('utf8').match(/\d+ path=([^\n]+)\n/);
      paxPath = match ? match[1] : null;
      continue;
    }
    if (type === 'L') {
      paxPath = body.toString('utf8').replace(/\0.*$/, '');
      continue;
    }

    const name = paxPath ?? (prefix ? `${prefix}/${rawName}` : rawName);
    paxPath = null;
    if (type === '0' || type === '\0') files.push({ name, data: Buffer.from(body) });
  }
  return files;
}

// ---------------------------------------------------------------------------
// Writing files out
// ---------------------------------------------------------------------------

const KEEP_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.webp', '.bmp', '.gif', '.svg', '.txt', '.md']);

/**
 * Reject any archive path that would escape the destination folder. An
 * absolute path or a `..` segment in a downloaded archive is the classic
 * zip-slip, and this script runs against third-party downloads by
 * definition, so the check is not theoretical.
 */
function safeRelative(name) {
  const normalised = posix.normalize(name.replace(/\\/g, '/'));
  if (normalised.startsWith('/') || normalised.split('/').includes('..')) return null;
  return normalised;
}

function extract(files, destination, { strip = 0, include = null, exclude = [] } = {}) {
  let written = 0;
  let skipped = 0;

  for (const file of files) {
    const relative = safeRelative(file.name);
    if (relative === null) {
      console.warn(`  ! refusing unsafe path in archive: ${file.name}`);
      skipped++;
      continue;
    }
    const stripped = relative.split('/').slice(strip).join('/');
    if (!stripped) continue;

    if (include && !include.some((prefix) => stripped.startsWith(prefix))) {
      skipped++;
      continue;
    }
    const base = posix.basename(stripped, posix.extname(stripped));
    if (exclude.includes(base)) {
      console.log(`  - excluded by licence (${base})`);
      skipped++;
      continue;
    }
    const extension = posix.extname(stripped).toLowerCase();
    if (!KEEP_EXTENSIONS.has(extension)) {
      skipped++;
      continue;
    }

    const target = join(destination, stripped);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, file.data);
    written++;
  }
  return { written, skipped };
}

// ---------------------------------------------------------------------------
// Fetching
// ---------------------------------------------------------------------------

async function get(url, { text = false } = {}) {
  const res = await fetch(url, {
    headers: { 'User-Agent': USER_AGENT },
    redirect: 'follow',
    signal: AbortSignal.timeout(120000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} on ${url}`);
  return text ? res.text() : Buffer.from(await res.arrayBuffer());
}

/**
 * Kenney's ZIP URLs embed a content hash and a timestamp that change on every
 * reupload, so pinning them rots. Read the current href off the asset page
 * and only fall back to the pinned URL recorded during the hunt if the page
 * layout has changed enough that no `.zip` link is findable.
 */
async function resolveKenneyZip(pack) {
  try {
    const html = await get(pack.url, { text: true });
    const matches = [...html.matchAll(/href="([^"]+\.zip)"/g)].map((m) => m[1]);
    if (matches.length > 0) {
      const href = matches[0];
      return href.startsWith('http') ? href : new URL(href, pack.url).toString();
    }
    console.warn('  ! no .zip link found on the asset page, using the pinned URL');
  } catch (err) {
    console.warn(`  ! could not read the asset page (${err.message}), using the pinned URL`);
  }
  return pack.zipFallback;
}

/**
 * Leave a machine-readable note of where each pack came from and under what
 * licence, next to the files themselves. `_sources/` is gitignored, so this
 * is the only thing standing between a folder of PNGs and a puzzle shipped
 * with the wrong attribution three sessions from now.
 */
function writeProvenance(destination, pack, resolvedUrl) {
  writeFileSync(
    join(destination, 'PROVENANCE.json'),
    JSON.stringify(
      {
        id: pack.id,
        name: pack.name,
        license: pack.license,
        licenseEvidence: pack.licenseEvidence,
        author: pack.author ?? null,
        sourceUrl: pack.url,
        downloadedFrom: resolvedUrl,
        fetchedAt: new Date().toISOString(),
        notes: pack.notes ?? null,
      },
      null,
      2,
    ) + '\n',
  );
}

async function fetchPack(pack, { force, dryRun }) {
  const destination = join(SOURCES_ROOT, ...pack.id.split('/'));
  console.log(`\n${pack.name}  [${pack.license}]`);

  if (pack.method === 'manual') {
    console.log(`  MANUAL — download from ${pack.url}`);
    console.log(`  unzip into: ${destination}`);
    console.log(`  ${pack.notes}`);
    return { pack, destination, done: false };
  }

  if (existsSync(destination) && !force) {
    console.log(`  already present at ${destination} (use --force to redownload)`);
    return { pack, destination, done: true };
  }

  const url = pack.method === 'kenney-page' ? await resolveKenneyZip(pack) : pack.url;
  console.log(`  ${url}`);
  if (dryRun) return { pack, destination, done: false };

  const buffer = await get(url);
  console.log(`  ${(buffer.length / 1024 / 1024).toFixed(1)} MB downloaded`);

  const files = pack.method === 'github-tarball' ? untar(gunzipSync(buffer)) : unzip(buffer);
  if (force && existsSync(destination)) rmSync(destination, { recursive: true, force: true });
  mkdirSync(destination, { recursive: true });

  // GitHub tarballs wrap everything in one `<repo>-<ref>/` folder; ZIPs from
  // Kenney do not. Stripping one level for the former keeps the `include`
  // prefixes in the catalogue written against repo-relative paths.
  const { written, skipped } = extract(files, destination, {
    strip: pack.method === 'github-tarball' ? 1 : 0,
    include: pack.include ?? null,
    exclude: pack.exclude ?? [],
  });
  console.log(`  ${written} files written, ${skipped} skipped -> ${destination}`);
  writeProvenance(destination, pack, url);
  return { pack, destination, done: true };
}

// ---------------------------------------------------------------------------
// Self-test
// ---------------------------------------------------------------------------

/**
 * `unzip` and `untar` are hand-rolled against binary formats, run against
 * third-party downloads, and have no other coverage — `vitest` only sees
 * `packages/`, not this scripts folder. So the archives are built here in
 * memory and read back, which keeps the check reproducible on any machine
 * with Node and no fixtures to go stale:
 *
 *   node scripts/probes/fetch-pixel-sources.mjs --self-test
 */
function buildZip(entries, { store = false } = {}) {
  const locals = [];
  const central = [];
  let offset = 0;
  for (const [name, text] of entries) {
    const nameBuffer = Buffer.from(name, 'utf8');
    const raw = Buffer.from(text, 'utf8');
    const data = store ? raw : deflateRawSync(raw);
    const method = store ? 0 : 8;

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(method, 8);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(raw.length, 22);
    local.writeUInt16LE(nameBuffer.length, 26);
    locals.push(local, nameBuffer, data);

    const entry = Buffer.alloc(46);
    entry.writeUInt32LE(0x02014b50, 0);
    entry.writeUInt16LE(method, 10);
    entry.writeUInt32LE(data.length, 20);
    entry.writeUInt32LE(raw.length, 24);
    entry.writeUInt16LE(nameBuffer.length, 28);
    entry.writeUInt32LE(offset, 42);
    central.push(entry, nameBuffer);
    offset += 30 + nameBuffer.length + data.length;
  }
  const centralBuffer = Buffer.concat(central);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(entries.length, 8);
  eocd.writeUInt16LE(entries.length, 10);
  eocd.writeUInt32LE(centralBuffer.length, 12);
  eocd.writeUInt32LE(offset, 16);
  return Buffer.concat([Buffer.concat(locals), centralBuffer, eocd]);
}

function tarBlock(name, body, type = '0') {
  const header = Buffer.alloc(512);
  header.write(name.slice(0, 100), 0);
  header.write('0000644\0', 100);
  header.write(body.length.toString(8).padStart(11, '0') + '\0', 124);
  header.write('00000000000\0', 136);
  header.write(type, 156);
  header.write('ustar\0' + '00', 257);
  header.write('        ', 148); // checksum field is spaces while summing
  let sum = 0;
  for (const byte of header) sum += byte;
  header.write(sum.toString(8).padStart(6, '0') + '\0 ', 148);
  const padding = Buffer.alloc((512 - (body.length % 512)) % 512);
  return Buffer.concat([header, body, padding]);
}

function selfTest() {
  let failures = 0;
  const check = (label, condition, extra = '') => {
    console.log(`  ${condition ? 'PASS' : 'FAIL'}  ${label}${extra ? `  ${extra}` : ''}`);
    if (!condition) failures++;
  };

  const longPath = 'repo-master/a/very/deliberately/long/nested/path/that/exceeds/the/one/hundred/character/ustar/name/field/deep.png';
  const entries = [
    ['Tiles/tile_1.png', 'PNG-ONE'],
    ['Tiles/tile_2.png', 'PNG-TWO'],
    ['Tiles/geotag.png', 'THIRD-PARTY'],
    ['License.txt', 'CC0'],
    ['Sample.tsx', 'junk'],
  ];

  for (const store of [false, true]) {
    const label = store ? 'zip/stored' : 'zip/deflate';
    const files = unzip(buildZip(entries, { store }));
    check(`${label}: every entry read`, files.length === entries.length, `${files.length}`);
    const one = files.find((f) => f.name === 'Tiles/tile_1.png');
    check(`${label}: payload round-trips`, one?.data.toString('utf8') === 'PNG-ONE');
  }

  const tar = Buffer.concat([
    tarBlock('pax_global_header', Buffer.from(`${`30 path=${longPath}\n`.length} path=${longPath}\n`), 'x'),
    tarBlock('repo-master/short.png', Buffer.from('DEEP')),
    tarBlock('repo-master/Tiles/tile_1.png', Buffer.from('PNG-ONE')),
    tarBlock('repo-master/Sample.tsx', Buffer.from('junk')),
    Buffer.alloc(1024),
  ]);
  const untarred = untar(tar);
  check('tar: entries read', untarred.length === 3, `${untarred.length}`);
  check('tar: pax long path applied to next entry', untarred[0]?.name === longPath, untarred[0]?.name);
  check('tar: payload round-trips', untarred[1]?.data.toString('utf8') === 'PNG-ONE');

  check('guard: absolute path rejected', safeRelative('/etc/passwd') === null);
  check('guard: traversal rejected', safeRelative('a/../../etc/passwd') === null);
  check('guard: backslash traversal rejected', safeRelative('a\\..\\..\\etc\\passwd') === null);
  check('guard: ordinary path kept', safeRelative('Tiles/x.png') === 'Tiles/x.png');

  // The OS temp dir, not `_sources/` — writing scratch files into the repo
  // means a failed run leaves debris in a folder the download step then
  // reports as "already present".
  const destination = mkdtempSync(join(tmpdir(), 'nanonogram-selftest-'));
  const extracted = extract(unzip(buildZip(entries)), destination, { exclude: ['geotag'] });
  check('extract: junk extension dropped', !existsSync(join(destination, 'Sample.tsx')));
  check('extract: excluded licence casualty removed', !existsSync(join(destination, 'Tiles', 'geotag.png')));
  check('extract: wanted files written', extracted.written === 3, `written=${extracted.written}`);
  check('extract: licence text kept', existsSync(join(destination, 'License.txt')));

  const stripped = join(destination, 'stripped');
  mkdirSync(stripped, { recursive: true });
  const filtered = extract(untarred, stripped, { strip: 1, include: ['Tiles/'] });
  check('extract: strip + include prefix', filtered.written === 1, `written=${filtered.written}`);

  try {
    rmSync(destination, { recursive: true, force: true });
  } catch (err) {
    // Cleanup is housekeeping, not an assertion. A sandboxed or network-mounted
    // temp dir can refuse the unlink, and failing the whole self-test over
    // leftover scratch files would be reporting the wrong problem.
    console.warn(`  (could not clean up ${destination}: ${err.message})`);
  }

  console.log(failures === 0 ? '\nall green' : `\n${failures} FAILURES`);
  return failures;
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

function list() {
  const width = Math.max(...CATALOGUE.packs.map((p) => p.id.length));
  console.log('Automatable and manual packs, best first:\n');
  for (const p of [...CATALOGUE.packs].sort((a, b) => a.priority - b.priority)) {
    const tag = p.method === 'manual' ? 'MANUAL' : 'auto  ';
    console.log(
      `  p${p.priority} ${tag} ${p.id.padEnd(width)}  ${String(p.approxFiles).padStart(5)} files  ${p.nativeSize.padEnd(16)} ${p.license}`,
    );
  }
  console.log(`\n${CATALOGUE.rejected.length} sources were examined and rejected — see pixel-sources.json.`);
}

async function main() {
  const argv = process.argv.slice(2);
  const flags = new Set(argv.filter((a) => a.startsWith('--')));

  if (flags.has('--self-test')) {
    process.exit(selfTest() === 0 ? 0 : 1);
  }

  const priorityIndex = argv.indexOf('--priority');
  const maxPriority = priorityIndex >= 0 ? Number(argv[priorityIndex + 1]) : null;
  const named = argv.filter((a, i) => !a.startsWith('--') && argv[i - 1] !== '--priority');

  if (flags.has('--list') || (named.length === 0 && maxPriority === null && !flags.has('--all'))) {
    list();
    if (!flags.has('--list')) {
      console.log('\nNothing selected. Pass pack ids, --priority N, or --all.');
    }
    return;
  }

  const selected = CATALOGUE.packs.filter((p) => {
    if (named.length > 0) return named.includes(p.id);
    if (maxPriority !== null) return p.priority <= maxPriority;
    return true; // --all
  });
  if (selected.length === 0) {
    console.error(`No pack matched. Run with --list to see the ids.`);
    process.exit(1);
  }

  const results = [];
  for (const pack of selected) {
    try {
      results.push(await fetchPack(pack, { force: flags.has('--force'), dryRun: flags.has('--dry-run') }));
    } catch (err) {
      console.error(`  FAILED: ${err.message}`);
    }
  }

  const ready = results.filter((r) => r.done);
  if (ready.length === 0) return;
  console.log('\n\nMeasure each pack against the real pipeline:\n');
  for (const { pack, destination } of ready) {
    const relative = destination.slice(PUZZLEGEN_ROOT.length + 1).replace(/\\/g, '/');
    const author = pack.author ? ` --author ${JSON.stringify(pack.author)}` : '';
    console.log(
      `node scripts/probes/probe-local-folder.mjs ${relative} \\\n  --license ${pack.license} --source ${JSON.stringify(pack.id)}${author}`,
    );
  }
  console.log('\nRead the acceptance rate the way SOURCES.md does: pixelarticons set the bar at 65%.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
