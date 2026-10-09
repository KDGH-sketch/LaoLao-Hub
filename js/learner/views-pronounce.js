// Pronunciation Studio (learner, route "speak"): a course of units by area and CEFR level; in each unit the learner
// learns how the sound is made (with tips for their first language), trains the ear on minimal pairs, then records
// themselves and sees their pitch curve over the target (the teacher's recording, or the Tone Lab tone shapes), with a
// score for tone shape, length and clarity and advice they can act on. Plus an accent check and a profile per tone and
// sound. Engine: js/shared/lao-tone.js, pitch.js, recorder.js, pron-course.js (tests: test_pron.mjs, e2e_pronounce.mjs).
import { h, icon, toast, esc } from "../shared/ui.js";
import { t, lang } from "../shared/i18n.js";
import { runQuiz } from "../shared/quiz.js";
import { speak, modelAudio } from "../shared/speech.js";
import { analyse, wordTarget, DEFAULT_CONTOURS } from "../shared/lao-tone.js";
import { assess, levelsToSemis } from "../shared/pitch.js";
import { canRecord, startRecording, modelCurve, playUrl } from "../shared/recorder.js";
import { AREAS, CEFR, buildCourse, canDo, meaningOf, pronRecord, unitStars, nextUnit, weakSpots, accentCheck } from "../shared/pron-course.js";
import { seeded } from "../shared/practice-library.js";
import { A, prefs, setPref, recordAnswer, logEvent, touchDay, pron, savePron, award } from "./core.js";
import { sfx } from "../shared/sfx.js";

export const PRON_VIEWS = {};
const go = (...a) => A.go(...a);
const L3 = o => o ? (o[lang()] || o.en || "") : "";
const course = () => buildCourse(Object.values(A.byType.pronunciation || {}), { dialogues: Object.values(A.byType.dialogues || {}) });
// the tone shapes from Admin → Tone Lab (contours like "33", "52"), else the defaults
function contours(){
  const out = Object.assign({}, DEFAULT_CONTOURS);
  const list = (A.B && A.B.tones) || Object.values(A.byType.tones || {});
  for (const x of list || []) if (x && x.num >= 1 && x.num <= 6 && x.contour) out[x.num] = x.contour;
  return out;
}
const l1 = () => prefs().pronL1 || (lang() === "zh" ? "zh" : "en");
const meanIn = it => (lang() === "zh" && it[3]) ? it[3] : (it[2] || it[3] || "");
const starRow = n => h("span",{class:"pz-stars","aria-label":t("pz_stars_of", { n })}, [1,2,3].map(i => h("i",{class:i <= n ? "on" : ""}, "★")));
const FOCUS = ["length","vowels","aspiration","initials","stops","finals","tones","words","particles","shadow"];
const focusName = f => t("pn_f_" + f);

// syllables of a word with their tone number, coloured like the Tone Lab
function sylChips(word){
  const syl = analyse(word);
  return h("span",{class:"pn-syls"}, syl.map(s => h("span",{class:"pn-syl tn" + s.tone, title:t("pn_tone_n", { n: s.tone })}, h("b",{class:"lo",lang:"lo"}, s.text), h("small",null, String(s.tone)))));
}
// score ring 0–100
function ring(score, size = 76, label = ""){
  const r = 30, c = 2 * Math.PI * r, v = score == null ? 0 : Math.max(0, Math.min(100, score));
  const s = document.createElementNS("http://www.w3.org/2000/svg","svg"); s.setAttribute("viewBox","0 0 76 76"); s.setAttribute("width", size); s.setAttribute("height", size);
  s.setAttribute("class","pn-ring " + (score == null ? "none" : v >= 80 ? "hi" : v >= 60 ? "mid" : "lo")); s.setAttribute("role","img"); s.setAttribute("aria-label", (label ? label + " " : "") + (score == null ? "—" : v));
  s.innerHTML = `<circle class="bg" cx="38" cy="38" r="${r}"/><circle class="fg" cx="38" cy="38" r="${r}" stroke-dasharray="${(c * v / 100).toFixed(1)} ${c.toFixed(1)}" transform="rotate(-90 38 38)"/><text x="38" y="44" text-anchor="middle">${score == null ? "—" : v}</text>`;
  return s;
}

