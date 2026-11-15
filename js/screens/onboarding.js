import { svg, GOOGLE_G } from '../icons.js';
import { esc, rupiah } from '../format.js';
import { JENIS, moneyInput, bindMoney, toast } from '../ui.js';
import { state, saveAccount, startLocal } from '../store.js';
import { activeAccounts, balances } from '../model.js';

let step = 'welcome';   // welcome | busy | accounts
let busyText = '';
let error = '';
let jenis = 'bank';

const LOGO = `<svg class="logo" viewBox="0 0 100 100" aria-hidden="true"><rect width="100" height="100" rx="24" fill="var(--primary)"/><path d="M23 50a27 27 0 1 0 54 0a27 27 0 1 0-54 0zM41 50a9 9 0 1 0 18 0a9 9 0 1 0-18 0z" fill="var(--on-primary)" fill-rule="evenodd"/></svg>`;

export const onboardingState = {
  setBusy(text) { step = 'busy'; busyText = text; error = ''; },
  setError(msg) { step = 'welcome'; error = msg; },
  toAccounts() { step = 'accounts'; error = ''; },
};

function welcome(canGoogle, canLocal) {
  return `<div class="onb">
    <div class="hero">
      ${LOGO}
      <span class="wordmark">okane</span>
      <h1>Uangmu, tercatat rapi.</h1>
      <p>Data tersimpan di Google Sheets milikmu.</p>
    </div>
    <div class="foot">
      ${error ? `<p class="err" role="alert">${esc(error)}</p>` : ''}
      ${canGoogle ? `<button class="btn google" data-act="google">${GOOGLE_G}<span>Masuk dengan Google</span></button>` : ''}
      ${canLocal ? `<button class="btn ${canGoogle ? 'ghost' : 'primary'} big" data-act="local">Coba tanpa akun (mode lokal)</button>` : ''}
    </div></div>`;
}

function busy() {
  return `<div class="onb"><div class="hero" style="align-items:center;text-align:center">${LOGO}<span class="wordmark">okane</span>
    <div style="display:flex;gap:10px;align-items:center;margin-top:12px"><span class="spinner"></span><span class="muted">${esc(busyText)}</span></div></div></div>`;
}

function accounts() {
  const accs = activeAccounts(state.rekening);
  const bal = balances(state.rekening, state.transaksi);
  return `<div class="onb" style="justify-content:flex-start;gap:16px">
    <div><span class="wordmark" style="font-size:28px">okane</span>
      <h1 style="margin-top:14px">Tambah rekening</h1>
      <p class="muted" style="margin-top:4px">Bank, e-wallet, atau tunai.</p></div>
    ${accs.length ? `<div class="list" style="margin:0">${accs.map(r => `<div class="li"><span class="tile k-${esc(r.jenis)}" style="color:var(--acc-text)">${svg(r.jenis === 'tunai' ? 'dompet' : r.jenis === 'ewallet' ? 'pulsa' : 'bank')}</span>
      <span class="mid"><span class="ttl">${esc(r.nama)}</span><span class="meta">${JENIS[r.jenis]}</span></span><b class="num">${rupiah(bal.get(r.id))}</b></div>`).join('')}</div>` : ''}
    <form class="card stack" id="accf" autocomplete="off">
      <label class="field"><span>Nama</span><input class="input" name="nama" placeholder="BCA, GoPay, Dompet…" required></label>
      <div><div class="label">Jenis</div><div class="seg">${Object.entries(JENIS).map(([k, l]) => `<button type="button" data-jenis="${k}" class="${jenis === k ? 'on' : ''}" aria-pressed="${jenis === k}">${l}</button>`).join('')}</div></div>
      <label class="field"><span>Saldo saat ini</span>${moneyInput('saldo', 0)}</label>
      <button class="btn ${accs.length ? 'ghost' : 'primary'} big" type="submit">${svg('plus', 18)} Tambah rekening</button>
    </form>
    <div style="margin-top:auto"><button class="btn primary big" data-act="done" ${accs.length ? '' : 'disabled'}>Selesai</button>
</div>
  </div>`;
}

export default {
  live: true,
  render(ctx) {
    if (step === 'accounts' || (state.mode && !activeAccounts(state.rekening).length && step !== 'busy')) { step = 'accounts'; return accounts(); }
    if (step === 'busy') return busy();
    return welcome(ctx.canGoogle?.(), ctx.canLocal?.());
  },
  bind(root, ctx) {
    const g = root.querySelector('[data-act="google"]');
    if (g) g.onclick = () => ctx.loginGoogle?.();
    const l = root.querySelector('[data-act="local"]');
    if (l) l.onclick = async () => { await startLocal(); step = 'accounts'; ctx.rerender(); };
    const form = root.querySelector('#accf');
    if (!form) return;
    const money = bindMoney(form.querySelector('[name="saldo"]'));
    root.querySelectorAll('[data-jenis]').forEach(b => {
      b.onclick = () => { jenis = b.dataset.jenis; root.querySelectorAll('[data-jenis]').forEach(x => { x.classList.toggle('on', x === b); x.setAttribute('aria-pressed', x === b); }); };
    });
    form.onsubmit = async e => {
      e.preventDefault();
      const nama = String(new FormData(form).get('nama') || '').trim();
      if (!nama) return;
      await saveAccount({ nama, jenis, saldo_awal: money.get() });
      toast(`${nama} ditambahkan`);
      jenis = 'bank';
      ctx.rerender();
      root.querySelector('[name="nama"]')?.focus();
    };
    root.querySelector('[data-act="done"]').onclick = () => {
      step = 'welcome';
      ctx.userAction?.();
      ctx.go('#/beranda', { replace: true });
    };
  },
};
