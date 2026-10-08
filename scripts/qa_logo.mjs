// The logo in the running app: learner and admin sidebars, the phone top bar and the welcome page, in day and night.
// Inline SVG with its part ids, round, at the size of the old seal, and the hover effect. Screenshots go to e2e-screenshots/.
// Run: node scripts/qa_logo.mjs
import path from "path";
import fs from "fs";
import { launch, sleep } from "./lib/cdp.mjs";
import { startDemoServer, ROOT } from "./lib/demo-server.mjs";

const SHOTS = path.join(ROOT, "e2e-screenshots"); fs.mkdirSync(SHOTS, { recursive: true });
const srv = await startDemoServer();
const b = await launch({ width: 1366, height: 900 });
let failed = 0;
const ok = (c, m, d) => { console.log((c ? "  PASS " : "  FAIL ") + m + (!c && d !== undefined ? "  → " + JSON.stringify(d) : "")); if (!c) failed++; };
const size = (w, hh) => b.send("Emulation.setDeviceMetricsOverride", { width: w, height: hh, deviceScaleFactor: 1, mobile: w < 900 });
const theme = async th => { await b.eval(`document.documentElement.setAttribute("data-theme", ${JSON.stringify(th)})`); await sleep(300); };
async function login(p, email){
  await b.eval(`try { localStorage.removeItem("laolao.demo.session"); localStorage.setItem("xuelu.lang","en"); localStorage.setItem("xuelu.admin.lang","en"); } catch(e){}`).catch(() => {});
  await b.goto(srv.base + p); await b.waitFor(`!!document.querySelector("#em") || !!document.querySelector(".app")`, 60000);
  await b.eval(`(() => { const e = document.querySelector("#em"), p = document.querySelector("#pw"); e.value = ${JSON.stringify(email)}; p.value = "demo1234"; (e.form || p.form).requestSubmit(); })()`);
  await b.waitFor(`!!document.querySelector(".app .side .nav-btn")`, 60000); await sleep(1200);
}
// every visible logo: inline SVG with its three parts, unique ids, square box, round
const logos = sel => b.eval(`[...document.querySelectorAll(${JSON.stringify(sel)})].filter(i => i.getClientRects().length).map(s => {
  const r = s.getBoundingClientRect(), parts = [...s.querySelectorAll("[id^=logo-circle], [id^=logo-letter-big], [id^=logo-letter-small]")].map(p => p.id);
  const ids = [...document.querySelectorAll("[id]")].map(e => e.id), dup = ids.filter((x, i) => ids.indexOf(x) !== i);
  return { tag: s.tagName.toLowerCase(), w: Math.round(r.width), h: Math.round(r.height), round: getComputedStyle(s).borderRadius, parts, dup };
})`);
const check = (name, list, px) => {
  ok(list.length > 0, name + ": logo is shown");
  ok(list.every(l => l.tag === "svg" && l.parts.length === 3 && /^logo-circle/.test(l.parts[0]) && /^logo-letter-big/.test(l.parts[1]) && /^logo-letter-small/.test(l.parts[2])),
    name + ": inline SVG with #logo-circle, #logo-letter-big, #logo-letter-small", list);
  ok(list.every(l => !l.dup.length), name + ": no duplicate ids on the page", list[0] && list[0].dup);
  ok(list.every(l => l.w === px && l.h === px && l.round === "50%"), name + `: ${px}×${px}, round`, list);
};
console.log("hover effect");
await b.goto(srv.base + "/"); await b.waitFor(`!!document.querySelector(".wl-brand svg.wl-logo")`, 60000); await sleep(600);
const SEL = ".wl-brand svg.wl-logo";
const state = () => b.eval(`(() => { const s = document.querySelector(${JSON.stringify(SEL)}), m = new DOMMatrix(getComputedStyle(s).transform);
  const sw = new DOMMatrix(getComputedStyle(s.querySelector(".lm-sweep")).transform), sm = new DOMMatrix(getComputedStyle(s.querySelector(".lm-small")).transform);
  return { hover: s.classList.contains("lm-hover"), scale: +m.a.toFixed(3), sweepX: Math.round(sw.e), smallRot: +(Math.atan2(sm.b, sm.a) * 180 / Math.PI).toFixed(1),
    clipped: !!s.querySelector(".lm-sweep").closest("[clip-path]"), anims: s.getAnimations({ subtree: true }).length }; })()`);
