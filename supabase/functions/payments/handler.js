// The payments Edge Function: the only place that talks to the payment provider and holds its secrets.
//   POST /checkout   (learner)  create the order in the database (price from the plan), then the provider's checkout
//   GET  /status     (learner)  the order as the database has it; asks the provider when it can
//   POST /webhook    (provider) signed server-to-server result → verify → activate / fail the order
//   POST /return     (provider) the learner's browser coming back with the signed result → same checks → back to the app
//   POST /refund     (super admin) refund through the provider, or record a refund made in the provider's portal
//   GET  /config     (anyone)   which provider and methods are live (no secrets)
//   GET|POST /mock/checkout     the test provider's checkout page (never in production)
// A redirect or the browser saying "paid" never unlocks anything: only a verified provider result does, through
// ll_activate_order(), which also checks the amount, currency and that the transaction was not used before.

const ORDER_RE = /^LLH-[0-9A-F]{10}$/;
const json = (body, status = 200, headers = {}) => new Response(JSON.stringify(body), { status, headers: Object.assign({ "Content-Type": "application/json" }, headers) });
const html = (body, status = 200) => new Response(body, { status, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } });
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

async function readBody(req){
  const type = req.headers.get("content-type") || "", text = await req.text();
  if (type.includes("application/json")){ try { return JSON.parse(text || "{}"); } catch(e){ return {}; } }
  return Object.fromEntries(new URLSearchParams(text));
}

