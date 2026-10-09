// Smart Review's diagnosis (js/shared/review-doctor.js) and what the practice coach records for it: the cause of a
// mistake from what was picked instead, the letters that differ, the review question aimed at the cause, the grade,
// how well a card is remembered, the week's forecast.
// Run: node scripts/test_review.mjs
import { confusion, diagnose, diffParts, causeSummary, reviewQuestion, gradeFor, recall, forecast, wordForMeaning } from "../js/shared/review-doctor.js";
import { coachInit, coachAnswer } from "../js/shared/practice-coach.js";
import { seeded } from "../js/shared/practice-library.js";

let failed = 0;
const ok = (c, m, d) => { console.log((c ? "  PASS " : "  FAIL ") + m + (!c && d !== undefined ? "  → " + JSON.stringify(d).slice(0, 400) : "")); if (!c) failed++; };

console.log("the cause of a confusion");
const cases = [["ປ່າ","ປ້າ","tone"],["ໝາ","ມາ","tone"],["ຂາ","ຄາ","tone"],["ເສືອ","ເສື້ອ","tone"],["ສອງ","ຊອງ","tone"],["ຂາດ","ຂັດ","length"],["ມີດ","ມິດ","length"],
  ["ບ່າ","ປ່າ","lookalike"],["ດີ","ຕີ","lookalike"],["ແປດ","ເປັດ","vowel"],["ຄື","ຄູ","vowel"],["ສີແດງ","ສີຂຽວ","related"],["ໝາ","ແມວ","related"],["ກິນເຂົ້າ","ເຂົ້າກິນ","order"],["ສະບາຍດີ","ຂອບໃຈ","related"]];
const bad = cases.filter(([k, g, want]) => (confusion(k, g) || {}).code !== want).map(([k, g, w]) => k + "/" + g + " " + (confusion(k, g) || {}).code + "≠" + w);
ok(!bad.length, `${cases.length} confusions classified (tone, vowel length, look-alike letters, vowel, related meanings, word order)`, bad);
ok(confusion("ປ່າ","ປ້າ").tones.join() === "2,3" && confusion("ໝາ","ມາ").tones.join() === "5,1", "a tone mix-up names both tones (ປ່າ tone 2 vs ປ້າ tone 3)");
ok(confusion("ກາ","ກາ") === null && confusion("dog","cat") === null, "same word or no Lao: no confusion");
const dp = diffParts("ເຂົ້າໜຽວ", "ເຂົ້າຈ້າວ");
ok(dp.a.filter(p => p.diff).map(p => p.text).join("") === "ໜຽ" && dp.b.some(p => p.diff) && dp.a[0].text === "ເຂົ້າ" && !dp.a[0].diff, "the differing letters are marked, marks kept with their letter", dp);

console.log("\nwhat the coach records, and the diagnosis");
const s = coachInit({}), now = Date.UTC(2026, 9, 9);
coachAnswer(s, { skill:"listening", correct:true, item:{ k:"ໝາ", en:"dog", zh:"狗" }, now });
coachAnswer(s, { skill:"listening", correct:false, item:{ k:"ໝາ", en:"dog", zh:"狗" }, given:"ມາ", ms:3000, now });
coachAnswer(s, { skill:"vocabulary", correct:false, item:{ k:"ໝາ", en:"dog", zh:"狗" }, given:"cat", ms:2500, now });
coachAnswer(s, { skill:"vocabulary", correct:false, item:{ k:"ໝາ", en:"dog", zh:"狗" }, given:true, now });
const it = Object.assign({ k:"ໝາ" }, s.it["ໝາ"]);
ok(it.hb === "1000" && it.x.length === 2 && it.x[0].g === "cat" && it.x[1].g === "ມາ", "the coach keeps the answer history and what was picked instead (true/false answers left out)", it);
const d = diagnose(it);
ok(d[0].code === "tone" && d[0].g === "ມາ" && d.some(c => c.code === "related" && c.g === "ແມວ" && c.viaMeaning) && d.some(c => c.code === "forgetting"), "diagnosis: tone mix-up with ມາ, related meaning (picked 'cat' = ແມວ), forgetting", d.map(c => c.code + ":" + (c.g || "")));
ok(wordForMeaning("cat") === "ແມວ" && wordForMeaning("猫") === "ແມວ", "a picked meaning is traced back to its Lao word");
ok(diagnose({ k:"ກິນ", r:4, w:0, hb:"1111", ms:9500 })[0].code === "slow", "right but slow (9.5 s): 'not automatic yet'");
ok(diagnose({ k:"ກິນ", w:3, r:0, hb:"000" })[0].code === "hard", "missed 3 times with no other clue: 'needs more practice'");
const sum = causeSummary([it, { k:"ຂາດ", w:1, x:[{ g:"ຂັດ" }] }, { k:"ປ່າ", w:2, x:[{ g:"ປ້າ" }] }]);
ok(sum[0].code === "tone" && sum[0].n === 2 && sum.some(c => c.code === "length"), "the overview counts words per cause", sum);

