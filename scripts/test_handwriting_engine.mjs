// Handwriting engine: recognition, order, direction, path, start/end, count, scoring, tolerance, canvas sizes,
// guide levels, data format, and an accuracy measurement on real Lao characters (scripts/fixtures/handwriting).
// No browser needed. Run: node scripts/test_handwriting_engine.mjs
import { CHARS, templateFor, traces, rng, wobble, reverse, scribble, onCanvas } from "./fixtures/handwriting/lao-fixtures.mjs";
import { createSession, compareStroke } from "../js/shared/handwriting/recognizer.js";
import { scoreAttempt, normWeights, strokeFeedback } from "../js/shared/handwriting/scorer.js";
import { mergeHwRules, makeStroke, readTemplate, validateTemplate, demoDuration, DEFAULT_HW_RULES } from "../js/shared/handwriting/model.js";
import { resample, dtw, simplify } from "../js/shared/handwriting/geometry.js";
import { gifDurationMs } from "../js/shared/handwriting/animator.js";

let pass = 0, fail = 0;
const ok = (c, m) => { c ? pass++ : fail++; console.log((c ? "  PASS " : "  FAIL ") + m); };
const FINAL = mergeHwRules({ feedback: "final", strict: false });
const STRICT = mergeHwRules({});
const attempt = (ch, strokes, rules = FINAL, opts) => { const s = createSession(templateFor(ch), rules); strokes.forEach(p => s.addStroke(p)); return scoreAttempt(s.finish(), rules, opts); };
const move = (st, dx, dy) => st.map(p => [p[0] + dx, p[1] + dy, p[2]]);

console.log("geometry & data format");
ok(resample([[0, 0], [1, 0]], 5).map(p => p[0]).join() === "0,0.25,0.5,0.75,1", "resample spaces points evenly");
ok(dtw([[0, 0], [1, 1]], [[0, 0], [1, 1]]) === 0 && dtw([[0, 0], [1, 0]], [[1, 0], [0, 0]]) > 0.4, "DTW: identical = 0, reversed = large");
ok(simplify([[0, 0], [0.5, 0.0001], [1, 0]]).length === 2, "simplification removes points on a straight line");
const st = makeStroke([[0.1, 0.2, 0], [0.1, 0.2, 5], [0.5, 0.2, 40], [0.9, 0.2, 80]], { id: "a" });
ok(st.points.length === 2 && st.start.join() === "0.1,0.2" && st.end.join() === "0.9,0.2" && st.dir.join() === "1,0" && Math.abs(st.len - 0.8) < 1e-9, "stroke: duplicates/straight points removed; start, end, direction, length derived");
ok(makeStroke([[2, -1], [3, 5]]).points.every(p => p[0] <= 1 && p[1] >= 0), "points are clamped into the 0..1 box");
ok(makeStroke([[0.5, 0.5]]) === null, "a single point is not a stroke");
const big = makeStroke(Array.from({ length: 500 }, (_, i) => [0.5 + 0.4 * Math.cos(i / 40), 0.5 + 0.4 * Math.sin(i / 40), i * 8]));
ok(big.points.length <= 64 && big.points[big.points.length - 1][2] > 3000, "long strokes are capped at 64 points and keep their timing");
const tampered = readTemplate({ strokes: [{ id: "x", points: [[0.1, 0.1], [0.9, 0.9]], start: [0.5, 0.5], len: 99 }, { points: [[0, 0]] }, "junk"] });
ok(tampered.strokes.length === 1 && tampered.strokes[0].start.join() === "0.1,0.1" && tampered.strokes[0].len < 1.2, "stored derived fields are recomputed; broken strokes dropped");
ok(readTemplate({ strokes: [] }) === null && !validateTemplate({}).ok && validateTemplate(templateFor("ກ")).ok, "validation: empty template refused, real one accepted");
ok(readTemplate({ v: 0, strokes: [{ points: [[0, 0], [1, 1]] }] }).upgradedFrom === 0, "templates without a version are upgraded to v1");
const mr = mergeHwRules({ weights: { order: -5, path: "x" }, tolerance: { start: [0.3, 0.1], end: [0.02, 0.05] }, passScore: 150, guide: 4, feedback: "perStroke" });
ok(mr.weights.order === 0 && mr.weights.path === 25 && mr.tolerance.start.join() === DEFAULT_HW_RULES.tolerance.start.join() && mr.tolerance.end.join() === "0.02,0.05" && mr.passScore === 100,
  "rules: invalid values ignored, valid ones applied");
