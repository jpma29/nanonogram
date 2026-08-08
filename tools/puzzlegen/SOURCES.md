# Picture sources

Which collections of images actually turn into good nonograms, measured rather
than guessed. Every candidate here is redistributable and available from npm,
which matters: the previous content plan died because it depended on one
person's GitHub repository, and that repository was deleted
(`docs/07-fuentes-de-contenido.md`).

## The pipeline is the measuring instrument

There is no need to reason about which icon sets "look like" they would reduce
well. Feed a sample to `generateFrom`, deduplicate, count the survivors. That
is what `scripts/sweep-sources.mjs` does, and the ranking below is its output
(stored verbatim in `data/source-ranking.json`).

The one structural fact worth knowing up front: `raster.ts` binarises on the
**alpha channel**, not on luminance. A full-colour icon therefore becomes its
own silhouette. Filled shapes survive; thin outlines do not. Given two variants
of the same subject, always prefer the filled one — `bxs` (Boxicons Solid)
scores 30 % where the outline sibling `bx` does not reach the table.

## The catalogue

`@iconify/json` is one npm package containing **231 icon sets**, each carrying
its licence in the metadata. Filtered to licences we can redistribute (MIT,
Apache-2.0, CC0, CC-BY, CC-BY-SA, ISC, OFL, Unlicense, BSD-3, MPL — excluding
NC and GPL; see the note on ShareAlike below) that is **214 sets and 291 652
images** as measured, though the SA allowance (added 2026-08-07, after this
sweep ran) may add a handful more once re-measured.

**On ShareAlike:** nanonogram will never be a commercial project, which takes
the sharpest edge off SA's obligations, but the real reason it's allowed is
structural — every puzzle already carries its own `license` field
(`SourceAttribution.license`), independent of every other puzzle in the pack.
An SA image's obligation stays with that one puzzle; it doesn't spread to the
rest of the library or to the code. NC stays excluded regardless, because that
policy is about not forbidding *others* from hosting or bundling this
commercially, which has nothing to do with what nanonogram itself is. GPL
stays excluded too: it's a software licence being asked to do a data licence's
job, and what a puzzle "derived" from a GPL image owes back is untested
territory not worth entering for the size of the GPL-image commons.

Every one of them was swept: 60 icons sampled per set, 12 756 images through
the full pipeline. Global acceptance **19.4 %**, and deduplication removes
almost nothing within a set (19.2 % after), which says the fidelity gate is
already doing the de-duplication work implicitly.

## Ranking

Sixty sampled per set. `nat` counts boards that took the native (unscaled,
padded) path — always zero here, because every Iconify source is vector and is
rasterised at the reference size; the native path exists for true bitmap
sprites. Projection is `rate x catalogue size` for that set alone.

| Rate     | Kept/60 | Licence   | Set                         | Fidelity | Playability | Logic | Difficulty 1-5 | Projected |
| -------- | ------: | --------- | --------------------------- | -------: | ----------: | ----: | -------------- | --------: |
| **65 %** |      39 | MIT       | `pixelarticons`             |       12 |           3 |     6 | 3 3 6 13 14    |       570 |
| 57 %     |      34 | MIT       | `zondicons`                 |       21 |           5 |     0 | 3 1 1 11 6 3   |       168 |
| 53 %     |      32 | MIT       | `at-icons`                  |       12 |          15 |     1 | 0 8 9 5 10     |       330 |
| 53 %     |      32 | OFL-1.1   | `picon`                     |       15 |          13 |     0 | 3 5 10 5 9     |       439 |
| 48 %     |      29 | MIT       | `oi` (Open Iconic)          |       18 |          12 |     1 | 5 7 10 4 3     |       108 |
| 42 %     |      25 | MIT       | `mi` (Mono Icons)           |       30 |           1 |     3 | 2 6 11 3 3     |        75 |
| 42 %     |      25 | MIT       | `fe` (Feather)              |       28 |           6 |     1 | 1 7 8 6 3      |       106 |
| 42 %     |      25 | Apache-2  | `uis` (Unicons Solid)       |       18 |          17 |     0 | 4 6 4 11 0     |        79 |
| 40 %     |      24 | OFL-1.1   | `whh` (WebHostingHub)       |       22 |          14 |     0 | 0 4 7 7 6      |   **850** |
| 40 %     |      24 | Apache-2  | `memory`                    |       25 |          10 |     1 | 1 3 2 8 10     |       260 |
| 40 %     |      24 | CC-BY-4.0 | `fa6-solid`                 |       12 |          24 |     0 | 0 1 4 11 8     |       561 |
| 38 %     |      23 | CC0-1.0   | `pinhead`                   |       26 |          11 |     0 | 1 6 5 9 2      |   **946** |
| 38 %     |      23 | MIT       | `gg`                        |       34 |           1 |     2 | 2 8 6 4 3      |       270 |
| 37 %     |      22 | Apache-2  | `ic` (Google Material)      |       24 |          14 |     0 | 1 7 8 3 3      |  **4017** |
| 35 %     |      21 | Apache-2  | `material-symbols`          |       28 |          11 |     0 | 1 4 7 6 3      |  **5455** |
| 35 %     |      21 | MIT       | `heroicons-solid`           |       11 |          28 |     0 | 2 3 6 5 5      |        81 |
| 35 %     |      21 | CC-BY-4.0 | `streamline-ultimate-color` |       13 |          25 |     1 | 0 4 5 7 5      |       349 |
| 33 %     |      20 | CC-BY-4.0 | `fa-solid`                  |       14 |          25 |     1 | 1 3 6 4 6      |       334 |
| 32 %     |      19 | MIT       | `boxicons`                  |       20 |          21 |     0 | 1 1 7 7 3      |  **1193** |
| 32 %     |      19 | MIT       | `teenyicons`                |       26 |          15 |     0 | 2 0 4 8 5      |       380 |
| 30 %     |      18 | MIT       | `bxs` (Boxicons Solid)      |        5 |          37 |     0 | 0 6 4 5 3      |       200 |
| 30 %     |      18 | MIT       | `tdesign`                   |       27 |          15 |     0 | 0 2 9 3 4      |       706 |

Full table, all 213 sets, in `data/source-ranking.json`.

**Forty-three sets clear 30 %.** Their combined catalogues are 56 226 images,
projecting to roughly **20 000 usable puzzles**. Across all 213 the projection
is 60 000. The first release needs about 100. Supply is not the problem, and
has not been since the sweep — selection is.

## What this changed

