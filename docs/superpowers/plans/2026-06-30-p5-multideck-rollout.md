# Leitfaden Trainer — P5: Multi-Deck Loading & Rollout — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the Trainer span the whole course: load every module's deck via a manifest (not just m05), then author decks for the remaining 23 teaching modules (draft→verify→revise workflow, lint-gated), wired into the manifest — each provisional pending the owner's domain-accuracy review.

**Architecture:** A pure, Node-tested `mergeDecks(decks)` unions cards across module decks (dedup by id). `study.js` fetches `data/cards/manifest.json`, loads every listed deck, and feeds the union into the existing queue/grading pipeline — no engine change (the queue, SRS, calibration already operate over `cards` + `sched` regardless of how many modules contribute). Decks are authored by a separate **Workflow** (one draft→verify→revise pipeline per module, reading that module's HTML + the master fact-sheet), then lint-gated and added to the manifest. The card `id` namespacing (`mNN.*`) and the queue's cross-module interleave already make multi-module "just work" once the cards are loaded.

**Tech Stack:** Vanilla JS ES modules, no build step; Node `node --test`; the deck-authoring Workflow (Agent fan-out).

## Global Constraints

- **No build step.** `mergeDecks` is a pure ES module helper; `study.js` loads decks at runtime via `fetch`.
- **Manifest-driven:** `data/cards/manifest.json` = `{ "decks": ["m05", …] }`. study.js loads exactly the listed decks; a deck is "live" only once added here.
- **No engine changes:** the queue/SRS/grading/calibration operate on the union of cards + the existing `sched`. Card ids stay immutable + namespaced (`mNN.<type>.<slug>`), so cross-deck dedup is by id.
- **Every authored deck is lint-clean** (`js/cardlint.js`) and hits the mandated mix; numeric cards self-check; every card carries `version` + `sourceRef`. **Each deck is PROVISIONAL** until the owner reviews it for domain accuracy (carry the m05 precedent — incl. the confirmed M=2.5 maturity-adjustment convention).
- A deck that won't lint is fixed or held back from the manifest — never shipped broken.
- Carry forward all prior invariants.

## File Structure

- `js/deckindex.js` — **create**. Pure. `mergeDecks(decks)` → unified `cards[]` (dedup by id).
- `data/cards/manifest.json` — **create**. The deck list.
- `js/study.js` — **modify**. Load decks from the manifest (replace the hardcoded single-deck fetch).
- `data/cards/m01.json … m24.json` (the 23 missing) — **create via the deck Workflow** (lint-gated), then add to the manifest.
- `test/deckindex.test.js` — **create**.

> Deferred: per-module source anchors + jump-to-source for the new modules (best-effort; the link degrades to the page top until anchors are added — a P5b polish); P3b reading segmentation; the m05 + new-deck domain reviews (owner).

---

### Task 1: Multi-deck loading (`js/deckindex.js`, `data/cards/manifest.json`, `js/study.js`)

**Files:**
- Create: `js/deckindex.js`, `data/cards/manifest.json`, `test/deckindex.test.js`
- Modify: `js/study.js`

**Interfaces:**
- Produces: `mergeDecks(decks): card[]` — concatenates `decks[].cards`, deduping by `id` (first wins), skipping non-arrays. `study.js` boot loads `data/cards/manifest.json` → fetches each `data/cards/<id>.json` → `mergeDecks` → feeds `deck`/`byId`.

- [ ] **Step 1: Write the failing test** — `test/deckindex.test.js`

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mergeDecks } from '../js/deckindex.js';

test('mergeDecks unions cards across decks', () => {
  const cards = mergeDecks([{ cards: [{ id: 'm01.a' }] }, { cards: [{ id: 'm02.b' }, { id: 'm02.c' }] }]);
  assert.deepEqual(cards.map(c => c.id), ['m01.a', 'm02.b', 'm02.c']);
});

test('mergeDecks dedups by id (first wins)', () => {
  const cards = mergeDecks([{ cards: [{ id: 'm05.x', v: 1 }] }, { cards: [{ id: 'm05.x', v: 2 }, { id: 'm05.y' }] }]);
  assert.equal(cards.length, 2);
  assert.equal(cards.find(c => c.id === 'm05.x').v, 1);
});

