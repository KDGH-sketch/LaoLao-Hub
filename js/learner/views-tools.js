// Learner views: generator, practice & quizzes, dictionary, pinyin, characters, pronunciation, review,
// saved items, notes, progress, offline downloads, account.
import { h, $$, icon, toast, pyHTML, tr, stripTone, fmtDate, isHan, debounce, rnd, shuffle, errText, dialog, normTheme, FONT_OPTIONS } from "../shared/ui.js";
import { t, lang } from "../shared/i18n.js";
import { dict, chars, strokes, searchDict, meaning } from "../shared/dict.js";
import { speak, voices, canListen } from "../shared/speech.js";
import { sentenceEl, openWord, entryEl, ensureTokens } from "../shared/widgets.js";
import { runQuiz, toneSVG } from "../shared/quiz.js";
import { SKILLS, accessState, cacheGet } from "../shared/content.js";
import { A, T, expLang, prefs, setPref, srsDue, srsGrade, streak, skillPct, genSentence, genMany, exampleOf, recordAnswer, quizDone, logEvent, touchDay,
  tierName, isSaved, toggleSave, wordsMastered, srsAdd, recordHandwritingAttempt } from "./core.js";
import { achievementsEl, xpCard, masteryRow } from "./views-learn.js";
import { openUpgradeFlow, fetchMyPendingOrder } from "./payments.js";
import { scoreAttempt, feedbackFor } from "../shared/handwriting-engine.js";

export const VIEWS = {};
const go = (...a) => A.go(...a);
const pageHead = (title, sub, extra) => h("div",{class:"pagehead"}, h("div",{class:"spread"}, h("h1",null,title), extra||null), sub ? h("p",null,sub) : null);
const pMeaning = p => T({ en:p.tr.en.meaning, lo:p.tr.lo&&p.tr.lo.meaning });

// ---------- question generators (pattern drills) ----------
function sentFrom(pool){ const p = rnd(pool); const s = Math.random()<0.7 ? genSentence(p) : null; return s || exampleOf(p, rnd(p.examples)); }
const trOf = s => s.tr && typeof s.tr==="object" ? s.tr : { en: s.en };
function distinct(pool, s, n, key){ const out = new Map(); for (let i=0;i<40 && out.size<n;i++){ const x = sentFrom(pool); const k = key(x); if (k && k!==key(s)) out.set(k, x); } return [...out.values()]; }
const linkTo = s => s.pn ? h("button",{class:"btn sm ghost",onclick:()=>go("pattern",{n:s.pn})}, "#"+s.pn+" "+t("open_pattern")) : null;
const reveal = s => () => h("div",null, h("div",{class:"hz",style:"font-size:1.3rem"},s.zh), h("div",{html:pyHTML(s.py)}), h("div",{class:"muted"}, tr(trOf(s), expLang())));
const MAKERS = {
  order: pool => { const s = sentFrom(pool); const toks = (s.tokens||[]).filter(x=>isHan(x.z[0])); if (toks.length<3 || toks.length>11) return null;
    return { type:"order", skill:"sentence", tokens:toks, answer:toks.map(x=>x.z).join(""), prompt:{ tr:trOf(s), py:s.py }, ask:{en:t("pr_order_d")}, say:s.zh, link:linkTo(s) }; },
  blank: pool => { const p = rnd(pool.filter(x=>x.markers.length)); if (!p) return null; const s = Math.random()<.6 ? genSentence(p) : exampleOf(p, rnd(p.examples)); if (!s) return null;
    const mk = p.markers.find(m => (s.tokens||[]).some(tk=>tk.z===m)); if (!mk) return null;
    const others = shuffle([...new Set(Object.values(A.P).filter(x=>x.n!==p.n).flatMap(x=>x.markers).filter(m=>m!==mk && Math.abs(m.length-mk.length)<=1 && !p.markers.includes(m)))]).slice(0,3);
    let done=false; const zh = s.tokens.map(tk => { if (!done && tk.z===mk){ done=true; return "___"; } return tk.z; }).join("");
    return { type:"fill", skill:"grammar", prompt:{ zh, tr:trOf(s) }, options:[mk,...others], answer:0, ask:{en:t("pr_blank_d")+" · "+p.hz}, reveal:reveal(s), say:s.zh, link:linkTo(s) }; },
  meaning: pool => { const s = sentFrom(pool); const d = distinct(pool, s, 3, x=>tr(trOf(x),expLang())); if (d.length<3) return null;
    return { type:"mc", skill:"reading", prompt:{ zh:s.zh, py:s.py }, options:[trOf(s), ...d.map(trOf)], answer:0, ask:{en:t("pr_meaning_d")}, say:s.zh, link:linkTo(s) }; },
  reverse: pool => { const s = sentFrom(pool); const d = distinct(pool, s, 3, x=>x.zh); if (d.length<3) return null;
    return { type:"mc", skill:"writing", prompt:{ tr:trOf(s) }, options:[{zh:s.zh}, ...d.map(x=>({zh:x.zh}))], answer:0, ask:{en:t("pr_reverse_d")}, reveal:reveal(s), say:s.zh, link:linkTo(s) }; },
  listen: pool => { const s = sentFrom(pool); const d = distinct(pool, s, 3, x=>x.zh); if (d.length<3) return null;
    return { type:"listen_select", skill:"listening", prompt:{ zh:s.zh }, options:[s.zh, ...d.map(x=>x.zh)], answer:0, reveal:reveal(s), link:linkTo(s) }; },
  pattern: pool => { const p = rnd(pool); const s = genSentence(p) || exampleOf(p, rnd(p.examples)); const others = shuffle(Object.values(A.P).filter(x=>x.n!==p.n && x.sec===p.sec)).slice(0,3); if (others.length<3) return null;
    return { type:"mc", skill:"grammar", prompt:{ zh:s.zh, py:s.py }, options:[p,...others].map(x=>({ en:x.hz+" — "+x.tr.en.meaning, lo:x.hz+" — "+((x.tr.lo&&x.tr.lo.meaning)||x.tr.en.meaning) })), answer:0, ask:{en:t("pr_pattern_d")}, link:linkTo(s) }; },
  speak: pool => { const s = sentFrom(pool); if (s.zh.length>16) return null; return { type:"speak", skill:"speaking", prompt:{ zh:s.zh, py:s.py, tr:trOf(s) }, link:linkTo(s) }; }
};
export function patternQuestions(pats, n, types=["order","blank","meaning","listen","reverse"]){
  const qs = []; for (let i=0;i<n;i++){ let q=null; for (let k=0;k<8 && !q;k++){ try { q = MAKERS[rnd(types)](pats); } catch(e){} } if (q) qs.push(q); } return qs;
}
function wordQuestions(n){
  const D = dict(), L = A.profile.level||1, EL = expLang();
  const pool = Object.keys(D).filter(k => D[k].h && D[k].h<=Math.max(2,L) && D[k].en.length<60 && k.length<=3);
  const mean = k => ({ en:D[k].en.split(";")[0], lo:(D[k].lo||D[k].en).split(";")[0] });
  return Array.from({length:n}, () => { const w = rnd(pool), o = shuffle(pool.filter(x=>x!==w)).slice(0,3); const m = rnd(["mean","py","hz"]);
    if (m==="mean") return { type:"mc", skill:"vocabulary", prompt:{ zh:w, py:D[w].p }, options:[mean(w), ...o.map(mean)], answer:0, w };
    if (m==="py") return { type:"mc", skill:"pinyin", prompt:{ zh:w }, options:[{en:D[w].p}, ...o.map(k=>({en:D[k].p}))], answer:0, w };
    return { type:"mc", skill:"characters", prompt:{ tr:mean(w), py:D[w].p }, options:[{zh:w}, ...o.map(k=>({zh:k}))], answer:0, w }; });
}
const TONE_SET = [["ກາ","kāa",1],["ກ່າ","kàa",2],["ກ້າ","kâa",3],["ມ້າ","mâa",4],["ຂາ","khǎa",5],["ດີ","dīi",1],["ປາ","paa",1],["ແມ່","mɛ̂ɛ",2],["ເຂົ້າ","khào",3],["ນ້ຳ","nâm",4],["ຫຼາຍ","lǎai",5],["ໄປ","pái",1],["ແຊບ","sàaep",2],["ເຈົ້າ","jâo",3],["ໝາກ","màak",6],["ເຮືອນ","hɯ́an",1]];
const toneQuestions = n => shuffle(TONE_SET).slice(0,n).map(([z,p,a]) => ({ type:"tone", skill:"pinyin", prompt:{ zh:z, py:p }, answer:a }));
async function writeQuestions(n){ const S = await strokes(); const D = dict(); const lv = A.profile.level||1;
  const pool = Object.keys(D).filter(k => k.length===1 && S[k] && D[k].h && D[k].h<=Math.max(2,lv));
  return shuffle(pool).slice(0,n).map(c => ({ type:"write_char", skill:"characters", prompt:{ zh:c, py:D[c].p, tr:{ en:D[c].en.split(";")[0], lo:(D[c].lo||"").split(";")[0] } }, ask:{ en:(D[c].en.split(";")[0])+" · "+D[c].p, lo:((D[c].lo||D[c].en).split(";")[0])+" · "+D[c].p } })); }

