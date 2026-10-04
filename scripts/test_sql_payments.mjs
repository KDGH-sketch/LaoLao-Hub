// Payments in the database: orders with a server-side price snapshot, activation only with the service key,
// amount / currency / duplicate checks, renew / upgrade (credited days) / downgrade / cancel / refund / expiry,
// row-level security against a learner tampering from the browser, and parity with js/shared/billing.js.
// Run: npm run test:sql   (embedded Postgres, nothing online)
import { createSupabaseDb } from "./lib/pg-supabase.mjs";
import * as B from "../js/shared/billing.js";

let pass = 0, fail = 0;
const ok = (c, m) => { c ? pass++ : fail++; console.log((c ? "  PASS " : "  FAIL ") + m); };
const near = (a, b, tol = 5000) => a != null && b != null && Math.abs(+a - +b) <= tol;
const { db, as, put, row, rows, rpc } = await createSupabaseDb();
ok(true, "schema with payment functions runs (including the payments self-test)");

const U = { free:"11111111-1111-1111-1111-111111111111", basic:"22222222-2222-2222-2222-222222222222", granted:"33333333-3333-3333-3333-333333333333",
            expired:"44444444-4444-4444-4444-444444444444", sus:"55555555-5555-5555-5555-555555555555", adm:"66666666-6666-6666-6666-666666666666",
            other:"77777777-7777-7777-7777-777777777777" };
const DAY = 86400000, now = Date.now();
const PAY = { enabled:true, methods:["mastercard","visa","onepay"], currency:{ mastercard:"USD", visa:"USD", onepay:"LAK" } };
const seed = {
  plans: {
    free: { name:{ en:"Free" }, tier:1 },
    standard: { name:{ en:"Basic" }, tier:2, prices:{ month:{ LAK:50000, USD:3 }, year:{ LAK:500000, USD:30 } } },
    premium: { name:{ en:"Premium" }, tier:3, prices:{ month:{ LAK:100000, USD:6 }, year:{ LAK:1000000, USD:60 } } },
    old: { name:{ en:"Old" }, tier:2, active:false, prices:{ month:{ USD:1 } } }
  },
  settings: { app:{ defaultPlanId:"free", allowRegistration:true, payments: PAY }, bootstrap:{ uid: U.adm } },
  users: Object.fromEntries(["free","basic","granted","expired","sus","other"].map(k => [U[k], { status:"active", role:"learner", email:k+"@x" }])),
  access: {
    [U.free]: { planId:"free", tier:1, status:"active" },
    [U.basic]: { planId:"standard", tier:2, status:"active", source:"payment", billingCycle:"month", start: now - 15*DAY, expiresAt: now + 15*DAY, orderId:"LLH-BASIC00001" },
    [U.granted]: { planId:"premium", tier:3, status:"active", source:"manual", expiresAt:null },
    [U.expired]: { planId:"premium", tier:3, status:"active", source:"payment", billingCycle:"month", expiresAt: now - DAY },
    [U.sus]: { planId:"premium", tier:3, status:"suspended" },
    [U.other]: { planId:"free", tier:1, status:"active" }
  },
  orders: { "LLH-BASIC00001": { uid:U.basic, planId:"standard", cycle:"month", currency:"USD", amount:3, status:"paid", kind:"new", createdAt: now - 15*DAY } },
  admins: { [U.adm]: { role:"super", status:"active" } }
};
for (const [t, r] of Object.entries(seed)) for (const [id, d] of Object.entries(r)) await put(t, id, d);

// JS mirror over a snapshot of the same rows
async function snapshot(){
  const S = {};
  for (const t of ["plans","settings","users","access","orders","payments","admins","subscriptions"]) S[t] = Object.fromEntries((await rows(t)).map(r => { const { id, ...d } = r; return [id, d]; }));
  return { get: (t, id) => (S[t] && S[t][id]) ? JSON.parse(JSON.stringify(S[t][id])) : null, list: t => Object.entries(S[t] || {}).map(([id, d]) => Object.assign({ id }, d)),
           put: (t, id, d) => { const { id: _x, ...rest } = d; (S[t] = S[t] || {})[id] = rest; }, S };
}
const err = async (who, q, params) => as(who, async () => { try { await db.query(q, params); return null; } catch(e){ return e.message; } });
const asRpc = (who, name, args) => as(who, () => rpc(name, args));

