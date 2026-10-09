// The Lao script inventory and writing order (js/shared/lao-script.js) and shape scoring (js/shared/handwriting/shape.js).
// Run: node scripts/test_lao_script.mjs
import fs from "fs";
import { CONSONANTS, CLASS_OF, VOWELS, TONE_MARKS, SIGNS, NUMERALS, section, glyphId, writingCells, writingRules, placeStroke, zoneOf, writingWords, randomWord, isLaoWord } from "../js/shared/lao-script.js";
import { inkMask, dilate, compareShape, GRID } from "../js/shared/handwriting/shape.js";

let failed = 0;
const ok = (c, m, d) => { console.log((c ? "  PASS " : "  FAIL ") + m + (!c && d !== undefined ? "  → " + JSON.stringify(d).slice(0, 300) : "")); if (!c) failed++; };

console.log("the alphabet");
const base = CONSONANTS.filter(c => !c.combo);
ok(base.length === 27 && base.map(c => c.char).join("") === "ກຂຄງຈສຊຍດຕຖທນບປຜຝພຟມຢຣລວຫອຮ", "27 consonants in the traditional order ກ ຂ ຄ ງ … ອ ຮ");
const cls = k => base.filter(c => c.cls === k).map(c => c.char).join("");
ok(cls("middle") === "ກຈດຕບປຢອ" && cls("high") === "ຂສຖຜຝຫ" && cls("low") === "ຄງຊຍທນພຟມຣລວຮ", "classes: middle 8, high 6, low 13 (the class decides the tone)", { m: cls("middle"), h: cls("high"), l: cls("low") });
ok(base.filter(c => c.final).map(c => c.char).join("") === "ກງຍດນບມວ", "8 letters can end a syllable: ກ ງ ຍ ດ ນ ບ ມ ວ");
ok(CONSONANTS.filter(c => c.combo).every(c => c.cls === "high") && CONSONANTS.some(c => c.char === "ໜ") && CONSONANTS.some(c => c.char === "ໝ"), "ຫ-combinations (ໜ ໝ ຫງ…) are high class");
ok(VOWELS.length === 27 && VOWELS.every(v => v.char.includes("ອ")), "27 vowel forms, each shown on the vowel holder ອ");
ok(VOWELS.filter(v => v.pos === "before").map(v => v.char[0]).join("") === "ເແໂໄໃ", "vowels written before the consonant: ເ ແ ໂ ໄ ໃ");
ok(VOWELS.every(v => v.length === "short" || v.length === "long"), "every vowel is short or long");
ok(TONE_MARKS.map(t => t.mark).join("") === "່້໊໋" && SIGNS.length === 2, "4 tone marks and the signs ໆ ຯ");
ok(NUMERALS.map(n => n.char).join("") === "໐໑໒໓໔໕໖໗໘໙", "numerals ໐–໙");
ok(section("consonants").length === 33 && section("tones").length === 6 && section("words").length === 0, "sections");
ok(glyphId("ກ") === "lo-e81" && glyphId("ອາ") === "lo-ead-eb2", "stable ids for progress");

console.log("\nwriting order of a word (left to right, linguistic rules)");
const cellsOf = w => writingCells(w).map(c => c.text + ":" + c.steps.map(s => s.role).join("+")).join(" | ");
ok(cellsOf("ກິນ") === "ກິ:base+above | ນ:base", "ກິນ: ກ, then ິ above it, then ນ", cellsOf("ກິນ"));
ok(cellsOf("ເຂົ້າ") === "ເ:before | ຂົ້:base+above+above | າ:after", "ເຂົ້າ: ເ first (written before ຂ though said after), then ຂ, ົ, the tone ້ on top, then າ", cellsOf("ເຂົ້າ"));
ok(cellsOf("ນ້ຳ") === "ນ້ໍ:base+above+above | າ:after", "ຳ is written as ໍ above, then າ after", cellsOf("ນ້ຳ"));
ok(cellsOf("ຫຼາຍ") === "ຫຼ:base+below | າ:after | ຍ:base", "ຫຼ: the small ລ goes below ຫ", cellsOf("ຫຼາຍ"));
ok(cellsOf("ໄປ") === "ໄ:before | ປ:base" && cellsOf("ສຸກ") === "ສຸ:base+below | ກ:base", "ໄປ and ສຸກ");
ok(writingCells("abc ກ").length === 1, "non-Lao characters are skipped");
ok(writingRules("ເຂົ້າ").join() === "ltr,before,marks,tone_top" && writingRules("ກາ").join() === "ltr", "the rules shown for a word", writingRules("ເຂົ້າ"));
ok(placeStroke(0.1, 4, 0).verdict === "ok" && placeStroke(0.3, 4, 0).verdict === "next" && placeStroke(0.8, 4, 0).verdict === "ahead" && placeStroke(0.1, 4, 2).verdict === "back",
  "a stroke further right than the next letter is refused (left to right)");
