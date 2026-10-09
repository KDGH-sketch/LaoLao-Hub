// Practice Studio: the bank (js/shared/practice-bank.js), the library (practice-library.js) and the coach (practice-coach.js).
//   - 100+ practice sets; every set makes a full round in English, Lao and Chinese, and every question is answerable
//     (the right answer is among the options, options are different and not empty, order tiles rebuild the answer)
//   - the bank: Lao script only where Lao is expected, every sentence word has a romanization, no duplicate words
//   - the coach: estimates follow recent answers, trends, mistakes, ranks, advice, Smart session plans, recommendations
// Run: node scripts/test_practice.mjs
import { THEMES, FN, GRAMMAR, TONE_PAIRS, TONE_RULES } from "../js/shared/practice-bank.js";
import { buildCatalog, makeQuestions, TRACKS, MODES, GROUPS, seeded, pyOfSentence, laoChunks, questionForSkill, speedQuestion, questionForItem, setFeature, BANK_STATS } from "../js/shared/practice-library.js";
import { coachInit, coachAnswer, coachRound, coachTrim, skillProfile, mistakes, insights, planSkills, recommend, rankOf, RANKS, COACH_SKILLS, dayKey, totalStars } from "../js/shared/practice-coach.js";
import { QTYPES } from "../js/shared/quiz.js";

let failed = 0;
const ok = (c, m, d) => { console.log((c ? "  PASS " : "  FAIL ") + m + (!c && d !== undefined ? "  → " + JSON.stringify(d).slice(0, 500) : "")); if (!c) failed++; };
const LAO = /^[຀-໿\s◌,]+$/;
const hasLao = s => /[຀-໿]/.test(s);

console.log("the bank");
const words = THEMES.flatMap(t => t.w);
ok(THEMES.length >= 30 && words.length >= 300, `${THEMES.length} themes, ${words.length} words`, BANK_STATS());
ok(THEMES.every(t => t.w.length >= 10 && t.s.length >= 5 && (t.c || []).length >= 1), "every theme has ≥10 words, ≥5 sentences and a conversation turn");
ok(new Set(THEMES.map(t => t.id)).size === THEMES.length, "theme ids are unique");
const badWord = words.filter(w => w.length !== 4 || !LAO.test(w[0]) || !w[1] || hasLao(w[1]) || !w[2] || hasLao(w[2]) || !w[3] || hasLao(w[3]));
ok(!badWord.length, "every word: Lao script, romanization, English, Chinese", badWord.slice(0, 5));
const dupIn = THEMES.map(t => [t.id, t.w.map(w => w[0]).filter((x, i, a) => a.indexOf(x) !== i)]).filter(([, d]) => d.length);
ok(!dupIn.length, "no word twice in a theme", dupIn);
const sents = THEMES.flatMap(t => t.s.map(s => s[0]).concat((t.c || []).flatMap(c => [c[0], c[3]])));
const noPy = sents.filter(s => !pyOfSentence(s, {}));
ok(!noPy.length, `every sentence word has a romanization (${sents.length} sentences and replies)`, noPy.slice(0, 6).map(s => s.split(" ").filter(z => !pyOfSentence(z, {}))));
ok(THEMES.every(t => t.s.every(s => LAO.test(s[0]) && s[1] && s[2]) && (t.c || []).every(c => c.length === 6 && LAO.test(c[0]) && LAO.test(c[3]))), "sentences and turns are well formed");
ok(GRAMMAR.length >= 8 && GRAMMAR.every(g => g.q.length >= 6 && g.q.every(q => q[0].includes("___") && q[1].length === 3 && new Set(q[1]).size === 3 && q[2] && q[3] && q[4] && q[5])), "8 grammar sets, each ≥6 items with a gap, 3 different options and a rule");
const gTok = GRAMMAR.flatMap(g => g.q.map(q => q[0].replace("___", q[1][0]))).filter(s => !pyOfSentence(s, {}));
ok(!gTok.length, "every grammar sentence word has a romanization", gTok.slice(0, 4));
ok(TONE_PAIRS.every(g => g.length >= 2 && new Set(g.map(x => x[0])).size === g.length) && TONE_RULES.every(r => r[1].length === 3), "tone pairs and tone rules are well formed");
ok(Object.values(FN).every(p => p && !hasLao(p)), "romanization table has no Lao in it");
ok(laoChunks("ເຂົ້າໜຽວ").join("|") === "ເຂົ້າ|ໜຽ|ວ" && laoChunks("ສະບາຍດີ").join("|") === "ສະ|ບາ|ຍ|ດີ" && laoChunks("ໄປ").join("") === "ໄປ", "spelling tiles: a vowel written before joins its letter, marks stay on their letter", [laoChunks("ເຂົ້າໜຽວ"), laoChunks("ສະບາຍດີ")]);

