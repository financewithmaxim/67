# Leitfaden Trainer — P3: Interactive Widgets & Reading Anchors — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the hardest m05 quant *tangible and interactive* — a pure, golden-tested IRB math module (`js/irb.js`), a **transparent IRB calculator** (prints every intermediate, tags each reg vs ÖRS, reproduces €67,400/€15,520 and shows the literal CRR maturity factor ~1.23 as the reg contrast), an **ASRF conditional-PD explorer** (sliders + live SVG plot, Predict-Observe-Explain gated) with a **Problemfall↔Extremfall toggle**, all embedded in `modules/m05.html`; plus **section anchors** matching the deck's `sourceRef`s and a "jump to source" link in the Trainer reveal.

**Architecture:** All regulatory math lives in ONE pure, Node-tested module `js/irb.js` (normal CDF/inverse + the CRR IRB formula). The widgets are thin DOM controllers (`js/widgets/*.js`, ES modules) that import `irb.js`; they are embedded in `modules/m05.html` via `<script type="module">` and verified by a browser smoke. **Domain decision (confirmed with the owner):** at M=2.5 the ÖRS methodology sets the maturity adjustment to **1** (a proportionality simplification) → UL €67,400; the literal CRR factor `(1+(M−2.5)b)/(1−1.5b) ≈ 1.231` at M=2.5 is shown as the **reg** contrast, never as the ÖRS number.

**Tech Stack:** Vanilla JS ES modules, no build step; Node `node --test`; inline SVG for the plot; MathJax already on module pages.

## Global Constraints

- **No build step.** `js/irb.js` is a PURE ES module (no DOM/storage/`Date.now`/`Math.random`). Widgets are ES modules importing `irb.js`; `modules/m05.html` loads them via `<script type="module">` (in addition to its existing classic `app.js`).
- **IRB math is the single source of truth + golden-tested.** `computeIRB` reproduces the worked example: UL within 1% of **67,400** (Extremfall, q=0.999) and **15,520** (Problemfall, q=0.95), R ≈ 0.1806, conditional PD ≈ 0.1618, all with the ÖRS maturity adjustment = 1. The literal `maturityAdjCRR(2.5, PD) ≈ 1.231` is asserted separately (the reg contrast).
- **Predict-Observe-Explain:** the ASRF explorer must require a committed prediction before it reveals the live plot/number (no bare fiddle-toy). MathJax is typeset ONCE on the static skeleton; live numbers render as plain mono HTML, never re-typeset per slider tick.
- **Reg/ÖRS spine everywhere:** the calculator tags every value (R, the 12.5, the curve = reg; M=2.5, maturity-adj=1, the 95% Problemfall quantile, pooled LGD = ÖRS).
- Reuse `css/style.css` tokens; append only a small `.widget-*` block. Carry forward all prior invariants. `modules/m05.html` existing content/quiz must keep working.

## File Structure

- `js/irb.js` — **create**. Pure. `normCdf`, `normInv`, `assetCorrelation`, `maturityB`, `maturityAdjCRR`, `conditionalPD`, `computeIRB`.
- `js/widgets/irb-calc.js` — **create**. Transparent IRB calculator (DOM), mounts into `#irb-calc`.
- `js/widgets/asrf.js` — **create**. ASRF explorer + Problemfall/Extremfall toggle (DOM + SVG), mounts into `#asrf-explorer`.
- `modules/m05.html` — **modify**. Add section anchors; add widget mount points + module-script imports.
- `js/study.js` — **modify**. Add a "jump to source" link in the reveal (using `card.sourceRef`).
- `css/style.css` — **modify**. Append `.widget-*` styles.
- `test/irb.test.js` — **create**.

> Deferred to P3b/P4 (correctly absent): full reading segmentation into a checkpointed micro-path + readiness rollup (P3b); step-gated derivation widget (the deck's `deriveStep` card covers that retrieval); Gist sync + PWA (P4).

---

### Task 1: The IRB math engine (`js/irb.js`)

**Files:**
- Create: `js/irb.js`, `test/irb.test.js`

**Interfaces:**
- Produces: `normCdf(x)`, `normInv(p)`, `assetCorrelation(pd)`, `maturityB(pd)`, `maturityAdjCRR(M, pd)`, `conditionalPD(pd, R, q)`, `computeIRB({EAD, PD, LGD, M=2.5, q=0.999})` → `{R, condPD, maturityAdjOrs, maturityAdjCRR, K, UL, EL, RWA}` (PD/LGD as fractions; `maturityAdjOrs` is always 1 per the ÖRS convention; K/UL use the ÖRS adjustment).

- [ ] **Step 1: Write the failing test** — `test/irb.test.js`

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normCdf, normInv, assetCorrelation, maturityAdjCRR, conditionalPD, computeIRB } from '../js/irb.js';

