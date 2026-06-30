import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeCalibration } from '../js/calibration.js';
import { emptyState } from '../js/state.js';

const NOW = 1_700_000_000_000;
const DAY = 86_400_000;

test('empty state yields zeros and null accuracy', () => {
  const c = computeCalibration(emptyState('A'), NOW);
  assert.equal(c.reviewed, 0);
  assert.equal(c.machineGraded, 0);
  assert.equal(c.accuracy, null);
  assert.deepEqual(c.confidentlyWrong, []);
  assert.deepEqual(c.vivaSelfReported, []);
  assert.equal(c.dueNow, 0);
  assert.equal(c.suspended, 0);
});

test('accuracy counts only machine-graded reviews (objective true/false), not viva (null)', () => {
  const s = emptyState('A');
  s.reviews = [
    { id: 'r1', cardId: 'm05.num.a', ts: NOW, grade: 'good', confidence: 'high', objective: true },
    { id: 'r2', cardId: 'm05.num.b', ts: NOW, grade: 'again', confidence: 'high', objective: false },
    { id: 'r3', cardId: 'm05.viva.x', ts: NOW, grade: 'good', confidence: 'low', objective: null },
  ];
  const c = computeCalibration(s, NOW);
  assert.equal(c.reviewed, 3);
  assert.equal(c.machineGraded, 2);
  assert.equal(c.accuracy, 0.5);              // 1 of 2 machine-graded correct
});

test('confidently-wrong = high confidence AND machine miss', () => {
  const s = emptyState('A');
  s.reviews = [
    { id: 'r1', cardId: 'm05.num.a', ts: NOW, grade: 'again', confidence: 'high', objective: false }, // counts
    { id: 'r2', cardId: 'm05.num.b', ts: NOW, grade: 'again', confidence: 'low', objective: false },  // not high conf
    { id: 'r3', cardId: 'm05.num.c', ts: NOW, grade: 'good', confidence: 'high', objective: true },   // not a miss
  ];
  const c = computeCalibration(s, NOW);
  assert.deepEqual(c.confidentlyWrong.map(x => x.cardId), ['m05.num.a']);
});

test('viva reviews are self-reported separately, never in the headline', () => {
  const s = emptyState('A');
  s.reviews = [{ id: 'r1', cardId: 'm05.viva.x', ts: NOW, grade: 'hard', confidence: 'high', objective: null }];
  const c = computeCalibration(s, NOW);
  assert.equal(c.machineGraded, 0);
  assert.equal(c.accuracy, null);
  assert.deepEqual(c.vivaSelfReported.map(x => x.cardId), ['m05.viva.x']);
  assert.equal(c.vivaSelfReported[0].grade, 'hard');
});

test('dueNow and suspended come from sched state', () => {
  const s = emptyState('A');
  s.sched = {
    a: { state: 'review', due: NOW - DAY, interval: 5 },   // due
    b: { state: 'review', due: NOW + DAY, interval: 5 },   // not due
    c: { state: 'suspended', due: NOW - DAY, interval: 5 },// leech, not counted as due
  };
  const c = computeCalibration(s, NOW);
  assert.equal(c.dueNow, 1);
  assert.equal(c.suspended, 1);
});

test('computeCalibration tolerates a null sched entry without throwing', () => {
  const s = emptyState('A');
  s.sched = { a: null, b: { state: 'review', due: NOW - DAY, interval: 5 } };
  assert.doesNotThrow(() => computeCalibration(s, NOW));
  assert.equal(computeCalibration(s, NOW).dueNow, 1);
});
