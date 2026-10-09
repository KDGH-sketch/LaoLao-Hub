// Practice Studio (learner): 100+ practice sets by track, a coach that follows every answer (strengths, weak spots,
// trends, mistakes) and sessions built from it: Smart session, Daily challenge, Speed round, Mistakes. Library and coach
// logic live in js/shared/practice-*.js (unit tests: scripts/test_practice.mjs; browser: scripts/e2e_practice.mjs).
import { h, icon, debounce, fmtDate, shuffle } from "../shared/ui.js";
import { t, lang } from "../shared/i18n.js";
import { dict } from "../shared/dict.js";
import { runQuiz } from "../shared/quiz.js";
import { buildCatalog, makeQuestions, TRACKS, MODES, seeded, questionForSkill, speedQuestion, questionForItem, setFeature } from "../shared/practice-library.js";
import { coachAnswer, coachRound, skillProfile, insights, mistakes, planSkills, recommend, rankOf, totalStars, daysActive, windowAcc, dayKey } from "../shared/practice-coach.js";
import { A, T, expLang, recordAnswer, logEvent, srsAdd, coach, saveCoach } from "./core.js";
import { patternQuestions, startLegacyPractice } from "./views-tools.js";
import { navLock, lockedPanel, viewAllowed } from "./upgrade.js";
import { radarSVG, insightText } from "../shared/practice-ui.js";
import { sfx } from "../shared/sfx.js";

export const PRACTICE_VIEWS = {};
const go = (...a) => A.go(...a);
const L3 = o => o ? (o[lang()] || o.en) : "";
const TRACK = Object.fromEntries(TRACKS.map(x => [x.key, x]));
const TRACK_SKILL = Object.fromEntries(TRACKS.map(x => [x.key, x.skill]));
const skillName = k => t("sk_" + k);
const stage = () => Math.max(1, Math.min(3, A.profile && A.profile.level || 1));
const allowed = set => viewAllowed("practice", { set: set.id });
let CAT = null, CAT_KEY = "";
// the library: built-in sets + the teacher's patterns, dialogues, word lists and letters (rebuilt when content changes)
function catalog(){
  const key = [Object.keys(A.P).length, Object.keys(A.byType.dialogues || {}).length, Object.keys(A.byType.vocab || {}).length, Object.keys(A.byType.characters || {}).length].join(".");
  if (!CAT || key !== CAT_KEY){ CAT_KEY = key; CAT = buildCatalog({ patterns:Object.values(A.P), dialogues:Object.values(A.byType.dialogues || {}), vocab:Object.values(A.byType.vocab || {}), characters:Object.values(A.byType.characters || {}) }); }
  return CAT;
}
const env = (rand) => ({ L: expLang(), dict: dict(), rand, content:{ dialogues:Object.values(A.byType.dialogues || {}), vocab:Object.values(A.byType.vocab || {}), characters:Object.values(A.byType.characters || {}) },
  patternQuestions: (n, k) => { const p = A.P[n]; return p ? patternQuestions([p], k, ["order","blank","meaning","listen","reverse"]) : []; } });
const starRow = (n, cls = "") => h("span",{class:"pz-stars "+cls,"aria-label":t("pz_stars_of", { n })}, [1,2,3].map(i => h("i",{class:i <= n ? "on" : ""}, "★")));
const rankName = key => t("pz_rank_" + key);

