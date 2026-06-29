/* =========================================================================
   GRADUATE PROGRAM — engine
   EU Bank Capital Regulation & the ÖRS Leitfaden Früherkennung
   - curriculum model (Course 0–6 + capstone)
   - progress + mastery (localStorage), 85% threshold, SOFT gate
   - problem-set engine: numeric (tolerance), derivation/error/transfer/teach-back
     (rubric self-score), calibration tracking, worked-solution reveal
   - error log + spaced-repetition scheduling
   - mastery dashboard, sidebar, viva self-rating
   ========================================================================= */

const PASS = 0.85;                  // mastery threshold (soft gate)
const STORE = "grad_program_v1";

/* ----------------------------- curriculum ----------------------------- */
const PROGRAM = {
  courses: [
    { id:"c0", label:"Course 0 · Mathematical & accounting foundations", tag:"Foundations",
      units:[
        { id:"c0u1", n:"0.1", title:"Probability, distributions & the quantile machinery behind the confidence levels",
          built:true, hours:"10–14",
          lectures:[
            ["c0u1-l1","Probability spaces & the loss random variable"],
            ["c0u1-l2","Distributions, the quantile function & the standard normal"],
            ["c0u1-l3","Moments, transformations & the lognormal"],
            ["c0u1-l4","VaR, confidence levels & reproducing the op-risk 5,0 %"],
          ],
          pset:["c0u1-pset","Problem Set 0.1 — graded"],
          viva:["c0u1-viva","Viva 0.1 — adversarial defense"] },
        { id:"c0u2", n:"0.2", title:"Conditional expectation, independence & the bivariate-normal / Gaussian copula", built:false },
        { id:"c0u3", n:"0.3", title:"Stochastic processes: Brownian motion, Itô & first passage (toward Merton)", built:false },
        { id:"c0u4", n:"0.4", title:"Statistics & estimation: MLE, validation, backtesting, calibration", built:false },
        { id:"c0u5", n:"0.5", title:"The bank balance sheet: UGB vs IFRS/CRR-Rechnungskreis → Deckungsmassen", built:false },
        { id:"c0u6", n:"0.6", title:"Reading regulatory primary text: CRR / EBA RTS-GL / Single Rulebook", built:false },
      ]},
    { id:"c1", label:"Course 1 · Why regulation exists & the architecture", tag:"Architecture",
      units:[
        { id:"c1u1", n:"1.1", title:"Basel I→IV in depth; CRR/CRD/Single Rulebook; SSM/EBA/FMA/OeNB; R-IPS/ÖRS; EL/UL split", built:false },
      ]},
    { id:"c2", label:"Course 2 · Capital & the two lenses", tag:"Capital",
      units:[
        { id:"c2u1", n:"2.1", title:"Own funds (Part Two), buffer stack & MDA, ICAAP/SREP, normative vs economic, Problemfall vs Extremfall", built:false },
      ]},
    { id:"c3", label:"Course 3 · Credit risk, in full", tag:"Credit",
      units:[
        { id:"c3u1", n:"3.1", title:"Merton → Vasicek → Gordy ASRF; Art. 153/154; concentration/HHI; FX add-on; LGD pooling; default", built:false },
      ]},
    { id:"c4", label:"Course 4 · Market, CVA, operational, liquidity", tag:"Market+",
      units:[
        { id:"c4u1", n:"4.1", title:"IRRBB parametric VaR; FX & correlation aggregation; credit-spread VaR; CVA scalars; op-risk; FLVaR & Mischzinssatz", built:false },
      ]},
    { id:"c5", label:"Course 5 · Participation, aggregation, coverage masses", tag:"Aggregation",
      units:[
        { id:"c5u1", n:"5.1", title:"Beteiligungsrisiko; macro; large exposures; 5 % buffer; correlation +1; consolidation; both Deckungsmassen", built:false },
      ]},
    { id:"c6", label:"Course 6 · Forward look & context", tag:"Outlook",
      units:[
        { id:"c6u1", n:"6.1", title:"Basel IV / CRR III & CRD VI — output floor, FRTB, SA-CCR, revised CVA, op-risk SMA; DGSD/ESAEG & IPS", built:false },
      ]},
    { id:"cap", label:"Capstone · Institution-level RTFA & defense", tag:"Capstone",
      units:[
        { id:"capu1", n:"C", title:"Build a full RTFA for a hypothetical Raiffeisenbank and defend it in a German-language viva", built:false },
      ]},
  ]
};

