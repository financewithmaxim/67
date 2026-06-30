import { test } from 'node:test';
import assert from 'node:assert/strict';
import { gradeAnswer, normEq } from '../js/grading.js';

test('normEq ignores case, surrounding space, and umlaut spelling', () => {
  assert.ok(normEq('Ausfall', ' ausfall '));
  assert.ok(normEq('Größe', 'groesse'));
  assert.ok(!normEq('reg', 'ors'));
});

test('numeric: correct value → objective true → good; wrong → again', () => {
  const card = { type: 'numeric', answer: { value: 67400, tol: 0.01 } };
  assert.deepEqual(gradeAnswer(card, { text: '67.400' }), { objective: true, suggestedGrade: 'good' });
  assert.deepEqual(gradeAnswer(card, { text: '50000' }), { objective: false, suggestedGrade: 'again' });
});

test('cloze: all blanks must match an accepted value', () => {
  const card = { type: 'cloze', blanks: [{ id: 'c1', accept: ['+'] }] };
  assert.equal(gradeAnswer(card, { blanks: { c1: '+' } }).objective, true);
  assert.equal(gradeAnswer(card, { blanks: { c1: '-' } }).objective, false);
});

test('deriveStep: every step must match its expected value', () => {
  const card = { type: 'deriveStep', steps: [{ kind: 'pick', expected: '+' }, { kind: 'pick', expected: 'x = -\\Phi^{-1}(q)' }] };
  assert.equal(gradeAnswer(card, { steps: ['+', 'x = -\\Phi^{-1}(q)'] }).objective, true);
  assert.equal(gradeAnswer(card, { steps: ['-', 'x = -\\Phi^{-1}(q)'] }).objective, false);
});

test('discrimination: self-graded (objective null); pass needs correct verdict AND all tradeoff ticks; verdictOk reflects the verdict', () => {
  const card = { type: 'discrimination', verdict: 'ors', rubric: ['a', 'b'] };
  const ok = gradeAnswer(card, { verdict: 'ors', ticks: [0, 1] });
  assert.equal(ok.objective, null); assert.equal(ok.suggestedGrade, 'good'); assert.equal(ok.verdictOk, true);
  const wrongVerdict = gradeAnswer(card, { verdict: 'reg', ticks: [0, 1] });
  assert.equal(wrongVerdict.objective, null); assert.equal(wrongVerdict.suggestedGrade, 'again'); assert.equal(wrongVerdict.verdictOk, false);
  const missedTradeoff = gradeAnswer(card, { verdict: 'ors', ticks: [0] });
  assert.equal(missedTradeoff.suggestedGrade, 'again');
});

test('viva: self-graded (objective null); a missed REQUIRED point or an anti-point forces again', () => {
  const card = { type: 'viva', rubric: [{ id: 'r1', required: true }, { id: 'r2', required: false }], antiPoints: ['x'] };
  assert.equal(gradeAnswer(card, { ticks: [0, 1] }).objective, null);
  assert.equal(gradeAnswer(card, { ticks: [0, 1] }).suggestedGrade, 'good');
  assert.equal(gradeAnswer(card, { ticks: [1] }).suggestedGrade, 'again');          // missed required r1
  assert.equal(gradeAnswer(card, { ticks: [0, 1], antiTicks: [0] }).suggestedGrade, 'again'); // hit a disqualifier
});

test('viva: required ticked but an optional point missed → hard', () => {
  const card = { type: 'viva', rubric: [{ id: 'r1', required: true }, { id: 'r2', required: false }], antiPoints: [] };
  assert.equal(gradeAnswer(card, { ticks: [0] }).suggestedGrade, 'hard');
});

test('viva: out-of-range ticks do not count as all-ticked (no false good)', () => {
  const card = { type: 'viva', rubric: [{ id: 'r1', required: true }, { id: 'r2', required: false }], antiPoints: [] };
  assert.equal(gradeAnswer(card, { ticks: [0, 99] }).suggestedGrade, 'hard');
});

test('gradeAnswer tolerates a null response without throwing', () => {
  assert.doesNotThrow(() => gradeAnswer({ type: 'numeric', answer: { value: 1 } }, null));
});
