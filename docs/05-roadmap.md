# 05 — Roadmap y Fases

Las fases se definen por **capacidad entregada**, no por fecha. Cada una tiene
criterios de aceptación verificables.

---

## Resumen

| Fase | Nombre | Entrega | Estado |
|---|---|---|---|
| 0 | Cimientos | Monorepo, `core` con tests, corpus compartido | ✅ **Completa** (2026-08-06) |
| **1** | **MVP — Jugar B/N offline** | **PWA jugable sin servidor** | **Siguiente** |
| 2 | Servidor y sync | Backend Go, multiusuario, offline-first | Pendiente |
| 3 | Color, galería y pulido | Puzzles de color, galería, temas completos | Pendiente |
| 4 | Wrappers y Anbernic | Tauri, TWA, port nativo PortMaster | Pendiente |
| 5 | Creación de contenido | Editor, importar desde imagen | Pendiente |

---

## Fase 0 — Cimientos ✅

**Objetivo:** que la lógica del juego exista, esté probada y sea portable, antes
de dibujar un solo píxel.

**Cerrada el 2026-08-06.** Ver `06-estado-actual` §2 para qué se construyó
exactamente y dónde vive.

### Alcance

- Monorepo con la estructura de `02-arquitectura-tecnica` §3.
- `@nanonogram/core`: modelo de puzzle, máquina de estado de partida, reglas de
  error y penalización (incluida la contabilidad silenciosa de errores en
  Casual), condición de victoria, cronómetro monótono con pausa, corona,
  undo/redo, line solver, verificación de unicidad, estimador de dificultad, y
  lógica de tachado sin ambigüedad. **Cero dependencias, cero DOM.**
- Parser y serializador del **formato canónico JSON**.
- Corpus `shared-tests`: ≥ 100 casos en JSON cubriendo line solving, tachado en
  situaciones ambiguas y no ambiguas, escalada de penalización, y condiciones de
  corona.
- CI: lint, typecheck, tests, cobertura.

### Criterios de aceptación

- [x] `@nanonogram/core` tiene ≥ 90 % de cobertura de líneas. → **98.7 %**,
      con el umbral cableado en la configuración de cobertura de CI.
- [x] Tests de propiedad: 10 000 puzzles aleatorios generados, resueltos por el
      line solver, y verificada la unicidad declarada. Corre en ~1.7 s.
- [x] El caso crítico está cubierto: en una línea con emparejamiento pista→bloque
      ambiguo, **no se tacha nada**. Verificado además de forma exhaustiva sobre
      todas las líneas monocromas de hasta 10 celdas y todos sus marcados
      posibles: 428 729 tachados emitidos, todos con emparejamiento único
      demostrado por enumeración.
- [x] El cronómetro acumula correctamente con pausas múltiples y es inmune a
      cambios de hora del sistema. El motor no lee la hora: solo consume marcas
      monótonas que le pasa el host, y lo verifica un test de pureza.
- [x] La condición de victoria ignora X y puntos, y exige color exacto en
      puzzles multicolor.
- [x] `package.json` de `core` no lista ninguna dependencia de runtime.

### Lo que se entregó de más

- **Test de pureza** (`packages/core/test/purity.test.ts`) que lee el código de
  `core` y falla ante cualquier import externo, global del host (`window`,
  `document`, `localStorage`, `setTimeout`…) o fuente de no-determinismo
  (`Math.random`, `Date.now`, `performance.now`). La regla de oro de
  `02-arquitectura` §3.1 pasa de convención a invariante comprobado.
- **243 casos** en el corpus compartido en vez de los 100 pedidos, con notación
  documentada en `packages/shared-tests/README.md` para quien implemente el lado
  Go, y un paso de CI que falla si regenerar el corpus produce un diff.
- **Auditoría adversaria** del line solver, el tachado y el solver de puzzles
  contra enumeración exhaustiva independiente (~900 000 líneas y ~15 000
  puzzles). Encontró un defecto latente en `fullDomain` con paletas de 31
  entradas, ya corregido.

---

## Fase 1 — MVP: jugar B/N offline

**Objetivo declarado en el Q&A.** Una PWA que se abre, tiene puzzles, se juega
bien y no pierde el progreso. Sin servidor, sin cuentas, sin color.

> **Antes de escribir UI:** contar cuántos puzzles utilizables con licencia
> limpia tiene realmente `mikix/nonogram-db` (decisión pendiente 5). La
> biblioteca embebida de ~100 puzzles es un criterio de aceptación de esta fase,
> y si la fuente no da para tanto hay que replantear antes de construir, no
> después. Ver riesgo R3.

### Alcance

