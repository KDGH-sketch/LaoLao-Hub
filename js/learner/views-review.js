// Smart Review (learner, route "review"): what is due, why words keep going wrong (from what the learner picked instead,
// their answer history and speed: js/shared/review-doctor.js), each trouble word with the exact letters that differ,
// and review sessions whose questions aim at the cause (hear the tone difference, pick the right spelling, tell related
// meanings apart). Results go to the spaced-repetition deck and the practice coach. The classic flip cards remain.
import { h, icon, pyHTML, tr, fmtDate } from "../shared/ui.js";
import { t, lang } from "../shared/i18n.js";
import { dict, meaning } from "../shared/dict.js";
import { speak } from "../shared/speech.js";
import { runQuiz } from "../shared/quiz.js";
import { THEMES } from "../shared/practice-bank.js";
import { coachAnswer, mistakes } from "../shared/practice-coach.js";
import { diagnose, causeSummary, reviewQuestion, gradeFor, recall, forecast, bankWord } from "../shared/review-doctor.js";
import { A, T, expLang, srsDue, srsGrade, srsAdd, recordAnswer, wordsMastered, coach, saveCoach, logEvent } from "./core.js";

export const REVIEW_VIEWS = {};
const go = (...a) => A.go(...a);
const isLao = s => /[຀-໿]/.test(String(s || ""));
const POOL = THEMES.flatMap(th => th.w.map(w => w[0]));
const CAUSE_ICON = { tone:"sound", length:"hourglass", lookalike:"eye", vowel:"chars", order:"layers", related:"split", meaning:"book", other:"info", forgetting:"history", slow:"clock", hard:"flame" };
const meanOf = it => (lang() === "zh" && it.zh) ? it.zh : (it.en || it.zh || "");

// the review list: words and sentences from the coach (with their mistakes) and due cards of the deck, one per text
function items(){
  const c = coach(), D = dict(), byK = new Map();
  for (const m of mistakes(c, 80)) byK.set(m.k, Object.assign({}, m));
  for (const card of Object.values(A.srs)){
    const k = card.type === "w" ? card.w : card.type === "s" ? card.zh : null; if (!k || !isLao(k)) continue;
    const d = D[k], base = byK.get(k) || Object.assign({ k, w:0, r:0 }, c.it[k] || {});
    const bw = bankWord(k);
    if (!base.en){ base.en = d ? meaning(k, "en") : (card.tr && (card.tr.en || "")) || (bw && bw.en) || ""; base.zh = d ? (d.zh || "") : (card.tr && card.tr.zh) || (bw && bw.zh) || ""; base.py = base.py || (d && d.p) || card.py || (bw && bw.py) || ""; }
    base.card = card; byK.set(k, base);
  }
  return [...byK.values()];
}
const isDue = it => it.card ? it.card.due <= Date.now() : (it.w > 0 && (it.s || 0) < 2);

// a word shown with the letters that differ marked
const diffWord = parts => h("span",{class:"rv-diffw lo",lang:"lo"}, parts.map(p => p.diff ? h("mark",null, p.text) : p.text));
function causeText(cz, it){
  const vars = { k: it.k, g: cz.g || "", m: meanOf(it), n: cz.code === "slow" ? Math.round((cz.ms || 0) / 1000) : (cz.n || it.w || 0),
    a: cz.picked || "", b: cz.right || "", t1: cz.tones ? cz.tones[0] : "", t2: cz.tones ? cz.tones[1] : "" };
  return t("rv_c_" + cz.code + "_d", vars);
}
// the explanation of one item: each cause with the comparison and a tip
function whyEl(it, compact = false){
  const d = diagnose(it);
  if (!d.length) return h("div",{class:"rv-why"}, h("p",{class:"small muted"}, t("rv_no_cause")));
  return h("div",{class:"rv-why"}, d.slice(0, compact ? 1 : 4).map(cz => h("div",{class:"rv-cause c-" + cz.code},
    h("div",{class:"rv-cause-h"}, icon(CAUSE_ICON[cz.code] || "info"), h("b",null, t("rv_c_" + cz.code))),
    cz.diff ? h("div",{class:"rv-compare"},
      h("div",{class:"rv-cmp ok"}, h("small",null, t("rv_right")), diffWord(cz.diff.a), h("button",{class:"ib","aria-label":t("play"),onclick:e=>{ e.stopPropagation(); speak(it.k); }}, icon("play"))),
      h("div",{class:"rv-cmp no"}, h("small",null, t("rv_picked")), diffWord(cz.diff.b), h("button",{class:"ib","aria-label":t("play"),onclick:e=>{ e.stopPropagation(); speak(cz.g); }}, icon("play")))) : null,
    h("p",{class:"small"}, causeText(cz, it)),
    compact ? null : h("p",{class:"small muted rv-tip"}, icon("spark"), " ", t("rv_t_" + cz.code)))));
}

