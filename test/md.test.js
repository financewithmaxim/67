import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mdInline } from '../js/md.js';

test('renders **bold** and `code`', () => {
  assert.equal(mdInline('a **total capital ratio** b'), 'a <strong>total capital ratio</strong> b');
  assert.equal(mdInline('use `CET1` here'), 'use <code>CET1</code> here');
});
test('escapes < > in prose', () => {
  assert.equal(mdInline('PD < 1% and x > 0'), 'PD &lt; 1% and x &gt; 0');
});
test('leaves inline \\(…\\) math verbatim (no markdown, no escaping inside)', () => {
  assert.equal(mdInline('the value \\(V_i < c_i\\) holds'), 'the value \\(V_i < c_i\\) holds');
});
test('leaves $$…$$ display math verbatim while rendering bold outside', () => {
  assert.equal(mdInline('**result:** $$ a<b $$ done'), '<strong>result:</strong> $$ a<b $$ done');
});
test('does not treat TeX _ or single * as italic', () => {
  assert.equal(mdInline('\\(a_i\\) and \\(b*c\\)'), '\\(a_i\\) and \\(b*c\\)');
});
test('non-string input → empty string', () => {
  assert.equal(mdInline(null), '');
  assert.equal(mdInline(undefined), '');
});