ok(mr.feedback === "final", "no-guide level always checks at the end (the drawing is aligned as a whole)");
ok(demoDuration(templateFor("ກີ່")) > demoDuration(templateFor("ກ")), "animation length grows with the number of strokes");

// two frames of 0.5 s and 0.3 s (GIF stores delays in 1/100 s, little-endian)
const gif = new Uint8Array("47494638396101000100800000000000ffffff21f90400320000002c000000000100010000020244010021f904001e0000002c00000000010001000002024401003b".match(/../g).map(x => parseInt(x, 16)));
ok(gifDurationMs(gif.buffer) === 800 && gifDurationMs(new Uint8Array([1, 2, 3]).buffer) === null, "18 GIF length is read from the frame delays (0.8 s); non-GIF data is refused");

console.log("1-2  stroke order");
let r = attempt("ກີ່", traces("ກີ່"));
ok(r.passed && r.total === 100 && r.ratios.order === 1, "1  correct order → 100, passed");
let s = createSession(templateFor("ແ"), STRICT);
let res = s.addStroke(traces("ແ")[1]);
ok(!res.accepted && res.error === "wrong_order" && res.index === 0 && res.looksLike === 1, "2  right stroke drawn first (strict): refused, 'this is stroke 2, draw stroke 1 first'");
const fb = strokeFeedback(res);
ok(fb.key === "hw_fb_order" && fb.vars.n === 1 && fb.vars.m === 2, "2  feedback names the expected and the drawn stroke");
res = s.addStroke(traces("ແ")[0]); res = s.addStroke(traces("ແ")[1]);
let sc = scoreAttempt(s.finish(), STRICT);
ok(res.done && sc.ratios.order === 0.5 && sc.total < 100 && sc.total >= 70, "2  after correcting it: finished, order point lost for stroke 1 (" + sc.total + ")");
r = attempt("ແ", [traces("ແ")[1], traces("ແ")[0]]);
ok(!r.passed && r.errors.wrong_order >= 1, "2  swapped order with checking at the end: not passed");

console.log("3-4  direction");
ok(compareStroke(traces("ກ")[0], readTemplate(templateFor("ກ")).strokes[0], STRICT).error === null, "3  correct direction: no error");
const back = compareStroke(reverse(traces("ກ")[0]), readTemplate(templateFor("ກ")).strokes[0], STRICT);
ok(back.error === "direction" && back.scores.direction === 0, "4  reversed stroke: wrong direction");
for (const ch of ["ຂ", "ງ", "ບ", "ອ"]){ const c = compareStroke(reverse(traces(ch)[0]), readTemplate(templateFor(ch)).strokes[0], STRICT); ok(c.error === "direction", `4  reversed ${ch} (with a head loop): wrong direction`); }

s = createSession(templateFor("ກ"), STRICT); s.addStroke(reverse(traces("ກ")[0])); s.addStroke(traces("ກ")[0]);
sc = scoreAttempt(s.finish(), STRICT);
ok(sc.passed && sc.total >= 75 && sc.total < 100 && sc.errors.direction === 1 && sc.strokes[0].corrected, "4  reversed, then corrected (strict): passes with a penalty (" + sc.total + "), the mistake is recorded");