console.log("ordering: the server decides the price");
const o1 = await asRpc(U.free, "ll_create_order", { p_plan:"premium", p_cycle:"month", p_method:"mastercard", p_return:"tone_lab" });
ok(o1.ok && o1.amount === 6 && o1.currency === "USD" && o1.status === "created" && o1.kind === "new" && /^LLH-[0-9A-F]{10}$/.test(o1.id), "order: Premium monthly by Mastercard = 6 USD (from the plan), LLH number");
ok(o1.returnTo === "tone_lab", "return target kept");
const o1b = await asRpc(U.free, "ll_create_order", { p_plan:"premium", p_cycle:"month", p_method:"mastercard", p_return:"tone_lab" });
ok(o1b.id === o1.id && o1b.reused === true, "double click: the same open order is reused");
const qr = await asRpc(U.free, "ll_create_order", { p_plan:"premium", p_cycle:"year", p_method:"onepay", p_return:"https://evil.example/steal" });
ok(qr.ok && qr.currency === "LAK" && qr.amount === 1000000 && qr.returnTo === null, "QR order in LAK (1,000,000 yearly); a URL as return target is dropped");
for (const [args, reason, label] of [
  [{ p_plan:"premium", p_cycle:"month", p_method:"amex" }, "method_unavailable", "method not enabled"],
  [{ p_plan:"free", p_cycle:"month", p_method:"visa" }, "not_for_sale", "free plan cannot be bought"],
  [{ p_plan:"old", p_cycle:"month", p_method:"visa" }, "plan_unavailable", "inactive plan"],
  [{ p_plan:"premium", p_cycle:"week", p_method:"visa" }, "bad_cycle", "unknown billing cycle"],
  [{ p_plan:"nope", p_cycle:"month", p_method:"visa" }, "plan_unavailable", "unknown plan"]])
  ok((await asRpc(U.free, "ll_create_order", Object.assign({ p_return:null }, args))).reason === reason, "refused: " + label + " (" + reason + ")");
ok((await asRpc(U.adm, "ll_create_order", { p_plan:"premium", p_cycle:"month", p_method:"visa", p_return:null })).reason === "admin_account", "admins do not buy plans");
ok((await asRpc(U.sus, "ll_create_order", { p_plan:"premium", p_cycle:"month", p_method:"visa", p_return:null })).reason === "account_suspended", "suspended account cannot buy");
ok((await asRpc(null, "ll_create_order", { p_plan:"premium", p_cycle:"month", p_method:"visa", p_return:null }).catch(e => ({ reason:"denied" }))).reason === "denied", "not signed in: refused");

console.log("tampering from the browser (signed in as the learner)");
ok(!!(await err(U.free, `insert into public.orders (id, data) values ('LLH-FAKE', '{"uid":"${U.free}","status":"paid","amount":0}')`)), "cannot insert an order");
await as(U.free, () => db.query(`update public.orders set data = data || '{"status":"paid","amount":0}' where id = $1`, [o1.id]));
ok((await row("orders", o1.id)).status === "created" && (await row("orders", o1.id)).amount === 6, "cannot mark own order paid or change its amount");
ok(!!(await err(U.free, `insert into public.payments (id, data) values ('x__1', '{"status":"paid"}')`)), "cannot insert a payment");
await as(U.free, () => db.query(`update public.access set data = data || '{"planId":"premium","tier":3}' where id = $1`, [U.free]));
ok((await row("access", U.free)).planId === "free", "cannot change own access");
for (const [fn, args] of [["ll_activate_order", { p_order:o1.id, p_pay:{ provider:"mock", txnId:"T1", amount:6, currency:"USD" } }], ["ll_refund_order", { p_order:o1.id, p_info:{} }],
    ["ll_fail_order", { p_order:o1.id, p_status:"failed", p_info:{} }], ["ll_order_checkout", { p_order:o1.id, p_provider:"mock", p_ref:{} }], ["ll_quote", { p_uid:U.basic, p_plan:"premium", p_cycle:"month", p_currency:"USD" }]]){
  const e = await as(U.free, async () => { try { await rpc(fn, args); return null; } catch(e){ return e.message; } });
  ok(/permission denied/i.test(e || ""), fn + ": learners cannot call it");
}
ok((await row("access", U.free)).planId === "free" && (await row("orders", o1.id)).status === "created", "nothing changed after the attempts");
const seen = await as(U.free, async () => (await db.query(`select id from public.orders`)).rows.map(r => r.id));
ok(seen.length === 2 && seen.includes(o1.id), "learner sees only their own orders");
ok((await as(U.other, async () => (await db.query(`select id from public.orders`)).rows.length)) === 0, "another learner sees none of them");
ok((await as(U.adm, async () => (await db.query(`select id from public.orders`)).rows.length)) >= 3, "support / super admin sees all orders");
ok(!!(await err(U.adm, `update public.orders set data = data || '{"status":"paid"}' where id = '${o1.id}' returning id`)) || (await row("orders", o1.id)).status === "created", "even an admin cannot mark an order paid by hand");

