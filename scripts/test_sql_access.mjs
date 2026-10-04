// Runs supabase-schema.sql in an embedded Postgres (PGlite, no server, nothing online) with Supabase-like roles and auth.uid(),
// then checks the access functions and row-level security as different users, and that the SQL and JavaScript resolvers agree.
// Run: npm run test:sql
// Not covered here: truly parallel requests (PGlite has one connection). ll_count() serialises them with a row lock;
// scripts/check_access_live.mjs tests that against the real project.
import { PGlite } from "@electric-sql/pglite";
import fs from "fs";
import { resolveEntitlements } from "../js/shared/access.js";
import { RECOMMENDED } from "../js/shared/features.js";
const ROOT = new URL("../", import.meta.url);

let pass = 0, fail = 0;
const ok = (c, m) => { c ? pass++ : fail++; console.log((c ? "  PASS " : "  FAIL ") + m); };
const db = new PGlite();

await db.exec(`
  create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
  create schema auth;
  create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  create function auth.jwt() returns jsonb language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb $$;
  grant usage on schema auth to anon, authenticated;
  grant execute on all functions in schema auth to anon, authenticated;
  create table auth.users (id uuid primary key, email text, created_at timestamptz default now());
  create schema storage;
  create table storage.buckets (id text primary key, name text, public boolean);
  create table storage.objects (id serial primary key, bucket_id text, name text);
  alter table storage.objects enable row level security;
  grant usage on schema public to anon, authenticated;
  alter default privileges in schema public grant all on tables to anon, authenticated;
  alter default privileges in schema public grant all on functions to anon, authenticated;
`);
const schema = fs.readFileSync(new URL("supabase-schema.sql", ROOT), "utf8");
try { await db.exec(schema); ok(true, "supabase-schema.sql runs, including both self-tests"); }
catch(e){ ok(false, "schema failed: " + e.message); process.exit(1); }
try { await db.exec(schema); ok(true, "running it a second time works (rerunnable)"); } catch(e){ ok(false, "second run failed: " + e.message); }

const U = { free:"11111111-1111-1111-1111-111111111111", prem:"22222222-2222-2222-2222-222222222222", adm:"33333333-3333-3333-3333-333333333333",
            neu:"44444444-4444-4444-4444-444444444444", sus:"55555555-5555-5555-5555-555555555555" };
