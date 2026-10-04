// Access control: who may use which feature, how often, and which content tier they read.
//
// resolveEntitlements() is the JavaScript mirror of ll_resolve() in supabase-schema.sql (keep them identical).
// In Supabase mode the database is the authority: the app loads ll_entitlements() once per session for the UI,
// content above the account's tier is never sent to it (bundles RLS), and usage is counted by ll_use() under a row lock.
// In demo mode js/api/local.js runs the same functions on the in-browser database.
//
// Precedence: global switch-off → account status → plan → personal grants → usage limit. See docs/ACCESS.md.
import { FEATURES, featureByKey } from "./features.js";

export const DEFAULT_TZ = "Asia/Vientiane";
const DAY = 86400000;

// ---------- periods (calendar periods in the platform's time zone) ----------
const pad = n => String(n).padStart(2, "0");
function tzParts(ms, tz){
  const f = new Intl.DateTimeFormat("en-US", { timeZone: tz, year:"numeric", month:"2-digit", day:"2-digit", hour:"2-digit", minute:"2-digit", second:"2-digit", hourCycle:"h23" });
  const o = {}; for (const p of f.formatToParts(new Date(ms))) o[p.type] = +p.value || 0;
  return { y:o.year, m:o.month, d:o.day, h:o.hour, mi:o.minute, s:o.second };
}
const tzOffset = (ms, tz) => { const p = tzParts(ms, tz); return Date.UTC(p.y, p.m-1, p.d, p.h, p.mi, p.s) - Math.floor(ms/1000)*1000; };
const midnight = (y, m, d, tz, ref) => Date.UTC(y, m-1, d) - tzOffset(ref, tz);   // local midnight of y-m-d as epoch ms
const ymd = ms => { const x = new Date(ms); return x.getUTCFullYear()+"-"+pad(x.getUTCMonth()+1)+"-"+pad(x.getUTCDate()); };

// Counter key and reset time for a limit period. Must match ll_period() in SQL.
export function periodOf(per, { now = Date.now(), tz = DEFAULT_TZ, start = null, expiresAt = null } = {}){
  const p = tzParts(now, tz), today = Date.UTC(p.y, p.m-1, p.d);
  if (per === "day")   return { key: "d"+ymd(today), resetAt: midnight(p.y, p.m, p.d+1, tz, now) };
  if (per === "week"){ const dow = (new Date(today).getUTCDay() + 6) % 7, mon = today - dow*DAY, m = new Date(mon);   // weeks start on Monday
    return { key: "w"+ymd(mon), resetAt: midnight(m.getUTCFullYear(), m.getUTCMonth()+1, m.getUTCDate()+7, tz, now) }; }
  if (per === "month") return { key: "m"+p.y+"-"+pad(p.m), resetAt: midnight(p.y, p.m+1, 1, tz, now) };
  if (per === "period") return { key: "p"+(start != null ? Math.round(+start) : 0), resetAt: expiresAt != null ? +expiresAt : null };
  return { key: "l", resetAt: null };                                       // lifetime
}

// ---------- the resolver ----------
const isObj = v => v && typeof v === "object" && !Array.isArray(v);
export function resolveEntitlements({ uid = null, isAdmin = false, user = null, access = null, plans = [], settings = {}, now = Date.now() } = {}){
  settings = settings || {};
  const tz = settings.timezone || DEFAULT_TZ;
  const off = Array.isArray(settings.disabledFeatures) ? settings.disabledFeatures.slice() : [];
  const base = { uid, role:"guest", status:"guest", planId:null, tier:0, all:false, features:{}, grants:[], limits:{}, off, tz,
                 start:null, expiresAt:null, graceUntil:null, now };
  if (!uid) return base;
  if (isAdmin) return Object.assign(base, { role:"admin", status:"admin", tier:99, all:true, off:[] });
  const learner = Object.assign(base, { role:"learner" });
  if (!user) return Object.assign(learner, { status:"no_profile" });                        // the database only serves public content
  if ((user.status || "active") !== "active") return Object.assign(learner, { status:"disabled" });

  const byId = id => (plans || []).find(p => p.id === id) || null;
  const defId = settings.defaultPlanId || "free";
  let plan = byId(defId) || { id:defId, tier:1 }, status = "none";
  const a = access;
  if (a){
    const st = a.status || "none";
    learner.start = a.start ?? null; learner.expiresAt = a.expiresAt ?? null;
    learner.grants = Array.isArray(a.grants) ? a.grants.filter(g => typeof g === "string") : [];
    if (st === "suspended") return Object.assign(learner, { status:"suspended", planId:a.planId || null, grants:[] });
    if (st === "active" || st === "trial"){
      const own = byId(a.planId) || { id:a.planId || defId, tier:a.tier || 1 };
      const exp = a.expiresAt == null ? null : +a.expiresAt;
      const grace = (+own.graceDays || 0) * DAY;
      if (exp == null || exp > now){ plan = own; status = st; }
      else if (exp + grace > now){ plan = own; status = "grace"; learner.graceUntil = exp + grace; }
      else status = "expired";
    } else status = st;                                                                     // cancelled, pending, … → default plan
  }
  learner.status = status;
  learner.planId = plan.id;
  learner.tier = Math.max(1, Math.floor(+plan.tier) || 1);
  if (isObj(plan.entitlements)){
    for (const [k, v] of Object.entries(plan.entitlements)) if (v === true) learner.features[k] = true;
    if (isObj(plan.limits)) for (const [k, v] of Object.entries(plan.limits))
      if (learner.features[k] && isObj(v) && Number.isFinite(+v.n) && v.n !== "" && v.n !== null && +v.n >= 0) learner.limits[k] = { n: Math.floor(+v.n), per: v.per || "day" };
  } else learner.all = true;                                                                // plan not configured yet: everything, no limits
  return learner;
}

