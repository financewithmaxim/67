# Leitfaden Trainer — P1b: Review Loop & m05 Deck — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the dormant P0 store + P1 engine into a clickable, spaced **Review** experience over a real m05 deck — `js/queue.js` (the daily queue), `js/grading.js` (per-type answer grading → SRS grade), `study.html` + `js/study.js` (the Review UI: commit → confidence → reveal → grade → persist), a "reviews due" badge, the re-added Trainer link, and the authored `data/cards/m05.json` (Claude-drafted, **user-reviewed for domain accuracy**).

**Architecture:** `queue.js` and `grading.js` are PURE/synchronous (Node-golden-tested), reusing `srs.js`/`normalize.js`. `study.js` is the only DOM module: it `await store.ready()`s (P0), `fetch`es the deck JSON, builds the queue, and drives one card at a time, persisting every grade through `store.putSched(srs.grade(...))` (NEVER `saveState`/`patch` — the P1 invariant) plus `store.appendReview(...)`. `study.html` is a new ES-module page that reuses `css/style.css` and the global `COURSE` (via `course.js`). UI is verified by a precise manual browser smoke (DOM isn't Node-unit-testable); all logic it depends on is in the pure tested modules.

**Tech Stack:** Vanilla JS ES modules, no build step; `fetch` for the static deck JSON; `localStorage` via the P0 store; MathJax (already CDN-loaded on module pages) for `tex` cards.

## Global Constraints

- **No build step.** `study.html` uses `<script type="module" src="js/study.js">` plus a classic `<script src="js/course.js">` for the global `COURSE`. Engine modules stay ES modules.
- **`queue.js` and `grading.js` are PURE/synchronous** — no DOM/storage/`Date.now`/`Math.random`; time and rng are passed in. (`new Date(epoch)` for a UTC date string is allowed in site code.)
- **Persistence invariant (from P1 final review):** an `srs.grade()` result is persisted ONLY via `store.putSched(cardId, result)`. Never `saveState`/`patch` for sched. Confidence is captured at COMMIT (before reveal) and logged via `store.appendReview` — it does NOT affect scheduling.
- **Queue rules:** exclude `suspended` cards regardless of `due`; `new`-state cards have no `due` and are surfaced via the new-card throttle, not the due-scan; cap reviews/session; throttle new cards when the due backlog is large; gate a new card on its `prereq[]` being introduced; honor the UTC-date `newIntroduced` ledger.
- **Card honesty rules (carried from the spec):** answer/model-answer hidden until the learner commits a non-empty response; viva commit is captured and LOCKED on reveal; objective misses (numeric/cloze/deriveStep, and the discrimination verdict) force `again` — the learner cannot self-upgrade a machine-graded miss.
- **m05 deck:** lint-clean against `js/cardlint.js`; the mandated mix (≥2 numeric, ≥1 deriveStep, ≥2 cloze, ≥2 discrimination, ≥2 viva); every card version-stamped `Leitfaden-09/2024`; the FX PD example carries `sourceStatus:"erratum"`; **content reviewed by the user for accuracy before it is trusted.**
- Reuse `css/style.css` tokens; minimal new CSS appended to `style.css` only where the Review UI needs it.

## File Structure

- `js/queue.js` — **create**. Pure. `countDue(snapshot, now)`, `buildQueue({snapshot, cards, now, settings, isUnlocked, rng})`.
- `js/grading.js` — **create**. Pure. `gradeAnswer(card, response)` → `{objective, suggestedGrade, ...}`; `normEq(a,b)`.
- `js/study.js` — **create**. DOM controller for Review mode.
- `study.html` — **create**. The study surface (Review mode in P1b; Drill/Viva/Calibration tabs are P2).
- `data/cards/m05.json` — **create**. The authored m05 deck.
- `index.html` — **modify**. Add a "reviews due (n)" badge.
- `js/app.js` — **modify**. Re-add the Trainer link in the warm-up banner + pass message (now that `study.html` exists).
- `css/style.css` — **modify**. Append a small `.trainer-*` block for the Review card UI.
- `test/queue.test.js`, `test/grading.test.js` — **create**.

> Deferred to P2: Drill / Viva-trainer / Calibration tabs as distinct modes (P1b runs all card types through the one Review queue), the ASRF/IRB widgets (P3), Gist sync/PWA (P4).

---

### Task 1: The review queue (`js/queue.js`)

**Files:**
- Create: `js/queue.js`, `test/queue.test.js`

**Interfaces:**
- Produces: `countDue(snapshot, now): number` (due, non-suspended); `buildQueue({snapshot, cards, now, settings={}, isUnlocked=()=>true, rng=()=>0.5}): {session, due, new, dueCount, newCount}`.

- [ ] **Step 1: Write the failing test** — `test/queue.test.js`

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildQueue, countDue } from '../js/queue.js';
import { emptyState } from '../js/state.js';