// ---------- the pitch chart: target (band) and the learner's voice (line), syllables marked ----------
const W = 320, H = 120, PAD = 14;
function chartEl(syl){
  const s = document.createElementNS("http://www.w3.org/2000/svg","svg"); s.setAttribute("viewBox",`0 0 ${W} ${H + 18}`); s.setAttribute("class","pn-chart"); s.setAttribute("role","img"); s.setAttribute("aria-label", t("pn_chart"));
  const w = syl.map(x => x.long ? 1 : 0.7), tot = w.reduce((a, b) => a + b, 0) || 1; let acc = 0;
  const marks = syl.map((x, i) => { const x0 = PAD + (W - 2 * PAD) * acc / tot; acc += w[i]; const x1 = PAD + (W - 2 * PAD) * acc / tot;
    return (i ? `<line class="sep" x1="${x0.toFixed(1)}" y1="6" x2="${x0.toFixed(1)}" y2="${H - 4}"/>` : "") + `<text class="syl tn${x.tone}" x="${((x0 + x1) / 2).toFixed(1)}" y="${H + 14}" text-anchor="middle">${esc(x.text)} · ${x.tone}</text>`; }).join("");
  s.innerHTML = `<rect class="frame" x="1" y="1" width="${W - 2}" height="${H - 2}" rx="10"/>` + marks + `<polyline class="pn-t" points=""/><polyline class="pn-y" points=""/><polyline class="pn-live" points=""/>`;
  return s;
}
function plot(svg, cls, semis, range){
  const el = svg.querySelector("." + cls); if (!el) return;
  if (!semis || semis.length < 2){ el.setAttribute("points", ""); return; }
  const [lo, hi] = range, y = v => (H - PAD) - ((v - lo) / (hi - lo || 1)) * (H - 2 * PAD);
  el.setAttribute("points", semis.map((v, i) => (PAD + (W - 2 * PAD) * i / (semis.length - 1)).toFixed(1) + "," + y(v).toFixed(1)).join(" "));
}
const rangeOf = (...curves) => { const all = curves.flat().filter(v => Number.isFinite(v)); const m = Math.max(6, ...all.map(Math.abs)) + 1; return [-m, m]; };
const centred = a => { const m = a.reduce((s, v) => s + v, 0) / (a.length || 1); return a.map(v => v - m); };

