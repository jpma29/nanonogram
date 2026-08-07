# 02 — Arquitectura Técnica

---

## 1. Resumen de la decisión

| Capa | Elección | Motivo corto |
|---|---|---|
| Motor de juego | **TypeScript puro**, paquete sin dependencias, sin DOM | Portable, testeable, reutilizable por el cliente nativo futuro |
| Frontend | **Svelte 5 + Vite** | Bundle mínimo, sin VDOM, ideal para el presupuesto de 300 KB |
| Render de rejilla | **Canvas 2D** con capas | El DOM no aguanta 2 500+ celdas interactivas a 60 FPS |
| Persistencia local | **IndexedDB** vía `idb` | Único almacenamiento con capacidad y transacciones reales |
| Offline | **Service Worker** (Workbox) | Precache del shell, cache-first para puzzles |
| Backend | **Go 1.23+** con SQLite embebido (`modernc.org/sqlite`) | Binario único sin CGO, cross-compila a todo, ~15 MB, < 30 MB de RAM |
| API | REST + JSON | Suficiente; sin GraphQL ni gRPC |
| Solver / validador | Go en el servidor, TS en el cliente | El servidor valida al importar; el cliente valida el tachado |
| Empaquetado desktop | **Tauri 2** (opcional) | 3–15 MB, usa WebView2/WebKitGTK del sistema |
| Empaquetado Android | **TWA vía Bubblewrap** (opcional) | Solo si se quiere Play Store |
| Cliente Anbernic | **Port nativo, Fase 4** | Ver §3.3 |

### Por qué Go y no Node/Bun

El requisito de "binario único portable" y "sin servidor también válido" empuja
a un backend que compile a un ejecutable estático sin runtime. Go cross-compila
a `linux/amd64`, `linux/arm64`, `windows/amd64` y `darwin/*` desde una sola
máquina, embebe los estáticos de la PWA con `embed.FS`, y con
`modernc.org/sqlite` (SQLite traducido a Go puro) evita CGO por completo — lo
que hace la cross-compilación trivial. El backend de este proyecto es CRUD y
sync: no necesita el ecosistema de npm.

El coste real es tener dos lenguajes y, por tanto, **dos implementaciones del
solver**. Se asume conscientemente: la del cliente solo necesita resolver líneas
individuales (para el tachado de pistas), es pequeña, y se cubre con un corpus
de tests compartido en JSON que ambas implementaciones deben pasar.

---

## 2. Vista general

```
┌───────────────────────────────────────────────────────────┐
│  Cliente (PWA)                                            │
│                                                           │
│  ┌───────────────────┐  ┌────────────────────────────┐    │
│  │ @nanonogram/core  │  │ UI (Svelte 5)              │    │
│  │ ───────────────── │  │ ────────────────────────── │    │
│  │ Modelo de puzzle  │◄─┤ Renderer Canvas (capas)    │    │
│  │ Máquina de estado │  │ Capa de input (unificada)  │    │
│  │ Cronómetro        │  │ Rutas: biblioteca / juego  │    │
│  │ Reglas de error   │  │        galería / ajustes   │    │
│  │ Line solver       │  └────────────────────────────┘    │
│  │ Undo/redo         │                │                   │
│  │ (0 dependencias)  │                ▼                   │
│  └───────────────────┘  ┌────────────────────────────┐    │
│                         │ Capa de persistencia       │    │
│                         │ IndexedDB + cola de sync   │    │
│                         └─────────────┬──────────────┘    │
│  ┌───────────────────────────┐        │                   │
│  │ Service Worker (Workbox)  │        │                   │
│  └───────────────────────────┘        │                   │
└───────────────────────────────────────┼───────────────────┘
                                        │ REST/JSON (opcional)
┌───────────────────────────────────────▼───────────────────┐
│  Servidor (binario Go único)                              │
│  HTTP · Auth · API de biblioteca · API de sync            │
│  Importadores (.non, PBN XML, JSON)                       │
│  Solver de validación + estimador de dificultad           │
│  SQLite embebido  ·  Estáticos de la PWA vía embed.FS     │
└───────────────────────────────────────────────────────────┘
```

