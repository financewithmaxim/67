import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cardsByModule, moduleReadiness } from '../js/readiness.js';

const NOW = 1_700_000_000_000, DAY = 86_400_000;

test('cardsByModule groups card ids by their module', () => {
  const by = cardsByModule([{ id: 'm01.a', module: 'm01' }, { id: 'm01.b', module: 'm01' }, { id: 'm02.c', module: 'm02' }]);
  assert.deepEqual(by, { m01: ['m01.a', 'm01.b'], m02: ['m02.c'] });
});

test('not-started when no cards of the module are introduced', () => {
  const r = moduleReadiness({}, { m01: ['m01.a', 'm01.b'] }, NOW);
  assert.equal(r.m01, 'not-started');
});

test('due when any introduced card is due now (and not suspended)', () => {
  const sched = { 'm01.a': { state: 'review', due: NOW - DAY, interval: 5 } };
  assert.equal(moduleReadiness(sched, { m01: ['m01.a', 'm01.b'] }, NOW).m01, 'due');
});

test('strong when all cards introduced, all in review state, none due', () => {
  const sched = { 'm01.a': { state: 'review', due: NOW + DAY, interval: 9 }, 'm01.b': { state: 'review', due: NOW + 2 * DAY, interval: 9 } };
  assert.equal(moduleReadiness(sched, { m01: ['m01.a', 'm01.b'] }, NOW).m01, 'strong');
});

test('learning when some introduced or some still in learning/relearn (none due)', () => {
  const partial = { 'm01.a': { state: 'review', due: NOW + DAY, interval: 9 } }; // only 1 of 2 introduced
  assert.equal(moduleReadiness(partial, { m01: ['m01.a', 'm01.b'] }, NOW).m01, 'learning');
  const learning = { 'm01.a': { state: 'learning', due: NOW + 600000 }, 'm01.b': { state: 'review', due: NOW + DAY } };
  assert.equal(moduleReadiness(learning, { m01: ['m01.a', 'm01.b'] }, NOW).m01, 'learning');
});

test('suspended (leech) does not count as due', () => {
  const sched = { 'm01.a': { state: 'suspended', due: NOW - DAY }, 'm01.b': { state: 'review', due: NOW + DAY } };
  assert.notEqual(moduleReadiness(sched, { m01: ['m01.a', 'm01.b'] }, NOW).m01, 'due');
});