console.log("verified payment (service key, as the Edge Function does)");
const ck = await asRpc("service", "ll_order_checkout", { p_order:o1.id, p_provider:"mock", p_ref:{ session:"s1" } });
ok(ck.ok && ck.status === "pending", "checkout opened: pending");
const snap1 = await snapshot();
const wrongAmt = await asRpc("service", "ll_activate_order", { p_order:o1.id, p_pay:{ provider:"mock", txnId:"T-A", amount:1, currency:"USD" } });
ok(!wrongAmt.ok && wrongAmt.reason === "amount_mismatch" && (await row("access", U.free)).planId === "free", "wrong amount: refused, no access");
const wrongCur = await asRpc("service", "ll_activate_order", { p_order:o1.id, p_pay:{ provider:"mock", txnId:"T-C", amount:6, currency:"LAK" } });
ok(!wrongCur.ok && wrongCur.reason === "currency_mismatch", "wrong currency: refused");
ok((await row("orders", o1.id)).needsReview === true && (await row("orders", o1.id)).status === "pending", "order flagged for review, still pending");
ok(!(await asRpc("service", "ll_activate_order", { p_order:o1.id, p_pay:{ provider:"mock", amount:6, currency:"USD" } })).ok, "payment without a transaction id: refused");
const act = await asRpc("service", "ll_activate_order", { p_order:o1.id, p_pay:{ provider:"mock", txnId:"T-1", amount:6, currency:"USD", method:"mastercard", brand:"Mastercard", last4:"5555 4444 3333 4521", verification:{ signature:true } } });
const acc1 = await row("access", U.free);
ok(act.ok && acc1.planId === "premium" && acc1.status === "active" && acc1.source === "payment" && acc1.billingCycle === "month" && acc1.orderId === o1.id, "paid: access is Premium, source payment");
ok(near(acc1.expiresAt, B.cycleEnd(now, "month"), 60000), "valid for one calendar month");
const pay1 = await row("payments", "mock__T-1");
ok(pay1 && pay1.status === "paid" && pay1.last4 === "4521" && !JSON.stringify(pay1).includes("5555"), "payment stored with the last 4 digits only");
ok((await row("orders", o1.id)).status === "paid", "order paid");
ok((await rows("subscriptions")).some(s => s.orderId === o1.id && s.action === "new" && s.source === "payment" && s.amount === 6), "subscription history row (source payment, amount)");
const ent = await asRpc(U.free, "ll_entitlements", {});
ok(ent.planId === "premium" && ent.tier === 3, "entitlements now Premium, tier 3 (no sign-out needed)");
// JS mirror gives the same result on the same rows
const js1 = B.activateOrder(snap1, o1.id, { provider:"mock", txnId:"T-1", amount:6, currency:"USD" }, Date.now());
const jsAcc = snap1.get("access", U.free);
ok(js1.ok && jsAcc.planId === acc1.planId && near(jsAcc.expiresAt, acc1.expiresAt) && jsAcc.source === "payment", "JS mirror: same activation");

