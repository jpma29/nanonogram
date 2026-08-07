# 00 — Visión y Alcance

**Proyecto:** **nanonogram**
**Autor:** JP
**Fecha:** 2026-08-06
**Estado:** Borrador inicial, derivado de sesión de Q&A

---

## 0. El nombre

**nanonogram** — de *nano* + *nonogram*. Nombra la particularidad que se busca
en el resultado: una app deliberadamente ligera. Bundle de 300 KB, servidor en
un binario de 15 MB que corre en menos de 100 MB de RAM, y un motor de juego sin
una sola dependencia. Frente a las alternativas comerciales cargadas de
anuncios, tiendas y telemetría, la ligereza no es un detalle de implementación:
es la propuesta.

Verificado libre en agosto de 2026: sin paquete en npm, sin repositorios en
GitHub, sin colisiones en búsqueda web. "Nonogram" es un término genérico del
género —acuñado a partir del nombre de Non Ishida— y no una marca de Nintendo;
la marca es "Picross", que este nombre evita.

**Advertencia práctica:** *nanogram* (sin la segunda `no`) es una unidad de masa
muy indexada. Conviene registrar el dominio pronto y considerar redirigir los
typos más probables.

Convenciones derivadas del nombre:

| Elemento | Valor |
|---|---|
| Paquete del motor | `@nanonogram/core` |
| Binario del servidor | `nanonogram` (subcomandos: `serve`, `import`) |
| Base de datos | `nanonogram.db` |
| Base IndexedDB | `nanonogram` |
| Versión del formato canónico | `nanonogram.puzzle/1` |

---

## 1. Visión

Una aplicación selfhosted para jugar nonogramas que reúna las mejores
características de los clientes existentes para **jugadores experimentados**, sin
las limitaciones típicas de las apps móviles comerciales: sin anuncios, sin
compras, sin límites de vidas, sin telemetría, con la biblioteca completa bajo
control del usuario y con el progreso sincronizado entre todos sus dispositivos.

El eje de diseño es **la partida**, no el metajuego. Nada de monedas, energía,
mapas de progresión ni gacha. Lo que se optimiza es: la calidad del marcado, la
claridad de la rejilla, la fidelidad de los controles y que jugar se sienta igual
de bien con el dedo, con el mouse o con la cruceta.

## 2. Objetivos

| # | Objetivo | Medida de éxito |
|---|---|---|
| O1 | Jugar cómodamente en cualquiera de los dispositivos objetivo | Un puzzle 20×20 se resuelve sin fricción en Steam Deck, teléfono y desktop |
| O2 | Funcionar 100 % offline | Se puede abrir la app en avión, navegar la biblioteca descargada y resolver puzzles; el progreso no se pierde |
| O3 | Sincronizar progreso entre dispositivos | Empezar un puzzle en el teléfono y terminarlo en el Deck sin pasos manuales |
| O4 | Marcado de nivel experto | Estados múltiples por celda, deshacer ilimitado, ayudas visuales configurables |
| O5 | Selfhosting trivial | Un binario o un `docker run` y está funcionando; sin dependencias externas |
| O6 | Biblioteca propia e importable | Importar colecciones en formatos estándar y organizarlas en packs |

## 3. No objetivos (explícitos)

Lo siguiente queda **fuera** del alcance, y se documenta para evitar deriva:

- **Sistema de pistas.** No hay botón de "revelar celda" ni "resolver línea". El
  error checking cumple la función de red de seguridad; las pistas no.
- **Monetización de cualquier tipo.** Ni anuncios, ni cosméticos, ni vidas.
- **Multijugador en tiempo real.**
- **Leaderboards globales o entre instancias.** Los récords son personales.
- **Logros y trofeos.** Se descartó deliberadamente en favor de un sistema
  mínimo de progresión (mejor tiempo + corona).
- **Variantes exóticas** (triddlers, hexagonales, Nurikabe). Solo rejilla
  rectangular, B/N y color.
- **Editor de puzzles integrado y generación desde imagen** en el alcance
  inicial. Se reevalúa después de v1 (ver `05-roadmap`).
- **Un servicio hospedado por nosotros.** Cada usuario corre su instancia.

## 4. Hardware objetivo

| Dispositivo | Prioridad | Entrada principal | Estrategia de distribución |
|---|---|---|---|
| Steam Deck | Alta | Gamepad + táctil | PWA instalada, añadida como non-Steam game |
| Teléfono Android | Alta | Táctil | PWA instalable (opcionalmente TWA) |
| Tablet Android | Alta | Táctil | PWA instalable |
| Windows Desktop | Alta | Teclado + mouse (+ gamepad) | PWA vía Edge/Chrome; wrapper Tauri opcional |
| Navegador cualquiera | Alta | Variable | La PWA es la app; es el denominador común |
| Anbernic RG35XX / RGSP con CFW | **Media, vía ruta distinta** | Botones físicos | **No vía PWA** — ver riesgo R1 |

