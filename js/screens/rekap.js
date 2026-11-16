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
  if (r.hemat != null && Math.abs(r.hemat) >= 0.005) return `${r.hemat > 0 ? 'Lebih hemat' : 'Lebih boros'} ${pct(Math.abs(r.hemat))} dari ${MONTH_ONLY(r.prev)}.`;
  if (r.tabung != null && r.tabung > 0) return `Kamu menyisihkan ${pct(r.tabung)} dari pemasukan.`;
  if (r.top[0]) return `${r.top[0].kategori} jadi pengeluaran terbesar.`;
  return 'Belum ada pengeluaran.';
}

const amt = n => (isPrivate() ? '••••' : compact(n, { raw: true }));
const boxes = r => [['Masuk', amt(r.masuk)], ['Keluar', amt(r.keluar)], ['Sisa', amt(r.sisa)]];

// Gambar kartu rekap ke canvas (tanpa library). 1080 × 1350.
async function drawCard(r) {
  try { await Promise.all([document.fonts.load('800 60px Inter'), document.fonts.load('700 60px "Space Grotesk"')]); } catch {}
  const W = 1080, H = 1350, P = 80;
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const x = c.getContext('2d');
  const rr = (X, Y, w, h, rad) => { x.beginPath(); x.roundRect ? x.roundRect(X, Y, w, h, rad) : x.rect(X, Y, w, h); };
  x.fillStyle = '#0B5D4E'; x.fillRect(0, 0, W, H);
  x.strokeStyle = 'rgba(255,255,255,.10)'; x.lineWidth = 90; x.beginPath(); x.arc(W - 40, 60, 300, 0, Math.PI * 2); x.stroke();
  x.textBaseline = 'alphabetic';
  x.fillStyle = '#FFFFFF';
  x.font = '700 64px "Space Grotesk", Inter, system-ui, sans-serif'; x.fillText('okane', P, 150);
  x.fillStyle = 'rgba(255,255,255,.78)'; x.font = '500 38px Inter, system-ui, sans-serif'; x.fillText('Rekap', P, 290);
  x.fillStyle = '#FFFFFF'; x.font = '800 84px Inter, system-ui, sans-serif'; x.fillText(monthLong(r.month), P, 380);

  const bw = (W - P * 2 - 40) / 3;
  boxes(r).forEach(([l, v], i) => {
    const X = P + i * (bw + 20);
    x.fillStyle = 'rgba(255,255,255,.14)'; rr(X, 450, bw, 190, 32); x.fill();
    x.fillStyle = 'rgba(255,255,255,.78)'; x.font = '500 32px Inter, system-ui, sans-serif'; x.fillText(l, X + 30, 520);
    x.fillStyle = i === 0 ? '#7CE3B5' : i === 1 ? '#FFB48A' : '#FFFFFF'; x.font = '800 54px Inter, system-ui, sans-serif'; x.fillText(v, X + 30, 595);
  });

  let y = 740;
  x.fillStyle = 'rgba(255,255,255,.78)'; x.font = '600 32px Inter, system-ui, sans-serif'; x.fillText('Pengeluaran terbesar', P, y);
  y += 60;
  const max = r.top[0]?.total || 1;
  for (const t of r.top) {
    x.fillStyle = '#FFFFFF'; x.font = '700 40px Inter, system-ui, sans-serif'; x.textAlign = 'left'; x.fillText(t.kategori, P, y);
    x.textAlign = 'right'; x.fillText(amt(t.total), W - P, y); x.textAlign = 'left';
    x.fillStyle = 'rgba(255,255,255,.16)'; rr(P, y + 22, W - P * 2, 18, 9); x.fill();
    x.fillStyle = '#FFFFFF'; rr(P, y + 22, Math.max(18, (W - P * 2) * (t.total / max)), 18, 9); x.fill();
    y += 120;
  }
  if (!r.top.length) { x.fillStyle = '#FFFFFF'; x.font = '500 38px Inter, system-ui, sans-serif'; x.fillText('Belum ada pengeluaran', P, y); }

  x.fillStyle = '#FFFFFF'; x.font = '700 44px Inter, system-ui, sans-serif';
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
      <div class="top with-back"><button class="icon-btn" data-act="back" aria-label="Kembali">${svg('back')}</button><h1>Rekap</h1></div>
      <div class="pad stack">
        <section class="recap" id="recap-card">
          <span class="wm">okane</span>
          <div class="rl">Rekap</div><h2>${esc(monthLong(month))}</h2>
          <div class="rb">${boxes(r).map(([l, v], i) => `<div><span>${l}</span><b class="num b${i}">${esc(v)}</b></div>`).join('')}</div>
          ${r.top.length ? `<div class="rt">${r.top.map(t => `<div><div class="rh"><b>${esc(t.kategori)}</b><b class="num">${esc(amt(t.total))}</b></div><div class="rbar"><i style="width:${Math.max(4, (t.total / max) * 100)}%"></i></div></div>`).join('')}</div>` : ''}
          <p class="ri">${esc(recapInsight(r))}</p>
        </section>
        <div class="row2"><button class="btn ghost" data-act="save">${svg('download', 18)} Simpan</button><button class="btn primary" data-act="share">${svg('share', 18)} Bagikan</button></div>
      </div>`;
  },
  bind(root, ctx) {
    root.querySelector('[data-act="back"]').onclick = () => ctx.back();
    const name = `okane-rekap-${month}.png`;
    const make = () => drawCard(recap(statTx(), month));
    const download = blob => {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob); a.download = name;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 2000);
      toast('Gambar disimpan');
    };
    root.querySelector('[data-act="save"]').onclick = async () => { const b = await make(); if (b) download(b); else toast('Gagal membuat gambar'); };
    root.querySelector('[data-act="share"]').onclick = async () => {
      const blob = await make();
      if (!blob) { toast('Gagal membuat gambar'); return; }
      const file = new File([blob], name, { type: 'image/png' });
      if (navigator.canShare?.({ files: [file] })) {
        try { await navigator.share({ files: [file], title: `Rekap ${monthLong(month)}` }); } catch (e) { if (e?.name !== 'AbortError') download(blob); }
      } else download(blob);
    };
  },
};
