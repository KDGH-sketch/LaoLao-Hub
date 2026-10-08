// Learner views: dashboard, paths, lessons, patterns, grammar, vocabulary, news
import { h, $$, icon, toast, pyHTML, tr, stripTone, fmtDate, isHan, debounce } from "../shared/ui.js";
import { t, lang, secName } from "../shared/i18n.js";
import { dict, meaning } from "../shared/dict.js";
import { speak } from "../shared/speech.js";
import { sentenceEl, openWord, toggleBtn, ensureTokens, markRanges } from "../shared/widgets.js";
import { runQuiz } from "../shared/quiz.js";
import { SKILLS } from "../shared/content.js";
import { A, T, expLang, prefs, srsDue, streak, skillPct, nextLesson, orderedLessons, genMany, exampleOf, lockedItem, tierName,
  completeLesson, learnPattern, setLast, recordAnswer, quizDone, logEvent, wordsMastered, touchDay, level, todayXP, mastery, achievements } from "./core.js";
import { patternQuestions } from "./views-tools.js";
import { lockedPanel, withUse, upgradeSheet } from "./upgrade.js";

export const VIEWS = {};
const go = (...a) => A.go(...a);
const pageHead = (title, sub, extra) => h("div",{class:"pagehead"}, h("div",{class:"spread"}, h("h1",null,title), extra||null), sub ? h("p",{class:expLang()==="lo"&&lang()==="lo"?"lo":""},sub) : null);
// Locked content: the title and tier are public (catalog); the content itself is not in this browser. Tapping explains how to unlock it.
const lockBadge = tier => h("span",{class:"lock",title:t("locked_d",{s:tierName(tier)})}, icon("lock"), tierName(tier));
const lockedRow = tier => ({ class:"locked-row", role:"button", tabindex:"0", onclick:()=>upgradeSheet({ tier }), onkeydown:e=>{ if (e.key==="Enter"||e.key===" "){ e.preventDefault(); upgradeSheet({ tier }); } } });
const pMeaning = p => T({ en:p.tr.en.meaning, lo:p.tr.lo&&p.tr.lo.meaning, zh:p.tr.zh&&p.tr.zh.meaning });
const lessonDone = id => !!(A.prog.lessons[id]||{}).done;
const SKILL_ACTION = { vocabulary:["practice",{type:"words"}], grammar:["practice",{type:"blank"}], reading:["practice",{type:"meaning"}], listening:["practice",{type:"listen"}],
  writing:["practice",{type:"write"}], speaking:["speak",{}], pinyin:["practice",{type:"tones"}], characters:["practice",{type:"write"}], sentence:["practice",{type:"order"}] };

export const STAGE_NAMES = {
  0: { en:"Stage 0 · Orientation & Foundations", lo:"ຂັ້ນຕອນ 0 · ພື້ນຖານ ແລະ ຕົວອັກສອນ", zh:"阶段 0 · 入门与拼读" },
  1: { en:"Stage 1 · Survival Lao", lo:"ຂັ້ນຕອນ 1 · ພາສາລາວເພື່ອການເອົາຕົວລອດ", zh:"阶段 1 · 生存老挝语" },
  2: { en:"Stage 2 · Everyday Lao", lo:"ຂັ້ນຕອນ 2 · ຊີວິດປະຈຳວັນ", zh:"阶段 2 · 日常生活" },
  3: { en:"Stage 3 · Conversational Lao", lo:"ຂັ້ນຕອນ 3 · ການສົນທະນາທຳມະຊາດ", zh:"阶段 3 · 自然对话" },
  4: { en:"Stage 4 · Intermediate Lao", lo:"ຂັ້ນຕອນ 4 · ລະດັບກາງ", zh:"阶段 4 · 中级老挝语" },
  5: { en:"Stage 5 · Upper Intermediate", lo:"ຂັ້ນຕອນ 5 · ລະດັບກາງຂັ້ນສູງ", zh:"阶段 5 · 中高级" },
  6: { en:"Stage 6 · Advanced Lao", lo:"ຂັ້ນຕອນ 6 · ລະດັບສູງ", zh:"阶段 6 · 高级老挝语" },
  7: { en:"Stage 7 · Native Communication", lo:"ຂັ້ນຕອນ 7 · ການສື່ສານແບບຄົນທ້ອງຖິ່ນ", zh:"阶段 7 · 母语式沟通" },
  8: { en:"Stage 8 · Near-Native Professional", lo:"ຂັ້ນຕອນ 8 · ລະດັບມືອາຊີບ", zh:"阶段 8 · 专业流利" }
};
export const stageLabel = n => tr(STAGE_NAMES[n] || { en:"Stage "+n, lo:"ຂັ້ນຕອນ "+n, zh:"阶段 "+n }, lang());

