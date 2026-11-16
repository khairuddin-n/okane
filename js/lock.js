// Kunci aplikasi: PIN 6 digit (hash PBKDF2, hanya di HP ini) + sidik jari opsional (WebAuthn lokal).
// Ini pelindung privasi di HP, bukan enkripsi data.
import * as db from './db.js';
import { svg, coin } from './icons.js';

const ITER = 150000;
const LEN = 6;
const IDLE_MS = 60 * 1000; // kunci lagi setelah 1 menit di background

const b64 = buf => btoa(String.fromCharCode(...new Uint8Array(buf)));
const unb64 = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));

async function derive(pin, salt) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(pin), 'PBKDF2', false, ['deriveBits']);
  return b64(await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: ITER }, key, 256));
}

export const hasLock = async () => !!(await db.getApp('lock'));
export async function setPin(pin) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  await db.setApp('lock', { salt: b64(salt), hash: await derive(pin, salt), iter: ITER });
}
export async function clearLock() { await db.setApp('lock', null); await db.setApp('lockBio', null); }
export async function verifyPin(pin) {
  const l = await db.getApp('lock');
  if (!l) return true;
  return (await derive(pin, unb64(l.salt))) === l.hash;
}

// ---------- Sidik jari (WebAuthn platform authenticator, pemeriksaan lokal) ----------
export async function bioAvailable() {
  try { return !!window.PublicKeyCredential && await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable(); } catch { return false; }
}
export const hasBio = async () => !!(await db.getApp('lockBio'));
export async function enableBio() {
  const cred = await navigator.credentials.create({
    publicKey: {
      challenge: crypto.getRandomValues(new Uint8Array(32)),
      rp: { name: 'okane' },
      user: { id: crypto.getRandomValues(new Uint8Array(16)), name: 'okane', displayName: 'okane' },
      pubKeyCredParams: [{ type: 'public-key', alg: -7 }, { type: 'public-key', alg: -257 }],
      authenticatorSelection: { authenticatorAttachment: 'platform', userVerification: 'required', residentKey: 'discouraged' },
      timeout: 60000, attestation: 'none',
    },
  });
  await db.setApp('lockBio', b64(cred.rawId));
}
export const disableBio = () => db.setApp('lockBio', null);
async function verifyBio() {
  const id = await db.getApp('lockBio');
  if (!id) return false;
  try {
    const res = await navigator.credentials.get({
      publicKey: { challenge: crypto.getRandomValues(new Uint8Array(32)), allowCredentials: [{ type: 'public-key', id: unb64(id), transports: ['internal'] }], userVerification: 'required', timeout: 60000 },
    });
    return !!res;
  } catch { return false; }
}

// ---------- Layar PIN ----------
let overlay = null;
export const isLocked = () => !!overlay;

/**
 * Layar keypad. mode 'unlock' (tidak bisa ditutup) atau 'create' (buat PIN, dua kali; bisa dibatalkan).
 * Mengembalikan PIN (create), true (unlock), atau null (dibatalkan).
 */
