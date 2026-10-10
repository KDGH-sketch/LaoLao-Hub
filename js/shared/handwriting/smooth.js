// Smooth pen for writing with a finger. Three parts:
//  · a stabilizer ("lazy brush"): the pen trails the finger on a short string, so small shakes don't move it, and an
//    easing pass rounds off what is left; when the finger lifts, the line is drawn on to where it lifted
//  · a light clean-up of the finished stroke (duplicate points removed, corners rounded by Chaikin's method)
//  · drawing through the points as curves instead of straight pieces (iPhones report fewer touch points than a mouse)
// The learner picks the smoothing (0 = off … 10 = strong) and the pen size; both are remembered on this device.
// Points are [x, y, …extra] in the pad's own 0..1 coordinates; extra values (e.g. time in ms) are carried along.
// Tested by scripts/test_smooth.mjs.

const KEY = "laolao.hw.pen";
export const PEN_SIZES = { s: 0.055, m: 0.08, l: 0.105 };      // line width as a share of the writing cell's width
export const DEFAULT_PEN = { smooth: 5, size: "m" };
const listeners = new Set();
export function getPen(){
  try { const v = JSON.parse(localStorage.getItem(KEY) || "null"); if (v && typeof v === "object") return normPen(v); } catch(e){}
  return Object.assign({}, DEFAULT_PEN);
}
// a value that is not valid falls back to `base` (the current setting, or the default)
const normPen = (v, base = DEFAULT_PEN) => { const n = Number(v.smooth);
  return { smooth: Number.isFinite(n) ? Math.max(0, Math.min(10, Math.round(n))) : base.smooth, size: PEN_SIZES[v.size] ? v.size : base.size }; };
export function setPen(patch){
  const cur = getPen(), v = normPen(Object.assign({}, cur, patch), cur);
  try { localStorage.setItem(KEY, JSON.stringify(v)); } catch(e){}
  listeners.forEach(f => { try { f(v); } catch(e){} });
  return v;
}
// a pad redraws when the pen changes; returns the function that stops listening
export function onPenChange(f){ listeners.add(f); return () => listeners.delete(f); }
export const penWidth = (cellPx, pen = getPen()) => Math.max(3, cellPx * PEN_SIZES[pen.size]);

// level 0…10 → string length (in screen pixels) and easing
export const stabilizerParams = level => { const L = Math.max(0, Math.min(10, +level || 0)); return { radius: L * 1.3, ease: L ? 1 - L * 0.065 : 1 }; };

// Stabilizer for one stroke. px = how many screen pixels one unit of x / y is ([w, h]), so the string length is the
// same on every screen. start(p) → [p] · move(p) → points to add (maybe none) · end(p) → the tail to where it lifted.
export function createStabilizer(level, px = [300, 300]){
  const { radius, ease } = stabilizerParams(level);
  const [sx, sy] = px;
  let brush = null, out = null;
  const dist = (a, b) => Math.hypot((a[0] - b[0]) * sx, (a[1] - b[1]) * sy);
  const lerp = (a, b, k) => a.map((v, i) => i < 2 ? v + (b[i] - v) * k : b[i]);   // extra values follow the newest point
  return {
    start(p){ brush = p.slice(); out = p.slice(); return [out.slice()]; },
    move(p){
      if (!brush) return this.start(p);
      if (!radius){ out = p.slice(); return [out.slice()]; }
      const d = dist(p, brush);
      if (d <= radius) return [];                                 // inside the string: the pen doesn't move
      brush = lerp(brush, p, (d - radius) / d);                   // pulled along, a string-length behind
      out = lerp(out, brush, ease);
      return [out.slice()];
    },
    end(p){
      if (!brush || !radius) return p && brush && dist(p, out) > 0.5 ? [p.slice()] : [];
      // finish the line to where the finger lifted, in a few small steps so the curve stays smooth
      const d = dist(p, out), n = Math.min(6, Math.max(1, Math.ceil(d / Math.max(2, radius))));
      const tail = []; for (let i = 1; i <= n; i++) tail.push(lerp(out, p, i / n));
      out = p.slice(); brush = p.slice();
      return tail;
    }
  };
}

// Clean-up of a finished stroke: points closer than `minGap` (0..1 units) are merged, then corners are rounded
// (one Chaikin pass from level 4, two from level 8). The first and last points never move.
export function smoothStroke(pts, level, { minGap = 0.002 } = {}){
  if (!pts || pts.length < 3) return (pts || []).map(p => p.slice());
  const out = [pts[0].slice()];
  for (let i = 1; i < pts.length - 1; i++){ const a = out[out.length - 1], b = pts[i]; if (Math.hypot(b[0] - a[0], b[1] - a[1]) >= minGap) out.push(b.slice()); }
  out.push(pts[pts.length - 1].slice());
  let r = out;
  const passes = level >= 8 ? 2 : level >= 4 ? 1 : 0;
  for (let k = 0; k < passes && r.length >= 3; k++){
    const next = [r[0]];
    for (let i = 0; i < r.length - 1; i++){
      const a = r[i], b = r[i + 1];
      next.push(a.map((v, j) => j < 2 ? 0.75 * v + 0.25 * b[j] : v), a.map((v, j) => j < 2 ? 0.25 * v + 0.75 * b[j] : b[j]));
    }
    next.push(r[r.length - 1]); r = next;
  }
  return r.map(p => p.map((v, j) => j < 2 ? Math.round(v * 10000) / 10000 : v));
}

// Draws the points as one smooth line: quadratic curves through the midpoints. map(p) → [x, y] in canvas pixels.
export function tracePath(ctx, pts, map){
  if (!pts.length) return;
  const P = pts.map(map);
  ctx.beginPath(); ctx.moveTo(P[0][0], P[0][1]);
  if (P.length === 1){ ctx.lineTo(P[0][0] + 0.1, P[0][1]); return; }
  if (P.length === 2){ ctx.lineTo(P[1][0], P[1][1]); return; }
  for (let i = 1; i < P.length - 1; i++){ const mx = (P[i][0] + P[i + 1][0]) / 2, my = (P[i][1] + P[i + 1][1]) / 2; ctx.quadraticCurveTo(P[i][0], P[i][1], mx, my); }
  ctx.lineTo(P[P.length - 1][0], P[P.length - 1][1]);
}
// how wobbly a line is: the average turn between neighbouring pieces (radians); used by the tests
export function wobble(pts){
  let s = 0, n = 0;
  for (let i = 1; i < pts.length - 1; i++){
    const a = Math.atan2(pts[i][1] - pts[i - 1][1], pts[i][0] - pts[i - 1][0]), b = Math.atan2(pts[i + 1][1] - pts[i][1], pts[i + 1][0] - pts[i][0]);
    let d = Math.abs(b - a); if (d > Math.PI) d = 2 * Math.PI - d; s += d; n++;
  }
  return n ? s / n : 0;
}
