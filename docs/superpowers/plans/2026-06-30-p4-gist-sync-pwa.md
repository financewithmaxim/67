# Leitfaden Trainer — P4: Gist Sync & PWA — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cross-device study with no server we run — an optional **GitHub-Gist sync** (pull → record-level merge → push, token in the never-synced device namespace) wired into a **Sync** tab with status + export/import, plus a **PWA** (offline + installable) so phone reviews work on the commute.

**Architecture:** Sync is layered so the risky parts are testable without GitHub: `js/gistsync.js` is a pure orchestrator over an injectable `client` + `config` (golden-tested with fakes); `js/gist-client.js` shapes the real GitHub Gist requests over an injectable `fetch` (golden-tested with a fake fetch). The merge reuses the P0 `mergeStates`. The Sync tab (DOM) reads/writes the token/gistId/cursor in the **device-config** namespace (never synced) via a new `store.patchDevice`. The PWA is a `manifest.webmanifest` + a versioned `sw.js` (cache-first app shell, network-first card data, runtime-cache MathJax) registered from the pages. **Honest scope:** the live Gist round-trip needs the owner's real PAT to verify end-to-end; everything around it is tested or offline-smoked.

**Tech Stack:** Vanilla JS ES modules, no build step; Node `node --test` (fake `fetch`/client/config); GitHub Gists REST API; Service Worker + Web App Manifest; localhost is a secure context so the SW + `navigator.storage.persist()` work in the browser smoke.

## Global Constraints

- **No build step.** New ES modules: `js/gistsync.js`, `js/gist-client.js`. `sw.js` is a classic service-worker script at the repo root (scope = site root). `manifest.webmanifest` at root.
- **`gistsync.js` is pure-ish + testable:** no direct network/DOM; it takes `{ store, client, config, now }`. `client` = `{ pull(): Promise<{state,rev}|{state:null,rev:null}>, push(state): Promise<{rev}> }`; `config` = `{ get(k), set(k,v) }`. Merge uses P0 `mergeStates` (record-level; never field-wise max).
- **Token security (carry from spec §12):** the GitHub token, gistId, and sync cursor live ONLY in the device-config namespace (`leitfaden_device_v1`) — the sync layer must never serialize them into the synced state. Document that GitHub has no "fine-grained gist-only" token; the user supplies a classic PAT with the `gist` scope (read/write to all their gists) and should set an expiry; the gist is created **secret** (secret ≠ private — document it).
- **Sync semantics:** `sync()` = pull → `mergeStates(local, remote)` → adopt locally (`store.saveState`) → push → store the new cursor + `lastSuccessfulSyncAt`; on pull/push failure, surface the distinct error kind and KEEP the dirty flag. Sync is opt-in; the engine stays fully functional offline.
- **PWA caching:** version the cache by a `SW_VERSION` constant; **cache-first** for the static app shell (html/css/js), **network-first (fallback to cache)** for `data/cards/*.json`, runtime-cache the MathJax CDN response (best-effort offline math). On activate, delete old-version caches.
- **iOS durability:** call `navigator.storage.persist()` when the user connects sync or opens settings; surface the result; note in the UI that on iOS, sync or export is required (WebKit evicts idle storage).
- Reuse `css/style.css` tokens; carry forward all prior invariants; the existing 4 Trainer tabs + engine must keep working.

## File Structure

- `js/gistsync.js` — **create**. Pure orchestrator (`createGistSync({store, client, config, now})` → `{ sync(), status() }`).
- `js/gist-client.js` — **create**. `createGistClient({ token, config, fetchImpl, fileName })` → `{ pull(), push(state), ensureGist() }`.
- `js/store.js` — **modify**. Add `patchDevice(partial)` (persist token/gistId/cursor into the device namespace; update in-memory device).
- `study.html` — **modify**. Add a **Sync** tab button.
- `js/study.js` — **modify**. Add `renderSync()` (token field, Connect, Sync now, status, export/import, persist()) + route `setMode('sync')`.
- `manifest.webmanifest`, `icon.svg`, `sw.js` — **create**. PWA.
- `index.html`, `study.html`, `modules/m05.html` (+ others via a shared snippet) — **modify**. Link the manifest + register the SW.
- `css/style.css` — **modify**. Append `.sync-*` styles.
- `test/gistsync.test.js`, `test/gist-client.test.js` — **create**.