export function createHandler({ env, db, providers, now = () => Date.now() }){
  const appUrl = /^https:\/\/|^http:\/\/localhost[:/]/.test(env.PAYMENT_APP_URL || "") ? env.PAYMENT_APP_URL.replace(/[#?].*$/, "") : null;
  const functionUrl = (env.PAYMENT_FUNCTION_URL || (env.SUPABASE_URL ? env.SUPABASE_URL + "/functions/v1/payments" : "")).replace(/\/$/, "");
  const origins = (env.PAYMENT_ALLOWED_ORIGINS || (appUrl ? new URL(appUrl).origin : "")).split(",").map(s => s.trim()).filter(Boolean);
  const backToApp = id => new Response(null, { status: 303, headers: { Location: (appUrl || "/") + "#payment?order=" + (ORDER_RE.test(id || "") ? id : "") } });
  const log = (...a) => console.log("[payments]", ...a);

  // Apply a verified provider result to the order (idempotent: the database refuses a second activation)
  async function apply(r){
    if (!r || !ORDER_RE.test(r.orderId || "")) return { ok: false, reason: "unknown_order" };
    if (r.outcome === "paid"){
      const res = await db.rpc("ll_activate_order", { p_order: r.orderId, p_pay: { provider: r.provider, txnId: r.txnId, amount: r.amount, currency: r.currency,
        method: r.method, brand: r.brand, last4: r.last4, paidAt: now(), verification: r.verification } });
      log("activate", r.orderId, r.provider, res.ok ? "ok" : res.reason);
      return res;
    }
    if (r.outcome === "failed" || r.outcome === "cancelled"){
      const res = await db.rpc("ll_fail_order", { p_order: r.orderId, p_status: r.outcome, p_info: { reason: r.reason || r.outcome } });
      log(r.outcome, r.orderId, res.ok ? "ok" : res.reason);
      return res;
    }
    return { ok: true, pending: true };
  }
  // Read a provider's signed message; the provider is chosen by the route (?p=) or the order it names
  async function verified(fields, hint){
    const tryOne = async p => { const r = await p.parse(fields); return Object.assign(r, { provider: p.id }); };
    const named = hint && providers.byId[hint];
    if (named) return tryOne(named);
    let lastErr = null;
    for (const p of Object.values(providers.byId)){ try { return await tryOne(p); } catch(e){ lastErr = e; } }
    throw lastErr || Object.assign(new Error("no provider configured"), { status: 401 });
  }

  const routes = {
    async "GET /config"(){
      const p = providers.active;
      return json({ provider: p ? p.id : null, label: p ? p.label : null, live: !!(p && p.live), methods: p ? p.methods : [] });
    },

    async "POST /checkout"(req, token){
      if (!token) return json({ error: "not_signed_in" }, 401);
      const p = providers.active;
      if (!p) return json({ error: "provider_not_configured" }, 503);
      const b = await readBody(req);
      if (!p.methods.includes(b.method)) return json({ error: "method_unavailable" }, 400);
      // runs as the learner: the database takes the account from the token and the price from the plan
      const order = await db.rpc("ll_create_order", { p_plan: String(b.planId || ""), p_cycle: String(b.cycle || ""), p_method: String(b.method || ""), p_return: b.returnTo ? String(b.returnTo) : null }, { token });
      if (!order.ok) return json({ error: order.reason || "order_refused", detail: order }, 400);
      if (order.status === "paid") return json({ order });
      const { checkout, ref } = await p.createCheckout(order, { functionUrl, appUrl });
      const opened = await db.rpc("ll_order_checkout", { p_order: order.id, p_provider: p.id, p_ref: ref || {} });
      log("checkout", order.id, p.id, order.method, order.amount, order.currency);
      return json({ order: opened.ok ? opened : order, checkout });
    },

    async "GET /status"(req, token){
      if (!token) return json({ error: "not_signed_in" }, 401);
      const id = new URL(req.url).searchParams.get("order") || "";
      if (!ORDER_RE.test(id)) return json({ error: "bad_order" }, 400);
      let order = await db.get("orders", id, { token });           // row-level security: own orders (or support)
      if (!order) return json({ error: "order_not_found" }, 404);
      const p = providers.byId[order.provider];
      if (p && p.query && ["created", "pending"].includes(order.status)){
        const r = await p.query(order).catch(e => { log("query failed", id, e.message); return null; });
        if (r){ await apply(Object.assign(r, { provider: p.id })); order = await db.get("orders", id, { token }); }
      }
      return json({ order });
    },

    async "POST /webhook"(req){
      const fields = await readBody(req), hint = new URL(req.url).searchParams.get("p");
      let r;
      try { r = await verified(fields, hint); }
      catch(e){ log("rejected callback:", e.message); return json({ error: "invalid_signature" }, 401); }
      const res = await apply(r);
      return json({ received: true, result: res.ok ? "ok" : res.reason });     // 200 even when refused, so the provider stops retrying
    },

    async "POST /return"(req){
      const fields = await readBody(req), hint = new URL(req.url).searchParams.get("p");
      const claimed = fields.req_reference_number || fields.order || "";
      try { await apply(await verified(fields, hint)); } catch(e){ log("unverified return for", claimed, e.message); }
      return backToApp(claimed);                                    // the app then asks /status; nothing here trusts the browser
    },

    async "POST /refund"(req, token){
      if (!token) return json({ error: "not_signed_in" }, 401);
      if ((await db.rpc("ll_is_super", {}, { token })) !== true) return json({ error: "forbidden" }, 403);
      const b = await readBody(req);
      if (!ORDER_RE.test(b.orderId || "")) return json({ error: "bad_order" }, 400);
      const order = await db.get("orders", b.orderId);
      if (!order) return json({ error: "order_not_found" }, 404);
      if (order.status !== "paid") return json({ error: order.status === "refunded" ? "already_refunded" : "order_not_paid" }, 400);
      const p = providers.byId[order.provider];
      let ref = String(b.ref || "").trim();
      if (p && p.refund){
        const r = await p.refund(order, await db.paymentsOf(order.id));
        if (!r.confirmed) return json({ error: "refund_not_confirmed", detail: r }, 502);
        ref = r.ref;
      } else if (!ref) return json({ error: "refund_reference_required" }, 400);      // refunded in the provider's portal: its reference is required
      const res = await db.rpc("ll_refund_order", { p_order: order.id, p_info: { ref, reason: String(b.reason || "").slice(0, 300), by: b.by || "admin" } });
      log("refund", order.id, res.ok ? "ok" : res.reason);
      return json(res, res.ok ? 200 : 400);
    },

    async "GET /mock/checkout"(req){
      const p = providers.byId.mock; if (!p) return html("Not available", 404);
      const id = new URL(req.url).searchParams.get("order") || "";
      const o = ORDER_RE.test(id) ? await db.get("orders", id) : null;
      if (!o || o.provider !== "mock" || o.status !== "pending") return html("This test checkout is closed.", 404);
      const btn = (v, l, c) => `<button name="outcome" value="${v}" style="display:block;width:100%;margin:8px 0;padding:14px;border-radius:10px;border:1px solid #ccc;font-size:16px;background:${c}">${l}</button>`;
      return html(`<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Test checkout</title>
        <body style="font-family:system-ui,sans-serif;max-width:420px;margin:40px auto;padding:0 16px;color:#0a1b2e">
        <p style="background:#fef3c7;padding:10px;border-radius:8px">Test payment page: no real money moves.</p>
        <h1 style="font-size:20px">${esc(o.planId)} · ${esc(o.cycle)}</h1><p style="font-size:28px;font-weight:700">${esc(o.amount)} ${esc(o.currency)}</p>
        <p>Order ${esc(o.id)} · ${esc(o.method)}</p>
        <form method="post">${btn("paid", "Pay successfully", "#d1fae5")}${btn("failed", "Decline the payment", "#ffe4e6")}${btn("cancelled", "Cancel and go back", "#fff")}${btn("pending", "Leave it pending", "#fff")}<input type="hidden" name="order" value="${esc(o.id)}"></form>`);
    },
    async "POST /mock/checkout"(req){
      const p = providers.byId.mock; if (!p) return html("Not available", 404);
      const b = await readBody(req);
      const o = ORDER_RE.test(b.order || "") ? await db.get("orders", b.order) : null;
      if (!o || o.provider !== "mock") return html("This test checkout is closed.", 404);
      if (b.outcome !== "pending") await apply(Object.assign(await p.parse(await p.callback(o, b.outcome)), { provider: "mock" }));
      return backToApp(o.id);
    }
  };

  return async function handle(req){
    const origin = req.headers.get("origin") || "";
    const cors = origins.includes(origin) ? { "Access-Control-Allow-Origin": origin, "Vary": "Origin",
      "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info", "Access-Control-Allow-Methods": "GET, POST, OPTIONS" } : {};
    if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
    const path = new URL(req.url).pathname.replace(/^.*\/payments(?=\/|$)/, "") || "/";
    const fn = routes[req.method + " " + path];
    if (!fn) return json({ error: "not_found" }, 404, cors);
    const auth = req.headers.get("authorization") || "";
    const token = /^Bearer\s+(.+)$/i.test(auth) ? auth.replace(/^Bearer\s+/i, "") : null;
    try {
      const res = await fn(req, token);
      for (const [k, v] of Object.entries(cors)) res.headers.set(k, v);
      return res;
    } catch(e){
      // details stay in the function log; the browser gets a code, never SQL or provider internals
      console.error("[payments] error", req.method, path, e && e.message);
      const status = e && (e.status === 401 || e.status === 403) ? e.status : 500;
      return json({ error: status === 500 ? "server_error" : "not_allowed" }, status, cors);
    }
  };
}
