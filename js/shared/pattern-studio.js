// Pattern Studio logic (no DOM): a pattern is learned in the same five steps as a grammar point (js/shared/grammar.js:
// learn → see → build → fix → master), saved per pattern in progress.pstudio[n]. Patterns marked "learned" before the
// studio existed (progress.patterns[n] = time) count as mastered. Used by js/learner/views-patterns.js;
// tested by scripts/test_pattern_studio.mjs.
import { stepsDone, mastery, grammarStatus } from "./grammar.js";
import { stripTone } from "./ui.js";

export { stepsDone, mastery };
export const STATUSES = ["new", "learning", "review", "mastered"];

// the progress record for one pattern: its studio record, or a full one for a pattern learned the old way
export function patternProg(rec, legacyAt){
  if (rec && Object.keys(rec).some(k => k !== "at")) return rec;
  if (legacyAt) return { learn: 1, see: 1, build: 2, fix: 2, best: 100, masteredAt: +legacyAt || Date.now(), legacy: true };
  return {};
}
export const patternStatus = (prog, now = Date.now()) => grammarStatus(prog, now);

// counts per status for a list of patterns; progOf(p) → progress record
export function summary(list, progOf, now = Date.now()){
  const out = { total: list.length, new: 0, learning: 0, review: 0, mastered: 0 };
  for (const p of list) out[patternStatus(progOf(p), now)]++;
  return out;
}
const byOrder = (a, b) => ((a.level || 1) - (b.level || 1)) || (a.n - b.n);
// what to study next: a pattern being learned, then a review that is due, then the first new one (lowest stage first)
export function nextPattern(list, progOf, now = Date.now()){
  const sorted = list.slice().sort(byOrder);
  for (const st of ["learning", "review", "new"]){ const p = sorted.find(x => patternStatus(progOf(x), now) === st); if (p) return p; }
  return null;
}
// one pattern per day, the same for the whole day: picked from those not yet mastered (any, once all are mastered)
export function patternOfDay(list, dayKey, progOf = () => ({}), now = Date.now()){
  if (!list.length) return null;
  const open = list.filter(p => patternStatus(progOf(p), now) !== "mastered");
  const pool = (open.length ? open : list).slice().sort(byOrder);
  let x = 2166136261; for (const c of String(dayKey)) x = Math.imul(x ^ c.codePointAt(0), 16777619);
  return pool[(x >>> 0) % pool.length];
}
// search: the number (301 or #301), the Lao, the meaning (any language given), the romanization with or without tone marks
export function matchPattern(p, q, meanings = []){
  const s = String(q || "").trim();
  if (!s) return true;
  const f = s.toLowerCase().replace(/^#/, "");
  if (/^\d+$/.test(f)) return String(p.n) === String(+f) || String(p.n).startsWith(f);
  if ((p.hz || "").includes(s)) return true;
  if (meanings.some(m => m && String(m).toLowerCase().includes(f))) return true;
  const qp = plainRom(s);
  return qp.length > 1 && /[a-z]/.test(qp) && plainRom(p.py || "").includes(qp);
}
// romanization as typed on any keyboard: no tone marks, ɛ→e ɔ→o ɯ→u ə→e, no glottal stop, long vowels as one letter
// ("mɛ̄ɛn" → "men", "khɔ̀ɔp-jāi" → "khopjai")
export const plainRom = s => stripTone(s).replace(/[ɛə]/g, "e").replace(/ɔ/g, "o").replace(/ɯ/g, "u").replace(/[ʔ'’]/g, "").replace(/([a-z])\1+/g, "$1");
// the filters of the pattern map: stage (0 = all), status ("" = all), section ("" = all), search
export function filterPatterns(list, { stage = 0, status = "", sec = "", q = "", meaningOf = () => [] } = {}, progOf = () => ({}), now = Date.now()){
  return list.filter(p => (!stage || p.level === stage) && (!sec || p.sec === sec) && (!status || patternStatus(progOf(p), now) === status) && matchPattern(p, q, meaningOf(p))).sort(byOrder);
}
// a sentence is usable for Build and Fix when it has between 2 and 10 words
export const usableSentence = toks => { const n = (toks || []).filter(t => t.role !== "punct").length; return n >= 2 && n <= 10; };
