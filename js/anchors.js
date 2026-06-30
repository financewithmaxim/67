// Canonical source-anchor scheme shared by the deck codemod and the runtime
// jump-to-source link. Pure: no DOM, no storage, no Date/Random.

// A heading's canonical id from its module and visible text.
// <h3> "N.M ..." -> "<mod>-s<N>-<M>"; <h2> "N ..." -> "<mod>-s<N>"; else null.
export function headingId(moduleId, headingText) {
  if (!moduleId || typeof headingText !== 'string') return null;
  const t = headingText.trim();
  const sub = t.match(/^(\d+)\.(\d+)\b/);
  if (sub) return `${moduleId}-s${sub[1]}-${sub[2]}`;
  // section: a leading integer followed by a separator that is NOT a digit
  // (so "3.2" is never read as section 3) — middot, period, or whitespace.
  const sec = t.match(/^(\d+)(?:\s*[·.]\s*|\s+)\S/);
  if (sec) return `${moduleId}-s${sec[1]}`;
  return null;
}

// Normalize a raw deck anchor to the canonical numeric form.
export function canonicalAnchor(raw) {
  if (typeof raw !== 'string') return raw;
  const dashed = raw.replace(/\./g, '-');
  const m = dashed.match(/^(m\d+-s\d+(?:-\d+)?)/);
  return m ? m[1] : raw;
}
