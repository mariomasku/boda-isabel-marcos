# Contexto del proyecto — Boda Isabel & Marcos

> Documento de referencia para retomar el trabajo en cualquier momento.
> Actualizado: julio 2026

---

## 1. Resumen del proyecto

Web de boda para **Isabel y Marcos**, celebrada el **sábado 3 de octubre de 2026** en el **Cortijo El Alamillo, Villarrubia, Córdoba**.

- **URL de producción**: https://isabelymarcos.online
- **Repositorio**: https://github.com/mariomasku/boda-isabel-marcos
- **Hosting**: Vercel (cuenta mariomascu.recursos@gmail.com)
- **Deploy automático**: push a `master` → Vercel despliega. Si el webhook falla, usar `npx vercel --prod` manualmente.

---

## 2. Stack técnico

| Tecnología | Versión | Uso |
|---|---|---|
| Astro | 7 | Framework principal (output: static + Vercel adapter para API routes) |
| Tailwind CSS | 4 | Utilidades de estilos |
| GSAP + ScrollTrigger | 3 | Animaciones de scroll |
| @astrojs/vercel | latest | Adapter para funciones serverless |
| googleapis | latest | Cliente oficial Google Sheets API |
| Vercel | - | Hosting + serverless functions |

**Nota importante**: El modo `output: 'hybrid'` fue eliminado en Astro 7. Para que un endpoint sea serverless hay que añadir `export const prerender = false` en el fichero de la ruta API.

---

## 3. Estructura de ficheros relevantes

```
src/
├── components/
│   ├── Hero.astro          # Cabecera con foto de fondo y parallax
│   ├── Welcome.astro       # Texto de bienvenida con animaciones scroll
│   ├── Details.astro       # Timeline del día + mapa + botón calendario
│   ├── PhotoParallax.astro # Secciones de foto con parallax + zoom suave
│   ├── Bus.astro           # Sección autobús (paleta dorada oscura)
│   ├── RSVP.astro          # Formulario de confirmación → Google Sheets
│   └── Footer.astro        # Pie de página
├── pages/
│   ├── index.astro         # Página principal (orquesta todos los componentes)
│   └── api/
│       └── rsvp.ts         # Endpoint serverless → escribe en Google Sheets
├── styles/
│   └── global.css          # Variables CSS, tipografías, estilos base
public/
├── icons/                  # SVGs: bus.svg, fotos.svg, anillos.svg, etc.
├── fotos/                  # Imágenes webp de la pareja
└── boda.ics                # Fichero de calendario del evento
```

---

## 4. Paleta de colores (variables CSS globales)

```css
--gold:        #C4A882   /* dorado principal */
--gold-dark:   ~#7A5318  /* dorado oscuro (texto sobre claro) */
--brown:       marrón oscuro principal
--brown-light: marrón claro (texto secundario)
--ivory:       #F9F5EF   /* blanco roto cálido */
--cream:       #F6F1E8   /* crema más saturada */
--text:        color de texto principal
```

**Paleta específica de Bus.astro** (sección con fondo oscuro):
- Fondo: `linear-gradient(135deg, #5C3D12 0%, #7A5520 50%, #624015 100%)`
- Texto: `rgba(249,245,239, 0.55–0.88)` (escala de cremas)
- Cards: `rgba(249,245,239, 0.07)` con borde `rgba(249,245,239, 0.18)`

---

## 5. Componentes — detalle técnico

### Hero.astro
- Foto de fondo con `parallax-hero-bg` (GSAP yPercent 25 al hacer scroll)
- Texto animado con `.gsap-hero` (stagger 0.18s, delay 0.3s)
- El navbar en `index.astro` se vuelve oscuro al pasar 60px de scroll

### Welcome.astro
- Cuatro párrafos con scroll-scrub individual (`scrub: 0.8`, `start: 'top 92%'`, `end: 'top 42%'`)
- Estado inicial `opacity: 0` en CSS para evitar flash antes de GSAP
- SVG "el amor." con animación de trazo a mano alzada:
  - **Fase 1**: `stroke-dashoffset` de longitud → 0 (2.4s, GSAP `attr()`)
  - **Fase 2**: `fill` con el color + `strokeOpacity: 0` (0.9s, inline styles)
  - La fase 2 usa propiedades directas (no `attr`) para superar la especificidad del CSS
  - Color leído de `getComputedStyle` para leer `var(--gold-dark)` en runtime