// ---------- decisions ----------
export function decide(ent, f){
  if (!ent || ent.role === "guest") return { allowed:false, reason:"not_signed_in" };
  if (ent.role === "admin") return { allowed:true, reason:"admin" };
  if (ent.status === "disabled") return { allowed:false, reason:"account_disabled" };
  if (ent.status === "suspended") return { allowed:false, reason:"account_suspended" };
  if (ent.status === "no_profile") return { allowed:false, reason:"no_profile" };
  if ((ent.off || []).includes(f)) return { allowed:false, reason:"feature_disabled" };
  if ((ent.grants || []).includes(f)) return { allowed:true, reason:"granted" };
  if (ent.all || (ent.features || {})[f]) return { allowed:true, reason:"plan_allows_feature" };
  return { allowed:false, reason:"feature_not_in_plan" };
}
// A personal grant lifts the plan's limit for that feature.
export const limitFor = (ent, f) => (!ent || ent.role === "admin" || (ent.grants || []).includes(f)) ? null : (ent.limits || {})[f] || null;

// Cheapest active plan that includes a feature (or reaches a content tier): what the upgrade screen suggests.
export function planIncluding(plans, { feature = null, tier = null, minTier = 0 } = {}){
  return (plans || []).filter(p => p.active !== false)
    .filter(p => feature ? (!isObj(p.entitlements) || p.entitlements[feature] === true) : true)
    .filter(p => tier != null ? (+p.tier || 1) >= tier : (+p.tier || 1) > minTier)
    .sort((a, b) => ((+a.tier||1) - (+b.tier||1)) || ((+a.price||0) - (+b.price||0)) || ((a.order||0) - (b.order||0)))[0] || null;
}

// ---------- counting (demo mode and tests; the database uses ll_use) ----------
// rows: a plain object used as the usage table { "{uid}__{feature}__{period}": { n, refs, ... } }. Synchronous, so it is atomic in JS.
export function consumeUsage(rows, ent, f, { amount = 1, ref = null, now = Date.now() } = {}){
  const d = decide(ent, f);
  const out = { feature:f, plan:ent && ent.planId, allowed:d.allowed, reason:d.reason, used:0, limit:null, per:null, resetAt:null };
  if (!d.allowed) return out;
  const lim = limitFor(ent, f);
  if (!lim){ out.reason = d.reason === "admin" ? "admin" : "unlimited"; return out; }
  const per = periodOf(lim.per, { now, tz:ent.tz, start:ent.start, expiresAt:ent.expiresAt });
  const id = `${ent.uid}__${f}__${per.key}`;
  const row = rows[id] || { n:0, refs:{} };
  Object.assign(out, { used:row.n, limit:lim.n, per:lim.per, resetAt:per.resetAt });
  if (ref != null && row.refs && row.refs[ref]){ out.reason = "already_counted"; return out; }
  if (amount <= 0){ out.allowed = row.n < lim.n; out.reason = out.allowed ? "within_limit" : "limit_reached"; return out; }
  if (row.n + amount > lim.n){ out.allowed = false; out.reason = "limit_reached"; return out; }
  row.n += amount; if (ref != null){ row.refs = row.refs || {}; row.refs[ref] = true; }
  Object.assign(row, { uid:ent.uid, feature:f, period:per.key, limit:lim.n, per:lim.per, resetAt:per.resetAt, updatedAt:now });
  rows[id] = row;
  out.used = row.n; out.reason = "within_limit";
  return out;
}
// Current counters for every limited feature (what ll_entitlements returns as `usage`)
export function usageSnapshot(rows, ent, now = Date.now()){
  const u = {};
  for (const f of Object.keys((ent && ent.limits) || {})){
    const lim = limitFor(ent, f); if (!lim) continue;
    const per = periodOf(lim.per, { now, tz:ent.tz, start:ent.start, expiresAt:ent.expiresAt });
    const row = rows[`${ent.uid}__${f}__${per.key}`];
    u[f] = { used: row ? row.n : 0, limit: lim.n, per: lim.per, resetAt: per.resetAt };
  }
  return u;
}

