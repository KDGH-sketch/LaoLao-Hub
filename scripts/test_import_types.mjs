// Spreadsheet import / export for every content type (js/admin/import-map.js + import-types.js): each template's sample
// rows import cleanly, the stored items have the shape the app reads, bad rows are caught with a reason, grouped items
// (dialogues, quizzes) group correctly, and export → import gives the same content back.
// Run: node scripts/test_import_types.mjs
import { writeXlsx, readXlsx } from "../js/shared/sheet-io.js";
import { TYPES, TYPE_ORDER, templateSheets, validateRows, buildItems, exportSheets, message } from "../js/admin/import-map.js";
import { parseTimedLines } from "../js/admin/import-types.js";
import { CLASS_OF } from "../js/shared/lao-script.js";

let failed = 0;
const ok = (c, m, d) => { console.log((c ? "  PASS " : "  FAIL ") + m + (!c && d !== undefined ? "  → " + JSON.stringify(d).slice(0, 400) : "")); if (!c) failed++; };
const ab = u8 => u8.buffer.slice(u8.byteOffset, u8.byteOffset + u8.byteLength);
const rom = t => ({ py: "R(" + t + ")" });
const opts = { romanize: rom, who: "admin", now: new Date("2026-10-10"), classOf: c => CLASS_OF[c] || "" };
const head = type => TYPES[type].columns.map(c => c.header);
const row = (type, o) => TYPES[type].columns.map(c => o[c.header] ?? "");

console.log("every type: the template imports cleanly");
ok(TYPE_ORDER.length === 10 && TYPE_ORDER.every(t => TYPES[t]), "10 content types can be imported", TYPE_ORDER);
const built = {};
for (const type of TYPE_ORDER){
  const sheet = (await readXlsx(ab(writeXlsx(templateSheets(type)))))[0];
  const v = validateRows(sheet.rows, type, {});
  const items = buildItems(v, type, opts);
  built[type] = items;
  ok(v.summary.error === 0 && items.length >= (type === "quizzes" ? 1 : 2) && items.every(i => i.id && i.data.status === "published" && i.data.version === 1),
    type + ": " + (sheet.rows.length - 1) + " sample rows → " + items.length + " items, no errors", { sum: v.summary, errs: v.rows.filter(r => r.errors.length).map(r => r.line + ":" + r.errors.map(message).join("/")) });
}

console.log("\nthe stored shape");
const dic = built.dictionary[0].data;
ok(dic.hz === "ເຮືອນ" && dic.p === "hʉ́an" && dic.pos === "n" && dic.en === "house, home" && dic.examples[0].tr.en === "My house is near the market.", "dictionary entry", dic);
ok(built.dictionary[1].data.pos === "v" && built.dictionary[1].data.p === "r(ແລ່ນ)", "'verb' → v, romanization made automatically");
const les = built.lessons[0].data;
ok(built.lessons[0].id === "l-market" && les.title.lo === "ຢູ່ຕະຫຼາດ" && les.vocab.join() === "ຕະຫຼາດ,ລາຄາ,ເທົ່າໃດ" && les.patterns.join() === "4" && les.objectives.en.length === 2 && les.access === "free",
  "lesson: id, title, words, pattern numbers, objectives", les);
ok(built.lessons[1].id === "l-family", "a lesson without an ID gets one from its title");
const dlg = built.dialogues[0];
ok(built.dialogues.length === 2 && dlg.id === "d-taxi" && dlg.data.lines.length === 3 && dlg.data.lines[1].sp === "B" && dlg.data.lines[1].tr.en === "Fifty thousand kip." && dlg.data.title.en === "Taking a tuk-tuk",
  "dialogues: 5 rows → 2 dialogues (3 + 2 lines), speakers and translations", dlg);