The previous shortlist (Twemoji 15 %, Fluent Emoji HC 11 %, Bootstrap Icons
11 %, game-icons 6 %) was built by hand from four packages that happened to be
on npm. The sweep found sets **four times better** and put the whole question
on a measured footing. Twemoji, the old leader, does not appear in the table
above.

`pixelarticons` leads by a wide margin, and the reason is not subtle: it is
drawn on a small pixel grid to begin with, so reducing it to 20-35 cells throws
away almost nothing. It is also the only set in the table with a meaningful
`logic` rejection count (6 of 60) — pixel art produces genuinely ambiguous
boards more often, which is exactly what the repair pass exists for and
occasionally cannot fix within its edit budget.

## Picking sources for the three packs

The difficulty columns are the useful part, because the sets differ in shape,
not just in yield.

- **Easy pack** — `oi`, `gg`, `fe`, `zondicons`. Simple filled glyphs, the bulk
  of their output at levels 2-3, and `oi` is the only set producing level 1 in
  quantity.
- **Medium pack** — `ic`, `material-symbols`, `at-icons`, `picon`. Huge
  catalogues, output centred on level 3, so the pack can be built by filtering
  rather than by hunting.
- **Hard pack** — `pixelarticons`, `memory`, `fa6-solid`, `bxl`. Output skews
  to levels 4-5; `pixelarticons` alone yields 27 of 39 at level 4 or above.

Because deduplication within a set removes almost nothing but *across* sets it
will remove a great deal — every icon library contains a heart, a star, a house
— the final selection must dedupe the merged pool, not each set separately.

## Board sizes produced

Across all accepted boards: 5x5 -> 6, 10 -> 93, 15 -> 171, 20 -> 535, 25 -> 490,
30 -> 598, 35 -> 578. The ladder is being used across its whole range, with the
mass at 20 and above. Small boards are scarce, which is a real constraint on the
easy pack: a level-1 puzzle on a 30x30 grid is tedious rather than easy, so the
easy pack may need `fit.maxSize` capped when generating for it.

## Rejections, and what they mean

Global: **7324 fidelity, 2904 playability, 57 logic** out of 12 756.

- **Fidelity** (57 %) — too much detail for 35 cells. Not tunable without
  giving up faithfulness. It is, and should remain, the dominant rejection.
- **Playability** (23 %) — the shape reduces fine but the board is too sparse,
  too dense or too broken up. Tunable via `QualityThresholds`.
- **Logic** (0.4 %) — near-nonexistent. Almost everything that reaches that
  gate is fixed by moving a pixel or two of outline, which vindicates the repair
  pass: without it these would be outright losses.

## Dithering does nothing here, and that is informative

Error diffusion is implemented (`ditherCoverage`) and can be switched on per
run. Measured across the original four sources it made things slightly
**worse** — 75 usable puzzles against 80.

The reason is structural. These sources are already binary: the alpha channel is
opaque or it is not, so the coverage map is very nearly all zeros and ones with
grey only in the antialiased fringe. There are no half-tones to diffuse.
Dithering an already-binary image just sprinkles speckle along the outline,
which then trips the noise gate at 30 %.

It is kept because it is the right tool for a source that _does_ have continuous
tone — an engraving, a shaded illustration, a photograph — and because the 30 %
noise ceiling means it cannot quietly ruin a board. It stays off by default.

## Attribution

Every generated puzzle carries `license`, `source` and `author` from its origin,
and `distributable: true` is set only because the licence permits it. The CC-BY
sets (`fa6-solid`, `fa-solid`, `streamline-*`, `picon` under OFL, `whh` under
OFL) require attribution **in the shipped application**, not merely in the
puzzle metadata — a UI obligation for the credits screen. Sets under CC0
(`pinhead`, `simple-icons`, `maki`, `osmic`) carry no such obligation and are
the cheapest to ship.

## Sources probed locally (2026-08-07), and what they measured

The four sources below were unreachable from the cloud build environment
(npm/PyPI registries only) and got probed once the work moved to a local
machine, using `scripts/probes/*.mjs` — the same instrument as
`sweep-sources.mjs`, adapted for sources that are live APIs rather than one
npm package. Full methodology and how to re-run these lives in
`scripts/probes/README.md`.

**PhyloPic — 20.8 % (10/48 sampled), the strongest new source.** Purpose-built
phylogenetic silhouettes: transparent PNG, one organism per image, CC0/CC-BY
almost throughout. All 38 rejections were `fidelity` — thin legs, antennae and
tails that don't survive reduction to 35 cells or fewer — with zero rejected on
licence or playability. Worth a full sweep at higher sample size and a pack
slot; the profile (organisms, often complex silhouettes) skews toward the
medium/hard packs the way `pixelarticons` does, for a similar reason: the
subject matter, not the format, is what limits it.

**Wikimedia Commons — marginal, 2.5–5 % depending on category.**
`SVG pictograms` (5.0 %), `Silhouettes` (2.5 %), `Pictograms` (2.5 %) all
measured after allowing ShareAlike (see below); `fidelity` dominates in every
one, meaning the low yield is about subject complexity, not licence friction —
loosening the licence filter moved the *rejection reason* from `license` to
`fidelity` without moving the acceptance rate. Worth including for the volume
(`Pictograms` alone is 361 files) but not worth building a whole pack around.
`Maki icons`, `Mapnik icons` and `Tango icons` — single-author OSM/desktop icon
sets mirrored to Commons — are scoped but not yet sampled; being filled,
single-colour glyph sets rather than community photo uploads, they're the more
promising remaining unknown here.

**Museum "silhouette" searches — 0 %, a dead end, confirmed independently three
times.** Met, Art Institute of Chicago and Cleveland Museum of Art were each
searched for cut-paper silhouette portraits specifically (not their general
photography catalogues, which were never going to work). All three came back
at 0 % acceptance, dominated by `fidelity` and `playability` — matting,
framing and photography angle on a physical object don't reduce cleanly even
with proper background-colour detection instead of a flat dark-on-light guess.
Smithsonian returned zero candidates with a usable image at all; most of its
"silhouette" hits are library catalogue entries with no digitised media.
**Verdict: don't pursue museum open-access APIs further for this pipeline** —
the format mismatch (photographs of objects, vs. this pipeline's need for
already-flat artwork) turned out to matter more than the CC0 licensing that
made them attractive on paper.