- PWA Svelte 5 con renderer Canvas por capas.
- Pantallas: biblioteca, detalle/selector de modo, juego, ajustes.
- **Modo Casual** con verificaciones limitadas por tamaño (RF-MOD-1).
- **Modo Hardcore** con penalización escalada (RF-MOD-2).
- Cuatro estados de celda, arrastre bloqueado por eje, contador con hold,
  undo/redo ilimitado, zoom y pan.
- Ayudas: highlight fila/columna, tachado sin ambigüedad, regla cada 5.
- Controles: táctil, teclado y **gamepad físico con el mapeo por defecto**.
- Persistencia en IndexedDB: progreso, récords, ajustes. El motor ya expone
  `GameSnapshot`, serializable y con round-trip probado; la capa de persistencia
  solo tiene que guardarlo y devolverlo.
- Service Worker con precache del shell.
- **Diseñar los huecos H1 (onboarding) y H2 (actualización de la PWA)**, que
  `06-estado-actual` §6.1 dejó abiertos y esta fase necesita.
- Biblioteca embebida en el build: ~100 puzzles B/N de licencia limpia,
  importados desde `mikix/nonogram-db`, organizados en 3 packs por dificultad.
- **Script de build** que convierte `.non` extendido al JSON canónico y llama a
  `verifyPuzzle()` de `@nanonogram/core` para verificar unicidad y calcular la
  dificultad 1–5 de cada puzzle embebido. Es el mismo algoritmo que después
  implementará el servidor en Go (Fase 2); aquí corre una sola vez, en tiempo de
  build.
- **Recalibrar `estimateDifficulty`** contra esos 100 puzzles reales. Hoy es una
  heurística determinista con umbrales inventados a falta de una biblioteca
  contra la que medirlos.
- Temas claro y oscuro, con color de acento y color de celda personalizables.
- Español e inglés.

### Fuera de alcance en Fase 1

Servidor, cuentas, sync, color, galería, gamepad virtual, importadores en
runtime, TWA, Tauri.

### Criterios de aceptación

- [ ] La app se instala como PWA y arranca **en modo avión** sin ninguna
      petición de red.
- [ ] Un 20×20 se completa de principio a fin en Steam Deck usando solo el
      gamepad, sin tocar la pantalla.
- [ ] Se completa un puzzle en teléfono, se mata la app en medio, se reabre y
      el estado está intacto (rejilla, tiempo, errores, verificaciones).
- [ ] La corona se otorga exactamente cuando corresponde y no antes, incluido el
      caso Casual en que el jugador rellena mal y se autocorrige sin verificar
      (debe terminar **sin** corona).
- [ ] Los 100 puzzles embebidos están verificados como de solución única por el
      script de build, y todos traen dificultad calculada.
- [ ] El puzzle se cierra con X y puntos sobrantes en la rejilla (RF-MOD-5), y
      **no** se cierra si hay una celda `filled` incorrecta.
- [ ] El cronómetro se detiene al minimizar la app y al bloquear la pantalla, y
      al volver lo primero que aparece es el velo de pausa, nunca el tablero.
- [ ] Cambiar la hora del sistema a mitad de partida no altera el tiempo medido.
- [ ] Bundle inicial ≤ 300 KB gzip, medido en CI y con presupuesto que rompe el
      build si se excede.
- [ ] 60 FPS sostenidos durante arrastre en una rejilla 50×50 en Steam Deck.
- [ ] Auditoría Lighthouse PWA en verde.
- [ ] Checklist manual de hardware (§ Verificación) completado.

---

## Fase 2 — Servidor y sincronización

**Objetivo:** el mismo progreso en todos los dispositivos, sin dejar de
funcionar offline.

### Alcance

- Binario Go `nanonogram`: HTTP, estáticos embebidos, SQLite, migraciones.
- Auth con Argon2id, sesiones largas, primer usuario = admin.
- API de biblioteca y de sync según `04-modelo-de-datos-y-api` §5.
- `change_log` y sync incremental por cursor.
- Cola de sync en el cliente, con backoff e idempotencia.
- Resolución de conflictos según RF-SYNC-4, implementada en el cliente.
- Indicador de estado de sync.
- Importadores CLI: `.non` extendido, PBN XML, JSON canónico.
- **Flag `distributable` y sus bloqueos de salida** (`04-modelo-de-datos-y-api`
  §2.5): columna en el esquema, filtrado en `/puzzles/bundle`, en el export de
  usuario y en el build embebido; etiqueta "solo esta instancia" en la UI de
  admin.
- **Herramienta separada `tools/personal-import/`** para el formato `.nono` de
  `Dorifor/nonograms-archive`, fuera del binario de release, que marca todo lo
  que importa como `distributable: false`. Uso estrictamente personal.
