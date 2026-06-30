import { createStore } from './store.js';
import { newSched, grade } from './srs.js';
import { buildQueue } from './queue.js';
import { gradeAnswer } from './grading.js';
import { COURSE } from './course.js';
import { computeCalibration } from './calibration.js';
import { createGistSync } from './gistsync.js';
import { createGistClient } from './gist-client.js';

const root = document.getElementById('trainer-root');
const summary = document.getElementById('session-summary');
const store = createStore({ storage: window.localStorage });
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const typeset = () => { if (window.MathJax && window.MathJax.typesetPromise) window.MathJax.typesetPromise([root]).catch(() => {}); };

function buildSidebar() {
  const el = document.getElementById('sidebar-nav');
  if (!el || !COURSE) return;
  let html = '';
  for (const pt of COURSE.parts) {
    html += `<div class="part-label">${esc(pt.label)}</div><nav><ul>`;
    for (const [id, title] of pt.mods) {
      const rel = id === 'glossary' ? 'glossary.html' : id === 'capstone' ? 'capstone.html' : `modules/${id}.html`;
      const num = id.startsWith('m') ? id.slice(1).replace(/^0/, '') : (id === 'capstone' ? '★' : '📖');
      html += `<li><a href="${rel}"><span class="mnum">${num}</span><span>${esc(title)}</span></a></li>`;
    }
    html += `</ul></nav>`;
  }
  el.innerHTML = html;
}

let deck = [], byId = new Map(), session = [], pos = 0;
let mode = '';

async function boot() {
  buildSidebar();
  await store.ready();
  document.querySelectorAll('.trainer-tab').forEach(t => t.addEventListener('click', () => setMode(t.dataset.mode)));
  try {
    const res = await fetch('data/cards/m05.json', { cache: 'no-cache' });
    deck = (await res.json()).cards || [];
  } catch { summary.textContent = 'Could not load the m05 deck.'; setMode('sync'); return; }
  byId = new Map(deck.map(c => [c.id, c]));
  setMode('review');
}

function renderCard() {
  if (pos >= session.length) { summary.textContent = `Session complete — ${session.length} card(s) reviewed.`; root.innerHTML = '<div class="box key"><div class="box-title">Done</div><p>All queued cards reviewed. Spacing will resurface them when due.</p></div>'; return; }
  summary.textContent = `Card ${pos + 1} of ${session.length}`;
  const card = byId.get(session[pos]);
  const spine = card.tags?.spine;
  let body = `<div class="trainer-card"><div class="tag ${spine === 'ors' ? 'ors' : 'reg'}" style="margin-bottom:8px">${spine === 'ors' ? 'ÖRS choice' : spine === 'boundary' ? 'boundary' : 'regulatory'}</div>`;
  body += `<div class="trainer-front">${card.front}</div>`;
  body += inputFor(card);
  body += `<div class="trainer-confidence">Confidence before reveal:
    <label><input type="radio" name="conf" value="low">low</label>
    <label><input type="radio" name="conf" value="med" checked>medium</label>
    <label><input type="radio" name="conf" value="high">high</label></div>`;
  body += `<button class="btn" id="commit">Commit &amp; reveal</button>`;
  body += `<div id="reveal"></div></div>`;
  root.innerHTML = body;
  document.getElementById('commit').addEventListener('click', () => commit(card));
  typeset();
}

function startSession(ids) { session = ids; pos = 0; renderCard(); }

function reviewIds() {
  const q = buildQueue({ snapshot: store.getState(), cards: deck, now: Date.now(), settings: store.getState().settings });
  return q.session;
}
function drillIds() { const sched = store.getState().sched; return deck.filter(c => c.type === 'discrimination' && (!sched[c.id] || sched[c.id].state !== 'suspended')).map(c => c.id); }
function vivaIds() { const sched = store.getState().sched; return deck.filter(c => c.type === 'viva' && (!sched[c.id] || sched[c.id].state !== 'suspended')).map(c => c.id); }

function emptyMsg(m) {
  return m === 'drill' ? 'No discrimination cards in this deck yet.'
    : m === 'viva' ? 'No viva cards in this deck yet.'
    : '🎉 Nothing due right now. Come back when cards are scheduled.';
}

function setMode(m) {
  if (m === mode && m !== 'calibration') return;
  mode = m;
  document.querySelectorAll('.trainer-tab').forEach(t => t.classList.toggle('active', t.dataset.mode === m));
  if (m === 'calibration') { renderCalibration(); return; }
  if (m === 'sync') { renderSync(); return; }
  const ids = m === 'drill' ? drillIds() : m === 'viva' ? vivaIds() : reviewIds();
  if (!ids.length) { summary.textContent = emptyMsg(m); root.innerHTML = ''; return; }
  startSession(ids);
}

