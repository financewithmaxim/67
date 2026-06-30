# Leitfaden Trainer — P1: SRS Scheduler & Card Contract — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the pure, golden-tested spaced-repetition scheduler (`js/srs.js`), tolerance-based numeric grading that survives German/English number formats (`js/normalize.js`), and the card data contract (`card.schema.json` + authoring brief + a no-build lint + one exemplar card per type) — the correctness-critical core that the Review UI and the m05 deck (P1b) will consume.

**Architecture:** Same vanilla-JS, no-build, ES-module-engine + `node --test` approach established in P0. `srs.js` and `normalize.js` are PURE and synchronous (no store I/O, no DOM, no randomness) so they are exhaustively golden-testable and remain a clean drop-in target for FSRS later. Scheduling metadata (`rev`/`updatedAt`/`deviceId`) is stamped by the P0 store's `putSched`, NOT by `srs.js` — `srs.js` returns only the scheduling fields. Interval fuzz is a separate, injectable concern (kept out of `grade()` so tests stay deterministic).

**Tech Stack:** Vanilla JS ES modules; Node ≥ 20 `node --test` (dev-only); a vendored/zero-dep JSON-Schema check for the card lint (hand-rolled validator — no npm).

## Global Constraints

- **No build step for the site.** New modules are ES modules (`js/srs.js`, `js/normalize.js`); tests under `test/`; `package.json` already has `"type":"module"`.
- **`srs.js` and `normalize.js` are PURE and synchronous** — no `localStorage`, `document`, `window`, `fetch`, `Date.now()`, or `Math.random()`. Time is always passed in as a `nowEpoch` argument (UTC epoch ms). `grade()` returns the next scheduling fields; the caller stamps `rev`/`updatedAt`/`deviceId` via the P0 store.
- **`srs.js` returns ONLY scheduling fields** (`state, due, interval, ease, reps, lapses, lastGrade, pending`). It never touches `rev`/`updatedAt`/`deviceId`/`seenVersion` (those are the store's / merge's concern).
- **SM-2-lite constants are pinned (verbatim):** `DAY_MS = 86400000`; `LEARN_STEP_MS = 600000` (10 min); ease start `2.5`, floor `1.30`; ease deltas Again `-0.20`, Hard `-0.15`, Good `0`, Easy `+0.15`; graduating intervals Good `1` day, Easy `6` days; review growth Hard `×1.2`, Good `×ease`, Easy `×ease×1.3`; max interval cap `180` days; lapse → relearn with post-relearn interval `max(1, prior×0.5)` days and ease `-0.20` (never below floor, never zeroed); leech auto-suspend at `lapses ≥ 6`.
- **`grade` enum:** exactly `'again' | 'hard' | 'good' | 'easy'`.
- **Numeric grading is tolerance-based and format-robust:** because German "67.400" and English "67,400" both mean 67400 (and "1.645" means 1.645), `gradeNumeric` accepts the answer if ANY plausible parse of the input is within tolerance — it does not guess a single interpretation. Canonical answer values are stored in BASE UNITS (fractions, not %).
- **Card types (the five + freeRecall):** `numeric | cloze | deriveStep | discrimination | viva | freeRecall`. Card ids are immutable + namespaced. `tags.spine ∈ {reg, ors, boundary}`.
- Reuse existing `css/style.css` tokens. Skip gamification.

## File Structure

- `js/srs.js` — **create**. Pure SM-2-lite. `newSched()`, `grade(sched, grade, nowEpoch)`, `applyFuzz(intervalDays, rng)`, constants.
- `js/normalize.js` — **create**. Pure. `numericCandidates(str)`, `gradeNumeric(str, answer)`.
- `js/cardlint.js` — **create**. Pure. `validateCard(card)`, `lintDeck(cards)` — a small hand-rolled validator against the card contract (no npm JSON-Schema dep).
- `card.schema.json` — **create**. Declarative JSON-Schema description of a card (documentation + the source of truth the lint mirrors).
- `data/cards/_exemplar.json` — **create**. One valid card per type — the authoring template and the lint's fixture.
- `_card_brief.md` — **create**. The authoring brief: how to write each card type, the reg/ÖRS spine rules, the numeric base-unit + tolerance rules, id conventions.
- `test/srs.test.js`, `test/normalize.test.js`, `test/cardlint.test.js` — **create**. Node tests (golden schedule, format robustness, lint pass/fail).

> Out of scope for P1 (these are P1b): `js/queue.js`, `study.html`, the "reviews due" badge, and the real m05 deck. P1 ships the exemplar deck only.

---

### Task 1: SM-2-lite scheduler core — new/learning/graduation (`js/srs.js`)

**Files:**
- Create: `js/srs.js`, `test/srs.test.js`

**Interfaces:**
- Produces: constants (`DAY_MS`, `LEARN_STEP_MS`, `EASE_START`, `EASE_FLOOR`, `CAP_DAYS`); `newSched(): {state:'new',interval:0,ease:2.5,reps:0,lapses:0,lastGrade:null,pending:0}`; `grade(sched, g, nowEpoch): sched` — this task handles transitions OUT OF `new`/`learning` only (review/relearn/leech come in Task 2).

- [ ] **Step 1: Write the failing test** — `test/srs.test.js`

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newSched, grade, DAY_MS, LEARN_STEP_MS } from '../js/srs.js';

const T0 = 1_000_000_000_000; // fixed epoch for deterministic golden tests

