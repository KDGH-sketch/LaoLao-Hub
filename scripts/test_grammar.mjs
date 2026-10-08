// Grammar Studio logic (js/shared/grammar.js) with the real dictionary and starter content.
// Run: node scripts/test_grammar.mjs
import fs from "fs";
import { segment } from "../js/shared/dict.js";
import { normalizeGrammar, explainOf, parseFormula, formulaMarkers, tagTokens, meaningful, checkBuild, shuffleWords, wrongOrders, stepsDone, mastery, grammarStatus, nextPoint } from "../js/shared/grammar.js";

let failed = 0;
const ok = (c, m, d) => { console.log((c ? "  PASS " : "  FAIL ") + m + (!c && d !== undefined ? "  → " + JSON.stringify(d).slice(0, 300) : "")); if (!c) failed++; };
const raw = JSON.parse(fs.readFileSync(new URL("../data/dictionary.json", import.meta.url), "utf8"));
const D = {}; for (const k in raw) D[k] = { pos: raw[k][1] };
const seed = JSON.parse(fs.readFileSync(new URL("../data/seed.json", import.meta.url), "utf8"));
const T = s => s.split(" ").map(z => ({ z, p: "" }));
const roles = (s, f) => meaningful(tagTokens(T(s), f, D)).map(w => w.role).join(" ");

console.log("one shape for every grammar point (the crash)");
const old = seed.grammar[0];
ok(!old.tr && old.body, "starter rows keep the explanation in body (the page read tr → 'Cannot read properties of undefined')");
const n = normalizeGrammar(old);
ok(n.tr.en.explain.startsWith("Lao is an analytic") && n.tr.lo.explain && Array.isArray(n.tr.en.usage) && !("body" in n), "body → tr.en.explain / tr.lo.explain", n.tr.en);
ok(seed.grammar.every(g => { const x = normalizeGrammar(g); return x.tr.en.explain && x.title.en && x.level >= 1 && Array.isArray(x.examples); }), "every starter grammar point normalizes");
const ed = normalizeGrammar({ title: { en: "x" }, tr: { en: { explain: "E", usage: "a\nb" }, lo: { explain: "" } } });
ok(ed.tr.en.usage.join() === "a,b" && ed.tr.zh.explain === "" && ed.structure === "", "editor rows: usage lines become a list, missing languages filled in");
ok(explainOf(n, "zh").lang === "en" && explainOf(n, "lo").lang === "lo", "explanation falls back to English when a language is missing (never an empty page)");
ok(normalizeGrammar(null) === null && normalizeGrammar({}).examples.length === 0, "empty rows don't crash");

console.log("\nsplitting sentences into words (used everywhere in the app)");
const seg = x => segment(x, D).join("|");
ok(seg("ຂໍເບຍລາວສອງແກ້ວ.") === "ຂໍ|ເບຍລາວ|ສອງ|ແກ້ວ|.", "an unknown word (ຂໍ) stays whole: it used to be cut into ຂ and a loose ໍ", seg("ຂໍເບຍລາວສອງແກ້ວ."));
ok(seg("ຂ້ອຍມີແມວສອງໂຕ.") === "ຂ້ອຍ|ມີ|ແມວ|ສອງ|ໂຕ|.", "ແມວ is not cut into the word ແມ and a lone ວ", seg("ຂ້ອຍມີແມວສອງໂຕ."));
ok(seg("ຂ້ອຍບໍ່ກິນຊີ້ນ.") === "ຂ້ອຍ|ບໍ່|ກິນ|ຊີ້ນ|.", "known words around an unknown one");
ok(seg("ຖ້າມື້ອື່ນຝົນຕົກ, ພວກເຮົາກໍຈະບໍ່ໄປ.") === "ຖ້າ|ມື້ອື່ນ|ຝົນຕົກ|,|ພວກເຮົາ|ກໍ|ຈະ|ບໍ່|ໄປ|.", "commas and spaces split runs");
ok(seed.patterns.every(p => p.examples.every(e => segment(e.zh, D).every(t => !/^[ັິ-ຼ່-ໍ]/.test(t)))), "no piece ever starts with a vowel or tone mark (every starter example)");
ok(segment("", D).length === 0 && segment("hello world", D).join("|") === "hello|world", "empty and non-Lao text");

console.log("\nformulas");
const f1 = parseFormula("S + ບໍ່ + V / Adj");
ok(f1.length === 3 && f1[0].code === "S" && f1[1].lit === "ບໍ່" && f1[2].code === "V" && f1[2].alt[0] === "Adj", "S + ບໍ່ + V / Adj → blocks", f1);
const f2 = parseFormula("S + ກຳລັງ + V + (O) + (ຢູ່)");
ok(f2[3].optional && f2[3].code === "O" && f2[4].optional && f2[4].lit === "ຢູ່", "optional parts in brackets");
ok(formulaMarkers(parseFormula("ທັງ + Adj/V + ທັງ + Adj/V")).join() === "ທັງ,ທັງ" && formulaMarkers(parseFormula("ແມ່ນ…ແລ້ວ")).join() === "ແມ່ນ,ແລ້ວ", "key words, also split on …");
ok(formulaMarkers(parseFormula("(ໂດຍ / ເຈົ້າ) + Statement + (ເດີ)")).join() === "ໂດຍ,ເຈົ້າ,ເດີ", "a choice of key words (ໂດຍ / ເຈົ້າ) gives both");
ok(parseFormula("ຖ້າ + Condition ， (S) + ກໍ + Result")[1].label === "Condition S", "labels don't keep stray brackets");
ok(seed.patterns.every(p => parseFormula(p.formula).length >= 2), "every starter pattern formula parses");

