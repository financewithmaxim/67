// Reusable reading micro-path: a section nav + a self-explanation checkpoint between segments.
// DOM-driven (reads the page's numbered <h2>s); reading progress lives in its own localStorage key.
const KEY = 'leitfaden_reading_v1';
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const load = () => { try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch { return {}; } };
const save = o => { try { localStorage.setItem(KEY, JSON.stringify(o)); } catch {} };

export function mountMicropath(opts = {}) {
  const moduleId = opts.moduleId || (document.body.dataset.module || 'mod');
  const page = document.querySelector('main .page');
  if (!page) return;
  // numbered top-level sections only (skip "Recap" etc.)
  const heads = [...page.querySelectorAll('h2')].filter(h => /^\s*\d+\s*·/.test(h.textContent));
  if (heads.length < 2) return;
  heads.forEach((h, i) => { if (!h.id) h.id = `${moduleId}-s${(h.textContent.match(/^\s*(\d+)/) || [])[1] || i + 1}`; });

  const state = load();
  const done = id => !!(state[moduleId] && state[moduleId][id]);
  const setDone = (id, v) => { state[moduleId] = state[moduleId] || {}; state[moduleId][id] = v; save(state); };

  // sticky nav
  const nav = document.createElement('nav');
  nav.className = 'micropath';
  const render = () => {
    nav.innerHTML = `<div class="micropath-title">Reading path</div>` + heads.map(h =>
      `<a href="#${h.id}" class="micropath-step ${done(h.id) ? 'done' : ''}"><span class="micropath-dot">${done(h.id) ? '●' : '○'}</span>${esc(h.textContent.trim())}</a>`
    ).join('');
  };
  render();
  page.insertBefore(nav, page.firstChild);

  // checkpoint after each section (before the next section heading)
  heads.forEach((h, i) => {
    const cp = document.createElement('div');
    cp.className = 'micropath-checkpoint';
    cp.innerHTML = `<strong>Checkpoint.</strong> Without scrolling up, recall this section's key point in one sentence — then mark it.
      <button class="btn secondary micropath-mark" type="button">${done(h.id) ? '✓ understood' : "I've got this"}</button>`;
    const next = heads[i + 1];
    if (next) next.parentNode.insertBefore(cp, next); else page.appendChild(cp);
    cp.querySelector('.micropath-mark').addEventListener('click', (e) => {
      const nowDone = !done(h.id); setDone(h.id, nowDone);
      e.target.textContent = nowDone ? '✓ understood' : "I've got this";
      render();
    });
  });
}

if (document.querySelector('main .page')) mountMicropath();
