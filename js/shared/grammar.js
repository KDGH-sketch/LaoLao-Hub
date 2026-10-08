// Grammar Studio logic, without the page: a grammar point's data in one shape, its formula as coloured building blocks,
// the role of every word in an example (subject, verb, object, describing word, marker…), "build the sentence" checking,
// believable wrong word orders for "spot the mistake", and the five mastery steps.
// The page is js/learner/views-grammar.js; tests: scripts/test_grammar.mjs.

// ---------- one shape for every grammar point ----------
// Older rows keep the explanation in body:{en,lo}; the editor and the app use tr:{en:{explain,usage}}. Both are read.
export function normalizeGrammar(g){
  if (!g) return g;
  const out = Object.assign({}, g);
  const tr = {};
  for (const k of ["en", "lo", "zh"]){
    const t = (g.tr && g.tr[k]) || {};
    const body = g.body && typeof g.body === "object" ? g.body[k] : (k === "en" && typeof g.body === "string" ? g.body : "");
    tr[k] = { explain: (t.explain || body || "").trim(), usage: Array.isArray(t.usage) ? t.usage.filter(Boolean) : String(t.usage || "").split(/\n/).map(x => x.trim()).filter(Boolean) };
  }
  out.tr = tr;
  delete out.body;
  out.title = Object.assign({ en: "", lo: "", zh: "" }, typeof g.title === "string" ? { en: g.title } : g.title || {});
  out.level = +g.level || 1;
  out.structure = String(g.structure || "").trim();
  out.examples = (g.examples || []).filter(e => e && e.zh);
  out.mistakes = (g.mistakes || []).filter(m => m && m.wrong && m.right);
  out.patterns = (g.patterns || []).map(Number).filter(Boolean);
  return out;
}
// explanation in the reader's language, falling back to English (never an empty page)
export function explainOf(g, lang){
  const t = g.tr || {}, own = t[lang] && t[lang].explain;
  return own ? { text: own, usage: t[lang].usage || [], lang } : { text: (t.en && t.en.explain) || (t.lo && t.lo.explain) || "", usage: (t.en && t.en.usage) || [], lang: t.en && t.en.explain ? "en" : "lo" };
}

// ---------- roles ----------
// Every block gets a role. Colours are CSS tokens (--role-*), so Day and Night both work.
export const ROLES = {
  S: { en: "Subject", lo: "ປະທານ", zh: "主语", hint: { en: "who or what does it", lo: "ຜູ້ເຮັດ", zh: "谁/什么" } },
  V: { en: "Verb", lo: "ກິລິຍາ", zh: "动词", hint: { en: "the action", lo: "ການກະທຳ", zh: "动作" } },
  O: { en: "Object", lo: "ກຳ", zh: "宾语", hint: { en: "what it's done to", lo: "ສິ່ງທີ່ຖືກກະທຳ", zh: "对象" } },
  N: { en: "Noun", lo: "ຄຳນາມ", zh: "名词", hint: { en: "a thing or person", lo: "ສິ່ງຂອງ ຫຼື ຄົນ", zh: "事物或人" } },
  Adj: { en: "Describing", lo: "ຄຳຄຸນນາມ", zh: "形容词", hint: { en: "comes after the noun", lo: "ຢູ່ຫຼັງຄຳນາມ", zh: "放在名词后" } },
  Adv: { en: "How / when", lo: "ຄຳວິເສດ", zh: "副词", hint: { en: "adds detail", lo: "ເພີ່ມລາຍລະອຽດ", zh: "补充细节" } },
  Num: { en: "Number", lo: "ຕົວເລກ", zh: "数字", hint: { en: "how many", lo: "ຈັກ", zh: "多少" } },
  Clf: { en: "Classifier", lo: "ລັກສະນະນາມ", zh: "量词", hint: { en: "counting word", lo: "ຄຳນັບ", zh: "计数词" } },
  Time: { en: "Time", lo: "ເວລາ", zh: "时间", hint: { en: "when", lo: "ເມື່ອໃດ", zh: "何时" } },
  Place: { en: "Place", lo: "ສະຖານທີ່", zh: "地点", hint: { en: "where", lo: "ບ່ອນໃດ", zh: "哪里" } },
  Neg: { en: "Not", lo: "ປະຕິເສດ", zh: "否定", hint: { en: "goes before the verb", lo: "ຢູ່ໜ້າກິລິຍາ", zh: "放在动词前" } },
  Q: { en: "Question", lo: "ຄຳຖາມ", zh: "疑问", hint: { en: "makes it a question", lo: "ເຮັດໃຫ້ເປັນຄຳຖາມ", zh: "构成疑问" } },
  P: { en: "Particle", lo: "ຄຳລົງທ້າຍ", zh: "语气词", hint: { en: "tone and politeness", lo: "ນ້ຳສຽງ ແລະ ຄວາມສຸພາບ", zh: "语气与礼貌" } },
  M: { en: "Key word", lo: "ຄຳສຳຄັນ", zh: "关键词", hint: { en: "the word this point is about", lo: "ຄຳທີ່ບົດນີ້ສອນ", zh: "本课的关键词" } },
  X: { en: "Part", lo: "ສ່ວນ", zh: "部分", hint: { en: "", lo: "", zh: "" } },
  W: { en: "Word", lo: "ຄຳ", zh: "词", hint: { en: "", lo: "", zh: "" } }
};
const SLOT = { S: "S", SUBJECT: "S", V: "V", VERB: "V", VP: "V", O: "O", "(O)": "O", OBJECT: "O", N: "N", NOUN: "N", ADJ: "Adj", A: "S", B: "O",
  ADV: "Adv", NUM: "Num", NUMBER: "Num", CLF: "Clf", M: "Clf", TIME: "Time", PLACE: "Place", Q: "Q", NEG: "Neg" };