const rest = await state();
ok(!rest.hover && rest.anims === 0 && rest.scale === 1, "at rest: still (no animation running)", rest);
ok(rest.sweepX <= -300 && rest.clipped, "the highlight band waits outside the circle and is clipped to it", rest);
const hoverIn = async () => { const r = await b.eval(`(() => { const r = document.querySelector(${JSON.stringify(SEL)}).getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; })()`);
  await b.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: 5, y: 600 }); await b.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: r[0], y: r[1] }); };
await hoverIn(); await sleep(30);
// freeze the animations at fixed moments so a busy machine can't skew the result
const at = ms => b.eval(`document.querySelector(${JSON.stringify(SEL)}).getAnimations({ subtree: true }).forEach(a => { a.pause(); a.currentTime = ${ms}; })`);
const names = await b.eval(`document.querySelector(${JSON.stringify(SEL)}).getAnimations({ subtree: true }).map(a => a.animationName + " " + a.effect.getTiming().duration).sort()`);
ok(names.join("|") === "lmPop 700|lmSweep 700|lmWiggle 700", "pointer enter starts the pop, the sweep and the wiggle, 700 ms each", names);
await at(315); const mid = await state();
ok(mid.scale > 1.05 && mid.scale <= 1.06, "mid-way: the logo is scaled up to about 1.06", mid);
ok(mid.sweepX > 0 && mid.sweepX < 512, "mid-way: the band is crossing the circle", mid);
await at(105); const w1 = await state();
ok(Math.abs(w1.smallRot) > 5, "the small letter wiggles", w1);
await b.eval(`document.querySelector(${JSON.stringify(SEL)}).getAnimations({ subtree: true }).forEach(a => a.finish())`); await sleep(800);
const after = await state();
ok(!after.hover && after.scale === 1 && after.smallRot === 0, "after 700 ms: back to normal, ready for the next hover", after);
await b.send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] });
await b.goto(srv.base + "/"); await b.waitFor(`!!document.querySelector(${JSON.stringify(SEL)})`, 60000); await sleep(600);
await hoverIn(); await sleep(100);
const rm = await state();
ok(!rm.hover && rm.anims === 0, "reduced motion: hovering does nothing", rm);
await b.send("Emulation.setEmulatedMedia", { features: [] });

console.log("learner app");
await login("/", "learner@demo.laolao");
for (const th of ["day", "night"]){
  await theme(th);
  check(`desktop sidebar (${th})`, await logos(".side .brand svg.seal"), 38);
  await b.screenshot(path.join(SHOTS, `logo-learner-${th}.png`));
}
await size(390, 844); await sleep(800);
check("phone top bar", await logos(".topbar .mbrand svg.seal"), 28);
await b.screenshot(path.join(SHOTS, "logo-learner-phone.png"));
await size(1366, 900);

console.log("\nadmin");
await login("/admin/", "admin@demo.laolao");
for (const th of ["day", "night"]){ await theme(th); check(`admin sidebar (${th})`, await logos(".side .brand svg.seal"), 38); await b.screenshot(path.join(SHOTS, `logo-admin-${th}.png`)); }
await size(390, 844); await sleep(800);
check("admin phone top bar", await logos(".topbar .mbrand svg.seal"), 28);
await b.screenshot(path.join(SHOTS, "logo-admin-phone.png"));
await size(1366, 900);

console.log("\nwelcome page");
await b.eval(`localStorage.removeItem("laolao.demo.session")`); await b.goto(srv.base + "/"); 
await b.waitFor(`!!document.querySelector(".wl-brand svg.wl-logo")`, 60000).catch(() => {}); await sleep(1000);
check("welcome top bar", await logos(".wl-brand svg.wl-logo"), 36);
await b.screenshot(path.join(SHOTS, "logo-welcome.png"));
const icons = await b.eval(`[...document.querySelectorAll("link[rel*=icon]")].map(l => [l.rel, l.getAttribute("href")])`);
ok(icons.some(([r, f]) => r === "apple-touch-icon" && f === "apple-touch-icon.png"), "the page offers the PNG iPhone icon", icons);
const errs = b.consoleLog.filter(l => /exception|error/i.test(l) && !/favicon/i.test(l));
ok(errs.length === 0, "no JS errors", errs.slice(0, 3));

await b.close(); srv.close && srv.close();
console.log(failed ? `\n${failed} logo checks FAILED` : "\nAll logo checks passed");
process.exit(failed ? 1 : 0);
