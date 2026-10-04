// Access control: plans, statuses, expiry, grants, switch-offs, usage limits and periods (js/shared/access.js),
// plus the demo database functions (js/api/local.js rpc), which run the same rules as the SQL in supabase-schema.sql.
import { resolveEntitlements, decide, limitFor, consumeUsage, usageSnapshot, periodOf, planIncluding, createAccessControl } from "../js/shared/access.js";
import { FEATURES, FEATURE_KEYS, ROUTE_FEATURE, PRACTICE_FEATURE, RECOMMENDED } from "../js/shared/features.js";
import { tierFor, minTier } from "../js/shared/content.js";

let pass = 0, fail = 0;
const ok = (c, msg) => { if (c){ pass++; console.log("  PASS " + msg); } else { fail++; console.log("  FAIL " + msg); } };
const DAY = 86400000, NOW = Date.UTC(2026, 9, 4, 5, 0, 0);   // 2026-10-04 12:00 in Vientiane (UTC+7)

const PLANS = [
  { id:"free", tier:1, entitlements: RECOMMENDED.free.entitlements, limits: RECOMMENDED.free.limits },
  { id:"standard", tier:2, entitlements: RECOMMENDED.standard.entitlements, limits: RECOMMENDED.standard.limits, graceDays: 3 },
  { id:"premium", tier:3, entitlements: RECOMMENDED.premium.entitlements, limits: {}, price: 19 },
  { id:"vvip", tier:4, price: 2500000 },                                   // not configured: every feature, no limits
  { id:"old", tier:2, active:false }
];
const SETTINGS = { defaultPlanId:"free" };
const user = { status:"active" };
const R = (access, extra={}) => resolveEntitlements(Object.assign({ uid:"u1", user, access, plans:PLANS, settings:SETTINGS, now:NOW }, extra));
const can = (e, f) => decide(e, f).allowed;

console.log("registry");
ok(new Set(FEATURE_KEYS).size === FEATURES.length, "feature keys are unique");
ok(ROUTE_FEATURE.tone_lab === "tones.lab" && ROUTE_FEATURE.lesson === "lessons.open" && ROUTE_FEATURE.dict === "dictionary.search", "routes map to features");
ok(PRACTICE_FEATURE.order === "practice.basic" && PRACTICE_FEATURE.mix === "practice.advanced", "practice types map to features");
ok(Object.values(RECOMMENDED).every(p => Object.keys(p.entitlements).every(k => FEATURE_KEYS.includes(k))), "recommended defaults only use known features");
ok(Object.values(RECOMMENDED).every(p => Object.keys(p.limits).every(k => FEATURES.find(f => f.key === k).limitable)), "recommended limits only on limitable features");

console.log("free user");
let e = R({ planId:"free", tier:1, status:"active", expiresAt:null });
ok(e.planId === "free" && e.tier === 1 && e.status === "active", "free plan, tier 1");
ok(can(e, "lessons.open") && can(e, "dictionary.search") && can(e, "labs.culture"), "free features allowed");
ok(!can(e, "tones.lab") && decide(e, "tones.lab").reason === "feature_not_in_plan", "premium lab blocked: feature_not_in_plan");
ok(!can(e, "practice.advanced") && can(e, "practice.basic"), "basic practice yes, advanced no");
ok(limitFor(e, "dictionary.search").n === 20 && limitFor(e, "dictionary.search").per === "day", "dictionary limited to 20 / day");
ok(planIncluding(PLANS, { feature:"tones.lab", minTier:1 }).id === "standard", "upgrade suggestion: cheapest plan with the feature");
ok(planIncluding(PLANS, { tier:3 }).id === "premium", "upgrade suggestion for tier-3 content");
ok(planIncluding(PLANS, { tier:2 }).id === "standard", "inactive plans are never suggested");

