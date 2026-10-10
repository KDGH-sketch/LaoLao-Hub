// Grammar Studio in the browser (demo mode): the map, a point through all five steps (learn, see, build, fix, master),
// saved progress, Lao interface, night theme, phone layout, and the admin editor (old rows open with their explanation,
// no stray "null", the Studio check panel, saving writes the new shape).
// Run: node scripts/e2e_grammar.mjs
import path from "path";
import fs from "fs";
import { launch, sleep } from "./lib/cdp.mjs";
import { startDemoServer, ROOT } from "./lib/demo-server.mjs";

const SHOTS = path.join(ROOT, "e2e-screenshots"); fs.mkdirSync(SHOTS, { recursive: true });
const srv = await startDemoServer();
const b = await launch({ width: 1280, height: 900 });
let failed = 0;
const ok = (c, m, d) => { console.log((c ? "  PASS " : "  FAIL ") + m + (!c && d !== undefined ? "  → " + JSON.stringify(d).slice(0, 400) : "")); if (!c) failed++; };
const J = JSON.stringify;
const shot = n => b.screenshot(path.join(SHOTS, "grammar-" + n + ".png"));
const clickText = (sel, re) => b.eval(`(() => { const e = [...document.querySelectorAll(${J(sel)})].find(x => ${re}.test(x.innerText)); if (!e) return false; e.click(); return true; })()`);
async function login(p, email){
  await b.eval(`try { localStorage.removeItem("laolao.demo.session"); localStorage.setItem("xuelu.lang","en"); localStorage.setItem("xuelu.admin.lang","en"); } catch(e){}`).catch(() => {});
  await b.goto(srv.base + p); await b.waitFor(`!!document.querySelector("#em") || !!document.querySelector(".app")`, 60000);
  await b.eval(`(() => { const e = document.querySelector("#em"), p = document.querySelector("#pw"); e.value = ${J(email)}; p.value = "demo1234"; (e.form || p.form).requestSubmit(); })()`);
  await b.waitFor(`!!document.querySelector(".app .side .nav-btn")`, 60000); await sleep(1000);
  if (await b.eval(`(() => { const e = [...document.querySelectorAll(".topbar .langsw button")].find(x => x.textContent.trim() === "EN"); if (e && e.getAttribute("aria-pressed") !== "true"){ e.click(); return true; } return false; })()`)){ await sleep(800); await b.waitFor(`!!document.querySelector(".app .side .nav-btn")`, 30000); await sleep(400); }
}
const goL = (v, p = {}) => b.eval(`import("/js/learner/main.js").then(m => m.go(${J(v)}, ${J(p)}))`);
const errorsSince = n => b.consoleLog.slice(n).filter(l => /exception|error/i.test(l) && !/favicon|audio|speech|play\(\)/i.test(l));
// the right answer, worked out the way a learner would: from the example sentences (punctuation and spaces removed)
const examplesNorm = id => b.eval(`import("/js/learner/core.js").then(m => m.A.byType.grammar[${J(id)}].examples.map(e => e.zh.replace(/[\\s.,?!]/g, "")))`);
const stepOn = () => b.eval(`document.querySelector(".gs-step.on") ? document.querySelector(".gs-step.on").innerText.replace(/\\s+/g, " ").trim() : ""`);