- Solver de validación en Go: unicidad + dificultad estimada, validado contra
  el corpus `shared-tests`, cuya notación y formato están documentados en
  `packages/shared-tests/README.md`.
- Gestión de packs y usuarios desde la UI de admin.
- Docker image y binarios cross-compilados en el pipeline de release.
- Documentación de despliegue, incluida la guía de origen estable
  (`02-arquitectura-tecnica` §7.2).

### Criterios de aceptación

- [ ] Empezar un puzzle en el teléfono sin conexión, reconectar, y encontrarlo
      en curso en el Deck con el estado correcto.
- [ ] Editar el mismo puzzle en dos dispositivos offline, reconectar ambos, y
      obtener el resultado esperado según RF-SYNC-4, con el estado perdedor
      recuperable.
- [ ] La corona obtenida en un dispositivo aparece en el otro tras sincronizar.
- [ ] El solver Go y el solver TS coinciden en el 100 % del corpus compartido.
- [ ] `nanonogram` corre con < 100 MB de RAM con 10 000 puzzles importados.
- [ ] El binario arranca en Linux amd64, Linux arm64 y Windows amd64 sin
      dependencias externas.
- [ ] Perder el servidor a mitad de partida no interrumpe el juego.
- [ ] Un puzzle con `distributable = 0` es jugable en la instancia, pero **no
      aparece** en `/puzzles/bundle` de otro usuario, ni en el export de datos,
      ni en un build embebido. El build **falla** si se intenta incluir uno.

---

## Fase 3 — Color, galería y pulido

### Alcance

- Puzzles multicolor: paleta por puzzle, selector de color activo, pistas
  coloreadas, patrones de textura para daltonismo.
- Line solver de color en `core` y en el servidor. **Ya existe en `core` desde
  Fase 0**: el motor es multicolor de principio a fin (paleta, pistas, solver,
  tachado, condición de victoria). Lo que falta en esta fase es la UI.
- **Galería** de ilustraciones resueltas.
- Sistema de temas completo: OLED, alto contraste, sepia; presets de color
  guardables, exportables e importables.
- Tachado manual de pistas (RF-AYU-3), atenuar líneas resueltas (RF-AYU-5).
- **Gamepad virtual** táctil, reposicionable.
- Remapeo completo de gamepad desde ajustes.
- Sonido y háptica.
- Pasada de accesibilidad: `role="grid"`, `aria-live`, auditoría de contraste en
  todos los temas, `prefers-reduced-motion`.
- Exportar/importar datos de usuario (RF-USR-4).

### Criterios de aceptación

- [ ] Un puzzle de color 25×25 se resuelve cómodamente con gamepad, incluyendo
      cambio de color activo.
- [ ] Todos los temas incluidos superan contraste AA; el tema accesible supera
      AAA.
- [ ] La rejilla es navegable y comprensible con lector de pantalla.
- [ ] Con `prefers-reduced-motion` no hay ninguna animación de transición.

---

## Fase 4 — Wrappers nativos y Anbernic

### Alcance

- **Tauri 2** para Windows (y Linux desktop): instalador, autoupdate,
  integración de gamepad nativa como fallback si la Gamepad API del WebView
  falla.
- **TWA vía Bubblewrap** para Android, opcionalmente publicable. Verificar
  primero las políticas vigentes de Google Play.
- **Cliente Anbernic**: decisión entre reimplementación SDL2 o Godot 4, tomada
  con un prototipo medido en hardware real, no en papel. Distribución vía
  PortMaster. Sync contra la misma API.
- Guía de instalación por dispositivo, incluida la configuración de Steam Input
  en el Deck.

### Criterios de aceptación

- [ ] Instalador de Windows < 20 MB.
- [ ] El cliente Anbernic corre a ≥ 30 FPS en un RG35XX Plus real, con puzzles
      de hasta 30×30.
- [ ] El cliente Anbernic sincroniza progreso con la misma instancia que la PWA.
- [ ] Un puzzle completado en el Anbernic otorga corona visible en el teléfono.

### Riesgo abierto

Si ninguna de las dos opciones (SDL2 / Godot) alcanza un rendimiento y una
ergonomía aceptables en el H700, la alternativa es aceptar el Anbernic como
plataforma no soportada y documentarlo. Es un resultado válido de esta fase.

---

## Fase 5 — Creación de contenido

### Alcance

- Editor de puzzles integrado: dibujar celda a celda, validar unicidad en vivo,
  publicar al pack propio.
- Importar desde imagen: recorte, escalado, dithering configurable a B/N o a
  paleta reducida, previsualización de las pistas resultantes.
- Compartir puzzles entre instancias vía export JSON.

### Criterios de aceptación

- [ ] Crear un 15×15 desde una foto en menos de dos minutos, con el resultado
      validado como de solución única.
