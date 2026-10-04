// Plans → orders → payments → access, in JavaScript. In Supabase mode the database functions in supabase-schema.sql
// (ll_plan_price, ll_cycle_end, ll_quote, ll_create_order, ll_activate_order, …) decide; this file mirrors them for
// demo mode and for showing prices. scripts/test_sql_payments.mjs checks that both give the same answers.
// Nothing here can grant access in Supabase mode: the browser cannot write orders, payments or access there.

export const DAY = 86400000;
export const CYCLES = ["month", "year"];
export const CURRENCIES = ["LAK", "USD"];
// Payment methods the app knows. Which ones are offered is set in Settings → Payments (and what the provider supports).
export const METHODS = {
  mastercard: { kind: "card", brand: "Mastercard", icon: "card" },
  visa:       { kind: "card", brand: "Visa", icon: "card" },
  onepay:     { kind: "qr",   brand: "BCEL OnePay", icon: "qr" },
};
export const ORDER_OPEN = ["created", "pending"];

const num = v => { if (typeof v === "number") return isFinite(v) ? v : null; if (typeof v === "string" && /^\s*-?\d+(\.\d+)?\s*$/.test(v)) return +v; return null; };
const ms = v => { if (v == null) return null; if (typeof v === "number") return v; if (v instanceof Date) return v.getTime(); if (typeof v === "string"){ const n = num(v); if (n != null) return n; const t = Date.parse(v); return isNaN(t) ? null : t; } return null; };
const tierOf = (p, fallback) => Math.max(1, Math.floor(num(p && p.tier != null ? p.tier : fallback) || 1));

// ll_plan_price
export function planPrice(plan, cycle, cur){
  if (!plan) return null;
  cur = String(cur || "").toUpperCase();
  let v = null;
  if (plan.prices && typeof plan.prices === "object" && !Array.isArray(plan.prices)) v = num(plan.prices[cycle] && plan.prices[cycle][cur]);
  else if (String(plan.currency || "").toUpperCase() === cur && (plan.billingPeriod || "") === cycle) v = num(plan.price);
  return v > 0 ? v : null;
}
export const forSale = plan => !!plan && plan.active !== false && CYCLES.some(c => CURRENCIES.some(k => planPrice(plan, c, k)));

// ll_cycle_end: one calendar month / year later in UTC, clamped to the month's last day
export function cycleEnd(fromMs, cycle){
  const d = new Date(fromMs), add = cycle === "year" ? 12 : 1;
  const m = d.getUTCMonth() + add, y = d.getUTCFullYear() + Math.floor(m / 12), mm = m % 12;
  const last = new Date(Date.UTC(y, mm + 1, 0)).getUTCDate();
  return Date.UTC(y, mm, Math.min(d.getUTCDate(), last), d.getUTCHours(), d.getUTCMinutes(), d.getUTCSeconds(), d.getUTCMilliseconds());
}

// ll_method_currency
export const methodCurrency = (settings, method) =>
  String((settings && settings.payments && settings.payments.currency && settings.payments.currency[method]) || (["onepay", "laoqr"].includes(method) ? "LAK" : "USD")).toUpperCase();
// Methods offered right now (Settings → Payments)
export const enabledMethods = settings => { const p = (settings && settings.payments) || {}; return p.enabled === true && Array.isArray(p.methods) ? p.methods.filter(m => METHODS[m]) : []; };

// Where to go after paying: an app view with simple parameters, never a URL (same rule as ll_create_order)
export const RETURN_RE = /^[A-Za-z_]{1,30}(\?[A-Za-z0-9_=&.-]{0,160})?$/;
export const safeReturn = r => typeof r === "string" && RETURN_RE.test(r) ? r : null;
export function encodeReturn(view){
  if (!view || !view.name) return null;
  const q = Object.entries(view.params || {}).filter(([k, v]) => /^[A-Za-z_]{1,20}$/.test(k) && /^[A-Za-z0-9_.-]{1,60}$/.test(String(v))).map(([k, v]) => k + "=" + v).join("&");
  return safeReturn(view.name + (q ? "?" + q : ""));
}
export function decodeReturn(r){
  if (!safeReturn(r)) return null;
  const [name, q] = r.split("?"), params = {};
  if (q) for (const part of q.split("&")){ const [k, v] = part.split("="); if (k && v) params[k] = /^\d+$/.test(v) && k === "n" ? +v : v; }
  return { name, params };
}

