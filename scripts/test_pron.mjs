// Pronunciation engine: Lao syllables and tones from the spelling (js/shared/lao-tone.js), the pitch analysis on
// synthesised voices (pitch.js), and the course, the profile and the accent check (pron-course.js).
// Run: node scripts/test_pron.mjs
import { analyse, tonesOf, contourCurve, wordTarget, DEFAULT_CONTOURS } from "../js/shared/lao-tone.js";
import { track, semitones, toneShape, levelsToSemis, assess, lengthCheck, dtw } from "../js/shared/pitch.js";
import { UNITS, AREAS, buildCourse, meaningOf, canDo, pronInit, pronRecord, unitStars, nextUnit, weakSpots, accentCheck } from "../js/shared/pron-course.js";
import { THEMES } from "../js/shared/practice-bank.js";
import { seeded } from "../js/shared/practice-library.js";

let failed = 0;
const ok = (c, m, d) => { console.log((c ? "  PASS " : "  FAIL ") + m + (!c && d !== undefined ? "  → " + JSON.stringify(d).slice(0, 400) : "")); if (!c) failed++; };

console.log("syllables and tones from the spelling");
const KNOWN = {"ກາ":[1],"ກ່າ":[2],"ກ້າ":[3],"ມ້າ":[4],"ຂາ":[5],"ນົກ":[6],"ໝາ":[5],"ມາ":[1],"ປາກ":[2],"ລູກ":[4],"ເຜັດ":[2],"ຮັກ":[6],"ໄກ່":[2],"ເຂົ້າ":[3],"ນ້ຳ":[4],"ຂ້ອຍ":[3],"ແມ່":[2],"ດີ":[1],"ສີ":[5],"ໝາກ":[2],
  "ສະບາຍດີ":[2,1,1],"ຄວາຍ":[1],"ກວ່າ":[2],"ເຮືອນ":[1],"ເມື່ອຍ":[2],"ເອື້ອຍ":[3],"ຕະຫຼາດ":[2,2],"ໂຮງຮຽນ":[1,1],"ຂອບໃຈ":[2,1],"ງົວ":[1],"ເງິນ":[1],"ເມຍ":[1],"ກິນເຂົ້າ":[1,3],"ຫຼາຍ":[5],"ໜຶ່ງ":[2],
  "ຫົວ":[5],"ເປັດ":[2],"ມີດ":[4],"ມິດ":[6],"ກັບ":[2],"ສອງ":[5],"ຮຽນ":[1],"ເດີນ":[1],"ພາສາ":[1,5],"ຄອບຄົວ":[4,1],"ມື້ນີ້":[4,4],"ໄປ":[1],"ເຈົ້າ":[3],"ຫຼາຍໆ":[5,5],"ວັນອັງຄານ":[1,1,1]};
const wrong = Object.entries(KNOWN).filter(([w, t]) => tonesOf(w).join() !== t.join()).map(([w, t]) => w + " " + tonesOf(w).join() + "≠" + t.join());
ok(!wrong.length, `tones of ${Object.keys(KNOWN).length} words follow the Tone Lab rules (class, live / dead, length, mark)`, wrong);
const words = THEMES.flatMap(t => t.w), agree = words.filter(w => analyse(w[0]).length === w[1].split("-").length);
ok(agree.length / words.length >= 0.99, `syllables of ${agree.length} / ${words.length} bank words match their romanization`, words.filter(w => !agree.includes(w)).map(w => w[0]));
ok(analyse("ສະບາຍດີ").map(s => s.text).join("·") === "ສະ·ບາຍ·ດີ" && analyse("ເຂົ້າໜຽວ").map(s => s.text).join("·") === "ເຂົ້າ·ໜຽວ", "syllable split: ສະ·ບາຍ·ດີ, ເຂົ້າ·ໜຽວ");
ok(analyse("ໝາ")[0].cls === "high" && analyse("ຫຼາຍ")[0].cls === "high" && analyse("ມາ")[0].cls === "low", "ຫ / ໜ / ໝ / ຫຼ make a high-class sound");
ok(analyse("ນົກ")[0].dead && !analyse("ນົກ")[0].long && !analyse("ມາ")[0].dead && analyse("ມີດ")[0].long, "dead / live and short / long vowels");
ok(contourCurve("52", 5)[0] === 5 && contourCurve("52", 5)[4] === 2 && contourCurve("33 / 35", 3).every(v => v === 3), "Chao contours from the Tone Lab ('52' falls 5→2; the first form before '/' is used)");
ok(wordTarget("ສະບາຍດີ").syl.length === 3 && wordTarget("ສະບາຍດີ", { ...DEFAULT_CONTOURS, 1:"55" }).curve.some(v => v === 5), "a word's target joins its syllables' curves, from the admin's contours");

