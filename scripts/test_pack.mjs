// The Stage 1–6 curriculum pack (data/curriculum-pack.json, built by scripts/build_pack.mjs): it is up to date with
// the authoring files, a year of content (6 stages × 20 lessons), every reference resolves, every quiz is answerable,
// romanization is present, no Thai letters, access by stage, and importPack adds only what is missing (never overwrites).
// Run: node scripts/test_pack.mjs
import fs from "fs";
import path from "path";
import { execFileSync } from "child_process";
import { fileURLToPath } from "url";
import { PACK_TYPES, planPack, importPack } from "../js/shared/content-pack.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
let failed = 0;
const ok = (c, m, d) => { console.log((c ? "  PASS " : "  FAIL ") + m + (!c && d !== undefined ? "  → " + JSON.stringify(d).slice(0, 300) : "")); if (!c) failed++; };

console.log("the authoring files validate");
let out = "";
try { out = execFileSync(process.execPath, [path.join(ROOT, "scripts/build_pack.mjs"), "--check"], { encoding: "utf8" }); ok(/OK \(check only\)/.test(out), "build_pack --check passes"); }
catch(e){ ok(false, "build_pack --check passes", (e.stdout || "").split("\n").filter(l => /✗/.test(l)).slice(0, 5)); }
ok(!/warnings/.test(out), "no warnings (romanization and syllables all accounted for)", out.split("\n").filter(l => /·/.test(l)).slice(0, 5));

const pack = JSON.parse(fs.readFileSync(path.join(ROOT, "data/curriculum-pack.json"), "utf8"));
const built = (out.match(/items: (\{.*?\})/) || [])[1];
ok(built && built === JSON.stringify(pack.counts), "data/curriculum-pack.json is rebuilt from the latest authoring files (run node scripts/build_pack.mjs)", { built, pack: pack.counts });
const I = pack.items, by = t => new Map(I[t].map(x => [String(x.id), x]));
const L = by("lessons"), V = by("vocabulary"), D = by("dialogues"), Q = by("quizzes"), G = by("grammar"), P = new Set(I.patterns.map(p => p.n));
const seed = JSON.parse(fs.readFileSync(path.join(ROOT, "data/seed.json"), "utf8"));
(seed.patterns || []).forEach(p => P.add(p.n)); (seed.grammar || []).forEach(g => G.set(g.id, g));

console.log("\na year of content");
ok(PACK_TYPES.every(t => Array.isArray(I[t])), "every content type is in the pack");
const stages = [1, 2, 3, 4, 5, 6].map(n => I.lessons.filter(l => l.level === n).length);
ok(stages.every(n => n === 20), "6 stages × 20 lessons = 120 lessons", stages);
ok(I.vocabulary.length >= 1000, `${I.vocabulary.length} words (≥ 1,000)`);
ok(I.patterns.length >= 60 && I.grammar.length >= 30, `${I.patterns.length} sentence patterns, ${I.grammar.length} grammar points`);
const nq = I.quizzes.reduce((a, q) => a + q.questions.length, 0);
ok(I.dialogues.length === 120 && I.quizzes.length === 120 && nq >= 900, `120 dialogues, 120 quizzes with ${nq} questions`);
ok(I.culture.length === 24 && I.paths.length === 6, "24 culture stories, 6 learning paths");

console.log("\nevery reference resolves");
const bad = [];
for (const l of I.lessons){
  l.vocab.forEach(w => V.has(w) || bad.push(l.id + " word " + w));
  l.patterns.forEach(n => P.has(n) || bad.push(l.id + " pattern " + n));
  l.grammar.forEach(g => G.has(g) || bad.push(l.id + " grammar " + g));
  l.dialogues.forEach(d => D.has(d) || bad.push(l.id + " dialogue " + d));
  l.quizzes.forEach(q => Q.has(q) || bad.push(l.id + " quiz " + q));
}
for (const p of I.paths) p.steps.forEach(s => L.has(s.id) || bad.push(p.id + " step " + s.id));
ok(!bad.length, "lessons → words, patterns, grammar, dialogue, quiz; paths → lessons", bad.slice(0, 8));
ok(I.paths.every(p => p.steps.length === 20 && p.kind === "level"), "each stage path has its 20 lessons in order");

