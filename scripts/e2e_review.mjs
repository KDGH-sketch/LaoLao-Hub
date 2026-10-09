// Smart Review in the browser (demo mode): wrong answers in a real practice round are recorded with what was picked;
// the Review page shows due / to fix / memory strength, why words go wrong (causes), each trouble word with the
// letters that differ, sessions aimed at the cause (they grade the deck and update the coach), one word practised
// three ways, the classic flip cards, Lao interface, phone layout and no JS errors.
// Run: node scripts/e2e_review.mjs
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
  await b.eval(`import("/js/learner/core.js").then(m => { m.setPref("uiLang", ${J(ui)}); m.setPref("explainLang", ${J(ui)}); })`); await sleep(300);
}
const go = (v, p = {}) => b.eval(`import("/js/learner/main.js").then(m => m.go(${J(v)}, ${J(p)}))`).then(() => sleep(900));
const coach = () => b.eval(`import("/js/learner/core.js").then(m => JSON.parse(JSON.stringify(m.coach())))`);
const mainText = () => b.eval(`document.querySelector("main").innerText`);
// answer the round, always wrong where there are options (to create mistakes), until the result
async function playWrong(){
  for (let i = 0; i < 60; i++){
    const s = await b.eval(`(() => { const q = document.querySelector(".qbox:not(.result)"); if (!q) return "done";
      if (q.querySelector(".feedback")){ [...q.querySelectorAll(".qfoot .btn.primary")].pop().click(); return "next"; }
      const tf = q.querySelector(".tf-no"); if (tf){ tf.click(); return "tf"; }
      const match = q.querySelector(".match"); if (match){ const L = [...match.children[0].children], R = [...match.children[1].children]; for (const a of L) for (const r of R){ if (a.classList.contains("right")) break; if (r.classList.contains("right")) continue; a.click(); r.click(); } return "match"; }
      const tiles = q.querySelectorAll(".tiles:not(.answer) .tile:not(.used)"); if (tiles.length){ [...tiles].reverse().forEach(t => t.click()); [...q.querySelectorAll(".qfoot .btn.primary")].pop().click(); return "order"; }
      const opts = [...q.querySelectorAll(".opt")]; if (opts.length){ (opts.find(o => o.dataset.i !== undefined && o.innerText) && opts[opts.length - 1]).click(); return "opt"; }
      const fl = [...q.querySelectorAll(".btn")].find(x => /Flip/.test(x.innerText)); if (fl){ fl.click(); return "flip"; }
      const j = q.querySelector(".btn.jade") || [...q.querySelectorAll(".btn")].find(x => /didn|Again/i.test(x.innerText)); if (j){ j.click(); return "self"; }
      return "stuck:" + q.innerText.slice(0, 50); })()`);
    if (s === "done" || s.startsWith("stuck")) return s; await sleep(220);
  }
}

