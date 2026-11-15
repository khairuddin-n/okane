// Google Identity Services — token client. Token hanya disimpan di memori.
import { GOOGLE_CLIENT_ID } from '../config.js';

export const SCOPE = 'https://www.googleapis.com/auth/drive.file';
let client = null;
let token = null;
let expiresAt = 0;
let waiter = null;

function gisReady(timeout = 15000) {
  return new Promise((resolve, reject) => {
    const t0 = Date.now();
    (function poll() {
      if (window.google?.accounts?.oauth2) return resolve();
      if (Date.now() - t0 > timeout) return reject(new Error('Google Sign-In tidak termuat'));
      setTimeout(poll, 100);
    })();
  });
}

export async function init() {
  if (client || !GOOGLE_CLIENT_ID) return;
  await gisReady();
  client = google.accounts.oauth2.initTokenClient({
    client_id: GOOGLE_CLIENT_ID,
    scope: SCOPE,
    callback: resp => {
      const w = waiter; waiter = null;
      if (resp.error) { w?.reject(new Error(resp.error_description || resp.error)); return; }
      if (!google.accounts.oauth2.hasGrantedAllScopes(resp, SCOPE)) {
        w?.reject(Object.assign(new Error('Izin akses file Drive diperlukan supaya okane bisa menyimpan data.'), { code: 'scope' }));
        return;
      }
      token = resp.access_token;
      expiresAt = Date.now() + (Number(resp.expires_in) - 60) * 1000;
      w?.resolve(token);
    },
    error_callback: err => {
      const w = waiter; waiter = null;
      w?.reject(Object.assign(new Error(err?.message || err?.type || 'Login dibatalkan'), { code: err?.type }));
    },
  });
}

export const ready = () => !!client;

// Harus dipanggil langsung dari aksi pengguna (klik), supaya popup tidak diblokir.
export function request({ prompt = '' } = {}) {
  if (!client) return Promise.reject(Object.assign(new Error('Google Sign-In belum siap. Periksa koneksi internet.'), { code: 'not_ready' }));
  if (waiter) waiter.reject(new Error('dibatalkan'));
  return new Promise((resolve, reject) => {
    waiter = { resolve, reject };
    const opts = { prompt };
    try { const hint = localStorage.getItem('okane_hint'); if (hint) opts.login_hint = hint; } catch {}
    client.requestAccessToken(opts);
  });
}

export const getToken = () => (token && Date.now() < expiresAt ? token : null);
export const invalidate = () => { token = null; expiresAt = 0; };

export function revoke() {
  const t = token;
  invalidate();
  if (t && window.google?.accounts?.oauth2) return new Promise(res => google.accounts.oauth2.revoke(t, () => res()));
  return Promise.resolve();
}
