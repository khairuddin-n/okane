// Definisi sheet di Google Sheets ↔ store di IndexedDB.
export const SCHEMA_VERSION = 3;

export const SHEETS = [
  {
    name: 'Transaksi', store: 'transaksi', key: ['id'],
    cols: ['id', 'tanggal', 'jam', 'tipe', 'nominal', 'kategori', 'akun', 'akun_tujuan', 'biaya_admin', 'catatan', 'tagihan_id', 'periode', 'sumber', 'dibuat', 'diubah', 'dihapus', 'berulang_id'],
    nums: ['nominal', 'biaya_admin'], bools: ['dihapus'], dates: ['tanggal'],
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
    cols: ['id', 'nama', 'nominal', 'tanggal', 'akun', 'kategori', 'aktif', 'dibuat', 'diubah', 'tenor', 'cicilan_mulai'],
    nums: ['nominal', 'tanggal', 'tenor'], bools: ['aktif'], months: ['cicilan_mulai'],
  },
  {
    name: 'Meta', store: 'meta', key: ['key'],
    cols: ['key', 'value'],
    nums: [], bools: [],
  },
  // --- v1.1 / v1.2: sheet baru selalu ditambahkan di akhir ---
  {
    name: 'Berulang', store: 'berulang', key: ['id'],
    cols: ['id', 'nama', 'tipe', 'nominal', 'kategori', 'akun', 'akun_tujuan', 'jadwal', 'mulai', 'aktif', 'dibuat', 'diubah', 'dihapus'],
    nums: ['nominal'], bools: ['aktif', 'dihapus'], dates: ['mulai'],
  },
  {
    name: 'Piutang', store: 'piutang', key: ['id'],
    cols: ['id', 'transaksi_id', 'nama', 'nominal', 'catatan', 'tanggal', 'lunas_tanggal', 'lunas_akun', 'lunas_transaksi_id', 'dibuat', 'diubah', 'dihapus'],
    nums: ['nominal'], bools: ['dihapus'], dates: ['tanggal', 'lunas_tanggal'],
  },
  {
    name: 'Target', store: 'target', key: ['id'],
    cols: ['id', 'nama', 'ikon', 'warna', 'target_nominal', 'target_tanggal', 'rekening_id', 'terkumpul_manual', 'arsip', 'dibuat', 'diubah'],
    nums: ['target_nominal', 'terkumpul_manual'], bools: ['arsip'], dates: ['target_tanggal'],
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
      if (s.dates?.includes(h)) v = serialToISO(v);
      else if (h === 'jam') v = fractionToHHMM(v);
      else if (h === 'bulan' || s.months?.includes(h)) v = serialToISO(v).slice(0, 7);
      else v = String(v);
    } else v = String(v);
    o[h] = v;
  });
  for (const c of s.cols) if (!(c in o)) o[c] = s.bools.includes(c) ? (c === 'aktif') : (s.nums.includes(c) ? 0 : '');
  if (s.cols.includes('aktif') && header.indexOf('aktif') >= 0 && (arr[header.indexOf('aktif')] ?? '') === '') o.aktif = true;
  return o;
}

// Kategori default (urutan = urutan tampil). Nama dipakai sebagai kunci di data.
export const DEFAULT_CATEGORIES = [
  ['Food', 'keluar', 'makan', 'oranye'],
  ['Snacks', 'keluar', 'jajan', 'pink'],
  ['Groceries', 'keluar', 'keranjang', 'hijau'],
  ['Shopping', 'keluar', 'belanja', 'ungu'],
  ['Transport', 'keluar', 'transport', 'biru'],
  ['Rent', 'keluar', 'rumah', 'teal'],
  ['Utilities', 'keluar', 'listrik', 'kuning'],
  ['Phone & Internet', 'keluar', 'internet', 'langit'],
  ['Subscriptions', 'keluar', 'langganan', 'violet'],
  ['Health', 'keluar', 'kesehatan', 'langit'],
  ['Fitness', 'keluar', 'olahraga', 'hijau'],
  ['Personal Care', 'keluar', 'kecantikan', 'pink'],
  ['Entertainment', 'keluar', 'hiburan', 'violet'],
  ['Education', 'keluar', 'pendidikan', 'biru'],
  ['Travel', 'keluar', 'pesawat', 'langit'],
  ['Family', 'keluar', 'anak', 'oranye'],
  ['Pets', 'keluar', 'hewan', 'kuning'],
  ['Gifts & Charity', 'keluar', 'donasi', 'pink'],
  ['Insurance', 'keluar', 'asuransi', 'teal'],
  ['Loans & Credit', 'keluar', 'pinjaman', 'indigo'],
  ['Investments', 'keluar', 'investasi', 'hijau'],
  ['Bank Fees', 'keluar', 'bank', 'teal'],
  ['Other', 'keluar', 'lainnya', 'abu'],
  ['Salary', 'masuk', 'gaji', 'hijau'],
  ['Bonus', 'masuk', 'bonus', 'hijau'],
  ['Business', 'masuk', 'usaha', 'hijau'],
  ['Freelance', 'masuk', 'laptop', 'teal'],
  ['Investments', 'masuk', 'investasi', 'hijau'],
  ['Gifts', 'masuk', 'hadiah', 'pink'],
  ['Refunds', 'masuk', 'refund', 'biru'],
  ['Other', 'masuk', 'lainnya', 'abu'],
].map(([nama, tipe, ikon, warna], i) => ({ nama, tipe, ikon, warna, urutan: i + 1, arsip: false }));

// Nama kategori bawaan versi lama (Indonesia) → nama baru. 'Tagihan' & 'Lainnya' ditebak ulang dari catatan.
export const LEGACY_CATEGORY_NAMES = {
  keluar: { Makan: 'Food', Jajan: 'Snacks', Belanja: 'Shopping', Transport: 'Transport', Tagihan: 'Utilities', Kesehatan: 'Health', Hiburan: 'Entertainment', 'Biaya bank': 'Bank Fees', Lainnya: 'Other' },
  masuk: { Gaji: 'Salary', Bonus: 'Bonus', Usaha: 'Business', Lainnya: 'Other' },
};

// 8 pilihan warna untuk kategori buatan pengguna
export const COLOR_CHOICES = ['oranye', 'kuning', 'hijau', 'teal', 'biru', 'ungu', 'pink', 'abu'];
