// Tema: system (default) / light / dark, disimpan di localStorage.theme
const mq = window.matchMedia('(prefers-color-scheme: dark)');
const listeners = new Set();

export function getPref() {
  try { return localStorage.getItem('theme') || 'system'; } catch { return 'system'; }
}
export const systemIsDark = () => mq.matches;
export const isDark = () => document.documentElement.dataset.theme === 'dark';

export function apply() {
  const p = getPref();
  const dark = p === 'dark' || (p === 'system' && mq.matches);
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? '#0E1513' : '#0B5D4E');
  for (const fn of listeners) fn();
}

export function setPref(p) {
  try { localStorage.setItem('theme', p); } catch {}
  apply();
}

export const onThemeChange = fn => listeners.add(fn);
mq.addEventListener('change', () => { if (getPref() === 'system') apply(); });
