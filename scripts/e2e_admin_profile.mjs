// Admin top bar: the profile button and menu (same as the learner app), at phone, tablet and desktop sizes, and the
// loading screen (the learner app's Lao loading screen, so switching from the learner app to the admin looks the same).
// Demo mode; Supabase is never contacted. Screenshots go to e2e-screenshots/admin-top-*.png.
// Run: node scripts/e2e_admin_profile.mjs   (Chrome or Edge required)
import fs from "fs";
import path from "path";
import { launch, sleep } from "./lib/cdp.mjs";
import { startDemoServer, ROOT } from "./lib/demo-server.mjs";

const SHOTS = path.join(ROOT, "e2e-screenshots");
fs.mkdirSync(SHOTS, { recursive: true });
const srv = await startDemoServer();
const b = await launch({ width: 1366, height: 900 });
let failed = 0;
const ok = async (c, m) => { console.log((c ? "  PASS " : "  FAIL ") + m); if (!c){ failed++; await b.screenshot(path.join(SHOTS, "fail-admintop-" + m.replace(/[^\w.-]+/g, "_").slice(0, 90) + ".png")).catch(() => {}); } };
const J = JSON.stringify;
const click = (sel, re) => b.eval(`(() => { const el = [...document.querySelectorAll(${J(sel)})].reverse().find(e => ${re}.test((e.innerText || e.textContent || "").trim()) || ${re}.test(e.getAttribute("aria-label") || "")); if (el){ el.click(); } return !!el; })()`);
const size = async (w, hgt) => { await b.send("Emulation.setDeviceMetricsOverride", { width: w, height: hgt, deviceScaleFactor: 1, mobile: w < 900 }); await sleep(500); };
const visible = sel => b.eval(`(() => { const e = document.querySelector(${J(sel)}); if (!e) return false; const r = e.getBoundingClientRect(), s = getComputedStyle(e); return r.width > 0 && r.height > 0 && s.visibility !== "hidden" && s.display !== "none"; })()`);
const menuOpen = () => b.eval(`!!document.querySelector(".pmenu:not(.out)")`);

