// Scoring rules for LaoLao. Pure functions only (no database, no DOM) so every rule can be unit-tested.
// Admins can override any number in Admin → Settings → Scoring rules (stored in settings/scoring).

export const DEFAULT_RULES = {
  // points for a correct answer, by question type (harder types earn more)
  points: { mc: 10, fill: 10, tone: 12, listen_select: 12, order: 15, match: 15, type: 20, listen_type: 20, speak: 15, write_char: 8, flashcard: 5, handwriting: 15 },
  defaultPoints: 10,
  // answers the learner grades themselves earn this share of the points and do not count toward skill accuracy
  selfFactor: 0.5,
  // combo: +bonus for every `every` correct answers in a row (checked answers only), at most `max` per answer
  combo: { every: 3, bonus: 5, max: 15 },
  // a round (quiz) is passed at passPct; stars at these percentages; 3 stars also requires no self-graded answers
  passPct: 60,
  stars: [60, 80, 100],
  roundBonus: { pass: 20, perfect: 30 },
  // replaying the same quiz on the same day earns less each time (1st, 2nd, 3rd, 4th+ round)
  repeatFactors: [1, 0.5, 0.25, 0.1],
  // lessons: finished through a passed quiz vs. only marked complete
  lesson: { quizComplete: 50, manualComplete: 10 },
  // spaced-repetition review, by grade (0 again, 1 hard, 2 good, 3 easy)
  review: [1, 3, 5, 6],
  // daily goal, streak bonus (first activity of the day, per streak day) and a cap against farming
  dailyGoal: 100, dailyGoalBonus: 25,
  streakBonus: { perDay: 5, max: 50 },
  dailyCap: 1000,
  // skill mastery uses the lower bound of a 95% confidence interval: accuracy has to be proven over enough answers
  mastery: { minAnswers: 10, z: 1.96, levels: [[0.8, "mastered"], [0.65, "strong"], [0.4, "practicing"], [0, "learning"]] },
  // level n needs levelBase * n * (n+1) / 2 XP in total: 100, 300, 600, 1000, …
  levelBase: 100
};

const isObj = v => v && typeof v === "object" && !Array.isArray(v);
// defaults merged with the admin's overrides; invalid overrides are ignored
export function mergeRules(over){
  const out = JSON.parse(JSON.stringify(DEFAULT_RULES));
  const walk = (dst, src) => { if (!isObj(src)) return; for (const k in src){
    if (!(k in dst)) continue;
    if (isObj(dst[k])) walk(dst[k], src[k]);
    else if (Array.isArray(dst[k])) { if (Array.isArray(src[k]) && src[k].length === dst[k].length) dst[k] = src[k]; }
    else if (typeof dst[k] === "number" && Number.isFinite(+src[k]) && +src[k] >= 0) dst[k] = +src[k];
  } };
  walk(out, over);
  return out;
}

export const SELF_GRADED = new Set(["flashcard", "write_char"]);

// Points for one answer. `combo` = correct checked answers in a row before this one.
export function answerPoints(type, correct, { self = false, combo = 0 } = {}, R = DEFAULT_RULES){
  if (!correct) return { points: 0, combo: self ? combo : 0, comboBonus: 0 };
  const base = R.points[type] ?? R.defaultPoints;
  if (self) return { points: Math.round(base * R.selfFactor), combo, comboBonus: 0 };   // self-graded: no combo
  const next = combo + 1;
  const comboBonus = next % R.combo.every === 0 ? Math.min(R.combo.max, R.combo.bonus * (next / R.combo.every)) : 0;
  return { points: base + comboBonus, combo: next, comboBonus };
}

// Result of a whole round. answers: [{ type, correct, self, skipped }]
export function roundResult(answers, { repeat = 0 } = {}, R = DEFAULT_RULES){
  const counted = answers.filter(a => !a.skipped);
  const total = counted.length, right = counted.filter(a => a.correct).length;
  const selfCount = counted.filter(a => a.self).length;
  const pct = total ? Math.round(100 * right / total) : 0;
  const passed = total > 0 && pct >= R.passPct;
  let stars = 0; R.stars.forEach((s, i) => { if (pct >= s) stars = i + 1; });
  if (stars === 3 && selfCount > 0) stars = 2;                    // a perfect score must be fully checked
  let combo = 0, answerPts = 0, comboPts = 0;
  for (const a of counted){ const p = answerPoints(a.type, a.correct, { self: a.self, combo }, R); combo = p.combo; answerPts += p.points; comboPts += p.comboBonus; }
  const bonus = (passed ? R.roundBonus.pass : 0) + (pct === 100 && selfCount === 0 && total > 0 ? R.roundBonus.perfect : 0);
  const factor = R.repeatFactors[Math.min(repeat, R.repeatFactors.length - 1)];
  const points = Math.round((answerPts + bonus) * factor);
  return { right, total, pct, passed, stars, selfCount, skipped: answers.length - total, answerPts, comboPts, bonus, factor, points };
}