// a badge for the rank: hexagon with the rank number (CSS colours)
function rankBadge(idx, size = 64){
  const s = document.createElementNS("http://www.w3.org/2000/svg","svg"); s.setAttribute("viewBox","0 0 64 64"); s.setAttribute("width", size); s.setAttribute("height", size); s.setAttribute("aria-hidden","true"); s.setAttribute("class","pz-badge r" + idx);
  s.innerHTML = `<polygon class="hex" points="32,3 57,17.5 57,46.5 32,61 7,46.5 7,17.5"/><polygon class="hex-in" points="32,10 51,21 51,43 32,54 13,43 13,21"/>` +
    [0,1,2].slice(0, Math.min(3, Math.ceil(idx / 2.5))).map(i => `<circle class="pip" cx="${24 + i * 8}" cy="47" r="2.2"/>`).join("") + `<text x="32" y="38" text-anchor="middle" class="num">${idx + 1}</text>`;
  return s;
}
// one line of advice from the coach
function insightEl(x, compact = false){
  const ic = { start:"spark", focus:"flame", down:"down", mistakes:"repeat", up:"up", strong:"trophy", slow:"clock", untried:"plus", habit:"history", steady:"check" }[x.kind] || "info";
  const tone = { focus:"warn", down:"bad", mistakes:"warn", up:"good", strong:"good", steady:"good" }[x.kind] || "info";
  const text = insightText(x);
  const act = x.kind === "mistakes" ? h("button",{class:"btn sm",onclick:()=>go("practice",{ mode:"mistakes" })}, t("pz_fix_now"))
    : x.kind === "start" ? h("button",{class:"btn sm primary",onclick:()=>go("practice",{ mode:"smart" })}, t("pz_smart"))
    : (x.skill && ["focus","down","slow","untried"].includes(x.kind)) ? h("button",{class:"btn sm",onclick:()=>practiseSkill(x.skill)}, t("pz_train")) : null;
  return h("div",{class:"pz-insight "+tone}, h("span",{class:"pz-in-ic"}, icon(ic)), h("p",{class:lang()==="lo"?"lo":""}, text), compact ? null : act);
}
// the best set to train one skill right now
function practiseSkill(skill){
  const c = coach(), sets = catalog().filter(x => TRACK_SKILL[x.track] === skill || (skill === "sentence" && x.mode === "use"));
  const r = recommend(c, sets.length ? sets : catalog(), { stage:stage(), can:allowed, n:1, trackSkill:TRACK_SKILL });
  if (r[0]) go("practice", { set:r[0].id }); else go("practice", { mode:"smart" });
}

