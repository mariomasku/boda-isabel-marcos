import type { APIRoute } from 'astro';
import { google } from 'googleapis';

const HEADERS = [
  'Fecha', 'Nombre', 'Asistencia', 'Acompañante', 'Nombre acompañante',
  'Niños', 'Datos niños', 'Alergias', 'Bebida', 'Autobús', 'Plazas bus',
  'Canción', 'Comentarios',
];

export const POST: APIRoute = async ({ request }) => {
  try {
    const data = await request.json() as Record<string, string | string[]>;

    const raw = import.meta.env.GOOGLE_SERVICE_ACCOUNT_KEY;
    const credentials = JSON.parse(raw);
    // Vercel a veces escapa los saltos de línea de la clave privada
    if (credentials.private_key) {
      credentials.private_key = credentials.private_key.replace(/\\n/g, '\n');
    }

    const sheetId = import.meta.env.GOOGLE_SHEET_ID;

    const auth = new google.auth.GoogleAuth({
      credentials,
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });
    const sheets = google.sheets({ version: 'v4', auth });

    // Agrupar datos de niños en una sola celda
    const ninoCount = parseInt(String(data.ninos_count || '0')) || 0;
    const ninosData: string[] = [];
    for (let i = 1; i <= ninoCount; i++) {
      const nombre = String(data[`nino_${i}_nombre`] || '');
      const edad   = String(data[`nino_${i}_edad`]   || '');
      if (nombre) ninosData.push(`${nombre} (${edad} años)`);
    }

    const row = [
      new Date().toLocaleString('es-ES', { timeZone: 'Europe/Madrid' }),
      data.nombre              || '',
      data.asistencia          || '',
      data.acompanante         || '',
      data.acompanante_nombre  || '',
      data.ninos               || '',
      ninosData.join(' · ')    || '',
      data.alergias            || '',
      Array.isArray(data.bebida) ? data.bebida.join(', ') : (data.bebida || ''),
      data.autobus             || '',
      data.bus_plazas          || '',
      data.cancion             || '',
      data.comentarios         || '',
    ];

    // Si la hoja está vacía, añadir fila de cabecera primero
    const existing = await sheets.spreadsheets.values.get({
      spreadsheetId: sheetId,
      range: 'A1',
    });
    if (!existing.data.values?.length) {
      await sheets.spreadsheets.values.update({
        spreadsheetId: sheetId,
        range: 'A1',
        valueInputOption: 'USER_ENTERED',
        requestBody: { values: [HEADERS] },
      });
    }

    await sheets.spreadsheets.values.append({
      spreadsheetId: sheetId,
      range: 'A1',
      valueInputOption: 'USER_ENTERED',
      requestBody: { values: [row] },
    });

    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('RSVP API error:', err);
    return new Response(JSON.stringify({ ok: false }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
