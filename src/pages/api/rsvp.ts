import type { APIRoute } from 'astro';
import { google } from 'googleapis';

export const prerender = false;

// ── Constantes ──────────────────────────────────────────────
const RSVP_TAB    = 'RSVP';
const RESUMEN_TAB = 'RESUMEN';

const HEADERS = [
  'FECHA', 'NOMBRE', 'ROL', 'ACOMPAÑANTE DE', 'ASISTENCIA', 'EDAD',
  'INTOLERANCIAS', 'OTROS ALERGENOS', 'BEBIDA', 'AUTOBÚS', 'PLAZAS BUS',
  'CANCIÓN', 'COMENTARIOS',
];

// Convierte un hex "rrggbb" al formato RGB 0-1 que usa la API de Sheets.
const rgb = (hex: string) => ({
  red:   parseInt(hex.slice(0, 2), 16) / 255,
  green: parseInt(hex.slice(2, 4), 16) / 255,
  blue:  parseInt(hex.slice(4, 6), 16) / 255,
});

// Colores de filas de datos (paleta Gsheets de global.css)
const COLOR_INVITADO    = rgb('99bcac'); // --salvia-invitado
const COLOR_ACOMPANANTE = rgb('badbcc'); // --salvia-acompanante
const COLOR_NINO        = rgb('c4f2dd'); // --salvia-ninos

// Paleta del tema "hojas" (equivalente a global.css)
const EUCALIPTO = rgb('47635f'); // encabezados/títulos (fondo)
const OLIVA     = rgb('d7d5b1'); // texto sobre encabezados
const ORO       = rgb('d7b77d'); // acento (secciones RESUMEN)
const SALVIA    = rgb('7f958b'); // gráfico
const MENTA     = rgb('e1e6e1'); // sub-encabezados (fondo claro)
const WHITE     = { red: 1, green: 1, blue: 1 };

// ── Helpers ─────────────────────────────────────────────────
// up(): valores controlados (ROL, ASISTENCIA, alérgenos, bebida, autobús)
// que alimentan las fórmulas del RESUMEN y el dashboard — deben ir en MAYÚSCULAS.
const up = (v: unknown): string => {
  if (v == null || v === '') return '';
  if (Array.isArray(v)) return v.map(String).join(', ').toUpperCase();
  return String(v).toUpperCase();
};

// Conectores que van en minúscula dentro de una capitalización por palabra.
const CONNECTORS = new Set(['de', 'del', 'la', 'las', 'el', 'los', 'y', 'e', 'o', 'u', 'a', 'en', 'con']);

