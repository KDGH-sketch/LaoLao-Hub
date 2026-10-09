// The Lao script, organised the way it is taught: consonants by class (the class decides the tone of a syllable),
// vowels by where they are written around the consonant, tone marks, numerals and signs. Plus the writing order
// of a word: Lao is written left to right, a vowel such as ເ is written BEFORE its consonant (even though it is
// pronounced after it), and a consonant comes before the vowel or tone mark written above or below it.
// Pure data and functions (tests: scripts/test_lao_script.mjs).

// ---------- consonants ----------
// [letter, name (romanised), key word, meaning, sound at the start, sound at the end (only 8 letters can end a syllable)]
const C = [
  ["ກ", "kɔ̀ɔ", "ໄກ່", "chicken", "k", "k"], ["ຂ", "khɔ̌ɔ", "ໄຂ່", "egg", "kh", ""], ["ຄ", "khɔ́ɔ", "ຄວາຍ", "water buffalo", "kh", ""],
  ["ງ", "ngɔ́ɔ", "ງົວ", "ox", "ng", "ng"], ["ຈ", "jɔ̀ɔ", "ຈອກ", "cup", "j", ""], ["ສ", "sɔ̌ɔ", "ເສືອ", "tiger", "s", ""],
  ["ຊ", "sɔ́ɔ", "ຊ້າງ", "elephant", "s", ""], ["ຍ", "nyɔ́ɔ", "ຍຸງ", "mosquito", "ny", "y"], ["ດ", "dɔ̀ɔ", "ເດັກ", "child", "d", "t"],
  ["ຕ", "tɔ̀ɔ", "ຕາ", "eye", "t", ""], ["ຖ", "thɔ̌ɔ", "ຖົງ", "bag", "th", ""], ["ທ", "thɔ́ɔ", "ທຸງ", "flag", "th", ""],
  ["ນ", "nɔ́ɔ", "ນົກ", "bird", "n", "n"], ["ບ", "bɔ̀ɔ", "ແບ້", "goat", "b", "p"], ["ປ", "pɔ̀ɔ", "ປາ", "fish", "p", ""],
  ["ຜ", "phɔ̌ɔ", "ເຜິ້ງ", "bee", "ph", ""], ["ຝ", "fɔ̌ɔ", "ຝົນ", "rain", "f", ""], ["ພ", "phɔ́ɔ", "ພູ", "mountain", "ph", ""],
  ["ຟ", "fɔ́ɔ", "ໄຟ", "fire", "f", ""], ["ມ", "mɔ́ɔ", "ແມວ", "cat", "m", "m"], ["ຢ", "yɔ̀ɔ", "ຢາ", "medicine", "y", ""],
  ["ຣ", "rɔ́ɔ", "ຣົຖ", "car", "r", ""], ["ລ", "lɔ́ɔ", "ລີງ", "monkey", "l", ""], ["ວ", "wɔ́ɔ", "ວີ", "hand fan", "w", "w"],
  ["ຫ", "hɔ̌ɔ", "ຫ່ານ", "goose", "h", ""], ["ອ", "ɔ̀ɔ", "ໂອ", "bowl", "ʔ / vowel holder", ""], ["ຮ", "hɔ́ɔ", "ເຮືອນ", "house", "h", ""]
];
export const CLASS_OF = {};
for (const ch of "ກຈດຕບປຢອ") CLASS_OF[ch] = "middle";
for (const ch of "ຂສຖຜຝຫ") CLASS_OF[ch] = "high";
for (const ch of "ຄງຊຍທນພຟມຣລວຮ") CLASS_OF[ch] = "low";
// ຫ written in front of a low letter makes it a high-class sound (ໜ and ໝ are written as one letter)
const HCOMBO = [["ຫງ", "ngɔ̌ɔ", "ng"], ["ຫຍ", "nyɔ̌ɔ", "ny"], ["ໜ", "nɔ̌ɔ", "n"], ["ໝ", "mɔ̌ɔ", "m"], ["ຫຼ", "lɔ̌ɔ", "l"], ["ຫວ", "wɔ̌ɔ", "w"]];
for (const [ch] of HCOMBO) CLASS_OF[ch] = "high";
export const CONSONANTS = C.map(([char, name, word, meaning, initial, final], i) => ({ char, name, word, meaning, initial, final, cls: CLASS_OF[char], order: i + 1, kind: "consonant" }))
  .concat(HCOMBO.map(([char, name, initial], i) => ({ char, name, word: "", meaning: "ຫ + " + char.replace("ຫ", "").replace("ໜ", "ນ").replace("ໝ", "ມ"), initial, final: "", cls: "high", order: 28 + i, kind: "consonant", combo: true })));
