// Lao syllables and tones from the script: splits a word into syllables and works out each syllable's tone from its
// consonant class, live / dead syllable, vowel length and tone mark, with the same rules as the Tone Lab
// (js/learner/views-labs.js). Tone numbers 1–6 match the "tones" content (Admin → Tone Lab), whose pitch contours
// (e.g. "33", "52") become the target pitch shapes of the pronunciation coach. Pure functions (tests: scripts/test_pron.mjs).
import { CLASS_OF } from "./lao-script.js";

const LEAD = "ເແໂໃໄ";
const ABOVE_BELOW = "ັິີຶືຸູົໍຽ";          // vowel signs written above / below (and ຽ)
const TONE = { "່": "ek", "້": "tho", "໊": "ti", "໋": "chat" };
// (an empty string is "included" in every string: every check goes through has())
const has = (set, c) => !!c && set.includes(c);
const isCons = c => /[ກ-ຮໜໝໞໟ]/.test(c) && !/[ະ-ຽ]/.test(c);
const isMark = c => has(ABOVE_BELOW, c) || c === "ຼ";
const SONOR_LOW = "ງຍນມລວ";
const STOPS = "ກດບ";

// Split a Lao word into syllables: [{ text, init, cls, lead, marks, tail, final, mark }]
export function syllables(word){
  const raw = [...String(word || "").normalize("NFC")];
  const ch = raw.filter(c => /[຀-໿]/.test(c) && c !== "ໆ" && c !== "ຯ");
  // ໆ repeats the syllable before it (ຫຼາຍໆ = ຫຼາຍ ຫຼາຍ): remember where it stood
  const reps = []; { let k = 0; for (const c of raw){ if (c === "ໆ") reps.push(k); else if (/[຀-໿]/.test(c) && c !== "ຯ") k++; } }
  const out = []; let i = 0;
  while (i < ch.length){
    const s = { text:"", init:"", lead:"", marks:"", tail:"", final:"", mark:"" }, start = i;
    if (has(LEAD, ch[i])) s.lead = ch[i++];
    if (i < ch.length && isCons(ch[i])){
      s.init = ch[i++];
      // ຫ before a low sonorant (ຫງ ຫຍ ຫນ ຫມ ຫລ ຫວ) is one high-class sound; ຼ (subscript l) joins the letter
      if (s.init === "ຫ" && i < ch.length && has(SONOR_LOW, ch[i]) && i + 1 < ch.length && !isCons(ch[i + 1])) s.init += ch[i++];
      if (ch[i] === "ຼ") s.init += ch[i++];
      // a medial w (ຄວາຍ, ກວ່າ): ວ right after the letter and followed by a vowel or tone mark
      if (ch[i] === "ວ" && i + 1 < ch.length && /[າັິີ່້໊໋ະ]/.test(ch[i + 1]) && !(s.marks)) s.init += ch[i++];
    }
    while (i < ch.length && (isMark(ch[i]) || TONE[ch[i]])){ if (TONE[ch[i]]) s.mark = TONE[ch[i]]; else s.marks += ch[i]; i++; }
    // vowel letters after the consonant: ະ າ ຳ, ອ (ɔɔ, or the end of ເ-ືອ), ວ (ົວ / ua), ຍ (ເ-ຍ)
    const tailOk = c => has("ະາຳ", c) || (c === "ອ" && !s.tail && (!s.marks || (s.lead === "ເ" && s.marks.includes("ື")))) || (c === "ວ" && (s.marks.includes("ົ") || (!s.marks && !s.tail && !s.lead && isCons(ch[i + 1] || "") && !/[ັິີຶືຸູົໍຽ່້າະ]/.test(ch[i + 2] || "")))) || (c === "ຍ" && s.lead === "ເ" && !s.marks && !s.tail);
    while (i < ch.length && tailOk(ch[i])){ s.tail += ch[i++]; while (i < ch.length && TONE[ch[i]]){ s.mark = TONE[ch[i++]]; } }
    // a final consonant: a consonant not followed by a vowel sign (that would make it the next syllable's first letter)
    if (i < ch.length && isCons(ch[i]) && (s.init || s.lead)){
      const nx = ch[i + 1] || "";
      const startsNext = isMark(nx) || !!TONE[nx] || has("ະາຳ", nx) || (nx === "ອ" && (!ch[i + 2] || isCons(ch[i + 2]) || !!TONE[ch[i + 2]])) || (nx === "ວ" && ch[i] !== "ວ" && /[າ]/.test(ch[i + 2] || ""));
      const vowelSoFar = s.lead || s.marks || s.tail;
      if (vowelSoFar && !startsNext) s.final = ch[i++];
      else if (!vowelSoFar && !startsNext && isCons(nx)) s.final = ch[i++];   // no written vowel: an inherent "o" (rare)
      else if (!vowelSoFar && !nx) s.final = ch[i++];
    }
    if (i === start) i++;                                      // a stray sign: skip it
    s.text = ch.slice(start, i).join("");
    s.cls = CLASS_OF[s.init.replace("ຼ", "").replace(/ວ$/, "") ] || CLASS_OF[s.init[0] + (s.init[1] || "")] || CLASS_OF[s.init[0]] || "middle";
    if (s.init.startsWith("ຫ") && s.init.length > 1) s.cls = "high";
    if (s.text) out.push(s);
    while (reps.length && reps[0] === i && out.length){ reps.shift(); out.push(Object.assign({}, out[out.length - 1], { repeat:true })); }
  }
  return out;
}
// vowel of a syllable: { long, live } (ໃ ໄ ຳ ເົາ end in a glide or m: live)
export function vowelOf(s){
  const m = s.marks, t = s.tail, l = s.lead;
  if (l === "ໃ" || l === "ໄ" || t.includes("ຳ") || (l === "ເ" && m.includes("ົ") && t.includes("າ"))) return { long:false, glide:true };
  if (t.includes("ະ") || m.includes("ັ") || m.includes("ິ") && !l || m.includes("ຶ") && !t.includes("ອ") || m.includes("ຸ") || (m.includes("ົ") && !t.includes("ວ"))) return { long:false };
  if (l === "ເ" && m.includes("ິ")) return { long:false };
  return { long:true };
}
// the tone 1–6 of one syllable (the Tone Lab's rules)
export function toneOf(s){
  const v = vowelOf(s), cls = s.cls || "middle";
  const dead = has(STOPS, s.final) || (!s.final && !v.long && !v.glide);
  if (s.mark === "ti" || s.mark === "chat") return 5;
  if (s.mark === "ek") return 2;
  if (s.mark === "tho") return cls === "low" ? 4 : 3;
  if (!dead) return cls === "high" ? 5 : 1;
  if (!v.long) return cls === "low" ? 6 : 2;
  return cls === "low" ? 4 : 2;
}
export function analyse(word){
  return syllables(word).map(s => Object.assign(s, { tone: toneOf(s), long: vowelOf(s).long || !!vowelOf(s).glide, dead: has(STOPS, s.final) || (!s.final && !vowelOf(s).long && !vowelOf(s).glide) }));
}
export const tonesOf = word => analyse(word).map(s => s.tone);