---

## 3. Estructura del repositorio (monorepo)

```
nanonogram/
├── packages/
│   ├── core/          # @nanonogram/core — TS puro, 0 deps, sin DOM
│   │   ├── src/
│   │   │   ├── puzzle.ts       # modelo, clues, paleta
│   │   │   ├── game.ts         # máquina de estado de la partida
│   │   │   ├── clock.ts        # cronómetro monótono, pausa, acumulado
│   │   │   ├── rules.ts        # errores, penalizaciones, corona
│   │   │   ├── linesolver.ts   # resolución de una línea
│   │   │   ├── crossout.ts     # lógica de tachado sin ambigüedad
│   │   │   ├── history.ts      # undo/redo
│   │   │   └── formats/        # parsers .non / PBN / JSON canónico
│   │   └── test/
│   ├── ui/            # PWA Svelte 5
│   └── shared-tests/  # corpus JSON que core (TS) y server (Go) comparten
├── server/            # Go
│   ├── cmd/nanonogram/
│   └── internal/{api,auth,store,importer,solver}/
├── native/            # Fase 4 — cliente Anbernic (SDL2 / PortMaster)
└── docs/
```

### 3.1 Regla de oro del `core`

`@nanonogram/core` **no importa nada**: ni del DOM, ni de Svelte, ni de librerías
externas. Su superficie pública es determinista y serializable. Todo el juego
—qué es un error, cuánto penaliza, cuándo se tacha una pista, cuándo hay
corona— vive ahí y en ningún otro sitio.

Esto es lo que hace posibles tres cosas: tests exhaustivos sin navegador, el
solver de validación replicable en Go contra el mismo corpus, y el cliente
nativo de la Fase 4.

### 3.2 Renderer por capas

Canvas 2D con tres capas superpuestas, redibujadas de forma independiente:

1. **Estática** — rejilla, líneas de conteo, cabeceras de pistas. Se redibuja
   solo al cambiar zoom, tema o tachado.
2. **Dinámica** — estados de celda. Se redibuja solo la región sucia.
3. **Overlay** — highlight de fila/columna, cursor, contador flotante,
   animación de error. Se redibuja por frame durante la interacción.

Para rejillas grandes se usa un **atlas offscreen** de la capa estática y se
hace blit de la región visible, en vez de redibujar líneas cada frame.

### 3.3 El caso Anbernic (Fase 4)

Los CFW de la familia RG35XX no tienen navegador moderno viable (ver
`00-vision-y-alcance` R1). La ruta es un **port nativo distribuido vía
PortMaster**, con dos opciones a evaluar cuando llegue la fase:

- **A — Reimplementación en C/C++ con SDL2.** Es lo que PortMaster espera, el
  rendimiento sobra, y el corpus de `shared-tests` garantiza que la lógica
  coincida. Coste: reescribir el motor (~2 000 líneas) y toda la UI.
- **B — Godot 4 exportado a ARM Linux.** Menos código propio, pero el runtime
  pesa y el rendimiento en el H700 con 1 GB de RAM es un riesgo real.

La decisión se aplaza deliberadamente. Lo que sí se hace desde el día uno es
mantener el `core` portable y el formato de datos estable.

---

## 4. Cliente

### 4.1 Persistencia local

IndexedDB, base `nanonogram`, versión gestionada con migraciones explícitas.

| Store | Clave | Contenido |
|---|---|---|
| `puzzles` | `puzzle_id` | Definición completa del puzzle (clues, solución, metadatos) |
| `progress` | `puzzle_id` | Estado de la partida en curso + pila de undo |
| `records` | `puzzle_id` | Mejor tiempo Hardcore, corona, fecha, veces completado |
| `settings` | `key` | Ajustes de usuario |
| `syncQueue` | autoinc | Mutaciones pendientes de enviar al servidor |
| `meta` | `key` | Token de sesión, URL del servidor, cursor de sync |

**La solución del puzzle se guarda en el cliente.** Es inevitable: el error
checking inmediato del modo Hardcore no puede hacer un round-trip por celda. La
solución se almacena ofuscada (no cifrada — sería seguridad por oscuridad
contra el propio dueño del dispositivo) y se acepta que un usuario decidido
puede leerla. No hay leaderboards globales, así que no hay nada que proteger.