// ll_quote. store: { get(table, id) → data | null } over the same rows as the database.
export function quote(store, uid, planId, cycle, currency, now = Date.now()){
  const cur = String(currency || "").toUpperCase();
  if (!CYCLES.includes(cycle)) return { ok: false, reason: "bad_cycle" };
  if (!CURRENCIES.includes(cur)) return { ok: false, reason: "bad_currency" };
  const p = store.get("plans", planId);
  if (!p || String(p.active) === "false") return { ok: false, reason: "plan_unavailable" };
  const amount = planPrice(p, cycle, cur);
  if (amount == null) return { ok: false, reason: "not_for_sale" };
  if (store.get("admins", uid)) return { ok: false, reason: "admin_account" };
  const u = store.get("users", uid);
  if (!u) return { ok: false, reason: "no_profile" };
  if ((u.status || "active") !== "active") return { ok: false, reason: "account_disabled" };
  const s = store.get("settings", "app") || {}, defId = s.defaultPlanId || "free";
  const newTier = tierOf(p);
  const a = store.get("access", uid);
  let st = "none", exp = null, curActive = false, curTier = 0, curP = null, kind = "new", credit = 0;
  if (a){
    st = a.status || "none"; exp = ms(a.expiresAt);
    if (st === "suspended") return { ok: false, reason: "account_suspended" };
    if (["active", "trial"].includes(st) && (a.planId || defId) !== defId && (exp == null || exp > now)){
      curActive = true; curP = store.get("plans", a.planId); curTier = tierOf(curP || { tier: a.tier });
    }
  }
  if (curActive){
    if (a.planId === planId){
      if (st === "trial") kind = "new";
      else if (exp == null) return { ok: false, reason: "already_unlimited" };
      else kind = "renew";
    } else if (newTier > curTier) kind = "upgrade";
    else return { ok: false, reason: "downgrade_at_period_end", currentPlan: a.planId, until: exp };
  }
  let ends;
  if (kind === "renew") ends = cycleEnd(Math.max(exp, now), cycle);
  else {
    if (kind === "upgrade" && st === "active" && a.source === "payment" && exp != null){
      const oldCycle = a.billingCycle || "month";
      const o = a.orderId ? store.get("orders", a.orderId) : null;
      let oldPrice = o && String(o.currency).toUpperCase() === cur && o.cycle === oldCycle ? num(o.amount) : null;
      if (oldPrice == null) oldPrice = planPrice(curP, oldCycle, cur);
      if (oldPrice != null){
        credit = Math.floor(((exp - now) / DAY) * (oldPrice / (oldCycle === "year" ? 365 : 30)) / (amount / (cycle === "year" ? 365 : 30)));
        credit = Math.min(Math.max(credit, 0), Math.floor((exp - now) / DAY));
      }
    }
    ends = cycleEnd(now, cycle) + credit * DAY;
  }
  return { ok: true, planId, planName: p.name || planId, tier: newTier, cycle, currency: cur, amount, kind, fromPlan: curActive ? a.planId : null, creditDays: credit, endsAt: ends };
}

const hist = (o, entry) => (o.history || []).concat([entry]);
const orderId = () => "LLH-" + Array.from({ length: 10 }, () => "0123456789ABCDEF"[Math.floor(Math.random() * 16)]).join("");

// ll_create_order (demo mode)
export function createOrder(store, uid, { planId, cycle, method, returnTo = null }, now = Date.now()){
  if (!uid) return { ok: false, reason: "not_signed_in" };
  const s = store.get("settings", "app") || {}, pay = s.payments || {};
  if (pay.enabled !== true) return { ok: false, reason: "payments_disabled" };
  if (!Array.isArray(pay.methods) || !pay.methods.includes(method)) return { ok: false, reason: "method_unavailable" };
  const cur = methodCurrency(s, method);
  const q = quote(store, uid, planId, cycle, cur, now);
  if (!q.ok) return q;
  const mine = store.list("orders").filter(o => o.uid === uid);
  for (const o of mine) if (ORDER_OPEN.includes(o.status) && num(o.createdAt) < now - 3600000)
    store.put("orders", o.id, Object.assign({}, o, { status: "expired", history: hist(o, { at: now, status: "expired" }) }));
  const open = store.list("orders").filter(o => o.uid === uid && ORDER_OPEN.includes(o.status) && o.planId === planId && o.cycle === cycle && o.method === method
    && o.currency === cur && num(o.amount) === q.amount && o.kind === q.kind).sort((x, y) => y.createdAt - x.createdAt)[0];
  if (open) return Object.assign({}, open, { ok: true, reused: true });
  if (mine.filter(o => num(o.createdAt) > now - 3600000).length >= 20) return { ok: false, reason: "too_many_orders" };
  const id = orderId();
  const d = { uid, planId, planName: q.planName, tier: q.tier, cycle, method, currency: cur, amount: q.amount, kind: q.kind, fromPlan: q.fromPlan,
    creditDays: q.creditDays, endsAt: q.endsAt, status: "created", returnTo: safeReturn(returnTo), createdAt: now, history: [{ at: now, status: "created" }] };
  store.put("orders", id, d);
  return Object.assign({ id, ok: true }, d);
}