> Deferred: P3b (reading segmentation + readiness rollup); P5 (decks across m01–m24); a future Supabase `SupabaseStore` (the adapter seam already supports it).

---

### Task 1: Sync orchestrator (`js/gistsync.js`)

**Files:**
- Create: `js/gistsync.js`, `test/gistsync.test.js`

**Interfaces:**
- Consumes: `mergeStates` (`./merge.js`); a `store` with `getState()`/`saveState(next)`; an injected `client` and `config`.
- Produces: `createGistSync({ store, client, config, now }) → { sync(), status() }`. `sync()` resolves to `{status:'ok'|'error'|'unconfigured', kind?, rev?}`. `status()` returns `{ lastSyncedAt, cursor, dirty }`.

- [ ] **Step 1: Write the failing test** — `test/gistsync.test.js`

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGistSync } from '../js/gistsync.js';
import { emptyState } from '../js/state.js';

function fakeStore(state) {
  let s = state;
  return { getState: () => s, saveState: async (n) => { s = n; }, _peek: () => s };
}
function fakeConfig(init = {}) { const m = { ...init }; return { get: k => m[k], set: (k, v) => { m[k] = v; }, _m: m }; }

test('sync merges remote into local, adopts locally, pushes, records cursor', async () => {
  const local = emptyState('A'); local.sched = { a: { rev: 1, updatedAt: 1, deviceId: 'A' } };
  const remote = emptyState('B'); remote.sched = { b: { rev: 1, updatedAt: 1, deviceId: 'B' } };
  const store = fakeStore(local);
  const pushed = [];
  const client = { pull: async () => ({ state: remote, rev: 'r1' }), push: async (st) => { pushed.push(st); return { rev: 'r2' }; } };
  const cfg = fakeConfig();
  const gs = createGistSync({ store, client, config: cfg, now: () => 999 });
  const res = await gs.sync();
  assert.equal(res.status, 'ok');
  assert.ok(store._peek().sched.a && store._peek().sched.b, 'local now has both cards');
  assert.ok(pushed[0].sched.a && pushed[0].sched.b, 'pushed the merged state');
  assert.equal(gs.status().cursor, 'r2');
  assert.equal(gs.status().lastSyncedAt, 999);
});

test('empty remote → pushes local unchanged', async () => {
  const local = emptyState('A'); local.sched = { a: { rev: 1, updatedAt: 1, deviceId: 'A' } };
  const store = fakeStore(local);
  let pushedState = null;
  const client = { pull: async () => ({ state: null, rev: null }), push: async (st) => { pushedState = st; return { rev: 'r1' }; } };
  const gs = createGistSync({ store, client, config: fakeConfig(), now: () => 1 });
  assert.equal((await gs.sync()).status, 'ok');
  assert.ok(pushedState.sched.a);
});

test('pull failure surfaces error kind and keeps dirty', async () => {
  const store = fakeStore(emptyState('A'));
  const client = { pull: async () => { throw new Error('401'); }, push: async () => ({ rev: 'x' }) };
  const gs = createGistSync({ store, client, config: fakeConfig(), now: () => 1 });
  const res = await gs.sync();
  assert.equal(res.status, 'error');
  assert.equal(res.kind, 'pull');
  assert.equal(gs.status().dirty, true);
});