REVIEW_VIEWS.review = (params = {}) => {
  if (params.mode === "classic") return classic();
  if (params.mode === "session") return session(params);
  return hub();
};
function hub(){
  const all = items(), due = all.filter(isDue), trouble = all.filter(it => (it.w || 0) > 0).sort((a, b) => (b.w - (b.r || 0) * 0.4) - (a.w - (a.r || 0) * 0.4));
  const cards = Object.values(A.srs), health = cards.length ? Math.round(100 * cards.reduce((s, c) => s + recall(c), 0) / cards.length) : null;
  const causes = causeSummary(trouble), fc = forecast(cards);
  const root = h("div",{class:"rv"});
  root.append(h("section",{class:"rv-hero"},
    h("div",{class:"rv-hero-main"}, h("div",{class:"eyebrow"}, t("rv_eyebrow")), h("h1",null, t("rv_title")), h("p",null, t("rv_sub")),
      h("div",{class:"row",style:"margin-top:14px"},
        h("button",{class:"btn rv-cta",disabled:!due.length && !trouble.length,onclick:()=>go("review",{ mode:"session" })}, icon("spark"), due.length ? t("rv_start", { n: Math.min(12, due.length) }) : t("rv_start_extra")),
        h("button",{class:"btn rv-cta2",disabled:!srsDue().length,onclick:()=>go("review",{ mode:"classic" })}, icon("cards"), t("rv_classic")))),
    h("div",{class:"rv-stats"},
      h("div",null, h("b",{class:"tabnum"}, String(due.length)), h("span",null, t("due_now"))),
      h("div",null, h("b",{class:"tabnum"}, String(trouble.filter(it => it.w > 0 && (it.s || 0) < 2).length)), h("span",null, t("rv_to_fix"))),
      h("div",null, h("b",{class:"tabnum"}, health == null ? "—" : health + "%"), h("span",null, t("rv_health"))),
      h("div",null, h("b",{class:"tabnum"}, String(wordsMastered())), h("span",null, t("learned_words"))))));
  if (!all.length){ root.append(h("div",{class:"empty rv-empty"}, icon("check"), h("p",null, t("rv_empty")), h("button",{class:"btn primary",onclick:()=>go("practice")}, t("nav_practice")))); return root; }
  // why words go wrong
  if (causes.length) root.append(h("section",{class:"sect"}, h("h2",null, t("rv_why_title")), h("p",{class:"small muted"}, t("rv_why_sub")),
    h("div",{class:"rv-causes"}, causes.map(cz => h("div",{class:"rv-ccard c-" + cz.code},
      h("div",{class:"spread"}, h("span",{class:"rv-cic"}, icon(CAUSE_ICON[cz.code] || "info")), h("b",{class:"tabnum rv-cn"}, String(cz.n))),
      h("b",null, t("rv_c_" + cz.code)), h("p",{class:"small muted"}, t("rv_t_" + cz.code)),
      h("div",{class:"rv-cw"}, cz.words.map(w => h("span",{class:"lo",lang:"lo"}, w))),
      h("button",{class:"btn sm",onclick:()=>go("review",{ mode:"session", cause:cz.code })}, t("rv_train_these")))))));
  // trouble words
  if (trouble.length) root.append(h("section",{class:"sect"}, h("div",{class:"spread"}, h("h2",null, t("rv_trouble")), h("span",{class:"small muted"}, t("rv_tap_why"))),
    h("div",{class:"rv-list"}, trouble.slice(0, 24).map(it => {
      const d = diagnose(it), hist = String(it.hb || "").split("");
      return h("details",{class:"rv-item","data-k":it.k},
        h("summary",null,
          h("span",{class:"rv-k lo",lang:"lo"}, it.k), h("span",{class:"rv-m"}, meanOf(it)),
          h("span",{class:"rv-tags"}, d.slice(0, 2).map(cz => h("span",{class:"chip rv-tag c-" + cz.code}, icon(CAUSE_ICON[cz.code] || "info"), t("rv_c_" + cz.code)))),
          h("span",{class:"rv-hist","aria-label":t("rv_history")}, hist.slice(-8).map(b => h("i",{class:b === "1" ? "ok" : "no"})))),
        h("div",{class:"rv-detail"}, whyEl(it),
          h("div",{class:"spread small muted"}, h("span",null, t("rv_counts", { w: it.w || 0, r: it.r || 0 }) + (it.card ? " · " + t("rv_next", { d: fmtDate(it.card.due, lang()) }) : "")),
            h("div",{class:"row",style:"gap:6px"}, h("button",{class:"btn sm",onclick:()=>speak(it.k)}, icon("play"), t("play")),
              h("button",{class:"btn sm primary",onclick:()=>go("review",{ mode:"session", k:it.k })}, t("rv_practise_word"))))));
    }))));
  // the week ahead
  const max = Math.max(1, ...fc), days = [t("rv_today"), ...Array.from({ length: 6 }, (_, i) => new Date(Date.now() + (i + 1) * 864e5).toLocaleDateString(lang() === "zh" ? "zh-CN" : lang() === "lo" ? "lo-LA" : "en", { weekday:"short" }))];
  root.append(h("section",{class:"card stack"}, h("h2",null, t("rv_forecast")),
    h("div",{class:"rv-fc"}, fc.map((n, i) => h("div",{class:"rv-fcb"}, h("b",{class:"tabnum"}, String(n)), h("div",{class:"rv-fcbar"}, h("i",{style:`height:${Math.round(100 * n / max)}%`})), h("small",null, days[i])))),
    h("p",{class:"small muted"}, t("rv_forecast_d"))));
  return root;
}

