// Learning plans and payments for learners: plan comparison, checkout, payment result, and "My learning plan"
// (current plan, benefits, plan changes, payment history and receipts).
// The browser only asks: the price comes from the database, and access changes only after the provider's payment has been
// verified on the server (supabase/functions/payments). In demo mode a test checkout inside the app stands in for the provider.
import { h, icon, toast, tr, fmtDate, dialog, confirmDialog } from "../shared/ui.js";
import { t, lang } from "../shared/i18n.js";
import { METHODS, CYCLES, planPrice, forSale, money, yearlySaving, enabledMethods, methodCurrency, decodeReturn, ORDER_OPEN } from "../shared/billing.js";
import { ROUTE_FEATURE } from "../shared/features.js";
import { A, refreshAccess } from "./core.js";
import { featureName, planLabel, usageMeters, RETURN_KEY } from "./upgrade.js";

export const VIEWS = {};
const go = (...a) => A.go(...a);
const pageHead = (title, sub, extra) => h("div",{class:"pagehead"}, h("div",{class:"spread"}, h("h1",null,title), extra||null), sub ? h("p",null,sub) : null);
const L = o => tr(o, lang());
const plansSorted = () => (A.plans || []).filter(p => p.active !== false).slice().sort((a,b) => ((+a.tier||1)-(+b.tier||1)) || ((a.order||0)-(b.order||0)));
const planById = id => (A.plans || []).find(p => p.id === id) || null;
const tierOf = p => Math.max(1, +(p && p.tier) || 1);
const nowMs = () => Date.now();
const methodsOn = () => enabledMethods(A.settings);
const lo = () => lang()==="lo" ? " lo" : "";
// like append / replaceChildren, but skipping empty parts (the DOM methods would print "null")
const keep = k => k.flat(Infinity).filter(x => x != null && x !== false);
const add = (el, ...k) => el.append(...keep(k));
const fill = (el, ...k) => el.replaceChildren(...keep(k));

// What the learner was doing before the plans page (saved by the upgrade popup); used as the order's return target
const savedReturn = () => { try { return sessionStorage.getItem(RETURN_KEY); } catch(e){ return null; } };
const returnLabel = r => { const v = decodeReturn(r); return v && ROUTE_FEATURE[v.name] ? featureName(ROUTE_FEATURE[v.name]) : null; };

// The account's paid plan right now (null for Free / expired / admin-granted without an end date)
function current(){
  const a = A.access || {}, ent = A.ent || {}, exp = a.expiresAt ? +a.expiresAt : null;
  const paid = a.status === "active" && a.source === "payment" && exp && exp > nowMs();
  return { a, ent, exp, paid, plan: planById(ent.planId), isAdmin: !!A.isAdmin };
}
// Prices of a plan in every currency the enabled methods use (LAK first)
function priceLines(p, cycle){
  const curs = [...new Set(methodsOn().map(m => methodCurrency(A.settings, m)))];
  const list = (curs.length ? curs : ["LAK","USD"]).sort((x,y) => x === "LAK" ? -1 : y === "LAK" ? 1 : 0)
    .map(c => [c, planPrice(p, cycle, c)]).filter(([, v]) => v != null);
  return list;
}
const perCycle = c => t(c === "year" ? "bl_per_year" : "bl_per_month");