const LAO = /[຀-໿]/;
const NEG = new Set(["ບໍ່", "ບໍ່ແມ່ນ", "ບໍ່ໄດ້", "ຢ່າ"]);
const QUESTION = new Set(["ບໍ", "ແມ່ນບໍ", "ບໍ່", "ຫວາ", "ເນາະ", "ໃສ", "ຫຍັງ", "ໃຜ", "ເມື່ອໃດ", "ເທົ່າໃດ", "ແນວໃດ", "ເປັນຫຍັງ", "ຈັກ", "ໃດ"]);
const PARTICLE = new Set(["ເດີ", "ເນາະ", "ແດ່", "ແມ", "ສາ", "ໂດຍ", "ເຈົ້າ", "ດອກ", "ເລີຍ", "ແລ້ວ", "ນໍ", "ເຕີ"]);
const TIME = new Set(["ມື້ນີ້", "ມື້ອື່ນ", "ມື້ວານ", "ມື້ວານນີ້", "ຕອນເຊົ້າ", "ຕອນແລງ", "ຕອນທ່ຽງ", "ຕອນນີ້", "ດຽວນີ້", "ມື້ກີ້", "ປີນີ້", "ອາທິດໜ້າ", "ປີໜ້າ", "ເດືອນໜ້າ", "ສະເໝີ", "ທຸກມື້"]);

