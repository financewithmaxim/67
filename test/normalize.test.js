import { test } from 'node:test';
import assert from 'node:assert/strict';
import { numericCandidates, gradeNumeric } from '../js/normalize.js';

test('candidates handle currency, spaces, and thousands/decimal ambiguity', () => {
  assert.ok(numericCandidates('EUR 67,400').includes(67400));
  assert.ok(numericCandidates('67.400').includes(67400));
  assert.ok(numericCandidates('67400').includes(67400));
  assert.ok(numericCandidates('1.645').includes(1.645));
  assert.ok(numericCandidates('0,71').includes(0.71));
  assert.ok(numericCandidates('1 645,5').includes(1645.5)); // mixed: space thousands + comma decimal
});

test('gradeNumeric accepts any in-tolerance interpretation (German or English)', () => {
  assert.equal(gradeNumeric('67.400', { value: 67400 }), true);
  assert.equal(gradeNumeric('67,400', { value: 67400 }), true);
  assert.equal(gradeNumeric('EUR 67 400', { value: 67400 }), true);
  assert.equal(gradeNumeric('1,645', { value: 1.645 }), true);
});

test('gradeNumeric respects relative tolerance and rejects out-of-band answers', () => {
  assert.equal(gradeNumeric('67000', { value: 67400 }), false);      // ~0.6% off, default tol 0.5%
  assert.equal(gradeNumeric('67400', { value: 67400, tol: 0.0001 }), true);
  assert.equal(gradeNumeric('0.1618', { value: 0.1618 }), true);     // conditional PD as a fraction
});

test('gradeNumeric handles an absolute-tolerance override and zero', () => {
  assert.equal(gradeNumeric('0.001', { value: 0, absTol: 0.01 }), true);
  assert.equal(gradeNumeric('', { value: 5 }), false);
  assert.equal(gradeNumeric('abc', { value: 5 }), false);
});