// ---------- pitch targets ----------
// Chao tone letters ("33", "52", "35"…: 1 low … 5 high) from the Tone Lab content; the first form before "/" counts
export const DEFAULT_CONTOURS = { 1:"33", 2:"11", 3:"31", 4:"55", 5:"35", 6:"52" };   // the seeded Tone Lab values
export function contourDigits(c){ const m = String(c || "").split("/")[0].replace(/[^1-5]/g, ""); return m.length >= 1 ? m.split("").map(Number) : [3, 3]; }
// a pitch curve of n points (levels 1–5) for a contour, smoothly through its digits
export function contourCurve(c, n = 24){
  let d = contourDigits(c); if (d.length === 1) d = [d[0], d[0]];
  return Array.from({ length: n }, (_, i) => { const x = i / (n - 1) * (d.length - 1), k = Math.min(d.length - 2, Math.floor(x)), f = x - k; return d[k] + (d[k + 1] - d[k]) * (f * f * (3 - 2 * f)); });
}
// the target curve of a word: its syllables' tone curves one after another (contours: { tone: "33", … })
export function wordTarget(word, contours = DEFAULT_CONTOURS, perSyl = 24){
  const syl = analyse(word);
  return { syl, curve: syl.flatMap(s => contourCurve(contours[s.tone] || DEFAULT_CONTOURS[s.tone], s.long ? perSyl : Math.round(perSyl * 0.7))) };
}
