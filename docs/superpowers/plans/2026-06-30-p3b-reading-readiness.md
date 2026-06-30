# Leitfaden Trainer — P3b: Reading Micro-Path & Readiness Rollup — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make progress legible and the dense reading digestible — a **readiness rollup** (per-module readiness derived from card schedules) shown on the home curriculum grid, and a reusable **reading micro-path** (sticky section nav + a self-explanation checkpoint between segments) embedded in m05.

**Architecture:** A pure, Node-tested `js/readiness.js` (`cardsByModule` + `moduleReadiness`) derives a per-module band from the existing `sched` — no engine change. `index.html` gets a small module script that loads the manifest + decks + state, computes readiness, and overlays the curriculum grid's existing `[data-modstatus]` spans + the hero meter (replacing the legacy boolean signal now that decks span the course). A reusable `js/widgets/micropath.js` reads the page's numbered `<h2>` sections, renders a sticky progress nav, and inserts a self-explanation checkpoint after each section (persisted in a separate `leitfaden_reading_v1` localStorage key) — embedded in `modules/m05.html` first, non-destructively (it does not touch the existing content/widgets/quiz).

**Tech Stack:** Vanilla JS ES modules, no build step; Node `node --test`.

## Global Constraints

- **No build step.** `js/readiness.js` is a PURE ES module (no DOM/storage/`Date.now`; `now` passed in). The index overlay + micro-path are DOM, verified by browser smoke.
- **Readiness is derived from `sched`**, per the spec (not the stored `modules.readiness`, which was only a deck-less fallback). Bands: `not-started` (no cards introduced) · `learning` (introduced, not all in review) · `due` (something due now) · `strong` (all introduced + all `state==='review'` + none due).
- **Reading checkpoints are a SEPARATE concern from card scheduling** — they persist in `leitfaden_reading_v1` (their own key); they do NOT call the store / affect SRS. No gamification (no streaks/points) — just a quiet progress map + self-explanation prompts.
- **Non-destructive on m05:** the micro-path adds a nav + checkpoint blocks; it must not move/hide the existing reading, the IRB/ASRF widgets, or the quiz.
- Reuse `css/style.css` tokens. Carry forward all prior invariants; 108 tests stay green.

## File Structure

