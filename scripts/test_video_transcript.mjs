// Tests js/shared/video.js: transcript parsing (YouTube copy, SRT, VTT), time sync and older-data handling.
// Run: node scripts/test_video_transcript.mjs
import { parseTime, formatTime, parseTranscript, normalizeSegments, mergeTranslation, activeIndex, transcriptOf, recapOf } from "../js/shared/video.js";

let failed = 0;
const ok = (cond, name) => { console.log((cond ? "  PASS " : "  FAIL ") + name); if (!cond) failed++; };
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);

console.log("time");
ok(parseTime("0:05") === 5 && parseTime("1:15") === 75 && parseTime("1:02:03") === 3723, "m:ss and h:mm:ss");
ok(parseTime("00:00:01,500") === 1.5 && parseTime("00:01.250") === 1.25, "SRT comma and VTT dot milliseconds");
ok(parseTime("83") === 83 && parseTime(12.5) === 12.5, "plain seconds");
ok(parseTime("abc") === null && parseTime("") === null && parseTime("1:5") === null && parseTime(-1) === null, "invalid → null");
ok(formatTime(75.9) === "1:15" && formatTime(3725) === "1:02:05" && formatTime(0) === "0:00", "formatTime");

console.log("YouTube 'Show transcript' copy (timestamp on its own line)");
const yt = parseTranscript(`0:00
ສະບາຍດີ ທຸກຄົນ
0:04
4 seconds
ມື້ນີ້ພວກເຮົາຈະຮຽນ
ຄຳທັກທາຍ
1:02
1 minute, 2 seconds
ຂອບໃຈ`);
ok(yt.timed && yt.format === "youtube", "detected as timed YouTube transcript");
ok(eq(yt.segments.map(s => s.start), [0, 4, 62]), "start times 0:00 / 0:04 / 1:02");
ok(yt.segments[1].text === "ມື້ນີ້ພວກເຮົາຈະຮຽນ ຄຳທັກທາຍ", "multi-line text joined, '4 seconds' labels skipped");
ok(yt.segments[0].end === 4 && yt.segments[1].end === 62, "each line ends when the next starts");
ok(yt.segments[2].end > 62, "last line gets an end time");

console.log("YouTube copy (timestamp and text on one line), Windows line endings");
const one = parseTranscript("0:00 hello everyone\r\n0:03 today we learn Lao\r\n[0:07] - goodbye\r\n");
ok(eq(one.segments.map(s => [s.start, s.text]), [[0, "hello everyone"], [3, "today we learn Lao"], [7, "goodbye"]]), "inline timestamps, brackets and dashes");

console.log("SRT");
const srt = parseTranscript(`1
00:00:01,000 --> 00:00:03,500
ສະບາຍດີ

2
00:00:03,600 --> 00:00:06,000
<i>ຂອບໃຈ</i> &amp; ລາກ່ອນ
`);
ok(srt.format === "srt" && srt.segments.length === 2, "two cues");
ok(srt.segments[0].start === 1 && srt.segments[0].end === 3.5, "cue times");
ok(srt.segments[1].text === "ຂອບໃຈ & ລາກ່ອນ", "tags removed, entities decoded");

console.log("WebVTT with YouTube rolling captions");
const vtt = parseTranscript(`WEBVTT
Kind: captions
Language: en

00:00:00.000 --> 00:00:02.000 align:start position:0%
hello everyone

00:00:02.000 --> 00:00:04.000 align:start position:0%
hello everyone
welcome to Laos

00:00:04.000 --> 00:00:04.010
welcome to Laos
`);
ok(vtt.format === "vtt", "detected as VTT");
ok(eq(vtt.segments.map(s => s.text), ["hello everyone", "welcome to Laos"]), "repeated rolling lines removed");

console.log("plain text without timestamps");
const plain = parseTranscript("line one\nline two");
ok(!plain.timed && plain.segments.length === 2 && plain.warnings.length === 1, "kept as untimed with a warning");
ok(!parseTranscript("   ").segments.length, "empty input");

console.log("sync");
const segs = normalizeSegments([{ start: 10, text: "c" }, { start: 0, text: "a" }, { start: 4, text: "b" }]);
ok(eq(segs.map(s => s.text), ["a", "b", "c"]), "sorted by start");
ok(activeIndex(segs, -1) === -1, "before the first line → none");
// lines switch 0.05 s early to make up for the 200 ms polling of the player
ok(activeIndex(segs, 0) === 0 && activeIndex(segs, 3.9) === 0 && activeIndex(segs, 3.97) === 1, "0:00–0:03.9 → line 1 (switches 0.05 s early)");
ok(activeIndex(segs, 4) === 1 && activeIndex(segs, 9.9) === 1, "0:04–0:09 → line 2");
ok(activeIndex(segs, 10) === 2 && activeIndex(segs, 999) === 2, "after the last start → last line");
const many = normalizeSegments(Array.from({ length: 2000 }, (_, i) => ({ start: i * 1.5, text: "l" + i })));
ok(activeIndex(many, 1500.1) === 1000 && activeIndex(many, 0.2) === 0, "binary search on 2,000 lines");

console.log("translation merge");
const base = parseTranscript("0:00\nສະບາຍດີ\n0:04\nຂອບໃຈ\n0:09\nລາກ່ອນ").segments;
const n = mergeTranslation(base, parseTranscript("0:00\nHello\n0:05\nThank you\n0:30\nunrelated").segments);
ok(n === 2 && base[0].en === "Hello" && base[1].en === "Thank you" && !base[2].en, "matched by nearest start (within 2.5 s)");

console.log("older video documents");
const legacy = { transcript: [{ sp: "Noy", lo: "ສະບາຍດີ", rom: "sabaidee", en: "Hello" }], vocab: [{ lo: "ດີ", en: "good" }] };
ok(!transcriptOf(legacy).timed && transcriptOf(legacy).lines.length === 0, "untimed phrases are not shown as a synced transcript");
const rc = recapOf(legacy);
ok(rc.points.length === 1 && rc.points[0].lo === "ສະບາຍດີ" && rc.vocab.length === 1 && !rc.empty, "…they appear in the recap instead");
const modern = { transcript: [{ start: 2, text: "b" }, { start: 0, lo: "a" }], recap: { summary: { en: "Sum" }, points: [{ lo: "x", at: 3 }] } };
ok(transcriptOf(modern).timed && eq(transcriptOf(modern).lines.map(l => l.text), ["a", "b"]), "timed transcript (also reads 'lo' as text)");
ok(recapOf(modern).summary.en === "Sum" && recapOf(modern).points.length === 1, "recap summary and phrases");
ok(recapOf({}).empty, "no recap → empty");

console.log(failed ? `\n${failed} test(s) FAILED` : "\nAll tests passed");
process.exit(failed ? 1 : 0);
