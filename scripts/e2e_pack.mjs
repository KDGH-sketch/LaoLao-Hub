// The Stage 1–6 curriculum pack in the browser (demo mode): demo mode imports it once; a free learner sees the free
// stages (paths, lessons with words, patterns, grammar and a dialogue, quizzes that can be finished, culture stories)
// and not the paid ones; the Admin "Curriculum pack" panel says everything is already there; no JS errors.
// Run: node scripts/e2e_pack.mjs
import fs from "fs";
import path from "path";
import { launch, sleep } from "./lib/cdp.mjs";
import { startDemoServer, ROOT } from "./lib/demo-server.mjs";

const pack = JSON.parse(fs.readFileSync(path.join(ROOT, "data/curriculum-pack.json"), "utf8"));
const srv = await startDemoServer();
const b = await launch({ width: 1366, height: 900 });
let failed = 0;
const ok = (c, m, d) => { console.log((c ? "  PASS " : "  FAIL ") + m + (!c && d !== undefined ? "  → " + JSON.stringify(d).slice(0, 400) : "")); if (!c) failed++; };
const J = JSON.stringify;
async function login(email, base = "/"){
  await b.eval(`try { localStorage.removeItem("laolao.demo.session"); localStorage.setItem("xuelu.lang","en"); localStorage.setItem("xuelu.admin.lang","en"); } catch(e){}`).catch(() => {});
  await b.goto(srv.base + base); await b.waitFor(`!!document.querySelector("#em") || !!document.querySelector(".app")`, 90000);
  await b.eval(`(() => { const e = document.querySelector("#em"), p = document.querySelector("#pw"); if (!e) return; e.value = ${J(email)}; p.value = "demo1234"; (e.form || p.form).requestSubmit(); })()`);
  await b.waitFor(`!!document.querySelector(".app .side .nav-btn")`, 90000); await sleep(900);
  if (base === "/"){ await b.eval(`import("/js/learner/core.js").then(m => { m.setPref("uiLang","en"); m.setPref("explainLang","en"); })`); await sleep(200); }
}
const go = (v, p = {}) => b.eval(`import("/js/learner/main.js").then(m => m.go(${J(v)}, ${J(p)}))`).then(() => sleep(900));
const mainText = () => b.eval(`document.querySelector("main").innerText`);
const errors = () => b.consoleLog.filter(l => /^exception|^error/.test(l) && !/favicon|youtube|ERR_|net::/i.test(l));

