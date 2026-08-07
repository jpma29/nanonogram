# 03 — UX, Controles y Accesibilidad

---

## 1. Principios de interfaz

1. **La rejilla manda.** En la pantalla de juego, la rejilla y sus pistas ocupan
   todo lo que puedan. El chrome es mínimo y se puede ocultar.
2. **Cero modales durante la partida.** Nada interrumpe el flujo salvo el
   diálogo de reinicio y el de fin de puzzle.
3. **Mismo modelo mental en todos los inputs.** Rellenar, tachar y marcar punto
   son las mismas tres acciones, con o sin dedo, con o sin cruceta.
4. **Lo que el jugador configuró, se respeta.** Ninguna ayuda se enciende sola,
   ningún ajuste se resetea al actualizar.

---

## 2. Mapa de pantallas

```
Inicio
├── Biblioteca            (por defecto)
│   ├── Packs
│   ├── Filtros / búsqueda
│   └── Detalle de puzzle → selector de modo → Juego
├── Juego
│   ├── HUD superior     (tiempo, modo, verificaciones, errores)
│   ├── Rejilla + pistas
│   ├── Barra de herramientas (modo de marcado, deshacer, rehacer, zoom)
│   ├── Pausa            (velo opaco; oculta el tablero)
│   └── Fin de puzzle → revelado de ilustración
├── Galería              (ilustraciones resueltas)
├── Perfil               (resueltos, coronas)
├── Ajustes
└── Admin                (solo admin; importar, packs, usuarios)
```

---

## 3. Pantalla de juego

### 3.1 Composición

```
┌────────────────────────────────────────────────┐
│ ← 12:34 · Hardcore · errores 1        ⚙ ⤢     │  HUD (ocultable)
├────────┬───────────────────────────────────────┤
│        │  3  1  2  5  5  2  1  3              │  cabecera columnas (sticky)
│        │  1  2  1        1  2  1              │
├────────┼───────────────────────────────────────┤
│   5    │  ░  ░  ░  ░  ░  ░  ░  ░              │
│ 2   2  │  ░  ▓  ▓  ░  ░  ▓  ▓  ░              │  ← fila y columna del
│   8    │  ▓  ▓  ▓  ▓  ▓  ▓  ▓  ▓              │    cursor resaltadas
│ 1   1  │  ✕  ░  ░  ·  ░  ░  ░  ✕              │
├────────┴───────────────────────────────────────┤
│  [▓]  [✕]  [·]    ↶  ↷      −  🔍  +          │  barra de herramientas
└────────────────────────────────────────────────┘
```

En **Casual** el HUD muestra `verificaciones 2/3` y aparece un botón
`Verificar`. En **Hardcore** muestra el contador de errores y no hay botón.

### 3.2 Adaptación por dispositivo

| Contexto | Layout |
|---|---|
| Teléfono vertical | Rejilla centrada, barra de herramientas abajo al alcance del pulgar, HUD compacto en una línea |
| Teléfono horizontal / tablet | Herramientas en columna lateral, rejilla más grande |
| Steam Deck (1280×800) | Rejilla centrada y grande, HUD y herramientas como overlay semitransparente que se atenúa al no haber input durante 3 s |
| Desktop | Rejilla centrada con máximo ancho, panel lateral con info del puzzle, atajos de teclado visibles en tooltips |
| Pantallas pequeñas 4:3 (referencia Anbernic) | El layout se diseña para caber en 640×480 con celdas de ≥ 12 px, aunque el cliente sea nativo |

### 3.3 Tamaño de celda

Se calcula para que la rejilla completa quepa en la ventana, con un **mínimo de
14 px** en táctil (para que el dedo acierte) y **10 px** con cursor. Si la
rejilla no cabe a ese mínimo, se activa scroll/pan con cabeceras fijas y el
zoom pasa a ser la forma normal de navegar.

### 3.4 Pausa

Cuando el cronómetro se detiene —por menú explícito o automáticamente al pasar
a segundo plano (RF-TIME-1)— **la rejilla se oculta tras un velo opaco**. No es
un difuminado: no debe poder deducirse nada del tablero a través de él.

```
┌────────────────────────────────────────────────┐
│                                                │
│                     Gato                       │
│                    12:34                       │
│                                                │
│                 ▸ Continuar                    │
│                   Ajustes                      │
│                   Reiniciar                    │
│                   Salir a la biblioteca        │
│                                                │
└────────────────────────────────────────────────┘
```

- El velo aparece en ~150 ms y cubre rejilla y cabeceras de pistas por completo.
- Al volver de segundo plano, lo primero que se ve **siempre** es el velo, nunca
  el tablero. Reanudar es un acto deliberado.
- Contenido del menú: `Continuar`, `Ajustes`, `Reiniciar` (con confirmación),
  `Salir a la biblioteca`. En Casual se muestra además el contador de
  verificaciones restantes; en Hardcore, el número de errores.
- Navegable con gamepad, teclado y táctil. `Continuar` es el elemento enfocado
  por defecto, de modo que Start–Start o Esc–Enter es un ciclo de pausa completo.