const DAY = 86400000, now = Date.now();
const j = v => JSON.stringify(v).replace(/'/g, "''");
const freePlan = { name:{ en:"Free" }, tier:1, entitlements: RECOMMENDED.free.entitlements, limits: Object.assign({}, RECOMMENDED.free.limits, { "dictionary.search":{ n:2, per:"day" } }) };
const rows = {
  plans: { free: freePlan, premium:{ tier:3, entitlements: RECOMMENDED.premium.entitlements, limits:{} }, standard:{ tier:2, graceDays:3, entitlements: RECOMMENDED.standard.entitlements, limits: RECOMMENDED.standard.limits } },
  settings: { app:{ defaultPlanId:"free", allowRegistration:true }, bootstrap:{ uid: U.adm } },
  users: { [U.free]:{ status:"active", role:"learner", email:"f@x" }, [U.prem]:{ status:"active", role:"learner" }, [U.sus]:{ status:"active", role:"learner" } },
  access: { [U.free]:{ planId:"free", tier:1, status:"active", expiresAt:null }, [U.prem]:{ planId:"premium", tier:3, status:"active", start: now - DAY, expiresAt: now + 30*DAY },
            [U.sus]:{ planId:"premium", tier:3, status:"suspended" } },
  admins: { [U.adm]:{ role:"super", status:"active" } },
  bundles: { meta:{ version:1 }, t0_p0:{ tier:0 }, t1_p0:{ tier:1 }, t3_p0:{ tier:3 } }
};
for (const [t, r] of Object.entries(rows)) for (const [id, d] of Object.entries(r)) await db.exec(`insert into public."${t}" (id, data) values ('${id}', '${j(d)}') on conflict (id) do update set data = excluded.data`);

const as = async (who, fn) => {
  await db.exec(`reset role; select set_config('request.jwt.claim.sub', '${who ? U[who] : ""}', false); set role ${who ? "authenticated" : "anon"};`);
  try { return await fn(); } finally { await db.exec(`reset role; select set_config('request.jwt.claim.sub', '', false);`); }
};
const one = async q => (await db.query(q)).rows[0];
const all = async q => (await db.query(q)).rows;
const err = async q => { try { await db.query(q); return null; } catch(e){ return e.message; } };

console.log("free learner");
await as("free", async () => {
  const e = (await one(`select public.ll_entitlements() e`)).e;
  ok(e.planId === "free" && e.tier === 1 && e.status === "active" && e.usage["dictionary.search"].used === 0, "entitlements: free, tier 1, usage 0");
  const a = (await one(`select public.ll_use('dictionary.search', 1, 'a') r`)).r, b = (await one(`select public.ll_use('dictionary.search', 1, 'b') r`)).r;
  const c = (await one(`select public.ll_use('dictionary.search', 1, 'c') r`)).r, a2 = (await one(`select public.ll_use('dictionary.search', 1, 'a') r`)).r;
  ok(a.allowed && b.allowed && !c.allowed && c.reason === "limit_reached" && c.used === 2 && c.limit === 2, "ll_use: 2 allowed, 3rd limit_reached (2/2)");
  ok(a2.allowed && a2.reason === "already_counted", "same ref again is free");
  ok(c.resetAt > now && c.resetAt - now <= DAY, "resetAt is the next midnight");
  const t = (await one(`select public.ll_use('tones.lab') r`)).r;
  ok(!t.allowed && t.reason === "feature_not_in_plan", "tones.lab refused: feature_not_in_plan");
  ok((await one(`select public.ll_can('labs.culture') c`)).c === true && (await one(`select public.ll_can('tones.lab') c`)).c === false, "ll_can");
  ok((await one(`select public.ll_my_tier() t`)).t === 1, "ll_my_tier = 1");
  const b2 = (await all(`select id from public.bundles order by id`)).map(r => r.id).join(",");
  ok(b2 === "meta,t0_p0,t1_p0", "bundles: only meta, tier 0 and tier 1 (" + b2 + ")");
  // bypass attempts
  await db.query(`update public.access set data = data || '{"planId":"premium","tier":3}' where id = '${U.free}'`);
  ok((await one(`select data->>'planId' p from public.access where id = '${U.free}'`)).p === "free", "cannot change own access (plan stays free)");
  ok(!!(await err(`insert into public."usage" (id, data) values ('${U.free}__dictionary.search__x', '{"n":0}')`)), "cannot insert usage rows");
  await db.query(`update public."usage" set data = '{"n":0}' where id like '${U.free}%'`);
  ok((await one(`select public.ll_use('dictionary.search', 1, 'z') r`)).r.allowed === false, "cannot reset own counter (update silently affects nothing)");
  await db.query(`delete from public."usage" where id like '${U.free}%'`);
  ok((await one(`select count(*)::int n from public."usage" where id like '${U.free}%'`)).n >= 1, "cannot delete own counter");
  ok(!!(await err(`select public.ll_count('${U.free}__x__d', 99, -5, null, null)`)), "internal ll_count is not callable");
  ok(!!(await err(`select public.ll_log('{}'::jsonb, 'x', '{}'::jsonb)`)), "internal ll_log is not callable");
  ok(!!(await err(`insert into public.plans (id, data) values ('hack', '{"tier":99}')`)), "cannot create plans");
  await db.query(`update public.plans set data = data || '{"limits":{}}' where id = 'free'`);
  ok(Object.keys((await one(`select public.ll_entitlements() e`)).e.limits).length > 0, "cannot remove plan limits");
  await db.query(`update public.settings set data = '{"defaultPlanId":"premium","allowRegistration":true}' where id = 'app'`);
  ok((await one(`select public.ll_entitlements() e`)).e.planId === "free", "cannot change settings (default plan)");
  ok((await all(`select id from public."accessLogs"`)).length === 0, "cannot read access logs");
  ok((await all(`select id from public."usage" where id like '${U.prem}%'`)).length === 0 && (await all(`select id from public."usage"`)).every(r => r.id.startsWith(U.free)), "reads only own usage rows");
  ok((await all(`select id from public.access`)).every(r => r.id === U.free), "reads only own access row");
  ok(!!(await err(`insert into public.subscriptions (id, data) values ('s1', '{"uid":"${U.free}","planId":"premium"}')`)), "cannot write subscription history");
});

console.log("handwriting content and attempts");
await db.exec(`insert into public.characters (id, data) values ('char-ກ', '{"char":"ກ","status":"published","handwriting":{"v":1,"strokes":[{"id":"s1","points":[[0.3,0.8],[0.7,0.8]]}]}}')`);
await as("free", async () => {
  ok((await all(`select id from public.characters`)).length === 0, "learners cannot read raw characters (templates reach them only through published bundles)");
  await db.query(`update public.characters set data = data || '{"handwriting":null}' where id = 'char-ກ'`);
  ok(!!(await err(`insert into public.characters (id, data) values ('char-x', '{"char":"x"}')`)), "learners cannot create characters / stroke templates");
  ok(!(await err(`insert into public.progress (id, data) values ('${U.free}__events__hw1', '{"type":"handwriting","score":90}')`)), "a learner saves their own handwriting attempt");
  ok(!!(await err(`insert into public.progress (id, data) values ('${U.prem}__events__hw1', '{"type":"handwriting","score":100}')`)), "a learner cannot write another learner's attempt");
  ok((await all(`select id from public.progress where id like '${U.prem}%'`)).length === 0, "a learner cannot read another learner's attempts");
});
ok((await one(`select data->'handwriting' is not null and data->'handwriting' <> 'null'::jsonb as kept from public.characters where id = 'char-ກ'`)).kept, "the learner's attempt to delete the template changed nothing");
await as("adm", async () => {
  await db.query(`update public.characters set data = data || '{"handwriting":{"v":1,"strokes":[]}}' where id = 'char-ກ'`);
  ok((await one(`select jsonb_array_length(data->'handwriting'->'strokes') n from public.characters where id = 'char-ກ'`)).n === 0, "admins with characters rights can edit templates");
  ok((await all(`select id from public.progress where id like '${U.free}__events__%'`)).length === 1, "admins can read learners' attempts");
});

console.log("self-registration (policy fix)");
await db.exec(`insert into public.users (id, data) values ('${U.neu}', '{"status":"active","role":"learner"}')`);
await as("neu", async () => {
  ok(!!(await err(`insert into public.access (id, data) values ('${U.neu}', '{"planId":"premium","tier":1,"status":"active","source":"registration","expiresAt":null}')`)), "registering with planId premium is refused");
  ok(!!(await err(`insert into public.access (id, data) values ('${U.neu}', '{"planId":"free","tier":1,"status":"active","source":"registration","grants":["tones.lab"]}')`)), "registering with grants is refused");
  ok(!(await err(`insert into public.access (id, data) values ('${U.neu}', '{"planId":"free","tier":1,"status":"active","source":"registration","expiresAt":null}')`)), "registering on the default plan works");
  ok(!!(await err(`insert into public.access (id, data) values ('${U.neu}', '{"planId":"free","tier":1,"status":"active","source":"registration"}')`)), "only once");
});

console.log("premium, expiry, grace, suspended");
await as("prem", async () => {
  const e = (await one(`select public.ll_entitlements() e`)).e;
  ok(e.planId === "premium" && e.tier === 3 && Object.keys(e.limits).length === 0, "premium: tier 3, no limits");
  ok((await all(`select id from public.bundles`)).some(r => r.id === "t3_p0"), "premium reads the tier-3 bundle");
  ok((await one(`select public.ll_use('tones.lab') r`)).r.reason === "unlimited", "premium: tones.lab unlimited");
});
await db.exec(`update public.access set data = data || '{"expiresAt": ${now - 1000}}' where id = '${U.prem}'`);
await as("prem", async () => {
  const e = (await one(`select public.ll_entitlements() e`)).e;
  ok(e.status === "expired" && e.planId === "free" && e.tier === 1, "expired premium → free (server time)");
  ok(!(await all(`select id from public.bundles`)).some(r => r.id === "t3_p0"), "expired: tier-3 bundle no longer readable");
});
await db.exec(`update public.access set data = data || '{"planId":"standard","tier":2,"expiresAt": ${now - DAY}}' where id = '${U.prem}'`);
await as("prem", async () => { const e = (await one(`select public.ll_entitlements() e`)).e; ok(e.status === "grace" && e.tier === 2, "within standard's 3 grace days → still standard"); });
await db.exec(`update public.access set data = data || '{"planId":"premium","status":"trial","expiresAt": ${now + DAY}, "grants":["x"]}' where id = '${U.prem}'`);
await as("prem", async () => { const e = (await one(`select public.ll_entitlements() e`)).e; ok(e.status === "trial" && e.tier === 3 && e.grants[0] === "x", "trial → plan entitlements, grants read"); });
await as("sus", async () => {
  const e = (await one(`select public.ll_entitlements() e`)).e;
  ok(e.status === "suspended" && e.tier === 0, "suspended → tier 0");
  ok((await all(`select id from public.bundles order by id`)).map(r => r.id).join(",") === "meta,t0_p0", "suspended: public bundle only");
  ok((await one(`select public.ll_use('lessons.open') r`)).r.reason === "account_suspended", "suspended: ll_use refuses with account_suspended");
});

console.log("admin, anonymous");
await as("adm", async () => {
  const e = (await one(`select public.ll_entitlements() e`)).e;
  ok(e.role === "admin" && e.tier === 99, "owner/admin → tier 99");
  ok((await all(`select id from public."accessLogs"`)).length >= 2, "admin reads access logs");
  ok((await all(`select id from public."usage"`)).length >= 1, "admin reads usage");
  await db.query(`update public.plans set data = data || '{"graceDays":5}' where id = 'premium'`);
  ok((await one(`select data->>'graceDays' g from public.plans where id='premium'`)).g === "5", "super admin edits plans");
  await db.query(`delete from public."usage" where id like '${U.free}%'`);
  ok((await all(`select id from public."usage" where id like '${U.free}%'`)).length === 0, "super admin resets usage");
});
await as(null, async () => {
  ok((await one(`select public.ll_entitlements() e`)).e.role === "guest", "anonymous → guest");
  ok(!!(await err(`select public.ll_use('lessons.open')`)), "anonymous cannot call ll_use");
  ok((await all(`select id from public.bundles order by id`)).map(r => r.id).join(",") === "meta,t0_p0", "anonymous: public bundle only");
});

console.log("SQL and JavaScript resolvers agree");
const plansList = (await all(`select id, data from public.plans`)).map(r => Object.assign({ id:r.id }, r.data));   // as stored (admin edits included)
const cases = [
  { planId:"free", tier:1, status:"active", expiresAt:null },
  { planId:"premium", tier:3, status:"active", expiresAt: now + DAY, start: now - DAY },
  { planId:"premium", tier:3, status:"active", expiresAt: now - DAY },
  { planId:"standard", tier:2, status:"active", expiresAt: now - DAY },
  { planId:"standard", tier:2, status:"trial", expiresAt: now + DAY, grants:["tones.lab"] },
  { planId:"premium", tier:3, status:"pending" },
  { planId:"premium", tier:3, status:"cancelled" },
  { planId:"premium", tier:3, status:"suspended" },
  { planId:"gone", tier:2, status:"active" },
  null
];
const pick = e => JSON.stringify({ status:e.status, planId:e.planId, tier:e.tier, all:e.all, features:Object.keys(e.features).sort(), limits:Object.keys(e.limits).sort().map(k => [k, e.limits[k].n, e.limits[k].per]), grants:e.grants });
for (const [i, a] of cases.entries()){
  await db.exec(`delete from public.access where id = '${U.free}'`);
  if (a) await db.exec(`insert into public.access (id, data) values ('${U.free}', '${j(a)}')`);
  const sqlE = await as("free", async () => (await one(`select public.ll_resolve() e`)).e);
  const jsE = resolveEntitlements({ uid:U.free, user: rows.users[U.free], access: a, plans: plansList, settings: rows.settings.app });
  ok(pick(sqlE) === pick(jsE), `case ${i} (${a ? a.planId + "/" + a.status : "no access"}): ${pick(sqlE) === pick(jsE) ? sqlE.status + " tier " + sqlE.tier : "SQL " + pick(sqlE) + " vs JS " + pick(jsE)}`);
}

console.log("welcome page: new tables and settings/welcome (docs/WELCOME.md)");
{
  const W = { ed:"a1000000-0000-0000-0000-000000000001", ct:"a1000000-0000-0000-0000-000000000002", ad:"a1000000-0000-0000-0000-000000000003",
              rv:"a1000000-0000-0000-0000-000000000004", sp:"a1000000-0000-0000-0000-000000000005", cu:"a1000000-0000-0000-0000-000000000006", cp:"a1000000-0000-0000-0000-000000000007" };
  const roles = { ed:{ role:"editor" }, ct:{ role:"content" }, ad:{ role:"admin" }, rv:{ role:"reviewer" }, sp:{ role:"support" },
                  cu:{ role:"custom", permissions:{ places:{ view:true, edit:true } } }, cp:{ role:"custom", permissions:{ promotions:{ view:true, edit:true } } } };
  for (const [k, d] of Object.entries(roles)) await db.exec(`insert into public.admins (id, data) values ('${W[k]}', '${j(Object.assign({ status:"active" }, d))}') on conflict (id) do update set data = excluded.data`);
  const asW = async (k, fn) => {
    const sub = k === null ? "" : W[k] || U[k];
    await db.exec(`reset role; select set_config('request.jwt.claim.sub', '${sub}', false); set role ${k === null ? "anon" : "authenticated"};`);
    try { return await fn(); } finally { await db.exec(`reset role; select set_config('request.jwt.claim.sub', '', false);`); }
  };
  const tryWrite = (k, table, id) => asW(k, async () => { try { await db.query(`insert into public."${table}" (id, data) values ($1, '{"status":"draft"}')`, [id]); return true; } catch(e){ return false; } });
  const types = ["places","festivals","offers","resources"];
  // seed one published public row of each type, a published welcome copy and its draft
  for (const t of types) await db.exec(`insert into public."${t}" (id, data) values ('seed-${t}', '{"status":"published","access":"public"}') on conflict (id) do nothing`);
  await db.exec(`insert into public.settings (id, data) values ('welcome', '{"published":{"hero":{}}}'), ('welcomeDraft', '{"data":{"secret":"unpublished copy"}}') on conflict (id) do update set data = excluded.data`);
  await db.exec(`insert into public.bundles (id, data) values ('t2_p0', '{"tier":2}') on conflict (id) do nothing`);

  const anonBundles = await asW(null, async () => (await all(`select id from public.bundles order by id`)).map(r => r.id).join(","));
  ok(anonBundles === "meta,t0_p0", "anonymous: reads only the bundle meta and tier-0 parts (" + anonBundles + ")");
  ok(await asW(null, async () => (await all(`select id from public.places`)).length) === 0, "anonymous: cannot read the raw places table (only the bundle)");
  ok(await asW(null, async () => !!(await one(`select data from public.settings where id = 'welcome'`))), "anonymous: reads the published welcome copy");
  ok(await asW(null, async () => !(await one(`select data from public.settings where id = 'welcomeDraft'`))), "anonymous: cannot read the welcome draft");
  ok(await asW("free", async () => !(await one(`select data from public.settings where id = 'welcomeDraft'`))), "learner: cannot read the welcome draft");
  ok(await asW("ed", async () => !!(await one(`select data from public.settings where id = 'welcomeDraft'`))), "editor: reads the welcome draft");
  for (const t of types){
    ok(!(await tryWrite(null, t, "x-anon")) && !(await tryWrite("free", t, "x-free")) && !(await tryWrite("rv", t, "x-rv")) && !(await tryWrite("sp", t, "x-sp")),
      `${t}: anonymous, learner, reviewer and support cannot write`);
    ok((await tryWrite("ed", t, "x-ed")) && (await tryWrite("ct", t, "x-ct")) && (await tryWrite("ad", t, "x-ad")) && (await tryWrite("adm", t, "x-super")),
      `${t}: editor, content, admin and super can write`);
  }
  ok((await tryWrite("cu", "places", "x-cu")) && !(await tryWrite("cu", "festivals", "x-cu")) && !(await tryWrite("cu", "offers", "x-cu")), "custom role with places → edit: places only");
  ok((await tryWrite("cp", "offers", "x-cp")) && !(await tryWrite("cp", "places", "x-cp2")), "custom role with promotions → edit: offers only");
  const setW = (k, id) => asW(k, async () => { try { await db.query(`insert into public.settings (id, data) values ($1, '{"x":1}') on conflict (id) do update set data = excluded.data`, [id]); return (await one(`select data->>'x' x from public.settings where id = '${id}'`))?.x === "1"; } catch(e){ return false; } });
  ok((await setW("ed", "welcome")) && (await setW("ed", "welcomeDraft")), "editor: writes settings/welcome and its draft");
  ok(!(await setW("ed", "app")), "editor: cannot write settings/app (only super writes outside its menu)");
  ok(!(await setW("rv", "welcome")) && !(await setW("sp", "welcome")) && !(await setW("free", "welcome")) && !(await setW(null, "welcome")), "reviewer, support, learner and anonymous cannot write settings/welcome");
  ok(!(await setW("cu", "welcome")), "custom role without the welcome menu cannot write it");
  ok(await setW("adm", "app"), "super admin still writes settings/app");
  // the migration file for live projects runs on its own and again
  const mig = fs.readFileSync(new URL("supabase-welcome-migration.sql", ROOT), "utf8");
  try { await db.exec(mig); await db.exec(mig); ok(true, "supabase-welcome-migration.sql runs, twice"); } catch(e){ ok(false, "migration failed: " + e.message); }
  ok(!(await tryWrite("free", "places", "x-free2")) && (await tryWrite("ed", "places", "x-ed2")), "after the migration the same rules apply");
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
