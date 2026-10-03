// Tests js/api/supabase.js against an in-memory imitation of the Supabase client (no network, no real database).
// Run: node scripts/test_supabase_adapter.mjs
import { createSupabaseApi } from "../js/api/supabase.js";
import { saveContent, listVersions, tierFor } from "../js/shared/content.js";
import fs from "fs";

global.fetch = async url => String(url).includes("seed.json")
  ? { ok: true, json: async () => JSON.parse(fs.readFileSync("data/seed.json", "utf8")) }
  : { ok: false, status: 404 };
global.location = { href: "http://localhost:3000/" };

// ---------- fake Supabase ----------
const MISSING = new Set(["tones"]);
const tables = {};
const missing = t => ({ data: null, count: null, error: { code: "PGRST205", message: `Could not find the table 'public.${t}' in the schema cache` } });
const field = (row, col) => {               // "id", "data->>x", "data->x"
  if (col === "id") return row.id;
  const m = col.match(/^data->(>?)(.+)$/); const v = row.data ? row.data[m[2]] : undefined;
  return m[1] ? (v === undefined || v === null ? null : typeof v === "object" ? JSON.stringify(v) : String(v)) : v;
};
const likeRe = p => new RegExp("^" + p.replace(/\\(.)|([%_])|([.*+?^${}()|[\]])/g, (m, esc, wild, re) => esc ? esc.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") : wild === "%" ? ".*" : wild === "_" ? "." : "\\" + re) + "$", "s");
function query(t){
  const filters = []; let order = null, lim = null, head = false, single = false;
  const run = () => {
    if (MISSING.has(t)) return missing(t);
    let rows = Object.values(tables[t] || {}).filter(r => filters.every(f => f(r)));
    if (order) rows.sort((a, b) => { const x = field(a, order.col), y = field(b, order.col); return (x > y ? 1 : x < y ? -1 : 0) * (order.asc ? 1 : -1); });
    if (lim != null) rows = rows.slice(0, lim);
    rows = rows.map(r => JSON.parse(JSON.stringify(r)));
    if (single) return { data: rows[0] || null, error: null };
    return { data: head ? null : rows, count: rows.length, error: null };
  };
  const q = {
    select: (_cols, o = {}) => { head = !!o.head; return q; },
    eq: (c, v) => (filters.push(r => field(r, c) === v), q),
    neq: (c, v) => (filters.push(r => field(r, c) !== v), q),
    gt: (c, v) => (filters.push(r => field(r, c) > v), q),
    lt: (c, v) => (filters.push(r => field(r, c) < v), q),
    gte: (c, v) => (filters.push(r => field(r, c) >= v), q),
    lte: (c, v) => (filters.push(r => field(r, c) <= v), q),
    like: (c, p) => (filters.push(r => likeRe(p).test(field(r, c))), q),
    not: (c, op, p) => (filters.push(r => !likeRe(p).test(field(r, c))), q),
    order: (col, o) => (order = { col, asc: o.ascending }, q),
    limit: n => (lim = n, q),
    maybeSingle: async () => (single = true, run()),
    then: (res, rej) => Promise.resolve(run()).then(res, rej)
  };
  return q;
}
// ll_apply (supabase-schema.sql), implemented independently here; RPC.enabled=false simulates "SQL not run yet"
const RPC = { enabled: true, calls: 0 };
async function rpc(fn, { p_table, p_id, p_ops }){
  if (!RPC.enabled || fn !== "ll_apply") return { data: null, error: { code: "PGRST202", message: "Could not find the function public." + fn } };
  RPC.calls++;
  await new Promise(r => setTimeout(r, 1));            // a little latency, like a network call
  const row = (tables[p_table] ||= {})[p_id] || { id: p_id, data: {} };
  const doc = JSON.parse(JSON.stringify(row.data));
  for (const op of p_ops){
    let t = doc; for (const k of op.path.slice(0, -1)){ if (typeof t[k] !== "object" || t[k] === null) t[k] = {}; t = t[k]; }
    const last = op.path[op.path.length - 1];
    if (op.del) delete t[last]; else if ("inc" in op) t[last] = (typeof t[last] === "number" ? t[last] : 0) + op.inc; else t[last] = op.set;
  }
  tables[p_table][p_id] = { id: p_id, data: doc };
  return { data: null, error: null };
}
const sessions = [];
function createClient(_url, _key, opts){
  const persistent = opts.auth.persistSession;
  let session = null;
  const client = {
    persistent,
    auth: {
      getSession: async () => ({ data: { session } }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe(){} } } }),
      // emails starting with "confirm" behave as if Supabase "Confirm email" is on (no session until confirmed)
      signUp: async ({ email }) => { const user = { id: "uid-" + email.split("@")[0], email, identities: [{}] }; if (email.startsWith("confirm")) return { data: { user, session: null }, error: null }; session = { user }; return { data: { user, session }, error: null }; },
      signInWithPassword: async ({ email }) => { const user = { id: "uid-" + email.split("@")[0], email }; session = { user }; return { data: { user, session }, error: null }; }
    },
    rpc,
    from: t => Object.assign(query(t), {
      upsert: async row => { if (MISSING.has(t)) return missing(t); (tables[t] ||= {})[row.id] = JSON.parse(JSON.stringify(row)); return { error: null }; },
      insert: async row => { if (MISSING.has(t)) return missing(t); (tables[t] ||= {})[row.id] = JSON.parse(JSON.stringify(row)); return { error: null }; },
      delete: () => ({ eq: async (_c, id) => { if (MISSING.has(t)) return missing(t); delete (tables[t] || {})[id]; return { error: null }; } })
    }),
    get session(){ return session; }
  };
  sessions.push(client);
  return client;
}

