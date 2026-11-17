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
    assert.deepEqual(by, { Other: 20_000, 'Bank Fees': 2_500 });
    assert.equal(M.spentInMonth(list, '2026-11'), 22_500);
  });
  test('pemasukan bulan ini', () => {
    assert.equal(M.incomeInMonth(list, '2026-11'), 500_000);
  });
});

describe('budget', () => {
  const budget = [
    { bulan: '2026-08', kategori: 'Food', batas: 1_000_000 },
    { bulan: '2026-08', kategori: 'Transport', batas: 300_000 },
    { bulan: '2026-10', kategori: 'Food', batas: 1_200_000 },
    { bulan: '2026-10', kategori: 'Transport', batas: 0 },
  ];
  test('carry forward dari bulan terakhir yang punya baris', () => {
    assert.deepEqual(M.budgetFor(budget, '2026-09'), { Food: 1_000_000, Transport: 300_000 });
    assert.deepEqual(M.budgetFor(budget, '2026-12'), { Food: 1_200_000 });
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
    tx({ tanggal: '2026-11-01', catatan: 'Nasi Padang', kategori: 'Food', akun: 'a', nominal: 25_000 }),
    tx({ tanggal: '2026-11-03', catatan: 'Nasi Padang', kategori: 'Food', akun: 'a', nominal: 25_000 }),
    tx({ tanggal: '2026-11-04', catatan: 'Nasi goreng', kategori: 'Food', akun: 'b', nominal: 20_000 }),
    tx({ tanggal: '2026-11-05', catatan: 'Kopi', kategori: 'Snacks', akun: 'b', nominal: 18_000 }),
    tx({ tanggal: '2026-06-01', catatan: 'Lama sekali', kategori: 'Food', akun: 'b', nominal: 1 }),
    tx({ tanggal: '2026-11-06', catatan: 'Monthly admin fee', kategori: 'Bank Fees', sumber: 'otomatis', nominal: 12_500 }),
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
    const hist = [tx({ catatan: 'Bensin', kategori: 'Other', akun: 'x' })];
    const g = M.guessCategory('bensin', 'keluar', hist, KAT);
    assert.equal(g.kategori, 'Other');
    assert.equal(g.alasan, 'riwayat');
    assert.equal(g.akun, 'x');
  });
  test('riwayat berawalan sama & normalisasi tanda baca', () => {
    const hist = [tx({ catatan: 'Nasi Padang!', kategori: 'Shopping' }), tx({ catatan: 'nasi padang', kategori: 'Shopping' }), tx({ catatan: 'Nasi padang', kategori: 'Food' })];
    assert.equal(M.guessCategory('nasi pad', 'keluar', hist, KAT).kategori, 'Shopping');
  });
  test('kata yang sering (≥2 kali, dominan ≥70%)', () => {
    const hist = [tx({ catatan: 'warung bu tini', kategori: 'Snacks' }), tx({ catatan: 'warung pak budi', kategori: 'Snacks' })];
    const g = M.guessCategory('warung baru', 'keluar', hist, KAT);
    assert.deepEqual([g.kategori, g.alasan, g.kata], ['Snacks', 'kata', 'warung']);
    const weak = [tx({ catatan: 'warung a', kategori: 'Snacks' }), tx({ catatan: 'warung b', kategori: 'Food' })];
    assert.equal(M.guessCategory('warung c', 'keluar', weak, KAT), null);
  });
  test('tipe masuk tidak menebak kategori keluar', () => {
    assert.equal(M.guessCategory('bensin', 'masuk', [], KAT), null);
    const hist = [tx({ catatan: 'bonus', kategori: 'Food', tipe: 'keluar' })];
    assert.equal(M.guessCategory('bonus', 'masuk', hist, KAT).kategori, 'Bonus');
    assert.equal(M.guessCategory('gaji', 'keluar', [], KAT), null);
  });
  test('"grab" + "food" menebak Makan, bukan Transport (frasa terpanjang menang)', () => {
    assert.equal(M.guessCategory('grab food', 'keluar', [], KAT).kategori, 'Food');
    assert.equal(M.guessCategory('grab', 'keluar', [], KAT).kategori, 'Transport');
    const hist = [tx({ catatan: 'grab ke kantor', kategori: 'Transport' }), tx({ catatan: 'grab pulang', kategori: 'Transport' })];
    assert.equal(M.guessCategory('grab food', 'keluar', hist, KAT).kategori, 'Food');
  });
  test('kamus hanya untuk kategori aktif', () => {
    const kat = KAT.map(k => (k.nama === 'Transport' ? { ...k, arsip: true } : k));
    assert.equal(M.guessCategory('bensin', 'keluar', [], kat), null);
  });
  test('pilihan manual tidak tertimpa; tanpa tebakan kategori tidak dikosongkan', () => {
    const manual = { kategori: 'Shopping', manual: true, auto: null };
    assert.deepEqual(M.applyGuess(manual, { kategori: 'Food', alasan: 'kamus', kata: 'nasi' }), manual);
    const auto = M.applyGuess({ kategori: 'Food', manual: false, auto: null }, { kategori: 'Transport', alasan: 'kamus', kata: 'bensin' });
    assert.equal(auto.kategori, 'Transport');
    assert.equal(M.guessLabel(auto.auto), '✦ From "bensin"');
    const none = M.applyGuess(auto, null);
    assert.equal(none.kategori, 'Transport');
    assert.equal(none.auto, null);
  });
  test('cepat (<5 ms) untuk 3.000 transaksi', () => {
    const big = Array.from({ length: 3000 }, (_, i) => tx({ catatan: `catatan nomor ${i}`, kategori: 'Food' }));
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
  const bni = acc({ id: 'bni', saldo_awal: 1_000_000, admin_nominal: 12_500, admin_jadwal: 'tgl:25', admin_kategori: 'Bank Fees', dibuat: '2026-08-10T09:00:00+07:00' });
  test('catch-up beberapa bulan yang terlewat', () => {
    const due = M.dueAdminCharges([bni], [], '2026-11-15');
    assert.deepEqual(due.map(t => t.id), ['admin-bni-2026-08', 'admin-bni-2026-09', 'admin-bni-2026-10']);
    assert.deepEqual(due.map(t => t.tanggal), ['2026-08-25', '2026-09-25', '2026-10-25']);
    const t = due[0];
    assert.equal(t.tipe, 'keluar'); assert.equal(t.sumber, 'otomatis'); assert.equal(t.periode, '2026-08');
    assert.equal(t.kategori, 'Bank Fees'); assert.equal(t.nominal, 12_500); assert.equal(t.catatan, 'Monthly admin fee');
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
    const r = acc({ id: 'x', saldo_awal: 100_000, admin_nominal: 5_000, admin_jadwal: 'akhir', dibuat: '2027-01-15T08:00:00+07:00' });
    assert.deepEqual(M.dueAdminCharges([r], [], '2027-03-01').map(t => t.tanggal), ['2027-01-31', '2027-02-28']);
    const k = acc({ id: 'y', saldo_awal: 100_000, admin_nominal: 5_000, admin_jadwal: 'akhir', dibuat: '2028-02-01T08:00:00+07:00' });
    assert.deepEqual(M.dueAdminCharges([k], [], '2028-02-29').map(t => t.tanggal), ['2028-02-29']);
  });
  test('tidak memotong sebelum/saat hari rekening dibuat; rekening arsip dilewati', () => {
    const r = acc({ id: 'z', admin_nominal: 1, admin_jadwal: 'tgl:25', dibuat: '2026-11-25T10:00:00+07:00' });
    assert.equal(M.dueAdminCharges([r], [], '2026-11-30').length, 0);
    assert.equal(M.dueAdminCharges([{ ...bni, arsip: true }], [], '2026-11-30').length, 0);
  });
  test('saldo 0 tidak dipotong; saldo kurang dipotong sisa saldo', () => {
    const nol = { ...bni, saldo_awal: 0 };
    assert.equal(M.dueAdminCharges([nol], [], '2026-11-15').length, 0);
    const sedikit = { ...bni, saldo_awal: 20_000 };
    assert.deepEqual(M.dueAdminCharges([sedikit], [], '2026-11-15').map(t => t.nominal), [12_500, 7_500]);
    // setoran setelah tanggal potong tidak ikut dihitung untuk bulan itu
    const setor = [tx({ tipe: 'masuk', akun: 'bni', nominal: 50_000, tanggal: '2026-10-01' })];
    assert.deepEqual(M.dueAdminCharges([nol], setor, '2026-11-15').map(t => t.periode), ['2026-10']);
  });
  test('nextAdminCharge', () => {
    assert.equal(M.nextAdminCharge(bni, '2026-11-15').tanggal, '2026-11-25');
    assert.equal(M.nextAdminCharge(bni, '2026-11-25').tanggal, '2026-12-25');
    assert.equal(M.nextAdminCharge(acc({ admin_nominal: 1, admin_jadwal: 'akhir' }), '2027-02-10').tanggal, '2027-02-28');
    assert.equal(M.nextAdminCharge(acc({}), '2026-11-15'), null);
  });
});

describe('insights', () => {
  const budget = [{ bulan: '2026-11', kategori: 'Food', batas: 100 }, { bulan: '2026-11', kategori: 'Snacks', batas: 100 }, { bulan: '2026-11', kategori: 'Shopping', batas: 100 }];
  const list = [
    tx({ tanggal: '2026-11-02', kategori: 'Food', nominal: 120 }),
    tx({ tanggal: '2026-11-03', kategori: 'Snacks', nominal: 92 }),
    tx({ tanggal: '2026-11-03', kategori: 'Shopping', nominal: 10 }),
    tx({ tanggal: '2026-10-03', kategori: 'Food', nominal: 300 }),
    tx({ tanggal: '2026-10-20', kategori: 'Food', nominal: 999 }),
  ];
  test('perlu direm: lewat budget atau ≥90%', () => {
    const i = M.insights(list, budget, '2026-11', '2026-11-15');
    assert.deepEqual(i.perluDirem.map(x => x.kategori), ['Food', 'Snacks']);
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

describe('transaksi berulang', () => {
  const rule = o => ({ id: 'r1', nama: 'Salary', tipe: 'masuk', nominal: 8_000_000, kategori: 'Salary', akun: 'a', akun_tujuan: '', jadwal: 'bulanan:1', mulai: '2026-08-15', aktif: true, ...o });

  test('bulanan: catch-up periode terlewat, id deterministik, idempoten', () => {
    const due = M.dueRecurring([rule()], [], '2026-11-16');
    assert.deepEqual(due.map(t => t.id), ['rule-r1-2026-09', 'rule-r1-2026-10', 'rule-r1-2026-11']);
    assert.deepEqual(due.map(t => t.tanggal), ['2026-09-01', '2026-10-01', '2026-11-01']);
    assert.ok(due.every(t => t.sumber === 'otomatis' && t.berulang_id === 'r1' && t.tipe === 'masuk' && t.nominal === 8_000_000));
    assert.deepEqual(M.dueRecurring([rule()], due, '2026-11-16'), []);
    // yang dihapus pengguna tidak muncul lagi
    assert.deepEqual(M.dueRecurring([rule()], due.map(t => ({ ...t, dihapus: true })), '2026-11-16'), []);
  });
  test('bulanan:akhir dan tgl 31 mengikuti panjang bulan', () => {
    const d = M.dueRecurring([rule({ jadwal: 'bulanan:akhir', mulai: '2026-01-01' })], [], '2026-03-01').map(t => t.tanggal);
    assert.deepEqual(d, ['2026-01-31', '2026-02-28']);
    assert.deepEqual(M.occurrences('bulanan:31', '2026-04-01', '2026-04-30'), [{ tanggal: '2026-04-30', periode: '2026-04' }]);
  });
  test('mingguan: 1 = Senin, periode = tanggalnya', () => {
    // 2026-11-16 adalah hari Senin
    const occ = M.occurrences('mingguan:1', '2026-11-03', '2026-11-16');
    assert.deepEqual(occ.map(o => o.tanggal), ['2026-11-09', '2026-11-16']);
    assert.equal(M.dueRecurring([rule({ jadwal: 'mingguan:7', mulai: '2026-11-10' })], [], '2026-11-16')[0].id, 'rule-r1-2026-11-15');
    assert.equal(M.scheduleFrom('mingguan', '2026-11-16'), 'mingguan:1');
    assert.equal(M.scheduleFrom('bulanan', '2026-11-16'), 'bulanan:16');
    assert.equal(M.scheduleFrom('bulanan', '2026-11-30'), 'bulanan:akhir');
    assert.equal(M.scheduleFrom('bulanan', '2026-02-28'), 'bulanan:28');
  });
  test('nonaktif, jadwal rusak, rekening arsip, dan transfer tanpa tujuan dilewati', () => {
    const rek = [acc({ id: 'a' }), acc({ id: 'b', arsip: true })];
    assert.deepEqual(M.dueRecurring([rule({ aktif: false })], [], '2026-11-16'), []);
    assert.deepEqual(M.dueRecurring([rule({ jadwal: 'harian' })], [], '2026-11-16'), []);
    assert.deepEqual(M.dueRecurring([rule({ akun: 'b' })], [], '2026-11-16', rek), []);
    assert.deepEqual(M.dueRecurring([rule({ tipe: 'transfer' })], [], '2026-11-16'), []);
    const tr = M.dueRecurring([rule({ tipe: 'transfer', akun_tujuan: 'c', mulai: '2026-11-01' })], [], '2026-11-16');
    assert.equal(tr.length, 1); assert.equal(tr[0].akun_tujuan, 'c'); assert.equal(tr[0].kategori, '');
  });
  test('label dan jatuh tempo berikutnya', () => {
    assert.equal(M.scheduleLabel('bulanan:1'), 'Monthly on the 1st');
    assert.equal(M.scheduleLabel('bulanan:akhir'), 'Monthly, last day');
    assert.equal(M.scheduleLabel('mingguan:5'), 'Every Friday');
    assert.equal(M.nextOccurrence(rule(), '2026-11-16').tanggal, '2026-12-01');
    assert.equal(M.nextOccurrence(rule({ jadwal: 'bulanan:16', mulai: '2026-11-17' }), '2026-11-16').tanggal, '2026-12-16');
  });
});

describe('talangan & piutang', () => {
  const rek = [acc({ id: 'a', saldo_awal: 500_000 })];
  const list = [
    tx({ id: 'mk', tipe: 'keluar', nominal: 300_000, kategori: 'Food', akun: 'a' }),
    tx({ id: 'lunas1', tipe: 'pelunasan', nominal: 100_000, akun: 'a' }),
  ];
  const piutang = [
    { id: 'p1', transaksi_id: 'mk', nama: 'Budi', nominal: 100_000, tanggal: '2026-11-10', lunas_transaksi_id: 'lunas1' },
    { id: 'p2', transaksi_id: 'mk', nama: 'Sari', nominal: 100_000, tanggal: '2026-11-10', lunas_transaksi_id: '' },
    { id: 'p3', transaksi_id: 'mk', nama: 'Hapus', nominal: 50_000, tanggal: '2026-11-10', dihapus: true },
    { id: 'p4', transaksi_id: 'tidak-ada', nama: 'Yatim', nominal: 70_000, tanggal: '2026-11-09' },
  ];
  test('saldo berkurang penuh, pelunasan menambah saldo tapi bukan pemasukan', () => {
    assert.equal(M.balanceOf('a', rek, list), 500_000 - 300_000 + 100_000);
    assert.equal(M.incomeInMonth(list, '2026-11'), 0);
  });
  test('statistik hanya menghitung bagianmu', () => {
    const stat = M.applyShares(list, piutang);
    assert.equal(M.spentInMonth(stat, '2026-11'), 100_000);
    assert.equal(M.spentInMonth(list, '2026-11'), 300_000);
    assert.equal(M.applyShares(list, []), list);
  });
  test('piutang terbuka: belum lunas, asal masih ada', () => {
    const open = M.openDebts(piutang, list);
    assert.deepEqual(open.map(p => p.id), ['p2']);
    assert.equal(M.debtTotal(open), 100_000);
    // pelunasan dihapus → piutang terbuka lagi
    const undone = list.map(t => (t.id === 'lunas1' ? { ...t, dihapus: true } : t));
    assert.deepEqual(M.openDebts(piutang, undone).map(p => p.id).sort(), ['p1', 'p2']);
    // transaksi asal dihapus → piutang gugur
    assert.deepEqual(M.openDebts(piutang, list.map(t => (t.id === 'mk' ? { ...t, dihapus: true } : t))), []);
  });
  test('saran nama dan bagi rata', () => {
    assert.deepEqual(M.debtNames([...piutang, { id: 'p5', nama: 'sari', nominal: 1, tanggal: '2026-11-12' }]).slice(0, 2), ['sari', 'Budi']);
    assert.equal(M.splitEven(100_000, 2), 33_333);
    assert.equal(M.splitEven(100_000, 0), 0);
  });
});

describe('target tabungan', () => {
  const rek = [acc({ id: 'jago', saldo_awal: 1_000_000, dibuat: '2026-01-01T09:00:00+07:00' })];
  const list = ['2026-08-05', '2026-09-05', '2026-10-05'].map(d => tx({ tipe: 'masuk', nominal: 500_000, akun: 'jago', tanggal: d }));
  test('progres dari saldo rekening atau angka manual', () => {
    const p = M.targetProgress({ target_nominal: 5_000_000, rekening_id: 'jago' }, rek, list);
    assert.equal(p.terkumpul, 2_500_000); assert.equal(p.pct, 0.5); assert.equal(p.kurang, 2_500_000); assert.ok(p.linked);
    const m = M.targetProgress({ target_nominal: 1_000_000, terkumpul_manual: 1_200_000 }, rek, list);
    assert.ok(m.done); assert.equal(m.kurang, 0); assert.equal(m.linked, false);
  });
  test('perkiraan dengan tenggat: per bulan', () => {
    const f = M.targetForecast({ target_nominal: 5_000_000, rekening_id: 'jago', target_tanggal: '2027-04-30' }, rek, list, '2026-11-16');
    assert.deepEqual(f, { kind: 'tenggat', kurang: 2_500_000, perBulan: 500_000, bulan: '2027-04' });
    assert.equal(M.targetForecast({ target_nominal: 5_000_000, terkumpul_manual: 0, target_tanggal: '2026-11-01' }, rek, list, '2026-11-16').kind, 'lewat');
  });
  test('perkiraan tanpa tenggat: rata-rata kenaikan 3 bulan terakhir', () => {
    const f = M.targetForecast({ target_nominal: 5_000_000, rekening_id: 'jago' }, rek, list, '2026-11-16');
    assert.deepEqual(f, { kind: 'eta', perBulan: 500_000, bulan: '2027-04' });
  });
  test('data belum cukup, tidak naik, atau manual tanpa tenggat → tanpa perkiraan', () => {
    const baru = [acc({ id: 'jago', saldo_awal: 0, dibuat: '2026-10-01T09:00:00+07:00' })];
    assert.equal(M.targetForecast({ target_nominal: 5_000_000, rekening_id: 'jago' }, baru, list.slice(2), '2026-11-16'), null);
    assert.equal(M.targetForecast({ target_nominal: 5_000_000, rekening_id: 'jago' }, rek, [], '2026-11-16'), null);
    assert.equal(M.targetForecast({ target_nominal: 5_000_000, terkumpul_manual: 100 }, rek, list, '2026-11-16'), null);
    assert.equal(M.targetForecast({ target_nominal: 1_000_000, rekening_id: 'jago' }, rek, list, '2026-11-16'), null); // sudah tercapai
  });
});

describe('cicilan', () => {
  const bill = o => ({ id: 'hp', nama: 'Cicilan HP', nominal: 500_000, tanggal: 5, akun: 'a', kategori: 'Utilities', aktif: true, tenor: 3, cicilan_mulai: '2026-10', dibuat: '2026-10-02T09:00:00+07:00', ...o });
  const pay = p => tx({ tipe: 'keluar', nominal: 500_000, tagihan_id: 'hp', periode: p, tanggal: `${p}-05` });
  test('progres dihitung dari periode lunas', () => {
    assert.deepEqual(M.installmentInfo(bill(), [pay('2026-10'), pay('2026-11')]), { paid: 2, tenor: 3, done: false, start: '2026-10' });
    assert.equal(M.installmentInfo(bill({ tenor: 0 }), []), null);
  });
  test('cicilan yang sudah berjalan sebelum dicatat dianggap terbayar', () => {
    const b = bill({ tenor: 24, cicilan_mulai: '2026-04', dibuat: '2026-11-16T09:00:00+07:00' });
    assert.equal(M.installmentInfo(b, []).paid, 7);
    assert.equal(M.installmentInfo(b, [pay('2026-11')]).paid, 8);
  });
  test('belum mulai → tidak tampil; lunas semua → otomatis tidak aktif', () => {
    assert.equal(M.billsForMonth([bill()], [], '2026-09').length, 0);
    const all = [pay('2026-10'), pay('2026-11'), pay('2026-12')];
    const dec = M.billsForMonth([bill()], all, '2026-12');
    assert.equal(dec.length, 1); assert.ok(dec[0].lunas); assert.ok(dec[0].cicilan.done);
    assert.equal(M.billsForMonth([bill()], all, '2027-01').length, 0);
    // tagihan biasa tidak terpengaruh
    assert.equal(M.billsForMonth([bill({ tenor: 0, cicilan_mulai: '' })], all, '2027-01').length, 1);
  });
});

describe('rekap, arus kas, cek saldo', () => {
  const list = [
    tx({ tipe: 'masuk', nominal: 8_000_000, tanggal: '2026-10-01' }),
    tx({ tipe: 'keluar', nominal: 3_000_000, kategori: 'Food', tanggal: '2026-10-10' }),
    tx({ tipe: 'keluar', nominal: 1_000_000, kategori: 'Transport', tanggal: '2026-10-11' }),
    tx({ tipe: 'keluar', nominal: 500_000, kategori: 'Snacks', tanggal: '2026-10-12' }),
    tx({ tipe: 'keluar', nominal: 500_000, kategori: 'Entertainment', tanggal: '2026-10-13' }),
    tx({ tipe: 'keluar', nominal: 10_000_000, kategori: 'Food', tanggal: '2026-09-10' }),
    tx({ tipe: 'transfer', nominal: 9_000_000, akun_tujuan: 'b', tanggal: '2026-10-14' }),
  ];
  test('rekap bulan: masuk, keluar, sisa, 3 kategori terbesar, banding bulan lalu', () => {
    const r = M.recap(list, '2026-10');
    assert.equal(r.masuk, 8_000_000); assert.equal(r.keluar, 5_000_000); assert.equal(r.sisa, 3_000_000);
    assert.deepEqual(r.top.map(t => t.kategori), ['Food', 'Transport', 'Snacks']);
    assert.equal(r.top[0].share, 0.6);
    assert.equal(r.hemat, 0.5); assert.equal(r.tabung, 0.375); assert.equal(r.count, 6);
    assert.equal(M.recap(list, '2026-09').hemat, null);
  });
  test('arus kas per bulan', () => {
    assert.deepEqual(M.cashflow(list, '2026-10', 2), [{ month: '2026-09', masuk: 0, keluar: 10_000_000 }, { month: '2026-10', masuk: 8_000_000, keluar: 5_000_000 }]);
  });
  test('cek saldo mingguan: 7 hari sejak cek terakhir, bisa ditunda', () => {
    assert.equal(M.balanceCheckDue('2026-11-09', '2026-11-16'), true);
    assert.equal(M.balanceCheckDue('2026-11-10T08:00:00+07:00', '2026-11-16'), false);
    assert.equal(M.balanceCheckDue('2026-11-01', '2026-11-16', '2026-11-18'), false);
    assert.equal(M.balanceCheckDue('2026-11-01', '2026-11-18', '2026-11-18'), true);
    assert.equal(M.balanceCheckDue('', '2026-11-16'), false);
  });
});

describe('analitik v2', () => {
  const rek = [acc({ id: 'a', saldo_awal: 1_000_000, saldo_minimum: 950_000 }), acc({ id: 'b', saldo_awal: 500_000 }), acc({ id: 'z', saldo_awal: 9_999, arsip: true })];
  const list = [
    tx({ tipe: 'keluar', nominal: 100_000, kategori: 'Food', catatan: 'Nasi Padang', akun: 'a', tanggal: '2026-11-02' }),
    tx({ tipe: 'keluar', nominal: 20_000, kategori: 'Transport', catatan: 'GrabBike', akun: 'a', tanggal: '2026-11-03' }),
    tx({ tipe: 'keluar', nominal: 30_000, kategori: 'Transport', catatan: 'grabbike', akun: 'b', tanggal: '2026-11-03' }),
    tx({ tipe: 'transfer', nominal: 200_000, akun: 'a', akun_tujuan: 'b', biaya_admin: 2_500, tanggal: '2026-11-04' }),
    tx({ tipe: 'masuk', nominal: 1_000_000, kategori: 'Salary', akun: 'b', tanggal: '2026-11-05' }),
    tx({ tipe: 'keluar', nominal: 50_000, kategori: 'Food', catatan: 'Bakso', akun: 'a', tanggal: '2026-10-02' }),
    tx({ tipe: 'keluar', nominal: 999_000, kategori: 'Food', akun: 'a', tanggal: '2026-11-03', dihapus: true }),
  ];
  test('balanceSeries: saldo total akhir tiap hari, transfer antar rekening netral (kecuali biaya)', () => {
    const s = M.balanceSeries(rek, list, '2026-11-01', '2026-11-05');
    assert.deepEqual(s.map(x => x.total), [1_450_000, 1_350_000, 1_300_000, 1_297_500, 2_297_500]);
    assert.equal(s[4].total, M.totalBalance(rek, list));
    assert.equal(s[0].tanggal, '2026-11-01');
  });
  test('kumulatif & perkiraan akhir bulan', () => {
    const c = M.cumulativeSpending(list, '2026-11');
    assert.equal(c[0], 0); assert.equal(c[1], 100_000); assert.equal(c[2], 150_000); assert.equal(c[29], 152_500);
    const f = M.forecastMonth(list, '2026-11', '2026-11-10');
    assert.equal(f.spent, 152_500); assert.equal(f.projected, 457_500); assert.equal(f.avg, 15_250);
    assert.equal(M.forecastMonth(list, '2026-10', '2026-11-10').projected, 50_000);
  });
  test('pengeluaran terbesar, catatan tersering, hari tanpa belanja', () => {
    assert.equal(M.biggestExpense(list, '2026-11').catatan, 'Nasi Padang');
    assert.equal(M.biggestExpense(list, '2026-09'), null);
    assert.deepEqual(M.topNotes(list, '2026-11').map(n => [n.count, n.total]), [[2, 50_000]]);
    assert.equal(M.noSpendDays(list, '2026-11', '2026-11-05'), 2); // tgl 1 dan 5
  });
  test('pola hari: Senin = index 0', () => {
    // 2026-11-02 Senin, 03 Selasa, 04 Rabu
    const w = M.weekdayPattern(list, '2026-11-02', '2026-11-08');
    assert.deepEqual(w.map(x => x.total), [100_000, 50_000, 2_500, 0, 0, 0, 0]);
    assert.ok(w.every(x => x.days === 1));
  });
  test('streak mencatat: berturut-turut, hari ini boleh kosong', () => {
    assert.equal(M.logStreak(list, '2026-11-05'), 4);
    assert.equal(M.logStreak(list, '2026-11-06'), 4);
    assert.equal(M.logStreak(list, '2026-11-07'), 0);
  });
  test('kategori paling berubah vs periode sama bulan lalu', () => {
    const mv = M.categoryMovers(list, '2026-11', '2026-11-10');
    assert.deepEqual(mv, [{ kategori: 'Food', cur: 100_000, prev: 50_000, diff: 50_000 }]);
  });
  test('saldo di bawah minimum', () => {
    assert.deepEqual(M.lowBalances(rek, list).map(r => [r.id, r.saldo]), [['a', 627_500]]);
  });
  test('akan datang: tagihan belum lunas, berulang, admin; urut tanggal', () => {
    const tagihan = [{ id: 'kos', nama: 'Kos', nominal: 1_500_000, tanggal: 12, akun: 'a', kategori: 'Utilities', aktif: true }, { id: 'net', nama: 'Internet', nominal: 300_000, tanggal: 8, akun: 'a', aktif: true }];
    const berulang = [{ id: 'g', nama: 'Salary', tipe: 'masuk', nominal: 8_000_000, kategori: 'Salary', akun: 'b', jadwal: 'bulanan:15', mulai: '2026-01-01', aktif: true }];
    const rek2 = [...rek.slice(0, 2), acc({ id: 'c', nama: 'BNI', admin_nominal: 12_500, admin_jadwal: 'tgl:11' })];
    const paid = [...list, tx({ tipe: 'keluar', nominal: 300_000, tagihan_id: 'net', periode: '2026-11', tanggal: '2026-11-08' })];
    const up = M.upcoming(tagihan, berulang, rek2, paid, '2026-11-10', 7);
    assert.deepEqual(up.map(u => [u.jenis, u.tanggal]), [['admin', '2026-11-11'], ['tagihan', '2026-11-12'], ['berulang', '2026-11-15']]);
    // tagihan lewat jatuh tempo tetap muncul
    const late = M.upcoming(tagihan, [], rek, list, '2026-11-10', 7);
    assert.equal(late[0].nama, 'Internet'); assert.equal(late[0].lewat, true);
  });
});

// ---------- v2.1: kategori baru & migrasi kategori lama ----------
import { planCategoryMigration } from '../js/migrate.js';
import { LEGACY_CATEGORY_NAMES } from '../js/schema.js';

describe('kategori baru', () => {
  test('kamus mengenali gym, kos, langganan, cicilan', () => {
    const g = s => M.guessCategory(s, 'keluar', [], KAT)?.kategori;
    assert.equal(g('membership gym'), 'Fitness');
    assert.equal(g('bayar kos'), 'Rent');
    assert.equal(g('netflix'), 'Subscriptions');
    assert.equal(g('cicilan motor'), 'Loans & Credit');
    assert.equal(g('grab food'), 'Food');
    assert.equal(M.guessCategory('dividen saham', 'masuk', [], KAT)?.kategori, 'Investments');
  });
  test('setiap kata kunci menunjuk kategori bawaan yang ada', async () => {
    const { CATEGORY_KEYWORDS } = await import('../js/category-keywords.js');
    const names = new Set(KAT.map(k => k.nama));
    for (const k of Object.keys(CATEGORY_KEYWORDS)) assert.ok(names.has(k), k);
  });
});

describe('migrasi kategori lama', () => {
  const old = [['Makan', 'keluar'], ['Tagihan', 'keluar'], ['Lainnya', 'keluar'], ['Biaya bank', 'keluar'], ['Gaji', 'masuk'], ['Lainnya', 'masuk'], ['Kopi', 'keluar']]
    .map(([nama, tipe], i) => ({ nama, tipe, ikon: 'lainnya', warna: 'abu', urutan: i + 1, arsip: false }));
  const data = {
    kategori: old,
    transaksi: [
      { id: 't1', tipe: 'keluar', kategori: 'Makan', catatan: 'Nasi' },
      { id: 't2', tipe: 'keluar', kategori: 'Tagihan', catatan: 'Kos November' },
      { id: 't3', tipe: 'keluar', kategori: 'Tagihan', catatan: 'Token listrik' },
      { id: 't4', tipe: 'keluar', kategori: 'Lainnya', catatan: 'Membership gym' },
      { id: 't5', tipe: 'keluar', kategori: 'Lainnya', catatan: 'random' },
      { id: 't6', tipe: 'masuk', kategori: 'Gaji', catatan: '' },
      { id: 't7', tipe: 'keluar', kategori: 'Kopi', catatan: '' },
      { id: 't8', tipe: 'transfer', kategori: '', catatan: '' },
    ],
    tagihan: [{ id: 'b1', nama: 'Kos', kategori: 'Tagihan' }, { id: 'b2', nama: 'Wifi', kategori: 'Tagihan' }],
    berulang: [], rekening: [{ id: 'a', admin_kategori: 'Biaya bank' }],
    budget: [{ bulan: '2026-11', kategori: 'Makan', batas: 1_000_000 }, { bulan: '2026-11', kategori: 'Tagihan', batas: 500_000 }],
  };
  const p = planCategoryMigration(data);
  const cat = id => p.transaksi.find(t => t.id === id)?.kategori;
  test('nama lama diganti, Tagihan/Lainnya ditebak ulang dari catatan', () => {
    assert.equal(cat('t1'), 'Food');
    assert.equal(cat('t2'), 'Rent');
    assert.equal(cat('t3'), 'Utilities');
    assert.equal(cat('t4'), 'Fitness');
    assert.equal(cat('t5'), 'Other');
    assert.equal(cat('t6'), 'Salary');
    assert.equal(cat('t7'), undefined); // kategori buatan pengguna tidak disentuh
    assert.equal(cat('t8'), undefined);
    assert.deepEqual(p.tagihan.map(b => b.kategori), ['Rent', 'Phone & Internet']);
    assert.equal(p.rekening[0].admin_kategori, 'Bank Fees');
  });
  test('kategori lama diarsipkan, bawaan baru ditambah, buatan pengguna di belakang', () => {
    const k = (n, t = 'keluar') => p.kategori.find(x => x.nama === n && x.tipe === t);
    assert.equal(k('Makan').arsip, true);
    assert.ok(k('Fitness') && !k('Fitness').arsip);
    assert.ok(k('Kopi').urutan > 100);
    assert.equal(p.kategori.filter(x => x.nama === 'Lainnya').every(x => x.arsip), true);
  });
  test('budget pindah ke nama baru', () => {
    const b = n => p.budget.find(x => x.kategori === n);
    assert.equal(b('Food').batas, 1_000_000);
    assert.equal(b('Makan').batas, 0);
    assert.equal(b('Utilities').batas, 500_000);
  });
  test('data yang sudah baru: tidak ada perubahan transaksi', () => {
    const q = planCategoryMigration({ kategori: KAT, transaksi: [{ id: 'x', tipe: 'keluar', kategori: 'Food', catatan: 'gym' }] });
    assert.equal(q.transaksi.length, 0);
    assert.equal(q.kategori.length, 0);
    assert.ok(LEGACY_CATEGORY_NAMES.keluar.Makan);
  });
});
