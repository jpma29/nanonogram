# 06 — Estado Actual y Continuidad

**Última actualización:** 2026-08-07 (cierre del abastecimiento de contenido:
13 fuentes medidas, ~6 240 puzles CC0, catálogo y procedencias completos)
**Para:** quien retome el proyecto en una sesión nueva (persona o asistente).

Este documento existe porque una sesión nueva no recuerda la conversación en que
se escribieron los otros seis. Aquí está qué hay, qué está cerrado, qué está
abierto y por dónde seguir.

> **Nota de continuidad (2026-08-07):** el trabajo se mueve de la nube a la
> máquina local. Todo lo producido hasta aquí está en
> `F:\jpma2\Documents\Claude\Projects\nanonogram`. Leer §9 antes de continuar.

---

## 1. Qué es esto

**nanonogram** — una aplicación selfhosted para jugar nonogramas, pensada para
jugadores experimentados: sin anuncios, sin pistas, sin metajuego. PWA
offline-first con sincronización opcional contra un servidor propio.

El nombre (*nano* + *nonogram*) nombra la particularidad buscada: ligereza.
Bundle de 300 KB, servidor en un binario de 15 MB, motor sin dependencias. Ver
`00-vision-y-alcance` §0 para las convenciones derivadas (`@nanonogram/core`,
binario `nanonogram`, `nanonogram.puzzle/1`).

## 2. Estado del proyecto

**Fase 0 cerrada. El motor existe, está probado y no depende de nada.**
**El generador de puzzles desde imagen existe y está medido.**

| Fase | Estado |
|---|---|
| 0 — Cimientos | ✅ **Completa** (2026-08-06) |
| Contenido (adelantado desde Fase 5) | ✅ **Abastecimiento cerrado: ~6 240 puzles CC0, 857+ sujetos distintos** (§7.4-7.13), falta seleccionar los 100 |
| 1 — MVP, jugar B/N offline | ⬜ Siguiente |
| 2–5 | ⬜ Pendientes |

### 2.1 Lo que existe en código

Monorepo pnpm con dos paquetes y una herramienta. **No hay UI todavía** — no se
ha dibujado un solo píxel, que es exactamente lo que Fase 0 pedía.

```
nanonogram/
├── packages/
│   ├── core/          @nanonogram/core — motor, TS puro, 0 dependencias
│   └── shared-tests/  corpus JSON que TS y Go deben pasar los dos
├── tools/
│   └── puzzlegen/     generador de puzzles desde imagen (build-time, no runtime)
├── .github/workflows/ci.yml
├── LICENSE            AGPL-3.0-only
└── README.md
```

| Módulo de `core` | Contenido |
|---|---|
| `puzzle.ts` | Paleta, pistas, solución, invariantes de un puzzle válido |
| `grid.ts` | Estados de celda y codificación RLE del tablero |
| `linesolver.ts` | DP `O(n·k)` sobre (celda, pista) + marginales de inicio de pista |
| `crossout.ts` | Tachado sin ambigüedad (RF-AYU-2) |
| `clock.ts` | Cronómetro monótono con pausa y penalizaciones |
| `rules.ts` | Escalada de penalización, verificaciones permitidas, corona |
| `history.ts` | Undo/redo con granularidad de trazo |
| `game.ts` | La partida: trazos, errores, verificación, condición de victoria |
| `solver.ts` | Unicidad, resolubilidad puramente lógica, dificultad ponderada |
| `formats/json.ts` | Formato canónico `nanonogram.puzzle/1` |

**458+ tests, cobertura de líneas 98.7 %** en `core` (el umbral de CI es 90 %).
CI corre formato, lint, typecheck, tests con cobertura, y falla si regenerar el
corpus compartido produce un diff.

### 2.2 Criterios de aceptación de Fase 0

Los seis del roadmap, verificados uno a uno:

- ✅ `@nanonogram/core` con ≥ 90 % de cobertura → **98.7 %**.
- ✅ 10 000 puzzles aleatorios generados, resueltos desde sus pistas, unicidad
  declarada verificada (`packages/core/test/properties.test.ts`). Corre en ~1.7 s.
- ✅ El caso crítico: en una línea con emparejamiento pista→bloque ambiguo no se
  tacha nada. Verificado **exhaustivamente** sobre todas las líneas monocromas de
  hasta 10 celdas y todos sus marcados posibles: 428 729 tachados emitidos, todos
  con emparejamiento único demostrado por enumeración.
- ✅ El cronómetro acumula con pausas múltiples y es inmune a cambios de hora.
- ✅ La victoria ignora X y puntos, y exige color exacto en multicolor.
- ✅ El `package.json` de `core` no lista ninguna dependencia de runtime.

### 2.3 El corpus compartido

`packages/shared-tests` — **243 casos JSON** en cuatro archivos, con notación
documentada en su README para quien implemente el lado Go:

| Archivo | Casos | Cubre |
|---|---|---|
| `line-solve.json` | 82 | Propagación por línea y marginales de inicio de pista |
| `crossout.json` | 80 | Tachado sin ambigüedad |
| `rules.json` | 36 | Escalada de penalización, verificaciones, corona |
| `puzzles.json` | 45 | Unicidad y dificultad de puzzles completos |

Es el contrato contra el riesgo R4.

### 2.4 El generador: `tools/puzzlegen`

Vive **fuera** de `packages/` a propósito: necesita un decodificador de imagen, y
`@nanonogram/core` no puede depender de nada. Corre en build time, nunca en la
app.

Una imagen se convierte en puzzle solo si sobrevive cuatro puertas, en orden:

1. **Fidelidad** — ¿existe algún tamaño de rejilla donde siga siendo la misma
   figura? IoU ≥ 0,90 contra un render de referencia de 256 px **y** topología
   igual (piezas y agujeros; tinta en 8-conectividad, papel en 4).
2. **Jugabilidad** — ¿vale la pena el tablero? Relleno entre 25 % y 62 %, cero
   píxeles aislados, ≤ 50 % de líneas vacías, ≤ 8 bloques por línea, ≤ 30 % de
   la tinta en motas.
3. **Lógica** — ¿es único y resoluble solo por deducción, tras mover como mucho
   cuatro píxeles de borde? (`repair.ts`, escalada sobre celdas de frontera).
4. **Novedad** — ¿es suficientemente distinto de lo que ya hay? (`dedupe.ts`).

| Módulo | Contenido |
|---|---|
| `bitmap.ts` | Bitmap 1 bit, recorte por contenido, padding, remuestreo, cobertura, dithering Floyd–Steinberg, IoU, limpieza |
| `raster.ts` | Rasteriza SVG binarizando por **canal alfa**, no por luminancia |
| `topology.ts` | Piezas y agujeros; sirve de segunda mitad de la puerta de fidelidad |
| `fit.ts` | Escalera de tamaños y las dos rutas de encaje (ver abajo) |
| `quality.ts` | Métricas de jugabilidad, medidas sobre la **figura**, no sobre el tablero |
| `repair.ts` | Escalada sobre celdas de frontera hasta lograr resolubilidad pura |
| `dedupe.ts` | Distancia entre rejillas |
| `pipeline.ts` | `generateFrom()` — las cuatro puertas de punta a punta |
| `scripts/sweep-sources.mjs` | Rankea colecciones enteras usando el pipeline como instrumento |

**Las dos rutas de encaje** (decisión del 2026-08-07, importante):

- **Nativa** — si la imagen ya viene renderizada con ambas dimensiones ≤ 35, se
  usa **sin escalar**, añadiendo padding en todas direcciones hasta que ambas
  dimensiones sean múltiplo de 5. **Solo esta ruta puede producir rejillas
  rectangulares.**