**Openclipart — not probed.** Its classic `/search/json` endpoint no longer
returns JSON (redirects to the HTML homepage), and its v2 API's docs page is a
JS-rendered SPA that didn't yield a usable shape during scoping. Given
community clip art tends toward multi-colour illustration rather than flat
single-subject icons — closer to OpenGameArt's profile than PhyloPic's — it's
deprioritised rather than abandoned; worth a manual look if the other sources
run dry before 100 puzzles are reached.

**On the raster classifier these probes use.** Photographs and flattened PNGs
don't have the clean alpha channel that `raster.ts` relies on for vector
icons, so the probes use `classifyRaster` (`scripts/probes/probe-common.mjs`):
real alpha channel → transparency is background, with boundary pixels far from
the shape's dominant colour treated as clipping artefacts; no alpha → detect
the actual background colour from the image's border and classify by distance
to it, falling back to a plain darkness guess only when the border itself
isn't clean enough to trust. This is a heuristic, not segmentation — it's why
the museum numbers above are believable rather than an artefact of a bad
decode (an earlier version of this logic had exactly that bug: it inferred
"has real transparency" from ink share, which reads identically for a real
transparent PNG and a flattened one with a synthetic fully-opaque alpha
channel, and was misclassifying every flattened photo as one solid block).

## Sources set aside without probing

- **Photographs and paintings in general** — would require dithering. See
  above; the museum probes above are the specific, measured version of this.
- **Copyleft and NonCommercial icon sets** (GPL, CC-BY-NC) — excluded by
  `REDISTRIBUTABLE` in the sweep script. ShareAlike (CC-BY-SA) is **allowed**
  as of 2026-08-07 and is in that regex — see the note earlier in this
  document for the reasoning. (This bullet previously said the opposite; it
  was stale, and the pixel-art hunt tripped over it.)

## Pixel art: generator changes made to receive it (2026-08-07)

The sweep above is all vector icon sets reduced onto a grid. Pixel art —
sprites drawn by hand, one cell at a time, at a size that's already close to
playable — is a different shape of source entirely, and testing it against
real hand-drawn and photographed sprites (not icon-set renders) this session
surfaced three genuine gaps in the generator, now fixed in
`tools/puzzlegen/src/`:

1. **Quality thresholds were calibrated for reduced vectors, not native
   sprites.** A hand-placed sprite earns denser fill and a couple of loose
   marks on purpose — `generateFrom` now relaxes `maxFill`/`maxIsolated`
   automatically whenever the fit lands on the native (unscaled) path. An
   explicit `options.quality` always overrides this.
2. **A mark floating a few cells from the main figure** (a spout's spray, a
   couple of stars) left `repair.ts`'s boundary-only escalation unable to
   pin it down, no matter the edit budget — the ambiguity was interior, and
   repair never touches interior cells by design. Two fixes, composed:
   `collapseEmptyLines` (new in `bitmap.ts`) shrinks interior gaps of 2+
   blank rows/columns to one before fitting, and if `repairToPureLogic`
   still fails, `generateFrom` now retries once after dropping whatever
   cells `playability` would have flagged as isolated anyway.
3. **A sprite is routinely exported or screenshotted larger than it was
   drawn** — a 15x19 sprite saved as a 400x400 PNG looks exactly like a
   vector needing the square ladder, and reducing it that way rarely lands
   back on the exact grid its author drew. `detectPixelGrid`/
   `alignToPixelGrid` (new in `bitmap.ts`) recover the original grid from the
   run-length structure of a blown-up image — flat pixel art has a hard edge
   between cells, so the run-length population is dominated by multiples of
   one true pitch — and only accept a candidate when reducing to it leaves
   the picture decisively black-or-white almost everywhere. A photograph or
   a softly-antialiased curve fails that test and passes through unchanged.
   `generateFrom` tries this automatically before falling back to the square
   ladder.

Validated against seven real sprites (a monkey face, a soot sprite, a dither
moon, a whale with floating spout dots, a skull, a robot icon, a cat face),
decoded from the raw uploaded image with **no manual grid-finding** — the
point of item 3 above. All seven now resolve automatically; the two
regressions this surfaced along the way (a unit-selection bug that let a
short noise run block a correct, coarser candidate from ever being tried, and
a confidence threshold too strict for real scan/photo artefacts) are covered
by new tests in `test/puzzlegen.test.ts`.

**Known remaining gap:** a sprite exported with *smooth* (non-nearest-neighbour)
upscaling has no hard cell edges left to detect a pitch from — one real test
case (a monkey face) still needs its native size passed explicitly via
`options.fit`. Nothing to build yet; noted so a future session doesn't
re-discover it from scratch.

**Not yet run:** `pnpm build && pnpm test` on an actual Windows checkout. This
session's sandbox can execute the compiled logic directly (patched around a
broken cross-OS pnpm symlink) but cannot run the real `tsc`/`vitest` toolchain
against the pnpm-linked `node_modules` created on Windows. The logic was
verified by mirroring every change into a scratch JS copy and asserting the
exact behaviour the new tests describe, but the actual compiler has not
touched this code — **run the real build and test suite before trusting this
is merged.**

## Pixel art: the source hunt (2026-08-07)

The section above changed the generator to *receive* pixel art. This one is
about where to get it. Catalogue in
`scripts/probes/pixel-sources.json`, downloader in
`scripts/probes/fetch-pixel-sources.mjs`.

### The finding that reframed the problem

The obvious move was to look for more pixel-art sets on npm, the way
`pixelarticons` was found. That move is already spent: **every pixel-styled
collection worth naming is already in the sweep above**, because
`@iconify/json` is where they all live.

| Set | Licence | Total | Kept / 60 | Verdict |
|---|---|---:|---:|---|
| `pixelarticons` | MIT | 877 | **39 (65 %)** | Still the champion. The `877` in `data/source-ranking.json` is already the current free set — there is no stale snapshot to re-pull. |
| `picon` | OFL-1.1 | 824 | 32 (53 %) | Already ranked. |
| `memory` (Pictogrammers) | Apache-2.0 | 651 | 24 (40 %) | 22×22, drawn pixel by pixel for a Sharp Memory display. Already ranked. |
| `pinhead` | CC0-1.0 | 2 467 | 23 (38 %) | Already ranked. |
| `pixel` (HackerNoon) | CC-BY-4.0 | 578 | 15 (25 %) | Already ranked. Ten of the fifteen land at 35×35. |
| `famicons` | MIT | 1 342 | 15 (25 %) | The name misleads — it is an Ionicons fork, smooth vector. |
| `game-icons` | CC-BY-3.0 | 4 133 | 10 (17 %) | Vector silhouettes at 512², not pixel art. |
| `dinkie-icons` | MIT | 1 198 | 8 (13 %) | Genuine bitmap style, but measured badly. |
| `streamline-pixel` | CC-BY-4.0 | 662 | **0 (0 %)** | Zero out of sixty. Worth understanding before trusting the 32 px band. |

