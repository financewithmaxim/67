# Leitfaden Trainer — P0: Foundation & Safety Seam — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the local-first, backend-ready persistence seam (store + state model + migration + record-level merge + export/import) and neutralise the misleading MCQ-as-completion-gate site-wide, so later phases can add the study loop to m05 without regressing the other 26 pages or risking data loss.

**Architecture:** New engine logic lives in small, **pure, synchronous ES modules** (`state`, `migrate`, `merge`) plus one thin async `store` wrapper, all unit-tested in Node with `node --test` (zero npm dependencies) by injecting a fake storage backend and a fake clock. The legacy `js/app.js` keeps its external behavior frozen; the only site-wide change is removing `markComplete` from quiz grading and adding a "warm-up only" banner. New per-user state lives under a **new** localStorage key (`leitfaden_state_v2`); the legacy key is migrated but never deleted in this phase.

**Tech Stack:** Vanilla JS (ES modules for new code; the site still has no build step). Node ≥ 20 for the built-in test runner (dev-only; not a site dependency). Browser APIs: `localStorage`, `crypto.randomUUID`, `Intl.DateTimeFormat`, `structuredClone`.

## Global Constraints

- **No build step for the site.** New engine files are plain ES modules loaded via `<script type="module">`; existing classic scripts (`js/app.js`) stay classic. Browsers ignore `package.json`.
- **Engine modules are pure and synchronous** — `state.js`, `migrate.js`, `merge.js` perform **zero** I/O (no `localStorage`, no `fetch`). Only `store.js` touches storage, and it is **async-from-day-one**: `await store.ready()` hydrates once; `getState()` then returns the in-memory snapshot synchronously; all mutations return Promises.
- **State key is new:** per-user state → `leitfaden_state_v2`. **Never delete** the legacy `leitfaden_progress_v1` in this phase (non-destructive copy).
- **Device-config is a third namespace** (`leitfaden_device_v1`: `deviceId`, `tz`) that the sync layer must never read or push.
- **All timestamps are UTC epoch ms.** Schedule records carry `updatedAt` + monotonic `rev` + `deviceId`. Merge is **record-level** (higher `rev`; tie-break `updatedAt` then `deviceId`) — **never field-wise `max()`**.
- **`schemaVersion` = 2.** Migration is idempotent and **rejects downgrades**.
- **`js/app.js` external behavior is frozen** through P0–P3 except: (a) `gradeQuiz` must never call `markComplete`, (b) a persistent "warm-up only" banner renders on every quiz, (c) the stale static "0 / 18" denominator on `index.html` is corrected. `window.COURSE`, `renderIndexProgress`, `buildSidebar`, and the global-`QUIZ` render path must keep working.
- **Skip gamification** (streaks/XP/lives/leagues/etc.) — not introduced in any phase.
- Reuse existing `css/style.css` tokens/classes; do not add new CSS in this phase (reuse `.disclaimer` for the banner).

## File Structure

- `package.json` — **create**. Minimal, dev-only: `{"type":"module","scripts":{"test":"node --test"}}`. No dependencies.
- `js/state.js` — **create**. Pure. Constants (keys, schema version) + `emptyState()` + `defaultSettings()`.
- `js/migrate.js` — **create**. Pure. `migrate(raw, deviceId)` — legacy boolean map → v2; idempotent; rejects downgrade.
- `js/merge.js` — **create**. Pure. `mergeStates(local, remote)` — record-level sched merge, reviews dedup-union, tombstones, newIntroduced per-date max, modules union.
- `js/store.js` — **create**. The only stateful module. `createStore({storage, now})` + `ensureDevice(storage)`. Async `ready`/`putSched`/`appendReview`/`patch`/`saveState`/`importState`; sync `getState`/`subscribe`/`exportState`; `sync()` is a P0 no-op.
- `js/course.js` — **create**. ES module exporting `COURSE` (a copy of the table-of-contents from `app.js`) so the future `study.html` can reuse it without loading legacy boot code. (TOC duplication with `app.js` is accepted until P5 consolidation.)
- `test/state.test.js`, `test/migrate.test.js`, `test/merge.test.js`, `test/store.test.js`, `test/course.test.js` — **create**. Node test files.
- `js/app.js` — **modify**. Remove `markComplete` call from `gradeQuiz`; add warm-up banner in `renderQuiz`; nothing else.
- `index.html` — **modify**. Fix static "0 / 18 modules complete" → "0 / 25 modules complete".

