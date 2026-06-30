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
        <label>PD (%) <input id="ic-pd" type="number" value="1.3669" step="0.01" min="0.001" max="99"></label>
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
      ['Maturity adjustment (M=2,5)', r.maturityAdjOrs.toFixed(0) + (r.maturityAdjCRR > 0 ? '  — CRR literal would be ' + r.maturityAdjCRR.toFixed(3) : ''), 'ors'],
      ['K (capital per unit EAD)', r.K.toFixed(5), 'reg'],
      ['Expected loss EL', fmtEUR(r.EL), 'reg'],
      ['RWA (= K·12,5·EAD)', fmtEUR(r.RWA), 'reg'],
    ];
    el.querySelector('#ic-out').innerHTML =
      `<table class="widget-table">${rows.map(([k, v, t]) => `<tr><td>${k}</td><td class="num">${v}</td><td>${tag(t)}</td></tr>`).join('')}</table>
       <div class="widget-headline">Unexpected loss UL = <strong>${fmtEUR(r.UL)}</strong></div>
       <p class="widget-note">ÖRS fixes M=2,5 and sets the maturity adjustment to 1 (proportionality).${r.maturityAdjCRR > 0 ? ` The literal CRR factor at M=2,5 is ≈${r.maturityAdjCRR.toFixed(3)} — applying it would give UL ≈ ${fmtEUR(r.UL * r.maturityAdjCRR)}. That gap is the reg-vs-ÖRS trade-off.` : ''}</p>`;
  };
  el.querySelectorAll('input,select').forEach(i => i.addEventListener('input', recompute));
  recompute();
}

const mount = document.getElementById('irb-calc');
if (mount) mountIrbCalc(mount);