So the npm well is dry, and the reason is structural rather than bad luck:

> **Iconify only holds SVG.** `rasterizeSvg` renders it large, so `fit.ts`
> takes the square ladder every time. `natives` is **0 in all 213 collections
> of the sweep, without a single exception** — the native path that the
> pixel-art work above was built for has never once fired on a real source.

Raster pixel art is therefore not "more of the same, from a different host".
It is the only category of source that can use that path at all, and none of
it is on npm. That is what justifies a downloader.

### What the hunt found

Twenty packs kept, five set aside as eligible-but-unmeasured, fifteen rejected
outright. Full reasoning, per-pack notes and the exact licence wording seen on
each page are in `pixel-sources.json`; the headlines:

| Pack | Licence | Files | Native | Why |
|---|---|---:|---|---|
| **Nikoichu — 1-bit Pixel Icons** | CC0-1.0 | 1 476 | 16×16 | The single best find. Already 1-bit, individually named PNGs. Manual (itch.io). |
| **Kenney — 1-Bit Pack** | CC0-1.0 | 1 078 | 16×16 | Best automatable pack. Already 1-bit, so the sprite *is* the solution grid. |
| **OGA — Dungeon Crawl 32×32 (+suppl.)** | CC0-1.0 | 6 000+ | 32×32 | Largest CC0 single-subject corpus anywhere. Manual. |
| **OGA — DENZI public domain** | CC0-1.0 | ~400 | 32×32 | Pre-sliced and category-named: the fastest pilot corpus. Manual. |
| **Kenney — Pixel Shmup / Food Exp. / Tiny \*** | CC0-1.0 | ~950 | 16–18 px | Colour sprites; these are what actually exercise colour→binary. |
| **Fugue Icons** | CC-BY-3.0 | 3 922 | 16×16 PNG | Largest clean-licence 16 px raster set. **Six third-party icon *names* are BY-SA/GPL** and are dropped on extract (see caveat below). |
| **famfamfam Silk** | CC-BY-2.5 | 1 000 | 16×16 PNG | Huge subject variety, but colour + antialiasing at 16 px. Measure before investing. |

**Start with 1-Bit Pack.** Running an already-binary source first means that
if the native path misbehaves, thresholding cannot be the suspect.

### Four things to not get wrong

1. **H6 stops being deferrable.** CC-BY was already on the list — the
   "Attribution" section above has required in-app credit for `picon`, `whh`,
   `streamline-*` and the Font Awesome sets since the sweep. What changes is
   the weight: two of the largest raster packs (**Fugue**, CC-BY-3.0, and
   **famfamfam Silk**, CC-BY-2.5) plus HackerNoon and game-icons are all
   attribution-bound, so **H6 — the in-app credits screen** is now a hard
   blocker on shipping from them rather than a Fase 1 nice-to-have. This is a
   judgement change about priority, not a new discovery. See `docs/06` §7.1.
2. **`famfamfam-silk` is CC-BY-2.5, which `REDISTRIBUTABLE` in
   `sweep-sources.mjs` does not match** — the regex lists 3.0 and 4.0 only.
   Decide whether 2.5 joins the list before any Silk-derived puzzle reaches a
   release, or drop the pack.
3. **The Fugue exclusion drops ~12 files, not 6.** The six third-party names
   (`geotag`, `language`, `open-share`, `opml`, `share`, `xfn`) are matched on
   the filename **stem, exactly** — so `share-document.png` is kept, and only
   the literal `share.png` goes — but the match runs across both included
   folders, so each name costs up to two files. Read the log line as "each of
   these six names, everywhere it appears", not as a file count.

   Related, and confirmed against the repo tree on 2026-08-07: the pack is
   pulled from **`icons-shadowless/` + `bonus/` only, not `icons/`**. The
   `icons/` set is the same art with a drop shadow baked in — anti-aliased
   grey pixels, exactly the noise that muddies a 16 px binarisation — and
   taking both folders would duplicate every icon just so `dedupe` could throw
   half of them away. `src/` (vector sources) is excluded too.
4. **Dungeon Crawl needs a provenance diff.** `github.com/crawl/tiles` keeps
   `TILES_UNDER_UNKNOWN_LICENSE.md`, tiles whose licensing is unclear and
   which the CC0 export is supposed to have already filtered. Snapshot that
   list and cross it against the selected filenames before publishing.

Related, and the general lesson from the rejected list: on community sites the
uploader sets the licence field, and several sets are mistagged in both
directions. DENZI has a CC0 node and a CC-BY-SA sibling node; Wyrmsun has a
CC0 half and a CC-BY-SA/GPL half; 7Soul1's 420-icon set is GPL/CC-BY-SA and
its 496-icon successor is the post-cleanup CC0 one. A commenter on that last
thread put the risk better than any policy could: *"most artists think that
public domain means something like OGA/CC BY"*. Every automated download
writes a `PROVENANCE.json` next to the files for exactly this reason —
`_sources/` is gitignored, so nothing else records where a PNG came from.

### Running it

```bash
cd tools/puzzlegen
node scripts/probes/fetch-pixel-sources.mjs --list
node scripts/probes/fetch-pixel-sources.mjs --priority 2   # the good stuff
node scripts/probes/fetch-pixel-sources.mjs --all
```

It prints the matching `probe-local-folder.mjs` command per pack, licence
already filled in. itch.io and OpenGameArt are marked `manual` and print
instructions instead of downloading: both put files behind a browser flow,
and scraping around that is fragile and rude to hosts giving art away.

**Verified, reproducibly:**

```bash
node scripts/probes/fetch-pixel-sources.mjs --self-test
```

21 assertions over the ZIP and tar readers — both hand-rolled on `node:zlib` to
keep the script dependency-free, and therefore the riskiest part of it — plus
the extraction filters, the path-traversal guard, and the Kenney URL resolver.
The archives are built in memory (deflate ZIP, stored ZIP, pax tarball with a
>100-character path), so there are no fixtures to go stale and it runs anywhere
Node does. `vitest` only covers `packages/`, which is why this is a flag rather
than a test file.

## Pixel art: the first pack, measured (2026-08-07)

The 1-Bit Pack went through the real pipeline on a real checkout. Two things
came out of it: a wrong assumption corrected, and the best numbers any source
has produced.

### The assumption that was wrong

