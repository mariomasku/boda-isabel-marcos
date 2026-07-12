# Funcionalidad: Distribución de invitados por mesas

> **Propósito**: documentar de forma autocontenida la herramienta de *seating* (asignar
> invitados a mesas) para poder **replicarla en cualquier otra boda** que use esta plantilla.
> Implementada y probada por primera vez en `boda-evaristo-marine`.
>
> Para el resto de la arquitectura del proyecto ver [`NUEVA-BODA-SETUP.md`](./NUEVA-BODA-SETUP.md)
> y [`CONTEXTO.md`](./CONTEXTO.md).

---

## 1. Qué hace

Una página privada **`/mesas`**, accesible desde el panel `/dashboard`, que permite a los novios
organizar el *seating* de la boda:

- **Mesa nupcial** especial, mostrada aparte y destacada arriba del todo. No lleva número; en el
  Sheet se marca como `NUPCIAL`. Se le asignan invitados con el mismo modal que al resto.
- **Mesas de invitados numeradas desde la 1** (numeración automática = mayor número existente + 1),
  con **nombre temático opcional** por mesa (p. ej. "Familia", "Amigos de la uni").
- **Modal de asignación**: los invitados confirmados aparecen como botones-chip que se resaltan en
  `--oro` al seleccionarlos. Un invitado ya sentado en otra mesa **no aparece** en el selector de
  una mesa distinta (no se puede sentar a alguien en dos mesas). Buscador dentro del modal.
- **Tarjetas acordeón** por mesa (estilo `row-card` del dashboard): clic despliega/retrae la lista
  de invitados de esa mesa. Cada tarjeta tiene botones **editar** y **eliminar**.
- **CRUD completo**: crear, editar (renombrar + añadir/quitar invitados) y eliminar (libera a sus
  invitados, que vuelven a estar disponibles).
- **Buscador global** de invitados: al escribir un nombre, dice en qué mesa está cada uno
  (`Mesa N`, `Mesa nupcial` o `Sin asignar`).
- **Bilingüe** (o multiidioma) reutilizando el mismo motor i18n del resto de la web.

---

## 2. Modelo de datos (en el Google Sheet)

Persiste todo en el propio Sheet, sin base de datos nueva, con dos añadidos:

1. **Pestaña `RSVP`, columna nueva `O` = `MESA`** — guarda el identificador de mesa por cada fila
   de invitado: `NUPCIAL` para la mesa nupcial o el número (`1`, `2`, `3`…) para las de invitados.
   Vacío = sin asignar.
2. **Pestaña nueva `MESAS`** — columnas `A = ID` (`NUPCIAL` o número) y `B = NOMBRE`. Una fila por
   mesa, guarda su nombre personalizado. (La columna `MESA` de RSVP solo guarda el identificador;
   el nombre vive aquí.)

**Identificación de cada invitado por número de fila real**: la fila `i` del rango `RSVP!A2:O`
corresponde a la fila real `i + 2` del Sheet. Escribir la mesa de un invitado = escribir su
identificador en `RSVP!O{fila}`. Es estable porque los `append` de nuevos RSVP se añaden al final y
**no desplazan** las filas existentes entre la lectura (GET) y la escritura (POST). El único caso
que rompería los números de fila es un borrado manual de filas en el Sheet; como es una operación
rara y manual, basta con recargar la página (que hace un GET nuevo) tras hacerlo.

**Aislamiento del flujo de RSVP**: el endpoint de mesas es **dueño exclusivo** de la columna `O` y
de la pestaña `MESAS`. **No se toca `api/rsvp.ts` ni `api/stats.ts`**. Esto es seguro porque:
- `rsvp.ts` escribe las columnas A–N (deja `O` intacta) y su `ensureSetup()` reescribe `A1:N1` sin
  borrar la cabecera `O1`.
- `stats.ts` solo lee A2:N; ignora la columna `O`.

---

## 3. Backend — `src/pages/api/mesas.ts`

`export const prerender = false`. Mismo patrón de auth que `rsvp.ts`/`stats.ts` (Service Account
desde `GOOGLE_SERVICE_ACCOUNT_KEY`, `GOOGLE_SHEET_ID`). Un helper `getSheetsClient(readonly)`
devuelve el cliente con scope `spreadsheets.readonly` (GET) o `spreadsheets` (POST).

