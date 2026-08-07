# 04 — Modelo de Datos, Formatos y API

---

## 1. Formato canónico de puzzle

JSON, inspirado en el formato PBN de webpbn pero pensado para indexar en base de
datos y versionar en git. Es el formato interno y el de exportación.

```json
{
  "schema": "nanonogram.puzzle/1",
  "id": "01J8ZQ3K7M4N5P6R7S8T9V0W1X",
  "title": "Gato",
  "hide_title": false,
  "author": "Jane Doe",
  "source": "mikix/nonogram-db",
  "source_id": "cat-01",
  "license": "CC0-1.0",
  "copyright": null,
  "width": 15,
  "height": 15,
  "palette": [
    { "key": ".", "name": "white", "hex": "ffffff", "background": true },
    { "key": "X", "name": "black", "hex": "000000" }
  ],
  "clues": {
    "rows": [
      [{ "count": 3, "color": "X" }],
      [{ "count": 1, "color": "X" }, { "count": 1, "color": "X" }]
    ],
    "cols": [
      [{ "count": 2, "color": "X" }]
    ]
  },
  "solution": [
    "..XXX..........",
    ".X...X........."
  ],
  "difficulty": 3,
  "verified": true,
  "unique": true,
  "published": true,
  "distributable": true,
  "content_flags": [],
  "created_at": "2026-08-06T10:00:00Z"
}
```

### Notas

- **`id`**: ULID. Ordenable por tiempo y sin colisiones entre instancias, lo que
  simplifica la importación cruzada.
- **`palette`**: siempre presente, incluso en B/N. Exactamente una entrada con
  `background: true`. `key` es un carácter único usado en `solution`.
- **`clues`**: se almacenan explícitamente aunque sean derivables de
  `solution`, porque los formatos de origen pueden traerlas y porque validarlas
  contra la solución es una comprobación de integridad barata.
- **`solution`**: array de strings, una por fila, con los `key` de la paleta.
  Compacto y legible en diffs de git.
- **`verified`** y **`unique`**: los pone el solver al importar (en el MVP, el
  script de build). `verified: false` deja el puzzle **despublicado**: solo lo ve
  el admin, en su bandeja de importación, hasta que decida publicarlo.
  `unique: false` significa que hay más de una solución válida; si el admin lo
  publica igual, es jugable, pero con el error checking desactivado y sin poder
  otorgar récord ni corona. Ver `01-requisitos` RF-BIB-6, que es la referencia
  normativa de esta regla.
- **`content_flags`**: array de etiquetas (`nsfw`, `violence`) para filtrado
  opcional; heredado de fuentes que las traen.
- **`license`** es obligatorio para publicar en una biblioteca compartida. Si la
  fuente no lo declara, se guarda `null` y el puzzle se importa como privado.
- **`distributable`**: si es `false`, el puzzle es jugable en la instancia pero
  **no sale de ella por ninguna ruta**. Ver §2.5.

---

## 2. Formatos de importación

### 2.1 Comparativa y recomendación

| Formato | Extensión | Color | Metadatos | Licencia de los datos | Prioridad |
|---|---|---|---|---|---|
| **`.non` extendido (mikix)** | `.non` | Sí | `title`, `by`, `copyright`, `license`, `goal`, `catalogue` | **Limpia** — la colección `mikix/nonogram-db` está curada explícitamente para ser redistribuible | **1ª** |
| **PBN XML (webpbn)** | `.xml` | Sí, con paleta | `source`, `id`, `title`, `author`, `copyright`, `description` | Puzzles con copyright de sus autores; export individual para uso personal, **no redistribución** | **2ª** |
| **JSON canónico** | `.json` | Sí | Todos | La que traiga | **1ª** |
| `.non` clásico (Steve Simpson) | `.non` | No | `title`, `by`, `copyright` | Formato abierto; los puzzles dependen del autor | 3ª |
| ipuz | `.ipuz` | Sí | Sí | Estándar abierto | 4ª, opcional |

