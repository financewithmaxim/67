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
