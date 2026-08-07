# 01 — Requisitos Funcionales

**Convención de IDs:** `RF-<área>-<n>`. Prioridad: **M** (MVP), **1** (v1), **2** (v2+).

---

## 1. Modos de juego

Se eligen **al empezar cada puzzle**. El modo queda registrado en el intento y
determina qué se guarda como récord.

### RF-MOD-1 — Modo Casual · **M**

Pensado para disfrutar sin presión, sin dejar de ser honesto.

- Cronómetro visible, pero **no se guarda récord**.
- Error checking **bajo demanda**: el jugador pulsa "Verificar" y se resaltan
  las celdas actualmente incorrectas.
- El número de verificaciones disponibles es **limitado y depende del tamaño**:

  | Tamaño de rejilla | Verificaciones |
  |---|---|
  | ≤ 10×10 | 1 |
  | 11×15 a 15×15 | 2 |
  | 16×20 a 20×20 | 3 |
  | 21×25 a 25×25 | 4 |
  | > 25×25 | 5 |

  (Regla general: `clamp(1, ceil(max(w,h) / 5) - 1, 5)`.)
- Las verificaciones consumidas se muestran siempre (`2 / 3 restantes`).
- Marcar una celda mal **no interrumpe la partida**. El jugador puede terminar
  con errores y descubrirlo solo al verificar o al no poder cerrar el puzzle.
- Sin penalizaciones de tiempo.

**Contabilidad silenciosa de errores (para la corona).** Aunque en Casual no se
avisa, el motor **sí registra** internamente cada vez que una celda pasa a
`filled` en una posición que no va rellena en la solución. Ese contador es
invisible durante la partida y solo se consulta al completar el puzzle, para
decidir la corona (RF-MOD-4).

Corregir la celda después **no descuenta** el error: la corona premia haber
resuelto sin equivocarse, no haber sabido rectificar. Un jugador que rellena mal
y se autocorrige sin usar ninguna verificación termina el puzzle igual, con su
tiempo intacto, pero sin corona. Esto hace que la corona signifique lo mismo en
ambos modos.

### RF-MOD-2 — Modo Hardcore · **M**

- Error checking **inmediato**: al rellenar una celda que no va rellena, se
  detecta al instante, la celda se revierte y se aplica **penalización de
  tiempo escalada** al estilo Picross DS:

  | Error nº | Penalización |
  |---|---|
  | 1º | +00:30 |
  | 2º | +01:00 |
  | 3º | +02:00 |
  | 4º | +04:00 |
  | 5º y siguientes | +08:00 |

  La escala es configurable por instancia (`penalty_ladder`), pero este es el
  valor por defecto.
- El error se comunica con animación breve + vibración (si hay) + sonido
  opcional. Se muestra la penalización aplicada de forma clara.
- **Solo en Hardcore se guarda el mejor tiempo** del puzzle.
- El tiempo mostrado al terminar es tiempo real + penalizaciones.
- No existe el botón "Verificar" en este modo.

### RF-MOD-3 — Marcar X nunca produce error · **M**

Marcar una X en una celda que sí debería ir rellena **no cuenta como error** en
ningún modo. La X es una anotación del jugador, no una afirmación sobre la
solución. Solo rellenar incorrectamente cuenta.

> **Nota de diseño:** esta es la convención de Picross de Nintendo y evita que
> el modo Hardcore se convierta en un solver asistido por prueba y error con X.

### RF-MOD-4 — La corona · **M**

Un puzzle recibe una **corona** si se completó:

- en cualquier modo,
- **sin ningún error** (contabilizados como se define en RF-MOD-1 para Casual y
  en RF-MOD-2 para Hardcore), y
- **sin haber usado ninguna verificación**.

La corona es permanente una vez obtenida y se muestra en la biblioteca y en la
galería. No se pierde al volver a jugar el puzzle.

### RF-MOD-5 — Condición de victoria · **M**

