// Idempotent codemod: load js/lesson.js (the lesson enhancer) on every module
// page (m01–m24). Inserted before </body>, after the other module scripts.
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';

const mods = readdirSync('modules').filter(f => /^m\d+\.html$/.test(f)).map(f => `modules/${f}`);
let changed = 0;
for (const path of mods) {
  let html = readFileSync(path, 'utf8');
  if (html.includes('js/lesson.js')) continue;
  const tag = `<script type="module" src="../js/lesson.js"></script>`;
  if (!html.includes('</body>')) { console.log(`SKIP (no </body>): ${path}`); continue; }
  html = html.replace('</body>', `${tag}\n</body>`);
  writeFileSync(path, html);
  changed++;
}
console.log(`TOTAL: ${changed} module(s) now load lesson.js`);
