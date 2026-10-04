// Handwriting template format (stored in characters/{id}.handwriting). See docs/HANDWRITING.md.
//
//   { v:1, box:{ aspect:1 },
//     strokes:[{ id, points:[[x,y,ms]…], start, end, dir, len, bbox, note?, tol? }],   ← the authority for checking
//     rules:{ weights, tolerance, passScore, demo, feedback, strict, guide, retryPenalty },
//     animation:{ kind:"generated"|"gif", url?, durationMs?, bytes? } }                ← only a demonstration
//
// Coordinates are normalised to the drawing box (0..1), so the same data works at any canvas size.
// start / end / dir / len / bbox are always derived from the points (never trusted from input).
import { dedupe, simplify, resample, pathLength, bbox, unit } from "./geometry.js";

export const FORMAT_VERSION = 1;
export const MAX_POINTS = 64;

// Defaults; Admin → Settings → Scoring rules (settings/scoring.handwriting) and each character's rules override them.
export const DEFAULT_HW_RULES = {
  weights: { order: 30, direction: 20, path: 25, start: 10, end: 10, count: 5 },
  // distances are fractions of the drawing box: full credit up to the first number, none (and an error) from the second.
  // Calibrated on the test set (scripts/test_handwriting_engine.mjs): sloppy-but-correct drawings stay below ~0.15–0.18,
  // a different letter usually starts or ends 0.19+ away. Teachers fine-tune per character in Preview/Test.
  tolerance: { start: [0.06, 0.18], end: [0.06, 0.18], path: [0.05, 0.16], maxDev: 0.2,
               minLength: 0.5, maxLength: 2.2, reverseRatio: 0.7, orderMargin: 0.12, matchMin: 0.45 },
  passScore: 70,
  retryPenalty: 0,          // points off per retry of the whole character
  demo: { plays: 1, speed: 1 },  // plays: how often "Show stroke order" may be used before drawing (0 = unlimited)
  feedback: "perStroke",    // "perStroke" (check after every stroke) | "final" (check when finished)
  strict: true,             // perStroke: a wrong stroke must be redrawn before continuing
  guide: 1                  // 1 full faint letter · 2 current stroke · 3 start dot only · 4 no guide
};
export const GUIDE_LEVELS = [1, 2, 3, 4];

const isObj = v => v && typeof v === "object" && !Array.isArray(v);
const num = (v, d) => Number.isFinite(+v) && v !== null && v !== "" ? +v : d;
const r4 = x => Math.round(x * 10000) / 10000;
const clampBox = v => Math.max(0, Math.min(1, v));

// Merge rule layers (defaults ← platform ← character), ignoring invalid values
export function mergeHwRules(...layers){
  const out = JSON.parse(JSON.stringify(DEFAULT_HW_RULES));
  for (const L of layers){
    if (!isObj(L)) continue;
    if (isObj(L.weights)) for (const k in out.weights) out.weights[k] = Math.max(0, num(L.weights[k], out.weights[k]));
    if (isObj(L.tolerance)) for (const k in out.tolerance){
      const d = out.tolerance[k], v = L.tolerance[k];
      if (Array.isArray(d)){ if (Array.isArray(v) && v.length === 2 && v.every(x => Number.isFinite(+x)) && +v[0] >= 0 && +v[1] > +v[0]) out.tolerance[k] = [+v[0], +v[1]]; }
      else if (Number.isFinite(+v) && +v > 0) out.tolerance[k] = +v;
    }
    if (L.passScore != null) out.passScore = Math.max(0, Math.min(100, num(L.passScore, out.passScore)));
    if (L.retryPenalty != null) out.retryPenalty = Math.max(0, num(L.retryPenalty, out.retryPenalty));
    if (isObj(L.demo)){ out.demo.plays = Math.max(0, Math.floor(num(L.demo.plays, out.demo.plays))); out.demo.speed = Math.max(0.25, Math.min(4, num(L.demo.speed, out.demo.speed))); }
    if (["perStroke", "final"].includes(L.feedback)) out.feedback = L.feedback;
    if (typeof L.strict === "boolean") out.strict = L.strict;
    if (GUIDE_LEVELS.includes(+L.guide)) out.guide = +L.guide;
  }
  if (out.guide === 4) out.feedback = "final";   // without a guide the drawing is aligned as a whole, so it is checked at the end
  return out;
}