console.log("duplicates and replays");
const again = await asRpc("service", "ll_activate_order", { p_order:o1.id, p_pay:{ provider:"mock", txnId:"T-1", amount:6, currency:"USD" } });
ok(again.ok && again.already, "same callback twice: already processed");
const subsN = (await rows("subscriptions")).filter(s => s.orderId === o1.id).length;
ok(subsN === 1 && near((await row("access", U.free)).expiresAt, acc1.expiresAt, 0), "one subscription row, period not extended twice");
const dup = await asRpc("service", "ll_activate_order", { p_order:o1.id, p_pay:{ provider:"mock", txnId:"T-2", amount:6, currency:"USD" } });
ok(!dup.ok && dup.reason === "order_already_paid" && (await row("payments", "mock__T-2")).status === "duplicate", "second payment for a paid order: recorded as duplicate for refund, no extra time");
const reuse = await asRpc("service", "ll_activate_order", { p_order:qr.id, p_pay:{ provider:"mock", txnId:"T-1", amount:1000000, currency:"LAK" } });
ok(!reuse.ok && reuse.reason === "transaction_reused" && (await row("orders", qr.id)).status === "created", "a transaction id cannot pay a second order");

console.log("renew, upgrade with credited days, downgrade, cancel");
const snapQ = await snapshot();
const qRenew = await asRpc("service", "ll_quote", { p_uid:U.free, p_plan:"premium", p_cycle:"month", p_currency:"USD" });
const jRenew = B.quote(snapQ, U.free, "premium", "month", "USD", Date.now());
ok(qRenew.ok && qRenew.kind === "renew" && near(qRenew.endsAt, B.cycleEnd(acc1.expiresAt, "month"), 60000), "same plan again = renew from the current end date");
ok(jRenew.kind === qRenew.kind && near(jRenew.endsAt, qRenew.endsAt), "JS mirror: same renew quote");
const qUp = await asRpc("service", "ll_quote", { p_uid:U.basic, p_plan:"premium", p_cycle:"month", p_currency:"USD" });
const jUp = B.quote(snapQ, U.basic, "premium", "month", "USD", Date.now());
ok(qUp.ok && qUp.kind === "upgrade" && qUp.creditDays === 7 && qUp.fromPlan === "standard", "Basic → Premium: upgrade, 15 days × (3/30) ÷ (6/30) = 7 days credited");
ok(jUp.kind === "upgrade" && jUp.creditDays === qUp.creditDays && near(jUp.endsAt, qUp.endsAt), "JS mirror: same upgrade quote");
const up = await asRpc(U.basic, "ll_create_order", { p_plan:"premium", p_cycle:"month", p_method:"visa", p_return:"dict" });
const upAct = await asRpc("service", "ll_activate_order", { p_order:up.id, p_pay:{ provider:"mock", txnId:"T-UP", amount:6, currency:"USD" } });
ok(upAct.ok && upAct.kind === "upgrade" && near((await row("access", U.basic)).expiresAt, B.cycleEnd(Date.now(), "month") + 7*DAY, 60000), "upgrade paid: Premium now, one month + 7 days");
const down = await asRpc(U.free, "ll_create_order", { p_plan:"standard", p_cycle:"month", p_method:"visa", p_return:null });
ok(!down.ok && down.reason === "downgrade_at_period_end", "buying a lower plan while Premium runs: refused (downgrade happens at period end)");
const sch = await asRpc(U.free, "ll_schedule_plan", { p_plan:"standard" });
ok(sch.ok && (await row("access", U.free)).scheduledPlanId === "standard" && (await row("access", U.free)).planId === "premium", "downgrade scheduled; Premium stays until the end date");
ok((await asRpc(U.free, "ll_schedule_plan", { p_plan:"premium" })).reason === "not_a_downgrade", "scheduling the same tier is refused");
ok((await asRpc(U.granted, "ll_schedule_plan", { p_plan:"standard" })).reason === "no_paid_plan", "admin-granted access has nothing to schedule");
ok((await asRpc(U.free, "ll_set_cancel", { p_cancel:true })).ok && (await row("access", U.free)).cancelAtPeriodEnd === true && (await asRpc(U.free, "ll_entitlements", {})).planId === "premium", "cancel at period end: flag set, still Premium");
ok((await asRpc(U.free, "ll_set_cancel", { p_cancel:false })).ok && (await row("access", U.free)).cancelAtPeriodEnd === false, "reactivate");
ok((await rows("subscriptions")).filter(s => s.uid === U.free && ["cancel_at_period_end","reactivate","schedule_downgrade"].includes(s.action)).length === 3, "each change is in the subscription history");

