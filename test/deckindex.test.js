import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mergeDecks } from '../js/deckindex.js';

test('mergeDecks unions cards across decks', () => {
  const cards = mergeDecks([{ cards: [{ id: 'm01.a' }] }, { cards: [{ id: 'm02.b' }, { id: 'm02.c' }] }]);
  assert.deepEqual(cards.map(c => c.id), ['m01.a', 'm02.b', 'm02.c']);
});

test('mergeDecks dedups by id (first wins)', () => {
  const cards = mergeDecks([{ cards: [{ id: 'm05.x', v: 1 }] }, { cards: [{ id: 'm05.x', v: 2 }, { id: 'm05.y' }] }]);
  assert.equal(cards.length, 2);
  assert.equal(cards.find(c => c.id === 'm05.x').v, 1);
});

test('mergeDecks tolerates empty / malformed decks', () => {
  assert.deepEqual(mergeDecks([]), []);
  assert.deepEqual(mergeDecks([{}, { cards: null }, { cards: [{ id: 'a' }] }]).map(c => c.id), ['a']);
});
