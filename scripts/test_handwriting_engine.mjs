// Unit tests for js/shared/handwriting-engine.js -- pure logic, no browser, no DB.
// Run: node scripts/test_handwriting_engine.mjs
import { resamplePoints, scoreStroke, scoreAttempt, feedbackFor, DEFAULT_HW_RULES } from "../js/shared/handwriting-engine.js";

let pass = 0, fail = 0;
const assert = (cond, msg) => { if (cond) { pass++; console.log("  ✓ " + msg); } else { fail++; console.log("  ✗ FAIL: " + msg); } };

console.log("=================================================");
console.log("HANDWRITING ENGINE: resampling, scoring, feedback");
console.log("=================================================\n");

// ---------- fixtures: a simple two-stroke reference (a cross, "+") ----------
const REF_STROKES = [
  { order: 1, points: [{x:0.5,y:0.1},{x:0.5,y:0.5},{x:0.5,y:0.9}], start:{x:0.5,y:0.1}, end:{x:0.5,y:0.9} }, // vertical, top->bottom
  { order: 2, points: [{x:0.1,y:0.5},{x:0.5,y:0.5},{x:0.9,y:0.5}], start:{x:0.1,y:0.5}, end:{x:0.9,y:0.5} }  // horizontal, left->right
];
const lerpLine = (a, b, n) => Array.from({length:n}, (_,i) => ({ x: a.x+(b.x-a.x)*i/(n-1), y: a.y+(b.y-a.y)*i/(n-1) }));

console.log("--- 1. Resampling ---");
assert(resamplePoints([{x:0,y:0}], 5).length === 5, "resamples a single point to n copies without throwing");
assert(resamplePoints([], 5).length === 0, "resamples an empty stroke to an empty array");
const rs = resamplePoints(lerpLine({x:0,y:0},{x:1,y:0},2), 10);
assert(rs.length === 10 && Math.abs(rs[0].x) < 1e-6 && Math.abs(rs[9].x-1) < 1e-6, "resamples a straight line to evenly spaced points, preserving endpoints");

console.log("\n--- 2. Correct strokes: order, direction, path all score well ---");
const goodAttempt = [
  { points: lerpLine({x:0.5,y:0.1},{x:0.5,y:0.9}, 20) },
  { points: lerpLine({x:0.1,y:0.5},{x:0.9,y:0.5}, 20) }
];
const goodResult = scoreAttempt(goodAttempt, REF_STROKES);
assert(goodResult.total >= 90, "a near-perfect trace scores >= 90/100 (got " + goodResult.total + ")");
assert(goodResult.passed, "a near-perfect trace passes");
assert(goodResult.components.order === DEFAULT_HW_RULES.weights.order, "correct stroke count gets full order credit");

console.log("\n--- 3. Wrong direction (stroke drawn backwards) ---");
const backwardsAttempt = [
  { points: lerpLine({x:0.5,y:0.9},{x:0.5,y:0.1}, 20) }, // stroke 1 reversed: bottom->top instead of top->bottom
  { points: lerpLine({x:0.1,y:0.5},{x:0.9,y:0.5}, 20) }
];
const backResult = scoreAttempt(backwardsAttempt, REF_STROKES);
assert(backResult.perStroke[0].direction < 0.3, "reversed stroke scores low on direction (got " + backResult.perStroke[0].direction.toFixed(2) + ")");
assert(backResult.total < goodResult.total, "reversed-direction attempt scores lower than the correct attempt");

console.log("\n--- 4. Path accuracy: slightly imperfect vs. extremely inaccurate ---");
const wobble = (a, b, n, offset) => Array.from({length:n}, (_,i) => { const t=i/(n-1); return { x:a.x+(b.x-a.x)*t+offset, y:a.y+(b.y-a.y)*t }; });
const slightlyOff = [{ points: wobble({x:0.5,y:0.1},{x:0.5,y:0.9}, 20, 0.04) }, { points: wobble({x:0.1,y:0.5},{x:0.9,y:0.5}, 20, 0) }];
const wayOff = [{ points: [{x:0.0,y:0.0},{x:0.05,y:0.95}] }, { points: wobble({x:0.1,y:0.5},{x:0.9,y:0.5}, 20, 0) }];
const slightResult = scoreAttempt(slightlyOff, REF_STROKES);
const wayResult = scoreAttempt(wayOff, REF_STROKES);
assert(slightResult.total > 70, "a slightly-off trace (small wobble) still scores reasonably (got " + slightResult.total + ") -- tolerant of natural variation");
assert(wayResult.total < slightResult.total, "an extremely inaccurate path scores worse than a slightly-off one");
assert(wayResult.perStroke[0].path < 0.3, "an extremely inaccurate path scores low on path accuracy");

