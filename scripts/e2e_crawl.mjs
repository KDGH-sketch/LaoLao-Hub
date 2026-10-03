// Crawls every learner page and every admin menu, as every demo role, at desktop and phone widths.
// For each page it records: JavaScript errors, error banners, empty pages, horizontal overflow and
// untranslated i18n keys. DEMO mode only (Supabase is never contacted).
// Run: node scripts/e2e_crawl.mjs        → report in e2e-screenshots/crawl-report.json
import fs from "fs";
import path from "path";
import { launch, sleep } from "./lib/cdp.mjs";
import { startDemoServer, ROOT } from "./lib/demo-server.mjs";

const SHOTS = path.join(ROOT, "e2e-screenshots");
fs.mkdirSync(SHOTS, { recursive: true });
const PW = "demo1234";
const ACCOUNTS = {
  free: "free@demo.laolao", premium: "learner@demo.laolao",
  super: "admin@demo.laolao", editor: "editor@demo.laolao", reviewer: "reviewer@demo.laolao", support: "support@demo.laolao"
};
// i18n keys look like nav_home / adm_settings; ignore things that are clearly not keys
const KEY_RE = /\b(?:nav|adm|acc|type|status|sk|role|dl|q|t|btn|err|msg|lbl)_[a-z0-9_]+\b/g;

const srv = await startDemoServer();
const b = await launch({ width: 1366, height: 900 });
const report = [];
let seen = 0;
const newErrors = () => { const out = b.consoleLog.slice(seen).filter(l => /^exception|^error/.test(l) && !/youtube|ytimg|googlevideo|doubleclick|favicon|net::ERR|Failed to load resource/i.test(l)); seen = b.consoleLog.length; return out; };

async function login(appPath, email){
  await b.eval(`try { localStorage.removeItem("laolao.demo.session"); } catch(e){}`).catch(() => {});
  await b.goto(srv.base + appPath);
  await b.waitFor(`!!document.querySelector("#em") || !!document.querySelector(".app")`, 60000);
  if (await b.eval(`!!document.querySelector(".app")`)) return;
  await b.eval(`(() => { const e = document.querySelector("#em"), p = document.querySelector("#pw");
    e.value = ${JSON.stringify(email)}; p.value = ${JSON.stringify(PW)}; (e.form || p.form).requestSubmit(); })()`);
  await b.waitFor(`!!document.querySelector(".app")`, 30000);
  await sleep(800); newErrors();
}

async function inspect(kind, role, vp, label){
  const r = await b.eval(`(() => {
    const main = document.querySelector("main");
    const text = main ? main.innerText : "";
    const banners = main && main.children.length === 1 && main.firstElementChild.classList.contains("banner") ? [main.innerText.trim()] : [];
    const over = document.documentElement.scrollWidth - innerWidth;
    const wide = over > 1 ? [...document.querySelectorAll("main *")].filter(el => el.getBoundingClientRect().right > innerWidth + 1 && getComputedStyle(el).position !== "fixed")
      .slice(0, 3).map(el => el.tagName.toLowerCase() + (el.className && typeof el.className === "string" ? "." + el.className.split(" ").join(".") : "")) : [];
    return { textLen: text.trim().length, banners, over, wide, keys: [...new Set(text.match(${KEY_RE}) || [])].slice(0, 8) };
  })()`);
  const errors = newErrors();
  const problems = [];
  if (errors.length) problems.push("js-error");
  if (r.banners.length) problems.push("error-banner");
  if (r.textLen < 20) problems.push("empty");
  if (r.over > 1) problems.push("overflow");
  if (r.keys.length) problems.push("untranslated");
  const row = { kind, role, viewport: vp, page: label, problems, errors, ...r };
  report.push(row);
  if (problems.length){
    const file = `crawl-${kind}-${role}-${vp}-${label}`.replace(/[^\w.-]+/g, "_").slice(0, 120) + ".png";
    await b.screenshot(path.join(SHOTS, file)).catch(() => {});
    row.screenshot = file;
  }
  console.log(`  ${problems.length ? "!!" : "ok"} ${kind}/${role}/${vp} ${label}${problems.length ? "  → " + problems.join(", ") + (errors[0] ? "  " + errors[0].slice(0, 160) : "") + (r.banners[0] ? "  banner: " + r.banners[0].slice(0, 120) : "") + (r.keys.length ? "  keys: " + r.keys.join(" ") : "") + (r.over > 1 ? `  overflow ${r.over}px ${r.wide.join(" ")}` : "") : ""}`);
}

async function crawl(kind, role, vp){
  // every sidebar entry (buttons only; links leave the app)
  const labels = await b.eval(`[...document.querySelectorAll(".side button.nav-btn")].map(x => x.innerText.trim()).filter(t => !/sign out|ອອກ|退出/i.test(t))`);
  for (let i = 0; i < labels.length; i++){
    await b.eval(`[...document.querySelectorAll(".side button.nav-btn")].filter(x => !/sign out|ອອກ|退出/i.test(x.innerText))[${i}].click()`);
    await sleep(kind === "admin" ? 1200 : 900);
    await inspect(kind, role, vp, labels[i].replace(/\s+\d+$/, ""));
  }
}

try {
  for (const [vp, w, hgt, mobile] of [["desktop", 1366, 900, false], ["tablet", 768, 1024, true], ["phone", 390, 844, true], ["phone-landscape", 844, 390, true]]){
    await b.viewport(w, hgt, mobile);
    console.log(`\n=== ${vp} ${w}×${hgt} ===`);
    for (const role of ["free", "premium"]){
      console.log(`learner: ${role}`);
      await login("/", ACCOUNTS[role]);
      await crawl("learner", role, vp);
    }
    for (const role of ["super", "editor", "reviewer", "support"]){
      console.log(`admin: ${role}`);
      await login("/admin/", ACCOUNTS[role]);
      await crawl("admin", role, vp);
    }
  }
} catch(e){
  console.log("CRAWL ABORTED:", e.message);
  await b.screenshot(path.join(SHOTS, "crawl-aborted.png")).catch(() => {});
} finally {
  await b.close(); srv.close();
}
fs.writeFileSync(path.join(SHOTS, "crawl-report.json"), JSON.stringify(report, null, 1));
const bad = report.filter(r => r.problems.length);
console.log(`\n${report.length} pages checked, ${bad.length} with problems. Report: e2e-screenshots/crawl-report.json`);
process.exit(bad.length ? 1 : 0);
