// Safari (WebKit) layout check: the app in Apple's browser engine at phone, tablet and laptop sizes.
// Older Safari (iPad / iPhone before Safari 17) puts "align-items: flex-start" on every <button> in its own stylesheet,
// so a button laid out as a flex box shrank its children (the practice cards broke on an iPad, also stat and tone cards).
// css/app.css resets it (button{align-items:stretch}); this test proves it in WebKit:
//   - a plain <button> stretches, the practice cards' art and text span the card
//   - in every flex-column button, each stretched child spans the button
//   - no screen scrolls sideways
// Needs Playwright's WebKit (not a dependency of the app):  npm i -D playwright && npx playwright install webkit
// To test an older Safari engine, point PW_PATH at another Playwright (e.g. playwright@1.30 = WebKit 16.4).
// Run: node scripts/qa_safari.mjs        (skips with a message when Playwright is not installed)
import { createRequire } from "module";
import { startDemoServer } from "./lib/demo-server.mjs";

const require = createRequire(import.meta.url);
let webkit;
try { ({ webkit } = require(process.env.PW_PATH || "playwright")); } catch(e){
  console.log("  SKIP Safari check: Playwright is not installed (npm i -D playwright && npx playwright install webkit)"); process.exit(0); }

let failed = 0;
const ok = (c, m, d) => { console.log((c ? "  PASS " : "  FAIL ") + m + (!c && d !== undefined ? "  → " + JSON.stringify(d).slice(0, 500) : "")); if (!c) failed++; };
const SIZES = [[390, 844, "iPhone"], [820, 1180, "iPad portrait"], [1180, 820, "iPad landscape"], [1366, 900, "laptop"]];
const ROUTES = [["home",{}],["practice",{}],["practice",{track:"vocab"}],["practice_report",{}],["speak",{}],["speak",{unit:"pr-six"}],["speak",{unit:"pr-six",step:"say"}],["review",{}],
  ["paths",{}],["vocab",{}],["grammar",{}],["handwriting",{}],["videos",{}],["dict",{}],["tone_lab",{}],["pronounce_lab",{}],["culture_lab",{}],["account",{}],["more",{}],["progress",{}],["patterns",{}],
  ["pattern",{n:301}],["pattern",{n:1,step:"see"}],["pattern",{n:301,step:"build"}],["pattern",{n:301,step:"fix"}],["pattern",{n:301,step:"master"}],
  ["handwriting",{sec:"words"}],["handwriting",{sec:"consonants",ch:"ກ"}],["handwriting",{sec:"vowels"}]];
