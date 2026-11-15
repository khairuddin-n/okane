import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import * as M from '../js/model.js';
import { DEFAULT_CATEGORIES } from '../js/schema.js';
import { dateIn, daysInMonth, addMonths } from '../js/dates.js';

const KAT = DEFAULT_CATEGORIES.map(k => ({ ...k }));
let seq = 0;
const tx = o => ({ id: `t${++seq}`, tanggal: '2026-11-10', jam: '12:00', tipe: 'keluar', nominal: 0, kategori: '', akun: 'a', akun_tujuan: '', biaya_admin: 0, catatan: '', tagihan_id: '', periode: '', sumber: 'manual', dihapus: false, ...o });
const acc = o => ({ id: 'a', nama: 'A', jenis: 'bank', saldo_awal: 0, admin_nominal: 0, admin_jadwal: '', admin_kategori: '', arsip: false, dibuat: '2026-01-01T09:00:00+07:00', ...o });

describe('saldo', () => {
  const rek = [acc({ id: 'bni', saldo_awal: 1_000_000 }), acc({ id: 'gopay', saldo_awal: 50_000 }), acc({ id: 'lama', saldo_awal: 999, arsip: true })];
  const list = [
    tx({ tipe: 'masuk', nominal: 500_000, akun: 'bni' }),
    tx({ tipe: 'keluar', nominal: 20_000, akun: 'gopay' }),
    tx({ tipe: 'transfer', nominal: 100_000, akun: 'bni', akun_tujuan: 'gopay', biaya_admin: 2_500 }),
    tx({ tipe: 'penyesuaian', nominal: -7_500, akun: 'bni' }),
    tx({ tipe: 'keluar', nominal: 1_000_000, akun: 'bni', dihapus: true }),
  ];

  test('transfer dengan biaya admin: kedua saldo benar', () => {
    assert.equal(M.balanceOf('bni', rek, list), 1_000_000 + 500_000 - 102_500 - 7_500);
    assert.equal(M.balanceOf('gopay', rek, list), 50_000 - 20_000 + 100_000);
  });
  test('transaksi terhapus diabaikan, rekening arsip tidak ikut total', () => {
    assert.equal(M.totalBalance(rek, list), 1_390_000 + 130_000);
  });
  test('biaya admin transfer masuk statistik kategori "Biaya bank"; transfer & penyesuaian tidak', () => {
    const by = M.spentByCategory(list, '2026-11');
    assert.deepEqual(by, { Lainnya: 20_000, 'Biaya bank': 2_500 });
    assert.equal(M.spentInMonth(list, '2026-11'), 22_500);
  });
  test('pemasukan bulan ini', () => {
    assert.equal(M.incomeInMonth(list, '2026-11'), 500_000);
  });
});

describe('budget', () => {
  const budget = [
    { bulan: '2026-08', kategori: 'Makan', batas: 1_000_000 },
    { bulan: '2026-08', kategori: 'Transport', batas: 300_000 },
    { bulan: '2026-10', kategori: 'Makan', batas: 1_200_000 },
    { bulan: '2026-10', kategori: 'Transport', batas: 0 },
  ];
  test('carry forward dari bulan terakhir yang punya baris', () => {
    assert.deepEqual(M.budgetFor(budget, '2026-09'), { Makan: 1_000_000, Transport: 300_000 });
    assert.deepEqual(M.budgetFor(budget, '2026-12'), { Makan: 1_200_000 });
    assert.deepEqual(M.budgetFor(budget, '2026-07'), {});
    assert.equal(M.totalBudget(M.budgetFor(budget, '2026-09')), 1_300_000);
  });
  test('safeDaily & idealPct', () => {
    assert.equal(M.daysLeftInclToday('2026-11-15'), 16);
    assert.equal(M.safeDaily(1_600_000, 0, '2026-11-15'), 100_000);
    assert.equal(M.safeDaily(100, 500, '2026-11-15'), 0);
    assert.equal(M.idealPct('2026-11-15'), 0.5);
  });
});