// Raw pointer points ([[x,y,t?]…] already normalised) → a stored stroke
export function makeStroke(raw, extra = {}){
  let pts = dedupe((raw || []).filter(p => Array.isArray(p) && Number.isFinite(+p[0]) && Number.isFinite(+p[1]))
    .map(p => [clampBox(+p[0]), clampBox(+p[1]), Math.max(0, Math.round(num(p[2], 0)))]));
  if (pts.length < 2) return null;
  pts = simplify(pts, 0.002);
  if (pts.length > MAX_POINTS){ const T = pts[pts.length - 1][2]; pts = resample(pts, MAX_POINTS).map((p, i, a) => [p[0], p[1], Math.round(T * i / (a.length - 1))]); }
  pts = pts.map(p => [r4(p[0]), r4(p[1]), p[2] || 0]);
  return derive(Object.assign({ id: extra.id || "s" + Math.random().toString(36).slice(2, 7), points: pts }, pickExtra(extra)));
}
const pickExtra = e => { const o = {}; if (isObj(e.note)) o.note = e.note; if (isObj(e.tol)) o.tol = e.tol; return o; };
// Recompute everything derived from the points
export function derive(s){
  const p = s.points, a = p[0], b = p[p.length - 1];
  return Object.assign({}, s, { start: [a[0], a[1]], end: [b[0], b[1]], dir: unit([b[0] - a[0], b[1] - a[1]]).map(r4),
    len: r4(pathLength(p)), bbox: bbox(p).map(r4) });
}

// Clean / upgrade a template read from the database (never throws; returns null when there are no usable strokes)
export function readTemplate(t){
  if (!isObj(t)) return null;
  const v = num(t.v, 0);
  // v0 (no version) → v1: same shape, derived fields recomputed below
  const strokes = (Array.isArray(t.strokes) ? t.strokes : []).map((s, i) => {
    if (!isObj(s) || !Array.isArray(s.points)) return null;
    const pts = s.points.filter(p => Array.isArray(p) && Number.isFinite(+p[0]) && Number.isFinite(+p[1])).map(p => [clampBox(+p[0]), clampBox(+p[1]), num(p[2], 0)]);
    if (pts.length < 2) return null;
    return derive(Object.assign({ id: s.id || "s" + (i + 1), points: pts }, pickExtra(s)));
  }).filter(Boolean);
  if (!strokes.length) return null;
  const ids = new Set(); strokes.forEach((s, i) => { if (ids.has(s.id)) s.id = s.id + "_" + i; ids.add(s.id); });
  return { v: FORMAT_VERSION, box: { aspect: num(t.box && t.box.aspect, 1) || 1 }, strokes,
    rules: isObj(t.rules) ? t.rules : {}, animation: isObj(t.animation) ? t.animation : { kind: "generated" }, sample: t.sample === true || undefined,
    upgradedFrom: v < FORMAT_VERSION ? v : undefined };
}

// Problems an admin should fix before publishing
export function validateTemplate(t){
  const errors = [], warnings = [];
  const tpl = readTemplate(t);
  if (!tpl){ errors.push("no_strokes"); return { ok: false, errors, warnings }; }
  tpl.strokes.forEach((s, i) => {
    if (s.len < 0.03) errors.push("stroke_too_short:" + (i + 1));
    if (s.points.length < 3) warnings.push("stroke_few_points:" + (i + 1));
  });
  if (tpl.animation.kind === "gif" && !tpl.animation.url) errors.push("gif_missing");
  return { ok: !errors.length, errors, warnings, template: tpl };
}

// Total duration of the generated animation (ms) at a given speed: time to draw each stroke + a pause between strokes
export function demoDuration(tpl, speed = 1){
  const t = readTemplate(tpl); if (!t) return 0;
  return Math.round(t.strokes.reduce((a, s) => a + strokeDrawMs(s) + 350, 0) / speed);
}
// Drawing time for one stroke: recorded time if present (clamped), else from its length
export function strokeDrawMs(s){
  const rec = s.points[s.points.length - 1][2] || 0;
  const byLen = 400 + s.len * 900;
  return Math.max(300, Math.min(4000, rec > 50 ? rec : byLen));
}
