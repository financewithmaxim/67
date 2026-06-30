import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildQueue, countDue } from '../js/queue.js';
import { emptyState } from '../js/state.js';

const DAY = 86_400_000;
const NOW = 1_700_000_000_000;
function card(id, type = 'numeric', extra = {}) { return { id, module: 'm05', type, front: 'x', tags: { spine: 'reg' }, version: 'v', sourceRef: { module: 'm05', anchor: 'a' }, ...extra }; }
function withSched(state, sched) { const s = emptyState('A'); s.sched = sched; return s; }

test('countDue counts due, non-suspended cards only', () => {
  const s = withSched('A', {
    a: { state: 'review', due: NOW - DAY, interval: 5 },
    b: { state: 'review', due: NOW + DAY, interval: 5 },     // not yet due
    c: { state: 'suspended', due: NOW - DAY, interval: 5 },  // leech excluded
  });
  assert.equal(countDue(s, NOW), 1);
});

test('due cards order by overdue ratio, capped at maxReviewsPerSession', () => {
  const s = withSched('A', {
    a: { state: 'review', due: NOW - 1 * DAY, interval: 10 }, // ratio 0.1
    b: { state: 'review', due: NOW - 8 * DAY, interval: 10 }, // ratio 0.8 (most overdue)
  });
  const cards = [card('a'), card('b')];
  const q = buildQueue({ snapshot: s, cards, now: NOW, settings: { maxReviewsPerSession: 1, newCardsPerDay: 0 } });
  assert.deepEqual(q.due, ['b']);    // most overdue first, capped to 1
});

test('new cards are introduced up to the daily budget when the backlog is small', () => {
  const s = emptyState('A');
  const cards = [card('n1'), card('n2'), card('n3')];
  const q = buildQueue({ snapshot: s, cards, now: NOW, settings: { newCardsPerDay: 2 } });
  assert.equal(q.new.length, 2);
});

test('new-card introduction is throttled to 0 when the due backlog is large', () => {
  const sched = {};
  for (let i = 0; i < 31; i++) sched['d' + i] = { state: 'review', due: NOW - DAY, interval: 5 };
  const s = withSched('A', sched);
  const cards = Object.keys(sched).map(id => card(id)).concat([card('new1')]);
  const q = buildQueue({ snapshot: s, cards, now: NOW, settings: { newCardsPerDay: 5, newThrottleAt: 30 } });
  assert.equal(q.new.length, 0);
});

test('a new card is gated until its prereqs are introduced', () => {
  const s = emptyState('A'); s.sched = {};
  const cards = [card('child', 'numeric', { prereq: ['parent'] }), card('parent')];
  let q = buildQueue({ snapshot: s, cards, now: NOW, settings: { newCardsPerDay: 1 } });
  assert.ok(!q.new.includes('child'));               // parent not yet introduced
  s.sched = { parent: { state: 'review', due: NOW + DAY, interval: 1 } };
  q = buildQueue({ snapshot: s, cards, now: NOW, settings: { newCardsPerDay: 5 } });
  assert.ok(q.new.includes('child'));                // now eligible
});

test('the daily newIntroduced ledger reduces the remaining new budget', () => {
  const s = emptyState('A');
  const today = new Date(NOW).toISOString().slice(0, 10);
  s.newIntroduced = { [today]: 2 };
  const cards = [card('n1'), card('n2')];
  const q = buildQueue({ snapshot: s, cards, now: NOW, settings: { newCardsPerDay: 2 } });
  assert.equal(q.new.length, 0);                     // budget already spent today
});