/* ----------------------------- storage ----------------------------- */
function load() { try { return JSON.parse(localStorage.getItem(STORE)) || {}; } catch(e){ return {}; } }
function save(s) { localStorage.setItem(STORE, JSON.stringify(s)); }
function _ensure(s){ s.lectures=s.lectures||{}; s.mastery=s.mastery||{}; s.calibration=s.calibration||[]; s.errors=s.errors||[]; s.srq=s.srq||{}; return s; }
function db(){ return _ensure(load()); }

function markLecture(id){ const s=db(); s.lectures[id]=true; save(s); }
function lectureDone(id){ return !!db().lectures[id]; }
function masteryOf(id){ return db().mastery[id]; }

function recordMastery(id, score, detail){
  const s=db();
  const prev=s.mastery[id];
  s.mastery[id] = { score:score, ts:Date.now(), attempts:(prev?prev.attempts:0)+1,
                    best: prev ? Math.max(prev.best!=null?prev.best:prev.score, score) : score };
  save(s);
}
function logError(assess, itemId, topic, note){
  const s=db();
  s.errors.unshift({ ts:Date.now(), assess, item:itemId, topic, note });
  s.errors = s.errors.slice(0,80);
  // spaced repetition: schedule this topic for review
  const cur = s.srq[topic] || { reps:0, ease:1 };
  cur.reps = 0;                          // reset — missed
  cur.due = Date.now() + 2*864e5;        // re-test in 2 days
  cur.lastScore = note;
  s.srq[topic] = cur;
  save(s);
}
function passTopic(topic){
  const s=db(); const cur=s.srq[topic];
  if(!cur) return;
  cur.reps=(cur.reps||0)+1;
  const ladder=[1,3,7,16,35,90];        // expanding intervals (days)
  cur.due = Date.now() + (ladder[Math.min(cur.reps,ladder.length-1)])*864e5;
  s.srq[topic]=cur; save(s);
}
function logCalibration(assess,itemId,conf,correct){
  const s=db(); s.calibration.unshift({ts:Date.now(),assess,item:itemId,conf,correct});
  s.calibration=s.calibration.slice(0,300); save(s);
}

/* ----------------------------- helpers ----------------------------- */
const inProgram = location.pathname.includes("/program/");
function homeHref(){ return inProgram ? "../index.html" : "index.html"; }
function pageHref(id){ return inProgram ? `${id}.html` : `program/${id}.html`; }
function parseNum(raw){
  if(raw==null) return NaN;
  let t=String(raw).trim().replace(/\s/g,"").replace(/%$/,"");
  // European decimal comma → dot; strip thousands dots if comma present
  if(t.indexOf(",")>-1){ t=t.replace(/\./g,"").replace(",","."); }
  return parseFloat(t);
}
function fmtAgo(ts){
  const d=Math.floor((Date.now()-ts)/864e5);
  if(d<=0) return "today"; if(d===1) return "yesterday"; return d+" days ago";
}

/* ----------------------------- sidebar ----------------------------- */
function buildSidebar(curId){
  const el=document.getElementById("sidebar-nav"); if(!el) return;
  const s=db(); let html="";
  PROGRAM.courses.forEach(c=>{
    html+=`<div class="course-label">${c.label}</div>`;
    c.units.forEach(u=>{
      if(u.built){
        html+=`<nav><ul>`;
        const um=s.mastery[u.id];
        const badge = um ? `<span class="done">${Math.round((um.best!=null?um.best:um.score)*100)}%</span>` : "";
        html+=`<li><a class="${curId===u.id?'active':''}" href="${pageHref(u.id)}"><span class="mnum">${u.n}</span><span>${u.title.split(";")[0].slice(0,46)}</span>${badge}</a></li>`;
        (u.lectures||[]).forEach(L=>{
          const done = lectureDone(L[0]) ? `<span class="done">✓</span>` : "";
          html+=`<li><a class="${curId===L[0]?'active':''}" href="${pageHref(L[0])}" style="padding-left:22px;font-size:13px"><span class="mnum" style="min-width:18px">·</span><span>${L[1]}</span>${done}</a></li>`;
        });
        if(u.pset) html+=`<li><a class="${curId===u.pset[0]?'active':''}" href="${pageHref(u.pset[0])}" style="padding-left:22px;font-size:13px"><span class="mnum" style="min-width:18px">✎</span><span>${u.pset[1]}</span></a></li>`;
        if(u.viva) html+=`<li><a class="${curId===u.viva[0]?'active':''}" href="${pageHref(u.viva[0])}" style="padding-left:22px;font-size:13px"><span class="mnum" style="min-width:18px">⚖</span><span>${u.viva[1]}</span></a></li>`;
        html+=`</ul></nav>`;
      } else {
        html+=`<nav><ul><li><a style="opacity:.5;cursor:default" title="Planned — built one unit at a time"><span class="mnum">${u.n}</span><span>${u.title.split(";")[0].slice(0,46)}</span><span class="done" style="color:#9fb3cc">soon</span></a></li></ul></nav>`;
      }
    });
  });
  el.innerHTML=html;
}
function initToggle(){
  const b=document.getElementById("navtoggle"), sb=document.getElementById("sidebar");
  if(b&&sb) b.addEventListener("click",()=>sb.classList.toggle("open"));
}

