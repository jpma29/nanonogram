# Source probes

Four scripts to measure whether a new source is worth adding to `SOURCES.md`,
the same instrument as `sweep-sources.mjs` but for sources that are not one
npm package: `probe-phylopic.mjs`, `probe-wikimedia.mjs`,
`probe-museum-silhouettes.mjs`, and — for the two sources with no usable API —
a manual download procedure below instead of a fourth script.

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

## Two sources with no API worth automating

Kenney and OpenGameArt are both real candidates — Kenney in particular is
CC0-by-default, game-sprite-shaped, and closer in spirit to `pixelarticons`
(the best performer so far) than anything else scoped. Neither has a bulk API
though: Kenney ships packs as ZIPs from a paginated catalogue page, and
OpenGameArt is a Drupal community site where quality varies pack to pack.
Scraping either would be more fragile than just looking at the ~15-30 minutes
of packs worth trying and downloading them by hand.

**Kenney — <https://kenney.nl/assets>**

1. Filter by category: `2D` and, if useful, the `Pixel` tag —
   <https://kenney.nl/assets/tag:pixel> is close in spirit to `pixelarticons`.
2. Everything on the site is CC0; no license filtering needed.
3. Good starting picks, based on what tends to reduce well (flat, filled,
   single-subject-per-sprite): "Game Icons", "Animal Pack Redux", "Bevel
   Icons", "Pixel Platformer" (character/prop sprites), "Onscreen Controls".
   Avoid tilesets and UI chrome — those are built to tile or compose, not to
   stand alone as one recognisable picture.
4. Download the ZIP, unzip it into
   `tools/puzzlegen/_sources/kenney/<pack-name>/`, one folder per pack.

**OpenGameArt — <https://opengameart.org/art-search-advanced>**

1. Set **Art Type** to `2D Art` and **License(s)** to `CC0` — that excludes
   the OGA-BY and CC-BY-SA submissions, which the redistribution policy in
   `sweep-sources.mjs` already rules out for the same reason as GPL and NC.
2. Sort by Favorites to surface the vetted-by-usage packs first; quality here
   is genuinely uneven since it's open community submission, unlike Kenney's
   single-author consistency.
3. Open each promising result, confirm the license shown on the page matches
   the search filter (a few listings are mistagged), download, and unzip into
   `tools/puzzlegen/_sources/opengameart/<pack-name>/`.

Once you have a folder of sprites under `_sources/`, the measuring instrument
is the same as always — say the word and I'll write
`probe-local-folder.mjs`: walk a directory, rasterise every PNG/SVG the same
way the other probes do, run `generateFrom`, and report the acceptance rate,
so Kenney and OpenGameArt get measured on equal footing with everything else
in `SOURCES.md` instead of judged by eye.
