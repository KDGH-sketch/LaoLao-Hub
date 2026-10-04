// Data-driven quiz engine. One renderer for every question type, used by lessons, practice,
// the admin Quiz Builder preview and auto-generated pattern drills.
import { h, $$, icon, pyHTML, shuffle, stripTone, tr, isHan, toast, esc } from "./ui.js";
import { t, lang } from "./i18n.js";   // lang was used below without being imported (handwriting questions crashed)
import { speak, canListen, listen, similarity } from "./speech.js";
import { createPad } from "./handwriting/pad.js";
import { playDemo } from "./handwriting/animator.js";
import { readTemplate, mergeHwRules } from "./handwriting/model.js";
import { createSession } from "./handwriting/recognizer.js";
import { scoreAttempt, strokeFeedback, attemptTip } from "./handwriting/scorer.js";
import { ctx } from "./widgets.js";
import { DEFAULT_RULES, answerPoints, roundResult } from "./scoring.js";
const rules = () => (ctx.rules && ctx.rules()) || DEFAULT_RULES;
const starsEl = n => h("div",{class:"stars","aria-label":n+" / 3"}, [1,2,3].map(i => h("span",{class:i<=n?"on":""}, "★")));

export const QTYPES = ["mc","fill","order","match","type","listen_select","listen_type","tone","speak","write_char","flashcard"];
export const QTYPE_SKILL = { mc:"reading", fill:"grammar", order:"sentence", match:"vocabulary", type:"writing", listen_select:"listening", listen_type:"listening", tone:"pinyin", speak:"speaking", write_char:"characters", flashcard:"vocabulary" };
const optText = (o, L) => typeof o === "string" ? o : (o.zh ? o.zh : tr(o, L));
const optIsHz = o => typeof o === "string" ? /[\u0E80-\u0EFF]/.test(o) : !!o.zh;
const norm = (s, mode) => (mode==="hanzi" || mode==="script" || mode==="text") ? String(s).replace(/[\s，。？！,.?!]/g,"") : stripTone(String(s).replace(/[，。？！,.?!]/g,""));

/**
 * runQuiz(container, questions, { onAnswer(q, correct), onFinish({right,total}), title })
 */