// ---------- dashboard ----------
VIEWS.home = () => {
  touchDay();
  const hr = new Date().getHours(), name = (A.profile.name||"").split(" ")[0];
  const root = h("div",{class:"stack-l"});
  root.append(h("div",{class:"hero-greet"}, h("span",{class:"eyebrow"}, new Date().toLocaleDateString(lang()==="zh"?"zh-CN":lang()==="lo"?"lo-LA":"en-GB",{weekday:"long",day:"numeric",month:"long"})),
    h("h1",null,(hr<11?t("greet_morning"):hr<18?t("greet_day"):t("greet_evening"))+(name?", "+name:""))));
  // stats
  const acc = A.prog.answers && A.prog.answers.t ? Math.round(100*A.prog.answers.r/A.prog.answers.t)+"%" : "–";
  root.append(h("div",{class:"grid4"},
    h("button",{class:"card stat",style:"text-align:left",onclick:()=>go("lessons")}, h("b",null,Object.values(A.prog.lessons).filter(x=>x.done).length), h("span",null,t("lessons_done"))),
    h("button",{class:"card stat",style:"text-align:left",onclick:()=>go("review")}, h("b",null,srsDue().length), h("span",null,t("stat_due"))),
    h("div",{class:"card stat"}, h("b",null,streak()), h("span",null,t("stat_streak"))),
    h("button",{class:"card stat",style:"text-align:left",onclick:()=>go("progress")}, h("b",null,acc), h("span",null,t("stat_acc")))));
  // today's learning (recommendations from real activity)
  const recs = [];
  const nl = nextLesson();
  if (nl) recs.push(h("button",{class:"rec",onclick:()=>go("lesson",{id:nl.id})}, h("span",{class:"qi"},icon("learn")), h("span",null, h("b",null, Object.keys(A.prog.lessons).length ? t("rec_continue") : t("rec_start")), h("div",{class:"small muted"}, T(nl.title)+" · "+stageLabel(nl.level)))));
  const due = srsDue().length; if (due) recs.push(h("button",{class:"rec",onclick:()=>go("review")}, h("span",{class:"qi"},icon("review")), h("b",null,t("rec_review",{n:due}))));
  const tried = SKILLS.filter(k => (A.prog.skills[k]||{}).t >= 5).sort((a,b)=>skillPct(a)-skillPct(b));
  const weak = tried[0] || (A.prog.answers.t ? SKILLS.find(k=>!(A.prog.skills[k]||{}).t) : null);
  if (weak){ const [v,p] = SKILL_ACTION[weak]; recs.push(h("button",{class:"rec",onclick:()=>go(v,p)}, h("span",{class:"qi"},icon("practice")), h("b",null,t("rec_weak",{s:t("sk_"+weak).toLowerCase()})))); }
  const q = Object.values(A.byType.quizzes||{}).find(q => !A.prog.lessons["quiz:"+q.id]);
  if (q) recs.push(h("button",{class:"rec",onclick:()=>go("quiz",{id:q.id})}, h("span",{class:"qi"},icon("star")), h("span",null, h("b",null,t("rec_quiz")), h("div",{class:"small muted"},T(q.title)))));
  root.append(h("section",{class:"sect"}, h("h2",null,t("today")), h("div",{class:"grid2"}, recs)));

  // Lao Language Labs
  const labsBox = h("div",{class:"grid3"},
    h("button",{class:"card",style:"text-align:left;display:flex;align-items:center;gap:12px",onclick:()=>go("tone_lab")},
      h("span",{class:"qi",style:"background:var(--surface-2);color:var(--accent)"}, icon("spark")),
      h("div",null, h("b",null,lang()==="lo"?"ຫ້ອງສຽງວັນນະຍຸດ":"Lao Tone Lab"), h("div",{class:"small muted"},"6 Pitch Contours & Minimal Pairs"))
    ),
    h("button",{class:"card",style:"text-align:left;display:flex;align-items:center;gap:12px",onclick:()=>go("pronounce_lab")},
      h("span",{class:"qi",style:"background:var(--surface-2);color:var(--accent)"}, icon("speaker")),
      h("div",null, h("b",null,lang()==="lo"?"ການອອກສຽງ & ຕົວສະກົດ":"Pronunciation Lab"), h("div",{class:"small muted"},"8 Final Consonants & Vowel Length"))
    ),
    h("button",{class:"card",style:"text-align:left;display:flex;align-items:center;gap:12px",onclick:()=>go("particle_lab")},
      h("span",{class:"qi",style:"background:var(--surface-2);color:var(--accent)"}, icon("flame")),
      h("div",null, h("b",null,lang()==="lo"?"ຄຳລົງທ້າຍ & ຄຳຊ່ວຍ":"Particle Lab"), h("div",{class:"small muted"},"ເດີ້, ເນາະ, ຕິ, ດອກ, ໃດ໋, ແດ່"))
    ),
    h("button",{class:"card",style:"text-align:left;display:flex;align-items:center;gap:12px",onclick:()=>go("kinship_lab")},
      h("span",{class:"qi",style:"background:var(--surface-2);color:var(--accent)"}, icon("users")),
      h("div",null, h("b",null,lang()==="lo"?"ຄຳແທນນາມ & ສາຍພົວພັນ":"Kinship & Pronouns"), h("div",{class:"small muted"},"ອ້າຍ, ເອື້ອຍ, ນ້ອງ, ລຸງ, ປ້າ"))
    ),
    h("button",{class:"card",style:"text-align:left;display:flex;align-items:center;gap:12px",onclick:()=>go("classifiers_lab")},
      h("span",{class:"qi",style:"background:var(--surface-2);color:var(--accent)"}, icon("layers")),
      h("div",null, h("b",null,lang()==="lo"?"ລັກສະນະນາມ":"Classifiers Lab"), h("div",{class:"small muted"},"ຄົນ, ໂຕ, ຫົວ, ຄັນ, ຫຼັງ, ໜ່ວຍ"))
    ),
    h("button",{class:"card",style:"text-align:left;display:flex;align-items:center;gap:12px",onclick:()=>go("culture_lab")},
      h("span",{class:"qi",style:"background:var(--surface-2);color:var(--accent)"}, icon("globe")),
      h("div",null, h("b",null,lang()==="lo"?"ວັດທະນະທຳລາວ":"Lao Culture Lab"), h("div",{class:"small muted"},"Baci, Sabaidee, Dialects & Context"))
    ),
    h("button",{class:"card",style:"text-align:left;display:flex;align-items:center;gap:12px",onclick:()=>go("videos")},
      h("span",{class:"qi",style:"background:var(--surface-2);color:var(--accent)"}, icon("video")),
      h("div",null, h("b",null,lang()==="lo"?"ວິດີໂອບົດຮຽນ":"Video Lessons"), h("div",{class:"small muted"},"Native Speakers & Synced Transcripts"))
    ),
    h("button",{class:"card",style:"text-align:left;display:flex;align-items:center;gap:12px",onclick:()=>go("handwriting")},
      h("span",{class:"qi",style:"background:var(--surface-2);color:var(--accent)"}, icon("pen")),
      h("div",null, h("b",null,lang()==="lo"?"ຝຶກຂຽນຕົວອັກສອນ":"Handwriting Studio"), h("div",{class:"small muted"},"Interactive Canvas & Stroke Guides"))
    )
  );
  root.append(h("section",{class:"sect"}, h("h2",null,lang()==="lo"?"ຫ້ອງທົດລອງພາສາລາວ (Lao Language Labs)":"Lao Language Labs & Culture"), labsBox));
  // skills + weak areas
  const skills = h("div",{class:"stack",style:"gap:12px"}, xpCard(true), h("div",{class:"card stack",style:"gap:10px"}, SKILLS.map(masteryRow)));
  // recent lessons
  const recent = Object.entries(A.prog.lessons).filter(([id])=>A.byType.lessons[id]).sort((a,b)=>b[1].at-a[1].at).slice(0,4);
  const recentBox = h("div",{class:"list-card"}, recent.length ? recent.map(([id,x]) => { const l = A.byType.lessons[id];
    return h("button",{class:"item-row",onclick:()=>go("lesson",{id})}, h("span",{class:"stepnum done"},icon("check")), h("span",null, h("div",{class:"ttl"},T(l.title)), h("div",{class:"sub"}, fmtDate(x.at, lang())+(x.total?" · "+x.score+"/"+x.total:""))), icon("right")); }) : h("p",{class:"muted",style:"padding:14px"},t("no_rows")));
  root.append(h("div",{class:"grid2"}, h("section",{class:"sect"}, h("div",{class:"spread"}, h("h2",null,t("skills")), h("button",{class:"btn sm ghost",onclick:()=>go("progress")}, t("view_all"))), skills),
    h("section",{class:"sect"}, h("h2",null,t("recent")), recentBox, achievementsEl(true))));
  // new content
  const rel = (A.B.releases||[]).slice().sort((a,b)=>String(b.date).localeCompare(String(a.date)))[0];
  if (rel) root.append(h("section",{class:"card spread"}, h("div",null, h("span",{class:"eyebrow"},t("new_content")+" · "+rel.date), h("h3",null,T(rel.title)), h("p",{class:"muted small"+(expLang()==="lo"?" lo":"")}, T(rel.notes))), h("button",{class:"btn",onclick:()=>go("news")}, t("view_all"), icon("right"))));
  // plan
  const acc2 = A.access;
  root.append(h("section",{class:"card spread"}, h("div",null, h("span",{class:"eyebrow"},t("your_plan")), h("h3",null, tierName(A.tier>=99?3:A.tier)), acc2 && acc2.expiresAt ? h("p",{class:"small muted"}, t("expires")+": "+fmtDate(acc2.expiresAt, lang())) : null), h("button",{class:"btn sm ghost",onclick:()=>go("account")}, t("nav_account"))));
  return root;
};
export function achievementsEl(compact){
  const list = achievements(), got = list.filter(a => a.earned).length;
  const shown = compact ? list.filter(a => a.earned).slice(-4).concat(list.filter(a => !a.earned).slice(0, 2)) : list;
  return h("div",{class:"sect",style:compact?"margin-top:14px":""}, h("h3",null,t("achievements"), h("span",{class:"chip",style:"margin-left:8px"}, got+" / "+list.length)),
    h("div",{class:"badges"}, shown.map(a => h("span",{class:"badge"+(a.earned?"":" off"),title:t("achd_"+a.id)}, icon(a.earned ? "trophy" : "lock"), t("ach_"+a.id)))));
}
// XP, level and today's goal
export function xpCard(compact){
  const lv = level(), today = todayXP(), goal = A.rules.dailyGoal, s = streak();
  return h("section",{class:"card xpcard"+(compact?" compact":"")},
    h("div",{class:"xp-level"}, h("span",{class:"xp-badge"}, h("small",null,t("lvl")), h("b",null, lv.level)),
      h("div",{class:"xp-main"},
        h("div",{class:"spread"}, h("b",null, (A.prog.xp||0).toLocaleString()+" XP"), h("span",{class:"small muted"}, t("to_next",{ n: lv.toNext, l: lv.level+1 }))),
        h("div",{class:"bar",role:"progressbar","aria-valuenow":String(lv.pct),"aria-valuemin":"0","aria-valuemax":"100"}, h("i",{style:`width:${lv.pct}%`})))),
    h("div",{class:"xp-row"},
      h("div",{class:"xp-goal"}, h("div",{class:"spread small"}, h("span",null, icon("star"), " "+t("daily_goal")), h("b",{class:"tabnum"}, Math.min(today, goal)+" / "+goal+" XP")),
        h("div",{class:"bar goal"}, h("i",{style:`width:${Math.min(100, Math.round(100*today/goal))}%`}))),
      h("div",{class:"xp-streak"}, icon("flame"), h("b",null, s), h("span",{class:"small muted"}, t("streak_days")))));
}
// one skill: mastery label from the cautious lower bound, plus the plain accuracy and number of answers
export function masteryRow(k){
  const m = mastery(k);
  const label = m.label === "none" ? t("m_none") : m.label === "new" ? t("m_new", { n: m.needed }) : t("m_"+m.label);
  return h("div",{class:"skill mastery m-"+m.label,title: m.answers ? t("m_detail", { r: m.raw, n: m.answers }) : ""},
    h("span",null,t("sk_"+k)), h("div",{class:"bar"},h("i",{style:`width:${m.pct}%`})),
    h("span",{class:"m-label small"}, label));
}

