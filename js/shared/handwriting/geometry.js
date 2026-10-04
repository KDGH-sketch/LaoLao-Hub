// Geometry for handwriting: points are [x, y] or [x, y, t] in a normalised drawing box (0..1 on both axes).
// Pure functions (no DOM), shared by the learner canvas, the admin Stroke Editor and the tests.

export const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);

export function pathLength(pts){
  let d = 0; for (let i = 1; i < pts.length; i++) d += dist(pts[i - 1], pts[i]);
  return d;
}

// Drop points closer than `min` to the previous kept point (pointer events repeat positions)
export function dedupe(pts, min = 1e-4){
  const out = [];
  for (const p of pts) if (!out.length || dist(out[out.length - 1], p) > min) out.push(p);
  return out;
}

// n points evenly spaced along the path (Wobbrock et al.). Makes paths drawn at different speeds comparable.
export function resample(pts, n = 32){
  pts = dedupe(pts);
  if (pts.length === 0) return [];
  if (pts.length === 1) return Array.from({ length: n }, () => [pts[0][0], pts[0][1]]);
  const step = pathLength(pts) / (n - 1);
  if (step === 0) return Array.from({ length: n }, () => [pts[0][0], pts[0][1]]);
  const out = [[pts[0][0], pts[0][1]]];
  let acc = 0, prev = pts[0];
  for (let i = 1; i < pts.length && out.length < n; i++){
    let cur = pts[i], d = dist(prev, cur);
    while (acc + d >= step && out.length < n){
      const k = (step - acc) / d;
      const q = [prev[0] + k * (cur[0] - prev[0]), prev[1] + k * (cur[1] - prev[1])];
      out.push(q); prev = q; d = dist(prev, cur); acc = 0;
    }
    acc += d; prev = cur;
  }
  while (out.length < n){ const l = pts[pts.length - 1]; out.push([l[0], l[1]]); }
  return out;
}

// Ramer–Douglas–Peucker simplification (keeps the shape, drops redundant points). Keeps the extra fields (time).
export function simplify(pts, eps = 0.003){
  if (pts.length < 3) return pts.slice();
  const keep = new Uint8Array(pts.length); keep[0] = keep[pts.length - 1] = 1;
  const stack = [[0, pts.length - 1]];
  while (stack.length){
    const [a, b] = stack.pop(); let best = -1, bd = eps;
    for (let i = a + 1; i < b; i++){ const d = segDist(pts[i], pts[a], pts[b]); if (d > bd){ bd = d; best = i; } }
    if (best > 0){ keep[best] = 1; stack.push([a, best], [best, b]); }
  }
  return pts.filter((_, i) => keep[i]);
}
export function segDist(p, a, b){
  const dx = b[0] - a[0], dy = b[1] - a[1], l2 = dx * dx + dy * dy;
  if (!l2) return dist(p, a);
  const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l2));
  return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy);
}

export function bbox(pts){
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const p of pts){ if (p[0] < x0) x0 = p[0]; if (p[0] > x1) x1 = p[0]; if (p[1] < y0) y0 = p[1]; if (p[1] > y1) y1 = p[1]; }
  return pts.length ? [x0, y0, x1, y1] : [0, 0, 0, 0];
}
export const unionBox = boxes => boxes.reduce((u, b) => [Math.min(u[0], b[0]), Math.min(u[1], b[1]), Math.max(u[2], b[2]), Math.max(u[3], b[3])], [Infinity, Infinity, -Infinity, -Infinity]);

export function unit(v){ const l = Math.hypot(v[0], v[1]); return l ? [v[0] / l, v[1] / l] : [0, 0]; }
export const cos = (a, b) => { const u = unit(a), v = unit(b); return u[0] * v[0] + u[1] * v[1]; };

// Dynamic Time Warping between two equal-rate paths. Returns the mean distance along the best alignment.
// Respects point order, so a stroke drawn backwards matches badly (that is how direction is detected),
// and tolerates uneven drawing speed. O(n·m); with 32-point paths this is ~1000 steps (well under 1 ms).
export function dtw(a, b){
  const n = a.length, m = b.length;
  if (!n || !m) return Infinity;
  let prevC = new Float64Array(m + 1).fill(Infinity), prevS = new Float64Array(m + 1);
  prevC[0] = 0;
  for (let i = 1; i <= n; i++){
    const curC = new Float64Array(m + 1).fill(Infinity), curS = new Float64Array(m + 1);
    for (let j = 1; j <= m; j++){
      const d = dist(a[i - 1], b[j - 1]);
      // predecessor with the lowest cost (diagonal preferred on ties)
      let c = prevC[j - 1], s = prevS[j - 1];
      if (prevC[j] < c){ c = prevC[j]; s = prevS[j]; }
      if (curC[j - 1] < c){ c = curC[j - 1]; s = curS[j - 1]; }
      curC[j] = c + d; curS[j] = s + 1;
    }
    prevC = curC; prevS = curS;
  }
  return prevC[m] / prevS[m];
}
// Largest distance from any point of `a` to the path `b` (one-sided, for "too far from the guide")
export function maxDeviation(a, b){
  let worst = 0;
  for (const p of a){ let best = Infinity; for (let j = 1; j < b.length; j++) best = Math.min(best, segDist(p, b[j - 1], b[j])); if (b.length === 1) best = dist(p, b[0]); worst = Math.max(worst, best); }
  return worst;
}

// Uniformly scale + translate a set of strokes so their joint box fits `target` (keeps the aspect ratio).
// Used for the "no guide" level, where the learner may write anywhere and at any size.
export function fitStrokes(strokes, target){
  const src = unionBox(strokes.map(bbox));
  const sw = src[2] - src[0], sh = src[3] - src[1], tw = target[2] - target[0], th = target[3] - target[1];
  const k = Math.min(sw ? tw / sw : Infinity, sh ? th / sh : Infinity);
  const s = Number.isFinite(k) ? k : 1;
  const cx = (src[0] + src[2]) / 2, cy = (src[1] + src[3]) / 2, tx = (target[0] + target[2]) / 2, ty = (target[1] + target[3]) / 2;
  return strokes.map(st => st.map(p => [tx + (p[0] - cx) * s, ty + (p[1] - cy) * s].concat(p.slice(2))));
}

// Linear credit: 1 at or below `full`, 0 at or above `zero`
export const falloff = (x, full, zero) => x <= full ? 1 : x >= zero ? 0 : 1 - (x - full) / (zero - full);
export const clamp01 = x => Math.max(0, Math.min(1, x));