export function runQuiz(root, questions, opts={}){
  const L = ctx.exp();
  const state = { i:0, res:[], ans:[], combo:0 };
  const key = opts.key || opts.title || "practice";
  const render = () => {
    root.innerHTML = "";
    const prog = h("div",{class:"qprog"}, questions.map((_,i)=>h("i",{class: i<state.res.length ? (state.res[i]?"ok":"no") : i===state.i ? "cur" : ""})));
    root.append(h("div",{class:"spread",style:"margin-bottom:10px"}, opts.title ? h("b",null,opts.title) : h("span"), h("span",{class:"muted tabnum"}, Math.min(state.i+1,questions.length)+" / "+questions.length)), prog);
    if (state.i >= questions.length){
      const R = rules();
      const repeat = ctx.roundRepeat ? ctx.roundRepeat(key) : 0;
      const res = roundResult(state.ans, { repeat }, R);
      const line = (label, val) => val ? h("div",{class:"spread small"}, h("span",{class:"muted"},label), h("b",{class:"tabnum"}, val)) : null;
      const awarded = h("p",{class:"small",style:"margin:8px 0 0"});
      const box = h("div",{class:"qbox result"}, h("div",{class:"eyebrow"},t("round_done")),
        starsEl(res.stars),
        h("div",{class:"big"}, res.right+"/"+res.total, h("small",{class:"muted"}, " · "+res.pct+"%")),
        h("p",{class:"verdict "+(res.passed?"ok":"no")}, res.passed ? t("sc_passed") : t("sc_failed", { p: R.passPct })),
        h("div",{class:"breakdown"},
          line(t("sc_answers"), res.answerPts - res.comboPts),
          line(t("sc_combo"), res.comboPts ? "+"+res.comboPts : 0),
          line(t("sc_round_bonus"), res.bonus ? "+"+res.bonus : 0),
          res.factor < 1 ? h("div",{class:"small muted"}, t("sc_repeat", { n: repeat + 1, f: Math.round(res.factor*100) })) : null,
          res.selfCount ? h("div",{class:"small muted"}, t("sc_self_note", { n: res.selfCount })) : null,
          res.skipped ? h("div",{class:"small muted"}, t("sc_skipped", { n: res.skipped })) : null,
          h("div",{class:"spread total"}, h("span",null,t("sc_points")), h("b",{class:"tabnum"}, res.points+" XP"))),
        awarded);
      const btns = h("div",{class:"row",style:"justify-content:center;margin-top:18px"});
      if (opts.onAgain) btns.append(h("button",{class:"btn primary",onclick:opts.onAgain}, t("again")));
      if (opts.onExit) btns.append(h("button",{class:"btn",onclick:opts.onExit}, t("finish")));
      box.append(btns); root.append(box);
      Promise.resolve(ctx.scoreRound ? ctx.scoreRound(key, res) : null).then(a => {
        if (!a) return;
        awarded.textContent = t("sc_added", { n: a.xp }) + (a.streak ? " · "+t("sc_streak_bonus", { n: a.streak }) : "") + (a.goal ? " · "+t("sc_goal_bonus", { n: a.goal }) : "") + (a.capped ? " · "+t("sc_capped") : "");
      }).catch(() => {});
      opts.onFinish && opts.onFinish(res);
      return;
    }
    const q = questions[state.i];
    root.append(questionEl(q, L, (correct, meta={}) => {
      const self = !!meta.self, skipped = !!meta.skipped;
      const p = skipped ? { points:0, combo:state.combo, comboBonus:0 } : answerPoints(q.type, correct, { self, combo: state.combo }, rules());
      state.combo = p.combo;
      state.res.push(correct);
      state.ans.push({ type:q.type, correct, self, skipped });
      $$(".qprog i", root)[state.i].className = skipped ? "skip" : correct ? "ok" : "no";
      opts.onAnswer && opts.onAnswer(q, correct, { self, skipped });
      return p;
    }, () => { state.i++; render(); }));
  };
  render();
}