// ---------- tests ----------
let failed = 0;
const ok = (cond, name) => { console.log((cond ? "  PASS " : "  FAIL ") + name); if (!cond) failed++; };
const api = await createSupabaseApi("https://x.supabase.co", "anon", { createClient });
const day = new Date("2026-10-02T10:00:00Z");

console.log("dates");
await api.db.set("users/u1", { name: "Noy", createdAt: day });
ok((await api.db.get("users/u1")).createdAt === day.getTime(), "Date is stored and read back as milliseconds");
tables.access = { u2: { id: "u2", data: { tier: 3, status: "active", expiresAt: "2099-01-01T00:00:00.000Z" } } };
const acc = await api.db.get("access/u2");
ok(typeof acc.expiresAt === "number", "older ISO date strings are read back as milliseconds");
ok(tierFor({ isAdmin: false, user: { status: "active" }, access: acc }) === 3, "paid learner with an expiry date gets their paid tier");

console.log("dotted fields, counters, deleted fields");
await api.db.set("progress/u1", { skills: {}, lessons: {}, patterns: {}, days: {}, answers: { r: 0, t: 0 } });
await api.db.update("progress/u1", { "skills.reading.t": api.db.inc(1), "skills.reading.r": api.db.inc(1), "answers.t": api.db.inc(1), "days.2026-10-02": 1 });
await api.db.update("progress/u1", { "skills.reading.t": api.db.inc(1), "lessons.l1": { done: true, at: day }, "patterns.5": 123 });
await api.db.update("progress/u1", { "patterns.5": api.db.delField() });
const prog = await api.db.get("progress/u1");
ok(prog.skills.reading.t === 2 && prog.skills.reading.r === 1, "skill counters increment inside the nested object");
ok(prog.answers.t === 1 && prog.days["2026-10"] === undefined && prog.days["2026-10-02"] === 1, "dotted day key nests correctly");
ok(prog.lessons.l1.done === true && prog.lessons.l1.at === day.getTime(), "lesson completion is nested");
ok(!("5" in prog.patterns) && !Object.keys(prog).some(k => k.includes(".")), "delField removes the field and no literal dotted keys remain");
await api.db.set("progress/u1", { last: { type: "lesson", id: "l2" } }, true);
ok((await api.db.get("progress/u1")).skills.reading.t === 2, "set(merge) keeps the other fields");

