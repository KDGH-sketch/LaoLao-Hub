// The learner's pronunciation profile (progress/{uid}.pron): per unit, per sound area, per tone, recent attempts.
// Kept apart from the course (js/shared/pron-course.js) so the app's start-up does not load the whole course.
// Tests: scripts/test_pron.mjs.
export function pronInit(s){
  s = s && typeof s === "object" ? s : {};
  for (const k of ["u","f","tn"]) if (!s[k] || typeof s[k] !== "object") s[k] = {};
  if (!Array.isArray(s.h)) s.h = [];
  return s;
}
const ema = (old, v, k = 0.3) => old == null ? v : Math.round(old * (1 - k) + v * k);
// one listening answer (correct) or one spoken attempt (score 0–100) in a unit, with the tones it practised
export function pronRecord(s, { unit, focus, kind, correct = false, score = 0, tones = [], word = "", now = Date.now() }){
  const v = kind === "listen" ? (correct ? 100 : 0) : score;
  const u = s.u[unit] = s.u[unit] || { l:null, s:null, n:0, st:0, t:0 };
  if (kind === "listen") u.l = ema(u.l, v, 0.25); else u.s = ema(u.s, v, 0.35);
  u.n++; u.t = now;
  u.st = Math.max(u.st || 0, unitStars(u));
  if (focus) s.f[focus] = ema(s.f[focus], v, 0.2);
  for (const tn of tones) if (tn >= 1 && tn <= 6){ const r = s.tn[tn] = s.tn[tn] || { v:null, n:0 }; r.v = ema(r.v, v, 0.25); r.n++; }
  if (kind === "speak" && word){ s.h.unshift({ w: word.slice(0, 40), s: score, t: now }); s.h = s.h.slice(0, 40); }
  return s;
}
// stars of a unit: hearing the difference, then saying it
export function unitStars(u){
  if (!u) return 0;
  const l = u.l ?? 0, sp = u.s ?? 0;
  if (l >= 85 && sp >= 80) return 3;
  if (sp >= 60 && l >= 60) return 2;
  if (l >= 70 || sp >= 50) return 1;
  return 0;
}
// the next unit to study: the first one not yet at 2 stars (in course order)
export const nextUnit = (course, s) => course.find(u => unitStars((s.u || {})[u.id]) < 2) || course[0];
// weakest sounds / tones (for advice): [{ kind:"focus"|"tone", key, v }]
export function weakSpots(s, n = 3){
  const f = Object.entries(s.f || {}).filter(([, v]) => v != null).map(([k, v]) => ({ kind:"focus", key:k, v }));
  const t = Object.entries(s.tn || {}).filter(([, r]) => r.n >= 2).map(([k, r]) => ({ kind:"tone", key:+k, v:r.v }));
  return [...f, ...t].filter(x => x.v < 75).sort((a, b) => a.v - b.v).slice(0, n);
}