### Details.astro
- Timeline vertical con icono + línea + hora + etiqueta por evento
- Cada `.tl-item` tiene animación bidireccional (aparece al bajar, desaparece al subir):
  ```js
  gsap.timeline({ scrollTrigger: { toggleActions: 'play none none reverse' } })
    .to(item, { opacity: 1, duration: 0.01 })
    .to(left, { x: 0, opacity: 1, duration: 0.45 }, 0)
    .to(right, { x: 0, opacity: 1, duration: 0.45 }, 0.1)
  ```
- **Botón "Añadir a mi calendario"**: detección de OS
  - Si `navigator.canShare({ files })` → selector nativo del SO
  - iOS sin canShare → `webcal://` (abre app Calendario)
  - Android/desktop sin canShare → descarga `.ics` (Android muestra "Abrir con…")
- Mapa embed de Google Maps con `border-radius: 12px` y `overflow: hidden`
- Enlace "Abrir en Google Maps →" en cabecera del mapa

### PhotoParallax.astro
- `yPercent: -15 → 15` + `scale: 1.0 → 1.08` (scrub), efecto zoom suave

### Bus.astro
- Fondo dorado oscuro con patrón SVG sutil al 3% de opacidad
- Icono `bus.svg` filtrado a blanco-crema (`brightness(0) invert(1) opacity(0.55)`)
- Tarjeta IDA: entra desde la izquierda (`x: -50 → 0`)
- Tarjeta VUELTA: entra desde la derecha (`x: 50 → 0`, delay 150ms)
- `align-items: stretch` en `.bus-routes` para igualar altura de ambas tarjetas
- `flex: 1` en `.bus-card` para igualar anchura
- Flecha `⇄` visible en desktop, `display: none` en `@media (max-width: 580px)`
- Datos del bus:
  - IDA: 17:15h desde el Lidl de Puente Genil al Cortijo El Alamillo
  - VUELTA: Córdoba → Puente Genil a las 03:00h y 06:00h. Llegada al Lidl Puente Genil.

### RSVP.astro
- **Q1**: Nombre completo
- **Q2**: ¿Asistirás? → Si "Sí" despliega Q3-Q11 (accordion CSS `max-height`)
- **Q3**: ¿Acompañante? → Si "Sí" muestra campo nombre acompañante
- **Q4**: ¿Niños? → Si "Sí" muestra Q5
- **Q5**: Número de niños + campos nombre/edad dinámicos por cada niño
- **Q6**: Alergias/intolerancias
- **Q7**: Bebida alcohólica (checkboxes: Whisky, Ginebra, Ron, Vodka)
- **Q8**: Autobús → Si no "No lo necesitaré" muestra Q9
- **Q9**: Plazas de autobús
- **Q10**: Canción para la pista de baile
- **Q11**: Comentarios + tarjeta del fotógrafo (ver abajo)
- **Tarjeta fotógrafo**: icono `fotos.svg`, texto descriptivo, nombre Rafael Badia, enlace `tel:+34637352642` como botón con borde dorado
- **Envío**: `fetch('/api/rsvp', { method: 'POST', body: JSON.stringify(data) })`
- FormData se convierte a objeto JSON (con agrupación de checkboxes múltiples)
- Mensajes de éxito/error inline en el formulario

### src/pages/api/rsvp.ts
```typescript
export const prerender = false; // CRÍTICO: sin esto Astro lo prerenderiza como estático
```
- Recibe JSON del formulario
- Parsea `GOOGLE_SERVICE_ACCOUNT_KEY` (corrige `\\n` en private_key)
- Autentica con Google Sheets API usando Service Account
- Si la hoja está vacía, crea fila de cabeceras automáticamente
- Hace `append` con todos los campos del formulario
- Columnas del Sheet: Fecha | Nombre | Asistencia | Acompañante | Nombre acompañante | Niños | Datos niños | Alergias | Bebida | Autobús | Plazas bus | Canción | Comentarios

---

## 6. Integración Google Sheets

### Configuración (única — reutilizable para todos los proyectos futuros)

