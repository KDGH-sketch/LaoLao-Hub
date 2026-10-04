// Stroke recognition: compares the learner's strokes with a template (order, direction, path, start/end, count).
// Pure (no DOM). Algorithm and its reasons: docs/HANDWRITING.md.
//
//   compareStroke(points, templateStroke, rules) → measurements, component scores (0..1) and an error code
//   createSession(template, rules)               → addStroke(points) / undo() / finish() → summary for scoring
import { resample, dtw, dist, pathLength, maxDeviation, falloff, fitStrokes, unionBox } from "./geometry.js";
import { readTemplate, mergeHwRules } from "./model.js";

export const N = 32;   // points per stroke after resampling
const xy = pts => pts.map(p => [p[0], p[1]]);
const prep = pts => resample(xy(pts), N);
const tolFor = (R, s) => Object.assign({}, R.tolerance, s && s.tol);

// Error codes (in priority order): incomplete · path · direction · start · end. wrong_order / extra / missing come from the session.
export function compareStroke(points, stroke, R){
  const tol = tolFor(R, stroke);
  const L = prep(points), T = prep(stroke.points), Tr = T.slice().reverse();
  const fwd = dtw(L, T), rev = dtw(L, Tr), best = Math.min(fwd, rev);
  const lenT = stroke.len || pathLength(T), lenRatio = lenT ? pathLength(L) / lenT : 0;
  const startD = dist(L[0], T[0]), endD = dist(L[N - 1], T[N - 1]);
  const dev = maxDeviation(L, rev < fwd ? Tr : T);
  const ratio = rev > 0 ? fwd / rev : 1;                 // < 1: follows the template's direction
  const reversed = rev < fwd * tol.reverseRatio;
  const scores = {
    path: falloff(best, tol.path[0], tol.path[1]) * (lenRatio > tol.maxLength ? 0.5 : 1),
    direction: falloff(ratio, 0.85, 1 / tol.reverseRatio),
    start: falloff(startD, tol.start[0], tol.start[1]),
    end: falloff(endD, tol.end[0], tol.end[1])
  };
  // how well the shape fits regardless of direction (used to recognise which stroke the learner actually drew)
  const fit = falloff(best, tol.path[0], tol.path[1]) * (lenRatio < tol.minLength ? lenRatio / tol.minLength : 1);
  let error = null;
  if (lenRatio < tol.minLength && best > tol.path[0]) error = "incomplete";
  else if (best > tol.path[1] || dev > tol.maxDev || lenRatio > tol.maxLength) error = "path";
  else if (reversed) error = "direction";
  else if (startD > tol.start[1]) error = "start";
  else if (endD > tol.end[1]) error = "end";
  return { error, scores, fit, m: { fwd: r3(fwd), rev: r3(rev), dev: r3(dev), startD: r3(startD), endD: r3(endD), lenRatio: r3(lenRatio) } };
}
const r3 = x => Math.round(x * 1000) / 1000;