function pinPad({ mode, onForgot }) {
  return new Promise(resolve => {
    const el = document.createElement('div');
    el.className = 'lock';
    el.setAttribute('role', 'dialog');
    el.setAttribute('aria-modal', 'true');
    el.setAttribute('aria-label', mode === 'unlock' ? 'Aplikasi terkunci' : 'Buat PIN');
    let pin = '', first = '', fails = 0, busy = false, bio = false;
    const title = () => (mode === 'unlock' ? 'Masukkan PIN' : first ? 'Ulangi PIN' : 'Buat PIN 6 digit');
    const draw = (msg = '') => {
      el.innerHTML = `
        ${mode === 'create' ? `<button class="icon-btn lock-x" data-k="cancel" aria-label="Batal">${svg('x')}</button>` : ''}
        <div class="lock-top"><span class="lock-logo">${coin(34)}</span>
          <h1 id="lock-t">${title()}</h1>
          <div class="pin-dots ${msg ? 'bad' : ''}" aria-label="${pin.length} dari ${LEN} digit">${Array.from({ length: LEN }, (_, i) => `<i class="${i < pin.length ? 'on' : ''}"></i>`).join('')}</div>
          <p class="lock-msg" role="status">${msg}</p></div>
        <div class="keypad">
          ${[1, 2, 3, 4, 5, 6, 7, 8, 9].map(n => `<button data-k="${n}">${n}</button>`).join('')}
          ${bio ? `<button data-k="bio" class="alt" aria-label="Buka dengan sidik jari">${svg('finger', 26)}</button>` : '<span></span>'}
          <button data-k="0">0</button>
          <button data-k="del" class="alt" aria-label="Hapus">${svg('backspace', 26)}</button>
        </div>
        ${mode === 'unlock' ? '<button class="lock-forgot" data-k="forgot">Lupa PIN?</button>' : '<span class="lock-forgot"></span>'}`;
    };
    const finish = v => {
      document.removeEventListener('keydown', onKey, true);
      el.remove();
      if (mode === 'unlock') overlay = null;
      resolve(v);
    };
    const submit = async () => {
      busy = true;
      if (mode === 'create') {
        if (!first) { first = pin; pin = ''; draw(); }
        else if (pin === first) { finish(pin); return; }
        else { first = ''; pin = ''; draw('PIN tidak sama, ulangi'); }
      } else if (await verifyPin(pin)) { finish(true); return; }
      else {
        fails++; pin = '';
        if (fails >= 5) {
          let left = 30;
          draw(`Terlalu banyak percobaan. Tunggu ${left} detik`);
          await new Promise(r => { const t = setInterval(() => { left--; const m = el.querySelector('.lock-msg'); if (m) m.textContent = `Terlalu banyak percobaan. Tunggu ${left} detik`; if (left <= 0) { clearInterval(t); r(); } }, 1000); });
          fails = 0; draw();
        } else draw('PIN salah');
      }
      busy = false;
    };
    const press = async k => {
      if (busy) return;
      if (k === 'cancel') return finish(null);
      if (k === 'forgot') { onForgot?.(); return; }
      if (k === 'bio') { busy = true; const ok = await verifyBio(); busy = false; if (ok) finish(true); return; }
      if (k === 'del') pin = pin.slice(0, -1);
      else if (/^\d$/.test(k) && pin.length < LEN) pin += k;
      draw();
      if (pin.length === LEN) setTimeout(submit, 80);
    };
    const onKey = e => {
      if (!el.isConnected) return;
      if (/^\d$/.test(e.key)) { e.preventDefault(); press(e.key); }
      else if (e.key === 'Backspace') { e.preventDefault(); press('del'); }
      else if (e.key === 'Escape' && mode === 'create') { e.preventDefault(); press('cancel'); }
      else if (e.key === 'Tab') { /* fokus tetap di dalam layar kunci */ const f = [...el.querySelectorAll('button')]; if (!f.length) return; const i = f.indexOf(document.activeElement); e.preventDefault(); f[(i + (e.shiftKey ? -1 : 1) + f.length) % f.length].focus(); }
    };
    el.addEventListener('click', e => { const b = e.target.closest('[data-k]'); if (b) press(b.dataset.k); });
    document.addEventListener('keydown', onKey, true);
    draw();
    document.body.appendChild(el);
    if (mode === 'unlock') {
      overlay = el;
      hasBio().then(async v => { if (v && await bioAvailable()) { bio = true; if (!pin) draw(); press('bio'); } });
    }
    el.finish = finish;
  });
}

export const createPin = () => pinPad({ mode: 'create' });

let forgot = null;
let unlocked = null;
// Tampilkan layar kunci kalau kunci aktif. Selesai begitu layar kunci SUDAH tampil (bukan saat terbuka).
export async function lockNow() {
  if (overlay || !(await hasLock()) || overlay) return;
  pinPad({ mode: 'unlock', onForgot: () => forgot?.() }).then(() => unlocked?.());
}
// Dipakai setelah "Lupa PIN": tutup layar kunci tanpa PIN (data lokal sudah dihapus)
export function dismiss() { overlay?.finish?.(true); }

export function initLock({ onForgot, onUnlock }) {
  forgot = onForgot; unlocked = onUnlock;
  let hiddenAt = 0;
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') hiddenAt = Date.now();
    else if (hiddenAt && Date.now() - hiddenAt >= IDLE_MS) lockNow();
  });
  return lockNow();
}
