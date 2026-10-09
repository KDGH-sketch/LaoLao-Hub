// Practice Studio in the browser (demo mode): the hub (rank, quick starts, coach radar and advice, 100+ practices by
// track with filters and search), playing sets of every kind to the end (words, listening, sentences, conversation
// replies, tones, consonant classes, grammar), Smart session, Daily challenge, Speed round (timer ends it), Mistakes,
// the full report, what is saved for the coach (and still there after a reload), keyboard answers, the Free plan's
// locks, Lao interface text, phone layout without sideways scrolling, night theme, and no JS errors.
// Run: node scripts/e2e_practice.mjs
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
  await b.goto(srv.base + "/"); await b.waitFor(`!!document.querySelector("#em") || !!document.querySelector(".app")`, 60000);
  await b.eval(`(() => { const e = document.querySelector("#em"), p = document.querySelector("#pw"); if (!e) return; e.value = ${J(email)}; p.value = "demo1234"; (e.form || p.form).requestSubmit(); })()`);
  await b.waitFor(`!!document.querySelector(".app .side .nav-btn")`, 60000); await sleep(800);
  await b.eval(`import("/js/learner/core.js").then(m => { m.setPref("uiLang", ${J(ui)}); m.setPref("explainLang", ${J(ui)}); })`); await sleep(400);
}
const go = (v, p = {}) => b.eval(`import("/js/learner/main.js").then(m => m.go(${J(v)}, ${J(p)}))`).then(() => sleep(900));
const coach = () => b.eval(`import("/js/learner/core.js").then(m => JSON.parse(JSON.stringify(m.coach())))`);
const mainText = () => b.eval(`document.querySelector("main").innerText`);
// answers whatever question is on screen (any type); returns what it did
const HELPER = `window.__ans = () => { const q = document.querySelector(".qbox:not(.result)"); if (!q) return document.querySelector(".qbox.result") ? "done" : "none";
  if (q.querySelector(".feedback")){ [...q.querySelectorAll(".qfoot .btn.primary")].pop().click(); return "next"; }
  const tf = q.querySelector(".tf-yes"); if (tf){ (Math.random() < .5 ? tf : q.querySelector(".tf-no")).click(); return "tf"; }
  const match = q.querySelector(".match"); if (match){ const L = [...match.children[0].children], R = [...match.children[1].children];
    for (const a of L) for (const r of R){ if (a.classList.contains("right")) break; if (r.classList.contains("right")) continue; a.click(); r.click(); } return "match"; }
  const tiles = q.querySelectorAll(".tiles:not(.answer) .tile:not(.used)"); if (tiles.length){ [...tiles].forEach(t => t.click()); [...q.querySelectorAll(".qfoot .btn.primary")].pop().click(); return "order"; }
  const jade = q.querySelector(".btn.jade"); if (jade){ jade.click(); return "self"; }
  const mic = [...q.querySelectorAll(".btn.primary")].find(x => x.querySelector("svg") && !x.disabled); if (mic && !q.querySelector(".opt")){ mic.click(); return "speak"; }
  const o = q.querySelector(".opt:not(.right):not(.wrong)"); if (o){ const all = [...q.querySelectorAll(".opt")]; all[Math.floor(Math.random() * all.length)].click(); return "opt"; }
  return "stuck:" + q.innerText.slice(0, 60); };`;
// layout check: radar labels inside the chart, chart and everything else inside its card, no sideways page scroll
const FIT = `(() => { const out = [];
  for (const svg of document.querySelectorAll(".pz-radar")){ const card = svg.closest(".card, .panel"), r = svg.getBoundingClientRect(), c = card.getBoundingClientRect();
    if (r.left < c.left - 0.5 || r.right > c.right + 0.5) out.push("chart outside card");
    for (const tx of svg.querySelectorAll("text")){ const q = tx.getBoundingClientRect();
      if (q.left < r.left - 0.5 || q.right > r.right + 0.5 || q.top < r.top - 0.5 || q.bottom > r.bottom + 0.5) out.push("label outside chart: " + tx.textContent);
      if (q.left < c.left || q.right > c.right) out.push("label outside card: " + tx.textContent); }
    for (const el of card.querySelectorAll("*")){ const q = el.getBoundingClientRect(); if (q.width && (q.right > c.right + 1 || q.left < c.left - 1)){ out.push("sticks out: " + String(el.className.baseVal ?? el.className) + " " + (el.textContent || "").slice(0, 20)); break; } } }
  if (document.scrollingElement.scrollWidth > innerWidth + 1) out.push("page scrolls sideways " + document.scrollingElement.scrollWidth + ">" + innerWidth);
  return { n: document.querySelectorAll(".pz-radar").length, out }; })()`;
