// One design across the learner app and the admin: visits EVERY sidebar menu of both apps (learner: Premium learner;
// admin: Super Admin) in Day and Night, at desktop and phone width, and checks on each page:
//   - no stray "null" / "undefined" / "NaN" / "[object Object]" text
//   - no sideways page scroll
//   - text contrast (axe-core color-contrast, WCAG AA)
//   - no JS errors
// Then compares the computed design of both apps (fonts, sidebar, active menu item, buttons, cards, titles, top bar):
// they must be identical, so the two apps look like the work of one designer. Demo mode; Supabase is never contacted.
// Run: node scripts/qa_design.mjs   (Chrome or Edge required). Screenshots: e2e-screenshots/design-*.png
import fs from "fs";
import path from "path";
import { launch, sleep } from "./lib/cdp.mjs";
import { startDemoServer, ROOT } from "./lib/demo-server.mjs";

const SHOTS = path.join(ROOT, "e2e-screenshots");
fs.mkdirSync(SHOTS, { recursive: true });
const AXE = fs.readFileSync(path.join(ROOT, "node_modules", "axe-core", "axe.min.js"), "utf8");
const srv = await startDemoServer();
const b = await launch({ width: 1366, height: 900 });
let failed = 0;
const ok = (c, m, detail) => { console.log((c ? "  PASS " : "  FAIL ") + m + (!c && detail ? "\n       " + detail : "")); if (!c) failed++; };
const J = JSON.stringify;
const size = (w, hgt) => b.send("Emulation.setDeviceMetricsOverride", { width: w, height: hgt, deviceScaleFactor: 1, mobile: w < 900 });

async function login(p, email){
  await b.eval(`try { localStorage.removeItem("laolao.demo.session"); localStorage.setItem("xuelu.lang","en"); localStorage.setItem("xuelu.admin.lang","en"); } catch(e){}`).catch(() => {});
  await b.goto(srv.base + p); await b.waitFor(`!!document.querySelector("#em") || !!document.querySelector(".app")`, 60000);
  await b.eval(`(() => { const e = document.querySelector("#em"), p = document.querySelector("#pw"); e.value = ${J(email)}; p.value = "demo1234"; (e.form || p.form).requestSubmit(); })()`);
  await b.waitFor(`!!document.querySelector(".app .side .nav-btn")`, 60000); await sleep(900);
  // both apps in English, so fonts and labels are compared like for like
  if (await b.eval(`(() => { const e = [...document.querySelectorAll(".topbar .langsw button")].find(x => x.textContent.trim() === "EN"); if (e && e.getAttribute("aria-pressed") !== "true"){ e.click(); return true; } return false; })()`)){
    await sleep(800); await b.waitFor(`!!document.querySelector(".app .side .nav-btn")`, 30000); await sleep(500); }
}
const settle = async () => { await b.waitFor(`!!document.querySelector("main") && document.querySelector("main").children.length > 0`, 15000).catch(() => {}); await sleep(900); };
const pageName = () => b.eval(`(() => { const a = document.querySelector('.side .nav-btn[aria-current="page"]'); return (a ? a.innerText.trim() : location.hash || "page").replace(/\\s+/g, " ").slice(0, 40); })()`);

// visible stray text and sideways scroll
const pageChecks = () => b.eval(`(() => {
  const bad = [], w = document.createTreeWalker(document.querySelector(".app") || document.body, NodeFilter.SHOW_TEXT);
  while (w.nextNode()){ const n = w.currentNode, v = n.nodeValue.trim(); if (!/^(null|undefined|NaN|\\[object Object\\])$/.test(v) && !/\\b(undefined|\\[object Object\\])\\b/.test(v)) continue;
    const el = n.parentElement; if (!el || el.closest("script,style,textarea,code,pre,.mono") || !el.getClientRects().length) continue; bad.push(JSON.stringify(v.slice(0, 40)) + " in <" + el.tagName.toLowerCase() + (el.className ? "." + String(el.className).split(" ")[0] : "") + ">"); }
  if (document.documentElement.scrollWidth > innerWidth + 1) bad.push("page scrolls sideways (" + document.documentElement.scrollWidth + " > " + innerWidth + ")");
  return bad.slice(0, 5); })()`);