console.log("\nreview questions aimed at the cause");
const pool = ["ແມວ","ງົວ","ໝູ","ມ້າ","ນົກ","ປາ"];
const q1 = reviewQuestion(it, { pool, rand:seeded(1) });
ok(q1.type === "listen_select" && q1.options.join() === "ໝາ,ມາ" && q1.answer === 0 && q1.cause === "tone", "tone mix-up → hear the two and pick the one said", q1);
const q2 = reviewQuestion({ k:"ບ່າ", en:"shoulder", w:1, x:[{ g:"ປ່າ" }] }, { pool, rand:seeded(2) });
ok(q2.type === "mc" && q2.options[0] === "ບ່າ" && q2.options.includes("ປ່າ") && q2.cause === "lookalike", "look-alike letters → pick the right spelling against the look-alike", q2.options);
const q3 = reviewQuestion({ k:"ໝາ", en:"dog", zh:"狗", w:1, x:[{ g:"cat" }] }, { pool, rand:seeded(3) });
ok(q3.type === "mc" && q3.options[0] === "dog" && q3.options.includes("cat") && q3.cause === "related", "related meaning → choose the meaning against the confused one", q3.options);
const q4 = reviewQuestion({ k:"ກິນເຂົ້າ", en:"eat a meal", w:1, x:[{ g:"ເຂົ້າກິນ" }] }, { pool, rand:seeded(4) });
ok(q4.type === "order" && q4.tokens.map(x => x.z).join("") === "ກິນເຂົ້າ", "word order → put it in order", q4.type);
const q5 = reviewQuestion({ k:"ນົກ", en:"bird", zh:"鸟", w:2, hb:"00" }, { pool, rand:seeded(5) });
ok(q5.type === "mc" && q5.options[0] === "bird" && new Set(q5.options).size === q5.options.length, "no confusion known → recall the meaning", q5.options);
ok(q1.item.k === "ໝາ" && q1.diag.length >= 1, "each question carries the item and its diagnosis (to explain after answering)");

console.log("\ngrades, memory, forecast");
ok(gradeFor(false, 1000) === 0 && gradeFor(true, 9000) === 2 && gradeFor(true, 2000) === 3, "grade: wrong 0, right but slow 2, right and quick 3");
const card = { ivl: 4, due: now + 2 * 864e5, reps: 2 };
ok(recall(card, now) > 0.6 && recall(card, now + 20 * 864e5) < 0.1, "memory: strong just after a review, weak long after it was due");
const fc = forecast([{ due: now - 1 }, { due: now + 1.2 * 864e5 }, { due: now + 1.5 * 864e5 }, { due: now + 9 * 864e5 }], 7, now);
ok(fc.length === 7 && fc[0] >= 1 && fc.reduce((a, b) => a + b, 0) === 3, "7-day forecast (overdue cards count today; later ones are outside the week)", fc);

console.log(failed ? `\n${failed} review checks FAILED` : "\nAll review checks passed");
process.exit(failed ? 1 : 0);
