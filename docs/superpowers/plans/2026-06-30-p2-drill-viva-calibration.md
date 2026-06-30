# Leitfaden Trainer — P2: Drill / Viva / Calibration — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Split the single Review surface into four tabbed modes — **Review** (the spaced queue, existing), **Reg/ÖRS Drill** (focused discrimination practice), **Viva** (focused defense practice), and **Calibration** (a read-only dashboard surfacing confidently-wrong items, accuracy, due/leech counts, with a separate self-reported viva panel) — so the spine drill and viva trainer the council prescribed exist as first-class modes.

**Architecture:** The calibration analytics become a PURE, Node-tested module `js/calibration.js` (`computeCalibration(state, now)`); the DOM stays in `study.js`. The three card-flow modes (Review/Drill/Viva) reuse the existing `renderCard`/`commit`/`reveal`/`finish` pipeline unchanged — they differ only in which card ids feed `startSession()`. Calibration is read-only (no card flow). A static tab bar in `study.html` is wired in `study.js`.

**Tech Stack:** Vanilla JS ES modules, no build step; Node `node --test`.

## Global Constraints

- **No build step.** `js/calibration.js` is a PURE ES module (no DOM/storage/`Date.now`/`Math.random`; `now` passed in). DOM lives only in `study.js`.
- **Reuse the existing card pipeline.** Review/Drill/Viva all go through the existing `renderCard`/`commit`/`reveal`/`finish`; grading persists via `store.putSched(grade(...))` + `store.appendReview` exactly as in P1b (the P1 persistence invariant). Do NOT fork the grading flow per mode.
- **Calibration is read-only** — it renders metrics from `store.getState()`, never writes. The headline accuracy is computed from **machine-graded** reviews only (`objective === true|false`); self-graded viva reviews (`objective == null`) appear in a separate, labelled panel so leniency can't inflate the headline.
- **"Confidently wrong"** = a review with `confidence === 'high'` AND `objective === false` (a machine miss made with high confidence) — the viva failure mode to hunt.
- Reuse `css/style.css` tokens; append only a small `.trainer-tabs`/`.cal-*` block.
- Carry forward all P0/P1/P1b invariants.

## File Structure

- `js/calibration.js` — **create**. Pure. `computeCalibration(state, now)`.
- `test/calibration.test.js` — **create**.
- `study.html` — **modify**. Add a tab bar above `#trainer-root`.
- `js/study.js` — **modify**. Mode routing (`setMode`), mode card selectors, `renderCalibration`, tab wiring; refactor `boot()` to start in Review via the router.
- `css/style.css` — **modify**. Append `.trainer-tabs`/`.trainer-tab`/`.cal-*`.

> Deferred to P3/P4 (correctly absent): ASRF/IRB widgets + reading segmentation (P3); Gist sync + PWA (P4); cross-mode same-day double-advance guard (note as a known limitation — each mode shows a card once per session, so there is no intra-session double count).

---

### Task 1: Calibration analytics (`js/calibration.js`)

**Files:**
- Create: `js/calibration.js`, `test/calibration.test.js`

**Interfaces:**
- Produces: `computeCalibration(state, now): {reviewed, machineGraded, accuracy, confidentlyWrong, vivaSelfReported, dueNow, suspended}`. `accuracy` is `null` when there are no machine-graded reviews. `confidentlyWrong` and `vivaSelfReported` are arrays of `{cardId, ts, ...}`.

- [ ] **Step 1: Write the failing test** — `test/calibration.test.js`

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeCalibration } from '../js/calibration.js';
import { emptyState } from '../js/state.js';

const NOW = 1_700_000_000_000;
const DAY = 86_400_000;

test('empty state yields zeros and null accuracy', () => {
  const c = computeCalibration(emptyState('A'), NOW);
  assert.equal(c.reviewed, 0);
  assert.equal(c.machineGraded, 0);
  assert.equal(c.accuracy, null);
  assert.deepEqual(c.confidentlyWrong, []);
  assert.deepEqual(c.vivaSelfReported, []);
  assert.equal(c.dueNow, 0);
  assert.equal(c.suspended, 0);
});

