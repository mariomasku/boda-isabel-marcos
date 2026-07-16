import type { APIRoute } from 'astro';
import { google } from 'googleapis';
import { getCategory, type FieldConfig } from '../../lib/plannerConfig';

export const prerender = false;

const rgb = (hex: string) => ({
  red:   parseInt(hex.slice(0, 2), 16) / 255,
  green: parseInt(hex.slice(2, 4), 16) / 255,
  blue:  parseInt(hex.slice(4, 6), 16) / 255,
});
const EUCALIPTO = rgb('47635f');
const OLIVA     = rgb('d7d5b1');

// Convierte un índice de columna 1-based en su letra de Sheets (1→A, 27→AA...).
function colLetter(n: number): string {
  let s = '';
  while (n > 0) {
    const rem = (n - 1) % 26;
    s = String.fromCharCode(65 + rem) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

const headerFor = (key: string) => key.toUpperCase().replace(/_/g, ' ');

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

// Crea la pestaña de la categoría si no existe y (re)aplica cabecera + formato. Idempotente.
async function ensureCategorySheet(
  sheets: any, spreadsheetId: string, tab: string, fields: FieldConfig[],
): Promise<number> {
  const meta      = await sheets.spreadsheets.get({ spreadsheetId });
  const allSheets = (meta.data.sheets ?? []) as any[];
  let sheetInfo   = allSheets.find(s => s.properties?.title === tab);

  if (!sheetInfo) {
    const res = await sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: { requests: [{ addSheet: { properties: { title: tab } } }] },
    });
    const added = (res.data.replies ?? []).find((r: any) => r.addSheet);
    sheetInfo = { properties: added?.addSheet?.properties };
  }

  const sheetId = sheetInfo.properties.sheetId;
  const lastCol = colLetter(fields.length);

  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `${tab}!A1:${lastCol}1`,
    valueInputOption: 'USER_ENTERED',
    requestBody: { values: [fields.map(f => headerFor(f.key))] },
  });

  await sheets.spreadsheets.batchUpdate({
    spreadsheetId,
    requestBody: {
      requests: [
        {
          repeatCell: {
            range: { sheetId, startRowIndex: 0, endRowIndex: 1, startColumnIndex: 0, endColumnIndex: fields.length },
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
            properties: { sheetId, gridProperties: { frozenRowCount: 1 } },
            fields: 'gridProperties.frozenRowCount',
          },
        },
      ],
    },
  });

  return sheetId;
}

// ── GET ?cat=<id> ────────────────────────────────────────────
export const GET: APIRoute = async ({ url }) => {
  try {
    const catId = url.searchParams.get('cat') ?? '';
    const cat   = getCategory(catId);
    if (!cat) {
      return new Response(JSON.stringify({ ok: false, error: 'Categoría no reconocida' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const sheets        = await getSheetsClient(false);
    const spreadsheetId = import.meta.env.GOOGLE_SHEET_ID;

    await ensureCategorySheet(sheets, spreadsheetId, cat.sheetTab, cat.fields);

    const lastCol = colLetter(cat.fields.length);
    const res     = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: `${cat.sheetTab}!A2:${lastCol}`,
    });
    const rows = (res.data.values ?? []) as string[][];

    const items = rows
      .map((r, i) => ({ row: i + 2, r }))
      .filter(({ r }) => r.some(v => (v ?? '').toString().trim() !== ''))
      .map(({ row, r }) => {
        const values: Record<string, string> = {};
        cat.fields.forEach((f, idx) => { values[f.key] = r[idx] ?? ''; });
        return { row, values };
      });

    return new Response(JSON.stringify({ ok: true, items }), {
      status: 200,
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('Planner API error (GET):', msg);
    return new Response(JSON.stringify({ ok: false, error: 'No se pudieron cargar los datos.' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};

// ── POST { cat, action, ... } ────────────────────────────────
export const POST: APIRoute = async ({ request }) => {
  try {
    const body = await request.json() as {
      cat: string; action: string; values?: Record<string, string>; row?: number;
    };
    const cat = getCategory(body.cat);
    if (!cat) {
      return new Response(JSON.stringify({ ok: false, error: 'Categoría no reconocida' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const sheets         = await getSheetsClient(false);
    const spreadsheetId  = import.meta.env.GOOGLE_SHEET_ID;
    const sheetId         = await ensureCategorySheet(sheets, spreadsheetId, cat.sheetTab, cat.fields);
    const lastCol         = colLetter(cat.fields.length);

    if (body.action === 'save') {
      const values    = body.values ?? {};
      const rowValues = cat.fields.map(f => String(values[f.key] ?? ''));

      if (body.row) {
        await sheets.spreadsheets.values.update({
          spreadsheetId,
          range: `${cat.sheetTab}!A${body.row}:${lastCol}${body.row}`,
          valueInputOption: 'USER_ENTERED',
          requestBody: { values: [rowValues] },
        });
        return new Response(JSON.stringify({ ok: true, row: body.row }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      const appendRes = await sheets.spreadsheets.values.append({
        spreadsheetId,
        range: `${cat.sheetTab}!A1`,
        valueInputOption: 'USER_ENTERED',
        requestBody: { values: [rowValues] },
      });
      const updatedRange = appendRes.data.updates?.updatedRange ?? '';
      const rowMatch      = updatedRange.match(/[A-Z]+(\d+)/);
      const newRow         = rowMatch ? parseInt(rowMatch[1], 10) : undefined;

      return new Response(JSON.stringify({ ok: true, row: newRow }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    if (body.action === 'delete') {
      if (!body.row) throw new Error('Fila no especificada');
      await sheets.spreadsheets.batchUpdate({
        spreadsheetId,
        requestBody: {
          requests: [{
            deleteDimension: {
              range: { sheetId, dimension: 'ROWS', startIndex: body.row - 1, endIndex: body.row },
            },
          }],
        },
      });
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    throw new Error('Acción no reconocida');
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('Planner API error (POST):', msg);
    return new Response(JSON.stringify({
      ok: false,
      error: 'No se pudo guardar. Inténtalo de nuevo en unos minutos.',
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