ok(zoneOf(0.1) === "above" && zoneOf(0.5) === "middle" && zoneOf(0.9) === "below", "zones in a cell: above, middle, below");

console.log("\nwords to write");
const raw = JSON.parse(fs.readFileSync(new URL("../data/dictionary.json", import.meta.url), "utf8"));
const D = {}; for (const k in raw) D[k] = { h: raw[k][3], fq: raw[k][5] };
const list = writingWords(D, { min: 2, max: 5 });
ok(list.length > 80 && list.every(x => isLaoWord(x.w) && x.n >= 2 && x.n <= 5), list.length + " dictionary words of 2–5 cells", list.length);
ok(list.every((x, i) => i === 0 || (list[i - 1].d.fq || 1e9) <= (x.d.fq || 1e9)), "most common first");
let s = 9; const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
const picks = new Set(Array.from({ length: 30 }, () => randomWord(list, { rnd }).w));
ok(picks.size > 10, "random words vary (" + picks.size + " different in 30)");
const one = randomWord(list, { avoid: list.slice(1).map(x => x.w), rnd });
ok(one.w === list[0].w && randomWord([], {}) === null, "avoids words just written; empty list → null");

console.log("\nshape scoring");
// a target "letter": a ring with a tail, drawn by the same rasteriser at the font's stroke width
const ring = (cx, cy, r, n = 40) => Array.from({ length: n + 1 }, (_, i) => [cx + r * Math.cos(i / n * Math.PI * 2), cy + r * Math.sin(i / n * Math.PI * 2)]);
const target = inkMask([ring(0.5, 0.45, 0.22), [[0.72, 0.45], [0.72, 0.85]]], { width: 0.08 });
const traced = compareShape(target, inkMask([ring(0.505, 0.455, 0.215), [[0.715, 0.46], [0.72, 0.84]]]));
ok(traced.passed && traced.score >= 85, "a careful trace scores high (" + traced.score + ")", traced);
const wobbly = compareShape(target, inkMask([ring(0.5, 0.45, 0.22).map((p, i) => [p[0] + Math.sin(i) * 0.025, p[1] + Math.cos(i * 1.7) * 0.025]), [[0.7, 0.47], [0.74, 0.83]]]));
ok(wobbly.passed, "a wobbly but correct letter still passes (" + wobbly.score + ")", wobbly);
const noTail = compareShape(target, inkMask([ring(0.5, 0.45, 0.22)]));
ok(!noTail.passed && noTail.tip === "missing", "a missing tail fails and says a part is missing (" + noTail.score + "): ບ is not ປ", noTail);
const offset = compareShape(target, inkMask([ring(0.54, 0.49, 0.22), [[0.76, 0.49], [0.76, 0.89]]]));
ok(offset.passed, "a letter drawn a little off-centre still passes (" + offset.score + ")", offset);
const scribble = compareShape(target, inkMask([Array.from({ length: 30 }, (_, i) => [0.1 + (i % 2) * 0.8, 0.1 + i * 0.027])]));
ok(!scribble.passed && scribble.score < 40, "a scribble fails (" + scribble.score + ")", scribble);
const other = compareShape(target, inkMask([[[0.25, 0.2], [0.25, 0.8], [0.75, 0.8], [0.75, 0.2]]]));
ok(!other.passed, "a different shape fails (" + other.score + ")", other);
const tiny = compareShape(target, inkMask([ring(0.5, 0.45, 0.07)]));
ok(!tiny.passed && tiny.tip === "too_small", "much too small: told so", tiny);
ok(compareShape(target, new Uint8Array(GRID * GRID)).tip === "empty", "nothing drawn: 'empty'");
const d = dilate(inkMask([[[0.5, 0.5], [0.5, 0.5]]]), 2);
ok(d.reduce((a, b) => a + b, 0) > inkMask([[[0.5, 0.5], [0.5, 0.5]]]).reduce((a, b) => a + b, 0), "dilation grows a mask");

console.log(failed ? `\n${failed} script checks FAILED` : "\nAll script checks passed");
process.exit(failed ? 1 : 0);