// ---------- paths ----------
// Paths list their steps as [{type,id}]; older paths used a plain list of lesson ids (itemIds)
const pathSteps = p => Array.isArray(p.steps) && p.steps.length ? p.steps : (p.itemIds || []).map(id => ({ type:"lesson", id }));

VIEWS.paths = () => {
  const paths = Object.values(A.byType.paths||{}).sort((a,b)=>(a.order||0)-(b.order||0));
  const locked = A.catalog.filter(c => c.type==="paths" && c.tier > A.tier);
  const card = p => { const steps = pathSteps(p); const done = steps.filter(s => s.type==="lesson" && lessonDone(s.id)).length; const lessons = steps.filter(s=>s.type==="lesson").length;
    return h("button",{class:"pcard",onclick:()=>go("path",{id:p.id})}, h("span",{class:"qi",lang:"zh-CN"}, p.kind==="level" ? String(p.level) : icon(p.kind==="skill"?"layers":"path")),
      h("div",{style:"flex:1"}, h("b",null,T(p.title)), h("span",{class:expLang()==="lo"?"lo":""},T(p.desc)), lessons ? h("div",{class:"bar",style:"margin-top:8px"},h("i",{style:`width:${100*done/lessons}%`})) : null)); };
  return h("div",null, pageHead(t("nav_paths"), t("learn_sub")),
    h("div",{class:"grid2"}, paths.map(card), locked.map(c => h("div",Object.assign(lockedRow(c.tier),{class:"pcard locked-row"}), h("span",{class:"qi"},icon("lock")), h("div",null, h("b",null,T(c.title)), lockBadge(c.tier))))));
};
VIEWS.path = ({ id }) => {
  const p = A.byType.paths[id]; if (!p) return h("div",{class:"empty"},t("no_rows"));
  const list = h("div",{class:"list-card"});
  pathSteps(p).forEach((s,i) => {
    const map = { lesson:["lessons","lesson"], grammar:["grammar","grammarItem"], quiz:["quizzes","quiz"], dialogue:["dialogues","dialogue"] };
    let title="", sub="", open=null, done=false, lock=null;
    if (s.type==="page"){ title = t({pinyin:"nav_pinyin",chars:"nav_chars",speak:"nav_speak",gen:"nav_gen",dict:"nav_dict"}[s.id]||"nav_home"); open = () => go(s.id); }
    else if (s.type==="pattern"){ const pt = A.P[s.id]; if (pt){ title = pt.hz; sub = pMeaning(pt); open = () => go("pattern",{n:pt.n}); done = !!A.prog.patterns[pt.n]; } else lock = lockedItem("patterns","p"+String(s.id).padStart(3,"0")); }
    else { const [col, view] = map[s.type]||[]; const d = col && A.byType[col][s.id];
      if (d){ title = T(d.title); sub = d.level ? "Stage "+d.level : ""; open = () => go(view,{id:s.id}); done = s.type==="lesson" ? lessonDone(s.id) : !!A.prog.lessons[s.type+":"+s.id]; }
      else { lock = lockedItem(col, s.id); if (lock) title = T(lock.title); } }
    if (!title && !lock) return;
    list.append(h("button",{class:"item-row"+(lock?" locked-row":""),onclick:()=>lock ? upgradeSheet({ tier:lock.tier }) : open&&open()}, h("span",{class:"stepnum"+(done?" done":"")}, done ? icon("check") : String(i+1)), h("span",null, h("div",{class:"ttl "+(isHan(title[0])?"hz":"")}, title), h("div",{class:"sub"}, sub, lock ? lockBadge(lock.tier) : "")), lock ? icon("lock") : icon("right")));
  });
  return h("div",null, h("div",{class:"crumb"}, h("button",{onclick:()=>go("paths")},t("nav_paths")), "›", h("span",null,T(p.title))), pageHead(T(p.title), T(p.desc)), list);
};

