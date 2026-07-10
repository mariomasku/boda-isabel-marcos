import type { APIRoute } from 'astro';
import { google } from 'googleapis';

export const prerender = false;

// [token buscado en la celda, etiqueta a mostrar]. El token debe coincidir
// (sin distinguir mayúsculas) con el nombre limpio que escribe rsvp.ts.
const ALLERGENS: [string, string][] = [
  ['Gluten',       'Gluten (celiaquía)'],
  ['Lactosa',      'Lactosa / lácteos'],
  ['Huevo',        'Huevo'],
  ['Frutos secos', 'Frutos secos'],
  ['Cacahuete',    'Cacahuete'],
  ['Marisco',      'Marisco'],
  ['Pescado',      'Pescado'],
  ['Soja',         'Soja'],
  ['Sésamo',       'Sésamo'],
  ['Mostaza',      'Mostaza'],
  ['Apio',         'Apio'],
  ['Sulfitos',     'Sulfitos'],
  ['Altramuces',   'Altramuces (lupino)'],
  ['Moluscos',     'Moluscos'],
];

const BEBIDAS = ['Whisky', 'Ginebra', 'Ron', 'Vodka'];

// Normaliza para comparaciones sin distinguir mayúsculas/acentos de caja.
const U = (v: unknown): string => (v == null ? '' : String(v)).toUpperCase();
const eq  = (a: unknown, b: string) => U(a) === b.toUpperCase();
const has = (a: unknown, b: string) => U(a).includes(b.toUpperCase());

export const GET: APIRoute = async () => {
  try {
    const keyJson = import.meta.env.GOOGLE_SERVICE_ACCOUNT_KEY;
    if (!keyJson) throw new Error('GOOGLE_SERVICE_ACCOUNT_KEY no configurada');
    const credentials = JSON.parse(keyJson);
    if (credentials.private_key) credentials.private_key = credentials.private_key.replace(/\\n/g, '\n');

    const spreadsheetId = import.meta.env.GOOGLE_SHEET_ID;
    const auth   = new google.auth.GoogleAuth({ credentials, scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'] });
    const sheets = google.sheets({ version: 'v4', auth });

    const res  = await sheets.spreadsheets.values.get({ spreadsheetId, range: 'RSVP!A2:M' });
    const rows = (res.data.values ?? []) as string[][];

    // Col indices (0-based): C=2(ROL), E=4(ASISTENCIA), F=5(EDAD), G=6(INTOL), H=7(OTROS), I=8(BEBIDA), J=9(AUTOBUS), K=10(PLAZAS)
    const si     = rows.filter(r => eq(r[4], 'Sí'));
    const no     = rows.filter(r => eq(r[4], 'No')).length;
    const adultos = si.filter(r => eq(r[2], 'Invitado') || eq(r[2], 'Acompañante')).length;
    const ninos   = si.filter(r => eq(r[2], 'Niño/a')).length;

    const busIda    = si.reduce((s, r) => (eq(r[9], 'Ida y vuelta') || eq(r[9], 'Solo ida'))    ? s + (parseInt(r[10]) || 0) : s, 0);
    const busVuelta = si.reduce((s, r) => (eq(r[9], 'Ida y vuelta') || eq(r[9], 'Solo vuelta')) ? s + (parseInt(r[10]) || 0) : s, 0);

    const toPersona = (r: string[], extra = '') => ({
      nombre: extra ? `${r[1] ?? ''} — ${extra}` : (r[1] ?? ''),
      nino: eq(r[2], 'Niño/a'),
    });

    const intolerancias = ALLERGENS.map(([token, label]) => {
      const afectados = rows.filter(r => has(r[6], token));
      return {
        nombre: label,
        count: afectados.length,
        personas: afectados.filter(r => r[1]).map(r => toPersona(r)),
      };
    });
    const otros = rows.filter(r => (r[7] ?? '').trim() !== '');

    const bebidas = BEBIDAS.map(nombre => ({
      nombre,
      count: rows.filter(r => has(r[8], nombre)).length,
    }));

    const totalRows = rows.length;

    return new Response(JSON.stringify({
      ok: true,
      totalRegistros: totalRows,
      asistencia: { total: si.length, adultos, ninos, noAsisten: no },
      autobus: { ida: busIda, vuelta: busVuelta },
      intolerancias: [...intolerancias, {
        nombre: 'Otros especificados',
        count: otros.length,
        personas: otros.filter(r => r[1]).map(r => toPersona(r, r[7])),
      }],
      bebidas,
      sheetUrl: `https://docs.google.com/spreadsheets/d/${spreadsheetId}`,
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return new Response(JSON.stringify({ ok: false, error: msg }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