- **Escalera cuadrada** — para todo lo demás: rejillas cuadradas de múltiplos de
  5 (5, 10, 15, 20, 25, 30, 35), figura centrada.

En ambos casos **las filas y columnas de padding se ignoran en las
evaluaciones**: técnicamente no forman parte del puzzle, y contarlas hacía que
toda figura bien margenada pareciera vacía. `measureQuality` opera sobre
`contentCrop(board)`.

### 2.5 La función de dificultad

Ya no son umbrales inventados. `estimateDifficulty` pondera dos cosas:

- **Primaria (peso 0,7): apertura.** Qué fracción de celdas se resuelve de forma
  trivial en la primera pasada de line solving, mirando cada fila y cada columna
  aisladamente desde un tablero en blanco. Menos apertura, más difícil.
- **Secundaria (peso 0,3): encadenamiento.** Cuántas pasadas hacen falta para
  resolver el tablero entero, normalizado entre 3 y 12.

`0,7 × (1 − apertura) + 0,3 × cadena`, con umbrales `[0,24 0,37 0,49 0,63]` para
los cinco niveles. Si hace falta suponer (`depth > 0`), es un 5 directo.

**El tamaño de la rejilla no es un término a propósito**: la apertura ya
correlaciona con él, y meterlo dos veces castigaba injustamente a los tableros
grandes y fáciles.

## 3. Las decisiones que más condicionan el trabajo

Si solo se leen cinco cosas antes de escribir código, que sean estas:

1. **`@nanonogram/core` no importa nada.** TypeScript puro, cero dependencias,
   cero DOM, cero temporizadores, cero aleatoriedad. Esto ya no es una
   convención: `packages/core/test/purity.test.ts` lee el código fuente y falla
   ante cualquier import externo, global del host o fuente de no-determinismo.
2. **El MVP no tiene servidor.** Fase 1 es una PWA con biblioteca embebida en el
   build y progreso en IndexedDB. El backend Go llega en Fase 2.
3. **No hay pistas, nunca.** El error checking es la única red de seguridad.
4. **El tachado calla ante la ambigüedad.** Una pista se tacha solo si ocupa el
   mismo bloque cerrado en *todas* las terminaciones legales de la línea.
5. **La corona premia no equivocarse, no rectificar.** En Casual los errores se
   cuentan en silencio y corregirlos no los descuenta.

## 4. El caso Anbernic, en una línea

Los CFW de la familia RG35XX no tienen navegador moderno viable, así que la PWA
no corre ahí. Se atiende con un port nativo vía PortMaster en Fase 4, y por eso
el `core` es portable desde el primer commit. Ver `00` R1 y `02` §3.3.

## 5. Lo que está cerrado

- **Licencia: AGPL-3.0-only.** Quien hospede un fork modificado publica sus
  cambios.
- **Condición de victoria:** solo cuentan las celdas rellenas (`01` RF-MOD-5).
- **Cronómetro:** pausa en menú y en segundo plano, con marcas monótonas; una
  partida restaurada desde disco vuelve **siempre en pausa**.
- **Color incorrecto cuenta como error** (`01` RF-MOD-6).
- **Tamaño máximo 100×100** en el motor; **35×35 el máximo del generador**.
- **Contenido no distribuible:** el flag `distributable` y sus bloqueos.

### 5.1 Decisiones tomadas al implementar el motor

1. **Un arrastre malo en Hardcore cuesta un error, no uno por celda.**
2. **En color, un bloque relleno de otro color cierra el bloque** a efectos de
   tachado (un `empty` o un punto no).
3. **Un puzzle publicado con más de una solución cierra con cualquier
   disposición que satisfaga las pistas**, no solo con la solución declarada.

### 5.2 Decisiones tomadas al implementar el generador

4. **Estándar nonograms.org: todo puzzle publicado es único y resoluble por pura
   deducción.** Si no lo es, se reparan hasta cuatro píxeles de frontera; si aun
   así no lo es, se descarta. La ambigüedad vive en el borde, que es por lo que
   la escalada solo toca celdas de frontera.
5. **El dithering existe pero está apagado por defecto.** Medido, empeoraba los
   resultados: las fuentes vectoriales ya son binarias en alfa, así que difundir
   error solo salpica motas en el contorno. Se conserva para una fuente con tono
   continuo de verdad (un grabado, una ilustración sombreada, una foto), y el
   techo de 30 % de motas impide que arruine un tablero en silencio.
6. **La binarización es por canal alfa, no por luminancia.** Un icono a todo
   color se convierte así en su propia silueta.

## 6. El contenido: crisis, pivote y resolución

Esto ocupó buena parte del 2026-08-06/07 y conviene no repetirlo.

- `mikix/nonogram-db`, la fuente del plan original, **está borrada**. Detalle en
  `07-fuentes-de-contenido.md`.
- FreeNono y Nonny: 181 puzzles rescatables, **cero licencias declaradas**, y el
  92 % de FreeNono es material de terceros con copyright (Nintendo, Conceptis).
  Descartado.
- **Pivote: generar desde imagen** a partir de colecciones de iconos con licencia
  permisiva. De ahí `tools/puzzlegen`.

### 6.1 El barrido de fuentes (2026-08-07)

`@iconify/json` es **un solo paquete npm con 231 colecciones de iconos**, cada
una con su licencia en los metadatos. Filtrando a licencias redistribuibles
(MIT, Apache-2.0, CC0, CC-BY, ISC, OFL, Unlicense, BSD-3, MPL — fuera NC y GPL)
quedan **214 colecciones y 291 652 imágenes**.

> **Corrección (2026-08-07, §7.4):** este párrafo decía "fuera NC, **SA** y
> GPL". Es falso — `REDISTRIBUTABLE` en `sweep-sources.mjs` sí acepta
> `CC-BY-SA-3.0` y `CC-BY-SA-4.0` desde ese mismo día, porque cada puzle lleva
> su propio campo `license` y una obligación SA sobre uno no se propaga al
> pack ni al código. Rectificado aquí y en `SOURCES.md`.

Se barrieron las 213 medibles con 60 iconos de muestra cada una: **12 756
imágenes por el pipeline completo**. Aceptación global **19,4 %**.

Los mejores, con la cuota tras deduplicar:

| Cuota | Licencia | Colección | Perfil |
|---:|---|---|---|
| **65 %** | MIT | `pixelarticons` | Pixel art; sesga a dificultad 4–5 |
| 57 % | MIT | `zondicons` | Glifos rellenos simples |
| 53 % | MIT | `at-icons` | |
| 53 % | OFL-1.1 | `picon` | |
| 48 % | MIT | `oi` (Open Iconic) | La única que da nivel 1 en cantidad |
| 40 % | OFL-1.1 | `whh` | 850 proyectados |
| 38 % | CC0-1.0 | `pinhead` | 946 proyectados, sin obligación de atribuir |
| 37 % | Apache-2.0 | `ic` (Google Material) | 4 017 proyectados |
| 35 % | Apache-2.0 | `material-symbols` | 5 455 proyectados |
| 32 % | MIT | `boxicons` | 1 193 proyectados |

**43 colecciones superan el 30 %**, lo que proyecta unos **20 000 puzzles
utilizables**; a través de las 213, unos 60 000. Hacen falta ~100. El
abastecimiento dejó de ser el problema; ahora el problema es **seleccionar**.

Tabla completa y razonamiento en `tools/puzzlegen/SOURCES.md`, datos crudos en
`tools/puzzlegen/data/source-ranking.json`.