Un puzzle está completo cuando **el conjunto de celdas `filled` coincide
exactamente con el conjunto de celdas rellenas de la solución** — mismas
posiciones y, en puzzles de color, mismo color en cada una.

Las X y los puntos **se ignoran por completo** para esta comprobación. El
jugador nunca tiene que "limpiar" la rejilla: puede terminar con X de más, con
puntos olvidados o con celdas vacías que debían llevar X, y el puzzle se cierra
igual. Es la convención de Picross de Nintendo.

Corolario: en Casual es posible tener celdas `filled` incorrectas y **no**
completar el puzzle, porque el conjunto no coincide. El juego no dice cuáles
están mal; simplemente no se cierra. Esa es la señal de que hay un error, y es
la razón de que el modo tenga verificaciones.

La comprobación se ejecuta tras cada cambio de estado de celda, comparando un
contador incremental de aciertos contra el total — no recorriendo la rejilla
entera en cada movimiento.

### RF-MOD-6 — Color incorrecto es error · **1**

En puzzles multicolor, rellenar una celda con un color distinto al de la
solución **cuenta como error**, aunque esa celda sí vaya rellena. El color es
parte de la deducción, no un detalle estético.

- En **Hardcore**: se revierte al instante y aplica la penalización escalada.
- En **Casual**: se registra en la contabilidad silenciosa de errores y, por
  tanto, invalida la corona.

---

## 1b. Cronómetro

### RF-TIME-1 — Pausa automática · **M**

El cronómetro corre **solo mientras el jugador está jugando activamente**. Se
detiene automáticamente cuando:

- se abre el menú de pausa (Start / `Esc`);
- la app pasa a segundo plano o se minimiza;
- se bloquea la pantalla del dispositivo;
- la pestaña deja de ser visible (`document.visibilityState !== "visible"`);
- el dispositivo entra en suspensión.

Se reanuda al volver, sin cuenta atrás ni confirmación.

Implementación: el tiempo transcurrido se acumula con marcas monótonas
(`performance.now()`), no con la hora del sistema, para que cambiar la hora del
dispositivo o cruzar un cambio de horario no altere el récord. Al reanudar tras
un periodo largo se persiste el acumulado antes de seguir.

### RF-TIME-2 — Ocultar el puzzle en pausa · **M**

Mientras el cronómetro está detenido, **la rejilla y las pistas se ocultan**
tras un velo opaco. No se ve nada del tablero: ni celdas, ni números, ni
progreso.

Esto existe por una razón concreta: si el tiempo no corre pero el puzzle sigue
visible, pausar se convierte en tiempo gratis para deducir, y el récord Hardcore
deja de medir nada. Ocultar la rejilla hace que la pausa sea realmente una
pausa.

El velo muestra únicamente: título del puzzle (si no es `hide_title`), tiempo
acumulado, y las acciones del menú. Aparece con una transición corta (~150 ms), y
se aplica también cuando la pausa fue automática, de modo que al volver de
segundo plano lo primero que se ve es el velo, no el tablero.

### RF-TIME-3 — Qué se muestra al completar · **M**

El tiempo final es `tiempo activo acumulado + penalizaciones`. Ambos
componentes se muestran por separado cuando hubo penalización
(`14:32 (+2:30 por errores)`), para que el jugador entienda el número.

---

## 2. Interacción con la rejilla

### RF-GRID-1 — Estados de celda · **M**

Cada celda tiene exactamente uno de estos estados:

| Estado | Significado | Cuenta para la solución |
|---|---|---|
| `empty` | Sin decidir | — |
| `filled` | Rellena (con color en puzzles de color) | Sí |
| `cross` | Descartada por el jugador (X) | No |
| `dot` | Marca temporal / "quizás" | No |

`dot` es una anotación blanda: se dibuja como un punto pequeño y se puede
limpiar en bloque con una acción de "borrar marcas temporales".

### RF-GRID-2 — Arrastre en línea · **M**