### 2.2 Ejemplo `.non`

```
catalogue "MYPACK-001"
title "Heart"
by "Steve Simpson"
copyright "Public Domain"
license "CC0-1.0"
width 5
height 5
rows
0
1,1
5
1,1
0
columns
0
3
5
3
0
```

Reglas del parser: `width`/`height` obligatorios y únicos; `rows` seguido de
exactamente `height` líneas, `columns` de exactamente `width`; una línea vacía
se representa con `0`; valores con espacios van entre comillas; entidades HTML
(`&eacute;`) se decodifican.

### 2.3 Ejemplo PBN XML

```xml
<?xml version="1.0"?>
<puzzleset>
  <puzzle type="grid" defaultcolor="black">
    <title>Sample Puzzle</title>
    <author>Jan Wolter</author>
    <color name="black" char="X">000</color>
    <clues type="rows">
      <line><count>2</count></line>
    </clues>
    <solution type="goal">
      <image>|XX..|</image>
    </solution>
  </puzzle>
</puzzleset>
```

### 2.4 Política de contenido y licencias

Esta sección es normativa, no informativa.

- **Fuente recomendada:** `mikix/nonogram-db` (https://github.com/mikix/nonogram-db)
  — es la única colección revisada que declara licencia por puzzle y está
  pensada para redistribuirse.
- **webpbn.com**: los puzzles pertenecen a sus autores. El propio sitio indica
  que exportarlos para uso personal está bien, pero que redistribuirlos a otros
  archivos sin permiso del autor no lo está. **La app soporta el formato PBN
  como importador**, para que el usuario importe puzzles que él mismo exportó
  legítimamente. **No se distribuye contenido de webpbn con la app.**
- **nonograms.org / `Dorifor/nonograms-archive`**: ~60 000 puzzles obtenidos por
  scraping y reverse engineering del sitio, sin licencia declarada. **No se
  incluye en ningún release ni se soporta como importador oficial.** Existe una
  ruta de uso estrictamente personal, definida en §2.5.
- **`tsionyx/pynogram`** (Apache-2.0) y **`thomasr/nonogram-solver`**
  (Apache-2.0): son *solvers*, útiles como referencia de algoritmo y como
  oráculo para el corpus de tests. No son fuentes de contenido.
- **La ruta más segura a largo plazo** es la generación desde imágenes propias
  del usuario (Fase 5), que elimina el problema de copyright.

Cada puzzle importado conserva `source`, `source_id`, `author`, `copyright` y
`license`. La app nunca borra esa procedencia.

### 2.5 Importación de uso personal (contenido no distribuible)

La distinción que gobierna esta sección no es *reproducir* sino **distribuir**.
Una copia privada de puzzles de terceros, en el hardware del propio usuario y sin
salir de él, es un caso distinto de publicar una instancia o un release que los
contenga. Este proyecto permite lo primero y bloquea lo segundo **por código**,
no por convención.

> Esto no es asesoría legal. La responsabilidad de lo que cada quien importe a su
> instancia es suya, y las reglas de copia privada varían por jurisdicción.

**Mecanismo:**

1. El importador de formatos sin licencia limpia (`.nono` de
   `Dorifor/nonograms-archive`, y cualquier otro que se añada después) vive en
   `tools/personal-import/`, **fuera del binario `nanonogram`**. No se compila en
   el release, no se documenta en el README público y no aparece en la UI de
   admin.
2. Todo puzzle que entra por esa ruta se marca obligatoriamente con
   `distributable: false`, `license: null` y el `source` real. El importador no
   permite sobrescribir ese flag.
3. El flag `distributable = false` **bloquea todas las rutas de salida**:

   | Ruta | Comportamiento |
   |---|---|
   | `GET /puzzles/bundle` | Excluido para cualquier usuario que no sea el propietario de la instancia |
   | `GET /puzzles`, `GET /puzzles/{id}` | Servido con normalidad — es jugable |
   | Export de datos de usuario (RF-USR-4) | Se exporta el progreso, **no** la definición del puzzle |
   | Export JSON de biblioteca | Excluido |
   | Build con biblioteca embebida | Excluido; el build falla si se intenta incluir uno |
   | Imagen Docker publicada | Excluido |

4. En la UI de admin estos puzzles se listan con una etiqueta **"solo esta
   instancia"**, para que la procedencia siga siendo visible dentro de dos años.

**Uso responsable de la fuente:** el archivo de Dorifor ya está publicado, así
que no hace falta volver a scrapear nonograms.org. Si alguna vez hiciera falta,
con rate limiting y respetando `robots.txt`.

---

## 3. Esquema de base de datos (SQLite)

```sql
CREATE TABLE users (
  id            TEXT PRIMARY KEY,          -- ULID
  username      TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,             -- Argon2id
  is_admin      INTEGER NOT NULL DEFAULT 0,
  is_active     INTEGER NOT NULL DEFAULT 1,
  created_at    TEXT NOT NULL
);

CREATE TABLE sessions (
  token_hash TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  device_id  TEXT,
  device_name TEXT,
  created_at TEXT NOT NULL,
  last_used  TEXT NOT NULL,
  expires_at TEXT NOT NULL
);

CREATE TABLE puzzles (
  id            TEXT PRIMARY KEY,          -- ULID
  title         TEXT,
  hide_title    INTEGER NOT NULL DEFAULT 0,
  author        TEXT,
  source        TEXT,
  source_id     TEXT,
  license       TEXT,
  copyright     TEXT,
  width         INTEGER NOT NULL CHECK (width  BETWEEN 1 AND 100),
  height        INTEGER NOT NULL CHECK (height BETWEEN 1 AND 100),
  is_color      INTEGER NOT NULL DEFAULT 0,
  palette_json  TEXT NOT NULL,
  clues_json    TEXT NOT NULL,
  solution_json TEXT NOT NULL,
  difficulty    INTEGER,                   -- 1..5
  verified      INTEGER NOT NULL DEFAULT 0,
  unique_sol    INTEGER,
  published     INTEGER NOT NULL DEFAULT 0,   -- visible para jugadores
  distributable INTEGER NOT NULL DEFAULT 1,   -- 0 = nunca sale de esta instancia
  reject_reason TEXT,                          -- motivo si verified = 0
  content_flags TEXT NOT NULL DEFAULT '[]',
  created_at    TEXT NOT NULL,
  UNIQUE (source, source_id)
);
CREATE INDEX idx_puzzles_size  ON puzzles(width, height);
CREATE INDEX idx_puzzles_diff  ON puzzles(difficulty);
CREATE INDEX idx_puzzles_color ON puzzles(is_color);

CREATE TABLE packs (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  description TEXT,
  cover_puzzle_id TEXT REFERENCES puzzles(id) ON DELETE SET NULL,
  created_at  TEXT NOT NULL
);

CREATE TABLE pack_puzzles (
  pack_id   TEXT NOT NULL REFERENCES packs(id) ON DELETE CASCADE,
  puzzle_id TEXT NOT NULL REFERENCES puzzles(id) ON DELETE CASCADE,
  position  INTEGER NOT NULL,
  PRIMARY KEY (pack_id, puzzle_id)
);

-- Partida en curso. Una por usuario y puzzle.
CREATE TABLE progress (
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  puzzle_id   TEXT NOT NULL REFERENCES puzzles(id) ON DELETE CASCADE,
  mode        TEXT NOT NULL,              -- 'casual' | 'hardcore'
  grid_rle    TEXT NOT NULL,              -- estado comprimido, ver §4
  elapsed_ms  INTEGER NOT NULL DEFAULT 0,   -- tiempo ACTIVO, sin pausas
  penalty_ms  INTEGER NOT NULL DEFAULT 0,
  errors      INTEGER NOT NULL DEFAULT 0,
  checks_used INTEGER NOT NULL DEFAULT 0,
  updated_at  TEXT NOT NULL,
  device_id   TEXT,
  PRIMARY KEY (user_id, puzzle_id)
);

-- Resultado consolidado. Una por usuario y puzzle.
CREATE TABLE records (
  user_id        TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  puzzle_id      TEXT NOT NULL REFERENCES puzzles(id) ON DELETE CASCADE,
  best_ms        INTEGER,                 -- solo modo hardcore
  has_crown      INTEGER NOT NULL DEFAULT 0,
  times_solved   INTEGER NOT NULL DEFAULT 0,
  first_solved_at TEXT,
  updated_at     TEXT NOT NULL,
  PRIMARY KEY (user_id, puzzle_id)
);

CREATE TABLE settings (
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  key        TEXT NOT NULL,
  value_json TEXT NOT NULL,
  scope      TEXT NOT NULL DEFAULT 'account',  -- 'account' | 'device'
  device_id  TEXT,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (user_id, key, scope, device_id)
);

-- Log de cambios para sync incremental.
CREATE TABLE change_log (
  seq        INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    TEXT NOT NULL,
  entity     TEXT NOT NULL,               -- 'progress' | 'record' | 'setting'
  entity_key TEXT NOT NULL,
  op         TEXT NOT NULL,               -- 'upsert' | 'delete'
  payload    TEXT NOT NULL,
  device_id  TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX idx_changelog_user ON change_log(user_id, seq);
```

`change_log` es lo que hace posible el sync incremental por cursor: el cliente
guarda el último `seq` recibido y pide solo lo posterior.

---

## 4. Codificación del estado de la rejilla

El estado se transmite y almacena como **RLE sobre una cadena base**, no como
matriz JSON. Para una rejilla 50×50 en JSON crudo serían ~15 KB; en RLE típico,
menos de 500 bytes.

Alfabeto: `.` vacío, `#` rellena (B/N), `x` X, `?` punto. En color, la celda
rellena usa el `key` de la paleta.

Codificación: recorrido en orden de filas, `<repeticiones><símbolo>` cuando hay
más de una repetición.

```
"12.3#5x.2?..."
```

Formato completo del campo `grid_rle`:

```
v1:50x50:12.3#5x.2?...
```

La pila de undo **no se sincroniza al servidor**; es local al dispositivo. Lo
que se sincroniza es el estado resultante.

---

## 5. API REST

Base: `/api/v1`. Todo JSON. Autenticación por cookie de sesión o
`Authorization: Bearer <token>`.

### 5.1 Autenticación

| Método | Ruta | Descripción |
|---|---|---|
| `POST` | `/auth/register` | Solo si el registro está abierto o no hay usuarios |
| `POST` | `/auth/login` | `{username, password, device_id, device_name}` → token |
| `POST` | `/auth/logout` | Invalida la sesión actual |
| `GET`  | `/auth/me` | Usuario actual + flag de admin |
| `GET`  | `/auth/sessions` | Lista de dispositivos con sesión activa |
| `DELETE` | `/auth/sessions/{id}` | Cerrar sesión de otro dispositivo |

### 5.2 Biblioteca

| Método | Ruta | Descripción |
|---|---|---|
| `GET` | `/puzzles` | Lista paginada. Filtros: `pack`, `min_size`, `max_size`, `color`, `difficulty`, `state`, `q`. Devuelve metadatos **sin `solution`** |
| `GET` | `/puzzles/{id}` | Puzzle completo, **con `solution`** (necesaria para el error checking offline) |
| `GET` | `/puzzles/bundle` | Descarga masiva para caché offline. Params: `pack`, `since`. Respuesta NDJSON en streaming. **Excluye los puzzles con `distributable = 0`** salvo para el propietario de la instancia (ver §2.5) |
| `GET` | `/packs` | Lista de packs con conteos |
| `GET` | `/packs/{id}` | Pack con sus puzzles en orden |

### 5.3 Sincronización

| Método | Ruta | Descripción |
|---|---|---|
| `POST` | `/sync` | Push + pull en una llamada |
| `GET` | `/sync/cursor` | `seq` actual del servidor |

**Request de `/sync`:**

```json
{
  "cursor": 1842,
  "device_id": "dev_01J8...",
  "mutations": [
    {
      "id": "mut_01J8...",
      "entity": "progress",
      "key": "01J8ZQ3K7M4N5P6R7S8T9V0W1X",
      "op": "upsert",
      "client_ts": "2026-08-06T14:03:11Z",
      "payload": {
        "mode": "hardcore",
        "grid_rle": "v1:15x15:12.3#5x...",
        "elapsed_ms": 421000,
        "penalty_ms": 30000,
        "errors": 1,
        "checks_used": 0
      }
    }
  ]
}
```

**Response:**

```json
{
  "cursor": 1851,
  "applied": ["mut_01J8..."],
  "rejected": [],
  "changes": [
    {
      "seq": 1849,
      "entity": "record",
      "key": "01J8ZQ...",
      "op": "upsert",
      "payload": { "best_ms": 398000, "has_crown": true, "times_solved": 2 },
      "device_id": "dev_01J8OTRO..."
    }
  ]
}
```

Las mutaciones son **idempotentes por `id`**: reenviar un lote tras un timeout
no duplica nada. El cliente aplica las reglas de conflicto de
`01-requisitos` RF-SYNC-4 sobre `changes` antes de escribir en IndexedDB.

### 5.4 Administración

| Método | Ruta | Descripción |
|---|---|---|
| `POST` | `/admin/puzzles/import` | Multipart. Params: `format` (`non`\|`pbn`\|`json`), `pack_id`, `validate`. Devuelve un `job_id` |
| `GET` | `/admin/jobs/{id}` | Estado del import: procesados, válidos, rechazados con motivo |
| `GET` | `/admin/puzzles/pending` | Bandeja de puzzles con `verified = 0`, con `reject_reason` |
| `PATCH` | `/admin/puzzles/{id}` | Publicar/despublicar, editar metadatos |
| `DELETE` | `/admin/puzzles/{id}` | Borra el puzzle y su progreso asociado |
| `POST` | `/admin/packs` | Crear pack |
| `PATCH` | `/admin/packs/{id}` | Editar pack y reordenar puzzles |
| `GET` | `/admin/users` | Listar usuarios |
| `POST` | `/admin/users` | Crear usuario |
| `PATCH` | `/admin/users/{id}` | Activar/desactivar, cambiar rol |

### 5.5 Convenciones

- Errores con `application/problem+json` (RFC 9457):
  `{ "type", "title", "status", "detail", "instance" }`.
- Paginación por cursor: `?limit=50&after=<id>`, respuesta con `next`.
- `ETag` + `If-None-Match` en `/puzzles/{id}` y `/packs`: las definiciones son
  inmutables, así que el 304 es la respuesta normal.
- Versionado en la ruta. Un cambio incompatible es `/api/v2`, y el servidor
  mantiene v1 al menos una versión mayor.

---

## 6. Almacenamiento del cliente

Ver `02-arquitectura-tecnica` §4.1 para los object stores de IndexedDB. Puntos
que atan con este documento:

- Los puzzles se guardan en el cliente **con su solución**, en el mismo formato
  canónico de §1, para que el error checking funcione offline.
- `progress` local guarda además la pila de undo, que nunca sale del
  dispositivo.
- `syncQueue` contiene mutaciones con la forma exacta de §5.3, listas para
  enviar sin transformación.
- El cursor de sync vive en el store `meta`.
