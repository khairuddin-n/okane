import { svg } from '../icons.js';
import { esc, rupiah, compact, monthLong, monthShort, pct, isPrivate } from '../format.js';
import { todayISO, ym, addMonths, daysInMonth, dayOf } from '../dates.js';
import { budgetFor, totalBudget, spentInMonth, dailySpending, categoryReport, insights, cashflow, cumulativeSpending, forecastMonth, weekdayPattern, topNotes, biggestExpense, noSpendDays, num } from '../model.js';
import { donut, pace } from '../charts.js';
import { catTile, catStyle, openSheet, moneyInput, bindMoney, toast, money } from '../ui.js';
import { state, saveBudget, statTx } from '../store.js';

let month = null;
const DOW = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
const DOW_LONG = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

function dailyChart(m, today, tb) {
  const data = dailySpending(statTx(), m);
  const n = data.length;
  const isCur = m === ym(today);
  const upto = isCur ? dayOf(today) : (m < ym(today) ? n : 0);
  const jatah = tb > 0 ? tb / n : 0;
  const max = Math.max(1, jatah * 1.2, ...data);
  const W = 320, H = 130, top = 8, base = 112, bw = W / n;
  const y = v => base - (v / max) * (base - top);
  let bars = '';
  data.forEach((v, i) => {
    if (i >= upto || v <= 0) return;
    const col = isCur && i === upto - 1 ? 'var(--primary)' : (jatah && v > jatah ? 'var(--warn)' : 'var(--bar-low)');
    bars += `<rect x="${i * bw + bw * 0.18}" y="${y(v)}" width="${bw * 0.64}" height="${Math.max(1, base - y(v))}" rx="${Math.min(3, bw * 0.3)}" fill="${col}"><title>${i + 1}: ${esc(rupiah(v))}</title></rect>`;
  });
  const ticks = [1, 8, 15, 22, n].map(d => `<text class="lbl" x="${(d - 0.5) * bw}" y="${H - 4}" text-anchor="middle">${d}</text>`).join('');
  const line = jatah ? `<line x1="0" x2="${W}" y1="${y(jatah)}" y2="${y(jatah)}" stroke="var(--muted)" stroke-dasharray="4 4" stroke-width="1"/>` : '';
  const total = data.slice(0, upto).reduce((s, v) => s + v, 0);
  const avg = upto ? total / upto : 0;
  return `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Daily spending">
      <line x1="0" x2="${W}" y1="${base}" y2="${base}" stroke="var(--line)"/>${bars}${line}${ticks}</svg>
    <div class="chart-foot"><span>Average per day</span><b class="num">${rupiah(avg)}</b></div>
    ${jatah ? `<div class="legend"><span><i style="background:var(--warn)"></i>Above daily limit ${rupiah(jatah)}</span></div>` : ''}`;
}

function flowChart(m) {
  const data = cashflow(statTx(), m, 6);
  const max = Math.max(1, ...data.map(d => Math.max(d.masuk, d.keluar)));
  const W = 320, H = 140, base = 112, top = 10, bw = W / 6;
  const h = v => (v / max) * (base - top);
  const cur = data[data.length - 1];
  const sisa = cur.masuk - cur.keluar;
  return `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Income and spending, 6 months">
    <line x1="0" x2="${W}" y1="${base}" y2="${base}" stroke="var(--line)"/>
    ${data.map((d, i) => {
      const on = d.month === m;
      return `<rect x="${i * bw + bw * 0.16}" y="${base - h(d.masuk)}" width="${bw * 0.3}" height="${Math.max(1, h(d.masuk))}" rx="4" fill="var(--income)" opacity="${on ? 1 : 0.45}"/>
        <rect x="${i * bw + bw * 0.54}" y="${base - h(d.keluar)}" width="${bw * 0.3}" height="${Math.max(1, h(d.keluar))}" rx="4" fill="var(--warn)" opacity="${on ? 1 : 0.45}"/>
        <text class="lbl" x="${(i + 0.5) * bw}" y="${H - 8}" text-anchor="middle" style="${on ? 'font-weight:700;fill:var(--text)' : ''}">${monthShort(d.month)}</text>`;
    }).join('')}</svg>
    <div class="chart-foot"><span>Left in ${monthShort(m)}${cur.masuk > 0 ? ` · ${pct(sisa / cur.masuk)} of income` : ''}</span><b class="num ${sisa >= 0 ? 't-income' : 't-expense'}">${rupiah(sisa, { sign: true })}</b></div>
    <div class="legend"><span><i style="background:var(--income)"></i>In<b class="num">${rupiah(cur.masuk)}</b></span><span><i style="background:var(--warn)"></i>Out<b class="num">${rupiah(cur.keluar)}</b></span></div>`;
}

