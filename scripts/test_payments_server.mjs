// The payments Edge Function (supabase/functions/payments) run in Node against the embedded database:
// checkout → provider callback → access, with forged / replayed / tampered callbacks, fake "success" returns,
// duplicates, refunds, and the BCEL (CyberSource Secure Acceptance) signing. Nothing goes online.
// Run: npm run test:sql
import { createSupabaseDb } from "./lib/pg-supabase.mjs";
import { createHandler } from "../supabase/functions/payments/handler.js";
import { pickProviders } from "../supabase/functions/payments/providers/index.js";
import { bcelProvider } from "../supabase/functions/payments/providers/bcel.js";
import { hmacBase64 } from "../supabase/functions/payments/crypto.js";

let pass = 0, fail = 0;
const ok = (c, m) => { c ? pass++ : fail++; console.log((c ? "  PASS " : "  FAIL ") + m); };
const { db, as, put, row, rows, rpc } = await createSupabaseDb();
const U = { a:"11111111-1111-1111-1111-111111111111", b:"22222222-2222-2222-2222-222222222222", adm:"33333333-3333-3333-3333-333333333333" };
const TOKENS = { "tok-a": U.a, "tok-b": U.b, "tok-adm": U.adm };
await put("plans", "free", { tier:1, name:{ en:"Free" } });
await put("plans", "premium", { tier:3, name:{ en:"Premium" }, prices:{ month:{ USD:6, LAK:100000 }, year:{ USD:60, LAK:1000000 } } });
await put("settings", "app", { defaultPlanId:"free", payments:{ enabled:true, methods:["mastercard","visa","onepay"], currency:{ mastercard:"USD", visa:"USD", onepay:"LAK" } } });
await put("settings", "bootstrap", { uid:U.adm });
await put("admins", U.adm, { role:"super", status:"active" });
for (const k of ["a","b"]){ await put("users", U[k], { status:"active", role:"learner" }); await put("access", U[k], { planId:"free", tier:1, status:"active" }); }

// The function's database client, backed by the embedded Postgres: a token runs as that learner, no token = service key
const who = token => { if (!token) return "service"; const u = TOKENS[token]; if (!u) throw Object.assign(new Error("JWT invalid"), { status:401 }); return u; };
const testDb = {
  rpc: (name, args, o = {}) => as(who(o.token), () => rpc(name, args)),
  get: (t, id, o = {}) => as(who(o.token), async () => { const r = (await db.query(`select id, data from public."${t}" where id = $1`, [id])).rows[0]; return r ? Object.assign({ id:r.id }, r.data) : null; }),
  paymentsOf: async id => (await rows("payments")).filter(p => p.orderId === id)
};
const env = { PAYMENT_PROVIDER:"mock", PAYMENT_ENV:"staging", PAYMENT_ALLOW_MOCK:"true", PAYMENT_MOCK_SECRET:"test-secret-0123456789",
  PAYMENT_APP_URL:"https://app.example/LaoLao-Hub/", PAYMENT_ALLOWED_ORIGINS:"https://app.example", SUPABASE_URL:"https://proj.supabase.co" };
const providers = pickProviders(env);
const handle = createHandler({ env, db: testDb, providers });
const BASE = "https://proj.supabase.co/functions/v1/payments";
const call = async (method, path, { token, body, form, origin } = {}) => {
  const headers = {}; if (token) headers.authorization = "Bearer " + token; if (origin) headers.origin = origin;
  let b; if (body){ headers["content-type"] = "application/json"; b = JSON.stringify(body); } if (form){ headers["content-type"] = "application/x-www-form-urlencoded"; b = new URLSearchParams(form).toString(); }
  const res = await handle(new Request(BASE + path, { method, headers, body: b }));
  const text = await res.text(); let data = text; try { data = JSON.parse(text); } catch(e){}
  return { status: res.status, data, headers: res.headers };
};
const mock = providers.byId.mock;

console.log("checkout");
ok((await call("GET", "/config")).data.provider === "mock", "config: the test provider is active (staging)");
ok((await call("POST", "/checkout", { body:{ planId:"premium", cycle:"month", method:"mastercard" } })).status === 401, "checkout without signing in: 401");
ok((await call("POST", "/checkout", { token:"forged", body:{ planId:"premium", cycle:"month", method:"mastercard" } })).status === 401, "forged token: 401");
const c1 = await call("POST", "/checkout", { token:"tok-a", origin:"https://app.example", body:{ planId:"premium", cycle:"month", method:"mastercard", returnTo:"dict", amount:0.01, currency:"LAK", uid:U.b, status:"paid" } });
ok(c1.status === 200 && c1.data.order.amount === 6 && c1.data.order.currency === "USD" && c1.data.order.uid === U.a && c1.data.order.status === "pending", "price, currency and account come from the server (browser's amount / uid / status ignored)");
ok(c1.data.checkout.kind === "redirect" && c1.data.checkout.url.includes("/mock/checkout?order=" + c1.data.order.id), "redirects to the provider's checkout page");
ok(c1.headers.get("access-control-allow-origin") === "https://app.example", "CORS only for the app's origin");
const evil = await call("POST", "/checkout", { token:"tok-a", origin:"https://evil.example", body:{ planId:"premium", cycle:"year", method:"visa" } });
ok(!evil.headers.get("access-control-allow-origin"), "other origins get no CORS header");
const id = c1.data.order.id;
ok((await call("GET", "/mock/checkout?order=" + id)).data.includes("no real money"), "test checkout page shows the order");

