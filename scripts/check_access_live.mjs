// Live security check of plans and limits against the Supabase project in env-config.js.
// It signs in as TEST accounts you create and tries to get around the rules the way a technical user could.
// It changes nothing except the test account's own usage counters (and refused writes are refused by the database).
//
// Setup (once): in Supabase create two learner accounts on your site, e.g. test-free@… on the Free plan and
// test-premium@… on Premium (Admin → Learners → Assign plan). Configure limits in Admin → Plan access & limits.
// Run (PowerShell):
//   $env:LAOLAO_FREE_EMAIL="test-free@…"; $env:LAOLAO_FREE_PASSWORD="…"
//   $env:LAOLAO_PREMIUM_EMAIL="test-premium@…"; $env:LAOLAO_PREMIUM_PASSWORD="…"   (optional)
//   npm run check:access
import fs from "fs";
import { createClient } from "@supabase/supabase-js";

const cfg = fs.readFileSync(new URL("../env-config.js", import.meta.url), "utf8");
const url = (cfg.match(/url:\s*["']([^"']+)["']/) || [])[1], key = (cfg.match(/anonKey:\s*["']([^"']+)["']/) || [])[1];
if (!url || !key){ console.error("No Supabase url/anonKey in env-config.js"); process.exit(1); }
const E = process.env;
if (!E.LAOLAO_FREE_EMAIL || !E.LAOLAO_FREE_PASSWORD){ console.error("Set LAOLAO_FREE_EMAIL and LAOLAO_FREE_PASSWORD (a Free test account). See the top of this file."); process.exit(1); }

let pass = 0, fail = 0, warn = 0;
const ok = (c, m) => { c ? pass++ : fail++; console.log((c ? "  OK   " : "  FAIL ") + m); };
const note = m => { warn++; console.log("  NOTE " + m); };
const client = () => createClient(url, key, { auth: { persistSession:false, autoRefreshToken:false } });

async function signIn(email, password){
  const c = client(); const { data, error } = await c.auth.signInWithPassword({ email, password });
  if (error) throw new Error(email + ": " + error.message);
  return { c, uid: data.user.id };
}
const rpc = async (c, name, args) => { const { data, error } = await c.rpc(name, args); if (error) throw error; return data; };

console.log("Database functions installed:");
const anon = client();
const g = await anon.rpc("ll_entitlements");
if (g.error){ ok(false, "ll_entitlements() missing: run the latest supabase-schema.sql in the SQL Editor (" + g.error.message + ")"); process.exit(1); }
ok(g.data.role === "guest", "ll_entitlements() answers (anonymous → guest)");
ok(!!(await anon.rpc("ll_use", { p_feature:"lessons.open" })).error, "anonymous visitors cannot call ll_use()");

console.log("\nFree test account:");
const F = await signIn(E.LAOLAO_FREE_EMAIL, E.LAOLAO_FREE_PASSWORD);
const ent = await rpc(F.c, "ll_entitlements");
console.log(`       plan ${ent.planId}, status ${ent.status}, tier ${ent.tier}, ${ent.all ? "all features" : Object.keys(ent.features).length + " features"}, ${Object.keys(ent.limits).length} limits`);
ok(ent.role === "learner" && ent.tier >= 1 && ent.tier < 99, "resolves as a learner with a paid-or-free tier");
if (ent.all) note("this plan is not configured yet (all features, no limits): Admin → Plan access & limits → Apply recommended defaults");

// 1. change own access / plan / settings
const before = (await F.c.from("access").select("data").eq("id", F.uid).maybeSingle()).data;
await F.c.from("access").update({ data: Object.assign({}, before && before.data, { planId:"premium", tier:3, status:"active", expiresAt:null }) }).eq("id", F.uid);
const after = (await F.c.from("access").select("data").eq("id", F.uid).maybeSingle()).data;
ok(JSON.stringify(before) === JSON.stringify(after), "cannot give itself Premium (access row unchanged)");
ok(!!(await F.c.from("access").upsert({ id:F.uid, data:{ planId:"premium", tier:1, status:"active", source:"registration" } })).error || JSON.stringify((await F.c.from("access").select("data").eq("id", F.uid).maybeSingle()).data) === JSON.stringify(before), "cannot re-register its access as Premium");
ok(!!(await F.c.from("plans").insert({ id:"zz-hack", data:{ tier:99 } })).error, "cannot create a plan");
const pl = (await F.c.from("plans").select("data").eq("id", ent.planId).maybeSingle()).data;
await F.c.from("plans").update({ data: Object.assign({}, pl && pl.data, { limits:{}, entitlements:null }) }).eq("id", ent.planId);
ok(JSON.stringify((await F.c.from("plans").select("data").eq("id", ent.planId).maybeSingle()).data) === JSON.stringify(pl), "cannot change its plan's features or limits");
const st = (await F.c.from("settings").select("data").eq("id", "app").maybeSingle()).data;
await F.c.from("settings").update({ data: Object.assign({}, st && st.data, { defaultPlanId:"premium" }) }).eq("id", "app");
ok(JSON.stringify((await F.c.from("settings").select("data").eq("id", "app").maybeSingle()).data) === JSON.stringify(st), "cannot change the default plan");
ok(!!(await F.c.from("subscriptions").insert({ id:"zz-hack", data:{ uid:F.uid, planId:"premium" } })).error, "cannot write subscription history");

