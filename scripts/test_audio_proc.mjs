// js/shared/audio-proc.js: text keys, sentence planning (stitching sentences from recorded words) and the recording
// pipeline (trim, normalise, resample, WAV). Run: node scripts/test_audio_proc.mjs
import * as A from "../js/shared/audio-proc.js";

let failed = 0;
const ok = (c, m, d) => { console.log((c ? "  PASS " : "  FAIL ") + m + (!c && d !== undefined ? "  → " + JSON.stringify(d) : "")); if (!c) failed++; };
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const set = (...k) => { const s = new Set(k.map(A.normText)); return x => s.has(x); };

console.log("text keys");
ok(A.normText(" ກິນ. ") === "ກິນ" && A.normText("ກິນ") === A.normText("ກິນ!"), "spaces and punctuation are ignored");
ok(A.normText("ຂ້ອຍ​ກິນ") === "ຂ້ອຍກິນ", "zero-width spaces are ignored");
ok(A.normText("ກໍ່") === A.normText("ກໍ່".normalize("NFD")), "Unicode forms give the same key");
ok(A.normText("ຫຼາຍໆ").endsWith("ໆ"), "the repeat mark ໆ is kept (it is spoken)");
ok(eq(A.phrasesOf("ສະບາຍດີ, ມີເຝີບໍ?"), ["ສະບາຍດີ", "ມີເຝີບໍ"]), "a sentence splits into phrases at punctuation");
ok(A.textId("ກິນ") === A.textId(" ກິນ. ") && A.textId("ກິນ") !== A.textId("ເຂົ້າ"), "stable ids per text");

console.log("\nsentence planning");
const has = set("ຂ້ອຍ", "ກິນ", "ເຂົ້າ", "ແລ້ວ", "ຫຼາຍ", "ມີ", "ເຝີ", "ບໍ", "ສະບາຍດີ");
ok(eq(A.planSentence("ຂ້ອຍກິນເຂົ້າແລ້ວ.", has), ["ຂ້ອຍ", "ກິນ", "ເຂົ້າ", "ແລ້ວ"]), "a sentence plays from its recorded words");
ok(eq(A.planSentence("ຂ້ອຍ ກິນ ເຂົ້າ", has), ["ຂ້ອຍ", "ກິນ", "ເຂົ້າ"]), "spaces between words don't matter");
ok(eq(A.planSentence("ສະບາຍດີ, ມີເຝີບໍ?", has), ["ສະບາຍດີ", null, "ມີ", "ເຝີ", "ບໍ"]), "a comma becomes a pause (null)");
ok(A.planSentence("ຂ້ອຍໄປຕະຫຼາດ", has) === null, "a sentence with an unrecorded word does not play");
ok(eq(A.planSentence("ຫຼາຍໆ", has), ["ຫຼາຍ", "ຫຼາຍ"]), "ໆ repeats the word before it");
ok(eq(A.planSentence("ຂ້ອຍກິນເຂົ້າແລ້ວ", set("ຂ້ອຍ", "ກິນ", "ເຂົ້າ", "ແລ້ວ", "ຂ້ອຍກິນເຂົ້າແລ້ວ")), ["ຂ້ອຍກິນເຂົ້າແລ້ວ"]), "a whole-sentence recording wins over stitching");
ok(eq(A.planSentence("ຂ້ອຍກິນເຂົ້າແລ້ວ", set("ຂ້ອຍ", "ກິນ", "ເຂົ້າ", "ແລ້ວ", "ກິນເຂົ້າ")), ["ຂ້ອຍ", "ກິນເຂົ້າ", "ແລ້ວ"]), "a recorded phrase is used (fewest pieces)");
ok(eq(A.planSentence("ກິນເຂົ້າ", set("ກິ", "ນເຂົ້າ", "ກິນ", "ເຂົ້າ")), ["ກິນ", "ເຂົ້າ"]) || A.planSentence("ກິນເຂົ້າ", set("ກິ", "ນເຂົ້າ", "ກິນ", "ເຂົ້າ")).length === 2, "always a full cover with the fewest pieces");
ok(A.planSentence("", has) === null && A.planSentence("...", has) === null, "empty text has no plan");
const isWord = k => ["ໄປ", "ຕະຫຼາດ", "ຂ້ອຍ"].includes(k);
ok(eq(A.missingPieces("ຂ້ອຍໄປຕະຫຼາດ", has, isWord), ["ໄປ", "ຕະຫຼາດ"]), "missingPieces names the words still to record");
ok(eq(A.missingPieces("ຂ້ອຍໄປ", () => false, isWord), ["ຂ້ອຍ", "ໄປ"]), "with nothing recorded it lists every word (the sentence's words)");
ok(eq(A.missingPieces("ຂ້ອຍຊວຍ", has, isWord), ["ຊວຍ"]), "letters no word list knows become one piece");

console.log("\nrecording pipeline");
const rate = 48000, n = rate * 2, raw = new Float32Array(n);
for (let i = 0; i < n; i++){ const t = i / rate; raw[i] = (t > 0.6 && t < 1.2 ? 0.2 * Math.sin(2 * Math.PI * 220 * t) : 0) + (Math.random() - 0.5) * 0.002; }
const trimmed = A.trimSilence(raw, rate);
const tMs = trimmed.length / rate * 1000;
ok(tMs > 600 && tMs < 820, `silence before and after the voice is cut (${Math.round(tMs)} ms left of 2000)`);
const norm = A.normalize(trimmed, rate);
ok(Math.abs(A.analyze(norm, rate).peak - 0.89) < 0.02, "loudness is evened out to -1 dBFS");
ok(Math.abs(norm[0]) < 0.01 && Math.abs(norm[norm.length - 1]) < 0.01, "a short fade at both ends (no clicks)");
const rs = A.resample(norm, rate, A.STUDIO_RATE);
ok(Math.abs(rs.length - Math.round(norm.length * A.STUDIO_RATE / rate)) <= 1, "resampled to 22.05 kHz");
const wav = A.encodeWav(rs, A.STUDIO_RATE), dv = new DataView(wav.buffer);
const str = (o, l) => String.fromCharCode(...wav.slice(o, o + l));
ok(str(0, 4) === "RIFF" && str(8, 4) === "WAVE" && str(36, 4) === "data", "a valid WAV header");
ok(dv.getUint16(22, true) === 1 && dv.getUint32(24, true) === 22050 && dv.getUint16(34, true) === 16, "mono, 22050 Hz, 16-bit");
ok(wav.length === 44 + rs.length * 2 && dv.getUint32(40, true) === rs.length * 2, "data size matches");
const take = A.processTake(raw, rate);
ok(!take.empty && !take.clipped && take.durationMs > 600 && take.durationMs < 820, `processTake: ${take.durationMs} ms, ${(take.wav.length / 1024).toFixed(0)} KB`);
ok(take.wav.length / (take.durationMs / 1000) < 46000, "about 44 KB per second of speech");
ok(A.processTake(new Float32Array(rate), rate).empty, "a silent take is reported as empty");
const loud = new Float32Array(rate).map((_, i) => Math.max(-1, Math.min(1, 1.6 * Math.sin(2 * Math.PI * 200 * i / rate))));
ok(A.processTake(loud, rate).clipped, "a distorted (clipped) take is reported");

console.log(failed ? `\n${failed} audio checks FAILED` : "\nAll audio checks passed");
process.exit(failed ? 1 : 0);