**Kenney packs do not ship individual sprites.** The 1-Bit Pack's ZIP contains
only spritesheets, and the "1078 files" on the asset page counts tiles *inside*
those sheets. The download was complete and correct; there were simply 16 files
where 1 078 were expected, because there was nothing per-sprite to measure.

The fix is `scripts/probes/slice-spritesheet.mjs`, which sits between the
download and the probe. It is safe rather than clever: Kenney ships a
`Tilesheet.txt` giving tile size, spacing and tile counts, and those numbers
reconcile against the PNG's own dimensions to the pixel —
`49 × 16 + 48 × 1 = 832`, `22 × 16 + 21 × 1 = 373`. The script **refuses to
slice when that arithmetic doesn't close**, because a grid off by one pixel
yields 1 078 sprites each carrying a sliver of its neighbour, and every gate
downstream would accept them as plausible puzzles.

```bash
node scripts/probes/slice-spritesheet.mjs _sources/kenney/1-bit-pack
# -> 1072 tiles written (2 blank, 4 duplicate, of 1078)
node scripts/probes/probe-local-folder.mjs \
  _sources/kenney/1-bit-pack/_tiles/monochrome-transparent \
  --license CC0-1.0 --source "kenney/1-bit-pack" --author "Kenney"
```

Point the probe at `_tiles/<sheet>/`, not the pack root — the probe walks
recursively and would otherwise also measure the sheets the tiles came from.

### The numbers

**587 puzzles accepted from 1 072 tiles — 54.8 %.** But the rate is not the
interesting part. This is:

| | 1-Bit Pack | Best of the npm sweep (`pixelarticons`) |
|---|---|---|
| Rejected by **fidelity** | **0 of 1 072** | 57 % of all rejections, globally |
| Rejected by playability | 378 | — |
| Rejected by logic | 11 | — |
| Dropped as duplicates | 96 | — |
| Difficulty 1→5 | **87 / 181 / 177 / 107 / 35** | 3 / 3 / 6 / 13 / 14 |
| Longest side | 5→1, **10→67, 15→491**, 20→28 | 20→27, 25→2, 30→1, 35→3 |
| Rectangular boards | **139 (24 %)** | 0 |

Three things there matter more than the headline percentage.

1. **The fidelity gate rejected nothing at all, and cannot.** Fidelity asks
   "does this survive being reduced to a grid?" A 16×16 sprite used unscaled is
   never reduced, so there is no fidelity to lose — the gate is vacuous by
   construction rather than lenient. This is the **first source in the
   project's history to take `fit.ts`'s native path**; `natives` was 0 across
   all 213 npm collections. The pixel-art work in the section above was built
   on the belief that this path would pay off, and it had never once fired
   until now.
2. **The small-board shortage is solved, without a hack.** The open problem was
   "5×5 → 6, 10 → 93, 15 → 171" against 500-600 boards at each of 20/25/30/35,
   with a note that the easy pack "probably needs to generate with `fit.maxSize`
   limited". No longer: **558 of 587 boards have a longest side of 10 or 15**,
   naturally, because that is the size the art was drawn at.
3. **The difficulty curve arrives shaped.** `pixelarticons` skews hard to 4–5.
   This pack gives 87 boards at difficulty 1 and 181 at 2 — the shallow end
   that the three-pack curve actually needed and that nothing else supplied.
   Revalidating `estimateDifficulty` (open decision 6) now has a corpus worth
   revalidating against.

Also worth noting: **118 of the 587 needed repair edits** to reach pure
logical solvability, and only 11 tiles failed the logic gate outright. Without
`repair.ts` those 118 would be losses; the repairer is carrying about a fifth
of this pack.

One source, one pack, 587 puzzles against the ~100 Fase 1 asks for. **Sourcing
is over as a problem.** What remains is selection — and the note in "Picking
sources for the three packs" about deduplicating over the *merged* set, not
per collection, is now the binding constraint.

## Pixel art: the second pack, and the merge (2026-08-07)

Fugue Icons, downloaded on a real checkout and measured the same way.

### One more duplication trap, and it cost 3 points

The first run gave **1 221 of 3 882 (31.5 %)** — and two subfolders came back
at *exactly* 0 %, which is never coincidence. The cause: Fugue ships every
icon twice, shadowed and shadowless, **at two levels**. Excluding the
top-level `icons/` (as the catalogue already did) left `bonus/`'s own pair
intact, and alphabetical order handed the win to the shadowed variant —
`bonus/icons-shadowless-24` scored 0 of 249, all of them dropped as duplicates
of `bonus/icons-24`.

That is backwards. The shadow is baked-in anti-aliased grey, precisely the
noise that muddies a 16 px binarisation. Narrowing `include` to the three
shadowless folders and dropping `bonus/animated/` (animation frames — the only
two that passed were a 20×5 marching-ants selection border and a spinner):

| | files | accepted | rate |
|---|---:|---:|---:|
| With the duplicated folders | 3 882 | 1 221 | 31.5 % |
| **Shadowless only** | **3 538** | **1 219** | **34.5 %** |

344 wasted files removed, 2 puzzles lost, and the clean art now wins.

**The general lesson, twice over now:** an icon set that ships variants — with
and without shadow, colour and monochrome, packed and padded — will silently
route the *worse* variant into the corpus if the include list is written by
eye. Both times it showed up as a subfolder at a suspiciously round 0 %.
Check the per-folder acceptance breakdown, not just the headline rate.

### The numbers

**1 219 accepted of 3 538 — 34.5 %.** A lower rate than the 1-Bit Pack's
54.8 %, but a **larger absolute harvest: 1 219 against 587.**

| | Fugue Icons | Kenney 1-Bit Pack |
|---|---:|---:|
| Accepted | **1 219** (34.5 %) | 587 (54.8 %) |
| Difficulty 1→5 | 176 / 468 / 343 / 160 / 72 | 87 / 181 / 177 / 107 / 35 |
| Longest side | 10→133, **15→782**, 20→264, 25→25, 30→11 | 10→67, **15→491**, 20→28 |
| Rectangular | 464 (38 %) | 139 (24 %) |
| Needed repair | 240 | 118 |
| Rejected by fidelity | **2** | **0** |

Fidelity rejected 2 of 3 538 — the native path is doing the same work it did
for Kenney. The difficulty curve has the same healthy shape, and 915 of the
1 219 boards have a longest side of 10 or 15.

### The merge costs one puzzle

`docs/06` flagged deduplicating over the **merged** set as the binding
constraint, on the reasoning that every icon library has a heart, a star and a
house. Measured, on the union of both packs:

| | |
|---|---:|
| Input images | 4 610 |
| Accepted, measured separately | 1 806 |
| Accepted, measured merged | **1 805** |
| **Cross-source duplicates** | **1** |

One. `dedupe`'s default `minDistance` of 0.06 is *stricter* than the 0.04
`sweep-sources.mjs` uses, so this isn't a lenient threshold flattering the
result.

### …and that number means much less than it looks

**`dedupe` compares grids, not meanings.** Kenney's heart and Fugue's heart
differ by a few pixels, so `gridDistance` puts them well past 0.06 and both
survive. "1 cross-source duplicate" therefore says nothing about how many
*subjects* repeat — and for a game whose reward is the revealed picture
(RF-BIB-4), the subject is what the player actually experiences as repetition.

Fugue's filenames are descriptive (`heart--plus.png`, `arrow-090.png`), so the
first token is a usable proxy for the subject. Counting them:

| | |
|---|---:|
| Accepted puzzles | 1 219 |
| **Distinct subjects** | **270** |
| …of which are pictures, not UI chrome | 203 |
| Puzzles living inside chrome subjects | 493 |

The distribution is brutal: **`arrow` alone accounts for 154 puzzles, 12.6 % of
the pack.** Then `edit` 58, `control` 39, `ui` 36, `layer` 16. 86 subjects with
five or more variants hold 867 of the 1 219. Only 97 subjects appear once.

Yield under a per-subject cap, which is what selection will actually need:

| Cap per subject | All subjects | Chrome subjects removed |
|---|---:|---:|
| 1 | 270 | **203** |
| 2 | 443 | 338 |
| 3 | 582 | 447 |
| 5 | 782 | 605 |

So Fugue's honest contribution is **~203 distinct pictures**, not 1 219. Still
twice what Fase 1 needs, and the picture vocabulary is genuinely good — acorn,
anvil, balloon, bandaid, bell, brain, bread, broom, bug, cake, candle, church,
compass, cookie, crown, curtain, ghost, hourglass, lighthouse, piano, rainbow,
robot, rocket, skull, snowman, trophy, umbrella, windmill. But the headline
count was measuring the wrong thing.

**Consequences for selection, and for which source comes next:**

- Selection needs a **cap per subject plus a chrome blocklist**, not just grid
  dedupe. Grid dedupe cannot see that four of your hundred puzzles are arrows.
- Kenney's tiles are named positionally (`r00c08.png`), so this analysis
  **cannot be run on them** — their subject variety is unmeasured and would
  need eyeballing or a classifier.
- **The scarce resource is distinct subjects, not puzzles.** That reverses the
  sourcing priority: another 16×16 desktop icon set adds volume in the
  vocabulary we already have too much of. `famfamfam-silk` is exactly that —
  same era, same size, same desktop-metaphor vocabulary as Fugue — and should
  be demoted or dropped rather than measured. What is worth adding is material
  with a *different* vocabulary: creatures, animals, food, plants, tools,
  vehicles. Dungeon Crawl, DENZI, 16x16 Food and Hexany's monsters are exactly
  that, and all four are CC0.

**Two sources, 1 805 puzzles, but roughly 200-300 distinct pictures.** Enough
for Fase 1's ~100 with room to choose, and the remaining sourcing question is
about variety, not volume.

## Pixel art: everything measured (2026-08-07)

Eleven packs, 17 338 images on disk, all through the real pipeline.

| Source | Licence | Files | Accepted | Rate |
|---|---|---:|---:|---:|
| **DCSS `monster/`** | CC0 | 1 282 | **871** | **67.9 %** |
| **16x16 Food** | CC0 | 188 | 108 | **57.4 %** |
| Kenney 1-Bit Pack | CC0 | 1 072 | 587 | 54.8 % |
| DCSS `player/` | CC0 | 975 | 463 | 47.5 % |
| Kenney Pixel Shmup | CC0 | 24 | 11 | 45.8 % |
| DCSS `item/` | CC0 | 957 | 413 | 43.2 % |
| DCSS `gui/` | CC0 | 500 | 209 | 41.8 % |
| Nikoichu 1-bit Icons | CC0 | 1 476 | 577 | 39.1 % |
| DENZI | CC0 | 1 361 | 520 | 38.2 % |
| DCSS `effect/` | CC0 | 238 | 91 | 38.2 % |
| DCSS `misc/` | CC0 | 582 | 208 | 35.7 % |
| Fugue Icons | CC-BY-3.0 | 3 538 | 1 219 | 34.5 % |
| Kenney Tiny Dungeon | CC0 | 132 | 42 | 31.8 % |
| Kenney 1-Bit Platformer | CC0 | 800 | 208 | 26.0 % |
| Kenney Monochrome RPG | CC0 | 136 | 35 | 25.7 % |
| Kenney Food Expansion | CC0 | 112 | 12 | 10.7 % |
| **Hexany's Monsters** | CC0 | 64 | **0** | **0 %** |
| DCSS `dungeon/` | CC0 | 1 483 | — | not measured (terrain) |

**~3 850 CC0 puzzles**, plus 1 219 more under CC-BY from Fugue.

Three results worth more than the totals:

**DCSS monsters beat everything, including the old npm benchmark.** 67.9 %
against `pixelarticons`' 65 %. Monsters are ideal nonogram subjects: one
creature, filled silhouette, drawn to read at 32×32.

**Hexany scored 0 of 64, and it isn't a bug.** All 64 died on playability —
`3 isolated pixel(s), 9 blocks in one line`. The art is 1-bit creatures drawn
with eyes, speckles and texture, and that fineness simply doesn't survive as a
nonogram. A genuine content mismatch, recorded so nobody re-downloads it.

**Kenney's Food Expansion managed 10.7 %**, the worst of the lot, despite
being the pack the original research called "best keeper-ratio in the entire
catalogue". The food is drawn small inside its tile, so there is very little
ink. Predicting yield by eye keeps being wrong; measuring keeps being cheap.

### Subject overlap across sources: the real answer

The earlier grid-dedupe result (1 duplicate) measured the wrong thing. Now
that five sources have descriptive filenames, the subject question can be
answered directly:

| Source | Puzzles | Distinct subjects | Puzzles per subject |
|---|---:|---:|---:|
| DCSS `monster/` | 871 | 318 | 2.7× |
| Fugue | 1 219 | 270 | 4.5× |
| Nikoichu | 577 | 234 | 2.5× |
| DENZI | 520 | 171 | 3.0× |
| DCSS `item/` | 413 | 126 | 3.3× |
| **16x16 Food** | 108 | **99** | **1.1×** |