// 2. content above the plan
const meta = (await F.c.from("bundles").select("data").eq("id", "meta").maybeSingle()).data;
const tiers = meta ? Object.keys(meta.data.tiers || {}).map(Number) : [];
const above = tiers.filter(t => t > ent.tier);
for (const t of above){ const { data } = await F.c.from("bundles").select("id").like("id", `t${t}\\_p%`); ok(!data || data.length === 0, `tier-${t} content (above the plan) is not readable`); }
if (!above.length) note("no published tier above this account's tier to test");
ok(!!(await F.c.from("lessons").select("id").limit(1)).data && (await F.c.from("lessons").select("id").limit(1)).data.length === 0, "raw content tables are not readable by learners");

// 3. counters
ok(!!(await F.c.from("usage").insert({ id:`${F.uid}__dictionary.search__x`, data:{ n:0 } })).error, "cannot create usage counters");
const mine = (await F.c.from("usage").select("id,data").like("id", `${F.uid}\\_\\_%`)).data || [];
if (mine.length){ await F.c.from("usage").update({ data:{ n:0 } }).eq("id", mine[0].id); const again = (await F.c.from("usage").select("data").eq("id", mine[0].id).maybeSingle()).data;
  ok(again && again.data.n === mine[0].data.n, "cannot reset its own counter"); }
const others = (await F.c.from("usage").select("id")).data || [];
ok(others.every(r => r.id.startsWith(F.uid)), "sees only its own counters");
ok(((await F.c.from("accessLogs").select("id").limit(1)).data || []).length === 0, "cannot read the access logs");
ok(!!(await F.c.rpc("ll_count", { p_id:`${F.uid}__x__d`, p_limit:999, p_amount:-100, p_ref:null, p_info:null })).error, "cannot call the internal counter function");

// 4. limit under parallel requests
const lim = Object.entries(ent.limits)[0];
if (lim){
  const [f, { n }] = lim;
  const u0 = (ent.usage && ent.usage[f] && ent.usage[f].used) || 0, left = Math.max(0, n - u0);
  if (left > 25) note(`${f}: ${left} uses left today; skipped the parallel test (it would use them up)`);
  else {
    const results = await Promise.all(Array.from({ length: left + 5 }, (_, i) => rpc(F.c, "ll_use", { p_feature:f, p_amount:1, p_ref:"live-check-" + Date.now() + "-" + i })));
    const allowed = results.filter(r => r.allowed).length, used = Math.max(...results.map(r => r.used));
    ok(allowed === left && used <= n, `${left + 5} parallel ${f} requests with ${left} left: ${allowed} allowed, counter ${used}/${n} (never above the limit)`);
  }
} else note("the Free test account has no usage limits configured; parallel limit test skipped");
const blocked = Object.entries({ "tones.lab":1, "practice.advanced":1, "labs.kinship":1 }).map(([f]) => f).find(f => !ent.all && !ent.features[f] && !(ent.grants || []).includes(f));
if (blocked){ const r = await rpc(F.c, "ll_use", { p_feature:blocked, p_amount:1, p_ref:null }); ok(!r.allowed && r.reason === "feature_not_in_plan", `${blocked} refused by the database (${r.reason})`); }

if (E.LAOLAO_PREMIUM_EMAIL && E.LAOLAO_PREMIUM_PASSWORD){
  console.log("\nPremium test account:");
  const P = await signIn(E.LAOLAO_PREMIUM_EMAIL, E.LAOLAO_PREMIUM_PASSWORD);
  const pe = await rpc(P.c, "ll_entitlements");
  console.log(`       plan ${pe.planId}, status ${pe.status}, tier ${pe.tier}`);
  ok(pe.tier > ent.tier, "Premium resolves to a higher tier than Free");
  const pr = (await P.c.from("usage").select("id")).data || [];
  ok(pr.every(r => r.id.startsWith(P.uid)), "cannot read the Free account's counters");
  ok(((await P.c.from("access").select("id")).data || []).every(r => r.id === P.uid), "cannot read other learners' access");
}

console.log(`\n${pass} ok, ${fail} failed${warn ? ", " + warn + " note(s)" : ""}`);
process.exit(fail ? 1 : 0);