console.log("5-7  path");
r = attempt("ອ", traces("ອ"));
ok(r.ratios.path === 1 && r.total === 100, "5  exact path: full path score");
const rr = rng(5);
r = attempt("ຂ", wobble(traces("ຂ"), rr));
ok(r.passed && r.total >= 90, "6  slightly imperfect path: passed (" + r.total + ")");
r = attempt("ຂ", [scribble(rr)]);
ok(!r.passed && r.errors.path, "7  scribble: path error, not passed (" + r.total + ")");

console.log("8-10  missing, extra, wrong stroke");
r = attempt("ກີ່", traces("ກີ່").slice(0, 2));
ok(!r.passed && r.errors.missing === 1 && r.ratios.count < 1, "8  missing stroke: not passed");
r = attempt("ກ", [...traces("ກ"), scribble(rr, 8)]);
ok(!r.passed && r.errors.extra === 1 && r.ratios.count === 0, "9  extra stroke (check at the end): counted, not passed");
s = createSession(templateFor("ກ"), STRICT); s.addStroke(traces("ກ")[0]); res = s.addStroke(scribble(rr, 8));
ok(res.error === "extra" && !res.accepted && strokeFeedback(res).key === "hw_fb_extra", "9  extra stroke while drawing (strict): refused with a hint");
r = attempt("ກ", traces("ຂ"));
ok(!r.passed, "10 a different letter (ຂ for ກ): not passed (" + r.total + ")");

console.log("11-12  start / end");
const tplK = readTemplate(templateFor("ກ")).strokes[0];
const startOff = traces("ກ")[0].map((p, i, a) => i < 4 ? [p[0] - 0.2 * (1 - i / 4), p[1], p[2]] : p);
let c = compareStroke(startOff, tplK, STRICT);
ok(c.scores.start < 0.2 && c.error === "start", "11 start far from the template's start: start error (" + c.m.startD + ")");
c = compareStroke(traces("ກ")[0].map((p, i, a) => i === 0 ? [p[0] + 0.05, p[1], p[2]] : p), tplK, STRICT);
ok(c.error === null && c.scores.start > 0.9, "11 start slightly off: tolerated");
const endOff = traces("ກ")[0].map((p, i, a) => i > a.length - 5 ? [p[0], p[1] - 0.25 * ((i - (a.length - 5)) / 4), p[2]] : p);
c = compareStroke(endOff, tplK, STRICT);
ok(c.scores.end === 0 && (c.error === "end" || c.error === "path"), "12 end far from the template's end: error (" + c.error + ")");

console.log("13  canvas sizes");
const draw = wobble(traces("ກີ່"), rng(9));
const totals = [240, 400, 800, 1600].map(px => attempt("ກີ່", onCanvas(draw, px)).total);
ok(Math.max(...totals) - Math.min(...totals) <= 1, "13 same drawing on 240/400/800/1600 px canvases → same score (" + totals.join(", ") + ")");

console.log("16-17  retries and score calculation");
const R2 = mergeHwRules({ feedback: "final", strict: false, retryPenalty: 5 });
const once = attempt("ກ", traces("ກ"), R2), third = attempt("ກ", traces("ກ"), R2, { retries: 2 });
ok(once.total === 100 && third.total === 90, "16 retry penalty: 5 points per retry (100 → 90 after 2 retries)");
const W = normWeights({ order: 3, direction: 2, path: 2.5, start: 1, end: 1, count: 0.5 });
ok(Math.abs(Object.values(W).reduce((a, b) => a + b) - 100) < 1e-9 && Math.abs(W.order - 30) < 1e-9, "17 weights are scaled to 100 (3:2:2.5:1:1:0.5 = 30/20/25/10/10/5)");
r = attempt("ກ", [reverse(traces("ກ")[0])]);
ok(Math.abs(Object.values(r.components).reduce((a, b) => a + b, 0) - r.total) <= 1, "17 components add up to the total (" + JSON.stringify(r.components) + ")");
const onlyPath = mergeHwRules({ feedback: "final", strict: false, weights: { order: 0, direction: 0, path: 1, start: 0, end: 0, count: 0 } });
r = attempt("ກ", [reverse(traces("ກ")[0])], onlyPath);
ok(r.total === 100 && !r.passed, "17 configurable weights (path only: reversed stroke scores 100 but still fails because of the direction error)");

