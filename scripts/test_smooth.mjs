// Smooth pen (js/shared/handwriting/smooth.js): the stabilizer takes the shake out of a finger-drawn line, a stronger
// setting smooths more, the line still starts and ends where the finger did, extra values (time) are kept, "off" changes
// nothing, the clean-up keeps the ends, and the pen settings are remembered. Run: node scripts/test_smooth.mjs
import { createStabilizer, smoothStroke, wobble, stabilizerParams, getPen, setPen, onPenChange, penWidth, DEFAULT_PEN } from "../js/shared/handwriting/smooth.js";

let failed = 0;
const ok = (c, m, d) => { console.log((c ? "  PASS " : "  FAIL ") + m + (!c && d !== undefined ? "  → " + JSON.stringify(d) : "")); if (!c) failed++; };
// a shaky finger: a gentle curve with ±0.6 % random jitter, 80 samples, time in ms as a third value
let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
const shaky = Array.from({ length: 80 }, (_, i) => { const t = i / 79; return [0.15 + 0.7 * t + (rnd() - 0.5) * 0.012, 0.5 + 0.18 * Math.sin(t * Math.PI) + (rnd() - 0.5) * 0.012, i * 12]; });
function run(level, pts = shaky){
  const st = createStabilizer(level, [300, 390]), out = [...st.start(pts[0])];
  for (const p of pts.slice(1, -1)) out.push(...st.move(p));
  out.push(...st.end(pts[pts.length - 1]));
  return out;
}
const near = (a, b, e = 1e-9) => Math.abs(a - b) <= e;

console.log("stabilizer");
const raw = wobble(shaky), w0 = wobble(run(0)), w3 = wobble(run(3)), w6 = wobble(smoothStroke(run(6), 6)), w10 = wobble(smoothStroke(run(10), 10));
ok(near(w0, raw), "off (0): the line is exactly what the finger drew");
ok(w3 < raw * 0.75, `light (3): less wobble (${raw.toFixed(2)} → ${w3.toFixed(2)} rad)`);
ok(w6 < w3 && w10 < w6, `stronger settings smooth more (6: ${w6.toFixed(2)}, 10: ${w10.toFixed(2)})`);
ok(w10 < raw * 0.25, "strong (10): under a quarter of the wobble");
for (const L of [0, 3, 6, 10]){
  const o = run(L), f = o[0], l = o[o.length - 1], s = shaky[0], e = shaky[shaky.length - 1];
  ok(near(f[0], s[0]) && near(f[1], s[1]) && near(l[0], e[0], 1e-6) && near(l[1], e[1], 1e-6), `level ${L}: starts and ends exactly where the finger did`);
}
const o6 = run(6);
ok(o6.every(p => p.length === 3) && o6.every((p, i) => !i || p[2] >= o6[i - 1][2]) && o6[o6.length - 1][2] === shaky[shaky.length - 1][2], "the time of each point is kept, in order");
ok(run(6).length < shaky.length, "small shakes inside the string add no points");
// a fast, long straight line is followed closely (no lag at the end)
const line = Array.from({ length: 10 }, (_, i) => [0.1 + i * 0.08, 0.3, i * 8]);
const lo = run(10, line);
ok(Math.abs(lo[lo.length - 1][0] - 0.82) < 1e-6 && lo.every(p => Math.abs(p[1] - 0.3) < 1e-9), "a straight line stays straight and reaches its end");
// a tap (one point) still makes a dot
const st = createStabilizer(8, [300, 300]); const tap = [...st.start([0.5, 0.5, 0]), ...st.end([0.5, 0.5, 40])];
ok(tap.length >= 1 && near(tap[0][0], 0.5), "a tap still leaves a dot");
ok(stabilizerParams(0).radius === 0 && stabilizerParams(10).radius === 13 && stabilizerParams(99).radius === 13, "levels are kept between 0 and 10");

console.log("\nclean-up of a finished stroke");
const c = smoothStroke(shaky, 8);
ok(near(c[0][0], shaky[0][0], 1e-4) && near(c[c.length - 1][1], shaky[shaky.length - 1][1], 1e-4), "the ends don't move");
ok(wobble(c) < raw * 0.6, "corners are rounded");
ok(smoothStroke(shaky, 0).length <= shaky.length && smoothStroke([[0, 0], [1, 1]], 10).length === 2, "off: only duplicate points go; short strokes are left alone");
ok(c.every(p => p.length === 3), "time values are carried through");

console.log("\npen settings");
const store = {}; globalThis.localStorage = { getItem: k => store[k] ?? null, setItem: (k, v) => { store[k] = String(v); } };
ok(JSON.stringify(getPen()) === JSON.stringify(DEFAULT_PEN), "default: medium smoothing (5), medium pen");
let heard = null; const stop = onPenChange(v => heard = v);
setPen({ smooth: 9 }); setPen({ size: "l" });
ok(getPen().smooth === 9 && getPen().size === "l" && heard && heard.size === "l", "remembered on this device; open pads are told");
setPen({ smooth: 0 }); ok(getPen().smooth === 0, "smoothing can be switched off");
setPen({ smooth: 40, size: "xl" }); ok(getPen().smooth === 10 && getPen().size === "l", "out-of-range values are corrected");
stop(); setPen({ size: "s" }); ok(heard.size === "l", "a closed pad stops listening");
ok(penWidth(300, { size: "l", smooth: 5 }) > penWidth(300, { size: "s", smooth: 5 }) && penWidth(20, { size: "s" }) === 3, "pen width grows with the size, never thinner than 3 px");

console.log(failed ? `\n${failed} FAILED` : "\nALL PASS");
process.exit(failed ? 1 : 0);
