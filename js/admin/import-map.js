// Spreadsheet import rules for Vocabulary, Grammar and Sentence Patterns: template columns, matching the file's headers,
// checking every row, and turning a row into the content the app stores. No page code here (tests: scripts/test_import.mjs).
// Rule of thumb: a blank cell never wipes what an existing item already has.

const LAO = /[຀-໿]/;
export const STAGES = ["1", "2", "3", "4", "5", "6"];
export const ACCESS = ["public", "free", "standard", "premium"];
export const POS = ["n", "v", "adj", "adv", "pron", "num", "clf", "part", "ph", "conj", "prep", "aux", "int", "idiom"];
const POS_NAMES = { noun: "n", verb: "v", adjective: "adj", adverb: "adv", pronoun: "pron", number: "num", numeral: "num", classifier: "clf",
  particle: "part", phrase: "ph", conjunction: "conj", preposition: "prep", auxiliary: "aux", interjection: "int" };

// key, header (as in the template), other accepted names, required, help, example values (2 sample rows)
export const TYPES = {
  vocabulary: { label: "Vocabulary", lo: "ຄຳສັບ", columns: [
    { key: "lao", header: "Lao", alias: ["word", "hz", "lao word", "ຄຳສັບ", "ຄຳລາວ"], required: true, help: "The word in Lao script", ex: ["ກິນ", "ໂຮງຮຽນ"] },
    { key: "py", header: "Romanization", alias: ["py", "roman", "pronunciation", "ຄຳອ່ານ"], help: "Leave empty to make it automatically", ex: ["kin", ""] },
    { key: "en", header: "English", alias: ["en", "meaning", "english meaning"], help: "Meaning in English (English, Lao or Chinese meaning: at least one)", ex: ["to eat", "school"] },
    { key: "lo", header: "Lao_Meaning", alias: ["lo", "lao meaning", "ຄວາມໝາຍ"], help: "Explanation in Lao (optional)", ex: ["ຮັບປະທານອາຫານ", ""] },
    { key: "zh", header: "Chinese", alias: ["zh", "chinese meaning", "中文"], help: "Meaning in Chinese (optional)", ex: ["吃", "学校"] },
    { key: "pos", header: "PartOfSpeech", alias: ["pos", "part of speech", "type", "word type"], list: POS, help: "n, v, adj, adv, pron, num, clf, part, ph, conj, prep… (or noun, verb…)", ex: ["v", "n"] },
    { key: "stage", header: "Stage", alias: ["level", "ລະດັບ"], list: STAGES, help: "1 to 6 (default 1)", ex: ["1", "1"] },
    { key: "tags", header: "Topic", alias: ["tags", "topic", "category"], help: "Comma-separated, e.g. food, daily", ex: ["food", "places"] },
    { key: "exLo", header: "ExampleLao", alias: ["example", "example lao", "ຕົວຢ່າງ"], help: "One example sentence in Lao (optional)", ex: ["ຂ້ອຍກິນເຂົ້າ", "ລາວໄປໂຮງຮຽນ"] },
    { key: "exEn", header: "ExampleEnglish", alias: ["example english", "example translation"], help: "Its English translation", ex: ["I eat rice", "He goes to school"] },
    { key: "access", header: "Access", alias: ["plan", "tier"], list: ACCESS, help: "public, free, standard or premium (default free)", ex: ["free", "free"] }
  ] },
  grammar: { label: "Grammar", lo: "ໄວຍາກອນ", columns: [
    { key: "titleEn", header: "Title_EN", alias: ["title", "title en", "english title"], required: true, help: "Title in English (or Title_LO)", ex: ["Asking yes/no questions with ບໍ", "Past with ແລ້ວ"] },
    { key: "titleLo", header: "Title_LO", alias: ["title lo", "lao title", "ຫົວຂໍ້"], help: "Title in Lao", ex: ["ຄຳຖາມ ບໍ", "ອະດີດດ້ວຍ ແລ້ວ"] },
    { key: "titleZh", header: "Title_ZH", alias: ["title zh", "chinese title"], help: "Title in Chinese (optional)", ex: ["", ""] },
    { key: "structure", header: "Structure", alias: ["formula", "ໂຄງສ້າງ"], help: "e.g. S + V + O + ບໍ", ex: ["S + V + O + ບໍ", "S + V + ແລ້ວ"] },
    { key: "exEn", header: "Explanation_EN", alias: ["explanation", "explanation en", "explain"], help: "Explanation in English", ex: ["Put ບໍ at the end to ask a yes/no question.", "ແລ້ວ after the verb shows the action is done."] },
    { key: "exLo", header: "Explanation_LO", alias: ["explanation lo", "ຄຳອະທິບາຍ"], help: "Explanation in Lao", ex: ["ໃສ່ ບໍ ທ້າຍປະໂຫຍກເພື່ອຖາມ.", ""] },
    { key: "exZh", header: "Explanation_ZH", alias: ["explanation zh"], help: "Explanation in Chinese (optional)", ex: ["", ""] },
    { key: "stage", header: "Stage", alias: ["level"], list: STAGES, help: "1 to 6 (default 1)", ex: ["1", "1"] },
    { key: "examples", header: "Examples", alias: ["example", "examples lao"], help: "Lao example sentences, separated by ; or a new line", ex: ["ເຈົ້າສະບາຍດີບໍ; ເຈົ້າກິນເຂົ້າບໍ", "ຂ້ອຍກິນແລ້ວ"] },
    { key: "examplesEn", header: "Examples_EN", alias: ["examples english", "example english"], help: "Their English translations, in the same order", ex: ["Are you well?; Do you eat rice?", "I have eaten."] }
  ] },
  patterns: { label: "Sentence patterns", lo: "ໂຄງສ້າງປະໂຫຍກ", columns: [
    { key: "lao", header: "Pattern_Lao", alias: ["pattern", "hz", "lao"], required: true, help: "The pattern in Lao, e.g. ຢາກ…", ex: ["ຢາກ…", "…ໄດ້ບໍ"] },
    { key: "py", header: "Romanization", alias: ["py", "roman"], help: "Leave empty to make it automatically", ex: ["yàak…", ""] },
    { key: "formula", header: "Formula", alias: ["structure"], help: "e.g. S + ຢາກ + V + O", ex: ["S + ຢາກ + V + O", "S + V + ໄດ້ບໍ"] },
    { key: "en", header: "English_Gloss", alias: ["meaning", "english", "gloss"], help: "What it means in English", ex: ["want to", "can …?"] },
    { key: "lo", header: "Lao_Meaning", alias: ["lao meaning"], help: "Meaning in Lao (optional)", ex: ["ຕ້ອງການ", ""] },
    { key: "zh", header: "Chinese", alias: ["chinese meaning"], help: "Meaning in Chinese (optional)", ex: ["想", "能…吗"] },
    { key: "stage", header: "Stage", alias: ["level"], list: STAGES, help: "1 to 6 (default 1)", ex: ["1", "1"] },
    { key: "ex1", header: "Example1", alias: ["example"], help: "Example sentence in Lao", ex: ["ຂ້ອຍຢາກກິນເຂົ້າ", "ເຈົ້າເວົ້າພາສາລາວໄດ້ບໍ"] },
    { key: "ex1En", header: "Example1_EN", alias: ["example1 english"], help: "Its English translation", ex: ["I want to eat rice.", "Can you speak Lao?"] },
    { key: "ex2", header: "Example2", alias: [], help: "Another example (optional)", ex: ["ເຈົ້າຢາກດື່ມນ້ຳບໍ", ""] },
    { key: "ex2En", header: "Example2_EN", alias: ["example2 english"], help: "Its English translation", ex: ["Do you want to drink water?", ""] },
    { key: "ex3", header: "Example3", alias: [], help: "Another example (optional)", ex: ["", ""] },
    { key: "ex3En", header: "Example3_EN", alias: ["example3 english"], help: "Its English translation", ex: ["", ""] }
  ] }
};

