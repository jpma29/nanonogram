# Instrucciones para Claude

## Al iniciar una sesión

Lee `docs/06-estado-actual.md` antes de hacer nada más. Es el documento de
continuidad: resume qué existe, qué está cerrado y qué queda abierto, y su §7.3
lista el trabajo inmediato. Los demás documentos (`docs/00`–`docs/07`) son la
especificación de fondo; consúltalos cuando el trabajo los toque.

`docs/` es la única fuente de verdad de la documentación. No existen copias en
otro lado; si algo cambia, cambia aquí y se commitea.

## Al cerrar una sesión

Si el trabajo de la sesión cambia el estado del proyecto, actualiza
`docs/06-estado-actual.md` en el mismo commit o en uno propio. Un cambio que no
queda registrado ahí se pierde para la sesión siguiente.

## Comandos

```
pnpm install --frozen-lockfile   # instalar
pnpm build                       # tsc --build
pnpm typecheck                   # tsc --build --force
pnpm test                        # vitest run
pnpm lint                        # eslint .
pnpm format                      # prettier --write .
```

Antes de dar por bueno un cambio: `pnpm build && pnpm test`. Corre en Windows
con pnpm 10 y Node 22. Un sandbox Linux **no** sirve para validar — los
symlinks de `node_modules` creados por pnpm en Windows no resuelven ahí.

## Reglas del código

- **`@nanonogram/core` no tiene dependencias.** Ni runtime, ni DOM, ni timers,
  ni almacenamiento, ni aleatoriedad. Toda función es determinista dados sus
  argumentos, y "ahora" siempre lo pasa quien llama. La restricción sostiene la
  paridad con el servidor en Go; no la rompas por conveniencia.
- **El corpus de `packages/shared-tests` es contrato**, no fixture. Lo tienen
  que pasar el motor en TS y el servidor en Go. Cambiar un caso esperado es
  cambiar la especificación.
- **Licencia AGPL-3.0-only** en los paquetes.
- **Nada con copyright entra en un release.** Ver `docs/07-fuentes-de-contenido.md`
  y `tools/puzzlegen/SOURCES.md` para qué fuentes son utilizables y por qué.
- `_incoming/` y `_sources/` son material de terceros en bruto: se analizan
  localmente, nunca se versionan ni se distribuyen.
