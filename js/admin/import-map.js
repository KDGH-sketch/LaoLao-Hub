// Spreadsheet import rules: template columns, matching the file's headers, checking every row, turning rows into the
// content the app stores (buildItems) and content back into rows (exportSheets). Vocabulary, Grammar and Sentence
// Patterns are defined here; Dictionary, Lessons, Dialogues, Quizzes, Videos, Culture and Lao letters in
// import-types.js. No page code here (tests: scripts/test_import.mjs).
// Rule of thumb: a blank cell never wipes what an existing item already has.
import { MORE_TYPES, MORE_MESSAGES, splitList as splitL } from "./import-types.js";

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
Object.assign(TYPES, MORE_TYPES);
// the order in the importer
export const TYPE_ORDER = ["vocabulary", "dictionary", "grammar", "patterns", "lessons", "dialogues", "quizzes", "videos", "culture", "characters"];

// ---------- templates ----------
// Two sheets: "Data" (headers + sample rows to overwrite) and "Guide" (what each column means)
export function templateSheets(type){
  const T = TYPES[type], cols = T.columns, n = Math.max(...cols.map(c => c.ex.length));
  const lists = {}; cols.forEach((c, i) => { if (c.list) lists[i] = c.list; });
  return [
    { name: "Data", header: true, rows: [cols.map(c => c.header), ...Array.from({ length: n }, (_, k) => cols.map(c => c.ex[k] ?? ""))], widths: cols.map(c => Math.max(12, Math.min(40, c.header.length + 6, ...c.ex.map(x => String(x).split("\n")[0].length + 4)))), lists },
    { name: "Guide", header: true, rows: [["Column", "Required", "What to write"], ...cols.map(c => [c.header, c.required ? "yes" : "", c.help]),
      [], ["", "", T.grouped ? "One row per " + (type === "quizzes" ? "question" : "line") + ". Rows with the same ID (or an empty ID, continuing the item above) make one item; on an update the item's " + (type === "quizzes" ? "questions" : "lines") + " are replaced." : "Fill the Data sheet (one row per item) and upload this file."],
      ["", "", "Delete the sample rows first (they show how to fill the sheet)."],
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
export function validateRows(rows, type, { existing = [], refs = null } = {}){
  if (TYPES[type].check) return validateGeneric(rows, type, { existing, refs });
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

// Types defined with check() / build(): one row per item, or several (grouped: dialogues, quizzes)
function validateGeneric(rows, type, { existing, refs }){
  const T = TYPES[type], head = rows[0] || [], H = matchHeaders(head, type), out = [], seen = new Map();
  const by1 = new Map(existing.map(d => [String((T.existingKey || (x => x.id))(d) || ""), d]));
  const by2 = T.existingKey2 ? new Map(existing.map(d => [String(T.existingKey2(d) || ""), d])) : null;
  let lastGroup = null, lastHead = null;
  for (let i = 1; i < rows.length; i++){
    const r = rows[i], line = i + 1, errors = [], warnings = [], f = {};
    for (const c of T.columns) f[c.key] = cell(r, H.map, c.key);
    if (!Object.values(f).some(Boolean)) continue;
    const lost = T.columns.filter(c => f[c.key] && lostLao(f[c.key])).map(c => c.header);
    if (lost.length) errors.push({ col: lost.join(", "), code: "lao_lost" });
    if (f.stage){ const n = String(parseInt(f.stage, 10)); if (!STAGES.includes(n) || String(+f.stage) !== n) errors.push({ col: "Stage", code: "stage", value: f.stage }); else f.stage = n; }
    // grouped: a row without its own ID / title continues the item above (and shares its title, stage…)
    let group = null;
    if (T.grouped){
      group = T.group(f) || lastGroup;
      if (!group) errors.push({ col: T.columns[0].header, code: "required" });
      else if (group === lastGroup && lastHead && !T.group(f)) for (const k of T.groupHead) if (!f[k]) f[k] = lastHead[k];
      if (T.group(f)){ lastHead = f; } lastGroup = group;
    }
    T.check(f, { errors, warnings, refs });
    if (lost.length){ for (const list of [errors, warnings]) for (let k = list.length - 1; k >= 0; k--) if (list[k].code === "not_lao") list.splice(k, 1); }
    const key = T.grouped ? group : T.key(f);
    // a row with its own ID matches only that ID; only rows without an ID fall back to the title
    // (otherwise "d-taxi · Taking a tuk-tuk" would overwrite another dialogue that happens to share the title)
    const ownId = T.grouped ? (T.group(f) ? f.id : lastHead && lastHead.id) : f.id;
    const match = key ? (by1.get(String(key)) || (!ownId && by2 && T.key2 && by2.get(String(T.key2(f) || "")) ) || null) : null;
    if (!T.grouped && key && !lost.length){ if (seen.has(key)) errors.push({ col: T.columns[0].header, code: "duplicate", value: seen.get(key) }); else seen.set(key, line); }
    out.push({ line, fields: f, errors, warnings, group, existing: match, action: errors.length ? "error" : match ? "update" : "new" });
  }
  // grouped: one bad row stops its whole item (half a dialogue or quiz is worse than none)
  if (T.grouped){
    const badAt = new Map(); out.forEach(x => { if (x.errors.length && !badAt.has(x.group)) badAt.set(x.group, x.line); });
    out.forEach(x => { if (badAt.has(x.group) && !x.errors.length){ x.errors.push({ col: "", code: "group_error", value: badAt.get(x.group) }); x.action = "error"; } });
    // an item that was matched on its first row is an update on all its rows
    const m = new Map(); out.forEach(x => { if (!m.has(x.group)) m.set(x.group, x.existing); });
    out.forEach(x => { x.existing = m.get(x.group) || null; if (x.action !== "error") x.action = x.existing ? "update" : "new"; });
  }
  const items = T.grouped ? [...new Map(out.map(x => [x.group, x])).values()] : out;
  const sum = { rows: out.length, new: items.filter(x => x.action === "new").length, update: items.filter(x => x.action === "update").length,
    error: out.filter(x => x.action === "error").length, warnings: out.reduce((n, x) => n + x.warnings.length, 0), items: items.length, grouped: !!T.grouped };
  return { headers: H, rows: out, summary: sum };
}

// Checked rows → the items to save: [{ id, data, existing, lines }]. Rows with errors are left out (grouped: whole items).
export function buildItems(check, type, { romanize, nextN = 1, status = "published", who = "", now = new Date(), withUpdates = true, classOf } = {}){
  const T = TYPES[type], ok = check.rows.filter(r => r.action === "new" || (withUpdates && r.action === "update"));
  if (!T.build){
    let n = nextN;
    return ok.map(r => { const c = toContent(r, type, { romanize, nextN: n, status, who, now }); if (type === "patterns" && !r.existing) n++; return Object.assign(c, { existing: r.existing, lines: [r.line] }); });
  }
  const ctx = { classOf,
    pyOf: (text, sentenceCase) => { if (!romanize) return ""; try { const p = String(romanize(text).py || ""); return sentenceCase ? p : p.toLowerCase(); } catch(e){ return ""; } },
    sentence: (lo, en) => { const s = { zh: lo, py: "", tr: en ? { en } : {} }; if (romanize){ try { const r = romanize(lo); s.py = r.py || ""; if (r.tokens) s.tokens = r.tokens; } catch(e){} } return s; } };
  const groups = new Map();
  for (const r of ok){ const k = T.grouped ? r.group : r.line; if (!groups.has(k)) groups.set(k, []); groups.get(k).push(r); }
  return [...groups.values()].map(rs => {
    const prev = rs[0].existing ? JSON.parse(JSON.stringify(rs[0].existing)) : null;
    if (prev){ delete prev.key; }
    const c = T.build(rs.map(r => r.fields), prev, ctx), d = c.data;
    delete d.id;
    if (!prev){ d.status = status; d.version = 1; d.createdAt = now; d.createdBy = who; d.access = d.access || "free"; }
    else d.version = (prev.version || 1) + 1;
    d.updatedAt = now; d.updatedBy = who;
    return { id: c.id, data: d, existing: rs[0].existing, lines: rs.map(r => r.line) };
  });
}

// Items → a workbook to edit in Excel and import again (the same columns as the template)
const OLD_ROWS = {
  vocabulary: d => [{ lao: d.hz, py: d.py, en: tro(d, "en", "meaning"), lo: tro(d, "lo", "meaning"), zh: tro(d, "zh", "meaning"), pos: d.pos, stage: d.level, tags: (d.tags || []).join(", "),
    exLo: (d.examples || [])[0] && d.examples[0].zh, exEn: (d.examples || [])[0] && ((d.examples[0].tr || {}).en || d.examples[0].en), access: d.access }],
  grammar: d => [{ titleEn: (d.title || {}).en, titleLo: (d.title || {}).lo, titleZh: (d.title || {}).zh, structure: d.structure, exEn: tro(d, "en", "explain") || (d.body && d.body.en), exLo: tro(d, "lo", "explain") || (d.body && d.body.lo),
    exZh: tro(d, "zh", "explain"), stage: d.level, examples: (d.examples || []).map(e => e.zh).join("; "), examplesEn: (d.examples || []).map(e => (e.tr || {}).en || e.en || "").join("; ") }],
  patterns: d => [Object.assign({ lao: d.hz, py: d.py, formula: d.formula, en: tro(d, "en", "meaning") || d.gloss, lo: tro(d, "lo", "meaning"), zh: tro(d, "zh", "meaning"), stage: d.level },
    ...[0, 1, 2].map(k => { const e = (d.examples || [])[k]; return e ? { ["ex" + (k + 1)]: e.zh, ["ex" + (k + 1) + "En"]: (e.tr || {}).en || e.en || "" } : {}; }))]
};
const tro = (d, l, k) => (d.tr && d.tr[l] && d.tr[l][k]) || "";
export function exportSheets(type, docs){
  const T = TYPES[type], toRows = T.toRows || OLD_ROWS[type];
  const sorted = docs.slice().sort((a, b) => ((a.level || 0) - (b.level || 0)) || ((a.n || 0) - (b.n || 0)) || ((a.order || 0) - (b.order || 0)) || String(a.id).localeCompare(String(b.id)));
  const body = sorted.flatMap(d => toRows(d)).map(o => T.columns.map(c => o[c.key] == null ? "" : String(o[c.key])));
  const sheets = templateSheets(type);
  sheets[0].rows = [sheets[0].rows[0], ...body];
  return sheets;
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
Object.assign(MESSAGES, MORE_MESSAGES);
export const message = x => (MESSAGES[x.code] || x.code).replace("%v", x.value ?? "");
