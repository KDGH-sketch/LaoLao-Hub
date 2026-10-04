// Locked screens, limit messages and the plan list: what a learner sees when their plan does not include something.
// The decisions come from A.ac (js/shared/access.js); this file only presents them.
import { h, icon, dialog, fmtDate, tr, toast } from "../shared/ui.js";
import { t, lang } from "../shared/i18n.js";
import { featureByKey, ROUTE_FEATURE, PRACTICE_FEATURE } from "../shared/features.js";
import { planIncluding } from "../shared/access.js";
import { encodeReturn, planPrice, money, enabledMethods, methodCurrency } from "../shared/billing.js";
import { planLabel as sharedPlanLabel } from "../shared/plan-format.js";
import { A } from "./core.js";

const L = obj => tr(obj, lang());
export const featureName = f => featureByKey[f] ? L(featureByKey[f].label) : f;
const featureDesc = f => featureByKey[f] ? L(featureByKey[f].desc) : "";
export const planLabel = p => sharedPlanLabel(p, lang());   // js/shared/plan-format.js
const byId = id => (A.plans || []).find(p => p.id === id) || null;
const num = n => { try { return new Intl.NumberFormat(lang()==="zh" ? "zh-CN" : lang()==="lo" ? "lo-LA" : "en-US").format(n); } catch(e){ return String(n); } };
const perText = per => t("ac_per_"+(per||"day"));     // "today", "this month", …

// The feature a view (and practice type) needs, or null when it is open to everyone
export function featureForView(name, params = {}){
  if (name === "practice" && params && params.type) return PRACTICE_FEATURE[params.type] || "practice.basic";
  return ROUTE_FEATURE[name] || null;
}
export const viewAllowed = (name, params) => { const f = featureForView(name, params); return !f || !A.ac || A.ac.can(f); };

// Explanation of a block: { feature } (not in plan), { tier } (content above the plan), or { feature, result } (limit reached)
function explain({ feature = null, tier = null, result = null }){
  const ent = A.ent || {}, acc = A.access || {};
  // a paid plan or trial that ended: say so, and offer to renew it
  if (ent.status === "expired" && acc.planId && byId(acc.planId)){
    const old = byId(acc.planId), trial = acc.status === "trial";
    return { icon:"clock", title:t(trial ? "bl_trial_ended" : "bl_plan_ended", { p:planLabel(old) }), plan:old, renew:true,
      text:t(trial ? "bl_trial_ended_d" : "bl_plan_ended_d", { p:planLabel(old), d:fmtDate(acc.expiresAt, lang()) }) };
  }
  if (["account_suspended","account_disabled","no_profile"].includes(result && result.reason) || ["suspended","disabled","no_profile"].includes(ent.status))
    return { icon:"lock", title:t("ac_paused"), text:t("ac_paused_d"), plan:null };
  if (result && result.reason === "feature_disabled" || (feature && (ent.off||[]).includes(feature)))
    return { icon:"lock", title:t("ac_unavailable"), text:t("ac_unavailable_d", { f:featureName(feature) }), plan:null };
  if (result && result.reason === "limit_reached"){
    const better = (A.plans||[]).filter(p => p.active !== false && p.id !== ent.planId)
      .filter(p => { const e = p.entitlements, l = p.limits && p.limits[feature];
        return (!e || e[feature] === true) && (!l || +l.n > +result.limit); })
      .sort((a,b) => ((+a.tier||1)-(+b.tier||1)) || ((+a.price||0)-(+b.price||0)))[0] || null;
    return { icon:"clock", title:t("ac_limit"), plan:better,
      text:t("ac_limit_d", { u:num(result.used), n:num(result.limit), f:featureName(feature), p:perText(result.per) })
        + (result.resetAt ? " "+t("ac_resets", { d:fmtDate(result.resetAt, lang(), true) }) : "") };
  }
  if (tier != null){
    const plan = planIncluding(A.plans, { tier });
    return { icon:"lock", title:t("ac_locked_content", { p:planLabel(plan) || "Premium" }), text:t("ac_locked_content_d", { p:planLabel(plan) || "Premium" }), plan };
  }
  const plan = byId(A.ac.check(feature).requiredPlan) || planIncluding(A.plans, { feature, minTier: ent.tier||0 });
  return { icon:"lock", title:t("ac_locked_feature", { p:planLabel(plan) || "Premium" }), plan,
    text:t("ac_locked_feature_d", { f:featureName(feature), p:planLabel(plan) || "Premium" }) + (featureDesc(feature) ? " "+featureDesc(feature)+"." : "") };
}

function planPerks(plan){
  const list = ((plan && plan.features && (plan.features[lang()] || plan.features.en)) || []).slice(0, 6);
  if (!plan || !list.length) return null;
  return h("div",{class:"lockp-perks"}, h("b",null, t("ac_includes", { p:planLabel(plan) })),
    h("ul",{class:"obj small"+(lang()==="lo"?" lo":"")}, list.map(x => h("li",null,x))));
}