console.log("basic / premium / vvip");
e = R({ planId:"standard", tier:2, status:"active", expiresAt:NOW + 30*DAY });
ok(e.tier === 2 && can(e, "tones.lab") && limitFor(e, "lessons.open").n === 20, "basic: tier 2, labs, 20 lessons / day");
ok(limitFor(e, "offline.downloads").per === "month", "basic: downloads limited per month");
e = R({ planId:"premium", tier:3, status:"active", expiresAt:NOW + 30*DAY });
ok(e.tier === 3 && FEATURE_KEYS.every(f => can(e, f)) && FEATURE_KEYS.every(f => !limitFor(e, f)), "premium: every feature, unlimited");
e = R({ planId:"vvip", tier:4, status:"active", expiresAt:null });
ok(e.tier === 4 && e.all === true && can(e, "labs.kinship") && !limitFor(e, "lessons.open"), "unconfigured plan keeps the old behaviour: all features, no limits");

console.log("tier comes from the plan, not the copy on the access row");
e = R({ planId:"premium", tier:2, status:"active", expiresAt:null });
ok(e.tier === 3, "plan tier wins over a stale access.tier");
e = R({ planId:"deleted-plan", tier:2, status:"active", expiresAt:null });
ok(e.tier === 2 && e.all === true, "deleted plan falls back to the stored tier");

console.log("statuses and expiry");
e = R({ planId:"premium", tier:3, status:"active", expiresAt:NOW - DAY });
ok(e.status === "expired" && e.planId === "free" && e.tier === 1 && !can(e, "tones.lab"), "expired premium → free plan");
e = R({ planId:"standard", tier:2, status:"active", expiresAt:NOW - DAY });
ok(e.status === "grace" && e.planId === "standard" && e.graceUntil === NOW - DAY + 3*DAY, "within grace days → keeps the plan");
e = R({ planId:"standard", tier:2, status:"active", expiresAt:NOW - 4*DAY });
ok(e.status === "expired" && e.tier === 1, "after the grace period → free");
e = R({ planId:"premium", tier:3, status:"trial", expiresAt:NOW + 7*DAY });
ok(e.status === "trial" && e.tier === 3 && can(e, "tones.lab"), "trial → trial plan's entitlements");
e = R({ planId:"premium", tier:3, status:"trial", expiresAt:NOW - 1 });
ok(e.status === "expired" && e.tier === 1, "trial ended → free");
e = R({ planId:"premium", tier:3, status:"pending", expiresAt:null });
ok(e.status === "pending" && e.planId === "free", "pending payment → default plan");
e = R({ planId:"premium", tier:3, status:"cancelled", expiresAt:null });
ok(e.status === "cancelled" && e.tier === 1, "cancelled → free");
e = R({ planId:"premium", tier:3, status:"suspended", expiresAt:null, grants:["tones.lab"] });
ok(e.status === "suspended" && e.tier === 0 && !can(e, "lessons.open") && !can(e, "tones.lab"), "suspended → public content only, nothing usable, grants ignored");
e = R(null);
ok(e.status === "none" && e.planId === "free" && e.tier === 1, "no access row → default plan");
e = resolveEntitlements({ uid:"u1", user:{ status:"disabled" }, access:{ planId:"premium", status:"active" }, plans:PLANS, settings:SETTINGS, now:NOW });
ok(e.status === "disabled" && e.tier === 0 && decide(e, "lessons.open").reason === "account_disabled", "disabled account → nothing");
e = resolveEntitlements({ uid:"u1", user:null, access:{ planId:"premium", status:"active" }, plans:PLANS, settings:SETTINGS, now:NOW });
ok(e.status === "no_profile" && e.tier === 0, "no learner profile → public only (as the database)");
e = resolveEntitlements({ uid:null });
ok(e.role === "guest" && decide(e, "lessons.open").reason === "not_signed_in", "guest → not signed in");
e = resolveEntitlements({ uid:"a1", isAdmin:true, settings:{ disabledFeatures:["tones.lab"] } });
ok(e.tier === 99 && can(e, "tones.lab") && !limitFor(e, "lessons.open"), "admin → tier 99, everything, no limits, not affected by switch-offs");