// ---------- generator ----------
VIEWS.gen = () => {
  const sel = new Set((A.genSel||[]).filter(n=>A.P[n])); if (!sel.size){ const first = Object.values(A.P).find(p=>p.level>=(A.profile.level||1)) || Object.values(A.P)[0]; if (first) sel.add(first.n); }
  let lvF = new Set(), q = "", count = 5;
  const listBox = h("div",{class:"plist-s"}), results = h("div"), info = h("span",{class:"muted small"});
  const selInfo = () => { info.textContent = sel.size+" "+t("patterns"); A.genSel = [...sel]; };
  const drawList = () => { listBox.innerHTML=""; const f = q.trim().toLowerCase();
    Object.values(A.P).sort((a,b)=>a.n-b.n).filter(p => (!lvF.size||lvF.has(p.level)) && (!f || String(p.n)===f || p.hz.includes(q.trim()) || pMeaning(p).toLowerCase().includes(f) || stripTone(p.py).includes(stripTone(f)))).forEach(p =>
      listBox.append(h("label",{class:"pick"}, h("input",{type:"checkbox",checked:sel.has(p.n),"aria-label":p.hz,onchange:e=>{ e.target.checked ? sel.add(p.n) : sel.delete(p.n); selInfo(); }}), h("span",{class:"pn"},"#"+p.n), h("span",null, h("span",{class:"hz lo",lang:"lo"},p.hz), h("small",{class:expLang()==="lo"?"lo":""},pMeaning(p)))))); };
  const run = append => { if (!sel.size){ toast(t("gen_empty")); return; } if (!append) results.innerHTML="";
    const ps = [...sel].map(n=>A.P[n]).filter(Boolean); const grp = h("div",{class:"gen-group"}); results.append(grp);
    for (let i=0;i<count;i++){ const p = rnd(ps); const s = genSentence(p); if (!s) continue; const el = sentenceEl(s, { markers:p.markers }); el.querySelector(".sent-main").prepend(h("button",{class:"sent-src",style:"border:0;background:none;padding:0;text-align:left",onclick:()=>go("pattern",{n:p.n})},"#"+p.n+" "+p.hz)); grp.append(el); }
    logEvent("generate", { ref:[...sel].slice(0,5).join(",") }); touchDay(); };
  const lvChips = h("div",{class:"lvchips"}, [1,2,3,4,5,6].map(L => h("button",{"aria-pressed":"false",onclick:e=>{ lvF.has(L)?lvF.delete(L):lvF.add(L); e.currentTarget.setAttribute("aria-pressed",String(lvF.has(L))); drawList(); }},"Stage "+L)));
  const cnt = h("span",{class:"tabnum",style:"min-width:2ch;font-weight:700"},count);
  const picker = h("aside",{class:"picker"}, h("input",{class:"input",placeholder:t("filter_ph"),oninput:debounce(e=>{ q=e.target.value; drawList(); },120)}), lvChips, listBox,
    h("div",{class:"spread"}, info, h("div",{class:"row"}, h("button",{class:"btn sm",onclick:()=>{ $$("input[type=checkbox]",listBox).forEach(c=>{ if(!c.checked){ c.checked=true; c.dispatchEvent(new Event("change")); } }); }}, t("gen_all")), h("button",{class:"btn sm ghost",onclick:()=>{ sel.clear(); drawList(); selInfo(); }}, t("gen_clear")))));
  const bar = h("div",{class:"gen-bar"}, h("label",{class:"row",style:"gap:8px"}, h("span",{class:"small muted"},t("gen_count")), h("input",{type:"range",min:"1",max:"20",value:count,"aria-label":t("gen_count"),oninput:e=>{ count=+e.target.value; cnt.textContent=count; }}), cnt),
    h("span",{style:"flex:1"}), h("button",{class:"btn primary",onclick:()=>run(false)}, icon("spark"), t("generate")), h("button",{class:"btn",onclick:()=>run(true)}, t("gen_more")));
  drawList(); selInfo(); setTimeout(()=>run(false));
  return h("div",null, pageHead(t("gen_title"), t("gen_sub")), h("div",{class:"gen-layout"}, picker, h("div",{class:"stack"}, bar, results)));
};

