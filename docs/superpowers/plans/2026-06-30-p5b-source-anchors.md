# P5b — Per-Module Source Anchors Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make every deck card's `sourceRef.anchor` resolve to a real `id=` in its module HTML, so the Trainer's "↗ open this in the module" jump lands on the cited section instead of degrading to the page top (today only m05 resolves; all 23 other modules degrade).

**Architecture:** A deterministic, tested codemod — *not* a per-module rollout. Two pure helpers (`js/anchors.js`) encode the canonical anchor scheme: they derive a canonical `id` from a heading's number, and normalize a raw deck anchor to that scheme. A dev script (`scripts/inject-anchors.mjs`) applies them surgically (line-level edits, minimal diff) to the 24 module HTMLs and 24 decks. A permanent golden test (`test/anchor-resolution.test.js`) asserts 100% of deck anchors resolve — the durable invariant. The runtime jump-link in `study.js` is hardened to normalize defensively so future un-normalized decks still resolve.

**Tech Stack:** Vanilla JS ES modules, no build step. `node --test` (Node 26). `node:fs`/`node:path` in the codemod and the resolution test only.

## Global Constraints

- **Canonical anchor scheme** (already used by m05 — replicate exactly):
  - `<h2>` whose visible text starts `N ·` (e.g. `2 · Concept …`) → `id="<module>-s<N>"` (e.g. `m12-s2`).
  - `<h3>` whose visible text starts `N.M` (e.g. `3.2 The ASRF …`) → `id="<module>-s<N>-<M>"` (e.g. `m05-s3-2`).
  - No id on `<h1>`, `Recap`, `Nuances` (un-numbered) or any heading without a leading number.
- **Deck anchor normalization:** dots → dashes (`m08-s3.1` → `m08-s3-1`); strip any descriptive slug to the numeric prefix (`m02-s2-2-at1` → `m02-s2-2`, `m02-s4-worked-example` → `m02-s4`). The canonical form is `^m\d+-s\d+(-\d+)?$`.
- **Degrade-to-section:** if a normalized subsection anchor has no matching `<h3>` id, it degrades to its section id `m<NN>-s<N>` (always present because every numbered `<h2>` gets an id). The ONLY known degraders are m11's `5-3/5-8/5-9/5-10` → `m11-s5` (those h3s don't exist in m11.html). Every section-level anchor already resolves — no anchor references a section with no `<h2>`.
- **Surgical edits only:** mutate decks by replacing the `"anchor": "…"` value on its own line; mutate HTMLs by adding `id="…"` to the heading's opening tag. NEVER re-serialize a whole JSON file (would reformat UTF-8 `€/ö/ä` and explode the diff) and never rewrite heading text/content.
- **Idempotent:** a heading that already has an `id=` is left untouched (m05 keeps its hand-authored ids). Running the codemod twice is a no-op the second time.
- **No build step**, ES modules, vanilla JS. Decks stay 2-space-indented UTF-8 ending in a newline.

---

### Task 1: Pure anchor helpers + tests

**Files:**
- Create: `js/anchors.js`
- Test: `test/anchors.test.js`

**Interfaces:**
- Produces:
  - `headingId(moduleId: string, headingText: string) → string | null` — given a module id (`"m12"`) and a heading's *visible text*, returns the canonical id, or `null` if the heading isn't numbered. `<h2>` rule: leading `\d+` followed by `·`/`.`-or-space; `<h3>` rule: leading `\d+\.\d+`. Subsection wins when both could match (a `3.2` text is a subsection).
  - `canonicalAnchor(raw: string) → string` — dots→dashes, then keep only the leading `m<digits>-s<digits>(-<digits>)?`; if nothing matches, return `raw` unchanged.

- [ ] **Step 1: Write the failing tests**

```js
// test/anchors.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { headingId, canonicalAnchor } from '../js/anchors.js';

test('headingId: numbered h2 → section id', () => {
  assert.equal(headingId('m01', '1 · Motivation — why a formula at all?'), 'm01-s1');
  assert.equal(headingId('m12', '6 · Nuances & traps'), 'm12-s6');
});
test('headingId: numbered h3 → subsection id', () => {
  assert.equal(headingId('m05', '3.2 The ASRF limit — why this becomes a per-loan formula'), 'm05-s3-2');
  assert.equal(headingId('m11', '5.10 Some deep subsection'), 'm11-s5-10');
});
test('headingId: un-numbered headings → null', () => {
  assert.equal(headingId('m05', 'Recap'), null);
  assert.equal(headingId('m05', 'Module 5 — Credit risk'), null); // h1, no leading number+separator
  assert.equal(headingId('m05', 'Nuances & traps'), null);
});
test('canonicalAnchor: dot → dash', () => {
  assert.equal(canonicalAnchor('m08-s3.1'), 'm08-s3-1');
  assert.equal(canonicalAnchor('m11-s5.10'), 'm11-s5-10');
});
test('canonicalAnchor: strip descriptive slug to numeric prefix', () => {
  assert.equal(canonicalAnchor('m02-s2-2-at1'), 'm02-s2-2');
  assert.equal(canonicalAnchor('m02-s4-worked-example'), 'm02-s4');
  assert.equal(canonicalAnchor('m02-s5-1-buffers'), 'm02-s5-1');
});
test('canonicalAnchor: already-canonical is idempotent', () => {
  assert.equal(canonicalAnchor('m01-s3'), 'm01-s3');
  assert.equal(canonicalAnchor('m05-s5-2'), 'm05-s5-2');
});
test('canonicalAnchor: unrecognised string returned unchanged', () => {
  assert.equal(canonicalAnchor('intro'), 'intro');
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test test/anchors.test.js`
Expected: FAIL — `Cannot find module '../js/anchors.js'`.