const SIZES = [[320,568],[360,740],[375,667],[390,844],[414,896],[430,932],[844,390],[768,1024],[820,1180],[1024,768],[1180,820],[1280,800],[1366,768],[1440,900],[1920,1080],[2560,1440]];
async function playToEnd(max = 40){
  await b.eval(HELPER); const seen = [];
  for (let i = 0; i < max; i++){ const s = await b.eval(`window.__ans()`); seen.push(s); if (s === "done" || s === "none" || s.startsWith("stuck")) break; await sleep(s === "speak" ? 700 : 260); }
  return seen;
}

try {
  await login("learner@demo.laolao");

  console.log("the Practice Studio");
  await go("practice");
  const hub = await b.eval(`({ rank: document.querySelector(".pz-rank b")?.innerText, quick: document.querySelectorAll(".pz-qbtn").length, labels: document.querySelectorAll(".pz-radar .rd-label").length,
    insights: document.querySelectorAll(".pz-coach .pz-insight").length, next: document.querySelectorAll(".pz-coach .pz-mini").length, rows: document.querySelectorAll(".pz-row").length,
    cards: document.querySelectorAll(".pz-card").length, count: document.querySelector(".pz-lib .spread .muted")?.innerText, chips: document.querySelectorAll(".pz-tchip").length })`);
  ok(hub.rank === "Starter" && hub.quick === 4, "hero: rank and the 4 quick starts (Smart, Daily, Speed, Mistakes)", hub);
  ok(hub.labels === 9 && hub.insights >= 1 && hub.next >= 2, "coach: radar with 9 skills, advice and 'Up next' picks", hub);
  ok(+String(hub.count).match(/\d+/)[0] >= 100 && hub.cards >= 100 && hub.rows === 9 && hub.chips === 10, `library: ${hub.count}, ${hub.rows} track rows, ${hub.cards} cards`, hub);
  await b.screenshot(path.join(SHOTS, "practice-hub.png"));
  await b.eval(`[...document.querySelectorAll(".pz-tchip")].find(x => /Listening/.test(x.innerText)).click()`); await sleep(300);
  const listen = await b.eval(`({ n: document.querySelectorAll(".pz-grid .pz-card").length, all: [...document.querySelectorAll(".pz-grid .pz-card")].every(c => c.classList.contains("trk-listen")) })`);
  ok(listen.n >= 30 && listen.all, "track filter: Listening shows only listening practices", listen);
  await b.eval(`(() => { const i = document.querySelector(".pz-tools input"); i.value = "food"; i.dispatchEvent(new Event("input")); })()`); await sleep(400);
  ok(await b.eval(`[...document.querySelectorAll(".pz-grid .pz-card")].length >= 1 && [...document.querySelectorAll(".pz-grid .pz-card")].every(c => /Food/i.test(c.innerText))`), "search: 'food' finds the food practices");
  await b.eval(`(() => { const i = document.querySelector(".pz-tools input"); i.value = ""; i.dispatchEvent(new Event("input")); [...document.querySelectorAll(".pz-tchip")][0].click(); [...document.querySelectorAll(".pz-tools .seg button")][3].click(); })()`); await sleep(400);
  ok(await b.eval(`document.querySelectorAll(".pz-grid .pz-card").length > 0 && [...document.querySelectorAll(".pz-grid .pz-card .pz-meta")].every(m => /Stage 3/.test(m.innerText))`), "stage filter: Stage 3 only");

  console.log("\nplaying practice sets to the end");
  for (const id of ["th:food:words", "th:food:listen", "th:food:use", "gr:meet:talk", "gm:neg", "tn:hear", "sc:class:middle", "tn:pairs"]){
    await go("practice", { set:id });
    const head = await b.eval(`document.querySelector(".pz-shead-t")?.innerText.replace(/\\s+/g, " ")`);
    if (id === "gr:meet:talk"){ await sleep(300); ok(await b.eval(`!!document.querySelector(".chat .bubble.them .bubble-text") && document.querySelectorAll(".replies .reply-opt").length === 3`), "conversation: a chat bubble and 3 replies to choose from"); await b.screenshot(path.join(SHOTS, "practice-talk.png")); }
    const seen = await playToEnd();
    const res = await b.eval(`({ result: !!document.querySelector(".qbox.result"), after: !!document.querySelector(".pz-after"), stars: document.querySelectorAll(".qbox.result .stars span").length })`);
    ok(res.result && res.after && !seen.some(s => s.startsWith("stuck")), `${id} (${head}): played ${seen.filter(s => s !== "next").length - 1} answers to the result, coach card shown`, { seen, res });
  }
  await b.screenshot(path.join(SHOTS, "practice-result.png"));
  let c = await coach();
  ok(c.sets["th:food:words"] && c.sets["th:food:words"].p === 1 && Object.keys(c.sets).length >= 8, "every finished set is recorded (best score, stars, plays)", Object.keys(c.sets));
  const today = Object.values(c.d).pop() || {}, answers = Object.values(today).reduce((n, x) => n + x[1], 0);
  ok(answers >= 50 && Object.keys(today).length >= 6, `${answers} checked answers recorded today across ${Object.keys(today).length} skills`, today);
  ok(Object.keys(c.it).length >= 10, "words and sentences remembered for the mistakes list");

  console.log("\nkeyboard");
  await go("practice", { set:"th:colors:words" }); await sleep(300);
  const kb = await b.eval(`(async () => { const has = () => !!document.querySelector(".qbox .feedback"); document.dispatchEvent(new KeyboardEvent("keydown", { key:"1", bubbles:true }));
    await new Promise(r => setTimeout(r, 150)); const answered = has(); document.dispatchEvent(new KeyboardEvent("keydown", { key:"Enter", bubbles:true })); await new Promise(r => setTimeout(r, 200));
    return { answered, moved: /2 \\/ 10/.test(document.querySelector(".quiz").innerText) }; })()`);
  ok(kb.answered && kb.moved, "key 1 answers, Enter goes to the next question", kb);

  console.log("\nSmart session, Daily challenge, Mistakes, Speed round");
  await go("practice", { mode:"smart" }); let seen = await playToEnd();
  ok(await b.eval(`!!document.querySelector(".pz-after")`) && seen.filter(s => !["next","done"].includes(s)).length >= 9, "Smart session: 10 questions across skills, then the coach card", seen.length);
  await go("practice", { mode:"daily" }); await playToEnd();
  await go("practice"); ok(/Done today: \d+\/10/.test(await b.eval(`document.querySelector(".pz-quick").innerText`)), "Daily challenge done: the hub shows today's score");
  c = await coach(); const nm = Object.values(c.it).filter(x => x.w > 0 && x.s < 2).length;
  ok(nm > 0 && new RegExp(nm + " words").test(await b.eval(`document.querySelector(".pz-quick").innerText`)), `mistakes: ${nm} to fix, shown on the hub`);
  await go("practice", { mode:"mistakes" }); seen = await playToEnd();
  ok(await b.eval(`!!document.querySelector(".pz-after")`) && seen.length >= 3, "Mistakes: a round made from the words that went wrong", seen.length);
  await go("practice", { mode:"speed" }); await sleep(1500);
  const t1 = await b.eval(`+document.querySelector(".q-timer")?.innerText.replace("s","")`);
  await b.eval(HELPER); for (let i = 0; i < 8; i++){ await b.eval(`(() => { const q = document.querySelector(".qbox:not(.result)"); if (!q || q.querySelector(".feedback")) return; const x = q.querySelector(".tf-yes") || q.querySelector(".opt"); x && x.click(); })()`); await sleep(1200); }
  const t2 = await b.eval(`+document.querySelector(".q-timer")?.innerText.replace("s","")`);
  ok(t1 >= 57 && t2 < t1 && t2 > 0, `Speed round: the clock runs (${t1}s → ${t2}s) and questions move on by themselves`);
  await b.screenshot(path.join(SHOTS, "practice-speed.png"));
  await b.waitFor(`!!document.querySelector(".qbox.result")`, 70000).catch(() => {});
  c = await coach();
  ok(await b.eval(`!!document.querySelector(".qbox.result") && !!document.querySelector(".pz-after")`) && c.best.speed >= 0 && "speed" in c.best, `…and ends at 60 s with the result (record: ${c.best.speed} right)`);

  console.log("\nthe report");
  await go("practice_report");
  const rep = await b.eval(`({ skills: document.querySelectorAll(".pz-skill").length, radar: document.querySelectorAll(".pz-radar .rd-dot").length, heat: document.querySelectorAll(".pz-heat i").length,
    lit: document.querySelectorAll(".pz-heat i:not(.l0)").length, bank: document.querySelectorAll(".pz-fixchip").length, advice: document.querySelectorAll(".pz-insight").length })`);
  ok(rep.skills === 9 && rep.radar >= 6 && rep.heat === 84 && rep.lit >= 1 && rep.advice >= 2, "report: 9 skills with level and trend, radar, 12-week activity, advice", rep);
  ok(/Mistake bank/.test(await mainText()) && /Library progress/.test(await mainText()), "report: mistake bank and library progress per track");
  await b.screenshot(path.join(SHOTS, "practice-report.png"));

  console.log("\nsaved for the coach");
  await b.eval(`import("/js/learner/core.js").then(m => m.A.api._flush && m.A.api._flush())`); await sleep(400);
  await b.goto(srv.base + "/"); await b.waitFor(`!!document.querySelector(".app .side .nav-btn")`, 60000); await sleep(1200);
  const after = await coach();
  ok(Object.keys(after.sets).length >= 8 && after.daily && Object.keys(after.daily).length === 1, "after a reload the coach still has every set, the daily result and the answers", Object.keys(after.sets).length);
  const starSum = Object.values(after.sets).reduce((n, r) => n + r.s, 0);
  await go("practice"); ok(new RegExp("★ " + starSum + " ").test(await b.eval(`document.querySelector(".pz-rank").innerText`)), "the hero shows the stars earned (" + starSum + ")");

  console.log("\nolder links still work");
  await go("practice", { type:"tones" }); await sleep(500);
  ok(await b.eval(`!!document.querySelector(".qbox")`), "practice?type=tones (from the tone page) still opens its drill");

  console.log("\nLao interface");
  await b.eval(`import("/js/learner/core.js").then(m => m.setPref("uiLang", "lo"))`); await sleep(400); await go("practice");
  const lo = await mainText();
  ok(/ສະຕູດິໂອຝຶກ/.test(lo) && !/pz_|undefined|null/.test(lo), "Lao: the studio is in Lao, no missing texts");
  await go("practice_report"); ok(!/pz_|undefined|null/.test(await mainText()), "Lao: the report too");
  await b.eval(`import("/js/learner/core.js").then(m => m.setPref("uiLang", "en"))`); await sleep(300);

  console.log("\nphone");
  await b.viewport(390, 844, true);
  for (const [v, p] of [["practice", {}], ["practice", { set:"gr:eat:talk" }], ["practice", { set:"th:food:use" }], ["practice_report", {}]]){
    await go(v, p); const o = await b.eval(`({ sw: document.scrollingElement.scrollWidth, w: innerWidth })`);
    ok(o.sw <= o.w + 1, `${v} ${p.set || ""}: no sideways scrolling at 390 px`, o);
  }
  await go("practice");
  ok(await b.eval(`(() => { const s = document.querySelector(".pz-scroller"); return s.scrollWidth > s.clientWidth + 50; })()`), "track rows swipe sideways inside themselves");
  await b.screenshot(path.join(SHOTS, "practice-phone.png"));
  await b.eval(`document.documentElement.setAttribute("data-theme","night")`); await sleep(300); await b.screenshot(path.join(SHOTS, "practice-phone-night.png"));
  await b.eval(`document.documentElement.setAttribute("data-theme","day")`); await b.viewport(1366, 900, false);

  console.log("\nthe coach chart fits its card on every screen");
  // every label and number of the radar inside the chart, the chart inside its card, nothing in the card sticking out,
  // no sideways page scroll: phones, tablets, laptops, wide screens, portrait and landscape, in English, Lao and Chinese
  const bad = [];
  for (const L of ["en", "lo", "zh"]){
    await b.eval(`import("/js/learner/core.js").then(m => m.setPref("uiLang", ${J(L)}))`);
    for (const [w, hh] of SIZES){
      await b.viewport(w, hh, w < 900);
      for (const v of ["practice", "practice_report"]){ await go(v); await sleep(250); const r = await b.eval(FIT); if (r.n !== 1 || r.out.length) bad.push(`${L} ${w}x${hh} ${v}: ${r.n ? r.out.slice(0, 3).join("; ") : "no chart"}`); }
    }
  }
  ok(!bad.length, `radar and coach card fit at ${SIZES.length} screen sizes × 3 languages (hub and report)`, bad.slice(0, 8));
  await b.viewport(1920, 1080, false); await b.eval(`import("/js/learner/core.js").then(m => m.setPref("uiLang", "en"))`); await go("practice"); await sleep(300);
  await b.eval(`document.querySelector(".pz-coach").scrollIntoView()`); await b.screenshot(path.join(SHOTS, "practice-coach-1920.png"));
  await b.viewport(360, 740, true); await go("practice"); await sleep(300); await b.eval(`document.querySelector(".pz-coach").scrollIntoView()`); await b.screenshot(path.join(SHOTS, "practice-coach-360.png"));
  await b.viewport(1366, 900, false);

  console.log("\nFree plan");
  await b.eval(`localStorage.removeItem("laolao.demo.session")`);
  await b.goto(srv.base + "/admin/"); await b.waitFor(`!!document.querySelector("#em") || !!document.querySelector(".app")`, 60000);
  await b.eval(`(() => { const e = document.querySelector("#em"), p = document.querySelector("#pw"); if (!e) return; e.value = "admin@demo.laolao"; p.value = "demo1234"; (e.form || p.form).requestSubmit(); })()`);
  await b.waitFor(`!!document.querySelector(".app .side .nav-btn")`, 60000); await sleep(600);
  await b.eval(`Promise.all([import("/js/admin/state.js"), import("/js/shared/features.js")]).then(async ([m, f]) => { await m.S.api.db.update("plans/free", f.RECOMMENDED.free); if (m.S.api._flush) await m.S.api._flush(); })`);
  // the teacher sees the learner's coach on the learner page
  const uid = await b.eval(`import("/js/admin/state.js").then(async m => (await m.S.api.db.list("users")).find(u => u.email === "learner@demo.laolao").id)`);
  await b.eval(`import("/js/admin/state.js").then(m => m.go("learner", { uid: ${J(uid)} }))`);
  await b.waitFor(`!!document.querySelector(".pz-adm")`, 15000).catch(() => {}); await sleep(500);
  const adm = await b.eval(`(() => { const p = document.querySelector(".pz-adm"); return p ? { radar: p.querySelectorAll(".rd-label").length, skills: p.querySelectorAll(".skill").length, text: p.innerText.slice(0, 300), chips: p.querySelectorAll(".chip").length } : null; })()`);
  const admFit = [];
  for (const [w, hh] of [[390,844],[768,1024],[1366,900],[1920,1080]]){ await b.viewport(w, hh, w < 900); await sleep(400); const r = await b.eval(FIT); if (r.out.length) admFit.push(w + ": " + r.out.slice(0, 2).join("; ")); }
  await b.viewport(1366, 900, false);
  ok(!admFit.length, "admin: the learner's chart fits its panel on phone, tablet and desktop", admFit);
  ok(adm && adm.radar === 9 && adm.skills >= 6 && /Practice Studio coach/.test(adm.text) && adm.chips >= 1, "admin: the learner page shows the Practice coach (radar, skills, advice, mistakes)", adm);
  await b.screenshot(path.join(SHOTS, "practice-admin.png"));
  await login("free@demo.laolao");
  await go("practice");
  const locks = await b.eval(`({ talk: !!document.querySelector('.pz-card[data-set="gr:meet:talk"] .navlock'), words: !!document.querySelector('.pz-card[data-set="th:food:words"] .navlock') })`);
  ok(locks.talk && !locks.words, "Free: advanced sets show a lock, basic ones don't", locks);
  await go("practice", { set:"gr:meet:talk" });
  ok(await b.eval(`!!document.querySelector("main .lockp") && !document.querySelector("main .qbox")`), "Free: an advanced set (even by direct link) opens the upgrade panel instead of the questions");
  await go("practice", { set:"th:food:words" }); await sleep(300);
  ok(await b.eval(`!!document.querySelector(".pz-session .qbox")`), "Free: a basic set plays");

  const errs = b.consoleLog.filter(l => /exception|error/i.test(l) && !/favicon|audio|speech|play\(\)|youtube|not-allowed|network|aborted|recognition/i.test(l));
  ok(errs.length === 0, "no JS errors", errs.slice(0, 4));
} catch(e){ console.log("  FAIL " + e.message); failed++; await b.screenshot(path.join(SHOTS, "practice-error.png")).catch(() => {}); }
await b.close(); srv.close && srv.close();
console.log(failed ? `\n${failed} practice browser checks FAILED` : "\nAll practice browser checks passed");
process.exit(failed ? 1 : 0);
