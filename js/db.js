// Wrapper IndexedDB kecil tanpa library.
import { STORES } from './schema.js';

const NAME = 'okane';
const VERSION = 1;
let dbp = null;

export function open() {
  if (dbp) return dbp;
  dbp = new Promise((resolve, reject) => {
    const req = indexedDB.open(NAME, VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      for (const s of STORES) if (!db.objectStoreNames.contains(s)) db.createObjectStore(s, { keyPath: '_k' });
      if (!db.objectStoreNames.contains('outbox')) db.createObjectStore('outbox', { keyPath: 'seq', autoIncrement: true });
      if (!db.objectStoreNames.contains('app')) db.createObjectStore('app', { keyPath: 'k' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
    req.onblocked = () => reject(new Error('IndexedDB diblokir tab lain'));
  });
  return dbp;
}

const done = t => new Promise((res, rej) => { t.oncomplete = () => res(); t.onerror = () => rej(t.error); t.onabort = () => rej(t.error); });
const result = r => new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });

export async function getAll(store) {
  const db = await open();
  return result(db.transaction(store).objectStore(store).getAll());
}

export async function put(store, obj) {
  const db = await open();
  const t = db.transaction(store, 'readwrite');
  t.objectStore(store).put(obj);
  return done(t);
}

export async function putAll(store, list) {
  const db = await open();
  const t = db.transaction(store, 'readwrite');
  const os = t.objectStore(store);
  for (const o of list) os.put(o);
  return done(t);
}

export async function replaceAll(store, list) {
  const db = await open();
  const t = db.transaction(store, 'readwrite');
  const os = t.objectStore(store);
  os.clear();
  for (const o of list) os.put(o);
  return done(t);
}

export async function clearAll() {
  const db = await open();
  const names = [...STORES, 'outbox', 'app'];
  const t = db.transaction(names, 'readwrite');
  for (const n of names) t.objectStore(n).clear();
  return done(t);
}

// ---- pengaturan lokal (spreadsheetId, mode, user, dst.) ----
export async function getApp(k) {
  const db = await open();
  const r = await result(db.transaction('app').objectStore('app').get(k));
  return r ? r.v : undefined;
}
export async function setApp(k, v) { return put('app', { k, v }); }
export async function allApp() {
  return Object.fromEntries((await getAll('app')).map(x => [x.k, x.v]));
}

// ---- outbox ----
// Operasi untuk sheet+key yang sama digabung (baris terbaru menang, urutan awal dipertahankan).
export async function outboxAdd(op) {
  const db = await open();
  const t = db.transaction('outbox', 'readwrite');
  const os = t.objectStore('outbox');
  // callback (bukan await) supaya transaksi tetap aktif di semua browser
  os.getAll().onsuccess = e => {
    const same = e.target.result.find(o => o.sheet === op.sheet && o.key === op.key);
    if (same) os.put({ ...same, row: op.row, op: same.op === 'append' ? 'append' : op.op });
    else os.add(op);
  };
  return done(t);
}
export const outboxAll = () => getAll('outbox');
export async function outboxDelete(seq) {
  const db = await open();
  const t = db.transaction('outbox', 'readwrite');
  t.objectStore('outbox').delete(seq);
  return done(t);
}
export async function outboxCount() {
  const db = await open();
  return result(db.transaction('outbox').objectStore('outbox').count());
}