// ---------- lessons ----------
VIEWS.lessons = ({ lv }) => {
  let level = lv || 0;
  const box = h("div");
  const draw = () => { box.innerHTML="";
    const ls = orderedLessons().filter(l => !level || l.level===level);
    const lk = A.catalog.filter(c => c.type==="lessons" && c.tier > A.tier && (!level || c.level===level));
    const groups = {}; ls.forEach(l => (groups[l.level] = groups[l.level]||[]).push(l)); lk.forEach(c => (groups[c.level] = groups[c.level]||[]).push(Object.assign({ locked:true }, c)));
    Object.keys(groups).sort((a,b)=>a-b).forEach(L => { const items = groups[L].sort((a,b)=>(a.order||0)-(b.order||0));
      box.append(h("div",{class:"group-h"}, h("h2",null,stageLabel(L)), h("span",{class:"muted small"}, items.filter(x=>!x.locked && lessonDone(x.id)).length+" / "+items.length)),
        h("div",{class:"list-card"}, items.map(l => l.locked
          ? h("div",Object.assign(lockedRow(l.tier),{class:"item-row locked-row"}), h("span",{class:"stepnum"},icon("lock")), h("span",null, h("div",{class:"ttl"},T(l.title)), h("div",{class:"sub"}, lockBadge(l.tier))), h("span"))
          : h("button",{class:"item-row",onclick:()=>go("lesson",{id:l.id})}, h("span",{class:"stepnum"+(lessonDone(l.id)?" done":"")}, lessonDone(l.id)?icon("check"):String(l.order||"")), h("span",null, h("div",{class:"ttl"},T(l.title)), h("div",{class:"sub"+(expLang()==="lo"?" lo":"")}, T(l.desc).slice(0,110))), icon("right"))))); });
    if (!box.childElementCount) box.append(h("div",{class:"empty"},t("no_rows")));
  };
  const seg = h("div",{class:"seg"}, [0,1,2,3,4,5,6].map(n => h("button",{"aria-pressed":String(level===n),onclick:e=>{ level=n; $$("button",seg).forEach(b=>b.setAttribute("aria-pressed","false")); e.currentTarget.setAttribute("aria-pressed","true"); draw(); }}, n?("Stage "+n):t("all_levels"))));
  draw();
  return h("div",null, pageHead(t("nav_lessons"), t("learn_sub")), h("div",{style:"margin-bottom:14px;overflow-x:auto"}, seg), box);
};
VIEWS.lesson = ({ id }) => {
  const l = A.byType.lessons[id];
  if (!l){ const lk = lockedItem("lessons", id); return lk ? lockedPanel({ tier:lk.tier }) : h("div",{class:"empty"}, t("no_rows")); }
  // Lessons per period: opening the same lesson again in the same period is not counted twice (ref)
  return withUse("lessons.open", { ref:id }, () => lessonView(id, l));
};
function lessonView(id, l){
  setLast("lesson", id); logEvent("lesson_open", { ref:id }); touchDay();
  const EL = expLang(), root = h("div",{class:"stack-l"});
  const done = lessonDone(id);
  root.append(h("div",null, h("div",{class:"crumb"}, h("button",{onclick:()=>go("lessons")},t("nav_lessons")), "›", h("span",null,stageLabel(l.level)), l.topic ? ["›", h("span",null,l.topic)] : null),
    h("div",{class:"spread"}, h("div",null, h("h1",null,T(l.title)), h("p",{class:"muted"+(EL==="lo"?" lo":""),style:"margin-top:6px;max-width:62ch"}, T(l.desc))),
      h("div",{class:"row"}, toggleBtn("l:"+id, { type:"lesson", id, title:l.title }, "btn sm"), h("span",{class:"chip lv"},stageLabel(l.level))))));
  const objs = (l.objectives && (l.objectives[EL]||l.objectives.en)) || [];
  if (objs.length) root.append(h("section",{class:"card"}, h("h3",{style:"margin-bottom:8px"},t("objectives")), h("ul",{class:"obj"+(EL==="lo"?" lo":"")}, objs.map(o=>h("li",null,o)))));
  // dialogue
  (l.dialogues||[]).forEach(did => { const d = A.byType.dialogues[did]; if (!d) return;
    const box = h("div",{class:"card",style:"padding-block:4px"}); d.lines.forEach(x => box.append(sentenceEl(ensureTokens(x, A.engine), { speaker:x.speaker })));
    root.append(h("section",{class:"sect"}, h("div",{class:"spread"}, h("h2",null,t("dialogue")+" · "+T(d.title)), h("button",{class:"btn sm",onclick:()=>{ speak(d.lines.map(x=>x.zh).join("")); recordAnswer("listening", true); }}, icon("play"), t("play_dialogue"))), box)); });
  // vocabulary
  if ((l.vocab||[]).length){ const D = dict();
    root.append(h("section",{class:"sect"}, h("div",{class:"spread"}, h("h2",null,t("vocabulary")+" ("+l.vocab.length+")"), h("button",{class:"btn sm",onclick:()=>go("vocab",{words:l.vocab, title:T(l.title)})}, icon("review"), t("flashcards"))),
      h("div",{class:"vgrid"}, l.vocab.map(w => h("button",{class:"vcard",onclick:()=>openWord(w)}, h("span",{class:"hz",lang:"zh-CN"},w), h("span",{html:pyHTML(D[w]?D[w].p:"")}), h("span",{class:"m"+(EL==="lo"&&D[w]&&D[w].lo?" lo":"")}, (meaning(w, EL)||"").split(";")[0])))))); }
  // grammar
  const gs = (l.grammar||[]).map(g=>A.byType.grammar[g]).filter(Boolean);
  if (gs.length) root.append(h("section",{class:"sect"}, h("h2",null,t("grammar")), h("div",{class:"list-card"}, gs.map(g => h("button",{class:"item-row",onclick:()=>go("grammarItem",{id:g.id})}, h("span",{class:"stepnum"},icon("layers")), h("span",null, h("div",{class:"ttl"},T(g.title)), h("div",{class:"sub hz"}, g.structure)), icon("right"))))));
  // patterns with examples + a fresh generated sentence
  const ps = (l.patterns||[]).map(n=>A.P[n]).filter(Boolean);
  if (ps.length){ const sect = h("section",{class:"sect"}, h("h2",null,t("nav_patterns")));
    ps.forEach(p => { const box = h("div",{class:"card",style:"padding-block:4px"});
      p.examples.forEach(e => box.append(sentenceEl(exampleOf(p,e), { markers:p.markers, fix:e.fixed })));
      genMany(p,1).forEach(s => box.append(sentenceEl(s, { markers:p.markers })));
      sect.append(h("div",{class:"stack",style:"gap:8px"}, h("div",{class:"spread"}, h("button",{class:"linkbtn",onclick:()=>go("pattern",{n:p.n})}, h("span",{class:"hz",style:"font-size:1.3rem"},p.hz), "  ", h("span",{class:"muted"+(EL==="lo"?" lo":"")}, pMeaning(p))), h("button",{class:"btn sm ghost",onclick:()=>go("pattern",{n:p.n})}, t("open_pattern"), icon("right"))), box)); });
    root.append(sect); }
  (l.examples||[]).length && root.append(h("section",{class:"sect"}, h("h2",null,t("examples_label")), h("div",{class:"card",style:"padding-block:4px"}, l.examples.map(e=>sentenceEl(ensureTokens(e, A.engine))))));
  // quiz: authored quiz, else auto-generated drill
  const quizzes = (l.quizzes||[]).map(q=>A.byType.quizzes[q]).filter(Boolean);
  const qbox = h("div",{class:"quiz"});
  const startQuiz = (qs, ref) => { qbox.innerHTML=""; let score=0;
    runQuiz(qbox, qs, { key: ref ? "quiz:"+ref : "lesson:"+id, title: ref ? T(A.byType.quizzes[ref].title) : t("auto_quiz"), onAnswer:(q,ok,m)=>{ recordAnswer(q.skill, ok, m); if (ok) score++; },
      onFinish:r => { if (ref){ A.prog.lessons["quiz:"+ref] = { done:true, at:Date.now(), score:r.right, total:r.total }; quizDone(ref, r.right, r.total); } if (!lessonDone(id) && r.passed){ completeLesson(id, r.right, r.total, r.stars); toast(t("completed")); } },
      onAgain:()=>startQuiz(ref ? A.byType.quizzes[ref].questions : patternQuestions(ps, 8), ref) }); qbox.scrollIntoView({behavior:"smooth", block:"start"}); };
  root.append(h("section",{class:"sect"}, h("h2",null,t("quiz")),
    h("div",{class:"row"}, quizzes.map(q => h("button",{class:"btn primary",onclick:()=>startQuiz(q.questions, q.id)}, icon("star"), T(q.title))),
      ps.length ? h("button",{class:quizzes.length?"btn":"btn primary",onclick:()=>startQuiz(patternQuestions(ps, 8))}, icon("spark"), t("auto_quiz")) : null), qbox));
  root.append(h("div",{class:"row"}, h("button",{class:"btn"+(done?" jade":""),onclick:e=>{ if (!lessonDone(id)){ completeLesson(id); e.currentTarget.className="btn jade"; e.currentTarget.textContent=t("completed"); } }}, done ? t("completed") : t("complete_lesson")),
    (() => { const ls = orderedLessons(); const i = ls.findIndex(x=>x.id===id); const nx = ls[i+1]; return nx ? h("button",{class:"btn ghost",onclick:()=>go("lesson",{id:nx.id})}, t("next")+": "+T(nx.title).slice(0,40), icon("right")) : null; })()));
  return root;
}

