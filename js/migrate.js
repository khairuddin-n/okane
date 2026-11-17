// FUNGSI MURNI: migrasi kategori bawaan lama (Indonesia) → set kategori baru (Inggris).
// Hanya kategori bawaan lama yang diganti; kategori buatan pengguna tidak disentuh.
import { DEFAULT_CATEGORIES, LEGACY_CATEGORY_NAMES } from './schema.js';
import { dictionaryMatch, normalize } from './model.js';

export const CATEGORY_VERSION = '2';

// Kategori lama yang isinya campur aduk: tebak ulang dari catatan/nama, kalau tidak ketemu pakai nama default.
const REGUESS = new Set(['Tagihan', 'Lainnya']);

/**
 * Mengembalikan perubahan { kategori, transaksi, tagihan, berulang, rekening, budget } (array baris yang perlu ditulis).
 * `data` berisi daftar dari state (kategori, transaksi, tagihan, berulang, rekening, budget).
 */
export function planCategoryMigration(data) {
  const kategori = data.kategori || [];
  const out = { kategori: [], transaksi: [], tagihan: [], berulang: [], rekening: [], budget: [] };

  // kategori lama yang masih ada (aktif atau arsip)
  const legacy = { keluar: new Set(), masuk: new Set() };
  for (const k of kategori) {
    const map = LEGACY_CATEGORY_NAMES[k.tipe];
    if (map && map[k.nama] && map[k.nama] !== k.nama) legacy[k.tipe].add(k.nama);
  }
  const defaults = { keluar: DEFAULT_CATEGORIES.filter(k => k.tipe === 'keluar'), masuk: DEFAULT_CATEGORIES.filter(k => k.tipe === 'masuk') };

  const rename = (tipe, nama, text) => {
    if (!legacy[tipe]?.has(nama)) return null;
    const fallback = LEGACY_CATEGORY_NAMES[tipe][nama];
    if (REGUESS.has(nama) && text) {
      const hit = dictionaryMatch(normalize(text), tipe, defaults[tipe]);
      if (hit && hit.kategori !== 'Other') return hit.kategori;
    }
    return fallback;
  };

  // 1. Kategori: urutan bawaan baru, kategori buatan pengguna di belakang; kategori lama diarsipkan.
  const byKey = new Map(kategori.map(k => [`${k.tipe}|${k.nama}`, k]));
  DEFAULT_CATEGORIES.forEach(d => {
    const cur = byKey.get(`${d.tipe}|${d.nama}`);
    if (!cur) out.kategori.push({ ...d });
    else if (Number(cur.urutan) !== d.urutan) out.kategori.push({ ...cur, urutan: d.urutan });
  });
  const isDefault = k => DEFAULT_CATEGORIES.some(d => d.tipe === k.tipe && d.nama === k.nama);
  for (const k of kategori) {
    if (legacy[k.tipe]?.has(k.nama)) out.kategori.push({ ...k, arsip: true, urutan: 900 + (Number(k.urutan) || 0) });
    else if (!isDefault(k) && Number(k.urutan) < 100) out.kategori.push({ ...k, urutan: 100 + (Number(k.urutan) || 0) });
  }

  // 2. Transaksi
  for (const t of data.transaksi || []) {
    if (t.tipe !== 'keluar' && t.tipe !== 'masuk') continue;
    const n = rename(t.tipe, t.kategori, t.catatan);
    if (n && n !== t.kategori) out.transaksi.push({ ...t, kategori: n });
  }
  // 3. Tagihan (selalu pengeluaran)
  for (const b of data.tagihan || []) {
    const n = rename('keluar', b.kategori, b.nama);
    if (n && n !== b.kategori) out.tagihan.push({ ...b, kategori: n });
  }
  // 4. Transaksi berulang
  for (const r of data.berulang || []) {
    if (r.tipe !== 'keluar' && r.tipe !== 'masuk') continue;
    const n = rename(r.tipe, r.kategori, r.nama);
    if (n && n !== r.kategori) out.berulang.push({ ...r, kategori: n });
  }
  // 5. Kategori admin rekening
  for (const a of data.rekening || []) {
    const n = rename('keluar', a.admin_kategori, '');
    if (n && n !== a.admin_kategori) out.rekening.push({ ...a, admin_kategori: n });
  }
  // 6. Budget: baris baru dengan nama baru (dijumlah kalau dua nama lama jadi satu), baris lama dinolkan
  const sums = new Map();
  for (const b of data.budget || []) {
    const n = rename('keluar', b.kategori, '');
    if (!n || n === b.kategori) continue;
    if (Number(b.batas) > 0) out.budget.push({ ...b, batas: 0 });
    const k = `${b.bulan}|${n}`;
    sums.set(k, (sums.get(k) || 0) + (Number(b.batas) || 0));
  }
  for (const [k, batas] of sums) {
    const [bulan, kat] = k.split('|');
    const existing = (data.budget || []).find(b => b.bulan === bulan && b.kategori === kat);
    out.budget.push({ bulan, kategori: kat, batas: batas + (Number(existing?.batas) || 0) });
  }
  return out;
}