- **Google Cloud Project**: `invibodas-masku`
- **Service Account**: `boda-rsvp@invibodas-masku.iam.gserviceaccount.com`
- **API habilitada**: Google Sheets API
- **Clave JSON**: descargada y guardada de forma segura por el desarrollador

### Variables de entorno en Vercel (por proyecto)

| Variable | Valor |
|---|---|
| `GOOGLE_SERVICE_ACCOUNT_KEY` | Contenido completo del JSON del Service Account |
| `GOOGLE_SHEET_ID` | ID del Google Sheet (lo que va entre `/d/` y `/edit` en la URL) |

### Workflow para nueva boda

1. Crear un Google Sheet nuevo
2. Compartirlo con `boda-rsvp@invibodas-masku.iam.gserviceaccount.com` como Editor
3. Compartir el Sheet con los novios para que lo gestionen
4. En el nuevo proyecto de Vercel, añadir las mismas `GOOGLE_SERVICE_ACCOUNT_KEY` + nuevo `GOOGLE_SHEET_ID`
5. Reutilizar el mismo `.json` de credenciales

---

## 7. Animaciones GSAP — patrones usados

```js
// Fade-in genérico (gestionado desde index.astro para todos los .gsap-fade)
gsap.fromTo(el, { opacity: 0, y: 35 }, {
  scrollTrigger: { trigger: el, start: 'top 88%', toggleActions: 'play none none none' },
  opacity: 1, y: 0, duration: 0.85, ease: 'power2.out'
});

// Timeline bidireccional (Details.astro, cada tl-item)
gsap.timeline({ scrollTrigger: { toggleActions: 'play none none reverse' } })

// Scroll-scrub por párrafo (Welcome.astro)
gsap.fromTo(p, { opacity: 0, y: 22 }, {
  opacity: 1, y: 0, ease: 'power1.out',
  scrollTrigger: { trigger: p, start: 'top 92%', end: 'top 42%', scrub: 0.8 }
});

// Entrada desde los lados (Bus.astro, cards)
gsap.fromTo('.bus-card-ida', { opacity: 0, x: -50 }, {
  opacity: 1, x: 0, duration: 0.7, ease: 'power2.out',
  scrollTrigger: { trigger: '.bus-routes', start: 'top 82%', toggleActions: 'play none none reverse' }
});
```

---

## 8. Problemas resueltos (referencia futura)

| Problema | Causa | Solución |
|---|---|---|
| API route devuelve 405 | Astro prerenderiza el endpoint como fichero estático | Añadir `export const prerender = false` en el .ts |
| GSAP fill no funciona en SVG | CSS tiene más especificidad que GSAP `attr()` | Fase 1 con `attr()`, fase 2 con propiedades directas (inline styles) |
| Botón calendario abre web en móvil | `navigator.share({ files })` no soportado en todos los casos | Detección de OS: iOS→`webcal://`, Android→descarga `.ics` |
| Vercel webhook no dispara | Integración GitHub→Vercel sin trigger | `npx vercel --prod` para forzar deploy manual |
| `output: 'hybrid'` error en Astro 7 | Modo eliminado y fusionado con `static` | Eliminar la opción, solo añadir el adapter |
| Private key con `\\n` en Vercel | Vercel escapa los saltos de línea al almacenar | `.replace(/\\n/g, '\n')` después del `JSON.parse` |

---

## 9. Comandos útiles

```bash
# Servidor de desarrollo
npx astro dev --background
npx astro dev stop
npx astro dev logs

# Build local
npx astro build

# Deploy a producción (si el webhook no dispara)
npx vercel --prod

# Ver deployments
npx vercel ls

# Ver logs (requiere pasar URL del deployment)
npx vercel logs <deployment-url> --since 1h
```

---

## 10. Pendientes / posibles mejoras

- [ ] Eliminar el `debug: msg` de la respuesta del API una vez confirmado que funciona en producción
- [ ] Añadir notificación por email cuando llega un RSVP (con Resend, tier gratuito)
- [ ] Revisar si el formulario de prueba generó filas en el Sheet y borrarlas antes de entregar
- [ ] Comprobar en dispositivo real iOS y Android el flujo completo del formulario y el botón de calendario