function renderCalibration() {
  const c = computeCalibration(store.getState(), Date.now());
  summary.textContent = 'Calibration — where confidence and accuracy diverge';
  const acc = c.accuracy == null ? '—' : Math.round(c.accuracy * 100) + '%';
  let html = `<div class="trainer-card"><div class="cal-grid">
    <div class="cal-stat"><div class="cal-num">${c.reviewed}</div><div class="cal-lbl">reviews logged</div></div>
    <div class="cal-stat"><div class="cal-num">${acc}</div><div class="cal-lbl">machine-graded accuracy</div></div>
    <div class="cal-stat"><div class="cal-num">${c.dueNow}</div><div class="cal-lbl">due now</div></div>
    <div class="cal-stat"><div class="cal-num">${c.suspended}</div><div class="cal-lbl">suspended (leeches)</div></div>
  </div>`;
  html += `<h3>Confidently wrong</h3>`;
  html += c.confidentlyWrong.length
    ? `<ul>${c.confidentlyWrong.map(x => `<li><code>${esc(x.cardId)}</code></li>`).join('')}</ul>`
    : `<p style="color:var(--ink-faint)">None — high-confidence answers that turned out wrong land here (the viva failure mode to hunt).</p>`;
  html += `<h3>Self-reported (viva)</h3>`;
  html += c.vivaSelfReported.length
    ? `<ul>${c.vivaSelfReported.map(x => `<li><code>${esc(x.cardId)}</code> — confidence ${esc(x.confidence || '?')}, self-grade ${esc(x.grade || '?')}</li>`).join('')}</ul>`
    : `<p style="color:var(--ink-faint)">No viva attempts yet. These are self-scored, shown separately so they never inflate the headline accuracy.</p>`;
  html += `</div>`;
  root.innerHTML = html;
}

function inputFor(card) {
  switch (card.type) {
    case 'numeric': return `<input class="trainer-input" id="ans" placeholder="your answer (e.g. 67.400)">`;
    case 'cloze': return (card.blanks || []).map(b => `<input class="trainer-input" data-blank="${esc(b.id)}" placeholder="${esc(b.id)}">`).join(' ');
    case 'deriveStep': return (card.steps || []).map((s, i) => `<div class="trainer-step"><div>${esc(s.prompt)}</div><input class="trainer-input" data-step="${i}"></div>`).join('');
    case 'discrimination': return `<div class="trainer-verdict">Verdict:
      <label><input type="radio" name="verdict" value="reg">regulatory</label>
      <label><input type="radio" name="verdict" value="ors">ÖRS</label>
      <label><input type="radio" name="verdict" value="mixed">mixed</label></div>
      <textarea class="trainer-input" id="defense" placeholder="state the tradeoff(s) before revealing"></textarea>`;
    case 'viva': return `<textarea class="trainer-input" id="defense" rows="5" placeholder="write your defense (locked on reveal)"></textarea>`;
    default: return '';
  }
}

function collect(card) {
  switch (card.type) {
    case 'numeric': return { text: document.getElementById('ans').value };
    case 'cloze': { const blanks = {}; root.querySelectorAll('[data-blank]').forEach(el => blanks[el.dataset.blank] = el.value); return { blanks }; }
    case 'deriveStep': { const steps = []; root.querySelectorAll('[data-step]').forEach(el => steps[+el.dataset.step] = el.value); return { steps }; }
    case 'discrimination': { const v = root.querySelector('input[name="verdict"]:checked'); return { verdict: v && v.value, defense: document.getElementById('defense').value, ticks: [] }; }
    case 'viva': return { defense: document.getElementById('defense').value, ticks: [] };
    default: return {};
  }
}

function commit(card) {
  const confidence = (root.querySelector('input[name="conf"]:checked') || {}).value || 'med';
  const response = collect(card);
  const isEmpty = s => !s || !String(s).trim();
  let committed;
  switch (card.type) {
    case 'numeric':         committed = response.text; break;
    case 'cloze':           committed = Object.values(response.blanks || {}).join(''); break;
    case 'deriveStep':      committed = (response.steps || []).join(''); break;
    case 'discrimination':  committed = (response.verdict || '') + (response.defense || ''); break;
    default:                committed = response.defense; // viva
  }
  if (isEmpty(committed)) { alert('Write something before revealing — recognition is not recall.'); return; }
  root.querySelectorAll('.trainer-input, input[name="verdict"], input[name="conf"]').forEach(el => el.setAttribute('disabled', 'true'));
  document.getElementById('commit').remove();
  reveal(card, response, confidence);
}

