import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';

test('sw.js mem-precache semua file JS aplikasi', () => {
  const sw = readFileSync(new URL('../sw.js', import.meta.url), 'utf8');
  const files = [
    ...readdirSync(new URL('../js/', import.meta.url)).filter(f => f.endsWith('.js')).map(f => `./js/${f}`),
    ...readdirSync(new URL('../js/screens/', import.meta.url)).filter(f => f.endsWith('.js')).map(f => `./js/screens/${f}`),
  ];
  const missing = files.filter(f => !sw.includes(`'${f}'`));
  assert.deepEqual(missing, []);
});
