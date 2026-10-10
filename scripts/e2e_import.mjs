// Admin → Excel / CSV importer in the browser (demo mode), with files saved by real Microsoft Excel (scripts/fixtures):
// templates, .xlsx, CSV UTF-8 with semicolons, plain CSV that lost the Lao letters, the old comma template, wrong content
// type, missing columns, old .xls, checking, importing (new + update, versions kept), and the phone layout.
// Run: node scripts/e2e_import.mjs
import path from "path";
import fs from "fs";
import os from "os";
import { launch, sleep } from "./lib/cdp.mjs";
import { startDemoServer, ROOT } from "./lib/demo-server.mjs";
import { writeXlsx, readXlsx } from "../js/shared/sheet-io.js";
import { templateSheets } from "../js/admin/import-map.js";

const SHOTS = path.join(ROOT, "e2e-screenshots"); fs.mkdirSync(SHOTS, { recursive: true });
const FIX = path.join(ROOT, "scripts", "fixtures");
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), "laolao-import-"));
const srv = await startDemoServer();
const b = await launch({ width: 1366, height: 900 });
let failed = 0;
const ok = (c, m, d) => { console.log((c ? "  PASS " : "  FAIL ") + m + (!c && d !== undefined ? "  → " + JSON.stringify(d).slice(0, 400) : "")); if (!c) failed++; };
const J = JSON.stringify;
const shot = n => b.screenshot(path.join(SHOTS, "import-" + n + ".png"));

// files made here: a new word, a grammar sheet, a sheet with a missing column, a fake .xls
const vocabNew = [templateSheets("vocabulary")[0].rows[0], ["ເຮັດ", "", "to do, make", "", "做", "v", "1", "verbs", "ເຮັດວຽກຫຼາຍ", "Doing a lot of work", ""], ["ໄປ", "", "to go (updated)", "", "", "", "", "", "", "", ""]];
fs.writeFileSync(path.join(TMP, "vocab-new.xlsx"), writeXlsx([{ name: "Data", header: true, rows: vocabNew }]));
const gram = templateSheets("grammar"); fs.writeFileSync(path.join(TMP, "grammar.xlsx"), writeXlsx(gram));
fs.writeFileSync(path.join(TMP, "missing.xlsx"), writeXlsx([{ name: "Data", header: true, rows: [["English", "Chinese"], ["water", "水"]] }]));
fs.writeFileSync(path.join(TMP, "old.xls"), Buffer.from([0xD0, 0xCF, 0x11, 0xE0, 0xA1, 0xB1, 0x1A, 0xE1]));

async function login(p, email){
  await b.eval(`try { localStorage.removeItem("laolao.demo.session"); localStorage.setItem("xuelu.admin.lang","en"); } catch(e){}`).catch(() => {});
  await b.goto(srv.base + p); await b.waitFor(`!!document.querySelector("#em") || !!document.querySelector(".app")`, 60000);
  await b.eval(`(() => { const e = document.querySelector("#em"), p = document.querySelector("#pw"); e.value = ${J(email)}; p.value = "demo1234"; (e.form || p.form).requestSubmit(); })()`);
  await b.waitFor(`!!document.querySelector(".app .side .nav-btn")`, 60000); await sleep(800);
}
async function upload(file){
  const { root } = await b.send("DOM.getDocument", { depth: -1 });
  const { nodeId } = await b.send("DOM.querySelector", { nodeId: root.nodeId, selector: ".imp input[type=file]" });
  await b.send("DOM.setFileInputFiles", { nodeId, files: [file] });
  await b.waitFor(`!!document.querySelector(".imp .imp-file, .imp .banner.bad")`, 15000).catch(() => {});
  await sleep(500);
}
const page = () => b.eval(`(() => { const s = [...document.querySelectorAll(".imp-sum > div")].map(x => x.innerText.replace(/\\s+/g, " "));
  return { sum: s, file: document.querySelector(".imp-file")?.innerText.replace(/\\s+/g, " ") || "", bad: [...document.querySelectorAll(".imp .banner.bad")].map(x => x.innerText).join(" | "),
    warn: [...document.querySelectorAll(".imp .banner:not(.bad):not(.ok)")].map(x => x.innerText).join(" | "), type: document.querySelector(".imp-types [aria-pressed=true]")?.innerText,
    btn: document.querySelector(".imp-step .btn.primary:last-child")?.innerText || "", disabled: !!document.querySelector(".imp-opts") && [...document.querySelectorAll(".imp-step .btn.primary")].pop()?.disabled,
    probs: [...document.querySelectorAll(".imp-probs")].map(x => x.innerText).filter(Boolean) }; })()`);
