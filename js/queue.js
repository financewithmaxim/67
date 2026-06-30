const DAY_MS = 86_400_000;

function utcDate(now) { return new Date(now).toISOString().slice(0, 10); }

// Deterministic interleave: round-robin across type buckets (stable within a bucket).
function interleaveByType(cards) {
  const buckets = new Map();
  for (const c of cards) { if (!buckets.has(c.type)) buckets.set(c.type, []); buckets.get(c.type).push(c); }
  const order = [...buckets.keys()];
  const out = [];
  let added = true;
  while (added) {
    added = false;
    for (const t of order) {
      const b = buckets.get(t);
      if (b.length) { out.push(b.shift()); added = true; }
    }
  }
  return out;
}

export function countDue(snapshot, now) {
  let n = 0;
  for (const s of Object.values(snapshot.sched || {})) {
    if (s.state !== 'suspended' && s.due != null && s.due <= now) n++;
  }
  return n;
}

export function buildQueue({ snapshot, cards, now, settings = {}, isUnlocked = () => true }) {
  const sched = snapshot.sched || {};
  const maxReviews = settings.maxReviewsPerSession ?? 40;
  const newPerDay = settings.newCardsPerDay ?? 12;
  const throttleAt = settings.newThrottleAt ?? 30;
  const byId = new Map(cards.map(c => [c.id, c]));

  // due reviews (introduced, has content, not suspended, due now)
  const due = [];
  for (const [id, s] of Object.entries(sched)) {
    if (!byId.has(id) || s.state === 'suspended' || s.due == null || s.due > now) continue;
    const overdueRatio = (now - s.due) / Math.max(1, (s.interval || 1) * DAY_MS);
    due.push({ id, overdueRatio });
  }
  due.sort((a, b) => b.overdueRatio - a.overdueRatio);
  const dueIds = due.slice(0, maxReviews).map(d => d.id);

  // new cards (throttled when the due backlog is large)
  const introduced = new Set(Object.keys(sched));
  const spentToday = (snapshot.newIntroduced && snapshot.newIntroduced[utcDate(now)]) || 0;
  let newBudget = Math.max(0, newPerDay - spentToday);
  if (due.length > throttleAt) newBudget = 0;

  const eligibleNew = cards.filter(c =>
    !introduced.has(c.id) && isUnlocked(c) && (c.prereq || []).every(p => introduced.has(p))
  );
  const newIds = interleaveByType(eligibleNew).slice(0, newBudget).map(c => c.id);

  return { due: dueIds, new: newIds, session: [...dueIds, ...newIds], dueCount: due.length, newCount: eligibleNew.length };
}
