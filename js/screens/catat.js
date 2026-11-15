import { svg } from '../icons.js';
import { esc, rupiah, compact, group, parseAmount } from '../format.js';
import { todayISO, hhmm, isoDate, nowISO } from '../dates.js';
import { balances, activeAccounts, frequentEntries, matchNotes, guessCategory, applyGuess, guessLabel, num } from '../model.js';
import { tile, accChip, toast, confirmSheet, catTile, accName } from '../ui.js';
import { state, saveTx, deleteTx, findAccount } from '../store.js';

const TABS = [['keluar', 'Pengeluaran'], ['masuk', 'Pemasukan'], ['transfer', 'Transfer']];
let f; // form state

function freshForm(query) {
  const accs = activeAccounts(state.rekening);
  const now = new Date();
  const base = {
    id: null, original: null, tipe: 'keluar', nominal: 0, catatan: '',
    sel: { kategori: '', manual: false, auto: null }, akun: accs[0]?.id || '', akunManual: false,
    akunTujuan: accs[1]?.id || '', biaya: 0, tanggal: isoDate(now), jam: hhmm(now),
    tagihan_id: '', periode: '',
  };
  if (query.id) {
    const t = state.transaksi.find(x => x.id === query.id);
    if (t) {
      Object.assign(base, {
        id: t.id, original: t, tipe: t.tipe, nominal: num(t.nominal), catatan: t.catatan || '',
        sel: { kategori: t.kategori, manual: true, auto: null }, akun: t.akun, akunManual: true,
        akunTujuan: t.akun_tujuan || base.akunTujuan, biaya: num(t.biaya_admin), tanggal: t.tanggal, jam: t.jam || '00:00',
        tagihan_id: t.tagihan_id || '', periode: t.periode || '',
      });
      return base;
    }
  }
  if (['keluar', 'masuk', 'transfer'].includes(query.tipe)) base.tipe = query.tipe;
  if (query.dari && findAccount(query.dari)) {
    base.akun = query.dari; base.akunManual = true;
    if (base.akunTujuan === base.akun) base.akunTujuan = accs.find(r => r.id !== base.akun)?.id || '';
  }
  if (query.tagihan) {
    const b = state.tagihan.find(x => x.id === query.tagihan);
    if (b) Object.assign(base, {
      tipe: 'keluar', nominal: num(b.nominal), catatan: b.nama, sel: { kategori: b.kategori || 'Tagihan', manual: true, auto: null },
      akun: b.akun || base.akun, akunManual: true, tagihan_id: b.id, periode: query.periode || '',
    });
  }
  if (base.tipe !== 'transfer' && !base.sel.kategori) base.sel.kategori = defaultCat(base.tipe);
  return base;
}

const cats = tipe => state.kategori.filter(k => k.tipe === tipe && !k.arsip).sort((a, b) => num(a.urutan) - num(b.urutan));
const defaultCat = tipe => (cats(tipe)[0] || {}).nama || '';

function accChips(selected, attr) {
  const bal = balances(state.rekening, state.transaksi);
  return activeAccounts(state.rekening).map(r => accChip(r, r.id === selected, bal.get(r.id)).replace('data-acc=', `data-${attr}=`)).join('');
}

function catsHTML() {
  return cats(f.tipe).map(k => `<button type="button" class="cat ${k.nama === f.sel.kategori ? 'on' : ''}" data-cat="${esc(k.nama)}" aria-pressed="${k.nama === f.sel.kategori}">
    ${tile(k.ikon, k.warna, 'sm')}<span>${esc(k.nama)}</span></button>`).join('');
}

function suggestions() {
  const today = todayISO();
  const list = f.catatan.trim().length >= 2
    ? matchNotes(state.transaksi, f.catatan, f.tipe, 3)
    : (f.catatan.trim() ? [] : frequentEntries(state.transaksi, 60, 3, today, f.tipe));
  return list.filter(s => s.catatan.trim().toLowerCase() !== f.catatan.trim().toLowerCase() || !f.catatan);
}

function suggHTML() {
  return suggestions().map((s, i) => `<button type="button" class="chip" data-sugg="${i}">${esc(s.catatan)}${state.privacy ? '' : ` <small>${compact(s.nominal)}</small>`}</button>`).join('');
}

