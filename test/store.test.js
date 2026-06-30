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