// ---------- practice ----------
const PTYPES = [["order","ຈັດ","pr_order"],["blank","ຕື່ມ","pr_blank"],["listen","ຟັງ","pr_listen"],["meaning","ແປ","pr_meaning"],["reverse","ເວົ້າ","pr_reverse"],["pattern","ຮູບ","pr_pattern"],["words","ສັບ","pr_words"],["tones","ສຽງ","pr_tones"],["write","ຂຽນ","stroke_quiz"],["speak","ອ່ານ","nav_speak"]];
VIEWS.practice = ({ type }) => {
  const root = h("div");
  if (type) return startPractice(root, type);
  const quizzes = Object.values(A.byType.quizzes||{}).sort((a,b)=>(a.level-b.level)||((a.order||0)-(b.order||0)));
  root.append(pageHead(t("practice_title"), t("practice_sub")),
    h("div",{class:"grid2"}, PTYPES.map(([k,ic,l]) => h("button",{class:"pcard",onclick:()=>go("practice",{type:k})}, h("span",{class:"qi lo",style:"font-weight:700"},ic), h("div",null, h("b",null,t(l)), h("span",null, t(l+"_d")!==l+"_d" ? t(l+"_d") : ""))))),
    h("div",{style:"margin-top:14px"}, h("button",{class:"btn primary",onclick:()=>go("practice",{type:"mix"})}, icon("spark"), t("start")+" · mix")),
    quizzes.length ? h("section",{class:"sect",style:"margin-top:28px"}, h("h2",null,t("quiz")), h("div",{class:"list-card"}, quizzes.map(q => { const r = A.prog.lessons["quiz:"+q.id];
      return h("button",{class:"item-row",onclick:()=>go("quiz",{id:q.id})}, h("span",{class:"stepnum"+(r?" done":"")}, r?icon("check"):icon("star")), h("span",null, h("div",{class:"ttl"},T(q.title)), h("div",{class:"sub"}, "Stage "+q.level+" · "+(q.questions||[]).length+" "+t("questions").toLowerCase()+(r?" · "+r.score+"/"+r.total:""))), icon("right")); }))) : null);
  return root;
};
function startPractice(root, type){
  const lv = A.profile.level || 1, learned = Object.keys(A.prog.patterns).map(Number).filter(n=>A.P[n]);
  let pool = learned.length>=4 ? learned.map(n=>A.P[n]) : Object.values(A.P).filter(p=>p.level<=Math.max(2,lv));
  if (pool.length<4) pool = Object.values(A.P);
  const box = h("div",{class:"quiz"});
  root.append(h("div",{class:"spread",style:"margin-bottom:10px"}, h("button",{class:"btn sm ghost",onclick:()=>go("practice",{},false)}, icon("left"), t("back"))), box);
  const make = async () => type==="words" ? wordQuestions(10) : type==="tones" ? toneQuestions(10) : type==="write" ? await writeQuestions(6)
    : type==="mix" ? shuffle([...patternQuestions(pool, 7, ["order","blank","meaning","listen","reverse","pattern"]), ...wordQuestions(3)]) : patternQuestions(pool, 10, [type]);
  const start = async () => { const qs = await make(); runQuiz(box, qs, { key:"practice:"+type, onAnswer:(q,ok,m)=>{ recordAnswer(q.skill, ok, m); if (!ok && q.w) srsAdd("w:"+q.w,{type:"w",w:q.w}); if (!ok && q.say) srsAdd("s:"+q.say,{type:"s",zh:q.say}); },
    onFinish:r => logEvent("practice", { ref:type, score:r.right, total:r.total }, true), onAgain:start, onExit:()=>go("practice",{},false) }); };
  start();
  return root;
}
VIEWS.quiz = ({ id }) => {
  const q = A.byType.quizzes[id]; if (!q) return h("div",{class:"empty"},t("no_rows"));
  const box = h("div",{class:"quiz"});
  const start = () => runQuiz(box, q.questions||[], { key:"quiz:"+id, title:T(q.title), onAnswer:(qq,ok,m)=>recordAnswer(qq.skill, ok, m),
    onFinish:r => { A.prog.lessons["quiz:"+id] = { done:true, at:Date.now(), score:r.right, total:r.total }; quizDone(id, r.right, r.total); }, onAgain:start, onExit:()=>A.back() });
  start();
  return h("div",null, h("div",{class:"crumb"}, h("button",{onclick:()=>go("practice")},t("nav_practice")), "›", h("span",null,T(q.title))), box);
};

// ---------- dictionary ----------
VIEWS.dict = ({ q="" }) => {
  const res = h("div"), EL = expLang();
  const listEl = keys => { const D = dict(); return h("div",{class:"dres"}, keys.map(k => h("button",{onclick:()=>openWord(k)}, h("span",{class:"lo",style:"font-size:1.35rem;font-weight:700"},k), h("span",{html:pyHTML(D[k].p)}), h("span",{class:"gl"+(EL==="lo"&&D[k].lo?" lo":"")}, meaning(k,EL)), D[k].h ? h("span",{class:"chip lv"},"Stage "+D[k].h) : h("span")))); };
  const draw = () => { res.innerHTML="";
    if (!q.trim()){ const D = dict(); res.append(h("h3",{style:"margin:6px 0 10px"},"Stage 1 · High Frequency"), listEl(Object.keys(D).filter(k=>D[k].h===1).sort((a,b)=>D[a].fq-D[b].fq).slice(0,60))); return; }
    const hits = searchDict(q, 60); if (!hits.length){ res.append(h("div",{class:"empty"},t("search_none"))); return; }
    if (dict()[q.trim()]) res.append(h("div",{class:"card",style:"margin-bottom:16px"}, entryEl(q.trim())));
    res.append(h("p",{class:"muted small",style:"margin-bottom:8px"}, hits.length+" "+t("results")), listEl(hits)); };
  draw();
  return h("div",null, pageHead(t("dict_title"), t("dict_sub")), h("input",{class:"input",style:"font-size:1.1rem;padding:12px 14px;margin-bottom:16px",placeholder:t("search_ph"),value:q,oninput:debounce(e=>{ q=e.target.value; draw(); },140)}), res);
};

