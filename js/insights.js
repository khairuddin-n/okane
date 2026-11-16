// Kartu insight: aturan sederhana di atas fungsi murni model.js. Semua dihitung di HP, tanpa jaringan.
import { rupiah, pct, monthShort, compact } from './format.js';
import { ym, dayOf, addMonths } from './dates.js';
import { budgetFor, totalBudget, forecastMonth, categoryMovers, topNotes, biggestExpense, lowBalances, openDebts, debtTotal, logStreak, noSpendDays, spentInMonth } from './model.js';
import { state, statTx } from './store.js';
import { catStyle } from './ui.js';

/**
 * Daftar insight untuk bulan berjalan, sudah diurutkan dari yang paling penting.
 * { tone: 'warn'|'good'|'info', ikon, warna, label, value, sub, href }
 */
export function buildInsights(today) {
  const m = ym(today);
  const tx = statTx();
  const out = [];
  const day = dayOf(today);

  for (const r of lowBalances(state.rekening, state.transaksi)) {
    out.push({ tone: 'warn', ikon: 'bank', warna: 'oranye', label: `${r.nama} di bawah minimum`, value: rupiah(r.saldo), sub: `Minimum ${compact(r.saldo_minimum)}`, href: `#/rekening?id=${encodeURIComponent(r.id)}` });
  }

  const tb = totalBudget(budgetFor(state.budget, m));
  const fc = forecastMonth(tx, m, today);
  if (fc.spent > 0 && day >= 3) {
    if (tb > 0) {
      const over = fc.projected - tb;
      out.push(over > 0
        ? { tone: 'warn', ikon: 'investasi', warna: 'oranye', label: 'Perkiraan akhir bulan', value: rupiah(fc.projected), sub: `Lewat budget ${compact(over)}`, href: '#/laporan' }
        : { tone: 'good', ikon: 'investasi', warna: 'hijau', label: 'Perkiraan akhir bulan', value: rupiah(fc.projected), sub: `Sisa budget ${compact(-over)}`, href: '#/laporan' });
    } else {
      const prev = spentInMonth(tx, addMonths(m, -1));
      out.push({ tone: 'info', ikon: 'investasi', warna: 'biru', label: 'Perkiraan akhir bulan', value: rupiah(fc.projected), sub: prev > 0 ? `${monthShort(addMonths(m, -1))} ${compact(prev)}` : `${compact(fc.avg)}/hari`, href: '#/laporan' });
    }
  }

  const mv = categoryMovers(tx, m, today).find(x => Math.abs(x.diff) >= 50000 && Math.abs(x.diff) / x.prev >= 0.2);
  if (mv) {
    const up = mv.diff > 0;
    const st = catStyle('keluar', mv.kategori);
    out.push({ tone: up ? 'warn' : 'good', ikon: st.ikon, warna: st.warna, label: `${mv.kategori} ${up ? 'naik' : 'turun'} ${pct(Math.abs(mv.diff) / mv.prev)}`, value: rupiah(mv.diff, { sign: true }), sub: `vs ${monthShort(addMonths(m, -1))} tgl 1–${day}`, href: `#/riwayat?kat=${encodeURIComponent(mv.kategori)}&bulan=${m}` });
  }

  const note = topNotes(tx, m, 1)[0];
  if (note && note.count >= 3) out.push({ tone: 'info', ikon: 'repeat', warna: 'ungu', label: `${note.catatan} · ${note.count}×`, value: rupiah(note.total), sub: `${compact(note.total / note.count)} per kali`, href: '#/laporan' });

  const big = biggestExpense(tx, m);
  if (big && fc.spent > 0 && big.nominal / fc.spent >= 0.15) {
    const st = catStyle('keluar', big.kategori);
    out.push({ tone: 'info', ikon: st.ikon, warna: st.warna, label: 'Terbesar bulan ini', value: rupiah(big.nominal), sub: big.catatan || big.kategori, href: `#/catat?id=${encodeURIComponent(big.id)}` });
  }

  const debts = openDebts(state.piutang, state.transaksi);
  if (debts.length) out.push({ tone: 'info', ikon: 'people', warna: 'violet', label: 'Belum dikembalikan', value: rupiah(debtTotal(debts)), sub: `${new Set(debts.map(p => String(p.nama).toLowerCase())).size} orang`, href: '#/rekening' });

  const streak = logStreak(state.transaksi, today);
  if (streak >= 3) out.push({ tone: 'good', ikon: 'check', warna: 'hijau', label: 'Rutin mencatat', value: `${streak} hari`, sub: 'berturut-turut', href: '#/riwayat' });

  const quiet = noSpendDays(tx, m, today);
  if (quiet >= 1 && day >= 5) out.push({ tone: 'good', ikon: 'dompet', warna: 'teal', label: 'Hari tanpa belanja', value: `${quiet} hari`, sub: `bulan ini`, href: '#/laporan' });

  return out;
}
