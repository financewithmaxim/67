// Idempotent codemod: load js/theme.js in every page's <head> (right after the
// stylesheet link) so the light/dark theme is applied before first paint.
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';

const roots = readdirSync('.').filter(f => /\.html$/.test(f)).map(f => ({ path: f, pre: '' }));
const mods = readdirSync('modules').filter(f => /\.html$/.test(f)).map(f => ({ path: `modules/${f}`, pre: '../' }));

let changed = 0;
for (const { path, pre } of [...roots, ...mods]) {
  let html = readFileSync(path, 'utf8');
  if (html.includes('js/theme.js')) continue;
  const tag = `<script src="${pre}js/theme.js"></script>`;
  // insert right after the stylesheet <link ... style.css ...>
  const m = html.match(/<link[^>]+css\/style\.css[^>]*>/i);
  if (!m) { console.log(`SKIP (no stylesheet link): ${path}`); continue; }
  html = html.replace(m[0], `${m[0]}\n${tag}`);
  writeFileSync(path, html);
  changed++;
}
console.log(`TOTAL: ${changed} page(s) now load theme.js`);