console.log("overrides and switch-offs");
e = R({ planId:"free", tier:1, status:"active", grants:["tones.lab","dictionary.search"] });
ok(can(e, "tones.lab") && decide(e, "tones.lab").reason === "granted", "personal grant adds a feature");
ok(limitFor(e, "dictionary.search") === null, "a grant lifts the plan's limit for that feature");
e = R({ planId:"premium", tier:3, status:"active", grants:["tones.lab"] }, { settings:{ defaultPlanId:"free", disabledFeatures:["tones.lab"] } });
ok(!can(e, "tones.lab") && decide(e, "tones.lab").reason === "feature_disabled", "global switch-off beats plan and grant");

console.log("usage limits (counter)");
const rows = {};
e = R({ planId:"free", tier:1, status:"active", start:NOW - 10*DAY });
let r;
for (let i = 0; i < 20; i++) r = consumeUsage(rows, e, "dictionary.search", { now:NOW });
ok(r.allowed && r.used === 20, "20 searches allowed");
r = consumeUsage(rows, e, "dictionary.search", { now:NOW });
ok(!r.allowed && r.reason === "limit_reached" && r.used === 20 && r.limit === 20, "21st refused: limit_reached 20/20");
ok(r.resetAt === Date.UTC(2026, 9, 4, 17, 0, 0), "resets at midnight Vientiane time (17:00 UTC)");
r = consumeUsage(rows, e, "dictionary.search", { now:NOW + DAY });
ok(r.allowed && r.used === 1, "next day: counter starts again");
r = consumeUsage(rows, e, "lessons.open", { ref:"L1", now:NOW });
r = consumeUsage(rows, e, "lessons.open", { ref:"L1", now:NOW });
ok(r.allowed && r.reason === "already_counted" && r.used === 1, "opening the same lesson again is not counted twice");
consumeUsage(rows, e, "lessons.open", { ref:"L2", now:NOW }); consumeUsage(rows, e, "lessons.open", { ref:"L3", now:NOW });
r = consumeUsage(rows, e, "lessons.open", { ref:"L4", now:NOW });
ok(!r.allowed && r.used === 3, "4th different lesson refused (3 / day)");
r = consumeUsage(rows, e, "lessons.open", { ref:"L2", now:NOW });
ok(r.allowed, "an already opened lesson stays open after the limit");
r = consumeUsage(rows, e, "tones.lab", { now:NOW });
ok(!r.allowed && r.reason === "feature_not_in_plan", "counting a feature outside the plan is refused");
r = consumeUsage(rows, e, "alphabet", { now:NOW });
ok(r.allowed && r.reason === "unlimited", "unlimited feature: allowed, not counted");
r = consumeUsage(rows, e, "quizzes.attempt", { amount:0, now:NOW });
ok(r.allowed && r.used === 0, "amount 0 only checks");
const snap = usageSnapshot(rows, e, NOW);
ok(snap["dictionary.search"].used === 20 && snap["lessons.open"].used === 3 && snap["quizzes.attempt"].used === 0, "snapshot shows today's counters");

console.log("race: 20 parallel requests against a limit of 5");
const raceRows = {}, raceEnt = R({ planId:"free", tier:1, status:"active" }, { plans:[{ id:"free", tier:1, entitlements:{ "quizzes.attempt":true }, limits:{ "quizzes.attempt":{ n:5, per:"day" } } }] });
const results = await Promise.all(Array.from({ length:20 }, () => Promise.resolve().then(() => consumeUsage(raceRows, raceEnt, "quizzes.attempt", { now:NOW }))));
ok(results.filter(x => x.allowed).length === 5 && Object.values(raceRows)[0].n === 5, "exactly 5 allowed, counter 5/5");

