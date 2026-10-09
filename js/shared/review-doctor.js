// Smart Review: why a word keeps going wrong, worked out from what the learner picked instead (recorded by the
// practice coach), their answer history and their answer times. Each mistake gets a cause (a tone mix-up, short / long
// vowel, look-alike letters, a different vowel, related meanings, word order, forgetting, slow recall), the exact
// letters that differ, and a review question aimed at that confusion. Pure functions (tests: scripts/test_review.mjs).
import { THEMES } from "./practice-bank.js";
import { laoChunks } from "./practice-library.js";
import { analyse } from "./lao-tone.js";

const isLao = s => /[຀-໿]/.test(String(s || ""));
const TONE_MARKS = /[່້໊໋]/g, TONE_RE = /[່້໊໋]/;   // (a /g regex keeps its position between .test() calls: TONE_RE for tests)
const stripTones = s => String(s).replace(TONE_MARKS, "");
// the same sound with another tone: tone marks gone, ໜ ໝ / ຫ + low letter written plain, and high letters that sound
// like a low one (ຂ/ຄ, ສ/ຊ, ຖ/ທ, ຜ/ພ, ຝ/ຟ, ຫ/ຮ) made the same: what is left differs only in tone
const SAME_SOUND = { "ຂ":"ຄ", "ສ":"ຊ", "ຖ":"ທ", "ຜ":"ພ", "ຝ":"ຟ", "ຫ":"ຮ" };
const toneless = s => stripTones(s).replace(/ໜ/g, "ນ").replace(/ໝ/g, "ມ").replace(/ຫ(?=[ງຍນມລວ])/g, "").replace(/ຫຼ/g, "ລ").replace(/ຼ/g, "ລ").replace(/[ຂສຖຜຝຫ]/g, c => SAME_SOUND[c]);
// short ↔ long vowel signs written differently (ັ / າ, ິ / ີ, ຶ / ື, ຸ / ູ, final ະ)
const longify = s => String(s).replace(/ັ/g, "າ").replace(/ິ/g, "ີ").replace(/ຶ/g, "ື").replace(/ຸ/g, "ູ").replace(/ະ/g, "");
// letters that look alike (a frequent reading mistake)
export const LOOKALIKE = ["ບປ","ຜຝ","ພຟ","ດຕ","ຂຄ","ຍຢ","ຊສ","ທຖ","ຮຫ","ໜໝ","ອດ","ງຈ","ລວ"];
const lookGroup = c => LOOKALIKE.find(g => g.includes(c));
const consonants = s => [...String(s)].filter(c => /[ກ-ຮໜໝ]/.test(c)).join("");
const vowelsOf = s => [...String(s)].filter(c => !/[ກ-ຮໜໝ]/.test(c) && !TONE_RE.test(c)).join("");

// the bank's words, to know a meaning's word and which words share a topic
const WORD = new Map(), BY_MEANING = new Map();
for (const th of THEMES) for (const w of th.w){ WORD.set(w[0], { th: th.id, en: w[2], zh: w[3], py: w[1] }); BY_MEANING.set(w[2].toLowerCase(), w[0]); if (w[3]) BY_MEANING.set(w[3], w[0]); }
export const themeOf = w => (WORD.get(w) || {}).th || null;
// a bank word's meanings and romanization: { en, zh, py } or null
export const bankWord = w => WORD.get(w) || null;
export const wordForMeaning = m => BY_MEANING.get(String(m || "").toLowerCase()) || BY_MEANING.get(String(m || "")) || null;