// ---------- the hub ----------
PRACTICE_VIEWS.practice = (params = {}) => {
  if (params.type) return startLegacyPractice(h("div"), params.type);
  if (params.set) return setSession(params.set);
  if (params.mode) return modeSession(params.mode);
  return hub(params);
};
function hub(params){
  const c = coach(), cat = catalog(), prof = skillProfile(c), stars = totalStars(c), rk = rankOf(stars);
  const miss = mistakes(c, 99), today = dayKey(), daily = c.daily[today], acc7 = windowAcc(c, null, 7, 0);
  const todayN = (() => { const d = c.d[today] || {}; return Object.values(d).reduce((n, x) => n + x[1], 0); })();
  const root = h("div",{class:"pz"});

  // hero: rank, stats, quick starts
  const next = rk.next ? t("pz_rank_next", { n: rk.need, r: rankName(rk.next) }) : t("pz_rank_top");
  root.append(h("section",{class:"pz-hero"},
    h("div",{class:"pz-hero-main"},
      h("div",{class:"eyebrow"}, t("pz_studio")),
      h("h1",null, t("pz_title")),
      h("div",{class:"pz-rank"}, rankBadge(rk.idx), h("div",{class:"pz-rank-txt"},
        h("b",null, rankName(rk.key)), h("span",{class:"small"}, "★ " + stars + " · " + next),
        h("div",{class:"pz-meter",role:"progressbar","aria-valuemin":"0","aria-valuemax":"100","aria-valuenow":String(rk.pct)}, h("i",{style:`width:${rk.pct}%`}))))),
    h("div",{class:"pz-hero-stats"},
      stat("flame", String(daysActive(c, 7)) + "/7", t("pz_days7")),
      stat("check", acc7.t ? Math.round(100 * acc7.r / acc7.t) + "%" : "—", t("pz_acc7")),
      stat("spark", String(todayN), t("pz_today"))),
    h("div",{class:"pz-quick"},
      quick("smart", "spark", t("pz_smart"), t("pz_smart_d"), "primary"),
      quick("daily", daily ? "check" : "star", t("pz_daily"), daily ? t("pz_daily_done", { r: daily.r, t: daily.t }) : t("pz_daily_d")),
      quick("speed", "hourglass", t("pz_speed"), c.best.speed ? t("pz_speed_best", { n: c.best.speed }) : t("pz_speed_d")),
      quick("mistakes", "repeat", t("pz_mistakes"), miss.length ? t("pz_mistakes_n", { n: miss.length }) : t("pz_mistakes_none"), miss.length ? "" : "quiet"))));

  // coach: radar + advice + up next
  const ins = insights(c), recs = recommend(c, cat, { stage:stage(), can:allowed, n:3, trackSkill:TRACK_SKILL });
  root.append(h("section",{class:"card pz-coach"},
    h("div",{class:"spread"}, h("h2",null, icon("chart"), " ", t("pz_coach")), h("button",{class:"btn sm ghost",onclick:()=>go("practice_report")}, t("pz_report"), icon("right"))),
    h("div",{class:"pz-coach-grid"},
      h("div",{class:"pz-radar-wrap"}, radarSVG(prof)),
      h("div",{class:"stack",style:"gap:10px"}, ins.slice(0, 3).map(x => insightEl(x)),
        recs.length ? h("div",{class:"pz-next"}, h("div",{class:"eyebrow"}, t("pz_up_next")), h("div",{class:"pz-next-row"}, recs.map(s => miniCard(s)))) : null))));

  // library
  root.append(library(cat, c, params));

  // the teacher's quizzes
  const quizzes = Object.values(A.byType.quizzes||{}).sort((a,b)=>(a.level-b.level)||((a.order||0)-(b.order||0)));
  if (quizzes.length) root.append(h("section",{class:"sect"}, h("h2",null,t("pz_teacher_quizzes")), h("div",{class:"list-card"}, quizzes.map(q => { const r = A.prog.lessons["quiz:"+q.id];
    return h("button",{class:"item-row",onclick:()=>go("quiz",{id:q.id})}, h("span",{class:"stepnum"+(r?" done":"")}, r?icon("check"):icon("star")), h("span",null, h("div",{class:"ttl"},T(q.title)), h("div",{class:"sub"}, "Stage "+q.level+" · "+(q.questions||[]).length+" "+t("questions").toLowerCase()+(r?" · "+r.score+"/"+r.total:""))), icon("right")); }))));
  return root;
}
const stat = (ic, val, label) => h("div",{class:"pz-stat"}, icon(ic), h("b",{class:"tabnum"}, val), h("span",null, label));
const quick = (mode, ic, title, sub, cls = "") => h("button",{class:"pz-qbtn "+cls,onclick:()=>go("practice",{ mode })}, h("span",{class:"pz-qic"}, icon(ic)), h("span",null, h("b",null,title), h("small",null, sub)), navLock("practice",{ mode }));
// long art text (a whole word) gets a smaller size so it is not cut off
const glyphSize = g => { const n = [...String(g || "")].length; return n > 6 ? " xl" : n > 3 ? " long" : ""; };
function miniCard(s){
  const rec = coach().sets[s.id];
  return h("button",{class:"pz-mini trk-"+s.track,onclick:()=>go("practice",{ set:s.id })}, h("span",{class:"pz-mini-art lo"+glyphSize(s.glyph),lang:"lo"}, s.glyph),
    h("span",{class:"pz-mini-txt"}, h("b",null, L3(s.title)), h("small",null, L3(MODES[s.mode]))), rec ? starRow(rec.s) : h("span",{class:"chip"}, t("pz_new")));
}
function card(s, recIds){
  const rec = coach().sets[s.id], lock = !allowed(s);
  return h("button",{class:"pz-card trk-"+s.track+(lock?" locked":""),onclick:()=>go("practice",{ set:s.id }),"data-set":s.id},
    h("span",{class:"pz-art"}, h("span",{class:"pz-glyph lo"+glyphSize(s.glyph),lang:"lo"}, s.glyph), h("span",{class:"pz-trk-ic"}, icon(TRACK[s.track].icon)),
      recIds.has(s.id) ? h("span",{class:"pz-ribbon"}, t("pz_for_you")) : null),
    h("span",{class:"pz-body"},
      h("span",{class:"pz-mode"}, L3(MODES[s.mode])),
      h("b",{class:"pz-ttl"}, L3(s.title), navLock("practice",{ set:s.id })),
      h("span",{class:"pz-meta"}, "Stage " + s.stage + " · " + t("pz_q_n", { n: s.n })),
      h("span",{class:"pz-foot"}, rec ? starRow(rec.s) : h("span",{class:"chip pz-newchip"}, t("pz_new")), rec ? h("span",{class:"small muted tabnum"}, t("pz_best", { n: rec.b })) : null)));
}
function library(cat, c, params){
  const recIds = new Set(recommend(c, cat, { stage:stage(), can:allowed, n:6, trackSkill:TRACK_SKILL }).map(x => x.id));
  let track = params.track && TRACK[params.track] ? params.track : "all", q = "", st = 0, status = "all";
  const body = h("div"), count = h("span",{class:"muted small tabnum"});
  const statusOf = s => { const r = c.sets[s.id]; return !r ? "new" : r.s >= 3 ? "mastered" : "progress"; };
  const filtered = () => { const f = q.trim().toLowerCase();
    return cat.filter(s => (track === "all" || s.track === track) && (!st || s.stage === st) && (status === "all" || statusOf(s) === status) &&
      (!f || [s.title.en, s.title.lo, s.title.zh, s.glyph, L3(MODES[s.mode])].some(x => String(x || "").toLowerCase().includes(f)))); };
  const chips = h("div",{class:"pz-tracks",role:"tablist","aria-label":t("pz_tracks")});
  const drawChips = () => { chips.replaceChildren(
    h("button",{role:"tab","aria-selected":String(track==="all"),class:"pz-tchip",onclick:()=>{ track="all"; draw(); }}, icon("layers"), t("pz_all"), h("small",{class:"tabnum"}, String(cat.length))),
    ...TRACKS.filter(tk => cat.some(s => s.track === tk.key)).map(tk => h("button",{role:"tab","aria-selected":String(track===tk.key),class:"pz-tchip trk-"+tk.key,onclick:()=>{ track=tk.key; draw(); }},
      icon(tk.icon), L3(tk.t), h("small",{class:"tabnum"}, String(cat.filter(s => s.track === tk.key).length))))); };
  const draw = () => {
    drawChips();
    const list = filtered(); count.textContent = t("pz_count", { n: list.length });
    body.replaceChildren();
    if (!list.length){ body.append(h("div",{class:"empty"}, t("pz_none"))); return; }
    // all tracks, no search or filter: one row per track (swipe on phones); otherwise a grid
    if (track === "all" && !q.trim() && !st && status === "all"){
      for (const tk of TRACKS){ const sets = list.filter(s => s.track === tk.key); if (!sets.length) continue;
        const done = sets.filter(s => (c.sets[s.id] || {}).s >= 3).length;
        const sc = h("div",{class:"pz-scroller"}, sets.slice().sort((a, b) => (recIds.has(b.id) - recIds.has(a.id)) || a.stage - b.stage).map(s => card(s, recIds)));
        const step = dir => sc.scrollBy({ left: dir * Math.max(200, sc.clientWidth * 0.8), behavior:"smooth" });
        body.append(h("section",{class:"pz-row"}, h("div",{class:"spread pz-row-h"}, h("h3",null, h("span",{class:"pz-row-ic trk-"+tk.key}, icon(tk.icon)), L3(tk.t), h("small",{class:"muted tabnum"}, t("pz_mastered_n", { d: done, n: sets.length }))),
          h("div",{class:"row",style:"gap:4px"}, h("button",{class:"ib pz-arrow","aria-label":t("pz_prev"),onclick:()=>step(-1)}, icon("left")), h("button",{class:"ib pz-arrow","aria-label":t("pz_next"),onclick:()=>step(1)}, icon("right")),
            h("button",{class:"btn sm ghost",onclick:()=>{ track = tk.key; draw(); body.scrollIntoView({ block:"start", behavior:"smooth" }); }}, t("pz_see_all"), icon("right")))),
          sc)); }
    } else body.append(h("div",{class:"pz-grid"}, list.map(s => card(s, recIds))));
  };
  const stageSeg = h("div",{class:"seg",role:"group","aria-label":"Stage"}, [0,1,2,3].map(n => h("button",{"aria-pressed":String(st===n),onclick:e=>{ st=n; [...stageSeg.children].forEach(b=>b.setAttribute("aria-pressed", String(b===e.currentTarget))); draw(); }}, n ? "Stage " + n : t("pz_all"))));
  const statusSel = h("select",{class:"input pz-status","aria-label":t("pz_status"),onchange:e=>{ status = e.target.value; draw(); }},
    ["all","new","progress","mastered"].map(k => h("option",{value:k}, t("pz_st_" + k))));
  draw();
  return h("section",{class:"sect pz-lib"},
    h("div",{class:"spread"}, h("h2",null, t("pz_library")), count),
    h("div",{class:"pz-tools"}, h("input",{class:"input",type:"search",placeholder:t("pz_search"),"aria-label":t("pz_search"),oninput:debounce(e=>{ q = e.target.value; draw(); },150)}), stageSeg, statusSel),
    chips, body);
}

