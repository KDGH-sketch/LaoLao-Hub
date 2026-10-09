// The Practice Studio library: every practice set (built-in bank + the teacher's content) and the questions each one
// makes for the quiz engine (js/shared/quiz.js). Pure functions, no DOM (tests: scripts/test_practice.mjs).
//
// A practice set: { id, track, mode, stage, glyph, title:{en,lo,zh}, n, adv, src }
//   track  vocab | listen | speak | read | write | grammar | tones | script | talk  (the library's filter chips)
//   adv    true = "Advanced practice" in the plan (practice.advanced), false = "Basic practice" (practice.basic)
// makeQuestions(set, env) → questions; env = { L, dict, rand, content:{ patterns, dialogues, vocab, characters }, patternQuestions }
import { THEMES, FN, GRAMMAR, TONE_PAIRS, TONE_RULES } from "./practice-bank.js";
import { CONSONANTS, VOWELS, NUMERALS, TONE_MARKS, SIGNS } from "./lao-script.js";

const L3 = (en, lo, zh) => ({ en, lo, zh });
export const TRACKS = [
  { key:"vocab",   skill:"vocabulary", icon:"cards",      t:L3("Vocabulary","ຄຳສັບ","词汇") },
  { key:"listen",  skill:"listening",  icon:"headphones", t:L3("Listening","ການຟັງ","听力") },
  { key:"speak",   skill:"speaking",   icon:"mic",        t:L3("Speaking","ການເວົ້າ","口语") },
  { key:"read",    skill:"reading",    icon:"book",       t:L3("Reading","ການອ່ານ","阅读") },
  { key:"write",   skill:"writing",    icon:"pen",        t:L3("Spelling & writing","ການສະກົດ ແລະ ຂຽນ","拼写与书写") },
  { key:"grammar", skill:"grammar",    icon:"structure",  t:L3("Grammar","ໄວຍາກອນ","语法") },
  { key:"tones",   skill:"pinyin",     icon:"sound",      t:L3("Tones & sounds","ວັນນະຍຸດ ແລະ ສຽງ","声调与发音") },
  { key:"script",  skill:"characters", icon:"chars",      t:L3("Lao script","ຕົວອັກສອນລາວ","老挝文字") },
  { key:"talk",    skill:"speaking",   icon:"users",      t:L3("Real conversations","ສົນທະນາຕົວຈິງ","真实对话") }
];
export const MODES = {
  words:  L3("Learn the words","ຮຽນຄຳສັບ","学单词"),
  listen: L3("Listen & pick","ຟັງ ແລ້ວເລືອກ","听后选择"),
  use:    L3("Use them in sentences","ໃຊ້ໃນປະໂຫຍກ","用在句子里"),
  talk:   L3("Reply in a conversation","ຕອບໃນການສົນທະນາ","在对话中回答"),
  say:    L3("Say it out loud","ເວົ້າອອກສຽງ","大声说出来"),
  spell:  L3("Spell & build","ສະກົດ ແລະ ສ້າງຄຳ","拼写与组词"),
  grammar:L3("Grammar drill","ຝຶກໄວຍາກອນ","语法练习"),
  pairs:  L3("Hear the difference","ຟັງຄວາມແຕກຕ່າງ","听辨差别"),
  rules:  L3("Tone rules","ກົດວັນນະຍຸດ","声调规则"),
  hear:   L3("Hear the tone","ຟັງວັນນະຍຸດ","听声调"),
  class:  L3("Consonant classes","ໝວດພະຍັນຊະນະ","辅音类别"),
  vowels: L3("Vowels","ສະຫຼະ","元音"),
  digits: L3("Lao numerals","ຕົວເລກລາວ","老挝数字"),
  marks:  L3("Tone marks & signs","ໄມ້ວັນນະຍຸດ ແລະ ເຄື່ອງໝາຍ","声调符号"),
  write:  L3("Write the letters","ຂຽນຕົວອັກສອນ","书写字母"),
  pattern:L3("Pattern drill","ຝຶກໂຄງສ້າງ","句型练习"),
  dialogue:L3("Dialogue practice","ຝຶກບົດສົນທະນາ","对话练习"),
  teacher:L3("Teacher's word list","ຄຳສັບຈາກຄູ","老师的词表")
};
// conversation groups: the talk, speaking and spelling sets each bring several themes together
export const GROUPS = [
  { id:"meet", stage:1, glyph:"ສະບາຍດີ", t:L3("Meeting people","ພົບປະຜູ້ຄົນ","结识他人"), themes:["greet","people","family","num10"] },
  { id:"eat",  stage:1, glyph:"ແຊບ",     t:L3("Eating & drinking","ກິນ ແລະ ດື່ມ","吃喝"), themes:["food","drinks","fruit","restaurant"] },
  { id:"buy",  stage:2, glyph:"ກີບ",     t:L3("Shopping","ຊື້ເຄື່ອງ","购物"), themes:["shop","bignum","clothes","colors"] },
  { id:"go",   stage:2, glyph:"ທາງ",     t:L3("Getting around","ໄປມາ","出行"), themes:["places","directions","transport","travel"] },
  { id:"day",  stage:2, glyph:"ວັນ",     t:L3("Daily life","ຊີວິດປະຈຳວັນ","日常生活"), themes:["days","time","weather","verbs","months"] },
  { id:"feel", stage:2, glyph:"ໃຈ",      t:L3("Feelings & health","ຄວາມຮູ້ສຶກ ແລະ ສຸຂະພາບ","感受与健康"), themes:["feelings","health","body"] },
  { id:"home", stage:2, glyph:"ເຮືອນ",   t:L3("Home, school & work","ເຮືອນ ໂຮງຮຽນ ແລະ ວຽກ","家、学校与工作"), themes:["house","school","jobs"] },
  { id:"chat", stage:2, glyph:"ຫຍັງ",    t:L3("Small talk","ລົມກັນ","闲聊"), themes:["qwords","adj","animals","nature","phrases"] }
];
const THEME = Object.fromEntries(THEMES.map(x => [x.id, x]));
const GROUP = Object.fromEntries(GROUPS.map(x => [x.id, x]));
const GRAM = Object.fromEntries(GRAMMAR.map(x => [x.id, x]));
const ADV_MODES = new Set(["talk","say","spell","grammar","pattern","dialogue","rules","hear","write","marks"]);