Al arrastrar desde una celda, el trazo se **bloquea en el primer eje** en que se
mueva (horizontal o vertical) y se mantiene bloqueado hasta soltar. El estado
que se aplica a todo el trazo es el que se aplicó a la primera celda.

### RF-GRID-3 — Contador con hold · **M**

Al mantener presionada una celda (táctil) o el botón de acción (gamepad) sin
soltar, aparece un **contador flotante** que indica cuántas celdas lleva el
trazo actual, actualizándose mientras se arrastra. Referencia: *Nonograms 999*.

### RF-GRID-4 — Deshacer / rehacer ilimitado · **M**

Pila de undo/redo sin límite dentro de la sesión del puzzle, persistida junto
con el estado. Un arrastre completo es **una sola entrada** en la pila.

### RF-GRID-5 — Zoom y pan · **M**

- Táctil: pinch para zoom, dos dedos para pan.
- Gamepad: L/R para zoom in/out; el pan sigue al cursor automáticamente.
- Teclado: `+`/`-` y flechas con modificador.
- Las cabeceras de pistas quedan **fijas (sticky)** al hacer pan, siempre
  visibles.

### RF-GRID-6 — Reinicio de puzzle · **M**

Acción explícita con confirmación, que limpia la rejilla, el cronómetro, los
errores y las verificaciones consumidas. No borra la corona ya obtenida ni el
mejor tiempo previo.

---

## 3. Ayudas visuales

Todas configurables individualmente en ajustes; los valores por defecto se
indican. Ninguna de ellas revela información que el jugador no pueda deducir.

### RF-AYU-1 — Highlight de fila y columna · **M** · *por defecto: activado*

Resalta con un tinte suave la fila y la columna completas de la celda bajo el
cursor o el dedo, incluyendo la **cabecera de pistas correspondiente**, que se
destaca con más contraste.

### RF-AYU-2 — Tachado de pistas sin ambigüedad · **M** · *por defecto: activado*

Un número de pista se tacha automáticamente **solo cuando su satisfacción es
inequívoca**: el bloque de celdas rellenas que le corresponde está delimitado en
ambos extremos por una X o por el borde de la rejilla, y el emparejamiento
pista→bloque en esa línea es único.

Si en una línea hay más de un emparejamiento posible entre pistas y bloques
cerrados, **no se tacha nada** en esa línea. Este es el comportamiento crítico
que diferencia esta ayuda de un tachado ingenuo (que sí filtraría información).

> El algoritmo de decisión se especifica en `02-arquitectura-tecnica` §5.2.

### RF-AYU-3 — Tachado manual de pistas · **1** · *por defecto: activado*

El jugador puede tachar/destachar un número de pista con un toque, de forma
independiente del tachado automático.

### RF-AYU-4 — Regla de conteo · **M** · *por defecto: activado*

Líneas divisorias más gruesas cada 5 celdas, en ambos ejes.

### RF-AYU-5 — Atenuar líneas resueltas · **1** · *por defecto: desactivado*

Cuando una fila o columna coincide exactamente con su definición, sus pistas se
atenúan. Desactivado por defecto porque revela información deducible pero no
trivial.

### RF-AYU-6 — Lo que NO se hace

- No hay autocompletado de X al cerrar una línea (se descartó en el Q&A).
- No hay botón de pista.
- No hay resaltado de "esta línea tiene un error" fuera de la verificación
  explícita.

---

## 4. Biblioteca y contenido

### RF-BIB-1 — Navegación de la biblioteca · **M**

Lista de puzzles con: miniatura (silueta o ilustración si ya está resuelto),
tamaño, tipo (B/N o color), estado (sin empezar / en curso / resuelto), corona,
y mejor tiempo si lo hay.

Filtros: por tamaño, por tipo, por estado, por pack. Orden: por tamaño,
alfabético, por fecha de adición, por fecha de resolución.

### RF-BIB-2 — Packs curados · **M**