console.log("\nthe library");
const content = {
  patterns: [{ n:1, hz:"ແມ່ນ…ແລ້ວ", level:1, examples:[{ zh:"ແມ່ນແລ້ວ" }] }],
  dialogues: [{ id:"d1", title:{ en:"At the shop" }, level:1, lines:[{ sp:"A", zh:"ສະບາຍດີ", tr:{ en:"Hello" } }, { sp:"B", zh:"ສະບາຍດີ ເຈົ້າ", tr:{ en:"Hello to you" } }, { sp:"A", zh:"ອັນນີ້ເທົ່າໃດ", tr:{ en:"How much is this?" } }] }],
  vocab: Array.from({ length:7 }, (_, i) => ({ hz:["ກິນ","ດື່ມ","ນອນ","ໄປ","ມາ","ຮຽນ","ອ່ານ"][i], level:1, tags:["daily"], tr:{ en:{ meaning:["eat","drink","sleep","go","come","study","read"][i] } } })),
  characters: [{ char:"ກ", handwriting:{ strokes:[[0,0]] } }]
};
const cat = buildCatalog(content), base = buildCatalog();
ok(base.length >= 100, `${base.length} built-in practice sets (≥100)`);
ok(cat.length === base.length + 4, "the teacher's content adds sets: a pattern, a dialogue, a word list, handwriting", cat.filter(x => !base.some(y => y.id === x.id)).map(x => x.id));
ok(new Set(cat.map(x => x.id)).size === cat.length, "set ids are unique");
ok(TRACKS.every(tk => cat.some(x => x.track === tk.key)), "every track has sets: " + TRACKS.map(tk => tk.key + " " + cat.filter(x => x.track === tk.key).length).join(", "));
ok(cat.every(x => MODES[x.mode] && x.title && x.title.en && x.title.lo && x.title.zh && x.glyph && x.stage >= 1), "every set has a mode, a title in 3 languages, art and a stage");
ok(GROUPS.flatMap(g => g.themes).sort().join() === THEMES.map(t => t.id).sort().join(), "every theme is in exactly one conversation group");
ok(cat.filter(x => !x.adv).length >= 60, `${cat.filter(x => !x.adv).length} sets are Basic practice (Free plan), ${cat.filter(x => x.adv).length} Advanced`);
ok(setFeature("th:food:words") === "practice.basic" && setFeature("gr:eat:talk") === "practice.advanced" && setFeature("gm:neg") === "practice.advanced" && setFeature("tn:pairs") === "practice.basic" && setFeature("tn:rules") === "practice.advanced",
  "plan feature of a set: basic vs advanced");