// cap(): capitaliza la primera letra de cada palabra (nombres, canción, otros).
// La primera palabra siempre va en mayúscula; los conectores intermedios en minúscula.
const cap = (v: unknown): string => {
  if (v == null || v === '') return '';
  return String(v).trim().toLowerCase().split(/\s+/)
    .map((w, i) => (i > 0 && CONNECTORS.has(w)) ? w : w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
};

// sentence(): capitaliza solo la primera letra (comentarios en prosa).
const sentence = (v: unknown): string => {
  if (v == null || v === '') return '';
  const s = String(v).trim();
  return s.charAt(0).toUpperCase() + s.slice(1);
};

// Mapa de códigos de alérgeno (valor del checkbox) → nombre limpio en el Sheet.
// Debe coincidir con los tokens de stats.ts y los patrones COUNTIF del RESUMEN.
const INTOL_CLEAN: Record<string, string> = {
  GLUTEN: 'Gluten', LACTOSA: 'Lactosa', HUEVO: 'Huevo', FRUTOS_SECOS: 'Frutos secos',
  CACAHUETE: 'Cacahuete', MARISCO: 'Marisco', PESCADO: 'Pescado', SOJA: 'Soja',
  SESAMO: 'Sésamo', MOSTAZA: 'Mostaza', APIO: 'Apio', SULFITOS: 'Sulfitos',
  ALTRAMUCES: 'Altramuces', MOLUSCOS: 'Moluscos',
};

const buildIntol = (data: Record<string, unknown>, pid: string) => {
  const vals = data[`intol_${pid}`];
  const arr  = Array.isArray(vals) ? vals : (vals ? [vals] : []);
  const intol = arr
    .map(v => INTOL_CLEAN[String(v).toUpperCase()] ?? cap(v))
    .join(', ');
  const otros = cap(data[`intol_${pid}_otros`]);
  return { intol, otros };
};

// ── Configuración del Spreadsheet ────────────────────────────
async function ensureSetup(
  sheets: ReturnType<typeof google.sheets>,
  spreadsheetId: string,
): Promise<{ rsvpId: number; resId: number }> {

  // Estado actual del libro
  const meta      = await sheets.spreadsheets.get({ spreadsheetId });
  const allSheets = (meta.data.sheets ?? []) as any[];

  let rsvpSheet    = allSheets.find(s => s.properties?.title === RSVP_TAB);
  let resumenSheet = allSheets.find(s => s.properties?.title === RESUMEN_TAB);

  const initReqs: any[] = [];

  if (!rsvpSheet) {
    const firstId = allSheets[0]?.properties?.sheetId ?? 0;
    initReqs.push(
      { updateSheetProperties: { properties: { sheetId: firstId, title: RSVP_TAB }, fields: 'title' } },
      { updateSheetProperties: { properties: { sheetId: firstId, gridProperties: { frozenRowCount: 1 } }, fields: 'gridProperties.frozenRowCount' } },
      { setBasicFilter: { filter: { range: { sheetId: firstId, startRowIndex: 0, endColumnIndex: HEADERS.length } } } },
    );
    rsvpSheet = { properties: { sheetId: firstId, title: RSVP_TAB } };
  }

  if (!resumenSheet) {
    initReqs.push({ addSheet: { properties: { title: RESUMEN_TAB } } });
  }

  let resumenSheetId: number | undefined = resumenSheet?.properties?.sheetId;
  if (initReqs.length) {
    const bRes = await sheets.spreadsheets.batchUpdate({ spreadsheetId, requestBody: { requests: initReqs } });
    if (!resumenSheet) {
      const added = (bRes.data.replies ?? []).find((r: any) => r.addSheet);
      resumenSheetId = added?.addSheet?.properties?.sheetId;
    }
  }

  // IDs actualizados
  const updated  = await sheets.spreadsheets.get({ spreadsheetId });
  const allNow   = (updated.data.sheets ?? []) as any[];
  const rsvpInfo = allNow.find((s: any) => s.properties?.title === RSVP_TAB) as any;
  const resInfo  = allNow.find((s: any) => s.properties?.title === RESUMEN_TAB) as any;
  const rsvpId   = rsvpInfo?.properties?.sheetId ?? 0;
  const resId    = resInfo?.properties?.sheetId  ?? (resumenSheetId ?? 1);

  // Siempre actualizar cabeceras (corrige renombrados)
  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `${RSVP_TAB}!A1`,
    valueInputOption: 'USER_ENTERED',
    requestBody: { values: [HEADERS] },
  });

  // Siempre reescribir fórmulas del RESUMEN
  await writeResumen(sheets, spreadsheetId);

  // Siempre aplicar tema (idempotente: merges y formatos no causan error si ya existen)
  const hasChart = (resInfo?.charts ?? []).length > 0;
  await applyTheme(sheets, spreadsheetId, rsvpId, resId, !hasChart);

  return { rsvpId, resId };
}

// Ajusta cada columna al ancho de su celda más larga (evita que se corte el texto).
async function autoResizeColumns(
  sheets: any, spreadsheetId: string, rsvpId: number, resId: number,
) {
  await sheets.spreadsheets.batchUpdate({
    spreadsheetId,
    requestBody: {
      requests: [
        { autoResizeDimensions: { dimensions: { sheetId: rsvpId, dimension: 'COLUMNS', startIndex: 0, endIndex: HEADERS.length } } },
        { autoResizeDimensions: { dimensions: { sheetId: resId,  dimension: 'COLUMNS', startIndex: 0, endIndex: 2 } } },
      ],
    },
  });
}