// ---------- the catalog ----------
export function buildCatalog(content = {}){
  const out = [];
  const add = s => out.push(Object.assign({ adv: ADV_MODES.has(s.mode), n: 10 }, s));
  for (const th of THEMES){
    const t = L3(...th.t);
    add({ id:`th:${th.id}:words`,  track:"vocab",  mode:"words",  stage:th.stage, glyph:th.glyph, title:t, src:th.id });
    add({ id:`th:${th.id}:listen`, track:"listen", mode:"listen", stage:th.stage, glyph:th.glyph, title:t, src:th.id });
    add({ id:`th:${th.id}:use`,    track:"read",   mode:"use",    stage:th.stage, glyph:th.glyph, title:t, src:th.id });
  }
  for (const g of GROUPS){
    add({ id:`gr:${g.id}:talk`,  track:"talk",  mode:"talk",  stage:g.stage, glyph:g.glyph, title:g.t, src:g.id, n:8 });
    add({ id:`gr:${g.id}:say`,   track:"speak", mode:"say",   stage:g.stage, glyph:g.glyph, title:g.t, src:g.id, n:8 });
    add({ id:`gr:${g.id}:spell`, track:"write", mode:"spell", stage:g.stage, glyph:g.glyph, title:g.t, src:g.id, n:10 });
  }
  for (const g of GRAMMAR) add({ id:`gm:${g.id}`, track:"grammar", mode:"grammar", stage:g.stage, glyph:g.glyph, title:L3(...g.t), src:g.id, n:g.q.length });
  add({ id:"tn:pairs", track:"tones", mode:"pairs", stage:1, glyph:"ໝາ ມ້າ", title:L3("Words that sound alike","ຄຳທີ່ສຽງຄ້າຍກັນ","发音相近的词") });
  add({ id:"tn:rules", track:"tones", mode:"rules", stage:2, glyph:"່ ້", title:L3("How tones work","ວັນນະຍຸດເຮັດວຽກແນວໃດ","声调怎样运作"), n:10 });
  add({ id:"tn:hear",  track:"tones", mode:"hear",  stage:2, glyph:"ກ່າ", title:L3("Which tone is it?","ແມ່ນວັນນະຍຸດໃດ?","是哪个声调？") });
  for (const c of ["middle","high","low"]) add({ id:`sc:class:${c}`, track:"script", mode:"class", stage:1, glyph:{ middle:"ກ", high:"ຂ", low:"ຄ" }[c],
    title:{ middle:L3("Middle-class consonants","ອັກສອນກາງ","中辅音"), high:L3("High-class consonants","ອັກສອນສູງ","高辅音"), low:L3("Low-class consonants","ອັກສອນຕ່ຳ","低辅音") }[c], src:c });
  add({ id:"sc:class:all", track:"script", mode:"class",  stage:2, glyph:"ກຂຄ", title:L3("Sort all consonants","ຈັດໝວດພະຍັນຊະນະທັງໝົດ","给所有辅音分类"), src:"all" });
  add({ id:"sc:vowels:pos",   track:"script", mode:"vowels", stage:1, glyph:"ເ◌", title:L3("Where vowels are written","ຕຳແໜ່ງຂອງສະຫຼະ","元音的位置"), src:"pos" });
  add({ id:"sc:vowels:sound", track:"script", mode:"vowels", stage:2, glyph:"◌າ", title:L3("Vowel sounds","ສຽງສະຫຼະ","元音的读音"), src:"sound" });
  add({ id:"sc:digits", track:"script", mode:"digits", stage:1, glyph:"໑໒໓", title:L3("Lao numerals ໐–໙","ຕົວເລກລາວ ໐–໙","老挝数字 ໐–໙") });
  add({ id:"sc:marks",  track:"script", mode:"marks",  stage:2, glyph:"◌່ ◌້", title:L3("Tone marks & signs","ໄມ້ວັນນະຍຸດ ແລະ ເຄື່ອງໝາຍ","声调符号与标记"), n:8 });
  const writable = (content.characters || []).filter(c => c && c.char && c.handwriting && (c.handwriting.strokes || []).length).length;
  if (writable) add({ id:"sc:write", track:"script", mode:"write", stage:1, glyph:"ກຂ", title:L3("Write the letters","ຂຽນຕົວອັກສອນ","书写字母"), n:Math.min(6, writable) });
  // the teacher's content
  for (const p of (content.patterns || []).filter(p => p && p.n && p.hz && ((p.examples || []).some(e => e && e.zh) || (p.gen || []).length)).sort((a, b) => a.n - b.n))
    add({ id:`pt:${p.n}`, track:"grammar", mode:"pattern", stage:p.level || 1, glyph:p.hz, title:L3(`#${p.n} ${p.hz}`, `#${p.n} ${p.hz}`, `#${p.n} ${p.hz}`), src:p.n, n:8 });
  for (const d of (content.dialogues || []).filter(d => d && d.id && (d.lines || []).filter(l => l && l.zh).length >= 3))
    add({ id:`dl:${d.id}`, track:"talk", mode:"dialogue", stage:d.level || 1, glyph:laoChunks(d.lines.find(l => l && l.zh).zh).slice(0, 3).join(""), title:titleOf(d.title), src:d.id, n:Math.min(8, d.lines.length - 1) });
  const tags = {};
  for (const v of (content.vocab || [])) if (v && v.hz && meaningEn(v)) for (const tg of (v.tags || [])) if (tg && !["core"].includes(tg)) (tags[tg] = tags[tg] || []).push(v);
  for (const [tg, list] of Object.entries(tags)) if (list.length >= 6)
    add({ id:`vt:${tg}`, track:"vocab", mode:"teacher", stage:Math.min(...list.map(v => v.level || 1)), glyph:list[0].hz, title:L3(cap(tg), cap(tg), cap(tg)), src:tg, adv:false });
  return out;
}
const cap = s => String(s).charAt(0).toUpperCase() + String(s).slice(1);
const titleOf = t => typeof t === "string" ? L3(t, t, t) : L3(t && (t.en || t.lo) || "Dialogue", t && (t.lo || t.en) || "Dialogue", t && (t.zh || t.en) || "Dialogue");
const meaningEn = v => v && v.tr && v.tr.en && (v.tr.en.meaning || (typeof v.tr.en === "string" ? v.tr.en : "")) || v.en || "";
export const PRACTICE_COUNT = () => buildCatalog().length;
// the plan feature a set needs (the router guard and the lock badges)
export const setFeature = id => { const m = String(id || "").split(":"); const mode = m[0] === "th" ? m[2] : m[0] === "gr" ? m[2] : { gm:"grammar", tn:m[1], sc:m[1], pt:"pattern", dl:"dialogue", vt:"teacher" }[m[0]];
  return ADV_MODES.has(mode) || (m[0] === "tn" && ADV_MODES.has(m[1])) ? "practice.advanced" : "practice.basic"; };