export function orderCheckout(store, id, provider, ref, now = Date.now()){
  const o = store.get("orders", id);
  if (!o || !ORDER_OPEN.includes(o.status)) return { ok: false, reason: "order_not_open" };
  const d = Object.assign({}, o, { status: "pending", provider, checkoutRef: ref, history: hist(o, { at: now, status: "pending", provider }) });
  store.put("orders", id, d); return Object.assign({ id, ok: true }, d);
}

// ll_activate_order (demo mode)
export function activateOrder(store, id, pay, now = Date.now()){
  if (!pay || !pay.provider || !pay.txnId) return { ok: false, reason: "missing_transaction" };
  const pid = String(pay.provider).toLowerCase() + "__" + pay.txnId;
  const o = store.get("orders", id);
  if (!o) return { ok: false, reason: "order_not_found" };
  const prev = store.get("payments", pid);
  if (prev) return { ok: prev.orderId === id && prev.status === "paid", already: true, reason: prev.orderId === id ? "already_processed" : "transaction_reused" };
  const uid = o.uid;
  const rec = { orderId: id, uid, provider: String(pay.provider).toLowerCase(), txnId: pay.txnId, method: String(pay.method || o.method).slice(0, 20),
    brand: String(pay.brand || "").slice(0, 24), last4: String(pay.last4 || "").replace(/\D/g, "").slice(-4), amount: num(pay.amount),
    currency: String(pay.currency || "").toUpperCase(), paidAt: ms(pay.paidAt) || now, verification: pay.verification || {}, at: now };
  const bad = ["paid", "refunded"].includes(o.status) ? "order_already_paid" : num(pay.amount) !== num(o.amount) ? "amount_mismatch"
    : String(pay.currency || "").toUpperCase() !== String(o.currency).toUpperCase() ? "currency_mismatch" : null;
  if (bad){
    store.put("payments", pid, Object.assign(rec, { status: bad === "order_already_paid" ? "duplicate" : "mismatch", reason: bad }));
    store.put("orders", id, Object.assign({}, o, { needsReview: true, history: hist(o, { at: now, status: o.status, note: bad, payment: pid }) }));
    return { ok: false, reason: bad };
  }
  const a = store.get("access", uid) || null, p = store.get("plans", o.planId);
  let kind = o.kind, st = (a && a.status) || "none", exp = a ? ms(a.expiresAt) : null, start, ends, credit = 0;
  if (kind === "renew" && a && a.planId === o.planId && st === "active" && exp > now){ start = ms(a.start) || now; ends = cycleEnd(exp, o.cycle); }
  else {
    if (kind === "renew") kind = "new";
    if (kind === "upgrade" && a && a.planId === o.fromPlan && st === "active" && exp > now) credit = Math.floor(num(o.creditDays) || 0);
    start = now; ends = cycleEnd(now, o.cycle) + credit * DAY;
  }
  store.put("access", uid, Object.assign({}, a || {}, { planId: o.planId, tier: (p && p.tier) || o.tier || 1, status: "active", start, expiresAt: ends,
    billingCycle: o.cycle, source: "payment", orderId: id, cancelAtPeriodEnd: false, scheduledPlanId: null, updatedAt: now, updatedBy: "payment" }));
  store.put("payments", pid, Object.assign(rec, { status: "paid" }));
  store.put("subscriptions", uid + "-" + now + "-" + id, { uid, planId: o.planId, fromPlan: a ? a.planId : null, action: kind, start, expiresAt: ends, status: "active",
    source: "payment", orderId: id, amount: o.amount, currency: o.currency, creditDays: credit, by: "payment", at: now });
  store.put("orders", id, Object.assign({}, o, { status: "paid", paidAt: rec.paidAt, paymentId: pid, activatedUntil: ends, history: hist(o, { at: now, status: "paid", payment: pid }) }));
  return { ok: true, planId: o.planId, expiresAt: ends, kind };
}

