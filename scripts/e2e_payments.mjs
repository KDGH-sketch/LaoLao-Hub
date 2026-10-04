// Browser tests of the plan and payment flow in DEMO mode (the in-app test checkout stands in for the provider;
// Supabase and real payment providers are never contacted).
// Free learner → locked feature → upgrade popup → plans → checkout → declined → retry → pending → paid → back to the feature,
// then My learning plan (history, receipt, cancel / reactivate, scheduled downgrade), admin refund, phone and night layouts.
// Run: node scripts/e2e_payments.mjs   (Chrome or Edge required)
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
  if (!cond){ failed++; await b.screenshot(path.join(SHOTS, `fail-pay-${section}-${name}`.replace(/[^\w.-]+/g, "_").slice(0, 110) + ".png")).catch(() => {}); }
};
const step = s => { section = s; console.log("\n" + s); };
const J = JSON.stringify;
const text = () => b.eval(`document.body.innerText`);
const click = (sel, re) => b.eval(`(() => { const el = [...document.querySelectorAll(${J(sel)})].find(e => ${re}.test((e.innerText || e.textContent || "").trim()) || ${re}.test(e.getAttribute("aria-label") || "")); if (el){ el.scrollIntoView({block:"center"}); el.click(); } return !!el; })()`);
const jsErrors = () => b.consoleLog.filter(l => /^exception|^error/.test(l) && !/youtube|ytimg|googlevideo|doubleclick|favicon|net::ERR|Failed to load resource/i.test(l));
const api = expr => b.eval(`(async () => { const { getApi } = await import("/js/api/index.js"); const api = await getApi(); ${expr} })()`);
const ent = () => b.eval(`(async () => { const { A } = await import("/js/learner/core.js"); return { plan: A.ent.planId, tier: A.tier }; })()`);
const noHScroll = () => b.eval(`document.documentElement.scrollWidth <= window.innerWidth + 1`);
const waitText = async (re, ms = 8000) => { const end = Date.now() + ms; while (Date.now() < end){ if (re.test(await text())) return true; await sleep(250); } return false; };

async function login(p, email){
  await b.eval(`try { localStorage.removeItem("laolao.demo.session"); } catch(e){}`).catch(() => {});
  await b.goto(srv.base + p);
  await b.waitFor(`!!document.querySelector("#em") || !!document.querySelector(".app")`, 60000);
  if (await b.eval(`!!document.querySelector(".app")`)) return;
  await b.eval(`(() => { const e = document.querySelector("#em"), p = document.querySelector("#pw"); e.value = ${J(email)}; p.value = ${J(PW)}; (e.form || p.form).requestSubmit(); })()`);
  await b.waitFor(`!!document.querySelector(".app")`, 30000); await sleep(700);
  if (p === "/") await b.eval(`(async () => { const c = await import("/js/learner/core.js"); c.setPref("uiLang", "en"); })()`).catch(() => {});
}
const learnerAt = async hash => { await b.goto(srv.base + "/?r=" + Date.now() + hash); await b.waitFor(`!!document.querySelector(".app")`, 30000); await sleep(1000); };
// the demo test checkout is a dialog; pick an outcome
const demoPick = async re => { await b.waitFor(`!!document.querySelector(".dialog")`, 8000); await click(".dialog .dialog-f button", re); await sleep(900); };