async function contrast(){
  if (!(await b.eval(`!!window.axe`))) await b.eval(AXE + ";true");
  return b.eval(`(async () => { const r = await axe.run(document, { runOnly: { type: "rule", values: ["color-contrast"] }, resultTypes: ["violations"] });
    return r.violations.flatMap(v => v.nodes.slice(0, 4).map(n => n.target.join(" ") + " :: " + ((n.any[0] || {}).message || "").replace(/\\s+/g, " ").slice(0, 110))); })()`);
}
// the computed look of shared components (compared between the apps)
const looks = () => b.eval(`(() => {
  // probes: the shared components measured in each app's own page (removed again right after)
  const main = document.querySelector("main"), probe = document.createElement("div"); probe.className = "qa-probe";
  probe.innerHTML = '<div class="pagehead"><h1>Title</h1></div><div class="card qa-card">x</div><button class="btn primary qa-btn">Go</button><button class="btn qa-btn2">Go</button><span class="chip qa-chip">x</span><input class="input qa-input">';
  main.append(probe);
  const cs = (sel, props) => { const e = document.querySelector(sel); if (!e) return null; const s = getComputedStyle(e); return Object.fromEntries(props.map(p => [p, s.getPropertyValue(p)])); };
  return {
    body: cs("body", ["font-family", "background-color", "color"]),
    sidebar: cs(".side", ["background-color", "border-right-color"]),
    navItem: cs('.side .nav-btn:not([aria-current="page"])', ["color", "font-weight", "border-radius", "font-size"]),
    navActive: cs('.side .nav-btn[aria-current="page"]', ["color", "font-weight"]),
    navIndicator: cs('.side .nav-btn[aria-current="page"] .nav-ind', ["background-color", "border-radius"]),
    topbar: cs(".topbar", ["background-color", "border-bottom-color"]),
    profileChip: cs(".pchip", ["border-radius", "background-color"]),
    brandSeal: cs(".brand .seal", ["background-image", "border-radius"]),
    title: cs(".qa-probe .pagehead h1", ["font-family", "font-weight", "font-size", "color"]),
    card: cs(".qa-card", ["border-radius", "border-top-color", "background-color", "box-shadow", "padding-top"]),
    primaryButton: cs(".qa-btn", ["background-image", "color", "border-radius", "font-weight", "min-height"]),
    button: cs(".qa-btn2", ["background-color", "color", "border-top-color", "border-radius", "font-weight"]),
    chip: cs(".qa-chip", ["background-color", "color", "border-radius", "font-weight"]),
    input: cs(".qa-input", ["background-color", "border-top-color", "border-radius", "font-size"]),
    __: probe.remove(),
  }; })()`);

async function sweep(app){
  const n = await b.eval(`document.querySelectorAll(".side .nav-btn").length`);
  console.log(`\n${app}: ${n} menus`);
  let contrastFails = 0;
  for (let i = 0; i < n; i++){
    await size(1366, 900);
    const clicked = await b.eval(`(() => { const el = document.querySelectorAll(".side .nav-btn")[${i}]; if (!el || el.tagName === "A") return false; el.click(); return true; })()`);
    if (!clicked) continue;
    await settle();
    const name = await pageName();
    for (const theme of ["day", "night"]){
      await b.eval(`document.documentElement.setAttribute("data-theme", ${J(theme)})`); await sleep(250);
      const probs = await pageChecks();
      const cc = await contrast();
      if (cc.length) contrastFails++;
      ok(!probs.length && !cc.length, `${app} · ${name} · ${theme} · desktop`, [...probs, ...cc.map(x => "contrast: " + x)].join("\n       "));
      if (theme === "day" && i % 4 === 0) await b.screenshot(path.join(SHOTS, `design-${app}-${String(i).padStart(2, "0")}-${theme}.png`));
    }
    await b.eval(`document.documentElement.setAttribute("data-theme", "day")`);
    await size(390, 844); await sleep(450);
    const phone = await pageChecks();
    ok(!phone.length, `${app} · ${name} · phone 390px`, phone.join("; "));
  }
  await size(1366, 900);
}

try {
  await login("/", "learner@demo.laolao");
  await sweep("learner");
  await login("/admin/", "admin@demo.laolao");
  await b.eval(`(() => { const el = [...document.querySelectorAll(".side .nav-btn")].find(e => /Dashboard/.test(e.innerText)); el && el.click(); })()`); await settle();
  await sweep("admin");

  console.log("\nsame design in both apps");
  for (const theme of ["day", "night"]){
    const both = {};
    for (const [app, p, email] of [["learner", "/", "learner@demo.laolao"], ["admin", "/admin/", "admin@demo.laolao"]]){
      await b.eval(`try { localStorage.setItem("laolao_theme", ${J(theme)}); } catch(e){}`);
      await login(p, email);
      await settle();
      both[app] = await looks(); delete both[app].__;
    }
    for (const part of Object.keys(both.learner)){
      const L = both.learner[part], A = both.admin[part];
      if (!L || !A){ ok(false, `${theme}: ${part} exists in both apps`, `learner ${!!L}, admin ${!!A}`); continue; }
      const diff = Object.keys(L).filter(k => L[k] !== A[k]).map(k => `${k}: learner ${L[k]} | admin ${A[k]}`);
      ok(!diff.length, `${theme}: ${part} looks the same`, diff.join("\n       "));
    }
    ok(/Bricolage/.test(both.admin.title["font-family"]) && /Bricolage/.test(both.learner.title["font-family"]), `${theme}: page titles use the display face in both apps`);
  }
  await b.eval(`try { localStorage.setItem("laolao_theme", "day"); } catch(e){}`);

  const errs = b.consoleLog.filter(l => /^exception|^error/.test(l) && !/favicon|net::ERR|Failed to load resource|youtube|ytimg|googlevideo/i.test(l));
  ok(!errs.length, "no JS errors on any page" + (errs.length ? ": " + errs.slice(0, 3).join(" | ") : ""));
} catch (e){ console.log("  FAIL crashed: " + (e.stack || e)); failed++; await b.screenshot(path.join(SHOTS, "fail-design-crash.png")).catch(() => {}); }
finally { await b.close(); srv.close && srv.close(); }
console.log(failed ? `\n${failed} design checks FAILED` : "\nAll design checks passed");
process.exit(failed ? 1 : 0);