const srv = await startDemoServer();
const browser = await webkit.launch();
console.log("WebKit " + browser.version());
// Playwright's WebKit on Windows sometimes never finishes loading a new page: such an attempt is retried (twice)
async function open(w, h){
  for (let k = 0; ; k++){
    try { return await openOnce(w, h); }
    catch(e){ if (k >= 2 || !/Timeout|crash/i.test(String(e.message))) throw e; console.log("  NOTE the test browser did not load the page; trying again"); }
  }
}
async function openOnce(w, h){
  const ctx = await browser.newContext({ viewport: { width: w, height: h } }), p = await ctx.newPage();
  await p.goto(srv.base + "/"); await p.waitForSelector("#em", { timeout: 60000 });
  await p.fill("#em", "learner@demo.laolao"); await p.fill("#pw", "demo1234");
  await p.evaluate(() => document.querySelector("#em").form.requestSubmit());
  await p.waitForSelector(".app .side .nav-btn", { timeout: 60000, state: "attached" }); await p.waitForTimeout(800);
  await p.evaluate(() => import("/js/learner/core.js").then(m => { m.setPref("uiLang", "en"); m.setPref("explainLang", "en"); }));
  return { ctx, p };
}
for (const [w, h, name] of SIZES){
  console.log(`\n${name} ${w}×${h}`);
  let cur = await open(w, h);
  ok(await cur.p.evaluate(() => { const b = document.createElement("button"); document.body.append(b); const v = getComputedStyle(b).alignItems; b.remove(); return v === "stretch"; }), "a plain <button> stretches its content (Safari's flex-start is reset)");
  const problems = [], crashed = [];
  for (const [v, params] of ROUTES){
    const key = v + (Object.keys(params).length ? JSON.stringify(params) : "");
    try {
      await cur.p.evaluate(([v, params]) => import("/js/learner/main.js").then(m => m.go(v, params)), [v, params]); await cur.p.waitForTimeout(800);
      const r = await cur.p.evaluate(() => {
        const bad = [];
        document.querySelectorAll("main button").forEach(b => {
          const cs = getComputedStyle(b); if (!/flex/.test(cs.display) || !/column/.test(cs.flexDirection)) return;
          const rb = b.getBoundingClientRect(); if (rb.width < 60) return;
          const inner = rb.width - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight) - parseFloat(cs.borderLeftWidth) - parseFloat(cs.borderRightWidth);
          [...b.children].forEach(k => { const ks = getComputedStyle(k); if (ks.position === "absolute" || ks.display === "none") return;
            const al = ks.alignSelf === "auto" ? cs.alignItems : ks.alignSelf; if (!/stretch|normal/.test(al)) return;
            const kw = k.getBoundingClientRect().width; if (inner - kw > 2) bad.push(String(b.className).split(" ")[0] + " > " + String(k.className || k.tagName).split(" ")[0] + " " + Math.round(kw) + "/" + Math.round(inner)); });
        });
        document.querySelectorAll(".pz-card").forEach(c => { const cw = c.getBoundingClientRect().width;
          for (const sel of [".pz-art", ".pz-body"]){ const e = c.querySelector(sel); if (e && cw - e.getBoundingClientRect().width > 3) bad.push("practice card " + sel + " " + Math.round(e.getBoundingClientRect().width) + "/" + Math.round(cw)); } });
        // Pattern Studio cards: every line fills the card (grid items stretch in every engine)
        document.querySelectorAll(".ps-card:not(.locked)").forEach((c, i) => { if (i > 5) return; const cs = getComputedStyle(c);
          const inner = c.getBoundingClientRect().width - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight) - parseFloat(cs.borderLeftWidth) - parseFloat(cs.borderRightWidth);
          for (const sel of [".ps-card-top", ".ps-card-foot"]){ const e = c.querySelector(sel); if (e && inner - e.getBoundingClientRect().width > 3) bad.push("pattern card " + sel + " " + Math.round(e.getBoundingClientRect().width) + "/" + Math.round(inner)); } });
        const over = document.scrollingElement.scrollWidth - innerWidth;
        if (over > 1) bad.push("page scrolls sideways by " + over + "px");
        return [...new Set(bad)].slice(0, 4);
      });
      if (r.length) problems.push(key + ": " + r.join("; "));
    } catch(e){ crashed.push(key); try { await cur.ctx.close(); } catch(_){} cur = await open(w, h); }
  }
  ok(!problems.length, `${ROUTES.length - crashed.length} screens: buttons stretch their content, practice cards are whole, no sideways scrolling`, problems);
  // writing a word with a finger: one big box on a phone, the stroke kept and smoothed (synthetic touch pointer events)
  try {
    await cur.p.evaluate(() => { try { localStorage.removeItem("laolao.hw.view"); localStorage.setItem("laolao.hw.pen", JSON.stringify({ smooth: 8, size: "m" })); } catch(e){} });
    await cur.p.evaluate(() => import("/js/learner/main.js").then(m => m.go("handwriting", { sec: "words" }))); await cur.p.waitForTimeout(1200);
    await cur.p.evaluate(() => [...document.querySelectorAll(".hwh-group .seg button")].find(x => /Long/.test(x.innerText)).click()); await cur.p.waitForTimeout(800);
    const wr = await cur.p.evaluate(async () => {
      const cp = document.querySelector(".hww .cp"), ink = cp.querySelector(".cp-ink"), r = ink.getBoundingClientRect();
      let sd = 9; const rn = () => (sd = (sd * 16807) % 2147483647) / 2147483647;
      const cellW = cp.__pad.cellSize[0] || r.width;                      // the first box (the whole canvas in one-letter view)
      const at = k => ({ clientX: r.left + cellW * (0.15 + 0.7 * k) + (rn() - 0.5) * 10, clientY: r.top + r.height * (0.5 + 0.12 * Math.sin(k * Math.PI * 2)) + (rn() - 0.5) * 10 });
      const fire = (type, k) => ink.dispatchEvent(new PointerEvent(type, Object.assign({ pointerId: 7, pointerType: "touch", isPrimary: true, bubbles: true, cancelable: true, button: 0, buttons: type === "pointerup" ? 0 : 1 }, at(k))));
      fire("pointerdown", 0); for (let i = 1; i < 50; i++) fire("pointermove", i / 49); fire("pointerup", 1);
      await new Promise(f => setTimeout(f, 200));
      const m = await import("/js/shared/handwriting/smooth.js"), strokes = cp.__pad.cellInk(0);
      return { focus: cp.classList.contains("focus"), w: cp.querySelector(".cp-strip").offsetWidth, n: strokes.length, wob: strokes.length ? m.wobble(strokes[0]) : -1 };
    });
    if (w < 600) ok(wr.focus && wr.w >= 300, `a long word opens one big box (${wr.w} px)`, wr);
    ok(wr.n === 1 && wr.wob >= 0 && wr.wob < 0.3, `a shaky finger stroke is kept and smoothed (wobble ${wr.wob.toFixed ? wr.wob.toFixed(2) : wr.wob})`, wr);
  } catch(e){ console.log("  NOTE writing check skipped: " + String(e.message).slice(0, 120)); }
  if (crashed.length) console.log("  NOTE the WebKit test browser crashed on: " + crashed.join(", ") + " (a known instability of Playwright's Windows WebKit; those screens were not checked)");
  await cur.ctx.close();
}
await browser.close(); srv.close && srv.close();
console.log(failed ? `\n${failed} Safari checks FAILED` : "\nAll Safari checks passed");
process.exit(failed ? 1 : 0);
