import { test } from 'node:test';
import assert from 'node:assert/strict';
import { emptyState, defaultSettings, STATE_SCHEMA_VERSION } from '../js/state.js';

test('emptyState has the v2 shape', () => {
  const s = emptyState('dev1');
  assert.equal(s.schemaVersion, STATE_SCHEMA_VERSION);
  assert.equal(s.schemaVersion, 2);
  assert.equal(s.deviceId, 'dev1');
  assert.deepEqual(s.modules, {});
  assert.deepEqual(s.sched, {});
  assert.deepEqual(s.reviews, []);
  assert.deepEqual(s.newIntroduced, {});
  assert.deepEqual(s.tombstones, {});
  assert.equal(typeof s.settings.maxReviewsPerSession, 'number');
});

test('emptyState returns independent objects (no shared refs)', () => {
  const a = emptyState();
  const b = emptyState();
  a.sched.x = 1;
  a.reviews.push('z');
  assert.deepEqual(b.sched, {});
  assert.deepEqual(b.reviews, []);
});

test('defaultSettings has sane defaults', () => {
  const d = defaultSettings();
  assert.ok(d.maxReviewsPerSession > 0);
  assert.ok(d.newCardsPerDay > 0);
  assert.ok(d.targetRetention > 0 && d.targetRetention < 1);
});
