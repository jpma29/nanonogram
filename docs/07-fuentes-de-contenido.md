# 07 — Fuentes de Contenido

**Investigado y decidido:** 2026-08-06.

Este documento existe porque el plan de contenido original falló por completo, y
la razón por la que falló importa más que el hecho de que fallara.

---

## 1. Qué se creía

`04-modelo-de-datos` §2.4 nombraba `mikix/nonogram-db` como *"la única colección
revisada que declara licencia por puzzle y está pensada para redistribuirse"*.
Era el importador de prioridad 1 de `01-requisitos` RF-BIB-5, y la mitigación
principal del riesgo R3. La Fase 1 exigía ~100 puzzles B/N de licencia limpia
importados de ahí.

Todo eso descansaba sobre un repositorio personal de una sola persona.

## 2. Qué se encontró

### 2.1 `mikix/nonogram-db` ya no existe

404 confirmado con petición sin caché el 2026-08-06. Los índices de búsqueda
todavía lo listan, y una herramienta de fetch con caché de 15 minutos llegó a
devolver una copia vieja del README — lo que produjo un falso positivo durante
la investigación. **Lección operativa: para comprobar si un recurso existe, hay
que forzar una petición fresca y desconfiar de un índice de búsqueda.**

El riesgo R3 se materializó. Ocurrió antes de escribir una línea de UI, que es
exactamente por lo que contar los puzzles era la primera tarea de la Fase 1 y no
la última.

### 2.2 Las alternativas GPL no sirven

Se analizaron dos proyectos vivos con puzzles empaquetados.

**FreeNono** (`prometheus42/FreeNono`, GPL-3.0) — 1 907 puzzles:

| Autor declarado | N | Qué es |
|---|---:|---|
| VonStudio | 1 325 | Puzzles de una app de Google Play |
| Jupiter Co. y **Nintendo Co., Ltd.** | 228 | Mario's Picross, extraídos del cartucho |
| *(sin autor)* | 128 | Duplicados de Mario's Picross |
| Conceptis Puzzles | 73 | Editorial comercial de puzzles |
| Christian Wichmann | 108 | Autor del propio FreeNono |
| Markus Wichmann | 31 | Contribuidor de FreeNono |
| A. S. Meshcheryakov | 4 | De QNonograms (GPL) |

El **92 %** es contenido comercial ajeno redistribuido sin cesión de derechos,
con la autoría de Nintendo escrita en el propio archivo XML.

**Nonny** (`gkikola/nonny`, GPL-3+) — 38 puzzles, todos de Gregory Kikola.

**El dato que zanja el asunto: de los 181 puzzles rescatables por autoría, cero
declaran licencia.** Nonny solo trae `copyright "Copyright 2017 Gregory Kikola"`;
el XML de FreeNono ni siquiera tiene campo para ello. Aplicando la regla
normativa de `04` §2.4 —sin `license`, el puzzle entra como `distributable:
false`— los 181 quedan bloqueados en todas las salidas, incluido el build
embebido.

Aun ignorando la licencia, tampoco daban la talla:

- 155 tienen solución única (36 de nonny, 119 de FreeNono)
- pero **108 son glifos**: Katakana 40, Hiragana 40, Alfabeto 26, Kanji 2
- **solo 47 son imágenes**; 36 llegan a 10×10 y 18 a 15×15
- sin curva: 90 de 155 en dificultad 1

Para un juego cuya recompensa es la ilustración revelada (RF-BIB-4), 47 dibujos
y 108 letras japonesas no son una biblioteca inicial.

### 2.3 Dos cosas que sí se ganaron

- Los parsers de **`.non` extendido** y de **`.nonogram` (XML de FreeNono)**
  funcionan. El primero es el importador de prioridad 1 de RF-BIB-5 y sigue
  siendo válido para cualquier colección futura en ese formato.
- `verifyPuzzle` encontró **22 puzzles con solución múltiple** en ambas
  colecciones "curadas". La validación de RF-BIB-6 se ganó el sueldo antes de
  que existiera la UI.

---

## 3. La decisión: generar los puzzles

Se adelanta la generación desde imagen, que `04` §2.4 ya llamaba *"la ruta más
segura a largo plazo"* y que el roadmap tenía en Fase 5.

### 3.1 La fuente: sets de iconos con licencia limpia

En vez de fotografías o dibujos arbitrarios, la fuente son **sets de iconos
vectoriales de licencia permisiva**. Las siluetas de icono son sólidas,
conectadas y de trazo grueso: binarizan bien y producen nonogramas legibles, que
es exactamente lo que una fotografía no hace.

| Set | Licencia | Iconos |
|---|---|---:|
| **Bootstrap Icons** | MIT | 2 078 |
| Material Design Icons (`@mdi/svg`) | Apache-2.0 | ~7 400 |
| Lucide (`lucide-static`) | ISC | ~1 600 |
| Feather Icons | MIT | ~290 |