const env0 = { dict:{}, content, patternQuestions:(n, k) => Array.from({ length:k }, () => ({ type:"mc", skill:"grammar", prompt:{ zh:"x" }, options:["a","b"], answer:0 })) };
function checkQ(q){
  const e = [];
  if (!QTYPES.includes(q.type)) e.push("type " + q.type);
  if (["mc","fill","listen_select","reply"].includes(q.type)){
    if (!Array.isArray(q.options) || q.options.length < 2) e.push("options");
    else { const s = q.options.map(o => typeof o === "string" ? o : JSON.stringify(o)); if (s.some(x => !x || !String(x).trim())) e.push("empty option"); if (new Set(s).size !== s.length) e.push("same option twice: " + s.join(" / "));
      if (!(q.answer >= 0 && q.answer < q.options.length)) e.push("answer index"); }
  }
  if (q.type === "fill" && !/___/.test(q.prompt.zh)) e.push("no gap");
  if (q.type === "order"){ const got = q.tokens.map(t => t.z).join(""); if (got.replace(/\s/g, "") !== String(q.answer).replace(/\s/g, "")) e.push("tiles ≠ answer"); if (q.tokens.length < 2) e.push("tiles"); }
  if (q.type === "match" && (!q.pairs || q.pairs.length < 3 || new Set(q.pairs.map(p => p.b)).size !== q.pairs.length)) e.push("pairs");
  if (q.type === "tf" && (typeof q.answer !== "boolean" || !q.claim || !q.prompt.zh)) e.push("tf");
  if (q.type === "reply" && (!q.context || !q.context[0].text)) e.push("context");
  if (q.type === "tone" && !(q.answer >= 1 && q.answer <= 6)) e.push("tone");
  if (q.type === "speak" && !q.prompt.zh) e.push("speak");
  if (!q.skill || !COACH_SKILLS.includes(q.skill)) e.push("skill " + q.skill);
  if (q.prompt && q.prompt.tr && !Object.values(q.prompt.tr).some(Boolean)) e.push("empty translation");
  return e;
}
let rounds = 0, qn = 0; const problems = [];
for (const L of ["en", "lo", "zh"]) for (const set of cat) for (let k = 0; k < 3; k++){
  const qs = makeQuestions(set, Object.assign({ L, rand:seeded(set.id + L + k) }, env0)); rounds++;
  if (qs.length < Math.min(set.n, 6)) problems.push(`${L} ${set.id}: only ${qs.length} questions`);
  for (const q of qs){ qn++; const e = checkQ(q); if (e.length) problems.push(`${L} ${set.id}: ${e.join(", ")}`); }
}
ok(!problems.length, `${rounds} rounds, ${qn} questions: all complete and answerable`, problems.slice(0, 8));
const fq = makeQuestions({ id:"th:food:words" }, { L:"zh", rand:seeded("x") });
ok(fq.some(q => q.type === "mc" && q.options.includes("米粉汤") || q.options && q.options.includes("ເຝີ")), "Chinese learners see Chinese meanings");
const enq = makeQuestions({ id:"th:food:words" }, { L:"lo", rand:seeded("x") }).find(q => q.ask && q.ask.en === "What does it mean?");
ok(enq && enq.options.every(o => !hasLao(o)), "Lao-speaking learners get the English meaning (the Lao one would repeat the word)");
const types = new Set(cat.flatMap(set => makeQuestions(set, Object.assign({ L:"en", rand:seeded(set.id) }, env0)).map(q => q.type)));
ok(["mc","fill","order","match","listen_select","tf","reply","speak","tone","write_char"].every(t => types.has(t)), "11 question formats are used across the library: " + [...types].join(", "));
const d1 = makeQuestions({ id:"dl:d1" }, Object.assign({ L:"en", rand:seeded(1) }, env0));
ok(d1.length === 2 && d1[0].context[0].text === "ສະບາຍດີ" && d1[0].options[0] === "ສະບາຍດີ ເຈົ້າ", "a teacher's dialogue becomes 'what comes next' replies", d1[0]);
const daily1 = makeQuestions({ id:"th:food:use" }, { L:"en", rand:seeded("2026-10-09") }), daily2 = makeQuestions({ id:"th:food:use" }, { L:"en", rand:seeded("2026-10-09") });
ok(JSON.stringify(daily1) === JSON.stringify(daily2), "the same seed gives the same round (Daily challenge is the same for everyone that day)");
const bySkill = COACH_SKILLS.map(sk => { const q = questionForSkill(sk, { L:"en", rand:seeded(sk) }, 2); return [sk, q && checkQ(q).length === 0 ? q.skill : "BAD"]; });
ok(bySkill.every(([sk, got]) => got !== "BAD"), "a question for every skill (Smart session)", bySkill);
ok(Array.from({ length:30 }, (_, i) => speedQuestion({ L:"en", rand:seeded("s" + i) }, 1)).every(q => checkQ(q).length === 0 && ["tf","mc"].includes(q.type)), "Speed round questions are one-tap");
const iq = questionForItem({ k:"ໝາ", en:"dog", zh:"狗" }, { L:"en", rand:seeded(3) });
ok(iq && checkQ(iq).length === 0 && (iq.options || []).some(o => o === "ໝາ" || o === "dog"), "a remembered mistake becomes a question again", iq);

