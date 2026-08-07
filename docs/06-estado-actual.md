# 06 — Estado Actual y Continuidad

**Última actualización:** 2026-08-07 (cierre del generador, del barrido de
fuentes y de la cacería de pixel art)
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
| Contenido (adelantado desde Fase 5) | ✅ **Generador listo**, falta seleccionar los 100 |
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
  dificultad. La deduplicación tiene que hacerse sobre el **conjunto fusionado**,
  no por colección: toda librería de iconos tiene un corazón, una estrella y una
  casa.
- **Tableros pequeños escasean.** De todos los aceptados: 5×5 → 6, 10 → 93,
  15 → 171, 20 → 535, 25 → 490, 30 → 598, 35 → 578. Un nivel 1 en 30×30 es
  tedioso, no fácil; el pack fácil probablemente necesita generar con
  `fit.maxSize` limitado.
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
3. **La exclusión de Fugue es por nombre base, así que borra de más.** Los seis
   nombres de terceros se cruzan contra el tallo del archivo en `icons/`,
   `icons-shadowless/` y `bonus/`: se van hasta ~18 archivos, no 6, y un icono
   legítimo con uno de esos nombres genéricos (`share`, `language`) se iría con
   ellos. Es el lado seguro del error y perder un par de 3 922 no cuesta nada,
   pero la línea del log no es un conteo exacto.
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

**Primer paso de la próxima sesión**, en Windows:

```bash
cd tools/puzzlegen
node scripts/probes/fetch-pixel-sources.mjs kenney/1-bit-pack
node scripts/probes/probe-local-folder.mjs _sources/kenney/1-bit-pack \
  --license CC0-1.0 --source "kenney/1-bit-pack" --author "Kenney"
```

Un pack ya 1-bit primero: si la ruta nativa se porta mal, la umbralización no
puede ser la sospechosa. Después, bajar a mano el de Nikoichu, que es el de
mayor valor de la lista.

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
0. Correr el build y los tests de verdad en Windows (§7.3), y luego medir el
   primer pack de pixel art raster: fetch-pixel-sources.mjs + probe-local-folder
   sobre kenney/1-bit-pack (§7.4).
1. Generar el catálogo completo desde las ~43 colecciones que superan el 30 %
   MÁS los packs de pixel art que sobrevivan al paso 0, deduplicando sobre el
   conjunto fusionado.
2. Seleccionar 100 puzzles en tres packs con curva de dificultad. Los títulos no
   pueden delatar la figura: hideTitle está en true por defecto (RF-BIB-3).
3. Revalidar los umbrales de estimateDifficulty contra esos 100.
4. Diseñar H1 (onboarding), H2 (actualización de la PWA) y H6 (créditos).
5. packages/ui: Svelte 5 + Vite, renderer Canvas por capas (02 §3.2).
6. Capa de persistencia IndexedDB sobre GameSnapshot, que ya round-trippea.
7. Presupuesto de bundle en CI: rompe el build por encima de 300 KB gzip.
```

El motor ya expone todo lo que la UI necesita: `Game` con trazos y bloqueo de
eje, `crossouts` incremental, `GameSnapshot` serializable, y `verifyPuzzle` para
el script de build. La UI no debería tener que decidir ninguna regla del juego;
si le hace falta, es señal de que falta algo en `core`.

Antes de escribir la primera línea de la UI conviene leer `03-ux-y-controles`
completo y `02-arquitectura-tecnica` §3.2 y §4.