test('push failure surfaces error kind (local already holds the merge)', async () => {
  const store = fakeStore(emptyState('A'));
  const remote = emptyState('B'); remote.sched = { b: { rev: 1, updatedAt: 1, deviceId: 'B' } };
  const client = { pull: async () => ({ state: remote, rev: 'r1' }), push: async () => { throw new Error('500'); } };
  const gs = createGistSync({ store, client, config: fakeConfig(), now: () => 1 });
  const res = await gs.sync();
  assert.equal(res.status, 'error');
  assert.equal(res.kind, 'push');
  assert.ok(store._peek().sched.b, 'merge was adopted locally even though push failed');
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `node --test test/gistsync.test.js`
Expected: FAIL — `Cannot find module '../js/gistsync.js'`.

- [ ] **Step 3: Implement `js/gistsync.js`**

```js
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
```

- [ ] **Step 4: Run to verify it passes**

Run: `node --test test/gistsync.test.js`
Expected: PASS (4 tests). Then `node --test` — whole suite green.

- [ ] **Step 5: Commit**

```bash
git add js/gistsync.js test/gistsync.test.js
git commit -m "feat(trainer): pure Gist-sync orchestrator (pull->merge->push) over injectable client"
```

---

### Task 2: GitHub Gist client (`js/gist-client.js`)

**Files:**
- Create: `js/gist-client.js`, `test/gist-client.test.js`

**Interfaces:**
- Produces: `createGistClient({ token, config, fetchImpl = globalThis.fetch, fileName = 'leitfaden-state.json' }) → { ensureGist(), pull(), push(state) }`. `config` persists `gistId`. `pull` returns `{state, rev}` (state=null if the gist/file is empty); `push` PATCHes the file and returns `{rev}` (the gist's latest history version or `updated_at`). `ensureGist` creates a **secret** gist if no `gistId` is stored.

- [ ] **Step 1: Write the failing test** — `test/gist-client.test.js`

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGistClient } from '../js/gist-client.js';

function fakeConfig(init = {}) { const m = { ...init }; return { get: k => m[k], set: (k, v) => { m[k] = v; }, _m: m }; }
function jsonResponse(body, ok = true, status = 200) { return { ok, status, json: async () => body }; }

test('ensureGist creates a secret gist and stores the id when none exists', async () => {
  const calls = [];
  const fetchImpl = async (url, opts) => { calls.push({ url, opts }); return jsonResponse({ id: 'GID', history: [{ version: 'v1' }] }, true, 201); };
  const cfg = fakeConfig();
  const c = createGistClient({ token: 'T', config: cfg, fetchImpl });
  await c.ensureGist();
  assert.equal(cfg.get('gistId'), 'GID');
  assert.equal(calls[0].url, 'https://api.github.com/gists');
  assert.equal(calls[0].opts.method, 'POST');
  assert.match(calls[0].opts.headers.Authorization, /T/);
  assert.equal(JSON.parse(calls[0].opts.body).public, false);   // secret
});

test('pull returns parsed state + rev from the gist file', async () => {
  const state = { schemaVersion: 2, sched: { a: { rev: 1 } } };
  const fetchImpl = async () => jsonResponse({ id: 'GID', history: [{ version: 'vX' }], files: { 'leitfaden-state.json': { content: JSON.stringify(state) } } });
  const c = createGistClient({ token: 'T', config: fakeConfig({ gistId: 'GID' }), fetchImpl });
  const r = await c.pull();
  assert.deepEqual(r.state.sched.a.rev, 1);
  assert.equal(r.rev, 'vX');
});

test('pull returns null state when the file is absent', async () => {
  const fetchImpl = async () => jsonResponse({ id: 'GID', history: [{ version: 'v0' }], files: {} });
  const c = createGistClient({ token: 'T', config: fakeConfig({ gistId: 'GID' }), fetchImpl });
  assert.equal((await c.pull()).state, null);
});

test('push PATCHes the gist file with the state and returns the new rev', async () => {
  const calls = [];
  const fetchImpl = async (url, opts) => { calls.push({ url, opts }); return jsonResponse({ id: 'GID', history: [{ version: 'vNEW' }] }); };
  const c = createGistClient({ token: 'T', config: fakeConfig({ gistId: 'GID' }), fetchImpl });
  const r = await c.push({ schemaVersion: 2, sched: {} });
  assert.equal(calls[0].url, 'https://api.github.com/gists/GID');
  assert.equal(calls[0].opts.method, 'PATCH');
  const body = JSON.parse(calls[0].opts.body);
  assert.ok(body.files['leitfaden-state.json'].content.includes('schemaVersion'));
  assert.equal(r.rev, 'vNEW');
});

test('a non-ok response throws (so the orchestrator surfaces the error)', async () => {
  const fetchImpl = async () => jsonResponse({ message: 'Bad credentials' }, false, 401);
  const c = createGistClient({ token: 'BAD', config: fakeConfig({ gistId: 'GID' }), fetchImpl });
  await assert.rejects(() => c.pull(), /401|Bad credentials/);
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `node --test test/gist-client.test.js`
Expected: FAIL — `Cannot find module '../js/gist-client.js'`.

- [ ] **Step 3: Implement `js/gist-client.js`**

```js
// Thin GitHub Gist REST client. fetch is injected so request-shaping is unit-testable.
const API = 'https://api.github.com/gists';

export function createGistClient({ token, config, fetchImpl = globalThis.fetch, fileName = 'leitfaden-state.json' }) {
  const headers = () => ({ Authorization: `token ${token}`, Accept: 'application/vnd.github+json', 'Content-Type': 'application/json' });
  const revOf = g => (g.history && g.history[0] && g.history[0].version) || g.updated_at || null;

  async function call(url, opts) {
    const res = await fetchImpl(url, opts);
    if (!res.ok) { let msg = 'HTTP ' + res.status; try { msg = (await res.json()).message || msg; } catch {} throw new Error(`gist ${opts.method || 'GET'} ${res.status}: ${msg}`); }
    return res.json();
  }

  async function ensureGist() {
    if (config.get('gistId')) return config.get('gistId');
    const g = await call(API, { method: 'POST', headers: headers(), body: JSON.stringify({ description: 'Leitfaden Trainer state (do not edit by hand)', public: false, files: { [fileName]: { content: '{}' } } }) });
    config.set('gistId', g.id);
    return g.id;
  }

  async function pull() {
    const id = config.get('gistId');
    if (!id) return { state: null, rev: null };
    const g = await call(`${API}/${id}`, { method: 'GET', headers: headers() });
    const file = g.files && g.files[fileName];
    let state = null;
    if (file && file.content && file.content.trim() && file.content.trim() !== '{}') {
      try { state = JSON.parse(file.content); } catch { state = null; }
    }
    return { state, rev: revOf(g) };
  }

  async function push(state) {
    const id = await ensureGist();
    const g = await call(`${API}/${id}`, { method: 'PATCH', headers: headers(), body: JSON.stringify({ files: { [fileName]: { content: JSON.stringify(state) } } }) });
    return { rev: revOf(g) };
  }

  return { ensureGist, pull, push };
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `node --test test/gist-client.test.js`
Expected: PASS (5 tests). Then `node --test` — whole suite green.

- [ ] **Step 5: Commit**

```bash
git add js/gist-client.js test/gist-client.test.js
git commit -m "feat(trainer): GitHub Gist REST client (injectable fetch, secret gist, golden-tested)"
```

---

### Task 3: Sync tab + device-config + persist (`store.js`, `study.html`, `js/study.js`, `css/style.css`)

**Files:**
- Modify: `js/store.js` (add `patchDevice`), `study.html` (Sync tab), `js/study.js` (renderSync + route), `css/style.css` (append `.sync-*`)

**Interfaces:**
- Produces: `store.patchDevice(partial)` — merges `partial` into the device-config namespace, persists it (`DEVICE_KEY`), updates the in-memory `device`, returns it. A **Sync** tab whose panel: token input → Connect (persist token, `ensureGist`, `navigator.storage.persist()`), Sync now (runs `createGistSync(...).sync()`), a status line (last synced / dirty / error), and Export / Import buttons (reuse `store.exportState`/`importState`).

- [ ] **Step 1: Add `patchDevice` to `js/store.js`** — after `ensureDevice` is used in `ready()` (the `device` closure var exists). Add this method inside `createStore` (before the `return`), and add it to the returned object:

```js
  function patchDevice(partial) {
    device = { ...device, ...partial };
    storage.setItem(DEVICE_KEY, JSON.stringify(device));
    return device;
  }
```
Update the `return { … }` to include `patchDevice`.

> `DEVICE_KEY` is already imported in store.js (Task 4 of P0). `getDevice()` already returns the in-memory `device`.

- [ ] **Step 2: Add the Sync tab to `study.html`** — add a 5th button to the existing `.trainer-tabs`:

```html
      <button class="trainer-tab" data-mode="sync">Sync &amp; backup</button>
```

- [ ] **Step 3: Add `renderSync()` + routing to `js/study.js`**

Add imports at the top:

```js
import { createGistSync } from './gistsync.js';
import { createGistClient } from './gist-client.js';
```

In `setMode(m)`, add a branch before the card-mode block (alongside the `calibration` branch):

```js
  if (m === 'sync') { renderSync(); return; }
```

Add a device-config-backed `config` helper and `renderSync()`:

```js
function deviceConfig() {
  return {
    get: k => (store.getDevice() || {})[k],
    set: (k, v) => store.patchDevice({ [k]: v }),
  };
}

function buildGistSync() {
  const cfg = deviceConfig();
  const token = cfg.get('gistToken');
  if (!token) return null;
  const client = createGistClient({ token, config: cfg });
  return createGistSync({ store, client, config: cfg });
}

function renderSync() {
  summary.textContent = 'Sync & backup — optional, no server';
  const cfg = deviceConfig();
  const hasToken = !!cfg.get('gistToken');
  const st = buildGistSync() ? buildGistSync().status() : { lastSyncedAt: null, dirty: false };
  const last = st.lastSyncedAt ? new Date(st.lastSyncedAt).toLocaleString() : 'never';
  root.innerHTML = `
    <div class="widget">
      <div class="widget-title">Cross-device sync (private GitHub gist)</div>
      <p class="widget-note">Paste a GitHub <strong>classic PAT with the <code>gist</code> scope</strong> (it can read/write all your gists — set an expiry). Your state syncs to one <em>secret</em> gist; the token stays only on this device.</p>
      <div class="sync-row">
        <input id="sync-token" type="password" placeholder="ghp_…  (gist scope)" value="${hasToken ? '••••••••' : ''}">
        <button class="btn" id="sync-connect">Connect</button>
      </div>
      <div class="sync-row">
        <button class="btn" id="sync-now" ${hasToken ? '' : 'disabled'}>Sync now</button>
        <span class="sync-status" id="sync-status">Last synced: ${last}${st.dirty ? ' · unsynced changes' : ''}</span>
      </div>
      <hr>
      <div class="widget-title">Manual backup</div>
      <div class="sync-row">
        <button class="btn secondary" id="sync-export">Export JSON</button>
        <label class="btn secondary" style="cursor:pointer">Import JSON<input id="sync-import" type="file" accept="application/json" style="display:none"></label>
      </div>
      <p class="widget-note" id="sync-msg"></p>
    </div>`;

  const msg = (t) => { const e = root.querySelector('#sync-msg'); if (e) e.textContent = t; };
  root.querySelector('#sync-connect').addEventListener('click', async () => {
    const v = root.querySelector('#sync-token').value.trim();
    if (!v || v.startsWith('•')) { msg('Enter a token.'); return; }
    store.patchDevice({ gistToken: v });
    try { if (navigator.storage && navigator.storage.persist) await navigator.storage.persist(); } catch {}
    try { await createGistClient({ token: v, config: deviceConfig() }).ensureGist(); msg('Connected. A secret gist is ready — click “Sync now”.'); renderSync(); }
    catch (e) { msg('Connect failed: ' + e.message); }
  });
  root.querySelector('#sync-now').addEventListener('click', async () => {
    const gs = buildGistSync(); if (!gs) { msg('Connect first.'); return; }
    msg('Syncing…');
    const r = await gs.sync();
    msg(r.status === 'ok' ? 'Synced ✓' : `Sync ${r.kind || ''} error: ${r.error || r.status}`);
    renderSync();
  });
  root.querySelector('#sync-export').addEventListener('click', () => {
    const blob = new Blob([JSON.stringify(store.exportState(), null, 2)], { type: 'application/json' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'leitfaden-trainer-backup.json'; a.click(); URL.revokeObjectURL(a.href);
  });
  root.querySelector('#sync-import').addEventListener('change', async (e) => {
    const f = e.target.files[0]; if (!f) return;
    try { await store.importState(JSON.parse(await f.text()), 'merge'); msg('Imported (merged) ✓'); }
    catch (err) { msg('Import failed: ' + err.message); }
  });
}
```

- [ ] **Step 4: Append `.sync-*` CSS to `css/style.css`**

```css
/* ---------- Sync & backup ---------- */
.sync-row { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; margin: 10px 0; }
.sync-row input[type="password"] { font-family: var(--mono); font-size: 14px; padding: 7px 10px; border: 1px solid var(--line-strong); border-radius: var(--radius-sm); min-width: 280px; }
.sync-status { font-family: var(--font); font-size: 13px; color: var(--ink-faint); }
```

- [ ] **Step 5: Verify (Node) and commit**

```bash
node --check js/store.js && node --check js/study.js && echo "syntax OK"
node -e "import('./js/study.js').catch(e => { if (!/document is not defined|Cannot read properties of null|addEventListener/.test(String(e))) { console.error('UNEXPECTED', e); process.exit(1); } console.log('imports OK'); })"
grep -c 'data-mode="sync"' study.html        # expect 1
grep -c 'patchDevice' js/store.js             # expect >=2 (def + return)
node --test                                   # whole suite green
git add js/store.js study.html js/study.js css/style.css
git commit -m "feat(trainer): Sync & backup tab (gist connect/sync + export/import + persist)"
```

- [ ] **Step 6: Manual browser smoke (controller drives via the run skill)** — open `study.html`, click **Sync & backup**: the panel renders; without a token, "Sync now" is disabled; **Export JSON** downloads a backup; **Import JSON** (merge) accepts a file. (Live gist connect/sync requires the owner's real PAT — verified separately by the owner.)

---

### Task 4: PWA — manifest + service worker (`manifest.webmanifest`, `icon.svg`, `sw.js`, page registration)

**Files:**
- Create: `manifest.webmanifest`, `icon.svg`, `sw.js`
- Modify: `index.html`, `study.html`, `modules/m05.html` (manifest link + SW registration)

**Interfaces:** none JS-importable — browser PWA wiring.

- [ ] **Step 1: Create `icon.svg`** (a simple brand mark; SVG is installable in modern browsers)

```xml
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><rect width="512" height="512" rx="96" fill="#1d3a5c"/><text x="50%" y="54%" font-family="Inter,Arial,sans-serif" font-size="300" font-weight="800" fill="#c79a18" text-anchor="middle" dominant-baseline="middle">L</text></svg>
```

- [ ] **Step 2: Create `manifest.webmanifest`**

```json
{
  "name": "Leitfaden Trainer",
  "short_name": "Trainer",
  "description": "Spaced-repetition trainer for EU bank capital regulation (ÖRS Leitfaden Früherkennung)",
  "start_url": "study.html",
  "scope": "./",
  "display": "standalone",
  "background_color": "#f4f3ef",
  "theme_color": "#1d3a5c",
  "icons": [{ "src": "icon.svg", "sizes": "any", "type": "image/svg+xml", "purpose": "any maskable" }]
}
```

- [ ] **Step 3: Create `sw.js`** (versioned; cache-first shell, network-first card data, runtime MathJax)

```js
const SW_VERSION = 'leitfaden-v1';
const SHELL = [
  './', 'index.html', 'study.html', 'glossary.html', 'capstone.html',
  'css/style.css', 'js/app.js', 'js/course.js', 'js/state.js', 'js/migrate.js', 'js/merge.js',
  'js/store.js', 'js/srs.js', 'js/normalize.js', 'js/queue.js', 'js/grading.js', 'js/study.js',
  'js/calibration.js', 'js/irb.js', 'js/gistsync.js', 'js/gist-client.js',
  'js/widgets/irb-calc.js', 'js/widgets/asrf.js', 'manifest.webmanifest', 'icon.svg',
];

self.addEventListener('install', e => { e.waitUntil(caches.open(SW_VERSION).then(c => c.addAll(SHELL)).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== SW_VERSION).map(k => caches.delete(k)))).then(() => self.clients.claim())); });

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET') return;
  // card data: network-first (fresh content), fall back to cache offline
  if (url.pathname.includes('/data/cards/')) {
    e.respondWith(fetch(e.request).then(r => { const cp = r.clone(); caches.open(SW_VERSION).then(c => c.put(e.request, cp)); return r; }).catch(() => caches.match(e.request)));
    return;
  }
  // MathJax / fonts (cross-origin): runtime cache, cache-first
  if (url.origin !== location.origin) {
    e.respondWith(caches.match(e.request).then(hit => hit || fetch(e.request).then(r => { const cp = r.clone(); caches.open(SW_VERSION).then(c => c.put(e.request, cp)); return r; }).catch(() => hit)));
    return;
  }
  // same-origin app shell: cache-first, fall back to network
  e.respondWith(caches.match(e.request).then(hit => hit || fetch(e.request)));
});
```

- [ ] **Step 4: Register the SW + link the manifest** on `index.html`, `study.html`, and `modules/m05.html`. In each `<head>` add the manifest link (use the correct relative path — root pages `manifest.webmanifest`, module pages `../manifest.webmanifest`):

Root pages (`index.html`, `study.html`):
```html
<link rel="manifest" href="manifest.webmanifest">
<meta name="theme-color" content="#1d3a5c">
```
Module page (`modules/m05.html`):
```html
<link rel="manifest" href="../manifest.webmanifest">
<meta name="theme-color" content="#1d3a5c">
```

And before `</body>` on each, register the SW (root scope; module page uses `../sw.js`):
```html
<script>if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(()=>{});</script>
```
(For `modules/m05.html` use `navigator.serviceWorker.register('../sw.js', { scope: '../' })`.)

- [ ] **Step 5: Verify and commit**

```bash
node -e "JSON.parse(require('fs').readFileSync('manifest.webmanifest','utf8')); console.log('manifest valid JSON')" 2>/dev/null || node --input-type=module -e "import('node:fs').then(fs=>{JSON.parse(fs.readFileSync('manifest.webmanifest','utf8'));console.log('manifest valid JSON')})"
node --check sw.js && echo "sw.js syntax OK"
grep -c 'rel="manifest"' index.html study.html | tail -1
node --test
git add manifest.webmanifest icon.svg sw.js index.html study.html modules/m05.html
git commit -m "feat(trainer): PWA — manifest + versioned service worker (offline + installable)"
```

- [ ] **Step 6: Manual offline smoke (controller drives via the run skill on localhost)** — load `study.html` (SW registers), then with the browser set offline, reload: the page + engine still load from cache; a previously-fetched m05 deck still works; navigating the Trainer works offline. (MathJax offline is best-effort via runtime cache.)

---

## Self-Review

**Spec coverage (P4 portion of spec §12):**
- Gist sync: pull → record-level merge → push, opt-in, token in the never-synced device namespace → Tasks 1–3. ✓
- Distinct error surfacing + dirty flag + last-synced status → Tasks 1, 3. ✓
- Secret gist creation; classic-PAT-gist-scope documented; token never serialized into synced state → Tasks 2, 3 (constraints). ✓
- export/import UI + `navigator.storage.persist()` + iOS note → Task 3. ✓
- PWA: versioned SW, cache-first shell / network-first card data / runtime MathJax, manifest + icon → Task 4. ✓
- *Deferred (correctly):* P3b reading segmentation/readiness; P5 rollout; Supabase adapter; per-build content-hash cache-busting (a simple `SW_VERSION` bump covers updates for now — noted).

**Placeholder scan:** Tasks 1–4 give complete code; the live-gist verification is explicitly flagged as owner-token-dependent, not a placeholder.

**Type consistency:** `createGistSync({store, client, config, now})`, `createGistClient({token, config, fetchImpl, fileName})`, `store.patchDevice`, and the `config` get/set shape are consistent across modules, tests, and the UI. `mergeStates(local, remote)` arg order matches P0.

---

## Owner action (one-time, to verify live sync)
Create a GitHub **classic PAT** with only the **`gist`** scope (set an expiry), paste it into **Sync & backup → Connect** on each device, then **Sync now**. The engine works fully without this; sync is the only piece that needs the token.

## Next plan (P3b / P5)
P3b: segment `modules/m05.html` into a checkpointed micro-path + readiness rollup on `index.html`. P5: author decks for m01–m24 via the draft→verify→revise workflow, then retire the legacy progress key and route the sidebar/index to readiness.