// the letters (with their marks) that differ between two Lao words: [{ text, diff }] for each
export function diffParts(a, b){
  const A = laoChunks(a), B = laoChunks(b), n = A.length, m = B.length;
  const L = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) L[i][j] = A[i] === B[j] ? L[i + 1][j + 1] + 1 : Math.max(L[i + 1][j], L[i][j + 1]);
  const ka = new Set(), kb = new Set(); let i = 0, j = 0;
  while (i < n && j < m){ if (A[i] === B[j]){ ka.add(i); kb.add(j); i++; j++; } else if (L[i + 1][j] >= L[i][j + 1]) i++; else j++; }
  return { a: A.map((t, k) => ({ text: t, diff: !ka.has(k) })), b: B.map((t, k) => ({ text: t, diff: !kb.has(k) })) };
}
// the cause of one confusion: the right word k, the word picked instead g
export function confusion(k, g){
  if (!isLao(k) || !isLao(g) || k === g) return null;
  const kk = String(k).replace(/\s/g, ""), gg = String(g).replace(/\s/g, "");
  if (kk.length > 3 && [...kk].sort().join() === [...gg].sort().join()) return { code: "order" };
  if (toneless(kk) === toneless(gg)){
    const tk = analyse(kk).map(s => s.tone), tg = analyse(gg).map(s => s.tone);
    return { code: "tone", tones: [tk.join(""), tg.join("")] };
  }
  if (longify(kk) === longify(gg)) return { code: "length" };
  const A = [...kk], B = [...gg];
  if (A.length === B.length){ const d = A.map((c, i) => [c, B[i]]).filter(([x, y]) => x !== y);
    if (d.length === 1 && lookGroup(d[0][0]) && lookGroup(d[0][0]) === lookGroup(d[0][1])) return { code: "lookalike", right: d[0][0], picked: d[0][1] }; }
  if (consonants(kk) === consonants(gg) && vowelsOf(kk) !== vowelsOf(gg)) return { code: "vowel" };
  if (themeOf(kk) && themeOf(kk) === themeOf(gg)) return { code: "related" };
  return { code: "other" };
}
// everything Smart Review knows about one remembered item { k, en, zh, py, w, r, s, hb, x:[{ g }], ms }
export function diagnose(it, { slowMs = 7000 } = {}){
  const causes = [];
  for (const c of it.x || []){
    let g = c.g, viaMeaning = false;
    if (!isLao(g) && isLao(it.k)){ const w = wordForMeaning(g); if (w){ g = w; viaMeaning = true; } else { causes.push({ code: "meaning", g: c.g }); continue; } }
    const cf = confusion(it.k, g);
    if (cf) causes.push(Object.assign({ g, viaMeaning, diff: diffParts(it.k, g) }, cf));
  }
  const hb = it.hb || "";
  if (/1+0/.test(hb) && hb.lastIndexOf("1") < hb.lastIndexOf("0")) causes.push({ code: "forgetting" });
  if (it.ms && it.ms > slowMs && (it.r || 0) > 0) causes.push({ code: "slow", ms: it.ms });
  if (!causes.length && (it.w || 0) >= 2) causes.push({ code: "hard", n: it.w });
  // most telling first, one entry per cause
  const order = ["tone","length","lookalike","vowel","order","related","meaning","other","forgetting","slow","hard"];
  const seen = new Set();
  return causes.sort((a, b) => order.indexOf(a.code) - order.indexOf(b.code)).filter(c => !seen.has(c.code + (c.g || "")) && seen.add(c.code + (c.g || "")));
}
// counts per cause over many items (the "why you miss words" overview)
export function causeSummary(items){
  const out = {};
  for (const it of items) for (const c of diagnose(it)) (out[c.code] = out[c.code] || []).push(it.k);
  return Object.entries(out).map(([code, ks]) => ({ code, n: new Set(ks).size, words: [...new Set(ks)].slice(0, 4) })).sort((a, b) => b.n - a.n);
}

