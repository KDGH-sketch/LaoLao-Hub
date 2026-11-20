// Pay by bank transfer with a slip that an admin approves, in DEMO mode (js/learner/views-transfer.js, js/admin/payments.js,
// ll_submit_slip / ll_review_slip mirrored in js/shared/billing.js; docs/PAYMENTS.md → Bank transfer):
// cards unavailable when no provider is connected → the transfer is chosen; the QR, account, exact amount and order code;
// uploading a slip; the admin's queue opens first; reject with a reason → the learner sees it and sends a new slip;
// approve → the plan opens; a learner cannot approve; one bank reference cannot pay two orders; the same image twice is
// flagged; phone layout; no console errors.
// Run: node scripts/e2e_transfer.mjs   (Chrome or Edge required)
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
const text = () => b.eval(`document.body.innerText`);
const errors = () => b.consoleLog.filter(l => /^exception|^error/.test(l) && !/favicon|net::ERR|Failed to load resource/i.test(l));
const api = expr => b.eval(`(async () => { const { getApi } = await import("/js/api/index.js"); const api = await getApi(); ${expr} })()`);
const go = (v, p = {}) => b.eval(`import("/js/learner/main.js").then(m => m.go(${J(v)}, ${J(p)}))`).then(() => sleep(1300));
// a slip "screenshot" drawn in the page (different text gives a different image)
const SLIP = label => `(() => { const c = document.createElement("canvas"); c.width = 600; c.height = 900; const g = c.getContext("2d");
  g.fillStyle = "#e8f5e9"; g.fillRect(0, 0, 600, 900); g.fillStyle = "#1b5e20"; g.font = "bold 44px sans-serif"; g.fillText("Transfer successful", 40, 140);
  g.font = "32px sans-serif"; g.fillText(${J(label)}, 40, 240); g.fillText("Ref 2611201234567", 40, 300); return c; })()`;
async function login(email, where = "/"){
  await b.eval(`(async () => { try { const { getApi } = await import("/js/api/index.js"); await (await getApi()).auth.signOut(); } catch(e){} try { localStorage.removeItem("laolao.demo.session"); } catch(e){} })()`).catch(() => {});
  await b.goto(srv.base + where + (where.includes("?") ? "&" : "?") + "r=" + Date.now()); await b.waitFor(`!!document.querySelector("#em") || !!document.querySelector(".app")`, 60000);
  await b.eval(`try { localStorage.setItem("xuelu.lang", "en"); } catch(e){}`);
  await b.eval(`(() => { const e = document.querySelector("#em"), p = document.querySelector("#pw"); e.value = ${J(email)}; p.value = "demo1234"; (e.form || p.form).requestSubmit(); })()`);
  await b.waitFor(`!!document.querySelector(".app")`, 30000); await sleep(1200);
}
async function uploadSlip(label, ref){
  await b.eval(`(async () => { const c = ${SLIP(label)}; const blob = await new Promise(r => c.toBlob(r, "image/png"));
    const f = new File([blob], "slip.png", { type: "image/png" }); const dt = new DataTransfer(); dt.items.add(f);
    const i = document.querySelector(".tr-drop input[type=file]"); i.files = dt.files; i.dispatchEvent(new Event("change", { bubbles: true })); })()`);
  await b.waitFor(`!document.querySelector(".tr-send")?.disabled`, 15000).catch(() => {});
  if (ref) await b.eval(`(() => { const r = document.querySelector("#tr-ref"); r.value = ${J(ref)}; })()`);
  await b.eval(`document.querySelector(".tr-send").click()`); await sleep(1200);
}
const orderNow = () => b.eval(`(new URLSearchParams(location.hash.split("?")[1] || "").get("order")) || (sessionStorage.getItem("laolao.lastOrder") || "")`);