// ── Contenido del RESUMEN ─────────────────────────────────────
// Layout (0-indexed → 1-indexed):
// 0→1: Título  |  2→3: ASISTENCIA section  |  3-6→4-7: datos asist
// 8→9: AUTOBÚS section  |  9-10→10-11: datos bus
// 12→13: INTOLERANCIAS section  |  13→14: sub-header  |  14-28→15-29: datos
// 30→31: BEBIDAS section  |  31→32: sub-header  |  32-35→33-36: datos
async function writeResumen(sheets: any, spreadsheetId: string) {
  const t = RSVP_TAB;
  // Separador ';' requerido en locale español de Google Sheets
  const f = (formula: string) => `=IFERROR(${formula};0)`;
  const data = [
    // 0: Título
    ['RESUMEN — BODA ISABEL & MARCOS', ''],
    // 1: vacío
    ['', ''],
    // 2: ASISTENCIA
    ['ASISTENCIA', ''],
    // 3–6: datos asistencia
    ['Total confirmados (SÍ)',
      f(`COUNTIF(${t}!E:E;"SÍ")`)],
    ['  Adultos (invitados + acompañantes)',
      f(`COUNTIFS(${t}!E:E;"SÍ";${t}!C:C;"INVITADO")+COUNTIFS(${t}!E:E;"SÍ";${t}!C:C;"ACOMPAÑANTE")`)],
    ['  Niños (menores de 18 años)',
      f(`COUNTIFS(${t}!E:E;"SÍ";${t}!C:C;"NIÑO/A")`)],
    ['No asisten (NO)',
      f(`COUNTIF(${t}!E:E;"NO")`)],
    // 7: vacío
    ['', ''],
    // 8: AUTOBÚS
    ['AUTOBÚS', ''],
    // 9–10: plazas
    ['Plazas IDA solicitadas (17:15h)',
      f(`SUMIF(${t}!J:J;"IDA Y VUELTA";${t}!K:K)+SUMIF(${t}!J:J;"SOLO IDA";${t}!K:K)`)],
    ['Plazas VUELTA solicitadas',
      f(`SUMIF(${t}!J:J;"IDA Y VUELTA";${t}!K:K)+SUMIF(${t}!J:J;"SOLO VUELTA";${t}!K:K)`)],
    // 11: vacío
    ['', ''],
    // 12: INTOLERANCIAS
    ['INTOLERANCIAS / ALERGIAS', ''],
    // 13: sub-header
    ['Alérgeno', 'Personas'],
    // 14–28: 14 alérgenos + Otros
    ['Gluten (celiaquía)',     f(`COUNTIF(${t}!G:G;"*GLUTEN*")`)],
    ['Lactosa / lácteos',      f(`COUNTIF(${t}!G:G;"*LACTOSA*")`)],
    ['Huevo',                  f(`COUNTIF(${t}!G:G;"*HUEVO*")`)],
    ['Frutos secos',           f(`COUNTIF(${t}!G:G;"*FRUTOS SECOS*")`)],
    ['Cacahuete',              f(`COUNTIF(${t}!G:G;"*CACAHUETE*")`)],
    ['Marisco',                f(`COUNTIF(${t}!G:G;"*MARISCO*")`)],
    ['Pescado',                f(`COUNTIF(${t}!G:G;"*PESCADO*")`)],
    ['Soja',                   f(`COUNTIF(${t}!G:G;"*SOJA*")`)],
    ['Sésamo',                 f(`COUNTIF(${t}!G:G;"*SESAMO*")`)],
    ['Mostaza',                f(`COUNTIF(${t}!G:G;"*MOSTAZA*")`)],
    ['Apio',                   f(`COUNTIF(${t}!G:G;"*APIO*")`)],
    ['Sulfitos',               f(`COUNTIF(${t}!G:G;"*SULFITOS*")`)],
    ['Altramuces (lupino)',     f(`COUNTIF(${t}!G:G;"*ALTRAMUCES*")`)],
    ['Moluscos',               f(`COUNTIF(${t}!G:G;"*MOLUSCOS*")`)],
    ['Otros alergias especificadas', f(`COUNTA(${t}!H:H)-1`)],
    // 29: vacío
    ['', ''],
    // 30: BEBIDAS
    ['BEBIDAS PREFERIDAS', ''],
    // 31: sub-header
    ['Bebida', 'Personas'],
    // 32–35: bebidas
    ['Whisky',  f(`COUNTIF(${t}!I:I;"*WHISKY*")`)],
    ['Ginebra', f(`COUNTIF(${t}!I:I;"*GINEBRA*")`)],
    ['Ron',     f(`COUNTIF(${t}!I:I;"*RON*")`)],
    ['Vodka',   f(`COUNTIF(${t}!I:I;"*VODKA*")`)],
  ];

  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `${RESUMEN_TAB}!A1`,
    valueInputOption: 'USER_ENTERED',
    requestBody: { values: data },
  });
}

