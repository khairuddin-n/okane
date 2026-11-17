// Kartu insight: aturan sederhana di atas fungsi murni model.js. Semua dihitung di HP, tanpa jaringan.
import { rupiah, pct, monthShort, compact } from './format.js';
import { ym, dayOf, addMonths } from './dates.js';
import { categoryMovers, topNotes, biggestExpense, lowBalances, openDebts, debtTotal, logStreak, noSpendDays, spentInMonth } from './model.js';
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
    out.push({ tone: 'warn', ikon: 'bank', warna: 'oranye', label: `${r.nama} below minimum`, value: rupiah(r.saldo), sub: `Minimum ${compact(r.saldo_minimum)}`, href: `#/rekening?id=${encodeURIComponent(r.id)}` });
  }

  // Tanpa perkiraan akhir bulan: satu transaksi besar membuat proyeksi menyesatkan.
  const spent = spentInMonth(tx, m);

  const mv = categoryMovers(tx, m, today).find(x => Math.abs(x.diff) >= 50000 && Math.abs(x.diff) / x.prev >= 0.2);
  if (mv) {
    const up = mv.diff > 0;
    const st = catStyle('keluar', mv.kategori);
    out.push({ tone: up ? 'warn' : 'good', ikon: st.ikon, warna: st.warna, label: `${mv.kategori} ${up ? 'up' : 'down'} ${pct(Math.abs(mv.diff) / mv.prev)}`, value: rupiah(mv.diff, { sign: true }), sub: `vs ${monthShort(addMonths(m, -1))} 1–${day}`, href: `#/riwayat?kat=${encodeURIComponent(mv.kategori)}&bulan=${m}` });
  }

  const note = topNotes(tx, m, 1)[0];
  if (note && note.count >= 3) out.push({ tone: 'info', ikon: 'repeat', warna: 'ungu', label: `${note.catatan} · ${note.count}×`, value: rupiah(note.total), sub: `${compact(note.total / note.count)} each`, href: '#/laporan' });

  const big = biggestExpense(tx, m);
  if (big && spent > 0 && big.nominal / spent >= 0.15) {
    const st = catStyle('keluar', big.kategori);
    out.push({ tone: 'info', ikon: st.ikon, warna: st.warna, label: 'Biggest this month', value: rupiah(big.nominal), sub: big.catatan || big.kategori, href: `#/catat?id=${encodeURIComponent(big.id)}` });
  }

  const debts = openDebts(state.piutang, state.transaksi);
  if (debts.length) out.push({ tone: 'info', ikon: 'people', warna: 'violet', label: 'Owed to you', value: rupiah(debtTotal(debts)), sub: `${new Set(debts.map(p => String(p.nama).toLowerCase())).size} people`, href: '#/rekening' });

  const streak = logStreak(state.transaksi, today);
  if (streak >= 3) out.push({ tone: 'good', ikon: 'check', warna: 'hijau', label: 'Logging streak', value: `${streak} days`, sub: 'in a row', href: '#/riwayat' });

  const quiet = noSpendDays(tx, m, today);
  if (quiet >= 1 && day >= 5) out.push({ tone: 'good', ikon: 'dompet', warna: 'teal', label: 'No-spend days', value: `${quiet}`, sub: `this month`, href: '#/laporan' });

  return out;
}