// ---------- browser service ----------
// One entitlement payload per session drives the UI; use() asks the database before a limited action.
export function createAccessControl(api){
  let ent = null, plans = [], usage = {};
  const debugOn = () => { try { return localStorage.getItem("laolao_debug_access") === "1"; } catch(e){ return false; } };
  const trace = (f, r) => { if (debugOn()) console.table([{ feature:f, plan:ent && ent.planId, status:ent && ent.status, decision:r.allowed ? "allow" : "deny", reason:r.reason,
    used:r.used ?? "", limit:r.limit ?? "", at:new Date().toISOString() }]); return r; };
  const missingFn = e => { const c = String(e && e.code || ""); return c === "PGRST202" || c === "42883" || /could not find the function/i.test(String(e && e.message || "")); };
  const ac = {
    // fallback: the rows the app already loaded, used when the database functions are not installed yet
    async load(fallback){
      plans = (fallback && fallback.plans) || [];
      try {
        if (!api.rpc) throw Object.assign(new Error("no rpc"), { code:"PGRST202" });
        ent = await api.rpc("ll_entitlements");
        if (!ent || !ent.role) throw new Error("empty entitlements");
        ent.source = "database";
      } catch(e){
        if (!missingFn(e)) console.warn("LaoLao: entitlements not loaded from the database:", e.message);
        ent = resolveEntitlements(fallback); ent.source = "local";
      }
      usage = Object.assign({}, ent.usage || {});
      if (debugOn()) console.info("[access] entitlements", ent);
      return ent;
    },
    get ent(){ return ent; },
    get plans(){ return plans; },
    can(f){ return decide(ent, f).allowed; },
    check(f){
      const d = decide(ent, f);
      if (!d.allowed && d.reason === "feature_not_in_plan"){ const p = planIncluding(plans, { feature:f, minTier: ent ? ent.tier : 0 }) || planIncluding(plans, { feature:f }); d.requiredPlan = p ? p.id : null; }
      d.plan = ent && ent.planId;
      return trace(f, d);
    },
    canTier(tier){ return !!ent && ent.tier >= tier; },
    limit(f){ return limitFor(ent, f); },
    usage(f){ return usage[f] || null; },
    // Ask the database before a limited action. Unlimited features never call it.
    async use(f, { ref = null, amount = 1 } = {}){
      const d = ac.check(f);
      if (!d.allowed) return d;
      const lim = limitFor(ent, f);
      if (!lim) return trace(f, { allowed:true, reason: d.reason === "admin" ? "admin" : "unlimited" });
      if (typeof navigator !== "undefined" && navigator.onLine === false) return trace(f, { allowed:true, reason:"offline" });   // not counted offline (docs/ACCESS.md)
      try {
        const r = await api.rpc("ll_use", { p_feature:f, p_amount:amount, p_ref: ref == null ? null : String(ref) });
        if (r && r.limit != null) usage[f] = { used:r.used, limit:r.limit, per:r.per, resetAt:r.resetAt };
        return trace(f, r);
      } catch(e){
        if (missingFn(e)) return trace(f, { allowed:true, reason:"not_configured" });
        console.warn("LaoLao: usage check failed, allowing:", e.message);
        return trace(f, { allowed:true, reason:"offline" });
      }
    },
    // Record a refused attempt (e.g. a locked screen opened by a direct link) in Admin → Access logs. Never blocks.
    report(f){ if (api.rpc && ent && ent.role === "learner") api.rpc("ll_use", { p_feature:f, p_amount:0, p_ref:null }).catch(() => {}); },
    featureLabel: (f, lang) => { const x = featureByKey[f]; return x ? (x.label[lang] || x.label.en) : f; }
  };
  return ac;
}

export { FEATURES };