describe('statistik', () => {
  const list = [
    tx({ tanggal: '2026-11-01', nominal: 10 }), tx({ tanggal: '2026-11-30', nominal: 20 }),
    tx({ tanggal: '2026-10-05', nominal: 5 }), tx({ tipe: 'masuk', tanggal: '2026-11-02', nominal: 99 }),
  ];
  test('dailySpending per tanggal', () => {
    const d = M.dailySpending(list, '2026-11');
    assert.equal(d.length, 30);
    assert.equal(d[0], 10); assert.equal(d[29], 20); assert.equal(d[1], 0);
  });
  test('monthlyTotals 6 bulan', () => {
    const m = M.monthlyTotals(list, '2026-11', 6);
    assert.deepEqual(m.map(x => x.month), ['2026-06', '2026-07', '2026-08', '2026-09', '2026-10', '2026-11']);
    assert.deepEqual(m.slice(-2).map(x => x.total), [5, 30]);
  });
});

describe('saran catatan', () => {
  const list = [
    tx({ tanggal: '2026-11-01', catatan: 'Nasi Padang', kategori: 'Makan', akun: 'a', nominal: 25_000 }),
    tx({ tanggal: '2026-11-03', catatan: 'Nasi Padang', kategori: 'Makan', akun: 'a', nominal: 25_000 }),
    tx({ tanggal: '2026-11-04', catatan: 'Nasi goreng', kategori: 'Makan', akun: 'b', nominal: 20_000 }),
    tx({ tanggal: '2026-11-05', catatan: 'Kopi', kategori: 'Jajan', akun: 'b', nominal: 18_000 }),
    tx({ tanggal: '2026-06-01', catatan: 'Lama sekali', kategori: 'Makan', akun: 'b', nominal: 1 }),
    tx({ tanggal: '2026-11-06', catatan: 'Biaya admin bulanan', kategori: 'Biaya bank', sumber: 'otomatis', nominal: 12_500 }),
  ];
  test('frequentEntries: kombinasi paling sering dalam 60 hari', () => {
    const f = M.frequentEntries(list, 60, 3, '2026-11-15', 'keluar');
    assert.equal(f[0].catatan, 'Nasi Padang');
    assert.equal(f[0].count, 2);
    assert.equal(f.length, 3);
    assert.ok(!f.some(x => x.catatan === 'Lama sekali' || x.catatan.startsWith('Biaya admin')));
  });
  test('matchNotes: "nas" → Nasi Padang & Nasi goreng', () => {
    const m = M.matchNotes(list, 'nas', 'keluar');
    assert.deepEqual(m.map(x => x.catatan).sort(), ['Nasi Padang', 'Nasi goreng']);
    assert.deepEqual(M.matchNotes(list, 'n', 'keluar'), []);
  });
});