// ---------- one word or sentence to say: listen, record, see, improve ----------
function sayCard(item, { unit, onScored } = {}){
  const word = item[0], tw = wordTarget(word, contours()), syl = tw.syl;
  let model = null, last = null, rec = null;
  const svg = chartEl(syl), targetSemis = centred(levelsToSemis(tw.curve));
  plot(svg, "pn-t", targetSemis, rangeOf(targetSemis));
  const src = h("span",{class:"chip pn-src"}, icon("sound"), t("pn_model_shape"));
  const m = modelAudio(word);
  if (m) modelCurve(m.url).then(c => { if (!c) return; model = c; const cs = centred(c.semis); plot(svg, "pn-t", cs, rangeOf(cs)); src.replaceChildren(icon("user"), t(m.teacher ? "pn_model_teacher" : "pn_model_voice")); });
  const youBtn = h("button",{class:"btn sm",disabled:true,onclick:()=>{ if (last) playUrl(last.url); }}, icon("play"), t("pn_play_you"));
  const status = h("p",{class:"pn-status small muted",role:"status","aria-live":"polite"}, canRecord() ? t("pn_tap_mic") : t("pn_no_mic"));
  const result = h("div",{class:"pn-result"});
  const mic = h("button",{class:"pn-mic","aria-label":t("pn_record"),disabled:!canRecord(),onclick:async () => {
    if (rec){ rec.stop(); return; }
    let ref = 0; const live = [];
    try {
      rec = await startRecording({ maxMs: Math.max(2500, Math.min(8000, 900 + syl.length * 700)), onLive: ({ f0 }) => {
        if (!f0) return; ref = ref || f0; live.push(12 * Math.log2(f0 / ref)); plot(svg, "pn-live", centred(live), rangeOf(targetSemis, centred(live))); } });
    } catch(e){ status.textContent = t("pn_mic_denied"); rec = null; return; }
    mic.classList.add("on"); status.textContent = t("pn_listening"); plot(svg, "pn-y", [], [0, 1]);
    let r; try { r = await rec.done; } catch(e){ r = null; }
    rec = null; mic.classList.remove("on"); plot(svg, "pn-live", [], [0, 1]);
    if (!r){ status.textContent = t("pn_mic_denied"); return; }
    const res = assess(r.samples, r.sampleRate, tw, { model });
    last = { url: r.url }; youBtn.disabled = false;
    const tgt = model ? centred(model.semis) : targetSemis, you = centred(res.curve);
    plot(svg, "pn-t", tgt, rangeOf(tgt, you)); plot(svg, "pn-y", you, rangeOf(tgt, you));
    status.textContent = "";
    showResult(result, res, syl);
    sfx(res.score >= 80 ? "complete" : res.score >= 60 ? "correct" : res.issues.includes("no_voice") ? "tap" : "wrong");
    if (onScored) onScored(res);
  }}, icon("mic"));
  return h("section",{class:"card pn-say"},
    h("div",{class:"pn-word"}, h("div",{class:"pn-lao lo",lang:"lo"}, word), item[1] ? h("div",{class:"pn-py"}, item[1]) : null, h("div",{class:"pn-mean"+(lang()==="lo"?"":"")}, meanIn(item)), sylChips(word)),
    h("div",{class:"row pn-play"}, h("button",{class:"btn sm",onclick:()=>speak(word)}, icon("play"), t("pn_listen")), h("button",{class:"btn sm",onclick:()=>speak(word, { slow:1 })}, icon("slow"), t("slow")), youBtn, src),
    h("div",{class:"pn-chart-wrap"}, svg, h("div",{class:"pn-legend small"}, h("span",{class:"k t"}), t("pn_target"), h("span",{class:"k y"}), t("pn_you"))),
    h("div",{class:"pn-microw"}, mic, status), result);
}
function showResult(box, res, syl){
  const verdict = res.score >= 85 ? "pn_great" : res.score >= 65 ? "pn_good" : "pn_try";
  const bar = (k, v) => h("div",{class:"pn-bar"}, h("span",null, t(k)), h("div",{class:"bar"}, h("i",{style:`width:${v}%`})), h("b",{class:"tabnum"}, String(v)));
  const tips = [];
  if (res.worst && res.worst.issue && res.worst.issue !== "ok") tips.push(t("pn_syl_hint", { s: res.worst.syllable, n: res.worst.tone }) + " " + t("pn_issue_" + res.worst.issue));
  else if (res.tone.issue && res.tone.issue !== "ok") tips.push(t("pn_issue_" + res.tone.issue));
  if (res.length.issue && !["ok","no_voice"].includes(res.length.issue)) tips.push(t("pn_issue_" + res.length.issue));
  if (res.clarity.issue && res.clarity.issue !== "ok" && !tips.includes(t("pn_issue_" + res.clarity.issue))) tips.push(t("pn_issue_" + res.clarity.issue));
  if (!tips.length && res.score < 85) tips.push(t("pn_polish"));
  box.replaceChildren(h("div",{class:"pn-res"},
    ring(res.score, 84, t("pn_score")),
    h("div",{class:"stack",style:"gap:6px;flex:1;min-width:0"}, h("b",{class:"pn-verdict"}, t(verdict)),
      bar("pn_tone", res.tone.score), bar("pn_length", res.length.score), bar("pn_clarity", res.clarity.score))),
    tips.length ? h("ul",{class:"pn-tips"}, tips.map(x => h("li",null, icon("info"), x))) : null);
}