// ---------- Lao Alphabet (ອັກສອນລາວ) ----------
VIEWS.pinyin = () => {
  const root = h("div",{class:"stack-l"});
  root.append(pageHead(t("nav_pinyin")+" · ອັກສອນລາວ", "27 Consonants, Vowels, and Tones in Lao language with native audio pronunciation."));

  // 6 Tones of Vientiane Lao
  const tones = [
    [1, "Mid (ສຽງສາມັນ)", "Level 33", "ກາ (kāa) · crow"],
    [2, "Low (ສຽງເອກ)", "Low flat 21 / 11", "ກ່າ (kàa) · ginger root"],
    [3, "High Falling (ສຽງໂທ)", "Falling 52", "ກ້າ (kâa) · brave / seedling"],
    [4, "High (ສຽງຕີ)", "High level 55", "ມ້າ (mâa) · horse"],
    [5, "Rising (ສຽງຈັດຕະວາ)", "Rising 14 / 24", "ຂາ (khǎa) · leg"],
    [6, "Low Falling (ສຽງຕົກ)", "Low falling 31", "ໝາກ (màak) · fruit"]
  ];
  root.append(h("section",{class:"sect"},
    h("h2",null,"Lao Tones · ວັນນະຍຸດ"),
    h("p",{class:"muted small",style:"margin-bottom:12px"},"Lao has 6 spoken tones determined by the consonant class (Middle, High, Low), vowel length, and tone mark."),
    h("div",{class:"grid3"}, tones.map(([n,name,pitch,ex]) => {
      const word = ex.split(" ")[0];
      return h("button",{class:"tonecard",onclick:()=>speak(word)},
        toneSVG(Math.min(4,n)),
        h("span",{class:"syl t"+n,style:"font-weight:700"}, name),
        h("span",{class:"ex lo",style:"font-size:1.4rem"}, word),
        h("span",{class:"small muted"}, pitch+" · "+ex.split("·")[1]));
    })),
    h("div",{class:"row",style:"margin-top:10px"},
      h("button",{class:"btn sm",onclick:()=>speak("ກາ ກ່າ ກ້າ")}, icon("play"), "ກາ ກ່າ ກ້າ (Tone marks: ່ ້)")
    )
  ));

  // 27 Consonants
  const MID_CONS = [
    ["ກ","kɔ̀ɔ kái","ໄກ່","chicken","[k] / [k]"],
    ["ຈ","cɔ̀ɔ cɔ́ɔk","ຈອກ","cup / glass","[c] / [t]"],
    ["ດ","dɔ̀ɔ dék","ເດັກ","child","[d] / [t]"],
    ["ຕ","tɔ̀ɔ taa","ຕາ","eye","[t] / [t]"],
    ["ບ","bɔ̀ɔ bôong","ບົ້ງ","caterpillar","[b] / [p]"],
    ["ປ","pɔ̀ɔ paa","ປາ","fish","[p] / [p]"],
    ["ຢ","yɔ̀ɔ yaa","ຢາ","medicine","[y] / [y]"],
    ["ອ","ɔ̀ɔ oo","ໂອ","water bowl","[ʔ] / [-]"]
  ];
  const HIGH_CONS = [
    ["ຂ","khɔ̌ɔ khǎi","ໄຂ່","egg","[kh] / [k]"],
    ["ສ","sɔ̌ɔ sɯ̌a","ເສືອ","tiger","[s] / [t]"],
    ["ຖ","thɔ̌ɔ thǒng","ຖົງ","bag","[th] / [t]"],
    ["ຜ","phɔ̌ɔ phə̂ng","ເຜິ້ງ","bee","[ph] / [-]"],
    ["ຝ","fɔ̌ɔ fǒn","ຝົນ","rain","[f] / [-]"],
    ["ຫ","hɔ̌ɔ hàan","ຫ່ານ","goose","[h] / [-]"]
  ];
  const LOW_CONS = [
    ["ຄ","khɔ́ɔ khwáai","ຄວາຍ","buffalo","[kh] / [k]"],
    ["ງ","ngɔ́ɔ ngúaa","ງົວ","cow","[ng] / [ng]"],
    ["ຊ","xɔ́ɔ xâang","ຊ້າງ","elephant","[s/x] / [t]"],
    ["ຍ","gnɔ́ɔ gnúng","ຍຸງ","mosquito","[ny] / [n]"],
    ["ທ","thɔ́ɔ thúng","ທຸງ","flag","[th] / [t]"],
    ["ນ","nɔ́ɔ nók","ນົກ","bird","[n] / [n]"],
    ["ພ","phɔ́ɔ phuu","ພູ","mountain","[ph] / [p]"],
    ["ຟ","fɔ́ɔ fái","ໄຟ","fire","[f] / [p]"],
    ["ມ","mɔ́ɔ mâa","ມ້າ","horse","[m] / [m]"],
    ["ຣ","rɔ́ɔ ra-khang","ຣະຄັງ","bell","[r/l] / [n]"],
    ["ລ","lɔ́ɔ liing","ລີງ","monkey","[l] / [n]"],
    ["ວ","wɔ́ɔ wii","ວີ","fan","[w] / [w]"],
    ["ຮ","hɔ́ɔ hɯ́an","ເຮືອນ","house","[h] / [-]"]
  ];

  const consCard = ([letter, roman, word, meaning, sounds]) => {
    return h("button",{class:"scell",onclick:()=>{ speak(letter + " " + word); recordAnswer("pinyin", true); }},
      h("b",{class:"lo",style:"font-size:1.8rem;line-height:1"}, letter),
      h("span",{class:"hz lo",style:"font-size:1.1rem;color:var(--accent)"}, word),
      h("small",{style:"font-weight:600"}, roman),
      h("small",{class:"muted"}, meaning+" · "+sounds)
    );
  };

  root.append(
    h("section",{class:"sect"}, h("h2",null,"Middle Consonants (ອັກສອນກາງ · 8 letters)"), h("div",{class:"sgrid"}, MID_CONS.map(consCard))),
    h("section",{class:"sect"}, h("h2",null,"High Consonants (ອັກສອນສູງ · 6 letters)"), h("div",{class:"sgrid"}, HIGH_CONS.map(consCard))),
    h("section",{class:"sect"}, h("h2",null,"Low Consonants (ອັກສອນຕ່ຳ · 13 letters)"), h("div",{class:"sgrid"}, LOW_CONS.map(consCard)))
  );

  // Vowels
  const VOWELS = [
    ["ະ","sara a","short 'a' (ອະ)"],["າ","sara aa","long 'aa' (ອາ)"],
    ["ິ","sara i","short 'i' (ອິ)"],["ີ","sara ii","long 'ii' (ອີ)"],
    ["ຶ","sara ue","short 'ue' (ອຶ)"],["ື","sara uee","long 'uee' (ອື)"],
    ["ຸ","sara u","short 'u' (ອຸ)"],["ູ","sara uu","long 'uu' (ອູ)"],
    ["ເ-ະ","sara e","short 'e' (ເອະ)"],["ເ-","sara ee","long 'ee' (ເອ)"],
    ["ແ-ະ","sara ae","short 'ae' (ແອະ)"],["ແ-","sara aae","long 'aae' (ແອ)"],
    ["ໂ-ະ","sara o","short 'o' (ໂອະ)"],["ໂ-","sara oo","long 'oo' (ໂອ)"],
    ["ໄ-","sara ai","mai may (ໄອ)"],["ໃ-","sara ay","mai muan (ໃອ)"],
    ["ເ-ົາ","sara ao","diphthong (ເອົາ)"],["ອໍາ","sara am","nasal (ອຳ)"]
  ];
  root.append(h("section",{class:"sect"},
    h("h2",null,"Lao Vowels · ສະຫຼະ"),
    h("div",{class:"sgrid"}, VOWELS.map(([v, roman, note]) => {
      const soundText = v.replace("-","ກ");
      return h("button",{class:"scell",onclick:()=>speak(soundText)},
        h("b",{class:"lo",style:"font-size:1.6rem"}, v),
        h("span",{style:"font-size:.9rem;font-weight:600"}, roman),
        h("small",{class:"muted"}, note));
    }))
  ));

  root.append(h("section",{class:"card spread"},
    h("div",null,h("h3",null,"Practice Tone & Alphabet Quiz"),h("p",{class:"muted small"},"Test your recognition of Lao letters and tones.")),
    h("button",{class:"btn primary",onclick:()=>go("practice",{type:"tones"})}, t("start"), icon("right"))
  ));

  return root;
};

// ---------- Lao Script & Handwriting (ການຂຽນອັກສອນລາວ) ----------
// Quick picker of all 27 consonants with their mnemonic names; the subset that has real stroke
// data (authored in Admin -> characters -> Stroke order) gets real demo+recognition below, the
// rest fall back to a "not ready yet" message rather than a silently-broken canvas.
const ALL_CHARS = [
  ["ກ","ໄກ່ (chicken)"],["ຂ","ໄຂ່ (egg)"],["ຄ","ຄວາຍ (buffalo)"],["ງ","ງົວ (cow)"],
  ["ຈ","ຈອກ (cup)"],["ສ","ເສືອ (tiger)"],["ຊ","ຊ້າງ (elephant)"],["ຍ","ຍຸງ (mosquito)"],
  ["ດ","ເດັກ (child)"],["ຕ","ຕາ (eye)"],["ຖ","ຖົງ (bag)"],["ທ","ທຸງ (flag)"],
  ["ນ","ນົກ (bird)"],["ບ","ບົ້ງ (caterpillar)"],["ປ","ປາ (fish)"],["ຜ","ເຜິ້ງ (bee)"],
  ["ຝ","ຝົນ (rain)"],["ພ","ພູ (mountain)"],["ຟ","ໄຟ (fire)"],["ມ","ມ້າ (horse)"],
  ["ຢ","ຢາ (medicine)"],["ຣ","ຣະຄັງ (bell)"],["ລ","ລີງ (monkey)"],["ວ","ວີ (fan)"],
  ["ຫ","ຫ່ານ (goose)"],["ອ","ໂອ (bowl)"],["ຮ","ເຮືອນ (house)"]
];
const STROKE_COLORS = ["#0284C7","#059669","#D97706","#E11D48","#7C3AED","#0D9488"];
const sleep = ms => new Promise(r=>setTimeout(r,ms));
const clamp01 = x => Math.max(0, Math.min(1, x));