export function questionEl(q, L, onResult, onNext){
  const box = h("div",{class:"qbox"}); let answered = false;
  const ask = q.ask ? tr(q.ask, L) : "";
  const finish = (ok, extra, meta) => {
    if (answered) return; answered = true;
    const p = onResult(ok, meta || {}) || {};
    const fb = h("div",{class:"feedback "+(ok?"ok":"no")}, h("b",null, ok ? t("correct") : t("incorrect")),
      p.points ? h("span",{class:"xp-pill"}, "+"+p.points+" XP") : null,
      p.comboBonus ? h("span",{class:"combo-pill"}, t("sc_combo_n", { n: p.combo })) : null,
      meta && meta.self ? h("span",{class:"small muted"}, " · "+t("sc_self")) : null);
    if (q.reveal) fb.append(q.reveal());
    if (extra) fb.append(extra);
    if (q.explain) fb.append(h("div",{class:L==="lo"?"lo":""}, tr(q.explain, L)));
    if (q.link) fb.append(q.link);
    box.append(fb, h("div",{class:"qfoot"}, h("span"), h("button",{class:"btn primary",onclick:onNext}, t("next"), icon("right"))));
    const say = q.say || (q.prompt && q.prompt.zh);
    if (say && isHan(say[0]) && (ok || q.type.startsWith("listen"))) speak(say);
  };
  const promptBlock = () => {
    const p = q.prompt || {};
    const els = [];
    if (ask) els.push(h("div",{class:"qprompt"+(L==="lo"?" lo":"")}, ask));
    if (p.zh) els.push(h("div",{class:"row"}, h("span",{class:"qzh",lang:"zh-CN"}, p.zh), h("button",{class:"ib","aria-label":t("play"),onclick:()=>speak(p.zh.replace(/_+/g,""))}, icon("play"))));
    if (p.py) els.push(h("div",{class:"qpy",html:pyHTML(p.py)}));
    const ptr = p.tr ? tr(p.tr, L) : (p[L] || p.en);
    if (ptr && !p.zh) els.push(h("div",{style:"font-size:1.3rem;font-weight:600"}, ptr));
    else if (ptr) els.push(h("div",{class:"muted"+(L==="lo"?" lo":"")}, ptr));
    return els;
  };
  const optionButtons = (opts, correctIdx, hz) => h("div",{class:"opts"}, opts.map((o,i) => h("button",{class:"opt"+(hz?" hz":"")+(L==="lo"&&!hz?" lo":""),lang:hz?"zh-CN":null,"data-i":i,onclick:e=>{
    if (answered) return; const ok = i===correctIdx; e.currentTarget.classList.add(ok?"right":"wrong");
    if (!ok) $$(".opt",box).forEach(b=>{ if (+b.dataset.i===correctIdx) b.classList.add("right"); }); finish(ok); }}, optText(o, L))));
  const shuffled = (opts, ans) => { const idx = shuffle(opts.map((_,i)=>i)); return { opts: idx.map(i=>opts[i]), ans: idx.indexOf(ans) }; };

  switch (q.type){
    case "mc": case "fill": {
      box.append(...promptBlock());
      if (q.type==="fill" && q.prompt && q.prompt.zh){ const z = box.querySelector(".qzh"); if (z) z.innerHTML = esc(z.textContent).replace(/_{2,}|＿+/, '<span class="blank">＿</span>'); }
      const s = shuffled(q.options, q.answer); box.append(optionButtons(s.opts, s.ans, optIsHz(q.options[0])));
      break;
    }
    case "listen_select": {
      box.append(h("div",{class:"qprompt",style:"text-align:center"}, ask || t("pr_listen_d")),
        h("button",{class:"listen-big","aria-label":t("play"),onclick:()=>speak(q.prompt.zh)}, icon("play")),
        h("div",{class:"row",style:"justify-content:center"}, h("button",{class:"btn sm",onclick:()=>speak(q.prompt.zh,{slow:1})}, icon("slow"), t("slow"))));
      const s = shuffled(q.options, q.answer); box.append(optionButtons(s.opts, s.ans, true));
      setTimeout(()=>speak(q.prompt.zh), 300);
      break;
    }
    case "order": {
      const toks = q.tokens.map((z,i)=>({ z: typeof z==="string"?z:z.z, p: typeof z==="string"? "" : z.p, i }));
      box.append(...promptBlock());
      const ansRow = h("div",{class:"tiles answer"}), pool = h("div",{class:"tiles",style:"margin-top:12px"}), chosen=[];
      shuffle(toks).forEach(tk => { const b = h("button",{class:"tile lo",lang:"lo",onclick:()=>{ if (answered) return; chosen.push(tk); b.classList.add("used");
        ansRow.append(h("button",{class:"tile lo",lang:"lo",onclick:ev=>{ if (answered) return; chosen.splice(chosen.indexOf(tk),1); b.classList.remove("used"); ev.currentTarget.remove(); }}, tk.z)); }}, tk.z, tk.p ? h("small",{html:pyHTML(tk.p)}) : null); pool.append(b); });
      box.append(ansRow, pool, h("div",{class:"qfoot"},
        h("button",{class:"btn sm ghost",onclick:()=>{ if (answered) return; chosen.splice(0); ansRow.innerHTML=""; $$(".tile.used",pool).forEach(b=>b.classList.remove("used")); }}, t("reset")),
        h("button",{class:"btn primary",onclick:()=>{ if (answered || !chosen.length) return; const got = chosen.map(c=>c.z).join(""); const want = q.answer || toks.map(x=>x.z).join("");
          finish(norm(got,"script")===norm(want,"script"), got!==want ? h("div",null, t("answer_was")+": ", h("span",{class:"hz lo"}, want)) : null); }}, t("check"))));
      q.say = q.say || q.answer;
      break;
    }
    case "match": {
      box.append(h("div",{class:"qprompt"+(L==="lo"?" lo":"")}, ask || t("q_match")));
      const left = shuffle(q.pairs.map((p,i)=>({ i, txt:p.a }))), right = shuffle(q.pairs.map((p,i)=>({ i, txt: optText(p.b, L) })));
      let sel = null, done = 0, mistakes = 0;
      const colA = h("div",{class:"opts"}), colB = h("div",{class:"opts"});
      const mk = (item, side) => h("button",{class:"opt"+(side==="a"?" hz lo":""),lang:side==="a"?"lo":null,onclick:e=>{
        if (answered) return; const b = e.currentTarget;
        if (b.classList.contains("right")) return;
        if (!sel || sel.side===side){ $$(".opt.sel",box).forEach(x=>x.classList.remove("sel")); sel = { item, side, b }; b.classList.add("sel"); if (side==="a") speak(item.txt); return; }
        if (sel.item.i === item.i){ sel.b.classList.remove("sel"); sel.b.classList.add("right"); b.classList.add("right"); done++; sel=null; if (done===q.pairs.length) finish(mistakes<=1); }
        else { mistakes++; b.classList.add("wrong"); setTimeout(()=>b.classList.remove("wrong"),500); }
      }}, item.txt);
      left.forEach(x=>colA.append(mk(x,"a"))); right.forEach(x=>colB.append(mk(x,"b")));
      box.append(h("div",{class:"grid2 match"}, colA, colB));
      break;
    }
    case "type": case "listen_type": {
      if (q.type==="listen_type") box.append(h("div",{class:"qprompt",style:"text-align:center"}, ask || t("pr_listen_d")), h("button",{class:"listen-big","aria-label":t("play"),onclick:()=>speak(q.prompt.zh)}, icon("play")));
      else box.append(...promptBlock());
      const inp = h("input",{class:"input",style:"font-size:1.2rem;margin-top:14px",placeholder:t("q_type_ph"),autocomplete:"off",autocapitalize:"off",spellcheck:"false"});
      const check = () => { if (answered || !inp.value.trim()) return; const v = inp.value.trim();
        const ok = (q.accept||[]).some(a => norm(a, q.mode) === norm(v, q.mode) || norm(a,"script")===norm(v,"script") || norm(a,"hanzi")===norm(v,"hanzi"));
        finish(ok, ok ? null : h("div",null, t("answer_was")+": ", h("b",{class:"hz lo"}, (q.accept||[])[0]||""))); };
      inp.addEventListener("keydown", e => { if (e.key==="Enter") check(); });
      box.append(inp, h("div",{class:"qfoot"}, h("span"), h("button",{class:"btn primary",onclick:check}, t("check"))));
      if (q.type==="listen_type") setTimeout(()=>speak(q.prompt.zh), 300);
      setTimeout(()=>inp.focus(), 50);
      break;
    }
    case "tone": {
      box.append(h("div",{class:"qprompt",style:"text-align:center"}, ask || t("pr_tones_d")),
        h("div",{class:"row",style:"justify-content:center"}, q.prompt.zh ? h("span",{class:"qzh lo",style:"font-size:2.6rem",lang:"lo"}, q.prompt.zh) : null, h("button",{class:"listen-big","aria-label":t("play"),onclick:()=>speak(q.prompt.zh)}, icon("play"))));
      box.append(h("div",{class:"grid3",style:"margin-top:16px"}, [1,2,3,4,5,6].map(n => h("button",{class:"opt","data-i":n,style:"text-align:center",onclick:e=>{
        if (answered) return; const ok = n===+q.answer; e.currentTarget.classList.add(ok?"right":"wrong");
        if (!ok) $$(".opt",box).forEach(b=>{ if (+b.dataset.i===+q.answer) b.classList.add("right"); });
        finish(ok, q.prompt.py ? h("div",{style:"font-size:1.4rem",html:pyHTML(q.prompt.py)}) : null); }}, toneSVG(Math.min(4,n),50), h("div",{class:"small"}, "Tone "+n)))));
      setTimeout(()=>speak(q.prompt.zh), 300);
      break;
    }
    case "speak": {
      box.append(...promptBlock());
      const out = h("div",{class:"muted",style:"margin-top:10px"});
      const self = () => { out.innerHTML=""; out.append(h("p",null,t("q_self")), h("div",{class:"row"}, h("button",{class:"btn jade",onclick:()=>finish(true, null, { self:true })}, t("q_good")), h("button",{class:"btn",onclick:()=>finish(false, null, { self:true })}, t("q_retry")))); };
      const btn = h("button",{class:"btn primary",onclick:async()=>{
        if (answered) return;
        if (!canListen()){ self(); return; }
        btn.disabled = true; btn.textContent = t("q_listening");
        try {
          const alts = await listen(); btn.disabled=false; btn.replaceChildren(icon("mic"), t("q_speak_btn"));
          if (!alts.length){ self(); return; }
          const best = Math.max(...alts.map(a=>similarity(a, q.prompt.zh)));
          out.innerHTML = ""; out.append(h("p",null, t("q_heard")+": ", h("b",{class:"hz lo"}, alts[0]), " · "+Math.round(best*100)+"%"));
          if (best >= 0.75) finish(true); else out.append(h("div",{class:"row"}, h("button",{class:"btn sm",onclick:()=>btn.click()}, t("q_retry")), h("button",{class:"btn sm ghost",onclick:()=>finish(false)}, t("q_skip"))));
        } catch(e){ btn.disabled=false; btn.replaceChildren(icon("mic"), t("q_speak_btn")); self(); }
      }}, icon("mic"), t("q_speak_btn"));
      box.append(h("div",{class:"row",style:"margin-top:14px"}, h("button",{class:"btn",onclick:()=>speak(q.prompt.zh)}, icon("play"), t("play")), h("button",{class:"btn",onclick:()=>speak(q.prompt.zh,{slow:1})}, icon("slow"), t("slow")), btn), out);
      if (!canListen()) out.textContent = t("no_mic");
      break;
    }
    case "write_char": {
      // Checked by the handwriting engine when the character has a stroke template; otherwise self-graded.
      box.append(...promptBlock().slice(0,1));
      const tplChar = ctx.hwTemplate && [q.prompt.zh, (q.prompt.zh||"")[0]].find(c => c && ctx.hwTemplate(c));
      const char = tplChar || (q.prompt.zh||"ກ")[0];
      const tpl = tplChar ? readTemplate(ctx.hwTemplate(tplChar)) : null;
      const pad = createPad({ guideChar: char, label: t("hw_canvas", { c: char }) });
      const msg = h("div",{class:"hw-fb",role:"status","aria-live":"polite"});
      const wrap = h("div",{class:"stack",style:"align-items:stretch;max-width:440px;margin:12px auto"}, pad.el, msg);
      box.append(wrap);
      if (tpl){
        const R = mergeHwRules(ctx.hwRules ? ctx.hwRules() : {}, tpl.rules);
        let session = createSession(tpl, R), ink = [];
        const say = (kind, key, vars) => { msg.className = "hw-fb " + (kind||""); msg.textContent = t(key, vars); };
        const end = () => { const sc = scoreAttempt(session.finish(), R); pad.enable(false);
          finish(sc.passed, h("div",{class:"small"}, sc.total+" / 100 · "+t(attemptTip(sc)))); };
        pad.setGuide({ level: 1, template: null }); pad.enable(false); say("info", "hw_demo_first", { c: tpl.strokes.length });
        const start = () => { pad.enable(true); pad.setGuide({ level: R.guide, template: tpl, current: 0 }); say("info", "hw_draw_now", { n: 1, c: tpl.strokes.length }); };
        const demoB = h("button",{class:"btn sm primary",type:"button",onclick:async e=>{ e.currentTarget.disabled = true; pad.enable(false); await playDemo(pad, tpl, { speed: R.demo.speed }); start(); }}, icon("play"), t("hw_show_demo"));
        const checkB = R.feedback === "final" ? h("button",{class:"btn sm",type:"button",onclick:end}, icon("check"), t("check")) : null;
        wrap.append(h("div",{class:"row",style:"justify-content:center"}, demoB, h("button",{class:"btn sm ghost",type:"button",onclick:()=>speak(char)}, icon("speaker"), t("play")), checkB));
        const onStroke = pts => {
          const r = session.addStroke(pts);
          if (R.feedback === "final"){ ink.push(pts); pad.setInk(ink); return; }
          if (!r.accepted) pad.flash(pts, "error");
          pad.setInk(session.accepted.map(a => a.points)); pad.setGuide({ level: R.guide, template: tpl, current: Math.min(session.next, tpl.strokes.length - 1) });
          const f = strokeFeedback(r); if (f) say(f.kind, f.key, f.vars);
          if (r.done && r.accepted) setTimeout(end, 350);
        };
        pad.onStroke = onStroke;
      } else {
        let ink = [];
        pad.onStroke = pts => { ink.push(pts); pad.setInk(ink); };
        msg.textContent = t("hw_free_d");
        const grade = h("div",{class:"stack",style:"align-items:center;gap:8px;margin-top:10px",hidden:true},
          h("p",{class:"small muted",style:"margin:0"}, t("sc_compare")),
          h("div",{class:"row",style:"justify-content:center"},
            h("button",{class:"btn",onclick:()=>finish(false, null, { self:true })}, t("q_didnt")),
            h("button",{class:"btn jade",onclick:()=>finish(true, null, { self:true })}, t("sc_wrote_it"))));
        wrap.append(h("div",{class:"row",style:"justify-content:center;gap:10px"},
          h("button",{class:"btn sm ghost",type:"button",onclick:()=>{ ink = []; pad.setInk([]); }}, icon("trash"), t("reset")),
          h("button",{class:"btn sm",type:"button",onclick:()=>speak(char)}, icon("speaker"), t("play")),
          h("button",{class:"btn primary sm",type:"button",onclick:e=>{
            if (!ink.length){ toast(lang()==="lo"?"ກະລຸນາຂຽນຕົວອັກສອນກ່ອນ":"Please draw the character on the canvas","warn"); return; }
            grade.hidden = false; e.currentTarget.disabled = true; }}, icon("check"), t("check"))), grade);
      }
      break;
    }
    case "flashcard": {
      const back = h("div",{class:"stack",style:"align-items:center;gap:6px",hidden:true}, q.prompt.py ? h("div",{style:"font-size:1.3rem",html:pyHTML(q.prompt.py)}) : null, h("div",{style:"font-size:1.2rem",class:L==="lo"?"lo":""}, tr(q.back||{}, L)));
      const btns = h("div",{class:"row",style:"justify-content:center",hidden:true}, h("button",{class:"btn",onclick:()=>finish(false, null, { self:true })}, t("q_didnt")), h("button",{class:"btn jade",onclick:()=>finish(true, null, { self:true })}, t("q_knew")));
      box.append(h("div",{class:"flash"}, h("div",{class:"front lo",lang:"lo"}, q.prompt.zh), back, h("button",{class:"btn primary",onclick:e=>{ back.hidden=false; btns.hidden=false; e.currentTarget.remove(); speak(q.prompt.zh); }}, t("q_flip"))), btns);
      break;
    }
    default: box.append(h("p",null,"Unknown question type: "+q.type), h("button",{class:"btn",onclick:()=>finish(false, null, { skipped:true })},t("q_skip")));
  }
  return box;
}

export function toneSVG(n, w=110){
  const pts = {1:"10,12 90,12",2:"10,40 90,8",3:"10,24 45,52 90,14",4:"10,8 90,54"}[n];
  const s = document.createElementNS("http://www.w3.org/2000/svg","svg"); s.setAttribute("viewBox","0 0 100 64"); s.setAttribute("width",w); s.setAttribute("aria-hidden","true");
  s.innerHTML = [0,1,2,3,4].map(i=>`<line x1="6" x2="94" y1="${8+i*12}" y2="${8+i*12}" stroke="var(--line)" stroke-width="1"/>`).join("") + `<polyline points="${pts}" fill="none" stroke="var(--t${n})" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/>`;
  return s;
}
