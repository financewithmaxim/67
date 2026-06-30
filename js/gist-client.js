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