VIEWS.chars = () => {
  const root = h("div",{class:"stack-l"});
  root.append(pageHead(t("chars_title"), "Learn the art of writing Lao script: watch the official stroke order, then draw it yourself."));

  const byChar = c => Object.values(A.byType.characters||{}).find(x=>x.char===c);
  const startChar = (Object.values(A.byType.characters||{}).find(c=>c.strokes && c.strokes.length) || {}).char || "ກ";
  let currentLetter = startChar, currentDoc = byChar(startChar);
  let drawnStrokes = [], liveStroke = null, animating = false;

  // ---- responsive, normalized canvas (devicePixelRatio-aware; never fixed pixel dimensions) ----
  const wrap = h("div",{class:"hw-canvas-wrap"});
  const bg = h("div",{class:"hw-canvas-bg lo"}, currentLetter);
  const canvas = h("canvas",{class:"hw-canvas"});
  wrap.append(bg, canvas, h("div",{class:"hw-grid-lines"}));
  const ctx2 = canvas.getContext("2d");

  function sizeCanvas(){
    const rect = wrap.getBoundingClientRect(); if (!rect.width) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.max(1, Math.round(rect.width*dpr));
    canvas.height = Math.max(1, Math.round(rect.height*dpr));
    ctx2.setTransform(dpr,0,0,dpr,0,0);
    redraw();
  }
  function paintStroke(points, color){
    if (!points || points.length < 2) return;
    const rect = wrap.getBoundingClientRect();
    ctx2.save(); ctx2.strokeStyle = color; ctx2.lineWidth = Math.max(3, rect.width*0.028); ctx2.lineCap = "round"; ctx2.lineJoin = "round";
    ctx2.beginPath();
    points.forEach((p,i) => { const x=p.x*rect.width, y=p.y*rect.height; i===0?ctx2.moveTo(x,y):ctx2.lineTo(x,y); });
    ctx2.stroke(); ctx2.restore();
  }
  function redraw(){
    const rect = wrap.getBoundingClientRect();
    ctx2.clearRect(0,0,rect.width,rect.height);
    drawnStrokes.forEach((s,i) => paintStroke(s.points, STROKE_COLORS[i%STROKE_COLORS.length]));
    if (liveStroke) paintStroke(liveStroke, "#0284C7");
  }
  const toNorm = (clientX, clientY) => { const r = wrap.getBoundingClientRect(); return { x: clamp01((clientX-r.left)/r.width), y: clamp01((clientY-r.top)/r.height) }; };

  canvas.addEventListener("pointerdown", e => { if (animating) return; e.preventDefault(); try { canvas.setPointerCapture(e.pointerId); } catch(err){ /* capture is a nice-to-have; drawing still works without it */ } liveStroke = [toNorm(e.clientX,e.clientY)]; });
  canvas.addEventListener("pointermove", e => { if (!liveStroke) return; e.preventDefault(); liveStroke.push(toNorm(e.clientX,e.clientY)); redraw(); });
  const endStroke = () => { if (liveStroke && liveStroke.length>1) drawnStrokes.push({ points: liveStroke }); liveStroke = null; redraw(); };
  canvas.addEventListener("pointerup", endStroke);
  canvas.addEventListener("pointercancel", () => { liveStroke = null; redraw(); });
  window.addEventListener("resize", debounce(sizeCanvas, 150));

  // ---- demonstration: replays the SAME stroke data used for scoring (never a separate asset that
  // could drift out of sync) ----
  async function playDemo(){
    if (!currentDoc || !currentDoc.strokes || !currentDoc.strokes.length || animating) return;
    animating = true; drawnStrokes = []; liveStroke = null; resultBox.innerHTML = "";
    for (const s of currentDoc.strokes){
      const pts = s.points, step = Math.max(1, Math.floor(pts.length/22));
      for (let k=2;k<=pts.length;k+=step){ drawnStrokes.push({ points: pts.slice(0,k) }); redraw(); drawnStrokes.pop(); await sleep(16); }
      drawnStrokes.push({ points: pts }); redraw();
      await sleep(220);
    }
    await sleep(400);
    drawnStrokes = []; redraw();
    animating = false;
  }

  const resultBox = h("div",{class:"hw-feedback"});
  const statsLine = h("div",{class:"small muted"});
  function updateStats(){
    const hw = A.prog.handwriting[currentLetter] || A.prog.handwriting[(currentDoc&&currentDoc.id)||""];
    statsLine.textContent = hw ? `${t("hw_best")}: ${hw.bestScore} · ${t("hw_attempts")}: ${hw.attempts}` : "";
  }
  function renderResult(result){
    resultBox.innerHTML = "";
    const fb = feedbackFor(result, lang());
    resultBox.append(
      h("div",{class:"row",style:"align-items:baseline;gap:10px"},
        h("span",{class:"hw-score-ring",style:`color:${result.passed?"var(--jade)":"var(--warn)"}`}, result.total),
        h("span",{class:"muted small"},"/ 100"),
        h("span",{class:"chip"+(result.passed?" ok":"")}, result.passed ? t("hw_passed") : t("hw_keep_practicing"))),
      ...fb.map(f => h("p",{style:`color:${f.kind==="ok"?"var(--jade)":f.kind==="bad"?"var(--bad)":"var(--warn)"}`}, f.text)));
  }
  function checkWriting(){
    if (!currentDoc || !currentDoc.strokes || !currentDoc.strokes.length){ toast(t("hw_no_strokes"), "err"); return; }
    if (!drawnStrokes.length){ toast(t("hw_your_turn")); return; }
    const result = scoreAttempt(drawnStrokes, currentDoc.strokes, (A.rules && A.rules.handwriting));
    renderResult(result);
    recordHandwritingAttempt(currentDoc.id || currentLetter, result);
    updateStats();
    touchDay();
  }

  const charDisplay = h("div",{class:"lo",style:"font-size:3.5rem;font-weight:700;color:var(--accent);line-height:1"}, currentLetter);
  const infoDisplay = h("div",{class:"muted small"});
  const demoBtn = h("button",{class:"btn sm primary",onclick:playDemo}, icon("play"), t("show_stroke_order"));
  const readyBanner = h("div",{class:"banner",style:"font-size:.85rem"});

  const selectLetter = c => {
    currentLetter = c; currentDoc = byChar(c);
    drawnStrokes = []; liveStroke = null; animating = false;
    bg.textContent = c; charDisplay.textContent = c;
    const meta = ALL_CHARS.find(([cc])=>cc===c);
    infoDisplay.textContent = "Letter: " + c + (meta ? " · "+meta[1] : "");
    const ready = currentDoc && currentDoc.strokes && currentDoc.strokes.length;
    demoBtn.disabled = !ready;
    // .banner sets its own "display", which silently overrides the native [hidden] rule's
    // display:none (author CSS always beats the UA stylesheet) -- toggle an inline style instead.
    readyBanner.style.display = ready ? "none" : "flex";
    readyBanner.textContent = t("hw_no_strokes");
    resultBox.innerHTML = ""; updateStats(); redraw();
    speak(c);
  };

  const studio = h("div",{class:"card hw-studio"},
    h("div",{class:"stack",style:"align-items:center;gap:12px"},
      wrap,
      h("div",{class:"hw-controls"},
        demoBtn,
        h("button",{class:"btn sm",onclick:()=>{ drawnStrokes=[]; liveStroke=null; resultBox.innerHTML=""; redraw(); }}, icon("x"), t("clear")),
        h("button",{class:"btn sm",onclick:()=>speak(currentLetter)}, icon("speaker"), "Audio"),
        h("button",{class:"btn sm primary",onclick:checkWriting}, icon("check"), t("hw_check"))),
      statsLine, resultBox),
    h("div",{class:"stack",style:"gap:14px"},
      h("div",{style:"display:flex;align-items:baseline;gap:12px"}, charDisplay, h("div",null, h("h3",null,"Handwriting Practice Studio"), infoDisplay)),
      h("p",{class:"small muted"}, t("hw_watch_first")),
      readyBanner,
      h("div",{class:"banner info",style:"font-size:.9rem"},
        h("b",null,"Golden Rule of Lao Script: "),
        "ຂຽນຫົວ ກ່ອນ (Always write the head loop first!). Unlike English letters which start top-down, most Lao consonants start with the small circle or spiral loop."),
      h("p",{class:"small muted"},"Pick any letter below to practice:")));

  const pickerGrid = h("div",{class:"cgrid",style:"margin-top:16px"},
    ALL_CHARS.map(([c]) => {
      const ready = Object.values(A.byType.characters||{}).some(x=>x.char===c && x.strokes && x.strokes.length);
      return h("button",{class:"lo",style:"font-size:1.6rem;position:relative",onclick:()=>selectLetter(c)}, c,
        ready ? h("span",{style:"position:absolute;top:3px;right:6px;width:6px;height:6px;border-radius:50%;background:var(--jade)"}) : null);
    }));

  root.append(studio, h("section",{class:"sect"}, h("h2",null,"Select Lao Consonant to Practice"), pickerGrid));
  selectLetter(currentLetter);
  requestAnimationFrame(sizeCanvas);
  return root;
};