// a session: due words and mistakes, or the words of one cause, or one word (3 ways)
function session({ cause = "", k = "" }){
  const c = coach(), all = items();
  let list = k ? all.filter(it => it.k === k) : cause ? all.filter(it => diagnose(it).some(d => d.code === cause)) : all.filter(isDue);
  if (!k && list.length < 12) list = list.concat(all.filter(it => !list.includes(it) && it.w > 0)).slice(0, 12);
  // cards that are due come first (most overdue first): the deck must not fall behind; then the most-missed words
  // (always a real true / false: an undefined here made the comparison NaN and read .card of a word without a card)
  const now = Date.now(), dueCard = it => !!(it.card && it.card.due <= now);
  list = list.sort((a, b) => { const da = dueCard(a), db = dueCard(b); if (da !== db) return da ? -1 : 1; return da ? a.card.due - b.card.due : (b.w || 0) - (a.w || 0); }).slice(0, 12);
  const box = h("div",{class:"quiz"});
  const root = h("div",{class:"rv-session"}, h("div",{class:"pz-shead"}, h("button",{class:"btn sm ghost",onclick:()=>go("review",{},false)}, icon("left"), t("back")),
    h("div",{class:"pz-shead-t"}, h("small",null, t("rv_eyebrow")), h("b",null, cause ? t("rv_c_" + cause) : k ? k : t("rv_title")))), box);
  if (!list.length){ box.append(h("div",{class:"empty"}, t("rv_empty"))); return root; }
  const make = () => {
    const qs = []; const reps = k ? 3 : 1;
    for (let r = 0; r < reps; r++) for (const it of list){ const q = reviewQuestion(it, { L: expLang(), pool: POOL });
      q.reveal = () => h("div",null, whyEl(it, true)); qs.push(q); }
    return qs;
  };
  const start = () => runQuiz(box, make(), { key:"review:smart", title:null,
    onAnswer:(q, ok, m) => {
      recordAnswer(q.skill, ok, m);
      if (m.self || m.skipped) return;
      coachAnswer(c, { skill:q.skill, correct:ok, ms:m.ms, item:q.item, given:m.given }); saveCoach();
      // every deck card for this text (a word can be there as a word card and as a practice card)
      const ids = Object.keys(A.srs).filter(x => { const cd = A.srs[x]; return (cd.w || cd.zh) === q.item.k; });
      if (ids.length) ids.forEach(id => srsGrade(id, gradeFor(ok, m.ms))); else if (!ok && /^[຀-໿]{1,12}$/.test(q.item.k)) srsAdd("s:" + q.item.k, { type:"s", zh:q.item.k });
    },
    onFinish:r => logEvent("review", { ref:"smart" + (cause ? ":" + cause : ""), score:r.right, total:r.total }, true),
    onAgain:start, onExit:()=>go("review",{},false) });
  start();
  return root;
}

