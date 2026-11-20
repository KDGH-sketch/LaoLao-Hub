// Notifications, in DEMO mode (js/learner/notify.js, js/admin/notify.js, docs/NOTIFICATIONS.md):
// learner bell with an unread count; a transfer slip, then the admin rejects it with a message → the learner gets an
// alert card with the reason, sees the message on the transfer page and in the panel; the admin approves → an alert
// "Premium is open" and the plan unlocks; the Smart Calendar shows days left, the end date and coming Lao events.
// Admin: a bell and a count on Payments when a slip waits, an alert card for a new slip, counts on every tab and filter,
// a message to the learner on an order, deleting orders that never became money (paid ones are kept), Clean up.
// Run: node scripts/e2e_notify.mjs   (Chrome or Edge required)
import fs from "fs";
import path from "path";
import { launch, sleep } from "./lib/cdp.mjs";
import { startDemoServer, ROOT } from "./lib/demo-server.mjs";

const SHOTS = path.join(ROOT, "e2e-screenshots"); fs.mkdirSync(SHOTS, { recursive: true });
const srv = await startDemoServer();
const b = await launch({ width: 1366, height: 900 });
const J = JSON.stringify;
let failed = 0;
const ok = (c, m, d) => { console.log((c ? "  PASS " : "  FAIL ") + m + (!c && d !== undefined ? "  → " + J(d).slice(0, 300) : "")); if (!c) failed++; };
const step = s => console.log("\n" + s);
const errors = () => b.consoleLog.filter(l => /^exception|^error/.test(l) && !/favicon|net::ERR|Failed to load resource/i.test(l));
const api = expr => b.eval(`(async () => { const { getApi } = await import("/js/api/index.js"); const api = await getApi(); ${expr} })()`);
const go = (v, p = {}) => b.eval(`import("/js/learner/main.js").then(m => m.go(${J(v)}, ${J(p)}))`).then(() => sleep(1300));
const ago = go;
async function login(email, where = "/"){
  await b.eval(`(async () => { try { const { getApi } = await import("/js/api/index.js"); await (await getApi()).auth.signOut(); } catch(e){} try { localStorage.removeItem("laolao.demo.session"); } catch(e){} })()`).catch(() => {});
  await b.goto(srv.base + where + "?r=" + Date.now()); await b.waitFor(`!!document.querySelector("#em") || !!document.querySelector(".app")`, 60000);
  await b.eval(`try { localStorage.setItem("xuelu.lang", "en"); } catch(e){}`);
  await b.eval(`(() => { const e = document.querySelector("#em"), p = document.querySelector("#pw"); e.value = ${J(email)}; p.value = "demo1234"; (e.form || p.form).requestSubmit(); })()`);
  await b.waitFor(`!!document.querySelector(".app")`, 30000); await sleep(2500);
}
const adminGo = async (v, p = {}) => { await b.eval(`(async () => { const st = await import("/js/admin/state.js"); st.go(${J(v)}, ${J(p)}); })()`); await sleep(2200); };
const SLIP = `data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==`;
const badge = () => b.eval(`(() => { const x = document.querySelector(".topbar .nb .nb-badge"); return x && !x.hidden ? x.textContent : ""; })()`);
const spot = () => b.eval(`(document.querySelector(".nspot:not(.out)") || {}).innerText || ""`);

