// The admin sign-in page (js/admin/main.js renderLogin, css/admin.css "admin sign-in"): layout at phone, tablet and
// desktop sizes in English, Lao and Chinese, Day and Night; accessibility (axe-core, WCAG 2.2 AA); and the form itself
// (empty fields, wrong password, the button's loading state, signing in). Demo mode; Supabase is never contacted.
// Screenshots go to e2e-screenshots/admin-login-*.png.
// Run: node scripts/qa_admin_login.mjs   (Chrome or Edge required)
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
const SIZES = [[320, 640, "small-phone"], [360, 780, "phone"], [390, 844, "iphone"], [768, 1024, "tablet"], [1024, 768, "tablet-land"], [1366, 900, "laptop"], [1920, 1080, "desktop"]];

async function openLogin(lang, theme){
  await b.eval(`try { localStorage.removeItem("laolao.demo.session"); localStorage.setItem("xuelu.admin.lang", ${J(lang)}); localStorage.setItem("laolao_theme", ${J(theme)}); } catch(e){}`).catch(() => {});
  await b.goto(srv.base + "/admin/?r=" + Math.random().toString(36).slice(2)); await b.waitFor(`!!document.querySelector(".aa-card #em")`, 60000); await sleep(1100);
}
const layout = () => b.eval(`(() => {
  const bad = [], vw = innerWidth, card = document.querySelector(".aa-card").getBoundingClientRect();
  if (document.documentElement.scrollWidth > vw + 1) bad.push("page scrolls sideways");
  if (card.left < 8 || card.right > vw - 8) bad.push("card touches the screen edge");
  for (const el of document.querySelectorAll(".aa-card input, .aa-submit, .aa-eye, .aa-back, .aa-link, .aa-card .langsw button")){
    const r = el.getBoundingClientRect(); if (r.height < 24 || r.width < 24) bad.push((el.id || el.className || el.tagName) + " is " + Math.round(r.width) + "x" + Math.round(r.height));
    if (r.right > card.right + 1) bad.push((el.id || el.className) + " sticks out of the card"); }
  for (const el of document.querySelectorAll(".aa-feats li, .aa-title, .aa-sub")){ const r = el.getBoundingClientRect(); if (r.right > vw + 1 || r.left < -1) bad.push(el.className + " off screen"); }
  const ins = document.querySelectorAll(".aa-input .input"); for (const i of ins) if (i.getBoundingClientRect().height < 44) bad.push("input under 44px");
  return bad; })()`);

try {
  console.log("\nlayout");
  for (const lang of ["en", "lo", "zh"]) for (const theme of ["day", "night"]){
    await openLogin(lang, theme);
    for (const [w, hgt, name] of SIZES){
      await b.send("Emulation.setDeviceMetricsOverride", { width: w, height: hgt, deviceScaleFactor: 1, mobile: w < 900 }); await sleep(250);
      const bad = await layout();
      ok(!bad.length, `${lang} ${theme} ${name} ${w}px`, bad.join("; "));
      if (lang !== "zh" && (theme === "day" || ["phone", "laptop"].includes(name))){
        const full = await b.eval(`Math.ceil(document.documentElement.scrollHeight)`);
        await b.send("Emulation.setDeviceMetricsOverride", { width: w, height: Math.max(hgt, Math.min(full, 4000)), deviceScaleFactor: 1, mobile: w < 900 }); await sleep(250);
        await b.screenshot(path.join(SHOTS, `admin-login-${lang}-${theme}-${name}.png`));
      }
    }
  }

  console.log("\naccessibility");
  for (const [w, theme] of [[360, "day"], [360, "night"], [1366, "day"], [1366, "night"]]){
    await b.send("Emulation.setDeviceMetricsOverride", { width: w, height: 900, deviceScaleFactor: 1, mobile: w < 900 });
    await b.send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] });   // animations finished, so colours are final
    await openLogin("en", theme);
    await b.eval(AXE + ";true");
    const res = await b.eval(`(async () => { const r = await axe.run(document, { runOnly: { type: "tag", values: ["wcag2a","wcag2aa","wcag21a","wcag21aa","wcag22aa"] }, resultTypes: ["violations"] });
      return r.violations.map(v => v.id + "×" + v.nodes.length + " [" + v.nodes.slice(0, 3).map(n => n.target.join(" ")).join(" | ") + "]"); })()`);
    ok(!res.length, `axe WCAG 2.2 AA ${w}px ${theme}`, res.join(" ;; ").slice(0, 700));
  }
  await b.send("Emulation.setEmulatedMedia", { features: [] });

  console.log("\nthe form");
  await b.send("Emulation.setDeviceMetricsOverride", { width: 360, height: 780, deviceScaleFactor: 1, mobile: true });
  await openLogin("en", "day");
  await b.eval(`document.querySelector(".aa-submit").click()`); await sleep(400);
  ok(/Enter your email and password/.test(await b.eval(`document.querySelector(".aa-msg").textContent`)), "empty fields show a clear message");
  await b.eval(`(() => { const e = document.querySelector("#em"), p = document.querySelector("#pw"); e.value = "admin@demo.laolao"; p.value = "wrong-password"; document.querySelector(".aa-submit").click(); })()`);
  await sleep(1200);
  ok(/wrong email or password/i.test(await b.eval(`document.querySelector(".aa-msg").textContent`)) && !(await b.eval(`document.querySelector(".aa-submit").disabled`)), "a wrong password shows the error and the button works again");
  await b.screenshot(path.join(SHOTS, "admin-login-error-phone.png"));
  await b.eval(`document.querySelector(".aa-eye").click()`); await sleep(150);
  ok(await b.eval(`document.querySelector("#pw").type === "text" && document.querySelector(".aa-eye").getAttribute("aria-pressed") === "true"`), "the eye button shows the password");
  await b.eval(`(() => { const p = document.querySelector("#pw"); p.value = "demo1234"; document.querySelector(".aa-submit").click(); })()`);
  await sleep(60);
  const busy = await b.eval(`document.querySelector(".aa-submit") ? document.querySelector(".aa-submit").classList.contains("busy") : true`);
  await b.waitFor(`!!document.querySelector(".app .side .nav-btn")`, 60000);
  ok(busy, "the button shows a loading spinner while signing in");
  ok(true, "the right password opens the admin panel");
  await b.eval(`(() => { try { localStorage.removeItem("laolao.demo.session"); } catch(e){} })()`);
  await openLogin("en", "day");
  await b.eval(`document.querySelector(".aa-demo-btn").click()`);
  await b.waitFor(`!!document.querySelector(".app .side .nav-btn")`, 60000);
  ok(true, "the demo one-click Super Admin button signs in");

  const errs = b.consoleLog.filter(l => /^exception|^error/.test(l) && !/favicon|net::ERR|Failed to load resource|youtube/i.test(l));
  ok(!errs.length, "no JS errors" + (errs.length ? ": " + errs.slice(0, 3).join(" | ") : ""));
} catch (e){ console.log("  FAIL crashed: " + (e.stack || e)); failed++; await b.screenshot(path.join(SHOTS, "fail-admin-login-crash.png")).catch(() => {}); }
finally { await b.close(); srv.close && srv.close(); }
console.log(failed ? `\n${failed} admin sign-in checks FAILED` : "\nAll admin sign-in checks passed");
process.exit(failed ? 1 : 0);
