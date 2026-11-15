import { svg } from '../icons.js';
import { esc, rupiah, compact, monthLong, monthShort, pct, isPrivate } from '../format.js';
import { todayISO, ym, addMonths, daysInMonth, dayOf } from '../dates.js';
import { budgetFor, totalBudget, spentInMonth, dailySpending, monthlyTotals, categoryReport, insights, num } from '../model.js';
import { catTile, catStyle, openSheet, moneyInput, bindMoney, toast, money } from '../ui.js';
import { state, saveBudget } from '../store.js';

let month = null;
let mode = 'harian';

function ring(p, ideal) {
  const r = 44, c = 2 * Math.PI * r;
  const shown = Math.min(1, p);
  const a = ideal * 2 * Math.PI - Math.PI / 2;
  const x1 = 52 + Math.cos(a) * 36, y1 = 52 + Math.sin(a) * 36, x2 = 52 + Math.cos(a) * 56, y2 = 52 + Math.sin(a) * 56;
  return `<svg viewBox="0 0 104 104" width="112" height="112" aria-hidden="true">
    <circle cx="52" cy="52" r="${r}" fill="none" stroke="var(--on-header-soft)" stroke-width="9"/>
    <circle cx="52" cy="52" r="${r}" fill="none" stroke="${p > 1 ? 'var(--warn)' : 'var(--on-header)'}" stroke-width="10" stroke-linecap="round"
      stroke-dasharray="${c * shown} ${c}" transform="rotate(-90 52 52)"/>
    ${ideal != null ? `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="var(--on-header)" stroke-opacity=".8" stroke-width="2" stroke-linecap="round"/>` : ''}
  </svg>`;
}

function dailyChart(m, today, tb) {
  const data = dailySpending(state.transaksi, m);
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
  return `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Pengeluaran harian">
      <line x1="0" x2="${W}" y1="${base}" y2="${base}" stroke="var(--line)"/>${bars}${line}${ticks}</svg>
    <div class="chart-foot"><span>Rata-rata per hari</span><b class="num">${rupiah(avg)}</b></div>
    ${jatah ? `<div class="legend"><span><i style="background:var(--warn)"></i>Di atas jatah ${rupiah(jatah)}</span></div>` : ''}`;
}

function monthsChart(m) {
  const data = monthlyTotals(state.transaksi, m, 6);
  const max = Math.max(1, ...data.map(d => d.total));
  const W = 320, H = 140, base = 112, top = 18, bw = W / 6;
  const priv = isPrivate();
  return `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Pengeluaran 6 bulan">
    <line x1="0" x2="${W}" y1="${base}" y2="${base}" stroke="var(--line)"/>
    ${data.map((d, i) => {
      const h = (d.total / max) * (base - top);
      const on = d.month === m;
      return `<rect x="${i * bw + bw * 0.22}" y="${base - h}" width="${bw * 0.56}" height="${Math.max(1, h)}" rx="5" fill="${on ? 'var(--primary)' : 'var(--bar-low)'}"/>
        ${priv ? '' : `<text class="lbl" x="${(i + 0.5) * bw}" y="${base - h - 4}" text-anchor="middle">${esc(compact(d.total))}</text>`}
        <text class="lbl" x="${(i + 0.5) * bw}" y="${H - 8}" text-anchor="middle" style="${on ? 'font-weight:700;fill:var(--text)' : ''}">${monthShort(d.month)}</text>`;
    }).join('')}</svg>`;
}

function catCard(m) {
  const rows = categoryReport(state.transaksi, state.budget, m).filter(r => r.spent > 0 || r.batas > 0);
  const comp = rows.filter(r => r.spent > 0).map(r => `<i class="c-${esc(catStyle('keluar', r.kategori).warna)}" style="flex:${r.share}" title="${esc(r.kategori)}"></i>`).join('');
  const list = rows.map(r => {
    let ft = '', bar = '';
    if (r.batas > 0) {
      const cls = r.pct > 1 ? 'over' : r.pct >= 0.9 ? 'warn' : '';
      const rest = r.batas - r.spent;
      bar = `<div class="bar thin ${cls}"><i style="width:${Math.min(100, r.pct * 100)}%"></i></div>`;
      ft = `<div class="ft"><span>dari ${rupiah(r.batas)}</span><span class="${cls || 'ok'}">${rest >= 0 ? `Sisa ${rupiah(rest)}` : `Lewat ${rupiah(-rest)}`}</span></div>`;
    }
    return `<div class="cat-row"><div class="hd">${catTile('keluar', r.kategori)}
      <span class="mid">${esc(r.kategori)} <small>· ${pct(r.share)}</small></span><b class="num">${rupiah(r.spent)}</b></div>
      ${bar || ft ? `<div class="bt">${bar}${ft}</div>` : ''}</div>`;
  }).join('');
  return `<section class="card">
    <div class="card-h"><h2>Kategori</h2><button class="btn sm" data-act="budget">Atur budget</button></div>
    ${comp ? `<div class="comp">${comp}</div>` : ''}
    ${list || '<p class="empty">Belum ada pengeluaran.</p>'}
  </section>`;
}