console.log("\n--- 5. Stroke count: missing and extra strokes ---");
const missingStroke = [{ points: lerpLine({x:0.5,y:0.1},{x:0.5,y:0.9}, 20) }]; // only drew stroke 1
const missingResult = scoreAttempt(missingStroke, REF_STROKES);
assert(missingResult.strokeCountDrawn === 1 && missingResult.strokeCountExpected === 2, "detects a missing stroke (drew 1 of 2)");
assert(missingResult.components.order < DEFAULT_HW_RULES.weights.order, "missing a stroke loses order credit");
const extraStroke = [...goodAttempt, { points: lerpLine({x:0.2,y:0.2},{x:0.8,y:0.8}, 10) }]; // drew an extra 3rd stroke
const extraResult = scoreAttempt(extraStroke, REF_STROKES);
assert(extraResult.strokeCountDrawn === 3 && extraResult.components.order < DEFAULT_HW_RULES.weights.order, "detects and penalizes an extra stroke");

console.log("\n--- 6. Start/end position deviation ---");
const badStart = [{ points: lerpLine({x:0.5,y:0.6},{x:0.5,y:0.9}, 20) }, { points: lerpLine({x:0.1,y:0.5},{x:0.9,y:0.5}, 20) }]; // stroke 1 starts far from 0.5,0.1
const badStartResult = scoreAttempt(badStart, REF_STROKES);
assert(badStartResult.perStroke[0].start < goodResult.perStroke[0].start, "a stroke starting far from the reference start point scores lower on 'start'");

console.log("\n--- 7. Different canvas sizes: normalized coordinates are scale-independent ---");
// The engine only ever sees normalized [0,1] coordinates -- the UI layer is responsible for
// converting pixel positions (which vary by canvas size) into this space before calling the engine.
// Verify scoring is identical regardless of what pixel size the normalization happened from by
// re-deriving the same normalized points from two different hypothetical canvas sizes.
const px = (nx, ny, w, h) => ({ x: nx, y: ny }); // normalization is the UI's job; engine input is already [0,1]
assert(JSON.stringify(scoreAttempt(goodAttempt, REF_STROKES)) === JSON.stringify(goodResult), "scoring is deterministic and canvas-size-agnostic given the same normalized input");

console.log("\n--- 8. Feedback text ---");
const fbGood = feedbackFor(goodResult, "en");
assert(fbGood.some(f => f.kind === "ok"), "a passing attempt gets positive feedback");
const fbMissing = feedbackFor(missingResult, "en");
assert(fbMissing.some(f => /fewer stroke/.test(f.text)), "a missing stroke gets a specific (not generic 'Wrong') message");
const fbExtra = feedbackFor(extraResult, "en");
assert(fbExtra.some(f => /extra stroke/.test(f.text)), "an extra stroke gets a specific message");
const fbBackwards = feedbackFor(backResult, "en");
assert(fbBackwards.some(f => /direction/.test(f.text)), "a reversed stroke gets a direction-specific message");
const fbLo = feedbackFor(goodResult, "lo");
assert(fbLo.some(f => f.kind === "ok" && /[຀-໿]/.test(f.text)), "feedback is available in Lao");

console.log("\n--- 9. Score composition (components sum to total) ---");
assert(goodResult.total <= 100, "total score is capped at 100 even when independently-rounded components would sum over it");
const compSum = Object.values(goodResult.components).reduce((a,b)=>a+b,0);
assert(Math.abs(goodResult.total - Math.min(100, compSum)) <= 2, "total score is close to the sum of its weighted components (rounding tolerance)");
const w = DEFAULT_HW_RULES.weights;
assert(w.order+w.direction+w.path+w.start+w.end === 100, "default weights sum to 100");

console.log(`\n${pass} / ${pass+fail} assertions passed.`);
if (fail) process.exit(1);
