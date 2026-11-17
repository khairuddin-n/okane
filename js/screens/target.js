// Tab Target di layar Rekening: target tabungan (terhubung rekening atau disisihkan manual).
import { svg } from '../icons.js';
import { esc, rupiah, pct, monthShort } from '../format.js';
import { activeAccounts, targetProgress, targetForecast, num } from '../model.js';
import { tile, openSheet, toast, moneyInput, bindMoney, confirmSheet } from '../ui.js';
import { state, saveTarget } from '../store.js';

const ICONS = [['investasi', 'hijau'], ['rumah', 'biru'], ['pesawat', 'langit'], ['transport', 'oranye'], ['pendidikan', 'ungu'], ['pulsa', 'teal'], ['hadiah', 'pink'], ['kesehatan', 'kuning']];
const monthYear = m => `${monthShort(m)} ${m.slice(0, 4)}`;

function forecastText(f) {
  if (!f) return '';
  if (f.kind === 'lewat') return `Deadline passed · ${rupiah(f.kurang)} to go`;
  if (f.kind === 'tenggat') return `${rupiah(f.perBulan)}/month until ${monthYear(f.bulan)}`;
  return `Reached around ${monthYear(f.bulan)}`;
}

export function targetTab(today) {
  const list = state.target.filter(t => !t.arsip);
  const cards = list.map(t => {
    const p = targetProgress(t, state.rekening, state.transaksi);
    const f = targetForecast(t, state.rekening, state.transaksi, today);
    const src = p.linked ? state.rekening.find(r => r.id === t.rekening_id)?.nama : 'Manual';
    return `<section class="card tgt">
      <button class="tgt-h" data-target="${esc(t.id)}" aria-label="Edit goal ${esc(t.nama)}">
        ${tile(t.ikon || 'investasi', t.warna || 'hijau')}
        <span class="mid"><span class="ttl">${esc(t.nama)}</span><span class="meta">${esc(src || 'Manual')}</span></span>
        <span class="badge ${p.done ? '' : 'muted'}">${p.done ? `${svg('check', 12)}Reached` : pct(Math.min(1, p.pct))}</span>
      </button>
      <div class="bar"><i style="width:${Math.min(100, p.pct * 100)}%"></i></div>
      <div class="tgt-f"><span class="num"><b>${rupiah(p.terkumpul)}</b> of ${rupiah(p.goal)}</span>
        ${p.linked ? '' : `<button class="btn sm" data-set="${esc(t.id)}">Add</button>`}</div>
      ${f ? `<div class="tgt-e num">${esc(forecastText(f))}</div>` : ''}
    </section>`;
  }).join('');
  return `<div class="pad stack">${cards}
    <button class="btn dashed big" data-act="target-new">${svg('plus', 18)} New goal</button></div>`;
}

export function openTargetSheet(id) {
  const existing = state.target.find(x => x.id === id);
  const t = existing ? { ...existing } : { nama: '', ikon: 'investasi', warna: 'hijau', target_nominal: 0, target_tanggal: '', rekening_id: '', terkumpul_manual: 0 };
  const accs = activeAccounts(state.rekening);
  const icons = () => ICONS.map(([i, c]) => `<button type="button" data-ic="${i}" data-col="${c}" class="c-${c} ${t.ikon === i ? 'on' : ''}" aria-label="Icon ${i}" aria-pressed="${t.ikon === i}">${svg(i, 20)}</button>`).join('');
  openSheet({
    title: existing ? 'Edit goal' : 'New goal',
    body: `<form class="stack" id="tf">
      <label class="field"><span>Name</span><input class="input" name="nama" required value="${esc(t.nama)}" placeholder="Emergency fund, holiday…" ${existing ? '' : 'autofocus'}></label>
      <div class="icon-grid tgt-icons" id="tic">${icons()}</div>
      <label class="field"><span>Target amount</span>${moneyInput('target_nominal', t.target_nominal)}</label>
      <div class="row2">
        <label class="field"><span>Track from</span><select class="input" name="rekening_id"><option value="">Manual</option>${accs.map(r => `<option value="${esc(r.id)}" ${r.id === t.rekening_id ? 'selected' : ''}>${esc(r.nama)}</option>`).join('')}</select></label>
        <label class="field"><span>Deadline (optional)</span><input class="input" name="target_tanggal" type="date" value="${esc(t.target_tanggal || '')}"></label>
      </div>
      <button class="btn primary big" type="submit">Save</button>
      ${existing ? '<button class="btn danger-text big" type="button" data-act="arch">Delete goal</button>' : ''}
    </form>`,
    onMount(el, close) {
      const money = bindMoney(el.querySelector('[name="target_nominal"]'));
      const bindIcons = () => el.querySelectorAll('[data-ic]').forEach(b => {
        b.onclick = () => { t.ikon = b.dataset.ic; t.warna = b.dataset.col; el.querySelector('#tic').innerHTML = icons(); bindIcons(); };
      });
      bindIcons();
      el.querySelector('#tf').onsubmit = async e => {
        e.preventDefault();
        const fd = new FormData(e.target);
        const nama = String(fd.get('nama')).trim();
        if (!nama || !(money.get() > 0)) { toast('Enter a name and target amount'); return; }
        await saveTarget({ ...t, nama, target_nominal: money.get(), rekening_id: fd.get('rekening_id') || '', target_tanggal: fd.get('target_tanggal') || '' });
        close(); toast('Goal saved');
      };
      const arch = el.querySelector('[data-act="arch"]');
      if (arch) arch.onclick = async () => {
        close();
        if (await confirmSheet({ title: `Delete goal ${t.nama}?`, text: 'Only the goal is removed. Balances and transactions don’t change.', ok: 'Delete', danger: true })) {
          await saveTarget({ ...existing, arsip: true }); toast('Goal deleted');
        }
      };
    },
  });
}

// "Sisihkan": hanya mengubah angka target, tanpa membuat transaksi
function openSetAside(id) {
  const t = state.target.find(x => x.id === id);
  if (!t) return;
  const cur = num(t.terkumpul_manual);
  openSheet({
    title: `Set aside · ${t.nama}`,
    body: `<form class="stack" id="sf">
      <p class="muted" style="font-size:13px">Saved so far <b class="num">${rupiah(cur)}</b></p>
      <label class="field"><span>Amount</span>${moneyInput('n', 0, 'autofocus')}</label>
      <div class="row2"><button class="btn ghost" type="button" data-act="minus">Take out</button><button class="btn primary" type="submit">Add</button></div>
    </form>`,
    onMount(el, close) {
      const money = bindMoney(el.querySelector('[name="n"]'));
      const apply = async sign => {
        const v = money.get();
        if (!(v > 0)) { toast('Enter an amount'); return; }
        await saveTarget({ ...t, terkumpul_manual: Math.max(0, cur + sign * v) });
        close(); toast(sign > 0 ? 'Added' : 'Taken out');
      };
      el.querySelector('#sf').onsubmit = e => { e.preventDefault(); apply(1); };
      el.querySelector('[data-act="minus"]').onclick = () => apply(-1);
    },
  });
}

export function bindTarget(root) {
  root.querySelectorAll('[data-target]').forEach(b => { b.onclick = () => openTargetSheet(b.dataset.target); });
  root.querySelectorAll('[data-set]').forEach(b => { b.onclick = () => openSetAside(b.dataset.set); });
  const add = root.querySelector('[data-act="target-new"]');
  if (add) add.onclick = () => openTargetSheet(null);
}