// ---------- the hub ----------
PRON_VIEWS.speak = (params = {}) => {
  if (params.unit) return unitView(params.unit, params.step || "learn");
  if (params.check) return checkView();
  return hub();
};
function hub(){
  const s = pron(), C = course(), next = nextUnit(C, s), weak = weakSpots(s);
  const fv = FOCUS.map(f => s.f[f]).filter(v => v != null), overall = fv.length ? Math.round(fv.reduce((a, b) => a + b, 0) / fv.length) : null;
  const level = area => { let best = ""; for (const u of C.filter(x => x.area === area)) if (unitStars(s.u[u.id]) >= 2 && CEFR.indexOf(u.cefr) >= CEFR.indexOf(best || "A1")) best = u.cefr; return best || "—"; };
  const root = h("div",{class:"pn"});
  root.append(h("section",{class:"pn-hero"},
    h("div",{class:"pn-hero-main"}, h("div",{class:"eyebrow"}, t("pn_studio")), h("h1",null, t("pn_title")), h("p",null, t("pn_sub")),
      h("div",{class:"row",style:"margin-top:14px"},
        h("button",{class:"btn pn-cta",onclick:()=>go("speak",{ unit:next.id })}, icon("play"), t("pn_continue") + ": " + L3(next.t)),
        h("button",{class:"btn pn-cta2",onclick:()=>go("speak",{ check:1 })}, icon("spark"), t("pn_check")))),
    h("div",{class:"pn-hero-side"}, ring(overall, 96, t("pn_overall")), h("div",{class:"pn-levels"},
      AREAS.map(a => h("div",null, h("small",null, L3(a.t)), h("b",null, level(a.key))))))));
  root.append(h("div",{class:"pn-l1"}, h("span",{class:"small"}, t("pn_l1")), h("div",{class:"seg",role:"group","aria-label":t("pn_l1")},
    [["en","English"],["zh","中文"],["other",t("pn_l1_other")]].map(([k, n]) => h("button",{"aria-pressed":String(l1() === k),onclick:()=>{ setPref("pronL1", k); A.render(); }}, n)))));
  if (!canRecord()) root.append(h("div",{class:"banner"}, icon("mic"), " ", t("pn_no_mic")));
  // profile: tones and sounds
  const tones = h("div",{class:"pn-tones"}, [1,2,3,4,5,6].map(n => { const r = s.tn[n]; return h("div",{class:"pn-tonebar tn" + n},
    h("div",{class:"pn-tb"}, h("i",{style:`height:${r && r.v != null ? Math.max(4, r.v) : 0}%`})), h("b",null, String(n)), h("small",{class:"tabnum"}, r && r.v != null ? r.v + "%" : "—")); }));
  const sounds = h("div",{class:"stack",style:"gap:8px"}, ["length","vowels","aspiration","initials","stops","finals"].map(f => h("div",{class:"skill"}, h("span",null, focusName(f)),
    h("div",{class:"bar"}, h("i",{style:`width:${s.f[f] ?? 0}%`})), h("span",{class:"tabnum small"}, s.f[f] != null ? s.f[f] + "%" : "—"))));
  root.append(h("section",{class:"card pn-profile"},
    h("div",{class:"spread"}, h("h2",null, icon("chart"), " ", t("pn_profile")), s.chk ? h("span",{class:"small muted"}, t("pn_checked_on", { n: s.chk.score })) : null),
    h("div",{class:"pn-profile-grid"}, h("div",null, h("h3",null, t("pn_your_tones")), tones), h("div",null, h("h3",null, t("pn_your_sounds")), sounds)),
    weak.length ? h("div",{class:"pz-insight warn"}, h("span",{class:"pz-in-ic"}, icon("flame")), h("p",null, t("pn_weak", { s: weak.map(w => w.kind === "tone" ? t("pn_tone_n", { n: w.key }) : focusName(w.key)).join(", ") })),
      h("button",{class:"btn sm",onclick:()=>{ const w = weak[0]; const u = C.find(x => w.kind === "tone" ? x.area === "tones" && unitStars(s.u[x.id]) < 3 : x.focus === w.key) || next; go("speak",{ unit:u.id }); }}, t("pz_train")))
      : h("div",{class:"pz-insight"}, h("span",{class:"pz-in-ic"}, icon("spark")), h("p",null, t(Object.keys(s.u).length ? "pn_keep_going" : "pn_start_tip")))));
  // the course
  for (const a of AREAS){
    const units = C.filter(u => u.area === a.key); if (!units.length) continue;
    root.append(h("section",{class:"sect pn-area"},
      h("div",{class:"spread"}, h("h2",null, h("span",{class:"pz-row-ic"}, icon(a.icon)), " ", L3(a.t)), h("span",{class:"chip"}, L3(a.scale))),
      h("div",{class:"pn-units"}, units.map((u, i) => { const st = unitStars(s.u[u.id]), r = s.u[u.id];
        return h("button",{class:"pn-unit" + (u.id === next.id ? " next" : "") + (st >= 2 ? " done" : ""),"data-unit":u.id,onclick:()=>go("speak",{ unit:u.id })},
          h("span",{class:"pn-step tabnum"}, String(i + 1)),
          h("span",{class:"pn-unit-art lo",lang:"lo"}, u.glyph || (u.items[0] || [""])[0]),
          h("span",{class:"pn-unit-b"}, h("b",null, L3(u.t)), h("small",null, u.cefr + " · " + t("pn_items", { n: u.items.length }) + (r && r.s != null ? " · " + t("pn_best_speak", { n: r.s }) : ""))),
          u.id === next.id ? h("span",{class:"pz-ribbon pn-next"}, t("pn_next")) : starRow(st)); }))));
  }
  if (s.h.length) root.append(h("section",{class:"card stack"}, h("h2",null, t("pn_recent")), h("div",{class:"pn-hist"}, s.h.slice(0, 8).map(x => h("span",{class:"pn-hchip " + (x.s >= 80 ? "hi" : x.s >= 60 ? "mid" : "lo")}, h("b",{class:"lo",lang:"lo"}, x.w), h("small",{class:"tabnum"}, String(x.s)))))));
  root.append(h("div",{class:"row pn-refs"}, h("button",{class:"btn ghost sm",onclick:()=>go("tone_lab")}, icon("sound"), t("nav_tone_lab")), h("button",{class:"btn ghost sm",onclick:()=>go("pronounce_lab")}, icon("headphones"), t("nav_pronounce"))));
  return root;
}