Se llama a `navigator.storage.persist()` al primer puzzle completado, para
reducir el riesgo de expulsión por presión de almacenamiento.

### 4.2 Service Worker

- **Precache** del shell de la app (JS, CSS, fuentes, iconos) con revisión por
  hash en el build.
- **Cache-first** para definiciones de puzzles: son inmutables una vez
  importadas.
- **Network-only** para la API de sync, con fallback a la cola en IndexedDB.
- **Navigation fallback** a `index.html` para que el enrutado funcione offline.

### 4.3 Cola de sincronización

Cada mutación local (`progress.update`, `record.set`, `settings.set`) se
encola con `{id, type, payload, client_ts, device_id}`. El worker de sync:

1. Envía el lote pendiente a `POST /api/v1/sync`.
2. Recibe los cambios del servidor desde el último cursor.
3. Aplica las reglas de conflicto de `01-requisitos` RF-SYNC-4 **en el
   cliente**, para que la resolución sea idéntica en todos los dispositivos.
4. Avanza el cursor.

Reintentos con backoff exponencial (1 s → 5 min, con jitter). La cola sobrevive
a reinicios.

### 4.4 Presupuesto de rendimiento

| Métrica | Objetivo | Límite inaceptable |
|---|---|---|
| Bundle inicial (gzip) | 200 KB | > 300 KB |
| Time to interactive (móvil gama media, frío) | 1.5 s | > 2.5 s |
| FPS durante arrastre (50×50) | 60 | < 30 (piso) |
| Heap en runtime | 120 MB | > 200 MB |
| Tiempo de guardado local por movimiento | < 5 ms | > 16 ms |

El guardado se hace con `requestIdleCallback` y coalescencia: no se escribe en
IndexedDB por cada celda, sino en lotes de ≤ 250 ms o al soltar el arrastre.

---

## 5. Algoritmos

### 5.1 Line solver

Programación dinámica clásica sobre `(índice de celda, índice de pista)`, que
para una línea dada y sus celdas conocidas devuelve, por cada celda, el conjunto
de estados posibles. Complejidad `O(n · k)` por línea. Se usa para:

- validar unicidad al importar (iterando líneas hasta punto fijo, con
  backtracking cuando el line-solving se estanca);
- decidir el tachado sin ambigüedad en el cliente;
- estimar dificultad.

### 5.2 Tachado sin ambigüedad (RF-AYU-2)

Para cada línea, dado el estado actual del jugador:

1. Extraer los **bloques cerrados**: secuencias maximales de celdas `filled`
   delimitadas en ambos extremos por `cross` o por el borde.
2. Enumerar todos los emparejamientos válidos entre la secuencia de pistas y la
   secuencia de bloques cerrados, respetando el orden y las longitudes, y
   admitiendo que entre bloques cerrados puedan quedar pistas aún no
   materializadas.
3. Una pista se tacha **si y solo si aparece emparejada con el mismo bloque en
   todos los emparejamientos válidos**.
4. Si no hay ningún emparejamiento válido (el jugador tiene un error), no se
   tacha nada en esa línea y no se le avisa.

El paso 3 es lo que impide que el tachado filtre información: si hay dos formas
de leer la línea, la ayuda calla.

### 5.3 Estimación de dificultad

Se resuelve el puzzle con line-solving iterativo y se registra:

- `depth`: número de veces que hubo que recurrir a backtracking (0 = resoluble
  solo por líneas);
- `passes`: pasadas completas hasta el punto fijo;
- `min_info`: la menor "información disponible" en el momento más apretado
  (proporción de celdas deducibles respecto al total pendiente).

De ahí sale una escala de 1 a 5. Se almacena junto al puzzle y no se recalcula
en el cliente.

---

## 6. Servidor

### 6.1 Composición

Un solo binario `nanonogram` que:

- sirve los estáticos de la PWA desde `embed.FS` (soportando subpath para
  reverse proxy);
