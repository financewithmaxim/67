# Leitfaden Trainer — a retention-first study system

**Status:** Design approved (high level); detailed spec for review
**Date:** 2026-06-30
**Owner:** financewithmaxim
**Branch:** `claude/leitfaden-trainer-study-system`

---

## 1. Context

The repo is a self-paced static course (24 HTML modules + `capstone.html` + `glossary.html`,
`js/app.js`, `css/style.css`, GitHub Pages, no build step) that reconstructs the Austrian
Raiffeisen **ÖRS *Leitfaden Früherkennung* (09/2024)** — bank capital-regulation / risk-bearing-capacity
methodology. The content is dense quant (Merton→Vasicek→ASRF IRB derivation, VaR, copulas, MathJax) +
CRR/EBA regulation, bilingual DE/EN, organised around one spine: for every fixed number, is it a
**regulatory value** the CRR forces or an **ÖRS modelling choice** made for proportionality — and what
does that choice trade off?

The course does excellent **encoding** (derivations, worked examples, the reg/ÖRS spine) but has **zero
durable-retrieval infrastructure**: a one-shot 70% multiple-choice quiz flips a permanent ✓ and is never
revisited. This project adds the missing retrieval layer.

This design was produced by: a 17-agent research + 5-advisor council pass, the brainstorming/grilling
process (six forks resolved with the owner), and an 8-agent adversarial design review whose blockers and
should-fixes are folded in below.

## 2. The learner & success criteria

One specific learner (the owner): a quant-strong Junior Risk Controller in Sector Risk Controlling
Services, fluent in R/SQL, intrinsically motivated, studying for a **promotion** and the ability to
**defend the methodology to the Aufsichtsrat (supervisory board)**.

**Success =** months-out, board-defensible mastery — measured by:
- Spaced **generative** recall of the load-bearing computations (R, conditional PD, K, UL, the sign-flip).
- Reliable **reg-vs-ÖRS discrimination** with the tradeoff produced, not guessed.
- A **viva** answer that hits the required rubric points and avoids the known disqualifiers, with
  **calibrated confidence** (no confidently-wrong answers).

## 3. Decisions locked (the six forks)

| # | Fork | Decision |
|---|------|----------|
| 1 | Scope | Study/retention layer **+** reading redesign, **sequenced** (engine first, reading polish after). |
| 2 | Viva grounding | **Self-graded against pre-authored rubrics** seeded from the Leitfaden text + CRR/EBA expectations. |
| 3 | Authoring | **Claude drafts** decks/answers/rubrics from existing content; **owner reviews**. Authoring is the bottleneck. |
| 4 | Rollout | **Full vertical slice on m05 (Vasicek/IRB) first**, then roll templates across all 24 modules. |
| 5 | Persistence | **Local-first, no backend now**; laptop↔phone via **optional GitHub-Gist sync**; export/import always on. |
| 6 | Audience | **For the owner now, backend-ready for later** (clean storage-adapter seam; Supabase deferred). |

## 4. Goal & non-goals

**Goal:** turn excellent encoding into durable, generative, board-defensible retrieval.

**Non-goals (deliberately skipped):** streaks, XP, points, badges, hearts/lives, leagues/leaderboards,
guilt notifications, speed timers on derivations, confetti/mascots, accounts. *Rationale:* for an n=1
intrinsically-motivated professional these are neutral-to-harmful (overjustification, streak-saving
cramming, punishing the errorful generation that is the whole point). Also out of scope now: a backend,
the m06–m24 decks (P5), FSRS, multi-user.

---

## 5. Architecture

Vanilla JS, zero build step, GitHub-Pages-friendly, reusing `css/style.css` tokens.

### 5.1 Three namespaces (not two)