const near = (a, b, tol) => assert.ok(Math.abs(a - b) <= tol, `${a} not within ${tol} of ${b}`);

test('normInv reproduces the scenario quantiles', () => {
  near(normInv(0.999), 3.0902, 1e-3);
  near(normInv(0.95), 1.6449, 1e-3);
  near(normInv(0.013669), -2.2064, 1e-3);
});

test('normCdf basics + inverse round-trip', () => {
  near(normCdf(0), 0.5, 1e-9);
  near(normCdf(3.0902), 0.999, 1e-4);
  near(normCdf(normInv(0.137)), 0.137, 1e-4);
});

test('assetCorrelation matches the worked example (~0.1806 at PD=1.3669%)', () => {
  near(assetCorrelation(0.013669), 0.1806, 1e-3);
});

test('conditional PD (Extremfall) ~0.1618', () => {
  const R = assetCorrelation(0.013669);
  near(conditionalPD(0.013669, R, 0.999), 0.1618, 5e-3);
});

test('the literal CRR maturity factor at M=2.5 is ~1.231 (the reg contrast, NOT 1)', () => {
  near(maturityAdjCRR(2.5, 0.013669), 1.231, 5e-3);
});

test('computeIRB reproduces the ÖRS worked example: Extremfall UL ~67,400', () => {
  const r = computeIRB({ EAD: 1_000_000, PD: 0.013669, LGD: 0.455, M: 2.5, q: 0.999 });
  assert.equal(r.maturityAdjOrs, 1);                 // ÖRS convention
  near(r.R, 0.1806, 1e-3);
  near(r.UL, 67400, 67400 * 0.01);                   // within 1%
});