async function buildOnce(norm){
  // read the bank, find the example it is made of, and tap the words in that order
  const words = await b.eval(`[...document.querySelectorAll(".gs-bank .tok")].map(x => x.innerText.trim())`);
  const target = norm.find(z => [...words].sort().join("") === [...words].sort().join("") && words.every(w => z.includes(w)) && z.length === words.join("").length);
  if (!target) return { ok: false, why: "no example matches", words };
  // greedy: next word is the one that the target continues with
  let rest = target; const order = [], pool = words.slice();
  while (rest.length && pool.length){ const i = pool.findIndex(w => rest.startsWith(w)); if (i < 0) break; order.push(pool[i]); rest = rest.slice(pool[i].length); pool.splice(i, 1); }
  for (const w of order){ await b.eval(`(() => { const x = [...document.querySelectorAll(".gs-bank .tok")].find(t => t.innerText.trim() === ${J(w)}); x && x.click(); })()`); await sleep(260); }
  await b.eval(`[...document.querySelectorAll(".gs-panel .btn.primary")].find(x => /Check/.test(x.innerText)).click()`); await sleep(300);
  return { ok: /Perfect order|second try/.test(await b.eval(`document.querySelector(".gs-fb")?.innerText || ""`)), order };
}
async function fixOnce(norm){
  const opts = await b.eval(`[...document.querySelectorAll(".gs-opt")].map(x => [...x.querySelectorAll(".tok")].map(t => t.innerText.trim()).join(""))`);
  const i = opts.findIndex(o => norm.includes(o));
  await b.eval(`document.querySelectorAll(".gs-opt")[${Math.max(0, i)}].click()`); await sleep(300);
  return { ok: i >= 0 && /Correct/.test(await b.eval(`document.querySelector(".gs-fb")?.innerText || ""`)), i, opts };
}