- [ ] **Step 3: Write the implementation**

```js
// js/anchors.js
// Canonical source-anchor scheme shared by the deck codemod and the runtime
// jump-to-source link. Pure: no DOM, no storage, no Date/Random.

// A heading's canonical id from its module and visible text.
// <h3> "N.M ..." -> "<mod>-s<N>-<M>"; <h2> "N ..." -> "<mod>-s<N>"; else null.
export function headingId(moduleId, headingText) {
  if (!moduleId || typeof headingText !== 'string') return null;
  const t = headingText.trim();
  const sub = t.match(/^(\d+)\.(\d+)\b/);
  if (sub) return `${moduleId}-s${sub[1]}-${sub[2]}`;
  // section: a leading integer followed by a separator that is NOT a digit
  // (so "3.2" is never read as section 3) — middot, period, or whitespace.
  const sec = t.match(/^(\d+)(?:\s*[·.]\s*|\s+)\S/);
  if (sec) return `${moduleId}-s${sec[1]}`;
  return null;
}

// Normalize a raw deck anchor to the canonical numeric form.
export function canonicalAnchor(raw) {
  if (typeof raw !== 'string') return raw;
  const dashed = raw.replace(/\./g, '-');
  const m = dashed.match(/^(m\d+-s\d+(?:-\d+)?)/);
  return m ? m[1] : raw;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --test test/anchors.test.js`
Expected: PASS (all cases).

- [ ] **Step 5: Commit**

```bash
git add js/anchors.js test/anchors.test.js
git commit -m "feat(trainer): canonical source-anchor helpers (headingId + canonicalAnchor)"
```

---

### Task 2: Codemod — inject heading ids, normalize deck anchors, lock with a resolution test

**Files:**
- Create: `scripts/inject-anchors.mjs`
- Create: `test/anchor-resolution.test.js`
- Modify (by RUNNING the codemod): `modules/m01.html`–`modules/m24.html` (inject ids; m05 unchanged), `data/cards/m01.json`–`data/cards/m24.json` (normalize anchors).

**Interfaces:**
- Consumes: `headingId`, `canonicalAnchor` from `js/anchors.js` (Task 1).

- [ ] **Step 1: Write the codemod**

```js
// scripts/inject-anchors.mjs
// One-time (idempotent) codemod: inject canonical ids onto numbered headings in
// every module HTML, and normalize every deck's sourceRef.anchor to resolve.
// Surgical, line-level edits — never re-serialize a whole file.
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { headingId, canonicalAnchor } from '../js/anchors.js';

const MODS = Array.from({ length: 24 }, (_, i) => 'm' + String(i + 1).padStart(2, '0'));

// 1) HTML: add id="" to numbered <h2>/<h3> that lack one.
function injectHtml(mod) {
  const path = `modules/${mod}.html`;
  let html = readFileSync(path, 'utf8');
  const ids = new Set();
  html = html.replace(/<(h2|h3)([^>]*)>(.*?)<\/\1>/g, (full, tag, attrs, inner) => {
    const text = inner.replace(/<[^>]+>/g, ''); // strip nested <em> etc. for the number
    const id = headingId(mod, text);
    if (id) ids.add(id);
    if (!id || /\bid\s*=/.test(attrs)) {
      if (/\bid\s*=/.test(attrs)) { const ex = attrs.match(/\bid\s*=\s*"([^"]+)"/); if (ex) ids.add(ex[1]); }
      return full; // un-numbered, or already has an id (idempotent)
    }
    return `<${tag}${attrs} id="${id}">${inner}</${tag}>`;
  });
  writeFileSync(path, html);
  return ids; // every id now present in this module
}

// 2) Deck: normalize each anchor; degrade to section if the subsection id is absent.
function fixDeck(mod, ids) {
  const path = `data/cards/${mod}.json`;
  let src = readFileSync(path, 'utf8');
  let normalized = 0, degraded = 0;
  src = src.replace(/("anchor":\s*")([^"]+)(")/g, (full, a, val, b) => {
    let canon = canonicalAnchor(val);
    if (!ids.has(canon)) {
      const sec = canon.match(/^(m\d+-s\d+)/); // degrade subsection -> section
      if (sec && ids.has(sec[1])) { canon = sec[1]; degraded++; }
    }
    if (canon !== val) normalized++;
    return a + canon + b;
  });
  writeFileSync(path, src);
  return { normalized, degraded };
}

let totalIds = 0, totalNorm = 0, totalDeg = 0;
for (const mod of MODS) {
  const ids = injectHtml(mod);
  const { normalized, degraded } = fixDeck(mod, ids);
  totalIds += ids.size; totalNorm += normalized; totalDeg += degraded;
  console.log(`${mod}: ${ids.size} ids present, ${normalized} anchors normalized, ${degraded} degraded`);
}
console.log(`TOTAL: ${totalIds} ids, ${totalNorm} normalized, ${totalDeg} degraded`);
```

