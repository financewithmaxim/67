// Idempotent codemod: escape bare '<' inside TeX math spans across all content HTML,
// so the HTML parser never reads a math '<' as a start tag. See js/mathhtml.js.
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { escapeMathLt } from '../js/mathhtml.js';

const files = readdirSync('modules').filter(f => /^m\d+\.html$/.test(f)).map(f => `modules/${f}`).concat(['glossary.html', 'capstone.html']);

let changed = 0;
for (const path of files) {
  const before = readFileSync(path, 'utf8');
  const after = escapeMathLt(before);
  if (after !== before) { writeFileSync(path, after); changed++; console.log(`escaped: ${path}`); }
}
console.log(`TOTAL: ${changed} file(s) changed`);
