# Funcionalidad: Email del invitado + comprobación de duplicados en el RSVP

> **Propósito**: documentar de forma autocontenida el campo de correo electrónico del formulario
> RSVP y su comprobación anti-duplicados, para poder **replicarla en cualquier otra boda** que use
> esta plantilla. Implementada y probada por primera vez en `boda-evaristo-marine`.
>
> Para el resto de la arquitectura del proyecto ver [`NUEVA-BODA-SETUP.md`](./NUEVA-BODA-SETUP.md)
> y [`CONTEXTO.md`](./CONTEXTO.md). Para la funcionalidad de mesas (con la que esta comparte la
> pestaña `RSVP`) ver [`FUNCIONALIDAD-MESAS.md`](./FUNCIONALIDAD-MESAS.md).

---

## 1. Qué hace

Añade un campo **"Correo electrónico"** al final del formulario de RSVP (`src/components/RSVP.astro`),
visible siempre (fuera del bloque condicional de "asistes = Sí"), obligatorio y de `type="email"`.

Antes de guardar cualquier confirmación, el backend comprueba si ese correo **ya existe** en la
pestaña `RSVP` (comparación sin distinguir mayúsculas/minúsculas ni espacios). Si ya está
registrado, la API responde `409` y el formulario muestra, bajo el campo de email, el mensaje:

> "Ese correo ya ha sido registrado como invitado."

sin llegar a escribir nada en el Sheet. Así se evita que un mismo invitado envíe el formulario dos
veces por error (o de forma malintencionada) generando filas duplicadas.

---

## 2. Modelo de datos (en el Google Sheet)

**Pestaña `RSVP`, columna nueva `EMAIL`** — guarda el correo del invitado principal de cada envío
(no se repite en las filas de acompañante/niños, que no tienen campo de email propio).

**Columna elegida: depende de si la boda ya tiene la funcionalidad de mesas instalada**
(ver [`FUNCIONALIDAD-MESAS.md`](./FUNCIONALIDAD-MESAS.md)):

- **Si la boda NO tiene `/mesas`** (columna `O` libre): lo más simple es añadir `'EMAIL'` como un
  elemento más del array `HEADERS` en `src/pages/api/rsvp.ts` (columna `O`, la 15ª). No hace falta
  gestionarla aparte: se escribe igual que el resto de columnas, dentro del mismo `rows.push([...])`.
- **Si la boda SÍ tiene `/mesas`** (columna `O` ya ocupada por `MESA`): **no se puede** meter EMAIL
  dentro de `HEADERS` sin desplazar esa columna y perder las asignaciones de mesa ya guardadas. En
  ese caso EMAIL se gestiona **aparte**, en la columna `P`, exactamente igual que `mesas.ts` gestiona
  `MESA` en la `O`: cabecera propia, escritura dirigida a una celda concreta tras el `append`, sin
  tocar `HEADERS`. Es el caso de `boda-evaristo-marine` (implementación de referencia).

**Aislamiento**: si EMAIL va en columna aparte (caso con mesas), el endpoint de RSVP es dueño
exclusivo de esa columna igual que `mesas.ts` lo es de la suya — no hay que tocar `api/mesas.ts` ni
`api/stats.ts`.

---

## 3. Backend — `src/pages/api/rsvp.ts`

**Caso "columna aparte" (con `/mesas` ya instalado)**:

```ts
const EMAIL_COL    = 'P';
const EMAIL_HEADER = 'EMAIL';
// Nº total de columnas de RSVP incluyendo MESA (O) y EMAIL (P), para colorear
// filas y autoajustar anchos hasta la última columna real.
const RSVP_TOTAL_COLS = 16;
```

- **`ensureSetup()`** (idempotente, se llama en cada POST): además de reescribir `HEADERS` en
  `A1:N1`, escribe `RSVP!P1 = "EMAIL"` y le aplica el mismo formato de cabecera del tema (fondo
  `EUCALIPTO`, texto `OLIVA` en negrita) para que quede coherente con el resto.
- **Comprobación de duplicado** (antes de construir las filas a insertar): lee
  `RSVP!{EMAIL_COL}2:{EMAIL_COL}` completo, normaliza cada valor (`trim().toLowerCase()`) y compara
  contra el email recibido normalizado igual. Si hay coincidencia, responde:
  ```ts
  { ok: false, code: 'DUPLICATE_EMAIL', error: 'Ese correo ya ha sido registrado como invitado.' }
  ```
  con status **409**, sin llegar a tocar `sheets.spreadsheets.values.append`.
- **Escritura del email**: las filas del `rows.push([...])` (invitado/acompañante/niños) **no**
  incluyen el email — siguen teniendo el mismo nº de columnas que `HEADERS` (A→N), para que el
  `values.append` a `RSVP!A1` no escriba nada en `O` (MESA) ni en `P`. Justo después del `append`,
  cuando ya se conoce la fila real donde aterrizó el invitado principal (`startRow`), se hace un
  `values.update` dirigido:
  ```ts
  if (email) {
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `${RSVP_TAB}!${EMAIL_COL}${startRow + 1}`,
      valueInputOption: 'USER_ENTERED',
      requestBody: { values: [[email]] },
    });
  }
  ```
- **Coloreado de filas** (`colorReqs`) y **autoajuste de ancho** (`autoResizeColumns`): ambos usan
  `RSVP_TOTAL_COLS` (no `HEADERS.length`) como límite de columna, para que el color de fila y el
  autoajuste lleguen hasta la `P` (incluyendo `MESA` y `EMAIL`), no solo hasta las columnas de
  `HEADERS`. El autoajuste (`autoResizeDimensions`) ya garantiza por sí mismo que el ancho de cada
  columna sea **como mínimo el de su cabecera** y **crezca si el contenido es más largo** — no hace
  falta fijar anchos mínimos a mano.

