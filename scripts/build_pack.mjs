// Builds the LaoLao curriculum pack (data/curriculum-pack.json) from the authoring files content/curriculum/stage1..6.mjs:
// lessons with their words, dialogue, sentence patterns, grammar and a generated quiz; culture stories; a learning path
// per stage. Everything is checked first (Lao script, romanization against the syllables, every reference, every quiz
// answerable); any error stops the build. Admin → All content → Curriculum pack imports it (new items only).
// Run: node scripts/build_pack.mjs            (node scripts/build_pack.mjs --check  only validates)
import fs from "fs";
import path from "path";
import { pathToFileURL } from "url";
import { THEMES, FN } from "../js/shared/practice-bank.js";
import { analyse } from "../js/shared/lao-tone.js";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/(\w:)/, "$1")), "..");
const SRC = path.join(ROOT, "content", "curriculum");
const OUT = path.join(ROOT, "data", "curriculum-pack.json");
const ACCESS_BY_STAGE = { 1:"free", 2:"free", 3:"standard", 4:"standard", 5:"premium", 6:"premium" };   // which plan opens each stage (editable in Admin afterwards)
const LAO = /^[຀-໿\s,.?!…·\-–()]+$/;
const errors = [], warnings = [];
const err = (where, msg) => errors.push(where + ": " + msg), warn = (where, msg) => warnings.push(where + ": " + msg);

// ---------- known words (romanization for sentence words) ----------
const seed = JSON.parse(fs.readFileSync(path.join(ROOT, "data", "seed.json"), "utf8"));
const PY = new Map(Object.entries(FN));
const BANK = new Map();
for (const th of THEMES) for (const w of th.w){ BANK.set(w[0], { lo: w[0], py: w[1], en: w[2], zh: w[3], pos: "" }); PY.set(w[0], w[1]); }
for (const v of seed.vocabulary || []) if (v.hz && v.py && !PY.has(v.hz)) PY.set(v.hz, v.py);
const EXTRA = path.join(SRC, "words.mjs");
const EXTRA_MOD = fs.existsSync(EXTRA) ? await import(pathToFileURL(EXTRA).href) : { default: {} };
for (const [k, v] of Object.entries(EXTRA_MOD.default)) PY.set(k, v);
const SYL_OK = new Set(EXTRA_MOD.SYLLABLES_OK || []);
const seedIds = {}; for (const [k, v] of Object.entries(seed)) if (Array.isArray(v)) seedIds[k] = new Set(v.map(x => x.id));

// ---------- read the stages ----------
const stages = [];
for (let n = 1; n <= 6; n++){
  const f = path.join(SRC, `stage${n}.mjs`);
  if (fs.existsSync(f)) stages.push(Object.assign({ n }, (await import(pathToFileURL(f).href)).default));
}
if (!stages.length){ console.log("no stage files in content/curriculum"); process.exit(1); }