El administrador de la instancia agrupa puzzles en packs con nombre,
descripción, orden interno y curva de dificultad declarada. Un puzzle puede
pertenecer a varios packs.

### RF-BIB-3 — Miniatura oculta hasta resolver · **M**

Un puzzle sin resolver **no muestra su ilustración**. Muestra un placeholder con
el tamaño. El título del puzzle es visible o no según una bandera por puzzle
(`hide_title`), porque algunos títulos son spoilers de la imagen.

### RF-BIB-4 — Galería de ilustraciones · **1**

Vista dedicada tipo mosaico con todas las ilustraciones ya resueltas, en su
color final, ampliables. Es la recompensa visible del progreso.

### RF-BIB-5 — Importadores · **1**

Importar colecciones al servidor, por orden de prioridad:

| Formato | Prioridad | Notas |
|---|---|---|
| **`.non` extendido (mikix)** | 1ª | Añade `license`, `goal` y color. Es la fuente con licencia limpia |
| **JSON canónico propio** | 1ª | Exportar/reimportar entre instancias |
| **PBN XML** (webpbn) | 2ª | Estándar de facto, soporta color |
| `.non` clásico (Steve Simpson) | 3ª | Sin color ni `license`; mismo parser con campos opcionales |
| ipuz | 4ª — **v2** | Opcional, solo si aparece demanda real |

Ver `04-modelo-de-datos-y-api` §2 para el formato canónico y las notas de
licencia por fuente.

### RF-BIB-6 — Validación al importar · **1**

Todo puzzle importado pasa por el solver antes de entrar a la biblioteca:

- Se verifica que **tenga solución** y que sea **única**.
- Se calcula y almacena una **dificultad estimada** de 1 a 5 (ver `02` §5.3).
- Los que no cumplen se marcan como `verified = false` y quedan **despublicados
  por defecto**: no aparecen en la biblioteca de los jugadores. El admin los ve
  en una bandeja aparte, con el motivo del rechazo, y puede publicarlos
  igualmente.
- Un puzzle despublicado y luego publicado por el admin **sí es jugable**, y
  aparece en la biblioteca con una advertencia visible en su tarjeta y en el
  detalle (ver `03-ux-y-controles` §9). Si su solución no es única, el error
  checking se desactiva en ambos modos y el puzzle **no puede otorgar corona ni
  récord**.

> **Nota para el MVP.** La biblioteca de la Fase 1 va embebida en el build, sin
> servidor. Su validación y su dificultad se calculan **en tiempo de build** con
> el line solver de `@nanonogram/core`, y viajan ya resueltas en el JSON. El
> importador en runtime y el solver del servidor llegan en la Fase 2.

### RF-BIB-7 — Editor y generación desde imagen · **2**

Fuera del alcance de v1. Se documenta como intención futura.

---

## 5. Progreso, guardado y sincronización

### RF-SYNC-1 — Autoguardado local · **M**

El estado de la partida en curso (rejilla, pila de undo, cronómetro, errores,
verificaciones usadas) se persiste localmente de forma continua. Cerrar la
pestaña, quedarse sin batería o matar la app no pierde progreso.

### RF-SYNC-2 — Funcionamiento sin servidor · **M**

La app es plenamente jugable sin backend: biblioteca embebida, progreso en
almacenamiento local. Este es el MVP.

### RF-SYNC-3 — Offline-first con sync al reconectar · **1**

Con servidor configurado, todo se escribe primero en local y se sincroniza en
segundo plano al recuperar conexión.

### RF-SYNC-4 — Resolución de conflictos · **1**

Por tipo de dato:

| Dato | Regla |
|---|---|
| Estado de partida en curso | Gana el `updated_at` más reciente; el perdedor se conserva como "estado alternativo" recuperable durante 7 días |
| Mejor tiempo (Hardcore) | Gana el menor |
| Corona | OR lógico: una vez obtenida en cualquier dispositivo, se propaga |
| Ajustes de usuario | Gana el `updated_at` más reciente |

