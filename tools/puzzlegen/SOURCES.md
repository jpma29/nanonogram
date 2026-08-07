# Picture sources

Which collections of images actually turn into good nonograms, measured rather
than guessed. Every candidate here is redistributable and available from npm,
which matters: the previous content plan died because it depended on one
person's GitHub repository, and that repository was deleted
(`docs/07-fuentes-de-contenido.md`).

## The constraint that decides everything

Dithering is not used (see `bitmap.ts`), so **only images that are already
silhouettes work**. Photographs and paintings need exactly the technique we
rejected. What survives being reduced to a 20x20 grid is bold, filled,
connected shapes.

The pipeline's fidelity gate is the instrument for judging a source: feed it 200
images and the acceptance rate answers the question.

## Measured results

200 images sampled from each, run through the full pipeline at the current
defaults — square grids on the ladder of fives up to 35, `minIou` 0.90,
threshold binarisation — then deduplicated.

| Source                                                                                                      | Licence   | Accepted | Usable per 200 | Rejected on fidelity | Rejected on playability | Difficulty 1–5 |
| ----------------------------------------------------------------------------------------------------------- | --------- | -------: | -------------: | -------------------: | ----------------------: | -------------- |
| **[Twemoji](https://github.com/jdecked/twemoji)** (`@twemoji/svg`)                                          | MIT       | **15 %** |         **25** |                   40 |                     130 | 0 8 8 5 4      |
| [Fluent Emoji HC](https://github.com/microsoft/fluentui-emoji) (`@iconify-json/fluent-emoji-high-contrast`) | MIT       |     11 % |             22 |                  172 |                       6 | 0 2 7 7 6      |
| [Bootstrap Icons](https://icons.getbootstrap.com/) (`bootstrap-icons`)                                      | MIT       |     11 % |             21 |                  124 |                      54 | 1 2 3 3 12     |
| [game-icons.net](https://game-icons.net/) (`@iconify-json/game-icons`)                                      | CC-BY-3.0 |      6 % |             12 |                  182 |                       6 | 0 4 2 5 1      |

Eighty usable puzzles from a sample of eight hundred. Projected across the full
catalogues — 11 526 images between the four — that is on the order of **1 100
puzzles**, against the ~100 the first release needs.

**The sources are complementary, which is the useful part.** Twemoji is the only
one that yields much below difficulty 3; Bootstrap Icons produces twelve level-5
boards per two hundred. The three packs can largely be built by choosing source
rather than by filtering.

## Why Twemoji leads

Because `raster.ts` binarises on the **alpha channel**, not on luminance. A
full-colour emoji therefore becomes its own silhouette, and the colour is not
merely tolerated but helpful: Twemoji is drawn with large filled regions, while
the deliberately monochrome "high contrast" set uses thin outlines — and thin
outlines are precisely what does not survive rasterisation.

Two icons of the same subject, one filled and one outlined, are not equally good
source material. Prefer filled variants everywhere.

## Dithering does nothing here, and that is informative

Error diffusion is implemented (`ditherCoverage`) and can be switched on per
run. Measured across all four sources it made things slightly **worse** — 75
usable puzzles against 80.

The reason is structural. These sources are already binary: the alpha channel is
opaque or it is not, so the coverage map is very nearly all zeros and ones with
grey only in the antialiased fringe. There are no half-tones to diffuse.
Dithering an already-binary image just sprinkles speckle along the outline,
which then trips the noise gate.

It is kept because it is the right tool for a source that _does_ have continuous
tone — an engraving, a shaded illustration, a photograph — and because the
30 % noise ceiling means it cannot quietly ruin a board. It stays off by
default.

## Reading the rejections

The gate that turns an image away says what to do about it.

- **Rejected on fidelity** — too much detail for 35 cells. Not tunable without
  giving up faithfulness. This is now the dominant rejection for every source
  except Twemoji.
- **Rejected on playability** — the shape reduces fine, but the board is too
  sparse, too dense, or too broken up. Tunable via `QualityThresholds`.
- **Rejected on logic** — essentially never happens. Everything that reaches
  that gate is fixed by moving a pixel or two of outline.

## Attribution

Every generated puzzle carries `license`, `source` and `author` from its origin,
and `distributable: true` is set only because the licence permits it. CC-BY-3.0
(game-icons) requires attribution in the shipped application, not merely in the
puzzle metadata — that is a UI obligation for whoever builds the credits screen.

## Sources considered and set aside

- **PhyloPic**, **Openclipart**, museum open-access APIs (Met, Art Institute of
  Chicago, Cleveland, Smithsonian) — all promising, all CC0, none reachable from
  the build environment, which can only reach the npm and PyPI registries. Worth
  revisiting if the library ever needs more range than the four sources above.
- **Photographs and paintings** — would require dithering. See above.