function insightCards(m, today) {
  const ins = insights(state.transaksi, state.budget, m, today);
  const rem = ins.perluDirem;
  const b = ins.banding;
  const remCard = `<div class="ins"><div class="t">Perlu direm</div>
    ${rem.length ? `<div class="v sm">${esc(rem.slice(0, 2).map(r => r.kategori).join(', '))}</div><div class="d">${pct(rem[0].pct)} dari budget</div>`
      : '<div class="v t-income">Aman</div><div class="d">Semua di bawah 90%</div>'}</div>`;
  let cmp;
  if (!b.upto || !b.prevTotal) cmp = `<div class="ins"><div class="t">vs ${monthShort(b.prev)}</div><div class="v">—</div><div class="d">Belum ada data</div></div>`;
  else cmp = `<div class="ins"><div class="t">vs ${monthShort(b.prev)} (tgl 1–${b.upto})</div>
    <div class="v ${b.hemat ? 't-income' : 't-expense'}">${b.pct > 0 ? '+' : b.pct < 0 ? '−' : ''}${pct(Math.abs(b.pct))}</div>
    <div class="d">${b.hemat ? 'Lebih hemat' : 'Lebih boros'}</div></div>`;
  return `<div class="insights">${remCard}${cmp}</div>`;
}

function openBudget(m) {
  const lim = budgetFor(state.budget, m);
  const kats = state.kategori.filter(k => k.tipe === 'keluar' && !k.arsip);
  openSheet({
    title: `Budget ${monthLong(m)}`,
    body: `<form id="bud" class="stack">
      ${kats.map(k => `<div style="display:flex;align-items:center;gap:12px">${catTile('keluar', k.nama, 'sm')}<span style="flex:1;font-weight:600">${esc(k.nama)}</span>
        <div style="width:150px">${moneyInput(`b_${k.nama}`, lim[k.nama] || 0, `aria-label="Budget ${esc(k.nama)}"`)}</div></div>`).join('')}
      <div style="display:flex;justify-content:space-between;font-weight:700;padding-top:4px"><span>Total</span><span class="num" id="bt"></span></div>
      <button class="btn primary big" type="submit">Simpan budget</button>
</form>`,
    onMount(el, close) {
      const inputs = kats.map(k => [k.nama, bindMoney(el.querySelector(`[name="b_${CSS.escape(k.nama)}"]`), () => upd())]);
      const upd = () => { el.querySelector('#bt').textContent = rupiah(inputs.reduce((s, [, i]) => s + i.get(), 0), { raw: true }); };
      upd();
      el.querySelector('#bud').onsubmit = async e => {
        e.preventDefault();
        await saveBudget(m, Object.fromEntries(inputs.map(([n, i]) => [n, i.get()])));
        close(); toast('Budget tersimpan');
      };
    },
  });
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
    const tb = totalBudget(budgetFor(state.budget, m));
    const spent = spentInMonth(state.transaksi, m);
    const dim = daysInMonth(m);
    const d = isCur ? dayOf(today) : dim;
    const ideal = isCur ? d / dim : null;
    let summary;
    if (tb > 0) {
      const p = spent / tb;
      const rest = tb - spent;
      const left = isCur ? dim - d + 1 : 0;
      const cells = isCur
        ? [[rest >= 0 ? 'Sisa' : 'Lewat', rupiah(Math.abs(rest))], ['Aman/hari', rupiah(Math.max(0, rest) / left)], [`Ideal hari ke-${d}`, pct(ideal)]]
        : [[rest >= 0 ? 'Sisa' : 'Lewat', rupiah(Math.abs(rest))], ['Budget', rupiah(tb)], ['Rata-rata/hari', rupiah(spent / dim)]];
      summary = `<div class="sum">
        <div class="ring">${ring(p, ideal)}<b>${pct(p)}<small>terpakai</small></b></div>
        <div class="txt"><div class="l">Pengeluaran</div><div class="big num">${money(spent)}</div><div class="s num">dari ${rupiah(tb)}</div></div></div>
        <div class="hstats">${cells.map(([l, v]) => `<div><span>${l}</span><b class="num">${v}</b></div>`).join('')}</div>`;
    } else {
      summary = `<div class="sum"><div class="txt"><div class="l">Pengeluaran</div><div class="big num">${money(spent)}</div></div></div>
        <button class="pill" data-act="budget" style="border:0">Atur budget</button>`;
    }
    return `
      <header class="hdr">
        <div class="hdr-top"><h1 style="font-size:22px;font-weight:800;letter-spacing:-.03em;color:var(--on-header)">Laporan</h1></div>
        <div class="mpick">
          <button data-act="prev" aria-label="Bulan sebelumnya">${svg('chevronLeft')}</button>
          <b>${monthLong(m)}</b>
          <button data-act="next" aria-label="Bulan berikutnya" ${isCur ? 'disabled' : ''}>${svg('chevronRight')}</button>
        </div>
        ${summary}
      </header>
      <div class="pad stack" style="margin-top:14px">
        <section class="card">
          <div class="card-h"><h2>Pengeluaran</h2>
            <div class="seg" style="width:164px"><button data-mode="harian" class="${mode === 'harian' ? 'on' : ''}">Harian</button><button data-mode="6bulan" class="${mode === '6bulan' ? 'on' : ''}">6 bulan</button></div></div>
          ${mode === 'harian' ? dailyChart(m, today, tb) : monthsChart(m)}
        </section>
        ${catCard(m)}
        ${insightCards(m, today)}
      </div>`;
  },
  bind(root, { rerender }) {
    root.querySelector('[data-act="prev"]').onclick = () => { month = addMonths(month, -1); rerender(); };
    root.querySelector('[data-act="next"]').onclick = () => { if (month < ym(todayISO())) { month = addMonths(month, 1); rerender(); } };
    root.querySelectorAll('[data-mode]').forEach(b => { b.onclick = () => { mode = b.dataset.mode; rerender(); }; });
    root.querySelectorAll('[data-act="budget"]').forEach(b => { b.onclick = () => openBudget(month); });
  },
};
