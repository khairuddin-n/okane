import { svg } from '../icons.js';
import { esc, rupiah, fmtDate } from '../format.js';
import { todayISO, nowISO } from '../dates.js';
import { nextAdminCharge, dueAdminCharges, num, ADMIN_CATEGORY } from '../model.js';
import { moneyInput, bindMoney, toast, confirmSheet, JENIS } from '../ui.js';
import { state, saveAccount, putMany } from '../store.js';

let f;

function fresh(id) {
  const r = state.rekening.find(x => x.id === id);
  if (r) return { ...r, isNew: false, adminOn: num(r.admin_nominal) > 0 && !!r.admin_jadwal, mode: r.admin_jadwal === 'akhir' ? 'akhir' : 'tgl', day: Number(String(r.admin_jadwal).split(':')[1]) || 25 };
  return { id: null, isNew: true, nama: '', keterangan: '', jenis: 'bank', saldo_awal: 0, saldo_minimum: 0, admin_nominal: 0, admin_jadwal: '', admin_kategori: ADMIN_CATEGORY, adminOn: false, mode: 'tgl', day: 25 };
}

const jadwal = () => (f.mode === 'akhir' ? 'akhir' : `tgl:${Math.max(1, Math.min(28, Number(f.day) || 1))}`);

function preview() {
  if (!f.adminOn || !(f.admin_nominal > 0)) return '';
  const next = nextAdminCharge({ admin_nominal: f.admin_nominal, admin_jadwal: jadwal(), dibuat: f.dibuat || nowISO() }, todayISO());
  return next ? `Next: ${fmtDate(next.tanggal)} · ${rupiah(-f.admin_nominal, { raw: true })}` : '';
}

function render() {
  const kats = state.kategori.filter(k => k.tipe === 'keluar' && !k.arsip);
  return `
    <div class="top with-back"><button class="icon-btn" data-act="back" aria-label="Back">${svg('back')}</button><h1>${f.isNew ? 'Add account' : 'Edit account'}</h1></div>
    <form class="pad stack" id="form" autocomplete="off">
      <label class="field"><span>Name</span><input class="input" name="nama" required value="${esc(f.nama)}" placeholder="BCA, GoPay, Wallet…"></label>
      <label class="field"><span>Description</span><input class="input" name="keterangan" value="${esc(f.keterangan)}" placeholder="—"></label>
      <div><div class="label">Type</div><div class="seg">${Object.entries(JENIS).map(([k, l]) => `<button type="button" data-jenis="${k}" class="${f.jenis === k ? 'on' : ''}" aria-pressed="${f.jenis === k}">${l}</button>`).join('')}</div></div>
      <div class="row2">
        <label class="field"><span>${f.isNew ? 'Current balance' : 'Starting balance'}</span>${moneyInput('saldo_awal', f.saldo_awal)}</label>
        <label class="field"><span>Minimum balance</span>${moneyInput('saldo_minimum', f.saldo_minimum)}</label>
      </div>
      <section class="card stack">
        <label class="inline-field" style="min-height:40px"><span>Monthly admin fee</span>
          <span class="switch"><input type="checkbox" name="adminOn" ${f.adminOn ? 'checked' : ''} aria-label="Monthly admin fee"><i></i></span></label>
        ${f.adminOn ? `
          <div class="row2">
            <label class="field"><span>Amount</span>${moneyInput('admin_nominal', f.admin_nominal)}</label>
            <label class="field"><span>Category</span><select class="input" name="admin_kategori">${kats.map(k => `<option ${k.nama === (f.admin_kategori || ADMIN_CATEGORY) ? 'selected' : ''}>${esc(k.nama)}</option>`).join('')}</select></label>
          </div>
          <div><div class="label">Charged on</div>
            <div class="chips" style="align-items:center">
              <button type="button" class="chip ${f.mode === 'tgl' ? 'on' : ''}" data-mode="tgl">Day</button>
              ${f.mode === 'tgl' ? `<input class="input num" name="day" type="number" min="1" max="28" inputmode="numeric" value="${f.day}" style="width:76px;min-height:38px" aria-label="Charge day">` : ''}
              <button type="button" class="chip ${f.mode === 'akhir' ? 'on' : ''}" data-mode="akhir">Month end</button>
            </div></div>
          <p class="muted" style="font-size:13px" id="pv">${preview()}</p>` : ''}
      </section>
      <button class="btn primary big" type="submit">Save</button>
      ${f.isNew ? '' : '<button class="btn danger-text big" type="button" data-act="archive">Archive account</button>'}
    </form>`;
}