- [ ] **Step 2: Run the codemod**

Run: `node scripts/inject-anchors.mjs`
Expected: a per-module report; `m05` shows `0 anchors normalized` (already canonical) and keeps its hand-authored ids; `m08`/`m11` show normalizations; `m11` shows `degraded` ≥ 1 (its `5-3/5-8/5-9/5-10` → `m11-s5`).

- [ ] **Step 3: Write the resolution golden test**

```js
// test/anchor-resolution.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const MODS = Array.from({ length: 24 }, (_, i) => 'm' + String(i + 1).padStart(2, '0'));

function idsOf(mod) {
  const html = readFileSync(`modules/${mod}.html`, 'utf8');
  return new Set([...html.matchAll(/\bid\s*=\s*"([^"]+)"/g)].map(m => m[1]));
}

for (const mod of MODS) {
  test(`every ${mod} deck anchor resolves to an id in ${mod}.html`, () => {
    const deck = JSON.parse(readFileSync(`data/cards/${mod}.json`, 'utf8'));
    const ids = idsOf(mod);
    for (const c of deck.cards || []) {
      const a = c.sourceRef && c.sourceRef.anchor;
      if (!a) continue;
      assert.ok(ids.has(a), `${mod} card ${c.id}: anchor "${a}" has no matching id in ${mod}.html`);
    }
  });
}
```

- [ ] **Step 4: Run the resolution test (and the whole suite)**

Run: `node --test test/anchor-resolution.test.js`
Expected: PASS — every anchor resolves.
Run: `node --test`
Expected: whole suite green (114 prior + Task 1's cases + 24 resolution tests).

- [ ] **Step 5: Verify idempotency + minimal diff**

Run: `node scripts/inject-anchors.mjs` (second run)
Expected: `git diff --stat` shows NO further changes (idempotent).
Run: `git diff -U0 data/cards/m12.json`
Expected: ONLY `"anchor"` lines changed — no reformatting of other lines.

- [ ] **Step 6: Commit**

```bash
git add scripts/inject-anchors.mjs test/anchor-resolution.test.js modules/m*.html data/cards/m*.json
git commit -m "feat(trainer): inject canonical source anchors across all modules + resolution test"
```

---

### Task 3: Harden the runtime jump-link

**Files:**
- Modify: `js/study.js` (the `card.sourceRef` link, ~line 180-181)

**Interfaces:**
- Consumes: `canonicalAnchor` from `js/anchors.js` (Task 1).

**Rationale:** Task 2 normalized the *current* decks, but a future hand-added deck could carry a dotted/slugged anchor. Normalizing at link-build time makes the jump self-healing without re-running the codemod.

- [ ] **Step 1: Add the import**

In `js/study.js`, add to the existing import block at the top:

```js
import { canonicalAnchor } from './anchors.js';
```

- [ ] **Step 2: Use it when building the link**

Replace the source-link line (currently):

```js
if (card.sourceRef && card.sourceRef.module && card.sourceRef.anchor) {
  html += `<p class="trainer-source"><a href="modules/${esc(card.sourceRef.module)}.html#${esc(card.sourceRef.anchor)}" target="_blank" rel="noopener">↗ open this in the module</a></p>`;
}
```

with:

```js
if (card.sourceRef && card.sourceRef.module && card.sourceRef.anchor) {
  const anchor = canonicalAnchor(card.sourceRef.anchor);
  html += `<p class="trainer-source"><a href="modules/${esc(card.sourceRef.module)}.html#${esc(anchor)}" target="_blank" rel="noopener">↗ open this in the module</a></p>`;
}
```

- [ ] **Step 3: Verify syntax + suite**

Run: `node --check js/study.js`
Expected: OK.
Run: `node --test`
Expected: whole suite green.

- [ ] **Step 4: Commit**

```bash
git add js/study.js
git commit -m "feat(trainer): normalize source anchor when building the jump-to-source link"
```

---

## Post-execution (controller): browser smoke

Serve (`python3 -m http.server 8765`) and, via headless Chrome, grade one card from a **non-m05** module (e.g. m12), click "↗ open this in the module", and confirm the module page scrolls to the cited `<h2>`/`<h3>` (not the top). Screenshot. Then the P5b whole-branch review (opus) over `MERGE_BASE..HEAD`.

## Self-review notes (author)

- **Spec coverage:** anchors injected (Task 2 HTML), deck anchors normalized + degraded (Task 2 deck), every anchor resolves (Task 2 resolution test), runtime jump uses canonical form (Task 3). m05 untouched (idempotent skip).
- **Type consistency:** `headingId`/`canonicalAnchor` signatures identical across js/anchors.js, the codemod, study.js, and tests.
- **No placeholders:** all code complete and runnable.
