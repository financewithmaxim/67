// Pure: union cards across module decks, dedup by id (first occurrence wins).
export function mergeDecks(decks) {
  const cards = [];
  const seen = new Set();
  for (const d of decks || []) {
    const list = d && Array.isArray(d.cards) ? d.cards : [];
    for (const c of list) {
      if (c && c.id && !seen.has(c.id)) { cards.push(c); seen.add(c.id); }
    }
  }
  return cards;
}