### 3.5 Fin de puzzle

Secuencia deliberadamente breve, sin celebración exagerada:

1. Las X y los puntos se desvanecen.
2. La rejilla transiciona a la **ilustración final** (celdas rellenas en su
   color, sin líneas de rejilla), en ~600 ms.
3. Aparecen: título del puzzle, tiempo, corona si corresponde, y si mejoró el
   récord Hardcore.
4. Botones: `Siguiente del pack` · `Volver a la biblioteca` · `Ver en galería`.

La animación se puede reducir o desactivar (ver §7, `prefers-reduced-motion`).

---

## 4. Controles

Las tres acciones fundamentales son **rellenar**, **tachar** y **punto**. Todo
lo demás es navegación.

### 4.1 Táctil

| Gesto | Acción |
|---|---|
| Toque en celda | Aplica la herramienta activa |
| Arrastre desde celda | Aplica la herramienta a todo el trazo, bloqueado al primer eje |
| Mantener pulsado y arrastrar | Igual, más el **contador flotante** de celdas del trazo |
| Toque con dos dedos | Deshacer |
| Pinch | Zoom |
| Arrastre con dos dedos | Pan |
| Toque en número de pista | Tachar / destachar manualmente (RF-AYU-3) |

La herramienta activa se cambia en la barra inferior. **Alternativa
configurable:** modo "dos dedos = tachar", para quien prefiera no cambiar de
herramienta (activable en ajustes, desactivado por defecto porque choca con el
deshacer).

### 4.2 Gamepad — mapeo por defecto

Definido en el Q&A, completamente remapeable:

| Control | Acción |
|---|---|
| D-pad | Mover cursor una celda |
| Stick izquierdo | Mover cursor (repetición acelerada al mantener) |
| **A** | Rellenar |
| **X** | Tachar (X) |
| **Y** / **B** | Punto (marca temporal) |
| **L1** | Zoom out |
| **R1** | Zoom in |
| L2 | Mantener = pintado continuo mientras se mueve el cursor |
| R2 | Mantener = mover cursor de 5 en 5 |
| Stick derecho | Pan libre de la vista |
| **L3** / **R3** (clic de sticks) | Color anterior / siguiente (solo puzzles de color) |
| Start | Menú de pausa |
| Select | Mostrar/ocultar HUD |

Notas de implementación:

- **Polling en `requestAnimationFrame`**, no solo eventos `gamepadconnected`.
- La Gamepad API exige **una pulsación inicial con la pestaña enfocada** antes
  de devolver datos, y **contexto seguro (HTTPS)**. La pantalla de inicio debe
  tolerar esto sin parecer rota: si se detecta un gamepad conectado pero sin
  datos, se muestra "Pulsa un botón del control".
- **Steam Deck:** Steam Input puede interceptar el control y presentarlo como
  teclado/mouse cuando la app corre como *non-Steam game*. Debe documentarse
  para el usuario cómo configurar el perfil en pass-through de gamepad, y la
  app debe funcionar razonablemente igual si Steam Input está emulando teclado
  (por eso el mapeo de teclado de §4.3 cubre todo).
- Presionar A y X simultáneamente no debe producir estados ambiguos: se aplica
  el primero recibido en el frame y se ignora el otro hasta soltar.

### 4.3 Teclado

| Tecla | Acción |
|---|---|
| Flechas / `WASD` | Mover cursor |
| `Espacio` / `F` | Rellenar |
| `X` | Tachar |
| `D` | Punto |
| `Shift` + movimiento | Pintado continuo |
| `Ctrl` + movimiento | Saltar 5 celdas |
| `Ctrl+Z` / `Ctrl+Shift+Z` | Deshacer / rehacer |
| `+` / `-` | Zoom |
| `V` | Verificar (solo Casual) |
| `H` | Mostrar/ocultar HUD |
| `Esc` | Menú de pausa |
| `?` | Lista de atajos |

Todos los elementos interactivos son alcanzables con `Tab` y activables con
`Enter`.

### 4.4 Gamepad virtual

Overlay táctil para teléfono y tablet, **desactivado por defecto** (el táctil
directo es mejor en esas pantallas), pensado para quien prefiere el control por
cursor o tiene dificultades de precisión.

- D-pad a la izquierda, botones A/X/Y a la derecha.
- Reposicionable arrastrando, con posición persistida por dispositivo.
- Opacidad configurable; se atenúa al 30 % tras 3 s sin uso.
- Se puede fijar solo el D-pad sin los botones, o al revés.

---

## 5. Sistema visual

### 5.1 Filosofía

Minimalista, con la personalización de color como característica de primera
clase — referencia explícita: *Pixelogic: Nonograms Unlimited*. La app no impone
una identidad cromática; el jugador la construye.

### 5.2 Temas base

| Tema | Uso |
|---|---|
| Claro | Por defecto en desktop |
| Oscuro | Por defecto en móvil según preferencia del sistema |
| OLED negro puro | Ahorro de batería en AMOLED |
| Alto contraste | Accesibilidad; cumple AAA |
| Sepia / papel | Sesiones largas, menos fatiga |

