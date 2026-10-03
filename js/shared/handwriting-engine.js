// Lao handwriting stroke-order recognition: pure geometry + scoring functions, no DOM.
// Kept separate from js/shared/quiz.js (UI) the same way js/shared/scoring.js is kept separate
// from the quiz runner -- independently unit-testable (see scripts/test_handwriting_engine.mjs).
//
// All coordinates are normalized to [0,1] relative to the square practice grid, never raw pixels,
// so the same stroke data works at any canvas size (phone, tablet, desktop).
//
// Algorithm: point-resampling + normalized-distance comparison (not Dynamic Time Warping).
// Lao consonants here are short (1-4 simple strokes), so a fixed-N resample compared point-to-point
// is O(n), trivial to tune and unit-test, and fast enough to run live in the browser. DTW/Hausdorff
// would add real alignment complexity for a tolerance-based pedagogical check that doesn't need it;
// documented as a possible future upgrade if resampled comparison proves too strict/lenient in use.

export const DEFAULT_HW_RULES = {
  resamplePoints: 32,
  // weights must sum to 100; see scoreAttempt()
  weights: { order: 25, direction: 20, path: 30, start: 12.5, end: 12.5 },
  // tolerances are fractions of the normalized [0,1] grid (or, for direction, a cosine threshold)
  tolerance: { path: 0.22, start: 0.18, end: 0.18, directionCos: 0.4 },
  passScore: 60
};

const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const clamp01 = x => Math.max(0, Math.min(1, x));

// Evenly resample a polyline (by arc length) to exactly n points. A degenerate stroke (0-1 points,
// or zero length -- a tap) resamples to n copies of its single point rather than throwing.
export function resamplePoints(points, n){
  if (!points || points.length === 0) return [];
  if (points.length === 1 || n <= 1) return Array.from({ length: Math.max(1, n) }, () => ({ ...points[0] }));
  const segLens = [];
  let total = 0;
  for (let i = 1; i < points.length; i++){ const d = dist(points[i-1], points[i]); segLens.push(d); total += d; }
  if (total === 0) return Array.from({ length: n }, () => ({ ...points[0] }));
  const step = total / (n - 1);
  const out = [points[0]];
  let segIdx = 0, segStart = 0, acc = 0;
  for (let k = 1; k < n - 1; k++){
    const target = k * step;
    while (segIdx < segLens.length && acc + segLens[segIdx] < target){ acc += segLens[segIdx]; segIdx++; }
    const segLen = segLens[segIdx] || 1e-9;
    const t = clamp01((target - acc) / segLen);
    const a = points[segIdx], b = points[segIdx+1] || points[segIdx];
    out.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
  }
  out.push(points[points.length - 1]);
  return out;
}

const pathAccuracy = (learner, ref, tol) => {
  let sum = 0;
  for (let i = 0; i < ref.length; i++) sum += dist(learner[i], ref[i]);
  const meanDist = sum / ref.length;
  return clamp01(1 - meanDist / tol);
};

const positionAccuracy = (a, b, tol) => clamp01(1 - dist(a, b) / tol);

function unitVec(a, b){
  const dx = b.x - a.x, dy = b.y - a.y, len = Math.hypot(dx, dy);
  return len === 0 ? { x: 0, y: 0 } : { x: dx/len, y: dy/len };
}
// Direction similarity: cosine of the angle between the learner's and reference's overall
// start->end vectors, plus two sub-segment checks so a curved stroke drawn backwards is still caught.
const directionAccuracy = (learnerRs, refRs, cosThreshold) => {
  const segs = [[0, refRs.length-1], [0, Math.floor(refRs.length/2)], [Math.floor(refRs.length/2), refRs.length-1]];
  let cosSum = 0;
  segs.forEach(([i, j]) => {
    const lv = unitVec(learnerRs[i], learnerRs[j]), rv = unitVec(refRs[i], refRs[j]);
    const cos = lv.x*rv.x + lv.y*rv.y; // both unit vectors (or zero), so this is already the cosine
    cosSum += cos;
  });
  const avgCos = cosSum / segs.length;
  // map [cosThreshold..1] -> [0..1]; anything at/below threshold scores 0
  return clamp01((avgCos - cosThreshold) / (1 - cosThreshold));
};

// Score one drawn stroke against its matched reference stroke. Returns 0-1 sub-scores per component
// (order is scored at the attempt level, not per-stroke -- see scoreAttempt).
export function scoreStroke(learnerPoints, refStroke, rules = DEFAULT_HW_RULES){
  const n = rules.resamplePoints;
  const learnerRs = resamplePoints(learnerPoints, n);
  const refRs = resamplePoints(refStroke.points, n);
  return {
    path: pathAccuracy(learnerRs, refRs, rules.tolerance.path),
    direction: directionAccuracy(learnerRs, refRs, rules.tolerance.directionCos),
    start: positionAccuracy(learnerRs[0], refRs[0], rules.tolerance.start),
    end: positionAccuracy(learnerRs[n-1], refRs[n-1], rules.tolerance.end)
  };
}

