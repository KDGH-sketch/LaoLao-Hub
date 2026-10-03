// Takes screenshots of the main screens for a visual review (DEMO mode). Output: e2e-screenshots/view-*.png
// Run: node scripts/screenshots.mjs [desktop|phone]
import fs from "fs";
import path from "path";
import { launch, sleep } from "./lib/cdp.mjs";
import { startDemoServer, ROOT } from "./lib/demo-server.mjs";

const SHOTS = path.join(ROOT, "e2e-screenshots");
fs.mkdirSync(SHOTS, { recursive: true });
const mode = process.argv[2] || "desktop";
const srv = await startDemoServer();
const b = await launch({ width: 1366, height: 900 });
if (mode === "phone") await b.viewport(390, 844, true);
const J = JSON.stringify;
const shot = async name => { await sleep(700); await b.screenshot(path.join(SHOTS, `view-${mode}-${name}.png`)); console.log("  " + name); };
const login = async (p, email) => {
  await b.eval(`localStorage.removeItem("laolao.demo.session")`).catch(() => {});
  await b.goto(srv.base + p); await b.waitFor(`!!document.querySelector("#em") || !!document.querySelector(".app")`, 60000);
  if (!(await b.eval(`!!document.querySelector(".app")`))){
    await b.eval(`(() => { document.querySelector("#em").value = ${J(email)}; document.querySelector("#pw").value = "demo1234"; document.querySelector("#em").form.requestSubmit(); })()`);
    await b.waitFor(`!!document.querySelector(".app")`, 30000);
  }
};
const nav = re => b.eval(`(() => { const el = [...document.querySelectorAll(".side .nav-btn")].find(e => ${re}.test(e.innerText)); if (el) el.click(); return !!el; })()`);
try {
  await login("/", "free@demo.laolao");
  await shot("learner-home");
  await nav(/Progress/); await shot("learner-progress");
  await nav(/Practice/); await sleep(600);
  await b.eval(`(() => { const el = [...document.querySelectorAll("main button, main .qs, main a")].find(e => /mix|Mixed|meaning|Meaning/i.test(e.innerText)); if (el) el.click(); })()`);
  await sleep(1200);
  for (let i = 0; i < 12; i++){   // answer every question: first option, or the first button in the question box
    const more = await b.eval(`(() => { const box = document.querySelector(".qbox:not(.result)"); if (!box) return false;
      const next = [...box.querySelectorAll("button")].find(x => /Next|ຕໍ່ໄປ|下一/.test(x.innerText)); if (next){ next.click(); return true; }
      const opt = box.querySelector(".opt, .tile, .opts button"); if (opt){ opt.click(); return true; }
      const inp = box.querySelector("input"); if (inp){ inp.value = "x"; const c = [...box.querySelectorAll("button")].find(x => /Check|ກວດ|检查/.test(x.innerText)); if (c) c.click(); return true; }
      const any = [...box.querySelectorAll("button")].find(x => /Knew|Didn|Skip|Show|ສະແດງ/.test(x.innerText)); if (any){ any.click(); return true; } return false; })()`);
    await sleep(500); if (!more) break;
  }
  await shot("learner-quiz-result");
  await nav(/Video/); await shot("learner-videos");
  await nav(/Account/); await shot("learner-account");
  await login("/admin/", "admin@demo.laolao");
  await shot("admin-dashboard");
  await nav(/Video Manager/); await shot("admin-videos");
  await nav(/Settings/); await shot("admin-settings");
  await nav(/Administrators/); await shot("admin-admins");
} catch(e){ console.log("ERR", e.message); await b.screenshot(path.join(SHOTS, "view-error.png")).catch(() => {}); }
finally { await b.close(); srv.close(); }