console.log("failed, cancelled, pending, expired");
const ex = await asRpc(U.expired, "ll_create_order", { p_plan:"premium", p_cycle:"month", p_method:"visa", p_return:null });
ok(ex.ok && ex.kind === "new", "expired Premium buys again: a new period");
ok((await asRpc(U.expired, "ll_entitlements", {})).planId === "free", "until then the expired account is on Free");
ok((await asRpc("service", "ll_fail_order", { p_order:ex.id, p_status:"failed", p_info:{ reason:"DECLINE" } })).status === "failed" && (await asRpc(U.expired, "ll_entitlements", {})).planId === "free", "declined: order failed, still Free");
const ex2 = await asRpc(U.expired, "ll_create_order", { p_plan:"premium", p_cycle:"month", p_method:"visa", p_return:null });
ok(ex2.ok && ex2.id !== ex.id, "try again: a new order");
ok((await asRpc(U.expired, "ll_cancel_my_order", { p_order:ex2.id })).status === "cancelled", "learner closes the checkout: cancelled");
ok((await asRpc(U.other, "ll_cancel_my_order", { p_order:ex.id })).reason === "order_not_found", "cannot cancel someone else's order");
const late = await asRpc("service", "ll_activate_order", { p_order:ex2.id, p_pay:{ provider:"mock", txnId:"T-LATE", amount:6, currency:"USD" } });
ok(late.ok && (await asRpc(U.expired, "ll_entitlements", {})).planId === "premium", "money that still arrives for a cancelled checkout is honoured");
await put("orders", "LLH-STALE00001", { uid:U.other, planId:"premium", cycle:"month", method:"visa", currency:"USD", amount:6, status:"created", kind:"new", createdAt: now - 2*3600000 });
await asRpc(U.other, "ll_create_order", { p_plan:"premium", p_cycle:"year", p_method:"visa", p_return:null });
ok((await row("orders", "LLH-STALE00001")).status === "expired", "checkouts left open for over an hour expire");
const pend = await asRpc(U.other, "ll_create_order", { p_plan:"premium", p_cycle:"month", p_method:"onepay", p_return:null });
await asRpc("service", "ll_order_checkout", { p_order:pend.id, p_provider:"mock", p_ref:{} });
ok((await asRpc(U.other, "ll_entitlements", {})).planId === "free", "pending payment: no access yet");

console.log("refunds and expiry");
const r1 = await asRpc("service", "ll_refund_order", { p_order:o1.id, p_info:{ reason:"requested", ref:"RF-1", by:U.adm } });
ok(r1.ok && r1.accessEnded === true && (await row("orders", o1.id)).status === "refunded" && (await row("payments", "mock__T-1")).status === "refunded", "refund confirmed: order and payment refunded");
ok((await asRpc(U.free, "ll_entitlements", {})).planId === "free", "access ended: back to Free");
ok((await rows("subscriptions")).some(s => s.orderId === o1.id && s.action === "refund"), "refund in the subscription history");
ok((await asRpc("service", "ll_refund_order", { p_order:o1.id, p_info:{} })).already === true, "refunding twice does nothing");
ok((await asRpc("service", "ll_refund_order", { p_order:pend.id, p_info:{} })).reason === "order_not_paid", "an unpaid order cannot be refunded");
ok((await rows("payments")).every(p => p.uid !== U.granted) && (await asRpc(U.granted, "ll_entitlements", {})).planId === "premium", "admin-granted Premium works with no payment records");

console.log("JS mirror: quotes for every account");
const snapZ = await snapshot();
let same = 0, total = 0;
for (const uid of Object.values(U)) for (const plan of ["standard","premium","free","old"]) for (const cyc of ["month","year"]) for (const cur of ["USD","LAK"]){
  total++;
  const s = await asRpc("service", "ll_quote", { p_uid:uid, p_plan:plan, p_cycle:cyc, p_currency:cur });
  const j = B.quote(snapZ, uid, plan, cyc, cur, Date.now());
  if (s.ok === j.ok && (s.reason || null) === (j.reason || null) && (s.amount ?? null) === (j.amount ?? null) && (s.kind || null) === (j.kind || null)
      && (s.creditDays ?? null) === (j.creditDays ?? null) && (s.endsAt == null ? j.endsAt == null : near(s.endsAt, j.endsAt))) same++;
  else console.log("    differs:", uid.slice(0, 4), plan, cyc, cur, JSON.stringify(s), JSON.stringify(j));
}
ok(same === total, `SQL and JavaScript agree on ${same}/${total} quotes`);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