// A review question aimed at the cause: hear the difference (tone, length), pick the right spelling (look-alike,
// vowel), choose the meaning against the confused word (related, meaning), or recall the meaning (forgetting, hard).
export function reviewQuestion(it, { L = "en", rand = Math.random, pool = [] } = {}){
  const d = diagnose(it), top = d[0] || { code: "hard" };
  const mean = w => { const x = WORD.get(w); return x ? (L === "zh" && x.zh ? x.zh : x.en) : ""; };
  const myMean = (L === "zh" && it.zh) ? it.zh : (it.en || it.zh || "");
  const shuffle = a => { a = a.slice(); for (let i = a.length - 1; i > 0; i--){ const j = Math.floor(rand() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  const others = n => shuffle(pool.filter(w => w !== it.k && w !== top.g && isLao(w))).slice(0, n);
  const base = { item: { k: it.k, py: it.py || "", en: it.en || "", zh: it.zh || "" }, cause: top.code, diag: d };
  if ((top.code === "tone" || top.code === "length") && top.g)
    return Object.assign({ type: "listen_select", skill: "listening", prompt: { zh: it.k }, options: [it.k, top.g], answer: 0 }, base);
  if ((top.code === "lookalike" || top.code === "vowel") && top.g)
    return Object.assign({ type: "mc", skill: "reading", ask: { en: "Which spelling is right?", lo: "ສະກົດແບບໃດຖືກ?", zh: "哪个拼写是对的？" }, prompt: { tr: { en: myMean } }, options: [it.k, top.g, ...others(1)], answer: 0, say: it.k }, base);
  if ((top.code === "related" || top.code === "other") && top.g && mean(top.g))
    return Object.assign({ type: "mc", skill: "vocabulary", ask: { en: "What does it mean?", lo: "ໝາຍຄວາມວ່າແນວໃດ?", zh: "是什么意思？" }, prompt: { zh: it.k, py: it.py || "" }, options: [myMean, mean(top.g), ...others(1).map(mean).filter(Boolean)].filter((v, i, a) => v && a.indexOf(v) === i), answer: 0, say: it.k }, base);
  if (top.code === "order"){ const toks = laoChunks(it.k); if (toks.length >= 2 && toks.length <= 8)
    return Object.assign({ type: "order", skill: "sentence", tokens: toks.map(z => ({ z, p: "" })), answer: it.k, prompt: { tr: { en: myMean } }, say: it.k }, base); }
  // recall: the meaning among other words' meanings
  const ds = others(3).map(mean).filter(v => v && v !== myMean);
  if (ds.length >= 2 && myMean) return Object.assign({ type: "mc", skill: "vocabulary", ask: { en: "What does it mean?", lo: "ໝາຍຄວາມວ່າແນວໃດ?", zh: "是什么意思？" }, prompt: { zh: it.k, py: it.py || "" }, options: [myMean, ...ds.slice(0, 3)], answer: 0, say: it.k }, base);
  return Object.assign({ type: "flashcard", skill: "vocabulary", prompt: { zh: it.k, py: it.py || "" }, back: { en: it.en || "", zh: it.zh || "" } }, base);
}
// a review's result to a spaced-repetition grade: wrong 0, right but slow 2, right and quick 3
export const gradeFor = (correct, ms, slowMs = 7000) => !correct ? 0 : ms > slowMs ? 2 : 3;
// how sure the learner is to remember an SRS card now (0–1): exp(−days since review / interval)
export function recall(card, now = Date.now()){
  if (!card || !card.ivl) return card && card.reps ? 0.8 : 0.5;
  const last = card.due - card.ivl * 864e5, days = Math.max(0, (now - last) / 864e5);
  return Math.exp(-Math.log(2) * days / Math.max(0.5, card.ivl * 1.1));
}
// cards due on each of the next n days
export function forecast(cards, n = 7, now = Date.now()){
  const day0 = new Date(now); day0.setHours(0, 0, 0, 0);
  return Array.from({ length: n }, (_, i) => { const a = day0.getTime() + i * 864e5, b = a + 864e5; return cards.filter(c => (i === 0 ? c.due < b : c.due >= a && c.due < b)).length; });
}