console.log("concurrent updates (answering a quiz fires two updates at once)");
await api.db.set("progress/race", { skills: {}, days: {}, answers: { r: 0, t: 0 } });
await Promise.all([
  api.db.update("progress/race", { "days.2026-10-02": 1 }),
  api.db.update("progress/race", { "skills.reading.t": api.db.inc(1), "answers.t": api.db.inc(1) }),
  api.db.update("progress/race", { "skills.reading.t": api.db.inc(1), "answers.t": api.db.inc(1) })
]);
const race = await api.db.get("progress/race");
ok(race.days["2026-10-02"] === 1 && race.skills.reading && race.skills.reading.t === 2 && race.answers.t === 2,
  `no update is lost when several run at once (day=${race.days["2026-10-02"]}, reading.t=${race.skills.reading && race.skills.reading.t}, answers.t=${race.answers.t})`);

ok(RPC.calls > 0, "updates go through the database function ll_apply when it exists");
console.log("fallback when ll_apply has not been installed yet");
RPC.enabled = false;
const api2 = await createSupabaseApi("https://x.supabase.co", "anon", { createClient });
await api2.db.set("progress/fb", { skills: {}, days: {} });
await Promise.all([api2.db.update("progress/fb", { "days.d1": 1 }), api2.db.update("progress/fb", { "skills.r.t": api2.db.inc(1) }), api2.db.update("progress/fb", { "skills.r.t": api2.db.inc(1) })]);
const fb = await api2.db.get("progress/fb");
ok(fb.days.d1 === 1 && fb.skills.r.t === 2, "without ll_apply, updates still apply correctly (read-modify-write, one at a time)");
RPC.enabled = true;

console.log("sub-collections");
const evId = await api.db.add("progress/u1/events", { type: "quiz", at: day });
await api.db.add("progress/u2/events", { type: "lesson", at: day });
const ev = await api.db.list("progress/u1/events", { orderBy: ["at", "desc"], limit: 100 });
ok(ev.length === 1 && ev[0].id === evId && ev[0].type === "quiz", "listing one learner's events returns only that learner's events");
ok(tables.progress["u1__events__" + evId], "event row is stored as {uid}__events__{id}");
ok((await api.db.list("progress")).every(r => !r.id.includes("__")), "top-level list excludes sub-collection rows");

console.log("versions");
await saveContent(api, "lessons", "l1", { title: { en: "One" }, status: "draft" }, "admin");
await saveContent(api, "lessons", "l1", { title: { en: "One v2" }, status: "draft" }, "admin");
const lessons = await api.db.list("lessons");
ok(lessons.length === 1 && lessons[0].version === 2, "content list shows the item once, not its version rows");
const vers = await listVersions(api, "lessons", "l1");
ok(vers.length === 1 && vers[0].data.title.en === "One", "versions panel lists the previous version");
ok(await api.db.count("lessons") === 1, "count ignores version rows");

console.log("where filters");
await api.db.set("users/u3", { role: "learner", email: "a@b.c" });
await api.db.set("users/u4", { role: "admin", email: "x@y.z" });
const learners = await api.db.list("users", { where: [["role", "==", "learner"]] });
ok(learners.length === 1 && learners[0].id === "u3", "== filter");

console.log("missing table");
const tones = await api.db.list("tones");
ok(tones.length > 0, "a missing table shows the starter rows from seed.json (read-only)");
let threw = null; try { await api.db.set("tones/t1", { x: 1 }); } catch(e){ threw = e; }
ok(threw && threw.code === "missing-table", "writing to a missing table throws instead of saving only in the browser");

console.log("auth");
const main = sessions[0];
await api.auth.signIn("owner@x.com", "pw");
const newUid = await api.auth.createAccount("learner@x.com", "pw123456");
ok(newUid === "uid-learner" && main.session.user.email === "owner@x.com", "admin creating an account stays signed in as admin");
ok(typeof api.auth.signUp === "function", "learner self-registration (signUp) exists");
let ce = null; try { await api.auth.signUp("confirm.me@x.com", "pw123456"); } catch(e){ ce = e; }
ok(ce && ce.code === "auth/confirm-email" && /confirmation email/.test(ce.message), "with email confirmation on, sign-up asks the learner to confirm their email");
ok(typeof api.auth.onRecovery === "function", "password-recovery hook exists");

console.log(failed ? `\n${failed} test(s) FAILED` : "\nAll tests passed");
process.exit(failed ? 1 : 0);
