import type { APIRoute } from 'astro';
import { google } from 'googleapis';

export const prerender = false;

// ── Constantes ──────────────────────────────────────────────
const RSVP_TAB  = 'RSVP';
const MESAS_TAB = 'MESAS';

// La hoja RSVP de esta boda tiene 13 columnas (A..M, ver api/rsvp.ts).
// La columna de mesa es por tanto la 14ª = N (índice 0-based 13).
const MESA_COL       = 'N';
const MESA_COL_INDEX = 13;

const rgb = (hex: string) => ({
  red:   parseInt(hex.slice(0, 2), 16) / 255,
  green: parseInt(hex.slice(2, 4), 16) / 255,
  blue:  parseInt(hex.slice(4, 6), 16) / 255,
});
const EUCALIPTO = rgb('47635f');
const OLIVA     = rgb('d7d5b1');

const eq = (a: unknown, b: string) => String(a ?? '').toUpperCase() === b.toUpperCase();

type Guest = { row: number; nombre: string; rol: string; edad: string; mesa: string | null };

// ── Auth ────────────────────────────────────────────────────
async function getSheetsClient(readonly: boolean) {
  const keyJson = import.meta.env.GOOGLE_SERVICE_ACCOUNT_KEY;
  if (!keyJson) throw new Error('GOOGLE_SERVICE_ACCOUNT_KEY no configurada');
  const credentials = JSON.parse(keyJson);
  if (credentials.private_key) credentials.private_key = credentials.private_key.replace(/\\n/g, '\n');

  const scope = readonly
    ? 'https://www.googleapis.com/auth/spreadsheets.readonly'
    : 'https://www.googleapis.com/auth/spreadsheets';
  const auth = new google.auth.GoogleAuth({ credentials, scopes: [scope] });
  return google.sheets({ version: 'v4', auth });
}

// Valida que el id sea "NUPCIAL" o un entero positivo (como string normalizado).
function normalizeId(raw: unknown): string | null {
  if (typeof raw === 'string' && raw.trim().toUpperCase() === 'NUPCIAL') return 'NUPCIAL';
  const n = typeof raw === 'number' ? raw : parseInt(String(raw ?? '').trim(), 10);
  if (!Number.isInteger(n) || n <= 0) return null;
  return String(n);
}

// ── Esquema (idempotente) ───────────────────────────────────
async function ensureMesasSchema(sheets: any, spreadsheetId: string) {
  const meta      = await sheets.spreadsheets.get({ spreadsheetId });
  const allSheets = (meta.data.sheets ?? []) as any[];

  const rsvpSheet  = allSheets.find(s => s.properties?.title === RSVP_TAB);
  const mesasSheet = allSheets.find(s => s.properties?.title === MESAS_TAB);
  const rsvpId     = rsvpSheet?.properties?.sheetId ?? 0;

  if (!mesasSheet) {
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: { requests: [{ addSheet: { properties: { title: MESAS_TAB } } }] },
    });
  }

  // Cabecera MESA en RSVP, con el mismo formato que el resto de cabeceras.
  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `${RSVP_TAB}!${MESA_COL}1`,
    valueInputOption: 'USER_ENTERED',
    requestBody: { values: [['MESA']] },
  });

  await sheets.spreadsheets.batchUpdate({
    spreadsheetId,
    requestBody: {
      requests: [{
        repeatCell: {
          range: { sheetId: rsvpId, startRowIndex: 0, endRowIndex: 1, startColumnIndex: MESA_COL_INDEX, endColumnIndex: MESA_COL_INDEX + 1 },
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
      }],
    },
  });

  // Cabecera de la pestaña MESAS (solo hace falta la primera vez que se crea).
  if (!mesasSheet) {
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `${MESAS_TAB}!A1`,
      valueInputOption: 'USER_ENTERED',
      requestBody: { values: [['ID', 'NOMBRE']] },
    });

    const updated   = await sheets.spreadsheets.get({ spreadsheetId });
    const mesasInfo = (updated.data.sheets ?? []).find((s: any) => s.properties?.title === MESAS_TAB);
    const mesasId   = mesasInfo?.properties?.sheetId;

    if (mesasId !== undefined) {
      await sheets.spreadsheets.batchUpdate({
        spreadsheetId,
        requestBody: {
          requests: [
            {
              repeatCell: {
                range: { sheetId: mesasId, startRowIndex: 0, endRowIndex: 1, startColumnIndex: 0, endColumnIndex: 2 },
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
            {
              updateSheetProperties: {
                properties: { sheetId: mesasId, gridProperties: { frozenRowCount: 1 } },
                fields: 'gridProperties.frozenRowCount',
              },
            },
          ],
        },
      });
    }
  }
}

