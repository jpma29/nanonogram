# nanonogram

A selfhosted nonogram game for people who already know how to play one.

No ads, no hints, no metagame. Offline-first PWA with optional sync against your
own server. The name is the point: a ~300 KB bundle, a single ~15 MB server
binary, and an engine with no dependencies at all.

> **Status: Fase 0.** The engine and its test corpus exist. There is no UI yet.
> See [`docs/`](docs/) for the design, and `docs/06-estado-actual.md` for where
> the project stands.

## Layout

```
packages/
  core/          @nanonogram/core — the engine. Pure TS, zero deps, no DOM.
  shared-tests/  JSON corpus that the TS engine and the Go server must both pass.
```

`ui/` (Svelte 5 PWA), `server/` (Go) and `native/` (Anbernic) arrive in later
phases.

## The engine

`@nanonogram/core` holds every rule of the game and nothing else. It has no
imports, no DOM, no timers, no storage and no randomness — every function is
deterministic given its arguments, and "now" is always passed in by the caller.

That constraint is load-bearing, not decorative. It is what makes the engine
testable without a browser, replicable in Go for the server's import validator,
and portable to the native Anbernic client. Two tests enforce it:
`packages/core/test/purity.test.ts` reads the source and fails on any external
import, host global, or source of nondeterminism.

| Module            | What lives there                                               |
| ----------------- | -------------------------------------------------------------- |
| `puzzle.ts`       | Palette, clues, solution, and the invariants of a valid puzzle |
| `grid.ts`         | Cell states and the RLE board encoding                         |
| `linesolver.ts`   | `O(n·k)` line propagation and clue start marginals             |
| `crossout.ts`     | Unambiguous clue cross-out (RF-AYU-2)                          |
| `clock.ts`        | Monotonic clock with pause and penalties                       |
| `rules.ts`        | Penalty ladder, verification allowance, crown                  |
| `history.ts`      | Stroke-granular undo/redo                                      |
| `game.ts`         | The run: strokes, errors, verification, win condition          |
| `solver.ts`       | Uniqueness verification and difficulty estimation              |
| `formats/json.ts` | The canonical `nanonogram.puzzle/1` format                     |

### The one algorithm worth reading first

Clue cross-out. The naive version — cross a clue out as soon as a closed block
of the right length appears — silently tells the player which of two readings of
a line is correct. This one crosses a clue out only when the line solver says it
occupies that block in _every_ legal completion. When there is any doubt, the
assist says nothing. `packages/core/src/crossout.ts` explains it in full.

## Development

```bash
pnpm install
pnpm test          # 450+ tests, including 10 000 randomly generated puzzles
pnpm run coverage  # core must stay above 90 %
pnpm run lint
pnpm run typecheck
```

To regenerate the shared corpus after an intentional rule change:

```bash
pnpm run build
node packages/shared-tests/dist/generate.js
```

Review that diff. A corpus that silently absorbs a behaviour change is worse
than no corpus.

## Licence

[AGPL-3.0-only](LICENSE). If you run a modified copy of this as a service, the
modifications are covered.