### 5.3 Tokens personalizables

El jugador puede ajustar de forma independiente:

- **Color de acento** (UI, cursor, botones activos).
- **Color de celda rellena** en puzzles B/N — no tiene por qué ser negro.
- **Color y forma de la X** (aspa, relleno tenue, diagonal).
- **Color del punto**.
- **Intensidad del highlight** de fila/columna.
- **Color de las líneas de conteo** cada 5.
- **Tamaño de UI** (3 niveles) — crítico para el Deck a distancia de sofá.

Todo cambio se previsualiza en vivo sobre una rejilla de muestra. Se pueden
guardar **presets** con nombre y exportarlos/importarlos como JSON.

**Restricción:** cualquier combinación elegida se valida contra un contraste
mínimo de 4.5:1 entre celda rellena y celda vacía; si no lo cumple, se avisa
(sin bloquear).

### 5.4 Puzzles de color

En puzzles multicolor la paleta la define el puzzle, no el tema. Se muestra un
selector de color activo, cambiable con las teclas numéricas `1`–`9`, tocando el
selector en táctil, o con **L3 / R3** en gamepad (clic de sticks, color anterior
y siguiente). Se evita deliberadamente cualquier combinación con L2, que ya está
ocupado por el pintado continuo. Las pistas se dibujan en su color, con **un
patrón de textura diferenciador opcional** para daltonismo (activable en
ajustes).

### 5.5 Tipografía

Una sola familia, sans-serif de dígitos tabulares y alta legibilidad a tamaño
pequeño (candidatas: Inter, IBM Plex Sans, Atkinson Hyperlegible para el modo
accesible). Los números de pista son el elemento tipográfico crítico: deben
distinguirse a 10 px.

---

## 6. Biblioteca y galería

### 6.1 Biblioteca

Cuadrícula de tarjetas. Cada tarjeta muestra:

- Placeholder con el tamaño (`15×15`) si no está resuelto, o la **ilustración en
  miniatura** si sí lo está.
- Indicador de estado: sin empezar / en curso (barra de progreso sutil) /
  resuelto.
- 👑 si tiene corona.
- Mejor tiempo Hardcore si existe.
- Título, salvo que el puzzle tenga `hide_title`.

Filtros persistentes por sesión. Búsqueda por título y por pack.

### 6.2 Detalle y selector de modo

Al elegir un puzzle se muestra una hoja con: tamaño, tipo, dificultad estimada
(1–5), récord, corona, y los dos botones de modo con una línea explicando cada
uno. Si hay una partida en curso, el botón principal pasa a ser `Continuar` y
mantiene el modo original.

### 6.3 Galería

Mosaico solo de ilustraciones resueltas, en su color final, sin metadatos
encima. Al tocar una se amplía a pantalla completa con el título, el tiempo y la
fecha. Es una vista contemplativa, no una lista.

---

## 7. Accesibilidad

| Requisito | Implementación |
|---|---|
| Contraste | AA mínimo en todos los temas incluidos; tema AAA disponible |
| Daltonismo | Patrones de textura opcionales en puzzles de color; nunca solo color para comunicar estado |
| Motricidad | Tamaño mínimo de objetivo táctil 44×44 px en controles de UI; gamepad virtual; sensibilidad de arrastre ajustable; sin gestos que requieran precisión temporal |
| Movimiento | Respeta `prefers-reduced-motion`: sin transición de revelado, sin sacudida en error |
| Lectores de pantalla | La rejilla se expone como `role="grid"` con celdas etiquetadas (`fila 3, columna 7, vacía`) y las pistas de la línea activa anunciadas en un `aria-live` discreto |
| Texto | Escala con el ajuste de tamaño de UI y con el zoom del sistema, sin romper el layout |
| Sin dependencia de sonido | Todo feedback sonoro tiene equivalente visual y háptico |
| Idioma | Español e inglés desde el inicio; strings externalizados |

---

## 8. Sonido y háptica

Mínimos y desactivables por separado:

- Clic corto al rellenar (con variación de tono según la longitud del trazo).
- Sonido distinto y más seco al tachar.
- Sonido de error en Hardcore, claramente negativo pero no estridente.
- Acorde breve al completar.
- Vibración corta en error y al completar, si el dispositivo la soporta.

Sin música.

---

## 9. Estados vacíos y de error

| Situación | Qué se muestra |
|---|---|
| Biblioteca vacía | Explicación de cómo importar puzzles, con el comando exacto si el usuario es admin |
| Sin conexión | Banner discreto no bloqueante; la app sigue funcionando |
| Sync fallando | Icono en estado de error, con detalle y botón de reintento al tocarlo |
| Puzzle sin solución única, publicado por el admin | Advertencia visible en la tarjeta y en el detalle: "solución no única — sin verificación de errores, sin récord ni corona". Es jugable (ver `01-requisitos` RF-BIB-6) |
| Puzzle no verificado, no publicado | No aparece en la biblioteca del jugador. Solo el admin lo ve, en su bandeja de importación |
| Sesión expirada | Se pide re-login sin perder el progreso local pendiente de subir |
