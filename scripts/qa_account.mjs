// Layout check of the learner Account page (profile, name, nickname, settings) at phone, tablet and desktop sizes,
// in English and Lao. Fails when a settings label is squeezed into a narrow column, a control sticks out of its card,
// a label and its control overlap, or the page scrolls sideways. Screenshots go to e2e-screenshots/account-*.png.
// Run: node scripts/qa_account.mjs   (Chrome or Edge required; demo mode, Supabase is never contacted)
import fs from "fs";
import path from "path";
import { launch, sleep } from "./lib/cdp.mjs";
import { startDemoServer, ROOT } from "./lib/demo-server.mjs";

const SHOTS = path.join(ROOT, "e2e-screenshots");
fs.mkdirSync(SHOTS, { recursive: true });
const SIZES = [[320, 640, "small-phone"], [360, 780, "phone"], [390, 844, "iphone"], [430, 932, "large-phone"], [768, 1024, "tablet"], [1024, 768, "tablet-land"], [1366, 900, "laptop"], [1920, 1080, "desktop"]];
const srv = await startDemoServer();
const b = await launch({ width: 1366, height: 900 });
let failed = 0;
const ok = (c, m) => { console.log((c ? "  PASS " : "  FAIL ") + m); if (!c) failed++; };

const measure = `(() => {
  const out = [], vw = document.documentElement.clientWidth;
  for (const r of document.querySelectorAll("main .set-row")){
    const lab = r.firstElementChild, ctl = r.children[1], card = r.closest(".card").getBoundingClientRect();
    const lr = lab.getBoundingClientRect(), name = (lab.querySelector("label")||lab).textContent.trim();
    const p = lab.querySelector("p"), lh = p ? parseFloat(getComputedStyle(p).lineHeight) || 20 : 0;
    const bad = [];
    if (lr.width < Math.min(150, card.width - 40)) bad.push("label column only " + Math.round(lr.width) + "px");
    if (p && p.getBoundingClientRect().height > lh * 4.5) bad.push("description wraps to " + Math.round(p.getBoundingClientRect().height / lh) + " lines");
    if (ctl){ const cr = ctl.getBoundingClientRect();
      if (cr.right > card.right - 8 || cr.left < card.left + 8) bad.push("control outside the card");
      const side = cr.top < lr.bottom - 2 && cr.bottom > lr.top + 2;
      if (side && cr.left < lr.right - 1) bad.push("label and control overlap"); }
    if (bad.length) out.push(name + ": " + bad.join(", "));
  }
  if (document.documentElement.scrollWidth > vw + 1) out.push("page scrolls sideways (" + document.documentElement.scrollWidth + " > " + vw + ")");
  return out;
})()`;

try {
  await b.goto(srv.base + "/"); await b.waitFor(`!!document.querySelector("#em") || !!document.querySelector(".app")`, 60000);
  await b.eval(`(() => { const e = document.querySelector("#em"), p = document.querySelector("#pw"); e.value = "free@demo.laolao"; p.value = "demo1234"; (e.form || p.form).requestSubmit(); })()`);
  await b.waitFor(`!!document.querySelector(".app")`, 30000);
  for (const lang of ["en", "lo"]){
    await b.eval(`try { localStorage.setItem("xuelu.lang", ${JSON.stringify(lang)}); } catch(e){}`);
    for (const [w, h, name] of SIZES){
      await b.send("Emulation.setDeviceMetricsOverride", { width: w, height: h, deviceScaleFactor: 1, mobile: w < 900 });
      await b.goto(srv.base + "/?qa=" + lang + w + "#account"); await b.waitFor(`!!document.querySelector("main .set-row")`, 30000); await sleep(700);
      if (lang === "lo") await b.eval(`(() => { const btn = [...document.querySelectorAll("main .set-row .seg button")].find(x => x.textContent === "ລາວ"); if (btn && btn.getAttribute("aria-pressed") !== "true") btn.click(); })()`), await sleep(700);
      const probs = await b.eval(measure);
      ok(!probs.length, `${lang} ${name} ${w}x${h}` + (probs.length ? ": " + probs.join("; ") : ""));
      if (lang === "en" || probs.length){
        const full = await b.eval(`Math.ceil(document.documentElement.scrollHeight)`);
        await b.send("Emulation.setDeviceMetricsOverride", { width: w, height: Math.min(full, 6000), deviceScaleFactor: 1, mobile: w < 900 }); await sleep(300);
        await b.screenshot(path.join(SHOTS, `account-${lang}-${name}.png`));
      }
    }
  }
  await b.eval(`try { localStorage.setItem("xuelu.lang", "en"); } catch(e){}`);
  const errs = b.consoleLog.filter(l => /^exception|^error/.test(l) && !/favicon|net::ERR|Failed to load resource/i.test(l));
  ok(!errs.length, "no JS errors" + (errs.length ? ": " + errs.slice(0, 3).join(" | ") : ""));
} catch (e){ console.log("  FAIL crashed: " + (e.stack || e)); failed++; }
finally { await b.close(); srv.close && srv.close(); }
console.log(failed ? `\n${failed} account layout checks FAILED` : "\nAll account layout checks passed");
process.exit(failed ? 1 : 0);