ok(dlg.data.lines[0].py === "R(ໄປຕະຫຼາດເຊົ້າເທົ່າໃດ?)", "line romanization made automatically (sentence case kept)");
const qz = built.quizzes[0].data.questions;
ok(built.quizzes.length === 1 && qz.length === 6 && qz.map(q => q.type).join() === "mc,fill,listen_select,type,flashcard,order", "quiz: 6 questions, one of each type", qz.map(q => q.type));
ok(qz[0].options.length === 4 && qz[0].answer === 0 && qz[0].options[0].en === "five" && qz[0].prompt.zh === "ຫ້າ" && qz[0].skill === "reading" && qz[0].explain.en === "ຫ້າ = 5", "mc: options, answer by text, prompt, skill, explanation", qz[0]);
ok(qz[1].answer === 0 && qz[1].options[0].zh === "ສອງ" && /___/.test(qz[1].prompt.zh), "fill: answer by number (1), Lao options", qz[1]);
ok(qz[2].options.every(o => o.zh) && qz[2].answer === 0 && !qz[2].prompt.py, "listen: Lao options, no romanization shown", qz[2]);
ok(qz[3].accept.join() === "ສາມ" && qz[3].mode === "script", "type: accepted answers, checked as Lao script", qz[3]);
ok(qz[4].back.en === "ten" && qz[4].prompt.zh === "ສິບ", "flashcard: front Lao, back meaning", qz[4]);
ok(qz[5].tokens.join("|") === "ຂ້ອຍ|ມີ|ແມວ|ສອງ|ໂຕ" && qz[5].answer === "ຂ້ອຍມີແມວສອງໂຕ" && qz[5].prompt.tr.en === "I have two cats", "order: tokens, answer, translation", qz[5]);
const vid = built.videos[0].data;
ok(vid.embedUrl === "https://www.youtube.com/watch?v=j7TToA_jaMg" && vid.transcript.length === 2 && vid.transcript[1].start === 4 && vid.transcript[1].en === "How much is this?" && vid.recap.summary.en && vid.difficulty === "Stage 1 · Conversation",
  "video: link, timed transcript (with romanization | English), recap, badge", vid);
const cul = built.culture[0].data;
ok(cul.keyTips.length === 2 && cul.vocab[0].lao === "ບາສີ" && cul.vocab[0].en === "baci ceremony" && cul.category === "traditions", "culture: tips and words", cul);
const ch = built.characters;
ok(ch[0].id === "char-ກ" && ch[0].data.class === "middle" && ch[1].data.class === "high" && ch[0].data.final === "k", "letters: id, class worked out from the letter (ກ middle, ຂ high)", ch.map(x => x.data));

console.log("\nmistakes are caught");
const bad = (type, o) => validateRows([head(type), row(type, o)], type, {}).rows[0];
let r = bad("quizzes", { QuizID: "q1", Type: "mc", Question: "?", Options: "a | b", Answer: "c" });
ok(r.action === "error" && r.errors.some(e => e.code === "answer_not_option"), "quiz: the answer must be one of the options → " + message(r.errors[0]), r.errors);
r = bad("quizzes", { QuizID: "q1", Type: "essay" });
ok(r.errors.some(e => e.code === "qtype"), "quiz: unknown question type → " + message(r.errors[0]));
r = bad("quizzes", { QuizID: "q1", Type: "fill", Lao: "ຂ້ອຍກິນເຂົ້າ", Options: "a | b", Answer: "1" });
ok(r.errors.some(e => e.code === "no_blank"), "quiz fill: the gap ___ is required");
r = bad("quizzes", { QuizID: "q1", Type: "order", Lao: "ຂ້ອຍກິນ" });
ok(r.errors.some(e => e.code === "order_words"), "quiz order: at least three words");
r = bad("videos", { Title_EN: "x", URL: "https://example.com/page" });
ok(r.errors.some(e => e.code === "url"), "video: a link that is not YouTube or a video file → " + message(r.errors.find(e => e.code === "url")));
r = bad("videos", { Title_EN: "x", URL: "https://youtu.be/abc", Transcript: "0:00 ສະບາຍດີ\nno time here" });
ok(r.action === "new" && r.warnings.some(e => e.code === "transcript_lines" && e.value === "2"), "video: transcript lines without a time are flagged (line 2), the rest imported");
r = bad("lessons", { Title_EN: "x", Patterns: "1; four" });
ok(r.errors.some(e => e.code === "pattern_num"), "lesson: pattern numbers only");
const withRefs = validateRows([head("lessons"), row("lessons", { Title_EN: "x", Patterns: "1; 99", Grammar: "g-nope" })], "lessons", { refs: { patterns: new Set(["1"]), grammar: new Set(["g01"]), dialogues: new Set(), quizzes: new Set() } }).rows[0];
ok(withRefs.action === "new" && withRefs.warnings.some(w => w.code === "unknown_ref" && w.value === "99") && withRefs.warnings.some(w => w.value === "g-nope"), "lesson: links to patterns or grammar that don't exist are warned about", withRefs.warnings);
r = bad("characters", { Letter: "k" });
ok(r.errors.some(e => e.code === "not_lao"), "letter: must be Lao script");
r = bad("culture", { Title_EN: "x", Category: "sports" });
ok(r.errors.some(e => e.code === "category"), "culture: unknown category");
r = bad("dictionary", { Lao: "ກິນ" });
ok(r.errors.some(e => e.code === "meaning"), "dictionary: a meaning is required");

