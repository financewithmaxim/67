import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createStore, ensureDevice } from '../js/store.js';

function fakeStorage(seed = {}) {
  const m = new Map(Object.entries(seed));
  return {
    getItem: k => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => m.set(k, String(v)),
    removeItem: k => m.delete(k),
    _map: m,
  };
}

test('ensureDevice creates and persists a stable deviceId + tz', () => {
  const s = fakeStorage();
  const d1 = ensureDevice(s);
  assert.ok(d1.deviceId);
  assert.ok(d1.tz);
  const d2 = ensureDevice(s); // second call reuses
  assert.equal(d2.deviceId, d1.deviceId);
});

test('ready() migrates a legacy boolean map, persists v2, and KEEPS the legacy key', async () => {
  const s = fakeStorage({ 'leitfaden_progress_v1': JSON.stringify({ m05: true, glossary: true }) });
  const store = createStore({ storage: s, now: () => 1000 });
  const snap = await store.ready();
  assert.equal(snap.schemaVersion, 2);
  assert.equal(snap.modules.m05.readiness, 'review-soon');
  assert.ok(!('glossary' in snap.modules));
  assert.ok(s.getItem('leitfaden_state_v2'), 'migrated v2 written');
  assert.ok(s.getItem('leitfaden_progress_v1'), 'legacy key preserved');
});

test('ready() on a fresh browser yields an empty v2 state', async () => {
  const store = createStore({ storage: fakeStorage(), now: () => 1 });
  const snap = await store.ready();
  assert.equal(snap.schemaVersion, 2);
  assert.deepEqual(snap.sched, {});
});

test('getState() throws before ready()', () => {
  const store = createStore({ storage: fakeStorage() });
  assert.throws(() => store.getState(), /ready/i);
});

test('ready() prefers an existing v2 state over the legacy key', async () => {
  const v2 = JSON.stringify({ schemaVersion: 2, deviceId: 'x', modules: { m01: { readiness: 'done' } }, sched: {}, reviews: [], newIntroduced: {}, tombstones: {}, settings: {} });
  const s = fakeStorage({ 'leitfaden_state_v2': v2, 'leitfaden_progress_v1': JSON.stringify({ m05: true }) });
  const store = createStore({ storage: s, now: () => 1 });
  const snap = await store.ready();
  assert.ok(snap.modules.m01);
  assert.ok(!('m05' in snap.modules), 'legacy ignored when v2 exists');
});

test('putSched stamps rev, updatedAt, deviceId and persists', async () => {
  const s = fakeStorage();
  let t = 500;
  const store = createStore({ storage: s, now: () => t });
  await store.ready();
  const a = await store.putSched('c1', { interval: 1, reps: 1 });
  assert.equal(a.rev, 1);
  assert.equal(a.updatedAt, 500);
  assert.ok(a.deviceId);
  t = 600;
  const b = await store.putSched('c1', { interval: 6, reps: 2 });
  assert.equal(b.rev, 2);
  assert.equal(b.updatedAt, 600);
  const persisted = JSON.parse(s.getItem('leitfaden_state_v2'));
  assert.equal(persisted.sched.c1.rev, 2);
});

test('appendReview stamps a unique id + ts and appends to the stream', async () => {
  const store = createStore({ storage: fakeStorage(), now: () => 700 });
  await store.ready();
  const r = await store.appendReview({ cardId: 'c1', grade: 'good', confidence: 'high' });
  assert.ok(r.id);
  assert.equal(r.ts, 700);
  assert.equal(store.getState().reviews.length, 1);
});

test('patch writes a nested path and persists', async () => {
  const s = fakeStorage();
  const store = createStore({ storage: s, now: () => 1 });
  await store.ready();
  await store.patch(['settings', 'newCardsPerDay'], 7);
  assert.equal(store.getState().settings.newCardsPerDay, 7);
  await store.patch(['modules', 'm05'], { readiness: 'review-soon' });
  assert.equal(JSON.parse(s.getItem('leitfaden_state_v2')).modules.m05.readiness, 'review-soon');
});

test('subscribe fires after a mutation and unsubscribe stops it', async () => {
  const store = createStore({ storage: fakeStorage(), now: () => 1 });
  await store.ready();
  let n = 0;
  const off = store.subscribe(() => { n++; });
  await store.putSched('c1', { reps: 1 });
  assert.equal(n, 1);
  off();
  await store.putSched('c1', { reps: 2 });
  assert.equal(n, 1);
});

test('appendReview generates a unique id even under a frozen clock', async () => {
  const store = createStore({ storage: fakeStorage(), now: () => 700 });
  await store.ready();
  const r1 = await store.appendReview({ cardId: 'c1', grade: 'good' });
  const r2 = await store.appendReview({ cardId: 'c1', grade: 'again' });
  assert.notEqual(r1.id, r2.id);
});

test("appendReview's generated id/ts win over any supplied in the entry", async () => {
  const store = createStore({ storage: fakeStorage(), now: () => 700 });
  await store.ready();
  const r = await store.appendReview({ cardId: 'c1', id: 'caller-supplied', ts: 1 });
  assert.notEqual(r.id, 'caller-supplied');
  assert.equal(r.ts, 700);
});

test('a throwing subscriber does not break the write', async () => {
  const s = fakeStorage();
  const store = createStore({ storage: s, now: () => 1 });
  await store.ready();
  store.subscribe(() => { throw new Error('boom'); });
  await store.putSched('c1', { reps: 1 });
  assert.equal(store.getState().sched.c1.reps, 1);
  assert.equal(JSON.parse(s.getItem('leitfaden_state_v2')).sched.c1.reps, 1);
});

test('exportState wraps the snapshot with metadata', async () => {
  const store = createStore({ storage: fakeStorage(), now: () => 4242 });
  await store.ready();
  await store.putSched('c1', { reps: 1 });
  const dump = store.exportState();
  assert.equal(dump.schemaVersion, 2);
  assert.equal(dump.exportedAt, 4242);
  assert.ok(dump.state.sched.c1);
});

test('importState replace overwrites and writes a backup first', async () => {
  const s = fakeStorage();
  const store = createStore({ storage: s, now: () => 1 });
  await store.ready();
  await store.putSched('local', { reps: 1 });
  const incoming = { schemaVersion: 2, deviceId: 'other', modules: {}, sched: { remote: { reps: 5, rev: 1, updatedAt: 1 } }, reviews: [], newIntroduced: {}, tombstones: {}, settings: {} };
  await store.importState({ state: incoming }, 'replace');
  assert.ok(store.getState().sched.remote);
  assert.ok(!('local' in store.getState().sched));
  assert.ok(s.getItem('leitfaden_state_v2.bak'), 'backup written before replace');
});

test('importState merge keeps local and adds remote (record-level)', async () => {
  const store = createStore({ storage: fakeStorage(), now: () => 1 });
  await store.ready();
  await store.putSched('local', { reps: 1 });
  const incoming = { schemaVersion: 2, deviceId: 'other', modules: {}, sched: { remote: { reps: 5, rev: 1, updatedAt: 1 } }, reviews: [], newIntroduced: {}, tombstones: {}, settings: {} };
  await store.importState({ state: incoming }, 'merge');
  assert.ok(store.getState().sched.local);
  assert.ok(store.getState().sched.remote);
});
