import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { validateCard, lintDeck } from '../js/cardlint.js';

const exemplar = JSON.parse(readFileSync(new URL('../data/cards/_exemplar.json', import.meta.url)));

test('the shipped exemplar deck is lint-clean', () => {
  assert.deepEqual(lintDeck(exemplar.cards), []);
});

test('the exemplar covers every card type', () => {
  const types = new Set(exemplar.cards.map(c => c.type));
  for (const t of ['numeric', 'cloze', 'deriveStep', 'discrimination', 'viva']) {
    assert.ok(types.has(t), `exemplar missing a ${t} card`);
  }
});

test('validateCard rejects a bad id and a missing required field', () => {
  assert.ok(validateCard({ id: 'BAD', module: 'm05', type: 'numeric', front: 'x', tags: { spine: 'reg' }, version: 'v', sourceRef: { module: 'm05', anchor: 'a' }, answer: { value: 1 } }).length > 0);
  assert.ok(validateCard({ id: 'm05.num.x', module: 'm05', type: 'numeric', front: 'x', tags: { spine: 'reg' }, version: 'v', sourceRef: { module: 'm05', anchor: 'a' } }).some(e => /answer/.test(e)));
});

test('validateCard rejects an unknown spine value', () => {
  assert.ok(validateCard({ id: 'm05.disc.x', module: 'm05', type: 'discrimination', front: 'x', tags: { spine: 'maybe' }, version: 'v', sourceRef: { module: 'm05', anchor: 'a' }, verdict: 'reg', rubric: ['x'] }).some(e => /spine/.test(e)));
});

test('lintDeck flags duplicate ids', () => {
  const dup = [
    { id: 'm05.num.a', module: 'm05', type: 'numeric', front: 'x', tags: { spine: 'reg' }, version: 'v', sourceRef: { module: 'm05', anchor: 'a' }, answer: { value: 1 } },
    { id: 'm05.num.a', module: 'm05', type: 'numeric', front: 'y', tags: { spine: 'reg' }, version: 'v', sourceRef: { module: 'm05', anchor: 'a' }, answer: { value: 2 } },
  ];
  assert.ok(lintDeck(dup).some(r => r.errors.some(e => /duplicate/i.test(e))));
});
