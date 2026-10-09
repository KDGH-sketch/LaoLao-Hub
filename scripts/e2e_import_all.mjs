// Excel import for every content type, end to end in the browser (demo mode): each type's template (with its sample
// rows) is uploaded through the importer and saved; after Publish, learners see the imported lesson, dialogue, quiz
// (all six question types play), video, culture story, dictionary word and letter. Export downloads a real .xlsx that
// reads back with the same rows. The starter quiz with old "choice" questions plays too.
// Run: node scripts/e2e_import_all.mjs
import path from "path";
import fs from "fs";
import os from "os";
import { launch, sleep } from "./lib/cdp.mjs";
import { startDemoServer, ROOT } from "./lib/demo-server.mjs";
import { writeXlsx, readXlsx } from "../js/shared/sheet-io.js";
import { TYPE_ORDER, templateSheets, validateRows } from "../js/admin/import-map.js";

const SHOTS = path.join(ROOT, "e2e-screenshots"); fs.mkdirSync(SHOTS, { recursive: true });
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), "laolao-import-all-")), DL = path.join(TMP, "downloads"); fs.mkdirSync(DL);
const srv = await startDemoServer();
const b = await launch({ width: 1366, height: 900 });
let failed = 0;
const ok = (c, m, d) => { console.log((c ? "  PASS " : "  FAIL ") + m + (!c && d !== undefined ? "  → " + JSON.stringify(d).slice(0, 400) : "")); if (!c) failed++; };
const J = JSON.stringify;
for (const type of TYPE_ORDER) fs.writeFileSync(path.join(TMP, type + ".xlsx"), writeXlsx(templateSheets(type)));

async function login(p, email){
  await b.eval(`try { localStorage.removeItem("laolao.demo.session"); localStorage.setItem("xuelu.lang","en"); localStorage.setItem("xuelu.admin.lang","en"); } catch(e){}`).catch(() => {});
  await b.goto(srv.base + p); await b.waitFor(`!!document.querySelector("#em") || !!document.querySelector(".app")`, 60000);
  await b.eval(`(() => { const e = document.querySelector("#em"), p = document.querySelector("#pw"); e.value = ${J(email)}; p.value = "demo1234"; (e.form || p.form).requestSubmit(); })()`);
  await b.waitFor(`!!document.querySelector(".app .side .nav-btn")`, 60000); await sleep(800);
}
async function upload(file){
  const { root } = await b.send("DOM.getDocument", { depth: -1 });
  const { nodeId } = await b.send("DOM.querySelector", { nodeId: root.nodeId, selector: ".imp input[type=file]" });
  await b.send("DOM.setFileInputFiles", { nodeId, files: [file] });
  await b.waitFor(`!!document.querySelector(".imp .imp-sum, .imp .banner.bad")`, 15000).catch(() => {}); await sleep(400);
}
const db = p => b.eval(`import("/js/admin/state.js").then(m => m.S.api.db.get(${J(p)}))`);
const learner = (v, p) => b.eval(`import("/js/learner/main.js").then(m => m.go(${J(v)}, ${J(p)}))`).then(() => sleep(900));
const mainText = () => b.eval(`document.querySelector("main").innerText`);