// ---------- a unit: 1 learn, 2 hear the difference, 3 say it ----------
function unitView(id, step){
  const C = course(), u = C.find(x => x.id === id); if (!u) return hub();
  const s = pron(), steps = [["learn","pn_s_learn","book"],["hear","pn_s_hear","headphones"],["say","pn_s_say","mic"]];
  const area = AREAS.find(a => a.key === u.area);
  const head = h("div",{class:"pn-uhead"},
    h("button",{class:"btn sm ghost",onclick:()=>go("speak",{},false)}, icon("left"), t("back")),
    h("div",{class:"pn-uhead-t"}, h("small",null, L3(area && area.t) + " · CEFR " + u.cefr), h("b",null, L3(u.t))), starRow(unitStars(s.u[u.id])));
  const tabs = h("div",{class:"pn-stepper",role:"tablist"}, steps.map(([k, l, ic], i) => h("button",{role:"tab","aria-selected":String(step === k),class:"pn-tab",onclick:()=>go("speak",{ unit:u.id, step:k }, false)},
    h("span",{class:"pn-tabn"}, String(i + 1)), icon(ic), t(l))));
  const body = h("div",{class:"pn-body"});
  if (step === "learn") body.append(learnStep(u));
  else if (step === "hear") body.append(hearStep(u));
  else body.append(sayStep(u));
  return h("div",{class:"pn-unitv"}, head, tabs, body);
}
function learnStep(u){
  const tipFor = l1(), tips = u.tips || {};
  const tipBox = k => tips[k] ? h("div",{class:"pn-tip"}, h("b",null, t(k === "en" ? "pn_tip_en" : "pn_tip_zh")), h("p",{lang:k === "zh" ? "zh-CN" : "en"}, tips[k])) : null;
  const words = h("div",{class:"pn-words"}, u.items.map(it => h("button",{class:"pn-wordbtn",onclick:()=>speak(it[0])},
    h("span",{class:"lo pn-wl",lang:"lo"}, it[0]), sylChips(it[0]), h("small",null, meanIn(it)), icon("play"))));
  return h("div",{class:"stack"},
    h("section",{class:"card stack",style:"gap:10px"}, h("div",{class:"chip pn-can"}, icon("check"), L3(canDo(u))),
      h("p",{class:"pn-explain"+(lang()==="lo"?" lo":"")}, L3(u.explain)), lang() === "lo" && u.explain.en ? h("p",{class:"small muted"}, u.explain.en) : null),
    h("section",{class:"stack",style:"gap:8px"}, tipFor === "other" ? [tipBox("en"), tipBox("zh")] : tipBox(tipFor)),
    h("section",{class:"card stack"}, h("h3",null, t("pn_tap_hear")), words),
    h("div",{class:"row",style:"justify-content:flex-end"}, h("button",{class:"btn primary",onclick:()=>go("speak",{ unit:u.id, step:"hear" }, false)}, t("pn_next_hear"), icon("right"))));
}
// minimal pairs (or the unit's sentences): hear one, pick it; every answer trains the profile
function hearStep(u){
  const C = course(), box = h("div",{class:"quiz"}), rand = Math.random;
  const mean = w => { const m = meaningOf(C, w); return m ? (lang() === "zh" && m.zh ? m.zh : m.en) : ""; };
  const make = () => {
    const qs = [];
    if (u.pairs.length) for (let i = 0; i < Math.max(8, u.pairs.length * 2) && qs.length < 10; i++){ const p = u.pairs[i % u.pairs.length], w = p[Math.floor(rand() * p.length)];
      qs.push({ type:"listen_select", skill:"listening", prompt:{ zh:w }, options:p.slice(), answer:p.indexOf(w), explain:{ en:p.map(x => x + " = " + mean(x)).join(" · ") }, pron:{ word:w } }); }
    else for (const it of u.items.slice(0, 8)){ const o = u.items.filter(x => x !== it).sort(() => rand() - 0.5).slice(0, 2).map(x => x[0]);
      qs.push({ type:"listen_select", skill:"listening", prompt:{ zh:it[0] }, options:[it[0], ...o], answer:0, explain:{ en:it[0] + " = " + meanIn(it) }, pron:{ word:it[0] } }); }
    return qs;
  };
  const start = () => runQuiz(box, make(), { key:"pron:" + u.id + ":hear", title:t("pn_s_hear"),
    onAnswer:(q, ok, m) => { recordAnswer("listening", ok, m); pronRecord(pron(), { unit:u.id, focus:u.focus, kind:"listen", correct:ok, tones:analyse(q.pron.word).map(x => x.tone) }); savePron(); },
    onFinish:r => { logEvent("pronounce", { ref:u.id + ":hear", score:r.right, total:r.total }); touchDay();
      const b = box.querySelector(".qbox.result .row"); if (b) b.append(h("button",{class:"btn primary",onclick:()=>go("speak",{ unit:u.id, step:"say" }, false)}, t("pn_next_say"), icon("right"))); },
    onAgain:start, onExit:()=>go("speak",{ unit:u.id, step:"say" }, false) });
  start();
  return h("div",{class:"stack"}, h("p",{class:"small muted"}, t("pn_hear_d")), box);
}
function sayStep(u){
  const s = pron(); let i = 0;
  const wrap = h("div",{class:"stack"}), dots = h("div",{class:"pn-dots"});
  const bestOf = {};
  const draw = () => {
    const it = u.items[i];
    dots.replaceChildren(...u.items.map((x, k) => h("button",{class:"pn-dot" + (k === i ? " cur" : "") + (bestOf[k] != null ? (bestOf[k] >= 80 ? " hi" : bestOf[k] >= 60 ? " mid" : " lo") : ""),"aria-label":x[0],onclick:()=>{ i = k; draw(); }}, String(k + 1))));
    const card = sayCard(it, { unit:u.id, onScored: res => {
      bestOf[i] = Math.max(bestOf[i] ?? 0, res.score);
      if (!res.issues.includes("no_voice")){
        pronRecord(s, { unit:u.id, focus:u.focus, kind:"speak", score:res.score, tones:analyse(it[0]).map(x => x.tone), word:it[0] }); savePron();
        recordAnswer("speaking", res.score >= 60, {}); touchDay();
        award(res.score >= 80 ? 6 : res.score >= 60 ? 4 : 1, "pronounce");
        logEvent("pronounce", { ref:u.id + ":" + it[0], score:res.score, total:100 });
      }
      draw2(); } });
    const nav = h("div",{class:"spread pn-nav"}, h("button",{class:"btn sm",disabled:i === 0,onclick:()=>{ i--; draw(); }}, icon("left"), t("pn_prev")),
      h("span",{class:"small muted tabnum"}, (i + 1) + " / " + u.items.length),
      i < u.items.length - 1 ? h("button",{class:"btn sm primary",onclick:()=>{ i++; draw(); }}, t("pn_next_item"), icon("right")) : h("button",{class:"btn sm primary",onclick:()=>go("speak",{},false)}, icon("check"), t("finish")));
    wrap.replaceChildren(dots, card, nav);
  };
  const draw2 = () => [...dots.children].forEach((d, k) => { d.classList.remove("hi","mid","lo"); if (bestOf[k] != null) d.classList.add(bestOf[k] >= 80 ? "hi" : bestOf[k] >= 60 ? "mid" : "lo"); });
  draw();
  return h("div",{class:"stack"}, h("p",{class:"small muted"}, t("pn_say_d")), wrap);
}