// Score a full attempt (all strokes for one character) against its reference stroke list.
// learnerStrokes: [{ points:[{x,y}, ...] }, ...] in the order drawn.
// refStrokes: [{ order, points, start, end }, ...] from characters.data.strokes.
export function scoreAttempt(learnerStrokes, refStrokes, rules = DEFAULT_HW_RULES){
  const w = rules.weights;
  const matched = Math.min(learnerStrokes.length, refStrokes.length);
  const perStroke = [];
  let pathSum = 0, dirSum = 0, startSum = 0, endSum = 0;
  for (let i = 0; i < matched; i++){
    const s = scoreStroke(learnerStrokes[i].points, refStrokes[i], rules);
    perStroke.push({ order: i+1, ...s, ok: s.path >= 0.5 && s.direction >= 0.5 });
    pathSum += s.path; dirSum += s.direction; startSum += s.start; endSum += s.end;
  }
  // Order/count: 1.0 only when the learner drew exactly as many strokes as the reference. Each
  // missing or extra stroke costs a share of the order component (floor at 0). Positional
  // mis-ordering (stroke 2 drawn where stroke 1 should be) is caught indirectly: it shows up as a
  // poor start/path score at that position, since each drawn stroke i is compared to reference i.
  const countDelta = Math.abs(learnerStrokes.length - refStrokes.length);
  const orderScore = clamp01(1 - countDelta / Math.max(1, refStrokes.length));
  const avg = sum => matched ? sum / matched : 0;
  const components = {
    order: Math.round(orderScore * w.order),
    direction: Math.round(avg(dirSum) * w.direction),
    path: Math.round(avg(pathSum) * w.path),
    start: Math.round(avg(startSum) * w.start),
    end: Math.round(avg(endSum) * w.end)
  };
  // Rounding each weighted component independently can push the sum a point or two over the
  // combined weight total (e.g. several components each round up); clamp so "100" always means 100.
  const total = Math.min(100, Object.values(components).reduce((a,b) => a+b, 0));
  return {
    total, components, perStroke,
    strokeCountExpected: refStrokes.length, strokeCountDrawn: learnerStrokes.length,
    passed: total >= rules.passScore
  };
}

// Human-readable feedback per the spec's "useful, not just 'Wrong'" requirement.
// Returns an array of { kind, text } so the UI can style by kind (ok/warn/bad).
export function feedbackFor(result, lang = "en"){
  const L = {
    en: {
      missing: n => `You drew ${n} fewer stroke${n>1?"s":""} than expected.`,
      extra: n => `You drew ${n} extra stroke${n>1?"s":""} than expected.`,
      order: i => `Check stroke ${i}: the order or position looks off.`,
      direction: i => `Check the direction of stroke ${i} -- it looks reversed.`,
      path: i => `Stroke ${i}'s shape is a bit far from the guide -- try following it more closely.`,
      good: "Nicely done!",
      pass: "Good -- that passes!"
    },
    lo: {
      missing: n => `ທ່ານຂີດໜ້ອຍກວ່າທີ່ຄາດໄວ້ ${n} ເສັ້ນ.`,
      extra: n => `ທ່ານຂີດຫຼາຍກວ່າທີ່ຄາດໄວ້ ${n} ເສັ້ນ.`,
      order: i => `ກວດເບິ່ງເສັ້ນທີ ${i}: ລຳດັບ ຫຼື ຕຳແໜ່ງອາດຜິດ.`,
      direction: i => `ກວດທິດທາງຂອງເສັ້ນທີ ${i} -- ມັນເບິ່ງຄືກັບກັບກັນ.`,
      path: i => `ຮູບຮ່າງຂອງເສັ້ນທີ ${i} ຍັງຫ່າງຈາກແບບ -- ລອງຕາມແບບໃຫ້ໃກ້ກວ່ານີ້.`,
      good: "ດີຫຼາຍ!",
      pass: "ດີ -- ຜ່ານແລ້ວ!"
    }
  };
  const T = L[lang] || L.en;
  const out = [];
  const countDelta = result.strokeCountDrawn - result.strokeCountExpected;
  if (countDelta < 0) out.push({ kind:"warn", text: T.missing(-countDelta) });
  if (countDelta > 0) out.push({ kind:"warn", text: T.extra(countDelta) });
  result.perStroke.forEach(s => {
    // Direction checked first: a stroke drawn in reverse also scores badly on path/position (its
    // resampled points land in reverse order), so without this priority a reversal would surface
    // as a vague position error instead of the more specific, more useful "check the direction" cue.
    if (s.direction < 0.35) out.push({ kind:"bad", text: T.direction(s.order) });
    else if (s.start < 0.4 || s.path < 0.35) out.push({ kind:"bad", text: T.order(s.order) });
    else if (s.path < 0.65) out.push({ kind:"warn", text: T.path(s.order) });
  });
  if (!out.length) out.push({ kind:"ok", text: result.passed ? T.pass : T.good });
  return out;
}