test('accuracy counts only machine-graded reviews (objective true/false), not viva (null)', () => {
  const s = emptyState('A');
  s.reviews = [
    { id: 'r1', cardId: 'm05.num.a', ts: NOW, grade: 'good', confidence: 'high', objective: true },
    { id: 'r2', cardId: 'm05.num.b', ts: NOW, grade: 'again', confidence: 'high', objective: false },
    { id: 'r3', cardId: 'm05.viva.x', ts: NOW, grade: 'good', confidence: 'low', objective: null },
  ];
  const c = computeCalibration(s, NOW);
  assert.equal(c.reviewed, 3);
  assert.equal(c.machineGraded, 2);
  assert.equal(c.accuracy, 0.5);              // 1 of 2 machine-graded correct
});

test('confidently-wrong = high confidence AND machine miss', () => {
  const s = emptyState('A');
  s.reviews = [
    { id: 'r1', cardId: 'm05.num.a', ts: NOW, grade: 'again', confidence: 'high', objective: false }, // counts
    { id: 'r2', cardId: 'm05.num.b', ts: NOW, grade: 'again', confidence: 'low', objective: false },  // not high conf
    { id: 'r3', cardId: 'm05.num.c', ts: NOW, grade: 'good', confidence: 'high', objective: true },   // not a miss
  ];
  const c = computeCalibration(s, NOW);
  assert.deepEqual(c.confidentlyWrong.map(x => x.cardId), ['m05.num.a']);
});

test('viva reviews are self-reported separately, never in the headline', () => {
  const s = emptyState('A');
  s.reviews = [{ id: 'r1', cardId: 'm05.viva.x', ts: NOW, grade: 'hard', confidence: 'high', objective: null }];
  const c = computeCalibration(s, NOW);
  assert.equal(c.machineGraded, 0);
  assert.equal(c.accuracy, null);
  assert.deepEqual(c.vivaSelfReported.map(x => x.cardId), ['m05.viva.x']);
  assert.equal(c.vivaSelfReported[0].grade, 'hard');
});

