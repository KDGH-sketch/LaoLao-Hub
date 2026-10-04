// Browser tests of plans, features and usage limits in DEMO mode (Supabase is never contacted).
// Admin configures plans in the Access matrix → a Free learner sees locked screens (also by direct link), hits a
// usage limit, cannot unlock anything by editing browser state → admin assigns Premium → expiry drops back to Free.
// Run: node scripts/e2e_access.mjs   (Chrome or Edge required)
import fs from "fs";
import path from "path";
import { launch, sleep } from "./lib/cdp.mjs";
import { startDemoServer, ROOT } from "./lib/demo-server.mjs";

const SHOTS = path.join(ROOT, "e2e-screenshots");
fs.mkdirSync(SHOTS, { recursive: true });
const PW = "demo1234";
const srv = await startDemoServer();
const b = await launch({ width: 1366, height: 900 });
let failed = 0, section = "";
const ok = async (cond, name) => {
  console.log((cond ? "  PASS " : "  FAIL ") + name);
  if (!cond){ failed++; await b.screenshot(path.join(SHOTS, `fail-access-${section}-${name}`.replace(/[^\w.-]+/g, "_").slice(0, 110) + ".png")).catch(() => {}); }
};
const step = s => { section = s; console.log("\n" + s); };
const J = JSON.stringify;
const text = () => b.eval(`document.body.innerText`);
const click = (sel, re) => b.eval(`(() => { const el = [...document.querySelectorAll(${J(sel)})].find(e => ${re}.test((e.innerText || e.textContent || "").trim()) || ${re}.test(e.getAttribute("aria-label") || "")); if (el){ el.scrollIntoView({block:"center"}); el.click(); } return !!el; })()`);
const jsErrors = () => b.consoleLog.filter(l => /^exception|^error/.test(l) && !/youtube|ytimg|googlevideo|doubleclick|favicon|net::ERR|Failed to load resource/i.test(l));
const api = expr => b.eval(`(async () => { const { getApi } = await import("/js/api/index.js"); const api = await getApi(); ${expr} })()`);

async function login(p, email){
  await b.eval(`try { localStorage.removeItem("laolao.demo.session"); } catch(e){}`).catch(() => {});
  await b.goto(srv.base + p);
  await b.waitFor(`!!document.querySelector("#em") || !!document.querySelector(".app")`, 60000);
  if (await b.eval(`!!document.querySelector(".app")`)) return;
  await b.eval(`(() => { const e = document.querySelector("#em"), p = document.querySelector("#pw"); e.value = ${J(email)}; p.value = ${J(PW)}; (e.form || p.form).requestSubmit(); })()`);
  await b.waitFor(`!!document.querySelector(".app")`, 30000); await sleep(700);
}
// a fresh load each time (a hash change alone does not restart the app)
const learnerAt = async hash => { await b.goto(srv.base + "/?r=" + Date.now() + hash); await b.waitFor(`!!document.querySelector(".app")`, 30000); await sleep(900); };
const noHScroll = () => b.eval(`document.documentElement.scrollWidth <= window.innerWidth + 1`);

