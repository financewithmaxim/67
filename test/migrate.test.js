import { test } from 'node:test';
import assert from 'node:assert/strict';
import { migrate } from '../js/migrate.js';
import { STATE_SCHEMA_VERSION } from '../js/state.js';

test('null/undefined → empty v2', () => {
  assert.equal(migrate(null, 'd').schemaVersion, STATE_SCHEMA_VERSION);
  assert.equal(migrate(undefined, 'd').schemaVersion, STATE_SCHEMA_VERSION);
});

test('legacy boolean map → modules; skips glossary; ignores false; no sched', () => {
  const s = migrate({ m05: true, capstone: true, glossary: true, m01: false }, 'd');
  assert.deepEqual(s.modules.m05, { readiness: 'review-soon', completedAt: null });
  assert.deepEqual(s.modules.capstone, { readiness: 'review-soon', completedAt: null });
  assert.ok(!('glossary' in s.modules));
  assert.ok(!('m01' in s.modules));
  assert.deepEqual(s.sched, {});
  assert.equal(s.deviceId, 'd');
});

test('idempotent: migrating a v2 state returns it unchanged', () => {
  const once = migrate({ m05: true }, 'd');
  const twice = migrate(once, 'd');
  assert.deepEqual(twice, once);
});

test('rejects a downgrade from a higher schemaVersion', () => {
  assert.throws(() => migrate({ schemaVersion: 99 }, 'd'), /downgrade/i);
});