try {
  console.log("the crash");
  await login("/", "learner@demo.laolao");
  await b.eval(`import("/js/learner/core.js").then(m => m.setPref("explainLang", "en"))`);
  let n0 = b.consoleLog.length;
  await goL("grammarItem", { id: "g01-word-order" }); await sleep(900);
  ok(errorsSince(n0).length === 0 && await b.eval(`!!document.querySelector(".gs-steps")`), "opening a grammar point no longer crashes ('Cannot read properties of undefined')", errorsSince(n0));

  console.log("\nthe map");
  await goL("grammar"); await sleep(900);
  const map = await b.eval(`({ cards: document.querySelectorAll(".gs-card").length, ring: document.querySelector(".gs-hero .gs-ring")?.innerText.replace(/\\s+/g, " "),
    legend: document.querySelectorAll(".gs-legend-row .gb").length, demo: document.querySelectorAll(".gs-demo .tok").length, cont: document.querySelector(".gs-hero .btn.primary")?.innerText || "",
    formulas: document.querySelectorAll(".gs-card .gs-formula").length })`);
  const NG = await b.eval(`import("/js/learner/core.js").then(m => Object.keys(m.A.byType.grammar).length)`);   // starter points + the Stage 1–6 course
  ok(NG >= 3 && map.cards === NG && map.formulas === NG, `every grammar point (${NG}) is a card with its formula as coloured blocks`, map);
  ok(map.ring === "0/" + NG + " mastered" && /Start/.test(map.cont), "overall progress ring, and a Start button for the next point", map);
  ok(map.legend === 8 && map.demo === 4, "the building-block legend with a live example (food · Lao · tasty · very)", map);
  await shot("map");

  console.log("\n1 learn");
  await clickText(".gs-card", "/Sentence Structure/"); await sleep(900);
  const learn = await b.eval(`({ steps: document.querySelectorAll(".gs-step").length, roles: [...document.querySelectorAll(".gs-formula.big .gb")].map(x => x.dataset.role).join(" "),
    explain: document.querySelector(".gs-explain")?.innerText.slice(0, 40), mis: document.querySelectorAll(".gs-mis").length })`);
  ok(learn.steps === 5 && /Learn/.test(await stepOn()), "five steps: Learn, See it, Build, Fix, Master", learn);
  ok(learn.roles === "S V O" && /analytic/.test(learn.explain), "the formula S + V + O as Subject / Verb / Object blocks, and the explanation (from the old 'body' field)", learn);
  ok(learn.mis === 1, "a common mistake: wrong vs right");
  await shot("learn");
  await clickText(".gs-panel .btn.primary", "/Got it/"); await sleep(500);

  console.log("\n2 see it");
  ok(/See it/.test(await stepOn()) && await b.eval(`document.querySelector(".gs-step.done") !== null`), "Learn is ticked, See it opens");
  const see = await b.eval(`({ ex: document.querySelectorAll(".gs-ex").length, gloss: [...document.querySelectorAll(".gs-ex .gs-gl")].slice(0, 3).map(x => x.innerText), roles: [...document.querySelectorAll(".gs-ex:first-child .tok")].map(x => x.dataset.role).join(" ") })`);
  ok(see.ex === 3 && see.gloss.length === 3 && see.gloss.every(Boolean), "examples as blocks, each word with its meaning underneath", see);
  ok(/^S V O/.test(see.roles), "ຂ້ອຍ ຮຽນ ພາສາລາວ → Subject Verb Object colours", see.roles);
  await b.eval(`document.querySelector(".gs-ex .btn").click()`); await sleep(350);
  ok(await b.eval(`document.querySelectorAll(".gs-ex .tok.lit").length === 1`), "Play: the words light up one by one");
  await shot("see");
  await b.eval(`[...document.querySelectorAll(".gs-tog input")][0].click()`); await sleep(200);
  ok(await b.eval(`document.querySelectorAll(".gs-ex .gs-gl").length === 0`), "the word-by-word meanings can be hidden");
  await clickText(".gs-panel .btn.primary", "/Next: build/"); await sleep(500);

  console.log("\n3 build");
  const norm = await examplesNorm("g01-word-order");
  // a wrong try first
  const bank = await b.eval(`[...document.querySelectorAll(".gs-bank .tok")].map(x => x.innerText.trim())`);
  // a wrong order for sure: the right order with the first two words swapped
  const right = (() => { let rest = norm.find(z => bank.every(w => z.includes(w)) && z.length === bank.join("").length) || "", pool = bank.slice(), out = [];
    while (rest && pool.length){ const i = pool.findIndex(w => rest.startsWith(w)); if (i < 0) break; out.push(pool[i]); rest = rest.slice(pool[i].length); pool.splice(i, 1); } return out; })();
  const wrongOrder = right.length > 1 ? [right[1], right[0], ...right.slice(2)] : bank;
  for (const w of wrongOrder) { await b.eval(`(() => { const x = [...document.querySelectorAll(".gs-bank .tok")].find(t => t.innerText.trim() === ${J(w)}); x && x.click(); })()`); await sleep(200); }
  const placedAll = await b.eval(`document.querySelectorAll(".gs-answer .tok").length`);
  await b.eval(`[...document.querySelectorAll(".gs-panel .btn.primary")].find(x => /Check/.test(x.innerText)).click()`); await sleep(300);
  const tryMsg = await b.eval(`document.querySelector(".gs-fb")?.innerText || ""`);
  ok(placedAll === bank.length && /word 1 is in the wrong place/.test(tryMsg), "tapping words moves them into the sentence; a wrong order says which word is misplaced", tryMsg);
  await b.eval(`[...document.querySelectorAll(".gs-panel .btn")].find(x => /Start over/.test(x.innerText))?.click()`); await sleep(300);
  let r1 = await buildOnce(norm);
  ok(r1.ok, "building the sentence in the right order: 'Perfect order!'", r1);
  await shot("build");
  await clickText(".gs-panel .btn.primary", "/^Next$/"); await sleep(400);
  const r2 = await buildOnce(norm);
  ok(r2.ok && /2 \/ 2 built/.test(await b.eval(`document.querySelector(".gs-panel .chip")?.innerText || ""`)), "two right builds complete the step", r2);
  ok(await b.eval(`[...document.querySelectorAll(".gs-step")][2].classList.contains("done")`), "Build is ticked");
  await clickText(".gs-panel .btn.primary", "/Next: spot/"); await sleep(500);

  console.log("\n4 fix");
  const fx = await b.eval(`({ opts: document.querySelectorAll(".gs-opt").length, q: document.querySelector(".gs-prompt")?.innerText })`);
  ok(fx.opts >= 3 && /right word order/.test(fx.q), "spot the mistake: 3 or more versions of the sentence", fx);
  const f1 = await fixOnce(norm);
  const why = await b.eval(`document.querySelector(".gs-fb")?.innerText || ""`);
  ok(f1.ok && /Why the other order is wrong:/.test(why), "picking the right order: Correct, and why the other order is wrong", { f1, why });
  ok(new Set(f1.opts).size === f1.opts.length, "no two choices are the same sentence", f1.opts);
  await shot("fix");
  await clickText(".gs-panel .btn.primary", "/^Next$/"); await sleep(400);
  const f2 = await fixOnce(norm);
  ok(f2.ok && await b.eval(`[...document.querySelectorAll(".gs-step")][3].classList.contains("done")`), "two right answers complete Fix", f2);
  await clickText(".gs-panel .btn.primary", "/Next: the challenge/"); await sleep(500);

  console.log("\n5 master");
  await clickText(".gs-panel .btn.primary", "/Start/"); await sleep(400);
  for (let k = 0; k < 8; k++){
    if (await b.eval(`!!document.querySelector(".gs-result")`)) break;
    if (await b.eval(`!!document.querySelector(".gs-bank .tok")`)) await buildOnce(norm); else await fixOnce(norm);
    await clickText(".gs-panel .btn.primary", "/^Next$/"); await sleep(400);
  }
  const res = await b.eval(`document.querySelector(".gs-result")?.innerText.replace(/\\s+/g, " ") || ""`);
  ok(/100%/.test(res) && /Mastered!/.test(res), "the challenge: 100%, Mastered!", res);
  await shot("master");
  const saved = await b.eval(`import("/js/learner/core.js").then(async m => ({ mem: m.grammarProgress("g01-word-order"), db: ((await m.A.api.db.get("progress/" + m.A.user.uid)).grammar || {})["g01-word-order"] }))`);
  ok(saved.mem.learn && saved.mem.see && saved.mem.build >= 2 && saved.mem.fix >= 2 && saved.mem.best === 100 && saved.mem.masteredAt, "progress for every step is kept", saved.mem);
  ok(saved.db && saved.db.best === 100 && saved.db.masteredAt, "…and saved to the learner's progress in the database", saved.db);
  await goL("grammar"); await sleep(800);
  const after = await b.eval(`({ ring: document.querySelector(".gs-hero .gs-ring")?.innerText.replace(/\\s+/g, " "), st: [...document.querySelectorAll(".gs-card")].map(x => x.dataset.status), cont: document.querySelector(".gs-hero .btn.primary")?.innerText })`);
  ok(after.ring === "1/" + NG + " mastered" && after.st.includes("mastered") && !/Sentence Structure/.test(after.cont), "the map shows 1 mastered and suggests the next point", after);

  console.log("\nLao interface, night, phone");
  await b.eval(`(() => { const e = [...document.querySelectorAll(".topbar .langsw button")].find(x => x.textContent.trim() === "ລາວ"); e && e.click(); })()`); await sleep(1200);
  n0 = b.consoleLog.length;
  await goL("grammar"); await sleep(800);
  ok(/ຫ້ອງຝຶກໄວຍາກອນ/.test(await b.eval(`document.querySelector(".gs-hero h1")?.innerText || ""`)) && errorsSince(n0).length === 0, "Lao interface: Grammar Studio in Lao, no errors");
  await goL("grammarItem", { id: "g02-classifiers", step: "see" }); await sleep(800);
  ok(await b.eval(`[...document.querySelectorAll(".gs-formula .gb")].map(x => x.dataset.role).join(" ") === "N Num Clf"`), "classifiers: N + Num + Clf blocks");
  await b.eval(`document.documentElement.setAttribute("data-theme", "night")`); await sleep(300);
  await shot("night-lo");
  await b.eval(`(() => { const e = [...document.querySelectorAll(".topbar .langsw button")].find(x => x.textContent.trim() === "EN"); e && e.click(); })()`); await sleep(1000);
  await b.send("Emulation.setDeviceMetricsOverride", { width: 375, height: 812, deviceScaleFactor: 2, mobile: true }); await sleep(500);
  await goL("grammarItem", { id: "g03-politeness", step: "build" }); await sleep(800);
  ok(await b.eval(`document.documentElement.scrollWidth <= innerWidth + 1`), "phone (375 px): no sideways scrolling in Build");
  ok(await b.eval(`[...document.querySelectorAll(".gs-step, .gs-bank .tok")].every(x => x.getBoundingClientRect().height >= 44)`), "steps and word blocks are big enough to tap");
  await shot("phone");
  await goL("grammar"); await sleep(600);
  ok(await b.eval(`document.documentElement.scrollWidth <= innerWidth + 1`), "phone: the map fits");
  await b.send("Emulation.setDeviceMetricsOverride", { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false });
  await b.eval(`document.documentElement.setAttribute("data-theme", "day")`);
  ok(!(await b.eval(`/\\bnull\\b|undefined/.test(document.querySelector("main").innerText)`)), "no stray 'null' or 'undefined' text");
  const errs = b.consoleLog.filter(l => /exception|error/i.test(l) && !/favicon|audio|speech|play\(\)/i.test(l));
  ok(errs.length === 0, "no JS errors in the learner app", errs.slice(0, 3));

  console.log("\nadmin");
  await login("/admin/", "admin@demo.laolao");
  // an old-shape row (explanation in body), as the live database may still have
  await b.eval(`import("/js/admin/state.js").then(m => m.S.api.db.set("grammar/g99-old", { title: { en: "Old row" }, level: 1, status: "draft", structure: "S + ບໍ່ + V", body: { en: "Old explanation text.", lo: "ຄຳອະທິບາຍເກົ່າ." }, examples: [{ zh: "ຂ້ອຍບໍ່ກິນຊີ້ນ.", py: "", tr: { en: "I don't eat meat." } }] }))`);
  await b.eval(`import("/js/admin/state.js").then(m => m.go("editor", { type: "grammar", id: "g99-old" }))`);
  await b.waitFor(`!!document.querySelector(".editor")`, 15000); await sleep(600);
  const edv = await b.eval(`({ ta: [...document.querySelectorAll(".editor textarea")].map(x => x.value).filter(Boolean), nul: /\\bnull\\b/.test(document.querySelector("main").innerText) })`);
  ok(edv.ta.some(v => /Old explanation text/.test(v)), "the editor shows the explanation of an old row (it used to be empty)", edv.ta);
  ok(!edv.nul, "no stray 'null' under the title any more");
  await clickText(".editor-side .btn", "/Check now/"); await sleep(1200);
  const chk = await b.eval(`(() => { const p = [...document.querySelectorAll(".editor-side .panel")].find(x => /Grammar Studio check/.test(x.innerText)); return p ? { blocks: p.querySelectorAll(".gb").length, text: p.innerText.replace(/\\s+/g, " ") } : null; })()`);
  ok(chk && chk.blocks >= 6 && /Only 1 example/.test(chk.text) && /No Lao explanation/.test(chk.text) === false, "Studio check: shows the formula and example as blocks, and what's missing (examples)", chk);
  await shot("admin-check");
  await b.eval(`[...document.querySelectorAll(".editor-side .btn.primary")].find(x => /Save/.test(x.innerText)).click()`); await sleep(1200);
  const row = await b.eval(`import("/js/admin/state.js").then(m => m.S.api.db.get("grammar/g99-old"))`);
  ok(row && row.tr && row.tr.en.explain === "Old explanation text." && !("body" in row) && row.version >= 1, "saving writes the new shape (tr.*.explain) and drops the old body field, keeping the text", row && { tr: row.tr, body: row.body, version: row.version });
} catch(e){ console.log("  FAIL " + e.message); failed++; await shot("error").catch(() => {}); }
await b.close(); srv.close && srv.close();
console.log(failed ? `\n${failed} grammar browser checks FAILED` : "\nAll grammar browser checks passed");
process.exit(failed ? 1 : 0);
