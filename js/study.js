import { createStore } from './store.js';
import { newSched, grade } from './srs.js';
import { buildQueue } from './queue.js';
import { gradeAnswer } from './grading.js';

const root = document.getElementById('trainer-root');
const summary = document.getElementById('session-summary');
const store = createStore({ storage: window.localStorage });
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const typeset = () => { if (window.MathJax && window.MathJax.typesetPromise) window.MathJax.typesetPromise([root]).catch(() => {}); };

let deck = [], byId = new Map(), session = [], pos = 0;

async function boot() {
  await store.ready();
  try {
    const res = await fetch('data/cards/m05.json', { cache: 'no-cache' });
    deck = (await res.json()).cards || [];
  } catch { summary.textContent = 'Could not load the m05 deck.'; return; }
  byId = new Map(deck.map(c => [c.id, c]));
  const q = buildQueue({ snapshot: store.getState(), cards: deck, now: Date.now(), settings: store.getState().settings });
  session = q.session;
  if (!session.length) { summary.textContent = '🎉 Nothing due right now. Come back when cards are scheduled.'; root.innerHTML = ''; return; }
  pos = 0;
  renderCard();
}

function renderCard() {
  if (pos >= session.length) { summary.textContent = `Session complete — ${session.length} card(s) reviewed.`; root.innerHTML = '<div class="box key"><div class="box-title">Done</div><p>All queued cards reviewed. Spacing will resurface them when due.</p></div>'; return; }
  summary.textContent = `Card ${pos + 1} of ${session.length}`;
  const card = byId.get(session[pos]);
  const spine = card.tags.spine;
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

function inputFor(card) {
  switch (card.type) {
    case 'numeric': return `<input class="trainer-input" id="ans" placeholder="your answer (e.g. 67.400)">`;
    case 'cloze': return (card.blanks || []).map(b => `<input class="trainer-input" data-blank="${b.id}" placeholder="${esc(b.id)}">`).join(' ');
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
  const committedText = response.text || response.defense || JSON.stringify(response.blanks || response.steps || '');
  if (!committedText || !committedText.trim()) { alert('Write something before revealing — recognition is not recall.'); return; }
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
  if (card.caveat) html += `<div class="box verify"><div class="box-title">⚑ Verify</div><p>${esc(card.caveat)}</p></div>`;

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
  // Machine-graded miss is locked to Again; self-graded types let the learner pick after ticking.
  if (machine.objective === false) return `<div class="trainer-grades"><button class="btn" data-grade="again">Again (machine-graded miss)</button></div>`;
  if (machine.objective === true) return `<div class="trainer-grades">
    <button class="btn secondary" data-grade="hard">Hard</button>
    <button class="btn" data-grade="good">Good</button>
    <button class="btn" data-grade="easy">Easy</button></div>`;
  // self-graded (viva): grade derived from ticks at finish; offer the honest set
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
  const prev = store.getState().sched[card.id] || newSched();
  store.putSched(card.id, grade(prev, g, Date.now()));
  store.appendReview({ cardId: card.id, grade: g, confidence, objective: machine.objective, pointsHit: ticks.length });
  pos++;
  renderCard();
}

boot();