function render() {
  const editing = !!f.id;
  const isTransfer = f.tipe === 'transfer';
  const isAdj = f.tipe === 'penyesuaian';
  if (isAdj) {
    const t = f.original;
    return `<div class="catat">
      <div class="top with-back"><button class="icon-btn" data-act="close" aria-label="Tutup">${svg('x')}</button><h1>Penyesuaian saldo</h1></div>
      <div class="pad stack">
        <div class="card" style="display:flex;gap:12px;align-items:center">${catTile('penyesuaian')}
          <div style="flex:1"><b>${esc(accName(t.akun))}</b><div class="muted" style="font-size:13px">${esc(t.tanggal)} · ${esc(t.jam)}</div></div>
          <b class="num">${rupiah(t.nominal, { sign: true })}</b></div>
        <button class="btn danger-text big" data-act="delete">${svg('trash', 18)} Hapus</button>
      </div></div>`;
  }
  return `<div class="catat">
    <div class="top with-back">
      <button class="icon-btn" data-act="close" aria-label="Tutup">${svg('x')}</button>
      <h1>${editing ? 'Ubah transaksi' : 'Catat transaksi'}</h1>
      ${editing ? `<button class="icon-btn" data-act="delete" aria-label="Hapus transaksi" style="color:var(--expense)">${svg('trash')}</button>` : ''}
    </div>
    <div class="pad"><div class="seg" role="tablist">${TABS.map(([k, l]) => `<button type="button" role="tab" data-tipe="${k}" class="${f.tipe === k ? 'on' : ''}" aria-selected="${f.tipe === k}">${l}</button>`).join('')}</div></div>

    <label class="amount ${f.tipe}"><span>Rp</span>
      <input id="amt" inputmode="numeric" autocomplete="off" placeholder="0" aria-label="Nominal" value="${f.nominal ? group(f.nominal) : ''}"></label>
    <div class="chips quick">${[10000, 25000, 50000, 100000].map(v => `<button type="button" class="chip" data-quick="${v}">${v / 1000}rb</button>`).join('')}</div>

    <div class="pad stack" style="margin-top:10px">
      ${isTransfer ? `
        <div><div class="label">Dari rekening</div><div class="chips scroll" id="from">${accChips(f.akun, 'from')}</div></div>
        <div class="swap-row"><button type="button" class="icon-btn" data-act="swap" aria-label="Tukar rekening" style="background:var(--surface);box-shadow:var(--shadow)">${svg('swap')}</button></div>
        <div><div class="label">Ke rekening</div><div class="chips scroll" id="to">${accChips(f.akunTujuan, 'to')}</div></div>
        <label class="field"><span>Biaya admin</span>
          <div class="money"><input id="fee" class="input num" inputmode="numeric" autocomplete="off" placeholder="0" value="${f.biaya ? group(f.biaya) : ''}"></div></label>
        <label class="field"><span>Catatan</span><input id="note" class="input" autocomplete="off" placeholder="—" value="${esc(f.catatan)}"></label>
      ` : `
        <div><label class="field"><span>Catatan</span>
          <input id="note" class="input" autocomplete="off" placeholder="${f.tipe === 'keluar' ? 'Nasi padang, bensin…' : 'Gaji, bonus…'}" value="${esc(f.catatan)}"></label>
          <div class="chips scroll sugg" id="sugg">${suggHTML()}</div></div>
        <div><div class="label-row"><span class="label">Kategori</span><span class="auto-badge" id="badge">${esc(guessLabel(f.sel.auto))}</span></div>
          <div class="cat-grid" id="cats">${catsHTML()}</div></div>
        <div><div class="label">${f.tipe === 'keluar' ? 'Bayar pakai' : 'Masuk ke'}</div><div class="chips scroll" id="accs">${accChips(f.akun, 'acc')}</div></div>
      `}
      <div class="card" style="padding:4px 14px"><label class="inline-field"><span>Tanggal</span>
        <input id="when" type="datetime-local" value="${esc(f.tanggal)}T${esc(f.jam)}"></label></div>
    </div>
    <div class="save-bar"><button class="btn primary big" data-act="save">Simpan</button></div>
  </div>`;
}