test('computeIRB Problemfall (q=0.95) UL ~15,520', () => {
  const r = computeIRB({ EAD: 1_000_000, PD: 0.013669, LGD: 0.455, M: 2.5, q: 0.95 });
  near(r.UL, 15520, 15520 * 0.01);
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `node --test test/irb.test.js`
Expected: FAIL — `Cannot find module '../js/irb.js'`.

- [ ] **Step 3: Implement `js/irb.js`**

```js
// Pure IRB / Vasicek math — the single source of truth for the calculator + ASRF widget.
// No I/O, no Date.now, no Math.random.

// Standard normal CDF via Abramowitz–Stegun 7.1.26 (abs error ~1.5e-7).
function erf(x) {
  const s = x < 0 ? -1 : 1; x = Math.abs(x);
  const t = 1 / (1 + 0.3275911 * x);
  const y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x);
  return s * y;
}
export function normCdf(x) { return 0.5 * (1 + erf(x / Math.SQRT2)); }

// Inverse normal CDF (Acklam's rational approximation, abs error ~1.15e-9).
export function normInv(p) {
  if (p <= 0) return -Infinity;
  if (p >= 1) return Infinity;
  const a = [-3.969683028665376e+01, 2.209460984245205e+02, -2.759285104469687e+02, 1.383577518672690e+02, -3.066479806614716e+01, 2.506628277459239e+00];
  const b = [-5.447609879822406e+01, 1.615858368580409e+02, -1.556989798598866e+02, 6.680131188771972e+01, -1.328068155288572e+01];
  const c = [-7.784894002430293e-03, -3.223964580411365e-01, -2.400758277161838e+00, -2.549732539343734e+00, 4.374664141464968e+00, 2.938163982698783e+00];
  const d = [7.784695709041462e-03, 3.224671290700398e-01, 2.445134137142996e+00, 3.754408661907416e+00];
  const plow = 0.02425, phigh = 1 - plow;
  let q, r;
  if (p < plow) { q = Math.sqrt(-2 * Math.log(p)); return (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1); }
  if (p <= phigh) { q = p - 0.5; r = q * q; return (((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q / (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1); }
  q = Math.sqrt(-2 * Math.log(1 - p)); return -(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
}

// CRR Art. 153 corporate asset correlation (interpolates 0.24 → 0.12).
export function assetCorrelation(pd) {
  const w = (1 - Math.exp(-50 * pd)) / (1 - Math.exp(-50));
  return 0.12 * w + 0.24 * (1 - w);
}

// CRR maturity-adjustment smoothing b(PD) and the literal factor (the reg contrast).
export function maturityB(pd) { const v = 0.11852 - 0.05478 * Math.log(pd); return v * v; }
export function maturityAdjCRR(M, pd) { const b = maturityB(pd); return (1 + (M - 2.5) * b) / (1 - 1.5 * b); }

// Vasicek stressed (conditional) PD at confidence q.
export function conditionalPD(pd, R, q) {
  return normCdf((normInv(pd) + Math.sqrt(R) * normInv(q)) / Math.sqrt(1 - R));
}

// Worked-example pipeline. ÖRS fixes M=2.5 AND sets the maturity adjustment to 1 (proportionality);
// the literal CRR factor is returned alongside as the reg contrast.
export function computeIRB({ EAD, PD, LGD, M = 2.5, q = 0.999 }) {
  const R = assetCorrelation(PD);
  const condPD = conditionalPD(PD, R, q);
  const maturityAdjOrs = 1;                              // ÖRS convention (confirmed)
  const K = LGD * (condPD - PD) * maturityAdjOrs;
  const UL = K * EAD;
  const EL = LGD * PD * EAD;
  const RWA = K * 12.5 * EAD;
  return { R, condPD, maturityAdjOrs, maturityAdjCRR: maturityAdjCRR(M, PD), K, UL, EL, RWA };
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `node --test test/irb.test.js`
Expected: PASS (7 tests). Then `node --test` — whole suite green.

- [ ] **Step 5: Commit**

```bash
git add js/irb.js test/irb.test.js
git commit -m "feat(trainer): pure golden-tested IRB math (Vasicek + normCdf/normInv; OERS maturity=1, CRR contrast)"
```

---

### Task 2: Transparent IRB calculator widget (`js/widgets/irb-calc.js`)

**Files:**
- Create: `js/widgets/irb-calc.js`
- Modify: `modules/m05.html` (mount point + import), `css/style.css` (append)

**Interfaces:**
- Consumes: `computeIRB`, `normInv`, `assetCorrelation` from `../irb.js`.
- Produces: a self-mounting calculator at `#irb-calc` — inputs EAD/PD/LGD/M + a Problemfall/Extremfall toggle; prints every intermediate (R, √R, Φ⁻¹(PD), Φ⁻¹(q), conditional PD, maturity adj, K, UL, EL, RWA), each tagged reg/ÖRS; reproduces 67,400 / 15,520; shows the literal CRR maturity factor as the reg contrast.

- [ ] **Step 1: Implement `js/widgets/irb-calc.js`**

```js
import { computeIRB, normInv, assetCorrelation } from '../irb.js';

const fmtEUR = n => '€' + Math.round(n).toLocaleString('de-DE');
const pct = (x, d = 2) => (x * 100).toFixed(d) + '%';
const tag = (k) => k === 'reg' ? '<span class="tag reg">regulatory</span>' : '<span class="tag ors">ÖRS choice</span>';

export function mountIrbCalc(el) {
  if (!el) return;
  el.innerHTML = `
    <div class="widget">
      <div class="widget-title">Transparent IRB calculator <span class="widget-sub">every intermediate, tagged reg vs ÖRS</span></div>
      <div class="widget-controls">
        <label>EAD (€) <input id="ic-ead" type="number" value="1000000" step="10000"></label>
        <label>PD (%) <input id="ic-pd" type="number" value="1.3669" step="0.01"></label>
        <label>LGD (%) <input id="ic-lgd" type="number" value="45.5" step="0.5"></label>
        <label>Scenario
          <select id="ic-q"><option value="0.999">Extremfall (99,9%)</option><option value="0.95">Problemfall (95%)</option></select>
        </label>
      </div>
      <div id="ic-out" class="widget-out"></div>
    </div>`;
  const recompute = () => {
    const EAD = +el.querySelector('#ic-ead').value;
    const PD = (+el.querySelector('#ic-pd').value) / 100;
    const LGD = (+el.querySelector('#ic-lgd').value) / 100;
    const q = +el.querySelector('#ic-q').value;
    if (!(PD > 0 && PD < 1) || !(LGD >= 0 && LGD <= 1) || !(EAD > 0)) { el.querySelector('#ic-out').innerHTML = '<p class="widget-err">Enter PD and LGD in (0,100) and a positive EAD.</p>'; return; }
    const r = computeIRB({ EAD, PD, LGD, M: 2.5, q });
    const rows = [
      ['Asset correlation R', r.R.toFixed(4), 'reg'],
      ['Φ⁻¹(PD)', normInv(PD).toFixed(4), 'reg'],
      ['Φ⁻¹(q)', normInv(q).toFixed(4), q === 0.95 ? 'ors' : 'reg'],
      ['Conditional (stressed) PD', pct(r.condPD), 'reg'],
      ['Maturity adjustment (M=2,5)', r.maturityAdjOrs.toFixed(0) + '  — CRR literal would be ' + r.maturityAdjCRR.toFixed(3), 'ors'],
      ['K (capital per unit EAD)', r.K.toFixed(5), 'reg'],
      ['Expected loss EL', fmtEUR(r.EL), 'reg'],
      ['RWA (= K·12,5·EAD)', fmtEUR(r.RWA), 'reg'],
    ];
    el.querySelector('#ic-out').innerHTML =
      `<table class="widget-table">${rows.map(([k, v, t]) => `<tr><td>${k}</td><td class="num">${v}</td><td>${tag(t)}</td></tr>`).join('')}</table>
       <div class="widget-headline">Unexpected loss UL = <strong>${fmtEUR(r.UL)}</strong></div>
       <p class="widget-note">ÖRS fixes M=2,5 and sets the maturity adjustment to 1 (proportionality). The literal CRR factor at M=2,5 is ≈${r.maturityAdjCRR.toFixed(3)} — applying it would give UL ≈ ${fmtEUR(r.UL * r.maturityAdjCRR)}. That gap is the reg-vs-ÖRS trade-off.</p>`;
  };
  el.querySelectorAll('input,select').forEach(i => i.addEventListener('input', recompute));
  recompute();
}

const mount = document.getElementById('irb-calc');
if (mount) mountIrbCalc(mount);
```

- [ ] **Step 2: Embed in `modules/m05.html`** — in the Worked-example section (§4), after the worked-example box, add a mount point:

```html
    <div id="irb-calc"></div>
```

And before `</body>` (after the existing `<script src="../js/app.js"></script>` and the page's `QUIZ` script), add:

```html
<script type="module" src="../js/widgets/irb-calc.js"></script>
```

- [ ] **Step 3: Append widget CSS to `css/style.css`**

```css
/* ---------- Interactive widgets ---------- */
.widget { background: var(--bg-card); border: 1px solid var(--line-strong); border-left: 3px solid var(--accent); border-radius: var(--radius); padding: 16px 20px; margin: 22px 0; box-shadow: var(--shadow-sm); }
.widget-title { font-family: var(--font); font-weight: 700; color: var(--brand); font-size: 15px; margin-bottom: 12px; }
.widget-sub { font-weight: 400; color: var(--ink-faint); font-size: 12.5px; }
.widget-controls { display: flex; flex-wrap: wrap; gap: 14px; margin-bottom: 12px; }
.widget-controls label { font-family: var(--font); font-size: 13px; color: var(--ink-soft); display: flex; flex-direction: column; gap: 3px; }
.widget-controls input, .widget-controls select { font-family: var(--mono); font-size: 14px; padding: 6px 8px; border: 1px solid var(--line-strong); border-radius: var(--radius-sm); }
.widget-table { width: 100%; font-size: 14px; border-collapse: collapse; }
.widget-table td { padding: 5px 8px; border-bottom: 1px solid var(--line); }
.widget-table td.num { font-family: var(--mono); text-align: right; }
.widget-headline { font-family: var(--font); font-size: 17px; margin-top: 12px; color: var(--brand); }
.widget-note { font-size: 13px; color: var(--ink-faint); margin-top: 8px; line-height: 1.55; }
.widget-err { color: var(--red); font-size: 13.5px; }
.widget-range { display: flex; align-items: center; gap: 10px; }
.widget-readout { font-family: var(--mono); font-variant-numeric: tabular-nums; }
.asrf-plot { width: 100%; max-width: 560px; height: 240px; background: #fbfaf5; border: 1px solid var(--line); border-radius: var(--radius-sm); }
.widget-gate { background: var(--reg-bg); border: 1px dashed var(--line-strong); border-radius: var(--radius-sm); padding: 12px 14px; font-size: 14px; }
```

- [ ] **Step 4: Verify (Node) and commit**

```bash
node --check js/widgets/irb-calc.js && echo "irb-calc syntax OK"
node -e "import('./js/widgets/irb-calc.js').catch(e => { if (!/document is not defined|Cannot read properties of null/.test(String(e))) { console.error('UNEXPECTED', e); process.exit(1); } console.log('imports OK'); })"
grep -c 'id="irb-calc"' modules/m05.html   # expect 1
node --test                                # whole suite green
git add js/widgets/irb-calc.js modules/m05.html css/style.css
git commit -m "feat(trainer): transparent IRB calculator widget embedded in m05"
```

- [ ] **Step 5: Manual browser smoke (controller drives via the run skill)** — open `modules/m05.html`: the calculator renders under the worked example; default inputs show UL ≈ €67.400 (Extremfall); switching to Problemfall shows ≈ €15.520; every row carries a reg/ÖRS tag; the maturity-adjustment row shows 1 with the CRR-literal ≈1.231 note.

---

### Task 3: ASRF conditional-PD explorer + Problemfall/Extremfall toggle (`js/widgets/asrf.js`)

**Files:**
- Create: `js/widgets/asrf.js`
- Modify: `modules/m05.html` (mount point + import)

**Interfaces:**
- Consumes: `normCdf`, `normInv`, `assetCorrelation`, `conditionalPD` from `../irb.js`.
- Produces: a self-mounting Predict-Observe-Explain explorer at `#asrf-explorer` — sliders for PD, ρ (with a "lock ρ to the CRR R(PD) curve" checkbox), and a 95%/99,9% toggle; an SVG plot of the conditional default rate p(x) over the systematic factor x with the worst-case quantile line; a live conditional-PD readout. The plot/readout stay hidden until the learner commits a prediction.

- [ ] **Step 1: Implement `js/widgets/asrf.js`**

```js
import { normCdf, normInv, assetCorrelation, conditionalPD } from '../irb.js';

// p(x) = Φ( (Φ⁻¹(PD) − √ρ·x) / √(1−ρ) ) — default rate in economy state x.
function pOfX(pd, rho, x) { return normCdf((normInv(pd) - Math.sqrt(rho) * x) / Math.sqrt(1 - rho)); }

function plotSvg(pd, rho, q) {
  const W = 560, H = 240, padL = 40, padB = 26, padT = 10, padR = 10;
  const x0 = -4, x1 = 4;
  const sx = v => padL + (v - x0) / (x1 - x0) * (W - padL - padR);
  const sy = v => padT + (1 - v) * (H - padT - padB);
  let pts = '';
  for (let i = 0; i <= 120; i++) { const x = x0 + (x1 - x0) * i / 120; pts += `${sx(x).toFixed(1)},${sy(pOfX(pd, rho, x)).toFixed(1)} `; }
  const xq = -normInv(q);                          // worst-case factor
  const condX = sx(xq);
  return `<svg class="asrf-plot" viewBox="0 0 ${W} ${H}" role="img" aria-label="conditional default rate p(x) versus the systematic factor x">
    <line x1="${padL}" y1="${sy(0)}" x2="${W - padR}" y2="${sy(0)}" stroke="#d3cfc4"/>
    <line x1="${sx(0)}" y1="${padT}" x2="${sx(0)}" y2="${H - padB}" stroke="#e6e3db"/>
    <polyline fill="none" stroke="#1d3a5c" stroke-width="2" points="${pts}"/>
    <line x1="${condX}" y1="${padT}" x2="${condX}" y2="${H - padB}" stroke="#b23a2c" stroke-dasharray="4 3"/>
    <text x="${condX + 4}" y="${padT + 12}" font-size="11" fill="#b23a2c">worst case x=−Φ⁻¹(q)</text>
    <text x="${padL}" y="${H - 8}" font-size="11" fill="#6c7682">bad economy ← x → good economy</text>
  </svg>`;
}

export function mountAsrf(el) {
  if (!el) return;
  el.innerHTML = `
    <div class="widget">
      <div class="widget-title">ASRF conditional-PD explorer <span class="widget-sub">predict, then observe</span></div>
      <div id="asrf-gate" class="widget-gate">
        <strong>Predict first:</strong> as the asset correlation ρ rises, does the 99,9% conditional PD go <em>up</em> or <em>down</em>?
        <label><input type="radio" name="asrf-pred" value="up"> up</label>
        <label><input type="radio" name="asrf-pred" value="down"> down</label>
        <button class="btn" id="asrf-reveal">Reveal the plot</button>
      </div>
      <div id="asrf-body" style="display:none">
        <div class="widget-controls">
          <label class="widget-range">PD <input id="asrf-pd" type="range" min="0.1" max="35" step="0.1" value="1.3669"><span class="widget-readout" id="asrf-pd-r"></span></label>
          <label class="widget-range">ρ <input id="asrf-rho" type="range" min="0.04" max="0.30" step="0.005" value="0.18"><span class="widget-readout" id="asrf-rho-r"></span></label>
          <label><input type="checkbox" id="asrf-lock"> lock ρ to CRR R(PD)</label>
          <label>q <select id="asrf-q"><option value="0.999">99,9% (Extremfall)</option><option value="0.95">95% (Problemfall)</option></select></label>
        </div>
        <div id="asrf-plot"></div>
        <div class="widget-headline">Conditional PD = <strong id="asrf-cond">—</strong> <span class="widget-sub" id="asrf-expl"></span></div>
      </div>
    </div>`;

  const body = el.querySelector('#asrf-body');
  el.querySelector('#asrf-reveal').addEventListener('click', () => {
    const pred = el.querySelector('input[name="asrf-pred"]:checked');
    if (!pred) { alert('Commit a prediction first — that is the point.'); return; }
    el.querySelector('#asrf-gate').style.display = 'none';
    body.style.display = 'block';
    body.dataset.pred = pred.value;
    render();
  });

  function render() {
    const lock = el.querySelector('#asrf-lock').checked;
    const pd = (+el.querySelector('#asrf-pd').value) / 100;
    let rho = +el.querySelector('#asrf-rho').value;
    if (lock) { rho = assetCorrelation(pd); el.querySelector('#asrf-rho').value = rho.toFixed(3); }
    const q = +el.querySelector('#asrf-q').value;
    el.querySelector('#asrf-pd-r').textContent = (pd * 100).toFixed(2) + '%';
    el.querySelector('#asrf-rho-r').textContent = rho.toFixed(3) + (lock ? ' (CRR)' : '');
    el.querySelector('#asrf-plot').innerHTML = plotSvg(pd, rho, q);
    const cond = conditionalPD(pd, rho, q);
    el.querySelector('#asrf-cond').textContent = (cond * 100).toFixed(2) + '%';
    const pred = body.dataset.pred;
    el.querySelector('#asrf-expl').textContent = pred
      ? `(you predicted ρ↑ ⇒ ${pred}; raise ρ and watch — it rises, because more systematic risk fattens the tail)`
      : '';
  }
  el.querySelectorAll('#asrf-body input, #asrf-body select').forEach(i => i.addEventListener('input', render));
}

const mount = document.getElementById('asrf-explorer');
if (mount) mountAsrf(mount);
```

- [ ] **Step 2: Embed in `modules/m05.html`** — in the Derivation/ASRF section (after §3.2, the conditional-PD subsection), add a mount point:

```html
    <div id="asrf-explorer"></div>
```

And before `</body>` add:

```html
<script type="module" src="../js/widgets/asrf.js"></script>
```

- [ ] **Step 3: Verify (Node) and commit**

```bash
node --check js/widgets/asrf.js && echo "asrf syntax OK"
node -e "import('./js/widgets/asrf.js').catch(e => { if (!/document is not defined|Cannot read properties of null/.test(String(e))) { console.error('UNEXPECTED', e); process.exit(1); } console.log('imports OK'); })"
grep -c 'id="asrf-explorer"' modules/m05.html   # expect 1
node --test
git add js/widgets/asrf.js modules/m05.html
git commit -m "feat(trainer): ASRF conditional-PD explorer (Predict-Observe-Explain) + scenario toggle"
```

- [ ] **Step 4: Manual browser smoke (controller drives via the run skill)** — open `modules/m05.html`: the explorer shows the prediction gate first; revealing requires a committed prediction; after reveal, sliders move the SVG curve live; "lock ρ to CRR R(PD)" pins ρ to the curve value; raising ρ raises the conditional PD; the 95%/99,9% toggle moves the worst-case line and the readout. No console errors; MathJax elsewhere on the page still renders.

---

### Task 4: Source anchors + "jump to source" in the reveal

**Files:**
- Modify: `modules/m05.html` (heading ids), `js/study.js` (reveal source link)

**Interfaces:** none new — connects the deck's `sourceRef.anchor` to real page anchors.

- [ ] **Step 1: Add heading ids to `modules/m05.html`** matching the deck's `sourceRef`s. Add `id="…"` to the relevant headings (the deck uses `m05-s3-2`, `m05-s3-3`, `m05-s4`, `m05-s5-2`, `m05-s5-3`):
  - the §3.2 conditional-PD heading → `id="m05-s3-2"`
  - the §3.3 full-CRR-formula heading → `id="m05-s3-3"`
  - the §4 worked-example heading → `id="m05-s4"`
  - the §5.2 FX heading → `id="m05-s5-2"`
  - the §5.3 concentration/HHI heading → `id="m05-s5-3"`

  (Read the file, find each `<h2>`/`<h3>` by its visible text, add the `id`. If a section is missing, add the id to the nearest matching heading and note it.)

- [ ] **Step 2: Add a "jump to source" link in the Trainer reveal** — in `js/study.js`, inside `reveal()`, after the existing `caveat`/`sourceNote` block and before `html += gradeButtons(...)`, add:

```js
  if (card.sourceRef && card.sourceRef.module && card.sourceRef.anchor) {
    html += `<p class="trainer-source"><a href="modules/${esc(card.sourceRef.module)}.html#${esc(card.sourceRef.anchor)}" target="_blank" rel="noopener">↗ open this in the module</a></p>`;
  }
```

- [ ] **Step 3: Verify and commit**

```bash
node --check js/study.js && echo "study.js OK"
for a in m05-s3-2 m05-s3-3 m05-s4 m05-s5-2 m05-s5-3; do grep -q "id=\"$a\"" modules/m05.html && echo "$a OK" || echo "$a MISSING"; done
node --test
git add modules/m05.html js/study.js
git commit -m "feat(trainer): m05 source anchors + jump-to-source link in the reveal"
```

- [ ] **Step 4: Manual browser smoke** — in the Trainer, after committing a card the reveal shows "↗ open this in the module"; clicking it opens `modules/m05.html` scrolled to the card's source section.

---

## Self-Review

**Spec coverage (P3 portion of spec §10, §11):**
- Transparent IRB calculator (every intermediate, reg/ÖRS tags, golden 67,400/15,520, CRR maturity contrast) → Tasks 1, 2. ✓
- ASRF conditional-PD explorer with Predict-Observe-Explain + ρ-lock + scenario toggle → Tasks 1, 3. ✓
- MathJax-once / live-numbers-as-HTML perf rule → widgets render readouts as plain HTML; no per-tick MathJax. ✓
- Section anchors matching `sourceRef` + jump-to-source → Task 4. ✓
- Pure golden-tested math as the single source of truth → Task 1. ✓
- *Deferred (correctly):* full reading segmentation into a checkpointed micro-path + readiness rollup (P3b); standalone step-gated derivation widget (deck `deriveStep` covers it); P4 sync/PWA.

**Placeholder scan:** Tasks 1–3 give complete code; Task 4 gives exact ids + the link snippet. No TBDs.

**Type consistency:** `computeIRB`/`conditionalPD`/`assetCorrelation`/`normInv`/`normCdf` match between `irb.js`, its tests, and both widgets. PD/LGD are fractions in `irb.js`; widgets convert from % at the input boundary. Widgets self-mount on their `#id` and no-op when absent (safe to import headless).

---

## Next plan (P3b / P4)

P3b: segment `modules/m05.html` into a checkpointed micro-path on conceptual seams, add per-segment anchors + micro-retrieval, and surface a **readiness rollup** (module readiness derived from its cards' retrievability, per the spec) on `index.html`/the sidebar. P4: Gist sync (laptop↔phone) + PWA (offline + installable), then P5 (decks across m01–m24).