### Riesgo R1 — El Anbernic no puede correr la PWA

Los firmwares personalizados de la familia RG35XX (muOS, Knulli, ArkOS,
Batocera, GarlicOS) están construidos exclusivamente alrededor de RetroArch y
PortMaster. **No incluyen ningún navegador moderno**, y el hardware (Allwinner
H700, 4× Cortex-A53 @1.5 GHz, 1 GB de RAM, pantalla 640×480 4:3) no da para
Chromium ni para un runtime con Service Workers e IndexedDB.

**Consecuencia de diseño:** el motor del juego debe vivir en un módulo puro,
sin dependencias del DOM ni del navegador, para poder recompilarse o
reimplementarse en un cliente nativo ligero distribuido vía PortMaster. Esta
decisión se detalla en `02-arquitectura-tecnica` §3 y condiciona la estructura
del repositorio desde el primer commit, aunque el cliente Anbernic no se
construya hasta la Fase 4.

## 5. Personas

**JP, el jugador principal.** Juega nonogramas desde hace años, conoce las
técnicas de resolución por líneas y le molesta que las apps le "ayuden" sin
pedirlo. Alterna entre el teléfono en ratos muertos y el Deck en el sofá.
Quiere que el puzzle que dejó a medias esté donde lo dejó. Tiene un homelab y
prefiere hospedar sus propias cosas.

**El jugador casual invitado.** Alguien a quien JP le comparte la instancia.
Entra desde el navegador, quiere jugar sin configurar nada y agradece poder
verificar si va bien. No debería tener que entender los modos para empezar.

## 6. Pilares de diseño

1. **Offline es el estado normal, no la excepción.** La red es una mejora, no un
   requisito. Toda la app se diseña asumiendo que no hay servidor.
2. **El juego no te delata.** Ninguna ayuda se activa sola. El jugador elige su
   nivel de asistencia al empezar el puzzle y la app lo respeta.
3. **Un solo motor, muchos frentes.** La lógica del juego es idéntica en todos
   los dispositivos; solo cambia cómo se dibuja y cómo se entra el input.
4. **La ilustración importa.** Un nonograma resuelto es una imagen. Los puzzles
   completados se conservan y se pueden ver en una galería.
5. **Densidad antes que decoración.** En una pantalla de 3.5" o en un 20×20 a
   mano alzada, cada píxel de la rejilla cuenta.

## 7. Decisiones tomadas en el Q&A inicial

| Tema | Decisión |
|---|---|
| Arquitectura | Web app + PWA, con wrappers nativos opcionales. Online y offline funcionales |
| Backend | Biblioteca + progreso + sync, multiusuario con login simple |
| Tipos de puzzle | Clásico B/N y color/multicolor |
| Pistas | **No hay pistas** |
| Error checking | Sí, con comportamiento distinto por modo (ver `01-requisitos`) |
| Guardado | Local siempre; sync cuando hay servidor |
| Ayudas visuales | Highlight fila/columna, tachado de pistas no ambiguas, contador con hold |
| Controles | Gamepad físico configurable + gamepad virtual táctil |
| Estadísticas | Mínimas: mejor tiempo (solo Hardcore) + corona por partida limpia |
| Victoria | Solo cuentan las celdas rellenas; X y puntos se ignoran |
| Cronómetro | Pausa en menú y en segundo plano; el tablero se oculta en pausa |
| Color incorrecto | Cuenta como error |
| Tamaño máximo | 100×100 |
| Estética | Minimalista con personalización de color, estilo *Pixelogic* |
| Contenido | Importadores de formatos existentes + packs curados por el admin |
| Despliegue | Binario único portable; sin servidor también válido |
| MVP | Jugar B/N offline completo |

## 8. Referencias de producto

Apps que sirven de referencia y qué se toma de cada una:

- **Picross DS / Picross S (Nintendo)** — la escalada de penalización de tiempo
  del modo con errores, y la sensación de la rejilla.
- **Nonograms 999** — el contador de celdas rellenadas al mantener presionado.
- **Pixelogic: Nonograms Unlimited** — la personalización de color de la
  interfaz y la galería de ilustraciones resueltas.
- **webpbn / pbnsolve** — el formato de datos y el rigor sobre unicidad de
  solución.