try {
  step("admin: plans with prices, payments screen");
  await login("/admin/", "admin@demo.laolao");
  await b.eval(`[...document.querySelectorAll(".side .nav-btn")].find(e => /Plan Access/.test(e.innerText)).click()`);
  await b.waitFor(`!!document.querySelector(".am-tbl")`, 15000);
  await click(".pagehead button", /Apply recommended defaults/); await sleep(400);
  await click(".dialog button", /Apply recommended defaults/); await sleep(1200);
  await b.eval(`[...document.querySelectorAll(".side .nav-btn")].find(e => /Pricing Plans/.test(e.innerText)).click()`); await sleep(900);
  await ok(/\/ month/.test(await text()) && /Not sold online/.test(await text()), "plan cards show online prices (and Free is not sold)");
  await click(".panel button", /Edit/); await sleep(500);
  await ok(await b.eval(`document.querySelectorAll(".dialog .plan-prices input").length === 4`), "plan editor: monthly / yearly × LAK / USD prices");
  await b.eval(`document.querySelector(".dialog .ib").click()`); await sleep(300);
  await b.eval(`[...document.querySelectorAll(".side .nav-btn")].find(e => /Payments/.test(e.innerText)).click()`); await sleep(900);
  await ok(/Received this month/.test(await text()) && /No payments|Orders/.test(await text()), "Payments screen opens (summary, orders)");
  await click(".seg button", /^Settings$/); await sleep(700);
  await ok(/Test mode: no real money/.test(await text()) && await b.eval(`document.querySelectorAll(".pay-mrow").length === 3`), "payment settings: test provider, Mastercard / Visa / BCEL OnePay");

  step("free learner: locked feature → plans");
  await login("/", "free@demo.laolao");
  await learnerAt("#tone_lab");
  await ok(await b.eval(`!!document.querySelector("main .lockp")`) && /Upgrade to/.test(await text()) && /from .*\/ month/.test(await text()), "locked screen names the plan and its price");
  await click("main .lockp button", /Upgrade to/); await sleep(900);
  await ok(await b.eval(`!!document.querySelector(".bill-grid")`) && /Choose a plan to unlock Tone lab/.test(await text()), "plans page, remembering the feature to unlock");
  await ok(await b.eval(`!!document.querySelector(".bill-plan.recommended .bill-ribbon")`) && await b.eval(`!!document.querySelector(".bill-plan.current")`), "recommended plan highlighted, current plan marked");
  await click(".bill-cycle button", /Yearly/); await sleep(300);
  await ok(/\/ year/.test(await text()) && /save \d+%/.test(await text()), "yearly prices with the saving");
  await click(".bill-cycle button", /Monthly/); await sleep(300);
  await b.screenshot(path.join(SHOTS, "pay-plans-desktop.png"));
  await click(".bill-plan button", /Choose Premium/); await sleep(1200);

  step("checkout: declined, retry, pending, paid");
  await ok(await b.eval(`document.querySelectorAll(".bill-method").length === 3`) && /\$5\.99/.test(await text()) && /100,000/.test(await text()), "checkout: three methods; card in USD ($5.99), QR in LAK (100,000)");
  await ok(/Starts today and is valid until/.test(await text()) && /do not renew automatically/.test(await text()), "summary explains the period and manual renewal");
  await b.screenshot(path.join(SHOTS, "pay-checkout-desktop.png"));
  await b.eval(`[...document.querySelectorAll(".bill-method input")].find(i => i.value === "visa").click()`); await sleep(200);
  await ok(/Pay \$5\.99/.test(await b.eval(`document.querySelector(".bill-pay").innerText`)), "pay button shows the amount");
  await b.eval(`document.querySelector(".bill-pay").click(); document.querySelector(".bill-pay").click();`);   // double click
  await demoPick(/Decline/);
  await ok(await waitText(/Payment unsuccessful/) && /has not been upgraded/.test(await text()), "declined: 'Payment unsuccessful', plan not upgraded");
  await ok((await ent()).plan === "free", "still Free");
  const orders1 = await api(`return (await api.db.list("orders")).length;`);
  await ok(orders1 === 1, "double click created one order");
  await ok(/Try Visa again/.test(await text()) && /Choose another payment method/.test(await text()), "failure offers 'Try Visa again' and another method");
  await click(".bill-result button", /Try Visa again/);
  await demoPick(/Leave pending/);
  await ok(await waitText(/Waiting for payment confirmation/) && /LLH-/.test(await text()), "pending: waiting screen with the order number");
  await ok((await ent()).plan === "free", "pending payment gives no access");
  await click(".bill-result button", /Choose another payment method/); await sleep(1200);
  await b.eval(`[...document.querySelectorAll(".bill-method input")].find(i => i.value === "mastercard").click()`); await sleep(200);
  await b.eval(`document.querySelector(".bill-pay").click()`);
  await demoPick(/Pay successfully/);
  await ok(await waitText(/Payment successful/) && /Premium learning plan is now active/.test(await text()) && /Valid until/.test(await text()), "paid: success screen with the plan and end date");
  await sleep(800);
  const e1 = await ent();
  await ok(e1.plan === "premium" && e1.tier === 3, "entitlements refreshed without signing out (Premium, tier 3)");
  await b.screenshot(path.join(SHOTS, "pay-success-desktop.png"));
  await ok(/Continue: Tone lab/.test(await text()), "offers to continue with the feature that was locked");
  await click(".bill-result button", /Continue: Tone lab/); await sleep(1200);
  await ok(!(await b.eval(`!!document.querySelector("main .lockp")`)) && await b.eval(`/tone/i.test(document.querySelector("main h1") ? document.querySelector("main h1").innerText : "")`), "back in the Tone lab, now unlocked");

  step("my learning plan");
  await learnerAt("#myplan");
  await ok(/Premium/.test(await text()) && /Active/.test(await text()) && /Mastercard •••• 4242/.test(await text()) && /Monthly/.test(await text()), "current plan: Premium, Active, Monthly, Mastercard •••• 4242");
  await ok(await b.eval(`document.querySelectorAll(".bill-table tbody tr").length`) >= 2 && /Paid/.test(await text()) && /Failed/.test(await text()), "payment history lists the paid and the failed order");
  await click(".bill-table button", /Receipt/); await sleep(400);
  await ok(await b.eval(`/LLH-/.test(document.querySelector(".dialog").innerText) && /\\$5\\.99/.test(document.querySelector(".dialog").innerText)`), "receipt shows the order number and amount");
  await b.eval(`document.querySelector(".dialog .ib").click()`); await sleep(300);
  await b.screenshot(path.join(SHOTS, "pay-myplan-desktop.png"));
  await click(".bill-ra button", /Cancel plan/); await sleep(300);
  await click(".dialog button", /Cancel plan/); await sleep(1200);
  await ok(/stays active until/.test(await text()) && (await ent()).plan === "premium", "cancel at period end: still Premium, ends on the end date");
  await click(".bill-ra button", /Keep my plan/); await sleep(1200);
  await ok(!/stays active until/.test(await text()), "reactivated");
  await learnerAt("#checkout?plan=premium&cycle=month");
  await ok(/Added after your current period/.test(await text()), "same plan again = renewal after the current period");
  await learnerAt("#plans");
  await click(".bill-plan button", /Switch at renewal/); await sleep(300);
  await click(".dialog button", /Schedule the switch/); await sleep(1200);
  await learnerAt("#myplan");
  await ok(/then Basic/.test(await text()), "downgrade scheduled: 'Premium until …, then Basic' (standard is shown as Basic)");

  step("upgrade popup: 'Maybe later' does not reappear on every click");
  const later = await b.eval(`(async () => { const u = await import("/js/learner/upgrade.js");
    u.upgradeSheet({ feature:"no.such.feature" }); await new Promise(r => setTimeout(r, 300));
    const first = !!document.querySelector(".dialog .lockp");
    [...document.querySelectorAll(".dialog button")].find(b => /Maybe later/.test(b.innerText)).click(); await new Promise(r => setTimeout(r, 200));
    u.upgradeSheet({ feature:"no.such.feature" }); await new Promise(r => setTimeout(r, 300));
    return { first, second: !!document.querySelector(".dialog .lockp") }; })()`);
  await ok(later.first && !later.second, "after 'Maybe later' the same block shows a short note instead of the dialog");

  step("layout: phone and night theme");
  await b.viewport(375, 800, true);
  for (const v of ["#plans", "#checkout?plan=premium&cycle=year", "#myplan"]){
    await learnerAt(v);
    await ok(await noHScroll(), "phone " + v + ": no horizontal scrolling");
    await b.screenshot(path.join(SHOTS, "pay-phone-" + v.slice(1).replace(/\W+/g, "_") + ".png"));
  }
  const small = await b.eval(`[...document.querySelectorAll("main .btn")].filter(e => e.offsetParent && e.getBoundingClientRect().height < 36).map(e => e.innerText.trim().slice(0, 24))`);
  const tap = small.length ? 0 : 36; if (small.length) console.log("    small:", small.join(" | "));
  await ok(tap >= 36, "phone: every button is at least 36px tall" + (small.length ? " (small: " + small.join(", ") + ")" : ""));
  await b.eval(`document.documentElement.setAttribute("data-theme","night")`); await learnerAt("#plans");
  await b.eval(`document.documentElement.setAttribute("data-theme","night")`); await sleep(200);
  const bg = await b.eval(`getComputedStyle(document.querySelector(".bill-plan")).backgroundColor`);
  await ok(bg && !/255, 255, 255/.test(bg), "night theme: plan cards use the dark surface (" + bg + ")");
  await b.screenshot(path.join(SHOTS, "pay-plans-phone-night.png"));
  await b.eval(`document.documentElement.setAttribute("data-theme","day")`);
  await b.viewport(1366, 900, false);

  step("admin: order list and refund");
  await login("/admin/", "admin@demo.laolao");
  await b.eval(`[...document.querySelectorAll(".side .nav-btn")].find(e => /Payments/.test(e.innerText)).click()`); await sleep(900);
  await ok(await b.eval(`document.querySelectorAll("table.tbl tbody tr.clickable").length`) >= 2 && /Somsack/.test(await text()), "orders listed with the learner");
  await click("table.tbl tbody tr", /Paid/); await sleep(500);
  await ok(/Amount \(snapshot\)/.test(await text()) && /4242/.test(await text()) && !/\d{12}/.test(await b.eval(`document.querySelector(".dialog").innerText`)), "order detail: price snapshot, card brand and last 4 only");
  await click(".dialog button", /Refund/); await sleep(400);
  await click(".dialog:last-of-type button", /Record refund/); await sleep(300);
  await click(".dialog button", /^Refund$/); await sleep(1200);
  const st = await api(`return (await api.db.list("orders")).find(o => o.status === "refunded");`);
  await ok(!!st, "refund recorded");
  const acc = await api(`const u = (await api.db.list("users")).find(u => u.email === "free@demo.laolao"); return await api.db.get("access/" + u.id);`);
  await ok(acc.expiresAt <= Date.now() + 1000, "refund policy: the plan from that order ended");
  const subs = await api(`return (await api.db.list("subscriptions")).filter(s => s.action === "refund").length;`);
  await ok(subs === 1, "refund written to the subscription history");

  await ok(jsErrors().length === 0, "no JavaScript errors" + (jsErrors().length ? ": " + jsErrors().slice(0, 3).join(" | ") : ""));
} catch(e){ console.error(e); failed++; }
finally { await b.close(); srv.close(); }
console.log(failed ? `\n${failed} payment browser checks FAILED` : "\nAll payment browser checks passed");
process.exit(failed ? 1 : 0);