| | |
|---|---:|
| Sum of per-source subjects (CC0 only) | 948 |
| **Distinct subjects in the union** | **857** |
| Lost to cross-source repetition | 91 (9.6 %) |

So the repetition to worry about is **internal**, not cross-source: each
source repeats its own subjects 2.5–4.5×, but the sources barely repeat each
other. Choosing packs for *different vocabulary* rather than volume worked
exactly as intended.

The largest cross-source overlap is **DENZI ∩ DCSS monsters, 40 subjects**
(dragon, eye, serpent) — expected, and predicted by OGA's own page, which says
DENZI's art is partly *inside* Dungeon Crawl. Worth deduping those two against
each other specifically.

**16x16 Food is the standout at 1.1×** — 99 distinct subjects from 108
puzzles, almost no internal repetition, in the everyday vocabulary that both
icon sets and roguelikes lack.

**857 distinct CC0 subjects against the ~100 Fase 1 needs.** Fase 1 can now be
built entirely from CC0 material, which makes H6 (the credits screen) a
choice rather than a blocker.

## Three packs with no provenance, resolved (2026-08-07)

Three folders showed up under `_sources/` without a `PROVENANCE.json` — they
were downloaded by hand, so nothing recorded where they came from. Under `04`
§2.4 that alone bars them from a release. Licences traced back to their pages
and recorded:

| Pack | Licence | Evidence |
|---|---|---|
| **VEXED — Bit Bonanza** | CC0-1.0 | Four independent statements agree: the title `(1Bit, CC0, Free)`, the `Asset license` row, the prose *"These assets are CC0, use them in commercial projects modify tiles as you wish"*, and the author replying in comments *"credit is appreciated but not required"*. |
| **vurmux — Urizen 1Bit** | CC0-1.0 | `Asset license` row plus a prose `License:` section, followed by *"Credits are not required, but highly appreciated :)"*. |
| **Darkmoonfire — 1-Bit Mystery Icons** | **CC-BY-SA-4.0** | OGA `License(s)` field, plus `Copyright/Attribution Notice: "1-Bit Mystery Icons by Darkmoonfire"`. |

**Do not treat these as one bucket.** Two are public domain; the third is
copyleft with a mandatory attribution string and ShareAlike on derivatives.
(SA is permitted by policy — see the ShareAlike note above — but it is a
materially different obligation.)

One provenance trap found in the process: the extracted folder is named
`Bit-Bonanza-10x10-v-5.0` while a `Bountiful-Bits-v-3.1.zip` sits beside it.
Those are **two different packs by the same author**, both CC0. The licence was
initially checked against the wrong one; the folder's own `README.txt` says
"Bit Bonanza" and declares no licence at all, which is what caught it.

### A classifier gap, found by a 0 %

Mystery Icons scored **0 of 45**, every one rejected as `too dense (91% ink)`.
Not a content problem — a real bug in `classifyRaster`:

> The sheet **has an alpha channel but is 89.4 % opaque.** Its background is a
> painted dark rectangle, not transparency. `classifyByAlphaWithClipping`
> treats opaque as figure, so it read the entire background as ink.

`hasAlpha` is necessary but not sufficient. When nearly everything is opaque
the alpha channel carries no figure/ground information, and the right move is
the border-colour detection `classifyByBackground` already implements. Fixed
with an opaque-share cutoff of 0.85.

| | Before | After |
|---|---:|---:|
| Mystery Icons | 0 % | **66.7 %** |
| 16x16 Food (control) | 57.4 % | 57.4 % |
| Hexany (control) | 0 % | 0 % |

No regression, and Hexany staying at 0 confirms its failure is genuinely the
art's fineness rather than this bug. **The gap affects any 1-bit sheet exported
with a painted background**, which is a common format — this was worth more
than the 30 puzzles that triggered it.

### And the pack that solves the easy tier

| Source | Licence | Files | Accepted | Rate | Longest side |
|---|---|---:|---:|---:|---|
| **Urizen 1Bit** | CC0 | 5 540 | **1 821** | 32.9 % | 5→21, **10→803**, 15→997 |
| **Bit Bonanza** | CC0 | 1 223 | 540 | 44.2 % | 5→8, **10→532** |
| Mystery Icons | CC-BY-SA | 45 | 30 | 66.7 % | 20→30 |

**Urizen is the largest single harvest in the project — 1 821 puzzles**, more
than Fugue's 1 219. Its geometry was recovered rather than guessed: tile 12,
spacing 1, margin 1 reconciles `2679 = 206·12 + 205·1 + 2` and
`651 = 50·12 + 49·1 + 2` exactly, and yields 5 540 non-blank tiles against the
author's advertised "5500+".

**Bit Bonanza is drawn at 10×10**, so 532 of its 540 puzzles land at longest
side 10 and 8 at 5×5. For context, before these two sources the *entire*
project had 6 boards at 5×5 and 93 at side 10. Together they contribute
**1 364 boards of side 10 or under** — the easy tier is no longer a problem,
and `fit.maxSize` never needed touching.

Worth recording: two people have already built nonograms from Bit Bonanza — a
published picross book and the game *Do You Like Picross* — both with the
author's blessing in the comments. Independent confirmation that 10×10 1-bit
game sprites are the right shape for this.

## The acceptance rate is not a quality score (2026-08-07)

Kacper Woźniak's **1-Bit Icons** (CC0-1.0, verified: `Asset license` row *and*
prose agree) turned out to be the cleanest controlled experiment the project
has: **the same 35 objects, drawn by the same author at 8, 16 and 32 px**, in
two styles. Only the drawing's fidelity changes.

| Sheet | Accepted / 35 | Rate |
|---|---:|---:|
| **8 px simple** | 19 | **54.3 %** |
| 8 px detail | 15 | 42.9 % |
| 16 px detail | 10 | 28.6 % |
| 16 px simple | 9 | 25.7 % |
| 32 px detail | 8 | 22.9 % |
| 32 px simple | 5 | 14.3 % |

**The rate falls monotonically as the art gets bigger — 8 px yields double what
32 px does.** That directly contradicts the original research, which dismissed
Kenney's 8×8 packs as "too coarse to be recognisable".

The explanation matters more than the result:

> **The pipeline measures playability, not recognisability.** Coarser art has
> fewer isolated pixels and fewer blocks per line, so it sails through the
> playability gate. *No gate anywhere checks that the figure is still
> identifiable.*