// ── Tema visual ───────────────────────────────────────────────
async function applyTheme(
  sheets: any,
  spreadsheetId: string,
  rsvpId: number,
  resId: number,
  addChart: boolean,
) {
  const SECTION_ROWS = [2, 8, 12, 30]; // 0-indexed, filas de sección en RESUMEN
  const SUBHEADER_ROWS = [13, 31];     // 0-indexed, filas de sub-cabecera

  const reqs: any[] = [
    // ── RSVP: cabecera ──
    {
      repeatCell: {
        range: { sheetId: rsvpId, startRowIndex: 0, endRowIndex: 1, startColumnIndex: 0, endColumnIndex: HEADERS.length },
        cell: {
          userEnteredFormat: {
            backgroundColor: EUCALIPTO,
            textFormat: { foregroundColor: OLIVA, bold: true, fontSize: 9 },
            horizontalAlignment: 'CENTER',
            verticalAlignment: 'MIDDLE',
          },
        },
        fields: 'userEnteredFormat(backgroundColor,textFormat,horizontalAlignment,verticalAlignment)',
      },
    },
    // RSVP: anchos de columna
    ...[120, 175, 95, 155, 55, 45, 200, 155, 115, 95, 75, 175, 195].map((px, i) => ({
      updateDimensionProperties: {
        range: { sheetId: rsvpId, dimension: 'COLUMNS', startIndex: i, endIndex: i + 1 },
        properties: { pixelSize: px },
        fields: 'pixelSize',
      },
    })),
    // RSVP: altura de cabecera
    {
      updateDimensionProperties: {
        range: { sheetId: rsvpId, dimension: 'ROWS', startIndex: 0, endIndex: 1 },
        properties: { pixelSize: 32 },
        fields: 'pixelSize',
      },
    },

    // ── RESUMEN: merges ──
    // Merge título
    { mergeCells: { range: { sheetId: resId, startRowIndex: 0, endRowIndex: 1, startColumnIndex: 0, endColumnIndex: 2 }, mergeType: 'MERGE_ALL' } },
    // Merge secciones
    ...SECTION_ROWS.map(r => ({
      mergeCells: { range: { sheetId: resId, startRowIndex: r, endRowIndex: r + 1, startColumnIndex: 0, endColumnIndex: 2 }, mergeType: 'MERGE_ALL' },
    })),

    // RESUMEN: título
    {
      repeatCell: {
        range: { sheetId: resId, startRowIndex: 0, endRowIndex: 1, startColumnIndex: 0, endColumnIndex: 2 },
        cell: {
          userEnteredFormat: {
            backgroundColor: EUCALIPTO,
            textFormat: { foregroundColor: OLIVA, bold: true, fontSize: 14 },
            horizontalAlignment: 'CENTER',
            verticalAlignment: 'MIDDLE',
          },
        },
        fields: 'userEnteredFormat(backgroundColor,textFormat,horizontalAlignment,verticalAlignment)',
      },
    },
    // RESUMEN: altura título
    {
      updateDimensionProperties: {
        range: { sheetId: resId, dimension: 'ROWS', startIndex: 0, endIndex: 1 },
        properties: { pixelSize: 42 },
        fields: 'pixelSize',
      },
    },
    // RESUMEN: secciones
    ...SECTION_ROWS.map(r => ({
      repeatCell: {
        range: { sheetId: resId, startRowIndex: r, endRowIndex: r + 1, startColumnIndex: 0, endColumnIndex: 2 },
        cell: {
          userEnteredFormat: {
            backgroundColor: ORO,
            textFormat: { foregroundColor: EUCALIPTO, bold: true, fontSize: 10 },
            verticalAlignment: 'MIDDLE',
          },
        },
        fields: 'userEnteredFormat(backgroundColor,textFormat,verticalAlignment)',
      },
    })),
    // RESUMEN: alturas secciones
    ...SECTION_ROWS.map(r => ({
      updateDimensionProperties: {
        range: { sheetId: resId, dimension: 'ROWS', startIndex: r, endIndex: r + 1 },
        properties: { pixelSize: 28 },
        fields: 'pixelSize',
      },
    })),
    // RESUMEN: sub-cabeceras
    ...SUBHEADER_ROWS.map(r => ({
      repeatCell: {
        range: { sheetId: resId, startRowIndex: r, endRowIndex: r + 1, startColumnIndex: 0, endColumnIndex: 2 },
        cell: {
          userEnteredFormat: {
            backgroundColor: MENTA,
            textFormat: { foregroundColor: EUCALIPTO, bold: true, fontSize: 9 },
            horizontalAlignment: 'CENTER',
          },
        },
        fields: 'userEnteredFormat(backgroundColor,textFormat,horizontalAlignment)',
      },
    })),
    // RESUMEN: columna B (números) centrada, en negrita y formato entero
    {
      repeatCell: {
        range: { sheetId: resId, startRowIndex: 3, endRowIndex: 36, startColumnIndex: 1, endColumnIndex: 2 },
        cell: {
          userEnteredFormat: {
            horizontalAlignment: 'CENTER',
            textFormat: { fontSize: 11, bold: true },
            numberFormat: { type: 'NUMBER', pattern: '0' },
          },
        },
        fields: 'userEnteredFormat(horizontalAlignment,textFormat,numberFormat)',
      },
    },
    // RESUMEN: anchos de columna
    {
      updateDimensionProperties: {
        range: { sheetId: resId, dimension: 'COLUMNS', startIndex: 0, endIndex: 1 },
        properties: { pixelSize: 270 },
        fields: 'pixelSize',
      },
    },
    {
      updateDimensionProperties: {
        range: { sheetId: resId, dimension: 'COLUMNS', startIndex: 1, endIndex: 2 },
        properties: { pixelSize: 110 },
        fields: 'pixelSize',
      },
    },
    // RESUMEN: filas de datos con fondo crema alternado para intolerancias (14-28)
    ...Array.from({ length: 15 }, (_, i) => ({
      repeatCell: {
        range: { sheetId: resId, startRowIndex: 14 + i, endRowIndex: 15 + i, startColumnIndex: 0, endColumnIndex: 2 },
        cell: {
          userEnteredFormat: {
            backgroundColor: i % 2 === 0 ? WHITE : rgb('eef4f0'),
          },
        },
        fields: 'userEnteredFormat.backgroundColor',
      },
    })),
  ];

  // Gráfico de intolerancias (solo si no existe)
  if (addChart) {
    reqs.push({
      addChart: {
        chart: {
          spec: {
            title: 'Intolerancias y Alergias',
            titleTextFormat: { bold: true, fontSize: 12, foregroundColor: EUCALIPTO },
            basicChart: {
              chartType: 'COLUMN',
              legendPosition: 'NO_LEGEND',
              axis: [
                { position: 'BOTTOM_AXIS', title: '' },
                { position: 'LEFT_AXIS', title: 'Personas afectadas' },
              ],
              domains: [{
                domain: {
                  sourceRange: {
                    sources: [{
                      sheetId: resId,
                      startRowIndex: 13, endRowIndex: 29,
                      startColumnIndex: 0, endColumnIndex: 1,
                    }],
                  },
                },
              }],
              series: [{
                series: {
                  sourceRange: {
                    sources: [{
                      sheetId: resId,
                      startRowIndex: 13, endRowIndex: 29,
                      startColumnIndex: 1, endColumnIndex: 2,
                    }],
                  },
                },
                targetAxis: 'LEFT_AXIS',
                color: SALVIA,
                dataLabel: { type: 'DATA', textFormat: { fontSize: 8 } },
              }],
              headerCount: 1,
            },
          },
          position: {
            overlayPosition: {
              anchorCell: { sheetId: resId, rowIndex: 37, columnIndex: 0 },
              widthPixels: 620,
              heightPixels: 360,
            },
          },
        },
      },
    });
  }

  await sheets.spreadsheets.batchUpdate({ spreadsheetId, requestBody: { requests: reqs } });
}