// ---------- plans ----------
VIEWS.plans = (params = {}) => {
  const root = h("div",{class:"stack-l"});
  const c = current();
  let cycle = CYCLES.includes(params.cycle) ? params.cycle : (c.a.billingCycle === "year" ? "year" : "month");
  const plans = plansSorted();
  const curs = [...new Set(methodsOn().map(m => methodCurrency(A.settings, m)))];
  const maxSave = Math.max(0, ...plans.map(p => Math.max(...(curs.length ? curs : ["LAK","USD"]).map(k => yearlySaving(p, k)))));
  const ret = savedReturn(), retName = returnLabel(ret);
  const grid = h("div",{class:"bill-grid"});
  const seg = h("div",{class:"seg bill-cycle",role:"group","aria-label":t("bl_cycle")},
    CYCLES.map(k => h("button",{"aria-pressed":String(cycle===k),onclick:e=>{ cycle = k; seg.querySelectorAll("button").forEach(b => b.setAttribute("aria-pressed", String(b === e.currentTarget))); draw(); }},
      t(k === "year" ? "bl_yearly" : "bl_monthly"), k === "year" && maxSave ? h("span",{class:"bill-save"}, t("bl_save", { n:maxSave })) : null)));
  const payOn = methodsOn().length > 0;

  function action(p){
    const mine = c.ent.planId === p.id && !c.isAdmin, sale = forSale(p) && priceLines(p, cycle).length;
    if (c.isAdmin) return h("span",{class:"small muted"}, t("bl_admin_all"));
    if (mine && !sale) return h("span",{class:"chip lv"}, icon("check"), t("ac_current"));
    if (mine) return h("button",{class:"btn",onclick:()=>go("checkout",{ plan:p.id, cycle })}, icon("repeat"), t("bl_renew"));
    if (c.paid && c.plan && tierOf(p) < tierOf(c.plan)){
      if (c.a.scheduledPlanId === p.id) return h("span",{class:"chip warn"}, icon("clock"), t("bl_scheduled_from", { d:fmtDate(c.exp, lang()) }));
      if (!sale) return h("button",{class:"btn ghost",onclick:()=>go("myplan")}, t("bl_manage"));
      return h("button",{class:"btn ghost",onclick:()=>scheduleDowngrade(p)}, t("bl_switch_at_renewal"));
    }
    if (!sale) return null;
    if (!payOn) return h("a",{class:"btn",href:"#how"}, t("ac_how"));
    return h("button",{class:"btn primary",onclick:()=>go("checkout",{ plan:p.id, cycle })}, icon("spark"), c.paid ? t("bl_upgrade_to", { p:planLabel(p) }) : t("bl_choose", { p:planLabel(p) }));
  }
  function card(p){
    const mine = c.ent.planId === p.id && !c.isAdmin, lines = priceLines(p, cycle);
    const lim = Object.entries(p.limits || {}).filter(([, v]) => v && v.n !== "" && v.n != null);
    const feats = (p.features && (p.features[lang()] || p.features.en)) || [];
    return h("article",{class:"card bill-plan"+(mine?" current":"")+(p.recommended?" recommended":"")},
      p.recommended && !mine ? h("div",{class:"bill-ribbon"}, icon("star"), t("bl_recommended")) : null,
      h("div",{class:"spread"}, h("h2",null, planLabel(p)), mine ? h("span",{class:"chip lv"}, icon("check"), t("ac_current")) : p.badge && L(p.badge) ? h("span",{class:"chip warn"}, L(p.badge)) : null),
      h("div",{class:"bill-price"}, lines.length ? [h("b",null, money(lines[0][1], lines[0][0], lang())), h("span",null, " "+perCycle(cycle)),
        lines[1] ? h("div",{class:"small muted"}, t("bl_or")+" "+money(lines[1][1], lines[1][0], lang())) : null] : h("b",null, forSale(p) ? "—" : t("ac_price_free"))),
      p.description && L(p.description) ? h("p",{class:"small muted"+lo()}, L(p.description)) : null,
      feats.length ? h("ul",{class:"bill-feats"+lo()}, feats.map(f => h("li",null, icon("check"), h("span",null,f)))) : null,
      lim.length ? h("p",{class:"small muted"}, lim.map(([f, v]) => featureName(f)+": "+v.n+" "+t("ac_unit_"+(v.per||"day"))).join(" · ")) : null,
      h("div",{class:"bill-act"}, action(p)));
  }
  function draw(){ fill(grid, ...plans.map(card)); }
  async function scheduleDowngrade(p){
    if (!await confirmDialog(t("bl_switch_at_renewal"), t("bl_switch_d", { p:planLabel(p), cur:planLabel(c.plan), d:fmtDate(c.exp, lang()) }), t("bl_switch_confirm"), t("cancel"))) return;
    const r = await A.api.pay.schedule(p.id).catch(e => ({ ok:false, reason:e.code || e.message }));
    if (!r.ok){ toast(errorText(r.reason), "err"); return; }
    await refreshAccess(); toast(t("bl_switch_done", { p:planLabel(p), d:fmtDate(c.exp, lang()) })); A.render();
  }
  draw();
  const s = A.settings || {};
  add(root, pageHead(t("bl_plans_title"), t("bl_plans_sub")),
    retName ? h("div",{class:"banner bill-from"}, icon("lock"), h("span",null, t("bl_unlock_for", { f:retName }))) : null,
    c.ent.status === "expired" ? h("div",{class:"banner"}, t("bl_expired_banner", { p:planLabel(planById(c.a.planId)) || "", d:fmtDate(c.exp, lang()) })) : null,
    h("div",{class:"bill-top"}, seg, c.isAdmin ? null : h("button",{class:"btn ghost",onclick:()=>go("myplan")}, icon("wallet"), t("bl_myplan"))),
    grid,
    payOn ? h("p",{class:"small muted bill-secure"}, icon("shield"), A.api.pay && A.api.pay.live ? t("bl_secure_note") : t("bl_demo_note")) : null,
    (!payOn && (s.paymentInstructions || s.paymentQrUrl || s.supportContact)) ? h("section",{class:"card upgrade-how",id:"how"}, h("h3",null, t("ac_how")),
      s.paymentInstructions ? h("p",{class:"small"+lo(),style:"white-space:pre-line"}, L(s.paymentInstructions)) : h("p",{class:"small muted"}, t("ac_how_d")),
      s.paymentQrUrl ? h("img",{src:s.paymentQrUrl,alt:t("ac_qr"),class:"pay-qr",loading:"lazy"}) : null,
      s.supportContact ? h("p",{class:"small"}, t("contact")+": ", h("b",null, s.supportContact)) : null) : null);
  return root;
};

