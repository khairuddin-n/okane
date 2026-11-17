// Rekap bulanan (#/rekap/YYYY-MM): kartu ringkas yang bisa disimpan/dibagikan sebagai gambar.
import { svg } from '../icons.js';
import { esc, compact, monthLong, pct, isPrivate } from '../format.js';
import { todayISO, ym, addMonths } from '../dates.js';
import { recap } from '../model.js';
import { toast } from '../ui.js';
import { state, statTx, setMeta } from '../store.js';

const MONTH_ONLY = m => monthLong(m).split(' ')[0];
const valid = m => /^\d{4}-\d{2}$/.test(String(m || '')) && m <= ym(todayISO());

export function recapInsight(r) {
  if (r.hemat != null && Math.abs(r.hemat) >= 0.005) return `Spent ${pct(Math.abs(r.hemat))} ${r.hemat > 0 ? 'less' : 'more'} than ${MONTH_ONLY(r.prev)}.`;
  if (r.tabung != null && r.tabung > 0) return `You saved ${pct(r.tabung)} of your income.`;
  if (r.top[0]) return `${r.top[0].kategori} was your biggest expense.`;
  return 'No spending yet.';
}

const amt = n => (isPrivate() ? '••••' : compact(n, { raw: true }));
const boxes = r => [['In', amt(r.masuk)], ['Out', amt(r.keluar)], ['Left', amt(r.sisa)]];

// Gambar kartu rekap ke canvas (tanpa library). 1080 × 1350.
async function drawCard(r) {
  const F = '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';
  const W = 1080, H = 1350, P = 80;
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const x = c.getContext('2d');
  const rr = (X, Y, w, h, rad) => { x.beginPath(); x.roundRect ? x.roundRect(X, Y, w, h, rad) : x.rect(X, Y, w, h); };
  x.fillStyle = '#0B5D4E'; x.fillRect(0, 0, W, H);
  x.strokeStyle = 'rgba(255,255,255,.10)'; x.lineWidth = 90; x.beginPath(); x.arc(W - 40, 60, 300, 0, Math.PI * 2); x.stroke();
  x.textBaseline = 'alphabetic';
  x.fillStyle = '#FFFFFF';
  x.font = `700 64px ${F}`; x.fillText('okane', P, 150);
  x.fillStyle = 'rgba(255,255,255,.78)'; x.font = `500 38px ${F}`; x.fillText('Monthly recap', P, 290);
  x.fillStyle = '#FFFFFF'; x.font = `800 84px ${F}`; x.fillText(monthLong(r.month), P, 380);

  const bw = (W - P * 2 - 40) / 3;
  boxes(r).forEach(([l, v], i) => {
    const X = P + i * (bw + 20);
    x.fillStyle = 'rgba(255,255,255,.14)'; rr(X, 450, bw, 190, 32); x.fill();
    x.fillStyle = 'rgba(255,255,255,.78)'; x.font = `500 32px ${F}`; x.fillText(l, X + 30, 520);
    x.fillStyle = i === 0 ? '#7CE3B5' : i === 1 ? '#FFB48A' : '#FFFFFF'; x.font = `800 54px ${F}`; x.fillText(v, X + 30, 595);
  });

  let y = 740;
  x.fillStyle = 'rgba(255,255,255,.78)'; x.font = `600 32px ${F}`; x.fillText('Top spending', P, y);
  y += 60;
  const max = r.top[0]?.total || 1;
  for (const t of r.top) {
    x.fillStyle = '#FFFFFF'; x.font = `700 40px ${F}`; x.textAlign = 'left'; x.fillText(t.kategori, P, y);
    x.textAlign = 'right'; x.fillText(amt(t.total), W - P, y); x.textAlign = 'left';
    x.fillStyle = 'rgba(255,255,255,.16)'; rr(P, y + 22, W - P * 2, 18, 9); x.fill();
    x.fillStyle = '#FFFFFF'; rr(P, y + 22, Math.max(18, (W - P * 2) * (t.total / max)), 18, 9); x.fill();
    y += 120;
  }
  if (!r.top.length) { x.fillStyle = '#FFFFFF'; x.font = `500 38px ${F}`; x.fillText('No spending yet', P, y); }

  x.fillStyle = '#FFFFFF'; x.font = `700 44px ${F}`;
  x.fillText(recapInsight(r), P, H - 110, W - P * 2);
  return new Promise(res => c.toBlob(res, 'image/png'));
}

let month = null;

export default {
  live: true,
  enter(query, params) {
    month = valid(params.month) ? params.month : addMonths(ym(todayISO()), -1);
    // membuka rekap bulan lalu = kartu di Beranda tidak perlu tampil lagi
    if (month === addMonths(ym(todayISO()), -1) && state.meta.rekap_dismissed !== month) setMeta('rekap_dismissed', month);
  },
  render() {
    const r = recap(statTx(), month);
    const max = r.top[0]?.total || 1;
    return `
      <div class="top with-back"><button class="icon-btn" data-act="back" aria-label="Back">${svg('back')}</button><h1>Recap</h1></div>
      <div class="pad stack">
        <section class="recap" id="recap-card">
          <span class="wm">okane</span>
          <div class="rl">Monthly recap</div><h2>${esc(monthLong(month))}</h2>
          <div class="rb">${boxes(r).map(([l, v], i) => `<div><span>${l}</span><b class="num b${i}">${esc(v)}</b></div>`).join('')}</div>
          ${r.top.length ? `<div class="rt">${r.top.map(t => `<div><div class="rh"><b>${esc(t.kategori)}</b><b class="num">${esc(amt(t.total))}</b></div><div class="rbar"><i style="width:${Math.max(4, (t.total / max) * 100)}%"></i></div></div>`).join('')}</div>` : ''}
          <p class="ri">${esc(recapInsight(r))}</p>
        </section>
        <div class="row2"><button class="btn ghost" data-act="save">${svg('download', 18)} Save</button><button class="btn primary" data-act="share">${svg('share', 18)} Share</button></div>
      </div>`;
  },
  bind(root, ctx) {
    root.querySelector('[data-act="back"]').onclick = () => ctx.back();
    const name = `okane-recap-${month}.png`;
    const make = () => drawCard(recap(statTx(), month));
    const download = blob => {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob); a.download = name;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 2000);
      toast('Image saved');
    };
    root.querySelector('[data-act="save"]').onclick = async () => { const b = await make(); if (b) download(b); else toast('Couldn’t create the image'); };
    root.querySelector('[data-act="share"]').onclick = async () => {
      const blob = await make();
      if (!blob) { toast('Couldn’t create the image'); return; }
      const file = new File([blob], name, { type: 'image/png' });
      if (navigator.canShare?.({ files: [file] })) {
        try { await navigator.share({ files: [file], title: `${monthLong(month)} recap` }); } catch (e) { if (e?.name !== 'AbortError') download(blob); }
      } else download(blob);
    };
  },
};
