// Handwriting scoring: session summary (recognizer.js) + rules → total out of 100 and its components.
// Kept apart from quiz scoring (js/shared/scoring.js); both feed the same XP rules. Pure and unit-tested.
import { mergeHwRules } from "./model.js";

export const COMPONENTS = ["order", "direction", "path", "start", "end", "count"];

// weights scaled so they add up to 100 (admins may enter any proportions)
export function normWeights(w){
  const sum = COMPONENTS.reduce((a, k) => a + Math.max(0, +w[k] || 0), 0) || 1;
  return Object.fromEntries(COMPONENTS.map(k => [k, 100 * Math.max(0, +w[k] || 0) / sum]));
}

export function scoreAttempt(summary, rules, { retries = 0 } = {}){
  const R = rules && rules.weights ? rules : mergeHwRules(rules);
  const W = normWeights(R.weights), n = summary.count || 1;
  const avg = k => summary.strokes.reduce((a, s) => a + (s[k] || 0), 0) / n;     // missing strokes count as 0
  const ratios = { order: avg("order"), direction: avg("direction"), path: avg("path"), start: avg("start"), end: avg("end"),
    count: Math.max(0, 1 - (summary.extra + summary.missing) / n) };
  const components = Object.fromEntries(COMPONENTS.map(k => [k, round1(W[k] * ratios[k])]));
  const raw = COMPONENTS.reduce((a, k) => a + W[k] * ratios[k], 0);
  const total = Math.max(0, Math.round(raw - retries * R.retryPenalty));
  const errors = {};
  summary.strokes.forEach(s => { if (s.error) errors[s.error] = (errors[s.error] || 0) + 1; });
  if (summary.extra) errors.extra = summary.extra;
  // passing needs the score AND a finished drawing without remaining errors (a reversed stroke cannot be "good enough")
  return { total, passed: total >= R.passScore && summary.complete && !summary.finalErrors, passScore: R.passScore, components, ratios: Object.fromEntries(Object.entries(ratios).map(([k, v]) => [k, round3(v)])),
    weights: Object.fromEntries(Object.entries(W).map(([k, v]) => [k, round1(v)])), errors, strokes: summary.strokes, retries };
}
const round1 = x => Math.round(x * 10) / 10, round3 = x => Math.round(x * 1000) / 1000;

// Feedback for one stroke result from session.addStroke(): an i18n key and its parameters (numbers are 1-based)
export function strokeFeedback(r){
  if (!r) return null;
  if (r.pending) return { kind: "info", key: "hw_fb_next", vars: { n: r.index + 2 } };
  const n = r.index != null ? r.index + 1 : null;
  switch (r.error){
    case null: case undefined: return { kind: "ok", key: r.done ? "hw_fb_done" : "hw_fb_ok", vars: { n } };
    case "wrong_order": return { kind: "error", key: "hw_fb_order", vars: { n, m: r.looksLike + 1 } };
    case "direction": return { kind: "error", key: "hw_fb_direction", vars: { n } };
    case "path": return { kind: "error", key: "hw_fb_path", vars: { n } };
    case "incomplete": return { kind: "error", key: "hw_fb_incomplete", vars: { n } };
    case "start": return { kind: "error", key: "hw_fb_start", vars: { n } };
    case "end": return { kind: "error", key: "hw_fb_end", vars: { n } };
    case "extra": return { kind: "info", key: "hw_fb_extra", vars: {} };
    default: return { kind: "error", key: "hw_fb_path", vars: { n } };
  }
}
// One short tip from the most frequent error in a scored attempt
export function attemptTip(score){
  const top = Object.entries(score.errors).sort((a, b) => b[1] - a[1])[0];
  return top ? "hw_tip_" + top[0] : (score.total >= 90 ? "hw_tip_great" : "hw_tip_good");
}
