/* =========================================================================
   Leitfaden Früherkennung — course engine
   - sidebar build + active highlight + mobile toggle
   - progress tracking (localStorage)
   - interactive quiz grading + completion marking
   ========================================================================= */

const COURSE = {
  parts: [
    { label: "Teil I — Regulatorische Architektur", tag: "Foundations",
      mods: [
        ["m01", "Warum Bankenregulierung? Basel → CRR → ÖRS"],
        ["m02", "Eigenmittel: CET1/AT1/T2 & Pufferstapel"],
        ["m03", "Zwei Linsen: Normativ vs. Ökonomisch (ICAAP/SREP)"],
      ]},
    { label: "Teil II — Risikotragfähigkeit", tag: "Core",
      mods: [
        ["m04", "RTFA: Problemfall (95%) vs. Extremfall (99,9%)"],
        ["m05", "Kreditrisiko: IRB-Formel, FX, Konzentration"],
        ["m06", "Marktrisiko: IRRBB, FX, Spread-VaR"],
        ["m07", "CVA-Risiko: Skalierung 0,71 / 1,33"],
        ["m08", "Operationelles Risiko: 5% / 15%"],
        ["m09", "Liquiditätsrisiko: FLVaR & Mischzinssatz"],
        ["m10", "Beteiligungsrisiko: Risikofaktoren & 3×-Regel"],
        ["m11", "Sonstige Risiken: Großkredite, Makro, FW-EM"],
      ]},
    { label: "Teil III — Aggregation & Deckungsmassen", tag: "Build-up",
      mods: [
        ["m12", "Risikoaggregation: Korrelation +1, Konsolidierung"],
        ["m13", "Deckungsmassen: Problemfall vs. Extremfall"],
        ["m14", "Daten, Reporting & Kennziffern"],
      ]},
    { label: "Teil IV — Ausfall & Parameter", tag: "Deep dive",
      mods: [
        ["m15", "Ausfalldefinition (Art. 178), LGD-Schätzung"],
      ]},
    { label: "Teil V — Ausblick & Einlagensicherung", tag: "Context",
      mods: [
        ["m16", "Basel IV / CRR III & CRD VI"],
        ["m17", "Einlagensicherung: DGSD, ESAEG & IPS"],
      ]},
    { label: "Teil VI — IRB-Parameter & Basel IV/CRR III", tag: "Advanced",
      mods: [
        ["m18", "IRB-Parameter: PD, Downturn-LGD, CCF & MoC"],
        ["m19", "CRR III Kreditrisiko: SA, IRB & Output-Floor"],
        ["m20", "CRR III: Op-Risk (SMA), CVA, FRTB & SA-CCR"],
      ]},
    { label: "Teil VII — Aufsicht, Stress, Liquidität & Abwicklung", tag: "Advanced",
      mods: [
        ["m21", "EBA/ECB: ICAAP, SREP, NPE & Großkredite"],
        ["m22", "Stresstests & Reverse-Stresstests"],
        ["m23", "Liquidität: LCR, NSFR & ILAAP"],
        ["m24", "Sanierung, Abwicklung, MREL & Einlagensicherung"],
      ]},
    { label: "Abschluss", tag: "Capstone",
      mods: [
        ["capstone", "Mock-RTFA + Viva"],
        ["glossary", "Bilinguales Glossar (DE/EN)"],
      ]},
  ]
};

const STORE_KEY = "leitfaden_progress_v1";

function loadProgress() {
  try { return JSON.parse(localStorage.getItem(STORE_KEY)) || {}; }
  catch (e) { return {}; }
}
function saveProgress(p) { localStorage.setItem(STORE_KEY, JSON.stringify(p)); }
function markComplete(id) { const p = loadProgress(); p[id] = true; saveProgress(p); }
function isComplete(id) { return !!loadProgress()[id]; }

/* count only the 17 teaching modules + capstone for the progress meter */
function gradedIds() {
  const ids = [];
  COURSE.parts.forEach(pt => pt.mods.forEach(m => {
    if (m[0] !== "glossary") ids.push(m[0]);
  }));
  return ids;
}

/* ---------- Sidebar ---------- */
function buildSidebar(currentId) {
  const el = document.getElementById("sidebar-nav");
  if (!el) return;
  const prog = loadProgress();
  const inModules = location.pathname.includes("/modules/");
  let html = "";
  COURSE.parts.forEach(pt => {
    html += `<div class="part-label">${pt.label}</div><nav><ul>`;
    pt.mods.forEach(m => {
      const [id, title] = m;
      // Resolve the link relative to the current page's directory.
      let rel;
      if (id === "glossary") rel = inModules ? "../glossary.html" : "glossary.html";
      else if (id === "capstone") rel = inModules ? "../capstone.html" : "capstone.html";
      else rel = inModules ? `${id}.html` : `modules/${id}.html`;
      const active = id === currentId ? " active" : "";
      const done = (prog[id] && id !== "glossary") ? `<span class="done">✓</span>` : "";
      const num = id.startsWith("m") ? id.slice(1).replace(/^0/, "") : (id === "capstone" ? "★" : "📖");
      html += `<li><a class="${active.trim()}" href="${rel}"><span class="mnum">${num}</span><span>${title}</span>${done}</a></li>`;
    });
    html += `</ul></nav>`;
  });
  el.innerHTML = html;
}