/* ============================ PROBLEM-SET ENGINE ============================ */
let _PSET=null;
function renderPset(P){
  _PSET=P;
  const root=document.getElementById("pset"); if(!root) return;
  let html=`<div class="pset-intro box"><div class="box-title">✎ ${P.title}</div>
    <p>Work each problem <b>by hand and in R first</b>, then enter your answer. Numeric items are checked
    against a tolerance; derivation / find-the-error / teach-back items reveal a model solution and a rubric
    you score yourself against — <i>honestly</i>. Rate your confidence before checking: the engine tracks
    <b>confident-but-wrong</b> separately. Mastery threshold <b>${Math.round(P.pass*100)} %</b> (soft gate —
    below it you get targeted remediation and a spaced re-test, but you decide when to advance).</p></div>`;

  P.items.forEach((it,ix)=>{
    html+=`<div class="problem" id="prob-${it.id}" data-type="${it.type}">
      <span class="points">${it.points} pts</span>
      <span class="ptag ${it.type}">${({numeric:"numeric",derive:"blank-page derivation",error:"find the error",transfer:"transfer task",teachback:"teach-back"})[it.type]||it.type}</span>
      <div class="pq"><span class="pnum">P${ix+1}.</span>${it.q}</div>`;

    if(it.type==="numeric"){
      it.inputs.forEach(inp=>{
        html+=`<div class="answer-row"><label>${inp.label}</label>
          <input type="text" id="in-${it.id}-${inp.key}" placeholder="e.g. 0,71" autocomplete="off">
          <span class="unit">${inp.unit||""}</span></div>`;
      });
    } else {
      html+=`<textarea class="freetext" id="ft-${it.id}" placeholder="${it.placeholder||'Write your full working / argument here…'}"></textarea>`;
    }

    // calibration
    html+=`<div class="calib"><span class="lbl">Confidence:</span><div class="calib-opts" id="cf-${it.id}">
      <button data-c="low">low</button><button data-c="med">medium</button><button data-c="high">high</button></div></div>`;

    // solution + rubric containers
    html+=`<div class="solution" id="sol-${it.id}"><div class="box-title">Worked solution</div>${it.solution}</div>`;
    if(it.type!=="numeric"){
      html+=`<div class="rubric" id="rub-${it.id}"><b>Score yourself against the rubric:</b><ul>`;
      it.rubric.forEach(r=>html+=`<li>${r}</li>`);
      html+=`</ul><div class="scoreline"><label for="ss-${it.id}">Your self-score:</label>
        <select id="ss-${it.id}"><option value="">—</option>
        <option value="0">0 % — missed it</option><option value="0.25">25 %</option>
        <option value="0.5">50 % — partial</option><option value="0.75">75 %</option>
        <option value="1">100 % — fully rigorous</option></select></div></div>`;
    }
    html+=`<div class="feedback" id="fb-${it.id}"></div></div>`;
  });

  html+=`<div style="margin-top:18px"><button class="btn" id="pset-grade">Check & grade</button>
    <button class="btn secondary" id="pset-reset" style="margin-left:8px">Reset</button></div>
    <div class="pset-result" id="pset-result" style="display:none"></div>`;
  root.innerHTML=html;

  // calibration button handlers
  P.items.forEach(it=>{
    const box=document.getElementById("cf-"+it.id);
    box.querySelectorAll("button").forEach(b=>b.addEventListener("click",()=>{
      box.querySelectorAll("button").forEach(x=>x.classList.remove("sel"));
      b.classList.add("sel"); box.dataset.val=b.dataset.c;
    }));
  });
  document.getElementById("pset-grade").addEventListener("click",gradePset);
  document.getElementById("pset-reset").addEventListener("click",()=>renderPset(P));
  if(window.MathJax&&MathJax.typesetPromise) MathJax.typesetPromise([root]);
}