console.log("fake success and forged callbacks");
const fakeReturn = await call("POST", "/return", { form:{ order:id, outcome:"paid", txn:"X1", amount:"6", currency:"USD", ts:String(Date.now()), sig:"00" } });
ok(fakeReturn.status === 303 && fakeReturn.headers.get("location") === "https://app.example/LaoLao-Hub/#payment?order=" + id, "browser returns with a fake 'paid': sent back to the app…");
ok((await row("access", U.a)).planId === "free" && (await row("orders", id)).status === "pending", "…but nothing is activated");
const st0 = await call("GET", "/status?order=" + id, { token:"tok-a" });
ok(st0.data.order.status === "pending", "status: still pending");
ok((await call("GET", "/status?order=" + id, { token:"tok-b" })).status === 404, "another learner cannot read the order");
const good = await mock.callback({ id, amount:6, currency:"USD", method:"mastercard" }, "paid");
ok((await call("POST", "/webhook", { form:Object.assign({}, good, { amount:"0.5" }) })).status === 401, "tampered amount breaks the signature: 401");
ok((await call("POST", "/webhook", { form:Object.assign({}, good, { order:"LLH-0000000000" }) })).status === 401, "tampered order number: 401");
const oldCb = Object.assign({}, good, { ts:String(Date.now() - 3600000) });
const oldSigned = await mock.callback({ id, amount:6, currency:"USD", method:"mastercard" }, "paid", { ts:String(Date.now() - 3600000) });
ok((await call("POST", "/webhook", { form:oldSigned })).status === 401 && oldCb, "callback older than 15 minutes (replay): 401");
const lowSigned = await mock.callback({ id, amount:1, currency:"USD", method:"mastercard" }, "paid");
const low = await call("POST", "/webhook", { form:lowSigned });
ok(low.status === 200 && low.data.result === "amount_mismatch" && (await row("access", U.a)).planId === "free", "correctly signed but wrong amount: recorded, not activated");
const lakSigned = await mock.callback({ id, amount:6, currency:"LAK", method:"mastercard" }, "paid");
ok((await call("POST", "/webhook", { form:lakSigned })).data.result === "currency_mismatch", "wrong currency: not activated");

console.log("verified payment");
const w1 = await call("POST", "/webhook", { form:good });
ok(w1.status === 200 && w1.data.result === "ok", "signed callback: accepted");
const acc = await row("access", U.a);
ok(acc.planId === "premium" && acc.source === "payment" && acc.orderId === id, "access: Premium from the payment");
const st1 = await call("GET", "/status?order=" + id, { token:"tok-a" });
ok(st1.data.order.status === "paid" && st1.data.order.returnTo === "dict", "status: paid, return to the dictionary");
ok((await as(U.a, () => rpc("ll_entitlements", {}))).planId === "premium", "entitlements refreshed: Premium");
const w2 = await call("POST", "/webhook", { form:good });
ok(w2.data.result === "already_processed" || w2.data.result === "ok", "same callback again: no second activation");
ok((await rows("payments")).filter(p => p.orderId === id && p.status === "paid").length === 1 && (await rows("subscriptions")).filter(s => s.orderId === id).length === 1, "one payment, one subscription row");
const ret = await call("POST", "/return", { form:good });
ok(ret.status === 303 && (await row("access", U.a)).expiresAt === acc.expiresAt, "browser return with the same signed result: redirect, period unchanged");

console.log("declined, cancelled, retry");
const c2 = await call("POST", "/checkout", { token:"tok-b", body:{ planId:"premium", cycle:"year", method:"onepay" } });
ok(c2.data.order.currency === "LAK" && c2.data.order.amount === 1000000, "QR order in LAK");
const declined = await call("POST", "/mock/checkout", { form:{ order:c2.data.order.id, outcome:"failed" } });
ok(declined.status === 303 && (await row("orders", c2.data.order.id)).status === "failed" && (await row("access", U.b)).planId === "free", "declined at checkout: order failed, no access");
const c3 = await call("POST", "/checkout", { token:"tok-b", body:{ planId:"premium", cycle:"year", method:"visa" } });
ok(c3.data.order.id !== c2.data.order.id && c3.data.order.currency === "USD", "try again with another method: a new order");
await call("POST", "/mock/checkout", { form:{ order:c3.data.order.id, outcome:"cancelled" } });
ok((await row("orders", c3.data.order.id)).status === "cancelled" && (await row("access", U.b)).planId === "free", "cancelled at checkout: no access");
const c4 = await call("POST", "/checkout", { token:"tok-b", body:{ planId:"premium", cycle:"year", method:"visa" } });
await call("POST", "/mock/checkout", { form:{ order:c4.data.order.id, outcome:"pending" } });
ok((await row("orders", c4.data.order.id)).status === "pending" && (await row("access", U.b)).planId === "free", "pending: no access until confirmed");
await call("POST", "/mock/checkout", { form:{ order:c4.data.order.id, outcome:"paid" } });
ok((await row("access", U.b)).planId === "premium", "confirmed later: Premium");

