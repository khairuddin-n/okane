import { svg, coin } from '../icons.js';
import { esc, rupiah, initials, monthLong, monthShort, pct } from '../format.js';
import { todayISO, ym, dayOf, addMonths, addDays, diffDays } from '../dates.js';
import { balances, activeAccounts, spentIn, spentInMonth, incomeInMonth, budgetFor, totalBudget, daysLeftInclToday, byNewest, recap, balanceSeries, upcoming } from '../model.js';
import { txRow, money, tile, syncLabel } from '../ui.js';
import { setPrivacy, statTx, setMeta } from '../store.js';
import { spark, ringMini } from '../charts.js';
import { buildInsights } from '../insights.js';
import { recapInsight } from './rekap.js';

// Kartu "Hari ini": sisa jatah harian (kalau ada budget) atau total belanja hari ini
function todayCard(tx, today, tb) {
  const m = ym(today);
  const spentToday = spentIn(tx, today, today);
  if (!(tb > 0)) {
    const avg = spentInMonth(tx, m) / dayOf(today);
    return `<a class="card today" href="#/laporan">
      <span class="tile lg c-biru">${svg('chart', 24)}</span>
      <div class="today-t"><span>Spent today</span><b class="num">${rupiah(spentToday)}</b><small class="num">Avg ${rupiah(avg)}/day</small></div></a>`;
  }
  const before = spentInMonth(tx, m) - spentToday;
  const jatah = Math.max(0, (tb - before) / daysLeftInclToday(today));
  const left = jatah - spentToday;
  const p = jatah > 0 ? spentToday / jatah : (spentToday > 0 ? 2 : 0);
  const used = (before + spentToday) / tb;
  return `<a class="card today" href="#/laporan">
    <div class="today-r">${ringMini(p)}<b>${svg(left >= 0 ? 'check' : 'arrowUp', 18)}</b></div>
    <div class="today-t"><span>${left >= 0 ? 'Left today' : 'Over today'}</span><b class="num ${left < 0 ? 't-expense' : ''}">${rupiah(Math.abs(left))}</b>
      <small class="num">of ${rupiah(jatah)} daily limit</small></div>
    <div class="today-b"><b class="num">${pct(used)}</b><small>${monthShort(m)} budget</small></div></a>`;
}

function upcomingHTML(state, today) {
  const list = upcoming(state.tagihan, state.berulang, state.rekening, state.transaksi, today, 7).slice(0, 4);
  if (!list.length) return '';
  const href = u => (u.jenis === 'tagihan' ? `#/catat?tagihan=${encodeURIComponent(u.id)}&periode=${u.periode}` : u.jenis === 'berulang' ? '#/pengaturan/berulang' : `#/rekening?id=${encodeURIComponent(u.id)}`);
  const when = u => { const d = diffDays(today, u.tanggal); return d < 0 ? `${-d}d overdue` : d === 0 ? 'Today' : d === 1 ? 'Tomorrow' : `In ${d} days`; };
  return `<section class="card">
    <div class="card-h"><h2>Upcoming</h2><a class="link" href="#/rekening?tab=tagihan">Bills ${svg('chevronRight', 16)}</a></div>
    <div class="rows">${list.map(u => `<a class="row" href="${href(u)}">
      <span class="bill-date ${u.lewat || diffDays(today, u.tanggal) <= 1 ? 'soon' : ''}"><b>${dayOf(u.tanggal)}</b><small>${monthShort(u.tanggal)}</small></span>
      <span class="mid"><span class="ttl">${esc(u.nama)}</span><span class="meta">${when(u)}</span></span>
      <span class="amt num ${u.tipe === 'masuk' ? 't-income' : ''}">${rupiah(u.tipe === 'masuk' ? u.nominal : -u.nominal, { sign: u.tipe === 'masuk' })}</span></a>`).join('')}</div></section>`;
}

