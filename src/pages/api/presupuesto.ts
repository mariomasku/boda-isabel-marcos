import type { APIRoute } from 'astro';
import { google } from 'googleapis';
import { CATEGORIES_WITH_COST } from '../../lib/plannerConfig';

export const prerender = false;

function colLetter(n: number): string {
  let s = '';
  while (n > 0) {
    const rem = (n - 1) % 26;
    s = String.fromCharCode(65 + rem) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

const toNumber = (v: unknown): number => {
  const n = parseFloat(String(v ?? '').trim().replace(',', '.'));
  return Number.isFinite(n) ? n : 0;
};

async function getSheetsClient() {
  const keyJson = import.meta.env.GOOGLE_SERVICE_ACCOUNT_KEY;
  if (!keyJson) throw new Error('GOOGLE_SERVICE_ACCOUNT_KEY no configurada');
  const credentials = JSON.parse(keyJson);
  if (credentials.private_key) credentials.private_key = credentials.private_key.replace(/\\n/g, '\n');

  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
  });
  return google.sheets({ version: 'v4', auth });
}

// ── GET ──────────────────────────────────────────────────────
// Agrega, sin escribir nada, todos los campos marcados isCost de las categorías
// del gestor de boda. Solo lee las pestañas que ya existen (no crea ninguna):
// una categoría todavía sin visitar simplemente aporta 0 al total.
export const GET: APIRoute = async () => {
  try {
    const sheets         = await getSheetsClient();
    const spreadsheetId  = import.meta.env.GOOGLE_SHEET_ID;

    const meta        = await sheets.spreadsheets.get({ spreadsheetId });
    const existingTabs = new Set((meta.data.sheets ?? []).map((s: any) => s.properties?.title));

    const categories = await Promise.all(CATEGORIES_WITH_COST.map(async (cat) => {
      const costFields  = cat.fields.filter(f => f.isCost);
      const firstIdx    = 0; // primer campo de la categoría, usado como nombre del concepto

      if (!existingTabs.has(cat.sheetTab)) {
        return { id: cat.id, label: cat.label, total: 0, concepts: [] as { nombre: string; fieldLabel: string; value: number }[] };
      }

      const lastCol = colLetter(cat.fields.length);
      const res     = await sheets.spreadsheets.values.get({
        spreadsheetId,
        range: `${cat.sheetTab}!A2:${lastCol}`,
      });
      const rows = (res.data.values ?? []) as string[][];

      const concepts: { nombre: string; fieldLabel: string; value: number }[] = [];
      rows.forEach(r => {
        if (!r.some(v => (v ?? '').toString().trim() !== '')) return;
        const nombre = (r[firstIdx] ?? '').toString().trim() || '(sin nombre)';
        costFields.forEach(f => {
          const idx   = cat.fields.indexOf(f);
          const value = toNumber(r[idx]);
          if (value > 0) concepts.push({ nombre, fieldLabel: f.label, value });
        });
      });

      const total = concepts.reduce((s, c) => s + c.value, 0);
      return { id: cat.id, label: cat.label, total, concepts };
    }));

    const grandTotal = categories.reduce((s, c) => s + c.total, 0);

    return new Response(JSON.stringify({ ok: true, grandTotal, categories }), {
      status: 200,
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('Presupuesto API error:', msg);
    return new Response(JSON.stringify({ ok: false, error: 'No se pudo calcular el presupuesto.' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