function reveal(card, response, confidence) {
  const machine = gradeAnswer(card, response);
  const rv = document.getElementById('reveal');
  let html = '<hr>';
  if (machine.objective === true) html += `<div class="box german"><div class="box-title">✓ Correct</div></div>`;
  else if (machine.objective === false) html += `<div class="box trap"><div class="box-title">✗ Not correct — graded "Again"</div></div>`;

  if (card.type === 'numeric') html += `<p><strong>Answer:</strong> ${esc(String(card.answer.value))}${card.answer.unit ? ' ' + esc(card.answer.unit) : ''}</p>`;
  if (card.type === 'cloze') html += `<p><strong>Blanks:</strong> ${(card.blanks || []).map(b => esc((b.accept || [])[0])).join(', ')}</p>`;
  if (card.type === 'deriveStep') html += (card.steps || []).map(s => `<p><strong>Step:</strong> ${esc(s.expected)} — <em>${esc(s.explain || '')}</em></p>`).join('');
  if (card.type === 'discrimination') html += `<p><strong>Verdict:</strong> ${esc(card.verdict)}. ${machine.verdictOk ? '' : '<span class="tag" style="background:var(--red);color:#fff">verdict miss → Again</span>'}</p>` + rubricTicks(card.rubric, 'tradeoff points you made');
  if (card.type === 'viva') { html += `<div class="box key"><div class="box-title">Model answer</div><p>${esc(card.modelAnswer)}</p></div>` + rubricTicks(card.rubric.map(r => r.text), 'points you hit'); if ((card.antiPoints || []).length) html += antiTicks(card.antiPoints); }
  if (card.sourceStatus === 'erratum' && card.sourceNote) html += `<div class="box trap"><div class="box-title">⚑ Erratum in the source</div><p>${esc(card.sourceNote)}</p></div>`;
  else if (card.caveat) html += `<div class="box verify"><div class="box-title">⚑ Verify</div><p>${esc(card.caveat)}</p></div>`;

  if (card.sourceRef && card.sourceRef.module && card.sourceRef.anchor) {
    html += `<p class="trainer-source"><a href="modules/${esc(card.sourceRef.module)}.html#${esc(card.sourceRef.anchor)}" target="_blank" rel="noopener">↗ open this in the module</a></p>`;
  }

  html += gradeButtons(card, machine);
  rv.innerHTML = html;
  rv.querySelectorAll('button[data-grade]').forEach(b => b.addEventListener('click', () => finish(card, b.dataset.grade, confidence, response, machine)));
  typeset();
}

function rubricTicks(items, label) {
  return `<p style="margin-top:8px"><strong>${esc(label)}:</strong></p><div id="rubric">` +
    (items || []).map((t, i) => `<label class="trainer-tick"><input type="checkbox" data-tick="${i}"> ${esc(typeof t === 'string' ? t : t.text)}</label>`).join('') + `</div>`;
}
function antiTicks(items) {
  return `<p style="margin-top:8px;color:var(--red)"><strong>Disqualifiers — tick any you committed:</strong></p>` +
    items.map((t, i) => `<label class="trainer-tick"><input type="checkbox" data-anti="${i}"> ${esc(t)}</label>`).join('');
}
function gradeButtons(card, machine) {
  // Machine-graded miss is locked to Again; a wrong discrimination verdict is also locked.
  const onlyAgain = `<div class="trainer-grades"><button class="btn" data-grade="again">Again (machine-graded miss)</button></div>`;
  if (machine.objective === false) return onlyAgain;
  if (card.type === 'discrimination' && machine.verdictOk === false) return onlyAgain;
  if (machine.objective === true) return `<div class="trainer-grades">
    <button class="btn secondary" data-grade="hard">Hard</button>
    <button class="btn" data-grade="good">Good</button>
    <button class="btn" data-grade="easy">Easy</button></div>`;
  // self-graded (viva, or discrimination with a correct verdict): grade derived from ticks at finish
  return `<div class="trainer-grades">
    <button class="btn secondary" data-grade="again">Again</button>
    <button class="btn secondary" data-grade="hard">Hard</button>
    <button class="btn" data-grade="good">Good</button></div>`;
}

function finish(card, chosen, confidence, response, machine) {
  // recompute self-grade ticks for discrimination/viva
  const ticks = [...root.querySelectorAll('input[data-tick]:checked')].map(el => +el.dataset.tick);
  const antiTicksArr = [...root.querySelectorAll('input[data-anti]:checked')].map(el => +el.dataset.anti);
  let g = chosen;
  if (machine.objective === false) g = 'again';                       // locked
  if (card.type === 'viva' || card.type === 'discrimination') {
    const self = gradeAnswer(card, { ...response, ticks, antiTicks: antiTicksArr });
    if (self.suggestedGrade === 'again') g = 'again';                 // missed required / anti-point / verdict
  }
  if (mode === 'review') {
    const wasNew = !store.getState().sched[card.id];
    const prev = store.getState().sched[card.id] || newSched();
    store.putSched(card.id, grade(prev, g, Date.now()));
    if (wasNew) {
      const day = new Date(Date.now()).toISOString().slice(0, 10);
      const n = (store.getState().newIntroduced || {})[day] || 0;
      store.patch(['newIntroduced', day], n + 1);
    }
  }
  store.appendReview({ cardId: card.id, grade: g, confidence, objective: machine.objective, pointsHit: ticks.length, mode });
  pos++;
  renderCard();
}

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
    try { await createGistClient({ token: v, config: deviceConfig() }).ensureGist(); msg('Connected. A secret gist is ready — click "Sync now".'); renderSync(); }
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

boot();