const DAY = 86_400_000;
const NOW = 1_700_000_000_000;
function card(id, type = 'numeric', extra = {}) { return { id, module: 'm05', type, front: 'x', tags: { spine: 'reg' }, version: 'v', sourceRef: { module: 'm05', anchor: 'a' }, ...extra }; }
function withSched(state, sched) { const s = emptyState('A'); s.sched = sched; return s; }

test('countDue counts due, non-suspended cards only', () => {
  const s = withSched('A', {
    a: { state: 'review', due: NOW - DAY, interval: 5 },
    b: { state: 'review', due: NOW + DAY, interval: 5 },     // not yet due
    c: { state: 'suspended', due: NOW - DAY, interval: 5 },  // leech excluded
  });
  assert.equal(countDue(s, NOW), 1);
});

test('due cards order by overdue ratio, capped at maxReviewsPerSession', () => {
  const s = withSched('A', {
    a: { state: 'review', due: NOW - 1 * DAY, interval: 10 }, // ratio 0.1
    b: { state: 'review', due: NOW - 8 * DAY, interval: 10 }, // ratio 0.8 (most overdue)
  });
  const cards = [card('a'), card('b')];
  const q = buildQueue({ snapshot: s, cards, now: NOW, settings: { maxReviewsPerSession: 1, newCardsPerDay: 0 } });
  assert.deepEqual(q.due, ['b']);    // most overdue first, capped to 1
});

test('new cards are introduced up to the daily budget when the backlog is small', () => {
  const s = emptyState('A');
  const cards = [card('n1'), card('n2'), card('n3')];
  const q = buildQueue({ snapshot: s, cards, now: NOW, settings: { newCardsPerDay: 2 } });
  assert.equal(q.new.length, 2);
});

test('new-card introduction is throttled to 0 when the due backlog is large', () => {
  const sched = {};
  for (let i = 0; i < 31; i++) sched['d' + i] = { state: 'review', due: NOW - DAY, interval: 5 };
  const s = withSched('A', sched);
  const cards = Object.keys(sched).map(id => card(id)).concat([card('new1')]);
  const q = buildQueue({ snapshot: s, cards, now: NOW, settings: { newCardsPerDay: 5, newThrottleAt: 30 } });
  assert.equal(q.new.length, 0);
});

test('a new card is gated until its prereqs are introduced', () => {
  const s = emptyState('A'); s.sched = {};
  const cards = [card('child', 'numeric', { prereq: ['parent'] }), card('parent')];
  let q = buildQueue({ snapshot: s, cards, now: NOW, settings: { newCardsPerDay: 1 } });
  assert.ok(!q.new.includes('child'));               // parent not yet introduced
  s.sched = { parent: { state: 'review', due: NOW + DAY, interval: 1 } };
  q = buildQueue({ snapshot: s, cards, now: NOW, settings: { newCardsPerDay: 5 } });
  assert.ok(q.new.includes('child'));                // now eligible
});