| Namespace | Contents | Synced? | Storage |
|-----------|----------|---------|---------|
| **content** | cards, decks, module text, rubrics, model answers | served to everyone (static files) | `data/cards/*.json` |
| **user-state** | schedule, reviews stream, module readiness, settings | yes | `ProgressStore` (localStorage key `leitfaden_state_v2`) |
| **device-config** | gist token, sync cursor/etag, `deviceId`, IANA tz | **never** — sync layer is structurally forbidden to read it | separate localStorage key `leitfaden_device_v1` |

Separating device-config prevents the gist token from being serialized into the synced gist (a real
credential-leak path).

### 5.2 Store contract — `js/store.js` (`ProgressStore`)

Pinned **async-from-day-one with a hydrate-once in-memory snapshot**, so the future `SupabaseStore` is a
true drop-in (the #1 "drop-in lie" the review caught):

```js
await store.ready()                 // resolves after initial hydration (instant for localStorage)
store.getState()                    // SYNCHRONOUS in-memory snapshot (render code stays simple)
await store.patch(path, value)      // the ONLY mutation API, e.g. patch(['sched', id], next)
await store.saveState(root)         // reserved for migration/import ONLY (not per-grade writes)
store.subscribe(fn)                 // see firing contract below
await store.sync()                  // pull-merge-then-push (no-op for plain LocalStorageStore)
```

- App boot does `await store.ready()` **before** the first progress-dependent paint.
- Writes are **always per-entity** via `patch` (whole-blob `saveState` is racy across two tabs and a
  pathological backend write).
- `srs.js` and the queue selector **never touch the store** — they are pure functions over the snapshot;
  `study.js` owns all async load/patch. This keeps the engine swappable (FSRS) and user-agnostic.
- The hydrated snapshot is **always single-user-shaped**; user scoping/RLS lives *only* inside a future
  adapter, never in state/selectors/`srs.js`.

**`subscribe()` firing contract** (identical across adapters): fires (1) after a local `patch`, and
(2) after a completed sync-merge — **never mid-review-card**. The review queue is snapshotted at session
start; remote merges apply only at **queue boundaries**.

Adapters now: `LocalStorageStore` (hydrate instant; `patch` = read-modify-write one key).
`GistSyncStore` wraps it and adds `sync()`. Later: `SupabaseStore` (`patch` = single-row upsert;
`reviews` → append-only table; `sched` → per-row).

### 5.3 State root schema

```js
{
  schemaVersion: 2,
  modules: { [moduleId]: { readiness: 'not-started'|'review-soon'|..., completedAt } },  // migration target + fallback for deck-less modules only (see §7.3)
  sched:   { [cardId]:   { state, due, interval, ease, reps, lapses, lastGrade,
                           seenVersion, updatedAt, rev } },
  reviews: [ { id, cardId, ts, grade, confidence, pointsHit, pointsMissed } ],  // append-only stream
  newIntroduced: { [utcDate]: count },   // daily new-card cap ledger (survives sync)
  tombstones: { [cardId]: deletedAt },   // so deletions don't resurrect on merge
  settings: { tz, maxReviewsPerSession, newCardsPerDay, targetRetention }
}
```

`reviews` is split from mutable `sched` because calibration needs an append-only analytics stream (and
it maps cleanly to a Supabase `reviews` table). `confLog` from the high-level design is **replaced** by
`reviews`.

### 5.4 Sync / merge semantics (Gist)

The promised "per-card safety merge" is **impossible without per-record versioning**, so:

- Every `sched[id]` and every `reviews[]` entry carries `updatedAt` (UTC epoch ms) + monotonic `rev`;
  state root carries a `deviceId`.
- **Merge at RECORD level:** higher `rev` wins; tie-break `updatedAt` then `deviceId`. **Never** field-wise
  `max()` (it would mask a legitimate lapse-reset of `reps`).
- `reviews` are **dedup-unioned** by their stable per-entry `id`.
- Sync is **pull → merge → push** against a stored base snapshot; track `lastSyncedGistRev` for conflict
  detection. (Push-only LWW silently discards a device's history.)
- Tombstones prevent deleted cards' state from resurrecting on merge.
- Day boundary: all timestamps UTC epoch ms; "today" = local **04:00** from the stored IANA tz;
  `newIntroduced` keyed by UTC date so the new-card cap can't be double-spent across devices.

### 5.5 Migration runner (v1 → v2)

A single **idempotent** migration runner sits **above** the adapter, runs on the hydrated snapshot
(and on every pulled blob), gated by `schemaVersion`, **rejects downgrades**, before any sync push.

- Map legacy `leitfaden_progress_v1` boolean `{moduleId:true}` → `modules[moduleId] = {readiness:'review-soon', completedAt:null}`.
- Preserve `capstone`; **skip** `glossary` (it's reference, never graded).
- **Do not fabricate `sched` entries** (no phantom day-one due cards).
- Write to the **new key `leitfaden_state_v2`**; **never delete `leitfaden_progress_v1`** until P5
  (non-destructive copy).

### 5.6 `app.js` freeze & isolation (the "m05-only slice" blocker)

`js/app.js` is loaded byte-identically by all 27 pages, so naive changes regress the whole site.

- Through P0–P3, **freeze app.js external behavior**: the legacy boolean path, `window.COURSE`,
  `renderIndexProgress`, the global-`QUIZ` render path stay byte-for-byte intact on m01–m24/capstone/index.
- Extract `COURSE` into **`js/course.js`** so `study.html` reuses the table of contents without dragging
  in legacy boot code.
- All new engine logic lives in **new files** loaded only by `study.html` and the upgraded `m05.html`.
- **Global P0 change (the one exception):** neuter MCQ as a completion gate **everywhere** — `gradeQuiz`
  never calls `markComplete`, never feeds readiness/SRS, and every module shows a persistent "warm-up
  only — practice in the Trainer" banner. Without this, 23 modules keep painting a misleading ✓ during a
  multi-week rollout.
- Fix the stale hardcoded "0 / 18 modules" on index (now /24 + capstone). Keep the legacy checkmark in
  the shared sidebar during P0–P4; readiness lives only inside `study.html`/`m05.html` to avoid a
  contradictory mixed UI.

---

## 6. Data model — the "defensible claim"

The atomic unit is a **defensible claim**: a value + verdict (`reg`-forced vs `ÖRS`-choice) + the
tradeoff it buys + a rebuttal to the obvious board challenge.

### 6.1 Card schema (common)

```js
{
  id: "m05.num.ul-extremfall",   // IMMUTABLE, namespaced, frozen once shipped
  contentHash: "…",              // over answer-bearing fields; cosmetic edit keeps schedule, answer change resets
  module: "m05",
  type: "numeric"|"cloze"|"deriveStep"|"discrimination"|"viva"|"freeRecall",
  format: "text"|"md"|"tex",
  lang: "en"|"de"|"mix",
  front: "…",
  tags: { spine: "reg"|"ors"|"boundary", risk: "credit"|"market"|"op"|"cva"|"liquidity"|…, crr: "CRR:Art153" },
  chainId: null|"m05.deriv.signflip",   // ordered derivations
  ordinal: null|Int,
  prereq: ["…cardId"],
  unlockAt: "m05-cp-3",          // micro-path checkpoint id that introduces this card
  sourceRef: { module: "m05", anchor: "m05-s3-2" },
  sourceStatus: "matches"|"erratum"|"post-source",   // e.g. the FX PD 2,95% vs printed 3,005%
  sourceNote: "…",               // so a redraft doesn't "fix" a deliberate erratum back in
  caveat: null|"…",              // surfaced on reveal; carries verify-flags
  // …type-specific fields below
}
```

`tags.risk`/`tags.crr` are **controlled vocabularies** validated at load (unknown values rejected).
Orphan `sched` (id with no matching content) is **retained-but-hidden**, surfaced only in export, never
silently deleted.

### 6.2 Type-specific sub-schemas

- **numeric** — `{ params: {generator}, solver, answer: {value (canonical base units, fractions not %), tol, absTol?, unit}, subAnswers: [...] }`. **Parametrised**: fresh inputs per rep via an input generator + reference solver, so spaced reps train the *method*, not the frozen digit. Headline results decompose into graded sub-answers. The pinned 67.400 / 15.520 live **only** as widget golden tests, never as a value a study card checks.
- **cloze** — front carries `{{c1}}` markers; `blanks: [{ id, accept: [...], render }]`. **Math blanks** are authored as inline `\( … \)` fragments or `kind:'pick'` (you cannot blank a token inside a `$$…$$` node).
- **deriveStep** — `steps: [{ prompt, kind, expected, explain }]`; the chain is **one** `sched` entry graded once (never split across a session).
- **discrimination** — `{ claim, verdict: "reg"|"ors"|"mixed", tradeoffRubric: [...] }`. Verdict alone **never** passes; the produced tradeoff must be ticked. Present confusable near-duplicate pairs (e.g. LGD 45% vs 45,5%).
- **viva** — `{ rubric: [{id, text, weight, required}], antiPoints: [...], followUps: [...], modelAnswer }`. Missing any **required** point ⇒ Again; **disqualifiers** (EL double-count, 0,71/1,33 misapplication, wrong sign of −Φ⁻¹(q)) graded **before** awarding positive points. ≥1–2 pre-authored adversarial follow-ups fire after first commit-and-grade.
- **freeRecall** (future-leaning) — blank-page recall; cap cloze share per deck so recognition formats don't dominate.

### 6.3 Numeric input contract

Single `normalizeInput()`: strip currency/thousands separators, comma→dot decimal (German decimal comma),
English fallback; German display reformat on render. Default tolerance **relative ~0.5%** with absolute
override; the accept band must contain **both** the hand-rounded and full-precision recompute. Round-trip
golden tests on 67.400 / 15.520.

### 6.4 Authoring artifacts (P1 gate)

`_card_brief.md` + `card.schema.json` + **one worked exemplar per type** seeded from m05. The m05 deck
must hit a **mandated mix**: ≥2 numeric, ≥1 deriveStep, ≥2 cloze (incl. ≥1 math), ≥2 discrimination,
≥2 viva. A no-build **card-lint** enforces: unique ids, per-type required fields, resolvable `sourceRef`
anchors, tag enums.

---

## 7. SRS engine — `js/srs.js` (pure, synchronous)

### 7.1 Algorithm (pinned for review/test/FSRS-swap)

- **State enum:** `new | learning | review | relearn | suspended`.
- **Learning/graduating intervals:** learning steps (e.g. 10 min, 1 day) → graduating intervals 1d, 6d.
- **Ease:** start 2.5, **floor 1.30**; deltas Again −0.20, Hard −0.15, Good 0, Easy +0.15.
- **Interval growth:** Hard ×1.2, Good ×ease, Easy ×ease×1.3; **max-interval cap ~180d** (promotion timeline).
- **Lapse** = Again on a review card → `relearn` step; post-relearn interval = 0.5×prior, floored at 1d;
  ease −0.20 only, **never zeroed**.
- **Leech:** auto-**suspend** at ≥6 lapses (or 4 lapses at ease floor); flag and route to calibration for
  **re-authoring/breaking-down**, not re-drilling. (Prevents "ease hell" / a derivation card surfacing
  daily forever — guilt through the back door.)
- **Overdue credit:** Good after overdue → interval = (elapsed_since_due + prior_interval) × ease.
- **Fuzz:** ±25% jitter on intervals ≥4d so batch-authored decks de-synchronise.
- Locked by **golden-schedule unit tests**.

### 7.2 Queue selector (separate pure function over the snapshot)

Deterministic ordering pipeline:
1. **Eligibility:** card is `unlockAt` checkpoint-passed **and** all `prereq` introduced (interval ≥ 1 review).
2. **deriveStep chains** are indivisible blocks (one sched entry, presented contiguously).
3. Order due cards by **overdue ratio** (overdue_days / interval) desc; **interleave** across modules/types.
4. **Review cap** ~40/session; **self-throttle** new-card introduction when due backlog > threshold (~30).
5. New cards up to `newCardsPerDay`, tracked in `newIntroduced[utcDate]`.
6. **No same-session cramming credit:** a re-shown failed card never counts for scheduling; max one
   interval advance per card per session; minimum intra-session gap.

### 7.3 Readiness (pure derived, never stored)

For any module **with a deck**, **readiness** is a **pure function of introduced cards' retrievability**
(mean R), with bands and a distinct **`not-started`** state — computed live, never an independent
elapsed-time scalar (that would be a re-skinned illusion-of-fluency timer and disagree with the queue).
The stored `modules[id].readiness` (§5.3) is used **only** as the migration target for the legacy boolean
and as a **fallback for deck-less modules** (m06–m24 before P5); once a module has cards, the derived value
wins and the stored value is ignored. Introduction is **monotonic** — decay never un-introduces a card.
Framed "time to refresh", **never reset to zero**.

---

## 8. Grading & honesty rules (structural, not aspirational)

- **Per-type grade derivation → {Again,Hard,Good,Easy}:** numeric pass/fail; cloze per-blank; viva
  rubric-fraction. **Objective misses force Again** (not user-selectable) so self-grading can't inflate
  machine-gradable cards. A "slip not method" path forces Hard.
- **Confidence at COMMIT time**, before any reveal, for every card type. "Confidently wrong" = top-band
  pre-reveal confidence **and** objective miss. Confidence **does not** affect interval/ease — it feeds
  calibration only (stated in spec and UI). The post-reveal 4-grade is a separate scheduling input.
- **Viva commit is hard:** free-text captured in a textarea; **Reveal LOCKS it** (read-only, timestamped,
  irreversible) and the model answer/rubric **cannot render until non-empty text is committed**. Locked
  text persisted for audit.
- **POE gate on widgets:** a committed direction/magnitude prediction + a checked one-line self-explanation
  before the live number/plot/toggle unlocks (reuse the viva commit-then-tick mechanism).
- **Calibration** headline metric is driven **only by machine-graded types**; self-graded viva
  confidence-vs-rubric shown in a separate, labelled "self-reported" panel (no laundering of leniency).

---

## 9. Study surface — `study.html` (tabbed)

1. **Review** — the daily spaced queue.
2. **Reg/ÖRS drill** — interleaved discrimination (claim → verdict + produced tradeoff).
3. **Viva trainer** — commit → reveal model answer + rubric → tick points → (then adversarial follow-up).
4. **Calibration** — confidently-wrong items, weak chains, suspended leeches.

- **Keyboard state machine:** typing phase (digits = input) → Reveal disables typing, enables 1–4 grading
  + undo. Full keymap + focus management documented (resolves the digit-vs-grade-key collision).
- **a11y / motion / print:** preserve the site's existing posture — visible focus, `prefers-reduced-motion`,
  print styles. Widgets: native range inputs with `aria-valuetext`, an `aria-live` numeric readout as the
  non-visual alternative to the SVG plot, reduced-motion on recompute, a print snapshot of the current
  parameter set.
- **Nav:** a "Study" entry in `course.js`/sidebar + a **"reviews due (n)" badge** on `index.html`
  (built like the existing progress meter).
- **Multi-tab same-device:** reconcile via the `storage` event; last-writer-within-device rules.
- **QuotaExceededError:** bound `reviews`/locked-text; surface a quota warning rather than silently
  dropping a write.

---

## 10. Interactive widgets — m05 (all Predict-Observe-Explain)

- **ASRF conditional-PD explorer** (`js/widgets/asrf.js`): sliders PD, ρ (free vs locked to CRR `R(PD)`),
  q; SVG plot of `p(x)` + worst-case quantile line. Predict-before-slide gate.
- **Problemfall↔Extremfall toggle:** 95%/99.9% → live-recompute worked-example UL (€15,520 ↔ €67,400).
- **Transparent IRB calculator** (`js/widgets/irb.js`): prints every intermediate, tags each input
  `reg`/`ÖRS`; **pinned golden tests** reproduce 67.400 / 15.520. A **study tool only — never positioned
  as a shadow of the official regulated run** (a model-governance liability).
- **Step-gated sign-flip derivation** with self-explanation checks.
- **MathJax rule:** live numbers render as plain mono HTML; `MathJax.typesetPromise([cardNode])` is scoped
  to the inserted node on card flip — **never the page, never per slider tick**.

---

## 11. Reading redesign (m05 as template)

Segment the long module on **conceptual seams** (never mid-derivation) into a checkpointed micro-path; a
micro-retrieval between segments; readiness rollup from card schedules; one consistent **reg/ÖRS
color + icon grammar** on every number. **Anchor grammar:** every section gets an id
(`id="m05-s3-2"`, segment ids for the micro-path); `sourceRef` resolves to it; clicking a card's source
scrolls + transient highlight (respecting reduced-motion). Lint that every `sourceRef` resolves.

---

## 12. Persistence, sync & PWA details

- **Gist reality:** GitHub has **no "fine-grained gist-only" token**; spec a classic PAT with **only the
  `gist` scope** (document that it grants read/write to *all* the user's gists), require expiry + rotation,
  create the secret gist programmatically (document "secret ≠ private"). Token lives only in the
  never-synced device-config namespace; SRI-pin or self-host MathJax/fonts to shrink the exfil surface.
- **iOS eviction:** WebKit evicts local storage after ~7 idle days. Call `navigator.storage.persist()` on
  first use and surface the result; on iOS treat **sync-or-export as REQUIRED, not optional**; prefer
  IndexedDB; bound `reviews`. Document the risk.
- **Export/import:** versioned export (`schemaVersion, exportedAt, deviceId`); import offers **MERGE
  (default, same engine)** vs **REPLACE (confirm)**; auto-snapshot a rolling backup before every sync and
  import.
- **Sync status surfaced distinctly:** auth vs network vs conflict; keep `lastSuccessfulSyncAt` visible;
  on 401/403 prompt re-paste and KEEP the dirty flag; clear `dirty` only after a 2xx; retry on
  `visibilitychange` (no iOS Background Sync).
- **PWA (P4):** SW caches split — **cache-first** for content-hashed static, **network-first /
  stale-while-revalidate** for `data/cards/*.json`. Version SW caches per build; bump app-shell + data
  together; on schema mismatch **force SW update + reload before any write**; never bump state
  `schemaVersion` in a release the SW could still serve old JS for. **Precache MathJax + math font** so
  offline m05 cards don't show raw LaTeX. Add `seenVersion` on `sched`; a content version bump triggers a
  soft "re-verify" flag, never a schedule reset or a "new card" classification.

---

## 13. File structure (new / changed)

```
study.html                       unified study surface (Review/Drill/Viva/Calibration tabs)
js/course.js                     extracted COURSE table-of-contents (reused by study.html)
js/store.js                      ProgressStore (async ready + sync snapshot + patch) + LocalStorage + GistSync
js/srs.js                        pure SM-2-lite scheduler (golden-tested)
js/queue.js                      pure queue selector (eligibility, chains, overdue, cap, interleave)
js/migrate.js                    versioned v1→v2 migration runner (above the adapter)
js/study.js                      study-mode UI controllers (owns all async load/patch)
js/widgets/asrf.js, irb.js       m05 Predict-Observe-Explain widgets
data/cards/m05.json              the m05 deck (content)
card.schema.json, _card_brief.md authoring schema + brief + per-type exemplars
test/…                           no-build test harness: SM-2 golden schedule, IRB golden numbers, card-lint, migration
manifest.webmanifest, sw.js      PWA (P4)
js/app.js                        FROZEN external behavior + global MCQ-neuter + index denominator fix
index.html                       "reviews due (n)" badge + Study nav
modules/m05.html                 segmented micro-path + anchors + embedded widgets
```

---

## 14. Sequencing (becomes the implementation plan)

- **P0 — Seam & safety.** `store.js` (async `ready` + snapshot + `patch` + subscribe contract),
  state-root schema, `migrate.js` (v1→v2 to new key, non-destructive), export/import, device-config
  namespace, **global MCQ-neuter + banner + index denominator fix**, `course.js` extraction, app.js freeze.
  Backward-compat acceptance tests.
- **P1 — Core loop.** `srs.js` (+ golden tests), `queue.js`, Review mode, `card.schema.json` + `_card_brief.md`
  + card-lint, the **m05 deck** (mandated type mix), numeric `normalizeInput` + golden tests.
- **P2 — Discrimination, calibration, viva.** Reg/ÖRS drill, commit-time confidence + locked viva +
  rubric/anti-points/follow-ups, Calibration dashboard (machine-graded headline + self-reported panel).
- **P3 — Widgets & reading.** ASRF explorer, Problemfall/Extremfall toggle, transparent IRB calculator
  (golden tests), step-gated derivation, m05 segmentation + anchors + readiness rollup.
- **P4 — Sync & mobile.** Gist sync (pull-merge-push, status surfacing, backups), `persist()` + iOS
  handling, PWA (SW cache split + MathJax precache + schema-skew guard).
- **P5 — Rollout.** Roll templates across m01–m24 (batched authoring for owner review); retire legacy
  `leitfaden_progress_v1`; route the sidebar/index to readiness.

**Deferred:** FSRS swap (scheduler change only, content/state already split); `SupabaseStore` adapter for
multi-user.

---

## 15. m05 vertical-slice acceptance tests

- After the m05 deploy, **m01/m04/capstone/index** sidebar, grid, meter, and quiz grading are
  **byte-for-byte unchanged** (preserve `window.COURSE`, `renderIndexProgress`, global-`QUIZ` path).
- Migration: a browser holding `leitfaden_progress_v1={m05:true}` hydrates to
  `modules.m05.readiness='review-soon'` with no fabricated due cards; v1 key still present.
- SM-2 golden-schedule tests pass; IRB calculator reproduces 67.400 / 15.520; numeric grading accepts
  `67.400` / `67400` / `EUR 67,400`.
- A leech (≥6 lapses) auto-suspends and appears in Calibration, not the daily queue.
- Viva: model answer/rubric will not render until non-empty text is committed; revealed text is locked.
- Two-device sim: offline phone reviews + laptop reviews → record-level merge loses **no** grades.

## 16. Open risks

- **Self-grading honesty** — mitigated structurally (§8): pre-authored rubrics, required productions,
  commit-lock, machine-forces-Again, commit-time confidence.
- **localStorage / iOS durability** — mitigated: export/import + Gist sync + `persist()` + iOS
  sync-required (§12).
- **Authoring volume across 24 modules** — mitigated: Claude drafts/owner reviews; templates locked on m05
  first; P5 batched.
- **Content currency** (09/2024, FX erratum, CRR III) — mitigated: `version`/`seenVersion`/`sourceStatus`;
  spaced-repeat the *method*, never the frozen digit.

## 17. Provenance

Grounded in the live repo (`js/app.js` 203 lines, `STORE_KEY="leitfaden_progress_v1"` boolean map, per-page
`QUIZ` engine; 24 modules + `capstone.html` + `glossary.html`). Produced via council + grilling +
adversarial design review (transcripts in the session's workflow dirs).