So a high acceptance rate can mean "this reduces to a clean, solvable grid" and
say nothing about whether the player will recognise a lantern when they finish
it. The two can point in opposite directions, and here they do. **Read every
rate in this document with that caveat**, and look at candidates by eye before
committing them to the hundred.

The pack itself is small — 40 tiles, 35 non-blank, and the *same* objects in
all twelve sheets, so its ceiling is 35 subjects no matter which sheet wins.

## The npm ranking is not a reliable number (2026-08-07)

`pixelarticons` was the sweep's declared champion at 65 %. Measured properly
from its own repo (MIT, 877 SVGs with a 24×24 viewBox):

| | Rate | Accepted | Longest side | Difficulty 1→5 |
|---|---:|---:|---|---|
| At 256 px (the sweep's path) | **43.0 %** | 377 | **10→257**, 20→56 | 26/110/122/83/36 |
| At its native viewBox | **52.3 %** | 459 | **20→379**, 25→75 | 21/72/137/98/131 |

**The 65 % does not reproduce.** The same in reverse for HackerNoon: the sweep
recorded 25 %, and the same 256 px path against its repo gives 63.3 %. Two
numbers wrong, in opposite directions. Likely causes: a 60-icon sample, and
`dedupe` at 0.04 in the sweep versus 0.06 in the probe.

> **`data/source-ranking.json` is useful for ranking candidates roughly, not as
> a trustworthy figure for any specific collection.** Anything headed for the
> hundred must be measured from its own source.

**On rasterising at the native viewBox:** it raises the rate for both sets
(+6.6 and +9.3 points) and **eliminates fidelity rejections** — expected, since
without reduction there is no fidelity to lose. But it is **not a strict
improvement**: for `pixelarticons` the 256 px path produces 257 boards at side
10 and an easier curve, while the native path pushes them to side 20 and hardens
the curve. You gain puzzles and lose small boards.

So the recommendation is **not** to replace one path with the other, but to try
both and keep both outputs, letting `dedupe` sort out the overlap. That touches
`src/raster.ts` and `src/pipeline.ts`, so it needs a Windows build — pending.

Aside: **HackerNoon via its 16 px PNGs scores 75.2 %**, the highest rate in the
catalogue. But it is CC-BY-4.0, so admitting it makes H6 blocking again.

## Does the pipeline need tuning? Measured: no (2026-08-07)

17 015 images through the real pipeline is enough to answer with data.

| Gate | Rejections | % of all |
|---|---:|---:|
| **Playability** | **7 067** | **41.5 %** |
| Duplicate | 2 490 | 14.6 % |
| Fidelity | 235 | 1.4 % |
| Logic | 196 | 1.2 % |
| *Accepted* | *7 025* | *41.3 %* |

Fidelity and logic barely reject anything now — the native path and the
repairer between them. Playability rejects as many as get accepted, and its
dominant cause is **isolated pixels: 4 133**, then `too dense` (2 536) and
`too sparse` (925).

Relaxing that threshold on the already-fitted board:

| `maxIsolated` | DCSS monster (400) | Nikoichu (400) | Hexany (64) |
|---|---:|---:|---:|
| 0 | 212 | 203 | 0 |
| **2 ≈ current default** | **257** | **215** | **0** |
| 3 | 269 | 216 | 0 |
| 5 | 278 | 222 | 0 |

Going from 2 to 5 buys **+5 to +8 %** more puzzles, and the difficulty split
shows almost all of them land at 4–5: speckled boards with floating dots, the
tedious kind. Against a corpus already holding 60× what Fase 1 needs, that is a
bad trade. **The gates are well tuned. Leave them alone.**

> **Worth not rediscovering:** passing an explicit `options.quality`
> **overrides the native path's automatic relaxation**. That is why the
> `maxIsolated: 0` row above scores *worse* than the default, even though the
> nominal default is also 0.

Hexany survives none of these settings, confirming its 0 % was the art, not the
configuration.

**Aggregate distributions are healthy** across 7 025 accepted puzzles:

- **Difficulty** 7.0 / 28.8 / 30.5 / 20.9 / 12.7 % — a bell centred on 3. This
  is also the first evidence that `estimateDifficulty`, rewritten against
  random puzzles, produces a sane spread on *image-derived* ones. Open decision
  6 is half-answered: the shape is right. Whether the **labels** are right —
  that a "1" actually feels easy — still needs someone to play them.
- **Size** 21 % at side 10, 33 % at 15, the rest spread to 35.

**The one measured pipeline improvement worth having** is the dual SVG
rasterisation above: try 256 px *and* the native viewBox, keep both outputs.
But it only applies to SVG sources, and with ~6 240 CC0 puzzles of raster
origin it is no longer a bottleneck. Low priority.

**The real gap is not in conversion.** No gate measures recognisability, and
nothing validates that a "difficulty 1" feels easy. Both need eyes, not code.
The leverage has moved from the pipeline to **selection**.

## One pack rejected on licence (2026-08-07)

**PixyMoon — Cute RPG Icons** (`pixymoon.itch.io/cute-rpg`) is out.

The itch page has **no `Asset license` row at all**, so the only licence source
is hand-written prose: *"You can use it on your project, personal or
commercial… Credits to PixyMoon"* / *"You cannot: Sell this asset pack, not
even modified."*

No named licence means `04` §2.4 applies: the puzzle enters as
`distributable: false` and is blocked from every output path, including the
embedded-library build that *is* the Fase 1 artefact. On top of that, the
anti-redistribution clause sits badly with shipping the art inside a repo that
anyone may fork. Same verdict as Shikashi's Fantasy Icons: good content,
insufficient licence.

The ZIP is kept unextracted under `_sources/piximoon/` with a `PROVENANCE.json`
recording the decision, so a future session doesn't rediscover and measure it.

A tell worth remembering: the pack tags itself `1-bit` and `Low-poly` while
being a bright multicolour 16×16 icon set. When a page's own metadata is that
careless, trust the prose over the tags — and where they conflict, trust
neither without asking.

### Still not verified

The live Kenney page-scrape shipped broken: it looked for `href="….zip"` and
found nothing, silently falling back to the pinned URL. The link is really
there — it hangs off a "Continue without donating…" anchor inside a donation
interstitial. The resolver now matches any `.zip` in the document and prefers
the filename mentioning the page's slug, with the real markup (plus a decoy
bundle link, single quotes, and a relative href) covered in `--self-test`. It
has still not run against the live page; the pinned `zipFallback` URLs remain,
and Kenney rotates the hash in them on every reupload, which is why the scrape
exists at all.
