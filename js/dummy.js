// Data contoh di memori (dipakai saat Milestone 1 / mode demo).
import { DEFAULT_CATEGORIES } from './schema.js';
import { todayISO, addDays, ym, addMonths, nowISO } from './dates.js';

export function demoData() {
  const today = todayISO();
  const m = ym(today);
  const created = `${addMonths(m, -2)}-03T09:00:00+07:00`;
  const rekening = [
    { id: 'bni', nama: 'BNI', jenis: 'bank', keterangan: 'Tabungan utama', saldo_awal: 6500000, saldo_minimum: 150000, admin_nominal: 12500, admin_jadwal: 'tgl:25', admin_kategori: 'Biaya bank', urutan: 1, arsip: false, dibuat: created, diubah: created },
    { id: 'gopay', nama: 'GoPay', jenis: 'ewallet', keterangan: '', saldo_awal: 350000, saldo_minimum: 0, admin_nominal: 0, admin_jadwal: '', admin_kategori: '', urutan: 2, arsip: false, dibuat: created, diubah: created },
    { id: 'tunai', nama: 'Tunai', jenis: 'tunai', keterangan: 'Dompet', saldo_awal: 400000, saldo_minimum: 0, admin_nominal: 0, admin_jadwal: '', admin_kategori: '', urutan: 3, arsip: false, dibuat: created, diubah: created },
  ];
  const tx = [];
  let n = 0;
  const add = (daysAgo, jam, tipe, nominal, kategori, akun, catatan, extra = {}) => tx.push({
    id: `demo-${++n}`, tanggal: addDays(today, -daysAgo), jam, tipe, nominal, kategori, akun, akun_tujuan: '', biaya_admin: 0,
    catatan, tagihan_id: '', periode: '', sumber: 'manual', dibuat: nowISO(), diubah: nowISO(), dihapus: false, ...extra,
  });
  const meals = [['Nasi Padang', 25000], ['Mie ayam', 18000], ['Nasi goreng', 22000], ['Soto ayam', 20000]];
  for (let d = 0; d < 50; d++) {
    const [note, amt] = meals[d % meals.length];
    add(d, '12:15', 'keluar', amt, 'Makan', d % 2 ? 'gopay' : 'tunai', note);
    if (d % 3 === 0) add(d, '08:05', 'keluar', 20000, 'Transport', 'gopay', 'Gojek ke kantor');
    if (d % 4 === 1) add(d, '15:30', 'keluar', 28000, 'Jajan', 'gopay', 'Kopi susu');
    if (d % 9 === 2) add(d, '19:40', 'keluar', 185000, 'Belanja', 'bni', 'Indomaret');
  }
  add(14, '09:00', 'masuk', 8500000, 'Gaji', 'bni', 'Gaji');
  add(3, '20:10', 'transfer', 300000, '', 'bni', 'Isi GoPay', { akun_tujuan: 'gopay', biaya_admin: 2500 });
  add(6, '10:00', 'keluar', 95000, 'Hiburan', 'bni', 'Nonton bioskop');
  const budget = [['Makan', 1500000], ['Transport', 500000], ['Belanja', 1000000], ['Tagihan', 800000], ['Jajan', 400000], ['Hiburan', 300000]]
    .map(([kategori, batas]) => ({ bulan: addMonths(m, -1), kategori, batas }));
  const tagihan = [
    { id: 'b1', nama: 'Internet', nominal: 350000, tanggal: 10, akun: 'bni', kategori: 'Tagihan', aktif: true },
    { id: 'b2', nama: 'Listrik', nominal: 250000, tanggal: 20, akun: 'bni', kategori: 'Tagihan', aktif: true },
    { id: 'b3', nama: 'Kos', nominal: 1500000, tanggal: 31, akun: 'bni', kategori: 'Tagihan', aktif: true },
  ];
  add(5, '09:00', 'keluar', 350000, 'Tagihan', 'bni', 'Internet', { tagihan_id: 'b1', periode: m });
  return { rekening, transaksi: tx, kategori: DEFAULT_CATEGORIES.map(k => ({ ...k })), budget, tagihan, meta: {} };
}