// The plans page remembers what the learner was doing, so a purchase can bring them straight back to it
export const RETURN_KEY = "laolao.returnTo";
export function saveReturn(){
  try { const r = encodeReturn(A.view); if (r && !["plans","checkout","payment","myplan","account"].includes(A.view.name)) sessionStorage.setItem(RETURN_KEY, r); } catch(e){}
}
export function goPlans(params = {}){ saveReturn(); A.go("plans", params); }
// "from 100,000 ₭ / month" for the suggested plan (cheapest monthly price among the enabled methods' currencies)
function fromPrice(plan){
  if (!plan) return null;
  const curs = [...new Set(enabledMethods(A.settings).map(m => methodCurrency(A.settings, m)))];
  for (const c of (curs.length ? curs : ["LAK","USD"])){ const v = planPrice(plan, "month", c); if (v) return t("bl_from", { a:money(v, c, lang()) }); }
  return null;
}

// Full-page locked state (direct URL, locked route, content above the plan)
export function lockedPanel(info, { onClose, onLater } = {}){
  const x = explain(info);
  const price = x.plan ? fromPrice(x.plan) : null;
  const primary = x.renew && x.plan
    ? h("button",{class:"btn primary",onclick:()=>{ if (onClose) onClose(); saveReturn(); A.go("checkout",{ plan:x.plan.id, cycle:(A.access && A.access.billingCycle) || "month" }); }}, icon("repeat"), t("bl_renew"))
    : h("button",{class:"btn primary",onclick:()=>{ if (onClose) onClose(); goPlans(); }}, icon("spark"), x.plan ? t("bl_upgrade_to", { p:planLabel(x.plan) }) : t("ac_view_plans"));
  return h("section",{class:"card lockp",role:"status"},
    h("div",{class:"lockp-ic"}, icon(x.icon)),
    h("h2",null, x.title),
    h("p",{class:"muted"}, x.text),
    planPerks(x.plan),
    price ? h("p",{class:"lockp-price"}, h("b",null, planLabel(x.plan)), " · ", price) : null,
    h("div",{class:"row lockp-act"}, primary,
      onLater ? h("button",{class:"btn ghost",onclick:onLater}, t("bl_later"))
        : onClose ? h("button",{class:"btn ghost",onclick:onClose}, t("close")) : h("button",{class:"btn ghost",onclick:()=>A.back ? A.back() : A.go("home")}, icon("left"), t("back"))));
}
// Same message in a dialog (locked buttons, limit reached during an activity). After "Maybe later" the same block
// shows a short note instead of the dialog for 10 minutes, so the learner is not interrupted on every click.
const LATER_MS = 10 * 60 * 1000, later = new Map();
const laterKey = info => info.feature ? "f:" + info.feature + (info.result ? ":" + info.result.reason : "") : "t:" + info.tier;
export function upgradeSheet(info){
  const k = laterKey(info), at = later.get(k);
  if (at && Date.now() - at < LATER_MS){ toast(explain(info).title + " · " + t("ac_view_plans")); return Promise.resolve(null); }
  return dialog({ title:"", body: close => lockedPanel(info, { onClose: () => close(null), onLater: () => { later.set(k, Date.now()); close(null); } }) });
}

// Ask the database before a limited action; shows the limit message and returns false when refused.
export async function allowUse(feature, opts){
  const r = await A.ac.use(feature, opts);
  if (!r.allowed) upgradeSheet({ feature, result: r });
  return r.allowed;
}
// For views: count, then build the page or show the locked/limit panel instead.
export async function withUse(feature, opts, build){
  const r = await A.ac.use(feature, opts);
  return r.allowed ? build() : lockedPanel({ feature, result: r });
}

// Small lock next to locked menu entries
export const navLock = (name, params) => viewAllowed(name, params) ? null : h("span",{class:"navlock",title:t("ac_locked"),"aria-label":t("ac_locked")}, icon("lock"));

// ---------- Account page: usage, plans and how to upgrade ----------
export function usageMeters(){
  const ent = A.ent || {}, rows = Object.keys(ent.limits || {}).filter(f => A.ac.limit(f));
  if (!rows.length) return null;
  return h("section",{class:"card"}, h("h2",{style:"margin-bottom:10px"}, t("ac_usage")),
    h("div",{class:"stack",style:"gap:10px"}, rows.map(f => { const lim = A.ac.limit(f), u = A.ac.usage(f) || { used:0, limit:lim.n };
      const pct = lim.n ? Math.min(100, Math.round(100 * u.used / lim.n)) : 100;
      return h("div",{class:"skill"}, h("span",null, featureName(f)), h("div",{class:"bar"+(pct>=100?" full":"")}, h("i",{style:`width:${pct}%`})),
        h("span",{class:"tabnum small"}, num(u.used)+" / "+num(lim.n)+" "+perText(lim.per))); })));
}
