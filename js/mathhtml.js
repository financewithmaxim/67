// Escape bare '<' inside TeX math spans so the HTML parser doesn't read it as a tag.
// Inside $$...$$, \[...\], \(...\): a '<' immediately followed by a letter — e.g.
// \Pr(V_i<c_i) — is otherwise tokenized as a start tag that swallows the following
// markup (eating the closing $$ / </div> and mis-nesting the rest of the page).
// MathJax typesets from the decoded textContent, so '&lt;' renders identically.
// Pure (no DOM/storage/Date/Random) and idempotent: a region with no literal '<'
// is left unchanged, so re-running never double-escapes.
const MATH = /(\$\$[\s\S]*?\$\$|\\\[[\s\S]*?\\\]|\\\([\s\S]*?\\\))/g;

export function escapeMathLt(html) {
  if (typeof html !== 'string') return html;
  return html.replace(MATH, m => m.replace(/</g, '&lt;'));
}