console.log("\npitch: synthesised voices");
const sr = 48000;
function voice(f0a, f0b, secs = 0.5, noise = 0.01){
  const n = Math.round(sr * (secs + 0.3)), x = new Float32Array(n); let ph = 0; const s0 = Math.round(sr * 0.15), s1 = s0 + Math.round(sr * secs); let seed = 7;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  for (let i = 0; i < n; i++){ const on = i >= s0 && i < s1, t = on ? (i - s0) / (s1 - s0) : 0, f = f0a + (f0b - f0a) * t; ph += 2 * Math.PI * f / sr;
    let v = 0; if (on) for (let h = 1; h <= 6; h++) v += Math.sin(h * ph) / h; x[i] = 0.3 * v * (on ? Math.min(1, (i - s0) / 400, (s1 - i) / 400) : 0) + noise * (rnd() * 2 - 1); }
  return x;
}
const tr = track(voice(150, 210), sr), f = tr.f0.filter(Boolean);
ok(Math.abs(f[2] - 152) < 6 && Math.abs(f[f.length - 3] - 207) < 6, `pitch follows a voice rising 150 → 210 Hz (${f[2].toFixed(0)} → ${f[f.length - 3].toFixed(0)})`);
ok(Math.abs((tr.end - tr.start + 1) * tr.hop - 0.5) < 0.06, "the voiced part is 0.5 s long");
const shape = (a, b, c) => toneShape(semitones(track(voice(a, b), sr)), levelsToSemis(contourCurve(c, 24)));
ok(shape(150, 210, "35").score >= 85 && shape(220, 140, "52").score >= 85 && shape(170, 170, "33").score >= 85, "the right melody scores high (rising, falling, level)");
ok(shape(150, 210, "52").issue === "should_fall" && shape(150, 210, "52").score <= 45, "rising on a falling tone: 'should fall', a low score");
ok(shape(220, 140, "35").issue === "should_rise", "falling on a rising tone: 'should rise'");
ok(shape(170, 170, "35").issue === "rise_more" && shape(170, 170, "35").score <= 60, "flat on a rising tone: 'rise more'");
ok(shape(140, 220, "33").issue === "keep_level", "a big rise on a level tone: 'keep it level'");
ok(dtw([0,1,2,3], [0,0,1,2,3]) < 0.3, "time warping lets the timing differ a little");
const t5 = wordTarget("ຂາ");
ok(assess(voice(150, 210, 0.4), sr, t5).score >= 85, "assess: ຂາ (tone 5) said rising → a high score");
ok(assess(voice(150, 210, 0.12), sr, t5).issues.includes("too_short") && lengthCheck(1.2, 0.4).issue === "too_long", "too short / too long");
ok(assess(new Float32Array(sr), sr, t5).issues[0] === "no_voice", "silence: 'I didn't hear your voice'");
ok(assess(voice(150, 210, 0.4, 0), sr, t5, { model: { semis: [3,2,1,0,-1,-2,-3,-4], seconds: 0.4 } }).tone.issue === "should_fall", "with the teacher's recording as the model, the voice is compared with it");
const two = wordTarget("ພາສາ");                   // tones 1 + 5: level then rising
const both = Float32Array.from([...voice(170, 170, 0.3, 0.005).slice(0, Math.round(sr * 0.45)), ...voice(170, 230, 0.35, 0.005).slice(Math.round(sr * 0.15))]);
const wrongSecond = Float32Array.from([...voice(170, 170, 0.3, 0.005).slice(0, Math.round(sr * 0.45)), ...voice(230, 150, 0.35, 0.005).slice(Math.round(sr * 0.15))]);
const rw = assess(wrongSecond, sr, two);
ok(assess(both, sr, two).score > rw.score && rw.worst && rw.worst.syllable === "ສາ", "two syllables: the coach points at the syllable that went wrong (ສາ)", rw.worst);
let t0 = Date.now(); track(voice(150, 210, 3), sr); ok(Date.now() - t0 < 400, `3 s of audio analysed in ${Date.now() - t0} ms`);