const db = p => b.eval(`import("/js/admin/state.js").then(m => m.S.api.db.get(${J(p)}))`);
const importBtn = () => b.eval(`[...document.querySelectorAll(".imp-step .btn.primary")].find(x => /^Import \\d+/.test(x.innerText.trim()))`);

try {
  await login("/admin/", "admin@demo.laolao");
  await b.eval(`import("/js/admin/state.js").then(m => m.go("excelImport"))`);
  await b.waitFor(`!!document.querySelector(".imp-drop")`, 15000);
  await shot("start");

  console.log("templates");
  const tpl = await b.eval(`import("/js/shared/sheet-io.js").then(async io => { const im = await import("/js/admin/import-map.js");
    const s = await io.readXlsx(io.writeXlsx(im.templateSheets("vocabulary")).buffer); return s.map(x => ({ name: x.name, cols: x.rows[0].length, a2: x.rows[1][0] })); })`);
  ok(tpl[0].name === "Data" && tpl[0].cols === 11 && tpl[0].a2 === "ກິນ" && tpl[1].name === "Guide", "the browser builds a real .xlsx template: 11 separate columns, Lao intact, plus a Guide sheet", tpl);
  ok(await b.eval(`[...document.querySelectorAll(".imp .btn")].some(x => /Excel template \\(\\.xlsx\\)/.test(x.innerText))`), "the main template button is Excel (.xlsx), not a comma CSV");

  console.log("\nfile saved by real Excel (.xlsx)");
  await upload(path.join(FIX, "excel-vocabulary.xlsx"));
  let p = await page();
  ok(/Excel workbook · sheet “Data”/.test(p.file) && /3 rows/.test(p.file), "Excel's own .xlsx is read: sheet Data, 3 rows", p.file);
  ok(p.sum.join("|") === "3 rows|0 new|3 update existing|0 with errors (skipped)|0 warnings", "the 3 words already exist → 3 updates, no errors", p.sum);
  await shot("xlsx");

  console.log("\nCSV UTF-8 saved by Excel with Lao regional settings (semicolons)");
  await upload(path.join(FIX, "excel-vocabulary-utf8.csv"));
  p = await page();
  ok(/separated by semicolon/.test(p.file) && /utf-8/.test(p.file) && p.sum[0] === "3 rows" && /0 with errors/.test(p.sum[3]), "semicolons are detected and every column is read (this used to collapse into one column)", p);

  console.log("\nplain CSV saved by Excel (Lao letters lost)");
  await upload(path.join(FIX, "excel-vocabulary-plain.csv"));
  p = await page();
  ok(/3 with errors/.test(p.sum[3]) && p.probs.some(x => /Lao letters were lost/.test(x) && /\.xlsx/.test(x)), "rows whose Lao turned into ??? are stopped, with how to fix it", p.probs[0]);
  ok(p.disabled === true || /Import 0/.test(p.btn), "nothing can be imported from it", p.btn);
  await b.eval(`document.querySelector(".imp-sum").scrollIntoView({ block: "start" })`); await sleep(200);
  await shot("lost-lao");

  console.log("\nthe old comma template");
  await upload(path.join(FIX, "old-template-comma.csv"));
  p = await page();
  ok(/separated by comma/.test(p.file) && p.sum[0] === "1 rows", "old comma CSV files still import", p);

  console.log("\nwrong type, missing columns, old .xls");
  await upload(path.join(TMP, "grammar.xlsx"));
  p = await page();
  ok(p.type === "Grammar" && p.sum[0] === "2 rows", "a grammar sheet uploaded under Vocabulary switches to Grammar by itself", p);
  await b.eval(`[...document.querySelectorAll(".imp-types button")].find(x => /Vocabulary/.test(x.innerText)).click()`); await sleep(300);
  await upload(path.join(TMP, "missing.xlsx"));
  p = await page();
  ok(/Missing column: Lao/.test(p.bad) && !p.sum.length, "a file without the Lao column: a clear message, nothing to import", p.bad);
  await upload(path.join(TMP, "old.xls"));
  p = await page();
  ok(/old Excel 97–2003 file/.test(p.bad) && /\.xlsx/.test(p.bad), "an old .xls file: explains how to save it as .xlsx", p.bad);

  console.log("\nimport: a new word and an update");
  const before = await db("vocabulary/ໄປ");
  await upload(path.join(TMP, "vocab-new.xlsx"));
  p = await page();
  ok(/1 new/.test(p.sum[1]) && /1 update/.test(p.sum[2]), "1 new word, 1 update", p.sum);
  ok(/Import 2 items/.test(p.btn), "the button says how many will be saved", p.btn);
  await (await b.eval(`(() => { const x = [...document.querySelectorAll(".imp-step .btn.primary")].find(x => /^Import \\d+/.test(x.innerText.trim())); x.click(); return true; })()`));
  await b.waitFor(`/Import complete|Imported with problems/.test(document.querySelector(".imp")?.innerText || "")`, 30000);
  const res = await b.eval(`document.querySelector(".imp .banner.ok, .imp .banner.bad")?.innerText || ""`);
  ok(/Saved 2 \/ 2 \(1 new, 1 updated\)/.test(res), "import complete: 2 saved", res);
  await shot("done");
  const nw = await db("vocabulary/ເຮັດ"), up = await db("vocabulary/ໄປ");
  ok(nw && nw.hz === "ເຮັດ" && nw.tr.en.meaning === "to do, make" && nw.tr.zh.meaning === "做" && nw.pos === "v" && nw.level === 1 && nw.status === "published" && nw.tags.join() === "verbs",
    "the new word is stored with its meanings, type, stage and topic", nw);
  ok(nw && nw.py && /[a-z]/.test(nw.py), "its romanization was filled in automatically: " + (nw && nw.py), nw && nw.py);
  ok(nw && nw.examples[0].zh === "ເຮັດວຽກຫຼາຍ" && nw.examples[0].tr.en === "Doing a lot of work", "its example sentence is stored the way learners' pages read it", nw && nw.examples);
  ok(up.tr.en.meaning === "to go (updated)" && up.py === before.py && up.level === before.level && JSON.stringify(up.tags) === JSON.stringify(before.tags) && (up.version || 1) === (before.version || 1) + 1,
    "the existing word: only the filled cell changed, everything else kept, version +1", { before, up });
  const vers = await b.eval(`import("/js/admin/state.js").then(m => m.S.api.db.list("vocabulary/ໄປ/versions"))`);
  ok(vers.length >= 1 && JSON.parse(vers[vers.length - 1].data).tr.en.meaning === before.tr.en.meaning, "the previous version was kept (can be restored in the editor)", vers.length);
  ok(await b.eval(`import("/js/admin/state.js").then(m => !!(m.S.bundle && m.S.bundle.dirty))`), "the Publish reminder shows (learners see it after Publish now)");

  console.log("\nphone");
  await b.send("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
  await b.eval(`import("/js/admin/state.js").then(m => m.go("excelImport"))`); await b.waitFor(`!!document.querySelector(".imp-drop")`, 15000);
  await upload(path.join(FIX, "excel-vocabulary-plain.csv"));
  ok(await b.eval(`document.documentElement.scrollWidth <= innerWidth + 1`), "fits a 390 px phone (the row table scrolls inside its box)");
  await shot("phone");
  await b.send("Emulation.setDeviceMetricsOverride", { width: 1366, height: 900, deviceScaleFactor: 1, mobile: false });

  ok(!(await b.eval(`/null|undefined/.test(document.querySelector(".imp").innerText)`)), "no stray 'null' or 'undefined' text on the page");
  const errs = b.consoleLog.filter(l => /exception|error/i.test(l) && !/favicon/i.test(l));
  ok(errs.length === 0, "no JS errors", errs.slice(0, 3));
} catch(e){ console.log("  FAIL " + e.message); failed++; await shot("error").catch(() => {}); }
await b.close(); srv.close && srv.close(); fs.rmSync(TMP, { recursive: true, force: true });
console.log(failed ? `\n${failed} import browser checks FAILED` : "\nAll import browser checks passed");
process.exit(failed ? 1 : 0);