export const CLASSES = ["middle", "high", "low"];

// ---------- vowels (written on the vowel holder ອ, the way Lao is taught) ----------
// [form on ອ, where it is written, length, sound]; "around" = parts before and after/above the consonant
const V = [
  ["ອະ", "after", "short", "a"], ["ອາ", "after", "long", "aa"],
  ["ອິ", "above", "short", "i"], ["ອີ", "above", "long", "ii"], ["ອຶ", "above", "short", "ʉ"], ["ອື", "above", "long", "ʉʉ"],
  ["ອັ", "above", "short", "a (closed)"], ["ອົ", "above", "short", "o (closed)"], ["ອໍ", "above", "long", "ɔɔ"],
  ["ອຸ", "below", "short", "u"], ["ອູ", "below", "long", "uu"],
  ["ເອ", "before", "long", "ee"], ["ແອ", "before", "long", "ɛɛ"], ["ໂອ", "before", "long", "oo"], ["ໄອ", "before", "short", "ai"], ["ໃອ", "before", "short", "ai"],
  ["ເອະ", "around", "short", "e"], ["ແອະ", "around", "short", "ɛ"], ["ໂອະ", "around", "short", "o"], ["ເອາະ", "around", "short", "ɔ"],
  ["ເອິ", "around", "short", "ə"], ["ເອີ", "around", "long", "əə"], ["ເອຍ", "around", "long", "ia"], ["ເອືອ", "around", "long", "ʉa"],
  ["ອົວ", "around", "long", "ua"], ["ເອົາ", "around", "short", "ao"], ["ອຳ", "around", "short", "am"]
];
export const VOWELS = V.map(([form, pos, length, sound], i) => ({ char: form, form, pos, length, sound, order: i + 1, kind: "vowel" }));
export const VOWEL_POSITIONS = ["after", "above", "below", "before", "around"];

// ---------- tone marks (shown on ອ) and other signs ----------
export const TONE_MARKS = [
  { char: "ອ່", mark: "່", name: "ໄມ້ເອກ", rom: "mai ek", order: 1 }, { char: "ອ້", mark: "້", name: "ໄມ້ໂທ", rom: "mai tho", order: 2 },
  { char: "ອ໊", mark: "໊", name: "ໄມ້ຕີ", rom: "mai ti", order: 3 }, { char: "ອ໋", mark: "໋", name: "ໄມ້ຈັດຕະວາ", rom: "mai chattawa", order: 4 }
].map(x => Object.assign(x, { kind: "tone" }));
export const SIGNS = [
  { char: "ໆ", name: "ໄມ້ຍົກ", rom: "mai yok", meaning: "repeat the word before", order: 5, kind: "tone" },
  { char: "ຯ", name: "ເຄື່ອງໝາຍລະ", rom: "ellipsis", meaning: "and so on / shortened", order: 6, kind: "tone" }
];
export const NUMERALS = ["ສູນ", "ໜຶ່ງ", "ສອງ", "ສາມ", "ສີ່", "ຫ້າ", "ຫົກ", "ເຈັດ", "ແປດ", "ເກົ້າ"]
  .map((name, n) => ({ char: String.fromCodePoint(0x0ED0 + n), name, value: n, order: n + 1, kind: "number" }));

export const SECTIONS = ["consonants", "vowels", "tones", "numbers", "words"];
export function section(key){
  if (key === "consonants") return CONSONANTS;
  if (key === "vowels") return VOWELS;
  if (key === "tones") return TONE_MARKS.concat(SIGNS);
  if (key === "numbers") return NUMERALS;
  return [];
}
// a stable id for progress (also for letters that have no database row)
export const glyphId = ch => "lo-" + [...String(ch)].map(c => c.codePointAt(0).toString(16)).join("-");