// ---------- patterns ----------
VIEWS.patterns = ({ q="", mode="lv" }) => {
  const list = h("div",{class:"plist"});
  const draw = () => { list.innerHTML="";
    const f = q.trim().toLowerCase(), qp = stripTone(q);
    const match = p => !f || String(p.n)===f || p.hz.includes(q.trim()) || pMeaning(p).toLowerCase().includes(f) || (qp.length>1 && stripTone(p.py).includes(qp));
    const all = Object.values(A.P);
    const groups = mode==="lv" ? [1,2,3,4,5,6].map(L=>["Stage "+L, all.filter(p=>p.level===L)]) : "ABCDEFGHIJKLMNOPQRS".split("").map(s=>[s+" · "+secName(s), all.filter(p=>p.sec===s)]);
    groups.forEach(([title, items]) => { items = items.filter(match).sort((a,b)=>a.n-b.n);
      const lk = mode==="lv" ? A.catalog.filter(c => c.type==="patterns" && c.tier>A.tier && ("Stage "+c.level)===title) : [];
      if (!items.length && !lk.length) return;
      list.append(h("div",{class:"group-h"}, h("h2",null,title), h("span",{class:"muted small"}, items.filter(p=>A.prog.patterns[p.n]).length+" / "+(items.length+lk.length)+" "+t("learned_all"))));
      items.forEach(p => list.append(h("button",{class:"prow",onclick:()=>go("pattern",{n:p.n})}, h("span",{class:"pn"},"#"+String(p.n).padStart(3,"0")), h("span",{class:"ph lo",lang:"lo"},p.hz), h("span",{class:"pm"+(expLang()==="lo"?" lo":"")},pMeaning(p)), h("span",{class:"status"+(A.prog.patterns[p.n]?" done":"")}))));
      if (lk.length && !f) list.append(h("div",Object.assign(lockedRow(lk[0].tier),{class:"prow locked-row"}), h("span",{class:"pn"},icon("lock")), h("span",{class:"ph"}, lk.length+" "+t("patterns")), h("span",{class:"pm"}, t("locked_d",{s:tierName(lk[0].tier)})), h("span")));
    });
    if (!list.childElementCount) list.append(h("div",{class:"empty"},t("search_none")));
  };
  const seg = h("div",{class:"seg"}, [["lv","by_levels"],["sec","by_sections"]].map(([k,l]) => h("button",{"aria-pressed":String(mode===k),onclick:e=>{ mode=k; $$("button",seg).forEach(b=>b.setAttribute("aria-pressed","false")); e.currentTarget.setAttribute("aria-pressed","true"); draw(); }}, t(l))));
  draw();
  return h("div",null, pageHead(t("nav_patterns"), null, h("button",{class:"btn primary",onclick:()=>go("gen")}, icon("spark"), t("gen_title"))),
    h("div",{class:"spread",style:"margin-bottom:14px"}, seg, h("input",{class:"input",style:"max-width:280px",placeholder:t("filter_ph"),value:q,oninput:debounce(e=>{ q=e.target.value; draw(); },120)})), list);
};
function formulaEl(f){
  const box = h("div",{class:"formula"});
  const loc = s => lang()==="en" ? s.replace(/\bS\b/g,"Subject").replace(/\bV\b/g,"Verb").replace(/\bO\b/g,"Object").replace(/\bN\b/g,"Noun").replace(/\bM\b/g,"Measure") : s.replace(/\b(S|V|O|Adj|N|Time|Place|Num|M|VP|Clause)\b/g, m=>t(m));
  f.split(/\s+\/\s+(?=[A-Z(]|[\u0E80-\u0EFF])/).forEach((alt,ai) => { if (ai) box.append(h("span",{class:"fplus",style:"flex-basis:100%;height:0"}));
    alt.split(/\s\+\s/).forEach((part,i) => { if (i) box.append(h("span",{class:"fplus"},"+")); const hz = /[\u0E80-\u0EFF]/.test(part); box.append(h("span",{class:"fchip"+(hz?" hz lo":""),lang:hz?"lo":null}, hz?part:loc(part))); }); });
  return box;
}
VIEWS.pattern = ({ n }) => {
  const p = A.P[n];
  if (!p){ const lk = lockedItem("patterns","p"+String(n).padStart(3,"0")); return lk ? lockedPanel({ tier:lk.tier }) : h("div",{class:"empty"}, t("no_rows")); }
  setLast("pattern", n); touchDay();
  const EL = expLang(), root = h("div",{class:"stack-l"}), trx = p.tr[EL] && p.tr[EL].how ? p.tr[EL] : p.tr.en;
  const learned = !!A.prog.patterns[n];
  const lbtn = h("button",{class:"btn"+(learned?" jade":""),onclick:e=>{ const on = !A.prog.patterns[n]; learnPattern(n, on); e.currentTarget.className="btn"+(on?" jade":""); e.currentTarget.textContent = on?t("learned"):t("mark_learned"); }}, learned?t("learned"):t("mark_learned"));
  root.append(h("div",null, h("div",{class:"crumb"}, h("button",{onclick:()=>go("patterns")},t("nav_patterns")), "›", h("span",null,"Stage "+p.level), "›", h("span",null,p.sec+" · "+secName(p.sec))),
    h("div",{class:"phead"}, h("div",null, h("span",{class:"bigno"},"#"+String(p.n).padStart(3,"0")),
        h("div",{class:"row",style:"gap:14px"}, h("span",{class:"pat-big lo",lang:"lo"},p.hz), h("button",{class:"ib","aria-label":t("play"),onclick:()=>speak(p.hz.replace(/[.…+A-Za-z/ ]+/g,"，"))}, icon("speaker"))),
        h("div",{class:"py",style:"font-size:1.1rem",html:pyHTML(p.py)}), h("div",{class:"pmean"}, p.tr.en.meaning), p.tr.lo && p.tr.lo.meaning ? h("div",{class:"plo",lang:"lo"}, p.tr.lo.meaning) : null),
      h("div",{class:"row"}, h("span",{class:"chip lv"},"Stage "+p.level), toggleBtn("p:"+n, { type:"pattern", n }, "btn sm"), lbtn))));
  if (p.formula) root.append(h("section",{class:"sect"}, h("h2",null,t("structure")), formulaEl(p.formula)));
  if (trx.how) root.append(h("section",{class:"sect"}, h("h2",null,t("how_why")), h("p",{class:"why"+(trx===p.tr.lo?" lo":"")}, trx.how)));
  if (trx.note || p.tr.en.note) root.append(h("section",{class:"sect"}, h("h2",null,t("note")), h("p",{class:"why"}, trx.note || p.tr.en.note)));
  if (p.mistake) root.append(h("section",{class:"sect"}, h("h2",null,t("mistake")), h("div",{class:"mistake"}, h("span",{class:"mk-x"},"✗"), h("span",{class:"hz bad lo",lang:"lo"},p.mistake.wrong), h("span",{class:"mk-v"},"✓"),
    h("span",null, h("span",{class:"hz lo",lang:"lo"},p.mistake.right), " ", h("button",{class:"ib","aria-label":t("play"),onclick:()=>speak(p.mistake.right.split("/")[0])},icon("play"))), h("p",{class:"reason"}, T(p.mistake.tr)))));
  const ex = h("div",{class:"card",style:"padding-block:4px"}); p.examples.forEach(e => ex.append(sentenceEl(exampleOf(p,e), { markers:p.markers, fix:e.fixed })));
  root.append(h("section",{class:"sect"}, h("div",{class:"spread"}, h("h2",null,t("examples")), h("button",{class:"btn sm ghost",onclick:()=>speak(p.examples.map(e=>e.zh).join(""))}, icon("play"), t("play_all"))), ex));
  if (p.gen && p.gen.length){
    const gb = h("div",{class:"card",style:"padding-block:4px"}); let count = 5;
    const gen = append => { if (!append) gb.innerHTML=""; genMany(p,count).forEach(s => gb.append(sentenceEl(s, { markers:p.markers }))); logEvent("generate", { ref:"#"+n }); };
    root.append(h("section",{class:"sect"}, h("div",{class:"spread"}, h("h2",null,t("gen_title")), h("div",{class:"row"},
      h("div",{class:"seg"}, [3,5,10].map(c => h("button",{"aria-pressed":String(c===count),onclick:e=>{ count=c; $$("button",e.currentTarget.parentNode).forEach(b=>b.setAttribute("aria-pressed","false")); e.currentTarget.setAttribute("aria-pressed","true"); }}, c))),
      h("button",{class:"btn primary sm",onclick:()=>gen(false)}, icon("spark"), t("generate")), h("button",{class:"btn sm",onclick:()=>gen(true)}, t("gen_more")))), gb));
    gen(false);
  }
  const qbox = h("div",{class:"quiz"});
  root.append(h("section",{class:"sect"}, h("div",{class:"card spread"}, h("div",null, h("h3",null,t("practice_this")), h("p",{class:"muted small"}, t("pr_order")+" · "+t("pr_blank")+" · "+t("pr_meaning")+" · "+t("pr_listen"))),
    h("button",{class:"btn primary",onclick:()=>{ runQuiz(qbox, patternQuestions([p], 8), { key:"pattern:"+n, onAnswer:(q,ok,m)=>recordAnswer(q.skill,ok,m), onFinish:r=>{ if (r.passed && r.pct >= 75 && !A.prog.patterns[n]) { learnPattern(n,true); toast(t("learned")); } }, onAgain:()=>go("pattern",{n},false) }); qbox.scrollIntoView({behavior:"smooth"}); }}, t("start"), icon("right"))), qbox));
  const all = Object.values(A.P).sort((a,b)=>(a.level-b.level)||(a.n-b.n)), i = all.indexOf(p), pv = all[i-1], nx = all[i+1];
  root.append(h("div",{class:"pnav"}, pv ? h("button",{class:"btn",onclick:()=>go("pattern",{n:pv.n})}, icon("left"), h("span",{class:"hz"},pv.hz)) : h("span"), nx ? h("button",{class:"btn",onclick:()=>go("pattern",{n:nx.n})}, h("span",{class:"hz"},nx.hz), icon("right")) : h("span")));
  return root;
};

// ---------- grammar: js/learner/views-grammar.js (Grammar Studio) ----------

// ---------- vocabulary ----------
VIEWS.vocab = ({ words, title, lv }) => {
  const D = dict(), EL = expLang();
  let level = lv || A.profile.level || 1;
  const box = h("div");
  const listFor = () => words || Object.keys(D).filter(k => D[k].h===level && k.length<=4).sort((a,b)=>D[a].fq-D[b].fq);
  const draw = () => { box.innerHTML = ""; const ws = listFor();
    box.append(h("div",{class:"row",style:"margin-bottom:12px"}, h("span",{class:"muted"}, ws.length+" "+t("word_count")+" · "+wordsMastered()+" "+t("learned_words")),
      h("button",{class:"btn sm primary",onclick:()=>go("cards", words ? { words, title } : { stage:level })}, icon("cards"), t("fc_title"))),
      h("div",{class:"vgrid"}, ws.slice(0,300).map(w => h("button",{class:"vcard",onclick:()=>openWord(w)}, h("span",{class:"hz lo",lang:"lo"},w), h("span",{html:pyHTML(D[w]?D[w].p:"")}), h("span",{class:"m"+(EL==="lo"&&D[w]&&D[w].lo?" lo":"")}, (meaning(w,EL)||"").split(";")[0].slice(0,40)))))); };
  const seg = words ? null : h("div",{class:"seg",style:"margin-bottom:14px"}, [1,2,3,4,5,6].map(n => h("button",{"aria-pressed":String(level===n),onclick:e=>{ level=n; $$("button",seg).forEach(b=>b.setAttribute("aria-pressed","false")); e.currentTarget.setAttribute("aria-pressed","true"); draw(); }}, "Stage "+n)));
  draw();
  return h("div",null, pageHead(title ? t("vocabulary")+" · "+title : t("nav_vocab"), words ? null : t("dict_sub")), seg, box);
};

// ---------- dialogues (standalone) ----------
VIEWS.dialogue = ({ id }) => { const d = A.byType.dialogues[id]; if (!d) return h("div",{class:"empty"},t("no_rows"));
  const box = h("div",{class:"card",style:"padding-block:4px"}); d.lines.forEach(x => box.append(sentenceEl(ensureTokens(x, A.engine), { speaker:x.speaker })));
  return h("div",null, pageHead(T(d.title), null, h("button",{class:"btn",onclick:()=>speak(d.lines.map(x=>x.zh).join(""))}, icon("play"), t("play_dialogue"))), box); };

// ---------- what's new ----------
VIEWS.news = () => {
  const rels = (A.B.releases||[]).slice().sort((a,b)=>String(b.date).localeCompare(String(a.date)));
  const itemBtn = it => { const map = { lesson:["lessons","lesson"], grammar:["grammar","grammarItem"], quiz:["quizzes","quiz"], dialogue:["dialogues","dialogue"] };
    if (it.type==="pattern"){ const p = A.P[it.id]; return p ? h("button",{onclick:()=>go("pattern",{n:p.n})}, h("span",{class:"hz"},p.hz)) : null; }
    const [col, v] = map[it.type]||[]; const d = col && A.byType[col][it.id]; const lk = !d && col && lockedItem(col, it.id);
    return d ? h("button",{onclick:()=>go(v,{id:it.id})}, T(d.title)) : lk ? h("button",{disabled:true}, icon("lock"), " ", T(lk.title)) : null; };
  return h("div",null, pageHead(t("nav_new")), h("div",{class:"stack"}, rels.map(r => h("section",{class:"card stack"}, h("span",{class:"eyebrow"}, r.date), h("h2",null,T(r.title)), h("p",{class:expLang()==="lo"?"lo":""}, T(r.notes)), h("div",{class:"wordchips"}, (r.items||[]).map(itemBtn))))),
    rels.length ? null : h("div",{class:"empty"},t("no_rows")));
};
