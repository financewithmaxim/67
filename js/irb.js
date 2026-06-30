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
  if (!(PD > 0 && PD < 1)) throw new RangeError('computeIRB: PD must be a fraction in (0,1)');
  if (!(q > 0 && q < 1)) throw new RangeError('computeIRB: q must be a fraction in (0,1)');
  const R = assetCorrelation(PD);
  const condPD = conditionalPD(PD, R, q);
  const maturityAdjOrs = 1;                              // ÖRS convention (confirmed)
  const K = LGD * (condPD - PD) * maturityAdjOrs;
  const UL = K * EAD;
  const EL = LGD * PD * EAD;
  const RWA = K * 12.5 * EAD;
  return { R, condPD, maturityAdjOrs, maturityAdjCRR: maturityAdjCRR(M, PD), K, UL, EL, RWA };
}