> Note on the test runner: Node ≥ 20 auto-discovers `test/**/*.test.js`. `package.json` has `"type":"module"`, so both `js/*.js` and the test files are ES modules and `import` works in Node and in the browser alike.

---

### Task 1: Project test harness + state model (`js/state.js`)

**Files:**
- Create: `package.json`, `js/state.js`, `test/state.test.js`

**Interfaces:**
- Produces: `STATE_SCHEMA_VERSION: number` (=2); `STATE_KEY: "leitfaden_state_v2"`; `LEGACY_KEY: "leitfaden_progress_v1"`; `DEVICE_KEY: "leitfaden_device_v1"`; `defaultSettings(): {tz,maxReviewsPerSession,newCardsPerDay,targetRetention}`; `emptyState(deviceId="unknown"): StateV2`. `StateV2 = {schemaVersion, deviceId, modules:{}, sched:{}, reviews:[], newIntroduced:{}, tombstones:{}, settings}`.

- [ ] **Step 1: Create `package.json`**

```json
{
  "name": "leitfaden-trainer",
  "private": true,
  "type": "module",
  "scripts": {
    "test": "node --test"
  }
}
```

- [ ] **Step 2: Write the failing test** — `test/state.test.js`

```js
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
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `node --test test/state.test.js`
Expected: FAIL — `Cannot find module '../js/state.js'`.

- [ ] **Step 4: Implement `js/state.js`**

```js
// Pure state model — no I/O. Shared by migrate.js, merge.js, store.js, and the browser.
export const STATE_SCHEMA_VERSION = 2;
export const STATE_KEY = 'leitfaden_state_v2';
export const LEGACY_KEY = 'leitfaden_progress_v1';
export const DEVICE_KEY = 'leitfaden_device_v1';

export function defaultSettings() {
  return { tz: 'UTC', maxReviewsPerSession: 40, newCardsPerDay: 12, targetRetention: 0.9 };
}