test('the daily newIntroduced ledger reduces the remaining new budget', () => {
  const s = emptyState('A');
  const today = new Date(NOW).toISOString().slice(0, 10);
  s.newIntroduced = { [today]: 2 };
  const cards = [card('n1'), card('n2')];
  const q = buildQueue({ snapshot: s, cards, now: NOW, settings: { newCardsPerDay: 2 } });
  assert.equal(q.new.length, 0);                     // budget already spent today
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `node --test test/queue.test.js`
Expected: FAIL — `Cannot find module '../js/queue.js'`.

- [ ] **Step 3: Implement `js/queue.js`**

```js
const DAY_MS = 86_400_000;

function utcDate(now) { return new Date(now).toISOString().slice(0, 10); }

// Deterministic interleave: round-robin across type buckets (stable within a bucket).
function interleaveByType(cards) {
  const buckets = new Map();
  for (const c of cards) { if (!buckets.has(c.type)) buckets.set(c.type, []); buckets.get(c.type).push(c); }
  const order = [...buckets.keys()];
  const out = [];
  let added = true;
  while (added) {
    added = false;
    for (const t of order) {
      const b = buckets.get(t);
      if (b.length) { out.push(b.shift()); added = true; }
    }
  }
  return out;
}

export function countDue(snapshot, now) {
  let n = 0;
  for (const s of Object.values(snapshot.sched || {})) {
    if (s.state !== 'suspended' && s.due != null && s.due <= now) n++;
  }
  return n;
}

export function buildQueue({ snapshot, cards, now, settings = {}, isUnlocked = () => true }) {
  const sched = snapshot.sched || {};
  const maxReviews = settings.maxReviewsPerSession ?? 40;
  const newPerDay = settings.newCardsPerDay ?? 12;
  const throttleAt = settings.newThrottleAt ?? 30;
  const byId = new Map(cards.map(c => [c.id, c]));

  // due reviews (introduced, has content, not suspended, due now)
  const due = [];
  for (const [id, s] of Object.entries(sched)) {
    if (!byId.has(id) || s.state === 'suspended' || s.due == null || s.due > now) continue;
    const overdueRatio = (now - s.due) / Math.max(1, (s.interval || 1) * DAY_MS);
    due.push({ id, overdueRatio });
  }
  due.sort((a, b) => b.overdueRatio - a.overdueRatio);
  const dueIds = due.slice(0, maxReviews).map(d => d.id);

  // new cards (throttled when the due backlog is large)
  const introduced = new Set(Object.keys(sched));
  const spentToday = (snapshot.newIntroduced && snapshot.newIntroduced[utcDate(now)]) || 0;
  let newBudget = Math.max(0, newPerDay - spentToday);
  if (due.length > throttleAt) newBudget = 0;

  const eligibleNew = cards.filter(c =>
    !introduced.has(c.id) && isUnlocked(c) && (c.prereq || []).every(p => introduced.has(p))
  );
  const newIds = interleaveByType(eligibleNew).slice(0, newBudget).map(c => c.id);

  return { due: dueIds, new: newIds, session: [...dueIds, ...newIds], dueCount: due.length, newCount: eligibleNew.length };
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `node --test test/queue.test.js`
Expected: PASS (6 tests). Then `node --test` — whole suite green.

- [ ] **Step 5: Commit**

```bash
git add js/queue.js test/queue.test.js
git commit -m "feat(trainer): pure review-queue selector (due/new/throttle/prereq/interleave)"
```

---

### Task 2: Per-type answer grading (`js/grading.js`)

**Files:**
- Create: `js/grading.js`, `test/grading.test.js`

**Interfaces:**
- Consumes: `gradeNumeric` from `js/normalize.js`.
- Produces: `normEq(a, b): boolean` (case/space/umlaut-insensitive equality); `gradeAnswer(card, response): {objective, suggestedGrade, ...}` — `objective` is `true|false` for machine-gradable types, `null` for self-graded viva. Machine misses suggest `again`.

- [ ] **Step 1: Write the failing test** — `test/grading.test.js`

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { gradeAnswer, normEq } from '../js/grading.js';

test('normEq ignores case, surrounding space, and umlaut spelling', () => {
  assert.ok(normEq('Ausfall', ' ausfall '));
  assert.ok(normEq('Größe', 'groesse'));
  assert.ok(!normEq('reg', 'ors'));
});

test('numeric: correct value → objective true → good; wrong → again', () => {
  const card = { type: 'numeric', answer: { value: 67400, tol: 0.01 } };
  assert.deepEqual(gradeAnswer(card, { text: '67.400' }), { objective: true, suggestedGrade: 'good' });
  assert.deepEqual(gradeAnswer(card, { text: '50000' }), { objective: false, suggestedGrade: 'again' });
});

test('cloze: all blanks must match an accepted value', () => {
  const card = { type: 'cloze', blanks: [{ id: 'c1', accept: ['+'] }] };
  assert.equal(gradeAnswer(card, { blanks: { c1: '+' } }).objective, true);
  assert.equal(gradeAnswer(card, { blanks: { c1: '-' } }).objective, false);
});

test('deriveStep: every step must match its expected value', () => {
  const card = { type: 'deriveStep', steps: [{ kind: 'pick', expected: '+' }, { kind: 'pick', expected: 'x = -\\Phi^{-1}(q)' }] };
  assert.equal(gradeAnswer(card, { steps: ['+', 'x = -\\Phi^{-1}(q)'] }).objective, true);
  assert.equal(gradeAnswer(card, { steps: ['-', 'x = -\\Phi^{-1}(q)'] }).objective, false);
});

test('discrimination: verdict is objective; all tradeoff points must be ticked to pass', () => {
  const card = { type: 'discrimination', verdict: 'ors', rubric: ['a', 'b'] };
  const ok = gradeAnswer(card, { verdict: 'ors', ticks: [0, 1] });
  assert.equal(ok.objective, true); assert.equal(ok.suggestedGrade, 'good');
  const wrongVerdict = gradeAnswer(card, { verdict: 'reg', ticks: [0, 1] });
  assert.equal(wrongVerdict.objective, false); assert.equal(wrongVerdict.suggestedGrade, 'again');
  const missedTradeoff = gradeAnswer(card, { verdict: 'ors', ticks: [0] });
  assert.equal(missedTradeoff.suggestedGrade, 'again');
});

test('viva: self-graded (objective null); a missed REQUIRED point or an anti-point forces again', () => {
  const card = { type: 'viva', rubric: [{ id: 'r1', required: true }, { id: 'r2', required: false }], antiPoints: ['x'] };
  assert.equal(gradeAnswer(card, { ticks: [0, 1] }).objective, null);
  assert.equal(gradeAnswer(card, { ticks: [0, 1] }).suggestedGrade, 'good');
  assert.equal(gradeAnswer(card, { ticks: [1] }).suggestedGrade, 'again');          // missed required r1
  assert.equal(gradeAnswer(card, { ticks: [0, 1], antiTicks: [0] }).suggestedGrade, 'again'); // hit a disqualifier
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `node --test test/grading.test.js`
Expected: FAIL — `Cannot find module '../js/grading.js'`.

- [ ] **Step 3: Implement `js/grading.js`**

```js
import { gradeNumeric } from './normalize.js';

export function normEq(a, b) {
  const norm = x => String(x ?? '').trim().toLowerCase()
    .replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss')
    .replace(/\s+/g, ' ');
  return norm(a) === norm(b);
}

export function gradeAnswer(card, response = {}) {
  switch (card.type) {
    case 'numeric': {
      const ok = gradeNumeric(response.text ?? '', card.answer || {});
      return { objective: ok, suggestedGrade: ok ? 'good' : 'again' };
    }
    case 'cloze': {
      const ok = (card.blanks || []).every(b => (b.accept || []).some(a => normEq(a, (response.blanks || {})[b.id])));
      return { objective: ok, suggestedGrade: ok ? 'good' : 'again' };
    }
    case 'deriveStep': {
      const ok = (card.steps || []).every((st, i) => normEq(st.expected, (response.steps || [])[i]));
      return { objective: ok, suggestedGrade: ok ? 'good' : 'again' };
    }
    case 'discrimination': {
      const verdictOk = response.verdict === card.verdict;
      const ticks = response.ticks || [];
      const allTradeoff = (card.rubric || []).every((_, i) => ticks.includes(i));
      const ok = verdictOk && allTradeoff;
      return { objective: ok, suggestedGrade: ok ? 'good' : 'again', verdictOk };
    }
    case 'viva': {
      const ticks = response.ticks || [];
      const rubric = card.rubric || [];
      const missedRequired = rubric.some((r, i) => r.required && !ticks.includes(i));
      const hitAnti = (response.antiTicks || []).length > 0;
      let suggestedGrade;
      if (missedRequired || hitAnti) suggestedGrade = 'again';
      else if (ticks.length === rubric.length) suggestedGrade = 'good';
      else suggestedGrade = 'hard';
      return { objective: null, suggestedGrade, missedRequired, hitAnti };
    }
    default:
      return { objective: null, suggestedGrade: 'good' };
  }
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `node --test test/grading.test.js`
Expected: PASS (6 tests). Then `node --test` — whole suite green.

- [ ] **Step 5: Commit**

```bash
git add js/grading.js test/grading.test.js
git commit -m "feat(trainer): per-type answer grading -> SRS grade (machine-miss forces again)"
```

---

### Task 3: The Review UI (`study.html` + `js/study.js`)

**Files:**
- Create: `study.html`, `js/study.js`
- Modify: `css/style.css` (append a Review-UI block)

**Interfaces:**
- Consumes: `createStore` (`js/store.js`), `newSched`/`grade` (`js/srs.js`), `buildQueue`/`countDue` (`js/queue.js`), `gradeAnswer` (`js/grading.js`). Reads `data/cards/m05.json` via `fetch`.
- Produces: a working Review session — present a card → collect a response → capture confidence → reveal answer/model → grade (machine-miss forces `again`; self-grade ticks for discrimination/viva) → persist via `store.putSched(srs.grade(...))` + `store.appendReview` → next.

> DOM glue is verified by a manual browser smoke (Step 6), not a Node test; all logic it calls is covered by Tasks 1–2 and P1.

- [ ] **Step 1: Create `study.html`**

```html
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Trainer — Review · Leitfaden Früherkennung</title>
<link rel="stylesheet" href="css/style.css">
<script>MathJax={tex:{inlineMath:[['\\(','\\)']],displayMath:[['$$','$$'],['\\[','\\]']]},svg:{fontCache:'global'}};</script>
<script src="https://cdn.jsdelivr.net/npm/mathjax@3/es5/tex-mml-chtml.js" async></script>
<script src="js/course.js"></script>
</head>
<body data-module="study">
<button class="navtoggle" id="navtoggle">☰</button>
<div class="layout">
  <aside class="sidebar" id="sidebar">
    <a href="index.html"><div class="brand">Leitfaden <span class="accent">Früherkennung</span></div></a>
    <div class="subtitle">EU Bank Capital Regulation &amp; Risk Management · Raiffeisen / ÖRS</div>
    <div id="sidebar-nav"></div>
  </aside>
  <main class="content"><div class="page">
    <div class="modhead">
      <div class="crumb"><a href="index.html">Home</a> › Trainer</div>
      <h1>Trainer — <span class="accent">Review</span></h1>
    </div>
    <p class="lead" id="session-summary">Loading your due cards…</p>
    <div id="trainer-root" class="trainer-root"></div>
  </div></main>
</div>
<script type="module" src="js/study.js"></script>
</body>
</html>
```

- [ ] **Step 2: Create `js/study.js`** (complete Review controller)

```js
import { createStore } from './store.js';
import { newSched, grade } from './srs.js';
import { buildQueue } from './queue.js';
import { gradeAnswer } from './grading.js';

const root = document.getElementById('trainer-root');
const summary = document.getElementById('session-summary');
const store = createStore({ storage: window.localStorage });
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const typeset = () => { if (window.MathJax && window.MathJax.typesetPromise) window.MathJax.typesetPromise([root]).catch(() => {}); };

let deck = [], byId = new Map(), session = [], pos = 0;

async function boot() {
  await store.ready();
  try {
    const res = await fetch('data/cards/m05.json', { cache: 'no-cache' });
    deck = (await res.json()).cards || [];
  } catch { summary.textContent = 'Could not load the m05 deck.'; return; }
  byId = new Map(deck.map(c => [c.id, c]));
  const q = buildQueue({ snapshot: store.getState(), cards: deck, now: Date.now(), settings: store.getState().settings });
  session = q.session;
  if (!session.length) { summary.textContent = '🎉 Nothing due right now. Come back when cards are scheduled.'; root.innerHTML = ''; return; }
  pos = 0;
  renderCard();
}

function renderCard() {
  if (pos >= session.length) { summary.textContent = `Session complete — ${session.length} card(s) reviewed.`; root.innerHTML = '<div class="box key"><div class="box-title">Done</div><p>All queued cards reviewed. Spacing will resurface them when due.</p></div>'; return; }
  summary.textContent = `Card ${pos + 1} of ${session.length}`;
  const card = byId.get(session[pos]);
  const spine = card.tags.spine;
  let body = `<div class="trainer-card"><div class="tag ${spine === 'ors' ? 'ors' : 'reg'}" style="margin-bottom:8px">${spine === 'ors' ? 'ÖRS choice' : spine === 'boundary' ? 'boundary' : 'regulatory'}</div>`;
  body += `<div class="trainer-front">${card.front}</div>`;
  body += inputFor(card);
  body += `<div class="trainer-confidence">Confidence before reveal:
    <label><input type="radio" name="conf" value="low">low</label>
    <label><input type="radio" name="conf" value="med" checked>medium</label>
    <label><input type="radio" name="conf" value="high">high</label></div>`;
  body += `<button class="btn" id="commit">Commit &amp; reveal</button>`;
  body += `<div id="reveal"></div></div>`;
  root.innerHTML = body;
  document.getElementById('commit').addEventListener('click', () => commit(card));
  typeset();
}

function inputFor(card) {
  switch (card.type) {
    case 'numeric': return `<input class="trainer-input" id="ans" placeholder="your answer (e.g. 67.400)">`;
    case 'cloze': return (card.blanks || []).map(b => `<input class="trainer-input" data-blank="${b.id}" placeholder="${esc(b.id)}">`).join(' ');
    case 'deriveStep': return (card.steps || []).map((s, i) => `<div class="trainer-step"><div>${esc(s.prompt)}</div><input class="trainer-input" data-step="${i}"></div>`).join('');
    case 'discrimination': return `<div class="trainer-verdict">Verdict:
      <label><input type="radio" name="verdict" value="reg">regulatory</label>
      <label><input type="radio" name="verdict" value="ors">ÖRS</label>
      <label><input type="radio" name="verdict" value="mixed">mixed</label></div>
      <textarea class="trainer-input" id="defense" placeholder="state the tradeoff(s) before revealing"></textarea>`;
    case 'viva': return `<textarea class="trainer-input" id="defense" rows="5" placeholder="write your defense (locked on reveal)"></textarea>`;
    default: return '';
  }
}

function collect(card) {
  switch (card.type) {
    case 'numeric': return { text: document.getElementById('ans').value };
    case 'cloze': { const blanks = {}; root.querySelectorAll('[data-blank]').forEach(el => blanks[el.dataset.blank] = el.value); return { blanks }; }
    case 'deriveStep': { const steps = []; root.querySelectorAll('[data-step]').forEach(el => steps[+el.dataset.step] = el.value); return { steps }; }
    case 'discrimination': { const v = root.querySelector('input[name="verdict"]:checked'); return { verdict: v && v.value, defense: document.getElementById('defense').value, ticks: [] }; }
    case 'viva': return { defense: document.getElementById('defense').value, ticks: [] };
    default: return {};
  }
}

function commit(card) {
  const confidence = (root.querySelector('input[name="conf"]:checked') || {}).value || 'med';
  const response = collect(card);
  const committedText = response.text || response.defense || JSON.stringify(response.blanks || response.steps || '');
  if (!committedText || !committedText.trim()) { alert('Write something before revealing — recognition is not recall.'); return; }
  root.querySelectorAll('.trainer-input, input[name="verdict"], input[name="conf"]').forEach(el => el.setAttribute('disabled', 'true'));
  document.getElementById('commit').remove();
  reveal(card, response, confidence);
}

function reveal(card, response, confidence) {
  const machine = gradeAnswer(card, response);
  const rv = document.getElementById('reveal');
  let html = '<hr>';
  if (machine.objective === true) html += `<div class="box german"><div class="box-title">✓ Correct</div></div>`;
  else if (machine.objective === false) html += `<div class="box trap"><div class="box-title">✗ Not correct — graded "Again"</div></div>`;

  if (card.type === 'numeric') html += `<p><strong>Answer:</strong> ${esc(String(card.answer.value))}${card.answer.unit ? ' ' + esc(card.answer.unit) : ''}</p>`;
  if (card.type === 'cloze') html += `<p><strong>Blanks:</strong> ${(card.blanks || []).map(b => esc((b.accept || [])[0])).join(', ')}</p>`;
  if (card.type === 'deriveStep') html += (card.steps || []).map(s => `<p><strong>Step:</strong> ${esc(s.expected)} — <em>${esc(s.explain || '')}</em></p>`).join('');
  if (card.type === 'discrimination') html += `<p><strong>Verdict:</strong> ${esc(card.verdict)}. ${machine.verdictOk ? '' : '<span class="tag" style="background:var(--red);color:#fff">verdict miss → Again</span>'}</p>` + rubricTicks(card.rubric, 'tradeoff points you made');
  if (card.type === 'viva') { html += `<div class="box key"><div class="box-title">Model answer</div><p>${esc(card.modelAnswer)}</p></div>` + rubricTicks(card.rubric.map(r => r.text), 'points you hit'); if ((card.antiPoints || []).length) html += antiTicks(card.antiPoints); }
  if (card.caveat) html += `<div class="box verify"><div class="box-title">⚑ Verify</div><p>${esc(card.caveat)}</p></div>`;

  html += gradeButtons(card, machine);
  rv.innerHTML = html;
  rv.querySelectorAll('button[data-grade]').forEach(b => b.addEventListener('click', () => finish(card, b.dataset.grade, confidence, response, machine)));
  typeset();
}

function rubricTicks(items, label) {
  return `<p style="margin-top:8px"><strong>${esc(label)}:</strong></p><div id="rubric">` +
    (items || []).map((t, i) => `<label class="trainer-tick"><input type="checkbox" data-tick="${i}"> ${esc(typeof t === 'string' ? t : t.text)}</label>`).join('') + `</div>`;
}
function antiTicks(items) {
  return `<p style="margin-top:8px;color:var(--red)"><strong>Disqualifiers — tick any you committed:</strong></p>` +
    items.map((t, i) => `<label class="trainer-tick"><input type="checkbox" data-anti="${i}"> ${esc(t)}</label>`).join('');
}
function gradeButtons(card, machine) {
  // Machine-graded miss is locked to Again; self-graded types let the learner pick after ticking.
  if (machine.objective === false) return `<div class="trainer-grades"><button class="btn" data-grade="again">Again (machine-graded miss)</button></div>`;
  if (machine.objective === true) return `<div class="trainer-grades">
    <button class="btn secondary" data-grade="hard">Hard</button>
    <button class="btn" data-grade="good">Good</button>
    <button class="btn" data-grade="easy">Easy</button></div>`;
  // self-graded (viva): grade derived from ticks at finish; offer the honest set
  return `<div class="trainer-grades">
    <button class="btn secondary" data-grade="again">Again</button>
    <button class="btn secondary" data-grade="hard">Hard</button>
    <button class="btn" data-grade="good">Good</button></div>`;
}

function finish(card, chosen, confidence, response, machine) {
  // recompute self-grade ticks for discrimination/viva
  const ticks = [...root.querySelectorAll('input[data-tick]:checked')].map(el => +el.dataset.tick);
  const antiTicksArr = [...root.querySelectorAll('input[data-anti]:checked')].map(el => +el.dataset.anti);
  let g = chosen;
  if (machine.objective === false) g = 'again';                       // locked
  if (card.type === 'viva' || card.type === 'discrimination') {
    const self = gradeAnswer(card, { ...response, ticks, antiTicks: antiTicksArr });
    if (self.suggestedGrade === 'again') g = 'again';                 // missed required / anti-point / verdict
  }
  const prev = store.getState().sched[card.id] || newSched();
  store.putSched(card.id, grade(prev, g, Date.now()));
  store.appendReview({ cardId: card.id, grade: g, confidence, objective: machine.objective, pointsHit: ticks.length });
  pos++;
  renderCard();
}

boot();
```

- [ ] **Step 3: Append the Review-UI CSS to `css/style.css`**

```css
/* ---------- Trainer (Review UI) ---------- */
.trainer-card { background: var(--bg-card); border: 1px solid var(--line-strong); border-radius: var(--radius); padding: 22px 24px; box-shadow: var(--shadow); }
.trainer-front { font-size: 19px; line-height: 1.6; margin: 6px 0 16px; }
.trainer-input { font-family: var(--font); width: 100%; max-width: 420px; padding: 10px 14px; font-size: 16px; border: 1px solid var(--line-strong); border-radius: var(--radius-sm); margin: 6px 0; background: #fff; }
textarea.trainer-input { max-width: 100%; }
.trainer-step { margin: 10px 0; }
.trainer-confidence, .trainer-verdict { font-family: var(--font); font-size: 14px; color: var(--ink-soft); margin: 12px 0; display: flex; gap: 14px; flex-wrap: wrap; align-items: center; }
.trainer-grades { display: flex; gap: 10px; margin-top: 14px; flex-wrap: wrap; }
.trainer-tick { display: block; font-family: var(--font); font-size: 14.5px; margin: 6px 0; cursor: pointer; }
.trainer-tick input { margin-right: 8px; }
```

- [ ] **Step 4: Sanity-load the modules in Node (catches syntax/import errors without a browser)**

Run:
```bash
node -e "import('./js/study.js').catch(e => { if (!/document is not defined|Cannot read properties of null/.test(String(e))) { console.error('UNEXPECTED', e); process.exit(1); } console.log('study.js imports OK (DOM access expected to fail headless)'); })"
node --check js/study.js && echo "study.js syntax OK"
```
Expected: both print OK (the DOM error is expected headless; a *syntax/import* error is not).

- [ ] **Step 5: Commit**

```bash
git add study.html js/study.js css/style.css
git commit -m "feat(trainer): Review UI — commit/confidence/reveal/grade over the queue"
```

- [ ] **Step 6: Manual browser smoke (controller performs after the deck lands in Task 5)**

Open `study.html` in a browser with the m05 deck present:
- The first card renders with its reg/ÖRS tag and MathJax typeset.
- The reveal is blocked until you type/commit a non-empty response; confidence is captured before reveal.
- A numeric miss is locked to "Again"; a correct numeric offers Hard/Good/Easy.
- A viva shows the model answer + rubric ticks only after commit; missing a required point forces Again.
- Grading advances to the next card; reload shows fewer due (state persisted); `localStorage.leitfaden_state_v2` has new `sched`/`reviews`.

---

### Task 4: "Reviews due" badge + re-add the Trainer link

**Files:**
- Modify: `index.html` (badge), `js/app.js` (re-add the Trainer link in the warm-up banner + pass message)

**Interfaces:** none new — `index.html` adds a small module script that hydrates a due-count badge via the store + `countDue`.

- [ ] **Step 1: Add the badge to `index.html`** — inside the hero, after the existing `progress-wrap` block, add:

```html
      <div id="reviews-due-badge" style="margin-top:14px"></div>
```

And before the closing `</body>`, after the existing `<script src="js/app.js"></script>` and the curriculum IIFE, add a module script:

```html
<script type="module">
  import { createStore } from './js/store.js';
  import { countDue } from './js/queue.js';
  const store = createStore({ storage: window.localStorage });
  await store.ready();
  const n = countDue(store.getState(), Date.now());
  const el = document.getElementById('reviews-due-badge');
  if (el) el.innerHTML = n > 0
    ? `<a class="btn" href="study.html">Review ${n} card${n === 1 ? '' : 's'} due →</a>`
    : `<a class="btn secondary" href="study.html">Open the Trainer</a>`;
</script>
```

- [ ] **Step 2: Re-add the Trainer link in `js/app.js` `renderQuiz`** — replace the P0 "(coming soon)" banner line:

FIND:
```js
  let html = `<div class="disclaimer" style="border-left-color:var(--accent)"><strong>Warm-up only.</strong> This multiple-choice check tests recognition; it no longer marks the module complete. Durable, board-defensible recall comes from spaced practice in the Trainer (coming soon).</div>`;
```
REPLACE WITH:
```js
  const trainerHref = location.pathname.includes("/modules/") ? "../study.html" : "study.html";
  let html = `<div class="disclaimer" style="border-left-color:var(--accent)"><strong>Warm-up only.</strong> This multiple-choice check tests recognition; it no longer marks the module complete. Durable, board-defensible recall comes from spaced practice in the <a href="${trainerHref}">Trainer</a>.</div>`;
```

- [ ] **Step 3: Re-add the link in the `gradeQuiz` success message** — FIND:
```js
    res.innerHTML = `✓ ${correct}/${total} correct — warm-up cleared (recognition check passed). Spaced practice in the Trainer is coming soon.`;
```
REPLACE WITH:
```js
    res.innerHTML = `✓ ${correct}/${total} correct — warm-up cleared. Lock it in with spaced practice in the <a href="${location.pathname.includes("/modules/") ? "../study.html" : "study.html"}">Trainer</a>.`;
```

- [ ] **Step 4: Verify links resolve and the badge script parses**

Run:
```bash
node --check js/app.js && echo "app.js OK"
test -f study.html && echo "study.html exists (links resolve)"
grep -c "study.html" js/app.js   # expect 2 (banner + pass message)
```

- [ ] **Step 5: Manual check** — open `index.html` (badge shows "Open the Trainer" when nothing is due, "Review N due" after a session) and a module page (warm-up banner links to the Trainer and resolves).

- [ ] **Step 6: Commit**

```bash
git add index.html js/app.js
git commit -m "feat(trainer): reviews-due badge on home + re-add Trainer links"
```

---

### Task 5: Author the m05 deck (`data/cards/m05.json`)

**Files:**
- Create: `data/cards/m05.json`

**Interfaces:** the deck is consumed by `study.js` (Task 3) and the badge; it must lint-clean against `js/cardlint.js`.

> This is the **content** task. The controller drafts the deck from `modules/m05.html` + the master fact-sheet in `_authoring_brief.md`, following `_card_brief.md`. It is then **presented to the user for domain-accuracy review** before being trusted. Drafting may be done with a research/fan-out workflow; the gate below is objective.

- [ ] **Step 1: Draft `data/cards/m05.json`** — a deck of ~12–16 cards anchored to real m05 content, hitting the mandated mix (≥2 numeric, ≥1 deriveStep, ≥2 cloze, ≥2 discrimination, ≥2 viva). Required coverage (each a "defensible claim"):
  - **numeric:** UL Extremfall (€67,400) and UL Problemfall (€15,520) from the worked example; the asset correlation R for PD=1.3669% (≈0.1806); the conditional PD (≈16.18%).
  - **cloze:** the sign in the conditional-PD numerator (`+`); the quantiles Φ⁻¹(0.999)=3.0902 and Φ⁻¹(0.95)=1.6449; the asset-correlation bounds 0.12/0.24.
  - **deriveStep:** the worst-case-factor substitution → sign flip (x = −Φ⁻¹(q) → `+√R·Φ⁻¹(q)`).
  - **discrimination:** M=2.5 (ÖRS), R(PD) curve (reg), the 12.5 RWA factor (reg), LGD 45% vs pooled 45.5% (reg vs ÖRS boundary).
  - **viva:** why 95% vs 99.9% (Problemfall); why the HHI granularity surcharge exists; the FX PD-elasticity 1.9 **with the printed-example erratum** (`sourceStatus:"erratum"`, `sourceNote` explaining 273%/3.005% inconsistency).
  - Every card: `version:"Leitfaden-09/2024"`, a `sourceRef.anchor` like `m05-s4`, correct `tags.spine`.

- [ ] **Step 2: Lint gate (must pass before review)**

Run:
```bash
node -e "
import('./js/cardlint.js').then(async ({ lintDeck }) => {
  const fs = await import('node:fs');
  const deck = JSON.parse(fs.readFileSync('data/cards/m05.json','utf8'));
  const errs = lintDeck(deck.cards);
  if (errs.length) { console.error(JSON.stringify(errs,null,2)); process.exit(1); }
  console.log('m05 deck lint-clean:', deck.cards.length, 'cards');
});"
```
Expected: `m05 deck lint-clean: N cards` (N ≥ 12). If it errors, fix the deck and re-run.

- [ ] **Step 3: Numeric golden check** — confirm the numeric cards' stored `answer.value`s are the real figures (67400, 15520, 0.1806±, 0.1618±) in base units, and that `gradeNumeric` accepts the canonical strings:

```bash
node -e "
import('./js/grading.js').then(async ({ gradeAnswer }) => {
  const fs = await import('node:fs');
  const deck = JSON.parse(fs.readFileSync('data/cards/m05.json','utf8'));
  for (const c of deck.cards.filter(c=>c.type==='numeric')) {
    const ok = gradeAnswer(c, { text: String(c.answer.value) }).objective;
    console.log(c.id, ok ? 'OK' : 'SELF-CHECK FAILED');
    if (!ok) process.exit(1);
  }
});"
```

- [ ] **Step 4: Commit (deck is provisional pending user review)**

```bash
git add data/cards/m05.json
git commit -m "feat(trainer): draft m05 deck (provisional — pending domain-accuracy review)"
```

- [ ] **Step 5: Present to the user for domain-accuracy review** — the controller surfaces the drafted cards (values, verdicts, rubrics, the flagged erratum) and asks the user to confirm or correct before the deck is considered trusted. Corrections are applied as follow-up commits.

---

## Self-Review

**Spec coverage (P1b portion of spec §7.2, §8, §9, §14):**
- Review queue (eligibility, suspended-exclusion, overdue order, cap, new throttle, prereq, daily ledger) → Task 1. ✓
- Generative grading per type; machine-miss forces Again; commit-time confidence (logged, not scheduling) → Tasks 2, 3. ✓
- Review UI: commit→confidence→reveal→grade, locked viva, self-grade ticks, persistence via `putSched` (the P1 invariant) + `appendReview` → Task 3. ✓
- Reviews-due badge + re-added Trainer link (closing the P0 "coming soon") → Task 4. ✓
- The m05 deck, lint-gated + numeric-self-checked + user-reviewed → Task 5. ✓
- *Deferred (correctly):* Drill/Viva/Calibration as separate modes, ASRF/IRB widgets + reading segmentation (P3), Gist sync/PWA (P4).

**Placeholder scan:** Tasks 1–4 contain complete code/commands. Task 5 is a content task whose objective gate (lint + numeric self-check + user review) is fully specified; the exact card prose is authored during execution, not pre-baked — appropriate for content. ✓

**Type consistency:** `buildQueue({snapshot,cards,now,settings,isUnlocked})`, `countDue(snapshot,now)`, `gradeAnswer(card,response)`, `normEq`, and the `store.putSched(grade(prev,g,now))` call all match their P0/P1 definitions. `study.js` persists only via `putSched` (honoring the P1 final-review invariant). ✓

---

## Next plan (P2)

Split the single Review queue into dedicated **Drill** (reg/ÖRS interleave), **Viva trainer**, and **Calibration** (confidently-wrong dashboard, machine-graded headline + self-reported panel) tabs; then P3 (ASRF/IRB widgets + m05 reading segmentation/anchors/readiness rollup) and P4 (Gist sync + PWA).