console.log("\nquizzes are answerable");
const qbad = [];
for (const q of I.quizzes) for (const [i, x] of q.questions.entries()){
  if (x.options){ const keys = x.options.map(o => o.en || o.zh); if (!(x.answer >= 0 && x.answer < keys.length) || new Set(keys).size !== keys.length || keys.some(k => !k)) qbad.push(q.id + "#" + i); }
  if (x.type === "order" && x.tokens.join("") !== x.answer) qbad.push(q.id + "#" + i + " order");
  if (x.type === "fill" && !/___/.test(x.prompt.zh)) qbad.push(q.id + "#" + i + " fill");
}
ok(!qbad.length, "every answer index points to an option; no blank or repeated options; order and fill questions are complete", qbad.slice(0, 8));
ok(I.quizzes.every(q => new Set(q.questions.map(x => x.type)).size >= 4), "each quiz mixes at least 4 question types");
const mcs = I.quizzes.flatMap(q => q.questions.filter(x => x.type === "mc" && x.options.length === 4));
const pos = [0, 1, 2, 3].map(i => mcs.filter(x => x.answer === i).length / mcs.length);
ok(pos.every(f => f > 0.15 && f < 0.35), "the right answer is spread over all four positions (" + pos.map(f => Math.round(f * 100) + "%").join(" ") + ")");
const same = I.quizzes.filter(q => { const sets = q.questions.filter(x => x.options).map(x => x.options.map(o => o.en || o.zh).sort().join("|")); return new Set(sets).size < sets.length; });
ok(!same.length, "no two questions in a quiz offer the same options", same.map(q => q.id).slice(0, 5));

console.log("\nLao text");
const thai = JSON.stringify(I).match(/[฀-๿]/g);
ok(!thai, "no Thai letters anywhere", thai && [...new Set(thai)].slice(0, 5));
const lines = I.dialogues.flatMap(d => d.lines);
ok(lines.every(x => x.py && x.tokens.every(t => t.p)), `all ${lines.length} dialogue lines have romanization for every word`);
ok(lines.every(x => x.speaker && x.tr.en), "every line has a speaker and an English translation");
ok(I.vocabulary.every(v => v.py && v.tr.en.meaning && v.tr.zh.meaning && /[຀-໿]/.test(v.hz)), "every word: Lao, romanization, English and Chinese");
ok(I.patterns.every(p => p.examples.length >= 2 && p.examples.every(e => e.py && e.tr.en)), "every pattern has 2+ romanized, translated examples");

console.log("\naccess by stage");
const acc = { 1: "free", 2: "free", 3: "standard", 4: "standard", 5: "premium", 6: "premium" };
ok(PACK_TYPES.filter(t => t !== "vocabulary").every(t => I[t].every(x => x.access === acc[x.level] && x.status === "published")), "stages 1–2 free, 3–4 standard (Basic), 5–6 premium; all published");

console.log("\nimporting adds only what is missing");
const store = new Map([["lessons/c1-01", { title: { en: "Edited by the team" } }], ["vocabulary/ສະບາຍດີ", { hz: "ສະບາຍດີ", note: "team" }]]);
const api = { db: {
  list: async col => [...store.keys()].filter(k => k.startsWith(col + "/")).map(k => Object.assign({ id: k.slice(col.length + 1) }, store.get(k))),
  set: async (p, d) => { store.set(p, d); } } };
const plan = await planPack(api, pack);
const total = PACK_TYPES.reduce((a, t) => a + I[t].length, 0);
ok(plan.add === total - 2 && plan.existing === 2 && plan.types.lessons.existing === 1, `check: ${plan.add} new, 2 already there`, plan.types.lessons);
const steps = [];
const res = await importPack(api, pack, "tester", { onStep: (d, n) => steps.push([d, n]) });
ok(res.added === total - 2 && !res.failed.length, `import added ${res.added}, none failed`);
ok(store.get("lessons/c1-01").title.en === "Edited by the team" && store.get("vocabulary/ສະບາຍດີ").note === "team", "items the team already has are not touched");
const c2 = store.get("lessons/c2-01");
ok(c2 && c2.source === "curriculum-pack" && c2.version === 1 && c2.createdBy === "tester" && !("id" in c2), "new items carry version, author and source (id only in the path)");
ok(steps.length > 100 && steps.at(-1)[0] === steps.at(-1)[1], "progress is reported to the end");
const again = await planPack(api, pack);
ok(again.add === 0, "a second check finds nothing new");

console.log(failed ? `\n${failed} FAILED` : "\nALL PASS");
process.exit(failed ? 1 : 0);
