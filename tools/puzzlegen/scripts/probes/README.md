# Source probes

Scripts to measure whether a new source is worth adding to `SOURCES.md`, the
same instrument as `sweep-sources.mjs` but for sources that are not one npm
package: `probe-phylopic.mjs`, `probe-wikimedia.mjs`,
`probe-museum-silhouettes.mjs`, and `probe-local-folder.mjs` for anything
already on disk. Alongside them, `fetch-pixel-sources.mjs` gets the raster
pixel-art packs *onto* disk in the first place — see its section below.

## Setup (once)

```bash
cd tools/puzzlegen
pnpm add -D sharp   # decodes PNG/JPEG so raster sources can become bitmaps
pnpm -r build       # from repo root, or `pnpm build` here if @nanonogram/core is already built
```

Every probe writes to `tools/puzzlegen/_probe-cache/`:

- `http/` — every URL ever fetched, cached forever by hash. Re-running a probe
  after tweaking a filter costs no extra network calls for anything already
  downloaded. Safe to delete if you want a truly fresh run.
- `<name>.jsonl` — one line per sampled item, accepted or not, with the reason.
- `<name>.summary.txt` — the same thing, human-readable, also printed to stdout.

## Running them

```bash
# PhyloPic — check the API shape matches what the script expects before trusting it
node scripts/probes/probe-phylopic.mjs --debug
node scripts/probes/probe-phylopic.mjs 80

# Wikimedia Commons — confirm the candidate categories exist and their sizes
node scripts/probes/probe-wikimedia.mjs --list-categories
node scripts/probes/probe-wikimedia.mjs "Silhouette images" 80
node scripts/probes/probe-wikimedia.mjs "SVG pictograms" 80

# Museum "silhouette" slices — met and aic and cleveland should just work;
# smithsonian needs its shape confirmed first (see the file header)
node scripts/probes/probe-museum-silhouettes.mjs --debug smithsonian
node scripts/probes/probe-museum-silhouettes.mjs met 80
node scripts/probes/probe-museum-silhouettes.mjs aic 80
node scripts/probes/probe-museum-silhouettes.mjs cleveland 80
node scripts/probes/probe-museum-silhouettes.mjs smithsonian 80
```

Read the acceptance rate the same way `SOURCES.md` does: below ~20% and a
source probably isn't worth a pack slot; `pixelarticons` set the bar at 65%.
The `gate` field on rejected rows tells you *why* — mostly `fidelity` means
the source material doesn't reduce to a small grid cleanly; mostly `license`
means the filter is too strict or the metadata is inconsistent and worth a
second look before writing the source off.

## Raster pixel-art packs: `fetch-pixel-sources.mjs`

Superseded the hand-download instructions that used to live here. The
2026-08-07 hunt turned up ~20 usable packs across four hosts, catalogued in
`pixel-sources.json` with per-pack licence, the exact wording that licence was
read from, native sprite size and the reason the pack is or isn't a fit.
`fetch-pixel-sources.mjs` downloads and unpacks everything with a stable URL,
and prints instructions for what's left.

```bash
cd tools/puzzlegen
node scripts/probes/fetch-pixel-sources.mjs --list        # catalogue, downloads nothing
node scripts/probes/fetch-pixel-sources.mjs --priority 2  # the packs worth doing first
node scripts/probes/fetch-pixel-sources.mjs kenney/1-bit-pack fugue-icons
node scripts/probes/fetch-pixel-sources.mjs --all
```

Everything lands in `_sources/<pack-id>/` (gitignored) with a
`PROVENANCE.json` recording where it came from and under what licence — the
only thing keeping a folder of anonymous PNGs from being measured, and
eventually shipped, under the wrong attribution. When it finishes it prints
the matching `probe-local-folder.mjs` command for each pack with the licence
already filled in; copy-paste those rather than retyping them.

**Why some packs are still manual.** itch.io and OpenGameArt both put
downloads behind a browser flow. Scraping around that is fragile and rude to
hosts giving art away for free, so those packs print instructions instead.
Two of them are worth the five minutes: **Nikoichu's 1-bit Pixel Icons**
(CC0, 1 476 sprites already at 16×16 1-bit — the best single find of the
hunt) and **Dungeon Crawl 32×32** (CC0, 6 000+ single-subject sprites).

**Two licence traps recorded in the catalogue**, repeated here because they
bite at release time rather than at download time: Fugue Icons is CC-BY-3.0
and contains six third-party icon names under BY-SA/GPL, which the script
drops on extract by basename across all three of Fugue's folders — so it
removes up to ~18 files, not 6, erring safe. And famfamfam Silk is
CC-BY-**2.5**, which `sweep-sources.mjs`'s `REDISTRIBUTABLE` regex does not
currently match: decide that before a Silk puzzle reaches a release.

The catalogue also carries an `eligible` list — CC-BY-SA packs that are
allowed under current policy (SA has been in `REDISTRIBUTABLE` since
2026-08-07) but weren't measured for lack of time. Don't re-reject them for
being ShareAlike.

Verify the archive readers without touching the network:

```bash
node scripts/probes/fetch-pixel-sources.mjs --self-test
```

Once you have a folder of sprites under `_sources/` — from the script or by
hand — measure it the same way as everything else in `SOURCES.md`:

```bash
node scripts/probes/probe-local-folder.mjs _sources/kenney/pixel-platformer \
  --license CC0-1.0 --source "kenney/pixel-platformer"
```

It walks the folder, rasterises every PNG/SVG the same way the other probes
do, runs `generateFrom`, dedupes, and reports the acceptance rate — so Kenney
and OpenGameArt packs get measured on equal footing with everything else
instead of judged by eye. One licence per run: if a folder mixes licences,
split it before measuring, or run the script once per sub-folder.

As of 2026-08-07, `generateFrom` also tries to recover a sprite's *original*
pixel grid before falling back to the square ladder (see `SOURCES.md`'s
pixel-art section) — this is what actually makes measuring hand-drawn sprite
packs meaningful rather than penalising every pack for being exported larger
than it was drawn. That path has never fired on any source measured so far:
`natives` is 0 across all 213 collections of the npm sweep, because Iconify is
SVG-only. The packs `fetch-pixel-sources.mjs` downloads are the first material
that can exercise it.

**Neither `probe-local-folder.mjs` nor `fetch-pixel-sources.mjs` has been run
against a real pack yet** — the next session's first job is exactly that:

```bash
node scripts/probes/fetch-pixel-sources.mjs kenney/1-bit-pack
node scripts/probes/probe-local-folder.mjs _sources/kenney/1-bit-pack \
  --license CC0-1.0 --source "kenney/1-bit-pack" --author "Kenney"
```

An already-1-bit pack first, so that if the native path misbehaves,
thresholding cannot be the suspect.