console.log("\nthe coach");
const now = new Date("2026-10-09T10:00:00").getTime(), D = 864e5;
let s = coachInit({}, { listening:{ r:3, t:10 }, vocabulary:{ r:40, t:40 } });
let p = skillProfile(s, now);
ok(p.find(x => x.skill === "vocabulary").score > p.find(x => x.skill === "listening").score && p.find(x => x.skill === "grammar").score === null, "starts from the old counters; untried skills have no score yet");
s = coachInit({});
for (let i = 0; i < 20; i++) coachAnswer(s, { skill:"listening", correct:false, now:now - 10 * D });
for (let i = 0; i < 20; i++) coachAnswer(s, { skill:"listening", correct:true, now });
p = skillProfile(s, now).find(x => x.skill === "listening");
ok(p.score >= 60 && p.n === 40, `recent answers count more: 20 wrong then 20 right → ${p.score} (plain accuracy would say 50)`);
ok(p.trend === null || p.trend > 0, "trend needs answers in both weeks");
s = coachInit({});
for (let d = 13; d >= 7; d--) for (let i = 0; i < 3; i++) coachAnswer(s, { skill:"reading", correct:i === 0, now:now - d * D });
for (let d = 6; d >= 0; d--) for (let i = 0; i < 3; i++) coachAnswer(s, { skill:"reading", correct:i < 3, now:now - d * D });
p = skillProfile(s, now).find(x => x.skill === "reading");
ok(p.trend >= 60, `week on week: 33% → 100% = +${p.trend} points`);
ok(insights(s, now).some(i => i.kind === "up" && i.skill === "reading"), "advice: 'reading is going up'", insights(s, now));
s = coachInit({});
ok(insights(s, now)[0].kind === "start", "advice for a new learner: start with a Smart session");
for (let i = 0; i < 12; i++) coachAnswer(s, { skill:"vocabulary", correct:true, ms:2000, now });
for (let i = 0; i < 12; i++) coachAnswer(s, { skill:"listening", correct:i % 3 === 0, ms:9000, now, item:{ k:i % 2 ? "ໝາ" : "ມ້າ", en:i % 2 ? "dog" : "horse" } });
const adv = insights(s, now);
ok(adv[0].kind === "focus" && adv[0].skill === "listening", "advice: focus on the weakest skill first", adv);
ok(adv.some(i => i.kind === "strong" && i.skill === "vocabulary") && adv.some(i => i.kind === "slow" && i.skill === "listening") && adv.some(i => i.kind === "mistakes"), "advice: strongest skill, slow answers, repeated mistakes", adv.map(i => i.kind));
ok(mistakes(s).length === 2 && mistakes(s)[0].w >= 3, "mistakes: the words that keep going wrong", mistakes(s));
coachAnswer(s, { skill:"listening", correct:true, now, item:{ k:"ໝາ" } }); coachAnswer(s, { skill:"listening", correct:true, now, item:{ k:"ໝາ" } });
ok(mistakes(s).length === 1 && mistakes(s)[0].k === "ມ້າ", "right twice in a row → off the mistakes list");
const plan = planSkills(s, 10, seeded("p"), now);
const cnt = k => plan.filter(x => x === k).length;
ok(plan.length === 10 && new Set(plan).size >= 3 && cnt("listening") > cnt("vocabulary"), "Smart session: weak skills get more questions, at least 3 different skills", plan);
coachRound(s, { setId:"th:food:words", right:9, total:10, stars:3, now }); coachRound(s, { setId:"th:food:words", right:5, total:10, stars:1, now });
ok(s.sets["th:food:words"].b === 90 && s.sets["th:food:words"].s === 3 && s.sets["th:food:words"].p === 2, "a set keeps its best score, best stars and plays");
const trackSkill = Object.fromEntries(TRACKS.map(t => [t.key, t.skill]));
const rec = recommend(s, base, { stage:1, now, trackSkill });
ok(rec.length === 3 && rec[0].track === "listen" && new Set(rec.map(r => r.track)).size === 3 && !rec.some(r => r.id === "th:food:words"), "recommendations: the weakest skill's track first, three different tracks, not the set just mastered", rec.map(r => r.id));
ok(recommend(s, base, { stage:1, now, trackSkill, can:x => !x.adv }).every(x => !x.adv), "recommendations respect the plan");
ok(rankOf(0).key === "starter" && rankOf(20).key === "achiever" && rankOf(300).key === "legend" && rankOf(30).pct === 40 && rankOf(30).need === 15, "Practice Master ranks by stars", rankOf(30));
ok(RANKS.length === 8 && totalStars(s) === 3, "8 ranks; stars add up across sets");
for (let i = 0; i < 400; i++) coachAnswer(s, { skill:"reading", correct:true, now, item:{ k:"w" + i, en:"x" } });
s.d["2020-01-01"] = { reading:[1, 1] }; coachTrim(s, now);
ok(Object.keys(s.it).length === 300 && !s.d["2020-01-01"], "the record stays small (300 items, 120 days)");
ok(dayKey(new Date("2026-10-09T23:30:00").getTime()) === "2026-10-09", "days are the learner's local days");

console.log(failed ? `\n${failed} practice checks FAILED` : "\nAll practice checks passed");
process.exit(failed ? 1 : 0);