// "S + ບໍ່ + V / Adj" → [{ code:"S" }, { lit:"ບໍ່" }, { code:"V", alt:["Adj"] }]; optional parts in brackets
export function parseFormula(f){
  const s = String(f || "").replace(/[，,]/g, " ").replace(/\s+/g, " ").trim();
  if (!s) return [];
  return s.split(/\s*\+\s*/).filter(Boolean).map(part => {
    const optional = /^\(.*\)$/.test(part.trim());
    const p = part.replace(/[()]/g, "").replace(/\s+/g, " ").trim();
    if (LAO.test(p)) return { lit: p.replace(/[?？]/g, "").trim(), optional };
    const alts = p.split(/\s*\/\s*/).map(x => SLOT[x.toUpperCase().replace(/[^A-Z()]/g, "")] || (/^[A-Z]/.test(x) ? "X" : "W"));
    return { code: alts[0], alt: alts.slice(1), label: p.replace(/[?？]/g, "").trim(), optional };
  });
}
// the literal Lao words in a formula, split on "…" ("ທັງ…ທັງ" → two markers)
// ("ໂດຍ / ເຈົ້າ" → either word)
export const formulaMarkers = parts => parts.filter(p => p.lit).flatMap(p => p.lit.split(/…|\.\.\.|\//).map(x => x.trim()).filter(x => LAO.test(x)));

// Role of each token. tokens: [{z,p}]; dict: word → {pos}; formula: string. Punctuation gets role "punct".
export function tagTokens(tokens, formula, dict = {}){
  const markers = new Set(formulaMarkers(parseFormula(formula)));
  const words = tokens.map(t => ({ z: t.z, p: t.p || "" }));
  const isPunct = z => !LAO.test(z) && !/[A-Za-z0-9]/.test(z);
  let seenVerb = false, seenSubject = false;
  const firstVerb = words.findIndex(w => !isPunct(w.z) && !markers.has(w.z) && /^(v|aux)$/.test((dict[w.z] || {}).pos || ""));
  words.forEach((w, i) => {
    const pos = (dict[w.z] || {}).pos || "";
    if (isPunct(w.z)) w.role = "punct";
    else if (markers.has(w.z)) w.role = "M";
    // ບໍ່ before a word is "not"; at the very end it asks a question (…ບໍ່?)
    else if (NEG.has(w.z) && !(w.z === "ບໍ່" && !words.slice(i + 1).some(x => !isPunct(x.z)))) w.role = "Neg";
    else if (TIME.has(w.z)) w.role = "Time";
    else if (QUESTION.has(w.z) && (i >= words.length - 2 || ["ໃສ", "ຫຍັງ", "ໃຜ", "ເມື່ອໃດ", "ເທົ່າໃດ", "ແນວໃດ"].includes(w.z))) w.role = "Q";
    else if (PARTICLE.has(w.z) && i >= words.length - 2) w.role = "P";
    else if (pos === "v" || pos === "aux"){ w.role = "V"; seenVerb = true; }
    else if (pos === "adj") w.role = "Adj";
    else if (pos === "adv") w.role = "Adv";
    else if (pos === "num") w.role = "Num";
    else if (pos === "clf") w.role = "Clf";
    else if (pos === "part") w.role = "P";
    else if (pos === "n" || pos === "pron" || pos === "ph"){
      if (!seenSubject && (firstVerb < 0 || i < firstVerb) && !seenVerb){ w.role = "S"; seenSubject = true; }
      else w.role = seenVerb ? "O" : "N";
    }
    // a word the dictionary doesn't know: placed by where it stands
    else if (seenVerb) w.role = "O";
    else if (!seenSubject && (firstVerb < 0 || i < firstVerb)){ w.role = "S"; seenSubject = true; }
    else w.role = "W";
  });
  return words;
}
export const meaningful = toks => toks.filter(t => t.role !== "punct");

// ---------- build the sentence ----------
// answer and correct are lists of word strings. A time word may also stand at the very start or end of the sentence.
export function checkBuild(answer, correct, roles = []){
  const a = answer.join(" "), c = correct.join(" ");
  if (a === c) return { ok: true };
  const ti = roles.findIndex(r => r === "Time");
  if (ti >= 0){
    const rest = correct.filter((_, i) => i !== ti);
    for (const alt of [[correct[ti], ...rest], [...rest, correct[ti]]]) if (alt.join(" ") === a) return { ok: true, alt: true };
  }
  // first wrong position, to point at
  let at = 0; while (at < answer.length && answer[at] === correct[at]) at++;
  return { ok: false, at };
}
export function shuffleWords(words, rnd = Math.random){
  if (words.length < 2) return words.slice();
  for (let n = 0; n < 20; n++){
    const a = words.slice(); for (let i = a.length - 1; i > 0; i--){ const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
    if (a.join(" ") !== words.join(" ")) return a;
  }
  return words.slice().reverse();
}

// ---------- spot the mistake ----------
// Believable wrong orders, each with the rule it breaks (a key for the explanation).
export function wrongOrders(toks, rnd = Math.random){
  const w = meaningful(toks), out = [], have = new Set([w.map(x => x.z).join(" ")]);
  const add = (arr, why) => { const k = arr.map(x => x.z).join(" "); if (!have.has(k) && arr.length === w.length){ have.add(k); out.push({ words: arr.map(x => x.z), roles: arr.map(x => x.role), why }); } };
  const idx = r => w.findIndex(x => x.role === r);
  // describing word moved in front of its noun (English order)
  const ai = w.findIndex((x, i) => x.role === "Adj" && i > 0 && ["S", "O", "N"].includes(w[i - 1].role));
  if (ai > 0){ const a = w.slice(); [a[ai - 1], a[ai]] = [a[ai], a[ai - 1]]; add(a, "adj_after_noun"); }
  // question word / particle moved to the front
  const qi = w.findIndex(x => x.role === "Q" || x.role === "P");
  if (qi > 0){ const a = w.slice(); const [q] = a.splice(qi, 1); a.unshift(q); add(a, qi === w.length - 1 ? "particle_end" : "q_place"); }
  // "not" after the verb instead of before it
  const ni = idx("Neg"), vi = w.findIndex((x, i) => x.role === "V" && i > ni);
  if (ni >= 0 && vi > ni){ const a = w.slice(); const [n] = a.splice(ni, 1); a.splice(vi, 0, n); add(a, "neg_before_verb"); }
  // object before the verb (subject-object-verb, like Japanese or Korean)
  const v = idx("V"), o = w.findIndex((x, i) => x.role === "O" && i > v);
  if (v >= 0 && o > v){ const a = w.slice(); const [ob] = a.splice(o, 1); a.splice(v, 0, ob); add(a, "svo"); }
  // the key word of the point moved
  const mi = idx("M");
  if (mi >= 0 && w.length > 2){ const a = w.slice(); const [m] = a.splice(mi, 1); a.splice(mi === 0 ? a.length : 0, 0, m); add(a, "marker_place"); }
  // number / classifier order (Lao: noun + number + classifier)
  const ni2 = idx("Num"), ci = idx("Clf");
  if (ni2 >= 0 && ci === ni2 + 1){ const a = w.slice(); const [n] = a.splice(ni2, 2); const head = a.findIndex(x => ["S", "O", "N"].includes(x.role)); a.splice(Math.max(0, head), 0, ...n); add(a, "num_clf"); }
  // subject and verb swapped
  const s = idx("S");
  if (s >= 0 && v > s && v - s <= 2){ const a = w.slice(); [a[s], a[v]] = [a[v], a[s]]; add(a, "svo"); }
  // fallback: two neighbours swapped
  for (let i = 0; out.length < 2 && i < w.length - 1; i++){ const a = w.slice(); [a[i], a[i + 1]] = [a[i + 1], a[i]]; add(a, "order"); }
  return out;
}

// ---------- mastery ----------
// Five steps: learn (read it), see (explored the examples), build (2 right), fix (2 right), master (challenge ≥ 80 %).
export const STEPS = ["learn", "see", "build", "fix", "master"];
export function stepsDone(p){
  p = p || {};
  return { learn: !!p.learn, see: !!p.see, build: (p.build || 0) >= 2, fix: (p.fix || 0) >= 2, master: (p.best || 0) >= 80 };
}
export function mastery(p){ const d = stepsDone(p); return STEPS.filter(s => d[s]).length; }   // 0…5
// review after 7 days, then 30
export function grammarStatus(p, now = Date.now()){
  const m = mastery(p);
  if (!m) return "new";
  if (m < 5) return "learning";
  const age = now - (p.masteredAt || 0), due = (p.reviews || 0) ? 30 : 7;
  return age > due * 86400000 ? "review" : "mastered";
}
// the point to do next: something being learned, then a due review, then the first new one by stage
export function nextPoint(points, prog = {}, now = Date.now()){
  const sorted = points.slice().sort((a, b) => (a.level - b.level) || ((a.order || 0) - (b.order || 0)));
  return sorted.find(g => grammarStatus(prog[g.id], now) === "learning") || sorted.find(g => grammarStatus(prog[g.id], now) === "review") ||
    sorted.find(g => grammarStatus(prog[g.id], now) === "new") || null;
}
