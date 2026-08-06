# @nanonogram/shared-tests

A language-agnostic JSON test corpus. Every implementation of the nonogram
engine must pass it: `@nanonogram/core` in TypeScript today, `internal/solver`
in Go from Fase 2, and the native Anbernic client in Fase 4.

This exists because the project deliberately has two implementations of the
solver (`02-arquitectura-tecnica` §1) and two implementations that disagree
about what a valid puzzle is would be a slow, confusing bug (risk R4). The
corpus is the contract. It is checked in CI on both sides.

## Layout

| File                    | What it covers                                           |
| ----------------------- | -------------------------------------------------------- |
| `cases/line-solve.json` | Per-line constraint propagation and clue start marginals |
| `cases/crossout.json`   | Unambiguous clue cross-out (RF-AYU-2)                    |
| `cases/rules.json`      | Penalty ladder, verification allowance, crown            |
| `cases/puzzles.json`    | Whole-puzzle uniqueness and difficulty                   |

Each file is `{ "schema": "...", "cases": [...] }`. Every case has an `id` and a
`label`; the label says what the case is _for_, so a failure names the rule it
broke rather than a line number.

## Cell notation

Lines are written as strings, one character per cell:

| Char    | Meaning                                     |
| ------- | ------------------------------------------- |
| `.`     | `empty` — the player has not decided        |
| `-`     | `cross` — the player ruled the cell out (X) |
| `?`     | `dot` — soft "maybe" annotation             |
| `1`–`9` | `filled` with that palette colour index     |

Colour index 0 is the background and never appears: an unfilled cell is `.`,
`-` or `?`.

## Domain masks

`line-solve` cases report the refined per-cell domains as integer bitmasks. Bit
0 is the background; bit _c_ is palette colour index _c_. So in a monochrome
puzzle:

| Mask | Meaning            |
| ---- | ------------------ |
| `1`  | must be background |
| `2`  | must be filled     |
| `3`  | still undetermined |

## Case shapes

### `line-solve`

```json
{
  "id": "ls-0001",
  "label": "a 4-clue in 5 cells forces the middle three",
  "colors": 2,
  "clues": [{ "count": 4, "color": 1 }],
  "cells": ".....",
  "expect": {
    "feasible": true,
    "domains": [3, 2, 2, 2, 3],
    "startCount": [2],
    "firstStart": [0]
  }
}
```

`startCount[j]` is how many distinct start positions clue _j_ has across all
legal completions of the line; `firstStart[j]` is the lowest of them, or `-1`
when the clue has none. When `feasible` is `false`, the other fields are absent
and must not be compared.

### `crossout`

```json
{
  "id": "co-0001",
  "label": "a closed block that could be either of two clues stays quiet",
  "colors": 2,
  "clues": [
    { "count": 1, "color": 1 },
    { "count": 1, "color": 1 }
  ],
  "cells": "..-1-..",
  "expect": [false, false]
}
```

### `rules`

Discriminated by `kind`: `penalty`, `checks` or `crown`.

### `puzzles`

Carries a full canonical `nanonogram.puzzle/1` document plus the expected
verification outcome: `unique`, `solutionCount` (capped at 2), `difficulty` and
`rejectReason`.

## Regenerating

```
pnpm --filter @nanonogram/shared-tests build
node packages/shared-tests/dist/generate.js
```

The generator is deterministic: same seed, same corpus. Regenerate only when a
rule intentionally changes, and review the diff — a corpus that silently
absorbs a behaviour change defeats its own purpose.
