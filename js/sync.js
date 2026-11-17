// Sinkronisasi: pull (Sheets → cache) dan flush (outbox → Sheets).
import * as db from './db.js';
import * as sheets from './sheets.js';
import * as auth from './auth.js';
import { ensureStructure } from './drive.js';
import { SHEETS, SHEET_BY_NAME, SCHEMA_VERSION, keyOf, fromRow, colLetter } from './schema.js';
import { state, emit, replaceStore, setApp, runAutomations, migrateCategories, onWrite } from './store.js';

const rowMaps = {}; // nama sheet → Map(key → nomor baris)

const localList = store => (store === 'meta'
  ? Object.entries(state.meta).map(([key, value]) => ({ key, value, _k: key }))
  : state[store]);

// Setelah aplikasi diperbarui, pastikan sheet & kolom baru sudah ada sebelum membaca/menulis.
// Hanya menambah (sheet/kolom/header); data lama tidak disentuh. Sekali per versi struktur.
let ensuring = null;
export function ensureSchema() {
  if ((state.schemaOk || 0) >= SCHEMA_VERSION) return Promise.resolve();
  if (!ensuring) ensuring = (async () => {
    await ensureStructure(state.spreadsheetId);
    await setApp({ schemaOk: SCHEMA_VERSION });
  })().finally(() => { ensuring = null; });
  return ensuring;
}

export async function pull() {
  const id = state.spreadsheetId;
  const res = await sheets.batchGet(id, SHEETS.map(s => s.name));
  for (let i = 0; i < SHEETS.length; i++) {
    const s = SHEETS[i];
    const values = res.valueRanges[i]?.values || [];
    const header = (values[0] || s.cols).map(h => String(h).trim());
    const map = new Map();
    const byKey = new Map();
    for (let r = 1; r < values.length; r++) {
      const arr = values[r];
      if (!arr || arr.every(v => v === '' || v == null)) continue;
      const obj = fromRow(s.store, header, arr);
      const k = keyOf(s.store, obj);
      if (!k.replace(/\|/g, '')) continue; // baris tanpa kunci diabaikan
      if (!map.has(k)) map.set(k, r + 1);
      byKey.set(k, obj);
    }
    // item yang masih di outbox: versi lokal menang
    const pending = await db.outboxAll();
    const pend = new Set(pending.filter(o => o.sheet === s.name).map(o => o.key));
    if (pend.size) for (const o of localList(s.store)) if (pend.has(o._k)) byKey.set(o._k, o);
    rowMaps[s.name] = map;
    await replaceStore(s.store, [...byKey.values()]);
  }
  await setApp({ lastSync: Date.now() });
}

// Baca ulang kolom kunci untuk sheet tertentu (peta baris mungkin basi)
async function refreshKeys(names) {
  const ranges = names.map(n => {
    const s = SHEET_BY_NAME[n];
    const last = Math.max(...s.key.map(k => s.cols.indexOf(k))) + 1;
    return `${n}!A:${colLetter(last)}`;
  });
  const res = await sheets.batchGet(state.spreadsheetId, ranges);
  names.forEach((n, i) => {
    const s = SHEET_BY_NAME[n];
    const values = res.valueRanges[i]?.values || [];
    const map = new Map();
    for (let r = 1; r < values.length; r++) {
      const o = Object.fromEntries(s.cols.map((c, j) => [c, values[r]?.[j] ?? '']));
      const k = keyOf(s.store, o);
      if (k.replace(/\|/g, '') && !map.has(k)) map.set(k, r + 1);
    }
    rowMaps[n] = map;
  });
}

let flushing = null;
export function flush() {
  if (!flushing) flushing = doFlush().finally(() => { flushing = null; });
  return flushing;
}

async function doFlush() {
  if (state.mode !== 'google' || !state.spreadsheetId || !navigator.onLine) return;
  const ops = (await db.outboxAll()).sort((a, b) => a.seq - b.seq);
  state.pending = ops.length;
  if (!ops.length) { emit(); return; }
  if (!auth.getToken()) { state.needsAuth = true; emit(); return; }
  const id = state.spreadsheetId;
  state.syncing = true; emit();
  try {
    await ensureSchema();
    await refreshKeys([...new Set(ops.map(o => o.sheet))]);
    const updates = [];
    const appends = new Map(); // sheet → ops
    for (const op of ops) {
      const s = SHEET_BY_NAME[op.sheet];
      const row = rowMaps[op.sheet].get(op.key);
      if (row) updates.push({ op, range: `${op.sheet}!A${row}:${colLetter(s.cols.length)}${row}` });
      else {
        // cek idempoten: key yang sama dalam satu batch append cukup sekali
        if (!appends.has(op.sheet)) appends.set(op.sheet, []);
        appends.get(op.sheet).push(op);
      }
    }
    if (updates.length) {
      await sheets.valuesBatchUpdate(id, updates.map(u => ({ range: u.range, values: [u.op.row] })));
      for (const u of updates) await db.outboxDeleteIfSame(u.op.seq, u.op.row);
    }
    for (const [sheet, list] of appends) {
      const r = await sheets.append(id, sheet, list.map(o => o.row));
      const first = sheets.firstRowOf(r?.updates?.updatedRange);
      list.forEach((o, i) => { if (first) rowMaps[sheet].set(o.key, first + i); });
      for (const o of list) await db.outboxDeleteIfSame(o.seq, o.row);
    }
    state.needsAuth = false;
  } finally {
    state.syncing = false;
    state.pending = await db.outboxCount();
    emit();
  }
  // ada perubahan baru selama flush berjalan
  if (state.pending > 0 && auth.getToken()) setTimeout(() => flush().catch(handleError), 50);
}

export function handleError(e) {
  if (e instanceof sheets.AuthError) { state.needsAuth = true; emit(); return; }
  console.warn('[sync]', e);
}

// Sinkron penuh: kirim outbox → tarik data → admin otomatis → kirim lagi
let syncingAll = null;
export function syncAll() {
  if (!syncingAll) syncingAll = (async () => {
    if (state.mode !== 'google') return;
    if (!navigator.onLine) { emit(); return; }
    if (!auth.getToken()) { state.needsAuth = true; emit(); return; }
    state.syncing = true; emit();
    try {
      await ensureSchema();
      await flush();
      await pull();
      await migrateCategories();
      await runAutomations();
      await flush();
      state.needsAuth = false;
    } catch (e) { handleError(e); throw e; } finally { state.syncing = false; emit(); }
  })().finally(() => { syncingAll = null; });
  return syncingAll;
}

let timer = null;
export function scheduleFlush(ms = 400) {
  if (state.mode !== 'google') return;
  clearTimeout(timer);
  timer = setTimeout(() => flush().catch(handleError), ms);
}

onWrite(() => scheduleFlush());
