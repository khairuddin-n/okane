import { svg, coin } from '../icons.js';
import { esc, rupiah, initials, monthLong, pct } from '../format.js';
import { todayISO, ym } from '../dates.js';
import { balances, activeAccounts, spentInMonth, incomeInMonth, budgetFor, totalBudget, safeDaily, daysLeftInclToday, byNewest } from '../model.js';
import { txRow, money } from '../ui.js';
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
        <div class="card-h"><h2>Budget ${monthLong(m).split(' ')[0]}</h2><span class="badge ${cls ? 'warn' : ''}">${pct(p)}</span></div>
        <div class="bar ${cls}"><i style="width:${Math.min(100, p * 100)}%"></i></div>
        <div class="kv">
          <div><span>Terpakai</span><b class="num">${rupiah(keluar)}</b></div>
          <div><span>Aman per hari · ${daysLeftInclToday(today)} hari</span><b class="num">${rupiah(safeDaily(tb, keluar, today))}</b></div>
        </div>
      </a>`;
    } else {
      budgetCard = `<a class="card" href="#/laporan" style="display:flex;align-items:center;gap:12px;color:inherit">
        <span class="tile c-hijau">${svg('chart')}</span><b style="flex:1">Atur budget bulanan</b>${svg('chevronRight', 18)}</a>`;
    }

    return `
      <header class="hdr">
        <div class="hdr-top">
          <div class="brand">${coin(24)}<span class="wm">okane</span></div>
          <a class="avatar" href="#/pengaturan" aria-label="Pengaturan">${esc(initials(who))}</a>
        </div>
        <div class="lbl">Total saldo</div>
        <div class="total-row">
          <span class="total num">${money(total)}</span>
          <button class="eye" data-act="privacy" aria-label="${state.privacy ? 'Tampilkan nominal' : 'Sembunyikan nominal'}" aria-pressed="${state.privacy}">${svg(state.privacy ? 'eyeOff' : 'eye', 22)}</button>
        </div>
        <div class="mini-stats">
          <div class="mini"><span class="ar in">${svg('arrowDown', 16)}</span><div><span>Masuk</span><b class="num">${rupiah(masuk)}</b></div></div>
          <div class="mini"><span class="ar out">${svg('arrowUp', 16)}</span><div><span>Keluar</span><b class="num">${rupiah(keluar)}</b></div></div>
        </div>
      </header>

      <div class="sec-h"><h2>Rekening</h2><a class="link" href="#/rekening">Semua ${svg('chevronRight', 16)}</a></div>
      <div class="hscroll">
        ${accs.map(r => `<a class="acc-mini k-${esc(r.jenis)}" href="#/rekening?id=${esc(r.id)}">
          <span class="nm">${esc(r.nama)}</span><span class="sl num">${rupiah(bal.get(r.id))}</span></a>`).join('')}
      </div>

      <div class="pad stack" style="margin-top:14px">
        ${budgetCard}
        <section class="card">
          <div class="card-h"><h2>Terakhir</h2><a class="link" href="#/riwayat">Semua ${svg('chevronRight', 16)}</a></div>
          ${recent.length ? `<div class="rows">${recent.map(t => txRow(t)).join('')}</div>` : '<p class="empty">Ketuk + untuk mencatat.</p>'}
        </section>
      </div>`;
  },
  bind(root, { state, go }) {
    root.querySelector('[data-act="privacy"]').onclick = () => setPrivacy(!state.privacy);
    root.querySelectorAll('[data-tx]').forEach(b => { b.onclick = () => go(`#/catat?id=${encodeURIComponent(b.dataset.tx)}`); });
  },
};