try {
  const free = Object.values(pack.items.lessons).filter(l => l.access === "free"), paid = Object.values(pack.items.lessons).filter(l => l.access !== "free");
  await login("free@demo.laolao");
  console.log("a free learner");
  const seen = await b.eval(`import("/js/learner/core.js").then(m => ({ lessons: Object.keys(m.A.byType.lessons), paths: Object.keys(m.A.byType.paths), quizzes: Object.keys(m.A.byType.quizzes), dialogues: Object.keys(m.A.byType.dialogues), culture: Object.keys(m.A.byType.culture), patterns: Object.keys(m.A.P) }))`);
  const missing = free.filter(l => !seen.lessons.includes(l.id)).map(l => l.id);
  ok(!missing.length, `all ${free.length} free lessons (Stage 1–2) reach the learner`, missing);
  ok(!paid.some(l => seen.lessons.includes(l.id)), `none of the ${paid.length} paid lessons reach a free browser`);
  const stage1 = pack.items.paths.find(p => p.id === "path-stage1");
  ok(seen.paths.includes("path-stage1") && seen.quizzes.includes("q-c1-01") && seen.dialogues.includes("d-c1-01") && seen.patterns.includes("301"), "path, quiz, dialogue and pattern 301 are there");
  ok(pack.items.culture.filter(c => c.access === "free").every(c => seen.culture.includes(c.id)), "the free culture stories are there");

  await go("path", { id: "path-stage1" });
  let txt = await mainText();
  ok(txt.includes(stage1.title.en) && (txt.match(/\n/g) || []).length > 20, "the Stage 1 path opens: " + stage1.title.en);

  const l1 = pack.items.lessons.find(l => l.id === "c1-01");
  await go("lesson", { id: "c1-01" });
  txt = await mainText();
  ok(txt.includes(l1.title.en), "lesson c1-01 opens: " + l1.title.en);
  ok(l1.vocab.slice(0, 3).every(w => txt.includes(w)), "its words are shown", l1.vocab.slice(0, 3));
  ok(await b.eval(`!document.querySelector("main .banner.err") && !/undefined|\\[object Object\\]/.test(document.querySelector("main").innerText)`), "no 'undefined' or '[object Object]' on the lesson page");

  console.log("\nevery Stage 1 lesson opens without errors");
  const bad = [];
  for (const l of pack.items.lessons.filter(x => x.id.startsWith("c1-"))){
    await go("lesson", { id: l.id });
    const t = await mainText(); if (!t.includes(l.title.en) || /undefined|\[object Object\]/.test(t)) bad.push(l.id);
  }
  ok(!bad.length, "20 lessons render their title and content", bad);

  console.log("\na generated quiz can be finished");
  await go("quiz", { id: "q-c1-01" });
  let steps = 0, state = "";
  for (; steps < 40; steps++){
    state = await b.eval(`(() => { const q = document.querySelector(".qbox:not(.result)"); if (!q) return document.querySelector(".qbox.result, .result") ? "done" : "none";
      if (q.querySelector(".feedback")){ [...q.querySelectorAll(".qfoot .btn.primary")].pop().click(); return "next"; }
      const tiles = q.querySelectorAll(".tiles:not(.answer) .tile:not(.used)"); if (tiles.length){ [...tiles].forEach(t => t.click()); [...q.querySelectorAll(".qfoot .btn.primary")].pop().click(); return "order"; }
      const opts = [...q.querySelectorAll(".opt")]; if (opts.length){ opts[0].click(); const c = [...q.querySelectorAll(".qfoot .btn.primary")].pop(); if (c && !q.querySelector(".feedback")) c.click(); return "opt"; }
      const inp = q.querySelector("input"); if (inp){ inp.value = "x"; inp.dispatchEvent(new Event("input",{bubbles:true})); [...q.querySelectorAll(".qfoot .btn.primary")].pop().click(); return "fill"; }
      return "stuck:" + q.innerText.slice(0, 80); })()`);
    if (state === "done" || state === "none" || state.startsWith("stuck")) break; await sleep(250);
  }
  ok(state === "done", `the quiz reaches its result (${steps} steps)`, state);

  console.log("\nphone layout");
  await b.viewport(390, 844, true); await go("lesson", { id: "c1-05" });
  ok(await b.eval(`document.documentElement.scrollWidth <= innerWidth + 1`), "lesson: no sideways scroll at 390 px");
  await go("path", { id: "path-stage1" });
  ok(await b.eval(`document.documentElement.scrollWidth <= innerWidth + 1`), "path: no sideways scroll at 390 px");
  await b.viewport(1366, 900);

  console.log("\na Premium learner gets all six stages");
  await login("learner@demo.laolao");
  const prem = await b.eval(`import("/js/learner/core.js").then(m => ({ lessons: Object.keys(m.A.byType.lessons), paths: Object.keys(m.A.byType.paths) }))`);
  const all = pack.items.lessons.map(l => l.id);
  ok(all.every(id => prem.lessons.includes(id)), `all ${all.length} lessons (Stage 1–6)`, all.filter(id => !prem.lessons.includes(id)).slice(0, 5));
  ok([1, 2, 3, 4, 5, 6].every(n => prem.paths.includes("path-stage" + n)), "all six stage paths");
  const bad6 = [];
  for (const id of ["c3-05", "c4-10", "c5-13", "c6-02", "c6-20"]){
    const l = pack.items.lessons.find(x => x.id === id); await go("lesson", { id });
    const t = await mainText(); if (!t.includes(l.title.en) || /undefined|\[object Object\]/.test(t)) bad6.push(id);
  }
  ok(!bad6.length, "lessons from Stage 3–6 open (a sample of five)", bad6);
  await go("dialogue", { id: "d-c5-20" });
  const sp = await b.eval(`[...document.querySelectorAll("main .sentence, main .sent")].length + ":" + /\\bC\\b/.test(document.querySelector("main").innerText)`);
  ok(/:true$/.test(sp), "a three-person dialogue shows its speakers (A, B, C)", sp);
  await go("quiz", { id: "q-c6-02" }); await sleep(400);
  ok(await b.eval(`!!document.querySelector(".qbox")`), "a Stage 6 quiz opens");

  console.log("\nAdmin → All content → Curriculum pack");
  await login("admin@demo.laolao", "/admin/");
  await b.eval(`import("/js/admin/state.js").then(m => m.go("content"))`); await sleep(1200);
  ok(await b.eval(`!!document.querySelector(".pack-panel")`), "the panel is on the All content page");
  await b.eval(`[...document.querySelectorAll(".pack-panel .btn")].find(x => /Check/.test(x.innerText)).click()`);
  await b.waitFor(`!!document.querySelector(".pack-panel .pack-grid, .pack-panel .banner")`, 30000); await sleep(300);
  const pan = await b.eval(`({ cells: document.querySelectorAll(".pack-panel .pack-cell").length, nums: [...document.querySelectorAll(".pack-panel .pack-cell b")].map(x => +x.innerText), done: !!document.querySelector(".pack-panel .banner.ok") })`);
  ok(pan.cells === 8 && pan.nums.every(n => n === 0) && pan.done, "8 content types, 0 new: demo mode already has everything", pan);
  // a lesson and a quiz go missing; the team edited another lesson: Import brings back only the missing two
  await b.eval(`import("/js/admin/state.js").then(async m => { await m.S.api.db.del("lessons/c6-20"); await m.S.api.db.del("quizzes/q-c6-20");
    const l = await m.S.api.db.get("lessons/c6-19"); await m.S.api.db.set("lessons/c6-19", Object.assign({}, l, { title: Object.assign({}, l.title, { en: "Edited by the team" }) })); })`);
  await b.eval(`[...document.querySelectorAll(".pack-panel .btn")].find(x => /Check/.test(x.innerText)).click()`);
  await b.waitFor(`[...document.querySelectorAll(".pack-panel .btn")].some(x => /Import 2 new/.test(x.innerText))`, 30000);
  ok(true, "Check finds exactly 2 new items");
  await b.eval(`[...document.querySelectorAll(".pack-panel .btn")].find(x => /Import 2 new/.test(x.innerText)).click()`); await sleep(400);
  await b.eval(`[...document.querySelectorAll(".dialog .dialog-f .btn")].find(x => /Import/.test(x.innerText)).click()`);
  await b.waitFor(`/Added 2 items/.test(document.querySelector(".pack-panel").innerText)`, 30000);
  const after = await b.eval(`import("/js/admin/state.js").then(async m => ({ l: !!(await m.S.api.db.get("lessons/c6-20")), q: !!(await m.S.api.db.get("quizzes/q-c6-20")), kept: (await m.S.api.db.get("lessons/c6-19")).title.en }))`);
  ok(after.l && after.q && after.kept === "Edited by the team", "Import restored the 2 missing items and left the edited lesson alone", after);
  ok(await b.eval(`[...document.querySelectorAll(".pack-panel .btn")].some(x => /Publish/.test(x.innerText))`), "then offers Publish");

  // a pack file chosen from the computer
  const tmp = path.join(ROOT, "e2e-screenshots", "pack-file.json");
  fs.mkdirSync(path.dirname(tmp), { recursive: true });
  fs.writeFileSync(tmp, JSON.stringify({ version: 1, items: { lessons: [Object.assign({}, pack.items.lessons[0], { id: "c9-01" })] } }));
  await b.send("DOM.enable"); const { root } = await b.send("DOM.getDocument", { depth: -1, pierce: true });
  const { nodeId } = await b.send("DOM.querySelector", { nodeId: root.nodeId, selector: '.pack-panel input[type="file"]' });
  await b.send("DOM.setFileInputFiles", { nodeId, files: [tmp] });
  await b.waitFor(`[...document.querySelectorAll(".pack-panel .btn")].some(x => /Import 1 new/.test(x.innerText))`, 30000).then(() => ok(true, "Use a pack file…: a file from the computer is checked the same way (1 new)"), e => ok(false, "Use a pack file…", String(e)));
  fs.rmSync(tmp, { force: true });
  await b.viewport(390, 844, true); await sleep(500);
  ok(await b.eval(`document.documentElement.scrollWidth <= innerWidth + 1 && [...document.querySelectorAll(".pack-panel .pack-cell")].every(c => c.getBoundingClientRect().right <= innerWidth)`), "the panel fits a phone (390 px)");
  await b.viewport(1366, 900);
  const errs = errors();
  ok(!errs.length, "no JS errors", errs.slice(0, 5));
} catch(e){ console.log("  FAIL crashed: " + (e.stack || e)); failed++; }
finally { await b.close(); await srv.close(); }
console.log(failed ? `\n${failed} FAILED` : "\nALL PASS");
process.exit(failed ? 1 : 0);