export function emptyState(deviceId = 'unknown') {
  return {
    schemaVersion: STATE_SCHEMA_VERSION,
    deviceId,
    modules: {},        // { [moduleId]: { readiness, completedAt } } — migration target / deck-less fallback
    sched: {},          // { [cardId]: { state, due, interval, ease, reps, lapses, lastGrade, seenVersion, updatedAt, rev, deviceId } }
    reviews: [],        // append-only: { id, cardId, ts, grade, confidence, pointsHit, pointsMissed }
    newIntroduced: {},  // { [utcDate]: count }
    tombstones: {},     // { [cardId]: deletedAt }
    settings: defaultSettings(),
  };
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `node --test test/state.test.js`
Expected: PASS (3 tests).

- [ ] **Step 6: Commit**

```bash
git add package.json js/state.js test/state.test.js
git commit -m "feat(trainer): add v2 state model + node test harness"
```

---

### Task 2: Migration v1 → v2 (`js/migrate.js`)

**Files:**
- Create: `js/migrate.js`, `test/migrate.test.js`

**Interfaces:**
- Consumes: `emptyState`, `STATE_SCHEMA_VERSION` from `js/state.js`.
- Produces: `migrate(raw, deviceId="unknown"): StateV2`. Maps a legacy boolean `{moduleId:true}` map → `modules[id]={readiness:'review-soon',completedAt:null}` (skips `glossary`, ignores `false`, fabricates no `sched`); returns a v2 object unchanged (idempotent); throws on a higher `schemaVersion` (downgrade).

- [ ] **Step 1: Write the failing test** — `test/migrate.test.js`

```js
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
  assert.ok(s.modules.capstone);
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
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test test/migrate.test.js`
Expected: FAIL — `Cannot find module '../js/migrate.js'`.

- [ ] **Step 3: Implement `js/migrate.js`**

```js
import { emptyState, STATE_SCHEMA_VERSION } from './state.js';

function isLegacyBooleanMap(raw) {
  if (!raw || typeof raw !== 'object') return false;
  if ('schemaVersion' in raw) return false;
  const vals = Object.values(raw);
  return vals.length === 0 || vals.every(v => typeof v === 'boolean');
}

// Pure. Accepts: null, a legacy boolean {moduleId:true} map, or a v2 state object.
export function migrate(raw, deviceId = 'unknown') {
  if (raw == null) return emptyState(deviceId);

  if (typeof raw === 'object' && raw.schemaVersion === STATE_SCHEMA_VERSION) {
    return raw; // already current — idempotent
  }
  if (typeof raw === 'object' && typeof raw.schemaVersion === 'number' && raw.schemaVersion > STATE_SCHEMA_VERSION) {
    throw new Error(`Refusing to downgrade state from v${raw.schemaVersion} to v${STATE_SCHEMA_VERSION}`);
  }

  if (isLegacyBooleanMap(raw)) {
    const next = emptyState(deviceId);
    for (const [id, done] of Object.entries(raw)) {
      if (!done || id === 'glossary') continue;       // glossary is reference, never graded
      next.modules[id] = { readiness: 'review-soon', completedAt: null };
    }
    return next; // deliberately no sched entries — no phantom day-one due cards
  }

  // Any other structured shape (e.g. a future intermediate version with no upgrader yet):
  // start fresh rather than corrupt. Non-destructive: the caller keeps the legacy key.
  return emptyState(deviceId);
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `node --test test/migrate.test.js`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add js/migrate.js test/migrate.test.js
git commit -m "feat(trainer): add idempotent v1->v2 migration"
```

---

### Task 3: Record-level merge (`js/merge.js`)

**Files:**
- Create: `js/merge.js`, `test/merge.test.js`

**Interfaces:**
- Consumes: `emptyState` from `js/state.js` (tests only).
- Produces: `mergeStates(local, remote): StateV2` — pure, non-mutating. `sched` merged per-record by `rev` (tie-break `updatedAt`, then `deviceId`); `reviews` dedup-unioned by `id`; `tombstones` unioned by latest `deletedAt` and applied to drop resurrected `sched`; `newIntroduced` per-date `max`; `modules` unioned preferring later `completedAt`.

- [ ] **Step 1: Write the failing test** — `test/merge.test.js`

```js
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
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test test/merge.test.js`
Expected: FAIL — `Cannot find module '../js/merge.js'`.

- [ ] **Step 3: Implement `js/merge.js`**

```js
// Pure record-level merge for cross-device sync. NEVER field-wise max() — that would mask
// a legitimate lapse-reset (reps -> 0). Ordering is by rev, then updatedAt, then deviceId.
function newerSched(a, b) {
  if (!a) return b;
  if (!b) return a;
  if ((a.rev || 0) !== (b.rev || 0)) return (a.rev || 0) > (b.rev || 0) ? a : b;
  if ((a.updatedAt || 0) !== (b.updatedAt || 0)) return (a.updatedAt || 0) > (b.updatedAt || 0) ? a : b;
  return (a.deviceId || '') >= (b.deviceId || '') ? a : b;
}

export function mergeStates(local, remote) {
  const out = structuredClone(local);

  // sched: union of ids, newer record wins
  for (const [id, r] of Object.entries(remote.sched || {})) {
    out.sched[id] = newerSched(out.sched[id], r);
  }

  // tombstones: union by latest deletedAt
  out.tombstones = { ...(out.tombstones || {}) };
  for (const [id, ts] of Object.entries(remote.tombstones || {})) {
    if (!out.tombstones[id] || ts > out.tombstones[id]) out.tombstones[id] = ts;
  }
  // apply tombstones: drop any sched whose last update predates its deletion
  for (const [id, delTs] of Object.entries(out.tombstones)) {
    const s = out.sched[id];
    if (s && (s.updatedAt || 0) <= delTs) delete out.sched[id];
  }

  // reviews: dedup-union by stable id
  const seen = new Set((out.reviews || []).map(r => r.id));
  for (const rev of remote.reviews || []) {
    if (!seen.has(rev.id)) { out.reviews.push(rev); seen.add(rev.id); }
  }

  // newIntroduced: per-date max
  for (const [d, n] of Object.entries(remote.newIntroduced || {})) {
    out.newIntroduced[d] = Math.max(out.newIntroduced[d] || 0, n);
  }

  // modules: union, prefer the later completedAt (else keep local)
  for (const [id, m] of Object.entries(remote.modules || {})) {
    const cur = out.modules[id];
    if (!cur || (m.completedAt || 0) > (cur.completedAt || 0)) out.modules[id] = m;
  }

  return out;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `node --test test/merge.test.js`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add js/merge.js test/merge.test.js
git commit -m "feat(trainer): add record-level state merge for sync"
```

---

### Task 4: Store hydration + device config (`js/store.js`)

**Files:**
- Create: `js/store.js`, `test/store.test.js`

**Interfaces:**
- Consumes: `emptyState`, `STATE_KEY`, `LEGACY_KEY`, `DEVICE_KEY` (state.js); `migrate` (migrate.js); `mergeStates` (merge.js).
- Produces: `ensureDevice(storage): {deviceId, tz}`; `createStore({storage, now}): Store`. This task implements `Store.ready(): Promise<StateV2>`, `Store.getState(): StateV2` (throws before `ready`), `Store.getDevice()`. Later tasks add `putSched`, `appendReview`, `patch`, `saveState`, `subscribe`, `sync`, `exportState`, `importState`.

- [ ] **Step 1: Write the failing test** — `test/store.test.js`

```js
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
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test test/store.test.js`
Expected: FAIL — `Cannot find module '../js/store.js'`.

- [ ] **Step 3: Implement `js/store.js` (hydration + device only)**

```js
import { STATE_KEY, LEGACY_KEY, DEVICE_KEY } from './state.js';
import { migrate } from './migrate.js';

function genId() {
  if (globalThis.crypto && typeof globalThis.crypto.randomUUID === 'function') {
    return globalThis.crypto.randomUUID();
  }
  return 'dev-' + Math.random().toString(36).slice(2) + Date.now().toString(36);
}

function detectTz() {
  try { return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'; }
  catch { return 'UTC'; }
}

// device-config namespace: NEVER synced. Holds deviceId + tz (and, in P4, the gist token + cursor).
export function ensureDevice(storage) {
  let cfg = null;
  const raw = storage.getItem(DEVICE_KEY);
  if (raw) { try { cfg = JSON.parse(raw); } catch { cfg = null; } }
  if (!cfg || !cfg.deviceId) {
    cfg = { deviceId: genId(), tz: detectTz() };
    storage.setItem(DEVICE_KEY, JSON.stringify(cfg));
  }
  return cfg;
}

export function createStore({ storage, now = () => Date.now() } = {}) {
  if (!storage) throw new Error('createStore requires a storage backend');
  let snapshot = null;
  let device = null;
  let readyPromise = null;

  function persist() { storage.setItem(STATE_KEY, JSON.stringify(snapshot)); }

  async function ready() {
    if (readyPromise) return readyPromise;
    readyPromise = (async () => {
      device = ensureDevice(storage);
      const v2raw = storage.getItem(STATE_KEY);
      if (v2raw) {
        snapshot = migrate(JSON.parse(v2raw), device.deviceId);
      } else {
        const legacy = storage.getItem(LEGACY_KEY);
        snapshot = migrate(legacy ? JSON.parse(legacy) : null, device.deviceId);
        persist(); // write migrated v2; the legacy key is intentionally left untouched
      }
      if (!snapshot.settings) snapshot.settings = {};
      if (!snapshot.settings.tz || snapshot.settings.tz === 'UTC') snapshot.settings.tz = device.tz;
      return snapshot;
    })();
    return readyPromise;
  }

  function getState() {
    if (!snapshot) throw new Error('call await store.ready() before getState()');
    return snapshot;
  }

  return { ready, getState, getDevice: () => device };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `node --test test/store.test.js`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add js/store.js test/store.test.js
git commit -m "feat(trainer): store hydration + device-config namespace"
```

---

### Task 5: Store mutations — `putSched`, `appendReview`, `patch`, `subscribe`

**Files:**
- Modify: `js/store.js`
- Modify: `test/store.test.js` (append tests)

**Interfaces:**
- Produces (added to `Store`): `putSched(cardId, partial): Promise<sched>` — stamps `deviceId`, `updatedAt=now()`, `rev=prev.rev+1`; `appendReview(entry): Promise<review>` — stamps `id` + `ts=now()`; `patch(path:string[], value): Promise<void>` — writes a nested path (for `settings`/`modules`/`newIntroduced`); `saveState(next): Promise<void>` (migration/import only); `subscribe(fn): () => void` — fires after every local mutation; `sync(): Promise<void>` — P0 no-op.

- [ ] **Step 1: Write the failing tests — append to `test/store.test.js`**

```js
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
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test test/store.test.js`
Expected: FAIL — `store.putSched is not a function`.

- [ ] **Step 3: Extend `js/store.js`**

Add a subscriber set and `notify()` near the top of `createStore` (after `persist`):

```js
  const subs = new Set();
  function notify() { for (const fn of subs) { try { fn(snapshot); } catch { /* a subscriber must not break a write */ } } }
```

Add these methods inside `createStore` (before the `return`):

```js
  async function putSched(cardId, partial) {
    const prev = snapshot.sched[cardId] || { rev: 0 };
    snapshot.sched[cardId] = {
      ...prev, ...partial,
      deviceId: device.deviceId,
      updatedAt: now(),
      rev: (prev.rev || 0) + 1,
    };
    persist(); notify();
    return snapshot.sched[cardId];
  }

  async function appendReview(entry) {
    const rec = { id: genId(), ts: now(), ...entry };
    snapshot.reviews.push(rec);
    persist(); notify();
    return rec;
  }

  async function patch(path, value) {
    let obj = snapshot;
    for (let i = 0; i < path.length - 1; i++) {
      const k = path[i];
      if (obj[k] == null || typeof obj[k] !== 'object') obj[k] = {};
      obj = obj[k];
    }
    obj[path[path.length - 1]] = value;
    persist(); notify();
  }

  async function saveState(next) { snapshot = next; persist(); notify(); }
  function subscribe(fn) { subs.add(fn); return () => subs.delete(fn); }
  async function sync() { /* no-op in P0; GistSyncStore overrides in P4 */ }
```

Update the `return` to expose them:

```js
  return { ready, getState, getDevice: () => device, putSched, appendReview, patch, saveState, subscribe, sync };
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --test test/store.test.js`
Expected: PASS (9 tests total).

- [ ] **Step 5: Commit**

```bash
git add js/store.js test/store.test.js
git commit -m "feat(trainer): store mutations (putSched/appendReview/patch/subscribe)"
```

---

### Task 6: Export / import with backup + merge (`js/store.js`)

**Files:**
- Modify: `js/store.js`
- Modify: `test/store.test.js` (append tests)

**Interfaces:**
- Consumes: `mergeStates` (merge.js), `migrate` (migrate.js).
- Produces (added to `Store`): `exportState(): {schemaVersion, exportedAt, deviceId, state}`; `importState(payload, mode="merge"|"replace"): Promise<StateV2>` — writes a rolling backup to `STATE_KEY + ".bak"` first; `merge` uses `mergeStates`, `replace` overwrites; both run the incoming through `migrate`.

- [ ] **Step 1: Write the failing tests — append to `test/store.test.js`**

```js
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
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test test/store.test.js`
Expected: FAIL — `store.exportState is not a function`.

- [ ] **Step 3: Extend `js/store.js`**

Add the import at the top:

```js
import { mergeStates } from './merge.js';
```

Add these methods inside `createStore` (before the `return`):

```js
  function exportState() {
    return { schemaVersion: snapshot.schemaVersion, exportedAt: now(), deviceId: device.deviceId, state: snapshot };
  }

  async function importState(payload, mode = 'merge') {
    storage.setItem(STATE_KEY + '.bak', JSON.stringify(snapshot)); // rolling backup before any destructive op
    const incoming = migrate(payload && payload.state ? payload.state : payload, device.deviceId);
    snapshot = (mode === 'replace') ? incoming : mergeStates(snapshot, incoming);
    persist(); notify();
    return snapshot;
  }
```

Update the `return` to add them:

```js
  return { ready, getState, getDevice: () => device, putSched, appendReview, patch, saveState, subscribe, sync, exportState, importState };
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --test test/store.test.js`
Expected: PASS (12 tests total). Then run the whole suite:

Run: `node --test`
Expected: PASS (all files).

- [ ] **Step 5: Commit**

```bash
git add js/store.js test/store.test.js
git commit -m "feat(trainer): export/import with backup + record-level merge"
```

---

### Task 7: Extract the table of contents (`js/course.js`)

**Files:**
- Create: `js/course.js`, `test/course.test.js`

**Interfaces:**
- Produces: `export const COURSE` — the same `{parts:[{label, tag, mods:[[id,title],...]}, ...]}` structure currently inlined in `js/app.js`, so `study.html` (P1) can import the TOC without loading legacy boot code.

> Source the data verbatim from the `COURSE` object in `js/app.js` (Teil I…VII + Abschluss). Do **not** modify `app.js` in this task — duplication is accepted until the P5 consolidation. The test guards the shape so the copy can't silently rot structurally.

- [ ] **Step 1: Write the failing test** — `test/course.test.js`

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { COURSE } from '../js/course.js';

test('COURSE exposes parts with mods as [id,title] pairs', () => {
  assert.ok(Array.isArray(COURSE.parts));
  assert.ok(COURSE.parts.length >= 7);
  for (const part of COURSE.parts) {
    assert.equal(typeof part.label, 'string');
    assert.ok(Array.isArray(part.mods));
    for (const m of part.mods) {
      assert.equal(m.length, 2);
      assert.equal(typeof m[0], 'string');
      assert.equal(typeof m[1], 'string');
    }
  }
});

test('COURSE contains m01..m24, capstone and glossary', () => {
  const ids = COURSE.parts.flatMap(p => p.mods.map(m => m[0]));
  for (let i = 1; i <= 24; i++) {
    const id = 'm' + String(i).padStart(2, '0');
    assert.ok(ids.includes(id), `missing ${id}`);
  }
  assert.ok(ids.includes('capstone'));
  assert.ok(ids.includes('glossary'));
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test test/course.test.js`
Expected: FAIL — `Cannot find module '../js/course.js'`.

- [ ] **Step 3: Implement `js/course.js`**

Copy the `COURSE` object from `js/app.js` (lines defining `const COURSE = {...}`) and export it. Exact content:

```js
// Table of contents, extracted from app.js so study.html can reuse it as an ES module.
// Keep in sync with app.js's COURSE until the P5 consolidation removes the duplication.
export const COURSE = {
  parts: [
    { label: "Teil I — Regulatorische Architektur", tag: "Foundations",
      mods: [
        ["m01", "Warum Bankenregulierung? Basel → CRR → ÖRS"],
        ["m02", "Eigenmittel: CET1/AT1/T2 & Pufferstapel"],
        ["m03", "Zwei Linsen: Normativ vs. Ökonomisch (ICAAP/SREP)"],
      ]},
    { label: "Teil II — Risikotragfähigkeit", tag: "Core",
      mods: [
        ["m04", "RTFA: Problemfall (95%) vs. Extremfall (99,9%)"],
        ["m05", "Kreditrisiko: IRB-Formel, FX, Konzentration"],
        ["m06", "Marktrisiko: IRRBB, FX, Spread-VaR"],
        ["m07", "CVA-Risiko: Skalierung 0,71 / 1,33"],
        ["m08", "Operationelles Risiko: 5% / 15%"],
        ["m09", "Liquiditätsrisiko: FLVaR & Mischzinssatz"],
        ["m10", "Beteiligungsrisiko: Risikofaktoren & 3×-Regel"],
        ["m11", "Sonstige Risiken: Großkredite, Makro, FW-EM"],
      ]},
    { label: "Teil III — Aggregation & Deckungsmassen", tag: "Build-up",
      mods: [
        ["m12", "Risikoaggregation: Korrelation +1, Konsolidierung"],
        ["m13", "Deckungsmassen: Problemfall vs. Extremfall"],
        ["m14", "Daten, Reporting & Kennziffern"],
      ]},
    { label: "Teil IV — Ausfall & Parameter", tag: "Deep dive",
      mods: [
        ["m15", "Ausfalldefinition (Art. 178), LGD-Schätzung"],
      ]},
    { label: "Teil V — Ausblick & Einlagensicherung", tag: "Context",
      mods: [
        ["m16", "Basel IV / CRR III & CRD VI"],
        ["m17", "Einlagensicherung: DGSD, ESAEG & IPS"],
      ]},
    { label: "Teil VI — IRB-Parameter & Basel IV/CRR III", tag: "Advanced",
      mods: [
        ["m18", "IRB-Parameter: PD, Downturn-LGD, CCF & MoC"],
        ["m19", "CRR III Kreditrisiko: SA, IRB & Output-Floor"],
        ["m20", "CRR III: Op-Risk (SMA), CVA, FRTB & SA-CCR"],
      ]},
    { label: "Teil VII — Aufsicht, Stress, Liquidität & Abwicklung", tag: "Advanced",
      mods: [
        ["m21", "EBA/ECB: ICAAP, SREP, NPE & Großkredite"],
        ["m22", "Stresstests & Reverse-Stresstests"],
        ["m23", "Liquidität: LCR, NSFR & ILAAP"],
        ["m24", "Sanierung, Abwicklung, MREL & Einlagensicherung"],
      ]},
    { label: "Abschluss", tag: "Capstone",
      mods: [
        ["capstone", "Mock-RTFA + Viva"],
        ["glossary", "Bilinguales Glossar (DE/EN)"],
      ]},
  ]
};
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `node --test test/course.test.js`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add js/course.js test/course.test.js
git commit -m "feat(trainer): extract COURSE table-of-contents as an ES module"
```

---

### Task 8: Neuter MCQ-as-gate + warm-up banner + index denominator

**Files:**
- Modify: `js/app.js` (`renderQuiz` and `gradeQuiz` only)
- Modify: `index.html` (one static string)

**Interfaces:**
- Consumes: nothing new.
- Produces: behavioral change only — `gradeQuiz` no longer calls `markComplete`; every quiz shows a persistent warm-up banner. `window.COURSE`, `renderIndexProgress`, `buildSidebar`, and the global-`QUIZ` render path are unchanged.

> This task changes DOM-coupled code in the classic (non-module) `app.js`, so it is verified by a precise **manual browser check** plus a grep guard rather than a Node unit test.

- [ ] **Step 1: Add the warm-up banner in `renderQuiz`**

In `js/app.js`, find the start of `renderQuiz` where `html` is first assigned:

```js
  let html = `<h3>✓ Verständnis-Check${QUIZ.title ? " — " + QUIZ.title : ""}</h3>`;
```

Replace it with (compute a Trainer link that works from both `/modules/` pages and the root):

```js
  const trainerHref = location.pathname.includes("/modules/") ? "../study.html" : "study.html";
  let html = `<div class="disclaimer" style="border-left-color:var(--accent)"><strong>Warm-up only.</strong> This multiple-choice check tests recognition. Durable, board-defensible recall is built by spaced practice in the <a href="${trainerHref}">Trainer</a> — this no longer marks the module complete.</div>`;
  html += `<h3>✓ Verständnis-Check${QUIZ.title ? " — " + QUIZ.title : ""}</h3>`;
```

- [ ] **Step 2: Remove `markComplete` from `gradeQuiz`**

In `js/app.js`, find the pass branch of `gradeQuiz`:

```js
  if (pct >= passMark) {
    markComplete(moduleId);
    res.style.color = "var(--green)";
    res.innerHTML = `✓ ${correct}/${total} correct — module marked complete. <span style="font-weight:400">Refresh the sidebar to see the ✓.</span>`;
  } else {
```

Replace it with (no `markComplete`, reframed copy):

```js
  if (pct >= passMark) {
    res.style.color = "var(--green)";
    res.innerHTML = `✓ ${correct}/${total} correct — warm-up cleared. Lock it in with spaced practice in the <a href="${location.pathname.includes("/modules/") ? "../study.html" : "study.html"}">Trainer</a>.`;
  } else {
```

(Leave the `markComplete` function defined — other phases retire it; it is simply no longer called.)

- [ ] **Step 3: Fix the stale denominator in `index.html`**

Find:

```html
        <div class="progress-label" id="progress-label">0 / 18 modules complete</div>
```

Replace with:

```html
        <div class="progress-label" id="progress-label">0 / 25 modules complete</div>
```

(`renderIndexProgress` overwrites this on load with the live count; this only fixes the pre-JS fallback. 24 modules + capstone = 25 graded ids.)

- [ ] **Step 4: Grep guard — confirm `gradeQuiz` no longer marks completion**

Run:
```bash
awk '/function gradeQuiz/,/^}/' js/app.js | grep -c 'markComplete'
```
Expected: `0`.

- [ ] **Step 5: Manual browser check**

Open `modules/m05.html`, scroll to the quiz:
- A "Warm-up only" banner appears above the check, linking to the Trainer.
- Answer all questions correctly and Submit: result says "warm-up cleared", and the **sidebar gains no new ✓** (reload — m05 is not newly marked complete).
- Open `index.html`: before scripts the label reads "0 / 25"; after load it shows the live "n / 25 …".
- Open `modules/m01.html` and `capstone.html`: the banner shows and quizzes still grade + reveal explanations.

- [ ] **Step 6: Commit**

```bash
git add js/app.js index.html
git commit -m "feat(trainer): demote MCQ to warm-up (no completion gate) + fix index denominator"
```

---

### Task 9: Backward-compatibility acceptance pass

**Files:**
- No code changes — verification only. (If a check fails, fix it in the offending task before proceeding.)

**Interfaces:** none.

> This task is the gate that the "m05-only slice" foundation has not regressed the existing 27 pages. It is a manual checklist plus the full automated suite.

- [ ] **Step 1: Run the full unit suite**

Run: `node --test`
Expected: PASS — all of `state`, `migrate`, `merge`, `store`, `course` tests green.

- [ ] **Step 2: Verify no engine module touches the DOM or storage (purity guard)**

Run:
```bash
grep -nE 'localStorage|document|window|fetch' js/state.js js/migrate.js js/merge.js || echo "PURE OK"
```
Expected: `PURE OK` (only `js/store.js` may reference `localStorage`/`Intl`/`crypto`).

- [ ] **Step 3: Manual page-by-page smoke (open each in a browser)**

For `index.html`, `modules/m01.html`, `modules/m04.html`, `modules/m05.html`, `capstone.html`, `glossary.html`:
- Sidebar builds with all parts and module links; active item highlights.
- `index.html` curriculum grid renders; progress meter shows "n / 25".
- A module quiz grades, reveals explanations, shows the warm-up banner, and does **not** add a new ✓.
- `glossary.html` search still filters terms.
- In DevTools console: `typeof window.COURSE === 'object'` and `typeof renderIndexProgress === 'function'`.

- [ ] **Step 4: Verify legacy data is preserved and migrated lazily**

In DevTools on `index.html`:
```js
localStorage.setItem('leitfaden_progress_v1', JSON.stringify({ m05: true }));
```
Then in a module page console, load the store module and hydrate:
```js
const { createStore } = await import('../js/store.js');
const s = createStore({ storage: localStorage });
await s.ready();
console.log(s.getState().modules.m05);                 // { readiness: 'review-soon', completedAt: null }
console.log(!!localStorage.getItem('leitfaden_progress_v1')); // true — legacy preserved
console.log(!!localStorage.getItem('leitfaden_state_v2'));    // true — migrated v2 written
```
Expected: as annotated.

- [ ] **Step 5: Commit the verification note (optional) and conclude P0**

```bash
git commit --allow-empty -m "test(trainer): P0 backward-compat acceptance pass green"
```

---

## Self-Review

**Spec coverage (P0 scope of §5, §14):**
- Store contract async `ready` + sync snapshot + `patch`/`putSched`/`appendReview` → Tasks 4–6. ✓
- Three namespaces (content not touched here; user-state `leitfaden_state_v2`; device-config `leitfaden_device_v1`) → Tasks 1, 4. ✓
- State root schema (`schemaVersion`, modules, sched, reviews, newIntroduced, tombstones, settings) → Task 1. ✓
- Per-record `updatedAt`/`rev`/`deviceId` + record-level merge (no field-wise max) → Tasks 3, 5. ✓
- Migration v1→v2 (idempotent, rejects downgrade, skips glossary, no phantom sched, non-destructive) → Tasks 2, 4. ✓
- export/import (merge default vs replace, backup) → Task 6. ✓
- COURSE extraction for study.html reuse → Task 7. ✓
- Global MCQ-neuter + warm-up banner + index denominator fix → Task 8. ✓
- app.js freeze + backward-compat acceptance → Tasks 8 (scoped edits), 9. ✓
- *Deferred to later phases (correctly absent here):* GistSync `sync()` body, PWA/service worker, `srs.js`/`queue.js`, card schema/decks, study.html UI, widgets, reading redesign, readiness rollup, "reviews due" badge.

**Placeholder scan:** No "TBD/TODO/handle edge cases" — every code step shows complete code; manual steps list exact actions. ✓

**Type consistency:** `STATE_KEY`/`LEGACY_KEY`/`DEVICE_KEY` used identically across state/migrate/store; `migrate(raw, deviceId)`, `mergeStates(local, remote)`, `createStore({storage, now})`, `putSched(cardId, partial)`, `appendReview(entry)`, `patch(path, value)`, `exportState()`, `importState(payload, mode)` are consistent between their defining task and their tests. ✓

---

## Next plans (not in this phase)

- **P1 — Core review loop:** `js/srs.js` (pinned SM-2-lite + golden tests), `js/queue.js` (eligibility/chains/overdue/cap/interleave), `card.schema.json` + `_card_brief.md` + card-lint, the **m05 deck**, numeric `normalizeInput`, Review mode in `study.html`, "reviews due" badge.
- **P2** — reg/ÖRS drill, commit-time confidence + locked viva + rubrics, calibration dashboard.
- **P3** — m05 widgets (ASRF explorer, quantile toggle, IRB calculator with golden tests, step-gated derivation) + m05 reading segmentation/anchors/readiness rollup.
- **P4** — GistSync (`sync()` body, status surfacing, iOS `persist()`) + PWA.
- **P5** — roll templates across m01–m24; retire legacy key; route sidebar/index to readiness.