function catCard(m) {
  const rows = categoryReport(statTx(), state.budget, m).filter(r => r.spent > 0 || r.batas > 0);
  const spentRows = rows.filter(r => r.spent > 0);
  const total = spentRows.reduce((t, r) => t + r.spent, 0);
  const ring = spentRows.length ? `<div class="cat-top">${donut(spentRows.map(r => ({ value: r.spent, color: `var(--c-${catStyle('keluar', r.kategori).warna}-i)` })), { center: `<small>${spentRows.length} ${spentRows.length === 1 ? 'category' : 'categories'}</small><b class="num">${esc(compact(total))}</b>` })}
    <div class="cat-leg">${spentRows.slice(0, 4).map(r => `<div><i style="background:var(--c-${esc(catStyle('keluar', r.kategori).warna)}-i)"></i><span>${esc(r.kategori)}</span><b class="num">${pct(r.share)}</b></div>`).join('')}</div></div>` : '';
  const list = rows.map(r => {
    let ft = '', bar = '';
    if (r.batas > 0) {
      const cls = r.pct > 1 ? 'over' : r.pct >= 0.9 ? 'warn' : '';
      const rest = r.batas - r.spent;
      bar = `<div class="bar thin ${cls}"><i style="width:${Math.min(100, r.pct * 100)}%"></i></div>`;
      ft = `<div class="ft"><span>of ${rupiah(r.batas)}</span><span class="${cls || 'ok'}">${rest >= 0 ? `${rupiah(rest)} left` : `${rupiah(-rest)} over`}</span></div>`;
    }
    return `<a class="cat-row" href="#/riwayat?kat=${encodeURIComponent(r.kategori)}&bulan=${m}"><div class="hd">${catTile('keluar', r.kategori)}
      <span class="mid">${esc(r.kategori)} <small>· ${pct(r.share)}</small></span><b class="num">${rupiah(r.spent)}</b></div>
      ${bar || ft ? `<div class="bt">${bar}${ft}</div>` : ''}</a>`;
  }).join('');
  return `<section class="card">
    <div class="card-h"><h2>Categories</h2><button class="btn sm" data-act="budget">Set budget</button></div>
    ${ring}
    ${list || '<p class="empty">No spending yet.</p>'}
  </section>`;
}

function openBudget(m) {
  const lim = budgetFor(state.budget, m);
  const kats = state.kategori.filter(k => k.tipe === 'keluar' && !k.arsip).sort((a, b) => num(a.urutan) - num(b.urutan));
  openSheet({
    title: `${monthLong(m)} budget`,
    body: `<form id="bud" class="stack">
      ${kats.map(k => `<div style="display:flex;align-items:center;gap:12px">${catTile('keluar', k.nama, 'sm')}<span style="flex:1;font-weight:600">${esc(k.nama)}</span>
        <div style="width:150px">${moneyInput(`b_${k.nama}`, lim[k.nama] || 0, `aria-label="${esc(k.nama)} budget"`)}</div></div>`).join('')}
      <div style="display:flex;justify-content:space-between;font-weight:700;padding-top:4px"><span>Total</span><span class="num" id="bt"></span></div>
      <button class="btn primary big" type="submit">Save budget</button>
</form>`,
    onMount(el, close) {
      const inputs = kats.map(k => [k.nama, bindMoney(el.querySelector(`[name="b_${CSS.escape(k.nama)}"]`), () => upd())]);
      const upd = () => { el.querySelector('#bt').textContent = rupiah(inputs.reduce((s, [, i]) => s + i.get(), 0), { raw: true }); };
      upd();
      el.querySelector('#bud').onsubmit = async e => {
        e.preventDefault();
        await saveBudget(m, Object.fromEntries(inputs.map(([n, i]) => [n, i.get()])));
        close(); toast('Budget saved');
      };
    },
  });
}

function patternCard(m, today) {
  const cur = ym(today);
  const to = m === cur ? today : `${m}-${String(daysInMonth(m)).padStart(2, '0')}`;
  const w = weekdayPattern(statTx(), `${m}-01`, to);
  const max = Math.max(1, ...w.map(x => x.avg));
  const top = w.reduce((b, x, i) => (x.avg > w[b].avg ? i : b), 0);
  const notes = topNotes(statTx(), m, 3);
  const big = biggestExpense(statTx(), m);
  if (!w.some(x => x.total > 0)) return '';
  return `<section class="card">
    <div class="card-h"><h2>Patterns</h2>${w[top].avg > 0 ? `<span class="badge muted">Most spent on ${DOW_LONG[top]}s</span>` : ''}</div>
    <div class="wk">${w.map((x, i) => `<div class="${i === top && x.avg > 0 ? 'on' : ''}" title="${DOW_LONG[i]}: ${esc(rupiah(x.avg))}/day"><i style="height:${Math.max(4, (x.avg / max) * 100)}%"></i><small>${DOW[i]}</small></div>`).join('')}</div>
    ${notes.length || big ? `<div class="rows" style="margin-top:8px">
      ${notes.map(n => `<div class="row"><span class="tile sm c-ungu">${svg('repeat', 16)}</span><span class="mid"><span class="ttl">${esc(n.catatan)}</span><span class="meta">${n.count}× · ${rupiah(n.total / n.count)} each</span></span><span class="amt num">${rupiah(n.total)}</span></div>`).join('')}
      ${big ? `<a class="row" href="#/catat?id=${encodeURIComponent(big.id)}">${catTile('keluar', big.kategori, 'sm')}<span class="mid"><span class="ttl">${esc(big.catatan || big.kategori)}</span><span class="meta">Biggest this month</span></span><span class="amt num t-expense">${rupiah(-big.nominal)}</span></a>` : ''}
    </div>` : ''}
  </section>`;
}