export default {
  live: false,
  enter(query, params) { f = fresh(params.id); },
  render: () => render(),
  bind(root, ctx) {
    const $ = s => root.querySelector(s);
    const rerender = () => { readForm(); root.innerHTML = render(); this.bind(root, ctx); };
    const money = {};
    root.querySelectorAll('.money input').forEach(i => { money[i.name] = bindMoney(i, v => { f[i.name] = v; const pv = $('#pv'); if (pv) pv.innerHTML = preview(); }); });
    const readForm = () => {
      const fd = new FormData($('#form'));
      f.nama = String(fd.get('nama') || '').trim();
      f.keterangan = String(fd.get('keterangan') || '').trim();
      if (fd.has('admin_kategori')) f.admin_kategori = fd.get('admin_kategori');
      if (fd.has('day')) f.day = Number(fd.get('day')) || 1;
      for (const k in money) f[k] = money[k].get();
    };
    $('[data-act="back"]').onclick = () => ctx.back();
    root.querySelectorAll('[data-jenis]').forEach(b => { b.onclick = () => { f.jenis = b.dataset.jenis; rerender(); }; });
    $('[name="adminOn"]').onchange = e => { f.adminOn = e.target.checked; if (f.adminOn && !f.admin_nominal) f.admin_nominal = 0; rerender(); };
    root.querySelectorAll('[data-mode]').forEach(b => { b.onclick = () => { f.mode = b.dataset.mode; rerender(); }; });
    const day = $('[name="day"]');
    if (day) day.addEventListener('input', () => { f.day = Number(day.value) || 1; $('#pv').innerHTML = preview(); });
    $('[name="nama"]').addEventListener('input', e => { f.nama = e.target.value; const pv = $('#pv'); if (pv) pv.innerHTML = preview(); });

    $('#form').onsubmit = async e => {
      e.preventDefault();
      ctx.userAction?.();
      readForm();
      if (!f.nama) { toast('Enter an account name'); return; }
      if (f.adminOn && !(f.admin_nominal > 0)) { toast('Enter the admin fee amount'); return; }
      const prev = state.rekening.find(x => x.id === f.id);
      const acc = {
        ...(prev || {}),
        ...(f.id ? { id: f.id } : {}),
        nama: f.nama, keterangan: f.keterangan, jenis: f.jenis,
        saldo_awal: f.saldo_awal || 0, saldo_minimum: f.saldo_minimum || 0,
        admin_nominal: f.adminOn ? f.admin_nominal : 0,
        admin_jadwal: f.adminOn ? jadwal() : '',
        admin_kategori: f.adminOn ? (f.admin_kategori || ADMIN_CATEGORY) : '',
      };
      const saved = await saveAccount(acc);
      // Admin baru diaktifkan di rekening lama: tandai periode yang sudah lewat sebagai dilewati,
      // supaya tidak ada potongan mundur sejak rekening dibuat.
      const wasOn = prev && num(prev.admin_nominal) > 0 && prev.admin_jadwal;
      if (prev && !wasOn && f.adminOn) {
        const past = dueAdminCharges([saved], state.transaksi, todayISO()).map(t => ({ ...t, dihapus: true, catatan: 'Admin fee (before enabled)', dibuat: nowISO(), diubah: nowISO() }));
        if (past.length) await putMany('transaksi', past);
      }
      toast(f.isNew ? 'Account added' : 'Saved');
      ctx.back();
    };
    const arch = $('[data-act="archive"]');
    if (arch) arch.onclick = async () => {
      if (!await confirmSheet({ title: 'Archive account?', text: 'It will be hidden from lists and your total balance. Past transactions are kept.', ok: 'Archive', danger: true })) return;
      await saveAccount({ ...state.rekening.find(x => x.id === f.id), arsip: true });
      toast('Account archived');
      ctx.go('#/rekening');
    };
  },
};