Rechazos globales: **57 % fidelidad, 23 % jugabilidad, 0,4 % lógica**. Que la
puerta lógica casi nunca rechace valida el reparador: sin él, esos serían
pérdidas netas.

`pixelarticons` gana por una razón nada sutil: ya está dibujado sobre una rejilla
pequeña, así que reducirlo a 20–35 celdas no tira casi nada.

## 7. Lo que sigue abierto

### 7.1 Huecos de especificación

| # | Hueco | Se necesita en |
|---|---|---|
| H1 | **Onboarding / primera ejecución.** El \"jugador casual invitado\" (`00` §5) no tiene tutorial ni primer arranque diseñado | **Fase 1 — ahora** |
| H2 | **Actualizaciones de la PWA.** Qué hace el Service Worker al detectar versión nueva con una partida en curso | **Fase 1 — ahora** |
| H3 | **UI del \"estado alternativo\".** `01` RF-SYNC-4 conserva 7 días el estado perdedor de un conflicto, sin pantalla ni endpoint | Fase 2 |
| H4 | **Backup y restauración** de la instancia | Fase 2 |
| H5 | **Borrado de puzzles con progreso ajeno.** El esquema hace `CASCADE` en silencio | Fase 2 |
| H6 | **Pantalla de créditos.** Las fuentes CC-BY y OFL obligan a atribuir **en la aplicación**, no solo en los metadatos del puzzle. Desde §7.4 es **bloqueante**, no opcional: varias de las mejores fuentes de pixel art son CC-BY | Fase 1 |

### 7.2 Decisiones pendientes

1. **Registrar el dominio.** Ojo con *nanogram*, unidad de masa muy indexada.
2. ~~**Licencia del código.**~~ **Decidida: AGPL-3.0-only.**
3. **Ruta del cliente Anbernic:** SDL2 vs Godot 4. Prototipo medido en hardware
   real, en Fase 4.
4. **Publicar en Google Play** vía TWA, o solo distribuir el APK.
5. ~~**Fuente de la biblioteca inicial.**~~ **Resuelta** — ver §6.
6. ~~**Calibrar el estimador de dificultad.**~~ **Reescrito** — ver §2.5. Queda
   revalidar los umbrales contra los 100 puzzles reales cuando existan.

### 7.3 Trabajo inmediato del generador

- **El generador ahora recibe pixel art de verdad**, no solo iconos vectoriales.
  Se probó contra siete sprites reales (dibujados y fotografiados a mano, no
  renders de icon sets) y se cerraron tres huecos concretos en
  `tools/puzzlegen/src/`:

  1. Umbrales de calidad relajados automáticamente en la ruta nativa
     (`maxFill`/`maxIsolated`) — un sprite dibujado a mano se rellena más y
     tolera marcas sueltas a propósito.
  2. `collapseEmptyLines` + reintento de reparación quitando aislados — resuelve
     la ambigüedad lógica de marcas flotantes (un chorro de agua, un par de
     estrellas) que `repair.ts` no puede tocar por diseño (solo toca borde).
  3. `detectPixelGrid`/`alignToPixelGrid` — recupera la rejilla original de un
     sprite exportado o fotografiado más grande de lo que fue dibujado,
     detectando el patrón de píxeles planos en las corridas de la imagen. Antes
     había que contar los píxeles a mano para cada candidato.

  Detalle completo, casos de prueba y el hueco que queda (reescalado con
  interpolación suave, sin bordes duros que detectar) en la nueva sección de
  `tools/puzzlegen/SOURCES.md`, "Pixel art: generator changes made to receive
  it".

  **Pendiente antes de confiar en el merge:** correr `pnpm build && pnpm test`
  de verdad en Windows — se validó la lógica en un sandbox sin acceso al
  toolchain real de pnpm/tsc/vitest (symlinks rotos entre SO). Revisar
  `git status` también: la sesión que hizo el cambio no pudo confirmar el estado
  de git por un `index.lock` que no pudo limpiar.

  ~~**Próxima sesión: cacería de fuentes de pixel art.**~~ **Hecha
  (2026-08-07)** — ver §7.4.

- **Seleccionar los 100 puzzles y repartirlos en tres packs** con curva de
  dificultad. ~~La deduplicación tiene que hacerse sobre el conjunto fusionado.~~
  **Matizado por §7.7 y §7.9:** deduplicar sobre el conjunto fusionado cuesta
  ~1 puzle, porque `dedupe` compara **rejillas y no significados**. El problema
  real es la repetición **interna** de sujetos (Fugue repite 4,5×), y eso
  necesita tope por sujeto y lista negra de cromo, no dedupe de rejilla. **Este
  es el trabajo que sigue.**
- ~~**Tableros pequeños escasean.**~~ **Resuelto por §7.5.** Era: 5×5 → 6,
  10 → 93, 15 → 171 contra 20 → 535, 25 → 490, 30 → 598, 35 → 578, y la idea
  era limitar `fit.maxSize` para el pack fácil. No hace falta: el pixel art
  nativo da 558 de 587 tableros con lado mayor 10 o 15 por sí solo.
- **Averiguar por qué `extraSizes` / `nearbySizes` no rescata nada.** Medido, la
  configuración con tamaños vecinos dio idéntico resultado que sin ellos, lo cual
  es sospechoso.

### 7.4 La cacería de pixel art (2026-08-07)

Hecha. Catálogo en `tools/puzzlegen/scripts/probes/pixel-sources.json`,
descargador en `scripts/probes/fetch-pixel-sources.mjs`, razonamiento completo
en la sección "Pixel art: the source hunt" de `SOURCES.md`.

**El hallazgo que replantea el problema.** El movimiento obvio era buscar más
sets pixel art en npm, como se encontró `pixelarticons`. Ese movimiento ya está
gastado: **todas las colecciones con estilo pixel dignas de mención ya están en
el barrido**, porque todas viven en `@iconify/json`. Medidas y en el ranking:
`memory` 40 %, `pinhead` 38 %, `pixel` (HackerNoon) 25 %, `dinkie-icons` 13 %,
`streamline-pixel` **0 de 60**. Y `pixelarticons` con 877 iconos ya es el set
libre actual — no hay snapshot viejo que actualizar.

La razón es estructural, no mala suerte:

> **Iconify solo tiene SVG.** `rasterizeSvg` los renderiza grandes, así que
> `fit.ts` toma siempre la escalera cuadrada. `natives` es **0 en las 213
> colecciones del barrido, sin una sola excepción** — la ruta nativa que
> justificó todo el trabajo de §7.3 no ha disparado jamás sobre una fuente
> real.

El pixel art raster no es "más de lo mismo desde otro sitio": es la única
categoría de fuente que puede usar esa ruta, y nada de eso está en npm.

**Lo que hay ahora.** 20 packs aceptados, 5 elegibles sin medir, 15 rechazados
con su razón. Los que importan:

| Pack | Licencia | Archivos | Nativo | Cómo |
|---|---|---:|---|---|
| Nikoichu — 1-bit Pixel Icons | CC0-1.0 | 1 476 | 16×16 | manual (itch.io) |
| Kenney — 1-Bit Pack | CC0-1.0 | 1 078 | 16×16 | automático |
| OGA — Dungeon Crawl 32×32 (+supl.) | CC0-1.0 | 6 000+ | 32×32 | manual |
| OGA — DENZI public domain | CC0-1.0 | ~400 | 32×32 | manual |
| Kenney — Pixel Shmup / Food / Tiny * | CC0-1.0 | ~950 | 16–18 px | automático |
| Fugue Icons | CC-BY-3.0 | 3 922 | 16×16 PNG | automático |