console.log("\ngrouped items");
const dl = validateRows([head("dialogues"), row("dialogues", { DialogueID: "d1", Title_EN: "T", Speaker: "A", Lao: "ສະບາຍດີ" }), row("dialogues", { Speaker: "B", Lao: "hello" }),
  row("dialogues", { DialogueID: "d2", Title_EN: "U", Lao: "ຂອບໃຈ" })], "dialogues", {});
ok(dl.rows[0].action === "error" && dl.rows[0].errors[0].code === "group_error" && dl.rows[1].errors.some(e => e.code === "not_lao") && dl.rows[2].action === "new",
  "one bad line stops its whole dialogue; the next dialogue still imports", dl.rows.map(x => x.action));
ok(dl.summary.items === 2 && dl.summary.new === 1, "summary counts dialogues, not rows", dl.summary);
const upd = validateRows([head("dialogues"), row("dialogues", { DialogueID: "d-old", Lao: "ສະບາຍດີ" }), row("dialogues", { Lao: "ຂອບໃຈ" })], "dialogues",
  { existing: [{ id: "d-old", title: { en: "Old", lo: "ເກົ່າ" }, level: 2, version: 3, lines: [{ zh: "x" }], status: "published", createdAt: "c" }] });
const ui = buildItems(upd, "dialogues", opts)[0];
ok(upd.summary.update === 1 && ui.data.lines.length === 2 && ui.data.title.en === "Old" && ui.data.level === 2 && ui.data.version === 4 && ui.data.createdAt === "c", "an existing dialogue: lines replaced, title / stage / created kept, version +1", ui.data);

console.log("\nexport → import gives the same content");
for (const type of TYPE_ORDER){
  const docs = built[type].map(i => Object.assign({ id: i.id }, i.data));
  const sheets = exportSheets(type, docs);
  const back = validateRows((await readXlsx(ab(writeXlsx(sheets))))[0].rows, type, { existing: docs });
  const again = buildItems(back, type, opts);
  const same = again.length === docs.length && again.every(a => { const d = docs.find(x => x.id === a.id); if (!d) return false;
    const strip = o => { const c = JSON.parse(JSON.stringify(o)); for (const k of ["version", "updatedAt", "updatedBy", "createdAt", "createdBy", "id"]) delete c[k]; return JSON.stringify(c); };
    return strip(a.data) === strip(d); });
  ok(back.summary.error === 0 && back.summary.update === docs.length && same, type + ": exported " + docs.length + " → re-imported as updates with identical content",
    { sum: back.summary, diff: again.map(a => { const d = docs.find(x => x.id === a.id); return d ? [a.id, JSON.stringify(a.data).slice(0, 120), JSON.stringify(d).slice(0, 120)] : a.id; }).slice(0, 1) });
}
ok(parseTimedLines("[1:02:03] ສະບາຍດີ").lines[0].start === 3723, "transcript times with hours");

// a row with its own ID never overwrites a different item that only shares the title
const other = [{ id: "d-c1-19", title: { en: "Taking a tuk-tuk" }, lines: [] }];
const dlgRows = rows => validateRows([head("dialogues"), ...rows.map(o => row("dialogues", o))], "dialogues", { existing: other }).rows;
r = dlgRows([{ DialogueID: "d-taxi", Title_EN: "Taking a tuk-tuk", Speaker: "A", Lao: "ໄປ ຕະຫຼາດ" }, { Speaker: "B", Lao: "ໄດ້" }]);
ok(r.every(x => x.action === "new" && !x.existing), "dialogue with its own ID and a title used elsewhere → new, not an update of the other one", r.map(x => x.action));
r = dlgRows([{ Title_EN: "Taking a tuk-tuk", Speaker: "A", Lao: "ໄປ ຕະຫຼາດ" }]);
ok(r[0].action === "update" && r[0].existing.id === "d-c1-19", "without an ID, the title still finds the existing dialogue", r.map(x => x.action));

console.log(failed ? `\n${failed} import type checks FAILED` : "\nAll import type checks passed");
process.exit(failed ? 1 : 0);
