// State aplikasi + operasi tulis. Semua layar membaca dari sini.
// Tulis: ubah cache (state + IndexedDB) dulu → masukkan ke outbox → minta flush.
import * as db from './db.js';
import { keyOf, toRow, STORES, SHEET_BY_STORE, DEFAULT_CATEGORIES } from './schema.js';
import { nowISO, todayISO } from './dates.js';
import { setPrivacy as setFmtPrivacy } from './format.js';
import { dueAdminCharges } from './model.js';

export const state = {
  ready: false,
  mode: null,            // 'google' | 'local' | null (belum setup)
  user: null,            // { email, name }
  spreadsheetId: null,
  rekening: [], transaksi: [], kategori: [], budget: [], tagihan: [], meta: {},
  pending: 0,            // jumlah operasi di outbox
  syncing: false,
  needsAuth: false,
  lastSync: null,
  privacy: false,
};

const listeners = new Set();
let queued = false;
export function subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); }
export function emit() {
  if (queued) return;
  queued = true;
  queueMicrotask(() => { queued = false; for (const fn of listeners) fn(state); });
}

// Dipanggil setiap ada tulisan (diisi sync.js)
let writeHook = null;
export const onWrite = fn => { writeHook = fn; };

const withKey = (store, o) => ({ ...o, _k: keyOf(store, o) });

function setStoreState(store, list) {
  if (store === 'meta') state.meta = Object.fromEntries(list.map(x => [x.key, x.value]));
  else state[store] = list;
}

export async function init() {
  const app = await db.allApp();
  for (const s of STORES) setStoreState(s, await db.getAll(s));
  state.mode = app.mode || null;
  state.user = app.user || null;
  state.spreadsheetId = app.spreadsheetId || null;
  state.lastSync = app.lastSync || null;
  state.pending = await db.outboxCount();
  let priv = false;
  try { priv = localStorage.getItem('privacyOnOpen') === '1' || localStorage.getItem('privacy') === '1'; } catch {}
  state.privacy = priv;
  setFmtPrivacy(priv);
  state.ready = true;
  emit();
}

export async function setApp(patch) {
  for (const [k, v] of Object.entries(patch)) { state[k] = v; await db.setApp(k, v); }
  emit();
}

async function persist(store, objs) {
  await db.putAll(store, objs);
  if (state.mode === 'google') {
    const sheet = SHEET_BY_STORE[store].name;
    for (const o of objs) await db.outboxAdd({ sheet, key: o._k, op: 'upsert', row: toRow(store, o) });
    state.pending = await db.outboxCount();
  }
}

export async function putMany(store, list) {
  if (!list.length) return [];
  const objs = list.map(o => withKey(store, o));
  if (store === 'meta') for (const o of objs) state.meta[o.key] = o.value;
  else {
    const arr = state[store];
    const idx = new Map(arr.map((x, i) => [x._k ?? keyOf(store, x), i]));
    for (const o of objs) { const i = idx.get(o._k); if (i != null) arr[i] = o; else { idx.set(o._k, arr.length); arr.push(o); } }
  }
  emit();
  await persist(store, objs);
  emit();
  writeHook?.();
  return objs;
}
export const put = async (store, obj) => (await putMany(store, [obj]))[0];

// Ganti isi cache dari hasil pull (tanpa outbox)
export async function replaceStore(store, list) {
  const objs = list.map(o => withKey(store, o));
  await db.replaceAll(store, objs);
  setStoreState(store, objs);
}

const stamp = o => { const now = nowISO(); return { ...o, dibuat: o.dibuat || now, diubah: now }; };

export async function saveTx(tx) {
  const base = { id: crypto.randomUUID(), akun_tujuan: '', biaya_admin: 0, kategori: '', catatan: '', tagihan_id: '', periode: '', sumber: 'manual', dihapus: false };
  return put('transaksi', stamp({ ...base, ...tx }));
}
export async function deleteTx(id) {
  const t = state.transaksi.find(x => x.id === id);
  if (t) await put('transaksi', { ...t, dihapus: true, diubah: nowISO() });
}
export async function saveAccount(acc) {
  const base = { id: crypto.randomUUID(), keterangan: '', saldo_awal: 0, saldo_minimum: 0, admin_nominal: 0, admin_jadwal: '', admin_kategori: '', urutan: state.rekening.length + 1, arsip: false };
  return put('rekening', stamp({ ...base, ...acc }));
}
export async function saveCategory(cat) {
  const max = Math.max(0, ...state.kategori.map(k => Number(k.urutan) || 0));
  return put('kategori', { urutan: max + 1, arsip: false, ...cat });
}
export async function saveBill(b) {
  const base = { id: crypto.randomUUID(), kategori: 'Tagihan', aktif: true };
  return put('tagihan', stamp({ ...base, ...b }));
}
// Simpan budget satu bulan (semua kategori keluar; 0 untuk yang dikosongkan)
export async function saveBudget(month, map) {
  const names = [...new Set(state.kategori.filter(k => k.tipe === 'keluar').map(k => k.nama))];
  return putMany('budget', names.map(n => ({ bulan: month, kategori: n, batas: Number(map[n]) || 0 })));
}
export async function setMeta(key, value) { return put('meta', { key, value: String(value) }); }

// Admin otomatis: catat potongan yang sudah jatuh tempo (idempoten via id deterministik)
export async function runAutomations() {
  const due = dueAdminCharges(state.rekening, state.transaksi, todayISO());
  if (!due.length) return 0;
  const now = nowISO();
  await putMany('transaksi', due.map(t => ({ ...t, dibuat: now, diubah: now })));
  return due.length;
}

// Mode lokal (tanpa Google): data hanya di HP
export async function startLocal() {
  await setApp({ mode: 'local', user: null, spreadsheetId: null });
  if (!state.kategori.length) await putMany('kategori', DEFAULT_CATEGORIES);
}

export async function resetAll() {
  await db.clearAll();
  for (const s of STORES) setStoreState(s, []);
  Object.assign(state, { mode: null, user: null, spreadsheetId: null, pending: 0, lastSync: null, needsAuth: false });
  emit();
}

export function setPrivacy(on) {
  state.privacy = !!on;
  try { localStorage.setItem('privacy', on ? '1' : '0'); } catch {}
  setFmtPrivacy(state.privacy);
  emit();
}

export const findCategory = (tipe, nama) => state.kategori.find(k => k.tipe === tipe && k.nama === nama);
export const findAccount = id => state.rekening.find(r => r.id === id);