// ---------- pronunciation ----------
VIEWS.speak = () => {
  const lv = A.profile.level || 1;
  const pool = Object.values(A.P).filter(p=>p.level<=Math.max(2,lv));
  const box = h("div",{class:"quiz"});
  const start = () => { const qs = []; for (let i=0;i<30 && qs.length<8;i++){ const q = MAKERS.speak(pool); if (q) qs.push(q); }
    runQuiz(box, qs, { key:"speak", title:t("speak_title"), onAnswer:(q,ok,m)=>recordAnswer("speaking", ok, m), onFinish:r=>logEvent("speaking", { score:r.right, total:r.total }, true), onAgain:start }); };
  start();
  return h("div",null, pageHead(t("speak_title"), t("speak_sub")), canListen() ? null : h("div",{class:"banner",style:"margin-bottom:14px"}, t("no_mic")), box);
};

// ---------- review ----------
VIEWS.review = () => {
  const root = h("div"), due = srsDue(), total = Object.keys(A.srs).length;
  root.append(pageHead(t("review_title"), t("review_sub")),
    h("div",{class:"grid3",style:"margin-bottom:22px"}, h("div",{class:"card stat"}, h("b",null,due.length), h("span",null,t("due_now"))), h("div",{class:"card stat"}, h("b",null,total), h("span",null,t("in_deck"))), h("div",{class:"card stat"}, h("b",null,wordsMastered()), h("span",null,t("learned_words")))));
  if (!due.length){ root.append(h("div",{class:"empty"},t("review_empty"))); return root; }
  const c = due.sort((a,b)=>a.due-b.due)[0], D = dict(), EL = expLang();
  const box = h("div",{class:"qbox flash"}); let front; const back = h("div",{class:"stack",style:"gap:6px;align-items:center",hidden:true});
  if (c.type==="p"){ const p = A.P[c.n]; if (!p){ srsGrade(c.id,3); return VIEWS.review(); } front = h("div",{class:"front hzd"},p.hz); back.append(h("div",{html:pyHTML(p.py)}), h("div",{class:EL==="lo"?"lo":""},pMeaning(p)), h("button",{class:"btn sm ghost",onclick:()=>go("pattern",{n:p.n})},t("open_pattern"))); const s = genSentence(p); if (s) back.append(h("div",{style:"text-align:left;width:100%"}, sentenceEl(s,{markers:p.markers}))); }
  else if (c.type==="w"){ const d = D[c.w]; front = h("div",{class:"front",lang:"zh-CN"},c.w); back.append(h("div",{style:"font-size:1.3rem",html:pyHTML(d?d.p:"")}), h("div",{class:EL==="lo"&&d&&d.lo?"lo":""}, d ? meaning(c.w,EL) : ""), h("button",{class:"btn sm",onclick:()=>speak(c.w)},icon("play"),t("play"))); }
  else { front = h("div",{class:"front",style:"font-size:1.7rem",lang:"zh-CN"},c.zh); back.append(h("div",{html:pyHTML(c.py||"")}), h("div",{class:"muted"}, c.tr ? tr(c.tr, EL) : ""), h("button",{class:"btn sm",onclick:()=>speak(c.zh)},icon("play"),t("play"))); }
  const grades = h("div",{class:"grades",hidden:true}, [["r_again",0,"5m"],["r_hard",1,""],["r_good",2,""],["r_easy",3,""]].map(([k,q,hint]) => h("button",{class:"btn"+(q===2?" primary":""),onclick:()=>{ srsGrade(c.id,q); recordAnswer(c.type==="w"?"vocabulary":c.type==="p"?"grammar":"reading", q>0); go("review",{},false); }}, h("span",null,t(k), hint?h("small",null,hint):null))));
  const show = h("button",{class:"btn primary",onclick:()=>{ back.hidden=false; grades.hidden=false; show.remove(); if (c.type!=="p") speak(c.w||c.zh); }}, t("show_answer"));
  box.append(front, back, show); root.append(box, grades);
  return root;
};

// ---------- saved ----------
VIEWS.saved = () => {
  const items = Object.values(A.saved).sort((a,b)=>(b.at||0)-(a.at||0));
  const root = h("div"); root.append(pageHead(t("saved_title")));
  if (!items.length){ root.append(h("div",{class:"empty"},t("saved_empty"))); return root; }
  const D = dict(), EL = expLang();
  const group = (title, list, fn) => list.length ? h("section",{class:"sect",style:"margin-bottom:24px"}, h("h2",null,title+" ("+list.length+")"), fn(list)) : null;
  root.append(
    group(t("words"), items.filter(x=>x.type==="word"), l => h("div",{class:"vgrid"}, l.map(x => h("button",{class:"vcard",onclick:()=>openWord(x.w)}, h("span",{class:"hz"},x.w), h("span",{html:pyHTML(D[x.w]?D[x.w].p:"")}), h("span",{class:"m"}, (meaning(x.w,EL)||"").split(";")[0]))))),
    group(t("sentences"), items.filter(x=>x.type==="sentence"), l => h("div",{class:"card",style:"padding-block:4px"}, l.map(x => sentenceEl(ensureTokens({ zh:x.zh, py:x.py, tr:x.tr, pn:x.pn }, A.engine))))),
    group(t("nav_lessons"), items.filter(x=>x.type==="lesson"), l => h("div",{class:"list-card"}, l.map(x => h("button",{class:"item-row",onclick:()=>go("lesson",{id:x.id})}, icon("learn"), h("span",{class:"ttl"},T(x.title)), icon("right"))))),
    group(t("nav_patterns"), items.filter(x=>x.type==="pattern" && A.P[x.n]), l => h("div",{class:"wordchips"}, l.map(x => h("button",{onclick:()=>go("pattern",{n:x.n})}, "#"+x.n+" ", h("span",{class:"hz"},A.P[x.n].hz))))),
    group(t("nav_grammar"), items.filter(x=>x.type==="grammar"), l => h("div",{class:"list-card"}, l.map(x => h("button",{class:"item-row",onclick:()=>go("grammarItem",{id:x.id})}, icon("layers"), h("span",{class:"ttl"},T(x.title)), icon("right"))))));
  return root;
};

// ---------- notes ----------
VIEWS.notes = () => {
  const root = h("div"), list = h("div",{class:"stack"}, h("p",{class:"muted"},t("loading")));
  const input = h("textarea",{class:"input",placeholder:t("note_ph"),"aria-label":t("note_ph")});
  const load = async () => { const rows = (await A.api.db.list(`notes/${A.user.uid}/items`).catch(()=>[])).sort((a,b)=>(b.at||0)-(a.at||0)); list.innerHTML="";
    if (!rows.length) list.append(h("p",{class:"muted"},t("notes_empty")));
    rows.forEach(n => list.append(h("div",{class:"notecard"}, h("p",{style:"white-space:pre-wrap"}, n.text), h("div",{class:"spread"}, h("span",{class:"small muted"}, fmtDate(n.at, lang(), true)+(n.ref?" · "+n.ref:"")), h("button",{class:"btn sm ghost",onclick:async()=>{ await A.api.db.del(`notes/${A.user.uid}/items/${n.id}`); load(); }}, icon("trash"), t("delete")))))); };
  load();
  root.append(pageHead(t("notes_title")), h("div",{class:"card stack",style:"margin-bottom:18px"}, input, h("button",{class:"btn primary",style:"align-self:flex-start",onclick:async()=>{ const v = input.value.trim(); if (!v) return; const ref = A.prog.last ? A.prog.last.type+":"+A.prog.last.id : ""; await A.api.db.add(`notes/${A.user.uid}/items`, { text:v, ref, at:new Date() }); input.value=""; load(); }}, t("add_note"))), list);
  return root;
};