**Tres cosas que no conviene equivocar:**

1. **H6 deja de ser aplazable.** CC-BY ya estaba en la lista — `picon`, `whh` y
   `streamline-*` ya obligaban a atribuir en la app. Lo que cambia es el peso:
   los dos packs raster más grandes (**Fugue**, CC-BY-3.0, y **famfamfam
   Silk**, CC-BY-2.5), más HackerNoon y game-icons, son todos de atribución
   obligatoria. Así que **H6 — pantalla de créditos** pasa a ser bloqueante
   para publicar desde ellos. Es un cambio de prioridad, no un hallazgo nuevo.
2. **`famfamfam-silk` es CC-BY-2.5, que la regex `REDISTRIBUTABLE` de
   `sweep-sources.mjs` no acepta** — solo lista 3.0 y 4.0. Decidir si 2.5 se
   añade antes de que un puzle suyo llegue a un release, o descartar el pack.
3. **La exclusión de Fugue quita ~12 archivos, no 6.** Los seis nombres de
   terceros se cruzan contra el tallo del archivo de forma **exacta** — así que
   `share-document.png` se queda y solo se va el literal `share.png` — pero el
   cruce corre sobre las dos carpetas incluidas, así que cada nombre cuesta
   hasta dos archivos.

   Y confirmado contra el árbol del repo: el pack se toma de
   **`icons-shadowless/` + `bonus/`, no de `icons/`**. Los de `icons/` son el
   mismo arte con una sombra proyectada horneada (píxeles grises antialiaseados,
   justo el ruido que ensucia una binarización a 16 px), e incluir ambas
   carpetas duplicaría cada icono para que `dedupe` tirara la mitad. `src/`
   (fuentes vectoriales) también queda fuera.
4. **Dungeon Crawl necesita un diff de procedencia.** `github.com/crawl/tiles`
   mantiene `TILES_UNDER_UNKNOWN_LICENSE.md`; congelar esa lista y cruzarla
   contra los nombres seleccionados antes de publicar.

**Sobre ShareAlike:** la primera versión del catálogo rechazó tres packs por SA
aplicando una política que el repositorio ya había abandonado. `REDISTRIBUTABLE`
acepta `CC-BY-SA-3.0/4.0` desde el 2026-08-07. Esos packs están ahora en la
clave `eligible` de `pixel-sources.json` — sin medir por falta de tiempo, no por
licencia. La frase equivocada de §6.1 y su gemela en `SOURCES.md` quedan
rectificadas.

En sitios comunitarios la licencia la pone quien sube, y hay sets mal
etiquetados en ambas direcciones (DENZI tiene un nodo CC0 y otro CC-BY-SA;
Wyrmsun tiene una mitad de cada; el set de 420 iconos de 7Soul1 es GPL/CC-BY-SA
y el de 496 es su sucesor ya limpio). Por eso cada descarga automática escribe
un `PROVENANCE.json` junto a los archivos: `_sources/` está en `.gitignore`, así
que no queda ningún otro registro de dónde salió un PNG.

**Verificado y reproducible** con `node scripts/probes/fetch-pixel-sources.mjs
--self-test`: 17 aserciones sobre los lectores de ZIP y tar — escritos a mano
sobre `node:zlib` para no añadir dependencias, y por eso la parte más riesgosa
del script — más los filtros de extracción y el guardia contra path traversal.
Los archivos se construyen en memoria (ZIP deflate, ZIP stored, tarball pax con
ruta de más de 100 caracteres), así que no hay fixtures que caduquen. Es un flag
y no un archivo de test porque `vitest` solo cubre `packages/`.

**Sin verificar:** el scrape en vivo de las páginas de Kenney y las descargas
reales, que necesitan red desde un checkout de verdad. Las URLs fijadas quedan
como `zipFallback` por si el scrape se rompe.

### 7.5 El primer pack, medido de verdad (2026-08-07)

El 1-Bit Pack pasó por el pipeline real en un checkout real. Salieron dos cosas:
una suposición corregida y los mejores números que ha dado cualquier fuente.

**La suposición equivocada: los packs de Kenney no traen sprites individuales.**
El ZIP solo contiene hojas, y los «1078 files» de la página cuentan tiles
*dentro* de la hoja. La descarga estaba completa; había 16 archivos donde se
esperaban 1 078 porque no había nada por sprite que medir.

Lo resuelve `scripts/probes/slice-spritesheet.mjs`, entre la descarga y el
probe. No es listo, es seguro: Kenney trae un `Tilesheet.txt` con tamaño de
tile, separación y conteos, y esos números cuadran al píxel con las dimensiones
del PNG (49·16+48 = 832, 22·16+21 = 373). El script **se niega a cortar si esa
aritmética no cierra**, porque una rejilla desplazada un píxel produce 1 078
sprites con una tira de su vecino, y todas las puertas de abajo los aceptarían
como puzles plausibles.

```bash
cd tools/puzzlegen
node scripts/probes/fetch-pixel-sources.mjs kenney/1-bit-pack
node scripts/probes/slice-spritesheet.mjs _sources/kenney/1-bit-pack
node scripts/probes/probe-local-folder.mjs \
  _sources/kenney/1-bit-pack/_tiles/monochrome-transparent \
  --license CC0-1.0 --source "kenney/1-bit-pack" --author "Kenney"
```

Apuntar el probe a `_tiles/<hoja>/`, **no** a la raíz del pack: el probe camina
recursivamente y mediría también las hojas de las que salieron los tiles.

**Los números: 587 puzles aceptados de 1 072 tiles, 54,8 %.** Pero la cuota no
es lo interesante:

| | 1-Bit Pack | Mejor del barrido npm (`pixelarticons`) |
|---|---|---|
| Rechazos por **fidelidad** | **0 de 1 072** | 57 % de todos los rechazos, global |
| Rechazos por jugabilidad | 378 | — |
| Rechazos por lógica | 11 | — |
| Descartados por duplicado | 96 | — |
| Dificultad 1→5 | **87 / 181 / 177 / 107 / 35** | 3 / 3 / 6 / 13 / 14 |
| Lado mayor | 5→1, **10→67, 15→491**, 20→28 | 20→27, 25→2, 30→1, 35→3 |
| Tableros rectangulares | **139 (24 %)** | 0 |

Tres cosas importan más que el porcentaje:

1. **La puerta de fidelidad no rechazó nada, y no puede.** Fidelidad pregunta
   «¿sobrevive esto a reducirse a una rejilla?». Un sprite de 16×16 usado sin
   escalar nunca se reduce, así que no hay fidelidad que perder: la puerta es
   vacua por construcción, no indulgente. Es la **primera fuente en la historia
   del proyecto que toma la ruta nativa de `fit.ts`** — `natives` era 0 en las
   213 colecciones npm. Todo el trabajo de §7.3 se hizo apostando a que esa ruta
   pagaría, y hasta ahora no había disparado ni una vez.
2. **La escasez de tableros pequeños queda resuelta, sin truco.** El problema
   abierto era «5×5 → 6, 10 → 93, 15 → 171» contra 500-600 en cada uno de
   20/25/30/35, con la nota de que el pack fácil «probablemente necesita generar
   con `fit.maxSize` limitado». Ya no: **558 de 587 tableros tienen lado mayor
   10 o 15**, de forma natural, porque es el tamaño al que se dibujó el arte.
   La nota de `fit.maxSize` en §7.3 puede tacharse.