// ── GET ──────────────────────────────────────────────────────
export const GET: APIRoute = async () => {
  try {
    const sheets        = await getSheetsClient(true);
    const spreadsheetId = import.meta.env.GOOGLE_SHEET_ID;

    const [rsvpRes, mesasRes] = await Promise.all([
      sheets.spreadsheets.values.get({ spreadsheetId, range: `${RSVP_TAB}!A2:N` }),
      sheets.spreadsheets.values.get({ spreadsheetId, range: `${MESAS_TAB}!A2:B` }).catch(() => ({ data: { values: [] } })),
    ]);

    const rows      = (rsvpRes.data.values ?? []) as string[][];
    const mesasRows = (mesasRes.data.values ?? []) as string[][];

    const nombresMesas = new Map<string, string>();
    mesasRows.forEach(r => { if (r[0]) nombresMesas.set(String(r[0]).trim().toUpperCase(), r[1] ?? ''); });

    const guests: Guest[] = rows
      .map((r, i) => ({ r, row: i + 2 }))
      .filter(({ r }) => r[1] && eq(r[4], 'Sí'))
      .map(({ r, row }) => ({
        row,
        nombre: r[1] ?? '',
        rol:    r[2] ?? '',
        edad:   r[5] ?? '',
        mesa:   (r[MESA_COL_INDEX] ?? '').toString().trim().toUpperCase() || null,
      }));

    const groups = new Map<string, Guest[]>();
    for (const g of guests) {
      if (!g.mesa) continue;
      if (!groups.has(g.mesa)) groups.set(g.mesa, []);
      groups.get(g.mesa)!.push(g);
    }

    const mesas = Array.from(groups.entries())
      .map(([id, personas]) => ({
        id,
        esNupcial: id === 'NUPCIAL',
        nombre: nombresMesas.get(id) ?? '',
        personas,
      }))
      .sort((a, b) => {
        if (a.esNupcial) return -1;
        if (b.esNupcial) return 1;
        return parseInt(a.id, 10) - parseInt(b.id, 10);
      });

    return new Response(JSON.stringify({
      ok: true,
      guests,
      mesas,
      sheetUrl: `https://docs.google.com/spreadsheets/d/${spreadsheetId}`,
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('Mesas API error (GET):', msg);
    return new Response(JSON.stringify({ ok: false, error: 'No se pudieron cargar las mesas.' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};

// ── POST ─────────────────────────────────────────────────────
const jsonOk = () => new Response(JSON.stringify({ ok: true }), {
  status: 200,
  headers: { 'Content-Type': 'application/json' },
});

export const POST: APIRoute = async ({ request }) => {
  try {
    const body = await request.json() as { action: string; id?: unknown; nombre?: string; rows?: number[] };

    const sheets         = await getSheetsClient(false);
    const spreadsheetId  = import.meta.env.GOOGLE_SHEET_ID;

    await ensureMesasSchema(sheets, spreadsheetId);

    if (body.action === 'save') {
      const id = normalizeId(body.id);
      if (!id) throw new Error('Identificador de mesa inválido');
      const nombre = String(body.nombre ?? '').trim();
      const selectedRows = new Set((body.rows ?? []).map(Number));

      // Lee la columna MESA actual para saber a quién hay que liberar.
      const current = await sheets.spreadsheets.values.get({
        spreadsheetId,
        range: `${RSVP_TAB}!${MESA_COL}2:${MESA_COL}`,
      });
      const currentVals = (current.data.values ?? []) as string[][];

      const data: { range: string; values: string[][] }[] = [];

      currentVals.forEach((v, i) => {
        const row = i + 2;
        const val = (v[0] ?? '').toString().trim().toUpperCase();
        if (val === id && !selectedRows.has(row)) {
          data.push({ range: `${RSVP_TAB}!${MESA_COL}${row}`, values: [['']] });
        }
      });
      selectedRows.forEach(row => {
        data.push({ range: `${RSVP_TAB}!${MESA_COL}${row}`, values: [[id]] });
      });

      if (data.length) {
        await sheets.spreadsheets.values.batchUpdate({
          spreadsheetId,
          requestBody: { valueInputOption: 'USER_ENTERED', data },
        });
      }

      // Upsert de {id, nombre} en la pestaña MESAS.
      const mesasRes  = await sheets.spreadsheets.values.get({ spreadsheetId, range: `${MESAS_TAB}!A2:B` });
      const mesasRows = (mesasRes.data.values ?? []) as string[][];
      const idx       = mesasRows.findIndex(r => (r[0] ?? '').toString().trim().toUpperCase() === id);

      if (idx >= 0) {
        await sheets.spreadsheets.values.update({
          spreadsheetId,
          range: `${MESAS_TAB}!A${idx + 2}:B${idx + 2}`,
          valueInputOption: 'USER_ENTERED',
          requestBody: { values: [[id, nombre]] },
        });
      } else {
        await sheets.spreadsheets.values.append({
          spreadsheetId,
          range: `${MESAS_TAB}!A1`,
          valueInputOption: 'USER_ENTERED',
          requestBody: { values: [[id, nombre]] },
        });
      }

      return jsonOk();
    }

    if (body.action === 'delete') {
      const id = normalizeId(body.id);
      if (!id) throw new Error('Identificador de mesa inválido');

      const current = await sheets.spreadsheets.values.get({
        spreadsheetId,
        range: `${RSVP_TAB}!${MESA_COL}2:${MESA_COL}`,
      });
      const currentVals = (current.data.values ?? []) as string[][];

      const data: { range: string; values: string[][] }[] = [];
      currentVals.forEach((v, i) => {
        const row = i + 2;
        if ((v[0] ?? '').toString().trim().toUpperCase() === id) {
          data.push({ range: `${RSVP_TAB}!${MESA_COL}${row}`, values: [['']] });
        }
      });
      if (data.length) {
        await sheets.spreadsheets.values.batchUpdate({
          spreadsheetId,
          requestBody: { valueInputOption: 'USER_ENTERED', data },
        });
      }

      const meta       = await sheets.spreadsheets.get({ spreadsheetId });
      const mesasSheet = (meta.data.sheets ?? []).find((s: any) => s.properties?.title === MESAS_TAB);
      const mesasId    = mesasSheet?.properties?.sheetId;

      const mesasRes  = await sheets.spreadsheets.values.get({ spreadsheetId, range: `${MESAS_TAB}!A2:B` });
      const mesasRows = (mesasRes.data.values ?? []) as string[][];
      const idx       = mesasRows.findIndex(r => (r[0] ?? '').toString().trim().toUpperCase() === id);

      if (idx >= 0 && mesasId !== undefined) {
        await sheets.spreadsheets.batchUpdate({
          spreadsheetId,
          requestBody: {
            requests: [{
              deleteDimension: {
                range: { sheetId: mesasId, dimension: 'ROWS', startIndex: idx + 1, endIndex: idx + 2 },
              },
            }],
          },
        });
      }

      return jsonOk();
    }

    throw new Error('Acción no reconocida');
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('Mesas API error (POST):', msg);
    return new Response(JSON.stringify({
      ok: false,
      error: 'No se pudo guardar la distribución de mesas. Inténtalo de nuevo en unos minutos.',
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
