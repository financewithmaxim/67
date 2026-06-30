# Leitfaden Trainer — Learning-UX Redesign (design spec)

**Problem.** The content and exercises are strong, but the presentation reads like the dense ÖRS *Leitfaden* handout we set out to replace: serif body in an 800px column, a flat vertical scroll of long prose + inline derivations, deliberately *quiet* callouts, and everything visible at full weight at once → cognitive overload on first read. It looks like a paper, not a lesson.

**Goal.** Transform every page from "academic document" into a **guided, chunked, app-like lesson** — without changing a word of content, keeping MathJax intact, no build step. Audience: a quant-strong Junior Risk Controller studying for a promotion and to defend methodology to a supervisory board, so: confident, professional, calm — never childish/gamified.

**Approved design decisions (2026-06-30):**
- **Typography:** Lexend (headings/UI) + Source Sans 3 (body) + JetBrains Mono (figures/code). Body ~17px / line-height ~1.6 / measure ~66–72 chars. Lexend is engineered to raise reading proficiency — the single biggest break from the "paper" feel.
- **Progressive disclosure:** intuition-first. Each section leads with the plain idea + key result; the heavy derivation / symbol-definition (`.where`) / large tables collapse behind "Show the math", with a global "Expand all math" for revision. Collapsed by default.
- **Dark mode:** light + a calm, desaturated, AAA-contrast dark "study mode"; toggle persisted (`localStorage`), defaulting to `prefers-color-scheme`.

**Design language** (from ui-ux-pro-max: Swiss-Modernism/Minimal-Direct + Corporate-Trust type):
- Clean light surface + white cards (cooler, less "parchment"); navy/blue structural brand; ONE confident accent; preserved semantics (green = mastery/correct, amber = trap/verify, red = erratum/wrong); the reg(navy)/ÖRS(purple) split kept as the signature but made to *pop*.
- 8px spacing rhythm; consistent radius + a small elevation scale; 150–300ms entrance/expand motion (reduced-motion-safe); visible focus; AAA contrast; true mobile-first.

**Architecture (safe by construction).** All driven by:
1. A rewritten `css/style.css` — same CSS variable + class **API preserved** (app.js and inline `style="var(--…)"` hooks across 26 pages depend on it), modernized values, plus `[data-theme="dark"]` overrides and new section-card / disclosure / theme-toggle styles.
2. A small JS "lesson enhancer" (`js/lesson.js`) + theme manager that restructure the **existing DOM at load** — exactly how `js/widgets/micropath.js` already works — to add: section "step" cards, a sticky "Section X of N" progress rail, "Show the math" disclosures, a theme toggle, and active-reading checkpoints. No content rewrites; degrades gracefully if JS/MathJax is blocked.

**Phases** (each: implement → review → browser-verify in light + dark):
- **A — Visual foundation.** Rewrite `css/style.css` (Lexend type system, spacing rhythm, refined components, full dark theme) + a tiny theme manager + toggle. Site-wide transformation through the shared stylesheet; verify across module/index/study/glossary in both themes. *Biggest immediate win; shown to the owner before heavier phases.*
- **B — Lesson enhancer.** `js/lesson.js`: numbered `<h2>` sections → step cards; sticky per-lesson progress rail (supersedes/merges the micro-path); "Show the math" progressive disclosure + "Expand all". Rolled to all 24 modules + glossary/capstone via one `<script type="module">` include each (mechanical, codemod-style).
- **C — Home & Trainer.** Home curriculum grid → a clean "learning path" (module cards, readiness bands, one "Continue" CTA). Trainer (`study.html`) → a focused single-card app flow with calmer chrome and satisfying grade feedback.
- **D — Active reading.** Self-explanation checkpoints + "predict → reveal" on key results, on all modules (not just m05).

**Out of scope / unchanged:** the content text, the SRS engine + tests, deck JSON, the anchor scheme, MathJax. The class/variable API must not break (regression risk for inline hooks).

**Verification:** `node --test` stays green; headless-Chrome smoke per phase in BOTH themes at 375 / 768 / 1280 widths; screenshots reviewed; zero console errors; AAA contrast spot-checked.