describe('guessCategory', () => {
  test('kamus: "bensin" → Transport', () => {
    const g = M.guessCategory('Bensin motor', 'keluar', [], KAT);
    assert.equal(g.kategori, 'Transport');
    assert.equal(g.alasan, 'kamus');
    assert.equal(g.kata, 'bensin');
  });
  test('riwayat mengalahkan kamus', () => {
    const hist = [tx({ catatan: 'Bensin', kategori: 'Lainnya', akun: 'x' })];
    const g = M.guessCategory('bensin', 'keluar', hist, KAT);
    assert.equal(g.kategori, 'Lainnya');
    assert.equal(g.alasan, 'riwayat');
    assert.equal(g.akun, 'x');
  });
  test('riwayat berawalan sama & normalisasi tanda baca', () => {
    const hist = [tx({ catatan: 'Nasi Padang!', kategori: 'Belanja' }), tx({ catatan: 'nasi padang', kategori: 'Belanja' }), tx({ catatan: 'Nasi padang', kategori: 'Makan' })];
    assert.equal(M.guessCategory('nasi pad', 'keluar', hist, KAT).kategori, 'Belanja');
  });
  test('kata yang sering (≥2 kali, dominan ≥70%)', () => {
    const hist = [tx({ catatan: 'warung bu tini', kategori: 'Jajan' }), tx({ catatan: 'warung pak budi', kategori: 'Jajan' })];
    const g = M.guessCategory('warung baru', 'keluar', hist, KAT);
    assert.deepEqual([g.kategori, g.alasan, g.kata], ['Jajan', 'kata', 'warung']);
    const weak = [tx({ catatan: 'warung a', kategori: 'Jajan' }), tx({ catatan: 'warung b', kategori: 'Makan' })];
    assert.equal(M.guessCategory('warung c', 'keluar', weak, KAT), null);
  });
  test('tipe masuk tidak menebak kategori keluar', () => {
    assert.equal(M.guessCategory('bensin', 'masuk', [], KAT), null);
    const hist = [tx({ catatan: 'bonus', kategori: 'Makan', tipe: 'keluar' })];
    assert.equal(M.guessCategory('bonus', 'masuk', hist, KAT).kategori, 'Bonus');
    assert.equal(M.guessCategory('gaji', 'keluar', [], KAT), null);
  });
  test('"grab" + "food" menebak Makan, bukan Transport (frasa terpanjang menang)', () => {
    assert.equal(M.guessCategory('grab food', 'keluar', [], KAT).kategori, 'Makan');
    assert.equal(M.guessCategory('grab', 'keluar', [], KAT).kategori, 'Transport');
    const hist = [tx({ catatan: 'grab ke kantor', kategori: 'Transport' }), tx({ catatan: 'grab pulang', kategori: 'Transport' })];
    assert.equal(M.guessCategory('grab food', 'keluar', hist, KAT).kategori, 'Makan');
  });
  test('kamus hanya untuk kategori aktif', () => {
    const kat = KAT.map(k => (k.nama === 'Transport' ? { ...k, arsip: true } : k));
    assert.equal(M.guessCategory('bensin', 'keluar', [], kat), null);
  });
  test('pilihan manual tidak tertimpa; tanpa tebakan kategori tidak dikosongkan', () => {
    const manual = { kategori: 'Belanja', manual: true, auto: null };
    assert.deepEqual(M.applyGuess(manual, { kategori: 'Makan', alasan: 'kamus', kata: 'nasi' }), manual);
    const auto = M.applyGuess({ kategori: 'Makan', manual: false, auto: null }, { kategori: 'Transport', alasan: 'kamus', kata: 'bensin' });
    assert.equal(auto.kategori, 'Transport');
    assert.equal(M.guessLabel(auto.auto), '✦ Otomatis dari "bensin"');
    const none = M.applyGuess(auto, null);
    assert.equal(none.kategori, 'Transport');
    assert.equal(none.auto, null);
  });
  test('cepat (<5 ms) untuk 3.000 transaksi', () => {
    const big = Array.from({ length: 3000 }, (_, i) => tx({ catatan: `catatan nomor ${i}`, kategori: 'Makan' }));
    M.guessCategory('pemanasan', 'keluar', big, KAT); // isi cache normalisasi
    const t0 = performance.now();
    M.guessCategory('catatan nomor 12', 'keluar', big, KAT);
    M.guessCategory('warung baru', 'keluar', big, KAT);
    assert.ok((performance.now() - t0) / 2 < 5, `terlalu lambat: ${performance.now() - t0} ms`);
  });
});

describe('tagihan', () => {
  const bills = [
    { id: 'kos', nama: 'Kos', nominal: 1_500_000, tanggal: 31, akun: 'a', aktif: true },
    { id: 'net', nama: 'Internet', nominal: 300_000, tanggal: 10, akun: 'a', aktif: true },
    { id: 'old', nama: 'Lama', nominal: 1, tanggal: 1, akun: 'a', aktif: false },
  ];
  const paid = [tx({ tagihan_id: 'net', periode: '2026-11', nominal: 300_000 }), tx({ tagihan_id: 'kos', periode: '2026-10', nominal: 1_500_000 })];
  test('tanggal 31 di bulan 30 hari → tanggal 30; status lunas per periode', () => {
    const b = M.billsForMonth(bills, paid, '2026-11');
    assert.deepEqual(b.map(x => [x.id, x.due, x.lunas]), [['net', '2026-11-10', true], ['kos', '2026-11-30', false]]);
    assert.equal(M.billsForMonth(bills, [], '2027-02').find(x => x.id === 'kos').due, '2027-02-28');
  });
  test('saldo bebas & jatuh tempo ≤3 hari', () => {
    const b = M.billsForMonth(bills, paid, '2026-11');
    assert.equal(M.freeBalance(2_000_000, b), 500_000);
    assert.equal(M.billsDueSoon(b, '2026-11-27').length, 1);
    assert.equal(M.billsDueSoon(b, '2026-11-20').length, 0);
  });
});