// A checked handwriting character (js/shared/handwriting/scorer.js result) as a round: same stars, pass bonus and replay rule as quizzes
export function handwritingRound(score, { repeat = 0 } = {}, R = DEFAULT_RULES){
  const pct = Math.max(0, Math.min(100, Math.round(score.total)));
  const passed = !!score.passed;
  let stars = 0; if (passed) R.stars.forEach((s, i) => { if (pct >= s) stars = i + 1; });
  const base = passed ? Math.round((R.points.handwriting ?? R.defaultPoints) * pct / 100) : 0;
  const bonus = passed ? R.roundBonus.pass + (pct === 100 ? R.roundBonus.perfect : 0) : 0;
  const factor = R.repeatFactors[Math.min(repeat, R.repeatFactors.length - 1)];
  return { right: passed ? 1 : 0, total: 1, pct, passed, stars, selfCount: 0, skipped: 0, answerPts: base, comboPts: 0, bonus, factor, points: Math.round((base + bonus) * factor) };
}

export const lessonPoints = ({ viaQuiz }, R = DEFAULT_RULES) => viaQuiz ? R.lesson.quizComplete : R.lesson.manualComplete;
export const reviewPoints = (grade, R = DEFAULT_RULES) => R.review[Math.max(0, Math.min(3, grade | 0))];

// Applies the daily cap, the streak bonus (first XP of the day) and the daily-goal bonus (when crossing the goal).
// Returns the XP to add and what it consists of.
export function dailyAward(points, { todayXP = 0, firstToday = false, streakDays = 0 } = {}, R = DEFAULT_RULES){
  let streak = firstToday && streakDays > 0 ? Math.min(R.streakBonus.max, R.streakBonus.perDay * streakDays) : 0;
  let goal = todayXP < R.dailyGoal && todayXP + points + streak >= R.dailyGoal ? R.dailyGoalBonus : 0;
  let total = points + streak + goal;
  const room = Math.max(0, R.dailyCap - todayXP);
  const capped = total > room;
  if (capped) total = room;
  return { xp: total, streak, goal, capped };
}

// Level from total XP: level n needs levelBase*n(n+1)/2
export function levelFromXP(xp, R = DEFAULT_RULES){
  xp = Math.max(0, xp | 0);
  const need = n => R.levelBase * n * (n + 1) / 2;
  let level = 0; while (xp >= need(level + 1)) level++;
  const from = need(level), to = need(level + 1);
  return { level, xp, into: xp - from, span: to - from, toNext: to - xp, pct: Math.round(100 * (xp - from) / (to - from)) };
}

// Wilson score lower bound: a cautious estimate of real accuracy given r correct out of t
export function wilsonLower(r, t, z = 1.96){
  if (!t) return 0;
  const p = r / t, z2 = z * z;
  return Math.max(0, (p + z2 / (2 * t) - z * Math.sqrt((p * (1 - p) + z2 / (4 * t)) / t)) / (1 + z2 / t));
}
export function skillMastery(r, t, R = DEFAULT_RULES){
  const raw = t ? r / t : 0;
  if (t < R.mastery.minAnswers) return { pct: Math.round(100 * wilsonLower(r, t, R.mastery.z)), raw: Math.round(100 * raw), label: t ? "new" : "none", answers: t, needed: R.mastery.minAnswers - t };
  const lb = wilsonLower(r, t, R.mastery.z);
  const label = R.mastery.levels.find(([min]) => lb >= min)[1];
  return { pct: Math.round(100 * lb), raw: Math.round(100 * raw), label, answers: t, needed: 0 };
}

// Achievements: each has a clear, checkable condition on the learner's stats
export const ACHIEVEMENTS = [
  { id: "first_lesson",  test: s => s.lessons >= 1 },
  { id: "lessons_5",     test: s => s.lessons >= 5 },
  { id: "first_pass",    test: s => s.passedRounds >= 1 },
  { id: "three_stars",   test: s => s.threeStarRounds >= 1 },
  { id: "perfect_10",    test: s => s.threeStarRounds >= 10 },
  { id: "streak_3",      test: s => s.streak >= 3 },
  { id: "streak_7",      test: s => s.streak >= 7 },
  { id: "streak_30",     test: s => s.streak >= 30 },
  { id: "answers_100",   test: s => s.answers >= 100 },
  { id: "answers_1000",  test: s => s.answers >= 1000 },
  { id: "accuracy_90",   test: s => s.answers >= 50 && s.accuracyLower >= 0.9 },
  { id: "xp_1000",       test: s => s.xp >= 1000 },
  { id: "level_5",       test: s => s.level >= 5 },
  { id: "words_50",      test: s => s.wordsMastered >= 50 },
  { id: "goal_7",        test: s => s.goalDays >= 7 }
];
export const earnedAchievements = stats => ACHIEVEMENTS.map(a => ({ id: a.id, earned: !!a.test(stats) }));
