import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const MODS = Array.from({ length: 24 }, (_, i) => 'm' + String(i + 1).padStart(2, '0'));

function idsOf(mod) {
  const html = readFileSync(`modules/${mod}.html`, 'utf8');
  return new Set([...html.matchAll(/\bid\s*=\s*"([^"]+)"/g)].map(m => m[1]));
}

for (const mod of MODS) {
  test(`every ${mod} deck anchor resolves to an id in ${mod}.html`, () => {
    const deck = JSON.parse(readFileSync(`data/cards/${mod}.json`, 'utf8'));
    const ids = idsOf(mod);
    for (const c of deck.cards || []) {
      const a = c.sourceRef && c.sourceRef.anchor;
      if (!a) continue;
      assert.ok(ids.has(a), `${mod} card ${c.id}: anchor "${a}" has no matching id in ${mod}.html`);
    }
  });
}