- `js/readiness.js` — **create**. Pure. `cardsByModule(cards)`, `moduleReadiness(sched, byModule, now)`.
- `js/widgets/micropath.js` — **create**. Reusable: `mountMicropath()` (section nav + checkpoints from the page's `<h2>`s).
- `index.html` — **modify**. Add a module script: readiness overlay on the curriculum grid + hero meter.
- `modules/m05.html` — **modify**. Mount the micro-path (script + mount point).
- `css/style.css` — **modify**. Append `.readiness-*` / `.micropath-*` styles.
- `test/readiness.test.js` — **create**.

> Deferred to P5b: per-module source anchors. The micro-path can be added to other modules later by including the script (it's content-free / DOM-driven).

---

### Task 1: Readiness derivation (`js/readiness.js`)

**Files:**
- Create: `js/readiness.js`, `test/readiness.test.js`

**Interfaces:**
- Produces: `cardsByModule(cards): {moduleId: cardId[]}`; `moduleReadiness(sched, byModule, now): {moduleId: 'not-started'|'learning'|'due'|'strong'}`.

- [ ] **Step 1: Write the failing test** — `test/readiness.test.js`

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cardsByModule, moduleReadiness } from '../js/readiness.js';

const NOW = 1_700_000_000_000, DAY = 86_400_000;

test('cardsByModule groups card ids by their module', () => {
  const by = cardsByModule([{ id: 'm01.a', module: 'm01' }, { id: 'm01.b', module: 'm01' }, { id: 'm02.c', module: 'm02' }]);
  assert.deepEqual(by, { m01: ['m01.a', 'm01.b'], m02: ['m02.c'] });
});

test('not-started when no cards of the module are introduced', () => {
  const r = moduleReadiness({}, { m01: ['m01.a', 'm01.b'] }, NOW);
  assert.equal(r.m01, 'not-started');
});

test('due when any introduced card is due now (and not suspended)', () => {
  const sched = { 'm01.a': { state: 'review', due: NOW - DAY, interval: 5 } };
  assert.equal(moduleReadiness(sched, { m01: ['m01.a', 'm01.b'] }, NOW).m01, 'due');
});

test('strong when all cards introduced, all in review state, none due', () => {
  const sched = { 'm01.a': { state: 'review', due: NOW + DAY, interval: 9 }, 'm01.b': { state: 'review', due: NOW + 2 * DAY, interval: 9 } };
  assert.equal(moduleReadiness(sched, { m01: ['m01.a', 'm01.b'] }, NOW).m01, 'strong');
});

test('learning when some introduced or some still in learning/relearn (none due)', () => {
  const partial = { 'm01.a': { state: 'review', due: NOW + DAY, interval: 9 } }; // only 1 of 2 introduced
  assert.equal(moduleReadiness(partial, { m01: ['m01.a', 'm01.b'] }, NOW).m01, 'learning');
  const learning = { 'm01.a': { state: 'learning', due: NOW + 600000 }, 'm01.b': { state: 'review', due: NOW + DAY } };
  assert.equal(moduleReadiness(learning, { m01: ['m01.a', 'm01.b'] }, NOW).m01, 'learning');
});

test('suspended (leech) does not count as due', () => {
  const sched = { 'm01.a': { state: 'suspended', due: NOW - DAY }, 'm01.b': { state: 'review', due: NOW + DAY } };
  assert.notEqual(moduleReadiness(sched, { m01: ['m01.a', 'm01.b'] }, NOW).m01, 'due');
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `node --test test/readiness.test.js`
Expected: FAIL — `Cannot find module '../js/readiness.js'`.

- [ ] **Step 3: Implement `js/readiness.js`**

```js
// Pure per-module readiness derived from the schedule. No I/O; `now` is passed in.
export function cardsByModule(cards) {
  const out = {};
  for (const c of cards || []) {
    if (!c || !c.module || !c.id) continue;
    (out[c.module] = out[c.module] || []).push(c.id);
  }
  return out;
}

export function moduleReadiness(sched, byModule, now) {
  const s = sched || {};
  const out = {};
  for (const [mod, ids] of Object.entries(byModule || {})) {
    const states = ids.map(id => s[id]).filter(Boolean);
    if (states.length === 0) { out[mod] = 'not-started'; continue; }
    const dueNow = states.some(x => x.state !== 'suspended' && x.due != null && x.due <= now);
    const allIntroduced = states.length === ids.length;
    const allReview = allIntroduced && states.every(x => x.state === 'review');
    if (dueNow) out[mod] = 'due';
    else if (allReview) out[mod] = 'strong';
    else out[mod] = 'learning';
  }
  return out;
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `node --test test/readiness.test.js`
Expected: PASS (6 tests). Then `node --test` — whole suite green.

- [ ] **Step 5: Commit**

```bash
git add js/readiness.js test/readiness.test.js
git commit -m "feat(trainer): pure per-module readiness derived from the schedule"
```

---

### Task 2: Readiness rollup on the home curriculum grid (`index.html`, `css/style.css`)

**Files:**
- Modify: `index.html` (add a readiness-overlay module script), `css/style.css` (append `.readiness-*`)

**Interfaces:**
- Consumes: `createStore` (store.js), `mergeDecks` (deckindex.js), `cardsByModule`/`moduleReadiness` (readiness.js).
- Produces: each curriculum row's `[data-modstatus="<id>"]` span shows a readiness band (· not-started / ◐ learning / ◑ review due / ● strong); the hero meter shows "{started}/24 modules started · {strong} strong".

- [ ] **Step 1: Add the readiness overlay to `index.html`** — after the existing reviews-due-badge module script (the `<script type="module">` block), add another module script:

```html
<script type="module">
  import { createStore } from './js/store.js';
  import { mergeDecks } from './js/deckindex.js';
  import { cardsByModule, moduleReadiness } from './js/readiness.js';
  try {
    const store = createStore({ storage: window.localStorage });
    await store.ready();
    const man = await (await fetch('data/cards/manifest.json', { cache: 'no-cache' })).json();
    const decks = await Promise.all((man.decks || []).map(id => fetch(`data/cards/${id}.json`, { cache: 'no-cache' }).then(r => r.json()).catch(() => ({ cards: [] }))));
    const byMod = cardsByModule(mergeDecks(decks));
    const bands = moduleReadiness(store.getState().sched, byMod, Date.now());
    const LABEL = { 'not-started': ['·', 'not started', 'todo'], learning: ['◐', 'learning', 'learning'], due: ['◑', 'review due', 'due'], strong: ['●', 'strong', 'strong'] };
    let started = 0, strong = 0;
    document.querySelectorAll('[data-modstatus]').forEach(el => {
      const band = bands[el.dataset.modstatus];
      if (!band) return;
      const [glyph, text, cls] = LABEL[band];
      el.textContent = `${glyph} ${text}`;
      el.className = `status readiness-${cls}`;
      if (band !== 'not-started') started++;
      if (band === 'strong') strong++;
    });
    const total = Object.keys(byMod).length || 24;
    const fill = document.getElementById('progress-fill'); const label = document.getElementById('progress-label');
    if (fill) fill.style.width = Math.round(started / total * 100) + '%';
    if (label) label.textContent = `${started} / ${total} modules started · ${strong} strong`;
  } catch (e) { /* readiness is an enhancement; never break the page */ }
</script>
```

- [ ] **Step 2: Append `.readiness-*` CSS to `css/style.css`**

```css
/* ---------- Readiness rollup (home curriculum) ---------- */
.status.readiness-todo { color: var(--line-strong); }
.status.readiness-learning { color: var(--yellow); }
.status.readiness-due { color: var(--brand-2); font-weight: 700; }
.status.readiness-strong { color: var(--green); font-weight: 700; }
```

- [ ] **Step 3: Verify and commit**

```bash
node -e "import('node:fs').then(()=>0)" >/dev/null 2>&1
grep -c "moduleReadiness" index.html   # expect 1
node --test                            # whole suite green (still 114: 108 + 6 readiness)
git add index.html css/style.css
git commit -m "feat(trainer): readiness rollup on the home curriculum grid"
```

- [ ] **Step 4: Manual browser smoke (controller drives via the run skill)** — open `index.html`: each module row shows a readiness band; with a fresh state all show "· not started" and the meter "0 / 24 modules started · 0 strong"; after reviewing some m05 cards in the Trainer, m05's row turns "◑ review due"/"◐ learning" and the meter increments. No console errors (the overlay is wrapped in try/catch).

---

### Task 3: Reusable reading micro-path (`js/widgets/micropath.js`, `modules/m05.html`)

**Files:**
- Create: `js/widgets/micropath.js`
- Modify: `modules/m05.html` (mount), `css/style.css` (append `.micropath-*`)

**Interfaces:**
- Produces: a self-mounting micro-path that scans the page's numbered `<h2>` sections, renders a sticky **section progress nav** (one dot per section), and inserts a **self-explanation checkpoint** after each section ("recall this section's key point in one line, then mark it") whose per-section "understood" state persists in `localStorage['leitfaden_reading_v1']` keyed by `<module>#<sectionId>`. Marking a checkpoint fills its nav dot. Reading state is independent of the SRS store.

- [ ] **Step 1: Implement `js/widgets/micropath.js`**

```js
// Reusable reading micro-path: a section nav + a self-explanation checkpoint between segments.
// DOM-driven (reads the page's numbered <h2>s); reading progress lives in its own localStorage key.
const KEY = 'leitfaden_reading_v1';
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const load = () => { try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch { return {}; } };
const save = o => { try { localStorage.setItem(KEY, JSON.stringify(o)); } catch {} };

export function mountMicropath(opts = {}) {
  const moduleId = opts.moduleId || (document.body.dataset.module || 'mod');
  const page = document.querySelector('main .page');
  if (!page) return;
  // numbered top-level sections only (skip "Recap" etc.)
  const heads = [...page.querySelectorAll('h2')].filter(h => /^\s*\d+\s*·/.test(h.textContent));
  if (heads.length < 2) return;
  heads.forEach((h, i) => { if (!h.id) h.id = `${moduleId}-s${(h.textContent.match(/^\s*(\d+)/) || [])[1] || i + 1}`; });

  const state = load();
  const done = id => !!(state[moduleId] && state[moduleId][id]);
  const setDone = (id, v) => { state[moduleId] = state[moduleId] || {}; state[moduleId][id] = v; save(state); };

  // sticky nav
  const nav = document.createElement('nav');
  nav.className = 'micropath';
  const render = () => {
    nav.innerHTML = `<div class="micropath-title">Reading path</div>` + heads.map(h =>
      `<a href="#${h.id}" class="micropath-step ${done(h.id) ? 'done' : ''}"><span class="micropath-dot">${done(h.id) ? '●' : '○'}</span>${esc(h.textContent.trim())}</a>`
    ).join('');
  };
  render();
  page.insertBefore(nav, page.firstChild);

  // checkpoint after each section (before the next section heading)
  heads.forEach((h, i) => {
    const cp = document.createElement('div');
    cp.className = 'micropath-checkpoint';
    cp.innerHTML = `<strong>Checkpoint.</strong> Without scrolling up, recall this section's key point in one sentence — then mark it.
      <button class="btn secondary micropath-mark" type="button">${done(h.id) ? '✓ understood' : 'I\\'ve got this'}</button>`;
    const next = heads[i + 1];
    if (next) next.parentNode.insertBefore(cp, next); else page.appendChild(cp);
    cp.querySelector('.micropath-mark').addEventListener('click', (e) => {
      const nowDone = !done(h.id); setDone(h.id, nowDone);
      e.target.textContent = nowDone ? '✓ understood' : 'I\\'ve got this';
      render();
    });
  });
}

if (document.querySelector('main .page')) mountMicropath();
```

- [ ] **Step 2: Embed in `modules/m05.html`** — before `</body>` (alongside the existing widget module scripts), add:

```html
<script type="module" src="../js/widgets/micropath.js"></script>
```

(No mount div needed — it self-mounts from the page sections. `data-module="m05"` is already on the `<body>`.)

- [ ] **Step 3: Append `.micropath-*` CSS to `css/style.css`**

```css
/* ---------- Reading micro-path ---------- */
.micropath { background: var(--bg-sunk); border: 1px solid var(--line); border-radius: var(--radius-sm); padding: 10px 14px; margin: 0 0 24px; font-family: var(--font); }
.micropath-title { font-size: 11px; text-transform: uppercase; letter-spacing: .8px; color: var(--ink-faint); font-weight: 700; margin-bottom: 6px; }
.micropath-step { display: block; font-size: 13.5px; color: var(--ink-soft); text-decoration: none; padding: 3px 0; }
.micropath-step:hover { color: var(--brand-2); }
.micropath-step.done { color: var(--green); }
.micropath-dot { display: inline-block; width: 1.2em; color: inherit; }
.micropath-checkpoint { background: #fdfaf0; border: 1px solid #ecdfb8; border-left: 3px solid var(--accent); border-radius: var(--radius-sm); padding: 11px 16px; margin: 18px 0; font-size: 14.5px; color: var(--ink-soft); }
.micropath-checkpoint .btn { margin-left: 10px; }
```

- [ ] **Step 4: Verify (Node) and commit**

```bash
node --check js/widgets/micropath.js && echo "micropath syntax OK"
node -e "import('./js/widgets/micropath.js').catch(e => { if (!/document is not defined|Cannot read properties of (null|undefined)|querySelector/.test(String(e))) { console.error('UNEXPECTED', e); process.exit(1); } console.log('imports OK'); })"
grep -c "micropath.js" modules/m05.html   # expect 1
node --test
git add js/widgets/micropath.js modules/m05.html css/style.css
git commit -m "feat(trainer): reusable reading micro-path (section nav + self-explanation checkpoints) on m05"
```

- [ ] **Step 5: Manual browser smoke (controller drives via the run skill)** — open `modules/m05.html`: a "Reading path" nav lists the numbered sections (links jump to them); a checkpoint appears after each section; clicking "I've got this" fills the section's nav dot and persists across reload; the existing reading, the IRB/ASRF widgets, and the quiz are all intact.

---

## Self-Review

**Spec coverage (P3b portion of spec §7/§11):**
- Readiness derived from card schedules → Task 1. ✓
- Readiness rollup surfaced on the home grid + hero meter → Task 2. ✓
- Reading segmented into a checkpointed micro-path with a between-segment micro-retrieval → Task 3. ✓
- Reading checkpoints separate from SRS (own localStorage key) → Task 3 (constraint). ✓
- Non-destructive on m05 (widgets/quiz intact) → Task 3 (constraint + smoke). ✓
- *Deferred (correctly):* per-module anchors (P5b); adding the micro-path to the other 23 modules (one-line include each, later).

**Placeholder scan:** Tasks 1–3 give complete code; no TBDs.

**Type consistency:** `cardsByModule`/`moduleReadiness` match their tests + the index use; `mergeDecks` reused from P5; the micro-path is self-mounting and DOM-guarded (no-ops off-page).

---

## Next (P5b)
Per-module source anchors: inject canonical `mNN-s<sec>[-<sub>]` ids into every module's `<h2>`/`<h3>` and normalize each deck's `sourceRef.anchor` to that canonical form (decks currently mix `mNN-s3.1` dot vs m05's `mNN-s3-2` dash), then verify every deck anchor resolves — so the Trainer's jump-to-source lands on the right section in every module.