console.log("guide levels");
const smallMoved = traces("ກີ່").map(st => st.map(p => [0.2 + p[0] * 0.5, 0.3 + p[1] * 0.5, p[2]]));
ok(!attempt("ກີ່", smallMoved).passed, "with a guide: a half-size drawing in the corner fails (position matters)");
ok(attempt("ກີ່", smallMoved, mergeHwRules({ guide: 4 })).passed, "no guide (level 4): the same drawing passes (aligned as a whole; shape, order and direction still checked)");
const smallRev = smallMoved.slice(); smallRev[0] = reverse(smallRev[0]);
ok(!attempt("ກີ່", smallRev, mergeHwRules({ guide: 4 })).passed, "no guide: a reversed stroke still fails");

console.log("strict session: undo, reset");
s = createSession(templateFor("ກີ່"), STRICT); s.addStroke(traces("ກີ່")[0]); s.addStroke(traces("ກີ່")[1]); s.undo();
ok(s.next === 1, "undo removes the last accepted stroke");
s.reset(); ok(s.next === 0 && s.accepted.length === 0, "reset starts over");

console.log("performance");
const t0 = performance.now(); for (let i = 0; i < 200; i++) attempt("ກີ່", draw);
const per = (performance.now() - t0) / 200;
ok(per < 20, `scoring a 3-stroke character takes ${per.toFixed(2)} ms`);

console.log("accuracy on the real-character test set (deterministic random variations)");
const ra = rng(2026), chars = Object.keys(CHARS), stat = {};
const tally = (k, x) => { const e = stat[k] = stat[k] || { n: 0, pass: 0 }; e.n++; if (x.passed) e.pass++; };
for (const ch of chars) for (let i = 0; i < 100; i++){
  tally("correct", attempt(ch, wobble(traces(ch), ra)));
  tally("sloppy but correct", attempt(ch, wobble(traces(ch), ra, { noise: 0.02, scale: 0.15, shiftBy: 0.06, rot: 0.1 })));
  const rv = wobble(traces(ch), ra); const k = Math.floor(ra() * rv.length); rv[k] = reverse(rv[k]); tally("one stroke reversed", attempt(ch, rv));
  tally("scribble", attempt(ch, traces(ch).map(() => scribble(ra))));
  const other = chars.filter(o => o !== ch && CHARS[o].strokes.length === CHARS[ch].strokes.length);
  if (other.length) tally("a different letter", attempt(ch, wobble(traces(other[Math.floor(ra() * other.length)]), ra)));
  if (CHARS[ch].strokes.length > 1){ const sw = wobble(traces(ch), ra); [sw[0], sw[1]] = [sw[1], sw[0]]; tally("two strokes swapped", attempt(ch, sw)); tally("last stroke missing", attempt(ch, wobble(traces(ch), ra).slice(0, -1))); }
}
for (const [k, v] of Object.entries(stat)) console.log(`       ${k.padEnd(22)} ${String(v.n).padStart(4)} drawings · passed ${(100 * v.pass / v.n).toFixed(1)}%`);
ok(stat["correct"].pass / stat["correct"].n >= 0.99, "correct drawings pass (≥ 99%)");
ok(stat["sloppy but correct"].pass / stat["sloppy but correct"].n >= 0.95, "sloppy but correct drawings pass (≥ 95%)");
for (const k of ["one stroke reversed", "scribble", "two strokes swapped", "last stroke missing"]) ok(stat[k].pass / stat[k].n <= 0.01, `${k}: refused (≤ 1% pass)`);
ok(stat["a different letter"].pass / stat["a different letter"].n <= 0.06, "a different letter: refused (≤ 6% pass; ບ/ປ differ only by the tail height)");

console.log(`\n${pass} passed, ${fail} failed`);
if (fail){ console.log("Some tests failed"); process.exit(1); }
console.log("All tests passed");