// ---------- words ----------
const sylCount = py => String(py).split(/[\s-]+/).filter(Boolean).length;
function word(w, where){
  if (typeof w === "string"){ const b = BANK.get(w); if (!b){ err(where, `word "${w}" is not in the practice bank: give [Lao, romanization, part of speech, English, Chinese]`); return null; } return Object.assign({}, b); }
  const [lo, py, pos, en, zh] = w;
  if (!lo || !LAO.test(lo)) err(where, `word "${lo}" must be Lao script`);
  if (!py || /[຀-໿]/.test(py)) err(where, `word "${lo}" needs a romanization`);
  if (!en) err(where, `word "${lo}" needs an English meaning`);
  if (!zh) err(where, `word "${lo}" needs a Chinese meaning`);
  const n = analyse(lo.replace(/[\s,.?!…·]/g, "")).length;
  if (py && n && n !== sylCount(py) && !SYL_OK.has(lo)) warn(where, `"${lo}": ${n} syllables in the spelling, ${sylCount(py)} in "${py}"`);
  return { lo, py, pos: pos || "", en, zh };
}
// a sentence written with spaces between the words → { zh, py, tokens }
function sentence(text, where){
  const toks = String(text).trim().split(/\s+/).filter(Boolean);
  if (!toks.length) { err(where, "empty sentence"); return null; }
  if (/[A-Za-z]/.test(text)) err(where, "a Lao sentence contains Latin letters: " + text);
  const out = toks.map(z => { const m = z.match(/^(.*?)([,.?!…]*)$/), w = m[1], p = PY.get(w); return { z: w, p: p || "", punct: m[2] }; });
  const missing = out.filter(t => t.z && !t.p).map(t => t.z);
  if (missing.length) warn(where, "no romanization for: " + missing.join(" "));
  const zh = out.map((t, i) => t.z + t.punct + (t.punct === "," ? " " : "")).join("").trim();
  const py = missing.length ? "" : out.map(t => t.p + t.punct).join(" ");
  return { zh, py, tokens: out.filter(t => t.z).map(t => ({ z: t.z, p: t.p })) };
}
const tr3 = (a, where) => { if (!Array.isArray(a) || !a[0]) err(where, "needs [English, Lao, Chinese]"); return { en: (a || [])[0] || "", lo: (a || [])[1] || "", zh: (a || [])[2] || "" }; };

// ---------- build ----------
const items = { vocabulary: [], patterns: [], grammar: [], dialogues: [], quizzes: [], lessons: [], culture: [], paths: [] };
const vocabSeen = new Map(), ids = new Set();
const addId = (type, id, where) => { const k = type + "/" + id; if (ids.has(k)) err(where, `duplicate id ${id}`); ids.add(k); if (seedIds[type] && seedIds[type].has(id) && type !== "vocabulary") err(where, `id ${id} is already used by the starter content`); };
const meta = st => ({ status: "published", access: ACCESS_BY_STAGE[st] });