export default {
  live: true,
  enter() { if (!month) month = ym(todayISO()); },
  render() {
    const today = todayISO();
    const cur = ym(today);
    if (!month) month = cur;
    const m = month;
    const isCur = m === cur;
    const tx = statTx();
    const tb = totalBudget(budgetFor(state.budget, m));
    const spent = spentInMonth(tx, m);
    const dim = daysInMonth(m);
    const d = isCur ? dayOf(today) : dim;
    const prevM = addMonths(m, -1);
    const fc = forecastMonth(tx, m, today);
    const b = insights(tx, state.budget, m, today).banding;
    const rest = tb - spent;
    const left = dim - d + 1;
    let cells;
    if (tb > 0 && isCur) cells = [[rest >= 0 ? 'Left' : 'Over', rupiah(Math.abs(rest))], ['Safe per day', rupiah(Math.max(0, rest) / left)], ['Forecast', rupiah(fc.projected), fc.projected > tb]];
    else if (tb > 0) cells = [[rest >= 0 ? 'Left' : 'Over', rupiah(Math.abs(rest))], ['Budget', rupiah(tb)], ['Avg/day', rupiah(spent / dim)]];
    else cells = [['Avg/day', rupiah(spent / d)], [isCur ? 'Forecast' : 'Total', rupiah(fc.projected)], ['No-spend days', `${noSpendDays(tx, m, today)}`]];
    const cmp = b.upto && b.prevTotal > 0 && b.pct !== 0
      ? `<span class="delta ${b.hemat ? 'up' : 'down'}">${svg(b.hemat ? 'arrowDown' : 'arrowUp', 14)}<span class="num">${pct(Math.abs(b.pct))}</span><em>vs ${monthShort(prevM)}</em></span>` : '';
    return `
      <header class="hero">
        <div class="hero-top"><h1>Reports</h1>
          <a class="eye" href="#/rekap/${m}" aria-label="${monthLong(m)} recap">${svg('share', 22)}</a></div>
        <div class="mpick">
          <button data-act="prev" aria-label="Previous month">${svg('chevronLeft')}</button>
          <b>${monthLong(m)}</b>
          <button data-act="next" aria-label="Next month" ${isCur ? 'disabled' : ''}>${svg('chevronRight')}</button>
        </div>
        <div class="lbl">Spending</div>
        <div class="total-row"><span class="total num">${money(spent)}</span></div>
        <div class="hero-sub">${tb > 0 ? `<span class="num">${pct(spent / tb)} of ${rupiah(tb)}</span>` : `<button class="pill" data-act="budget">Set budget</button>`}${cmp}</div>
        <div class="hero-pace">${pace(cumulativeSpending(tx, m), cumulativeSpending(tx, prevM), { budget: tb, upto: d, label: 'Cumulative spending pace' })}
          <div class="pace-x"><span>1</span><span>${Math.round(dim / 2)}</span><span>${dim}</span></div></div>
        <div class="hstats">${cells.map(([l, v, bad]) => `<div><span>${l}</span><b class="num ${bad ? 'bad' : ''}">${v}</b></div>`).join('')}</div>
      </header>
      <div class="pad stack lift">
        ${catCard(m)}
        <section class="card"><div class="card-h"><h2>Daily</h2></div>${dailyChart(m, today, tb)}</section>
        <section class="card"><div class="card-h"><h2>Cash flow</h2></div>${flowChart(m)}</section>
        ${patternCard(m, today)}
      </div>`;
  },
  bind(root, { rerender }) {
    root.querySelector('[data-act="prev"]').onclick = () => { month = addMonths(month, -1); rerender(); };
    root.querySelector('[data-act="next"]').onclick = () => { if (month < ym(todayISO())) { month = addMonths(month, 1); rerender(); } };
    root.querySelectorAll('[data-act="budget"]').forEach(b => { b.onclick = () => openBudget(month); });
  },
};