// ---------- progress ----------
VIEWS.progress = () => {
  const root = h("div",{class:"stack-l"});
  root.append(pageHead(t("progress_title"), t("progress_sub")));
  const lessons = Object.entries(A.prog.lessons).filter(([id,x])=>x.done && !id.startsWith("quiz:")).length, pats = Object.keys(A.prog.patterns).length;
  root.append(h("div",{class:"grid4"}, h("div",{class:"card stat"}, h("b",null,lessons), h("span",null,t("lessons_done"))), h("div",{class:"card stat"}, h("b",null,pats+" / "+Object.keys(A.P).length), h("span",null,t("patterns_learned"))),
    h("div",{class:"card stat"}, h("b",null,wordsMastered()), h("span",null,t("learned_words"))), h("div",{class:"card stat"}, h("b",null,Object.keys(A.prog.days).length), h("span",null,t("study_days")))));
  root.append(xpCard(false));
  root.append(h("section",{class:"sect"}, h("h2",null,t("skills")), h("p",{class:"small muted"}, t("mastery_note")), h("div",{class:"card stack",style:"gap:12px"}, SKILLS.map(masteryRow))));
  const byLevel = h("div",{class:"card stack",style:"gap:10px"});
  for (let L=1; L<=6; L++){ const all = Object.values(A.P).filter(p=>p.level===L); if (!all.length) continue; const d = all.filter(p=>A.prog.patterns[p.n]).length;
    byLevel.append(h("div",{class:"lvbar"}, h("b",null,"Stage "+L), h("div",{class:"bar"},h("i",{style:`width:${100*d/all.length}%`})), h("span",{class:"muted tabnum",style:"text-align:right"}, d+" / "+all.length))); }
  root.append(h("section",{class:"sect"}, h("h2",null,t("by_level")), byLevel), achievementsEl(false));
  const hist = h("div",{class:"feed"}, h("p",{class:"muted"},t("loading")));
  A.api.db.list(`progress/${A.user.uid}/events`, { orderBy:["at","desc"], limit:60 }).then(ev => { hist.innerHTML=""; const rows = ev.filter(e=>["quiz","practice","lesson","speaking"].includes(e.type)).slice(0,20);
    if (!rows.length) hist.append(h("p",{class:"muted"},t("no_rows")));
    rows.forEach(e => hist.append(h("div",{class:"feed-row"}, h("span",null, e.type+" · "+(e.ref||"")+(e.total?" · "+e.score+"/"+e.total:"")), h("span",{class:"small muted"}, fmtDate(e.at, lang(), true))))); }).catch(()=>{ hist.innerHTML=""; });
  root.append(h("section",{class:"sect"}, h("h2",null,t("quiz_history")), h("div",{class:"card"}, hist)));
  return root;
};

// ---------- offline downloads ----------
VIEWS.downloads = () => {
  const root = h("div"); const rows = h("div",{class:"card"});
  const state = async url => { try { const c = await caches.open("xuelu-runtime"); return !!(await c.match(url)); } catch(e){ return false; } };
  const fetchTo = async urls => { const c = await caches.open("xuelu-runtime"); let n=0; for (const u of urls){ try { const r = await fetch(u, { mode: u.startsWith(location.origin)?"same-origin":"no-cors" }); await c.put(u, r); n++; } catch(e){} } return n; };
  const base = new URL("./", location.href).href;
  const row = (label, desc, urls) => { const btn = h("button",{class:"btn sm"}, icon("download"), t("dl_btn")); const st = h("span",{class:"small muted"});
    (async () => { const ok = urls.length && (await Promise.all(urls.map(state))).every(Boolean); if (ok){ btn.replaceWith(h("span",{class:"chip lv"}, icon("check"), t("dl_done"))); } })();
    btn.addEventListener("click", async () => { if (!("caches" in window)){ toast("Not supported in this browser","err"); return; } btn.disabled = true; st.textContent = t("loading"); const n = await fetchTo(urls); st.textContent = n+"/"+urls.length; btn.replaceWith(h("span",{class:"chip lv"}, icon("check"), t("dl_done"))); });
    return h("div",{class:"dl-row"}, h("div",null, h("b",null,label), desc ? h("div",{class:"small muted"},desc) : null, st), btn); };
  const core = ["","index.html","css/app.css","js/learner/main.js","js/learner/core.js","js/learner/views-learn.js","js/learner/views-tools.js","js/learner/views-labs.js","js/learner/views-media.js","js/shared/ui.js","js/shared/i18n.js","js/shared/content.js","js/shared/dict.js","js/shared/engine.js","js/shared/speech.js","js/shared/widgets.js","js/shared/quiz.js","js/shared/setup.js","js/api/index.js","js/api/supabase.js","js/api/local.js","js/config.js","manifest.webmanifest","icon.svg"].map(p=>base+p);
  rows.append(row(t("dl_core"), t("sync_note"), core), row(t("dl_dict"), "≈ 1.3 MB", [base+"data/dictionary.json", base+"data/chars.json"]), row(t("dl_strokes"), "≈ 1.9 MB", [base+"data/strokes.json"]));
  const audio = (A.B.audio||[]).filter(a=>a.url);
  for (let L=1; L<=6; L++){ const words = new Set(Object.values(A.byType.lessons||{}).filter(l=>l.level===L).flatMap(l=>l.vocab||[]));
    const urls = audio.filter(a => words.has(a.text) || (a.relatedType==="lessons" && A.byType.lessons[a.relatedId] && A.byType.lessons[a.relatedId].level===L)).map(a=>a.url);
    rows.append(urls.length ? row(t("dl_audio",{n:L}), urls.length+" files", urls) : h("div",{class:"dl-row"}, h("div",null, h("b",null,t("dl_audio",{n:L})), h("div",{class:"small muted"},t("dl_none_audio"))), h("span"))); }
  const usage = h("p",{class:"small muted",style:"margin-top:12px"});
  if (navigator.storage && navigator.storage.estimate) navigator.storage.estimate().then(e => usage.textContent = t("dl_storage")+": "+(e.usage/1048576).toFixed(1)+" MB");
  root.append(pageHead(t("dl_title"), t("dl_sub")), rows, usage);
  return root;
};

