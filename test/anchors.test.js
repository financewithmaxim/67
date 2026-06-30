import { test } from 'node:test';
import assert from 'node:assert/strict';
import { headingId, canonicalAnchor } from '../js/anchors.js';

test('headingId: numbered h2 -> section id', () => {
  assert.equal(headingId('m01', '1 · Motivation — why a formula at all?'), 'm01-s1');
  assert.equal(headingId('m12', '6 · Nuances & traps'), 'm12-s6');
});
test('headingId: numbered h3 -> subsection id', () => {
  assert.equal(headingId('m05', '3.2 The ASRF limit — why this becomes a per-loan formula'), 'm05-s3-2');
  assert.equal(headingId('m11', '5.10 Some deep subsection'), 'm11-s5-10');
});
test('headingId: un-numbered headings -> null', () => {
  assert.equal(headingId('m05', 'Recap'), null);
  assert.equal(headingId('m05', 'Module 5 — Credit risk'), null);
  assert.equal(headingId('m05', 'Nuances & traps'), null);
});
test('headingId: rejects bad module / non-string text', () => {
  assert.equal(headingId('', '1 · x'), null);
  assert.equal(headingId('m01', null), null);
});
test('canonicalAnchor: dot -> dash', () => {
  assert.equal(canonicalAnchor('m08-s3.1'), 'm08-s3-1');
  assert.equal(canonicalAnchor('m11-s5.10'), 'm11-s5-10');
});
test('canonicalAnchor: strip descriptive slug to numeric prefix', () => {
  assert.equal(canonicalAnchor('m02-s2-2-at1'), 'm02-s2-2');
  assert.equal(canonicalAnchor('m02-s4-worked-example'), 'm02-s4');
  assert.equal(canonicalAnchor('m02-s5-1-buffers'), 'm02-s5-1');
});
test('canonicalAnchor: already-canonical is idempotent', () => {
  assert.equal(canonicalAnchor('m01-s3'), 'm01-s3');
  assert.equal(canonicalAnchor('m05-s5-2'), 'm05-s5-2');
});
test('canonicalAnchor: unrecognised string returned unchanged', () => {
  assert.equal(canonicalAnchor('intro'), 'intro');
  assert.equal(canonicalAnchor(null), null);
});
