// js/lesson.js — module "lesson" enhancer (supersedes widgets/micropath.js).
// Turns a long reading page into a guided lesson, operating on the EXISTING DOM:
//   1. a number badge on each numbered section heading,
//   2. a sticky progress rail (current section · X/N · jump · "expand all math"),
//   3. progressive disclosure — heavy display math / big tables collapse behind
//      "Show the derivation", intuition stays visible (collapsed by default),
//   4. a self-explanation checkpoint after each section (active recall).
// Reading progress lives in its own localStorage key (never the SRS store).
// Degrades gracefully; nodes are MOVED (not cloned) so MathJax + widget mounts
// and their listeners survive. Idempotent per page.

const KEY = 'leitfaden_reading_v1';
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const load = () => { try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch { return {}; } };
const save = o => { try { localStorage.setItem(KEY, JSON.stringify(o)); } catch {} };

export function mountLesson(opts = {}) {
  const moduleId = opts.moduleId || (document.body.dataset.module || 'mod');
  const main = document.querySelector('main');
  if (!main || main.dataset.lessonOn) return;
  const page = main.querySelector('.page') || main;
  const allH2 = [...main.querySelectorAll('h2')];
  const heads = allH2.filter(h => /^\s*\d+\s*·/.test(h.textContent));
  if (heads.length < 2) return;
  main.dataset.lessonOn = '1';

  heads.forEach((h, i) => { if (!h.id) h.id = `${moduleId}-s${(h.textContent.match(/^\s*(\d+)/) || [])[1] || i + 1}`; });

  const state = load();
  const isDone = id => !!(state[moduleId] && state[moduleId][id]);
  const setDone = (id, v) => { state[moduleId] = state[moduleId] || {}; state[moduleId][id] = v; save(state); };

  /* 1) number badge — move the "N · " out of the title into a styled chip.
     Capture the clean title text BEFORE inserting the badge (otherwise the
     badge's digit bleeds into textContent → "1Motivation"). */
  const titles = [];
  heads.forEach(h => {
    const n = (h.textContent.match(/^\s*(\d+)/) || [])[1] || '•';
    const tn = h.firstChild;
    if (tn && tn.nodeType === 3) tn.textContent = tn.textContent.replace(/^\s*\d+\s*·\s*/, '');
    titles.push(h.textContent.trim());
    const badge = document.createElement('span');
    badge.className = 'step-badge';
    badge.textContent = n;
    h.insertBefore(badge, h.firstChild);
    h.classList.add('lesson-h');
  });

  /* 2) progressive disclosure — collapse display-math formulas + large tables */
  const wrapDisclose = (node, label) => {
    const d = document.createElement('details');
    d.className = 'disclose';
    const s = document.createElement('summary');
    s.innerHTML = `<span class="disclose-ico" aria-hidden="true">∑</span> ${label}`;
    node.parentNode.insertBefore(d, node);
    d.appendChild(s);
    d.appendChild(node); // MOVE the existing node (keeps MathJax/listeners)
    return d;
  };
  page.querySelectorAll('.formula').forEach(f => {
    if (f.closest('details.disclose') || f.closest('.box') || f.closest('.widget')) return;
    wrapDisclose(f, 'Show the derivation');
  });
  page.querySelectorAll('.tablewrap').forEach(t => {
    if (t.closest('details.disclose') || t.closest('.box')) return;
    const rows = t.querySelectorAll('tr').length;
    if (rows >= 6) wrapDisclose(t, 'Show the full table');
  });

  /* 3) checkpoint after each section (before the next <h2> in document order) */
  heads.forEach(h => {
    const cp = document.createElement('div');
    cp.className = 'micropath-checkpoint';
    cp.dataset.for = h.id;
    cp.innerHTML = `<strong>Checkpoint.</strong> Without scrolling up, recall this section's key point in one sentence — then mark it.
      <button class="btn secondary micropath-mark" type="button">${isDone(h.id) ? '✓ understood' : "I've got this"}</button>`;
    const boundary = allH2[allH2.indexOf(h) + 1];
    if (boundary && boundary.parentNode) boundary.parentNode.insertBefore(cp, boundary);
    else (h.parentNode || main).appendChild(cp);
    cp.querySelector('.micropath-mark').addEventListener('click', e => {
      const v = !isDone(h.id); setDone(h.id, v);
      e.target.textContent = v ? '✓ understood' : "I've got this";
      h.querySelector('.step-badge')?.classList.toggle('done', v);
      renderRail();
    });
    if (isDone(h.id)) h.querySelector('.step-badge')?.classList.add('done');
  });

  /* 4) sticky progress rail */
  const bar = document.createElement('div');
  bar.className = 'lessonbar';
  let current = 0;
  const doneCount = () => heads.filter(h => isDone(h.id)).length;
  function renderRail() {
    const segs = heads.map((h, i) =>
      `<button class="lessonbar-seg ${isDone(h.id) ? 'done' : ''} ${i === current ? 'current' : ''}" data-i="${i}" title="${esc(titles[i])}" aria-label="Go to section ${i + 1}"></button>`
    ).join('');
    bar.innerHTML =
      `<div class="lessonbar-inner">
         <div class="lessonbar-meta">
           <span class="lessonbar-count">${current + 1} / ${heads.length}</span>
           <span class="lessonbar-current">${esc(titles[current])}</span>
         </div>
         <div class="lessonbar-track" role="navigation" aria-label="Sections">${segs}</div>
         <button class="lessonbar-expand" type="button" aria-pressed="false">Expand all math</button>
       </div>`;
    bar.querySelectorAll('.lessonbar-seg').forEach(b => b.addEventListener('click', () => {
      const h = heads[+b.dataset.i]; h.scrollIntoView({ behavior: prefersReduced() ? 'auto' : 'smooth', block: 'start' });
    }));
    const exp = bar.querySelector('.lessonbar-expand');
    exp.addEventListener('click', () => {
      const ds = [...page.querySelectorAll('details.disclose')];
      const anyClosed = ds.some(d => !d.open);
      ds.forEach(d => { d.open = anyClosed; });
      exp.textContent = anyClosed ? 'Collapse all math' : 'Expand all math';
      exp.setAttribute('aria-pressed', String(anyClosed));
    });
  }
  page.insertBefore(bar, page.firstChild);
  renderRail();

  const prefersReduced = () => { try { return window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { return false; } };

  /* track the current section as the reader scrolls */
  try {
    const io = new IntersectionObserver(entries => {
      entries.forEach(en => {
        if (en.isIntersecting) {
          const i = heads.indexOf(en.target);
          if (i >= 0 && i !== current) { current = i; renderRail(); }
        }
      });
    }, { rootMargin: '-80px 0px -65% 0px', threshold: 0 });
    heads.forEach(h => io.observe(h));
  } catch {}
}

if (document.querySelector('main')) mountLesson();
