// State aplikasi + operasi tulis. Semua layar membaca dari sini.
// Tulis: ubah cache (state + IndexedDB) dulu → masukkan ke outbox → minta flush.
import * as db from './db.js';
import { keyOf, toRow, STORES, SHEET_BY_STORE, DEFAULT_CATEGORIES } from './schema.js';
import { nowISO, todayISO, hhmm } from './dates.js';
import { setPrivacy as setFmtPrivacy } from './format.js';
import { dueAdminCharges, dueRecurring, applyShares, num, BILL_CATEGORY } from './model.js';
import { planCategoryMigration, CATEGORY_VERSION } from './migrate.js';

export const state = {
  ready: false,
  mode: null,            // 'google' | 'local' | null (belum setup)
  user: null,            // { email, name }
  spreadsheetId: null,
  rekening: [], transaksi: [], kategori: [], budget: [], tagihan: [], meta: {},
  berulang: [], piutang: [], target: [],
  schemaOk: 0,           // versi struktur spreadsheet yang sudah dipastikan (lihat sync.ensureSchema)
  rev: 0,                // naik setiap data berubah (untuk memo)
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
  state.rev++;
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
  state.schemaOk = app.schemaOk || 0;
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

// Perekam untuk tombol Batalkan: mencatat isi sebelum diubah (null = baris baru)
let recorder = null;

export async function putMany(store, list, { record = true } = {}) {
  if (!list.length) return [];
  const objs = list.map(o => withKey(store, o));
  state.rev++;
  if (store === 'meta') for (const o of objs) state.meta[o.key] = o.value;
  else {
    const arr = state[store];
    const idx = new Map(arr.map((x, i) => [x._k ?? keyOf(store, x), i]));
    for (const o of objs) {
      const i = idx.get(o._k);
      if (record && recorder && !recorder.has(`${store}|${o._k}`)) recorder.set(`${store}|${o._k}`, { store, k: o._k, prev: i != null ? arr[i] : null });
      if (i != null) arr[i] = o; else { idx.set(o._k, arr.length); arr.push(o); }
    }
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
  const base = { id: crypto.randomUUID(), akun_tujuan: '', biaya_admin: 0, kategori: '', catatan: '', tagihan_id: '', periode: '', sumber: 'manual', dihapus: false, berulang_id: '' };
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
  const base = { id: crypto.randomUUID(), kategori: BILL_CATEGORY, aktif: true, tenor: 0, cicilan_mulai: '' };
  return put('tagihan', stamp({ ...base, ...b }));
}
// Simpan budget satu bulan (semua kategori keluar; 0 untuk yang dikosongkan)
export async function saveBudget(month, map) {
  const names = [...new Set(state.kategori.filter(k => k.tipe === 'keluar').map(k => k.nama))];
  return putMany('budget', names.map(n => ({ bulan: month, kategori: n, batas: Number(map[n]) || 0 })));
}
export async function setMeta(key, value) { return put('meta', { key, value: String(value) }); }

// Transaksi untuk statistik (talangan hanya dihitung bagianmu). Saldo tetap pakai state.transaksi.
let statMemo = { rev: -1, list: [] };
export function statTx() {
  if (statMemo.rev !== state.rev) statMemo = { rev: state.rev, list: applyShares(state.transaksi, state.piutang) };
  return statMemo.list;
}

// ---------- Batalkan ----------
// Jalankan fn sambil merekam; mengembalikan fungsi undo.
export async function withUndo(fn) {
  const rec = new Map();
  recorder = rec;
  try { await fn(); } finally { recorder = null; }
  return () => revert([...rec.values()].reverse());
}

async function revert(entries) {
  const now = nowISO();
  // aturan berulang yang dibatalkan: transaksi otomatis buatannya ikut dibatalkan
  const rules = new Set(entries.filter(e => e.store === 'berulang' && !e.prev).map(e => e.k));
  if (rules.size) entries = [...state.transaksi.filter(t => rules.has(t.berulang_id) && t.sumber === 'otomatis' && !t.dihapus).map(t => ({ store: 'transaksi', k: t._k, prev: null })), ...entries];
  for (const { store, k, prev } of entries) {
    if (prev) { await putMany(store, [{ ...prev, diubah: now }], { record: false }); continue; }
    // baris baru: kalau belum terkirim, buang dari outbox & cache; kalau sudah, hapus (soft delete)
    const sheet = SHEET_BY_STORE[store].name;
    const unsent = state.mode !== 'google' || (!state.syncing && await db.outboxTake(sheet, k));
    const i = state[store].findIndex(x => x._k === k);
    if (i < 0) continue;
    if (unsent) {
      state[store].splice(i, 1); state.rev++;
      await db.del(store, k);
      state.pending = await db.outboxCount();
    } else {
      await putMany(store, [{ ...state[store][i], dihapus: true, diubah: now }], { record: false });
    }
  }
  emit();
}

// ---------- Transaksi berulang, piutang, target ----------
export async function saveRule(r) {
  const base = { id: crypto.randomUUID(), kategori: '', akun_tujuan: '', mulai: todayISO(), aktif: true, dihapus: false };
  return put('berulang', stamp({ ...base, ...r }));
}

/**
 * Simpan daftar talangan untuk satu transaksi. rows = [{ id?, nama, nominal }].
 * Piutang yang sudah lunas tidak disentuh; yang dicabut dari daftar dihapus (soft delete).
 */
export async function saveDebts(tx, rows) {
  const now = nowISO();
  const paid = id => { const t = id && state.transaksi.find(x => x.id === id); return !!t && !t.dihapus; };
  const existing = state.piutang.filter(p => p.transaksi_id === tx.id && !p.dihapus);
  const keep = new Set(rows.map(r => r.id).filter(Boolean));
  const out = [];
  for (const p of existing) if (!keep.has(p.id) && !paid(p.lunas_transaksi_id)) out.push({ ...p, dihapus: true, diubah: now });
  for (const r of rows) {
    const prev = existing.find(p => p.id === r.id);
    if (prev && paid(prev.lunas_transaksi_id)) continue;
    out.push(stamp({
      id: crypto.randomUUID(), transaksi_id: tx.id, lunas_tanggal: '', lunas_akun: '', lunas_transaksi_id: '', dihapus: false,
      ...(prev || {}), nama: String(r.nama).trim(), nominal: num(r.nominal), catatan: tx.catatan || tx.kategori || '', tanggal: tx.tanggal,
    }));
  }
  return putMany('piutang', out);
}

// Piutang dikembalikan: transaksi `pelunasan` menambah saldo rekening penerima (bukan pemasukan)
export async function settleDebt(id, akun) {
  const p = state.piutang.find(x => x.id === id);
  if (!p) return null;
  const t = await saveTx({ tanggal: todayISO(), jam: hhmm(new Date()), tipe: 'pelunasan', nominal: num(p.nominal), akun, catatan: `Dari ${p.nama}` });
  await put('piutang', { ...p, lunas_tanggal: t.tanggal, lunas_akun: akun, lunas_transaksi_id: t.id, diubah: nowISO() });
  return t;
}

export async function saveTarget(t) {
  const base = { id: crypto.randomUUID(), ikon: 'investasi', warna: 'hijau', target_nominal: 0, target_tanggal: '', rekening_id: '', terkumpul_manual: 0, arsip: false };
  return put('target', stamp({ ...base, ...t }));
}

// Otomatis: transaksi berulang lalu admin bulanan yang sudah jatuh tempo (idempoten via id deterministik)
export async function runAutomations() {
  const today = todayISO();
  const now = nowISO();
  const add = list => putMany('transaksi', list.map(t => ({ ...t, dibuat: now, diubah: now })), { record: false });
  const rules = dueRecurring(state.berulang, state.transaksi, today, state.rekening);
  await add(rules);
  const admin = dueAdminCharges(state.rekening, state.transaksi, today);
  await add(admin);
  return rules.length + admin.length;
}

// Mode lokal (tanpa Google): data hanya di HP
export async function startLocal() {
  await setApp({ mode: 'local', user: null, spreadsheetId: null });
  if (!state.kategori.length) await putMany('kategori', DEFAULT_CATEGORIES);
  await setMeta('category_version', CATEGORY_VERSION);
}

// Sekali per data: ganti kategori bawaan lama (Indonesia) dengan set kategori baru. Idempoten lewat meta.category_version.
let migrating = null;
export function migrateCategories() {
  if (!migrating) migrating = (async () => {
    if (!state.kategori.length || state.meta.category_version === CATEGORY_VERSION) return 0;
    const plan = planCategoryMigration(state);
    let n = 0;
    for (const store of ['kategori', 'transaksi', 'tagihan', 'berulang', 'rekening', 'budget']) {
      const now = nowISO();
      const rows = plan[store].map(o => (store === 'kategori' || store === 'budget' ? o : { ...o, diubah: now }));
      if (rows.length) { await putMany(store, rows, { record: false }); n += rows.length; }
    }
    await setMeta('category_version', CATEGORY_VERSION);
    return n;
  })().finally(() => { migrating = null; });
  return migrating;
}

export async function resetAll() {
  await db.clearAll();
  for (const s of STORES) setStoreState(s, []);
  Object.assign(state, { mode: null, user: null, spreadsheetId: null, pending: 0, lastSync: null, needsAuth: false, schemaOk: 0 });
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