// ---------- helpers ----------
export function seeded(seed){ let a = 0; for (const c of String(seed)) a = (a * 31 + c.charCodeAt(0)) >>> 0;
  return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ t >>> 15, t | 1); t ^= t + Math.imul(t ^ t >>> 7, t | 61); return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
const R = env => env.rand || Math.random;
const shuf = (a, env) => { const r = R(env); a = a.slice(); for (let i = a.length - 1; i > 0; i--){ const j = Math.floor(r() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const pick = (a, env) => a[Math.floor(R(env)() * a.length)];
const others = (pool, not, n, env, key = x => x) => { const seen = new Set([key(not)]); const out = [];
  for (const x of shuf(pool, env)){ const k = key(x); if (!k || seen.has(k)) continue; seen.add(k); out.push(x); if (out.length >= n) break; } return out; };
// words are joined without spaces (Lao writes none between words); a comma after a word keeps a pause: "ມີ, ຂ້ອຍ…"
const joinLao = s => String(s).split(" ").join("").replace(/,/g, ", ");
const W = w => ({ lo:w[0], py:w[1], en:w[2], zh:w[3] });
// meaning in the explanation language (Lao learners read the English: the Lao meaning would just repeat the word)
export const meanIn = (o, L) => (L === "zh" && o.zh) ? o.zh : (o.en || o.zh || "");
const ask = (en, lo, zh) => L3(en, lo, zh);
const ASK = {
  mean:   ask("What does it mean?","ໝາຍຄວາມວ່າແນວໃດ?","是什么意思？"),
  pick:   ask("Which Lao word is it?","ແມ່ນຄຳລາວຄຳໃດ?","是哪个老挝语词？"),
  match:  ask("Match the Lao words with their meanings","ຈັບຄູ່ຄຳລາວກັບຄວາມໝາຍ","把老挝语词和意思配对"),
  tf:     ask("True or false?","ຖືກ ຫຼື ຜິດ?","对还是错？"),
  hearTf: ask("Listen. Does it mean this?","ຟັງ. ໝາຍຄວາມວ່າແນວນີ້ບໍ?","听一听，是这个意思吗？"),
  hear:   ask("Listen and pick what you hear","ຟັງ ແລ້ວເລືອກສິ່ງທີ່ໄດ້ຍິນ","听后选出你听到的"),
  order:  ask("Put the words in order","ລຽງຄຳໃຫ້ຖືກ","把词语排好顺序"),
  fill:   ask("Fill the gap","ຕື່ມຄຳໃສ່ບ່ອນຫວ່າງ","填空"),
  sentMean: ask("What does this sentence mean?","ປະໂຫຍກນີ້ໝາຍຄວາມວ່າແນວໃດ?","这句话是什么意思？"),
  sentLao:  ask("How do you say it in Lao?","ເວົ້າເປັນພາສາລາວແນວໃດ?","用老挝语怎么说？"),
  reply:  ask("What's the best reply?","ຕອບແນວໃດດີທີ່ສຸດ?","最好的回答是哪个？"),
  replyHear: ask("Listen, then pick your reply","ຟັງ ແລ້ວເລືອກຄຳຕອບ","听后选择你的回答"),
  say:    ask("Say it out loud","ເວົ້າອອກສຽງ","大声说出来"),
  spell:  ask("Build the word","ປະກອບຄຳ","拼出这个词"),
  cls:    ask("Which class is this consonant?","ພະຍັນຊະນະນີ້ຢູ່ໝວດໃດ?","这个辅音属于哪一类？"),
  keyword:ask("Which word starts with this letter?","ຄຳໃດຂຶ້ນຕົ້ນດ້ວຍຕົວນີ້?","哪个词以这个字母开头？"),
  first:  ask("Listen: which letter does it start with?","ຟັງ: ຂຶ້ນຕົ້ນດ້ວຍຕົວໃດ?","听：以哪个字母开头？"),
  vpos:   ask("Where is this vowel written?","ສະຫຼະນີ້ຂຽນຢູ່ໃສ?","这个元音写在哪里？"),
  vsound: ask("How does this vowel sound?","ສະຫຼະນີ້ອອກສຽງແນວໃດ?","这个元音怎么读？"),
  digit:  ask("Which number is this?","ນີ້ແມ່ນເລກຫຍັງ?","这是数字几？"),
  digitR: ask("Which Lao numeral is it?","ແມ່ນຕົວເລກລາວຕົວໃດ?","是哪个老挝数字？"),
  mark:   ask("What is this mark called?","ເຄື່ອງໝາຍນີ້ຊື່ຫຍັງ?","这个符号叫什么？")
};
const CLS = { middle:L3("middle class","ອັກສອນກາງ","中辅音"), high:L3("high class","ອັກສອນສູງ","高辅音"), low:L3("low class","ອັກສອນຕ່ຳ","低辅音") };
const VPOS = { after:L3("after the consonant","ຫຼັງພະຍັນຊະນະ","辅音后面"), above:L3("above the consonant","ເທິງພະຍັນຊະນະ","辅音上面"), below:L3("below the consonant","ລຸ່ມພະຍັນຊະນະ","辅音下面"),
  before:L3("before the consonant","ໜ້າພະຍັນຊະນະ","辅音前面"), around:L3("around the consonant (two parts)","ອ້ອມພະຍັນຊະນະ (ສອງສ່ວນ)","辅音周围（两部分）") };

// every theme word (the romanization of sentence words comes from here, FN and the teacher's dictionary)
const ALL_WORDS = THEMES.flatMap(th => th.w.map(W));
const PY = Object.assign({}, FN, Object.fromEntries(ALL_WORDS.map(w => [w.lo, w.py])));
const dictPy = (dict, z) => { const d = dict && dict[z]; if (!d) return ""; return Array.isArray(d) ? d[0] : (d.p || ""); };
export const pyOfToken = (z, dict) => { const p = String(z).match(/^(.*?)([,.?!]*)$/), w = p[1]; const r = dictPy(dict, w) || PY[w] || ""; return r && r + p[2]; };
export function pyOfSentence(s, dict){ const toks = String(s).split(" "); const ps = toks.map(z => pyOfToken(z, dict)); return ps.every(Boolean) ? ps.join(" ") : ""; }
const sentence = (row, dict) => ({ toks: row[0].split(" "), lo: joinLao(row[0]), py: pyOfSentence(row[0], dict), en: row[1], zh: row[2] });
const allSentences = THEMES.flatMap(th => th.s.map(r => ({ row:r, th:th.id })));
const allReplies = THEMES.flatMap(th => (th.c || []).map(c => joinLao(c[3])));
const itemOf = w => ({ k: w.lo, py: w.py || "", en: w.en || "", zh: w.zh || "" });

// a word with the teacher's romanization when the dictionary has it
const wordFrom = (w, dict) => Object.assign({}, w, { py: dictPy(dict, w.lo) || w.py || "" });

// ---------- question makers ----------
function qMean(w, pool, env){ const d = others(pool, w, 3, env, x => meanIn(x, env.L));
  return { type:"mc", skill:"vocabulary", ask:ASK.mean, prompt:{ zh:w.lo, py:w.py }, options:[meanIn(w, env.L), ...d.map(x => meanIn(x, env.L))], answer:0, item:itemOf(w), say:w.lo }; }
function qPick(w, pool, env){ const d = others(pool, w, 3, env, x => x.lo);
  return { type:"mc", skill:"reading", ask:ASK.pick, prompt:{ tr:{ en:meanIn(w, env.L) } }, options:[w.lo, ...d.map(x => x.lo)], answer:0, item:itemOf(w), say:w.lo }; }
function qHear(w, pool, env){ const d = others(pool, w, 3, env, x => x.lo);
  return { type:"listen_select", skill:"listening", ask:ASK.hear, prompt:{ zh:w.lo }, options:[w.lo, ...d.map(x => x.lo)], answer:0, item:itemOf(w),
    explain:{ en:`${w.lo} = ${meanIn(w, "en")}`, lo:`${w.lo} = ${meanIn(w, "en")}`, zh:`${w.lo} = ${meanIn(w, "zh")}` } }; }
function qTf(w, pool, env, audio){ const yes = R(env)() < 0.5; const o = others(pool, w, 1, env, x => meanIn(x, env.L))[0];
  const claim = yes || !o ? meanIn(w, env.L) : meanIn(o, env.L);
  return { type:"tf", skill:audio ? "listening" : "vocabulary", ask:audio ? ASK.hearTf : ASK.tf, prompt:{ zh:w.lo, py:audio ? "" : w.py }, audio:!!audio, claim, answer: yes || !o, item:itemOf(w),
    explain:{ en:`${w.lo} = ${meanIn(w, "en")}`, lo:`${w.lo} = ${meanIn(w, "en")}`, zh:`${w.lo} = ${meanIn(w, "zh")}` } }; }
function qMatch(ws, env){ return { type:"match", skill:"vocabulary", ask:ASK.match, pairs: ws.slice(0, 4).map(w => ({ a:w.lo, b:meanIn(w, env.L) })) }; }
// (the romanization would give the order away: it is shown after the answer)
function qOrder(s){ return { type:"order", skill:"sentence", ask:ASK.order, tokens:s.toks.map(z => ({ z, p:pyOfToken(z, {}) })), answer:s.lo, prompt:{ tr:{ en:s.en, lo:s.en, zh:s.zh } }, say:s.lo,
  explain: s.py ? { en:s.py, lo:s.py, zh:s.py } : null, item:{ k:s.lo, py:s.py, en:s.en, zh:s.zh } }; }
function qSentMean(s, pool, env){ const d = others(pool, s, 3, env, x => meanIn(x, env.L));
  return { type:"mc", skill:"reading", ask:ASK.sentMean, prompt:{ zh:s.lo, py:s.py }, options:[meanIn(s, env.L), ...d.map(x => meanIn(x, env.L))], answer:0, say:s.lo, item:{ k:s.lo, py:s.py, en:s.en, zh:s.zh } }; }
function qSentLao(s, pool, env){ const d = others(pool, s, 3, env, x => x.lo);
  return { type:"mc", skill:"writing", ask:ASK.sentLao, prompt:{ tr:{ en:meanIn(s, env.L) } }, options:[s.lo, ...d.map(x => x.lo)], answer:0, say:s.lo, item:{ k:s.lo, py:s.py, en:s.en, zh:s.zh } }; }
function qFill(s, words, env){ const set = new Set(words.map(w => w.lo)); const idx = s.toks.map((z, i) => set.has(z) ? i : -1).filter(i => i >= 0); if (!idx.length) return null;
  const i = pick(idx, env), right = s.toks[i]; const d = others(words.filter(w => !s.toks.includes(w.lo)), { lo:right }, 2, env, x => x.lo); if (d.length < 2) return null;
  return { type:"fill", skill:"grammar", ask:ASK.fill, prompt:{ zh:s.toks.map((z, k) => k === i ? "___" : z).join(""), tr:{ en:meanIn(s, env.L) } }, options:[right, ...d.map(x => x.lo)], answer:0, say:s.lo,
    item:{ k:s.lo, py:s.py, en:s.en, zh:s.zh } }; }
function qSay(text, py, m, env){ return { type:"speak", skill:"speaking", ask:ASK.say, prompt:{ zh:text, py, tr:{ en:m } } }; }
function qReply(c, env, audio){ const line = joinLao(c[0]), rep = joinLao(c[3]); const d = others(allReplies, rep, 2, env);
  return { type:"reply", skill:"speaking", ask:audio ? ASK.replyHear : ASK.reply, audio:!!audio, context:[{ text:line, py:pyOfSentence(c[0], env.dict), tr:meanIn({ en:c[1], zh:c[2] }, env.L) }],
    options:[rep, ...d], answer:0, after:meanIn({ en:c[4], zh:c[5] }, env.L), say:rep, item:{ k:rep, py:pyOfSentence(c[3], env.dict), en:c[4], zh:c[5] } }; }
// Lao letters in writing order with their marks attached; a vowel written before (ເ ແ ໂ ໃ ໄ) joins the letter after it
export function laoChunks(word){
  const out = []; let lead = "";
  for (const ch of String(word)){
    const c = ch.codePointAt(0);
    if (c >= 0x0EC0 && c <= 0x0EC4){ lead += ch; continue; }
    const mark = (c === 0x0EB1) || (c >= 0x0EB4 && c <= 0x0EBD) || (c >= 0x0EC8 && c <= 0x0ECD);
    const after = c === 0x0EB0 || c === 0x0EB2 || c === 0x0EB3;
    if ((mark || after) && out.length && !lead){ out[out.length - 1] += ch; continue; }
    out.push(lead + ch); lead = "";
  }
  if (lead) out.push(lead);
  return out;
}
function qSpell(w, env){ const parts = laoChunks(w.lo); if (parts.length < 2 || parts.length > 7) return null;
  return { type:"order", skill:"writing", ask:ASK.spell, tokens:parts.map(z => ({ z, p:"" })), answer:w.lo, prompt:{ tr:{ en:meanIn(w, env.L) }, py:w.py }, say:w.lo, item:itemOf(w) }; }

// a round from a list of makers: keeps the order, skips makers that could not make a question
const fill = (makers, n) => { const qs = []; for (const m of makers){ if (qs.length >= n) break; try { const q = m(); if (q) qs.push(q); } catch(e){} } return qs; };

function themeWords(th, env){ return th.w.map(w => wordFrom(W(w), env.dict)); }
function themeSentences(th, env){ return th.s.map(r => sentence(r, env.dict)); }
const sentencePool = env => allSentences.map(x => sentence(x.row, env.dict));

export function wordsRound(words, pool, env, n = 10){
  const ws = shuf(words, env), at = i => ws[i % ws.length];
  return fill([() => qMean(at(0), pool, env), () => qPick(at(1), pool, env), () => qMean(at(2), pool, env), () => qMatch(shuf(words, env), env),
    () => qTf(at(3), pool, env), () => qPick(at(4), pool, env), () => qMean(at(5), pool, env), () => qPick(at(6), pool, env), () => qTf(at(7), pool, env), () => qMean(at(8), pool, env),
    () => qPick(at(9), pool, env)], n);
}
function listenRound(th, env){
  const ws = shuf(themeWords(th, env), env), ss = themeSentences(th, env), sp = sentencePool(env), at = i => ws[i % ws.length];
  const hearS = s => { const d = others(sp, s, 3, env, x => x.lo); return { type:"listen_select", skill:"listening", ask:ASK.hear, prompt:{ zh:s.lo }, options:[s.lo, ...d.map(x => x.lo)], answer:0,
    explain:{ en:s.en, lo:s.en, zh:s.zh }, item:{ k:s.lo, py:s.py, en:s.en, zh:s.zh } }; };
  const pool = ws;
  return fill([() => qHear(at(0), pool, env), () => qHear(at(1), pool, env), () => qTf(at(2), pool, env, true), () => qHear(at(3), pool, env), () => hearS(pick(ss, env)),
    () => qHear(at(4), pool, env), () => qTf(at(5), pool, env, true), () => qHear(at(6), pool, env), () => hearS(pick(ss, env)), () => qHear(at(7), pool, env)], 10);
}
function useRound(th, env){
  const ss = shuf(themeSentences(th, env), env), sp = sentencePool(env), ws = themeWords(th, env), at = i => ss[i % ss.length];
  const orderable = ss.filter(s => s.toks.length >= 3), oat = i => orderable.length ? orderable[i % orderable.length] : null;
  return fill([() => oat(0) && qOrder(oat(0)), () => qFill(at(0), ws, env), () => qSentMean(at(1), sp, env), () => oat(1) && qOrder(oat(1)), () => qFill(at(2), ws, env),
    () => qSentLao(at(3), sp, env), () => qFill(at(4), ws, env), () => oat(2) && qOrder(oat(2)), () => qSentMean(at(2), sp, env), () => qSentLao(at(0), sp, env),
    () => qFill(at(1), ws, env), () => qSentMean(at(3), sp, env)], 10);
}
function talkRound(g, env){
  const turns = shuf(g.themes.flatMap(id => THEME[id].c || []), env);
  const qs = turns.map(c => qReply(c, env, false));
  for (let i = 0; qs.length < 6 && i < turns.length; i++) qs.push(qReply(turns[i], env, true));
  for (const c of turns.slice(0, 2)) qs.push(qSay(joinLao(c[3]), pyOfSentence(c[3], env.dict), meanIn({ en:c[4], zh:c[5] }, env.L), env));
  return qs.slice(0, 8);
}
function sayRound(g, env){
  const ss = shuf(g.themes.flatMap(id => themeSentences(THEME[id], env)), env).slice(0, 6);
  const turns = shuf(g.themes.flatMap(id => THEME[id].c || []), env).slice(0, 2);
  return [...ss.map(s => qSay(s.lo, s.py, meanIn(s, env.L), env)), ...turns.map(c => qSay(joinLao(c[3]), pyOfSentence(c[3], env.dict), meanIn({ en:c[4], zh:c[5] }, env.L), env))];
}
function spellRound(g, env){
  const ws = shuf(g.themes.flatMap(id => themeWords(THEME[id], env)), env), ss = shuf(g.themes.flatMap(id => themeSentences(THEME[id], env)), env).filter(s => s.toks.length >= 3);
  const qs = []; for (const w of ws){ if (qs.length >= 8) break; const q = qSpell(w, env); if (q) qs.push(q); }
  for (const s of ss.slice(0, 2)) qs.push(Object.assign(qOrder(s), { skill:"writing" }));
  return qs;
}
function grammarRound(gid, env){
  const g = GRAM[gid];
  return shuf(g.q, env).map(([s, opts, en, zh, ren, rzh]) => ({ type:"fill", skill:"grammar", ask:ASK.fill,
    prompt:{ zh:joinLao(s), py:"", tr:{ en:meanIn({ en, zh }, env.L) } }, options:opts.slice(), answer:0, say:joinLao(s.replace("___", opts[0])),
    explain:{ en:ren, lo:ren, zh:rzh }, item:{ k:joinLao(s.replace("___", opts[0])), py:"", en, zh } }));
}
function pairsRound(env){
  return shuf(TONE_PAIRS, env).concat(shuf(TONE_PAIRS, env)).slice(0, 10).map(grp => { const w = pick(grp, env);
    return { type:"listen_select", skill:"pinyin", ask:ASK.hear, prompt:{ zh:w[0] }, options:grp.map(x => x[0]), answer:grp.indexOf(w),
      explain:{ en:grp.map(x => x[0] + " = " + x[1]).join(" · "), lo:grp.map(x => x[0] + " = " + x[1]).join(" · "), zh:grp.map(x => x[0] + " = " + x[2]).join(" · ") }, item:{ k:w[0], py:"", en:w[1], zh:w[2] } }; });
}
function rulesRound(env){
  return shuf(TONE_RULES, env).slice(0, 10).map(([q, opts]) => ({ type:"mc", skill:"pinyin", ask:q, prompt:{}, options:opts.map(o => o[env.L] || o.en), answer:0 }));
}
const TONE_SET = [["ກາ","kāa",1],["ກ່າ","kàa",2],["ກ້າ","kâa",3],["ມ້າ","mâa",4],["ຂາ","khǎa",5],["ດີ","dīi",1],["ປາ","pāa",1],["ແມ່","mɛ̂ɛ",2],["ເຂົ້າ","khâo",3],["ນ້ຳ","nâm",4],["ຫຼາຍ","lǎai",5],["ໄປ","pāi",1],["ເຈົ້າ","jâo",3],["ໝາກ","màak",6],["ເຮືອນ","hɯ́an",1]];
const hearRound = env => shuf(TONE_SET, env).slice(0, 10).map(([z, p, a]) => ({ type:"tone", skill:"pinyin", prompt:{ zh:z, py:p }, answer:a }));
function classRound(src, env){
  const pool = CONSONANTS.filter(c => !c.combo || src === "all"), mine = src === "all" ? pool : pool.filter(c => c.cls === src);
  const withWord = pool.filter(c => c.word), qs = [];
  for (const c of shuf(mine, env)){
    if (qs.length >= 10) break;
    const k = qs.length % 3;
    if (src === "all" || k === 0) qs.push({ type:"mc", skill:"characters", ask:ASK.cls, prompt:{ zh:c.char, py:c.name }, options:["middle","high","low"].map(x => CLS[x][env.L] || CLS[x].en),
      answer:["middle","high","low"].indexOf(c.cls), item:{ k:c.char, py:c.name, en:CLS[c.cls].en, zh:CLS[c.cls].zh } });
    else if (k === 1 && c.word){ const d = others(withWord, c, 3, env, x => x.word);
      qs.push({ type:"mc", skill:"characters", ask:ASK.keyword, prompt:{ zh:c.char, py:c.name }, options:[c.word + " · " + c.meaning, ...d.map(x => x.word + " · " + x.meaning)], answer:0, say:c.word,
        item:{ k:c.char, py:c.name, en:c.word + " (" + c.meaning + ")", zh:c.word } }); }
    else if (c.word){ const d = others(pool, c, 3, env, x => x.char);
      qs.push({ type:"listen_select", skill:"characters", ask:ASK.first, prompt:{ zh:c.word }, options:[c.char, ...d.map(x => x.char)], answer:0,
        explain:{ en:c.word + " = " + c.meaning, lo:c.word, zh:c.word + " = " + c.meaning }, item:{ k:c.char, py:c.name, en:c.word, zh:c.word } }); }
  }
  return qs;
}
function vowelsRound(src, env){
  return shuf(VOWELS, env).slice(0, 10).map(v => src === "pos"
    ? { type:"mc", skill:"characters", ask:ASK.vpos, prompt:{ zh:v.form }, options:["after","above","below","before","around"].map(p => VPOS[p][env.L] || VPOS[p].en), answer:["after","above","below","before","around"].indexOf(v.pos),
        item:{ k:v.form, py:v.sound, en:VPOS[v.pos].en, zh:VPOS[v.pos].zh } }
    : (() => { const d = others(VOWELS, v, 3, env, x => x.sound); return { type:"mc", skill:"characters", ask:ASK.vsound, prompt:{ zh:v.form }, options:[v.sound, ...d.map(x => x.sound)], answer:0,
        item:{ k:v.form, py:v.sound, en:v.sound, zh:v.sound } }; })());
}
function digitsRound(env){
  return shuf(NUMERALS, env).map((d, i) => { const o = others(NUMERALS, d, 3, env, x => x.value);
    return i % 2 ? { type:"mc", skill:"characters", ask:ASK.digitR, prompt:{ tr:{ en:String(d.value) + " · " + d.name } }, options:[d.char, ...o.map(x => x.char)], answer:0, say:d.name, item:{ k:d.char, py:"", en:String(d.value), zh:String(d.value) } }
      : { type:"mc", skill:"characters", ask:ASK.digit, prompt:{ zh:d.char }, options:[String(d.value), ...o.map(x => String(x.value))], answer:0, say:d.name, item:{ k:d.char, py:"", en:String(d.value), zh:String(d.value) } }; });
}
function marksRound(env){
  const all = [...TONE_MARKS, ...SIGNS];
  return shuf(all, env).concat(shuf(all, env)).slice(0, 8).map(m => { const o = others(all, m, 2, env, x => x.name);
    return { type:"mc", skill:"pinyin", ask:ASK.mark, prompt:{ zh:m.char }, options:[m.name + " (" + m.rom + ")", ...o.map(x => x.name + " (" + x.rom + ")")], answer:0, item:{ k:m.char, py:m.rom, en:m.name, zh:m.name } }; });
}
function writeRound(env){
  const pool = (env.content.characters || []).filter(c => c && c.char && c.handwriting && (c.handwriting.strokes || []).length);
  return shuf(pool, env).slice(0, 6).map(c => ({ type:"write_char", skill:"characters", prompt:Object.assign({ zh:c.char, py:c.name && c.name !== c.char ? c.name : "" }, c.meaning ? { tr:{ en:c.meaning } } : {}), ask:{ en:"Write " + c.char, lo:"ຂຽນ " + c.char, zh:"写 " + c.char } }));
}
function dialogueRound(id, env){
  const d = (env.content.dialogues || []).find(x => x.id === id); if (!d) return [];
  const lines = d.lines.filter(l => l && l.zh), otherLines = (env.content.dialogues || []).filter(x => x.id !== id).flatMap(x => (x.lines || []).map(l => l && l.zh)).filter(Boolean).concat(allReplies);
  const qs = [];
  for (let i = 1; i < lines.length && qs.length < 8; i++){ const prev = lines[i - 1], cur = lines[i]; const dd = others(otherLines, cur.zh, 2, env);
    const trOf = l => l.tr ? meanIn({ en:l.tr.en || "", zh:l.tr.zh || "" }, env.L) : "";
    qs.push({ type:"reply", skill:"speaking", ask:ASK.reply, context:[{ text:prev.zh, py:prev.py || "", tr:trOf(prev), sp:prev.sp }], options:[cur.zh, ...dd], answer:0, after:trOf(cur), say:cur.zh,
      item:{ k:cur.zh, py:cur.py || "", en:(cur.tr && cur.tr.en) || "", zh:(cur.tr && cur.tr.zh) || "" } }); }
  return qs;
}
function teacherRound(tag, env){
  const list = (env.content.vocab || []).filter(v => v && v.hz && (v.tags || []).includes(tag) && meaningEn(v));
  const words = list.map(v => ({ lo:v.hz, py:v.py || dictPy(env.dict, v.hz) || "", en:meaningEn(v).split(";")[0], zh:(v.tr && v.tr.zh && v.tr.zh.meaning) || "" }));
  return wordsRound(words, words, env);
}

export function makeQuestions(set, env){
  env = Object.assign({ L:"en", dict:{}, content:{} }, env || {});
  const [kind, a, b] = String(set.id).split(":");
  if (kind === "th"){ const th = THEME[a]; if (!th) return [];
    if (b === "words") return wordsRound(themeWords(th, env), themeWords(th, env), env);
    if (b === "listen") return listenRound(th, env);
    if (b === "use") return useRound(th, env); }
  if (kind === "gr"){ const g = GROUP[a]; if (!g) return [];
    if (b === "talk") return talkRound(g, env);
    if (b === "say") return sayRound(g, env);
    if (b === "spell") return spellRound(g, env); }
  if (kind === "gm") return GRAM[a] ? grammarRound(a, env) : [];
  if (kind === "tn") return a === "pairs" ? pairsRound(env) : a === "rules" ? rulesRound(env) : hearRound(env);
  if (kind === "sc"){ if (a === "class") return classRound(b, env); if (a === "vowels") return vowelsRound(b, env); if (a === "digits") return digitsRound(env); if (a === "marks") return marksRound(env); if (a === "write") return writeRound(env); }
  if (kind === "pt") return env.patternQuestions ? env.patternQuestions(+a, set.n || 8) : [];
  if (kind === "dl") return dialogueRound(String(set.id).slice(3), env);
  if (kind === "vt") return teacherRound(String(set.id).slice(3), env);
  return [];
}

// ---------- questions by skill (Smart session, Daily challenge, Speed round) ----------
// one question that trains a skill, from the themes at or below a stage
export function questionForSkill(skill, env, stage = 1){
  const ths = THEMES.filter(t => t.stage <= Math.max(1, stage)), th = pick(ths.length ? ths : THEMES, env);
  const ws = themeWords(th, env), w = pick(ws, env), sp = sentencePool(env), ss = themeSentences(th, env), s = pick(ss, env);
  switch (skill){
    case "vocabulary": return R(env)() < 0.5 ? qMean(w, ws, env) : qTf(w, ws, env);
    case "reading":    return R(env)() < 0.5 ? qPick(w, ws, env) : qSentMean(s, sp, env);
    case "listening":  return R(env)() < 0.6 ? qHear(w, ws, env) : qTf(w, ws, env, true);
    case "sentence":   { const o = ss.filter(x => x.toks.length >= 3); return o.length ? qOrder(pick(o, env)) : qSentMean(s, sp, env); }
    case "grammar":    return R(env)() < 0.5 ? (qFill(s, ws, env) || grammarRound(pick(GRAMMAR.filter(g => g.stage <= Math.max(1, stage)), env).id, env)[0]) : grammarRound(pick(GRAMMAR.filter(g => g.stage <= Math.max(1, stage)), env).id, env)[0];
    case "writing":    return qSpell(w, env) || qSentLao(s, sp, env);
    case "speaking":   { const c = pick(ths.flatMap(t => t.c || []), env); return c ? qReply(c, env, R(env)() < 0.3) : qSay(s.lo, s.py, meanIn(s, env.L), env); }
    case "pinyin":     return R(env)() < 0.6 ? pairsRound(env)[0] : rulesRound(env)[0];
    case "characters": return pick([() => classRound(pick(["middle","high","low"], env), env)[0], () => vowelsRound("pos", env)[0], () => digitsRound(env)[0]], env)();
  }
  return qMean(w, ws, env);
}
// quick questions for the Speed round (one tap each)
export function speedQuestion(env, stage = 1){
  const ths = THEMES.filter(t => t.stage <= Math.max(1, stage) + 1), th = pick(ths, env), ws = themeWords(th, env), w = pick(ws, env);
  const r = R(env)(); return r < 0.45 ? qTf(w, ws, env) : r < 0.8 ? qMean(w, ws, env) : qPick(w, ws, env);
}
// a question about one remembered item (Mistakes review)
export function questionForItem(it, env){
  const ws = ALL_WORDS.map(w => wordFrom(w, env.dict)), w = { lo:it.k, py:it.py || pyOfToken(it.k, env.dict), en:it.en, zh:it.zh };
  if (!w.en && !w.zh) return null;
  const sentencey = /\s/.test(w.en) && w.lo.length > 8, pool = sentencey ? sentencePool(env) : ws;
  const r = R(env)();
  if (r < 0.4) return sentencey ? qSentMean(w, pool, env) : qMean(w, pool, env);
  if (r < 0.7) return sentencey ? qSentLao(w, pool, env) : qPick(w, pool, env);
  return Object.assign(qHear(w, pool, env), { skill:"listening" });
}
export const BANK_STATS = () => ({ themes: THEMES.length, words: ALL_WORDS.length, sentences: allSentences.length, turns: allReplies.length, grammar: GRAMMAR.reduce((n, g) => n + g.q.length, 0) });
