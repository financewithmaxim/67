import { test } from 'node:test';
import assert from 'node:assert/strict';
import { COURSE } from '../js/course.js';

test('COURSE exposes parts with mods as [id,title] pairs', () => {
  assert.ok(Array.isArray(COURSE.parts));
  assert.ok(COURSE.parts.length >= 7);
  for (const part of COURSE.parts) {
    assert.equal(typeof part.label, 'string');
    assert.ok(Array.isArray(part.mods));
    for (const m of part.mods) {
      assert.equal(m.length, 2);
      assert.equal(typeof m[0], 'string');
      assert.equal(typeof m[1], 'string');
    }
  }
});

test('COURSE contains m01..m24, capstone and glossary', () => {
  const ids = COURSE.parts.flatMap(p => p.mods.map(m => m[0]));
  for (let i = 1; i <= 24; i++) {
    const id = 'm' + String(i).padStart(2, '0');
    assert.ok(ids.includes(id), `missing ${id}`);
  }
  assert.ok(ids.includes('capstone'));
  assert.ok(ids.includes('glossary'));
});