try {
  console.log("\nloading screen");
  const html = await (await fetch(srv.base + "/admin/index.html")).text();
  await ok(/class="waiting-screen"/.test(html) && /class="mekong-stream"/.test(html) && /lao-sabaidee/.test(html) && !/>Loading…</.test(html), "the admin page starts with the learner app's loading screen");
  const learnerHtml = await (await fetch(srv.base + "/index.html")).text();
  const shape = s => (s.match(/class="[^"]+"/g) || []).filter(c => /waiting|champa|mekong|lao-sabaidee|float/.test(c)).join(" ");
  await ok(shape(html.slice(html.indexOf('<div id="root">'))).startsWith(shape(learnerHtml.slice(learnerHtml.indexOf('<div id="root">'))).slice(0, 200)), "same loading screen markup as the learner app");

  // sign in (demo admin) and watch the admin boot: the loading screen shows until the panel is ready
  await b.goto(srv.base + "/admin/"); await b.waitFor(`!!document.querySelector("#em") || !!document.querySelector(".app")`, 60000);
  await b.eval(`(() => { const e = document.querySelector("#em"), p = document.querySelector("#pw"); e.value = "admin@demo.laolao"; p.value = "demo1234"; (e.form || p.form).requestSubmit(); })()`);
  await b.waitFor(`!!document.querySelector(".app .side .nav-btn")`, 60000); await sleep(600);
  await b.send("Page.navigate", { url: srv.base + "/admin/?boot=1" });
  let sawLoading = false;
  for (let i = 0; i < 80 && !sawLoading; i++){ sawLoading = await b.eval(`!!document.querySelector(".waiting-screen .champa-wrap")`).catch(() => false); if (!sawLoading) await sleep(25); }
  await ok(sawLoading, "reloading the admin shows the Lao loading screen");
  await b.waitFor(`!!document.querySelector(".app .side .nav-btn")`, 60000); await sleep(800);
  await ok(!(await b.eval(`!!document.querySelector(".waiting-screen")`)), "the loading screen is gone once the panel is ready");

  console.log("\ntop bar at every size");
  for (const [w, hgt, name] of [[320, 640, "small-phone"], [360, 780, "phone"], [390, 844, "iphone"], [768, 1024, "tablet"], [1024, 768, "tablet-land"], [1366, 900, "laptop"]]){
    await size(w, hgt);
    const m = await b.eval(`(() => { const t = document.querySelector(".topbar"), r = t.getBoundingClientRect(), c = document.querySelector(".pchip").getBoundingClientRect();
      return { h: r.height, chip: c.width > 0 && c.right <= innerWidth && c.left >= 0, scroll: document.documentElement.scrollWidth <= innerWidth,
        overflow: [...t.children].some(e => { const x = e.getBoundingClientRect(); return x.width && (x.right > innerWidth + 1 || x.left < -1); }) }; })()`);
    const phone = w <= 900;
    await ok(m.chip && m.scroll && !m.overflow && m.h <= 72, `${name} ${w}px: profile button visible, top bar in one row (${Math.round(m.h)}px), no sideways scroll`);
    if (phone) await ok(!(await visible(".adm-tools")), `${name}: theme / language / preview moved into the profile menu`);
    else await ok(await visible(".topbar .langsw") && !(await visible(".topbar .themesw")), `${name}: language switch in the top bar, theme in the profile menu (like the learner app)`);
    await b.screenshot(path.join(SHOTS, `admin-top-${name}.png`));
  }

  console.log("\nprofile menu on a phone");
  await size(360, 780);
  await b.eval(`document.querySelector(".pchip").click()`); await sleep(500);
  await ok(await menuOpen(), "the profile button opens the menu");
  await ok(await b.eval(`/admin@demo.laolao/.test(document.querySelector(".pmenu").innerText) && !!document.querySelector(".pmenu .av")`), "menu shows the picture, name and email");
  await ok(await b.eval(`(() => { const r = document.querySelector(".pmenu").getBoundingClientRect(); return r.bottom >= innerHeight - 2 && r.left <= 1 && r.right >= innerWidth - 1; })()`), "on phones it is a bottom sheet");
  await ok(await b.eval(`[...document.querySelectorAll(".pmenu .pmenu-seg button")].some(x => x.textContent === "ລາວ")`), "the language switch is in the menu");
  await ok(await b.eval(`!!document.querySelector(".pmenu .adm-preview select")`), "role preview is in the menu for the Super Admin");
  await ok(await b.eval(`[...document.querySelectorAll(".pmenu .pmenu-link")].some(a => a.getAttribute("href") === "../")`) && await b.eval(`!!document.querySelector(".pmenu .pmenu-logout")`), "links to the learner app and a sign-out button");
  await b.screenshot(path.join(SHOTS, "admin-top-menu-phone-day.png"));
  await click(".pmenu .pmenu-seg button", /^ລາວ$/); await sleep(900);
  await ok(!(await menuOpen()) && /ພາບລວມ|ຜູ້ຮຽນ/.test(await b.eval(`document.querySelector(".side").innerText`)), "switching to Lao from the menu changes the admin panel to Lao");
  await b.eval(`document.querySelector(".pchip").click()`); await sleep(500);
  await click(".pmenu .pmenu-seg button", /^EN$/); await sleep(900);
  await ok(/Learners/.test(await b.eval(`document.querySelector(".side").innerText`)), "and back to English");
  await b.eval(`document.querySelector(".pchip").click()`); await sleep(500);
  await b.eval(`document.querySelector('.pmenu .pmenu-seg button[aria-label="Dark"]').click()`); await sleep(700);
  await ok(await b.eval(`document.documentElement.getAttribute("data-theme")`) === "night", "Dark from the menu switches the theme");
  await b.screenshot(path.join(SHOTS, "admin-top-menu-phone-night.png"));
  await b.eval(`document.querySelector('.pmenu .pmenu-seg button[aria-label="Light"]').click()`); await sleep(700);
  await ok(await b.eval(`document.documentElement.getAttribute("data-theme")`) === "day", "Light switches back");
  await b.eval(`document.querySelector(".pmenu-scrim").click()`); await sleep(400);
  await ok(!(await menuOpen()), "tapping outside closes the menu");

  console.log("\nsign out");
  await b.eval(`document.querySelector(".pchip").click()`); await sleep(500);
  await b.eval(`document.querySelector(".pmenu .pmenu-logout").click()`); await sleep(500);
  await ok(await b.eval(`!!document.querySelector(".dialog:not(.out)")`), "sign out asks for confirmation");
  await click(".dialog-f button", /^Cancel$/); await sleep(500);
  await ok(await b.eval(`!!document.querySelector(".app")`), "Cancel keeps the admin signed in");
  await b.eval(`document.querySelector(".pchip").click()`); await sleep(500);
  await b.eval(`document.querySelector(".pmenu .pmenu-logout").click()`); await sleep(500);
  await click(".dialog-f button", /^Sign out$/); await sleep(1500);
  await ok(await b.eval(`!!document.querySelector("#em") && !document.querySelector(".app")`), "confirming signs out to the sign-in screen");

  console.log("\nlearner app → admin: same loading screen");
  await size(1366, 900);
  await b.goto(srv.base + "/"); await b.waitFor(`!!document.querySelector("#em") || !!document.querySelector(".app")`, 60000);
  await b.eval(`(() => { const e = document.querySelector("#em"), p = document.querySelector("#pw"); e.value = "admin@demo.laolao"; p.value = "demo1234"; (e.form || p.form).requestSubmit(); })()`);
  await b.waitFor(`!!document.querySelector(".app")`, 60000); await sleep(600);
  await b.eval(`document.querySelector('.side a[href="admin/"]').click()`);
  sawLoading = false;
  for (let i = 0; i < 120 && !sawLoading; i++){ sawLoading = await b.eval(`location.pathname.includes("/admin/") && !!document.querySelector(".waiting-screen .champa-wrap")`).catch(() => false); if (!sawLoading) await sleep(25); }
  await ok(sawLoading, "opening the admin from the learner app shows the same Lao loading screen");
  await b.waitFor(`!!document.querySelector(".app .side .nav-btn")`, 60000);
  await ok(true, "the admin panel opens");

  const errs = b.consoleLog.filter(l => /^exception|^error/.test(l) && !/favicon|net::ERR|Failed to load resource|youtube/i.test(l));
  await ok(!errs.length, "no JS errors" + (errs.length ? ": " + errs.slice(0, 3).join(" | ") : ""));
} catch (e){ console.log("  FAIL crashed: " + (e.stack || e)); failed++; await b.screenshot(path.join(SHOTS, "fail-admintop-crash.png")).catch(() => {}); }
finally { await b.close(); srv.close && srv.close(); }
console.log(failed ? `\n${failed} admin top bar checks FAILED` : "\nAll admin top bar checks passed");
process.exit(failed ? 1 : 0);