// words first (every stage), so example sentences and dialogues anywhere can use any word the course teaches
for (const S of stages){
  const st = S.n;
  (S.lessons || []).forEach((l, i) => {
    const where = `stage ${st} lesson ${l.id}`; addId("lessons", l.id, where);
    if (!new RegExp("^c" + st + "-\\d\\d$").test(l.id)) err(where, `lesson ids of stage ${st} look like c${st}-01`);
    const words = (l.w || []).map(w => word(w, where)).filter(Boolean);
    if (words.length < 6) err(where, "needs at least 6 words");
    for (const w of words) if (!vocabSeen.has(w.lo)){ vocabSeen.set(w.lo, true); PY.set(w.lo, w.py);
      items.vocabulary.push(Object.assign({ id: w.lo, hz: w.lo, py: w.py, pos: w.pos, level: st, tr: { en: { meaning: w.en }, lo: { meaning: "" }, zh: { meaning: w.zh } }, examples: [], tags: [l.tag || l.topic.toLowerCase().replace(/[^a-z]+/g, "-"), "stage-" + st] }, meta(st))); }
    l._words = words;
  });
}
for (const S of stages){
  const st = S.n;
  for (const p of S.patterns || []){
    const where = `stage ${st} pattern #${p.n}`; addId("patterns", "p" + p.n, where);
    if (!(p.n >= 301)) err(where, "pattern numbers start at 301 (the pack's own range)");
    const ex = (p.ex || []).map((e, i) => { const s = sentence(e[0], where + " example " + (i + 1)); return s && Object.assign(s, { tr: { en: e[1] || "", zh: e[2] || "" } }); }).filter(Boolean);
    if (ex.length < 2) err(where, "needs at least 2 examples");
    if (!p.hz || !/[຀-໿]/.test(p.hz)) err(where, "needs the pattern in Lao (hz)");
    const marker = String(p.hz).replace(/…|\.\.\./g, " ").split(/\s+/).filter(Boolean);
    if (ex.length && !ex.some(e => marker.some(m => e.zh.includes(m)))) warn(where, "no example contains the pattern's words");
    items.patterns.push(Object.assign({ id: "p" + p.n, n: p.n, sec: p.sec || "P", hz: p.hz, py: p.py || "", gloss: p.gloss || p.mean[0], level: st, formula: p.formula || "",
      tr: { en: { meaning: p.mean[0], how: p.how || "", note: p.note || "" }, lo: { meaning: p.mean[1] || "" }, zh: { meaning: p.mean[2] || "" } },
      mistake: p.mistake ? { wrong: p.mistake[0], right: p.mistake[1], tr: { en: p.mistake[2] || "" } } : null, examples: ex, gen: [], order: p.n }, meta(st)));
  }
  for (const g of S.grammar || []){
    const where = `stage ${st} grammar ${g.id}`; addId("grammar", g.id, where);
    const ex = (g.ex || []).map((e, i) => { const s = sentence(e[0], where + " example " + (i + 1)); return s && { zh: s.zh, py: s.py, tokens: s.tokens, tr: { en: e[1] || "", zh: e[2] || "" } }; }).filter(Boolean);
    if (ex.length < 2) err(where, "needs at least 2 examples");
    if (!g.body || !g.body[0]) err(where, "needs an explanation");
    items.grammar.push(Object.assign({ id: g.id, level: st, title: tr3(g.t, where), body: { en: g.body[0], lo: g.body[1] || "", zh: g.body[2] || "" }, structure: g.structure || "",
      examples: ex, mistakes: (g.mistakes || []).map(m => ({ wrong: m[0], right: m[1], tr: { en: m[2] || "" } })) }, meta(st)));
  }
  // dialogues after all words are known (romanization of the lines)
  (S.lessons || []).forEach(l => {
    const where = `stage ${st} lesson ${l.id}`;
    if (!l.dlg) { err(where, "needs a dialogue"); return; }
    const did = "d-" + l.id; addId("dialogues", did, where);
    const lines = l.dlg.lines.map((x, k) => { const s = sentence(x[1], where + " line " + (k + 1)); return s && { speaker: x[0], sp: x[0], zh: s.zh, py: s.py, tokens: s.tokens, tr: { en: x[2] || "", zh: x[3] || "" } }; }).filter(Boolean);
    if (lines.length < 4) err(where, "the dialogue needs at least 4 lines");
    if (lines.some(x => !x.tr.en)) err(where, "every dialogue line needs an English translation");
    items.dialogues.push(Object.assign({ id: did, level: st, title: tr3(l.dlg.t, where), lines }, meta(st)));
    l._dialogue = lines;
  });
}
// ---------- quizzes: 8 questions from each lesson ----------
const shuffle = (a, seedN) => { a = a.slice(); let s = seedN; for (let i = a.length - 1; i > 0; i--){ s = (s * 9301 + 49297) % 233280; const j = Math.floor(s / 233280 * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
// a stable number from a string, so every question gets its own shuffle (answers do not sit in the same place)
const hash = str => { let x = 2166136261; for (const c of String(str)) x = Math.imul(x ^ c.codePointAt(0), 16777619); return (x >>> 0) % 233280; };
const stageWords = st => items.vocabulary.filter(v => v.level <= st).map(v => ({ lo: v.hz, en: v.tr.en.meaning, zh: v.tr.zh.meaning }));
for (const S of stages){
  const st = S.n, pool = stageWords(st);
  (S.lessons || []).forEach((l, li) => {
    const where = `stage ${st} lesson ${l.id} quiz`, ws = l._words || [], seedN = st * 100 + li;
    const other = (w, key, n, tag = "") => shuffle(pool.filter(x => x.lo !== w.lo && x[key] && x[key] !== w[key]), hash(l.id + key + tag + w.lo)).filter((x, i, a) => a.findIndex(y => y[key] === x[key]) === i).slice(0, n);
    const mean = w => w.en.split(/[;,]/)[0].trim();
    const qs = [];
    shuffle(ws, seedN).slice(0, 3).forEach(w => { const d = other(w, "en", 3); qs.push({ type: "mc", skill: "vocabulary", prompt: { zh: w.lo, py: w.py }, options: shuffle([{ en: mean(w) }, ...d.map(x => ({ en: x.en.split(/[;,]/)[0].trim() }))], hash(l.id + "m" + w.lo)), answer: -1, _right: mean(w) }); });
    shuffle(ws, seedN + 7).slice(0, 2).forEach(w => { const d = other(w, "lo", 3); qs.push({ type: "mc", skill: "reading", ask: { en: "Which Lao word means “" + mean(w) + "”?" }, prompt: {}, options: shuffle([{ zh: w.lo }, ...d.map(x => ({ zh: x.lo }))], hash(l.id + "r" + w.lo)), answer: -1, _right: w.lo }); });
    const lw = shuffle(ws, seedN + 3)[0]; if (lw){ const d = other(lw, "lo", 2); qs.push({ type: "listen_select", skill: "listening", prompt: { zh: lw.lo }, options: shuffle([{ zh: lw.lo }, ...d.map(x => ({ zh: x.lo }))], hash(l.id + "l" + lw.lo)), answer: -1, _right: lw.lo }); }
    const dl = l._dialogue || [];
    const line = dl.find(x => x.tokens.length >= 3 && x.tokens.length <= 8) || dl.filter(x => x.tokens.length >= 3 && x.tokens.length <= 12).sort((a, b) => a.tokens.length - b.tokens.length)[0];
    if (line) qs.push({ type: "order", skill: "sentence", prompt: { tr: { en: line.tr.en } }, ask: { en: line.tr.en }, tokens: line.tokens.map(t => t.z), answer: line.tokens.map(t => t.z).join("") });
    // fill: a lesson word taken out of a dialogue line
    // (a lesson word if one is in the dialogue, else any word the course has taught by now)
    const known = ws.concat(pool.filter(x => x.lo.length > 1));
    const fl = dl.map(x => ({ x, w: ws.find(w => x.tokens.some(t => t.z === w.lo)) })).find(o => o.w) || dl.map(x => ({ x, w: known.find(w => x.tokens.some(t => t.z === w.lo)) })).find(o => o.w);
    if (fl){ const d = other(fl.w, "lo", 2, "fill"); qs.push({ type: "fill", skill: "grammar", prompt: { zh: fl.x.tokens.map(t => t.z === fl.w.lo ? "___" : t.z).join("") }, ask: { en: fl.x.tr.en }, options: shuffle([{ zh: fl.w.lo }, ...d.map(x => ({ zh: x.lo }))], hash(l.id + "f" + fl.w.lo)), answer: -1, _right: fl.w.lo }); }
    for (const q of qs){ if (q.options){ q.answer = q.options.findIndex(o => (o.en || o.zh) === q._right); if (q.answer < 0 || new Set(q.options.map(o => o.en || o.zh)).size !== q.options.length) err(where, "a question with a bad answer or repeated options"); } delete q._right; }
    if (qs.length < 6) err(where, "only " + qs.length + " questions");
    const qid = "q-" + l.id; addId("quizzes", qid, where);
    items.quizzes.push(Object.assign({ id: qid, level: st, kind: "quiz", lesson: l.id, title: { en: (l.t[0] || "") + " · Quiz", lo: (l.t[1] || "") + " · ແບບທົດສອບ", zh: (l.t[2] || "") + " · 测验" }, questions: qs }, meta(st)));
  });
}
// ---------- lessons, culture, paths ----------
const patternNs = new Set([...items.patterns.map(p => p.n), ...(seed.patterns || []).map(p => p.n)]);
const grammarIds = new Set([...items.grammar.map(g => g.id), ...(seed.grammar || []).map(g => g.id)]);
for (const S of stages){
  const st = S.n;
  (S.lessons || []).forEach((l, i) => {
    const where = `stage ${st} lesson ${l.id}`;
    for (const n of l.p || []) if (!patternNs.has(n)) err(where, `pattern #${n} does not exist`);
    for (const g of l.g || []) if (!grammarIds.has(g)) err(where, `grammar ${g} does not exist`);
    items.lessons.push(Object.assign({ id: l.id, level: st, order: i + 1, topic: l.topic || "", title: tr3(l.t, where), desc: { en: (l.d || [])[0] || "", lo: (l.d || [])[1] || "", zh: (l.d || [])[2] || "" },
      objectives: { en: l.obj || [], lo: [], zh: [] }, vocab: (l._words || []).map(w => w.lo), patterns: l.p || [], grammar: l.g || [], dialogues: ["d-" + l.id], quizzes: ["q-" + l.id], audio: [], images: [], examples: [] }, meta(st)));
  });
  for (const c of S.culture || []){
    const where = `stage ${st} culture ${c.id}`; addId("culture", c.id, where);
    if (!["traditions","etiquette","food","festivals","places"].includes(c.cat)) err(where, "category must be traditions, etiquette, food, festivals or places");
    items.culture.push(Object.assign({ id: c.id, level: st, category: c.cat, title: tr3(c.t, where), desc: { en: c.desc[0], lo: c.desc[1] || "", zh: c.desc[2] || "" }, content: { en: c.content[0], lo: c.content[1] || "", zh: c.content[2] || "" },
      keyTips: (c.tips || []).map(tip => ({ tip })), vocab: (c.words || []).map(([lao, en]) => ({ lao, en })) }, meta(st)));
  }
  if (S.path){ const id = "path-stage" + st; addId("paths", id, "stage " + st + " path");
    items.paths.push(Object.assign({ id, order: 10 + st, kind: "level", level: st, title: tr3(S.path.t, "stage " + st + " path"), desc: { en: S.path.d[0], lo: S.path.d[1] || "", zh: S.path.d[2] || "" },
      steps: (S.lessons || []).map(l => ({ type: "lesson", id: l.id })) }, meta(st))); }
}
// Thai letters look like Lao but are different characters: none may slip in anywhere
{ const thai = JSON.stringify(items).match(/[\u0E00-\u0E7F]+/g); if (thai) err("pack", "Thai characters found: " + [...new Set(thai)].slice(0, 10).join(" ")); }
// ---------- report ----------
const counts = Object.fromEntries(Object.entries(items).map(([k, v]) => [k, v.length]));
const perStage = Object.fromEntries(stages.map(S => [S.n, (S.lessons || []).length]));
console.log("stages:", stages.map(s => s.n).join(", "), "· lessons per stage:", JSON.stringify(perStage));
console.log("items:", JSON.stringify(counts), "· quiz questions:", items.quizzes.reduce((n, q) => n + q.questions.length, 0));
if (warnings.length){ console.log(`\n${warnings.length} warnings (check with a Lao speaker):`); warnings.slice(0, process.env.ALLW ? 9999 : 60).forEach(w => console.log("  · " + w)); if (warnings.length > 60) console.log("  …"); }
if (errors.length){ console.log(`\n${errors.length} ERRORS:`); errors.slice(0, 80).forEach(e => console.log("  ✗ " + e)); process.exit(1); }
if (process.argv.includes("--check")){ console.log("\nOK (check only)"); process.exit(0); }
const pack = { version: Date.now(), name: "LaoLao curriculum · Stage 1–6", counts, items };
fs.writeFileSync(OUT, JSON.stringify(pack));
console.log(`\nwrote ${path.relative(ROOT, OUT)} (${Math.round(fs.statSync(OUT).size / 1024)} KB)`);
