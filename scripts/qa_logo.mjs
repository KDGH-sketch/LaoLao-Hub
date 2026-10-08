// The logo in the running app: learner and admin sidebars, the phone top bar and the welcome page, in day and night.
// It must load (not a broken image), keep its round shape, and sit at the size of the old seal. Screenshots go to e2e-screenshots/.
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
  const r = s.getBoundingClientRect(), parts = [...s.querySelectorAll(".lm-part")].map(p => p.id);
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
// fill and outline of each part right now
const look = sel => b.eval(`[...document.querySelector(${JSON.stringify(sel)}).querySelectorAll(".lm-part")].map(p => { const c = getComputedStyle(p);
  return { fill: +c.fillOpacity, stroke: c.stroke === "none" ? 0 : +c.strokeOpacity, dash: parseFloat(c.strokeDashoffset) || 0 }; })`);

console.log("animation");
await b.goto(srv.base + "/"); await b.waitFor(`!!document.querySelector(".wl-brand svg")`, 60000);
const start = await b.eval(`(() => { const s = document.querySelector(".wl-brand svg"); return { anim: s.classList.contains("lm-anim"), names: getComputedStyle(s.querySelector(".lm-big")).animationName, delays: [...s.querySelectorAll(".lm-part")].map(p => getComputedStyle(p).animationDelay) }; })()`);
ok(start.anim && /lmDraw/.test(start.names) && /lmFill/.test(start.names), "the logo draws itself on load", start);
ok(start.delays.map(d => d.split(",")[0].trim()).join(" ") === "0s 0.3s 0.6s", "outlines start 300 ms apart", start.delays);
// look at fixed moments of the animation (paused), so a slow machine can't skew the result
const at = ms => b.eval(`document.querySelector(".wl-brand svg").getAnimations({ subtree: true }).forEach(a => { a.pause(); a.currentTime = ${ms}; })`);
await at(250);
const early = await look(".wl-brand svg");
ok(early.every(p => p.fill < 0.05) && early[0].stroke > 0.5 && early[0].dash > 0, "at the start: outlines drawing, no fill yet", early);
await at(2300);
const end = await look(".wl-brand svg");
ok(end.every(p => p.fill > 0.99 && p.stroke < 0.01), "after about 2.3 s: filled, outlines gone", end);
await b.screenshot(path.join(SHOTS, "logo-anim-end.png"));
await b.send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] });
await b.goto(srv.base + "/"); await b.waitFor(`!!document.querySelector(".wl-brand svg")`, 60000); await sleep(100);
const rm = await b.eval(`(() => { const s = document.querySelector(".wl-brand svg"), p = s.querySelector(".lm-big"), c = getComputedStyle(p); return { anim: s.classList.contains("lm-anim"), name: c.animationName, fill: +c.fillOpacity, stroke: c.stroke }; })()`);
ok(!rm.anim && rm.name === "none" && rm.fill === 1 && rm.stroke === "none", "reduced motion: no animation, finished logo straight away", rm);
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