console.log("periods");
ok(periodOf("day", { now:NOW }).key === "d2026-10-04", "day key");
ok(periodOf("day", { now:Date.UTC(2026, 9, 4, 17, 30) }).key === "d2026-10-05", "after 00:00 Vientiane it is the next day");
ok(periodOf("week", { now:NOW }).key === "w2026-09-28" && periodOf("week", { now:NOW }).resetAt === Date.UTC(2026, 9, 4, 17), "week starts Monday, resets next Monday 00:00");
ok(periodOf("month", { now:NOW }).key === "m2026-10" && periodOf("month", { now:NOW }).resetAt === Date.UTC(2026, 9, 31, 17), "month key and reset");
ok(periodOf("period", { start:12345, expiresAt:99999 }).key === "p12345" && periodOf("period", { start:12345, expiresAt:99999 }).resetAt === 99999, "subscription period");
ok(periodOf("lifetime").key === "l" && periodOf("lifetime").resetAt === null, "lifetime");
const moRows = {}, moEnt = R({ planId:"standard", tier:2, status:"active", expiresAt:NOW + 90*DAY });
for (let i = 0; i < 5; i++) consumeUsage(moRows, moEnt, "offline.downloads", { now:NOW });
ok(!consumeUsage(moRows, moEnt, "offline.downloads", { now:NOW + 5*DAY }).allowed, "monthly limit holds within the month");
ok(consumeUsage(moRows, moEnt, "offline.downloads", { now:Date.UTC(2026, 10, 2) }).allowed, "and resets the next month");

console.log("content tiers");
ok(minTier({ access:"premium" }) === 3 && minTier({ access:"4" }) === 4 && minTier({}) === 1 && minTier({ access:"admin" }) === 99, "content access keys and custom tier numbers");
ok(tierFor({ isAdmin:false, user:{ status:"active" }, access:{ status:"active", tier:3, expiresAt: Date.now() + DAY } }) === 3, "tierFor (display) follows the resolver");
ok(tierFor({ isAdmin:false, user:{ status:"active" }, access:{ status:"suspended", tier:3 } }) === 0, "tierFor: suspended → 0");

console.log("demo database functions (js/api/local.js)");
const mem = {};
globalThis.localStorage = { getItem:k => mem[k] ?? null, setItem:(k, v) => { mem[k] = String(v); }, removeItem:k => { delete mem[k]; } };
const { createLocalApi } = await import("../js/api/local.js");
const api = await createLocalApi();
const uid = await api.auth.createAccount("free@test.local", "secret1");
await api.db.set(`users/${uid}`, { email:"free@test.local", status:"active", role:"learner" });
await api.db.set(`access/${uid}`, { planId:"free", tier:1, status:"active", expiresAt:null });
await api.db.set("plans/free", { tier:1, entitlements:{ "dictionary.search":true }, limits:{ "dictionary.search":{ n:2, per:"day" } } });
await api.db.set("settings/app", { defaultPlanId:"free" });
await api.auth.signIn("free@test.local", "secret1");
const ac = createAccessControl(api);
const ent = await ac.load({});
ok(ent.source === "database" && ent.planId === "free" && ent.usage["dictionary.search"].used === 0, "entitlements loaded through rpc, with usage");
ok(!ac.can("tones.lab") && ac.check("tones.lab").reason === "feature_not_in_plan", "check() explains a refusal");
ok((await ac.use("dictionary.search", { ref:"a" })).allowed && (await ac.use("dictionary.search", { ref:"b" })).allowed, "two searches allowed");
r = await ac.use("dictionary.search", { ref:"c" });
ok(!r.allowed && r.reason === "limit_reached" && ac.usage("dictionary.search").used === 2, "third refused; the cached counter follows the database");
ok((await api.db.list("accessLogs")).some(l => l.reason === "limit_reached" && l.uid === uid), "refusal written to the access log");
// a learner editing the cached entitlements in DevTools does not change what the database decides
ac.ent.limits = {}; ac.ent.all = true;
const direct = await api.rpc("ll_use", { p_feature:"dictionary.search", p_amount:1, p_ref:"d" });
ok(!direct.allowed, "tampered browser state: the database function still refuses");
await api.db.set(`access/${uid}`, { planId:"free", tier:1, status:"active", expiresAt:Date.now() - 1000 });
ok((await api.rpc("ll_entitlements")).status === "expired", "expiry is decided from the stored dates");
ok(!!(await api.db.get(`users/${uid}`)), "expiry deletes nothing");

console.log(`\n${pass} passed, ${fail} failed`);
if (fail){ console.log("Some tests failed"); process.exit(1); }
console.log("All tests passed");
