// Pattern Studio in the browser (demo mode): the map (hero, numbers, pattern of the day, stage tabs, search, status
// filter, cards), one pattern learned through all five steps (Learn → See + Sentence Lab → Build → Fix → Master),
// mastery saved and handed to Review, a pattern learned the old way counts as mastered, quick drill, locked patterns
// for a free account, Lao interface, phones / tablets / desktop without sideways scrolling, and no JS errors.
// Run: node scripts/e2e_patterns.mjs
import path from "path";
import fs from "fs";
import { launch, sleep } from "./lib/cdp.mjs";
import { startDemoServer, ROOT } from "./lib/demo-server.mjs";

const SHOTS = path.join(ROOT, "e2e-screenshots"); fs.mkdirSync(SHOTS, { recursive: true });
const srv = await startDemoServer();
const b = await launch({ width: 1366, height: 900 });
let failed = 0;
const ok = (c, m, d) => { console.log((c ? "  PASS " : "  FAIL ") + m + (!c && d !== undefined ? "  → " + JSON.stringify(d).slice(0, 400) : "")); if (!c) failed++; };
const J = JSON.stringify;
async function login(email, ui = "en"){
  await b.eval(`try { localStorage.removeItem("laolao.demo.session"); localStorage.setItem("xuelu.lang",${J(ui)}); } catch(e){}`).catch(() => {});
  await b.goto(srv.base + "/"); await b.waitFor(`!!document.querySelector("#em") || !!document.querySelector(".app")`, 90000);
  await b.eval(`(() => { const e = document.querySelector("#em"), p = document.querySelector("#pw"); if (!e) return; e.value = ${J(email)}; p.value = "demo1234"; (e.form || p.form).requestSubmit(); })()`);
  await b.waitFor(`!!document.querySelector(".app .side .nav-btn")`, 90000); await sleep(800);
  await b.eval(`import("/js/learner/core.js").then(m => { m.setPref("uiLang", ${J(ui)}); m.setPref("explainLang", ${J(ui)}); })`); await sleep(300);
}
const go = (v, p = {}) => b.eval(`import("/js/learner/main.js").then(m => m.go(${J(v)}, ${J(p)}))`).then(() => sleep(1000));
const core = expr => b.eval(`import("/js/learner/core.js").then(m => JSON.parse(JSON.stringify(${expr})))`);
const shot = name => b.screenshot(path.join(SHOTS, "patterns-" + name + ".png"));
const errors = () => b.consoleLog.filter(l => /^exception|^error/.test(l) && !/favicon|youtube|net::|ERR_/i.test(l));
// exercises: with Math.random fixed, the Fix options come out in reverse order (the right one last); Build tiles carry
// their original position in their view-transition name
const fixRandom = () => b.eval(`window.__rnd = window.__rnd || Math.random; Math.random = () => 0.99`);
const freeRandom = () => b.eval(`if (window.__rnd) Math.random = window.__rnd`);
const solveBuild = () => b.eval(`(async () => { const bank = () => [...document.querySelectorAll(".gs-bank .tok")];
  const k = el => +((el.getAttribute("style") || "").match(/gs-t(\\d+)/) || [0, 0])[1];
  for (const el of bank().sort((a, x) => k(a) - k(x))){ document.querySelector('.gs-bank .tok[style*="gs-t' + k(el) + ';"], .gs-bank .tok[style$="gs-t' + k(el) + '"]').click(); await new Promise(r => setTimeout(r, 80)); }
  await new Promise(r => setTimeout(r, 150)); document.querySelector(".gs-panel .btn.primary:not([disabled])").click(); await new Promise(r => setTimeout(r, 250));
  return !!document.querySelector(".gs-answer.ok"); })()`);
const solveFix = () => b.eval(`(async () => { const o = [...document.querySelectorAll(".gs-opt")]; o[o.length - 1].click(); await new Promise(r => setTimeout(r, 200)); return !!document.querySelector(".gs-opt.right") && !document.querySelector(".gs-opt.wrong"); })()`);