// ---------- templates ----------
// Two sheets: "Data" (headers + 2 sample rows to overwrite) and "Guide" (what each column means)
export function templateSheets(type){
  const T = TYPES[type], cols = T.columns;
  const lists = {}; cols.forEach((c, i) => { if (c.list) lists[i] = c.list; });
  return [
    { name: "Data", header: true, rows: [cols.map(c => c.header), cols.map(c => c.ex[0]), cols.map(c => c.ex[1])], widths: cols.map(c => Math.max(12, Math.min(40, c.header.length + 6, ...c.ex.map(x => String(x).length + 4)))), lists },
    { name: "Guide", header: true, rows: [["Column", "Required", "What to write"], ...cols.map(c => [c.header, c.required ? "yes" : "", c.help]),
      [], ["", "", "Fill the Data sheet (one row per item) and upload this file. Delete the two sample rows first."],
      ["", "", "Columns can be in any order; extra columns are ignored. A blank cell keeps the current value of an existing item."],
      ["", "", "Save as Excel (.xlsx). If you save as CSV, choose 'CSV UTF-8' so the Lao letters are kept."]], widths: [18, 10, 90] }
  ];
}

// ---------- headers ----------
const norm = s => String(s || "").toLowerCase().replace(/^﻿/, "").replace(/[\s_\-.:()]+/g, "");
export function matchHeaders(headerRow, type){
  const cols = TYPES[type].columns, map = {}, used = new Set();
  headerRow.forEach((hd, i) => {
    const n = norm(hd); if (!n) return;
    const c = cols.find(c => !(c.key in map) && (norm(c.header) === n || c.alias.some(a => norm(a) === n)));
    if (c){ map[c.key] = i; used.add(i); }
  });
  const unknown = headerRow.map((hd, i) => [hd, i]).filter(([hd, i]) => String(hd || "").trim() && !used.has(i)).map(([hd]) => String(hd).trim());
  const missing = cols.filter(c => c.required && !(c.key in map)).map(c => c.header);
  return { map, unknown, missing };
}
// is the header row of another content type? (e.g. a grammar file uploaded as vocabulary)
export function guessType(headerRow){
  let best = null, score = 0;
  for (const type in TYPES){ const m = matchHeaders(headerRow, type); const s = Object.keys(m.map).length - m.missing.length * 3; if (s > score){ score = s; best = type; } }
  return best;
}