3. **La curva de dificultad llega ya formada.** `pixelarticons` sesga a 4–5.
   Este pack da 87 tableros en dificultad 1 y 181 en 2: la parte baja que la
   curva de tres packs necesitaba y que nada más proveía. La decisión pendiente
   6 (revalidar `estimateDifficulty`) ya tiene corpus contra el que revalidarse.

También: **118 de los 587 necesitaron ediciones de reparación** y solo 11 tiles
fallaron la puerta lógica del todo. Sin `repair.ts` esos 118 serían pérdidas
netas — el reparador carga con casi un quinto de este pack.

**Una fuente, un pack, 587 puzles contra los ~100 que pide Fase 1. El
abastecimiento se acabó como problema.** Lo que queda es seleccionar, y la nota
de deduplicar sobre el conjunto **fusionado** (no por colección) pasa a ser la
restricción que manda.

**Sigue sin verificar:** el scrape en vivo de Kenney salió roto — buscaba
`href="….zip"` y no encontraba nada, cayendo en silencio a la URL fijada. El
enlace sí está, cuelga de un «Continue without donating…» dentro de un
intersticial de donación. El resolvedor ahora acepta cualquier `.zip` del
documento y prefiere el nombre que menciona el slug de la página, con el markup
real cubierto en `--self-test` (21 aserciones). Pero no ha corrido contra la
página viva: las URLs fijadas siguen ahí como red.

### 7.6 Segunda fuente: Fugue Icons, y la fusión (2026-08-07)

Bajado con `fetch-pixel-sources.mjs` en Windows y medido igual.

**Otra trampa de duplicación, y costó 3 puntos.** La primera corrida dio
**1 221 de 3 882 (31,5 %)** con dos subcarpetas en *exactamente* 0 %, que nunca
es casualidad. Fugue trae cada icono dos veces, con y sin sombra, **en dos
niveles**: excluir el `icons/` de la raíz dejó intacto el par de `bonus/`, y por
orden alfabético ganó el sombreado — `bonus/icons-shadowless-24` sacó 0 de 249,
todos descartados como duplicados de `bonus/icons-24`.

Es al revés de lo que conviene: la sombra es gris antialiaseada, justo el ruido
que ensucia una binarización a 16 px. Apuntando `include` solo a las tres
carpetas sin sombra y sacando `bonus/animated/` (fotogramas de animación; los
dos únicos que pasaron eran un borde de selección de 20×5 y un spinner):

| | archivos | aceptados | cuota |
|---|---:|---:|---:|
| Con las carpetas duplicadas | 3 882 | 1 221 | 31,5 % |
| **Solo sin sombra** | **3 538** | **1 219** | **34,5 %** |

344 archivos desperdiciados fuera, 2 puzles perdidos, y gana el arte limpio.

> **La lección general, ya por segunda vez:** un set que trae variantes —con y
> sin sombra, color y monocromo, empaquetado y con padding— meterá en silencio
> la variante *peor* si la lista de inclusión se escribe a ojo. Las dos veces se
> delató como una subcarpeta en un 0 % sospechosamente redondo. **Revisar el
> desglose de aceptación por carpeta, no solo la cuota global.**

**Los números: 1 219 de 3 538, 34,5 %.** Cuota menor que el 54,8 % del 1-Bit
Pack, pero **cosecha absoluta mayor: 1 219 contra 587.**

| | Fugue Icons | Kenney 1-Bit Pack |
|---|---:|---:|
| Aceptados | **1 219** (34,5 %) | 587 (54,8 %) |
| Dificultad 1→5 | 176 / 468 / 343 / 160 / 72 | 87 / 181 / 177 / 107 / 35 |
| Lado mayor | 10→133, **15→782**, 20→264 | 10→67, **15→491**, 20→28 |
| Rectangulares | 464 (38 %) | 139 (24 %) |
| Con reparación | 240 | 118 |
| Rechazos por fidelidad | **2** | **0** |

**La fusión cuesta un puzle.** §7.4 marcaba deduplicar sobre el conjunto
fusionado como la restricción que manda, con el argumento de que toda librería
de iconos tiene un corazón, una estrella y una casa. Medido sobre la unión:

| | |
|---|---:|
| Imágenes de entrada | 4 610 |
| Aceptados por separado | 1 806 |
| Aceptados fusionados | **1 805** |
| **Duplicados entre fuentes** | **1** |

Uno. El `minDistance` por defecto de `dedupe` (0,06) es **más estricto** que el
0,04 de `sweep-sources.mjs`, así que no es un umbral flojo adornando el número.

### 7.7 …pero ese número mide lo que no importa

**`dedupe` compara rejillas, no significados.** El corazón de Kenney y el de
Fugue difieren en unos píxeles, así que `gridDistance` los deja muy por encima
de 0,06 y sobreviven los dos. «1 duplicado entre fuentes» no dice nada sobre
cuántos *sujetos* se repiten — y para un juego cuya recompensa es la ilustración
revelada (RF-BIB-4), el sujeto es lo que el jugador vive como repetición.

Los nombres de Fugue son descriptivos, así que el primer token sirve de proxy:

| | |
|---|---:|
| Puzles aceptados | 1 219 |
| **Sujetos distintos** | **270** |
| …de ellos, dibujos y no cromo de UI | 203 |
| Puzles que viven en sujetos de cromo | 493 |

El reparto es brutal: **`arrow` solo se lleva 154 puzles, el 12,6 % del pack.**
Después `edit` 58, `control` 39, `ui` 36, `layer` 16. 86 sujetos con cinco o más
variantes acaparan 867 de los 1 219; solo 97 sujetos aparecen una vez.

Cosecha con un tope por sujeto, que es lo que la selección va a necesitar:

| Tope por sujeto | Todos | Sin cromo de UI |
|---|---:|---:|
| 1 | 270 | **203** |
| 2 | 443 | 338 |
| 3 | 582 | 447 |
| 5 | 782 | 605 |

**El aporte honesto de Fugue son ~203 dibujos distintos, no 1 219.** Sigue
siendo el doble de lo que pide Fase 1, y el vocabulario de dibujo es bueno de
verdad (bellota, yunque, globo, curita, campana, cerebro, pan, escoba, insecto,
pastel, vela, iglesia, brújula, galleta, corona, cortina, fantasma, reloj de
arena, faro, piano, arcoíris, robot, cohete, calavera, muñeco de nieve, trofeo,
paraguas). Pero el titular medía la cosa equivocada.

**Consecuencias, y son tres:**

1. **La selección necesita tope por sujeto y una lista negra de cromo**, no solo
   dedupe de rejilla. El dedupe de rejilla no puede ver que cuatro de tus cien
   puzles son flechas.
2. **Los tiles de Kenney se llaman por posición** (`r00c08.png`), así que este
   análisis **no se les puede correr**: su variedad de sujetos está sin medir y
   habría que mirarla a ojo o con un clasificador.
3. **El recurso escaso son los sujetos distintos, no los puzles.** Eso invierte
   la prioridad de abastecimiento: otro set de iconos de escritorio a 16×16 suma
   volumen en el vocabulario que ya sobra. **`famfamfam-silk` es exactamente
   eso** —misma época, mismo tamaño, misma metáfora de escritorio que Fugue— y
   conviene degradarlo o descartarlo en vez de medirlo. Lo que sí suma es
   material con vocabulario *distinto*: criaturas, animales, comida, plantas,
   herramientas, vehículos. Dungeon Crawl, DENZI, 16x16 Food y los monstruos de
   Hexany son justo eso, y los cuatro son CC0.