// the classic flip cards (Again / Hard / Good / Easy)
function classic(){
  const root = h("div"), due = srsDue();
  root.append(h("div",{class:"pz-shead",style:"margin-bottom:12px"}, h("button",{class:"btn sm ghost",onclick:()=>go("review",{},false)}, icon("left"), t("back")),
    h("div",{class:"pz-shead-t"}, h("small",null, t("rv_eyebrow")), h("b",null, t("rv_classic"))), h("span",{class:"chip"}, due.length + " " + t("due_now"))));
  if (!due.length){ root.append(h("div",{class:"empty"},t("review_empty"))); return root; }
  const c = due.sort((a,b)=>a.due-b.due)[0], D = dict(), EL = expLang();
  const box = h("div",{class:"qbox flash"}); let front; const back = h("div",{class:"stack",style:"gap:6px;align-items:center;display:none"});
  if (c.type==="p"){ const p = A.P[c.n]; if (!p){ srsGrade(c.id,3); return classic(); } front = h("div",{class:"front lo"},p.hz);
    back.append(h("div",{html:pyHTML(p.py)}), h("div",{class:EL==="lo"?"lo":""}, T({ en:p.tr.en.meaning, lo:p.tr.lo&&p.tr.lo.meaning })), h("button",{class:"btn sm ghost",onclick:()=>go("pattern",{n:p.n})},t("open_pattern"))); }
  else if (c.type==="w"){ const d = D[c.w]; front = h("div",{class:"front lo",lang:"lo"},c.w); back.append(h("div",{style:"font-size:1.3rem",html:pyHTML(d?d.p:"")}), h("div",{class:EL==="lo"&&d&&d.lo?"lo":""}, d ? meaning(c.w,EL) : ""), h("button",{class:"btn sm",onclick:()=>speak(c.w)},icon("play"),t("play"))); }
  else { front = h("div",{class:"front lo",style:"font-size:1.7rem",lang:"lo"},c.zh); back.append(h("div",{html:pyHTML(c.py||"")}), h("div",{class:"muted"}, c.tr ? tr(c.tr, EL) : ""), h("button",{class:"btn sm",onclick:()=>speak(c.zh)},icon("play"),t("play"))); }
  const grades = h("div",{class:"grades",hidden:true}, [["r_again",0],["r_hard",1],["r_good",2],["r_easy",3]].map(([kk,q]) => h("button",{class:"btn"+(q===2?" primary":""),onclick:()=>{
    srsGrade(c.id,q); recordAnswer(c.type==="w"?"vocabulary":c.type==="p"?"grammar":"reading", q>0); go("review",{ mode:"classic" },false); }}, t(kk))));
  const show = h("button",{class:"btn primary",onclick:()=>{ back.style.display="flex"; grades.hidden=false; show.remove(); if (c.type!=="p") speak(c.w||c.zh); }}, t("show_answer"));
  box.append(front, back, show); root.append(box, grades);
  return root;
}