// ---------- rows ----------
const cell = (row, map, key) => key in map ? String(row[map[key]] ?? "").trim() : "";
const lostLao = s => /\?{2,}/.test(s) && !LAO.test(s);
const splitList = s => String(s || "").split(/\s*(?:;|\n|\r)\s*/).map(x => x.trim()).filter(Boolean);
const slug = s => String(s || "").toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40);

// Checks every row. existing: the items already in the database (array). Returns rows with
// { line (spreadsheet row number), action: "new" | "update" | "error", errors[], warnings[], fields }
export function validateRows(rows, type, { existing = [] } = {}){
  const head = rows[0] || [], H = matchHeaders(head, type), out = [];
  const seen = new Map();
  const byLao = new Map(existing.map(d => [String(d.hz || "").trim(), d]));
  const byTitle = new Map(existing.map(d => [String((d.title && (d.title.en || d.title.lo)) || "").trim().toLowerCase(), d]));
  for (let i = 1; i < rows.length; i++){
    const r = rows[i], line = i + 1, errors = [], warnings = [], f = {};
    for (const c of TYPES[type].columns) f[c.key] = cell(r, H.map, c.key);
    if (!Object.values(f).some(Boolean)) continue;                                  // empty row
    // checks shared by every type
    const lost = TYPES[type].columns.filter(c => f[c.key] && lostLao(f[c.key])).map(c => c.header);
    if (lost.length) errors.push({ col: lost.join(", "), code: "lao_lost" });
    if (f.stage){ const n = String(parseInt(f.stage, 10)); if (!STAGES.includes(n) || String(+f.stage) !== n) errors.push({ col: "Stage", code: "stage", value: f.stage }); else f.stage = n; }
    let key, match;
    if (type === "vocabulary"){
      if (!f.lao) errors.push({ col: "Lao", code: "required" });
      else if (!LAO.test(f.lao)) errors.push({ col: "Lao", code: "not_lao", value: f.lao });
      if (!f.en && !f.lo && !f.zh) errors.push({ col: "English", code: "meaning" });
      if (f.pos){ const p = f.pos.toLowerCase(); const m = POS.includes(p) ? p : POS_NAMES[p]; if (m) f.pos = m; else { warnings.push({ col: "PartOfSpeech", code: "pos", value: f.pos }); f.pos = ""; } }
      if (f.access){ const a = f.access.toLowerCase(); if (ACCESS.includes(a)) f.access = a; else errors.push({ col: "Access", code: "access", value: f.access }); }
      if (f.exLo && !LAO.test(f.exLo)) warnings.push({ col: "ExampleLao", code: "not_lao", value: f.exLo });
      key = f.lao; match = byLao.get(f.lao);
    } else if (type === "grammar"){
      if (!f.titleEn && !f.titleLo) errors.push({ col: "Title_EN", code: "required" });
      if (!f.exEn && !f.exLo && !f.exZh) warnings.push({ col: "Explanation_EN", code: "no_explain" });
      const ex = splitList(f.examples), exEn = splitList(f.examplesEn);
      if (exEn.length && exEn.length !== ex.length) warnings.push({ col: "Examples_EN", code: "count", value: ex.length + "/" + exEn.length });
      key = (f.titleEn || f.titleLo).toLowerCase(); match = byTitle.get(key);
    } else {
      if (!f.lao) errors.push({ col: "Pattern_Lao", code: "required" });
      else if (!LAO.test(f.lao)) errors.push({ col: "Pattern_Lao", code: "not_lao", value: f.lao });
      if (!f.en && !f.lo && !f.zh) warnings.push({ col: "English_Gloss", code: "meaning" });
      for (const k of ["ex1", "ex2", "ex3"]) if (f[k] && !LAO.test(f[k])) warnings.push({ col: k.replace("ex", "Example"), code: "not_lao", value: f[k] });
      key = f.lao; match = byLao.get(f.lao);
    }
    // when the Lao letters were lost, "not Lao" and "duplicate" would only repeat the same problem
    if (lost.length){ for (const list of [errors, warnings]) for (let k = list.length - 1; k >= 0; k--) if (list[k].code === "not_lao") list.splice(k, 1); key = null; }
    if (key){ if (seen.has(key)) errors.push({ col: TYPES[type].columns[0].header, code: "duplicate", value: seen.get(key) }); else seen.set(key, line); }
    out.push({ line, fields: f, errors, warnings, existing: match || null, action: errors.length ? "error" : match ? "update" : "new" });
  }
  const sum = { rows: out.length, new: out.filter(x => x.action === "new").length, update: out.filter(x => x.action === "update").length,
    error: out.filter(x => x.action === "error").length, warnings: out.reduce((n, x) => n + x.warnings.length, 0) };
  return { headers: H, rows: out, summary: sum };
}