- expone la API REST bajo `/api/v1`;
- abre `nanonogram.db` (SQLite) en el directorio de datos configurado;
- ejecuta las migraciones de esquema al arrancar;
- corre importadores como comandos del mismo binario
  (`nanonogram import --format=non ./coleccion/`).

Configuración por flags y variables de entorno, sin archivo obligatorio.

### 6.2 Autenticación

- Contraseñas con **Argon2id**.
- Sesiones con token opaco aleatorio de 256 bits, almacenado hasheado en la BD,
  entregado en cookie `HttpOnly; Secure; SameSite=Lax` y también disponible como
  `Authorization: Bearer` para los wrappers nativos.
- Expiración larga por defecto (1 año), renovable en cada uso.
- Rate limiting en `/auth/login`.
- El primer usuario registrado es admin; después el registro abierto se cierra
  salvo que el admin lo habilite.

### 6.3 Modo sin servidor

El build de la PWA puede generarse con una **biblioteca embebida**: los puzzles
se empaquetan como recursos estáticos y la app arranca en modo local, sin
pantalla de login ni ajustes de servidor. Es el artefacto del MVP y también lo
que se sirve en un GitHub Pages o en un `python -m http.server`.

---

## 7. Despliegue

### 7.1 Opciones soportadas

| Opción | Para quién | Notas |
|---|---|---|
| **Binario único** | Recomendado | `./nanonogram serve --data ./data --addr :8080`. Cero dependencias |
| **Docker** | Homelabs con stack existente | Imagen `scratch` o `distroless`, < 25 MB, un volumen para `data/` |
| **Solo estáticos** | Quien no quiere sync | Cualquier servidor de ficheros; PWA en modo local |
| **Tras reverse proxy** | Con dominio propio | Traefik / Caddy / nginx; documentar HTTPS, subpath y cabeceras de PWA |

### 7.2 Acceso remoto

Sobre el uso actual de **TryCloudflare Tunnel**: funciona para pruebas, pero el
hostname es efímero y cambia en cada arranque, lo que rompe el origen de la PWA
—y con él el Service Worker registrado, la caché y toda la IndexedDB, que están
particionados por origen. Para un juego con progreso local esto es un problema
serio, no cosmético.

Alternativas, en orden de recomendación:

1. **Cloudflare Tunnel con nombre** (cuenta gratuita + dominio propio):
   hostname estable, HTTPS, sin abrir puertos. Es TryCloudflare pero
   persistente; resuelve el problema de raíz.
2. **Tailscale / Headscale**: acceso privado entre tus dispositivos, con
   MagicDNS dando un hostname estable. Ideal si la instancia es solo tuya. El
   Deck y Android tienen cliente. Requiere HTTPS vía Tailscale Serve para que
   la PWA sea instalable.
3. **Caddy + DuckDNS** en la red doméstica: certificado Let's Encrypt
   automático, hostname estable, requiere abrir el 443.
4. **Solo LAN con certificado propio**: viable pero incómodo de instalar en
   Android y en el Deck.

> **Requisito duro:** la PWA necesita un **origen estable y HTTPS** para ser
> instalable, para que el Service Worker persista y para que la Gamepad API
> funcione. Cualquier opción elegida debe cumplir las tres.

---

## 8. Testing

| Nivel | Qué cubre | Herramienta |
|---|---|---|
| Unitario | `@nanonogram/core` completo: reglas, line solver, tachado, undo | Vitest |
| Corpus compartido | Casos JSON que TS y Go deben resolver idénticamente | Vitest + `go test` |
| Propiedad | Generar puzzles aleatorios, resolver, verificar unicidad e invariantes | fast-check |
| Componente | Render de rejilla, capa de input | Vitest + Testing Library |
| E2E | Flujos de juego, offline, sync, instalación PWA | Playwright |
| Rendimiento | FPS y heap en rejillas 50×50 y 100×100 | Playwright traces |
| Manual por hardware | Steam Deck, Android, Windows | Checklist en `05-roadmap` |

El corpus compartido es la pieza crítica: es lo que garantiza que el servidor y
el cliente estén de acuerdo sobre qué es un puzzle válido y qué es un error.