function gradePset(){
  const P=_PSET; let got=0, max=0; const rows=[]; let highMiss=0, lowHit=0, answered=0;
  P.items.forEach((it,ix)=>{
    max+=it.points;
    const conf=(document.getElementById("cf-"+it.id).dataset.val)||"med";
    const sol=document.getElementById("sol-"+it.id); sol.classList.add("show");
    const fb=document.getElementById("fb-"+it.id); fb.classList.add("show");
    let frac=0, correctish=false, did=false;

    if(it.type==="numeric"){
      let okCount=0, n=it.inputs.length;
      it.inputs.forEach(inp=>{
        const el=document.getElementById(`in-${it.id}-${inp.key}`);
        const v=parseNum(el.value);
        if(el.value.trim()!=="") did=true;
        let ok=false;
        if(!isNaN(v)){
          const tol=inp.tol!=null?inp.tol:0.01;
          const diff=Math.abs(v-inp.answer);
          ok = (inp.tolType==="rel") ? (Math.abs(inp.answer)>0 && diff/Math.abs(inp.answer)<=tol) : (diff<=tol);
        }
        if(ok){okCount++; el.style.borderColor="var(--green)"; el.style.background="var(--green-bg)";}
        else  {el.style.borderColor="var(--red)";   el.style.background="var(--red-bg)";}
      });
      frac=okCount/n; correctish=(frac>=0.999);
      sol.classList.add(correctish?"hit":"miss");
      fb.className="feedback show "+(correctish?"ok":(frac>0?"partial":"no"));
      fb.textContent = correctish ? `✓ ${okCount}/${n} correct.` : `${okCount}/${n} within tolerance — study the worked solution.`;
    } else {
      const ss=document.getElementById("ss-"+it.id).value;
      if(ss!==""){ frac=parseFloat(ss); did=true; }
      correctish=(frac>=0.75);
      fb.className="feedback show "+(frac>=0.75?"ok":(frac>=0.5?"partial":"no"));
      fb.textContent = ss==="" ? "Reveal the solution, compare honestly, then pick a self-score." :
        (frac>=0.75?"✓ Rigorous — recorded.":"Partial — this topic goes into your error log & review queue.");
    }

    if(did) answered++;
    got += it.points*frac;
    // calibration + error logging
    logCalibration(P.id,it.id,conf,correctish);
    if(conf==="high" && !correctish) highMiss++;
    if(conf==="low"  &&  correctish) lowHit++;
    if(!correctish){ logError(P.id,it.id,it.topic,Math.round(frac*100)+"%"); }
    else { passTopic(it.topic); }
    rows.push(`<tr><td>P${ix+1}</td><td>${it.topic}</td><td class="num">${Math.round(frac*100)}%</td><td>${conf}</td></tr>`);
  });

  const pct=max>0?got/max:0;
  recordMastery(P.id,pct);
  const pass=pct>=P.pass;
  const res=document.getElementById("pset-result"); res.style.display="block";
  let calNote="";
  if(highMiss>0) calNote+=`⚠ <b>${highMiss}</b> item(s) you rated <b>high</b> confidence were wrong — overconfidence; these are flagged in your error log. `;
  if(lowHit>0)   calNote+=`You under-rated ${lowHit} item(s) you actually got right. `;
  if(!calNote)   calNote="Confidence well-calibrated on this set.";
  res.innerHTML=`<div class="scorebig">${Math.round(pct*100)}%</div>
    <div class="verdict ${pass?'pass':'fail'}">${pass?'✓ At / above mastery threshold ('+Math.round(P.pass*100)+'%).':'Below '+Math.round(P.pass*100)+'% — remediate the flagged topics and re-test with different numbers.'}</div>
    <div class="calib-note">${calNote}</div>
    <div class="breakdown"><table><thead><tr><th>#</th><th>Topic</th><th class="num">Score</th><th>Conf.</th></tr></thead><tbody>${rows.join("")}</tbody></table></div>
    <p style="font-size:13px;color:var(--ink-faint);margin-top:10px">Recorded to your mastery dashboard. Soft gate: advancement is your call — but the <a href="${homeHref()}">dashboard</a> and the spaced-repetition queue will keep resurfacing anything under ${Math.round(P.pass*100)}%.</p>`;
  res.scrollIntoView({behavior:"smooth",block:"nearest"});
}