**Dos fuentes, 1 805 puzles, pero del orden de 200-300 dibujos distintos.**
Alcanza para los ~100 de Fase 1 con margen para elegir, y la pregunta de
abastecimiento que queda es de **variedad, no de volumen**.

### 7.8 Todo medido: el abastecimiento se cierra (2026-08-07)

Once packs, 17 338 imágenes en disco, todas por el pipeline real.

| Fuente | Licencia | Archivos | Aceptados | Cuota |
|---|---|---:|---:|---:|
| **DCSS `monster/`** | CC0 | 1 282 | **871** | **67,9 %** |
| **16x16 Food** | CC0 | 188 | 108 | **57,4 %** |
| Kenney 1-Bit Pack | CC0 | 1 072 | 587 | 54,8 % |
| DCSS `player/` | CC0 | 975 | 463 | 47,5 % |
| DCSS `item/` | CC0 | 957 | 413 | 43,2 % |
| Nikoichu | CC0 | 1 476 | 577 | 39,1 % |
| DENZI | CC0 | 1 361 | 520 | 38,2 % |
| Fugue Icons | CC-BY-3.0 | 3 538 | 1 219 | 34,5 % |
| Kenney 1-Bit Platformer | CC0 | 800 | 208 | 26,0 % |
| Kenney Tiny Dungeon / Mono RPG / Shmup | CC0 | 292 | 88 | 30 % |
| Kenney Food Expansion | CC0 | 112 | 12 | 10,7 % |
| **Hexany's Monsters** | CC0 | 64 | **0** | **0 %** |

**~3 850 puzles CC0**, más 1 219 CC-BY de Fugue. DCSS `dungeon/` (1 483) quedó
sin medir a propósito: es terreno y muros.

**Tres resultados que valen más que los totales:**

1. **Los monstruos de DCSS ganan a todo, incluido el listón de npm.** 67,9 %
   contra el 65 % de `pixelarticons`. Un monstruo es el sujeto ideal: una
   criatura, silueta rellena, dibujada para leerse a 32×32.
2. **Hexany sacó 0 de 64 y no es un bug.** Los 64 murieron en jugabilidad
   (`3 isolated pixels, 9 blocks in one line`): son criaturas 1-bit dibujadas
   con ojos, motas y textura, y esa finura no sobrevive como nonograma.
   Incompatibilidad real de contenido, anotada para que nadie la vuelva a bajar.
3. **La Food Expansion de Kenney sacó 10,7 %**, la peor, siendo el pack que la
   investigación inicial llamaba «la mejor cuota del catálogo entero». La comida
   está dibujada pequeña dentro del tile. Predecir el rendimiento a ojo sigue
   fallando; medirlo sigue siendo barato.

**El solapamiento de sujetos, ahora sí medido.** Con cinco fuentes de nombres
descriptivos se puede responder la pregunta de §7.7 directamente:

| Fuente | Puzles | Sujetos | Puzles por sujeto |
|---|---:|---:|---:|
| DCSS `monster/` | 871 | 318 | 2,7× |
| Fugue | 1 219 | 270 | 4,5× |
| Nikoichu | 577 | 234 | 2,5× |
| DENZI | 520 | 171 | 3,0× |
| DCSS `item/` | 413 | 126 | 3,3× |
| **16x16 Food** | 108 | **99** | **1,1×** |

| | |
|---|---:|
| Suma de sujetos por fuente (solo CC0) | 948 |
| **Sujetos distintos en la unión** | **857** |
| Perdidos por repetición entre fuentes | 91 (9,6 %) |

**La repetición que hay que controlar es interna, no entre fuentes.** Cada
fuente repite sus propios sujetos 2,5–4,5×, pero entre ellas casi no se pisan:
elegir packs por vocabulario distinto en vez de por volumen funcionó.

El mayor solapamiento cruzado es **DENZI ∩ monstruos de DCSS, 40 sujetos**
(dragon, eye, serpent) — esperable, y anunciado por la propia página de OGA, que
dice que el arte de DENZI está parcialmente *dentro* de Dungeon Crawl. Conviene
deduplicar esas dos entre sí específicamente.

**857 sujetos CC0 distintos contra los ~100 que pide Fase 1.** Fase 1 se puede
construir entera con material CC0, lo que convierte **H6 (créditos) en una
elección y no en un bloqueante**.

**El abastecimiento queda cerrado.** Lo que sigue es la selección: tope por
sujeto, lista negra de cromo, curva de dificultad y tres packs.

### 7.9 Tres packs sin procedencia, un bug y el pack fácil resuelto (2026-08-07)

Aparecieron tres carpetas en `_sources/` sin `PROVENANCE.json`, bajadas a mano.
Por `04` §2.4 eso solo ya las deja fuera de un release. Licencias rastreadas y
registradas:

| Pack | Licencia | Evidencia |
|---|---|---|
| **VEXED — Bit Bonanza** | CC0-1.0 | Cuatro afirmaciones independientes coinciden: el título `(1Bit, CC0, Free)`, la fila `Asset license`, la prosa, y el autor en comentarios. |
| **vurmux — Urizen 1Bit** | CC0-1.0 | Fila `Asset license` más sección `License:` en prosa, con «Credits are not required». |
| **Darkmoonfire — Mystery Icons** | **CC-BY-SA-4.0** | Campo `License(s)` de OGA más `Copyright/Attribution Notice: "1-Bit Mystery Icons by Darkmoonfire"`. |

**No meterlos en el mismo saco:** dos son dominio público, el tercero es
copyleft con texto de atribución obligatorio y ShareAlike sobre los derivados.

Una trampa de procedencia de paso: la carpeta se llama `Bit-Bonanza-10x10-v-5.0`
y al lado hay un `Bountiful-Bits-v-3.1.zip`. Son **dos packs distintos del mismo
autor**, ambos CC0. Primero verifiqué el equivocado; lo delató que el
`README.txt` de la carpeta dice "Bit Bonanza" y no declara licencia alguna.

**Un 0 % destapó un bug real del clasificador.** Mystery daba 0 de 45, todos
`too dense (91% ink)`. No era el contenido:

> La hoja **tiene canal alfa pero es 89,4 % opaca**: su fondo es un rectángulo
> pintado, no transparencia. `classifyByAlphaWithClipping` toma lo opaco por
> figura, así que leía el fondo entero como tinta.

`hasAlpha` es necesario pero no suficiente. Arreglado en `probe-common.mjs` con
un umbral de opacidad de 0,85: por encima, el alfa no lleva información y se cae
a `classifyByBackground`.

| | Antes | Después |
|---|---:|---:|
| Mystery Icons | 0 % | **66,7 %** |
| 16x16 Food (control) | 57,4 % | 57,4 % |
| Hexany (control) | 0 % | 0 % |

Sin regresión, y que Hexany siga en 0 confirma que lo suyo era de verdad la
finura del arte. **El hueco afecta a cualquier hoja 1-bit con fondo pintado**,
que es un formato común: valía más que los 30 puzles que lo destaparon.

**Y el pack fácil queda resuelto:**

| Fuente | Lic. | Archivos | Aceptados | Cuota | Lado mayor |
|---|---|---:|---:|---:|---|
| **Urizen 1Bit** | CC0 | 5 540 | **1 821** | 32,9 % | 5→21, **10→803**, 15→997 |
| **Bit Bonanza** | CC0 | 1 223 | 540 | 44,2 % | 5→8, **10→532** |
| Mystery Icons | CC-BY-SA | 45 | 30 | 66,7 % | 20→30 |