// ── API Route ────────────────────────────────────────────────
export const POST: APIRoute = async ({ request }) => {
  try {
    const data = await request.json() as Record<string, unknown>;

    const keyJson = import.meta.env.GOOGLE_SERVICE_ACCOUNT_KEY;
    if (!keyJson) {
      return new Response(JSON.stringify({ ok: false, error: 'GOOGLE_SERVICE_ACCOUNT_KEY no configurada' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    const credentials = JSON.parse(keyJson);
    if (credentials.private_key) credentials.private_key = credentials.private_key.replace(/\\n/g, '\n');

    const spreadsheetId = import.meta.env.GOOGLE_SHEET_ID;
    const auth   = new google.auth.GoogleAuth({ credentials, scopes: ['https://www.googleapis.com/auth/spreadsheets'] });
    const sheets = google.sheets({ version: 'v4', auth });

    const { rsvpId: rsvpSheetId, resId: resumenSheetId } = await ensureSetup(sheets, spreadsheetId);

    // ── Construir filas ──────────────────────────────────────
    const fecha       = new Date().toLocaleString('es-ES', { timeZone: 'Europe/Madrid' });
    const nombre      = cap(data.nombre);
    const asistencia  = String(data.asistencia ?? '').startsWith('S') ? 'Sí' : 'No';
    const bebida      = cap(data.bebida);
    const autobusRaw  = String(data.autobus ?? '');
    const autobus     = autobusRaw.startsWith('No lo') ? 'No' : cap(autobusRaw);
    const busPlazas   = up(data.bus_plazas);
    const cancion     = cap(data.cancion);
    const comentarios = sentence(data.comentarios);

    const rows: string[][] = [];
    type RowType = 'invitado' | 'acompanante' | 'nino';
    const rowTypes: RowType[] = [];

    // Invitado principal
    const { intol: intolInv, otros: otrosInv } = buildIntol(data, 'invitado');
    rows.push([fecha, nombre, 'Invitado', '', asistencia, '', intolInv, otrosInv, bebida, autobus, busPlazas, cancion, comentarios]);
    rowTypes.push('invitado');

    if (asistencia === 'Sí') {
      // Acompañante
      if (data.acompanante === 'si' && data.acompanante_nombre) {
        const acN = cap(data.acompanante_nombre);
        const { intol: intolAc, otros: otrosAc } = buildIntol(data, 'acompanante');
        rows.push([fecha, acN, 'Acompañante', nombre, 'Sí', '', intolAc, otrosAc, '', '', '', '', '']);
        rowTypes.push('acompanante');
      }
      // Niños
      if (data.ninos === 'si') {
        const count = parseInt(String(data.ninos_count || '0')) || 0;
        for (let i = 1; i <= count; i++) {
          const nn   = cap(data[`nino_${i}_nombre`]);
          const edad = String(data[`nino_${i}_edad`] || '');
          const { intol: intolN, otros: otrosN } = buildIntol(data, `nino_${i}`);
          rows.push([fecha, nn, 'Niño/a', nombre, 'Sí', edad, intolN, otrosN, '', '', '', '', '']);
          rowTypes.push('nino');
        }
      }
    }

    // ── Escribir filas ───────────────────────────────────────
    const appendRes = await sheets.spreadsheets.values.append({
      spreadsheetId,
      range: `${RSVP_TAB}!A1`,
      valueInputOption: 'USER_ENTERED',
      requestBody: { values: rows },
    });

    // ── Colorear filas según rol ─────────────────────────────
    const updatedRange = appendRes.data.updates?.updatedRange ?? '';
    const rowMatch     = updatedRange.match(/[A-Z]+(\d+)/);
    const startRow     = rowMatch ? parseInt(rowMatch[1]) - 1 : 1;

    const colorMap: Record<RowType, typeof COLOR_INVITADO> = {
      invitado:    COLOR_INVITADO,
      acompanante: COLOR_ACOMPANANTE,
      nino:        COLOR_NINO,
    };

    const colorReqs = rowTypes.map((type, idx) => ({
      repeatCell: {
        range: { sheetId: rsvpSheetId, startRowIndex: startRow + idx, endRowIndex: startRow + idx + 1, startColumnIndex: 0, endColumnIndex: HEADERS.length },
        cell: { userEnteredFormat: { backgroundColor: colorMap[type] } },
        fields: 'userEnteredFormat.backgroundColor',
      },
    }));

    if (colorReqs.length) {
      await sheets.spreadsheets.batchUpdate({ spreadsheetId, requestBody: { requests: colorReqs } });
    }

    // Ajustar columnas al contenido (después de escribir la nueva fila)
    await autoResizeColumns(sheets, spreadsheetId, rsvpSheetId, resumenSheetId);

    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('RSVP API error:', msg);
    return new Response(JSON.stringify({ ok: false, debug: msg }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
