// Pure record-level merge for cross-device sync. NEVER field-wise max() — that would mask
// a legitimate lapse-reset (reps -> 0). Ordering is by rev, then updatedAt, then deviceId.
function newerSched(a, b) {
  if (!a) return b;
  if (!b) return a;
  if ((a.rev || 0) !== (b.rev || 0)) return (a.rev || 0) > (b.rev || 0) ? a : b;
  if ((a.updatedAt || 0) !== (b.updatedAt || 0)) return (a.updatedAt || 0) > (b.updatedAt || 0) ? a : b;
  return (a.deviceId || '') >= (b.deviceId || '') ? a : b;
}

export function mergeStates(local, remote) {
  // Deep-clone BOTH inputs so the merged output shares no live references with either argument.
  const out = structuredClone(local);
  const rem = structuredClone(remote);

  // sched: union of ids, newer record wins
  for (const [id, r] of Object.entries(rem.sched || {})) {
    out.sched[id] = newerSched(out.sched[id], r);
  }

  // tombstones: union by latest deletedAt
  for (const [id, ts] of Object.entries(rem.tombstones || {})) {
    if (!out.tombstones[id] || ts > out.tombstones[id]) out.tombstones[id] = ts;
  }
  // apply tombstones: drop any sched whose last update predates (or equals) its deletion
  for (const [id, delTs] of Object.entries(out.tombstones)) {
    const s = out.sched[id];
    if (s && (s.updatedAt || 0) <= delTs) delete out.sched[id];
  }

  // reviews: dedup-union by stable id
  const seen = new Set((out.reviews || []).map(r => r.id));
  for (const review of rem.reviews || []) {
    if (!seen.has(review.id)) { out.reviews.push(review); seen.add(review.id); }
  }

  // newIntroduced: per-date max
  for (const [d, n] of Object.entries(rem.newIntroduced || {})) {
    out.newIntroduced[d] = Math.max(out.newIntroduced[d] || 0, n);
  }

  // modules: union, prefer the later completedAt (else keep local)
  for (const [id, m] of Object.entries(rem.modules || {})) {
    const cur = out.modules[id];
    if (!cur || (m.completedAt || 0) > (cur.completedAt || 0)) out.modules[id] = m;
  }

  return out;
}
