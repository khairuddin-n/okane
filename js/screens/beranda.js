import { svg, coin } from '../icons.js';
import { esc, rupiah, initials, monthShort, pct } from '../format.js';
import { todayISO, ym } from '../dates.js';
import { balances, activeAccounts, spentInMonth, incomeInMonth, budgetFor, totalBudget, safeDaily, daysLeftInclToday, byNewest } from '../model.js';
import { txRow } from '../ui.js';
import { setPrivacy } from '../store.js';

export default {
  live: true,
  render({ state }) {
    const today = todayISO();
    const m = ym(today);
    const bal = balances(state.rekening, state.transaksi);
    const accs = activeAccounts(state.rekening);
    const total = accs.reduce((s, r) => s + bal.get(r.id), 0);
    const masuk = incomeInMonth(state.transaksi, m);
    const keluar = spentInMonth(state.transaksi, m);
    const tb = totalBudget(budgetFor(state.budget, m));
    const recent = state.transaksi.filter(t => !t.dihapus).sort(byNewest).slice(0, 4);
    const who = state.user?.name || state.user?.email || 'okane';

    let budgetCard;
    if (tb > 0) {
      const p = keluar / tb;
      const cls = p >= 1 ? 'over' : p >= 0.9 ? 'warn' : '';
      budgetCard = `<a class="card" href="#/laporan" style="display:block;color:inherit">
        <div class="card-h"><h2>Budget bulan ini</h2><span class="badge ${cls ? 'warn' : ''}">${pct(p)} terpakai</span></div>
        <div class="num" style="font-size:20px;font-weight:800">${rupiah(keluar)} <span class="muted" style="font-size:14px;font-weight:500">dari ${rupiah(tb)}</span></div>
        <div class="bar ${cls}" style="margin:10px 0 8px"><i style="width:${Math.min(100, p * 100)}%"></i></div>
        <div class="muted" style="font-size:13px">Aman ${rupiah(safeDaily(tb, keluar, today))}/hari · ${daysLeftInclToday(today)} hari lagi</div>
      </a>`;
    } else {
      budgetCard = `<a class="card" href="#/laporan" style="display:flex;align-items:center;gap:12px;color:inherit">
        <span class="tile c-hijau">${svg('chart')}</span>
        <span style="flex:1"><b style="display:block">Atur budget bulanan</b><span class="muted" style="font-size:13px">Biar tahu batas aman per hari</span></span>${svg('chevronRight', 18)}</a>`;
    }

    return `
      <header class="hdr">
        <div class="hdr-top">
          <div class="brand">${coin(26)}<span class="wm">okane</span></div>
          <a class="avatar" href="#/pengaturan" aria-label="Pengaturan">${esc(initials(who))}</a>
        </div>
        <div class="lbl">Total saldo</div>
        <div class="total-row">
          <span class="total num">${rupiah(total)}</span>
          <button class="eye" data-act="privacy" aria-label="${state.privacy ? 'Tampilkan nominal' : 'Sembunyikan nominal'}" aria-pressed="${state.privacy}">${svg(state.privacy ? 'eyeOff' : 'eye', 22)}</button>
        </div>
        <div class="mini-stats">
          <div class="mini"><span>Masuk ${monthShort(m)}</span><b class="num">${rupiah(masuk)}</b></div>
          <div class="mini"><span>Keluar ${monthShort(m)}</span><b class="num">${rupiah(keluar)}</b></div>
        </div>
      </header>

      <div class="sec-h"><h2>Rekening</h2><a class="link" href="#/rekening">Semua (${accs.length})</a></div>
      <div class="hscroll">
        ${accs.map(r => `<a class="acc-mini" href="#/rekening?id=${esc(r.id)}">
          <span class="ini k-${esc(r.jenis)}">${esc(initials(r.nama))}</span>
          <div class="nm">${esc(r.nama)}</div><div class="sl num">${rupiah(bal.get(r.id))}</div></a>`).join('')}
      </div>

      <div class="pad stack" style="margin-top:12px">
        ${budgetCard}
        <section class="card">
          <div class="card-h"><h2>Terakhir</h2><a class="link" href="#/riwayat">Lihat semua</a></div>
          ${recent.length ? `<div class="rows">${recent.map(t => txRow(t)).join('')}</div>` : '<p class="empty">Belum ada transaksi. Ketuk + untuk mencatat.</p>'}
        </section>
      </div>`;
  },
  bind(root, { state, go }) {
    root.querySelector('[data-act="privacy"]').onclick = () => setPrivacy(!state.privacy);
    root.querySelectorAll('[data-tx]').forEach(b => { b.onclick = () => go(`#/catat?id=${encodeURIComponent(b.dataset.tx)}`); });
  },
};
