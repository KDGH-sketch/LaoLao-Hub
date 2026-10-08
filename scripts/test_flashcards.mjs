// Flashcard Studio logic (js/shared/flashcards.js) and picture hints (js/shared/word-pictures.js), with the real dictionary.
// Run: node scripts/test_flashcards.mjs
import fs from "fs";
import { wordPool, backMeaning, buildDeck, choicesFor, modeFor, hintsFor, createRound, coachFor, updateStats, isTricky, wordStatus, overview, srsGradeFor, maskSentence } from "../js/shared/flashcards.js";
import { pictureFor } from "../js/shared/word-pictures.js";

let failed = 0;
const ok = (c, m, d) => { console.log((c ? "  PASS " : "  FAIL ") + m + (!c && d !== undefined ? "  → " + JSON.stringify(d).slice(0, 300) : "")); if (!c) failed++; };
const raw = JSON.parse(fs.readFileSync(new URL("../data/dictionary.json", import.meta.url), "utf8"));
const D = {}; for (const k in raw){ const a = raw[k]; D[k] = { p: a[0], pos: a[1], en: a[2], h: a[3], n: a[4], fq: a[5], lo: a[6] || "" }; }
const pool = wordPool(D);
let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
const now = 1_800_000_000_000;

console.log("the back of the card");
ok(backMeaning(D["ພໍ່"] && Object.assign({ w: "ພໍ່" }, D["ພໍ່"]), "lo") === D["ພໍ່"].en, "Lao 'meaning' that only repeats the word → the English meaning is shown (the old card showed the word again)");
ok(backMeaning({ w: "ກິນ", en: "to eat", lo: "", zh: "" }, "zh") === "to eat", "missing Chinese → English, never an empty back");
ok(backMeaning({ w: "x", en: "to eat", lo: "ຮັບປະທານ" }, "lo") === "ຮັບປະທານ", "a real Lao explanation is used in Lao");
ok(pool.every(e => backMeaning(e, "lo") && backMeaning(e, "en") && backMeaning(e, "zh")), "every word in the dictionary has a non-empty back in all three languages");

console.log("\ndecks");
const deck = buildDeck(pool, {}, { source: "smart", size: 10, stage: 1 }, { now, rnd });
ok(deck.length === 10 && new Set(deck.map(c => c.w)).size === 10, "a 10-card deck has 10 different words");
ok(buildDeck(pool, {}, { size: 5 }, { now, rnd }).length === 5 && buildDeck(pool, {}, { size: 30 }, { now, rnd }).length === 30, "the learner picks the size (5, 30)");
ok(buildDeck(pool, {}, { source: "due", size: 10 }, { now, rnd }).length === 0, "nothing due for a new learner: an empty deck (the page says so instead of starting a 0-card round)");
const verbs = buildDeck(pool, {}, { size: 10, type: "v" }, { now, rnd });
ok(verbs.length === 10 && verbs.every(c => ["v", "aux"].includes(c.pos)), "word type filter: verbs only");
const srs = {};
const st = (w, s, extra) => srs[w] = Object.assign({ st: Object.assign({ seen: 1, ok: 0, almost: 0, miss: 0, skip: 0, hints: 0, streak: 0 }, s), due: now + 86400000, reps: 0 }, extra);
st("ກິນ", { miss: 3 }); st("ດື່ມ", { skip: 2, miss: 1 }); st("ໄປ", { ok: 4, streak: 4 }, { due: now - 1000, reps: 4 }); st("ມາ", { ok: 1, streak: 1 }, { due: now - 5000 });
ok(isTricky(srs["ກິນ"].st) && isTricky(srs["ດື່ມ"].st) && !isTricky(srs["ໄປ"].st), "tricky = missed or skipped twice and not yet right twice in a row");
ok(buildDeck(pool, srs, { source: "tricky", size: 10 }, { now }).map(c => c.w).join() === "ກິນ,ດື່ມ", "'Tricky words' deck: the words the learner keeps missing, most missed first");
ok(buildDeck(pool, srs, { source: "due", size: 10 }, { now }).map(c => c.w).join() === "ມາ,ໄປ", "'Due for review' deck: due words, longest overdue first");
const smart = buildDeck(pool, srs, { source: "smart", size: 10 }, { now, rnd }).map(c => c.w);
ok(smart.includes("ກິນ") && smart.includes("ມາ") && smart.length === 10, "smart mix: includes tricky and due words, topped up with new ones", smart);
ok(!buildDeck(pool, srs, { source: "new", size: 20 }, { now, rnd }).some(c => srs[c.w]), "'New words' never repeats a word already seen");
const ov = overview(pool, srs, now);
ok(ov.tricky === 2 && ov.mastered === 1 && ov.learning === 1 && ov.due === 2 && ov.new === pool.length - 4, "overview counts new / learning / mastered / tricky / due", ov);
ok(wordStatus(undefined) === "new" && wordStatus(srs["ໄປ"]) === "mastered", "word status");