// ---------- writing order of a word ----------
const LEAD = /[ເ-ໄ]/;                                       // ເ ແ ໂ ໃ ໄ
const CONS = /[ກ-ຮໜ-ໟ]/;
const MARK_ABOVE = /[ັິ-ືົ່-ໍ]/, MARK_BELOW = /[ຸູຼ]/;
const isMark = c => MARK_ABOVE.test(c) || MARK_BELOW.test(c);
export const isLaoWord = s => /^[຀-໿]+$/.test(String(s || ""));
// A word as writing cells, left to right. Each cell is what is written in one place: a lone vowel written before or
// after, or a consonant together with the marks written above / below it. Each cell lists its steps in writing order.
// ຳ (am) is written as ໍ above the consonant, then າ after it.
export function writingCells(word){
  const cells = [];
  for (const ch of String(word || "").normalize("NFC").replace(/ຳ/g, "ໍາ")){
    if (!/[຀-໿]/.test(ch)) continue;
    const last = cells[cells.length - 1];
    if (isMark(ch) && last && last.base){ last.text += ch; last.steps.push({ glyph: ch, role: MARK_BELOW.test(ch) ? "below" : "above" }); continue; }
    if (isMark(ch)){ cells.push({ text: "ອ" + ch, base: null, kind: "mark", steps: [{ glyph: ch, role: MARK_BELOW.test(ch) ? "below" : "above" }] }); continue; }
    if (CONS.test(ch)) cells.push({ text: ch, base: ch, kind: "consonant", steps: [{ glyph: ch, role: "base" }] });
    else cells.push({ text: ch, base: null, kind: LEAD.test(ch) ? "before" : "after", steps: [{ glyph: ch, role: LEAD.test(ch) ? "before" : "after" }] });
  }
  return cells.map((c, i) => Object.assign(c, { index: i }));
}
// one sentence per rule the learner meets in this word, in the order they come up
export function writingRules(word){
  const cells = writingCells(word), out = [];
  if (cells.some(c => c.kind === "before")) out.push("before");
  if (cells.some(c => c.steps.some(s => s.role === "above" || s.role === "below"))) out.push("marks");
  if (cells.some(c => c.steps.some(s => /[່-໋]/.test(s.glyph)) && c.steps.some(s => s.role === "above" && !/[່-໋]/.test(s.glyph)))) out.push("tone_top");
  return ["ltr", ...out];
}
// Where a stroke belongs: the cell under its centre. Writing must go left to right: a stroke in a cell further right
// than the next unfinished one is refused ("ahead"), one in a cell already finished is "back".
export function placeStroke(cx, cellCount, current){
  const i = Math.max(0, Math.min(cellCount - 1, Math.floor(cx * cellCount)));
  return { cell: i, verdict: i === current ? "ok" : i === current + 1 ? "next" : i > current ? "ahead" : "back" };
}
// Within a cell: the consonant is written before a mark above or below it. y is the stroke's centre in the cell
// (0 top … 1 bottom); the consonant sits in the middle band.
export function zoneOf(y){ return y < 0.3 ? "above" : y > 0.78 ? "below" : "middle"; }

// ---------- words to write ----------
// Words for writing practice from the dictionary: Lao only, 2–max cells, preferring common words and the stage
export function writingWords(dict, { min = 2, max = 6, stage = 0 } = {}){
  return Object.keys(dict || {}).filter(w => isLaoWord(w) && !/[ໆຯ]/.test(w))
    .map(w => ({ w, n: writingCells(w).length, d: dict[w] }))
    .filter(x => x.n >= min && x.n <= max && (!stage || (x.d.h || 1) <= stage))
    .sort((a, b) => (a.d.fq || 1e9) - (b.d.fq || 1e9));
}
export function randomWord(list, { avoid = [], rnd = Math.random } = {}){
  const pool = list.filter(x => !avoid.includes(x.w));
  const from = pool.length ? pool : list;
  if (!from.length) return null;
  // common words more often: pick from the first half twice as often
  const half = Math.max(1, Math.ceil(from.length / 2)), i = rnd() < 0.66 ? Math.floor(rnd() * half) : Math.floor(rnd() * from.length);
  return from[i];
}