/* ============================ DASHBOARD ============================ */
function renderDashboard(){
  const root=document.getElementById("dashboard"); if(!root) return;
  const s=db();
  // headline numbers
  let builtUnits=0, mastered=0, lecturesTotal=0, lecturesDone=0; let scoreSum=0, scoreN=0;
  PROGRAM.courses.forEach(c=>c.units.forEach(u=>{
    if(u.built){ builtUnits++; (u.lectures||[]).forEach(L=>{lecturesTotal++; if(lectureDone(L[0]))lecturesDone++;});
      const m=s.mastery[u.id]; if(m){ scoreSum+=(m.best!=null?m.best:m.score); scoreN++; if((m.best!=null?m.best:m.score)>=PASS)mastered++; } }
  }));
  const avg = scoreN? Math.round(scoreSum/scoreN*100):0;
  const dueCount = Object.values(s.srq).filter(x=>x.due && x.due<=Date.now()).length;

  let html=`<div class="dash">
    <div class="dashcard ${mastered===builtUnits&&builtUnits>0?'good':''}"><div class="klabel">Units mastered (≥${Math.round(PASS*100)}%)</div><div class="kpi">${mastered}<small> / ${builtUnits} built</small></div></div>
    <div class="dashcard"><div class="klabel">Lectures read</div><div class="kpi">${lecturesDone}<small> / ${lecturesTotal}</small></div><div class="masterbar"><div style="width:${lecturesTotal?lecturesDone/lecturesTotal*100:0}%"></div></div></div>
    <div class="dashcard ${avg>=Math.round(PASS*100)?'good':(scoreN?'warn':'')}"><div class="klabel">Avg. assessment score</div><div class="kpi">${scoreN?avg+'%':'—'}</div></div>
    <div class="dashcard ${dueCount?'warn':''}"><div class="klabel">Topics due for review</div><div class="kpi">${dueCount}</div></div>
  </div>`;

  // per-unit status table
  html+=`<h3>Unit status</h3><div class="tablewrap"><table class="unit-status"><thead><tr><th>Unit</th><th>Title</th><th>State</th><th class="num">Best</th><th class="num">Attempts</th></tr></thead><tbody>`;
  PROGRAM.courses.forEach(c=>c.units.forEach(u=>{
    const m=s.mastery[u.id]; const best=m?Math.round((m.best!=null?m.best:m.score)*100):null;
    let state,cls;
    if(!u.built){ state="planned"; cls="todo"; }
    else if(best!=null && best>=Math.round(PASS*100)){ state="mastered"; cls="done"; }
    else if(best!=null){ state="in progress"; cls="prog"; }
    else { state="not started"; cls="todo"; }
    const title = u.built ? `<a href="${pageHref(u.id)}">${u.title.split(";")[0]}</a>` : `<span style="color:var(--ink-faint)">${u.title.split(";")[0]}</span>`;
    html+=`<tr><td><b>${u.n}</b></td><td>${title}</td><td><span class="pill-stat ${cls}">${state}</span></td><td class="num">${best!=null?best+'%':'—'}</td><td class="num">${m?m.attempts:'—'}</td></tr>`;
  }));
  html+=`</tbody></table></div>`;

  // error log
  html+=`<h3>Error log <small>(resurfaced until cleared twice)</small></h3>`;
  if(!s.errors.length){ html+=`<p class="empty-note">No logged errors yet — they appear here automatically when an assessment item is missed.</p>`; }
  else { html+=`<div class="errlog">`+s.errors.slice(0,12).map(e=>`<div class="item"><span class="when">${fmtAgo(e.ts)}</span><div><span class="topic">${e.topic}</span> — scored ${e.note} <small>(${e.assess} · ${e.item})</small></div></div>`).join("")+`</div>`; }

  // spaced repetition queue
  const due=Object.entries(s.srq).filter(([k,v])=>v.due&&v.due<=Date.now()).sort((a,b)=>a[1].due-b[1].due);
  html+=`<h3>Spaced-repetition queue</h3>`;
  if(!due.length){ html+=`<p class="empty-note">Nothing due. Missed topics reappear here on an expanding schedule (2 → 1 → 3 → 7 → 16 … days) until cleared.</p>`; }
  else { html+=`<div class="srq">`+due.map(([k,v])=>`<div class="item due"><span class="when">due ${fmtAgo(v.due)}</span><div><span class="topic">${k}</span> — last ${v.lastScore||"?"} </div></div>`).join("")+`</div>`; }

  html+=`<p style="margin-top:18px"><button class="btn secondary" id="dash-reset">Reset all progress</button></p>`;
  root.innerHTML=html;
  const rb=document.getElementById("dash-reset");
  if(rb) rb.addEventListener("click",()=>{ if(confirm("Erase all progress, mastery scores, calibration and error log?")){ localStorage.removeItem(STORE); renderDashboard(); }});
}