console.log("\nactivities");
const card = pool.find(c => c.w === "ກິນ");
const ch = choicesFor(card, pool, { rnd });
ok(ch.length === 4 && ch.filter(x => x.right).length === 1 && new Set(ch.map(x => x.label)).size === 4, "multiple choice: 4 different answers, exactly one right", ch);
ok(choicesFor(card, pool, { rnd }).filter(x => !x.right).every(x => pool.find(e => e.w === x.w).pos === card.pos), "wrong answers are the same kind of word (verbs for a verb), so it isn't guessable by type");
ok(choicesFor(card, pool, { reverse: true, rnd }).some(x => x.label === "ກິນ" && x.right), "reverse: pick the Lao word for the meaning");
ok(modeFor("mix", 0) === "flip" && modeFor("mix", 1) === "choose" && modeFor("mix", 2) === "reverse" && modeFor("mix", 3) === "listen", "mixed activities rotate");
ok(modeFor("listen", 0, { hasAudio: false }) === "choose", "listening falls back to choosing when the word has no audio");

console.log("\nhints");
const ex = [{ zh: "ຂ້ອຍກິນເຂົ້າ", tr: { en: "I eat rice" } }];
const hs = hintsFor(card, { examples: ex, picture: pictureFor(card.en) });
ok(hs[0].kind === "picture" && hs[0].value === "🍽️", "a word that can be pictured gets a picture first", hs[0]);
ok(hs.some(x => x.kind === "context" && x.value === "ຂ້ອຍ＿＿ເຂົ້າ" && x.tr === "I eat rice"), "context: an example sentence with the word blanked out");
ok(hs.some(x => x.kind === "type" && x.value === "verb") && hs.some(x => x.kind === "letters" && /^t /.test(x.value)), "kind of word, and the first letter of the meaning");
const abstractW = pool.find(c => /^(really|very|already|because|still|must|should)\b/.test(c.en) && !pictureFor(c.en));
const ah = hintsFor(abstractW, {});
ok(abstractW && !ah.some(x => x.kind === "picture") && ah.length >= 3, "an abstract word (" + (abstractW && abstractW.en) + ") has no picture but still gets 3+ hints", ah);
ok(pool.every(c => hintsFor(c, {}).length >= 2), "every word has at least two hints");
ok(maskSentence("ກິນ ແລ້ວ ກິນ", "ກິນ") === "＿＿ ແລ້ວ ＿＿", "every place the word appears is blanked");
const pics = pool.filter(c => pictureFor(c.en)).length;
ok(pics >= 40, "picture hints for " + pics + " of " + pool.length + " words");
ok(pictureFor("hello; good day") === "👋" && pictureFor("to eat") === "🍽️" && pictureFor("because") === "", "pictures from the meaning; none for abstract words");

console.log("\nthe round");
const r = createRound(pool.slice(0, 5));
ok(r.current().card.w === pool[0].w && !r.done, "one card at a time");
r.answer("known"); r.answer("missed", { hints: 1 }); r.answer("known");
ok(r.queue.length === 6 && r.queue[5].card.w === pool[1].w && r.queue[5].again, "a missed card comes back once, after 3 other cards");
r.answer("skipped"); r.answer("known");
while (!r.done) r.answer("known");
const s = r.summary();
ok(s.cards === 5 && s.known === 3 && s.missed === 1 && s.skipped === 1 && s.retried === 2 && s.fixed.length === 2 && s.pct === 60 && s.hints === 1, "summary: first tries counted once, skipped counts as not known (60%); retries listed as fixed", s);
ok(s.toPractise.length === 2, "missed and skipped words offered for practice");
const r2 = createRound(pool.slice(0, 2)); r2.answer("missed"); r2.answer("known"); r2.answer("missed");
ok(r2.done && r2.queue.length === 3, "a card comes back only once (no endless loop)");

console.log("\ncoaching pop-ups");
const R = arr => arr.map(o => ({ outcome: o, hints: 0 }));
ok(coachFor(R(["known", "skipped", "skipped", "skipped"])).key === "skips", "3 skips in a row → a pop-up");
ok(coachFor(R(["missed", "missed", "missed"])).key === "misses", "3 misses in a row → a pop-up");
ok(coachFor([1, 2, 3, 4].map(() => ({ outcome: "known", hints: 2 }))).key === "hints", "4 cards in a row with hints → a pop-up");
ok(coachFor(R(["known", "known", "known", "known", "known"])).key === "streak", "5 right in a row → praise");
ok(coachFor(R(["skipped", "skipped", "skipped"]), { skips: 1 }) === null, "the same pop-up doesn't come back for 5 cards");
ok(coachFor(R(["known", "missed", "known"])) === null, "no pop-up when nothing stands out");

console.log("\nstatistics per word");
let w = updateStats(null, "missed", { hints: 2, now }); w = updateStats(w, "skipped", { now });
ok(w.seen === 2 && w.miss === 1 && w.skip === 1 && w.hints === 2 && w.streak === 0 && isTricky(w), "missed + skipped → tricky", w);
w = updateStats(w, "known", { now }); w = updateStats(w, "almost", { now });
ok(w.ok === 1 && w.almost === 1 && w.streak === 2 && !isTricky(w), "right twice in a row → no longer tricky", w);
ok(srsGradeFor("known", 0) === 3 && srsGradeFor("known", 1) === 2 && srsGradeFor("almost", 0) === 1 && srsGradeFor("missed", 0) === 0, "answers map to spaced-review grades (a hint lowers 'easy' to 'good')");

console.log(failed ? `\n${failed} flashcard checks FAILED` : "\nAll flashcard checks passed");
process.exit(failed ? 1 : 0);
