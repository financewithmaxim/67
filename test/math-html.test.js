import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { escapeMathLt } from '../js/mathhtml.js';

test('escapes bare < inside $$ display math', () => {
  assert.equal(escapeMathLt('$$ \\Pr(V_i<c_i)=\\Phi(c_i) $$'), '$$ \\Pr(V_i&lt;c_i)=\\Phi(c_i) $$');
});
test('escapes bare < inside \\( inline math and \\[ display math', () => {
  assert.equal(escapeMathLt('\\(a<b\\)'), '\\(a&lt;b\\)');
  assert.equal(escapeMathLt('\\[ x<y \\]'), '\\[ x&lt;y \\]');
});
test('leaves real HTML tags outside math untouched', () => {
  const src = '<p>x \\(a<b\\) <em>y</em> z>w</p>';
  assert.equal(escapeMathLt(src), '<p>x \\(a&lt;b\\) <em>y</em> z>w</p>');
});
test('does not touch a < with no following math region', () => {
  assert.equal(escapeMathLt('<div class="formula">plain</div>'), '<div class="formula">plain</div>');
});
test('idempotent: a second pass changes nothing', () => {
  const once = escapeMathLt('$$ V_i<c_i $$ and \\(p<q\\)');
  assert.equal(escapeMathLt(once), once);
  assert.ok(!/<[a-zA-Z]/.test(once.replace(/<\/?[a-z]/g, ''))); // no bare math-< left (heuristic)
});
test('non-string input returned unchanged', () => {
  assert.equal(escapeMathLt(null), null);
  assert.equal(escapeMathLt(undefined), undefined);
});

// Durable invariant: no module/glossary/capstone HTML has a bare "<letter" left inside a math span.
const MATH = /(\$\$[\s\S]*?\$\$|\\\[[\s\S]*?\\\]|\\\([\s\S]*?\\\))/g;
const HTML = readdirSync('modules').filter(f => /^m\d+\.html$/.test(f)).map(f => `modules/${f}`).concat(['glossary.html', 'capstone.html']);
for (const path of HTML) {
  test(`no bare "<letter" inside math spans of ${path}`, () => {
    const src = readFileSync(path, 'utf8');
    const offenders = [];
    for (const m of src.matchAll(MATH)) {
      const bad = m[0].match(/<[a-zA-Z]/g);
      if (bad) offenders.push(`${path}: ${m[0].slice(0, 40)}… has ${bad.join(',')}`);
    }
    assert.equal(offenders.length, 0, offenders.slice(0, 5).join('\n'));
  });
}