// ---------- account & settings ----------
VIEWS.account = () => {
  const p = prefs(), a = A.access, root = h("div",{class:"stack-l"});
  const row = (label, ctrl, desc) => h("div",{class:"set-row"}, h("div",null, h("label",null,label), desc ? h("p",null,desc) : null), ctrl);
  const sw = k => h("input",{type:"checkbox",class:"switch",checked:!!p[k],"aria-label":k,onchange:e=>setPref(k, e.target.checked)});
  const nameIn = h("input",{class:"input",value:A.profile.name||"",style:"max-width:260px"});
  const vs = voices();
  root.append(pageHead(t("account_title")));
  root.append(h("section",{class:"card"},
    row(t("name"), h("div",{class:"row"}, nameIn, h("button",{class:"btn sm",onclick:async()=>{ A.profile.name = nameIn.value.trim(); await A.api.db.update(`users/${A.user.uid}`,{ name:A.profile.name }).catch(e=>toast(errText(e),"err")); toast(t("saved")); }}, t("save_btn")))),
    row(t("email"), h("span",{class:"muted"}, A.user.email)),
    row(t("level_label"), h("span",{class:"chip lv"}, "Stage "+(A.profile.level||1))),
    row(t("member_since"), h("span",{class:"muted"}, fmtDate(A.profile.createdAt, lang())))));
  const pendingBanner = h("div");
  if (!A.isAdmin) fetchMyPendingOrder().then(o => { if (o) pendingBanner.replaceChildren(h("div",{class:"banner",style:"margin-top:10px"}, t("order_pending_banner", { s: tierName(o.tier || 2) }))); });
  root.append(h("section",{class:"card"}, h("h2",{style:"margin-bottom:6px"},t("current_plan")),
    h("div",{class:"spread"}, h("div",null, h("b",{style:"font-size:1.3rem"}, A.isAdmin ? t("adm_title") : tierName(A.tier)), a ? h("p",{class:"small muted"}, t("status")+": "+t(accessState(a))+" · "+t("expires")+": "+(a.expiresAt?fmtDate(a.expiresAt, lang()):t("no_expiry"))) : null),
      A.settings.supportContact ? h("span",{class:"small"}, t("contact")+": "+A.settings.supportContact) : null),
    pendingBanner,
    h("div",{class:"grid3",style:"margin-top:14px"}, A.plans.filter(pl=>pl.active!==false).map(pl => h("div",{class:"card stack",style:"gap:8px"+((a&&a.planId===pl.id)?";border-color:var(--jade)":"")},
      h("b",null,tr(pl.name, lang())),
      h("p",{class:"small muted"}, (pl.price||0)+" "+(pl.currency||"")+(pl.durationDays?" · "+pl.durationDays+" "+t("days"):"")),
      h("ul",{class:"obj small"+(lang()==="lo"?" lo":"")}, ((pl.features&&(pl.features[lang()]||pl.features.en))||[]).map(f=>h("li",null,f))),
      (!A.isAdmin && (pl.tier||1) > A.tier) ? h("button",{class:"btn sm primary",onclick:()=>openUpgradeFlow(pl)}, t("upgrade")) : null)))));
  root.append(h("section",{class:"card"},
    row(t("ui_lang"), h("div",{class:"seg"}, [["en","English"],["lo","ລາວ"],["zh","中文"]].map(([l,n]) => h("button",{"aria-pressed":String(lang()===l),onclick:()=>{ setPref("uiLang",l); try{ localStorage.setItem("xuelu.lang",l); }catch(e){} A.render(); }}, n)))),
    row(t("explain_lang"), h("div",{class:"seg"}, [["","Auto"],["en","English"],["lo","ລາວ"],["zh","中文"]].map(([l,n]) => h("button",{"aria-pressed":String((p.explainLang||"")===l),onclick:()=>{ setPref("explainLang",l); A.render(); }}, n))), t("explain_lang_d")),
    row(t("theme"), h("div",{class:"seg"}, [["system","theme_auto"],["day","theme_light"],["night","theme_dark"]].map(([k,l]) => h("button",{"aria-pressed":String(normTheme(p.theme)===k),onclick:()=>{ setPref("theme",k); A.render(); }}, t(l))))),
    row(t("ui_font"), h("select",{class:"input",style:"width:auto;max-width:260px",onchange:e=>{ setPref("font",e.target.value); A.render(); }},
      [["default", t("font_default")], ...FONT_OPTIONS.filter(f=>f.id!=="default"&&f.id!=="custom").map(f=>[f.id,f.label]),
        ...(A.settings.customFontName && A.settings.customFontUrl ? [["custom", A.settings.customFontName]] : [])]
        .map(([v,l])=>h("option",{value:v,selected:(p.font||"default")===v},l)))),
    row(t("show_pinyin"), sw("showPy")), row(t("show_trans"), sw("showTr")), row(t("tone_colors"), sw("toneColor")),
    row(t("speech_rate"), h("input",{type:"range",min:"0.5",max:"1.2",step:"0.05",value:p.rate,"aria-label":t("speech_rate"),onchange:e=>{ setPref("rate",+e.target.value); speak("ຂ້ອຍຮຽນພາສາລາວທຸກມື້."); }})),
    row(t("voice"), vs.length ? h("select",{class:"input",style:"width:auto;max-width:220px",onchange:e=>{ setPref("voice",e.target.value); speak("ສະບາຍດີ, ຍິນດີຕ້ອນຮັບສູ່ LaoLao."); }}, h("option",{value:""},"Auto"), vs.map(v=>h("option",{value:v.name,selected:v.name===p.voice},v.name+" ("+v.lang+")"))) : h("span",{class:"chip warn"},t("voice_none")), vs.length ? null : t("voice_help"))));
  const oldPw = h("input",{class:"input",type:"password",autocomplete:"current-password"}), newPw = h("input",{class:"input",type:"password",autocomplete:"new-password"});
  root.append(h("section",{class:"card stack"}, h("h2",null,t("change_pw")), h("div",{class:"field-row"}, h("div",{class:"field"},h("label",null,t("current_pw")),oldPw), h("div",{class:"field"},h("label",null,t("new_pw")),newPw)),
    h("div",{class:"row"}, h("button",{class:"btn",onclick:async()=>{ try { await A.api.auth.changePassword(oldPw.value, newPw.value); toast(t("pw_changed")); oldPw.value=newPw.value=""; } catch(e){ toast(errText(e),"err"); } }}, t("change_pw")),
      h("button",{class:"btn ghost",onclick:()=>A.api.auth.signOut()}, icon("logout"), t("sign_out")))));

  root.append(h("section",{class:"card stack",style:"background:var(--surface-2);border:1px solid var(--border);margin-top:14px"},
    h("div",{class:"spread",style:"align-items:center;flex-wrap:wrap;gap:10px"},
      h("div",null,
        h("h3",{style:"margin:0;display:flex;align-items:center;gap:6px"}, icon("shield"), lang()==="lo"?"ລະບົບຈັດການເນື້ອຫາຫຼັງບ້ານ":"Content Management Backend (Admin)"),
        h("p",{class:"small muted",style:"margin:4px 0 0 0"}, "Add, edit, duplicate, and delete curriculum lessons, vocabulary, grammar, videos, tones, and dictionary.")
      ),
      h("a",{class:"btn primary sm",href:"admin/",style:"text-decoration:none"}, icon("shield"), "Open Admin CMS →")
    )
  ));
  return root;
};

// ---------- more (mobile) ----------
VIEWS.more = () => h("div",null, pageHead(t("nav_more")), h("div",{class:"stack",style:"gap:10px"},
  [["lessons","nav_lessons","learn"],["videos","nav_videos","video"],["handwriting","nav_handwriting","pen"],["tone_lab","nav_tone_lab","spark"],["pronounce_lab","nav_pronounce","speaker"],["particle_lab","nav_particles","flame"],["kinship_lab","nav_kinship","users"],["classifiers_lab","nav_classifiers","layers"],["culture_lab","nav_culture","globe"],["patterns","nav_patterns","gen"],["gen","gen_title","spark"],["vocab","nav_vocab","dict"],["grammar","nav_grammar","layers"],["dict","nav_dict","dict"],["pinyin","nav_pinyin","pinyin"],["speak","nav_speak","mic"],["saved","nav_saved","bookmark"],["notes","nav_notes","note"],["progress","nav_progress","chart"],["downloads","nav_offline","download"],["account","nav_account","user"]]
    .map(([id,k,ic]) => h("button",{class:"qs",onclick:()=>go(id)}, h("span",{class:"qi",style:"background:var(--surface-2)"},icon(ic)), h("b",null,t(k))))),
  h("a",{class:"qs",href:"admin/",style:"margin-top:10px;text-decoration:none;color:var(--accent);border:1px solid var(--accent)"}, h("span",{class:"qi",style:"background:var(--surface-2);color:var(--accent)"},icon("shield")), h("b",null,lang()==="lo"?"ລະບົບຈັດການເນື້ອຫາ (Admin CMS)":"Admin & Content Management Portal (CMS)")));