### RF-SYNC-5 — Indicador de estado de sync · **1**

Icono discreto y persistente: `sincronizado` / `pendiente (n)` / `sin conexión`
/ `error`. Tocarlo muestra el detalle y permite forzar sincronización.

---

## 6. Usuarios y administración

### RF-USR-1 — Multiusuario con login simple · **1**

Cuentas locales usuario + contraseña (hash Argon2id). Cada usuario tiene su
progreso, sus récords y sus ajustes de forma independiente.

### RF-USR-2 — Rol de administrador · **1**

El primer usuario creado es admin. El admin puede: importar y borrar puzzles,
crear y editar packs, crear y desactivar usuarios. No puede ver el progreso de
otros usuarios.

### RF-USR-3 — Sesiones de larga duración · **1**

El login persiste indefinidamente en el dispositivo salvo cierre explícito. Un
juego de puzzles no debe pedir contraseña cada semana.

### RF-USR-4 — Exportar e importar datos de usuario · **2**

Descargar todo el progreso propio como JSON y reimportarlo en otra instancia.

---

## 7. Estadísticas

Deliberadamente mínimas.

### RF-STAT-1 — Por puzzle · **M**

- Mejor tiempo, **solo del modo Hardcore**.
- Corona (sí / no).
- Fecha de primera resolución.
- Número de veces completado.

### RF-STAT-2 — Global · **1**

Solo un contador de puzzles resueltos y de coronas obtenidas, visible en el
perfil. Sin gráficas, sin rachas, sin tiempo total jugado.

### RF-STAT-3 — Fuera de alcance

Logros, trofeos, reto diario, leaderboards, rachas, curvas de progreso.

---

## 8. Ajustes

### RF-SET-1 — Categorías de ajustes · **M**

| Categoría | Contenido |
|---|---|
| Apariencia | Tema base, color de acento, color de celda rellena, tamaño de UI, modo alto contraste |
| Juego | Cada ayuda visual on/off, modo por defecto, confirmación al reiniciar |
| Controles | Remapeo completo de gamepad, gamepad virtual on/off y posición, sensibilidad de arrastre |
| Sonido y háptica | Volumen de efectos, vibración on/off |

### RF-SET-1b — Ajustes de cuenta y sincronización · **1**

Categoría adicional que aparece **solo cuando hay servidor configurado**: URL de
la instancia, sesión iniciada, dispositivos con sesión activa y estado de
sincronización. En el MVP (sin servidor) esta sección no existe en la UI.

### RF-SET-2 — Ajustes sincronizados · **1**

Los ajustes viajan con la cuenta, con posibilidad de marcar algunos como
"solo este dispositivo" (típicamente los de controles y tamaño de UI, que
dependen del hardware).

---

## 9. Requisitos no funcionales

| ID | Requisito |
|---|---|
| RNF-1 | Bundle inicial ≤ 300 KB gzip; carga en frío < 2 s en un teléfono de gama media |
| RNF-2 | 60 FPS estables durante el arrastre en una rejilla 50×50; piso aceptable 30 FPS |
| RNF-3 | Heap en runtime ≤ 200 MB |
| RNF-4 | La app arranca y es jugable sin ninguna petición de red exitosa |
| RNF-5 | Todo el texto de UI localizable; español e inglés desde el inicio |
| RNF-6 | Contraste mínimo AA (4.5:1) en todos los temas incluidos |
| RNF-7 | Toda acción de juego alcanzable con gamepad, con táctil y con teclado, sin excepción |
| RNF-8 | El servidor corre en < 100 MB de RAM con una biblioteca de 10 000 puzzles |
| RNF-9 | Tamaño máximo de rejilla soportado: **100×100**. El importador rechaza puzzles mayores con motivo explícito; el renderer, la codificación RLE y el layout se validan en ese extremo |
