import type { APIRoute } from 'astro';
import { google } from 'googleapis';

export const prerender = false;

const ALLERGENS: [string, string][] = [
  ['GLUTEN',       'Gluten (celiaquía)'],
  ['LACTOSA',      'Lactosa / lácteos'],
  ['HUEVO',        'Huevo'],
  ['FRUTOS_SECOS', 'Frutos secos'],
  ['CACAHUETE',    'Cacahuete'],
  ['MARISCO',      'Marisco'],
  ['PESCADO',      'Pescado'],
  ['SOJA',         'Soja'],
  ['SESAMO',       'Sésamo'],
  ['MOSTAZA',      'Mostaza'],
  ['APIO',         'Apio'],
  ['SULFITOS',     'Sulfitos'],
  ['ALTRAMUCES',   'Altramuces (lupino)'],
  ['MOLUSCOS',     'Moluscos'],
];

const BEBIDAS = ['WHISKY', 'GINEBRA', 'RON', 'VODKA'];
const BEBIDA_LABELS: Record<string, string> = {
  WHISKY: 'Whisky', GINEBRA: 'Ginebra', RON: 'Ron', VODKA: 'Vodka',
};

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
    const si     = rows.filter(r => r[4] === 'SÍ');
    const no     = rows.filter(r => r[4] === 'NO').length;
    const adultos = si.filter(r => r[2] === 'INVITADO' || r[2] === 'ACOMPAÑANTE').length;
    const ninos   = si.filter(r => r[2] === 'NIÑO/A').length;

    const busIda    = si.reduce((s, r) => (r[9] === 'IDA Y VUELTA' || r[9] === 'SOLO IDA')    ? s + (parseInt(r[10]) || 0) : s, 0);
    const busVuelta = si.reduce((s, r) => (r[9] === 'IDA Y VUELTA' || r[9] === 'SOLO VUELTA') ? s + (parseInt(r[10]) || 0) : s, 0);

    const toPersona = (r: string[], extra = '') => ({
      nombre: extra ? `${r[1] ?? ''} — ${extra}` : (r[1] ?? ''),
      nino: r[2] === 'NIÑO/A',
    });

    const intolerancias = ALLERGENS.map(([key, label]) => {
      const afectados = rows.filter(r => (r[6] ?? '').includes(key));
      return {
        nombre: label,
        count: afectados.length,
        personas: afectados.filter(r => r[1]).map(r => toPersona(r)),
      };
    });
    const otros = rows.filter(r => (r[7] ?? '').trim() !== '');

    const bebidas = BEBIDAS.map(key => ({
      nombre: BEBIDA_LABELS[key],
      count: rows.filter(r => (r[8] ?? '').includes(key)).length,
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