// ---------- row → stored content ----------
// romanize(text) → { py, tokens } (optional; fills blank romanization). Returns { id, data }. For an update, `data` is the
// existing item with only the filled-in cells changed.
export function toContent(item, type, { romanize, nextN, status = "published", who = "", now = new Date() } = {}){
  const f = item.fields, prev = item.existing, base = prev ? JSON.parse(JSON.stringify(prev)) : {};
  delete base.id; delete base.key;
  const set = (obj, path, v) => { if (v === "" || v == null) return; const ks = path.split("."); let o = obj; ks.slice(0, -1).forEach(k => { o[k] = o[k] && typeof o[k] === "object" ? o[k] : {}; o = o[k]; }); o[ks[ks.length - 1]] = v; };
  const sentence = (lo, en) => { const s = { zh: lo, py: "", tr: en ? { en } : {} }; if (romanize){ try { const r = romanize(lo); s.py = r.py || ""; if (r.tokens) s.tokens = r.tokens; } catch(e){} } return s; };
  const pyOf = t => { if (!romanize) return ""; try { return String(romanize(t).py || "").toLowerCase(); } catch(e){ return ""; } };
  let id, d = base;
  if (type === "vocabulary"){
    id = prev ? prev.id : f.lao;
    set(d, "hz", f.lao);
    set(d, "py", f.py || (prev && prev.py ? "" : pyOf(f.lao)));
    set(d, "pos", f.pos || (prev ? "" : "n"));
    set(d, "level", f.stage ? +f.stage : (prev ? null : 1));
    set(d, "tr.en.meaning", f.en); set(d, "tr.lo.meaning", f.lo); set(d, "tr.zh.meaning", f.zh);
    if (f.tags) d.tags = f.tags.split(/[,;]/).map(x => x.trim()).filter(Boolean);
    if (f.exLo){ const ex = sentence(f.exLo, f.exEn); d.examples = [ex, ...((prev && prev.examples) || []).filter(e => e.zh !== f.exLo)]; }
    set(d, "access", f.access || (prev ? "" : "free"));
    if (!prev){ d.tr = Object.assign({ en: { meaning: "" }, lo: { meaning: "" }, zh: { meaning: "" } }, d.tr); d.examples = d.examples || []; d.tags = d.tags || []; }
  } else if (type === "grammar"){
    id = prev ? prev.id : "g-" + (slug(f.titleEn) || slug(f.titleLo) || Date.now().toString(36));
    set(d, "title.en", f.titleEn); set(d, "title.lo", f.titleLo); set(d, "title.zh", f.titleZh);
    set(d, "structure", f.structure);
    set(d, "level", f.stage ? +f.stage : (prev ? null : 1));
    set(d, "tr.en.explain", f.exEn); set(d, "tr.lo.explain", f.exLo); set(d, "tr.zh.explain", f.exZh);
    const ex = splitList(f.examples), exEn = splitList(f.examplesEn);
    if (ex.length) d.examples = ex.map((lo, i) => sentence(lo, exEn[i] || ""));
    if (!prev){ d.title = Object.assign({ en: "", lo: "", zh: "" }, d.title); d.tr = Object.assign({ en: { explain: "", usage: [] }, lo: { explain: "", usage: [] }, zh: { explain: "", usage: [] } }, d.tr);
      ["en", "lo", "zh"].forEach(k => { d.tr[k] = Object.assign({ explain: "", usage: [] }, d.tr[k]); }); d.examples = d.examples || []; d.mistakes = []; d.patterns = []; }
  } else {
    const n = prev ? prev.n : nextN;
    id = prev ? prev.id : "p" + String(n).padStart(3, "0");
    set(d, "n", n); set(d, "hz", f.lao);
    set(d, "py", f.py || (prev && prev.py ? "" : pyOf(f.lao.replace(/…/g, " "))));
    set(d, "formula", f.formula); set(d, "gloss", f.en);
    set(d, "level", f.stage ? +f.stage : (prev ? null : 1));
    set(d, "tr.en.meaning", f.en); set(d, "tr.lo.meaning", f.lo); set(d, "tr.zh.meaning", f.zh);
    const ex = [["ex1", "ex1En"], ["ex2", "ex2En"], ["ex3", "ex3En"]].filter(([a]) => f[a]).map(([a, b]) => sentence(f[a], f[b]));
    if (ex.length) d.examples = ex;
    if (!prev){ d.sec = "A"; d.mistake = null; d.gen = []; d.examples = d.examples || []; d.tr = Object.assign({ en: { meaning: "", how: "", note: "" }, lo: { meaning: "" }, zh: {} }, d.tr); d.tr.en = Object.assign({ meaning: "", how: "", note: "" }, d.tr.en); }
  }
  if (!prev){ d.status = status; d.version = 1; d.createdAt = now; d.createdBy = who; }
  else d.version = (prev.version || 1) + 1;
  d.updatedAt = now; d.updatedBy = who;
  return { id, data: d };
}

// readable messages for the page
export const MESSAGES = {
  required: "Required", not_lao: "This should be Lao script", meaning: "Give a meaning in English, Lao or Chinese",
  stage: "Stage must be a whole number from 1 to 6", access: "Use public, free, standard or premium", pos: "Unknown part of speech: it will be left as it is",
  duplicate: "The same item is already on row %v of this file", lao_lost: "The Lao letters were lost (shown as ???). Save the file as Excel (.xlsx) or CSV UTF-8",
  no_explain: "No explanation yet", count: "Examples and translations don't line up (%v)"
};
export const message = x => (MESSAGES[x.code] || x.code).replace("%v", x.value ?? "");
