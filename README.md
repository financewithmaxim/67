# EU Bank Capital Regulation & the ÖRS *Leitfaden Früherkennung* — interactive course

A self-paced, browser-based graduate course that reconstructs the Austrian Raiffeisen
sector's **ÖRS *Leitfaden Früherkennung* (Version 09/2024)** from first principles — every
risk figure derived, anchored to the **CRR article** it comes from, and contrasted with the
**pragmatic ÖRS modelling choices** layered on top.

Built for a **Junior Risk Controller in Sector Risk Controlling Services**: quant-strong,
fluent in R/SQL, aiming to deepen the *why* behind the methodology and defend it to senior
management and the Aufsichtsrat.

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
index.html              Home: curriculum, progress meter, the "reg vs ÖRS" rule
glossary.html           Bilingual DE/EN glossary (105 terms, live search)
capstone.html           Full mock-RTFA for a hypothetical Raiffeisenbank + viva
modules/
  m01 … m03             Teil I  — Regulatory architecture (Basel→CRR→ICAAP→ÖRS)
  m04 … m11             Teil II — Risikotragfähigkeit (RTFA, credit, market, CVA,
                                  op, liquidity, participation, other risks)
  m12 … m14             Teil III— Aggregation, Deckungsmassen, data & reporting
  m15                   Teil IV — Default (Art. 178) & LGD estimation
  m16 … m17             Teil V  — Basel IV/CRR III & deposit guarantee (context)
css/style.css           Design system
js/app.js               Sidebar, progress tracking, quiz engine
_authoring_brief.md     Internal fact-sheet mapping every figure to its source (not a page)
```

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
