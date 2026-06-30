import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGistSync } from '../js/gistsync.js';
import { emptyState } from '../js/state.js';

function fakeStore(state) {
  let s = state;
  return { getState: () => s, saveState: async (n) => { s = n; }, _peek: () => s };
}
function fakeConfig(init = {}) { const m = { ...init }; return { get: k => m[k], set: (k, v) => { m[k] = v; }, _m: m }; }

test('sync merges remote into local, adopts locally, pushes, records cursor', async () => {
  const local = emptyState('A'); local.sched = { a: { rev: 1, updatedAt: 1, deviceId: 'A' } };
  const remote = emptyState('B'); remote.sched = { b: { rev: 1, updatedAt: 1, deviceId: 'B' } };
  const store = fakeStore(local);
  const pushed = [];
  const client = { pull: async () => ({ state: remote, rev: 'r1' }), push: async (st) => { pushed.push(st); return { rev: 'r2' }; } };
  const cfg = fakeConfig();
  const gs = createGistSync({ store, client, config: cfg, now: () => 999 });
  const res = await gs.sync();
  assert.equal(res.status, 'ok');
  assert.ok(store._peek().sched.a && store._peek().sched.b, 'local now has both cards');
  assert.ok(pushed[0].sched.a && pushed[0].sched.b, 'pushed the merged state');
  assert.equal(gs.status().cursor, 'r2');
  assert.equal(gs.status().lastSyncedAt, 999);
});

test('empty remote → pushes local unchanged', async () => {
  const local = emptyState('A'); local.sched = { a: { rev: 1, updatedAt: 1, deviceId: 'A' } };
  const store = fakeStore(local);
  let pushedState = null;
  const client = { pull: async () => ({ state: null, rev: null }), push: async (st) => { pushedState = st; return { rev: 'r1' }; } };
  const gs = createGistSync({ store, client, config: fakeConfig(), now: () => 1 });
  assert.equal((await gs.sync()).status, 'ok');
  assert.ok(pushedState.sched.a);
});

test('pull failure surfaces error kind and keeps dirty', async () => {
  const store = fakeStore(emptyState('A'));
  const client = { pull: async () => { throw new Error('401'); }, push: async () => ({ rev: 'x' }) };
  const gs = createGistSync({ store, client, config: fakeConfig(), now: () => 1 });
  const res = await gs.sync();
  assert.equal(res.status, 'error');
  assert.equal(res.kind, 'pull');
  assert.equal(gs.status().dirty, true);
});

test('push failure surfaces error kind (local already holds the merge)', async () => {
  const store = fakeStore(emptyState('A'));
  const remote = emptyState('B'); remote.sched = { b: { rev: 1, updatedAt: 1, deviceId: 'B' } };
  const client = { pull: async () => ({ state: remote, rev: 'r1' }), push: async () => { throw new Error('500'); } };
  const gs = createGistSync({ store, client, config: fakeConfig(), now: () => 1 });
  const res = await gs.sync();
  assert.equal(res.status, 'error');
  assert.equal(res.kind, 'push');
  assert.ok(store._peek().sched.b, 'merge was adopted locally even though push failed');
});

test('unconfigured client returns {status:"unconfigured"} without throwing', async () => {
  const gs = createGistSync({ store: fakeStore(emptyState('A')), client: null, config: fakeConfig(), now: () => 1 });
  const res = await gs.sync();
  assert.equal(res.status, 'unconfigured');
});
