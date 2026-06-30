import { emptyState, STATE_SCHEMA_VERSION } from './state.js';

function isLegacyBooleanMap(raw) {
  if (!raw || typeof raw !== 'object') return false;
  if ('schemaVersion' in raw) return false;
  const vals = Object.values(raw);
  return vals.length === 0 || vals.every(v => typeof v === 'boolean');
}

// Pure. Accepts: null, a legacy boolean {moduleId:true} map, or a v2 state object.
export function migrate(raw, deviceId = 'unknown') {
  if (raw == null) return emptyState(deviceId);

  if (typeof raw === 'object' && raw.schemaVersion === STATE_SCHEMA_VERSION) {
    return raw; // already current — idempotent
  }
  if (typeof raw === 'object' && typeof raw.schemaVersion === 'number' && raw.schemaVersion > STATE_SCHEMA_VERSION) {
    throw new Error(`Refusing to downgrade state from v${raw.schemaVersion} to v${STATE_SCHEMA_VERSION}`);
  }

  if (isLegacyBooleanMap(raw)) {
    const next = emptyState(deviceId);
    for (const [id, done] of Object.entries(raw)) {
      if (!done || id === 'glossary') continue;       // glossary is reference, never graded
      next.modules[id] = { readiness: 'review-soon', completedAt: null };
    }
    return next; // deliberately no sched entries — no phantom day-one due cards
  }

  // Any other structured shape (e.g. a future intermediate version with no upgrader yet):
  // start fresh rather than corrupt. Non-destructive: the caller keeps the legacy key.
  return emptyState(deviceId);
}