**`ensureMesasSchema(sheets, id)`** (idempotente, se llama en cada POST):
- Escribe `RSVP!O1 = "MESA"` y le aplica el formato de cabecera del tema (fondo `EUCALIPTO`, texto
  `OLIVA` en negrita) para que quede coherente con el resto de columnas.
- Crea la pestaña `MESAS` si no existe, con cabecera `["ID","NOMBRE"]`.

**`GET`** → `{ ok, guests, mesas, sheetUrl }`:
- `guests`: filas con `ASISTENCIA = Sí` (col E) y con nombre (col B). Cada uno:
  `{ row, nombre, rol, edad, mesa }` (mesa = `"NUPCIAL"`, número como texto, o `null`).
- `mesas`: agrupa los invitados por identificador y une con los nombres de la pestaña `MESAS`:
  `[{ id, esNupcial, nombre, personas: [...] }]`. Orden: nupcial primero, luego numéricas ascendentes.
- `Cache-Control: no-store`.

**`POST`** con `{ action, ... }`:
- `action: "save"` (crea **y** edita): `{ id, nombre, rows: number[] }` donde `id` es un número o el
  literal `"NUPCIAL"`.
  - Lee la columna `O` actual; **limpia** `O` en las filas que tenían ese `id` pero ya no están en
    `rows` (así al deseleccionar un invitado se libera).
  - Escribe `id` en `O{row}` para cada fila de `rows` (con `values.batchUpdate`).
  - Upsert de `{id, nombre}` en la pestaña `MESAS`.
- `action: "delete"`: `{ id }` → limpia `O` en todas las filas con ese identificador y borra su fila
  de `MESAS` (`deleteDimension`).
- Errores → mensaje genérico al cliente, detalle solo en logs (igual criterio que `rsvp.ts`).

`normalizeId()` valida que el id sea `NUPCIAL` o un entero positivo, para no escribir basura en el Sheet.

---

## 4. Frontend — `src/pages/mesas.astro`

`prerender = true`, `noindex`, mismas fuentes/estilos y **mismo guard de auth** que `dashboard.astro`
(`sessionStorage.getItem('boda_auth') !== '<token>'` → redirect a `/`). Reutiliza `global.css`,
`LanguageSwitcher` y el motor i18n (`../i18n/apply`: `t`, `tn`, `getCurrentLang`).

Estructura de la página:
1. **Buscador global** (`#global-search`) que filtra `guests` en vivo y muestra la mesa de cada uno.
2. **Sección mesa nupcial** (`#nupcial-section`): botón "Crear mesa nupcial" si no existe, o su
   tarjeta destacada (clase `.mesa-card.nupcial`, con más acento `--oro`) si existe.
3. **Sección mesas numeradas** (`#mesa-list`) + botón "Crear mesa".

**Tarjeta acordeón** (`mesaCardHtml`): cabecera con chevron (rota al abrir), título
(`Mesa N · Nombre` o "Mesa nupcial"), contador de personas, e iconos editar/eliminar; cuerpo
`.mesa-people` oculto que se muestra con la clase `.open`. El estado abierto/cerrado se guarda en un
`Set<string> expanded` para que persista entre repintados.

**Modal de selección** (`.sel-overlay`, patrón del modal del dashboard):
- Campo de nombre (la nupcial pre-rellena su nombre por defecto), buscador interno, y los invitados
  como `.guest-btn` (chips). `.guest-btn.selected` → fondo `--oro`.
- Disponibles = invitados sin mesa **+** los que ya están en la mesa que se edita (para poder
  quitarlos). Selección inicial = filas ya sentadas en esa mesa.
- `nextTableId()` calcula el número de una mesa nueva (`max(numéricas) + 1`).
- Guardar → `POST save` con `{ id, nombre, rows: [...filas seleccionadas] }` → recarga y repinta.

Toda la interacción con las tarjetas (acordeón, editar, eliminar) se hace por **delegación de
eventos** sobre `#m-content`, porque las tarjetas se regeneran con `innerHTML` en cada render.
Un listener de `langchange` repinta con los datos ya cargados al cambiar de idioma.

