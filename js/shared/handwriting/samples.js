// Sample stroke templates of real Lao characters, used by the engine tests and as demo-mode content.
// IMPORTANT: these paths are hand-made APPROXIMATIONS of how each letter is written (Lao letters usually start at the
// small head loop). They validate the engine's logic and let the demo be tried; they are NOT official stroke order.
// Official templates are drawn by a teacher in Admin → Handwriting. Coordinates: drawing box 0..1, y grows downwards.
// They are never written to a live database (only js/shared/setup.js in demo mode uses them).
import { makeStroke } from "./model.js";

// Catmull-Rom spline through control points → a smooth, densely sampled path (like a real pointer trace)
export function spline(ctrl, per = 10){
  const out = [];
  for (let i = 0; i < ctrl.length - 1; i++){
    const p0 = ctrl[Math.max(0, i - 1)], p1 = ctrl[i], p2 = ctrl[i + 1], p3 = ctrl[Math.min(ctrl.length - 1, i + 2)];
    for (let k = 0; k < per; k++){
      const t = k / per, t2 = t * t, t3 = t2 * t;
      out.push([0, 1].map(d => 0.5 * ((2 * p1[d]) + (-p0[d] + p2[d]) * t + (2 * p0[d] - 5 * p1[d] + 4 * p2[d] - p3[d]) * t2 + (-p0[d] + 3 * p1[d] - 3 * p2[d] + p3[d]) * t3)));
    }
  }
  out.push(ctrl[ctrl.length - 1].slice());
  return out.map((p, i) => [p[0], p[1], i * 12]);   // ~12 ms between samples
}
// small head loop (clockwise in screen coordinates when dir = 1), starting and ending at its lowest point
export const loop = (cx, cy, r, dir = 1) => Array.from({ length: 7 }, (_, i) => { const a = Math.PI / 2 + dir * i * Math.PI * 2 / 6; return [cx + r * Math.cos(a), cy + r * Math.sin(a)]; });
const shift = (pts, dx, dy, k = 1) => pts.map(p => [p[0] * k + dx, p[1] * k + dy]);

const KO = [[0.30, 0.80], [0.28, 0.50], [0.33, 0.30], [0.50, 0.22], [0.66, 0.30], [0.71, 0.50], [0.71, 0.80]];
export const CHARS = {
  // ກ ko kai (chicken): one arch, from the bottom-left up, over and down
  "ກ": { name: "ko kai", strokes: [KO] },
  // ຂ kho khai (egg): head loop, then over the top and round to the bottom
  "ຂ": { name: "kho khai", strokes: [[...loop(0.32, 0.36, 0.06), [0.42, 0.26], [0.60, 0.22], [0.70, 0.36], [0.68, 0.60], [0.55, 0.78], [0.36, 0.80], [0.70, 0.82]]] },
  // ງ ngo ngu (snake): head loop, then a hook down to the tail
  "ງ": { name: "ngo ngu", strokes: [[...loop(0.40, 0.34, 0.06), [0.55, 0.28], [0.67, 0.38], [0.66, 0.58], [0.55, 0.75], [0.38, 0.80]]] },
  // ບ bo bae (goat): head loop, down the left side, along the bottom, up the right side
  "ບ": { name: "bo bae", strokes: [[...loop(0.30, 0.30, 0.05), [0.30, 0.55], [0.32, 0.76], [0.45, 0.82], [0.60, 0.82], [0.70, 0.74], [0.70, 0.25]]] },
  // ປ po pa (fish): like ບ with a tall right tail
  "ປ": { name: "po pa", strokes: [[...loop(0.30, 0.34, 0.05), [0.30, 0.58], [0.32, 0.78], [0.45, 0.84], [0.60, 0.84], [0.70, 0.76], [0.70, 0.08]]] },
  // ອ o (bowl): head loop at the left middle, round the bottom and up over the top
  "ອ": { name: "o", strokes: [[...loop(0.34, 0.50, 0.05), [0.30, 0.70], [0.45, 0.82], [0.64, 0.76], [0.71, 0.55], [0.64, 0.32], [0.48, 0.24], [0.33, 0.30]]] },
  // ແ ae: two identical strokes (loop at the bottom, then up), left first. Hard case for order: the strokes look alike
  "ແ": { name: "ae", strokes: [[...loop(0.36, 0.76, 0.05, -1), [0.36, 0.55], [0.36, 0.25]], [...loop(0.62, 0.76, 0.05, -1), [0.62, 0.55], [0.62, 0.25]]] },
  // ກ່ ko + mai ek (tone mark): the letter first, then a short vertical mark above right
  "ກ່": { name: "ko + mai ek", strokes: [shift(KO, 0, 0.08), [[0.74, 0.04], [0.74, 0.16]]] },
  // ກີ່ ko + vowel ii + mai ek: three strokes (letter, vowel arc above, tone mark)
  "ກີ່": { name: "ko + ii + mai ek", strokes: [shift(KO, 0, 0.14), [[0.30, 0.26], [0.45, 0.16], [0.62, 0.17], [0.72, 0.26], [0.72, 0.16]], [[0.82, 0.02], [0.82, 0.12]]] }
};

// Templates in the stored format (as the admin Stroke Editor would save them)
export function templateFor(ch, rules = {}){
  const c = CHARS[ch];
  return { v: 1, box: { aspect: 1 }, strokes: c.strokes.map((ctrl, i) => makeStroke(spline(ctrl), { id: "s" + (i + 1) })), rules, animation: { kind: "generated" }, sample: true };
}
// The raw pointer trace of a fixture stroke (learner input before any processing)
export const traces = ch => CHARS[ch].strokes.map(ctrl => spline(ctrl));

// ---------- deterministic variations ----------
export function rng(seed){ return () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
const gauss = r => Math.sqrt(-2 * Math.log(r() || 1e-9)) * Math.cos(2 * Math.PI * r());
// natural variation of a whole drawing: smooth wobble, slight scale / shift / rotation, uneven speed
export function wobble(strokes, r, { noise = 0.012, scale = 0.08, shiftBy = 0.035, rot = 0.06 } = {}){
  const k = 1 + (r() * 2 - 1) * scale, dx = (r() * 2 - 1) * shiftBy, dy = (r() * 2 - 1) * shiftBy, a = (r() * 2 - 1) * rot;
  const c = Math.cos(a), s = Math.sin(a);
  return strokes.map(st => {
    let ox = 0, oy = 0;
    return st.map((p, i) => {
      ox = ox * 0.85 + gauss(r) * noise * 0.4; oy = oy * 0.85 + gauss(r) * noise * 0.4;     // smooth (correlated) wobble
      const x = p[0] - 0.5, y = p[1] - 0.5;
      return [0.5 + k * (c * x - s * y) + dx + ox, 0.5 + k * (s * x + c * y) + dy + oy, Math.round((p[2] || i * 12) * (0.6 + r() * 0.8))];
    });
  });
}
export const reverse = st => st.slice().reverse();
export function scribble(r, n = 30){ const pts = []; let x = 0.5, y = 0.5; for (let i = 0; i < n; i++){ x = Math.min(0.95, Math.max(0.05, x + (r() - 0.5) * 0.4)); y = Math.min(0.95, Math.max(0.05, y + (r() - 0.5) * 0.4)); pts.push([x, y, i * 15]); } return pts; }
// simulate drawing on a canvas of `size` CSS pixels: integer pixel positions, then normalised back
export const onCanvas = (strokes, size) => strokes.map(st => st.map(p => [Math.round(p[0] * size) / size, Math.round(p[1] * size) / size, p[2]]));
