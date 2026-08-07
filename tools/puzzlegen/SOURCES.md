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
  `REDISTRIBUTABLE` in the sweep script. ShareAlike (CC-BY-SA) is *not* in this
  list as of 2026-08-07 — see the note earlier in this document.