// A drawing session for one character.
// rules: already merged (mergeHwRules). feedback "perStroke": each stroke is checked when it ends;
// strict: a wrong stroke is not accepted (the learner redraws it). feedback "final": strokes are checked at finish().
export function createSession(template, rules){
  const tpl = readTemplate(template);
  if (!tpl) throw new Error("This character has no stroke template.");
  const R = rules && rules.weights ? rules : mergeHwRules(rules);
  const S = tpl.strokes, n = S.length;
  let idx = 0, extra = 0;
  const accepted = [];          // [{ index, points, res }]
  const first = new Array(n);   // first try at each expected stroke: { res, error }
  const tries = new Array(n).fill(0);
  const pending = [];           // "final" mode: raw strokes until finish()

  function judge(points, i){
    const res = compareStroke(points, S[i], R);
    let error = res.error, looksLike = null;
    if (error){
      // did the learner draw another (later) stroke instead? → wrong order
      let bestJ = -1, bestFit = 0;
      for (let j = 0; j < n; j++){
        if (j === i || accepted.some(a => a.index === j)) continue;
        const r2 = compareStroke(points, S[j], R);
        if (!r2.error && r2.fit > bestFit){ bestFit = r2.fit; bestJ = j; }
      }
      if (bestJ >= 0 && bestFit >= R.tolerance.matchMin && bestFit > res.fit + R.tolerance.orderMargin){ error = "wrong_order"; looksLike = bestJ; }
    }
    return { res, error, looksLike };
  }
  function place(points, strict){
    if (idx >= n){ extra++; return { accepted: !strict, error: "extra", index: null, done: true }; }
    const i = idx, j = judge(points, i);
    tries[i]++;
    if (!first[i]) first[i] = j;
    if (j.error && strict) return { accepted: false, error: j.error, index: i, looksLike: j.looksLike, res: j.res, done: false };
    accepted.push({ index: i, points, res: j.res, error: j.error });
    idx++;
    return { accepted: true, error: j.error, index: i, looksLike: j.looksLike, res: j.res, done: idx >= n };
  }

  return {
    template: tpl, rules: R, get count(){ return n; }, get next(){ return idx; }, get accepted(){ return accepted.slice(); },
    addStroke(points){
      if (!points || points.length < 2) return { accepted: false, error: "incomplete", index: idx, done: idx >= n };
      if (R.feedback === "final"){ pending.push(points); return { accepted: true, pending: true, index: pending.length - 1, done: false }; }
      return place(points, R.strict);
    },
    undo(){
      if (R.feedback === "final"){ pending.pop(); return; }
      if (accepted.length){ accepted.pop(); idx--; }
    },
    reset(){ idx = 0; extra = 0; accepted.length = 0; pending.length = 0; first.fill(undefined); tries.fill(0); },
    finish(){
      if (R.feedback === "final"){
        let strokes = pending.slice();
        // no guide: align the whole drawing with the template's box first (size and position are free, shape is not)
        if (R.guide === 4 && strokes.length) strokes = fitStrokes(strokes.map(xy), unionBox(S.map(s => s.bbox)));
        for (const p of strokes) place(p, false);
      }
      return summarize();
    }
  };

  // per expected stroke: geometry from the first try (that was the learner's attempt at it), except when the first try
  // was another stroke (wrong order): then the geometry of the accepted stroke counts and the order point is lost.
  function summarize(){
    const strokes = S.map((s, i) => {
      const f = first[i], acc = accepted.find(a => a.index === i);
      if (!f && !acc) return { id: s.id, index: i, missing: true, order: 0, direction: 0, path: 0, start: 0, end: 0, error: "missing", tries: 0 };
      // a mistake that was then corrected (strict mode) earns half: the average of the wrong and the corrected try
      const wrongOrder = f && f.error === "wrong_order";
      const base = wrongOrder ? (acc ? acc.res : f.res) : f.res;
      const fixed = !wrongOrder && f && f.error && acc && !acc.error ? acc.res : null;
      const sc = k => r3(fixed ? (base.scores[k] + fixed.scores[k]) / 2 : base.scores[k]);
      return { id: s.id, index: i, order: wrongOrder ? 0 : 1, direction: sc("direction"), path: sc("path"),
        start: sc("start"), end: sc("end"), error: f ? f.error : null, corrected: !!(fixed || (wrongOrder && acc)), tries: tries[i], m: base.m };
    });
    const missing = strokes.filter(s => s.missing).length;
    // errors still present in the finished drawing (strict mode corrects them as it goes; "final" mode cannot)
    const finalErrors = accepted.filter(a => a.error).length + missing + (R.strict && R.feedback !== "final" ? 0 : extra);
    return { count: n, drawn: accepted.length + extra, extra, missing, strokes, complete: missing === 0, finalErrors };
  }
}