try {
  step("admin: plan access matrix");
  await login("/admin/", "admin@demo.laolao");
  await b.eval(`[...document.querySelectorAll(".side .nav-btn")].find(e => /Plan Access/.test(e.innerText)).click()`);
  await b.waitFor(`!!document.querySelector(".am-tbl")`, 15000);
  await ok(await b.eval(`document.querySelectorAll(".am-tbl tbody tr").length > 25`), "matrix lists every feature");
  await ok(/all features/.test(await text()), "unconfigured plans are marked 'all features'");
  await click(".pagehead button", /Apply recommended defaults/); await sleep(400);
  await click(".dialog button", /Apply recommended defaults/); await sleep(1200);
  const freePlan = await api(`return await api.db.get("plans/free");`);
  await ok(freePlan.entitlements && freePlan.entitlements["tones.lab"] !== true && freePlan.limits["dictionary.search"].n === 20, "defaults applied: Free has no tone lab, 20 searches / day");
  const prem = await api(`return await api.db.get("plans/premium");`);
  await ok(prem.entitlements["tones.lab"] === true && Object.keys(prem.limits).length === 0, "Premium: every feature, no limits");
  // set Free's dictionary limit to 2 through the matrix (free is the first plan column)
  await b.waitFor(`!!document.querySelector(".am-tbl")`, 15000);
  await b.eval(`(() => { const row = [...document.querySelectorAll(".am-tbl tbody tr")].find(r => /dictionary\\.search/.test(r.innerText)); const n = row.querySelector(".am-n"); n.value = "2"; n.dispatchEvent(new Event("input", { bubbles:true })); })()`);
  await click(".pagehead button", /^Save$/); await sleep(1200);
  await ok((await api(`return await api.db.get("plans/free");`)).limits["dictionary.search"].n === 2, "matrix saves a changed limit (Free: 2 searches / day)");
  await b.eval(`[...document.querySelectorAll(".side .nav-btn")].find(e => /Pricing Plans/.test(e.innerText)).click()`); await sleep(900);
  await ok(/features · \d+ limits/.test(await text()), "plan cards show the configured features and limits");

  step("free learner: locked features");
  await login("/", "free@demo.laolao");
  await ok(await b.eval(`[...document.querySelectorAll(".side .nav-btn")].some(e => /Tone/.test(e.innerText) && e.querySelector(".navlock"))`), "locked features show a lock in the menu");
  await learnerAt("#tone_lab");
  await ok(await b.eval(`!!document.querySelector("main .lockp")`) && /Tone lab/.test(await text()) && /View plans/.test(await text()), "direct link #tone_lab shows the locked screen with the reason and 'View plans'");
  await ok(!(await b.eval(`[...document.querySelectorAll("main h1")].some(h => /tone/i.test(h.innerText))`)), "the tone lab itself is not rendered");
  await b.screenshot(path.join(SHOTS, "access-locked-desktop.png"));
  await click("main .lockp button", /View plans/); await sleep(900);
  await ok(await b.eval(`!!document.querySelector("#plans")`) && /Your plan/.test(await text()), "'View plans' opens the plan list with the current plan marked");
  await ok(/Usage/.test(await text()) && /Dictionary search/.test(await text()), "the Account page shows usage meters");
  await ok(!(await b.eval(`/Open Admin CMS/.test(document.querySelector("main").innerText)`)), "learners no longer see the Admin CMS card");
  const logs = await api(`await api.auth.current(); return (await api.db.list("accessLogs")).filter(l => l.feature === "tones.lab").length;`);
  await ok(logs >= 1, "the refused direct link is written to the access log");

  step("free learner: content above the plan is not in the browser");
  const counts = await b.eval(`(async () => { const { A } = await import("/js/learner/core.js"); return { have: Object.values(A.P).length, locked: A.catalog.filter(c => c.tier > A.tier).length, tier: A.tier }; })()`);
  await ok(counts.tier === 1 && counts.locked > 0, "free tier 1; locked items appear only as catalog titles (" + counts.locked + ")");
  const tamper = await b.eval(`(async () => { const { A } = await import("/js/learner/core.js"); A.ent.all = true; A.ent.limits = {}; A.tier = 3; A.ent.tier = 3;
    try { localStorage.setItem("laolao_tier", "3"); } catch(e){}
    const { getApi } = await import("/js/api/index.js"); const api = await getApi();
    const r = await api.rpc("ll_use", { p_feature:"tones.lab", p_amount:1, p_ref:null });
    const e = await api.rpc("ll_entitlements");
    return { allowed: r.allowed, reason: r.reason, tier: e.tier, haveAfter: Object.values(A.P).length }; })()`);
  await ok(!tamper.allowed && tamper.reason === "feature_not_in_plan" && tamper.tier === 1, "editing entitlements / tier in DevTools: the database functions still refuse (tier stays 1)");
  await ok(tamper.haveAfter === counts.have, "changing the tier in the browser does not add any content");

  step("free learner: usage limit");
  await learnerAt("#dict");
  const search = async q => { await b.eval(`(() => { const i = document.querySelector("main input.input"); i.value = ${J(q)}; i.dispatchEvent(new Event("input", { bubbles:true })); })()`); await sleep(1500); };
  await search("sa"); await search("ka");
  await ok(!(await b.eval(`!!document.querySelector("main .lockp")`)), "2 searches within the limit");
  await search("pa");
  await ok(await b.eval(`!!document.querySelector("main .lockp")`) && /Limit reached/.test(await text()) && /2 of 2/.test(await text()), "3rd search shows 'Limit reached · 2 of 2' with the reset time");
  await ok(/Resets/.test(await text()), "the limit message says when it resets");
  await search("sa");
  await ok(!(await b.eval(`!!document.querySelector("main .lockp")`)), "a word already searched today stays available");

  step("layout: phone, dark mode");
  await b.viewport(375, 780, true);
  await learnerAt("#particle_lab");
  await ok(await b.eval(`!!document.querySelector("main .lockp")`) && await noHScroll(), "phone: locked screen fits, no horizontal scrolling");
  await b.screenshot(path.join(SHOTS, "access-locked-phone.png"));
  await b.eval(`document.documentElement.setAttribute("data-theme","night")`); await sleep(200);
  const bg = await b.eval(`getComputedStyle(document.querySelector("main .lockp")).backgroundColor`);
  await ok(bg && !/255, 255, 255/.test(bg), "night theme: the locked card uses the dark surface (" + bg + ")");
  await b.screenshot(path.join(SHOTS, "access-locked-phone-night.png"));
  await b.eval(`document.documentElement.setAttribute("data-theme","day")`);
  await b.viewport(1366, 900, false);

  step("admin: assign Premium, personal grant, usage reset");
  const uid = await api(`return (await api.db.list("users")).find(u => u.email === "free@demo.laolao").id;`);
  await login("/admin/", "admin@demo.laolao");
  await b.eval(`(async () => { const st = await import("/js/admin/state.js"); st.go("learner", { uid: ${J(uid)} }); })()`); await sleep(1500);
  await ok(/Personal access/.test(await text()) && /Dictionary search · 2 \/ 2/.test(await text()), "learner page shows personal access and today's usage (2 / 2)");
  await click(".panel button", /^Assign plan$/); await sleep(500);
  await b.eval(`(() => { const s = document.querySelector(".dialog select"); s.value = "premium"; s.dispatchEvent(new Event("change", { bubbles:true })); })()`);
  await click(".dialog button", /^Save$/); await sleep(1200);
  const acc = await api(`return await api.db.get("access/" + ${J(uid)});`);
  await ok(acc.planId === "premium" && acc.status === "active", "Premium assigned");
  const hist = await api(`return (await api.db.list("subscriptions")).filter(s => s.uid === ${J(uid)} && s.planId === "premium").length;`);
  await ok(hist >= 1, "assignment recorded in the subscription history");

  step("premium learner");
  await login("/", "free@demo.laolao");
  await learnerAt("#tone_lab");
  await ok(!(await b.eval(`!!document.querySelector("main .lockp")`)), "tone lab opens after the upgrade");
  await learnerAt("#dict");
  await search("ma");
  await ok(!(await b.eval(`!!document.querySelector("main .lockp")`)), "no search limit on Premium");
  const progBefore = await api(`return !!(await api.db.get("progress/" + ${J(uid)}));`);

  step("expiry → back to Free, data kept");
  await api(`await api.db.update("access/" + ${J(uid)}, { expiresAt: Date.now() - 1000 }); await api._flush();`);
  await learnerAt("#tone_lab");
  await ok(await b.eval(`!!document.querySelector("main .lockp")`), "expired Premium: tone lab locked again");
  await learnerAt("#account");
  await ok(/expired/i.test(await text()), "the Account page explains the plan expired");
  await ok(progBefore && await api(`return !!(await api.db.get("progress/" + ${J(uid)})) && !!(await api.db.get("users/" + ${J(uid)}));`), "progress and profile are kept after expiry");

  step("admin roles");
  await login("/admin/", "editor@demo.laolao");
  await ok(!(await b.eval(`[...document.querySelectorAll(".side .nav-btn")].some(e => /Plan Access|Access Logs/.test(e.innerText))`)), "content editor sees neither the access matrix nor the access logs");
  await login("/admin/", "support@demo.laolao");
  await ok(await b.eval(`[...document.querySelectorAll(".side .nav-btn")].some(e => /Access Logs/.test(e.innerText))`) && !(await b.eval(`[...document.querySelectorAll(".side .nav-btn")].some(e => /Plan Access/.test(e.innerText))`)), "support sees Access logs, not the matrix");
  await b.eval(`[...document.querySelectorAll(".side .nav-btn")].find(e => /Access Logs/.test(e.innerText)).click()`); await sleep(1200);
  await ok(/Not in plan|Limit reached/.test(await text()), "access logs list refusals and limits");

  await ok(jsErrors().length === 0, "no JavaScript errors" + (jsErrors().length ? ": " + jsErrors().slice(0, 3).join(" | ") : ""));
} catch(e){
  failed++; console.log("  FAIL " + section + ": " + e.message);
  await b.screenshot(path.join(SHOTS, "fail-access-exception.png")).catch(() => {});
} finally {
  await b.close(); srv.close();
}
console.log(failed ? `\n${failed} browser check(s) failed` : "\nAll access browser checks passed");
process.exit(failed ? 1 : 0);
