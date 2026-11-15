// State aplikasi + operasi tulis. Semua layar membaca dari sini.
import { keyOf } from './schema.js';
import { nowISO } from './dates.js';
import { setPrivacy as setFmtPrivacy } from './format.js';
import { demoData } from './dummy.js';

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

export async function init() {
  const d = demoData();
  Object.assign(state, d, { mode: 'local', ready: true, user: { email: 'demo@okane.app', name: 'Demo' } });
  state.privacy = localStorage.getItem('privacy') === '1' || localStorage.getItem('privacyOnOpen') === '1';
  setFmtPrivacy(state.privacy);
  emit();
}

export async function put(store, obj) {
  const k = keyOf(store, obj);
  if (store === 'meta') { state.meta[obj.key] = obj.value; emit(); return obj; }
  const arr = state[store];
  const i = arr.findIndex(x => keyOf(store, x) === k);
  if (i >= 0) arr[i] = obj; else arr.push(obj);
  emit();
  return obj;
}

export async function putMany(store, list) { for (const o of list) await put(store, o); }

const stampNew = o => { const now = nowISO(); return { ...o, dibuat: o.dibuat || now, diubah: now }; };

export async function saveTx(tx) {
  const base = { id: crypto.randomUUID(), akun_tujuan: '', biaya_admin: 0, kategori: '', catatan: '', tagihan_id: '', periode: '', sumber: 'manual', dihapus: false };
  return put('transaksi', stampNew({ ...base, ...tx }));
}
export async function deleteTx(id) {
  const t = state.transaksi.find(x => x.id === id);
  if (t) await put('transaksi', { ...t, dihapus: true, diubah: nowISO() });
}
export async function saveAccount(acc) {
  const base = { id: crypto.randomUUID(), keterangan: '', saldo_awal: 0, saldo_minimum: 0, admin_nominal: 0, admin_jadwal: '', admin_kategori: '', urutan: state.rekening.length + 1, arsip: false };
  return put('rekening', stampNew({ ...base, ...acc }));
}
export async function saveCategory(cat) { return put('kategori', { urutan: state.kategori.length + 1, arsip: false, ...cat }); }
export async function saveBill(b) {
  const base = { id: crypto.randomUUID(), kategori: 'Tagihan', aktif: true };
  return put('tagihan', stampNew({ ...base, ...b }));
}
// Simpan budget satu bulan (semua kategori keluar, 0 untuk yang dikosongkan)
export async function saveBudget(month, map) {
  const names = state.kategori.filter(k => k.tipe === 'keluar').map(k => k.nama);
  await putMany('budget', names.map(n => ({ bulan: month, kategori: n, batas: Number(map[n]) || 0 })));
}
export async function setMeta(key, value) { return put('meta', { key, value: String(value) }); }

export function setPrivacy(on) {
  state.privacy = !!on;
  try { localStorage.setItem('privacy', on ? '1' : '0'); } catch {}
  setFmtPrivacy(state.privacy);
  emit();
}

export const findCategory = (tipe, nama) => state.kategori.find(k => k.tipe === tipe && k.nama === nama);
export const findAccount = id => state.rekening.find(r => r.id === id);