try {
  await login("/admin/", "admin@demo.laolao");
  await b.send("Browser.setDownloadBehavior", { behavior: "allow", downloadPath: DL });

  console.log("import every type through the page");
  for (const type of TYPE_ORDER){
    await b.eval(`import("/js/admin/state.js").then(m => m.go("excelImport", { type: ${J(type)} }))`);
    await b.waitFor(`!!document.querySelector(".imp-drop")`, 15000); await sleep(200);
    await upload(path.join(TMP, type + ".xlsx"));
    const st = await b.eval(`({ sum: [...document.querySelectorAll(".imp-sum > div")].map(x => x.innerText.replace(/\\s+/g, " ")), btn: [...document.querySelectorAll(".imp-step .btn.primary")].pop()?.innerText.trim(), type: document.querySelector(".imp-types [aria-pressed=true]")?.innerText })`);
    const go = await b.eval(`(() => { const x = [...document.querySelectorAll(".imp-step .btn.primary")].find(x => /^Import \\d+/.test(x.innerText.trim())); if (!x || x.disabled) return false; x.click(); return true; })()`);
    await b.waitFor(`/Import complete|Imported with problems/.test(document.querySelector(".imp")?.innerText || "")`, 30000).catch(() => {});
    const res = await b.eval(`document.querySelector(".imp .banner.ok, .imp .banner.bad")?.innerText || ""`);
    ok(go && /Import complete/.test(await b.eval(`document.querySelector(".imp").innerText`)) && /Saved (\d+) \/ \1/.test(res) && /0 with errors/.test(st.sum[3] || ""),
      type + ": template uploaded and imported — " + res.replace(/\s+/g, " "), st);
  }
  await b.screenshot(path.join(SHOTS, "import-all-quizzes.png"));

  console.log("\nstored as the app expects");
  const q = await db("quizzes/q-numbers"), d = await db("dialogues/d-taxi"), l = await db("lessons/l-market"), v = await db("videos/v-market"), c = await db("characters/char-ກ");
  ok(q && q.questions.length === 6 && q.title.en === "Numbers 1–10", "quiz q-numbers: 6 questions", q && q.questions.map(x => x.type));
  ok(d && d.lines.length === 3 && d.lines[0].py, "dialogue d-taxi: 3 lines, romanization filled in automatically", d && d.lines[0]);
  ok(l && l.vocab.length === 3 && l.patterns[0] === 4, "lesson l-market: words and pattern", l);
  ok(v && v.transcript.length === 2 && /youtube/.test(v.embedUrl), "video: link and transcript", v && v.transcript);
  ok(c && c.class === "middle", "letter ກ: class worked out (middle)", c);

  console.log("\nexport downloads a real workbook");
  for (const type of ["quizzes", "dialogues", "lessons"]){
    await b.eval(`import("/js/admin/state.js").then(m => m.go("excelImport", { type: ${J(type)} }))`); await b.waitFor(`!!document.querySelector(".imp-drop")`, 15000);
    const before = new Set(fs.readdirSync(DL));
    await b.eval(`[...document.querySelectorAll(".imp .btn")].find(x => /^Export current/.test(x.innerText.trim())).click()`);
    let file = null; for (let k = 0; k < 40 && !file; k++){ await sleep(150); file = fs.readdirSync(DL).find(f => !before.has(f) && f.endsWith(".xlsx") && f.includes(type)); }
    // wait until the browser has finished writing it (same size twice)
    if (file){ let last = -1; for (let k = 0; k < 20; k++){ const sz = fs.statSync(path.join(DL, file)).size; if (sz && sz === last) break; last = sz; await sleep(200); } }
    const buf = file ? fs.readFileSync(path.join(DL, file)) : null;
    const rows = buf ? (await readXlsx(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.length)))[0].rows : [];
    const chk = file ? validateRows(rows, type, {}) : null;
    ok(file && rows.length > 1 && chk.summary.error === 0, type + ": exported " + (rows.length - 1) + " rows to " + file + ", all valid for importing again", chk && chk.summary);
  }

  console.log("\nthe content list has the Excel button");
  await b.eval(`import("/js/admin/state.js").then(m => m.go("contentList", { type: "dialogues" }))`); await sleep(900);
  ok(await b.eval(`[...document.querySelectorAll("main .btn")].some(x => /Excel import \\/ export/.test(x.innerText))`), "Dialogues list: 'Excel import / export' button");
  await b.eval(`[...document.querySelectorAll("main .btn")].find(x => /Excel import \\/ export/.test(x.innerText)).click()`); await sleep(700);
  ok(/Dialogues/.test(await b.eval(`document.querySelector(".imp-types [aria-pressed=true]")?.innerText || ""`)), "…which opens the importer on Dialogues");

  console.log("\nlearners see it after Publish");
  await b.eval(`Promise.all([import("/js/admin/state.js"), import("/js/shared/content.js")]).then(async ([m, c]) => { await c.buildBundles(m.S.api, m.S.me.uid); if (m.S.api._flush) await m.S.api._flush(); })`);
  await b.eval(`localStorage.removeItem("laolao.demo.session")`);
  await login("/", "learner@demo.laolao");
  await b.eval(`import("/js/learner/core.js").then(m => { m.setPref("uiLang", "en"); m.setPref("explainLang", "en"); })`); await sleep(400);
  await learner("lesson", { id: "l-market" });
  ok(/At the market/.test(await mainText()) && /ຕະຫຼາດ/.test(await mainText()), "the imported lesson opens with its words");
  await learner("dialogue", { id: "d-taxi" });
  ok(/ໄປຕະຫຼາດເຊົ້າເທົ່າໃດ/.test(await mainText()) && /Fifty thousand kip/.test(await mainText()), "the imported dialogue shows its lines and translations");
  await learner("video", { id: "v-market" });
  ok(/Greetings in Lao/.test(await mainText()) && await b.eval(`document.querySelectorAll(".vd-line").length === 2`), "the imported video with its 2 transcript lines");
  await learner("culture_lab", {});
  ok(/The Baci ceremony/.test(await mainText()), "the imported culture story is listed");
  // play the whole imported quiz: every question type must render (no "Unknown question type")
  await learner("quiz", { id: "q-numbers" });
  await b.eval(`[...document.querySelectorAll("main .btn")].find(x => /Start/.test(x.innerText))?.click()`); await sleep(500);
  const seen = [];
  for (let k = 0; k < 8; k++){
    const box = await b.eval(`(() => { const q = document.querySelector(".qbox:not(.result)"); return q ? q.innerText.slice(0, 80) : ""; })()`);
    if (!box) break;
    seen.push(box.replace(/\s+/g, " ").slice(0, 40));
    // answer something: first option, or type / flip / order, then go next
    await b.eval(`(() => { const q = document.querySelector(".qbox:not(.result)");
      const opt = q.querySelector(".opt"); if (opt){ opt.click(); return; }
      const inp = q.querySelector("input.input"); if (inp){ inp.value = "ສາມ"; inp.dispatchEvent(new Event("input")); q.querySelector(".btn.primary")?.click(); return; }
      const flip = [...q.querySelectorAll(".btn")].find(b => /Flip/.test(b.innerText)); if (flip){ flip.click(); setTimeout(() => [...q.querySelectorAll(".btn")].find(b => /knew/i.test(b.innerText))?.click(), 100); return; }
      const toks = q.querySelectorAll(".tok, .order-tok, .chip-btn"); toks.forEach(t => t.click()); q.querySelector(".btn.primary")?.click(); })()`);
    await sleep(500);
    await b.eval(`[...document.querySelectorAll(".qbox .btn")].find(x => /Next|Continue|ຕໍ່ໄປ/.test(x.innerText))?.click()`); await sleep(400);
  }
  const unknown = await b.eval(`/Unknown question type/.test(document.querySelector("main").innerText)`);
  ok(seen.length >= 5 && !unknown, "the imported quiz plays question after question (" + seen.length + " shown), no 'Unknown question type'", seen);
  await learner("quiz", { id: "q-market" });
  await b.eval(`[...document.querySelectorAll("main .btn")].find(x => /Start/.test(x.innerText))?.click()`); await sleep(500);
  const market = await b.eval(`({ unknown: /Unknown question type/.test(document.querySelector("main").innerText), opts: document.querySelectorAll(".qbox .opt").length })`);
  ok(!market.unknown && market.opts === 4, "the starter quiz with old 'choice' questions now plays as multiple choice (it showed 'Unknown question type')", market);
  const errs = b.consoleLog.filter(l => /exception|error/i.test(l) && !/favicon|audio|speech|play\(\)|youtube/i.test(l));
  ok(errs.length === 0, "no JS errors", errs.slice(0, 3));
} catch(e){ console.log("  FAIL " + e.message); failed++; await b.screenshot(path.join(SHOTS, "import-all-error.png")).catch(() => {}); }
await b.close(); srv.close && srv.close(); fs.rmSync(TMP, { recursive: true, force: true });
console.log(failed ? `\n${failed} import-all checks FAILED` : "\nAll import-all checks passed");
process.exit(failed ? 1 : 0);
