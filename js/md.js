// Minimal, math-safe inline markdown for Trainer card prose.
// Protects TeX math spans (\(…\), $$…$$, \[…\]) so markdown never corrupts a
// formula; escapes < > in the surrounding prose; renders **bold** and `code`.
// Italic is intentionally unsupported — its _ and * collide with TeX. Pure.
export function mdInline(s) {
  if (typeof s !== 'string') return '';
  return s.split(/(\$\$[\s\S]*?\$\$|\\\([\s\S]*?\\\)|\\\[[\s\S]*?\\\])/).map((seg, i) => {
    if (i % 2 === 1) return seg; // math span — verbatim (MathJax reads textContent)
    return seg.replace(/[<>]/g, c => (c === '<' ? '&lt;' : '&gt;'))
              .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
              .replace(/`([^`]+)`/g, '<code>$1</code>');
  }).join('');
}
