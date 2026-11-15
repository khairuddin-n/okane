// Wrapper Google Sheets API (dan helper fetch ber-token yang juga dipakai drive.js)
import * as auth from './auth.js';

const BASE = 'https://sheets.googleapis.com/v4/spreadsheets';

export class AuthError extends Error { constructor() { super('Perlu masuk lagi ke Google'); this.name = 'AuthError'; } }

export async function api(url, { method = 'GET', body } = {}) {
  const tok = auth.getToken();
  if (!tok) throw new AuthError();
  const res = await fetch(url, {
    method,
    headers: { Authorization: `Bearer ${tok}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (res.status === 401) { auth.invalidate(); throw new AuthError(); }
  if (!res.ok) {
    let msg = `${res.status}`;
    try { const j = await res.json(); msg = j.error?.message || msg; } catch {}
    throw Object.assign(new Error(`Google API: ${msg}`), { status: res.status });
  }
  return res.status === 204 ? null : res.json();
}

const enc = encodeURIComponent;

export const getSpreadsheet = id => api(`${BASE}/${id}?fields=sheets.properties(sheetId,title)`);

export const batchGet = (id, ranges) =>
  api(`${BASE}/${id}/values:batchGet?${ranges.map(r => `ranges=${enc(r)}`).join('&')}&valueRenderOption=UNFORMATTED_VALUE&dateTimeRenderOption=FORMATTED_STRING`);

export const append = (id, sheet, rows) =>
  api(`${BASE}/${id}/values/${enc(`${sheet}!A1`)}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`, { method: 'POST', body: { values: rows } });

export const update = (id, range, rows) =>
  api(`${BASE}/${id}/values/${enc(range)}?valueInputOption=RAW`, { method: 'PUT', body: { values: rows } });

export const valuesBatchUpdate = (id, data) =>
  api(`${BASE}/${id}/values:batchUpdate`, { method: 'POST', body: { valueInputOption: 'RAW', data } });

export const batchUpdate = (id, requests) =>
  api(`${BASE}/${id}:batchUpdate`, { method: 'POST', body: { requests } });

// "Transaksi!A15:P17" → 15
export const firstRowOf = range => { const m = /![A-Z]+(\d+)/.exec(range || ''); return m ? Number(m[1]) : null; };