// ---------- checkout ----------
const ERR = { payments_disabled:"bl_err_disabled", method_unavailable:"bl_err_method", not_for_sale:"bl_err_not_for_sale", plan_unavailable:"bl_err_not_for_sale",
  downgrade_at_period_end:"bl_err_downgrade", already_unlimited:"bl_err_unlimited", admin_account:"bl_admin_all", account_suspended:"ac_paused_d",
  account_disabled:"ac_paused_d", too_many_orders:"bl_err_too_many", network_error:"bl_err_network", provider_not_configured:"bl_err_provider",
  payment_service_unavailable:"bl_err_provider", server_error:"bl_err_server", not_signed_in:"bl_err_signin", no_paid_plan:"bl_err_no_paid", not_a_downgrade:"bl_err_not_down" };
export const errorText = code => t(ERR[code] || "bl_err_server");

VIEWS.checkout = async (params = {}) => {
  const p = planById(params.plan), cycle = CYCLES.includes(params.cycle) ? params.cycle : "month";
  const root = h("div",{class:"stack-l bill-checkout"});
  const back = h("button",{class:"btn ghost sm",onclick:()=>go("plans",{ cycle })}, icon("left"), t("bl_back_plans"));
  if (!p){ add(root, back, h("div",{class:"empty"}, t("bl_err_not_for_sale"))); return root; }
  const methods = methodsOn();
  if (!methods.length){ add(root, back, h("div",{class:"banner"}, t("bl_err_disabled"))); return root; }
  // what the provider can take right now (live config); demo mode accepts every method
  const cfg = await A.api.pay.config().catch(() => ({ methods: [] }));
  const usable = methods.filter(m => !cfg.methods || !cfg.methods.length || cfg.methods.includes(m));
  // one quote per currency (cards may charge USD, QR LAK)
  const quotes = {};
  await Promise.all(usable.map(async m => { quotes[m] = await A.api.pay.quote(p.id, cycle, m).catch(e => ({ ok:false, reason:e.code || "server_error" })); }));
  let method = usable.find(m => quotes[m] && quotes[m].ok) || usable[0] || null;
  const summary = h("div",{class:"bill-sum"}), payBtn = h("button",{class:"btn primary bill-pay",type:"button"}), msg = h("p",{class:"small bill-msg",role:"alert"});
  const methodsBox = h("div",{class:"bill-methods",role:"radiogroup","aria-label":t("bl_method")});

  function drawMethods(){
    fill(methodsBox, ...usable.map(m => { const q = quotes[m], info = METHODS[m] || {}, okq = q && q.ok;
      return h("label",{class:"bill-method"+(method===m?" on":"")+(okq?"":" off")},
        h("input",{type:"radio",name:"pm",value:m,checked:method===m,disabled:!okq,onchange:()=>{ method = m; drawMethods(); drawSummary(); }}),
        h("span",{class:"bill-mi"}, icon(info.kind === "qr" ? "qr" : "card")),
        h("span",{class:"bill-mt"}, h("b",null, info.brand || m), h("span",{class:"small muted"}, info.kind === "qr" ? t("bl_qr_d") : t("bl_card_d"))),
        h("span",{class:"bill-ma"}, okq ? money(q.amount, q.currency, lang()) : h("span",{class:"small muted"}, errorText(q && q.reason)))); }));
  }
  function drawSummary(){
    const q = method && quotes[method];
    if (!q || !q.ok){ fill(summary, h("div",{class:"banner"}, errorText(q && q.reason))); payBtn.disabled = true; payBtn.replaceChildren(t("bl_pay")); return; }
    const what = q.kind === "renew" ? t("bl_kind_renew", { d:fmtDate(q.endsAt, lang()) })
      : q.kind === "upgrade" ? t("bl_kind_upgrade", { p:planLabel(p), from:planLabel(planById(q.fromPlan)), n:q.creditDays, d:fmtDate(q.endsAt, lang()) })
      : t("bl_kind_new", { d:fmtDate(q.endsAt, lang()) });
    fill(summary, 
      h("div",{class:"spread"}, h("div",null, h("div",{class:"small muted"}, t("bl_plan")), h("b",{class:"bill-sum-plan"}, planLabel(p)+" · "+t(cycle==="year"?"bl_yearly":"bl_monthly"))),
        h("div",{class:"bill-sum-amt"}, money(q.amount, q.currency, lang()))),
      h("p",{class:"small"}, what),
      q.kind === "upgrade" && q.creditDays ? h("p",{class:"small muted"}, icon("gift"), " ", t("bl_credit_d", { n:q.creditDays })) : null,
      h("p",{class:"small muted"}, t("bl_manual_renewal")));
    payBtn.disabled = false; payBtn.replaceChildren(icon("shield"), t("bl_pay_amount", { a:money(q.amount, q.currency, lang()) }));
  }
  let busy = false;
  payBtn.addEventListener("click", async () => {
    if (busy || !method) return;
    busy = true; payBtn.disabled = true; msg.textContent = ""; payBtn.replaceChildren(t("bl_starting"));
    try {
      const r = await A.api.pay.checkout({ planId:p.id, cycle, method, returnTo: savedReturn() });
      try { sessionStorage.setItem("laolao.lastOrder", r.order.id); } catch(e){}
      const ck = r.checkout || {};
      if (r.order.status === "paid"){ go("payment",{ order:r.order.id }); return; }
      if (ck.kind === "redirect" && /^https:\/\//.test(ck.url || "")) { location.href = ck.url; return; }
      if (ck.kind === "form" && /^https:\/\//.test(ck.action || "")){
        const f = h("form",{method:"post",action:ck.action,style:"display:none"}, Object.entries(ck.fields || {}).map(([k, v]) => h("input",{type:"hidden",name:k,value:String(v)})));
        document.body.append(f); f.submit(); return;
      }
      if (ck.kind === "demo"){ await demoCheckout(r.order); return; }
      throw Object.assign(new Error("provider"), { code:"provider_not_configured" });
    } catch(e){
      msg.textContent = errorText(e.code || e.message);
      busy = false; drawSummary();
    }
  });

  drawMethods(); drawSummary();
  add(root, back, pageHead(t("bl_checkout_title"), null),
    h("div",{class:"bill-co"},
      h("section",{class:"card stack"}, h("h2",null, t("bl_method")), methodsBox,
        h("p",{class:"small muted bill-secure"}, icon("lock"), A.api.pay.live ? t("bl_card_safe") : t("bl_demo_note"))),
      h("section",{class:"card stack bill-side"}, h("h2",null, t("bl_summary")), summary, payBtn, msg)));
  return root;
};

// Demo mode only: stands in for the provider's page. The outcome goes through the same rules as a verified callback.
async function demoCheckout(order){
  const pick = await dialog({ title:t("bl_demo_title"), body:h("div",{class:"stack"},
      h("div",{class:"banner"}, icon("info"), " ", t("bl_demo_note")),
      h("p",null, h("b",null, money(order.amount, order.currency, lang())), " · ", (METHODS[order.method]||{}).brand || order.method),
      h("p",{class:"small muted"}, t("bl_order")+" "+order.id)),
    actions:[{ label:t("bl_demo_pending"), value:"pending" }, { label:t("bl_demo_cancel"), value:"cancelled" }, { label:t("bl_demo_decline"), value:"failed" }, { label:t("bl_demo_pay"), value:"paid", primary:true }] });
  await A.api.pay.complete(order.id, pick || "cancelled");
  go("payment",{ order:order.id });
}

// ---------- payment result ----------
VIEWS.payment = (params = {}) => {
  let id = params.order; try { id = id || sessionStorage.getItem("laolao.lastOrder"); } catch(e){}
  const root = h("div",{class:"bill-result-wrap"}), box = h("section",{class:"card bill-result",role:"status","aria-live":"polite"});
  add(root, box);
  if (!id || !/^LLH-[0-9A-F]{10}$/.test(id)){ box.append(h("p",null, t("bl_err_order"))); return root; }
  let tries = 0, timer = null, refreshed = false;
  const stop = () => clearTimeout(timer);
  const btn = (label, fn, cls = "btn") => h("button",{class:cls,onclick:()=>{ stop(); fn(); }}, label);
  async function load(){
    let o;
    try { o = await A.api.pay.status(id); }
    catch(e){ draw({ error:e.code || "network_error" }); return; }
    draw(o);
    if (ORDER_OPEN.includes(o.status) && tries++ < 60 && root.isConnected !== false){ timer = setTimeout(() => { if (document.body.contains(box)) load(); }, 3000); }
  }
  function draw(o){
    if (o.error){
      fill(box, h("div",{class:"bill-st warn"}, icon("info")), h("h1",null, t("bl_st_error")), h("p",{class:"muted"}, errorText(o.error)),
        h("div",{class:"row bill-ra"}, btn(t("bl_check_again"), load, "btn primary"), btn(t("bl_back_plans"), () => go("plans"))));
      return;
    }
    const plan = planById(o.planId), back = decodeReturn(o.returnTo), retName = returnLabel(o.returnTo);
    const meta = h("dl",{class:"kv bill-kv"}, h("dt",null,t("bl_order")), h("dd",{class:"bill-mono"}, o.id), h("dt",null,t("bl_plan")), h("dd",null, planLabel(plan) || o.planId, " · ", t(o.cycle==="year"?"bl_yearly":"bl_monthly")),
      h("dt",null,t("bl_amount")), h("dd",null, money(o.amount, o.currency, lang())), h("dt",null,t("status")), h("dd",null, h("span",{class:"bill-pill "+(o.status==="paid"?"ok":"")}, t("bl_os_"+o.status))));
    if (o.status === "paid"){
      if (!refreshed){ refreshed = true; refreshAccess().then(() => { if (A.render && A.view.name === "payment") draw(o); }).catch(() => {}); }
      try { sessionStorage.removeItem(RETURN_KEY); } catch(e){}
      fill(box, h("div",{class:"bill-st ok"}, icon("check"), h("i",{class:"bill-burst","aria-hidden":"true"})), h("h1",null, t("bl_st_paid")),
        h("p",{class:"muted"}, t("bl_st_paid_d", { p:planLabel(plan) || o.planId })),
        h("p",null, t("bl_valid_until")+": ", h("b",null, fmtDate(o.activatedUntil || (A.access && A.access.expiresAt), lang()))), meta,
        h("div",{class:"row bill-ra"},
          back && retName ? btn(t("bl_continue", { f:retName }), () => go(back.name, back.params), "btn primary") : btn(t("bl_start_learning"), () => go("home"), "btn primary"),
          btn(t("bl_view_myplan"), () => go("myplan"))));
    } else if (ORDER_OPEN.includes(o.status)){
      fill(box, h("div",{class:"bill-st wait"}, h("span",{class:"bill-spin","aria-hidden":"true"})), h("h1",null, t("bl_st_pending")), h("p",{class:"muted"}, t(o.needsReview ? "bl_st_review" : "bl_st_pending_d")), meta,
        h("div",{class:"row bill-ra"}, btn(t("bl_check_again"), () => { tries = 0; load(); }, "btn"), btn(t("bl_other_method"), () => go("checkout",{ plan:o.planId, cycle:o.cycle })),
          o.status === "created" ? btn(t("bl_cancel_payment"), async () => { await A.api.pay.cancelOrder(o.id).catch(() => {}); load(); }, "btn ghost") : null));
    } else if (o.status === "refunded"){
      fill(box, h("div",{class:"bill-st warn"}, icon("repeat")), h("h1",null, t("bl_os_refunded")), h("p",{class:"muted"}, t("bl_st_refunded_d")), meta,
        h("div",{class:"row bill-ra"}, btn(t("bl_back_plans"), () => go("plans"), "btn primary")));
    } else {   // failed, cancelled, expired
      const key = o.status === "cancelled" ? "bl_st_cancelled" : o.status === "expired" ? "bl_st_expired" : "bl_st_failed";
      fill(box, h("div",{class:"bill-st bad"}, icon("x")), h("h1",null, t(key)), h("p",{class:"muted"}, t("bl_st_not_upgraded")), meta,
        h("div",{class:"row bill-ra"},
          btn(t("bl_try_again_with", { m:(METHODS[o.method]||{}).brand || o.method }), () => retry(o, o.method), "btn primary"),
          btn(t("bl_other_method"), () => go("checkout",{ plan:o.planId, cycle:o.cycle })),
          btn(t("bl_back_plans"), () => go("plans"), "btn ghost")));
    }
  }
  // Same plan, cycle and method again: a fresh checkout without going through the plans page
  async function retry(o, m){
    try {
      const r = await A.api.pay.checkout({ planId:o.planId, cycle:o.cycle, method:m, returnTo:o.returnTo || null });
      try { sessionStorage.setItem("laolao.lastOrder", r.order.id); } catch(e){}
      const ck = r.checkout || {};
      if (ck.kind === "redirect" && /^https:\/\//.test(ck.url || "")) { location.href = ck.url; return; }
      if (ck.kind === "form" && /^https:\/\//.test(ck.action || "")){ const f = h("form",{method:"post",action:ck.action,style:"display:none"}, Object.entries(ck.fields||{}).map(([k, v]) => h("input",{type:"hidden",name:k,value:String(v)}))); document.body.append(f); f.submit(); return; }
      if (ck.kind === "demo"){ await demoCheckout(r.order); return; }
    } catch(e){ toast(errorText(e.code || e.message), "err"); }
  }
  box.append(h("div",{class:"bill-st wait"}, h("span",{class:"bill-spin","aria-hidden":"true"})), h("p",{class:"muted"}, t("loading")));
  load();
  return root;
};

// ---------- my learning plan ----------
const SOURCE = { payment:"bl_src_payment", manual:"bl_src_admin", admin:"bl_src_admin", trial:"bl_src_trial", promotion:"bl_src_promotion", registration:"bl_src_free" };
VIEWS.myplan = async () => {
  const root = h("div",{class:"stack-l"});
  const c = current(), a = c.a, ent = c.ent, plan = c.plan;
  const orders = (await A.api.db.list("orders").catch(() => [])).filter(o => o.uid === A.user.uid).sort((x,y) => (y.createdAt||0) - (x.createdAt||0));
  const payments = await A.api.db.list("payments").catch(() => []);
  const lastPaid = payments.filter(p => p.uid === A.user.uid && p.status === "paid").sort((x,y) => (y.paidAt||0)-(x.paidAt||0))[0];
  const stKey = c.isAdmin ? "bl_st_admin" : ent.status === "expired" ? "bl_status_expired" : ent.status === "trial" ? "bl_status_trial" : ent.status === "grace" ? "bl_status_grace"
    : a.cancelAtPeriodEnd && c.paid ? "bl_status_cancelling" : "bl_status_active";
  const renewable = plan && forSale(plan) && (c.paid || ent.status === "expired");
  const lastPlan = ent.status === "expired" ? planById(a.planId) : plan;

  const kv = h("dl",{class:"kv bill-kv"},
    h("dt",null,t("status")), h("dd",null, h("span",{class:"bill-pill "+(stKey==="bl_status_active"?"ok":"")}, t(stKey, { d:fmtDate(c.exp, lang()) }))),
    c.exp ? [h("dt",null, ent.status === "expired" ? t("bl_ended") : t("bl_valid_until")), h("dd",null, fmtDate(c.exp, lang()))] : [h("dt",null,t("bl_valid_until")), h("dd",null, t("no_expiry"))],
    a.billingCycle && c.paid ? [h("dt",null,t("bl_billing")), h("dd",null, t(a.billingCycle==="year"?"bl_yearly":"bl_monthly"))] : null,
    lastPaid && c.paid ? [h("dt",null,t("bl_method")), h("dd",null, (lastPaid.brand || (METHODS[lastPaid.method]||{}).brand || lastPaid.method) + (lastPaid.last4 ? " •••• "+lastPaid.last4 : ""))] : null,
    a.source && !c.isAdmin ? [h("dt",null,t("bl_source")), h("dd",null, t(SOURCE[a.source] || "bl_src_admin"))] : null);
  const scheduled = c.paid && a.scheduledPlanId ? h("div",{class:"banner bill-sched"}, icon("clock"),
    h("span",null, t("bl_scheduled_line", { cur:planLabel(plan), next:planLabel(planById(a.scheduledPlanId)), d:fmtDate(c.exp, lang()) })),
    h("button",{class:"btn",onclick:async()=>{ const r = await A.api.pay.schedule(null).catch(e => ({ ok:false, reason:e.code })); if (!r.ok) return toast(errorText(r.reason),"err"); await refreshAccess(); toast(t("saved")); A.render(); }}, t("bl_keep_plan"))) : null;
  const cancelling = c.paid && a.cancelAtPeriodEnd ? h("div",{class:"banner"}, icon("info"), " ", t("bl_cancelling_d", { p:planLabel(plan), d:fmtDate(c.exp, lang()) })) : null;
  const soon = c.paid && !a.cancelAtPeriodEnd && c.exp - nowMs() < 7 * 86400000 ? h("div",{class:"banner"}, icon("clock"), " ", t("bl_ends_soon", { d:fmtDate(c.exp, lang()) })) : null;
  const acts = h("div",{class:"row bill-ra"},
    renewable && !c.isAdmin ? h("button",{class:"btn primary",onclick:()=>go("checkout",{ plan:(lastPlan||plan).id, cycle:a.billingCycle || "month" })}, icon("repeat"), t("bl_renew")) : null,
    !c.isAdmin ? h("button",{class:"btn",onclick:()=>go("plans")}, icon("plan"), t("bl_change_plan")) : null,
    c.paid && !a.cancelAtPeriodEnd ? h("button",{class:"btn ghost",onclick:async()=>{
      if (!await confirmDialog(t("bl_cancel_sub"), t("bl_cancel_sub_d", { p:planLabel(plan), d:fmtDate(c.exp, lang()) }), t("bl_cancel_sub"), t("bl_keep_plan"), true)) return;
      const r = await A.api.pay.setCancel(true).catch(e => ({ ok:false, reason:e.code })); if (!r.ok) return toast(errorText(r.reason),"err"); await refreshAccess(); toast(t("bl_cancel_done", { d:fmtDate(c.exp, lang()) })); A.render(); }}, t("bl_cancel_sub")) : null,
    c.paid && a.cancelAtPeriodEnd ? h("button",{class:"btn jade",onclick:async()=>{ const r = await A.api.pay.setCancel(false).catch(e => ({ ok:false, reason:e.code })); if (!r.ok) return toast(errorText(r.reason),"err"); await refreshAccess(); toast(t("bl_reactivated")); A.render(); }}, t("bl_reactivate")) : null);

  const feats = ((plan && plan.features && (plan.features[lang()] || plan.features.en)) || []);
  const benefits = c.isAdmin ? null : h("section",{class:"card"}, h("h2",null, t("bl_benefits")),
    feats.length ? h("ul",{class:"bill-feats"+lo()}, feats.map(f => h("li",null, icon("check"), h("span",null,f))))
      : h("p",{class:"small muted"}, ent.all ? t("am_all_long") : Object.keys(ent.features||{}).map(featureName).join(" · ") || "—"));

  const hist = h("section",{class:"card"}, h("h2",null, t("bl_history")),
    orders.length ? h("div",{class:"bill-table-wrap"}, h("table",{class:"bill-table"},
      h("thead",null, h("tr",null, ["bl_date","bl_desc","bl_amount","status",""].map(k => h("th",null, k ? t(k) : "")))),
      h("tbody",null, orders.map(o => h("tr",null,
        h("td",null, fmtDate(o.paidAt || o.createdAt, lang())),
        h("td",null, (planLabel(planById(o.planId)) || o.planId)+" · "+t(o.cycle==="year"?"bl_yearly":"bl_monthly")),
        h("td",{class:"tabnum"}, money(o.amount, o.currency, lang())),
        h("td",null, h("span",{class:"bill-pill "+(o.status==="paid"?"ok":"")}, t("bl_os_"+o.status))),
        h("td",null, h("button",{class:"btn sm",onclick:()=>receipt(o, payments.find(p => p.id === o.paymentId))}, t(o.status === "paid" || o.status === "refunded" ? "bl_receipt" : "bl_details"))))))))
      : h("p",{class:"small muted"}, t("bl_no_history")));

  add(root, pageHead(t("bl_myplan"), null),
    h("section",{class:"card stack bill-current"},
      h("div",{class:"spread"}, h("div",null, h("div",{class:"small muted"}, t("current_plan")), h("h2",{class:"bill-cur-name"}, c.isAdmin ? t("adm_title") : (planLabel(ent.status==="expired" ? planById(ent.planId) : plan) || ent.planId || "—"))),
        h("span",{class:"bill-cur-ic"}, icon("wallet"))),
      ent.status === "expired" ? h("div",{class:"banner"}, t("bl_expired_banner", { p:planLabel(lastPlan) || "", d:fmtDate(c.exp, lang()) })) : null,
      kv, scheduled, cancelling, soon, acts),
    benefits);
  const meters = usageMeters(); if (meters) add(root, meters);
  add(root, hist);
  return root;
};

function receipt(o, p){
  const row = (k, v) => [h("dt",null,k), h("dd",null,v)];
  const body = h("div",{class:"bill-receipt"},
    h("div",{class:"spread"}, h("b",null,"LaoLao"), h("span",{class:"small muted"}, t(o.status === "paid" || o.status === "refunded" ? "bl_receipt" : "bl_details"))),
    h("dl",{class:"kv bill-kv"},
      row(t("bl_order"), h("span",{class:"bill-mono"}, o.id)), row(t("bl_date"), fmtDate(o.paidAt || o.createdAt, lang(), true)),
      row(t("email"), A.user.email || ""), row(t("bl_plan"), (planLabel(planById(o.planId)) || o.planId)+" · "+t(o.cycle==="year"?"bl_yearly":"bl_monthly")),
      row(t("bl_amount"), money(o.amount, o.currency, lang())),
      row(t("bl_method"), p ? (p.brand || (METHODS[p.method]||{}).brand || p.method)+(p.last4 ? " •••• "+p.last4 : "") : ((METHODS[o.method]||{}).brand || o.method)),
      row(t("status"), t("bl_os_"+o.status)), o.activatedUntil ? row(t("bl_valid_until"), fmtDate(o.activatedUntil, lang())) : null));
  dialog({ title:t(o.status === "paid" || o.status === "refunded" ? "bl_receipt" : "bl_details"), body, actions:[{ label:t("close"), value:true }, { label:t("bl_print"), onClick:()=>{ printReceipt(body); return false; } }] });
}
function printReceipt(el){
  const w = window.open("", "_blank", "width=480,height=640"); if (!w) return;
  w.document.write("<!doctype html><meta charset='utf-8'><title>Receipt</title><style>body{font-family:system-ui,sans-serif;padding:24px;color:#111}dl{display:grid;grid-template-columns:auto 1fr;gap:6px 16px}dt{color:#555}.spread{display:flex;justify-content:space-between}</style>"+el.outerHTML);
  w.document.close(); w.focus(); w.print();
}