test('newSched is a fresh new-state card', () => {
  assert.deepEqual(newSched(), { state: 'new', interval: 0, ease: 2.5, reps: 0, lapses: 0, lastGrade: null, pending: 0 });
});

test('new + good graduates to review at 1 day', () => {
  const s = grade(newSched(), 'good', T0);
  assert.equal(s.state, 'review');
  assert.equal(s.interval, 1);
  assert.equal(s.ease, 2.5);          // graduation does not change ease
  assert.equal(s.reps, 1);
  assert.equal(s.due, T0 + 1 * DAY_MS);
  assert.equal(s.lastGrade, 'good');
});

test('new + easy graduates to review at 6 days', () => {
  const s = grade(newSched(), 'easy', T0);
  assert.equal(s.state, 'review');
  assert.equal(s.interval, 6);
  assert.equal(s.due, T0 + 6 * DAY_MS);
});

test('new + again drops to learning, due in one learn-step, reps stay 0', () => {
  const s = grade(newSched(), 'again', T0);
  assert.equal(s.state, 'learning');
  assert.equal(s.reps, 0);
  assert.equal(s.due, T0 + LEARN_STEP_MS);
});

test('learning + good graduates to review at 1 day', () => {
  const learning = grade(newSched(), 'again', T0);
  const s = grade(learning, 'good', T0 + LEARN_STEP_MS);
  assert.equal(s.state, 'review');
  assert.equal(s.interval, 1);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test test/srs.test.js`
Expected: FAIL — `Cannot find module '../js/srs.js'`.

- [ ] **Step 3: Implement `js/srs.js` (new/learning only)**

```js
// Pure SM-2-lite scheduler. No I/O, no Date.now, no Math.random — time is passed in.
// Returns ONLY scheduling fields; the store stamps rev/updatedAt/deviceId.
export const DAY_MS = 86_400_000;
export const LEARN_STEP_MS = 600_000; // 10 minutes
export const EASE_START = 2.5;
export const EASE_FLOOR = 1.30;
export const CAP_DAYS = 180;

const GRAD_GOOD_DAYS = 1;
const GRAD_EASY_DAYS = 6;

export function newSched() {
  return { state: 'new', interval: 0, ease: EASE_START, reps: 0, lapses: 0, lastGrade: null, pending: 0 };
}

function graduate(sched, intervalDays, now) {
  return { ...sched, state: 'review', interval: intervalDays, reps: sched.reps + 1, due: now + intervalDays * DAY_MS };
}

export function grade(sched, g, now) {
  const out = { ...sched, lastGrade: g };

  if (sched.state === 'new' || sched.state === 'learning') {
    if (g === 'good') return graduate(out, GRAD_GOOD_DAYS, now);
    if (g === 'easy') return graduate(out, GRAD_EASY_DAYS, now);
    // again / hard → stay in learning, re-show after one step
    return { ...out, state: 'learning', due: now + LEARN_STEP_MS };
  }

  // review / relearn / suspended transitions are added in Task 2.
  return out;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `node --test test/srs.test.js`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add js/srs.js test/srs.test.js
git commit -m "feat(trainer): SM-2-lite scheduler — new/learning/graduation"
```

---

### Task 2: SM-2-lite scheduler — review / lapse / relearn / leech / cap / overdue (`js/srs.js`)

**Files:**
- Modify: `js/srs.js`
- Modify: `test/srs.test.js` (append golden tests)

**Interfaces:**
- Extends `grade()` to handle `review`, `relearn`, and leech-suspension. No signature change.

- [ ] **Step 1: Append the failing golden tests to `test/srs.test.js`**

```js
function reviewCard({ interval = 10, ease = 2.5, reps = 3, lapses = 0, due = T0 } = {}) {
  return { state: 'review', interval, ease, reps, lapses, lastGrade: 'good', pending: 0, due };
}

test('review + good at due multiplies interval by ease', () => {
  const s = grade(reviewCard({ interval: 10, ease: 2.5, due: T0 }), 'good', T0);
  assert.equal(s.interval, 25);            // 10 * 2.5
  assert.equal(s.reps, 4);
  assert.equal(s.due, T0 + 25 * DAY_MS);
});

test('review + good when overdue credits the elapsed time', () => {
  const due = T0 - 5 * DAY_MS;             // 5 days overdue
  const s = grade(reviewCard({ interval: 10, ease: 2.5, due }), 'good', T0);
  assert.equal(s.interval, (10 + 5) * 2.5); // (prior + overdue) * ease = 37.5
});

test('review + hard grows ×1.2 and drops ease by 0.15', () => {
  const s = grade(reviewCard({ interval: 10, ease: 2.5, due: T0 }), 'hard', T0);
  assert.equal(s.interval, 12);
  assert.equal(Number(s.ease.toFixed(2)), 2.35);
});

test('review + easy grows ×ease×1.3 and raises ease by 0.15', () => {
  const s = grade(reviewCard({ interval: 10, ease: 2.5, due: T0 }), 'easy', T0);
  assert.equal(s.interval, 32.5);          // 10 * 2.5 * 1.3
  assert.equal(Number(s.ease.toFixed(2)), 2.65);
});

test('ease never drops below the floor of 1.30', () => {
  const s = grade(reviewCard({ interval: 10, ease: 1.40, due: T0 }), 'hard', T0);
  assert.equal(s.ease, 1.30);              // 1.40 - 0.15 = 1.25 -> floored
});

test('interval is capped at 180 days', () => {
  const s = grade(reviewCard({ interval: 150, ease: 2.5, due: T0 }), 'good', T0);
  assert.equal(s.interval, 180);           // 375 -> capped
});

test('review + again lapses to relearn: ease -0.20, lapses+1, pending = prior/2 floored at 1', () => {
  const s = grade(reviewCard({ interval: 20, ease: 2.5, lapses: 1, due: T0 }), 'again', T0);
  assert.equal(s.state, 'relearn');
  assert.equal(s.lapses, 2);
  assert.equal(Number(s.ease.toFixed(2)), 2.30);
  assert.equal(s.pending, 10);             // max(1, 20*0.5)
  assert.equal(s.due, T0 + LEARN_STEP_MS);
});

test('relearn + good returns to review at the pending interval', () => {
  const lapsed = grade(reviewCard({ interval: 20, ease: 2.5, due: T0 }), 'again', T0);
  const s = grade(lapsed, 'good', T0 + LEARN_STEP_MS);
  assert.equal(s.state, 'review');
  assert.equal(s.interval, 10);            // the pending value
  assert.equal(s.due, (T0 + LEARN_STEP_MS) + 10 * DAY_MS);
});

test('a 6th lapse auto-suspends (leech) instead of relearning', () => {
  const s = grade(reviewCard({ interval: 20, ease: 2.0, lapses: 5, due: T0 }), 'again', T0);
  assert.equal(s.lapses, 6);
  assert.equal(s.state, 'suspended');
});

test('grading a suspended card leaves it suspended (manual unsuspend is out of scope)', () => {
  const susp = { state: 'suspended', interval: 5, ease: 2, reps: 4, lapses: 6, lastGrade: 'again', pending: 3, due: T0 };
  assert.equal(grade(susp, 'good', T0).state, 'suspended');
});
```

- [ ] **Step 2: Run to verify the new tests fail**

Run: `node --test test/srs.test.js`
Expected: FAIL — review/relearn assertions fail (Task 1 `grade` returns the card unchanged for `review`).

- [ ] **Step 3: Extend `grade()` in `js/srs.js`**

Add this helper above `grade`:

```js
const clampEase = e => Math.max(EASE_FLOOR, e);
const capDays = d => Math.min(CAP_DAYS, d);
const LEECH_LAPSES = 6;
```

Replace the `// review / relearn ...` fallthrough in `grade` with:

```js
  if (sched.state === 'suspended') return out; // manual unsuspend is out of scope

  if (sched.state === 'relearn') {
    if (g === 'good' || g === 'easy') {
      const interval = capDays(Math.max(1, sched.pending || 1));
      return { ...out, state: 'review', interval, pending: 0, reps: sched.reps + 1, due: now + interval * DAY_MS };
    }
    return { ...out, state: 'relearn', due: now + LEARN_STEP_MS }; // again / hard
  }

  // state === 'review'
  if (g === 'again') {
    const lapses = sched.lapses + 1;
    const ease = clampEase(sched.ease - 0.20);
    if (lapses >= LEECH_LAPSES) return { ...out, state: 'suspended', ease, lapses };
    return { ...out, state: 'relearn', ease, lapses, pending: capDays(Math.max(1, sched.interval * 0.5)), due: now + LEARN_STEP_MS };
  }
  if (g === 'hard') {
    const interval = capDays(sched.interval * 1.2);
    return { ...out, ease: clampEase(sched.ease - 0.15), interval, reps: sched.reps + 1, due: now + interval * DAY_MS };
  }
  if (g === 'easy') {
    const interval = capDays(sched.interval * sched.ease * 1.3);
    return { ...out, ease: clampEase(sched.ease + 0.15), interval, reps: sched.reps + 1, due: now + interval * DAY_MS };
  }
  // good: credit overdue time, then grow by ease
  const overdueDays = Math.max(0, (now - sched.due) / DAY_MS);
  const interval = capDays((sched.interval + overdueDays) * sched.ease);
  return { ...out, interval, reps: sched.reps + 1, due: now + interval * DAY_MS };
```

- [ ] **Step 4: Run to verify all pass**

Run: `node --test test/srs.test.js`
Expected: PASS (15 tests). Then `node --test` — expect the whole suite green.

- [ ] **Step 5: Commit**

```bash
git add js/srs.js test/srs.test.js
git commit -m "feat(trainer): SM-2-lite review/lapse/relearn/leech/cap/overdue + golden tests"
```

---

### Task 3: Deterministic interval fuzz (`js/srs.js`)

**Files:**
- Modify: `js/srs.js`
- Modify: `test/srs.test.js` (append)

**Interfaces:**
- Produces: `applyFuzz(intervalDays, rng): number` — spreads intervals ≥ 4 days by ±25% using an injected `rng` (`() => [0,1)`), so batch-authored cards de-synchronise. Kept OUT of `grade()` so `grade()` stays deterministic; the queue layer (P1b) applies it at scheduling time with a real rng.

- [ ] **Step 1: Append the failing test**

```js
import { applyFuzz } from '../js/srs.js';

test('applyFuzz leaves short intervals (< 4 days) unchanged', () => {
  assert.equal(applyFuzz(1, () => 0.5), 1);
  assert.equal(applyFuzz(3, () => 0), 3);
});

test('applyFuzz spreads a >=4-day interval within +/-25%, deterministically per rng', () => {
  assert.equal(applyFuzz(100, () => 0.0), 75);   // rng 0 -> -25%
  assert.equal(applyFuzz(100, () => 1.0), 125);  // rng 1 -> +25%
  assert.equal(applyFuzz(100, () => 0.5), 100);  // rng 0.5 -> center
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `node --test test/srs.test.js`
Expected: FAIL — `applyFuzz` is not exported.

- [ ] **Step 3: Implement `applyFuzz` in `js/srs.js`**

```js
const FUZZ_MIN_DAYS = 4;
const FUZZ_PCT = 0.25;

// Spread intervals >= FUZZ_MIN_DAYS by +/-FUZZ_PCT using an injected rng (() => [0,1)).
export function applyFuzz(intervalDays, rng) {
  if (intervalDays < FUZZ_MIN_DAYS) return intervalDays;
  const factor = 1 + FUZZ_PCT * (2 * rng() - 1); // rng 0 -> 0.75, 0.5 -> 1.0, 1 -> 1.25
  return intervalDays * factor;
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `node --test test/srs.test.js`
Expected: PASS (17 tests).

- [ ] **Step 5: Commit**

```bash
git add js/srs.js test/srs.test.js
git commit -m "feat(trainer): deterministic, injectable interval fuzz"
```

---

### Task 4: Format-robust numeric grading (`js/normalize.js`)

**Files:**
- Create: `js/normalize.js`, `test/normalize.test.js`

**Interfaces:**
- Produces: `numericCandidates(str): number[]` — strips currency/letters/spaces and returns every plausible numeric parse (treating `.`/`,` as thousands and/or decimal); `gradeNumeric(str, answer): boolean` where `answer = {value, tol?, absTol?}` (`value` in base units; default relative `tol = 0.005`). Returns true if ANY candidate is within tolerance — so it never has to guess German vs English.

- [ ] **Step 1: Write the failing test** — `test/normalize.test.js`

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { numericCandidates, gradeNumeric } from '../js/normalize.js';

test('candidates handle currency, spaces, and thousands/decimal ambiguity', () => {
  assert.ok(numericCandidates('EUR 67,400').includes(67400));
  assert.ok(numericCandidates('67.400').includes(67400));
  assert.ok(numericCandidates('67400').includes(67400));
  assert.ok(numericCandidates('1.645').includes(1.645));
  assert.ok(numericCandidates('0,71').includes(0.71));
  assert.ok(numericCandidates('1 645,5').includes(1645.5)); // mixed: space thousands + comma decimal
});

test('gradeNumeric accepts any in-tolerance interpretation (German or English)', () => {
  assert.equal(gradeNumeric('67.400', { value: 67400 }), true);
  assert.equal(gradeNumeric('67,400', { value: 67400 }), true);
  assert.equal(gradeNumeric('EUR 67 400', { value: 67400 }), true);
  assert.equal(gradeNumeric('1,645', { value: 1.645 }), true);
});

test('gradeNumeric respects relative tolerance and rejects out-of-band answers', () => {
  assert.equal(gradeNumeric('67000', { value: 67400 }), false);      // ~0.6% off, default tol 0.5%
  assert.equal(gradeNumeric('67400', { value: 67400, tol: 0.0001 }), true);
  assert.equal(gradeNumeric('0.1618', { value: 0.1618 }), true);     // conditional PD as a fraction
});

test('gradeNumeric handles an absolute-tolerance override and zero', () => {
  assert.equal(gradeNumeric('0.001', { value: 0, absTol: 0.01 }), true);
  assert.equal(gradeNumeric('', { value: 5 }), false);
  assert.equal(gradeNumeric('abc', { value: 5 }), false);
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `node --test test/normalize.test.js`
Expected: FAIL — `Cannot find module '../js/normalize.js'`.

- [ ] **Step 3: Implement `js/normalize.js`**

```js
// Pure, format-robust numeric grading. Rather than guess German vs English number format,
// we enumerate plausible parses and accept if ANY is within tolerance.
function uniqueFinite(nums) {
  const out = [];
  for (const n of nums) if (Number.isFinite(n) && !out.includes(n)) out.push(n);
  return out;
}

export function numericCandidates(str) {
  if (typeof str !== 'string') return [];
  // strip everything except digits, separators, and a leading sign
  let s = str.trim().replace(/[^0-9.,\-]/g, '');
  if (s === '' || s === '-') return [];
  const hasDot = s.includes('.');
  const hasComma = s.includes(',');
  const cands = [];

  if (hasDot && hasComma) {
    // the LAST-occurring separator is the decimal point; the other groups thousands
    const decIsComma = s.lastIndexOf(',') > s.lastIndexOf('.');
    const dec = decIsComma ? ',' : '.';
    const thou = decIsComma ? '.' : ',';
    cands.push(Number(s.split(thou).join('').replace(dec, '.')));
  } else if (hasComma) {
    cands.push(Number(s.replace(/,/g, '')));        // comma as thousands -> 67,400 = 67400
    cands.push(Number(s.replace(',', '.')));        // comma as decimal   -> 0,71 = 0.71
  } else if (hasDot) {
    cands.push(Number(s.replace(/\./g, '')));       // dot as thousands  -> 67.400 = 67400
    cands.push(Number(s));                          // dot as decimal    -> 1.645 = 1.645
  } else {
    cands.push(Number(s));
  }
  return uniqueFinite(cands);
}

export function gradeNumeric(str, answer) {
  const { value, tol = 0.005, absTol } = answer || {};
  const band = absTol != null ? absTol : Math.max(Math.abs(value) * tol, 0);
  for (const c of numericCandidates(str)) {
    if (Math.abs(c - value) <= band) return true;
  }
  return false;
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `node --test test/normalize.test.js`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add js/normalize.js test/normalize.test.js
git commit -m "feat(trainer): format-robust tolerance-based numeric grading"
```

---

### Task 5: Card contract — schema, exemplar deck, brief, lint (`card.schema.json`, `data/cards/_exemplar.json`, `_card_brief.md`, `js/cardlint.js`)

**Files:**
- Create: `card.schema.json`, `data/cards/_exemplar.json`, `_card_brief.md`, `js/cardlint.js`, `test/cardlint.test.js`

**Interfaces:**
- Produces: `validateCard(card): string[]` (returns an array of human-readable errors; empty = valid); `lintDeck(cards): {id, errors}[]` (only entries with errors). The lint enforces: unique namespaced ids; per-type required fields; `tags.spine ∈ {reg,ors,boundary}`; numeric answers in base units with a tolerance; the mandated **type mix** for a deck (≥2 numeric, ≥1 deriveStep, ≥2 cloze, ≥2 discrimination, ≥2 viva).

- [ ] **Step 1: Write `card.schema.json` (documentation + lint source of truth)**

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "title": "Leitfaden Trainer card",
  "type": "object",
  "required": ["id", "module", "type", "front", "tags", "version", "sourceRef"],
  "properties": {
    "id": { "type": "string", "pattern": "^m[0-9]{2}\\.[a-z]+\\.[a-z0-9-]+$" },
    "module": { "type": "string", "pattern": "^m[0-9]{2}$" },
    "type": { "enum": ["numeric", "cloze", "deriveStep", "discrimination", "viva", "freeRecall"] },
    "format": { "enum": ["text", "md", "tex"] },
    "lang": { "enum": ["en", "de", "mix"] },
    "front": { "type": "string", "minLength": 1 },
    "tags": {
      "type": "object",
      "required": ["spine"],
      "properties": {
        "spine": { "enum": ["reg", "ors", "boundary"] },
        "risk": { "type": "string" },
        "crr": { "type": "string" }
      }
    },
    "version": { "type": "string" },
    "sourceRef": { "type": "object", "required": ["module", "anchor"], "properties": { "module": {"type":"string"}, "anchor": {"type":"string"} } },
    "answer": { "type": "object", "required": ["value"], "properties": { "value": {"type":"number"}, "tol": {"type":"number"}, "absTol": {"type":"number"}, "unit": {"type":"string"} } },
    "blanks": { "type": "array" },
    "steps": { "type": "array" },
    "verdict": { "enum": ["reg", "ors", "mixed"] },
    "rubric": { "type": "array" },
    "modelAnswer": { "type": "string" }
  }
}
```

- [ ] **Step 2: Write the failing test** — `test/cardlint.test.js`

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { validateCard, lintDeck } from '../js/cardlint.js';

const exemplar = JSON.parse(readFileSync(new URL('../data/cards/_exemplar.json', import.meta.url)));

test('the shipped exemplar deck is lint-clean', () => {
  assert.deepEqual(lintDeck(exemplar.cards), []);
});

test('the exemplar covers every card type', () => {
  const types = new Set(exemplar.cards.map(c => c.type));
  for (const t of ['numeric', 'cloze', 'deriveStep', 'discrimination', 'viva']) {
    assert.ok(types.has(t), `exemplar missing a ${t} card`);
  }
});

test('validateCard rejects a bad id and a missing required field', () => {
  assert.ok(validateCard({ id: 'BAD', module: 'm05', type: 'numeric', front: 'x', tags: { spine: 'reg' }, version: 'v', sourceRef: { module: 'm05', anchor: 'a' }, answer: { value: 1 } }).length > 0);
  assert.ok(validateCard({ id: 'm05.num.x', module: 'm05', type: 'numeric', front: 'x', tags: { spine: 'reg' }, version: 'v', sourceRef: { module: 'm05', anchor: 'a' } }).some(e => /answer/.test(e)));
});

test('validateCard rejects an unknown spine value', () => {
  assert.ok(validateCard({ id: 'm05.disc.x', module: 'm05', type: 'discrimination', front: 'x', tags: { spine: 'maybe' }, version: 'v', sourceRef: { module: 'm05', anchor: 'a' }, verdict: 'reg', rubric: ['x'] }).some(e => /spine/.test(e)));
});

test('lintDeck flags duplicate ids', () => {
  const dup = [
    { id: 'm05.num.a', module: 'm05', type: 'numeric', front: 'x', tags: { spine: 'reg' }, version: 'v', sourceRef: { module: 'm05', anchor: 'a' }, answer: { value: 1 } },
    { id: 'm05.num.a', module: 'm05', type: 'numeric', front: 'y', tags: { spine: 'reg' }, version: 'v', sourceRef: { module: 'm05', anchor: 'a' }, answer: { value: 2 } },
  ];
  assert.ok(lintDeck(dup).some(r => r.errors.some(e => /duplicate/i.test(e))));
});
```

- [ ] **Step 3: Run to verify it fails**

Run: `node --test test/cardlint.test.js`
Expected: FAIL — `Cannot find module '../js/cardlint.js'` (and the exemplar file does not exist yet).

- [ ] **Step 4: Write `data/cards/_exemplar.json`** (one valid card per type — copy/adapt these, all anchored to real m05 content)

```json
{
  "module": "m05",
  "cards": [
    { "id": "m05.num.ul-extremfall", "module": "m05", "type": "numeric", "format": "tex", "lang": "en",
      "front": "Corporate exposure EAD = 1,000,000; PD = 1.3669%; LGD = 45.5%; M = 2.5; Extremfall (q = 99.9%). Compute the unexpected loss UL in EUR.",
      "answer": { "value": 67400, "tol": 0.01, "unit": "EUR" },
      "tags": { "spine": "reg", "risk": "credit", "crr": "CRR:Art153" }, "version": "Leitfaden-09/2024", "sourceRef": { "module": "m05", "anchor": "m05-s4" } },
    { "id": "m05.num.ul-problemfall", "module": "m05", "type": "numeric", "format": "tex", "lang": "en",
      "front": "Same exposure, Problemfall (q = 95%, \\(\\Phi^{-1}=1.6449\\)). Compute UL in EUR.",
      "answer": { "value": 15520, "tol": 0.01, "unit": "EUR" },
      "tags": { "spine": "ors", "risk": "credit", "crr": "CRR:Art153" }, "version": "Leitfaden-09/2024", "sourceRef": { "module": "m05", "anchor": "m05-s4" } },
    { "id": "m05.cloze.signflip", "module": "m05", "type": "cloze", "format": "tex", "lang": "en",
      "front": "Worst-case conditional PD: \\(\\Phi\\!\\left(\\frac{\\Phi^{-1}(PD){{c1}}\\sqrt{R}\\,\\Phi^{-1}(q)}{\\sqrt{1-R}}\\right)\\)",
      "blanks": [ { "id": "c1", "accept": ["+"], "render": "operator" } ],
      "tags": { "spine": "reg", "risk": "credit", "crr": "CRR:Art153" }, "version": "Leitfaden-09/2024", "sourceRef": { "module": "m05", "anchor": "m05-s3-2" } },
    { "id": "m05.cloze.quantile-999", "module": "m05", "type": "cloze", "format": "tex", "lang": "en",
      "front": "The Extremfall quantile \\(\\Phi^{-1}(0.999) = {{c1}}\\) (4 dp).",
      "blanks": [ { "id": "c1", "accept": ["3.0902"], "render": "number" } ],
      "tags": { "spine": "reg", "risk": "credit", "crr": "CRR:Art153" }, "version": "Leitfaden-09/2024", "sourceRef": { "module": "m05", "anchor": "m05-s3-2" } },
    { "id": "m05.deriv.signflip", "module": "m05", "type": "deriveStep", "format": "tex", "lang": "en",
      "front": "Derive the conditional PD from p(x): substitute the worst-case factor.",
      "steps": [
        { "prompt": "What value of the systematic factor x is the worst case at confidence q?", "kind": "pick", "expected": "x = -\\Phi^{-1}(q)", "explain": "A bad economy is the LOWER tail of X." },
        { "prompt": "After substituting, what sign does the systematic term carry?", "kind": "pick", "expected": "+", "explain": "The minus flips to plus, giving +\\sqrt{R}\\,\\Phi^{-1}(q)." }
      ],
      "tags": { "spine": "reg", "risk": "credit", "crr": "CRR:Art153" }, "version": "Leitfaden-09/2024", "sourceRef": { "module": "m05", "anchor": "m05-s3-2" } },
    { "id": "m05.disc.m-25", "module": "m05", "type": "discrimination", "format": "md", "lang": "en",
      "front": "The fixed maturity M = 2.5 years used in the IRB formula: regulatory value or ÖRS choice — and what does it trade off?",
      "verdict": "ors",
      "rubric": [ "names it an ÖRS proportionality choice", "states it sets the maturity adjustment to 1", "names the tradeoff: comparability across banks vs maturity-risk precision" ],
      "tags": { "spine": "ors", "risk": "credit", "crr": "CRR:Art153" }, "version": "Leitfaden-09/2024", "sourceRef": { "module": "m05", "anchor": "m05-s3-3" } },
    { "id": "m05.disc.r-curve", "module": "m05", "type": "discrimination", "format": "md", "lang": "en",
      "front": "The asset-correlation curve R(PD) interpolating 0.12–0.24: regulatory or ÖRS — and the tradeoff?",
      "verdict": "reg",
      "rubric": [ "names it a CRR Art. 153 regulatory value (not negotiable)", "explains high-PD names are less systematic, so lower correlation", "notes the bank cannot change it" ],
      "tags": { "spine": "reg", "risk": "credit", "crr": "CRR:Art153" }, "version": "Leitfaden-09/2024", "sourceRef": { "module": "m05", "anchor": "m05-s3-3" } },
    { "id": "m05.viva.problemfall", "module": "m05", "type": "viva", "format": "md", "lang": "mix",
      "front": "Defend to the Aufsichtsrat in three sentences: why does the Problemfall use 95% rather than 99.9%, and what is the consequence for capital?",
      "rubric": [
        { "id": "r1", "text": "Problemfall is the ~1-in-20-year (95%) view; Extremfall is the ~1-in-1000-year (99.9%) economic-capital view", "weight": 1, "required": true },
        { "id": "r2", "text": "Only the quantile Φ⁻¹(q) changes inside the conditional PD — nothing else", "weight": 1, "required": true },
        { "id": "r3", "text": "The Problemfall UL is therefore far smaller (≈¼ here: 15,520 vs 67,400)", "weight": 1, "required": false }
      ],
      "antiPoints": [ "claims LGD or the 0.71/1.33 scalar changes between the scenarios", "double-counts EL in the capital figure" ],
      "modelAnswer": "The Problemfall measures risk-bearing capacity at a 95% confidence (a loss exceeded about once in 20 years), reserved for the going-concern traffic-light view, whereas the Extremfall uses 99.9% as a liquidation/economic-capital lens. Mechanically only the quantile Φ⁻¹(q) is swapped (1.6449 vs 3.0902) inside the conditional-PD term — LGD, R(PD) and the maturity adjustment are unchanged. The result is a materially smaller unexpected loss (here roughly a quarter: €15,520 vs €67,400).",
      "tags": { "spine": "ors", "risk": "credit", "crr": "CRR:Art153" }, "version": "Leitfaden-09/2024", "sourceRef": { "module": "m05", "anchor": "m05-s4" } },
    { "id": "m05.viva.hhi", "module": "m05", "type": "viva", "format": "md", "lang": "mix",
      "front": "An examiner asks: the IRB formula already covers credit risk — why does the Leitfaden add an HHI granularity surcharge?",
      "rubric": [
        { "id": "r1", "text": "ASRF assumes an infinitely granular portfolio, so single-name concentration is invisible to the formula", "weight": 1, "required": true },
        { "id": "r2", "text": "Real corporate books are lumpy, so a surcharge UL·HHI captures the extra unexpected loss", "weight": 1, "required": true }
      ],
      "antiPoints": [ "claims the surcharge adds expected loss", "confuses it with the maturity adjustment" ],
      "modelAnswer": "The ASRF model that underlies the IRB formula assumes an infinitely granular portfolio, so by construction it ignores single-name (and sector) concentration. Real corporate books are lumpy, so the Leitfaden bolts on a granularity surcharge UL·HHI to capture the unexpected loss the formula structurally cannot see; the new UL is UL·(1+HHI).",
      "tags": { "spine": "ors", "risk": "credit", "crr": "CRR:Art153" }, "version": "Leitfaden-09/2024", "sourceRef": { "module": "m05", "anchor": "m05-s5-3" } }
  ]
}
```

- [ ] **Step 5: Implement `js/cardlint.js`**

```js
// Pure, zero-dependency card validator mirroring card.schema.json plus deck-level rules.
const ID_RE = /^m[0-9]{2}\.[a-z]+\.[a-z0-9-]+$/;
const TYPES = ['numeric', 'cloze', 'deriveStep', 'discrimination', 'viva', 'freeRecall'];
const SPINES = ['reg', 'ors', 'boundary'];

export function validateCard(card) {
  const e = [];
  if (!card || typeof card !== 'object') return ['card is not an object'];
  if (!ID_RE.test(card.id || '')) e.push(`id "${card.id}" must match module.type.slug (e.g. m05.num.ul)`);
  if (!/^m[0-9]{2}$/.test(card.module || '')) e.push('module must be like m05');
  if (!TYPES.includes(card.type)) e.push(`type "${card.type}" is not one of ${TYPES.join('/')}`);
  if (!card.front) e.push('front is required');
  if (!card.tags || !SPINES.includes(card.tags.spine)) e.push(`tags.spine must be one of ${SPINES.join('/')}`);
  if (!card.version) e.push('version is required');
  if (!card.sourceRef || !card.sourceRef.anchor) e.push('sourceRef.anchor is required');

  if (card.type === 'numeric' && (!card.answer || typeof card.answer.value !== 'number')) e.push('numeric card needs answer.value (a number in base units)');
  if (card.type === 'cloze' && !(Array.isArray(card.blanks) && card.blanks.length)) e.push('cloze card needs blanks[]');
  if (card.type === 'deriveStep' && !(Array.isArray(card.steps) && card.steps.length)) e.push('deriveStep card needs steps[]');
  if (card.type === 'discrimination') {
    if (!['reg', 'ors', 'mixed'].includes(card.verdict)) e.push('discrimination card needs verdict reg/ors/mixed');
    if (!(Array.isArray(card.rubric) && card.rubric.length)) e.push('discrimination card needs a tradeoff rubric[]');
  }
  if (card.type === 'viva' && !(Array.isArray(card.rubric) && card.rubric.length && card.modelAnswer)) e.push('viva card needs rubric[] and modelAnswer');
  return e;
}

const MIX = { numeric: 2, deriveStep: 1, cloze: 2, discrimination: 2, viva: 2 };

export function lintDeck(cards) {
  const out = [];
  const seen = new Set();
  for (const c of cards) {
    const errs = validateCard(c);
    if (seen.has(c.id)) errs.push(`duplicate id "${c.id}"`);
    seen.add(c.id);
    if (errs.length) out.push({ id: c.id, errors: errs });
  }
  // deck-level mandated type mix
  const counts = {};
  for (const c of cards) counts[c.type] = (counts[c.type] || 0) + 1;
  for (const [t, min] of Object.entries(MIX)) {
    if ((counts[t] || 0) < min) out.push({ id: `<deck>`, errors: [`deck needs >= ${min} ${t} cards (has ${counts[t] || 0})`] });
  }
  return out;
}
```

- [ ] **Step 6: Write `_card_brief.md`** (the authoring brief — complete content)

```markdown
# Card authoring brief — Leitfaden Trainer

Cards are the atomic unit. Every card is a *defensible claim*. Two families, graded differently:
- **Computation** (numeric, cloze, deriveStep): objective ground truth, auto-graded.
- **Defense** (discrimination, viva): self-graded against the pre-authored rubric below.

## Ids
`m<NN>.<type-abbr>.<slug>` — immutable once shipped (e.g. `m05.num.ul-extremfall`). A cosmetic edit
keeps the id; a semantically different card mints a new id. type-abbr: num, cloze, deriv, disc, viva, free.

## Required fields (all cards)
`id, module, type, front, tags.spine (reg|ors|boundary), version, sourceRef {module, anchor}`.
`version` stamps the source edition (e.g. `Leitfaden-09/2024`). `sourceRef.anchor` is a section id on the module page.

## Per type
- **numeric**: `answer.value` in BASE UNITS (fractions, not %), optional `tol` (default 0.5% relative) / `absTol` / `unit`.
  Parametrise where possible (regenerate the number) so reps train the method, not the digit. NEVER store a frozen
  digit as the only thing checked when the method can be re-derived.
- **cloze**: `front` carries `{{c1}}` markers; `blanks:[{id, accept:[...], render}]`. Math blanks must be authored
  as inline `\( … \)` fragments or `render:"operator"|"number"|"pick"` — you cannot blank a token inside `$$…$$`.
- **deriveStep**: `steps:[{prompt, kind, expected, explain}]`; the chain is graded once.
- **discrimination**: `verdict (reg|ors|mixed)` + `rubric[]` — the verdict alone never passes; the produced **tradeoff**
  must be ticked. Prefer confusable near-duplicate pairs (e.g. LGD 45% vs 45.5%).
- **viva**: `rubric:[{id, text, weight, required}]` + `antiPoints[]` (disqualifiers, graded first) + `modelAnswer`.
  Missing any `required` point ⇒ Again. Seed verdicts/rebuttals from the Leitfaden text + CRR/EBA expectations.

## The reg/ÖRS spine
Tag every card `reg` (CRR forces it), `ors` (proportionality choice), or `boundary`. Defense cards must produce
the **tradeoff**, not just the label.

## Source status
If a card encodes a known erratum or a post-source rule, add `sourceStatus: matches|erratum|post-source` + `sourceNote`
so a later redraft doesn't "fix" a deliberate deviation back in (e.g. the FX PD 2.95% vs the printed 3.005%).

## Deck mix (enforced by the lint)
Each module deck: ≥2 numeric, ≥1 deriveStep, ≥2 cloze, ≥2 discrimination, ≥2 viva.
```

- [ ] **Step 7: Run to verify all pass**

Run: `node --test test/cardlint.test.js`
Expected: PASS (5 tests). Then `node --test` — whole suite green.

- [ ] **Step 8: Commit**

```bash
git add card.schema.json data/cards/_exemplar.json _card_brief.md js/cardlint.js test/cardlint.test.js
git commit -m "feat(trainer): card contract — schema, exemplar deck, authoring brief, lint"
```

---

## Self-Review

**Spec coverage (P1 portion of spec §6, §7, §14):**
- SM-2-lite fully pinned (states, ease floor, deltas, graduating intervals, growth multipliers, cap, lapse/relearn, leech, overdue credit) → Tasks 1–2. ✓
- Pure/synchronous engine, returns only scheduling fields, no rev/updatedAt stamping → Tasks 1–2 (constraint). ✓
- Interval fuzz, injectable + deterministic, kept out of `grade()` → Task 3. ✓
- Numeric base-units + tolerance + German/English format robustness → Task 4. ✓
- Card schema for all five types + ids + spine vocab + erratum status; authoring brief; card-lint with the mandated type mix; one exemplar per type → Task 5. ✓
- *Deferred to P1b (correctly absent):* `js/queue.js` (eligibility/chains/overdue-ordering/cap/interleave — it consumes `srs`/`applyFuzz`), `study.html` Review UI, "reviews due" badge, the real authored m05 deck.

**Placeholder scan:** every code step has complete code; the exemplar deck and brief are complete content. No TBD/TODO. ✓

**Type consistency:** `grade(sched, g, nowEpoch)`, `newSched()`, `applyFuzz(intervalDays, rng)`, `numericCandidates(str)`, `gradeNumeric(str, answer)`, `validateCard(card)`, `lintDeck(cards)` are consistent between defining tasks and tests. The sched shape (`state, interval, ease, reps, lapses, lastGrade, pending, due`) matches the P0 `emptyState` sched documentation (P0 listed `due, interval, ease, reps, lapses, lastGrade, seenVersion, updatedAt, rev`; P1 adds `pending` and `state` as scheduling fields — note for P1b: the store persists whatever `putSched` is handed, so no schema change is needed, but document `state`/`pending` in `js/state.js`'s comment during P1b). ✓ (flagged the one cross-phase note.)

---

## Next plan (P1b)

`js/queue.js` (pure queue selector: eligibility via injectable `isUnlocked` + prereqs, deriveStep chains indivisible, overdue-ratio ordering, review cap, new-card throttle + daily ledger, deterministic interleave, `applyFuzz` at scheduling time) → `study.html` Review mode (commit-then-reveal, commit-time confidence, keyboard 1–4 grading, a11y) → "reviews due" badge on `index.html` → the authored **m05 deck** (Claude drafts from the module + fact-sheet, **user reviews for domain accuracy**) → re-add the Trainer link in `app.js` now that `study.html` exists.