Todos están en npm, todos son redistribuibles, y la autoría se conserva en
`author`, `license` y `source` de cada puzzle generado.

Esto resuelve el problema de raíz: el proyecto deja de depender de que un
repositorio ajeno siga existiendo.

### 3.2 El pipeline

```
SVG → rasterizar a 512² → recortar al contenido → cuadrar y centrar
    → reducir por media de área al tamaño objetivo
    → umbralizar → limpiar (quitar píxeles aislados, rellenar huecos de 1 px)
    → medir calidad → verifyPuzzle() → puntuar → elegir
```

**El dithering está descartado a propósito.** Produce ruido de sal y pimienta:
píxeles sueltos que generan pistas largas de unos, hacen el puzzle tedioso de
resolver y la imagen ilegible. Umbral más limpieza morfológica da mejor
resultado en un formato de 15×15.

**Métricas de calidad** por candidato: proporción de relleno, número máximo y
medio de bloques por línea, píxeles aislados, y líneas vacías. Los umbrales
iniciales: relleno entre 25 % y 62 %, cero píxeles aislados, y menos de la mitad
de las líneas vacías.

### 3.3 Resultados medidos del prototipo

Sobre 250 de los 2 078 iconos de Bootstrap, a tamaños 10, 15 y 20:

| | |
|---|---:|
| Candidatos | 741 |
| Con solución única | **572 (77 %)** |
| Que además pasan los umbrales de legibilidad | **264** |
| Iconos distintos representados | 134 |

Extrapolando al set completo: del orden de **2 200 puzzles utilizables**, contra
los ~100 que pide la Fase 1. El cuello de botella deja de ser la cantidad.

### 3.4 Lo que queda por resolver

1. **Distribución de dificultad.** 236 de los 264 salen en nivel 1. En parte es
   real (las siluetas de icono son suaves y se resuelven por líneas), y en parte
   es que `estimateDifficulty` se calibró contra puzzles aleatorios, no contra
   imágenes. Hay que recalibrarlo con este corpus — era la decisión pendiente 6
   del roadmap — y añadir búsqueda de parámetros que *persiga* dificultad, no
   que la acepte.
2. **Deduplicación.** `database-up` y `database-down` producen rejillas casi
   idénticas. Hace falta descartar por similitud de rejilla, no solo por nombre.
3. **Selección final y nombres.** El título no debe destripar la imagen
   (`hide_title` de RF-BIB-3), y hay que decidir qué 100 entran y en qué tres
   packs.

---

## 4. El capturador local (OCR) — y por qué no resuelve la Fase 1

Se planteó un capturador local que reconociera nonogramas por pantalla desde
otras aplicaciones o sitios.

**Es ortogonal al problema de la Fase 1, por construcción.** Todo lo que capture
entra por la ruta de uso personal de `04` §2.5 y se marca obligatoriamente
`distributable: false`. Ese flag bloquea el build con biblioteca embebida — que
es precisamente el artefacto de la Fase 1. Un capturador puede llenar la
instancia privada de su dueño; no puede aportar un solo puzzle a un release.

Por tanto:

- Vive en `tools/personal-import/`, fuera del binario de release, sin aparecer
  en el README público ni en la UI de admin.
- No es un entregable de Fase 1. Encaja como herramienta de Fase 5.
- La responsabilidad de lo que cada quien capture a su instancia es suya. Esto
  no es asesoría legal y las reglas de copia privada varían por jurisdicción.

---

## 5. Consecuencias para los otros documentos

| Documento | Qué cambia |
|---|---|
| `01-requisitos` RF-BIB-5 | `.non` extendido sigue siendo prioridad 1 como *formato*, pero ya no hay una colección de referencia detrás |
| `04-modelo-de-datos` §2.4 | `mikix/nonogram-db` deja de ser la fuente recomendada; la fuente es la generación propia desde iconos de licencia permisiva |
| `05-roadmap` R3 | El riesgo se materializó y se cerró con la mitigación prevista: adelantar la generación |
| `05-roadmap` decisión 5 | Resuelta: la biblioteca inicial se genera, no se cosecha |
| `05-roadmap` decisión 6 | Sigue abierta y ahora es más urgente: calibrar `estimateDifficulty` contra el corpus generado |

---

## 6. Política de contenido, reafirmada

Nada de esto relaja la regla de `04` §2.4. Al contrario, la investigación la
justifica: un proyecto conocido y activo lleva años distribuyendo puzzles de
Nintendo con la autoría escrita en el archivo. La distinción entre *reproducir*
y *distribuir* sigue siendo la que gobierna, el flag `distributable` sigue
bloqueando por código en cada ruta de salida, y un puzzle sin `license`
declarada sigue sin poder entrar en un release.
