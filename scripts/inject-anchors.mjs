// One-time (idempotent) codemod: inject canonical ids onto numbered headings in
// every module HTML, and normalize every deck's sourceRef.anchor to resolve.
// Surgical, line-level edits — never re-serialize a whole file.
import { readFileSync, writeFileSync } from 'node:fs';
import { headingId, canonicalAnchor } from '../js/anchors.js';

const MODS = Array.from({ length: 24 }, (_, i) => 'm' + String(i + 1).padStart(2, '0'));

// 1) HTML: add id="" to numbered <h2>/<h3> that lack one. Returns the full id set present after.
function injectHtml(mod) {
  const path = `modules/${mod}.html`;
  let html = readFileSync(path, 'utf8');
  const ids = new Set();
  html = html.replace(/<(h2|h3)([^>]*)>(.*?)<\/\1>/g, (full, tag, attrs, inner) => {
    const text = inner.replace(/<[^>]+>/g, ''); // strip nested <em> etc. before reading the number
    const id = headingId(mod, text);
    if (/\bid\s*=/.test(attrs)) { // already has an id — keep it, record it (idempotent)
      const ex = attrs.match(/\bid\s*=\s*"([^"]+)"/); if (ex) ids.add(ex[1]);
      return full;
    }
    if (!id) return full; // un-numbered heading
    ids.add(id);
    return `<${tag}${attrs} id="${id}">${inner}</${tag}>`;
  });
  writeFileSync(path, html);
  return ids;
}

// 2) Deck: normalize each anchor value in place; degrade to section if the subsection id is absent.
function fixDeck(mod, ids) {
  const path = `data/cards/${mod}.json`;
  let src = readFileSync(path, 'utf8');
  let normalized = 0, degraded = 0;
  src = src.replace(/("anchor":\s*")([^"]+)(")/g, (full, a, val, b) => {
    let canon = canonicalAnchor(val);
    if (!ids.has(canon)) {
      const sec = canon.match(/^(m\d+-s\d+)/); // degrade subsection -> section
      if (sec && ids.has(sec[1])) { canon = sec[1]; degraded++; }
    }
    if (canon !== val) normalized++;
    return a + canon + b;
  });
  writeFileSync(path, src);
  return { normalized, degraded };
}

let totalIds = 0, totalNorm = 0, totalDeg = 0;
for (const mod of MODS) {
  const ids = injectHtml(mod);
  const { normalized, degraded } = fixDeck(mod, ids);
  totalIds += ids.size; totalNorm += normalized; totalDeg += degraded;
  console.log(`${mod}: ${ids.size} ids present, ${normalized} anchors normalized, ${degraded} degraded`);
}
console.log(`TOTAL: ${totalIds} ids, ${totalNorm} normalized, ${totalDeg} degraded`);