**Caso "dentro de HEADERS" (sin `/mesas`)**: mismo patrón de comprobación de duplicado (leer la
columna, comparar normalizado, `409` si coincide), pero el email se añade directamente al
`rows.push([...])` del invitado principal (los de acompañante/niños llevan `''`), y `RSVP_TOTAL_COLS`
puede ser simplemente `HEADERS.length`.

---

## 4. Frontend — `src/components/RSVP.astro`

- Campo nuevo, **fuera** del bloque `#extras-si` (así se pide siempre, asista o no el invitado):
  ```html
  <div class="form-group">
    <label for="email" data-i18n="rsvp.emailLabel">Correo electrónico *</label>
    <input type="email" id="email" name="email" required placeholder="tucorreo@ejemplo.com" data-i18n-placeholder="rsvp.emailPlaceholder" />
    <p class="email-error" id="email-error" data-i18n="rsvp.emailDuplicateError">Ese correo ya ha sido registrado como invitado.</p>
  </div>
  ```
  colocado justo antes del botón "Enviar confirmación". Estilo `.email-error` calcado de
  `.intol-error` (oculto por defecto, rojo, se muestra con `display:block`).
- **JS de envío**: al recibir la respuesta de `/api/rsvp`, si `res.status === 409` (o
  `json.code === 'DUPLICATE_EMAIL'`), se muestra `#email-error` con scroll suave hasta él, **sin**
  lanzar el mensaje de error genérico (`#form-error`) ni el modal de éxito. El error se oculta de
  nuevo al escribir en el campo (`input` listener) o al reiniciar el formulario tras un envío
  correcto.

---

## 5. i18n — `src/i18n/translations.ts`

Tres claves nuevas en `rsvp.*` de cada idioma:

| Clave | ES | FR |
|---|---|---|
| `emailLabel` | `Correo electrónico *` | `Adresse e-mail *` |
| `emailPlaceholder` | `tucorreo@ejemplo.com` | `tonemail@exemple.com` |
| `emailDuplicateError` | `Ese correo ya ha sido registrado como invitado.` | `Cet e-mail a déjà été enregistré comme invité.` |

---

## 6. Cómo replicarlo en una boda nueva

1. **Decidir primero si esa boda tiene `/mesas` instalado** (ver §2): eso determina si EMAIL va
   dentro de `HEADERS` (columna `O`) o aparte en columna `P`.
2. Copiar en `src/pages/api/rsvp.ts`:
   - Las constantes `EMAIL_COL`/`EMAIL_HEADER` (o añadir `'EMAIL'` a `HEADERS`, según el caso).
   - El bloque de escritura de cabecera `P1` en `ensureSetup()` (solo si va aparte).
   - La comprobación de duplicado antes de construir `rows`.
   - La escritura dirigida del email tras el `append` (solo si va aparte).
   - Actualizar `RSVP_TOTAL_COLS` (o el límite de columna usado en `colorReqs`/`autoResizeColumns`)
     para que cubra la última columna real de esa boda.
3. Copiar en `src/components/RSVP.astro` el `form-group` del email (fuera de `#extras-si`) y la
   lógica JS del 409 en el listener de `submit`.
4. Copiar las 3 claves de `rsvp.*` en `translations.ts`, traducidas a todos los idiomas de esa boda.
5. Nada que preparar a mano en el Google Sheet: la cabecera se crea sola en el primer envío
   (`ensureSetup()`).

**Dependencias que deben existir**: el motor i18n (`i18n/apply.ts`), y si esa boda tiene `/mesas`,
tener claro qué columna ocupa `MESA` antes de decidir dónde va `EMAIL` (para no chocar).

---

## 7. Verificación (cómo probarlo)

1. `npx astro build` sin errores.
2. En local (`npx astro dev --background`), contra el Sheet real de esa boda (no suele haber uno de
   pruebas separado):
   - Enviar un RSVP con un email de prueba reconocible (p. ej. `test.claude.borrar@...`) y comprobar
     `{ ok: true }` y que aparece en la fila correspondiente, columna EMAIL.
   - Reenviar **el mismo email** (probar también con mayúsculas distintas) y comprobar `409` +
     `code: 'DUPLICATE_EMAIL'`, y que el formulario muestra el mensaje bajo el campo sin crear una
     fila nueva.
   - Si la boda tiene `/mesas`, comprobar que `GET /api/mesas` sigue devolviendo los datos igual que
     antes (la columna `MESA` no se ha visto afectada).
   - Revisar en el propio Sheet que el color de fila y el ancho de columna llegan hasta la última
     columna real (`MESA`/`EMAIL` incluidas), no solo hasta las columnas de `HEADERS`.
3. Borrar las filas de prueba del Sheet real antes de entregar (no son destructivas: solo hay que
   eliminar esas filas, el resto de invitados no se toca).

---

## 8. Ficheros

| Fichero | Cambio |
|---|---|
| `src/pages/api/rsvp.ts` | Constantes `EMAIL_COL`/`EMAIL_HEADER`/`RSVP_TOTAL_COLS`, cabecera `P1`, comprobación de duplicado, escritura dirigida del email, coloreado/autoajuste ampliados hasta `P` |
| `src/components/RSVP.astro` | Campo `email` (fuera de `#extras-si`), mensaje `#email-error`, manejo del `409` en el submit |
| `src/i18n/translations.ts` | Claves `rsvp.emailLabel` / `rsvp.emailPlaceholder` / `rsvp.emailDuplicateError` (todos los idiomas) |
| `api/mesas.ts`, `api/stats.ts` | **Sin cambios** (feature aislada de la columna `MESA`) |
