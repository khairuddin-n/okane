// Definisi sheet di Google Sheets ↔ store di IndexedDB.
export const SCHEMA_VERSION = 1;

export const SHEETS = [
  {
    name: 'Transaksi', store: 'transaksi', key: ['id'],
    cols: ['id', 'tanggal', 'jam', 'tipe', 'nominal', 'kategori', 'akun', 'akun_tujuan', 'biaya_admin', 'catatan', 'tagihan_id', 'periode', 'sumber', 'dibuat', 'diubah', 'dihapus'],
    nums: ['nominal', 'biaya_admin'], bools: ['dihapus'],
  },
  {
    name: 'Rekening', store: 'rekening', key: ['id'],
    cols: ['id', 'nama', 'jenis', 'keterangan', 'saldo_awal', 'saldo_minimum', 'admin_nominal', 'admin_jadwal', 'admin_kategori', 'urutan', 'arsip', 'dibuat', 'diubah'],
    nums: ['saldo_awal', 'saldo_minimum', 'admin_nominal', 'urutan'], bools: ['arsip'],
  },
  {
    name: 'Kategori', store: 'kategori', key: ['nama', 'tipe'],
    cols: ['nama', 'tipe', 'ikon', 'warna', 'urutan', 'arsip'],
    nums: ['urutan'], bools: ['arsip'],
  },
  {
    name: 'Budget', store: 'budget', key: ['bulan', 'kategori'],
    cols: ['bulan', 'kategori', 'batas'],
    nums: ['batas'], bools: [],
  },
  {
    name: 'Tagihan', store: 'tagihan', key: ['id'],
    cols: ['id', 'nama', 'nominal', 'tanggal', 'akun', 'kategori', 'aktif', 'dibuat', 'diubah'],
    nums: ['nominal', 'tanggal'], bools: ['aktif'],
  },
  {
    name: 'Meta', store: 'meta', key: ['key'],
    cols: ['key', 'value'],
    nums: [], bools: [],
  },
];

export const SHEET_BY_STORE = Object.fromEntries(SHEETS.map(s => [s.store, s]));
export const SHEET_BY_NAME = Object.fromEntries(SHEETS.map(s => [s.name, s]));
export const STORES = SHEETS.map(s => s.store);

export const keyOf = (store, obj) => SHEET_BY_STORE[store].key.map(k => String(obj[k] ?? '')).join('|');

export function colLetter(n) { // 1 → A
  let s = '';
  while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); }
  return s;
}

// Objek → baris sheet (urutan kolom kanonik)
export function toRow(store, obj) {
  const s = SHEET_BY_STORE[store];
  return s.cols.map(c => {
    const v = obj[c];
    if (s.bools.includes(c)) return v === true || v === 'TRUE' ? true : (c === 'aktif' ? false : '');
    if (s.nums.includes(c)) return v === '' || v == null ? '' : Number(v) || 0;
    return v == null ? '' : String(v);
  });
}

function serialToISO(n) { // tanggal serial Sheets → YYYY-MM-DD
  const d = new Date(Math.round((n - 25569) * 86400000));
  return d.toISOString().slice(0, 10);
}
function fractionToHHMM(n) {
  const mins = Math.round((n % 1) * 1440);
  return `${String(Math.floor(mins / 60)).padStart(2, '0')}:${String(mins % 60).padStart(2, '0')}`;
}

// Baris sheet → objek (dibaca berdasarkan header, supaya tahan kolom tambahan)
export function fromRow(store, header, arr) {
  const s = SHEET_BY_STORE[store];
  const o = {};
  header.forEach((h, i) => {
    if (!h) return;
    let v = arr[i] ?? '';
    if (s.bools.includes(h)) v = v === true || String(v).toUpperCase() === 'TRUE';
    else if (s.nums.includes(h)) v = v === '' ? (h === 'urutan' || h === 'saldo_minimum' ? 0 : 0) : Number(v) || 0;
    else if (typeof v === 'number') {
      if (h === 'tanggal' && store === 'transaksi') v = serialToISO(v);
      else if (h === 'jam') v = fractionToHHMM(v);
      else if (h === 'bulan') v = serialToISO(v).slice(0, 7);
      else v = String(v);
    } else v = String(v);
    o[h] = v;
  });
  for (const c of s.cols) if (!(c in o)) o[c] = s.bools.includes(c) ? (c === 'aktif') : (s.nums.includes(c) ? 0 : '');
  if (store === 'tagihan' && header.indexOf('aktif') >= 0 && arr[header.indexOf('aktif')] === '') o.aktif = true;
  return o;
}

// Kategori default
export const DEFAULT_CATEGORIES = [
  ['Makan', 'keluar', 'makan', 'oranye'],
  ['Transport', 'keluar', 'transport', 'biru'],
  ['Belanja', 'keluar', 'belanja', 'ungu'],
  ['Tagihan', 'keluar', 'tagihan', 'kuning'],
  ['Jajan', 'keluar', 'jajan', 'pink'],
  ['Kesehatan', 'keluar', 'kesehatan', 'langit'],
  ['Hiburan', 'keluar', 'hiburan', 'violet'],
  ['Biaya bank', 'keluar', 'bank', 'teal'],
  ['Lainnya', 'keluar', 'lainnya', 'abu'],
  ['Gaji', 'masuk', 'gaji', 'hijau'],
  ['Bonus', 'masuk', 'bonus', 'hijau'],
  ['Usaha', 'masuk', 'usaha', 'hijau'],
  ['Lainnya', 'masuk', 'lainnya', 'abu'],
].map(([nama, tipe, ikon, warna], i) => ({ nama, tipe, ikon, warna, urutan: i + 1, arsip: false }));

// 8 pilihan warna untuk kategori buatan pengguna
export const COLOR_CHOICES = ['oranye', 'kuning', 'hijau', 'teal', 'biru', 'ungu', 'pink', 'abu'];