**Urizen es la mayor cosecha del proyecto: 1 821 puzles**, más que los 1 219 de
Fugue. Su geometría se recuperó, no se adivinó: tile 12, separación 1, margen 1
cuadra `2679 = 206·12 + 205·1 + 2` y `651 = 50·12 + 49·1 + 2` exactamente, y da
5 540 tiles no vacíos contra los «5500+» que anuncia el autor.

**Bit Bonanza está dibujado a 10×10**, así que 532 de sus 540 puzles caen en
lado mayor 10 y 8 en 5×5. Para dimensionarlo: antes de estas dos fuentes el
proyecto **entero** tenía 6 tableros de 5×5 y 93 de lado 10. Juntas aportan
**1 364 tableros de lado 10 o menos**. El pack fácil deja de ser un problema y
`fit.maxSize` nunca hizo falta tocarlo.

Dato lindo: dos personas ya construyeron nonogramas con Bit Bonanza —un libro de
picross publicado y el juego *Do You Like Picross*— con el visto bueno del autor
en los comentarios. Confirmación independiente de que un sprite 1-bit de 10×10
es la forma correcta para esto.

**Total consolidado: ~6 240 puzles CC0** de trece fuentes, con 857+ sujetos
distintos, contra los ~100 que pide Fase 1.

### 7.10 La cuota de aceptación no es una nota de calidad (2026-08-07)

El pack **1-Bit Icons de Kacper Woźniak** (CC0-1.0, verificado por fila de
metadata *y* prosa) resultó ser el experimento controlado más limpio del
proyecto: **los mismos 35 objetos, del mismo autor, dibujados a 8, 16 y 32 px**
en dos estilos. Solo cambia la fidelidad del dibujo.

| Hoja | Aceptados / 35 | Cuota |
|---|---:|---:|
| **8 px simple** | 19 | **54,3 %** |
| 8 px detail | 15 | 42,9 % |
| 16 px detail | 10 | 28,6 % |
| 16 px simple | 9 | 25,7 % |
| 32 px detail | 8 | 22,9 % |
| 32 px simple | 5 | 14,3 % |

**La cuota cae monótonamente al crecer el dibujo: 8 px rinde el doble que
32 px.** Contradice de frente la investigación inicial, que descartó los packs
de 8×8 de Kenney por «demasiado gruesos para ser reconocibles».

La explicación importa más que el resultado:

> **El pipeline mide jugabilidad, no reconocibilidad.** Un dibujo más grueso
> tiene menos píxeles aislados y menos bloques por línea, así que pasa la puerta
> de jugabilidad con facilidad. *Ninguna puerta comprueba que la figura siga
> siendo identificable.*

O sea: una cuota alta puede significar «esto reduce a una rejilla limpia y
resoluble» y no decir nada sobre si el jugador reconocerá un farol al
terminarlo. Las dos cosas pueden apuntar en direcciones opuestas, y aquí lo
hacen. **Leer toda cuota de §7.5–7.9 con ese matiz**, y mirar los candidatos a
ojo antes de fijar los cien. Es también un argumento para no automatizar la
selección del todo.

El pack en sí es chico: 40 tiles, 35 no vacíos, y son los mismos objetos en las
doce hojas, así que su techo son 35 sujetos elijas la hoja que elijas.

### 7.11 El barrido npm no es fiable como cifra

`pixelarticons` era el campeón declarado del barrido con 65 %. Medido de verdad
desde su repo (MIT, 877 SVG de viewBox 24×24):

| | Cuota | Aceptados | Lado mayor | Dificultad 1→5 |
|---|---:|---:|---|---|
| A 256 px (la ruta del barrido) | **43,0 %** | 377 | **10→257**, 20→56 | 26/110/122/83/36 |
| A su viewBox nativo | **52,3 %** | 459 | **20→379**, 25→75 | 21/72/137/98/131 |

**El 65 % no se reproduce.** Y lo mismo al revés con HackerNoon: el barrido le
puso 25 % y por la misma ruta de 256 px da 63,3 %. Dos cifras mal, en
direcciones opuestas. Causas probables: muestra de 60 iconos, y `dedupe` a 0,04
en el barrido contra 0,06 en el probe.

> **`data/source-ranking.json` sirve para ordenar candidatos a grandes rasgos,
> no como cifra fiable de ninguna colección concreta.** Cualquier fuente que
> vaya a entrar en los cien hay que medirla desde su origen.

**Sobre rasterizar al viewBox nativo:** sube la cuota en ambos sets (+6,6 y
+9,3 puntos) y **elimina los rechazos por fidelidad**, que es lo esperado —
sin reducción no hay fidelidad que perder. Pero **no es una mejora estricta**:
en `pixelarticons` la ruta de 256 px produce 257 tableros de lado 10 y una
curva más fácil, mientras que la nativa los empuja a lado 20 y endurece la
curva. Se ganan puzles y se pierden tableros pequeños.

Así que la recomendación **no** es sustituir una ruta por otra, sino
**intentar las dos y quedarse con ambas salidas**, dejando que `dedupe` resuelva
el solapamiento. Toca `src/raster.ts` y `src/pipeline.ts`: necesita build en
Windows, y queda pendiente.

Nota aparte: **HackerNoon vía PNG de 16 px da 75,2 %**, la cuota más alta del
catálogo. Pero es CC-BY-4.0, así que si entra, H6 vuelve a ser bloqueante.

### 7.12 ¿Hace falta refinar el pipeline? Medido: no

Con 17 015 imágenes medidas se puede contestar con datos en vez de intuición.

**Dónde se pierde todo:**

| Puerta | Rechazos | % del total |
|---|---:|---:|
| **Jugabilidad** | **7 067** | **41,5 %** |
| Duplicado | 2 490 | 14,6 % |
| Fidelidad | 235 | 1,4 % |
| Lógica | 196 | 1,2 % |
| *Aceptados* | *7 025* | *41,3 %* |

Fidelidad y lógica ya casi no rechazan: es el efecto de la ruta nativa (§7.5) y
del reparador. La jugabilidad rechaza tantas como se aceptan, y dentro de ella
el motivo dominante son **píxeles aislados: 4 133**, seguido de `too dense`
(2 536) y `too sparse` (925).

**Se probó relajar ese umbral** (`maxIsolated`) sobre el tablero ya encajado:

| `maxIsolated` | DCSS monster (400) | Nikoichu (400) | Hexany (64) |
|---|---:|---:|---:|
| 0 | 212 | 203 | 0 |
| **2 ≈ el default actual** | **257** | **215** | **0** |
| 3 | 269 | 216 | 0 |
| 5 | 278 | 222 | 0 |

Relajar de 2 a 5 compra **+5 a +8 %** de puzles, y la curva muestra que casi
todos caen en dificultad 4-5: son tableros con motas flotantes, justo los
tediosos. Sobre un corpus que ya tiene 60× lo que pide Fase 1, no vale la pena.
**Las puertas están bien calibradas; no tocarlas.**

> **Detalle que cuesta descubrir dos veces:** pasar `options.quality` explícito
> **anula la relajación automática de la ruta nativa**. Por eso la fila
> `maxIsolated: 0` de arriba rinde *menos* que el default, aunque el default
> nominal también sea 0.

Y Hexany no se salva con ningún umbral, lo que confirma que su 0 % era el arte
y no la configuración.

**Las distribuciones agregadas están sanas** (7 025 puzles aceptados):

- **Dificultad** 7,0 / 28,8 / 30,5 / 20,9 / 12,7 % — campana centrada en 3.
  Es además la primera evidencia de que `estimateDifficulty`, reescrito en
  §2.5, produce una distribución razonable sobre puzles *derivados de imagen*
  y no solo sobre aleatorios. La decisión pendiente 6 queda parcialmente
  respondida: la forma es buena. Que las **etiquetas** sean correctas —que un
  «1» se sienta fácil— sigue sin verificarse y necesita jugarlos.
