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
// every visible logo: loaded, round, square box
const logos = sel => b.eval(`Promise.all([...document.querySelectorAll(${JSON.stringify(sel)})].filter(i => i.getClientRects().length).map(async i => {
  try { await i.decode(); } catch(e){}
  const r = i.getBoundingClientRect(), cs = getComputedStyle(i);
  return { w: Math.round(r.width), h: Math.round(r.height), loaded: i.complete && i.naturalWidth > 0, round: cs.borderRadius, src: i.currentSrc.split("/").pop() };
}))`);
const check = (name, list, px) => {
  ok(list.length > 0, name + ": logo is shown");
  ok(list.every(l => l.loaded && l.src === "logo-mark.svg"), name + ": logo-mark.svg loads", list);
  ok(list.every(l => l.w === px && l.h === px && l.round === "50%"), name + `: ${px}×${px}, round`, list);
};

console.log("learner app");
await login("/", "learner@demo.laolao");
for (const th of ["day", "night"]){
  await theme(th);
  check(`desktop sidebar (${th})`, await logos(".side .brand img.seal"), 38);
  await b.screenshot(path.join(SHOTS, `logo-learner-${th}.png`));
}
await size(390, 844); await sleep(800);
check("phone top bar", await logos(".topbar .mbrand img.seal"), 28);
await b.screenshot(path.join(SHOTS, "logo-learner-phone.png"));
await size(1366, 900);

console.log("\nadmin");
await login("/admin/", "admin@demo.laolao");
for (const th of ["day", "night"]){ await theme(th); check(`admin sidebar (${th})`, await logos(".side .brand img.seal"), 38); await b.screenshot(path.join(SHOTS, `logo-admin-${th}.png`)); }
await size(390, 844); await sleep(800);
check("admin phone top bar", await logos(".topbar .mbrand img.seal"), 28);
await b.screenshot(path.join(SHOTS, "logo-admin-phone.png"));
await size(1366, 900);

console.log("\nwelcome page");
await b.eval(`localStorage.removeItem("laolao.demo.session")`); await b.goto(srv.base + "/"); 
await b.waitFor(`!!document.querySelector(".wl-brand img")`, 60000).catch(() => {}); await sleep(1000);
check("welcome top bar", await logos(".wl-brand img.wl-logo"), 36);
await b.screenshot(path.join(SHOTS, "logo-welcome.png"));
const icons = await b.eval(`[...document.querySelectorAll("link[rel*=icon]")].map(l => [l.rel, l.getAttribute("href")])`);
ok(icons.some(([r, f]) => r === "apple-touch-icon" && f === "apple-touch-icon.png"), "the page offers the PNG iPhone icon", icons);
const errs = b.consoleLog.filter(l => /exception|error/i.test(l) && !/favicon/i.test(l));
ok(errs.length === 0, "no JS errors", errs.slice(0, 3));

await b.close(); srv.close && srv.close();
console.log(failed ? `\n${failed} logo checks FAILED` : "\nAll logo checks passed");
process.exit(failed ? 1 : 0);
