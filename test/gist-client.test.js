import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGistClient } from '../js/gist-client.js';

function fakeConfig(init = {}) { const m = { ...init }; return { get: k => m[k], set: (k, v) => { m[k] = v; }, _m: m }; }
function jsonResponse(body, ok = true, status = 200) { return { ok, status, json: async () => body }; }

test('ensureGist creates a secret gist and stores the id when none exists', async () => {
  const calls = [];
  const fetchImpl = async (url, opts) => { calls.push({ url, opts }); return jsonResponse({ id: 'GID', history: [{ version: 'v1' }] }, true, 201); };
  const cfg = fakeConfig();
  const c = createGistClient({ token: 'T', config: cfg, fetchImpl });
  await c.ensureGist();
  assert.equal(cfg.get('gistId'), 'GID');
  assert.equal(calls[0].url, 'https://api.github.com/gists');
  assert.equal(calls[0].opts.method, 'POST');
  assert.match(calls[0].opts.headers.Authorization, /T/);
  assert.equal(JSON.parse(calls[0].opts.body).public, false);   // secret
});

test('pull returns parsed state + rev from the gist file', async () => {
  const state = { schemaVersion: 2, sched: { a: { rev: 1 } } };
  const fetchImpl = async () => jsonResponse({ id: 'GID', history: [{ version: 'vX' }], files: { 'leitfaden-state.json': { content: JSON.stringify(state) } } });
  const c = createGistClient({ token: 'T', config: fakeConfig({ gistId: 'GID' }), fetchImpl });
  const r = await c.pull();
  assert.deepEqual(r.state.sched.a.rev, 1);
  assert.equal(r.rev, 'vX');
});

test('pull returns null state when the file is absent', async () => {
  const fetchImpl = async () => jsonResponse({ id: 'GID', history: [{ version: 'v0' }], files: {} });
  const c = createGistClient({ token: 'T', config: fakeConfig({ gistId: 'GID' }), fetchImpl });
  assert.equal((await c.pull()).state, null);
});

test('push PATCHes the gist file with the state and returns the new rev', async () => {
  const calls = [];
  const fetchImpl = async (url, opts) => { calls.push({ url, opts }); return jsonResponse({ id: 'GID', history: [{ version: 'vNEW' }] }); };
  const c = createGistClient({ token: 'T', config: fakeConfig({ gistId: 'GID' }), fetchImpl });
  const r = await c.push({ schemaVersion: 2, sched: {} });
  assert.equal(calls[0].url, 'https://api.github.com/gists/GID');
  assert.equal(calls[0].opts.method, 'PATCH');
  const body = JSON.parse(calls[0].opts.body);
  assert.ok(body.files['leitfaden-state.json'].content.includes('schemaVersion'));
  assert.equal(r.rev, 'vNEW');
});

test('a non-ok response throws (so the orchestrator surfaces the error)', async () => {
  const fetchImpl = async () => jsonResponse({ message: 'Bad credentials' }, false, 401);
  const c = createGistClient({ token: 'BAD', config: fakeConfig({ gistId: 'GID' }), fetchImpl });
  await assert.rejects(() => c.pull(), /401|Bad credentials/);
});
