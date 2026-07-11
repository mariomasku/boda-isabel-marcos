# Boda Isabel & Marcos 💍

Web de invitación para la boda de **Isabel y Marcos**, el **sábado 3 de octubre de 2026** en el **Cortijo El Alamillo** (Villarrubia, Córdoba).

**Producción**: [isabelymarcos.online](https://isabelymarcos.online)

---

## Qué es

Una landing de una sola página (scroll continuo) con animaciones, más un formulario de confirmación de asistencia (RSVP) que guarda las respuestas directamente en un **Google Sheet**, sin necesidad de base de datos propia. Incluye también un pequeño panel privado para que los novios consulten las estadísticas de confirmaciones sin abrir el Excel.

### Secciones de la web pública

| Sección | Qué incluye |
|---|---|
| **Hero** | Foto de fondo con parallax, nombres animados (SVG dibujado a mano), cuenta atrás en vivo hasta la boda |
| **Bienvenida** | Texto de introducción con revelado palabra a palabra al hacer scroll |
| **El gran día** | Timeline vertical de la jornada (ceremonia, cóctel, cena, autobuses...), mapa de ubicación embebido y botón "Añadir a mi calendario" (`.ics`, con detección iOS/Android) |
| **Autobús** | Horarios y rutas del autocar de ida y las dos opciones de vuelta |
| **Confirmar asistencia (RSVP)** | Formulario completo: acompañante, niños (con nombre/edad dinámicos), intolerancias alimentarias por persona, bebida, autobús y plazas, canción para la fiesta y comentarios |
| **Footer** | Datos de contacto de los novios y acceso al panel privado |

### Formulario RSVP — detalle
- Preguntas condicionales que se despliegan según las respuestas (acompañante, niños, autobús...)
- Selector de intolerancias por persona en acordeón, con checkboxes de alérgenos comunes
- Validación antes de enviar y modal de confirmación centrado al finalizar
- Al enviarse correctamente, el formulario se resetea por completo (incluidos los bloques dinámicos)

### Panel privado (`/dashboard`)
Acceso mediante un pequeño modal de usuario/contraseña (botón discreto en el footer). Muestra, en vivo, leyendo directamente el Google Sheet:
- Totales de confirmados, adultos, niños y quiénes no asisten (con listado de nombres al pulsar cada tarjeta)
- Plazas de autobús solicitadas (ida / vuelta), con el listado de invitados
- Intolerancias y alergias, con el listado de personas afectadas por cada una
- Bebidas más solicitadas
- Enlace directo al Google Sheet completo

---

## Stack técnico

| Tecnología | Uso |
|---|---|
| [Astro 7](https://docs.astro.build) | Framework principal (páginas + rutas API serverless) |
| [Tailwind CSS 4](https://tailwindcss.com) | Utilidades de estilo puntuales |
| [GSAP 3](https://gsap.com) (+ ScrollTrigger, SplitText, TextPlugin, ScrambleTextPlugin) | Todas las animaciones de scroll y texto |
| [`googleapis`](https://www.npmjs.com/package/googleapis) | Cliente oficial de Google Sheets API |
| [`@astrojs/vercel`](https://docs.astro.build/en/guides/integrations-guide/vercel/) | Adapter para desplegar como funciones serverless en Vercel |
| [Vercel](https://vercel.com) | Hosting y despliegue continuo |

Requiere **Node.js ≥ 22.12.0**.

---

## Estructura del proyecto

```
src/
├── components/
│   ├── Hero.astro           # Cabecera: parallax, nombres, cuenta atrás
│   ├── Welcome.astro        # Texto de bienvenida con revelado por scroll
│   ├── Details.astro        # Timeline del día + mapa + botón calendario
│   ├── PhotoParallax.astro  # Bloques de foto con efecto parallax entre secciones
│   ├── Bus.astro            # Horarios del autobús
│   ├── RSVP.astro           # Formulario de confirmación + modal de éxito
│   ├── SectionTitle.astro   # Título de sección en formato "cinta"
│   └── Footer.astro         # Pie de página + acceso al panel privado
├── layouts/
│   └── Layout.astro         # HTML base (meta tags, fuentes, favicon)
├── pages/
│   ├── index.astro          # Página principal (orquesta todos los componentes + animaciones globales)
│   ├── dashboard.astro      # Panel privado de estadísticas
│   └── api/
│       ├── rsvp.ts          # Endpoint POST: escribe las respuestas en Google Sheets
│       └── stats.ts         # Endpoint GET: lee el Sheet y calcula las estadísticas del panel
└── styles/
    └── global.css           # Paleta de colores (variables CSS) y tipografías

public/
├── fotos/                   # Fotografías de la pareja (Hero + parallax)
├── icons/                   # Iconos SVG del timeline
├── img/                     # Ornamentos y fondos decorativos
└── boda.ics                 # Plantilla del evento para el calendario
```

---

## Puesta en marcha en local

```bash
# 1. Instalar dependencias
npm install

# 2. Configurar variables de entorno (ver tabla más abajo)
#    Crear un fichero .env.local en la raíz con las dos variables

# 3. Arrancar el servidor de desarrollo
npx astro dev --background   # http://localhost:4321

# Gestionar el servidor en background
npx astro dev status
npx astro dev logs
npx astro dev stop
```

### Variables de entorno

| Variable | Descripción |
|---|---|
| `GOOGLE_SERVICE_ACCOUNT_KEY` | JSON completo (minificado, una sola línea) de la clave de la cuenta de servicio de Google Cloud con acceso a la Sheets API |
| `GOOGLE_SHEET_ID` | ID del Google Sheet donde se guardan las confirmaciones (el valor entre `/d/` y `/edit` en la URL del Sheet) |

En producción se configuran en **Vercel → Project Settings → Environment Variables**. En local van en un fichero `.env.local` (ya excluido en `.gitignore`, nunca se sube al repositorio).

---

## Scripts disponibles

| Comando | Acción |
|---|---|
| `npm run dev` | Servidor de desarrollo en `localhost:4321` |
| `npm run build` | Genera la build de producción en `./dist/` |
| `npm run preview` | Sirve la build ya generada, para probarla antes de desplegar |
| `npm run astro ...` | Acceso directo a la CLI de Astro (`astro add`, `astro check`, etc.) |

---

## Despliegue

El despliegue es automático: cada `push` a `master` dispara un build y deploy en Vercel. Si el webhook de GitHub→Vercel no dispara por algún motivo, se puede forzar manualmente:

```bash
npx vercel --prod
```

---

## Cómo funciona la integración con Google Sheets

- El formulario envía los datos por `fetch` a `/api/rsvp` (función serverless).
- El endpoint se autentica contra Google Sheets con la cuenta de servicio y añade una o varias filas (invitado, acompañante y niños, si los hay) en la pestaña **RSVP**.
- En cada envío se recalculan automáticamente las fórmulas y el diseño de la pestaña **RESUMEN** (totales, gráfico de intolerancias, tema visual a juego con la paleta de la web).
- El panel `/dashboard` consulta `/api/stats`, que lee el Sheet en tiempo real y calcula las estadísticas mostradas.

Ni el Sheet ni las hojas necesitan prepararse a mano: la primera vez que llega una confirmación, el propio código crea las pestañas, cabeceras y formato necesarios.

---

## Documentación adicional

- [`CONTEXTO.md`](./CONTEXTO.md) — historial técnico detallado de este proyecto: decisiones tomadas, problemas resueltos y patrones de animación usados.
- [`NUEVA-BODA-SETUP.md`](./NUEVA-BODA-SETUP.md) — guía paso a paso para reutilizar esta plantilla en la web de otra boda (qué cuentas y servicios externos hay que conectar).

---

## Estado del proyecto

El proyecto está prácticamente terminado y en producción. Pendientes menores a revisar antes de la entrega final:

- [x] Retirar el campo `debug` de la respuesta de error de `/api/rsvp` (ahora solo se registra en los logs del servidor)
- [ ] Borrar los registros de prueba del Google Sheet real antes de compartirlo con los invitados
- [ ] Probar el flujo completo del formulario y el botón de calendario en un dispositivo real (iOS y Android)

---

*Desarrollo: [maskudev](https://github.com/mariomasku)*