// ---------- accent check: 8 listening items + 4 words to say, then a profile and where to start ----------
function checkView(){
  const C = course(), plan = accentCheck(C, seeded("check:" + Date.now())), s = pron();
  const root = h("div",{class:"pn-unitv"}), body = h("div",{class:"pn-body"});
  root.append(h("div",{class:"pn-uhead"}, h("button",{class:"btn sm ghost",onclick:()=>go("speak",{},false)}, icon("left"), t("back")),
    h("div",{class:"pn-uhead-t"}, h("small",null, t("pn_studio")), h("b",null, t("pn_check")))), body);
  const listenRes = {}, speakRes = [];
  const box = h("div",{class:"quiz"});
  const mean = w => { const m = meaningOf(C, w); return m ? (lang() === "zh" && m.zh ? m.zh : m.en) : ""; };
  const qs = plan.listen.map(x => { const w = x.pair[Math.floor(Math.random() * x.pair.length)];
    return { type:"listen_select", skill:"listening", prompt:{ zh:w }, options:x.pair.slice(), answer:x.pair.indexOf(w), explain:{ en:x.pair.map(p => p + " = " + mean(p)).join(" · ") }, chk:x }; });
  body.append(h("p",{class:"small muted"}, t("pn_check_d")), box);
  runQuiz(box, qs, { key:"pron:check", title:t("pn_check_1"),
    onAnswer:(q, ok) => { listenRes[q.chk.focus] = ok; pronRecord(s, { unit:q.chk.unit, focus:q.chk.focus, kind:"listen", correct:ok, tones:analyse(q.prompt.zh).map(x => x.tone) }); },
    onFinish:r => { savePron(); const b = box.querySelector(".qbox.result .row"); if (b){ b.replaceChildren(h("button",{class:"btn primary",onclick:speakPart}, t("pn_check_2"), icon("right"))); } } });
  function speakPart(){
    let k = 0;
    const next = () => {
      if (k >= plan.speak.length) return results();
      const w = plan.speak[k], it = [w.word, "", (meaningOf(C, w.word) || {}).en || "", (meaningOf(C, w.word) || {}).zh || ""];
      body.replaceChildren(h("p",{class:"small muted"}, t("pn_check_2") + " · " + (k + 1) + " / " + plan.speak.length),
        sayCard(it, { onScored: res => { if (res.issues.includes("no_voice")) return; speakRes[k] = res.score;
          pronRecord(s, { unit:w.unit, focus:"tones", kind:"speak", score:res.score, tones:analyse(w.word).map(x => x.tone), word:w.word }); savePron(); } }),
        h("div",{class:"row",style:"justify-content:flex-end"}, h("button",{class:"btn primary",onclick:()=>{ k++; next(); }}, k < plan.speak.length - 1 ? t("pn_next_item") : t("pn_see_results"), icon("right"))));
    };
    next();
  }
  function results(){
    const l = Object.values(listenRes), lp = l.length ? Math.round(100 * l.filter(Boolean).length / l.length) : 0;
    const sp = speakRes.filter(v => v != null), sa = sp.length ? Math.round(sp.reduce((a, b) => a + b, 0) / sp.length) : null;
    const score = sa == null ? lp : Math.round(lp * 0.5 + sa * 0.5);
    s.chk = { at: Date.now(), score, listen: lp, speak: sa }; savePron(); logEvent("pronounce", { ref:"check", score, total:100 }, true);
    sfx(score >= 80 ? "perfect" : score >= 60 ? "complete" : "fail");
    const missed = Object.entries(listenRes).filter(([, ok]) => !ok).map(([f]) => f);
    const startAt = C.find(u => missed.includes(u.focus)) || (sa != null && sa < 70 ? C.find(u => u.id === "pr-six") : null) || nextUnit(C, s);
    body.replaceChildren(h("section",{class:"card pn-checkres"}, ring(score, 110, t("pn_check")),
      h("div",{class:"stack",style:"gap:8px;flex:1;min-width:0"}, h("h2",null, t("pn_check_done")),
        h("div",{class:"pn-bar"}, h("span",null, t("pn_ear")), h("div",{class:"bar"}, h("i",{style:`width:${lp}%`})), h("b",{class:"tabnum"}, lp + "%")),
        h("div",{class:"pn-bar"}, h("span",null, t("pn_voice")), h("div",{class:"bar"}, h("i",{style:`width:${sa ?? 0}%`})), h("b",{class:"tabnum"}, sa == null ? "—" : sa + "%")),
        missed.length ? h("p",{class:"small"}, t("pn_check_missed", { s: missed.map(focusName).join(", ") })) : h("p",{class:"small"}, t("pn_check_allright")))),
      h("div",{class:"row",style:"justify-content:flex-end"}, h("button",{class:"btn",onclick:()=>go("speak",{},false)}, t("pn_to_studio")),
        h("button",{class:"btn primary",onclick:()=>go("speak",{ unit:startAt.id })}, icon("play"), t("pn_start_at", { s: L3(startAt.t) }))));
  }
  return root;
}