export function failOrder(store, id, status, info = {}, now = Date.now()){
  if (!["failed", "cancelled", "expired"].includes(status)) return { ok: false, reason: "bad_status" };
  const o = store.get("orders", id);
  if (!o || !ORDER_OPEN.includes(o.status)) return { ok: false, reason: "order_not_open" };
  const note = String(info.reason || "").slice(0, 60);
  const d = Object.assign({}, o, { status, failReason: note, history: hist(o, { at: now, status, note }) });
  store.put("orders", id, d); return Object.assign({ id, ok: true }, d);
}

export function refundOrder(store, id, info = {}, now = Date.now()){
  const o = store.get("orders", id);
  if (!o) return { ok: false, reason: "order_not_found" };
  if (o.status === "refunded") return { ok: true, already: true };
  if (o.status !== "paid") return { ok: false, reason: "order_not_paid" };
  for (const { id: pid, ...p } of store.list("payments")) if (p.orderId === id && p.status === "paid") store.put("payments", pid, Object.assign(p, { status: "refunded", refundedAt: now }));
  const a = store.get("access", o.uid); let ended = false;
  if (a && a.orderId === id){ store.put("access", o.uid, Object.assign({}, a, { expiresAt: now, cancelAtPeriodEnd: false, scheduledPlanId: null, updatedAt: now, updatedBy: "refund" })); ended = true; }
  store.put("orders", id, Object.assign({}, o, { status: "refunded", refundedAt: now, refundRef: String(info.ref || "").slice(0, 80), refundReason: String(info.reason || "").slice(0, 300),
    refundedBy: info.by || null, history: hist(o, { at: now, status: "refunded", by: info.by || null }) }));
  store.put("subscriptions", o.uid + "-" + now + "-refund", { uid: o.uid, planId: o.planId, action: "refund", status: ended ? "ended" : "unchanged", source: "payment",
    orderId: id, reason: String(info.reason || "").slice(0, 300), by: info.by || "refund", at: now });
  return { ok: true, accessEnded: ended };
}

const paidActive = (a, now) => a && a.status === "active" && a.source === "payment" && (ms(a.expiresAt) || 0) > now;
export function setCancel(store, uid, cancel, now = Date.now()){
  const a = store.get("access", uid);
  if (!paidActive(a, now)) return { ok: false, reason: "no_paid_plan" };
  store.put("access", uid, Object.assign({}, a, { cancelAtPeriodEnd: !!cancel, updatedAt: now, updatedBy: uid }));
  store.put("subscriptions", uid + "-" + now + "-cancel", { uid, planId: a.planId, action: cancel ? "cancel_at_period_end" : "reactivate", expiresAt: a.expiresAt, status: "active", source: "learner", by: uid, at: now });
  return { ok: true, cancelAtPeriodEnd: !!cancel };
}
export function schedulePlan(store, uid, planId, now = Date.now()){
  const a = store.get("access", uid);
  if (!paidActive(a, now)) return { ok: false, reason: "no_paid_plan" };
  if (planId != null){
    const p = store.get("plans", planId), cur = store.get("plans", a.planId);
    if (!p || String(p.active) === "false" || tierOf(p) >= tierOf(cur)) return { ok: false, reason: "not_a_downgrade" };
  }
  const exp = ms(a.expiresAt);
  store.put("access", uid, Object.assign({}, a, { scheduledPlanId: planId, scheduledFrom: planId == null ? null : exp, updatedAt: now, updatedBy: uid }));
  store.put("subscriptions", uid + "-" + now + "-schedule", { uid, planId: a.planId, fromPlan: a.planId, nextPlan: planId, action: planId == null ? "schedule_cleared" : "schedule_downgrade",
    expiresAt: exp, status: "active", source: "learner", by: uid, at: now });
  return { ok: true, scheduledPlanId: planId, from: exp };
}

// Display: "90,000 LAK", "$9.99"
export function money(amount, cur, locale = "en"){
  cur = String(cur || "").toUpperCase();
  const loc = locale === "lo" ? "lo-LA" : locale === "zh" ? "zh-CN" : "en-US";
  try { return new Intl.NumberFormat(loc, { style: "currency", currency: cur, maximumFractionDigits: cur === "LAK" ? 0 : 2, minimumFractionDigits: cur === "LAK" ? 0 : 2 }).format(+amount); }
  catch(e){ return (+amount).toLocaleString() + " " + cur; }
}
// Yearly saving against 12 monthly payments, in percent (0 when not cheaper)
export function yearlySaving(plan, cur){
  const m = planPrice(plan, "month", cur), y = planPrice(plan, "year", cur);
  return m && y && y < m * 12 ? Math.round(100 * (1 - y / (m * 12))) : 0;
}