---

## 5. Acceso desde el dashboard — `src/pages/dashboard.astro`

Una sección al principio de `#dash-content` con un botón CTA a `/mesas` (reutiliza la clase
`.sheet-link` del propio dashboard, con un icono de comensal). Claves i18n
`dashboard.sectionMesas` y `dashboard.verMesas`.

---

## 6. i18n — `src/i18n/translations.ts`

Sección nueva `mesas: { ... }` en cada idioma (título, buscador, crear/editar/eliminar, guardar,
nombre de mesa, `nupcialName`, `sectionTables`, "sin asignar", contadores `{n} persona(s)` y
`{n} seleccionados`, confirmación de borrado con marcador `{name}`, `ninoTag`, errores). Además
`dashboard.sectionMesas` y `dashboard.verMesas` para el acceso. Todos los textos generados por JS
pasan por `t()`/`tn()` (nada de strings fijos), igual que el resto de la web multiidioma.

> Nota FR: "mesa nupcial" se traduce como **"Table d'honneur"** (término estándar en francés).

---

## 7. Cómo replicarlo en una boda nueva

Es una feature **aislada y portable**. Para añadirla a otra boda con esta plantilla:

1. Copiar `src/pages/api/mesas.ts` tal cual (no depende de datos de la boda; usa las mismas variables
   de entorno).
2. Copiar `src/pages/mesas.astro`. Ajustar solo el **token de auth** del guard para que coincida con
   el de esa boda (`sessionStorage 'boda_auth'`, ver §6 de `NUEVA-BODA-SETUP.md`) y el nombre de la
   pareja del header.
3. Copiar la sección `mesas` de `translations.ts` (a todos los idiomas de esa boda) y las dos claves
   `dashboard.sectionMesas` / `dashboard.verMesas`.
4. Añadir en `dashboard.astro` la sección de acceso a `/mesas`.
5. Nada que tocar en el Google Sheet: la columna `MESA` y la pestaña `MESAS` se crean solas la
   primera vez que se guarda una mesa (`ensureMesasSchema`).

**Dependencias de la plantilla que deben existir** (ya están en el proyecto base): el motor i18n
(`i18n/apply.ts` con `t`/`tn`/`getCurrentLang`), `LanguageSwitcher.astro`, la paleta de `global.css`
(`--oro`, `--eucalipto`, `--salvia`, `--marfil`, `--blanco`…), y el patrón de auth por
`sessionStorage` del dashboard.

---

## 8. Verificación (cómo probarlo)

1. `npx astro build` sin errores.
2. Local + Playwright, inyectando `sessionStorage.boda_auth` antes de navegar (`addInitScript`):
   crear la mesa nupcial y varias numeradas, comprobar el resaltado `--oro`, el acordeón, el buscador
   global, editar (renombrar + añadir/quitar, verificando que al deseleccionar se libera la columna
   `O`), eliminar, y que un invitado ya asignado no reaparezca en el selector de otra mesa. Probar en
   móvil (390) y escritorio, y en todos los idiomas.
3. Se puede validar el backend directamente con `curl` a `/api/mesas` (`GET`, y `POST` con
   `action:"save"`/`"delete"`), comprobando en el Sheet la columna `O` y la pestaña `MESAS`.

> Las asignaciones son **no destructivas**: para dejar el Sheet limpio tras las pruebas basta con
> eliminar las mesas creadas (vacía la columna `O` y borra las filas de `MESAS`); los datos reales de
> los invitados (columnas A–N) no se tocan en ningún momento.

---

## 9. Ficheros

| Fichero | Cambio |
|---|---|
| `src/pages/api/mesas.ts` | **Nuevo** — endpoints GET/POST + `ensureMesasSchema` |
| `src/pages/mesas.astro` | **Nuevo** — página (UI + script cliente) |
| `src/i18n/translations.ts` | Sección `mesas` (todos los idiomas) + `dashboard.sectionMesas`/`verMesas` |
| `src/pages/dashboard.astro` | Sección de acceso a `/mesas` |
| `api/rsvp.ts`, `api/stats.ts` | **Sin cambios** (feature aislada) |
