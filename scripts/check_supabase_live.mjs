// Read-only health check of the Supabase project in env-config.js, as an anonymous visitor.
// It never writes anything. Run: node scripts/check_supabase_live.mjs
import fs from "fs";

const cfg = fs.readFileSync(new URL("../env-config.js", import.meta.url), "utf8");
const url = (cfg.match(/url:\s*"([^"]+)"/) || [])[1];
const key = (cfg.match(/anonKey:\s*"([^"]+)"/) || [])[1];
if (!url || !key){ console.error("No Supabase url/anonKey found in env-config.js"); process.exit(1); }
const headers = { apikey: key, Authorization: `Bearer ${key}` };

let failed = 0;
const report = (ok, msg) => { console.log((ok ? "  OK   " : "  FAIL ") + msg); if (!ok) failed++; };

async function rows(table){
  const r = await fetch(`${url}/rest/v1/${encodeURIComponent(table)}?select=id`, { headers: { ...headers, Prefer: "count=exact", Range: "0-0" } });
  const body = await r.json().catch(() => null);
  if (r.status === 404 || (body && body.code === "PGRST205")) return { missing: true };
  const total = Number((r.headers.get("content-range") || "/0").split("/")[1]);
  return { missing: false, total, ids: Array.isArray(body) ? body.map(x => x.id) : [] };
}

console.log(`Supabase project: ${url}\n`);
const health = await fetch(`${url}/auth/v1/health`, { headers });
report(health.ok, `Auth service reachable (HTTP ${health.status})`);

console.log("\nTables exist:");
const all = ["users","admins","adminNotes","access","plans","subscriptions","settings","lessons","patterns","grammar","vocabulary",
  "dialogues","quizzes","audio","paths","releases","lexicon","videos","tones","culture","characters","dictionary",
  "bundles","progress","reviews","bookmarks","notes","activity"];
const res = {};
for (const t of all){ res[t] = await rows(t); if (res[t].missing) report(false, `table "${t}" is missing`); }
if (!all.some(t => res[t].missing)) report(true, `all ${all.length} tables exist`);

console.log("\nPrivate data is hidden from anonymous visitors:");
for (const t of ["users","admins","adminNotes","access","subscriptions","progress","reviews","bookmarks","notes","activity",
                 "lessons","patterns","grammar","vocabulary","dialogues","quizzes","audio","videos","tones","culture","characters","dictionary"]){
  if (!res[t].missing) report(res[t].total === 0, `${t}: ${res[t].total} rows visible`);
}

console.log("\nPublic data is readable:");
report(!res.settings.missing && res.settings.ids.length >= 0 && res.settings.total > 0, `settings readable (${res.settings.total} rows)`);
report(!res.plans.missing && res.plans.total > 0, `plans readable (${res.plans.total} rows)`);
const meta = await fetch(`${url}/rest/v1/bundles?select=id,data&id=eq.meta`, { headers }).then(r => r.json()).catch(() => []);
report(Array.isArray(meta) && meta.length === 1, "bundles/meta readable (published content exists)");
if (Array.isArray(meta) && meta[0]){
  const tiers = Object.keys(meta[0].data.tiers || {}).map(Number);
  const visible = (await fetch(`${url}/rest/v1/bundles?select=id`, { headers }).then(r => r.json())).map(x => x.id);
  report(visible.some(id => id.startsWith("t0_")), "public (tier 0) bundle readable");
  const paid = tiers.filter(t => t >= 1);
  report(!visible.some(id => paid.some(t => id.startsWith(`t${t}_`))), `free/paid bundles (tiers ${paid.join(", ") || "none"}) hidden from anonymous visitors`);
}

console.log("\nStorage:");
const bucket = await fetch(`${url}/storage/v1/object/public/laolao-assets/__healthcheck__`, { headers });
report(bucket.status !== 400 || !(await bucket.text()).includes("Bucket not found"), `bucket "laolao-assets" exists (HTTP ${bucket.status} for a test file is expected)`);

console.log(failed ? `\n${failed} check(s) failed` : "\nAll checks passed");
process.exit(failed ? 1 : 0);
