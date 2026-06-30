// Pure per-module readiness derived from the schedule. No I/O; `now` is passed in.
export function cardsByModule(cards) {
  const out = {};
  for (const c of cards || []) {
    if (!c || !c.module || !c.id) continue;
    (out[c.module] = out[c.module] || []).push(c.id);
  }
  return out;
}

export function moduleReadiness(sched, byModule, now) {
  const s = sched || {};
  const out = {};
  for (const [mod, ids] of Object.entries(byModule || {})) {
    const states = ids.map(id => s[id]).filter(Boolean);
    if (states.length === 0) { out[mod] = 'not-started'; continue; }
    const dueNow = states.some(x => x.state !== 'suspended' && x.due != null && x.due <= now);
    const allIntroduced = states.length === ids.length;
    const allReview = allIntroduced && states.every(x => x.state === 'review');
    if (dueNow) out[mod] = 'due';
    else if (allReview) out[mod] = 'strong';
    else out[mod] = 'learning';
  }
  return out;
}
