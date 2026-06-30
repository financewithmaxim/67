import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newSched, grade, DAY_MS, LEARN_STEP_MS } from '../js/srs.js';

const T0 = 1_000_000_000_000; // fixed epoch for deterministic golden tests

test('newSched is a fresh new-state card', () => {
  assert.deepEqual(newSched(), { state: 'new', interval: 0, ease: 2.5, reps: 0, lapses: 0, lastGrade: null, pending: 0 });
});

test('new + good graduates to review at 1 day', () => {
  const s = grade(newSched(), 'good', T0);
  assert.equal(s.state, 'review');
  assert.equal(s.interval, 1);
  assert.equal(s.ease, 2.5);          // graduation does not change ease
  assert.equal(s.reps, 1);
  assert.equal(s.due, T0 + 1 * DAY_MS);
  assert.equal(s.lastGrade, 'good');
});

test('new + easy graduates to review at 6 days', () => {
  const s = grade(newSched(), 'easy', T0);
  assert.equal(s.state, 'review');
  assert.equal(s.interval, 6);
  assert.equal(s.due, T0 + 6 * DAY_MS);
});

test('new + again drops to learning, due in one learn-step, reps stay 0', () => {
  const s = grade(newSched(), 'again', T0);
  assert.equal(s.state, 'learning');
  assert.equal(s.reps, 0);
  assert.equal(s.due, T0 + LEARN_STEP_MS);
});

test('learning + good graduates to review at 1 day', () => {
  const learning = grade(newSched(), 'again', T0);
  const s = grade(learning, 'good', T0 + LEARN_STEP_MS);
  assert.equal(s.state, 'review');
  assert.equal(s.interval, 1);
});
