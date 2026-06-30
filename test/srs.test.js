import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newSched, grade, DAY_MS, LEARN_STEP_MS, applyFuzz } from '../js/srs.js';

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

function reviewCard({ interval = 10, ease = 2.5, reps = 3, lapses = 0, due = T0 } = {}) {
  return { state: 'review', interval, ease, reps, lapses, lastGrade: 'good', pending: 0, due };
}

test('review + good at due multiplies interval by ease', () => {
  const s = grade(reviewCard({ interval: 10, ease: 2.5, due: T0 }), 'good', T0);
  assert.equal(s.interval, 25);            // 10 * 2.5
  assert.equal(s.reps, 4);
  assert.equal(s.due, T0 + 25 * DAY_MS);
});

test('review + good when overdue credits the elapsed time', () => {
  const due = T0 - 5 * DAY_MS;             // 5 days overdue
  const s = grade(reviewCard({ interval: 10, ease: 2.5, due }), 'good', T0);
  assert.equal(s.interval, (10 + 5) * 2.5); // (prior + overdue) * ease = 37.5
});

test('review + hard grows ×1.2 and drops ease by 0.15', () => {
  const s = grade(reviewCard({ interval: 10, ease: 2.5, due: T0 }), 'hard', T0);
  assert.equal(s.interval, 12);
  assert.equal(Number(s.ease.toFixed(2)), 2.35);
});

test('review + easy grows ×ease×1.3 and raises ease by 0.15', () => {
  const s = grade(reviewCard({ interval: 10, ease: 2.5, due: T0 }), 'easy', T0);
  assert.equal(s.interval, 32.5);          // 10 * 2.5 * 1.3
  assert.equal(Number(s.ease.toFixed(2)), 2.65);
});

test('ease never drops below the floor of 1.30', () => {
  const s = grade(reviewCard({ interval: 10, ease: 1.40, due: T0 }), 'hard', T0);
  assert.equal(s.ease, 1.30);              // 1.40 - 0.15 = 1.25 -> floored
});

test('interval is capped at 180 days', () => {
  const s = grade(reviewCard({ interval: 150, ease: 2.5, due: T0 }), 'good', T0);
  assert.equal(s.interval, 180);           // 375 -> capped
});

test('review + again lapses to relearn: ease -0.20, lapses+1, pending = prior/2 floored at 1', () => {
  const s = grade(reviewCard({ interval: 20, ease: 2.5, lapses: 1, due: T0 }), 'again', T0);
  assert.equal(s.state, 'relearn');
  assert.equal(s.lapses, 2);
  assert.equal(Number(s.ease.toFixed(2)), 2.30);
  assert.equal(s.pending, 10);             // max(1, 20*0.5)
  assert.equal(s.due, T0 + LEARN_STEP_MS);
});

test('relearn + good returns to review at the pending interval', () => {
  const lapsed = grade(reviewCard({ interval: 20, ease: 2.5, due: T0 }), 'again', T0);
  const s = grade(lapsed, 'good', T0 + LEARN_STEP_MS);
  assert.equal(s.state, 'review');
  assert.equal(s.interval, 10);            // the pending value
  assert.equal(s.due, (T0 + LEARN_STEP_MS) + 10 * DAY_MS);
});

test('a 6th lapse auto-suspends (leech) instead of relearning', () => {
  const s = grade(reviewCard({ interval: 20, ease: 2.0, lapses: 5, due: T0 }), 'again', T0);
  assert.equal(s.lapses, 6);
  assert.equal(s.state, 'suspended');
});

test('grading a suspended card leaves it suspended (manual unsuspend is out of scope)', () => {
  const susp = { state: 'suspended', interval: 5, ease: 2, reps: 4, lapses: 6, lastGrade: 'again', pending: 3, due: T0 };
  assert.equal(grade(susp, 'good', T0).state, 'suspended');
});

test('applyFuzz leaves short intervals (< 4 days) unchanged', () => {
  assert.equal(applyFuzz(1, () => 0.5), 1);
  assert.equal(applyFuzz(3, () => 0), 3);
});

test('applyFuzz spreads a >=4-day interval within +/-25%, deterministically per rng', () => {
  assert.equal(applyFuzz(100, () => 0.0), 75);   // rng 0 -> -25%
  assert.equal(applyFuzz(100, () => 1.0), 125);  // rng 1 -> +25%
  assert.equal(applyFuzz(100, () => 0.5), 100);  // rng 0.5 -> center
});

test('grade() returns only scheduling fields (drops rev/updatedAt/deviceId/seenVersion)', () => {
  const stored = { state: 'review', interval: 10, ease: 2.5, reps: 3, lapses: 0, lastGrade: 'good', pending: 0, due: T0, rev: 7, updatedAt: 999, deviceId: 'X', seenVersion: 2 };
  const s = grade(stored, 'good', T0);
  assert.ok(!('rev' in s) && !('updatedAt' in s) && !('deviceId' in s) && !('seenVersion' in s));
  assert.equal(s.interval, 25); // scheduling math still applied (10 * 2.5)
});
