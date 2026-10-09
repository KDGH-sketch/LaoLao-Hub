// Spreadsheet import / export for more content types: Dictionary, Lessons, Dialogues, Quizzes, Videos, Culture,
// Lao letters. Each type says which columns it has, how a row is checked, how rows become a stored item, and how an
// item becomes rows again (export → edit in Excel → import). Dialogues and Quizzes take several rows per item
// (one per line / question), grouped by their ID; a row with an empty ID continues the item above it.
// Used by import-map.js (shared helpers, the three original types) and the importer page. Tests: scripts/test_import.mjs.

const LAO = /[຀-໿]/;
const STAGES = ["1", "2", "3", "4", "5", "6"], ACCESS = ["public", "free", "standard", "premium"];
const POS = ["n", "v", "adj", "adv", "pron", "num", "clf", "part", "ph", "conj", "prep", "aux", "int", "idiom"];
const POS_NAMES = { noun: "n", verb: "v", adjective: "adj", adverb: "adv", pronoun: "pron", number: "num", numeral: "num", classifier: "clf",
  particle: "part", phrase: "ph", conjunction: "conj", preposition: "prep", auxiliary: "aux", interjection: "int" };
export const splitList = s => String(s || "").split(/\s*(?:;|\n|\r)\s*/).map(x => x.trim()).filter(Boolean);
const splitBar = s => String(s || "").split(/\s*\|\s*/).map(x => x.trim()).filter(Boolean);
const splitRefs = s => String(s || "").split(/[\s,;]+/).map(x => x.trim()).filter(Boolean);
export const slug = s => String(s || "").toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40);
const tr3 = (en, lo, zh) => ({ en: en || "", lo: lo || "", zh: zh || "" });
// a blank cell keeps what the item already has
const keep = (v, prev) => (v === "" || v == null ? prev : v);
const keepTr = (prev, en, lo, zh) => { const p = prev && typeof prev === "object" ? prev : {}; return { en: keep(en, p.en || ""), lo: keep(lo, p.lo || ""), zh: keep(zh, p.zh || "") }; };
const err = (col, code, value) => ({ col, code, value });
const posOf = (f, warnings) => { if (!f.pos) return; const p = f.pos.toLowerCase(), m = POS.includes(p) ? p : POS_NAMES[p]; if (m) f.pos = m; else { warnings.push(err("PartOfSpeech", "pos", f.pos)); f.pos = ""; } };
const accessOf = (f, errors) => { if (!f.access) return; const a = f.access.toLowerCase(); if (ACCESS.includes(a)) f.access = a; else errors.push(err("Access", "access", f.access)); };
const needLao = (f, k, col, errors, required = true) => { if (!f[k]){ if (required) errors.push(err(col, "required")); } else if (!LAO.test(f[k])) errors.push(err(col, "not_lao", f[k])); };
const titleKey = d => String((d.title && (d.title.en || d.title.lo)) || "").trim().toLowerCase();
const isUrl = s => /^https?:\/\/\S+$/i.test(s) && (/(youtube\.com|youtu\.be)\//i.test(s) || /\.(mp4|webm|ogg|m4v)(\?|$)/i.test(s));
// "0:05 ສະບາຍດີ" or "0:05 | ສະບາຍດີ | sa-bai-dii | Hello" per line → transcript lines (seconds)
export function parseTimedLines(text){
  const out = [], bad = [];
  String(text || "").split(/\r?\n/).map(x => x.trim()).filter(Boolean).forEach((ln, i) => {
    const m = ln.match(/^\[?(\d{1,2}):(\d{2})(?::(\d{2}))?\]?\s*[|\-–]?\s*(.+)$/);
    if (!m){ bad.push(i + 1); return; }
    const secs = m[3] != null ? (+m[1]) * 3600 + (+m[2]) * 60 + (+m[3]) : (+m[1]) * 60 + (+m[2]);
    const [text, rom, en] = m[4].split(/\s*\|\s*/);
    out.push(Object.assign({ start: secs, text: (text || "").trim() }, rom ? { rom: rom.trim() } : {}, en ? { en: en.trim() } : {}));
  });
  return { lines: out.sort((a, b) => a.start - b.start), bad };
}
const fmtT = s => Math.floor(s / 60) + ":" + String(Math.floor(s % 60)).padStart(2, "0");

// quiz question types as written in the sheet → the app's types
const QTYPE = { mc: "mc", choice: "mc", "multiple choice": "mc", multiplechoice: "mc", fill: "fill", blank: "fill", "fill the blank": "fill",
  listen: "listen_select", listening: "listen_select", listen_select: "listen_select", type: "type", typing: "type", write: "type", typed: "type",
  flashcard: "flashcard", card: "flashcard", order: "order", "word order": "order", arrange: "order" };
const SKILL = { mc: "reading", fill: "grammar", listen_select: "listening", type: "writing", flashcard: "vocabulary", order: "sentence" };
const QTYPE_OUT = { mc: "mc", fill: "fill", listen_select: "listen", type: "type", flashcard: "flashcard", order: "order" };
// the right option: its number (1, 2…) or its text
function answerIndex(ans, opts){
  const a = String(ans || "").trim(); if (!a) return -1;
  if (/^\d+$/.test(a) && +a >= 1 && +a <= opts.length) return +a - 1;
  return opts.findIndex(o => o.toLowerCase() === a.toLowerCase());
}
const optText = o => (typeof o === "string" ? o : (o.zh || o.en || o.lo || ""));

export const MORE_TYPES = {
  // ---------- dictionary ----------
  dictionary: { label: "Dictionary", lo: "ວັດຈະນານຸກົມ", columns: [
      { key: "lao", header: "Lao", alias: ["word", "hz"], required: true, help: "The word in Lao script", ex: ["ເຮືອນ", "ແລ່ນ"] },
      { key: "py", header: "Romanization", alias: ["p", "py"], help: "Leave empty to make it automatically", ex: ["hʉ́an", ""] },
      { key: "pos", header: "PartOfSpeech", alias: ["pos", "type"], list: POS, help: "n, v, adj… (or noun, verb…)", ex: ["n", "verb"] },
      { key: "stage", header: "Stage", alias: ["level"], list: STAGES, help: "1 to 6", ex: ["1", "2"] },
      { key: "en", header: "English", alias: ["en", "meaning"], help: "English meaning (English, Lao or Chinese: at least one)", ex: ["house, home", "to run"] },
      { key: "lo", header: "Lao_Meaning", alias: ["lo"], help: "Explanation in Lao", ex: ["ບ່ອນຢູ່ອາໄສ", ""] },
      { key: "zh", header: "Chinese", alias: ["zh"], help: "Meaning in Chinese", ex: ["房子", "跑"] },
      { key: "exLo", header: "ExampleLao", alias: ["example"], help: "An example sentence in Lao", ex: ["ເຮືອນຂ້ອຍຢູ່ໃກ້ຕະຫຼາດ", ""] },
      { key: "exEn", header: "ExampleEnglish", alias: ["example english"], help: "Its English translation", ex: ["My house is near the market.", ""] }],
    check(f, { errors, warnings }){ needLao(f, "lao", "Lao", errors); if (!f.en && !f.lo && !f.zh) errors.push(err("English", "meaning")); posOf(f, warnings); },
    key: f => f.lao, existingKey: d => String(d.hz || "").trim(),
    build([f], prev, ctx){
      const p = prev || {};
      const examples = f.exLo ? [ctx.sentence(f.exLo, f.exEn), ...(p.examples || []).filter(e => e.zh !== f.exLo)] : (p.examples || []);
      return { id: prev ? prev.id : f.lao, data: Object.assign({}, p, { hz: f.lao, p: keep(f.py, p.p || ctx.pyOf(f.lao)), pos: keep(f.pos, p.pos || "n"),
        level: f.stage ? +f.stage : (p.level || 1), en: keep(f.en, p.en || ""), lo: keep(f.lo, p.lo || ""), zh: keep(f.zh, p.zh || ""), examples }) };
    },
    toRows: d => [{ lao: d.hz, py: d.p, pos: d.pos, stage: d.level, en: d.en, lo: d.lo, zh: d.zh, exLo: (d.examples || [])[0] && d.examples[0].zh, exEn: (d.examples || [])[0] && ((d.examples[0].tr || {}).en || d.examples[0].en) }]
  },

  // ---------- lessons ----------
  lessons: { label: "Lessons", lo: "ບົດຮຽນ", columns: [
      { key: "id", header: "LessonID", alias: ["id"], help: "Optional. The same ID updates that lesson; empty = made from the title", ex: ["l-market", ""] },
      { key: "titleEn", header: "Title_EN", alias: ["title"], required: true, help: "Title in English (or Title_LO)", ex: ["At the market", "Family"] },
      { key: "titleLo", header: "Title_LO", alias: ["title lo"], help: "Title in Lao", ex: ["ຢູ່ຕະຫຼາດ", "ຄອບຄົວ"] },
      { key: "titleZh", header: "Title_ZH", alias: ["title zh"], help: "Title in Chinese", ex: ["在市场", ""] },
      { key: "stage", header: "Stage", alias: ["level"], list: STAGES, help: "1 to 6", ex: ["1", "1"] },
      { key: "topic", header: "Topic", alias: ["category"], help: "e.g. Daily life", ex: ["Shopping", "People"] },
      { key: "descEn", header: "Description_EN", alias: ["description"], help: "What the lesson teaches", ex: ["Ask prices and buy food at a Lao market.", "Talk about your family."] },
      { key: "descLo", header: "Description_LO", alias: [], help: "In Lao", ex: ["ຖາມລາຄາ ແລະ ຊື້ອາຫານຢູ່ຕະຫຼາດ.", ""] },
      { key: "objEn", header: "Objectives_EN", alias: ["objectives"], help: "Learning objectives, separated by ;", ex: ["Ask how much something costs; Count money", "Name family members"] },
      { key: "objLo", header: "Objectives_LO", alias: [], help: "In Lao, separated by ;", ex: ["", ""] },
      { key: "words", header: "Words", alias: ["vocabulary", "vocab"], help: "Lao words of the lesson, separated by ; or spaces", ex: ["ຕະຫຼາດ; ລາຄາ; ເທົ່າໃດ", "ພໍ່; ແມ່; ອ້າຍ"] },
      { key: "patterns", header: "Patterns", alias: [], help: "Sentence pattern numbers, e.g. 1; 4", ex: ["4", "1"] },
      { key: "grammar", header: "Grammar", alias: [], help: "Grammar point IDs, separated by ;", ex: ["", ""] },
      { key: "dialogues", header: "Dialogues", alias: [], help: "Dialogue IDs, separated by ;", ex: ["", ""] },
      { key: "quizzes", header: "Quizzes", alias: [], help: "Quiz IDs, separated by ;", ex: ["", ""] },
      { key: "access", header: "Access", alias: ["plan"], list: ACCESS, help: "public, free, standard or premium", ex: ["free", "free"] }],
    check(f, { errors, warnings, refs }){
      if (!f.titleEn && !f.titleLo) errors.push(err("Title_EN", "required"));
      accessOf(f, errors);
      const w = splitRefs(f.words.replace(/;/g, " ")); if (w.some(x => !LAO.test(x))) warnings.push(err("Words", "not_lao", w.find(x => !LAO.test(x))));
      const ps = splitRefs(f.patterns); if (ps.some(x => !/^\d+$/.test(x))) errors.push(err("Patterns", "pattern_num", ps.find(x => !/^\d+$/.test(x))));
      for (const [k, col] of [["patterns", "Patterns"], ["grammar", "Grammar"], ["dialogues", "Dialogues"], ["quizzes", "Quizzes"]]){
        const have = refs && refs[k]; if (!have) continue;
        const missing = splitRefs(f[k]).filter(x => !have.has(String(x)));
        if (missing.length) warnings.push(err(col, "unknown_ref", missing.join(", ")));
      }
    },
    key: f => f.id || slug(f.titleEn || f.titleLo), existingKey: d => d.id, existingKey2: titleKey, key2: f => (f.titleEn || f.titleLo).toLowerCase(),
    build([f], prev){
      const p = prev || {};
      const list = (v, old) => v ? splitRefs(v) : (old || []);
      const objs = (v, old) => v ? splitList(v) : (old || []);
      return { id: prev ? prev.id : (f.id || "l-" + (slug(f.titleEn || f.titleLo) || Date.now().toString(36))), data: Object.assign({}, p, {
        title: keepTr(p.title, f.titleEn, f.titleLo, f.titleZh), desc: keepTr(p.desc, f.descEn, f.descLo, ""),
        level: f.stage ? +f.stage : (p.level || 1), topic: keep(f.topic, p.topic || ""),
        objectives: { en: objs(f.objEn, p.objectives && p.objectives.en), lo: objs(f.objLo, p.objectives && p.objectives.lo), zh: (p.objectives && p.objectives.zh) || [] },
        vocab: f.words ? splitRefs(f.words.replace(/;/g, " ")) : (p.vocab || []),
        patterns: f.patterns ? splitRefs(f.patterns).map(Number) : (p.patterns || []),
        grammar: list(f.grammar, p.grammar), dialogues: list(f.dialogues, p.dialogues), quizzes: list(f.quizzes, p.quizzes),
        audio: p.audio || [], images: p.images || [], examples: p.examples || [], access: keep(f.access, p.access || "free") }) };
    },
    toRows: d => [{ id: d.id, titleEn: (d.title || {}).en, titleLo: (d.title || {}).lo, titleZh: (d.title || {}).zh, stage: d.level, topic: d.topic, descEn: (d.desc || {}).en, descLo: (d.desc || {}).lo,
      objEn: ((d.objectives || {}).en || []).join("; "), objLo: ((d.objectives || {}).lo || []).join("; "), words: (d.vocab || []).join("; "), patterns: (d.patterns || []).join("; "),
      grammar: (d.grammar || []).join("; "), dialogues: (d.dialogues || []).join("; "), quizzes: (d.quizzes || []).join("; "), access: d.access }]
  },

  // ---------- dialogues: one row per line ----------
  dialogues: { label: "Dialogues", lo: "ບົດສົນທະນາ", grouped: true, columns: [
      { key: "id", header: "DialogueID", alias: ["id"], help: "The same ID on every line of one dialogue; empty = continues the dialogue above", ex: ["d-taxi", "", "", "d-coffee", ""] },
      { key: "titleEn", header: "Title_EN", alias: ["title"], help: "On the first line of the dialogue", ex: ["Taking a tuk-tuk", "", "", "Ordering coffee", ""] },
      { key: "titleLo", header: "Title_LO", alias: [], help: "On the first line", ex: ["ຂີ່ຕຸກຕຸກ", "", "", "ສັ່ງກາເຟ", ""] },
      { key: "stage", header: "Stage", alias: ["level"], list: STAGES, help: "On the first line, 1 to 6", ex: ["1", "", "", "1", ""] },
      { key: "speaker", header: "Speaker", alias: ["sp"], help: "Who says the line", ex: ["A", "B", "A", "A", "B"] },
      { key: "lao", header: "Lao", alias: ["line", "zh"], required: true, help: "The line in Lao", ex: ["ໄປຕະຫຼາດເຊົ້າເທົ່າໃດ?", "ຫ້າສິບພັນກີບ.", "ໂອເຄ, ໄປເລີຍ.", "ຂໍກາເຟເຢັນໜຶ່ງຈອກ.", "ໄດ້ເລີຍ."] },
      { key: "py", header: "Romanization", alias: ["py"], help: "Leave empty to make it automatically", ex: ["", "", "", "", ""] },
      { key: "en", header: "English", alias: ["translation"], help: "Translation", ex: ["How much to the Morning Market?", "Fifty thousand kip.", "OK, let's go.", "One iced coffee, please.", "Sure."] }],
    check(f, { errors }){ needLao(f, "lao", "Lao", errors); },
    group: f => f.id || slug(f.titleEn || f.titleLo), existingKey: d => d.id, existingKey2: titleKey, key2: f => (f.titleEn || f.titleLo || "").toLowerCase(),
    groupHead: ["id", "titleEn", "titleLo", "stage"],
    build(rows, prev, ctx){
      const p = prev || {}, head = rows[0];
      const lines = rows.map(f => Object.assign({ zh: f.lao, py: f.py || ctx.pyOf(f.lao, true), tr: f.en ? { en: f.en } : {} }, f.speaker ? { sp: f.speaker, speaker: f.speaker } : {}));
      return { id: prev ? prev.id : (head.id || "d-" + (slug(head.titleEn || head.titleLo) || Date.now().toString(36))), data: Object.assign({}, p, {
        title: keepTr(p.title, head.titleEn, head.titleLo, ""), level: head.stage ? +head.stage : (p.level || 1), lines }) };
    },
    toRows: d => (d.lines || []).map((l, i) => Object.assign(i ? {} : { id: d.id, titleEn: (d.title || {}).en, titleLo: (d.title || {}).lo, stage: d.level },
      { speaker: l.sp || l.speaker || "", lao: l.zh, py: l.py, en: (l.tr || {}).en || l.en || "" }))
  },

  // ---------- quizzes: one row per question ----------
  quizzes: { label: "Quizzes", lo: "ແບບທົດສອບ", grouped: true, columns: [
      { key: "id", header: "QuizID", alias: ["id"], help: "The same ID on every question of one quiz; empty = continues the quiz above", ex: ["q-numbers", "", "", "", "", ""] },
      { key: "titleEn", header: "Title_EN", alias: ["title"], help: "On the first question", ex: ["Numbers 1–10", "", "", "", "", ""] },
      { key: "titleLo", header: "Title_LO", alias: [], help: "On the first question", ex: ["ຕົວເລກ 1–10", "", "", "", "", ""] },
      { key: "stage", header: "Stage", alias: ["level"], list: STAGES, help: "On the first question, 1 to 6", ex: ["1", "", "", "", "", ""] },
      { key: "kind", header: "Kind", alias: [], list: ["quiz", "exercise"], help: "quiz or exercise (first question)", ex: ["quiz", "", "", "", "", ""] },
      { key: "qtype", header: "Type", alias: ["question type"], required: true, list: ["mc", "fill", "listen", "type", "flashcard", "order"],
        help: "mc (multiple choice) · fill (fill the blank ___) · listen (hear, pick) · type (type the answer) · flashcard · order (words in order)", ex: ["mc", "fill", "listen", "type", "flashcard", "order"] },
      { key: "ask", header: "Question", alias: ["instruction"], help: "The instruction or question, in English", ex: ["What does it mean?", "Fill the blank", "Which number do you hear?", "Write 'three' in Lao", "", "Put the words in order: I have two cats"] },
      { key: "lao", header: "Lao", alias: ["prompt"], help: "The Lao text (for fill: with ___ where the gap is; for order: words separated by spaces)", ex: ["ຫ້າ", "ຂ້ອຍມີແມວ ___ ໂຕ", "ສອງ", "", "ສິບ", "ຂ້ອຍ ມີ ແມວ ສອງ ໂຕ"] },
      { key: "py", header: "Romanization", alias: ["py"], help: "Optional", ex: ["", "", "", "", "", ""] },
      { key: "options", header: "Options", alias: ["choices"], help: "Answers to choose from, separated by |", ex: ["five | four | six | ten", "ສອງ | ຂອງ | ສາມ", "ສອງ | ສາມ | ສີ່", "", "", ""] },
      { key: "answer", header: "Answer", alias: ["correct"], help: "mc / fill / listen: the right option (its text or number) · type: accepted answers separated by | · flashcard: the meaning", ex: ["five", "1", "ສອງ", "ສາມ", "ten", ""] },
      { key: "explain", header: "Explanation", alias: [], help: "Shown after answering (optional)", ex: ["ຫ້າ = 5", "", "", "", "", ""] }],
    check(f, { errors }){
      const t = QTYPE[String(f.qtype || "").toLowerCase().trim()];
      if (!t){ errors.push(err("Type", "qtype", f.qtype)); return; }
      f.qtype = t;
      const opts = splitBar(f.options);
      if (["mc", "fill", "listen_select"].includes(t)){
        if (opts.length < 2) errors.push(err("Options", "options"));
        else if (answerIndex(f.answer, opts) < 0) errors.push(err("Answer", "answer_not_option", f.answer));
      }
      if (t === "mc" && !f.lao && !f.ask) errors.push(err("Question", "required"));
      if (t === "fill" && !/_{2,}|＿/.test(f.lao)) errors.push(err("Lao", "no_blank"));
      if (["listen_select", "flashcard", "order", "fill"].includes(t)) needLao(f, "lao", "Lao", errors);
      if (t === "type" && !f.answer) errors.push(err("Answer", "required"));
      if (t === "flashcard" && !f.answer) errors.push(err("Answer", "required"));
      if (t === "order" && f.lao && f.lao.trim().split(/\s+/).length < 3) errors.push(err("Lao", "order_words"));
    },
    group: f => f.id || slug(f.titleEn || f.titleLo), existingKey: d => d.id, existingKey2: titleKey, key2: f => (f.titleEn || f.titleLo || "").toLowerCase(),
    groupHead: ["id", "titleEn", "titleLo", "stage", "kind"],
    build(rows, prev, ctx){
      const p = prev || {}, head = rows[0];
      const questions = rows.map(f => {
        const t = f.qtype, q = { type: t, skill: SKILL[t], prompt: {}, ask: f.ask ? { en: f.ask } : {}, explain: f.explain ? { en: f.explain } : {} };
        if (f.lao && t !== "order") q.prompt.zh = f.lao;
        if (f.lao && t !== "order" && t !== "listen_select") q.prompt.py = f.py || ctx.pyOf(f.lao.replace(/_{2,}|＿+/g, " "), true);
        if (["mc", "fill", "listen_select"].includes(t)){ const opts = splitBar(f.options); q.options = opts.map(o => LAO.test(o) ? { zh: o } : { en: o }); q.answer = answerIndex(f.answer, opts); }
        if (t === "type"){ q.accept = splitBar(f.answer); q.mode = LAO.test(q.accept[0] || "") ? "script" : "text"; }
        if (t === "flashcard") q.back = { en: f.answer };
        if (t === "order"){ q.tokens = f.lao.trim().split(/\s+/); q.answer = q.tokens.join(""); if (f.ask) q.prompt.tr = { en: f.ask.replace(/^put the words in order:?\s*/i, "") }; }
        return q;
      });
      return { id: prev ? prev.id : (head.id || "q-" + (slug(head.titleEn || head.titleLo) || Date.now().toString(36))), data: Object.assign({}, p, {
        title: keepTr(p.title, head.titleEn, head.titleLo, ""), level: head.stage ? +head.stage : (p.level || 1), kind: keep(head.kind, p.kind || "quiz"), lesson: p.lesson || "", questions }) };
    },
    toRows: d => (d.questions || []).map((q, i) => {
      const opts = (q.options || []).map(optText);
      const t = q.type === "choice" ? "mc" : q.type;
      const row = { qtype: QTYPE_OUT[t] || t, ask: (q.ask && (q.ask.en || q.ask.lo)) || q.q || "", lao: (q.prompt && q.prompt.zh) || (t === "order" ? (q.tokens || []).map(x => typeof x === "string" ? x : x.z).join(" ") : ""),
        py: (q.prompt && q.prompt.py) || "", options: (q.choices || opts).join(" | "), explain: (q.explain && (q.explain.en || q.explain.lo)) || "" };
      row.answer = t === "type" ? (q.accept || []).join(" | ") : t === "flashcard" ? ((q.back && (q.back.en || q.back.lo)) || "") : q.type === "choice" ? q.a : Number.isInteger(q.answer) ? optText((q.options || [])[q.answer] || "") : "";
      return Object.assign(i ? {} : { id: d.id, titleEn: (d.title || {}).en, titleLo: (d.title || {}).lo, stage: d.level, kind: d.kind }, row);
    })
  },

  // ---------- videos ----------
  videos: { label: "Videos", lo: "ວິດີໂອ", columns: [
      { key: "id", header: "VideoID", alias: ["id"], help: "Optional. The same ID updates that video", ex: ["v-market", ""] },
      { key: "titleEn", header: "Title_EN", alias: ["title"], required: true, help: "Title in English", ex: ["Greetings in Lao (vaolao)", "Lao tones (vaolao)"] },
      { key: "titleLo", header: "Title_LO", alias: [], help: "Title in Lao", ex: ["ການທັກທາຍເປັນພາສາລາວ", "ວັນນະຍຸດພາສາລາວ"] },
      { key: "stage", header: "Stage", alias: ["level"], list: STAGES, help: "1 to 6", ex: ["1", "1"] },
      { key: "category", header: "Category", alias: [], list: ["beginner", "conversation", "pronunciation", "culture"], help: "beginner, conversation, pronunciation or culture", ex: ["conversation", "beginner"] },
      { key: "url", header: "URL", alias: ["link", "youtube", "embedurl"], required: true, help: "A YouTube link or an .mp4 file", ex: ["https://www.youtube.com/watch?v=j7TToA_jaMg", "https://youtu.be/L3sLXhhtwK0"] },
      { key: "descEn", header: "Description_EN", alias: ["description"], help: "Short description", ex: ["Everyday greetings, read and spoken.", "The six tones of Lao."] },
      { key: "descLo", header: "Description_LO", alias: [], help: "In Lao", ex: ["", ""] },
      { key: "transcript", header: "Transcript", alias: [], help: "One line per row in the cell: 0:05 ສະບາຍດີ (optionally | romanization | English)", ex: ["0:00 ສະບາຍດີ | sa-bai-dii | Hello\n0:04 ອັນນີ້ເທົ່າໃດ? | | How much is this?", ""] },
      { key: "recapEn", header: "Recap_EN", alias: ["summary"], help: "Summary shown under the video", ex: ["Greetings and asking prices.", ""] }],
    check(f, { errors, warnings }){
      if (!f.titleEn && !f.titleLo) errors.push(err("Title_EN", "required"));
      if (!f.url) errors.push(err("URL", "required")); else if (!isUrl(f.url)) errors.push(err("URL", "url", f.url));
      if (f.transcript){ const t = parseTimedLines(f.transcript); if (t.bad.length) warnings.push(err("Transcript", "transcript_lines", t.bad.join(", "))); }
      if (f.category && !["beginner", "conversation", "pronunciation", "culture"].includes(f.category.toLowerCase())) errors.push(err("Category", "category", f.category)); else if (f.category) f.category = f.category.toLowerCase();
    },
    key: f => f.id || slug(f.titleEn || f.titleLo), existingKey: d => d.id, existingKey2: titleKey, key2: f => (f.titleEn || f.titleLo).toLowerCase(),
    build([f], prev){
      const p = prev || {}, cat = keep(f.category, p.category || "beginner"), lvl = f.stage ? +f.stage : (p.level || 1);
      const recap = Object.assign({ summary: tr3(), points: [] }, p.recap || {}); if (f.recapEn) recap.summary = Object.assign({}, recap.summary, { en: f.recapEn });
      return { id: prev ? prev.id : (f.id || "v-" + (slug(f.titleEn || f.titleLo) || Date.now().toString(36))), data: Object.assign({}, p, {
        title: keepTr(p.title, f.titleEn, f.titleLo, ""), desc: keepTr(p.desc, f.descEn, f.descLo, ""), level: lvl, category: cat,
        difficulty: p.difficulty || ("Stage " + lvl + " · " + cat[0].toUpperCase() + cat.slice(1)), embedUrl: keep(f.url, p.embedUrl || ""),
        transcript: f.transcript ? parseTimedLines(f.transcript).lines : (p.transcript || []), recap, vocab: p.vocab || [] }) };
    },
    toRows: d => [{ id: d.id, titleEn: (d.title || {}).en, titleLo: (d.title || {}).lo, stage: d.level, category: d.category, url: d.embedUrl, descEn: (d.desc || {}).en, descLo: (d.desc || {}).lo,
      transcript: (d.transcript || []).filter(l => l.start != null && l.start !== "").map(l => fmtT(+l.start) + " " + [l.text || l.lo || "", l.rom || "", l.en || ""].join(" | ").replace(/( \| )+$/, "")).join("\n"),
      recapEn: ((d.recap || {}).summary || {}).en }]
  },

  // ---------- culture ----------
  culture: { label: "Culture", lo: "ວັດທະນະທຳ", columns: [
      { key: "id", header: "CultureID", alias: ["id"], help: "Optional. The same ID updates that story", ex: ["cul-baci", ""] },
      { key: "titleEn", header: "Title_EN", alias: ["title"], required: true, help: "Title in English", ex: ["The Baci ceremony", "Eating with sticky rice"] },
      { key: "titleLo", header: "Title_LO", alias: [], help: "Title in Lao", ex: ["ພິທີບາສີ", "ການກິນເຂົ້າໜຽວ"] },
      { key: "category", header: "Category", alias: [], list: ["traditions", "etiquette", "food", "festivals", "places"], help: "traditions, etiquette, food, festivals or places", ex: ["traditions", "food"] },
      { key: "descEn", header: "Summary_EN", alias: ["summary", "description"], help: "Short summary", ex: ["White strings tied around the wrist to call the spirits back.", "Roll a small ball with your right hand."] },
      { key: "descLo", header: "Summary_LO", alias: [], help: "In Lao", ex: ["", ""] },
      { key: "contentEn", header: "Content_EN", alias: ["content", "story"], help: "The full story", ex: ["A baci is held for weddings, births, journeys and New Year…", ""] },
      { key: "contentLo", header: "Content_LO", alias: [], help: "In Lao", ex: ["", ""] },
      { key: "tips", header: "Tips", alias: [], help: "Dos and don'ts, separated by ;", ex: ["Hold out your right hand; Keep the strings for at least three days", "Use your right hand; Don't put the rice back"] },
      { key: "words", header: "Words", alias: ["vocabulary"], help: "Lao word = English, separated by ;", ex: ["ບາສີ = baci ceremony; ຝ້າຍ = cotton string", "ເຂົ້າໜຽວ = sticky rice"] }],
    check(f, { errors, warnings }){
      if (!f.titleEn && !f.titleLo) errors.push(err("Title_EN", "required"));
      if (f.category && !["traditions", "etiquette", "food", "festivals", "places"].includes(f.category.toLowerCase())) errors.push(err("Category", "category", f.category)); else if (f.category) f.category = f.category.toLowerCase();
      if (f.words && splitList(f.words).some(w => !/=/.test(w))) warnings.push(err("Words", "word_pairs"));
    },
    key: f => f.id || slug(f.titleEn || f.titleLo), existingKey: d => d.id, existingKey2: titleKey, key2: f => (f.titleEn || f.titleLo).toLowerCase(),
    build([f], prev){
      const p = prev || {};
      return { id: prev ? prev.id : (f.id || "cul-" + (slug(f.titleEn || f.titleLo) || Date.now().toString(36))), data: Object.assign({}, p, {
        title: keepTr(p.title, f.titleEn, f.titleLo, ""), category: keep(f.category, p.category || "traditions"), desc: keepTr(p.desc, f.descEn, f.descLo, ""), content: keepTr(p.content, f.contentEn, f.contentLo, ""),
        keyTips: f.tips ? splitList(f.tips).map(tip => ({ tip })) : (p.keyTips || []),
        vocab: f.words ? splitList(f.words).map(w => { const [lao, en] = w.split("=").map(x => (x || "").trim()); return { lao, en: en || "", rom: "" }; }).filter(v => v.lao) : (p.vocab || []) }) };
    },
    toRows: d => [{ id: d.id, titleEn: (d.title || {}).en, titleLo: (d.title || {}).lo, category: d.category, descEn: (d.desc || {}).en, descLo: (d.desc || {}).lo, contentEn: (d.content || {}).en, contentLo: (d.content || {}).lo,
      tips: (d.keyTips || []).map(t => t.tip).filter(Boolean).join("; "), words: (d.vocab || []).map(v => v.lao + " = " + (v.en || "")).join("; ") }]
  },

  // ---------- Lao letters ----------
  characters: { label: "Lao letters", lo: "ຕົວອັກສອນ", columns: [
      { key: "char", header: "Letter", alias: ["char", "character"], required: true, help: "The letter, vowel form or mark", ex: ["ກ", "ຂ"] },
      { key: "name", header: "Name", alias: [], help: "Traditional name, e.g. ko kai", ex: ["kɔ̀ɔ kái", "khɔ̌ɔ khǎi"] },
      { key: "meaning", header: "Meaning", alias: [], help: "Meaning of the key word", ex: ["chicken", "egg"] },
      { key: "ipa", header: "IPA", alias: ["sound"], help: "Pronunciation", ex: ["[k]", "[kʰ]"] },
      { key: "cls", header: "Class", alias: ["type"], list: ["middle", "high", "low", "vowel", "tone_mark"], help: "middle, high, low, vowel or tone_mark (empty: worked out from the letter)", ex: ["", ""] },
      { key: "initial", header: "InitialSound", alias: ["medial"], help: "Sound at the start of a syllable", ex: ["k", "kh"] },
      { key: "final", header: "FinalSound", alias: [], help: "Sound at the end (only some letters)", ex: ["k", ""] }],
    check(f, { errors }){
      needLao(f, "char", "Letter", errors);
      if (f.cls && !["middle", "high", "low", "vowel", "tone_mark"].includes(f.cls.toLowerCase())) errors.push(err("Class", "class", f.cls)); else if (f.cls) f.cls = f.cls.toLowerCase();
    },
    key: f => f.char, existingKey: d => String(d.char || ""),
    build([f], prev, ctx){
      const p = prev || {};
      const auto = ctx.classOf ? ctx.classOf(f.char) : "";
      return { id: prev ? prev.id : "char-" + f.char, data: Object.assign({}, p, { char: f.char, name: keep(f.name, p.name || ""), meaning: keep(f.meaning, p.meaning || ""), ipa: keep(f.ipa, p.ipa || ""),
        class: keep(f.cls, p.class || auto), medial: keep(f.initial, p.medial || ""), final: keep(f.final, p.final || ""), strokeCount: p.strokeCount || 0 }) };
    },
    toRows: d => [{ char: d.char, name: d.name, meaning: typeof d.meaning === "object" ? (d.meaning.en || "") : d.meaning, ipa: d.ipa, cls: d.class, initial: d.medial, final: d.final }]
  }
};

export const MORE_MESSAGES = {
  pattern_num: "Pattern numbers only (e.g. 1; 4): %v", unknown_ref: "Not found yet (check the ID, or import it first): %v",
  qtype: "Unknown question type “%v”: use mc, fill, listen, type, flashcard or order", options: "Give at least two options, separated by |",
  answer_not_option: "The answer must be one of the options (its text or number): %v", no_blank: "Mark the gap with ___",
  order_words: "Write at least three words separated by spaces", url: "Not a YouTube link or a video file: %v", transcript_lines: "Lines without a time (m:ss) are skipped: %v",
  category: "Unknown category: %v", word_pairs: "Write words as ລາວ = English", class: "Use middle, high, low, vowel or tone_mark: %v",
  group_error: "Another row of this item has an error (row %v), so the whole item is skipped"
};