describe('admin otomatis', () => {
  const bni = acc({ id: 'bni', admin_nominal: 12_500, admin_jadwal: 'tgl:25', admin_kategori: 'Biaya bank', dibuat: '2026-08-10T09:00:00+07:00' });
  test('catch-up beberapa bulan yang terlewat', () => {
    const due = M.dueAdminCharges([bni], [], '2026-11-15');
    assert.deepEqual(due.map(t => t.id), ['admin-bni-2026-08', 'admin-bni-2026-09', 'admin-bni-2026-10']);
    assert.deepEqual(due.map(t => t.tanggal), ['2026-08-25', '2026-09-25', '2026-10-25']);
    const t = due[0];
    assert.equal(t.tipe, 'keluar'); assert.equal(t.sumber, 'otomatis'); assert.equal(t.periode, '2026-08');
    assert.equal(t.kategori, 'Biaya bank'); assert.equal(t.nominal, 12_500); assert.equal(t.catatan, 'Biaya admin bulanan');
  });
  test('jatuh hari ini ikut dicatat', () => {
    assert.equal(M.dueAdminCharges([bni], [], '2026-11-25').length, 4);
  });
  test('idempoten: id yang sudah ada (termasuk dihapus) dilewati', () => {
    const first = M.dueAdminCharges([bni], [], '2026-11-15');
    assert.equal(M.dueAdminCharges([bni], first, '2026-11-15').length, 0);
    const deleted = [{ ...first[0], dihapus: true }];
    assert.equal(M.dueAdminCharges([bni], deleted, '2026-11-15').length, 2);
  });
  test('akhir bulan di Februari (tahun biasa & kabisat)', () => {
    const r = acc({ id: 'x', admin_nominal: 5_000, admin_jadwal: 'akhir', dibuat: '2027-01-15T08:00:00+07:00' });
    assert.deepEqual(M.dueAdminCharges([r], [], '2027-03-01').map(t => t.tanggal), ['2027-01-31', '2027-02-28']);
    const k = acc({ id: 'y', admin_nominal: 5_000, admin_jadwal: 'akhir', dibuat: '2028-02-01T08:00:00+07:00' });
    assert.deepEqual(M.dueAdminCharges([k], [], '2028-02-29').map(t => t.tanggal), ['2028-02-29']);
  });
  test('tidak memotong sebelum/saat hari rekening dibuat; rekening arsip dilewati', () => {
    const r = acc({ id: 'z', admin_nominal: 1, admin_jadwal: 'tgl:25', dibuat: '2026-11-25T10:00:00+07:00' });
    assert.equal(M.dueAdminCharges([r], [], '2026-11-30').length, 0);
    assert.equal(M.dueAdminCharges([{ ...bni, arsip: true }], [], '2026-11-30').length, 0);
  });
  test('nextAdminCharge', () => {
    assert.equal(M.nextAdminCharge(bni, '2026-11-15').tanggal, '2026-11-25');
    assert.equal(M.nextAdminCharge(bni, '2026-11-25').tanggal, '2026-12-25');
    assert.equal(M.nextAdminCharge(acc({ admin_nominal: 1, admin_jadwal: 'akhir' }), '2027-02-10').tanggal, '2027-02-28');
    assert.equal(M.nextAdminCharge(acc({}), '2026-11-15'), null);
  });
});

describe('insights', () => {
  const budget = [{ bulan: '2026-11', kategori: 'Makan', batas: 100 }, { bulan: '2026-11', kategori: 'Jajan', batas: 100 }, { bulan: '2026-11', kategori: 'Belanja', batas: 100 }];
  const list = [
    tx({ tanggal: '2026-11-02', kategori: 'Makan', nominal: 120 }),
    tx({ tanggal: '2026-11-03', kategori: 'Jajan', nominal: 92 }),
    tx({ tanggal: '2026-11-03', kategori: 'Belanja', nominal: 10 }),
    tx({ tanggal: '2026-10-03', kategori: 'Makan', nominal: 300 }),
    tx({ tanggal: '2026-10-20', kategori: 'Makan', nominal: 999 }),
  ];
  test('perlu direm: lewat budget atau ≥90%', () => {
    const i = M.insights(list, budget, '2026-11', '2026-11-15');
    assert.deepEqual(i.perluDirem.map(x => x.kategori), ['Makan', 'Jajan']);
  });
  test('banding dengan periode tanggal yang sama bulan lalu', () => {
    const i = M.insights(list, budget, '2026-11', '2026-11-15');
    assert.equal(i.banding.thisTotal, 222);
    assert.equal(i.banding.prevTotal, 300);
    assert.equal(i.banding.hemat, true);
    assert.equal(i.banding.upto, 15);
  });
});

describe('tanggal', () => {
  test('dateIn & daysInMonth & addMonths', () => {
    assert.equal(dateIn('2026-11', 31), '2026-11-30');
    assert.equal(daysInMonth('2028-02'), 29);
    assert.equal(addMonths('2026-12', 1), '2027-01');
    assert.equal(addMonths('2026-01', -1), '2025-12');
  });
});