test('mergeDecks tolerates empty / malformed decks', () => {
  assert.deepEqual(mergeDecks([]), []);
  assert.deepEqual(mergeDecks([{}, { cards: null }, { cards: [{ id: 'a' }] }]).map(c => c.id), ['a']);
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `node --test test/deckindex.test.js`
Expected: FAIL — `Cannot find module '../js/deckindex.js'`.

- [ ] **Step 3: Implement `js/deckindex.js`**

```js
// Pure: union cards across module decks, dedup by id (first occurrence wins).
export function mergeDecks(decks) {
  const cards = [];
  const seen = new Set();
  for (const d of decks || []) {
    const list = d && Array.isArray(d.cards) ? d.cards : [];
    for (const c of list) {
      if (c && c.id && !seen.has(c.id)) { cards.push(c); seen.add(c.id); }
    }
  }
  return cards;
}
```

- [ ] **Step 4: Create `data/cards/manifest.json`** (starts with the existing m05 deck; the workflow adds the rest)

```json
{ "decks": ["m05"] }
```

- [ ] **Step 5: Wire `study.js` to load from the manifest**

READ `js/study.js`. In `boot()`, REPLACE the single-deck fetch (currently `const res = await fetch('data/cards/m05.json', …); deck = (await res.json()).cards || [];`) with a manifest-driven load:

```js
  try {
    const manifest = await (await fetch('data/cards/manifest.json', { cache: 'no-cache' })).json();
    const decks = await Promise.all((manifest.decks || []).map(id =>
      fetch(`data/cards/${id}.json`, { cache: 'no-cache' }).then(r => r.json()).catch(() => ({ cards: [] }))
    ));
    deck = mergeDecks(decks);
  } catch {
    summary.textContent = 'Could not load the decks — you can still use Sync & backup to export/import.';
    setMode('sync'); return;
  }
  byId = new Map(deck.map(c => [c.id, c]));
```

Add the import at the top of `study.js`:

```js
import { mergeDecks } from './deckindex.js';
```

- [ ] **Step 6: Verify (Node) and commit**

```bash
node --check js/study.js && echo "study.js OK"
node -e "import('./js/study.js').catch(e => { if (!/document is not defined|Cannot read properties of null|addEventListener/.test(String(e))) { console.error('UNEXPECTED', e); process.exit(1); } console.log('imports OK'); })"
node -e "import('node:fs').then(fs=>{JSON.parse(fs.readFileSync('data/cards/manifest.json','utf8'));console.log('manifest valid')})" 2>/dev/null || node --input-type=module -e "import('node:fs').then(fs=>{JSON.parse(fs.readFileSync('data/cards/manifest.json','utf8'));console.log('manifest valid')})"
grep -c "mergeDecks" js/study.js   # expect 2 (import + use)
node --test                        # whole suite green
git add js/deckindex.js data/cards/manifest.json js/study.js test/deckindex.test.js
git commit -m "feat(trainer): manifest-driven multi-deck loading (Trainer spans all modules)"
```

- [ ] **Step 7: Manual browser smoke (controller drives via the run skill)** — with only m05 in the manifest the Trainer behaves exactly as before; after the workflow adds more decks to the manifest, the Review/Drill/Viva queues span those modules and the home "reviews due" badge reflects the larger card set.

---

### Task 2: Author the remaining module decks (Workflow — content, not SDD)

**Files:**
- Create (via Workflow + a node extractor): `data/cards/m01.json … m04.json`, `m06.json … m24.json` (the 23 missing teaching modules)
- Modify: `data/cards/manifest.json` (add each lint-clean deck)

**Process (the controller runs this; it is content generation, gated objectively):**

- [ ] **Step 1: Run the deck-authoring Workflow** — one `draft → verify → revise` pipeline per module. Each module's **draft** agent reads `modules/<id>.html` + `_authoring_brief.md` (the master fact-sheet) + `_card_brief.md` + `card.schema.json`, and drafts a deck hitting the mandated mix (≥2 numeric, ≥1 deriveStep, ≥2 cloze, ≥2 discrimination, ≥2 viva) with every fixed number tagged reg/ÖRS and `sourceRef.anchor` = a section id (best-effort `<id>-sN`). A **verify** agent adversarially checks each deck's values/verdicts against that module's content (flagging anything wrong). A **revise** agent applies corrections and returns the final deck. (Modules with little quant may fall back to more discrimination/viva cards while still meeting the mix.)

- [ ] **Step 2: Extract + lint-gate each deck** — a node script reads the workflow output, writes each `data/cards/<id>.json`, runs `lintDeck` on it, and runs the numeric self-check (`gradeAnswer(card, {text:String(card.answer.value)}).objective === true`) for numeric cards. Any deck with lint errors or a numeric self-check failure is fixed or held back (NOT added to the manifest).

- [ ] **Step 3: Add the clean decks to `data/cards/manifest.json`** and commit:

```bash
# manifest.decks becomes ["m01","m02","m03","m04","m05","m06",…,"m24"] for the decks that passed
git add data/cards/*.json
git commit -m "feat(trainer): author decks for the remaining teaching modules (provisional, pending review)"
```

- [ ] **Step 4: Browser smoke (controller)** — open the Trainer: the Review/Drill/Viva queues now interleave cards from multiple modules; the badge count reflects all decks; a sample card from a new module renders + grades. Confirm no console errors.

- [ ] **Step 5: Present to the owner for batched domain-accuracy review** — surface each new deck's headline claims (key numbers, reg/ÖRS verdicts, any flagged errata) for confirmation, the same as m05. Corrections land as follow-up commits. Until reviewed, the decks are explicitly provisional.

---

## Self-Review

**Spec coverage (P5 portion of spec §14):**
- Multi-deck loading via a manifest, no engine change, dedup by id → Task 1. ✓
- Decks authored for all teaching modules, lint-gated + numeric-self-checked, via the draft→verify→revise workflow → Task 2. ✓
- Each deck provisional pending owner review → Task 2 Step 5. ✓
- *Deferred (correctly):* per-module source anchors (best-effort; jump-to-source degrades to page top); P3b reading segmentation; retiring the legacy progress key + routing the sidebar/index to readiness (a final cleanup once decks span the course).

**Placeholder scan:** Task 1 is complete code; Task 2 is a content/workflow process with objective gates (lint + numeric self-check + owner review), not pre-baked card text — appropriate for content.

**Type consistency:** `mergeDecks(decks)` matches its tests + the study.js use; the manifest shape `{decks:[...]}` is consistent; authored decks conform to `card.schema.json` (enforced by the lint).

---

## Next (P5b / cleanup)
P5b: per-module source anchors + jump-to-source for the new modules; P3b reading segmentation + readiness rollup; retire `leitfaden_progress_v1` and route the sidebar/index checkmarks to derived readiness now that decks span the course; then `finishing-a-development-branch` (merge / PR) once the owner has reviewed the decks.
