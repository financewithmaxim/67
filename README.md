# EU Bank Capital Regulation & the ÖRS *Leitfaden Früherkennung*

Two coordinated tracks that reconstruct the Austrian Raiffeisen sector's **ÖRS *Leitfaden
Früherkennung* (Version 09/2024)** from first principles — every risk figure derived,
anchored to the **CRR article** it comes from, and contrasted with the **pragmatic ÖRS
modelling choices** layered on top.

Built for a **Junior Risk Controller in Sector Risk Controlling Services**: quant-strong,
fluent in R/SQL, aiming to derive every model from scratch, reproduce every number by hand
and in R, and defend the methodology to senior management and the Aufsichtsrat.

## Two tracks — start with the graduate program

| Track | Entry point | What it is |
|---|---|---|
| **Graduate program** (primary, assessed) | **`index.html`** | A semester-length, university-rigor program: **Course 0 → 6 + a defended capstone**, built **one unit at a time, gated on demonstrated mastery (85 %, soft gate)**. Multiple lectures per unit, primary-source reading walkthroughs, full derivations, worked examples on the guide's own parameters, R per derivation, and a **real assessment engine** — numeric problem sets (hand + R, tolerance-checked), blank-page derivations, find-the-error, transfer tasks, teach-back, adversarial **viva**, calibration, an error log and spaced repetition. |
| **Reference course** (background) | `modules/m01.html` | The original 17-module + capstone coverage course (Basel→CRR→ICAAP→ÖRS, all risk types, Deckungsmassen, default & LGD, CRR III, deposit guarantee). Use as background reading and a coverage map; assessment is multiple-choice only. |

### What's live in the graduate program

**Course 0 · Unit 1 — Probability, distributions & the quantile machinery** is built and
assessed today: four lectures take you from the probability-space skeleton to *reproducing
real Leitfaden numbers from first principles* — the **CVA scalars 0,71 / 1,33**, the
**lognormal 5,180 / 21,982**, and the **op-risk Problemfall factor 5,0 %** — plus a graded
problem set and an adversarial viva. Every asserted number is verified numerically. The rest
of the spine (Courses 0.2–6 + capstone) is the agreed roadmap, unlocked one unit at a time.

## How to open

It's a static site — no build step, no server needed.

```
open index.html        # macOS
# or just double-click index.html in a file browser
```

For the interactive quizzes and MathJax formulas to render, open it in a normal browser with
internet access (MathJax loads from a CDN). Progress is stored in your browser's
`localStorage` — completing a module's quiz marks it ✓ on the home page.

## Structure

```
index.html              GRADUATE PROGRAM home: full Course 0–6 curriculum + mastery dashboard
program/
  c0u1.html             Course 0 · Unit 1 — hub (objectives, prerequisites, gateway)
  c0u1-l1 … l4.html     four lectures (probability → quantiles → lognormal → op-risk 5,0%)
  c0u1-pset.html        Problem Set 0.1 (graded: numeric, derivation, find-error, transfer, teach-back)
  c0u1-viva.html        Viva 0.1 (adversarial defense, six escalating probes)
  css/program.css       component layer (imports the reference design system)
  js/program.js         engine: curriculum model, mastery/calibration/error-log/spaced-rep, problem-set grading

modules/  m01 … m17     REFERENCE COURSE (background) — Basel→CRR→ÖRS, all risks, Deckungsmassen, default/LGD, CRR III, DGS
capstone.html           Reference course mock-RTFA + viva
glossary.html           Bilingual DE/EN glossary (105 terms, live search)
css/style.css           shared design system
js/app.js               reference-course engine (sidebar, MC quiz)
_authoring_brief.md     internal fact-sheet mapping every Leitfaden figure to its source
```

Progress, mastery scores, calibration and the error log are stored in `localStorage`
(key `grad_program_v1`); the reference course uses `leitfaden_progress_v1` separately.

## Pedagogy

Each module follows a fixed loop: **Motivation → Concept → Derivation → Worked example →
In practice → Nuances & traps → Quiz → Recap** (English + a German recap). Every fixed
parameter is tagged as a **regulatory value** (the CRR/EBA forces it) or an **ÖRS modelling
decision** (proportionality), with the trade-off named. Highlights:

- The **IRB risk-weight formula** (CRR Art. 153/154) derived from Merton → Vasicek → ASRF.
- The **0,71 / 1,33** CVA scalars and the **5%** op-risk factor derived from VaR consistency.
- The **FLVaR** and **Mischzinssatz** construction; the **HHI** granularity surcharge.
- A flagged **erratum** in the Leitfaden's own FX example (governing elasticity = 1,9).

## Accuracy

Primary source: ÖRS *Leitfaden Früherkennung* 09/2024. Concepts are anchored to the
CRR/CRD, Basel standards and EBA guidelines. Material that **post-dates** the guide —
**CRR III / Basel IV** (op-risk SMA, revised CVA, output floor, FRTB) and **DGSD/ESAEG**
deposit-guarantee specifics — is explicitly flagged for verification against current
EUR-Lex / EBA / FMA sources. This is an educational reconstruction, not an official ÖRS document.