console.log("\nthe course");
const C = buildCourse();
ok(C.length === 14 && AREAS.every(a => C.some(u => u.area === a.key)), "14 built-in units in 3 areas");
ok(C.every(u => u.t.en && u.t.lo && u.t.zh && u.explain.en && u.explain.zh && u.tips.en && u.tips.zh && u.items.length >= 4 && canDo(u).en), "every unit: title in 3 languages, explanation, tips for English and Chinese speakers, ≥4 items, a CEFR can-do");
ok(C.every(u => u.items.every(it => analyse(it[0]).length >= 1 && it[2])) && C.every(u => u.pairs.every(p => p.every(w => meaningOf(C, w)))), "every item has syllables and a meaning; every pair word has a meaning");
const pairBad = C.flatMap(u => u.pairs.filter(p => new Set(p).size !== p.length));
ok(!pairBad.length, "pair words are different from each other");
const custom = buildCourse([{ id:"pr-length", hide:true }, { id:"pr-six", t:{ en:"My tones", lo:"x", zh:"x" } }, { id:"pr-new", area:"tones", cefr:"A2", items:[{ lao:"ໄປ", en:"go" }], pairs:[{ words:"ໃກ້ | ໄກ" }] }]);
ok(!custom.some(u => u.id === "pr-length") && custom.find(u => u.id === "pr-six").t.en === "My tones" && custom.find(u => u.id === "pr-six").items.length === 6, "admin units: hide a built-in, change a built-in (the rest kept)");
const nu = custom.find(u => u.id === "pr-new");
ok(nu && nu.items[0][0] === "ໄປ" && nu.pairs[0].join() === "ໃກ້,ໄກ", "admin units: a new unit with items and a 'ໃກ້ | ໄກ' pair");
const withDlg = buildCourse([], { dialogues:[{ lines:[{ zh:"ສະບາຍດີ", tr:{ en:"hi" } }, { zh:"ຂອບໃຈ" }, { zh:"ລາກ່ອນ" }] }] });
ok(withDlg.find(u => u.id === "pr-dialogue").items[0][0] === "ສະບາຍດີ", "the conversation unit uses the teacher's dialogues");

console.log("\nprofile and accent check");
const s = pronInit({});
for (let i = 0; i < 6; i++) pronRecord(s, { unit:"pr-six", focus:"tones", kind:"listen", correct:true, tones:[1, 2] });
for (let i = 0; i < 4; i++) pronRecord(s, { unit:"pr-six", focus:"tones", kind:"speak", score:88, tones:[5], word:"ຂາ" });
ok(unitStars(s.u["pr-six"]) === 3 && s.tn[5].v >= 80 && s.h[0].w === "ຂາ", "listening + speaking → 3 stars; tone 5 and history recorded", s.u["pr-six"]);
for (let i = 0; i < 4; i++) pronRecord(s, { unit:"pr-length", focus:"length", kind:"listen", correct:false });
ok(weakSpots(s)[0].key === "length" && nextUnit(C, s).id === "pr-length", "weak spot: vowel length; next unit: the first one under 2 stars");
const chk = accentCheck(C, seeded("x"));
ok(chk.listen.length === 8 && chk.speak.length === 4 && chk.listen.every(x => x.pair.length >= 2), "accent check: 8 listening items over the areas, 4 words to say");

console.log(failed ? `\n${failed} pronunciation checks FAILED` : "\nAll pronunciation checks passed");
process.exit(failed ? 1 : 0);
