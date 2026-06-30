import { mergeStates } from './merge.js';

// Pure-ish sync orchestrator over an injectable GitHub-Gist client + a device-config store.
// pull -> record-level merge -> adopt locally -> push -> record cursor. Never touches the network or DOM itself.
export function createGistSync({ store, client, config, now = () => Date.now() }) {
  let dirty = false;
  function markDirty() { dirty = true; }

  async function sync() {
    if (!client) return { status: 'unconfigured' };
    let remote;
    try { remote = await client.pull(); }
    catch (e) { dirty = true; return { status: 'error', kind: 'pull', error: String(e) }; }

    const local = store.getState();
    const merged = remote && remote.state ? mergeStates(local, remote.state) : local;
    await store.saveState(merged);            // adopt the merged result locally regardless of push outcome

    let pushed;
    try { pushed = await client.push(merged); }
    catch (e) { dirty = true; return { status: 'error', kind: 'push', error: String(e) }; }

    config.set('syncCursor', pushed.rev);
    config.set('lastSyncedAt', now());
    dirty = false;
    return { status: 'ok', rev: pushed.rev };
  }

  function status() {
    return { lastSyncedAt: config.get('lastSyncedAt') || null, cursor: config.get('syncCursor') || null, dirty };
  }

  return { sync, status, markDirty };
}