try {
  await login("learner@demo.laolao");
  const NP = await core(`Object.keys(m.A.P).length`);
  console.log("the map");
  await go("patterns");
  const map = await b.eval(`({ h1: document.querySelector(".ps-hero h1")?.innerText, ring: document.querySelector(".ps-hero .gs-ring")?.innerText.replace(/\\s+/g, " "),
    go: document.querySelector(".ps-go")?.innerText || "", stats: [...document.querySelectorAll(".ps-stat")].map(x => x.dataset.s + ":" + x.querySelector("b").innerText),
    daily: !!document.querySelector(".ps-daily .ps-daily-hz b"), dailyF: !!document.querySelector(".ps-daily .gs-formula"),
    tabs: [...document.querySelectorAll(".ps-tab")].map(x => x.querySelector("b").innerText), sel: document.querySelector('.ps-tab[aria-selected="true"] b')?.innerText,
    cards: document.querySelectorAll(".ps-card:not(.locked)").length, withF: document.querySelectorAll(".ps-card .gs-formula").length, count: document.querySelector(".ps-bar2 .tabnum")?.innerText })`);
  ok(map.h1 === "Pattern Studio" && map.ring === "0/" + NP + " mastered", `hero with the progress ring (0/${NP} mastered)`, map);
  ok(/^Start:/.test(map.go), "a Start button for the next pattern: " + map.go, map.go);
  ok(map.stats.length === 4 && map.stats.includes("new:" + NP), "four numbers: mastered, learning, review due, new", map.stats);
  ok(map.daily && map.dailyF, "pattern of the day with its frame as blocks");
  ok(map.tabs[0] === "All" && map.tabs.length >= 7 && map.sel === "Stage 1", "stage tabs (All + 6 stages), Stage 1 chosen to start", map.tabs);
  ok(map.cards > 0 && map.count === map.cards + " patterns" && map.withF >= map.cards - 2, `${map.cards} pattern cards, each with its frame in blocks`, map);
  await shot("map");

  console.log("\nsearch and filters");
  await b.eval(`[...document.querySelectorAll(".ps-tab")][0].click()`); await sleep(200);
  const allN = await b.eval(`document.querySelectorAll(".ps-card:not(.locked)").length`);
  ok(allN === NP, `All: ${allN} cards`, allN);
  const search = async q => { await b.eval(`(() => { const i = document.querySelector(".ps-search"); i.value = ${J(q)}; i.dispatchEvent(new Event("input", { bubbles: true })); })()`); await sleep(350);
    return b.eval(`[...document.querySelectorAll(".ps-card:not(.locked)")].map(c => +c.dataset.n)`); };
  let r = await search("301"); ok(r.length === 1 && r[0] === 301, "by number: 301", r);
  r = await search("men"); ok(r.includes(301), "by romanization typed without tone marks: men → #301", r);
  r = await search("ກຳລັງ"); ok(r.includes(312), "by the Lao: ກຳລັງ → #312", r);
  r = await search("as long as"); ok(r.includes(355), "by the meaning: 'as long as' → #355", r);
  r = await search("qqqzz"); ok(!r.length && await b.eval(`/Nothing found|ບໍ່ພົບ/.test(document.querySelector(".ps-grid").innerText)`), "nothing found → a clear message");
  await search("");

  console.log("\none pattern, five steps (#301)");
  await go("pattern", { n: 301 });
  const head = await b.eval(`({ no: document.querySelector(".ps-head .ps-no")?.innerText, hz: document.querySelector(".ps-head h1")?.innerText, steps: document.querySelectorAll(".gs-step").length,
    on: document.querySelector(".gs-step.on")?.innerText.replace(/\\s+/g, " "), formula: document.querySelectorAll(".gs-formula.big .gb").length, mis: !!document.querySelector(".gs-mis"), ring: document.querySelector(".ps-mini-ring")?.innerText })`);
  ok(head.no === "#301" && head.hz === "ແມ່ນ" && head.steps === 5 && /Learn/.test(head.on), "header (#301 ແມ່ນ) and the five steps, starting at Learn", head);
  ok(head.formula >= 3 && head.mis && head.ring === "0/5", "Learn: the frame as big blocks, the classic mistake, 0/5", head);
  ok(await b.eval(`(() => { const x = document.querySelector(".gs-mis .ps-reveal"); const hidden = x.hidden; document.querySelector(".ps-reveal-btn").click(); return hidden && !x.hidden; })()`), "the right way is revealed on tap");
  await shot("learn");
  await b.eval(`[...document.querySelectorAll(".gs-actions .btn.primary")].pop().click()`); await sleep(500);
  ok(await b.eval(`/See it/.test(document.querySelector(".gs-step.on").innerText) && document.querySelectorAll(".gs-ex").length >= 2`), "Got it → See it: example sentences as blocks");
  ok(await b.eval(`document.querySelectorAll(".gs-ex .gs-gl").length > 3 && document.querySelectorAll(".gs-ex .tok small").length > 3`), "each word with its romanization and meaning underneath");
  await b.eval(`document.querySelector(".gs-ex .btn").click()`); await sleep(300);
  let pr = await core(`m.patternProgress(301)`);
  ok(pr.learn === 1 && pr.see === 1, "Learn and See are saved", pr);
  await shot("see");

  console.log("\nthe Sentence Lab (a pattern with a generator: #1)");
  await go("pattern", { n: 1, step: "see" });
  const lab = await b.eval(`!!document.querySelector(".ps-lab")`);
  ok(lab, "the Lab is offered");
  if (lab){ await b.eval(`document.querySelector(".ps-lab .btn.primary").click()`); await sleep(400); await b.eval(`document.querySelector(".ps-lab .btn.primary").click()`); await sleep(400);
    const n = await b.eval(`document.querySelectorAll(".ps-lab .ps-fresh").length`);
    ok(n >= 1 && await b.eval(`document.querySelector(".ps-lab .ps-fresh .gs-ex-tr").innerText.length > 3`), `New sentence: ${n} new sentences with their translation`, n); }
  await go("pattern", { n: 301, step: "see" });
  ok(!(await b.eval(`!!document.querySelector(".ps-lab")`)), "a pattern without a generator shows no empty Lab");

  console.log("\nBuild, Fix, Master");
  await fixRandom();
  await go("pattern", { n: 301, step: "build" });
  for (let k = 0; k < 2; k++){
    const built = await solveBuild();
    ok(built, "Build " + (k + 1) + ": the words in the right order are accepted");
    if (k === 0) await b.eval(`[...document.querySelectorAll(".gs-actions .btn")].find(x => !x.hidden).click()`); await sleep(400);
  }
  pr = await core(`m.patternProgress(301)`);
  ok(pr.build === 2 && await b.eval(`!!document.querySelector(".gs-go")`), "two built → step done, the way on to Fix is offered", pr);
  await shot("build");
  await b.eval(`document.querySelector(".gs-go").click()`); await sleep(500);
  for (let k = 0; k < 2; k++){
    ok(await solveFix(), "Fix " + (k + 1) + ": the right order is chosen and explained");
    if (k === 0){ await b.eval(`[...document.querySelectorAll(".gs-actions .btn")].find(x => !x.hidden).click()`); await sleep(400); }
  }
  ok(await b.eval(`/Why the other order is wrong/.test(document.querySelector(".gs-fb").innerText)`), "after a right answer, the feedback explains why the other order is wrong");
  await shot("fix");
  await b.eval(`document.querySelector(".gs-go").click()`); await sleep(500);
  await b.eval(`document.querySelector(".gs-intro .btn.primary").click()`); await sleep(400);
  for (let k = 0; k < 8 && !(await b.eval(`!!document.querySelector(".gs-result")`)); k++){
    const kind = await b.eval(`document.querySelector(".gs-bank") ? "build" : document.querySelector(".gs-opt") ? "fix" : "?"`);
    if (kind === "build") await solveBuild(); else if (kind === "fix") await solveFix();
    await b.eval(`[...document.querySelectorAll(".gs-actions .btn.primary")].find(x => !x.hidden)?.click()`); await sleep(400);
  }
  const res = await b.eval(`({ win: !!document.querySelector(".gs-result.win"), pct: document.querySelector(".gs-result .gs-ring b")?.innerText, h2: document.querySelector(".gs-result h2")?.innerText })`);
  ok(res.win && res.pct === "100%" && /mastered/i.test(res.h2), "Master: 100 % → Pattern mastered!", res);
  await freeRandom();
  pr = await core(`({ p: m.patternProgress(301), learned: !!m.A.prog.patterns[301], srs: !!m.A.srs["p:301"] })`);
  ok(pr.p.masteredAt && pr.p.best === 100 && pr.learned && pr.srs, "mastery saved, marked learned, added to Review", pr);
  ok(await b.eval(`document.querySelector(".ps-mini-ring b").innerText === "5/5" && /Mastered/.test(document.querySelector(".ps-head-meta").innerText)`), "the header shows 5/5 and Mastered straight away");
  await shot("master");

  console.log("\nback on the map");
  await b.eval(`import("/js/learner/core.js").then(m => { m.A.prog.patterns[302] = Date.now() - 86400000; })`);
  await go("patterns");
  const after = await b.eval(`({ ring: document.querySelector(".ps-hero .gs-ring b").innerText, st301: document.querySelector('.ps-card[data-n="301"]')?.dataset.status, st302: document.querySelector('.ps-card[data-n="302"]')?.dataset.status,
    go: document.querySelector(".ps-go")?.innerText || "" })`);
  ok(after.ring === "2/" + NP && after.st301 === "mastered", "the ring and the card show it mastered", after);
  ok(after.st302 === "mastered", "a pattern learned the old way also counts as mastered", after);
  await b.eval(`document.querySelector('.ps-stat[data-s="mastered"]').click()`); await sleep(400);
  const fm = await b.eval(`[...document.querySelectorAll(".ps-card:not(.locked)")].map(c => c.dataset.status)`);
  ok(fm.length >= 1 && fm.every(s => s === "mastered") && await b.eval(`document.querySelector(".ps-status").value === "mastered"`), "tap 'Mastered' → only mastered cards", fm);
  await b.eval(`document.querySelector('.ps-stat[data-s="mastered"]').click()`); await sleep(300);

  console.log("\nquick drill");
  await b.eval(`[...document.querySelectorAll(".ps-hero .btn")].find(x => /Quick drill/.test(x.innerText)).click()`); await sleep(800);
  ok(await b.eval(`!document.querySelector(".ps-drill").hidden && !!document.querySelector(".ps-drill .qbox, .ps-drill .quiz *")`), "opens a mixed quiz on the page");
  await shot("drill");
  await b.eval(`[...document.querySelectorAll(".ps-drill .btn")].find(x => /Close/.test(x.innerText)).click()`); await sleep(300);
  ok(await b.eval(`document.querySelector(".ps-drill").hidden`), "and closes");

  console.log("\nscreens");
  const over = `[...document.querySelectorAll("main *")].filter(e => { const r = e.getBoundingClientRect(); return r.width && (r.right > innerWidth + 1 || r.left < -1) && !e.closest(".ps-tabs") && getComputedStyle(e).position !== "fixed"; }).length`;
  const bad = [];
  for (const [w, hh] of [[320, 640], [375, 667], [390, 844], [430, 932], [768, 1024], [820, 1180], [1024, 768], [1180, 820], [1366, 900], [1920, 1080]]){
    await b.viewport(w, hh, w < 1024);
    for (const [v, p] of [["patterns", {}], ["pattern", { n: 301 }], ["pattern", { n: 1, step: "see" }], ["pattern", { n: 312, step: "build" }], ["pattern", { n: 312, step: "fix" }]]){
      await go(v, p);
      const x = await b.eval(`({ sw: document.documentElement.scrollWidth, o: ${over} })`);
      if (x.sw > w + 1 || x.o) bad.push(w + " " + v + J(p) + " " + J(x));
    }
    if (w === 390){ await go("patterns"); await shot("phone"); }
    if (w === 820){ await go("pattern", { n: 1, step: "see" }); await shot("ipad"); }
  }
  ok(!bad.length, "no sideways scrolling or cut-off content: phones 320–430, iPads 768–1180, desktop 1366–1920", bad.slice(0, 6));
  await b.viewport(1366, 900);

  console.log("\nLao interface");
  await login("learner@demo.laolao", "lo");
  await go("patterns");
  const lo = await b.eval(`({ h1: document.querySelector(".ps-hero h1").innerText, raw: (document.querySelector("main").innerText.match(/\\b(ps|gs)_[a-z_]+/g) || []) })`);
  ok(lo.h1 === "ຫ້ອງຝຶກໂຄງສ້າງປະໂຫຍກ" && !lo.raw.length, "titles in Lao, no untranslated keys", lo);
  await go("pattern", { n: 301 });
  ok(await b.eval(`!(document.querySelector("main").innerText.match(/\\b(ps|gs)_[a-z_]+/))`), "the pattern page too");

  console.log("\na free account");
  await login("free@demo.laolao");
  await go("patterns");
  await b.eval(`[...document.querySelectorAll(".ps-tab")].find(x => /Stage 5/.test(x.innerText))?.click()`); await sleep(300);
  const lk = await b.eval(`({ locked: document.querySelectorAll(".ps-card.locked").length, open: document.querySelectorAll(".ps-card:not(.locked)").length, txt: document.querySelector(".ps-card.locked")?.innerText.replace(/\\s+/g, " ") })`);
  ok(lk.locked >= 1 && lk.open === 0 && /12 more patterns in Premium/.test(lk.txt), "Stage 5 patterns are shown as locked (" + (lk.txt || "") + ")", lk);
  await b.eval(`document.querySelector(".ps-card.locked").click()`); await sleep(500);
  ok(await b.eval(`!!document.querySelector(".sheet, .dialog, .upgrade, [role=dialog]")`), "tapping it explains how to unlock it");
  await b.eval(`document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }))`); await sleep(300);
  await go("pattern", { n: 348 });
  ok(await b.eval(`!!document.querySelector("main .lockp, main .locked-panel, main [class*=lock]")`), "opening a locked pattern directly shows the lock, not the content");

  const errs = errors();
  ok(!errs.length, "no JS errors", errs.slice(0, 5));
} catch(e){ console.log("  FAIL crashed: " + (e.stack || e)); failed++; }
finally { await b.close(); await srv.close(); }
console.log(failed ? `\n${failed} FAILED` : "\nALL PASS");
process.exit(failed ? 1 : 0);