try {
  step("checkout: no card provider → bank transfer");
  await b.goto(srv.base + "/"); await b.waitFor(`!!document.querySelector("#em") || !!document.querySelector(".app")`, 60000);
  await login("free@demo.laolao");
  // pretend the live payments function is not deployed: cards cannot work, the transfer still can
  await b.eval(`(async () => { const { getApi } = await import("/js/api/index.js"); const api = await getApi(); window.__cfg = api.pay.config; window.__live = api.pay.live;
    api.pay.config = async () => ({ provider: null, methods: [] }); api.pay.live = true; })()`);
  await go("checkout", { plan: "premium", cycle: "month" });
  const co = await b.eval(`({ methods: [...document.querySelectorAll(".bill-method")].map(x => x.innerText.split("\\n")[0]), chosen: document.querySelector(".bill-method.on")?.innerText || "",
    off: document.querySelectorAll(".bill-method.off").length, note: !!document.querySelector(".bill-down"), btn: document.querySelector(".bill-pay")?.innerText || "" })`);
  ok(/BCEL One transfer/.test(co.chosen) && co.off >= 2 && co.note && /Continue to transfer/.test(co.btn), "cards show as unavailable, the bank transfer is chosen, with a note", co);
  await b.eval(`(async () => { const { getApi } = await import("/js/api/index.js"); const api = await getApi(); api.pay.config = window.__cfg; api.pay.live = window.__live; })()`);
  await b.eval(`document.querySelector(".bill-pay").click()`); await sleep(1800);
  const id1 = await orderNow();
  const page = await b.eval(`({ qr: !!document.querySelector(".tr-qr img"), amount: document.querySelector(".tr-amount b")?.innerText || "", acct: document.querySelector(".tr-acct")?.innerText || "",
    code: document.querySelector(".tr-ref code")?.innerText || "", steps: document.querySelectorAll(".tr-steps li").length, drop: !!document.querySelector(".tr-drop") })`);
  ok(/^LLH-/.test(id1) && page.qr && /100,000/.test(page.amount) && /0000 1111 2222 333/.test(page.acct) && page.code === id1 && page.steps === 3 && page.drop,
    "the transfer page: QR, the exact amount, the account, the order code for the note, 3 steps, the slip upload", page);
  await b.screenshot(path.join(SHOTS, "transfer-pay-desktop.png"));

  step("the learner sends the slip");
  await uploadSlip("First slip", "BCEL-REF-001");
  ok(await b.eval(`/checking it/.test(document.querySelector(".tr-right").innerText) && document.querySelector(".tr-steps li.now")?.innerText.includes("approve")`), "the page shows 'Slip received: we are checking it'");
  const o1 = await api(`return await api.pay.order(${J(id1)});`);
  ok(o1.status === "review" && o1.slipRef === "BCEL-REF-001", "the order waits for review with the reference", { st: o1.status, ref: o1.slipRef });
  const forbidden = await api(`try { await api.pay.review(${J(id1)}, true, {}); return "approved?!"; } catch(e){ return e.code; }`);
  ok(forbidden === "forbidden", "a learner cannot approve a slip", forbidden);
  await b.screenshot(path.join(SHOTS, "transfer-review-desktop.png"));

  step("the admin rejects it with a reason");
  await login("admin@demo.laolao", "/admin/");
  await b.eval(`(async () => { const st = await import("/js/admin/state.js"); st.go("payments", {}); })()`); await sleep(2500);
  ok(await b.eval(`document.querySelector(".seg button[data-k=transfers]")?.getAttribute("aria-pressed") === "true" && document.querySelectorAll(".tr-adm-card").length >= 1`), "Payments opens on the Transfers waiting, with the slip card");
  await b.eval(`document.querySelector(".tr-adm-card").click()`); await sleep(1500);
  ok(await b.eval(`!!document.querySelector(".tr-review .tr-big img") && /100,000/.test(document.querySelector(".tr-expect").innerText)`), "the review shows the slip large and the expected amount");
  await b.screenshot(path.join(SHOTS, "transfer-admin-review.png"));
  const clickDlg = re => b.eval(`(() => { const x = [...document.querySelectorAll(".dialog .dialog-f button")].find(e => ${re}.test(e.innerText)); x && x.click(); return !!x; })()`);
  await clickDlg(/Reject/); await sleep(300);
  await b.eval(`document.querySelector(".tr-reject .chip").click()`); await sleep(100);
  await clickDlg(/Reject/); await sleep(1500);
  const o2 = await api(`return await api.pay.order(${J(id1)});`);
  ok(o2.status === "rejected" && /amount/i.test(o2.rejectReason || ""), "rejected with the reason", { st: o2.status, r: o2.rejectReason });

  step("the learner sees why and sends a new slip");
  await login("free@demo.laolao");
  await go("transfer", { order: id1 });
  ok(/could not approve/.test(await b.eval(`document.querySelector(".tr-rejected")?.innerText || ""`)) && /amount/i.test(await b.eval(`document.querySelector(".tr-rejected")?.innerText || ""`)), "the learner sees the rejection and its reason");
  await uploadSlip("Second slip", "BCEL-REF-002");
  ok((await api(`return (await api.pay.order(${J(id1)})).status;`)) === "review", "a new slip puts it back in review");

  step("the admin approves: the plan opens");
  await login("admin@demo.laolao", "/admin/");
  await b.eval(`(async () => { const st = await import("/js/admin/state.js"); st.go("payments", {}); })()`); await sleep(2500);
  await b.eval(`document.querySelector(".tr-adm-card").click()`); await sleep(1500);
  await clickDlg(/Approve/); await sleep(1800);
  const o3 = await api(`return await api.pay.order(${J(id1)});`);
  const acc = await api(`const o = await api.pay.order(${J(id1)}); return await api.db.get("access/" + o.uid);`);
  ok(o3.status === "paid" && acc && acc.planId === "premium" && acc.status === "active" && acc.source === "payment", "approved: the order is paid and Premium is active", { st: o3.status, acc: acc && [acc.planId, acc.status] });
  const pay = await api(`return (await api.db.list("payments")).find(p => p.orderId === ${J(id1)});`);
  ok(pay && pay.provider === "transfer" && pay.txnId === "BCEL-REF-002" && pay.verification && pay.verification.approvedBy, "the payment is recorded: transfer, the bank reference, who approved", pay && [pay.provider, pay.txnId]);

  step("safety: one reference, one order; the same image twice");
  await login("free2@demo.laolao".replace("free2", "free"));
  const id2 = await api(`const o = await api.pay.transfer({ planId: "premium", cycle: "year" }); return o.id;`);
  await go("transfer", { order: id2 });
  await uploadSlip("Second slip", "BCEL-REF-002");                    // the very same picture and reference as the paid order
  const o4 = await api(`return await api.pay.order(${J(id2)});`);
  ok(o4.status === "review" && o4.slipDupOf === id1, "the same slip image on another order is flagged", { st: o4.status, dup: o4.slipDupOf });
  await login("admin@demo.laolao", "/admin/");
  const reused = await api(`try { await api.pay.review(${J(id2)}, true, { ref: "BCEL-REF-002" }); return "approved?!"; } catch(e){ return e.code; }`);
  ok(reused === "transaction_reused" && (await api(`return (await api.pay.order(${J(id2)})).status;`)) === "review", "a bank reference already used cannot pay a second order", reused);

  step("phone");
  await login("free@demo.laolao");
  await b.viewport(390, 844, true);
  await go("transfer", { order: id2 }); await sleep(600);
  ok(await b.eval(`document.documentElement.scrollWidth <= innerWidth + 1 && !!document.querySelector(".tr-amount")`), "phone: no sideways scroll");
  await b.screenshot(path.join(SHOTS, "transfer-phone.png"));
  await b.viewport(1366, 900, false);
  ok(!errors().length, "no console errors", errors());
} catch(e){ console.log("  FAIL crashed: " + (e && e.stack || e)); failed++; }

console.log(failed ? `\n${failed} transfer checks FAILED` : "\nAll transfer checks passed");
await b.close?.(); srv.close?.();
process.exit(failed ? 1 : 0);