test('dueNow and suspended come from sched state', () => {
  const s = emptyState('A');
  s.sched = {
    a: { state: 'review', due: NOW - DAY, interval: 5 },   // due
    b: { state: 'review', due: NOW + DAY, interval: 5 },   // not due
    c: { state: 'suspended', due: NOW - DAY, interval: 5 },// leech, not counted as due
  };
  const c = computeCalibration(s, NOW);
  assert.equal(c.dueNow, 1);
  assert.equal(c.suspended, 1);
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `node --test test/calibration.test.js`
Expected: FAIL — `Cannot find module '../js/calibration.js'`.

- [ ] **Step 3: Implement `js/calibration.js`**

```js
// Pure calibration analytics over the reviews stream + sched. No I/O; `now` is passed in.
export function computeCalibration(state, now) {
  const reviews = state.reviews || [];
  const sched = state.sched || {};

  const machine = reviews.filter(r => r.objective === true || r.objective === false);
  const correct = machine.filter(r => r.objective === true).length;
  const accuracy = machine.length ? correct / machine.length : null;

  const confidentlyWrong = reviews
    .filter(r => r.confidence === 'high' && r.objective === false)
    .map(r => ({ cardId: r.cardId, ts: r.ts }));

  const vivaSelfReported = reviews
    .filter(r => r.objective == null)
    .map(r => ({ cardId: r.cardId, confidence: r.confidence, grade: r.grade, ts: r.ts }));

  let dueNow = 0, suspended = 0;
  for (const s of Object.values(sched)) {
    if (s.state === 'suspended') suspended++;
    else if (s.due != null && s.due <= now) dueNow++;
  }

  return {
    reviewed: reviews.length,
    machineGraded: machine.length,
    accuracy,
    confidentlyWrong,
    vivaSelfReported,
    dueNow,
    suspended,
  };
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `node --test test/calibration.test.js`
Expected: PASS (5 tests). Then `node --test` — whole suite green.

- [ ] **Step 5: Commit**

```bash
git add js/calibration.js test/calibration.test.js
git commit -m "feat(trainer): pure calibration analytics (machine-graded headline + self-reported viva)"
```

---

### Task 2: Tabbed modes + Calibration dashboard (`study.html`, `js/study.js`, `css/style.css`)

**Files:**
- Modify: `study.html` (tab bar), `js/study.js` (routing + selectors + renderCalibration + boot refactor + import), `css/style.css` (append tab + cal styles)

**Interfaces:**
- Consumes: `computeCalibration` (calibration.js); existing `buildQueue`, `renderCard`, `finish`, `store`, `byId`, `deck`, `session`, `pos`, `summary`, `root`, `esc` already in `study.js`.
- Produces: a 4-tab Trainer (Review/Drill/Viva/Calibration). Review/Drill/Viva reuse the card pipeline; Calibration renders read-only metrics.

> DOM glue — verified by `node --check`/import + a manual browser smoke (Step 6).

- [ ] **Step 1: Add the tab bar to `study.html`**

After the `<p class="lead" id="session-summary">…</p>` line and before `<div id="trainer-root" …>`, insert:

```html
    <div class="trainer-tabs" id="trainer-tabs">
      <button class="trainer-tab active" data-mode="review">Review</button>
      <button class="trainer-tab" data-mode="drill">Reg/ÖRS Drill</button>
      <button class="trainer-tab" data-mode="viva">Viva</button>
      <button class="trainer-tab" data-mode="calibration">Calibration</button>
    </div>
```

- [ ] **Step 2: Add the import + mode state to `js/study.js`**

Add to the imports at the top:

```js
import { computeCalibration } from './calibration.js';
```

Add a module-level mode variable near the other `let` declarations (`let deck = [], byId = new Map(), session = [], pos = 0;`):

```js
let mode = 'review';
```

- [ ] **Step 3: Add the router, selectors, and calibration view to `js/study.js`**

Add these functions (place them after `renderCard` / before `boot`):

```js
function startSession(ids) { session = ids; pos = 0; renderCard(); }

function reviewIds() {
  const q = buildQueue({ snapshot: store.getState(), cards: deck, now: Date.now(), settings: store.getState().settings });
  return q.session;
}
function drillIds() { return deck.filter(c => c.type === 'discrimination').map(c => c.id); }
function vivaIds() { return deck.filter(c => c.type === 'viva').map(c => c.id); }

function emptyMsg(m) {
  return m === 'drill' ? 'No discrimination cards in this deck yet.'
    : m === 'viva' ? 'No viva cards in this deck yet.'
    : '🎉 Nothing due right now. Come back when cards are scheduled.';
}

function setMode(m) {
  mode = m;
  document.querySelectorAll('.trainer-tab').forEach(t => t.classList.toggle('active', t.dataset.mode === m));
  if (m === 'calibration') { renderCalibration(); return; }
  const ids = m === 'drill' ? drillIds() : m === 'viva' ? vivaIds() : reviewIds();
  if (!ids.length) { summary.textContent = emptyMsg(m); root.innerHTML = ''; return; }
  startSession(ids);
}

function renderCalibration() {
  const c = computeCalibration(store.getState(), Date.now());
  summary.textContent = 'Calibration — where confidence and accuracy diverge';
  const acc = c.accuracy == null ? '—' : Math.round(c.accuracy * 100) + '%';
  let html = `<div class="trainer-card"><div class="cal-grid">
    <div class="cal-stat"><div class="cal-num">${c.reviewed}</div><div class="cal-lbl">reviews logged</div></div>
    <div class="cal-stat"><div class="cal-num">${acc}</div><div class="cal-lbl">machine-graded accuracy</div></div>
    <div class="cal-stat"><div class="cal-num">${c.dueNow}</div><div class="cal-lbl">due now</div></div>
    <div class="cal-stat"><div class="cal-num">${c.suspended}</div><div class="cal-lbl">suspended (leeches)</div></div>
  </div>`;
  html += `<h3>Confidently wrong</h3>`;
  html += c.confidentlyWrong.length
    ? `<ul>${c.confidentlyWrong.map(x => `<li><code>${esc(x.cardId)}</code></li>`).join('')}</ul>`
    : `<p style="color:var(--ink-faint)">None — high-confidence answers that turned out wrong land here (the viva failure mode to hunt).</p>`;
  html += `<h3>Self-reported (viva)</h3>`;
  html += c.vivaSelfReported.length
    ? `<ul>${c.vivaSelfReported.map(x => `<li><code>${esc(x.cardId)}</code> — confidence ${esc(x.confidence || '?')}, self-grade ${esc(x.grade || '?')}</li>`).join('')}</ul>`
    : `<p style="color:var(--ink-faint)">No viva attempts yet. These are self-scored, shown separately so they never inflate the headline accuracy.</p>`;
  html += `</div>`;
  root.innerHTML = html;
}
```

- [ ] **Step 4: Refactor `boot()` to route through `setMode`**

In `js/study.js`, find the tail of `boot()` that currently builds the review session directly. It looks like:

```js
  const q = buildQueue({ snapshot: store.getState(), cards: deck, now: Date.now(), settings: store.getState().settings });
  session = q.session;
  if (!session.length) { summary.textContent = '🎉 Nothing due right now. Come back when cards are scheduled.'; root.innerHTML = ''; return; }
  pos = 0;
  renderCard();
```

Replace that block with tab wiring + a default-mode start:

```js
  document.querySelectorAll('.trainer-tab').forEach(t => t.addEventListener('click', () => setMode(t.dataset.mode)));
  setMode('review');
```

(If `buildSidebar()` is called at the top of `boot()` from the P1b sidebar fix, leave it untouched.)

- [ ] **Step 5: Append the tab + calibration CSS to `css/style.css`**

```css
/* ---------- Trainer tabs + calibration ---------- */
.trainer-tabs { display: flex; gap: 6px; flex-wrap: wrap; margin: 4px 0 18px; border-bottom: 1px solid var(--line); }
.trainer-tab {
  font-family: var(--font); font-size: 14px; font-weight: 600; cursor: pointer;
  background: none; border: none; color: var(--ink-faint);
  padding: 9px 14px; border-bottom: 2px solid transparent; margin-bottom: -1px;
}
.trainer-tab:hover { color: var(--brand-2); }
.trainer-tab.active { color: var(--brand); border-bottom-color: var(--accent); }
.cal-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 14px; margin-bottom: 10px; }
.cal-stat { background: var(--bg-sunk); border: 1px solid var(--line); border-radius: var(--radius-sm); padding: 14px 16px; }
.cal-num { font-family: var(--font); font-size: 26px; font-weight: 800; color: var(--brand); line-height: 1.1; }
.cal-lbl { font-family: var(--font); font-size: 12.5px; color: var(--ink-faint); margin-top: 4px; }
```

- [ ] **Step 6: Verify (Node) and commit**

Run:
```bash
node --check js/study.js && echo "study.js syntax OK"
node -e "import('./js/study.js').catch(e => { if (!/document is not defined|Cannot read properties of null|addEventListener/.test(String(e))) { console.error('UNEXPECTED', e); process.exit(1); } console.log('imports OK'); })"
grep -c "data-mode" study.html        # expect 4
grep -c "function setMode" js/study.js # expect 1
node --test                            # whole suite green
```
Expected: all OK.

```bash
git add study.html js/study.js css/style.css
git commit -m "feat(trainer): Drill / Viva / Calibration tabs over the Review engine"
```

- [ ] **Step 7: Manual browser smoke (controller drives via the run skill)**

Serve the site and open `study.html`:
- Four tabs render; **Review** active by default.
- **Reg/ÖRS Drill** shows only discrimination cards (verdict + tradeoff flow); a correct verdict can earn Good.
- **Viva** shows only viva cards (commit textarea → model answer + rubric ticks).
- **Calibration** shows the stat grid (reviews, accuracy, due, suspended), a "Confidently wrong" list, and a separate "Self-reported (viva)" panel — and it renders even before any reviews (empty states).
- Switching tabs rebuilds cleanly; grading in Drill/Viva persists (reload reflects it).

---

## Self-Review

**Spec coverage (P2 portion of spec §9):**
- Reg/ÖRS Drill (interleaved discrimination practice) → Task 2 (`drillIds` + reuse pipeline). ✓
- Viva trainer as its own mode → Task 2 (`vivaIds`). ✓
- Calibration dashboard: machine-graded headline + separate self-reported viva panel + confidently-wrong + due/leech counts → Tasks 1, 2. ✓
- Reuses the existing grade pipeline + persistence invariant (no per-mode fork) → Task 2 (constraint). ✓
- *Deferred (correctly):* P3 widgets/reading, P4 sync/PWA, cross-mode same-day double-advance guard (noted).

**Placeholder scan:** Tasks 1–2 give complete code; Task 2 integration points reference the real `study.js` structure (boot tail, `let` decls, imports). No TBDs.

**Type consistency:** `computeCalibration(state, now)` matches its tests; `setMode`/`startSession`/`reviewIds`/`drillIds`/`vivaIds`/`renderCalibration` are internally consistent; selectors return id arrays consumed by the existing `renderCard` via `byId.get(session[pos])`.

---

## Next plan (P3)

The interactive Predict-Observe-Explain widgets (ASRF conditional-PD explorer, Problemfall↔Extremfall toggle, transparent IRB calculator with golden tests, step-gated derivation) embedded in `modules/m05.html`, plus the m05 reading-redesign (segmentation on conceptual seams, section anchors matching the deck's `sourceRef`, and the readiness rollup from card schedules).
