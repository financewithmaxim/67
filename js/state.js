// Pure state model — no I/O. Shared by migrate.js, merge.js, store.js, and the browser.
export const STATE_SCHEMA_VERSION = 2;
export const STATE_KEY = 'leitfaden_state_v2';
export const LEGACY_KEY = 'leitfaden_progress_v1';
export const DEVICE_KEY = 'leitfaden_device_v1';

export function defaultSettings() {
  return { tz: 'UTC', maxReviewsPerSession: 40, newCardsPerDay: 12, targetRetention: 0.9 };
}

export function emptyState(deviceId = 'unknown') {
  return {
    schemaVersion: STATE_SCHEMA_VERSION,
    deviceId,
    modules: {},        // { [moduleId]: { readiness, completedAt } } — migration target / deck-less fallback
    sched: {},          // { [cardId]: { state, due, interval, ease, reps, lapses, lastGrade, seenVersion, updatedAt, rev, deviceId } }
    reviews: [],        // append-only: { id, cardId, ts, grade, confidence, pointsHit, pointsMissed }
    newIntroduced: {},  // { [utcDate]: count }
    tombstones: {},     // { [cardId]: deletedAt }
    settings: defaultSettings(),
  };
}
