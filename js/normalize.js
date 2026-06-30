// Pure, format-robust numeric grading. Rather than guess German vs English number format,
// we enumerate plausible parses and accept if ANY is within tolerance.
function uniqueFinite(nums) {
  const out = [];
  for (const n of nums) if (Number.isFinite(n) && !out.includes(n)) out.push(n);
  return out;
}

export function numericCandidates(str) {
  if (typeof str !== 'string') return [];
  // strip everything except digits, separators, and a leading sign
  let s = str.trim().replace(/[^0-9.,\-]/g, '');
  if (s === '' || s === '-') return [];
  const hasDot = s.includes('.');
  const hasComma = s.includes(',');
  const cands = [];

  if (hasDot && hasComma) {
    // the LAST-occurring separator is the decimal point; the other groups thousands
    const decIsComma = s.lastIndexOf(',') > s.lastIndexOf('.');
    const dec = decIsComma ? ',' : '.';
    const thou = decIsComma ? '.' : ',';
    cands.push(Number(s.split(thou).join('').replace(dec, '.')));
  } else if (hasComma) {
    cands.push(Number(s.replace(/,/g, '')));        // comma as thousands -> 67,400 = 67400
    cands.push(Number(s.replace(',', '.')));        // comma as decimal   -> 0,71 = 0.71
  } else if (hasDot) {
    cands.push(Number(s.replace(/\./g, '')));       // dot as thousands  -> 67.400 = 67400
    cands.push(Number(s));                          // dot as decimal    -> 1.645 = 1.645
  } else {
    cands.push(Number(s));
  }
  return uniqueFinite(cands);
}

export function gradeNumeric(str, answer) {
  const { value, tol = 0.005, absTol } = answer || {};
  const band = absTol != null ? absTol : Math.max(Math.abs(value) * tol, 0);
  for (const c of numericCandidates(str)) {
    if (Math.abs(c - value) <= band) return true;
  }
  return false;
}
