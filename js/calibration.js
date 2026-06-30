// Pure calibration analytics over the reviews stream + sched. No I/O; `now` is passed in.
export function computeCalibration(state, now) {
  const reviews = state.reviews || [];
  const sched = state.sched || {};

  const machine = reviews.filter(r => r.objective === true || r.objective === false);
  const correct = machine.filter(r => r.objective === true).length;
  const accuracy = machine.length ? correct / machine.length : null;

  const confidentlyWrong = reviews
    .filter(r => r.confidence === 'high' && r.objective === false)
    .map(r => ({ cardId: r.cardId, ts: r.ts }));

  const vivaSelfReported = reviews
    .filter(r => r.objective == null)
    .map(r => ({ cardId: r.cardId, confidence: r.confidence, grade: r.grade, ts: r.ts }));

  let dueNow = 0, suspended = 0;
  for (const s of Object.values(sched)) {
    if (!s) continue;
    if (s.state === 'suspended') suspended++;
    else if (s.due != null && s.due <= now) dueNow++;
  }

  return {
    reviewed: reviews.length,
    machineGraded: machine.length,
    accuracy,
    confidentlyWrong,
    vivaSelfReported,
    dueNow,
    suspended,
  };
}