/* renders the home curriculum map */
function renderCurriculum(){
  const root=document.getElementById("curriculum"); if(!root) return;
  const s=db(); let html="";
  PROGRAM.courses.forEach(c=>{
    html+=`<div class="partcard"><h3><span class="pill">${c.tag}</span>${c.label}</h3><ul class="mod-list">`;
    c.units.forEach(u=>{
      const m=s.mastery[u.id]; const best=m?Math.round((m.best!=null?m.best:m.score)*100):null;
      const status = !u.built ? `<span class="status todo">planned</span>`
        : best!=null ? `<span class="status ${best>=85?'done':''}" style="${best>=85?'':'color:var(--yellow)'}">${best}%</span>`
        : `<span class="status todo">start</span>`;
      const title = u.built ? `<a href="${pageHref(u.id)}">${u.title}</a>` : `<span style="color:var(--ink-faint)">${u.title}</span>`;
      const hrs = u.hours?`<span class="mtitle desc" style="margin-left:6px">· ${u.hours} h</span>`:"";
      html+=`<li><span class="mnum">${u.n}</span><span class="mtitle">${title}${hrs}</span>${status}</li>`;
    });
    html+=`</ul></div>`;
  });
  root.innerHTML=html;
}

/* ============================ misc page wiring ============================ */
function wireCopyButtons(){
  document.querySelectorAll(".copybtn").forEach(b=>{
    b.addEventListener("click",()=>{
      const pre=b.closest(".rsnip").querySelector("pre");
      const txt=pre.innerText.replace(/ /g," ");
      navigator.clipboard?.writeText(txt).then(()=>{const o=b.textContent;b.textContent="copied ✓";setTimeout(()=>b.textContent=o,1200);});
    });
  });
}
function wireLectureComplete(){
  const btn=document.getElementById("mark-read");
  if(!btn) return;
  const id=document.body.dataset.lecture;
  if(lectureDone(id)) btn.textContent="✓ Marked as read — re-mark";
  btn.addEventListener("click",()=>{ markLecture(id); btn.textContent="✓ Marked as read"; buildSidebar(document.body.dataset.unit||id); });
}
function wireViva(){
  document.querySelectorAll("[data-reveal]").forEach(b=>{
    b.addEventListener("click",()=>{ const t=document.getElementById(b.dataset.reveal); if(t) t.classList.toggle("show"); });
  });
}
function renderLectureStatus(){
  document.querySelectorAll("[data-modstatus]").forEach(el=>{
    const id=el.dataset.modstatus;
    if(lectureDone(id)){ el.textContent="✓ read"; el.className="status done"; }
    else { el.textContent="○"; el.className="status todo"; }
  });
}

/* ----------------------------- boot ----------------------------- */
document.addEventListener("DOMContentLoaded",()=>{
  const cur=document.body.dataset.unit || document.body.dataset.lecture || document.body.dataset.page || "";
  buildSidebar(cur);
  initToggle();
  renderCurriculum();
  renderDashboard();
  wireCopyButtons();
  wireLectureComplete();
  wireViva();
  renderLectureStatus();
  if(typeof PSET!=="undefined") renderPset(PSET);
});
