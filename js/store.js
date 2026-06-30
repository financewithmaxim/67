import { STATE_KEY, LEGACY_KEY, DEVICE_KEY } from './state.js';
import { migrate } from './migrate.js';

function genId() {
  if (globalThis.crypto && typeof globalThis.crypto.randomUUID === 'function') {
    return globalThis.crypto.randomUUID();
  }
  return 'dev-' + Math.random().toString(36).slice(2) + Date.now().toString(36);
}

function detectTz() {
  try { return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'; }
  catch { return 'UTC'; }
}

// device-config namespace: NEVER synced. Holds deviceId + tz (and, in P4, the gist token + cursor).
export function ensureDevice(storage) {
  let cfg = null;
  const raw = storage.getItem(DEVICE_KEY);
  if (raw) { try { cfg = JSON.parse(raw); } catch { cfg = null; } }
  if (!cfg || !cfg.deviceId) {
    cfg = { deviceId: genId(), tz: detectTz() };
    storage.setItem(DEVICE_KEY, JSON.stringify(cfg));
  }
  return cfg;
}

export function createStore({ storage, now = () => Date.now() } = {}) {
  if (!storage) throw new Error('createStore requires a storage backend');
  let snapshot = null;
  let device = null;
  let readyPromise = null;

  function persist() { storage.setItem(STATE_KEY, JSON.stringify(snapshot)); }

  const subs = new Set();
  function notify() { for (const fn of subs) { try { fn(snapshot); } catch { /* a subscriber must not break a write */ } } }
  function assertReady() { if (!snapshot) throw new Error('call await store.ready() before mutating'); }

  async function ready() {
    if (readyPromise) return readyPromise;
    readyPromise = (async () => {
      device = ensureDevice(storage);
      const v2raw = storage.getItem(STATE_KEY);
      if (v2raw) {
        snapshot = migrate(JSON.parse(v2raw), device.deviceId);
      } else {
        const legacy = storage.getItem(LEGACY_KEY);
        snapshot = migrate(legacy ? JSON.parse(legacy) : null, device.deviceId);
        persist(); // write migrated v2; the legacy key is intentionally left untouched
      }
      if (!snapshot.settings) snapshot.settings = {};
      if (!snapshot.settings.tz || snapshot.settings.tz === 'UTC') snapshot.settings.tz = device.tz;
      return snapshot;
    })();
    return readyPromise;
  }

  function getState() {
    if (!snapshot) throw new Error('call await store.ready() before getState()');
    return snapshot;
  }

  async function putSched(cardId, partial) {
    assertReady();
    const prev = snapshot.sched[cardId] || { rev: 0 };
    snapshot.sched[cardId] = {
      ...prev, ...partial,
      deviceId: device.deviceId,
      updatedAt: now(),
      rev: (prev.rev || 0) + 1,
    };
    persist(); notify();
    return snapshot.sched[cardId];
  }

  async function appendReview(entry) {
    assertReady();
    const rec = { ...entry, id: genId(), ts: now() };
    snapshot.reviews.push(rec);
    persist(); notify();
    return rec;
  }

  async function patch(path, value) {
    assertReady();
    let obj = snapshot;
    for (let i = 0; i < path.length - 1; i++) {
      const k = path[i];
      if (obj[k] == null || typeof obj[k] !== 'object') obj[k] = {};
      obj = obj[k];
    }
    obj[path[path.length - 1]] = value;
    persist(); notify();
  }

  async function saveState(next) { snapshot = next; persist(); notify(); }
  function subscribe(fn) { subs.add(fn); return () => subs.delete(fn); }
  async function sync() { /* no-op in P0; GistSyncStore overrides in P4 */ }

  return { ready, getState, getDevice: () => device, putSched, appendReview, patch, saveState, subscribe, sync };
}
