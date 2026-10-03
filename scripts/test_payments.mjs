// Plan-upgrade payment request flow: learner submits a request with proof, admin approves (grants
// access/tier) or rejects (access unchanged), RBAC on the new "orders" menu, duplicate-pending guard.
// Run: node scripts/test_payments.mjs
import { createLocalApi } from "../js/api/local.js";
import fs from "fs";

global.window = {
  addEventListener: () => {}, scrollTo: () => {}, location: { hash: "", protocol: "http:" },
  localStorage: { data:{}, getItem(k){ return this.data[k]||null; }, setItem(k,v){ this.data[k]=String(v); }, removeItem(k){ delete this.data[k]; } }
};
global.localStorage = global.window.localStorage;
global.location = global.window.location;
global.document = { createElement: () => ({ append: () => {}, setAttribute: () => {}, addEventListener: () => {} }), addEventListener: () => {}, querySelector: () => null };
global.fetch = async url => {
  const p = String(url).replace("file://", "").split("?")[0];
  const filePath = p.includes("data/seed.json") ? "data/seed.json" : p;
  if (fs.existsSync(filePath)) return { ok:true, json: async () => JSON.parse(fs.readFileSync(filePath, "utf8")) };
  return { ok:false, status:404 };
};

const { canViewMenu, canEditMenu, S } = await import("../js/admin/state.js");
const { A } = await import("../js/learner/core.js");
const { fetchMyPendingOrder } = await import("../js/learner/payments.js");

let pass = 0, fail = 0;
const assert = (cond, msg) => { if (cond) { pass++; console.log("  ✓ " + msg); } else { fail++; console.log("  ✗ FAIL: " + msg); } };

console.log("=================================================");
console.log("PAYMENT REQUEST FLOW: RBAC, submit, approve, reject");
console.log("=================================================\n");

const api = await createLocalApi();
S.api = api; A.api = api;

const now = Date.now();
const uid = "learner-01";
await api.db.set(`users/${uid}`, { email:"learner@test.local", name:"Test Learner", status:"active", level:1, role:"learner" });
await api.db.set(`access/${uid}`, { planId:"free", tier:1, status:"active", start:new Date(now), expiresAt:null, source:"registration" });
await api.db.set("plans/gold", { name:{en:"Gold"}, tier:2, durationDays:30, price:50000, currency:"LAK", active:true, order:2 });
S.plans = [{ id:"gold", name:{en:"Gold"}, tier:2, durationDays:30, price:50000, currency:"LAK", active:true }];

console.log("--- 1. RBAC on the new 'orders' menu ---");
S.me = { uid:"super-01", email:"super@test.local", role:"super" };
assert(canViewMenu("orders"), "Super Admin CAN view 'orders'");
assert(canEditMenu("orders"), "Super Admin CAN edit (decide) 'orders'");
S.me = { uid:"sup-01", email:"support@test.local", role:"support" };
assert(canViewMenu("orders"), "Support Admin CAN view 'orders'");
assert(canEditMenu("orders"), "Support Admin CAN decide 'orders'");
S.me = { uid:"ed-01", email:"editor@test.local", role:"editor" };
assert(!canViewMenu("orders"), "Content Editor CANNOT view 'orders' (financial/learner data)");
S.me = { uid:"rev-01", email:"reviewer@test.local", role:"reviewer" };
assert(!canViewMenu("orders"), "Content Reviewer CANNOT view 'orders'");

console.log("\n--- 2. Learner submits a payment request ---");
A.user = { uid, email:"learner@test.local" };
const orderId = await api.db.add("orders", { uid, email:"learner@test.local", planId:"gold", tier:2, amount:50000, currency:"LAK", proofUrl:"data:image/png;base64,xx", status:"pending", createdAt:new Date() });
let order = await api.db.get(`orders/${orderId}`);
assert(order && order.status === "pending", "Order created with status 'pending'");
assert(order.uid === uid, "Order is tagged with the submitting learner's uid");

console.log("\n--- 3. Duplicate-pending guard ---");
const pending = await fetchMyPendingOrder();
assert(pending && pending.id === orderId, "fetchMyPendingOrder() finds the learner's own pending order");

console.log("\n--- 4. Admin approves: access is granted at the plan's tier/duration ---");
S.me = { uid:"super-01", email:"super@test.local", role:"super" };
const plan = S.plans.find(p => p.id === order.planId);
const decideNow = new Date();
const expiresAt = plan.durationDays ? new Date(decideNow.getTime() + plan.durationDays*86400000) : null;
await api.db.batch([
  { op:"set", path:`access/${order.uid}`, data:{ planId:order.planId, tier:plan.tier, status:"active", start:decideNow, expiresAt, source:"payment", orderId, updatedAt:decideNow, updatedBy:S.me.uid } },
  { op:"set", path:`subscriptions/${order.uid}-${decideNow.getTime()}`, data:{ uid:order.uid, planId:order.planId, action:"assign", start:decideNow, expiresAt, by:S.me.uid, at:decideNow, source:"payment", orderId } },
  { op:"update", path:`orders/${orderId}`, data:{ status:"approved", decidedAt:decideNow, decidedBy:S.me.uid, decisionNote:"" } }
]);
const access = await api.db.get(`access/${uid}`);
assert(access.tier === 2, "Access tier upgraded to the purchased plan's tier (2)");
assert(access.planId === "gold", "Access planId updated to 'gold'");
assert(access.status === "active", "Access status is 'active'");
assert(access.source === "payment", "Access source is recorded as 'payment' (distinct from manual admin assignment)");
assert(access.expiresAt != null, "Access has an expiry matching the plan's duration");
order = await api.db.get(`orders/${orderId}`);
assert(order.status === "approved", "Order status updated to 'approved'");
const subs = await api.db.list("subscriptions", { where:[["uid","==",uid]] });
assert(subs.some(s => s.source === "payment" && s.planId === "gold"), "Subscription history records the payment-sourced upgrade");

console.log("\n--- 5. No more pending order after approval ---");
const pendingAfter = await fetchMyPendingOrder();
assert(!pendingAfter, "fetchMyPendingOrder() returns nothing once the request is decided");

console.log("\n--- 6. Admin rejects a second request: access is unaffected ---");
const order2Id = await api.db.add("orders", { uid, email:"learner@test.local", planId:"gold", tier:2, amount:50000, currency:"LAK", proofUrl:"data:image/png;base64,yy", status:"pending", createdAt:new Date() });
const accessBefore = await api.db.get(`access/${uid}`);
await api.db.update(`orders/${order2Id}`, { status:"rejected", decidedAt:new Date(), decidedBy:S.me.uid, decisionNote:"Amount does not match" });
const order2 = await api.db.get(`orders/${order2Id}`);
const accessAfter = await api.db.get(`access/${uid}`);
assert(order2.status === "rejected", "Second order status is 'rejected'");
assert(order2.decisionNote === "Amount does not match", "Rejection reason is saved");
assert(accessAfter.tier === accessBefore.tier && accessAfter.planId === accessBefore.planId, "Access is unchanged by a rejected request");

console.log(`\n${pass} / ${pass+fail} assertions passed.`);
if (fail) process.exit(1);