/* ---------- Mobile toggle ---------- */
function initToggle() {
  const btn = document.getElementById("navtoggle");
  const sb = document.getElementById("sidebar");
  if (btn && sb) btn.addEventListener("click", () => sb.classList.toggle("open"));
}

/* ---------- Quiz engine ----------
   Define on a page:  <div id="quiz" data-module="m05"></div>
   and a global QUIZ = { title, pass, questions:[ {q, options:[...], answer:Idx, explain} ] }
*/
function renderQuiz(QUIZ, moduleId) {
  const root = document.getElementById("quiz");
  if (!root || !QUIZ) return;
  const trainerHref = location.pathname.includes("/modules/") ? "../study.html" : "study.html";
  let html = `<div class="disclaimer" style="border-left-color:var(--accent)"><strong>Warm-up only.</strong> This multiple-choice check tests recognition; it no longer marks the module complete. Durable, board-defensible recall comes from spaced practice in the <a href="${trainerHref}">Trainer</a>.</div>`;
  html += `<h3>✓ Verständnis-Check${QUIZ.title ? " — " + QUIZ.title : ""}</h3>`;
  html += `<p style="color:var(--ink-faint);font-size:14.5px">Answer all questions, then submit. You must score ${Math.round((QUIZ.pass||0.7)*100)}% to clear this warm-up. Explanations appear after grading.</p>`;
  QUIZ.questions.forEach((item, qi) => {
    html += `<div class="q" data-answer="${item.answer}"><div class="qtext"><span class="qn">Q${qi+1}.</span>${item.q}</div>`;
    item.options.forEach((opt, oi) => {
      html += `<label class="opt" data-qi="${qi}" data-oi="${oi}">
        <input type="radio" name="q${qi}" value="${oi}">${opt}</label>`;
    });
    html += `<div class="explain" id="ex-${qi}">${item.explain || ""}</div></div>`;
  });
  html += `<button class="btn" id="quiz-submit">Submit answers</button>
           <button class="btn secondary" id="quiz-reset" style="margin-left:8px">Reset</button>
           <div class="quiz-result" id="quiz-result"></div>`;
  root.innerHTML = html;

  document.getElementById("quiz-submit").addEventListener("click", () => gradeQuiz(QUIZ, moduleId));
  document.getElementById("quiz-reset").addEventListener("click", () => renderQuiz(QUIZ, moduleId));
}

function gradeQuiz(QUIZ, moduleId) {
  let correct = 0;
  const qs = document.querySelectorAll("#quiz .q");
  let unanswered = 0;
  qs.forEach((qEl, qi) => {
    const ans = parseInt(qEl.dataset.answer, 10);
    const chosen = qEl.querySelector("input:checked");
    qEl.querySelectorAll(".opt").forEach(o => o.classList.add("disabled"));
    const ex = document.getElementById("ex-" + qi);
    if (!chosen) { unanswered++; ex.classList.add("show"); ex.classList.add("no"); return; }
    const oi = parseInt(chosen.value, 10);
    const optEls = qEl.querySelectorAll(".opt");
    optEls[ans].classList.add("correct");
    if (oi === ans) { correct++; ex.classList.add("ok"); }
    else { optEls[oi].classList.add("incorrect"); ex.classList.add("no"); }
    ex.classList.add("show");
  });
  const total = qs.length;
  const pct = correct / total;
  const res = document.getElementById("quiz-result");
  res.classList.add("show");
  const passMark = QUIZ.pass || 0.7;
  if (unanswered > 0) {
    res.style.color = "var(--red)";
    res.textContent = `Please answer all ${total} questions (${unanswered} left blank).`;
    return;
  }
  if (pct >= passMark) {
    res.style.color = "var(--green)";
    res.innerHTML = `✓ ${correct}/${total} correct — warm-up cleared. Lock it in with spaced practice in the <a href="${location.pathname.includes("/modules/") ? "../study.html" : "study.html"}">Trainer</a>.`;
  } else {
    res.style.color = "var(--yellow)";
    res.innerHTML = `${correct}/${total} correct — review the explanations and retry to pass (need ${Math.round(passMark*100)}%).`;
  }
}

/* ---------- Index progress meter ---------- */
function renderIndexProgress() {
  const fill = document.getElementById("progress-fill");
  const label = document.getElementById("progress-label");
  if (!fill) return;
  const ids = gradedIds();
  const done = ids.filter(isComplete).length;
  const pct = Math.round(done / ids.length * 100);
  fill.style.width = pct + "%";
  if (label) label.textContent = `${done} / ${ids.length} modules complete (${pct}%)`;
  // per-row status on index
  document.querySelectorAll("[data-modstatus]").forEach(el => {
    const id = el.dataset.modstatus;
    if (isComplete(id)) { el.textContent = "✓ done"; el.className = "status done"; }
    else { el.textContent = "○"; el.className = "status todo"; }
  });
}

/* ---------- boot ---------- */
document.addEventListener("DOMContentLoaded", () => {
  const cur = document.body.dataset.module || "";
  buildSidebar(cur);
  initToggle();
  renderIndexProgress();
  if (typeof QUIZ !== "undefined") renderQuiz(QUIZ, cur);
});