- [ ] El editor rechaza publicar un puzzle sin solución única, explicando por
      qué.

---

## Verificación por hardware

Checklist que se ejecuta al cerrar cada fase, en dispositivo real:

| Dispositivo | Qué se comprueba |
|---|---|
| Teléfono Android | Instalación PWA, offline en modo avión, táctil y arrastre, contador con hold, persistencia tras matar la app |
| Tablet Android | Layout horizontal, gamepad virtual, zoom en rejilla grande |
| Steam Deck | Lanzamiento como non-Steam game, **Steam Input no rompe la Gamepad API**, legibilidad a distancia de sofá, 60 FPS |
| Windows Desktop | PWA en Edge y en Chrome, atajos de teclado completos, gamepad USB |
| Anbernic (Fase 4) | Arranque, FPS, legibilidad a 640×480, ergonomía de botones |
| Navegador escritorio | Firefox y Safari además de Chromium; degradación aceptable donde falte soporte |

Fase 0 no tiene checklist de hardware: no hay nada que mirar todavía.

---

## Riesgos y mitigaciones

| # | Riesgo | Impacto | Mitigación |
|---|---|---|---|
| R1 | El Anbernic no puede correr la PWA | Alto — un dispositivo objetivo se queda fuera | `core` portable desde el día uno **y comprobado como tal por un test**; port nativo en Fase 4; aceptar como no soportado si el prototipo falla |
| R2 | Steam Input intercepta el gamepad y la Gamepad API no recibe nada | Alto — el Deck es prioridad | Mapeo de teclado completo como fallback (Steam Input emula teclado); guía de configuración; verificar en hardware real en Fase 1 |
| R3 | Escasez de puzzles con licencia limpia | Medio — la biblioteca inicial queda corta | Priorizar `mikix/nonogram-db`; **contarlos antes de construir la UI de Fase 1**; adelantar la generación desde imagen si hace falta; contenido sin licencia solo por la ruta personal de `04` §2.5, nunca en un release |
| R9 | Un puzzle no distribuible se filtra a un release o a otro usuario | Medio — es exactamente lo que el flag existe para impedir | El bloqueo es por código en cada ruta de salida, no por convención; test de CI que falla si un puzzle con `distributable = 0` entra en un bundle o en un build |
| R4 | Dos implementaciones del solver (TS y Go) divergen | Medio — el cliente y el servidor discrepan sobre qué es válido | Corpus `shared-tests` obligatorio en CI de ambos. **Existe desde Fase 0**: 243 casos, notación documentada, y un paso de CI que falla si el corpus deja de describir el código |
| R5 | Origen inestable (TryCloudflare) borra IndexedDB y el Service Worker | Alto — pérdida de progreso local | Documentar como requisito duro un origen estable con HTTPS; recomendar Cloudflare Tunnel con nombre o Tailscale |
| R6 | Rendimiento del Canvas en rejillas 100×100 en hardware débil | Medio | Renderer por capas con región sucia y atlas offscreen; presupuesto de FPS medido en CI |
| R7 | La solución del puzzle vive en el cliente y es legible | Bajo | Aceptado explícitamente: no hay leaderboards ni nada que proteger |
| R8 | Alcance que crece (logros, social, variantes) | Medio | La lista de no-objetivos de `00-vision-y-alcance` §3 es normativa |

---

## Decisiones pendientes

Cosas que **no** están decididas y que conviene no improvisar:

1. ~~**Nombre del proyecto.**~~ **Decidido: `nanonogram`** (2026-08-06).
   Verificado libre en npm, GitHub y búsqueda web. Ver `00-vision-y-alcance` §0
   para las convenciones derivadas. Queda por registrar el dominio.
2. ~~**Licencia del código.**~~ **Decidida: AGPL-3.0-only** (2026-08-06). Si
   alguien hospeda un fork modificado, publica sus cambios. `LICENSE` está en el
   repositorio y todos los `package.json` lo declaran.
3. **Ruta del cliente Anbernic** (SDL2 vs Godot) — se decide con prototipo en
   Fase 4.
4. **Si publicar en Google Play** vía TWA, o solo distribuir el APK.
5. **Fuente de la biblioteca inicial** más allá de `mikix/nonogram-db`: hace
   falta revisar cuántos puzzles utilizables tiene realmente y si conviene
   generar un set propio desde imágenes de dominio público. **Es lo primero de
   la Fase 1.**
6. **Calibrar el estimador de dificultad.** `estimateDifficulty` mapea
   `depth`, `passes`, `minInfo` y el tamaño a la escala 1–5 con umbrales
   elegidos a ojo, porque no había biblioteca contra la que medirlos. Retocarlo
   en Fase 1, cuando existan los 100 puzzles reales.