try {
  step("learner: the bell, and a slip sent");
  await b.goto(srv.base + "/"); await b.waitFor(`!!document.querySelector("#em") || !!document.querySelector(".app")`, 60000);
  await login("admin@demo.laolao", "/admin/"); await sleep(1500);          // the admin had the page open before the slip came
  await login("free@demo.laolao");
  ok(await b.eval(`!!document.querySelector(".topbar .nb")`), "the learner's top bar has a bell");
  const id = await api(`const o = await api.pay.transfer({ planId: "premium", cycle: "month" }); await api.pay.submitSlip(o.id, { image: ${J(SLIP)}, ref: "N-1" }); await api._flush(); return o.id;`);
  await b.goto(srv.base + "/?r=" + Date.now()); await b.waitFor(`!!document.querySelector(".app")`, 30000); await sleep(2500);
  ok(+(await badge()) >= 1, "the bell shows an unread count after the slip", await badge());

  step("admin: bell, menu count, alert for the new slip, counts on tabs");
  await login("admin@demo.laolao", "/admin/");
  await sleep(1500);
  ok(await b.eval(`!!document.querySelector(".topbar .nb") && !document.querySelector(".topbar .nb .nb-badge").hidden`), "the admin bell shows a count");
  ok(await b.eval(`/\\d/.test(document.querySelector('.nav-btn[data-key="payments"] .nav-count')?.innerText || "")`), "Payments & Orders in the menu shows how many slips wait");
  ok(/New transfer slip/.test(await spot()), "a new slip drops in as an alert card", await spot());
  await b.screenshot(path.join(SHOTS, "notify-admin-alert.png"));
  await adminGo("payments", {});
  const tabs = await b.eval(`[...document.querySelectorAll(".seg button[data-k]")].map(x => x.innerText.replace(/\\s+/g, " ").trim())`);
  ok(/Transfers\s*1/.test(tabs[0]) && /Orders\s*\d+/.test(tabs[1]), "every tab shows its count", tabs);
  ok(await b.eval(`[...document.querySelectorAll(".tr-adm-grid ~ *, .stack .seg[role=group] button")].some(x => /To approve\\s*1/.test(x.innerText))`), "the transfer filters show their counts too");

  step("admin rejects with a message to the learner");
  await b.eval(`document.querySelector(".tr-adm-card").click()`); await sleep(1500);
  const clickDlg = re => b.eval(`(() => { const x = [...document.querySelectorAll(".dialog .dialog-f button")].find(e => ${re}.test(e.innerText)); x && x.click(); return !!x; })()`);
  await clickDlg(/Reject/); await sleep(300);
  await b.eval(`document.querySelector(".tr-reject .chip").click()`); await sleep(100);
  ok(/Hello/.test(await b.eval(`document.querySelector(".tr-reject textarea").value`)), "choosing a reason writes a friendly message the admin can edit");
  await b.eval(`(() => { const n = document.querySelector(".tr-reject textarea"); n.value = "Hello! The amount was 10,000 LAK short. Please transfer the rest and send both slips."; })()`);
  await clickDlg(/Reject/); await sleep(1500);
  const o1 = await api(`return await api.pay.order(${J(id)});`);
  ok(o1.status === "rejected" && (o1.messages || []).some(m => /10,000 LAK short/.test(m.text)), "the rejection carries the message", o1.messages);

  step("learner: an alert with the reason, the message on the order");
  await login("free@demo.laolao");
  ok(/not approved/.test(await spot()), "the learner gets an alert card: the slip was not approved", await spot());
  await b.screenshot(path.join(SHOTS, "notify-learner-rejected.png"));
  await go("transfer", { order: id });
  ok(/10,000 LAK short/.test(await b.eval(`(document.querySelector(".tr-thread") || {}).innerText || ""`)), "the transfer page shows the team's message");
  await b.eval(`document.querySelector(".topbar .nb").click()`); await sleep(700);
  const panel = await b.eval(`(document.querySelector(".npanel") || {}).innerText || ""`);
  ok(/not approved/.test(panel) && /amount/i.test(panel), "the panel lists the update with the reason", panel.slice(0, 200));
  ok(!(await badge()), "opening the panel clears the unread count");
  await b.screenshot(path.join(SHOTS, "notify-learner-panel.png"));
  await b.eval(`[...document.querySelectorAll(".npanel-tabs button")][1].click()`); await sleep(400);
  ok(await b.eval(`!!document.querySelector(".scal-plan") && document.querySelectorAll(".scal-item").length >= 1`), "the Smart Calendar shows the plan card and a time line");
  await b.eval(`document.querySelector(".npanel .ib").click()`); await sleep(300);
  await api(`await api.pay.submitSlip(${J(id)}, { image: ${J(SLIP.replace("ADUlEQVR42mNk", "ADUlEQVR42mNg"))}, ref: "N-2" }); await api._flush(); return 1;`);

  step("admin: a message on an order, then approve");
  await login("admin@demo.laolao", "/admin/");
  await adminGo("payments", { tab: "orders" });
  await b.eval(`[...document.querySelectorAll("tbody tr.clickable")].find(r => r.innerText.includes(${J(id)})).click()`); await sleep(1200);
  await b.eval(`(() => { const box = document.querySelector(".dialog .msg-box"); box.open = true; box.querySelector("textarea").value = "Thanks, we got the second slip. Checking now!"; box.querySelector(".msg-write button").click(); })()`); await sleep(1000);
  ok(((await api(`return await api.pay.order(${J(id)});`)).messages || []).some(m => /second slip/.test(m.text)), "the admin can write to the learner from any order");
  await b.eval(`document.querySelector(".dialog .dialog-h .ib, .dialog .dialog-f button")?.click()`); await sleep(500);
  await api(`const r = await api.pay.review(${J(id)}, true, { ref: "N-2-OK" }); await api._flush(); return r;`);

  step("learner: 'Premium is open' with confetti, the plan unlocked");
  await login("free@demo.laolao");
  ok(/Premium is open/.test(await spot()) && await b.eval(`!!document.querySelector(".nspot-party")`), "an alert card with confetti: Premium is open", await spot());
  await b.screenshot(path.join(SHOTS, "notify-learner-approved.png"));
  ok((await api(`const { A } = await import("/js/learner/core.js"); return A.ent && A.ent.planId;`)) === "premium", "the plan is unlocked without signing out");
  await b.eval(`document.querySelector(".topbar .nb").click()`); await sleep(500);
  await b.eval(`[...document.querySelectorAll(".npanel-tabs button")][1].click()`); await sleep(400);
  const sc = await b.eval(`({ left: document.querySelector(".scal-ring b")?.innerText, plan: document.querySelector(".scal-plan")?.innerText || "", items: [...document.querySelectorAll(".scal-item b")].map(x => x.innerText) })`);
  ok(+sc.left >= 28 && /Premium/.test(sc.plan) && sc.items.some(x => /ends/.test(x)) && sc.items.some(x => /Renew/.test(x)), "Smart Calendar: days left, the end date and when to renew", sc);
  await b.screenshot(path.join(SHOTS, "notify-smart-calendar.png"));
  await b.viewport(390, 844, true); await sleep(500);
  ok(await b.eval(`(() => { const r = document.querySelector(".npanel").getBoundingClientRect(); return Math.abs(r.bottom - innerHeight) < 2 && document.documentElement.scrollWidth <= innerWidth + 1; })()`), "phone: the panel is a bottom sheet, no sideways scroll");
  await b.screenshot(path.join(SHOTS, "notify-phone.png"));
  await b.viewport(1366, 900, false);

  step("admin: clearing out orders (paid ones are kept)");
  await login("admin@demo.laolao", "/admin/");
  const stale = await api(`const ids = []; for (const s of ["expired", "cancelled"]){ const id = "LLH-" + (s === "expired" ? "00000000E1" : "00000000C1");
    await api.db.set("orders/" + id, { uid: "x", planId: "premium", cycle: "month", amount: 1, currency: "LAK", status: s, createdAt: Date.now() - 30 * 864e5 }); ids.push(id); } await api._flush(); return ids;`);
  await adminGo("payments", { tab: "orders" });
  ok(await b.eval(`[...document.querySelectorAll(".toolbar button")].some(x => /Clean up \\(\\d+\\)/.test(x.innerText))`), "a Clean up button with how many old unpaid orders");
  ok(await b.eval(`[...document.querySelectorAll("tbody tr")].find(r => r.innerText.includes(${J(id)}))?.querySelector(".ord-lock") != null`), "a paid order cannot be selected for deletion (lock)");
  await b.eval(`[...document.querySelectorAll("tbody tr")].filter(r => ${J(stale)}.some(i => r.innerText.includes(i))).forEach(r => { const c = r.querySelector("input[type=checkbox]"); c.checked = true; c.dispatchEvent(new Event("change")); })`); await sleep(300);
  ok(/2 selected/.test(await b.eval(`document.querySelector(".ord-bulk").innerText`)), "selecting orders shows the delete bar");
  await b.screenshot(path.join(SHOTS, "notify-admin-orders.png"));
  const del = await api(`return await api.pay.deleteOrders(${J([...stale, id])});`);
  ok(del.deleted === 2 && del.kept === 1 && !(await api(`return await api.db.get("orders/${stale[0]}");`)) && !!(await api(`return await api.db.get("orders/${id}");`)), "unpaid orders are deleted; the paid one is kept", del);
  ok((await api(`await api.auth.signOut(); return 1;`)) === 1, "signed out");
  ok(!errors().length, "no console errors", errors());
} catch(e){ console.log("  FAIL crashed: " + (e && e.stack || e)); failed++; }

console.log(failed ? `\n${failed} notification checks FAILED` : "\nAll notification checks passed");
await b.close?.(); srv.close?.();
process.exit(failed ? 1 : 0);
