// Tests js/shared/scoring.js — every scoring rule and its edge cases.
// Run: node scripts/test_scoring.mjs
import { DEFAULT_RULES as R, mergeRules, answerPoints, roundResult, lessonPoints, reviewPoints, dailyAward, levelFromXP, wilsonLower, skillMastery, earnedAchievements } from "../js/shared/scoring.js";

let failed = 0;
const ok = (cond, name) => { console.log((cond ? "  PASS " : "  FAIL ") + name); if (!cond) failed++; };
const A = (type, correct, self = false, skipped = false) => ({ type, correct, self, skipped });

console.log("points per answer");
ok(answerPoints("mc", true).points === 10 && answerPoints("type", true).points === 20, "harder question types earn more (multiple choice 10, typed 20)");
ok(answerPoints("mc", false).points === 0, "wrong answers earn nothing");
ok(answerPoints("unknown-type", true).points === R.defaultPoints, "unknown types use the default points");
ok(answerPoints("flashcard", true, { self: true }).points === Math.round(5 * R.selfFactor), "self-graded answers earn half points");
let c = 0, pts = [];
for (let i = 0; i < 6; i++){ const p = answerPoints("mc", true, { combo: c }); c = p.combo; pts.push(p.points); }
ok(JSON.stringify(pts) === JSON.stringify([10, 10, 15, 10, 10, 20]), `combo: +5 on the 3rd correct in a row, +10 on the 6th (${pts.join(",")})`);
ok(answerPoints("mc", true, { combo: 98 }).points === 10 + R.combo.max, "combo bonus is capped");
ok(answerPoints("mc", false, { combo: 5 }).combo === 0, "a wrong answer breaks the combo");
ok(answerPoints("flashcard", true, { self: true, combo: 2 }).combo === 2 && answerPoints("flashcard", true, { self: true, combo: 2 }).comboBonus === 0, "self-graded answers neither build nor break the combo");

console.log("rounds (quizzes)");
const perfect = roundResult([A("mc", true), A("mc", true), A("type", true), A("order", true), A("mc", true)]);
ok(perfect.pct === 100 && perfect.stars === 3 && perfect.passed, "5/5 checked answers: passed, 3 stars");
ok(perfect.bonus === R.roundBonus.pass + R.roundBonus.perfect, "perfect round gets the pass + perfect bonus");
ok(perfect.points === 10 + 10 + 25 + 15 + 10 + 50, `points = answers + combo + bonus (${perfect.points})`);
const withSelf = roundResult([A("mc", true), A("mc", true), A("flashcard", true, true)]);
ok(withSelf.pct === 100 && withSelf.stars === 2 && withSelf.bonus === R.roundBonus.pass, "100% with a self-graded answer: only 2 stars, no perfect bonus");
const sixty = roundResult([A("mc", true), A("mc", true), A("mc", true), A("mc", false), A("mc", false)]);
ok(sixty.pct === 60 && sixty.passed && sixty.stars === 1, "60%: passed with 1 star");
const failRound = roundResult([A("mc", true), A("mc", false), A("mc", false)]);
ok(!failRound.passed && failRound.stars === 0 && failRound.bonus === 0, "33%: failed, no stars, no bonus");
const skipped = roundResult([A("mc", true), A("x", false, false, true)]);
ok(skipped.total === 1 && skipped.skipped === 1 && skipped.pct === 100, "skipped questions are left out (not counted as correct)");
ok(roundResult([]).points === 0 && !roundResult([]).passed, "an empty round earns nothing and does not pass");
const r1 = roundResult([A("mc", true), A("mc", true)]).points;
ok(roundResult([A("mc", true), A("mc", true)], { repeat: 1 }).points === Math.round(r1 * 0.5), "2nd play of the same quiz today: half the points");
ok(roundResult([A("mc", true), A("mc", true)], { repeat: 9 }).points === Math.round(r1 * 0.1), "4th and later plays: 10%");