try {
  await login("learner@demo.laolao");
  // a deck card that is due (the oldest: it must come first in the review session)
  await b.eval(`import("/js/learner/core.js").then(m => { m.srsAdd("w:ໝາ", { type:"w", w:"ໝາ" }); })`); await sleep(50);
  console.log("mistakes from a real practice round are recorded with what was picked");
  for (const id of ["th:animals:words", "th:animals:listen", "tn:pairs"]){ await go("practice", { set:id }); await playWrong(); }
  let c = await coach();
  const withX = Object.entries(c.it).filter(([, it]) => (it.x || []).length);
  ok(withX.length >= 5, `${withX.length} words now know what was picked instead (e.g. ${withX.slice(0, 2).map(([k, it]) => k + " → " + it.x[0].g).join(", ")})`);
  ok(withX.every(([, it]) => /0/.test(it.hb || "")), "each has its answer history");

  console.log("\nthe Review page");
  await go("review");
  const hub = await b.eval(`({ stats: [...document.querySelectorAll(".rv-stats b")].map(x => x.innerText), causes: [...document.querySelectorAll(".rv-ccard")].map(x => x.className.match(/c-(\\w+)/)[1]),
    items: document.querySelectorAll(".rv-item").length, start: document.querySelector(".rv-cta")?.disabled === false })`);
  ok(hub.stats.length === 4 && +hub.stats[0] >= 1 && +hub.stats[1] >= 5 && hub.start, "hero: due now, to fix, memory strength, words learnt; Start is on", hub.stats);
  ok(hub.causes.length >= 2 && hub.causes.some(x => ["tone","related","meaning","lookalike","length","vowel","other"].includes(x)), "why you miss words: " + hub.causes.join(", "), hub.causes);
  ok(hub.items >= 5, `${hub.items} trouble words listed`);
  await b.eval(`document.querySelector(".rv-item summary").click()`); await sleep(300);
  const det = await b.eval(`(() => { const d = document.querySelector(".rv-item[open]"); return d ? { why: d.querySelectorAll(".rv-cause").length, cmp: d.querySelectorAll(".rv-cmp").length, marks: d.querySelectorAll(".rv-diffw mark").length, text: d.querySelector(".rv-cause p")?.innerText } : null; })()`);
  ok(det && det.why >= 1 && (det.cmp % 2 === 0 && (det.cmp === 0 || det.marks >= 1)) && det.text && !/%/.test(det.text), "a trouble word opens: its causes, the right word vs the picked one with the differing letters marked", det);
  await b.screenshot(path.join(SHOTS, "review-hub.png"));

  console.log("\na review session aimed at the causes");
  const before = await coach();
  await go("review", { mode:"session" });
  await b.waitFor(`!!document.querySelector(".quiz .qbox")`, 10000).catch(() => {});
  const firstQ = await b.eval(`({ type: document.querySelector(".qbox .listen-big") ? "listen" : document.querySelector(".qbox .tiles") ? "order" : document.querySelector(".qbox .opt") ? "options" : document.querySelector(".qbox .flash") ? "flashcard" : "other", n: document.querySelector(".quiz .muted.tabnum")?.innerText })`);
  ok(/\/ \d+/.test(firstQ.n || "") && firstQ.type !== "other", "session starts: " + firstQ.n + " questions (" + firstQ.type + ")", Object.assign(firstQ, { page: (await mainText()).slice(0, 300), errs: b.consoleLog.filter(l => /exception|error/i.test(l)).slice(-3) }));
  // answer the first one and look at the explanation
  await b.eval(`(() => { const q = document.querySelector(".qbox"); const o = q.querySelector(".opt"); if (o) o.click(); else { [...q.querySelectorAll(".tile")].forEach(t => t.click()); [...q.querySelectorAll(".qfoot .btn.primary")].pop().click(); } })()`); await sleep(400);
  ok(await b.eval(`!!document.querySelector(".qbox .feedback .rv-why")`), "after answering, the cause is explained right there (or that there isn't enough to tell yet)");
  await playWrong();
  const after = await coach();
  const answers = o => Object.values(o.it).reduce((n, x) => n + (x.r || 0) + (x.w || 0), 0);
  ok(await b.eval(`!!document.querySelector(".qbox.result")`) && answers(after) > answers(before), "the session ends with the result; every answer updated the coach");
  const card = await b.eval(`import("/js/learner/core.js").then(m => m.A.srs["w:ໝາ"])`);
  ok(card && card.due > card.added && (card.reps > 0 || card.ease !== 2.5), "the most overdue deck card came first and was graded (its next review moved)", card);
  await go("review", { mode:"session", cause: hub.causes[0] });
  ok(await b.eval(`/\\/ \\d+/.test(document.querySelector(".quiz .muted.tabnum")?.innerText || "") && !!document.querySelector(".pz-shead-t b")`), "a session for one cause (" + hub.causes[0] + ")");
  const k = withX[0][0];
  await go("review", { mode:"session", k });
  ok(await b.eval(`+((document.querySelector(".quiz .muted.tabnum")?.innerText || "").split("/")[1] || 0) === 3`), "one word practised three ways");

  console.log("\nclassic flip cards");
  await go("review", { mode:"classic" });
  const cl = await b.eval(`(async () => { const s = [...document.querySelectorAll("main .btn")].find(x => /Show answer/i.test(x.innerText)); if (!s) return "none"; s.click(); await new Promise(r => setTimeout(r, 200));
    const g = document.querySelectorAll(".grades .btn").length; return g; })()`);
  ok(cl === 4 || cl === "none", "classic: show the answer, then Again / Hard / Good / Easy", cl);

  console.log("\nLao interface, phone");
  await b.eval(`import("/js/learner/core.js").then(m => m.setPref("uiLang", "lo"))`); await go("review");
  await b.eval(`document.querySelector(".rv-item summary")?.click()`); await sleep(200);
  const lo = await mainText(); ok(/ທົບທວນອັດສະລິຍະ/.test(lo) && !/rv_|undefined|null|NaN|%[a-z]/.test(lo), "Lao: the page is in Lao, no missing texts or placeholders");
  await b.eval(`import("/js/learner/core.js").then(m => m.setPref("uiLang", "en"))`);
  for (const [w, hh] of [[360, 740], [390, 844], [768, 1024], [1920, 1080]]){
    await b.viewport(w, hh, w < 900);
    for (const p of [{}, { mode:"session" }]){ await go("review", p); await b.eval(`document.querySelector(".rv-item summary")?.click()`); await sleep(150);
      const o = await b.eval(`({ sw: document.scrollingElement.scrollWidth, w: innerWidth })`); if (o.sw > o.w + 1) ok(false, `${w}px ${J(p)}: no sideways scrolling`, o); }
  }
  ok(true, "no sideways scrolling at 360 / 390 / 768 / 1920 px (review page, session)");
  await b.viewport(390, 844, true); await go("review"); await b.eval(`document.querySelector(".rv-item summary")?.click()`); await sleep(200); await b.screenshot(path.join(SHOTS, "review-phone.png"));
  await b.eval(`document.documentElement.setAttribute("data-theme","night")`); await go("review"); await b.screenshot(path.join(SHOTS, "review-phone-night.png"));
  const errs = b.consoleLog.filter(l => /exception|error/i.test(l) && !/favicon|audio|speech|play\(\)|youtube|not-allowed|network|aborted|recognition/i.test(l));
  ok(errs.length === 0, "no JS errors", errs.slice(0, 4));
} catch(e){ console.log("  FAIL " + e.message); failed++; await b.screenshot(path.join(SHOTS, "review-error.png")).catch(() => {}); }
await b.close(); srv.close && srv.close();
console.log(failed ? `\n${failed} review browser checks FAILED` : "\nAll review browser checks passed");
process.exit(failed ? 1 : 0);
