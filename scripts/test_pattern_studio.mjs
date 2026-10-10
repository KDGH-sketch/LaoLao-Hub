// Pattern Studio logic (js/shared/pattern-studio.js): progress records (old "learned" patterns count as mastered),
// status, what to study next, pattern of the day, search (number, Lao, meaning, romanization typed without tone marks),
// filters. Run: node scripts/test_pattern_studio.mjs
import { patternProg, patternStatus, summary, nextPattern, patternOfDay, matchPattern, filterPatterns, plainRom, usableSentence, mastery } from "../js/shared/pattern-studio.js";

let failed = 0;
const ok = (c, m, d) => { console.log((c ? "  PASS " : "  FAIL ") + m + (!c && d !== undefined ? "  → " + JSON.stringify(d) : "")); if (!c) failed++; };
const DAY = 86400000, now = Date.UTC(2026, 9, 10);

console.log("progress records");
ok(JSON.stringify(patternProg(undefined, undefined)) === "{}", "nothing yet → empty record");
const legacy = patternProg(undefined, now - 3 * DAY);
ok(legacy.legacy && mastery(legacy) === 5 && patternStatus(legacy, now) === "mastered", "learned before the studio → mastered (5/5)");
ok(patternProg({ at: now }, now - DAY).legacy, "a record with only a timestamp still uses the old learned date");
ok(patternProg({ learn: 1 }, now).learn === 1 && !patternProg({ learn: 1 }, now).legacy, "a studio record wins over the old flag");

console.log("\nstatus");
ok(patternStatus({}, now) === "new", "new");
ok(patternStatus({ learn: 1, see: 1 }, now) === "learning", "some steps → learning");
ok(patternStatus({ learn: 1, see: 1, build: 2, fix: 2, best: 85, masteredAt: now - DAY }, now) === "mastered", "all five → mastered");
ok(patternStatus({ learn: 1, see: 1, build: 2, fix: 2, best: 85, masteredAt: now - 8 * DAY }, now) === "review", "mastered 8 days ago → review due");
ok(patternStatus({ learn: 1, see: 1, build: 2, fix: 2, best: 85, masteredAt: now - 20 * DAY, reviews: 1 }, now) === "mastered", "after one review the next is due in 30 days");
ok(patternStatus({ learn: 1, see: 1, build: 2, fix: 2, best: 70 }, now) === "learning", "challenge under 80 % is not mastered");

const P = [
  { n: 303, level: 1, hz: "ບໍ່…", py: "bɔ̀ɔ…", sec: "A", tr: { en: { meaning: "not" } } },
  { n: 1, level: 1, hz: "ແມ່ນ…ແລ້ວ", py: "mɛ̄ɛn…lɛ́ɛo", sec: "A", tr: { en: { meaning: "is indeed" } } },
  { n: 312, level: 2, hz: "ກຳລັງ…", py: "kām-láng…", sec: "C", tr: { en: { meaning: "be doing right now" }, lo: { meaning: "ກຳລັງເຮັດ" } } },
  { n: 336, level: 4, hz: "ຍິ່ງ… ຍິ່ງ…", py: "nyìng… nyìng…", sec: "E", tr: { en: { meaning: "the more … the more" } } }];
const prog = { 1: { learn: 1, see: 1, build: 2, fix: 2, best: 90, masteredAt: now - DAY }, 312: { learn: 1 }, 336: { learn: 1, see: 1, build: 2, fix: 2, best: 100, masteredAt: now - 10 * DAY } };
const progOf = p => prog[p.n] || {};

console.log("\nmap");
const s = summary(P, progOf, now);
ok(s.total === 4 && s.mastered === 1 && s.learning === 1 && s.review === 1 && s.new === 1, "counts per status", s);
ok(nextPattern(P, progOf, now).n === 312, "next: the one being learned first");
ok(nextPattern(P, p => p.n === 312 ? {} : progOf(p), now).n === 336, "then a due review");
ok(nextPattern(P, () => ({}), now).n === 1, "then the first new one (stage, then number)");
ok(nextPattern(P, () => ({ learn: 1, see: 1, build: 2, fix: 2, best: 90, masteredAt: now }), now) === null, "nothing left → none");

console.log("\npattern of the day");
const d1 = patternOfDay(P, "2026-10-10", progOf, now), d1b = patternOfDay(P, "2026-10-10", progOf, now);
ok(d1 && d1 === d1b, "the same all day");
ok(patternStatus(progOf(d1), now) !== "mastered", "not one already mastered");
const days = new Set(Array.from({ length: 30 }, (_, i) => patternOfDay(P, "2026-11-" + i, progOf, now).n));
ok(days.size >= 2, "changes from day to day (" + days.size + " different in 30 days)");
ok(patternOfDay([], "x") === null, "no patterns → none");

console.log("\nsearch");
ok(matchPattern(P[0], "303") && matchPattern(P[0], "#303") && !matchPattern(P[1], "303"), "by number (303, #303)");
ok(matchPattern(P[2], "31") && !matchPattern(P[0], "31"), "by the start of a number");
ok(matchPattern(P[1], "ແມ່ນ") && matchPattern(P[2], "ກຳລັງ"), "by the Lao");
ok(matchPattern(P[2], "right now", ["be doing right now"]) && matchPattern(P[2], "ກຳລັງເຮັດ", ["x", "ກຳລັງເຮັດ"]), "by the meaning in any language");
ok(plainRom("mɛ̄ɛn…lɛ́ɛo") === "menleo" && plainRom("kām-láng") === "kamlang", "romanization without tone marks: " + plainRom("mɛ̄ɛn…lɛ́ɛo"));
ok(matchPattern(P[1], "men") && matchPattern(P[2], "kamlang") && matchPattern(P[3], "nying"), "typed on any keyboard: men, kamlang, nying");
ok(!matchPattern(P[0], "zz") && matchPattern(P[0], "  "), "no match for nonsense; empty search shows everything");

console.log("\nfilters");
const all = filterPatterns(P, {}, progOf, now);
ok(all.map(p => p.n).join() === "1,303,312,336", "all, by stage then number", all.map(p => p.n));
ok(filterPatterns(P, { stage: 1 }, progOf, now).length === 2, "stage 1");
ok(filterPatterns(P, { status: "review" }, progOf, now).map(p => p.n).join() === "336", "status: review due");
ok(filterPatterns(P, { sec: "C" }, progOf, now).map(p => p.n).join() === "312", "section");
ok(filterPatterns(P, { stage: 1, q: "not", meaningOf: p => [p.tr.en.meaning] }, progOf, now).map(p => p.n).join() === "303", "stage + search together");

console.log("\nsentences for the exercises");
ok(usableSentence([{ role: "S" }, { role: "V" }]) && !usableSentence([{ role: "S" }, { role: "punct" }]), "2 words at least (punctuation doesn't count)");
ok(!usableSentence(Array.from({ length: 11 }, () => ({ role: "W" }))) && !usableSentence(undefined), "10 words at most");

console.log(failed ? `\n${failed} FAILED` : "\nALL PASS");
process.exit(failed ? 1 : 0);
