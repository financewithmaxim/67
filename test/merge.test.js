import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mergeStates } from '../js/merge.js';
import { emptyState } from '../js/state.js';

function withSched(dev, id, sched) { const s = emptyState(dev); s.sched[id] = sched; return s; }

test('higher rev wins even when it lowers reps (lapse reset must not be masked)', () => {
  const local  = withSched('A', 'c1', { reps: 9, interval: 40, rev: 3, updatedAt: 100, deviceId: 'A' });
  const remote = withSched('B', 'c1', { reps: 0, interval: 1,  rev: 4, updatedAt: 90,  deviceId: 'B' });
  const m = mergeStates(local, remote);
  assert.equal(m.sched.c1.reps, 0);     // rev 4 wins despite lower reps and older updatedAt
  assert.equal(m.sched.c1.interval, 1);
});

test('updatedAt breaks a rev tie', () => {
  const local  = withSched('A', 'c1', { rev: 2, updatedAt: 200, deviceId: 'A' });
  const remote = withSched('B', 'c1', { rev: 2, updatedAt: 300, deviceId: 'B' });
  assert.equal(mergeStates(local, remote).sched.c1.updatedAt, 300);
});

test('reviews are dedup-unioned by id', () => {
  const local = emptyState('A');  local.reviews  = [{ id: 'r1', cardId: 'c1' }];
  const remote = emptyState('B'); remote.reviews = [{ id: 'r1', cardId: 'c1' }, { id: 'r2', cardId: 'c1' }];
  assert.equal(mergeStates(local, remote).reviews.length, 2);
});

test('a tombstone removes a resurrected sched entry', () => {
  const local  = withSched('A', 'c1', { rev: 1, updatedAt: 100, deviceId: 'A' });
  const remote = emptyState('B'); remote.tombstones = { c1: 200 };
  assert.ok(!('c1' in mergeStates(local, remote).sched));
});

test('newIntroduced takes the per-date max', () => {
  const local = emptyState('A');  local.newIntroduced  = { '2026-06-30': 5 };
  const remote = emptyState('B'); remote.newIntroduced = { '2026-06-30': 8, '2026-07-01': 2 };
  const m = mergeStates(local, remote);
  assert.equal(m.newIntroduced['2026-06-30'], 8);
  assert.equal(m.newIntroduced['2026-07-01'], 2);
});

test('does not mutate its inputs', () => {
  const local  = withSched('A', 'c1', { rev: 1, updatedAt: 1, deviceId: 'A' });
  const remote = withSched('B', 'c1', { rev: 2, updatedAt: 2, deviceId: 'B' });
  mergeStates(local, remote);
  assert.equal(local.sched.c1.rev, 1);
});