console.log("lessons, review, daily rules");
ok(lessonPoints({ viaQuiz: true }) === 50 && lessonPoints({ viaQuiz: false }) === 10, "finishing a lesson through its quiz earns 5× more than marking it complete");
ok(reviewPoints(0) === 1 && reviewPoints(2) === 5 && reviewPoints(9) === 6, "review points by grade (out-of-range grades are clamped)");
const first = dailyAward(30, { todayXP: 0, firstToday: true, streakDays: 4 });
ok(first.streak === 20 && first.xp === 50, "first activity of the day adds the streak bonus (5 × 4 days)");
ok(dailyAward(10, { todayXP: 0, firstToday: true, streakDays: 99 }).streak === R.streakBonus.max, "streak bonus is capped");
const goal = dailyAward(20, { todayXP: 90 });
ok(goal.goal === R.dailyGoalBonus && goal.xp === 45, "crossing the daily goal adds the goal bonus once");
ok(dailyAward(20, { todayXP: 120 }).goal === 0, "no goal bonus after the goal was already reached");
const cap = dailyAward(200, { todayXP: 950 });
ok(cap.xp === 50 && cap.capped, "daily cap: at most 1000 XP per day");
ok(dailyAward(10, { todayXP: 1000 }).xp === 0, "nothing more once the cap is reached");

console.log("levels");
ok(levelFromXP(0).level === 0 && levelFromXP(99).level === 0 && levelFromXP(100).level === 1, "level 1 at 100 XP");
ok(levelFromXP(300).level === 2 && levelFromXP(600).level === 3 && levelFromXP(1000).level === 4, "levels 2/3/4 at 300/600/1000 XP");
const lv = levelFromXP(450);
ok(lv.level === 2 && lv.into === 150 && lv.span === 300 && lv.pct === 50 && lv.toNext === 150, "progress to the next level");

console.log("skill mastery (Wilson lower bound)");
ok(wilsonLower(0, 0) === 0, "no answers → 0");
ok(wilsonLower(3, 3) < 0.5, `3/3 correct is not proof of mastery (lower bound ${wilsonLower(3, 3).toFixed(2)})`);
ok(wilsonLower(95, 100) > 0.88 && wilsonLower(95, 100) < 0.95, `95/100 correct → about ${wilsonLower(95, 100).toFixed(2)}`);
ok(skillMastery(5, 5).label === "new" && skillMastery(5, 5).needed === 5, "fewer than 10 answers: 'new', shows how many are still needed");
ok(skillMastery(48, 50).label === "mastered", "48/50 → mastered");
ok(skillMastery(40, 50).label === "strong" && skillMastery(30, 50).label === "practicing" && skillMastery(15, 50).label === "learning", "80% over 50 → strong, 60% → practicing, 30% → learning");

console.log("admin overrides");
const custom = mergeRules({ passPct: 70, points: { mc: 12 }, combo: { every: "x" }, stars: [1, 2], dailyCap: -5, unknown: 1 });
ok(custom.passPct === 70 && custom.points.mc === 12 && custom.points.type === 20, "valid overrides are applied, the rest stays default");
ok(custom.combo.every === 3 && custom.stars.length === 3 && custom.dailyCap === 1000 && !("unknown" in custom), "invalid overrides are ignored (wrong type, wrong length, negative, unknown key)");
ok(roundResult([A("mc", true), A("mc", true), A("mc", false)], {}, custom).passed === false, "a 70% pass mark makes 67% a fail");

console.log("achievements");
const base = { lessons: 0, passedRounds: 0, threeStarRounds: 0, streak: 0, answers: 0, accuracyLower: 0, xp: 0, level: 0, wordsMastered: 0, goalDays: 0 };
ok(earnedAchievements(base).every(a => !a.earned), "nothing earned at the start");
const got = earnedAchievements({ ...base, lessons: 1, answers: 60, accuracyLower: 0.92, streak: 7 }).filter(a => a.earned).map(a => a.id);
ok(got.includes("first_lesson") && got.includes("accuracy_90") && got.includes("streak_7") && got.includes("streak_3") && !got.includes("streak_30"), `conditions are checked exactly (${got.join(", ")})`);
ok(!earnedAchievements({ ...base, answers: 20, accuracyLower: 0.95 }).find(a => a.id === "accuracy_90").earned, "90% accuracy needs at least 50 answers");

console.log(failed ? `\n${failed} test(s) FAILED` : "\nAll tests passed");
process.exit(failed ? 1 : 0);