console.log("\nroles of words");
ok(roles("ຂ້ອຍ ກິນ ເຂົ້າ", "S + V + O") === "S V O", "ຂ້ອຍ ກິນ ເຂົ້າ → Subject Verb Object");
ok(roles("ຂ້ອຍ ບໍ່ ກິນ ຊີ້ນ", "S + ບໍ່ + V / Adj") === "S M V O", "the formula's key word is marked; an unknown word after the verb is the object");
ok(roles("ຂ້ອຍ ບໍ່ ກິນ ຊີ້ນ", "S + V + O") === "S Neg V O", "ບໍ່ before a verb is 'not'");
ok(roles("ເຈົ້າ ກິນ ບໍ່", "") === "S V Q", "ບໍ່ at the end asks a question");
ok(roles("ເຈົ້າ ສະບາຍດີ ບໍ", "Statement + ບໍ ?") === "S N M", "Statement + ບໍ: the question word is the key word");
ok(roles("ມື້ນີ້ ຂ້ອຍ ໄປ ຕະຫຼາດ", "") === "Time S V O", "time word at the front");
ok(meaningful(tagTokens([{ z: "ກິນ" }, { z: "." }], "", D)).length === 1, "punctuation is left out");

console.log("\nbuild the sentence");
ok(checkBuild(["ຂ້ອຍ", "ກິນ", "ເຂົ້າ"], ["ຂ້ອຍ", "ກິນ", "ເຂົ້າ"]).ok, "right order");
const wrong = checkBuild(["ຂ້ອຍ", "ເຂົ້າ", "ກິນ"], ["ຂ້ອຍ", "ກິນ", "ເຂົ້າ"]);
ok(!wrong.ok && wrong.at === 1, "wrong order points at the first misplaced word", wrong);
ok(checkBuild(["ຂ້ອຍ", "ໄປ", "ຕະຫຼາດ", "ມື້ນີ້"], ["ມື້ນີ້", "ຂ້ອຍ", "ໄປ", "ຕະຫຼາດ"], ["Time", "S", "V", "O"]).ok, "a time word may stand at the start or the end");
let seed1 = 3; const rnd = () => (seed1 = (seed1 * 16807) % 2147483647) / 2147483647;
ok(Array.from({ length: 30 }, () => shuffleWords(["a", "b", "c"], rnd).join()).every(x => x !== "a,b,c"), "shuffled blocks are never already in the right order");

console.log("\nspot the mistake");
const tg = s => tagTokens(T(s), "", D);
const w1 = wrongOrders(tg("ຂ້ອຍ ກິນ ເຂົ້າ"));
ok(w1.length >= 2 && w1.every(x => x.words.join(" ") !== "ຂ້ອຍ ກິນ ເຂົ້າ") && w1.some(x => x.why === "svo"), "wrong orders differ from the right one and say which rule they break", w1);
const w2 = wrongOrders(tagTokens(T("ອາຫານ ລາວ ແຊບ"), "", Object.assign({}, D, { "ອາຫານ": { pos: "n" }, "ແຊບ": { pos: "adj" } })));
ok(w2.some(x => x.why === "adj_after_noun"), "describing word moved before its noun", w2);
const w3 = wrongOrders(tagTokens(T("ຂ້ອຍ ບໍ່ ກິນ ຊີ້ນ"), "S + V + O", D));
ok(w3.some(x => x.why === "neg_before_verb" && x.words.join(" ") === "ຂ້ອຍ ກິນ ບໍ່ ຊີ້ນ"), "'not' moved after the verb", w3);
const w4 = wrongOrders(tagTokens(T("ເຈົ້າ ສະບາຍດີ ບໍ"), "Statement + ບໍ", D));
ok(w4.some(x => x.why === "marker_place" && x.words[0] === "ບໍ"), "question word moved to the front", w4);
ok(seed.patterns.every(p => { const e = p.examples[0]; const ws = wrongOrders(tagTokens(e.tokens || [], p.formula, D)); return ws.length >= 1 && new Set(ws.map(x => x.words.join(" "))).size === ws.length; }), "every starter pattern example yields distinct wrong orders");

console.log("\nmastery");
ok(mastery({}) === 0 && grammarStatus(undefined) === "new", "new point");
const p1 = { learn: 1, see: 1, build: 2, fix: 1 };
ok(mastery(p1) === 3 && !stepsDone(p1).fix && grammarStatus(p1) === "learning", "3 of 5 steps: learning");
const now = 1_800_000_000_000, p2 = { learn: 1, see: 1, build: 2, fix: 2, best: 83, masteredAt: now - 2 * 86400000 };
ok(mastery(p2) === 5 && grammarStatus(p2, now) === "mastered", "all 5 steps (challenge ≥ 80%): mastered");
ok(grammarStatus(Object.assign({}, p2, { masteredAt: now - 8 * 86400000 }), now) === "review", "after 7 days: review due");
ok(grammarStatus(Object.assign({}, p2, { masteredAt: now - 8 * 86400000, reviews: 1 }), now) === "mastered", "after a review, the next one is 30 days later");
const gs = [{ id: "a", level: 1 }, { id: "b", level: 1 }, { id: "c", level: 2 }];
ok(nextPoint(gs, {}).id === "a" && nextPoint(gs, { a: p2 }, now).id === "b" && nextPoint(gs, { a: p2, c: p1 }, now).id === "c", "next point: something in progress first, then the first new one");

console.log(failed ? `\n${failed} grammar checks FAILED` : "\nAll grammar checks passed");
process.exit(failed ? 1 : 0);
