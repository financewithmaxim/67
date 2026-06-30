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
    const rhoEl = el.querySelector('#asrf-rho');
    rhoEl.disabled = lock;
    if (lock) { rho = assetCorrelation(pd); rhoEl.value = rho.toFixed(3); }
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