- **Tamaño** 21 % en lado 10, 33 % en 15, y el resto repartido hasta 35.

**Lo único medido que sí mejoraría el pipeline** es la doble rasterización de
SVG de §7.11: intentar 256 px *y* viewBox nativo y quedarse con ambas salidas.
Pero solo aplica a fuentes SVG, y con ~6 240 puzles CC0 de origen raster ya no
es un cuello de botella. Prioridad baja.

**El hueco real no está en la conversión.** Ninguna puerta mide
reconocibilidad (§7.10) ni valida que un «dificultad 1» se sienta fácil. Las dos
cosas necesitan ojos, no código. La palanca se movió del pipeline a la
**selección**: tope por sujeto, lista negra de cromo, curva y tres packs.

### 7.13 Un pack rechazado por licencia

**PixyMoon — Cute RPG Icons** (`pixymoon.itch.io/cute-rpg`) queda fuera.

La página **no tiene fila `Asset license`**, así que la única fuente es prosa a
medida: *«You can use it on your project, personal or commercial… Credits to
PixyMoon»* / *«You cannot: Sell this asset pack, not even modified.»*

Sin licencia nombrada aplica `04` §2.4: entra como `distributable: false` y
queda bloqueado en toda salida, incluido el build con biblioteca embebida que
**es** el artefacto de Fase 1. Y la cláusula anti-redistribución encaja mal con
enviar el arte dentro de un repo que cualquiera puede forkear. Mismo veredicto
que Shikashi: buen contenido, licencia insuficiente.

El ZIP queda **sin extraer** en `_sources/piximoon/` con su `PROVENANCE.json`
registrando la decisión, para que una sesión futura no lo redescubra y lo mida.

Una señal que conviene recordar: el pack se etiqueta a sí mismo `1-bit` y
`Low-poly` siendo iconos multicolor de 16×16. Cuando la metadata de una página
es así de descuidada, fiarse de la prosa antes que de las etiquetas — y si se
contradicen, no fiarse de ninguna sin preguntar.

Ojo: Fugue es **CC-BY-3.0**, así que si sus puzles entran, H6 (pantalla de
créditos) es bloqueante. Con solo el 1-Bit Pack (CC0) habría 587 sin esa deuda.

**Siguiente paso concreto:** bajar a mano el pack de Nikoichu (1 476 sprites
16×16 ya 1-bit, CC0) y medirlo igual. Si rinde como el 1-Bit Pack, habría
~1 400 puzles **solo CC0**, y se podría cerrar el contenido de Fase 1 sin deuda
de atribución y sin depender de H6.

## 8. Advertencias operativas

- **Origen estable obligatorio.** IndexedDB y el Service Worker están
  particionados por origen. Un túnel efímero tipo TryCloudflare cambia de
  hostname en cada arranque y **borra todo el progreso local**. Ver `02` §7.2.
- **Steam Input puede secuestrar el gamepad** en el Deck. Verificar en hardware
  real en Fase 1. Riesgo R2.
- **Contenido con copyright.** Nada de nonograms.org entra en un release. La
  ruta personal de `04` §2.5 está bloqueada por código en todas las salidas.
- **Cuidado con la caché de WebFetch.** Una respuesta cacheada 15 minutos dio un
  falso positivo sobre la existencia de `mikix/nonogram-db` y costó una hora.
  Ante una comprobación de existencia, romper la caché con un parámetro.

## 9. Continuidad: el paso a ejecución local

El repositorio está en `jpma29/nanonogram` (privado) y en local en
`F:\jpma2\Documents\Claude\Projects\nanonogram`.

**Lo primero al retomar en local:**

```bash
cd F:\jpma2\Documents\Claude\Projects\nanonogram
pnpm install
pnpm -r build
pnpm -r test
git status          # confirmar que tools/ y los cambios de core están commiteados
```

Reproducir el barrido de fuentes (requiere ~440 MB de descarga):

```bash
cd tools/puzzlegen
pnpm add -D @iconify/json
node scripts/sweep-sources.mjs 60 > data/source-ranking.json
# en máquinas con pocos núcleos, repartir:
#   SHARD=0/3 node scripts/sweep-sources.mjs 60 > shard0.json   (etc.)
```

Un barrido completo de 213 colecciones tarda ~20 min en un núcleo.

**Qué hacer a continuación, en orden:**

```
0. Correr `pnpm build && pnpm test` de verdad en Windows. Sigue pendiente desde
   §7.3: el pipeline se midió contra 17 015 imágenes reales, pero tsc/vitest
   nunca han tocado ese código.
1. CONSTRUIR EL SELECTOR. Es lo único que bloquea el contenido de Fase 1.
   Necesita tres cosas que dedupe NO puede hacer (§7.7, §7.12):
     - tope por sujeto (Fugue repite 4,5x, DCSS 2,7x, Nikoichu 2,5x)
     - lista negra de cromo de interfaz (arrow se lleva 154 puzles solo)
     - curva de dificultad y reparto en tres packs
   Los títulos no pueden delatar la figura: hideTitle es true por defecto
   (RF-BIB-3).
2. Hoja de contactos de los ~150 finalistas y revisarlos A OJO. Ataca los dos
   huecos que ninguna puerta cubre (§7.10, §7.12): que la figura siga siendo
   reconocible, y que un "dificultad 1" se sienta fácil. No se puede automatizar.
3. Diseñar H1 (onboarding) y H2 (actualización de la PWA). H6 (créditos) solo
   si entra material CC-BY; con lo CC0 medido (~6 240 puzles) no hace falta.
4. packages/ui: Svelte 5 + Vite, renderer Canvas por capas (02 §3.2).
5. Capa de persistencia IndexedDB sobre GameSnapshot, que ya round-trippea.
6. Presupuesto de bundle en CI: rompe el build por encima de 300 KB gzip.
```

**Estado del árbol de trabajo al cerrar el 2026-08-07** (nada commiteado
todavía):

```
 M .gitignore                                   + /tools/puzzlegen/_sources
 M docs/06-estado-actual.md                     §7.4-7.13
 M tools/puzzlegen/SOURCES.md                   secciones de la cacería
 M tools/puzzlegen/scripts/probes/fetch-pixel-sources.mjs
 M tools/puzzlegen/scripts/probes/pixel-sources.json    catálogo, 26 packs
 M tools/puzzlegen/scripts/probes/probe-common.mjs      arreglo del clasificador
?? tools/puzzlegen/scripts/probes/slice-spritesheet.mjs nuevo
```

`_sources/` (17 338 imágenes, 22 MB) está gitignorado a propósito: es material
de terceros en bruto. Lo que lo hace reconstruible es que **los 16 packs tienen
su `PROVENANCE.json`** con licencia y evidencia, y que `pixel-sources.json`
guarda las URLs y las cifras medidas de cada uno. Si se borra `_sources/`, no se
pierde nada que no se pueda volver a bajar.

El motor ya expone todo lo que la UI necesita: `Game` con trazos y bloqueo de
eje, `crossouts` incremental, `GameSnapshot` serializable, y `verifyPuzzle` para
el script de build. La UI no debería tener que decidir ninguna regla del juego;
si le hace falta, es señal de que falta algo en `core`.

Antes de escribir la primera línea de la UI conviene leer `03-ux-y-controles`
completo y `02-arquitectura-tecnica` §3.2 y §4.