// ---------- sessions ----------
function shell(title, sub, track, extra){
  const combo = h("span",{class:"pz-combo",hidden:true,"aria-live":"polite"}, icon("flame"), h("b",{class:"tabnum"}, "0"));
  const box = h("div",{class:"quiz"});
  const root = h("div",{class:"pz-session trk-" + (track || "vocab")},
    h("div",{class:"pz-shead"}, h("button",{class:"btn sm ghost",onclick:()=>go("practice",{},false)}, icon("left"), t("back")),
      h("div",{class:"pz-shead-t"}, h("small",null, sub), h("b",null, title)), combo, extra || null), box);
  return { root, box, setCombo: n => { combo.hidden = n < 2; const b = combo.querySelector("b"); if (b.textContent !== String(n)){ b.textContent = String(n); combo.classList.remove("pop"); void combo.offsetWidth; combo.classList.add("pop"); } } };
}
// runs a round: counts it against the plan's limit, records every answer for the coach, then shows what changed
async function play(sh, build, { key, setId = null, kind = "set", timeLimit = 0, title }){
  const r = await A.ac.use("quizzes.attempt"); if (!r.allowed){ sh.box.replaceChildren(lockedPanel({ feature:"quizzes.attempt", result:r })); return; }
  let qs = []; try { qs = await build(); } catch(e){ console.warn(e); }
  qs = qs.filter(Boolean);
  if (!qs.length){ sh.box.replaceChildren(h("div",{class:"empty"}, t("pz_none"))); return; }
  const c = coach(), tally = {}, before = { stars: totalStars(c), prof: Object.fromEntries(skillProfile(c).map(p => [p.skill, p.score])) }, wrong = [];
  let n = 0;
  runQuiz(sh.box, qs, { key, title, timeLimit,
    onAnswer: (q, ok, m) => {
      recordAnswer(q.skill, ok, m); sh.setCombo(ok ? m.combo : 0);
      if (m.self || m.skipped) return;
      coachAnswer(c, { skill:q.skill, correct:ok, ms:m.ms, item:q.item, given:m.given });
      const tl = tally[q.skill] = tally[q.skill] || [0, 0]; tl[1]++; if (ok) tl[0]++;
      // wrong answers go to the mistakes list; words (not whole sentences, not speed-round slips) also go to Review
      if (!ok && q.item && q.item.k){ wrong.push(q.item); if (kind !== "speed" && /^[຀-໿]{1,12}$/.test(q.item.k)) srsAdd("s:" + q.item.k, { type:"s", zh:q.item.k }); }
      if (++n % 5 === 0) saveCoach();
    },
    onFinish: res => {
      if (setId) coachRound(c, { setId, right:res.right, total:res.total, stars:res.stars });
      if (kind === "daily") c.daily[dayKey()] = { r:res.right, t:res.total };
      // the Speed round's best is always kept (also a first 0); "New record!" only for a real improvement
      let record = false; if (kind === "speed"){ record = res.right > 0 && res.right > (c.best.speed || 0); c.best.speed = Math.max(c.best.speed || 0, res.right); }
      saveCoach(); logEvent("practice", { ref:key, score:res.right, total:res.total }, true);
      const box = sh.box.querySelector(".qbox.result"); if (box) box.after(roundCoach({ tally, before, wrong, res, record, kind }));
      // after the round's own sound: a fanfare for a new rank or a new speed record
      if (rankOf(totalStars(c)).idx > rankOf(before.stars).idx) setTimeout(() => sfx("levelup"), 900); else if (record) setTimeout(() => sfx("record"), 900);
      if (res.stars === 3 && box) celebrate(box);
    },
    onAgain: () => play(sh, build, { key, setId, kind, timeLimit, title }),
    onExit: () => go("practice", {}, false) });
}
// after a round: skills trained, stars and rank, words to fix, what next
function roundCoach({ tally, before, wrong, res, record, kind }){
  const c = coach(), after = Object.fromEntries(skillProfile(c).map(p => [p.skill, p.score])), stars = totalStars(c), rk = rankOf(stars), was = rankOf(before.stars);
  const rows = Object.entries(tally).map(([sk, [r, tt]]) => { const d = (after[sk] ?? 0) - (before.prof[sk] ?? 50);
    return h("div",{class:"pz-rs"}, h("span",null, skillName(sk)), h("div",{class:"bar"}, h("i",{style:`width:${Math.round(100*r/tt)}%`})), h("b",{class:"tabnum"}, r + "/" + tt),
      before.prof[sk] !== null && before.prof[sk] !== undefined && d ? h("span",{class:"pz-delta " + (d > 0 ? "up" : "down")}, (d > 0 ? "▲ " : "▼ ") + Math.abs(d)) : h("span")); });
  const recs = recommend(c, catalog(), { stage:stage(), can:allowed, n:2, trackSkill:TRACK_SKILL });
  const uniq = [...new Map(wrong.map(w => [w.k, w])).values()].slice(0, 6);
  return h("section",{class:"card pz-after"},
    record ? h("div",{class:"pz-record"}, icon("trophy"), t("pz_record", { n: res.right })) : null,
    rk.idx > was.idx ? h("div",{class:"pz-record"}, rankBadge(rk.idx, 40), t("pz_rank_up", { r: rankName(rk.key) })) : null,
    h("div",{class:"spread"}, h("h3",null, t("pz_round_skills")), h("span",{class:"small muted"}, "★ " + stars + (rk.next ? " · " + t("pz_rank_next", { n: rk.need, r: rankName(rk.next) }) : ""))),
    rows.length ? h("div",{class:"stack",style:"gap:8px"}, rows) : h("p",{class:"small muted"}, t("pz_self_only")),
    uniq.length ? h("div",{class:"stack",style:"gap:6px"}, h("h3",null, t("pz_to_fix")), h("div",{class:"pz-fix"}, uniq.map(w => h("span",{class:"pz-fixchip"}, h("b",{class:"lo",lang:"lo"}, w.k), h("small",null, (expLang()==="zh" && w.zh) || w.en || "")))),
      h("p",{class:"small muted"}, t("pz_to_fix_d"))) : null,
    recs.length ? h("div",{class:"stack",style:"gap:6px"}, h("h3",null, t("pz_up_next")), h("div",{class:"pz-next-row"}, recs.map(miniCard))) : null);
}
function celebrate(el){
  if (matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const b = h("div",{class:"pz-burst","aria-hidden":"true"}, Array.from({ length:14 }, (_, i) => h("i",{style:`--a:${i * 360 / 14}deg;--d:${(i % 3) * 60}ms`})));
  el.style.position = "relative"; el.append(b); setTimeout(() => b.remove(), 1400);
}
function setSession(id){
  const set = catalog().find(s => s.id === id);
  if (!set) return h("div",{class:"empty"}, t("pz_none"), h("div",null, h("button",{class:"btn",style:"margin-top:12px",onclick:()=>go("practice",{},false)}, t("back"))));
  const sh = shell(L3(set.title), L3(MODES[set.mode]) + " · " + L3(TRACK[set.track].t), set.track);
  if (!allowed(set)){ sh.box.replaceChildren(lockedPanel({ feature:setFeature(set.id) })); return sh.root; }
  play(sh, async () => makeQuestions(set, env()), { key:"practice:" + set.id, setId:set.id, title:null });
  return sh.root;
}
function modeSession(mode){
  const c = coach(), st = stage();
  const titles = { smart:[t("pz_smart"),"spark","vocab"], daily:[t("pz_daily"),"star","read"], speed:[t("pz_speed"),"hourglass","listen"], mistakes:[t("pz_mistakes"),"repeat","grammar"] };
  if (!titles[mode]) return hub({});
  const [title, , track] = titles[mode];
  const sh = shell(title, t("pz_studio"), track);
  if (mode === "smart"){
    play(sh, async () => {
      const plan = planSkills(c, 10), e = env();
      const fix = mistakes(c, 3).map(it => questionForItem(it, e)).filter(Boolean).slice(0, 3);
      const qs = plan.slice(0, 10 - fix.length).map(sk => { try { return questionForSkill(sk, e, st); } catch(err){ return null; } }).filter(Boolean);
      return [...qs.slice(0, 3), ...fix, ...qs.slice(3)];
    }, { key:"practice:smart", kind:"smart" });
  } else if (mode === "daily"){
    const day = dayKey();
    play(sh, async () => { const rand = seeded("daily:" + day), e = env(rand);
      return ["vocabulary","listening","reading","sentence","grammar","vocabulary","listening","speaking","pinyin","characters"].map(sk => questionForSkill(sk, e, 2)); },
      { key:"practice:daily", kind:"daily" });
  } else if (mode === "speed"){
    play(sh, async () => { const e = env(); return Array.from({ length:80 }, () => speedQuestion(e, st)); }, { key:"practice:speed", kind:"speed", timeLimit:60 });
  } else {
    const list = mistakes(c, 10);
    if (list.length < 1){ sh.box.replaceChildren(h("div",{class:"empty"}, icon("check"), " ", t("pz_mistakes_none_d"))); return sh.root; }
    play(sh, async () => { const e = env(); return shuffle(list).map(it => questionForItem(it, e)).filter(Boolean); }, { key:"practice:mistakes", kind:"mistakes" });
  }
  return sh.root;
}

// ---------- the full report ----------
PRACTICE_VIEWS.practice_report = () => {
  const c = coach(), prof = skillProfile(c), stars = totalStars(c), rk = rankOf(stars), cat = catalog();
  const all = windowAcc(c, null, 3650, 0), a7 = windowAcc(c, null, 7, 0);
  const root = h("div",{class:"pz stack-l"});
  root.append(h("div",{class:"crumb"}, h("button",{onclick:()=>go("practice")}, t("nav_practice")), "›", h("span",null, t("pz_report"))),
    h("div",{class:"pagehead"}, h("h1",null, t("pz_report_t")), h("p",null, t("pz_report_d"))));
  root.append(h("div",{class:"grid4"},
    h("div",{class:"card stat"}, h("b",null, rankName(rk.key)), h("span",null, "★ " + stars)),
    h("div",{class:"card stat"}, h("b",{class:"tabnum"}, String(all.t)), h("span",null, t("pz_answers"))),
    h("div",{class:"card stat"}, h("b",{class:"tabnum"}, a7.t ? Math.round(100 * a7.r / a7.t) + "%" : "—"), h("span",null, t("pz_acc7"))),
    h("div",{class:"card stat"}, h("b",{class:"tabnum"}, daysActive(c, 30) + "/30"), h("span",null, t("pz_days30")))));
  const levelTxt = p => p.level === "none" ? t("pz_lv_none") : p.level === "calibrating" ? t("pz_lv_calibrating", { n: Math.max(0, 5 - p.n) }) : t("pz_lv_" + p.level);
  root.append(h("section",{class:"card pz-coach"}, h("h2",null, t("pz_skills")),
    h("div",{class:"pz-coach-grid"}, h("div",{class:"pz-radar-wrap"}, radarSVG(prof, 320)),
      h("div",{class:"stack",style:"gap:12px"}, prof.slice().sort((x, y) => (y.score ?? -1) - (x.score ?? -1)).map(p => h("div",{class:"pz-skill lv-" + p.level},
        h("div",{class:"spread"}, h("b",null, skillName(p.skill)), h("span",{class:"small"}, levelTxt(p),
          p.trend !== null && p.trend !== 0 ? h("span",{class:"pz-delta " + (p.trend > 0 ? "up" : "down")}, (p.trend > 0 ? " ▲ " : " ▼ ") + Math.abs(p.trend)) : null)),
        h("div",{class:"bar"}, h("i",{style:`width:${p.score || 0}%`})),
        h("div",{class:"spread small muted"}, h("span",null, p.n ? t("pz_based", { n: p.n }) + (p.ms ? " · " + t("pz_avg_time", { n: (p.ms / 1000).toFixed(1) }) : "") : t("pz_lv_none")),
          h("button",{class:"btn sm ghost",onclick:()=>practiseSkill(p.skill)}, t("pz_train"), icon("right")))))))));
  root.append(h("section",{class:"card stack"}, h("h2",null, t("pz_advice")), insights(c).map(x => insightEl(x))));
  root.append(h("section",{class:"card stack"}, h("h2",null, t("pz_activity")), heatmap(c)));
  const miss = mistakes(c, 40);
  root.append(h("section",{class:"card stack"}, h("div",{class:"spread"}, h("h2",null, t("pz_mistake_bank")), miss.length ? h("button",{class:"btn sm primary",onclick:()=>go("practice",{ mode:"mistakes" })}, icon("repeat"), t("pz_fix_now")) : null),
    miss.length ? h("div",{class:"pz-fix"}, miss.map(w => h("span",{class:"pz-fixchip"}, h("b",{class:"lo",lang:"lo"}, w.k), h("small",null, ((expLang()==="zh" && w.zh) || w.en || "") + " · ✗" + w.w)))) : h("p",{class:"muted"}, t("pz_mistakes_none_d"))));
  root.append(h("section",{class:"card stack"}, h("h2",null, t("pz_by_track")), h("div",{class:"stack",style:"gap:10px"}, TRACKS.filter(tk => cat.some(s => s.track === tk.key)).map(tk => {
    const sets = cat.filter(s => s.track === tk.key), played = sets.filter(s => c.sets[s.id]).length, mastered = sets.filter(s => (c.sets[s.id] || {}).s >= 3).length;
    return h("div",{class:"pz-rs"}, h("span",null, icon(tk.icon), " ", L3(tk.t)), h("div",{class:"bar"}, h("i",{style:`width:${Math.round(100 * played / sets.length)}%`})), h("b",{class:"tabnum"}, played + "/" + sets.length),
      h("span",{class:"small muted tabnum"}, mastered + " ★★★")); }))));
  return root;
};
// the last 12 weeks, one square per day, darker = more answers
function heatmap(c){
  const days = 84, now = Date.now(), cells = [];
  for (let i = days - 1; i >= 0; i--){ const k = dayKey(now - i * 864e5), d = c.d[k], n = d ? Object.values(d).reduce((s, x) => s + x[1], 0) : 0;
    cells.push(h("i",{class:"l" + (n === 0 ? 0 : n < 10 ? 1 : n < 25 ? 2 : n < 50 ? 3 : 4),title:fmtDate(new Date(k + "T12:00:00").getTime(), lang()) + " · " + n})); }
  return h("div",null, h("div",{class:"pz-heat",role:"img","aria-label":t("pz_activity")}, cells),
    h("div",{class:"pz-heat-key small muted"}, t("pz_less"), [0,1,2,3,4].map(l => h("i",{class:"l" + l})), t("pz_more")));
}