console.log("refunds");
ok((await call("POST", "/refund", { token:"tok-a", body:{ orderId:id } })).status === 403, "a learner cannot refund");
const rf = await call("POST", "/refund", { token:"tok-adm", body:{ orderId:id, reason:"requested", by:U.adm } });
ok(rf.status === 200 && rf.data.accessEnded === true && (await row("orders", id)).status === "refunded" && (await row("orders", id)).refundRef === "MOCK-RF-" + id, "super admin refunds through the provider; access ends");
ok((await as(U.a, () => rpc("ll_entitlements", {}))).planId === "free", "back to Free after the confirmed refund");
ok((await call("POST", "/refund", { token:"tok-adm", body:{ orderId:id } })).data.error === "already_refunded", "second refund refused");

console.log("production safety");
const prod = pickProviders(Object.assign({}, env, { PAYMENT_ENV:"production" }));
ok(!prod.byId.mock && !prod.active, "PAYMENT_ENV=production: the test provider is never loaded");
const prodHandle = createHandler({ env:Object.assign({}, env, { PAYMENT_ENV:"production" }), db:testDb, providers:prod });
ok((await prodHandle(new Request(BASE + "/mock/checkout?order=" + id))).status === 404, "production: no test checkout page");
const errRes = await handle(new Request(BASE + "/status?order=LLH-0123456789", { headers:{ authorization:"Bearer tok-a" } }));
ok(errRes.status === 404, "unknown order: 404");

console.log("BCEL / CyberSource Secure Acceptance signing (offline; the real gateway is NOT TESTED)");
const benv = { BCEL_SA_PROFILE_ID:"PROFILE1", BCEL_SA_ACCESS_KEY:"ACCESS1", BCEL_SA_SECRET_KEY:"bcel-secret-key-for-tests" };
const bcel = bcelProvider(benv);
const order = { id:"LLH-ABCDEF0123", amount:6, currency:"USD", method:"mastercard" };
const { checkout } = await bcel.createCheckout(order, { functionUrl:BASE });
const f = checkout.fields;
ok(checkout.kind === "form" && checkout.action.includes("secureacceptance") && f.reference_number === order.id && f.amount === "6.00" && f.currency === "USD" && f.transaction_type === "sale", "hosted checkout form: sale, reference = order number, amount 6.00 USD");
const expectSig = await hmacBase64(benv.BCEL_SA_SECRET_KEY, f.signed_field_names.split(",").map(n => n + "=" + f[n]).join(","));
ok(f.signature === expectSig && f.signed_field_names.includes("amount") && f.signed_field_names.includes("reference_number"), "request signed with HMAC-SHA256 over signed_field_names");
ok(!Object.keys(f).some(k => /card_number|cvn/.test(k)), "no card number or CVV fields: the card is typed on the gateway's page");
const reply = async extra => { const r = Object.assign({ decision:"ACCEPT", reason_code:"100", req_reference_number:order.id, req_amount:"6.00", auth_amount:"6.00", req_currency:"USD",
  transaction_id:"7000000000001", req_card_number:"xxxxxxxxxxxx4521", card_type_name:"Mastercard", req_card_type:"002", req_profile_id:"PROFILE1", req_access_key:"ACCESS1" }, extra);
  r.signed_field_names = Object.keys(r).concat("signed_field_names").join(",");
  r.signature = await hmacBase64(benv.BCEL_SA_SECRET_KEY, r.signed_field_names.split(",").map(n => n + "=" + r[n]).join(",")); return r; };
const acc1 = await bcel.parse(await reply({}));
ok(acc1.outcome === "paid" && acc1.amount === 6 && acc1.currency === "USD" && acc1.last4 === "4521" && acc1.method === "mastercard" && acc1.txnId === "7000000000001", "ACCEPT/100 → paid, 6 USD, Mastercard •••• 4521");
ok((await bcel.parse(await reply({ decision:"DECLINE", reason_code:"203" }))).outcome === "failed", "DECLINE → failed");
ok((await bcel.parse(await reply({ decision:"CANCEL", reason_code:"200" }))).outcome === "cancelled", "CANCEL → cancelled");
ok((await bcel.parse(await reply({ decision:"REVIEW", reason_code:"480" }))).outcome === "pending", "REVIEW → pending (no access until decided)");
const tampered = Object.assign(await reply({}), { req_amount:"0.01", auth_amount:"0.01" });
ok(await bcel.parse(tampered).then(() => false, e => e.status === 401), "tampered reply: signature rejected");
ok(await bcel.parse(await reply({ req_profile_id:"SOMEONE-ELSE" })).then(() => false, e => e.status === 401), "reply for another merchant profile: rejected");

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