export default {
  live: false,
  enter(query) { f = freshForm(query); },
  render: () => render(),
  bind(root, ctx) {
    const $ = s => root.querySelector(s);
    const rerender = () => { root.innerHTML = render(); this.bind(root, ctx); };

    $('[data-act="close"]').onclick = () => ctx.back();
    const del = $('[data-act="delete"]');
    if (del) del.onclick = async () => {
      ctx.userAction?.();
      if (!await confirmSheet({ title: 'Hapus transaksi?', text: 'Transaksi ini akan dihapus dari catatan dan Google Sheets.', ok: 'Hapus', danger: true })) return;
      await deleteTx(f.id);
      toast('Transaksi dihapus');
      ctx.back();
    };
    if (f.tipe === 'penyesuaian') return;

    root.querySelectorAll('[data-tipe]').forEach(b => {
      b.onclick = () => {
        if (b.dataset.tipe === f.tipe) return;
        f.tipe = b.dataset.tipe;
        f.sel = { kategori: f.tipe === 'transfer' ? '' : defaultCat(f.tipe), manual: false, auto: null };
        if (f.tipe !== 'transfer' && f.catatan) f.sel = applyGuess(f.sel, guessCategory(f.catatan, f.tipe, state.transaksi, state.kategori));
        if (f.tipe === 'transfer' && f.akunTujuan === f.akun) f.akunTujuan = activeAccounts(state.rekening).find(r => r.id !== f.akun)?.id || '';
        rerender();
      };
    });

    const amt = $('#amt');
    const fit = () => { amt.style.width = `${Math.max(1, amt.value.length) * 0.62 + 0.4}em`; };
    amt.addEventListener('input', () => {
      const v = parseAmount(amt.value);
      amt.value = v ? group(v) : '';
      f.nominal = v;
      fit();
    });
    fit();
    root.querySelectorAll('[data-quick]').forEach(b => { b.onclick = () => { f.nominal = Number(b.dataset.quick); amt.value = group(f.nominal); fit(); }; });

    const note = $('#note');
    note.addEventListener('input', () => {
      f.catatan = note.value;
      if (f.tipe === 'transfer') return;
      const g = guessCategory(f.catatan, f.tipe, state.transaksi, state.kategori);
      const before = f.sel.kategori;
      f.sel = applyGuess(f.sel, f.catatan.trim() ? g : null);
      if (!f.sel.manual && !f.akunManual && g?.akun && findAccount(g.akun) && !findAccount(g.akun).arsip) {
        f.akun = g.akun; $('#accs').innerHTML = accChips(f.akun, 'acc'); bindAccs();
      }
      $('#badge').textContent = guessLabel(f.sel.auto);
      if (before !== f.sel.kategori) { $('#cats').innerHTML = catsHTML(); bindCats(); }
      $('#sugg').innerHTML = suggHTML(); bindSugg();
    });

    const bindCats = () => root.querySelectorAll('[data-cat]').forEach(b => {
      b.onclick = () => { f.sel = { kategori: b.dataset.cat, manual: true, auto: null }; $('#badge').textContent = ''; $('#cats').innerHTML = catsHTML(); bindCats(); };
    });
    const bindAccs = () => root.querySelectorAll('[data-acc]').forEach(b => {
      b.onclick = () => { f.akun = b.dataset.acc; f.akunManual = true; $('#accs').innerHTML = accChips(f.akun, 'acc'); bindAccs(); };
    });
    const bindSugg = () => {
      const list = suggestions();
      root.querySelectorAll('[data-sugg]').forEach(b => {
        b.onclick = () => {
          const s = list[Number(b.dataset.sugg)];
          if (!s) return;
          Object.assign(f, { catatan: s.catatan, nominal: s.nominal, sel: { kategori: s.kategori, manual: true, auto: null } });
          if (findAccount(s.akun) && !findAccount(s.akun).arsip) { f.akun = s.akun; f.akunManual = true; }
          rerender();
        };
      });
    };
    if (f.tipe !== 'transfer') { bindCats(); bindAccs(); bindSugg(); }
    else {
      const bindTr = () => {
        root.querySelectorAll('[data-from]').forEach(b => { b.onclick = () => { f.akun = b.dataset.from; $('#from').innerHTML = accChips(f.akun, 'from'); bindTr(); }; });
        root.querySelectorAll('[data-to]').forEach(b => { b.onclick = () => { f.akunTujuan = b.dataset.to; $('#to').innerHTML = accChips(f.akunTujuan, 'to'); bindTr(); }; });
      };
      bindTr();
      $('[data-act="swap"]').onclick = () => {
        [f.akun, f.akunTujuan] = [f.akunTujuan, f.akun];
        $('#from').innerHTML = accChips(f.akun, 'from'); $('#to').innerHTML = accChips(f.akunTujuan, 'to'); bindTr();
      };
      const fee = $('#fee');
      fee.addEventListener('input', () => { const v = parseAmount(fee.value); fee.value = v ? group(v) : ''; f.biaya = v; });
    }

    $('#when').addEventListener('change', e => {
      const [d, t] = String(e.target.value).split('T');
      if (d) { f.tanggal = d; f.jam = (t || '00:00').slice(0, 5); }
    });

    $('[data-act="save"]').onclick = async () => {
      ctx.userAction?.();
      if (!(f.nominal > 0)) { toast('Isi nominal dulu'); amt.focus(); return; }
      if (!f.akun || !findAccount(f.akun)) { toast('Pilih rekening dulu'); return; }
      if (f.tipe === 'transfer') {
        if (!f.akunTujuan || f.akunTujuan === f.akun) { toast('Pilih rekening tujuan yang berbeda'); return; }
      } else if (!f.sel.kategori) { toast('Pilih kategori dulu'); return; }
      const tx = {
        ...(f.original || {}),
        id: f.id || crypto.randomUUID(), tanggal: f.tanggal, jam: f.jam, tipe: f.tipe, nominal: f.nominal,
        kategori: f.tipe === 'transfer' ? '' : f.sel.kategori, akun: f.akun,
        akun_tujuan: f.tipe === 'transfer' ? f.akunTujuan : '', biaya_admin: f.tipe === 'transfer' ? f.biaya : 0,
        catatan: f.catatan.trim(), tagihan_id: f.tagihan_id, periode: f.periode,
        diubah: nowISO(),
      };
      await saveTx(tx);
      toast('Tersimpan');
      ctx.back();
    };

    if (!f.id && !f.nominal) setTimeout(() => amt.focus({ preventScroll: true }), 50);
  },
};
