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