export default {
  live: true,
  render({ state }) {
    const today = todayISO();
    const m = ym(today);
    const tx = statTx();
    const bal = balances(state.rekening, state.transaksi);
    const accs = activeAccounts(state.rekening);
    const total = accs.reduce((s, r) => s + bal.get(r.id), 0);
    const masuk = incomeInMonth(tx, m);
    const keluar = spentInMonth(tx, m);
    const tb = totalBudget(budgetFor(state.budget, m));
    const recent = state.transaksi.filter(t => !t.dihapus).sort(byNewest).slice(0, 5);
    const who = state.user?.name || state.user?.email || 'okane';
    const series = balanceSeries(state.rekening, state.transaksi, addDays(today, -29), today);
    const change = total - series[0].total;
    const sync = syncLabel();
    const ins = buildInsights(today);

    // Tanggal 1–7: kartu tipis rekap bulan lalu (sampai dibuka/ditutup)
    const prev = addMonths(m, -1);
    let recapCard = '';
    if (dayOf(today) <= 7 && state.meta.rekap_dismissed !== prev) {
      const r = recap(tx, prev);
      if (r.count > 0) recapCard = `<div class="recap-strip">
        <a href="#/rekap/${prev}"><b>Your ${monthLong(prev).split(' ')[0]} recap is ready</b><span>${esc(recapInsight(r))}</span></a>
        <button class="icon-btn" data-act="recap-x" data-m="${prev}" aria-label="Dismiss recap">${svg('x', 18)}</button></div>`;
    }

    return `
      <header class="hero">
        <div class="hero-top">
          <div class="brand">${coin(24)}<span class="wm">okane</span></div>
          <a class="sync ${sync.cls}" href="#/pengaturan"><i></i>${esc(sync.text)}</a>
          <a class="avatar" href="#/pengaturan" aria-label="Settings">${esc(initials(who))}</a>
        </div>
        <div class="lbl">Total balance</div>
        <div class="total-row">
          <span class="total num" ${state.privacy ? '' : `data-count="${Math.round(total)}"`}>${money(total)}</span>
          <button class="eye" data-act="privacy" aria-label="${state.privacy ? 'Show amounts' : 'Hide amounts'}" aria-pressed="${state.privacy}">${svg(state.privacy ? 'eyeOff' : 'eye', 22)}</button>
        </div>
        <div class="delta ${change >= 0 ? 'up' : 'down'}">${svg(change >= 0 ? 'arrowUp' : 'arrowDown', 14)}<span class="num">${rupiah(Math.abs(change))}</span><em>30 days</em></div>
        <div class="hero-spark">${spark(series.map(x => x.total))}</div>
        <div class="flow">
          <div><span class="ar in">${svg('arrowDown', 16)}</span><div><span>In · ${monthShort(m)}</span><b class="num">${rupiah(masuk)}</b></div></div>
          <div><span class="ar out">${svg('arrowUp', 16)}</span><div><span>Out · ${monthShort(m)}</span><b class="num">${rupiah(keluar)}</b></div></div>
        </div>
      </header>

      <div class="pad stack lift">
        ${todayCard(tx, today, tb)}
        ${recapCard}
      </div>

      <div class="sec-h"><h2>Accounts</h2><a class="link" href="#/rekening">All ${svg('chevronRight', 16)}</a></div>
      <div class="hscroll">
        ${accs.map(r => `<a class="acc-mini k-${esc(r.jenis)}" href="#/rekening?id=${esc(r.id)}">
          <span class="nm">${esc(r.nama)}</span><span class="sl num">${rupiah(bal.get(r.id))}</span></a>`).join('')}
      </div>

      ${ins.length ? `<div class="sec-h"><h2>For you</h2></div>
      <div class="hscroll ins-scroll">${ins.slice(0, 3).map(i => `<a class="insc ${i.tone}" href="${i.href}">
        ${tile(i.ikon, i.warna, 'sm')}<span class="l">${esc(i.label)}</span><b class="num">${esc(i.value)}</b><small>${esc(i.sub || '')}</small></a>`).join('')}</div>` : ''}

      <div class="pad stack" style="margin-top:18px">
        ${upcomingHTML(state, today)}
        <section class="card">
          <div class="card-h"><h2>Recent</h2><a class="link" href="#/riwayat">All ${svg('chevronRight', 16)}</a></div>
          ${recent.length ? `<div class="rows">${recent.map(t => txRow(t, { when: 'date' })).join('')}</div>` : '<p class="empty">Tap + to add a transaction.</p>'}
        </section>
      </div>`;
  },
  bind(root, { state, go }) {
    root.querySelector('[data-act="privacy"]').onclick = () => setPrivacy(!state.privacy);
    const rx = root.querySelector('[data-act="recap-x"]');
    if (rx) rx.onclick = () => setMeta('rekap_dismissed', rx.dataset.m);
    root.querySelectorAll('[data-tx]').forEach(b => { b.onclick = () => go(`#/catat?id=${encodeURIComponent(b.dataset.tx)}`); });
  },
};
