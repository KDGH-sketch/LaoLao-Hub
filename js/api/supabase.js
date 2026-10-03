// Supabase implementation of the LaoLao data layer.
// Every table has the shape (id text primary key, data jsonb, created_at, updated_at) — see supabase-schema.sql.
//
// Paths are mapped onto tables like this:
//   "users/abc"                  → table users,    row "abc"
//   "progress/abc/events/xyz"    → table progress, row "abc__events__xyz"   (sub-collections share the parent table)
//   list("progress/abc/events")  → rows of progress whose id starts with "abc__events__"
//   list("lessons")              → rows of lessons whose id has no "__" (sub-collection rows are excluded)
//
// The app was written against a Firestore-like API, so this adapter also supports:
//   - dotted field paths in update()/set()  e.g. { "skills.reading.t": 3 }
//   - db.inc(n) counters and db.delField()
//   - Date values, stored as milliseconds (ISO date strings written by older versions are read back as milliseconds)

const SUB = "__";
const INC = "__inc__", DELF = "__delete__";
const ISO_DATE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/;

// Dates → ms on the way in
function toStore(v){
  if (v instanceof Date) return v.getTime();
  if (Array.isArray(v)) return v.map(toStore);
  if (v && typeof v === "object"){ const o = {}; for (const k in v) o[k] = toStore(v[k]); return o; }
  return v;
}
// ISO strings → ms on the way out (rows written before dates were stored as ms)
function fromStore(v){
  if (typeof v === "string" && ISO_DATE.test(v)) return Date.parse(v);
  if (Array.isArray(v)) return v.map(fromStore);
  if (v && typeof v === "object"){ const o = {}; for (const k in v) o[k] = fromStore(v[k]); return o; }
  return v;
}
const isInc = v => v && typeof v === "object" && v[INC] !== undefined;
// Apply { "a.b.c": value } style fields (with inc / delete markers) onto a plain object.
function applyFields(target, data){
  for (const [k, v] of Object.entries(data)){
    const parts = k.split("."); let t = target;
    for (let i = 0; i < parts.length - 1; i++){ if (typeof t[parts[i]] !== "object" || t[parts[i]] === null) t[parts[i]] = {}; t = t[parts[i]]; }
    const last = parts[parts.length - 1];
    if (isInc(v)) t[last] = (typeof t[last] === "number" ? t[last] : 0) + v[INC];
    else if (v === DELF) delete t[last];
    else if (v !== undefined) t[last] = toStore(v);
  }
  return target;
}
function deepMerge(a, b){
  for (const k in b){
    const v = b[k];
    if (v && typeof v === "object" && !Array.isArray(v) && !(v instanceof Date) && !isInc(v) && a[k] && typeof a[k] === "object" && !Array.isArray(a[k])) deepMerge(a[k], v);
    else if (isInc(v)) a[k] = (typeof a[k] === "number" ? a[k] : 0) + v[INC];
    else if (v === DELF) delete a[k];
    else if (v !== undefined) a[k] = toStore(v);
  }
  return a;
}
// LIKE pattern for a literal id prefix ("_" and "%" are wildcards in LIKE)
const likePrefix = s => s.replace(/[\\%_]/g, c => "\\" + c) + "%";

export async function createSupabaseApi(supabaseUrl, supabaseAnonKey, opts = {}){
  let createClient = opts.createClient;
  if (!createClient){
    try {
      createClient = (await import("@supabase/supabase-js")).createClient;
    } catch(e){
      createClient = (await import("https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm")).createClient;
    }
  }

  const client = createClient(supabaseUrl, supabaseAnonKey, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
  });
  // Separate client without a stored session, so an admin can create another person's login
  // without being signed out (signUp would otherwise replace the admin's session).
  let signupClient = null;
  const getSignupClient = () => signupClient || (signupClient = createClient(supabaseUrl, supabaseAnonKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false, storageKey: "laolao-signup" }
  }));

  // "a/b" → { table:"a", id:"b" }, "a/b/c/d" → { table:"a", id:"b__c__d" }, "a/b/c" → { table:"a", prefix:"b__c__" }
  function parsePath(path){
    const parts = String(path).replace(/^\/+|\/+$/g, "").split("/");
    const table = parts[0], rest = parts.slice(1);
    if (!rest.length) return { table, id: null, prefix: null };
    if (rest.length % 2 === 1) return { table, id: rest.join(SUB), prefix: null };
    return { table, id: null, prefix: rest.join(SUB) + SUB };
  }

  function isMissingTableError(error){
    if (!error) return false;
    const msg = String(error.message || error.details || error.hint || error).toLowerCase();
    const code = String(error.code || "").toUpperCase();
    return code === "PGRST205" || code === "42P01" || msg.includes("could not find the table") || (msg.includes("relation") && msg.includes("does not exist"));
  }
  function check(error, table){
    if (!error) return;
    if (isMissingTableError(error)){
      const e = new Error(`Supabase table "${table}" does not exist. Run supabase-schema.sql in the Supabase SQL Editor.`);
      e.code = "missing-table"; e.cause = error; throw e;
    }
    throw error;
  }

  // Read-only fallback: a missing content table shows the starter content from data/seed.json instead of crashing.
  // Writes to a missing table always throw, so nothing is silently kept only in this browser.
  const seedCache = {};
  async function seedRows(table){
    if (seedCache[table]) return seedCache[table];
    let rows = [];
    try {
      const res = await fetch(new URL("../../data/seed.json", import.meta.url));
      if (res.ok){ const seed = await res.json(); const list = seed[table]; if (Array.isArray(list)) rows = list.filter(x => x && x.id); }
    } catch(e){}
    console.warn(`LaoLao: Supabase table "${table}" is missing; showing ${rows.length} starter rows from data/seed.json (read-only).`);
    return (seedCache[table] = rows);
  }

  const rowToDoc = (r, prefix="") => Object.assign({ id: prefix ? r.id.slice(prefix.length) : r.id }, fromStore(r.data || {}));
  const scope = (q, prefix) => prefix ? q.like("id", likePrefix(prefix)) : q.not("id", "like", "%\\_\\_%");

  async function getRow(table, id){
    const { data, error } = await client.from(table).select("id,data").eq("id", id).maybeSingle();
    if (error && isMissingTableError(error)){ const r = (await seedRows(table)).find(x => x.id === id); return r ? Object.assign({}, r) : null; }
    check(error, table);
    return data ? rowToDoc(data) : null;
  }
  // Changes to the same row run one after another: update() and set(merge) read the row and write it back,
  // so overlapping calls (e.g. two progress updates fired by one quiz answer) would otherwise lose a change.
  const queues = new Map();
  function serial(key, fn){
    const run = (queues.get(key) || Promise.resolve()).then(fn, fn);
    const tail = run.catch(() => {});
    queues.set(key, tail);
    tail.then(() => { if (queues.get(key) === tail) queues.delete(key); });
    return run;
  }

  // { "skills.reading.t": inc(1), "days.2026-10-02": 1, "patterns.5": delField() } → ll_apply operations
  let rpcAvailable = true;
  const isMissingFunctionError = e => { const c = String(e && e.code || ""); return c === "PGRST202" || c === "42883" || /could not find the function/i.test(String(e && e.message || "")); };
  const toOps = val => Object.entries(val).filter(([, v]) => v !== undefined).map(([k, v]) => {
    const path = k.split(".");
    if (isInc(v)) return { path, inc: v[INC] };
    if (v === DELF) return { path, del: true };
    return { path, set: toStore(v) };
  });

  async function putRow(table, id, doc){
    const { error } = await client.from(table).upsert({ id, data: doc, updated_at: new Date().toISOString() });
    check(error, table);
  }

  let currentUser = null;
  const toUser = u => u ? { uid: u.id, email: u.email } : null;

  const api = {
    mode: "supabase",
    client,
    auth: {
      current: () => currentUser,
      // Calls cb only when the signed-in user changes (Supabase also emits token refreshes and
      // repeated SIGNED_IN events, which would otherwise re-render the whole app).
      onChange: cb => {
        let last;
        const deliver = session => {
          const u = toUser(session?.user); currentUser = u;
          const uid = u ? u.uid : null;
          if (uid === last) return;
          last = uid; cb(u);
        };
        client.auth.getSession().then(({ data: { session } }) => deliver(session));
        const { data: { subscription } } = client.auth.onAuthStateChange((_event, session) => deliver(session));
        return () => subscription.unsubscribe();
      },
      signIn: async (email, password) => {
        const { data, error } = await client.auth.signInWithPassword({ email, password });
        if (error) throw error;
        return toUser(data.user);
      },
      // Learner self-registration: signs the new user in
      signUp: async (email, password) => {
        const { data, error } = await client.auth.signUp({ email, password });
        if (error) throw error;
        if (!data.user) throw new Error("Sign-up failed.");
        if (!data.session){   // "Confirm email" is on in Supabase: the learner must click the link first
          const e = new Error("Account created. Please open the confirmation email we sent you, then sign in."); e.code = "auth/confirm-email"; throw e;
        }
        return toUser(data.user);
      },
      // Calls cb when the user arrives from a password-reset email (they are signed in and must choose a new password)
      onRecovery: cb => {
        const { data: { subscription } } = client.auth.onAuthStateChange(event => { if (event === "PASSWORD_RECOVERY") cb(); });
        return () => subscription.unsubscribe();
      },
      signOut: async () => {
        const { error } = await client.auth.signOut();
        if (error) throw error;
      },
      resetPassword: async email => {
        const { error } = await client.auth.resetPasswordForEmail(email, { redirectTo: new URL(".", location.href).href });
        if (error) throw error;
      },
      // Supabase does not check the old password; the user must already be signed in.
      changePassword: async (_oldPw, newPw) => {
        if (!newPw) throw new Error("New password is required.");
        const { error } = await client.auth.updateUser({ password: newPw });
        if (error) throw error;
      },
      // Creates another person's login without touching the current session
      createAccount: async (email, password) => {
        const { data, error } = await getSignupClient().auth.signUp({ email, password });
        if (error) throw error;
        if (!data.user || (Array.isArray(data.user.identities) && data.user.identities.length === 0)){
          const e = new Error("That email already has an account."); e.code = "auth/email-already-in-use"; throw e;
        }
        return data.user.id;
      }
    },
    db: {
      get: async path => {
        const { table, id } = parsePath(path);
        if (!id) throw new Error("get() needs a document path: " + path);
        return getRow(table, id);
      },
      set: async (path, val, merge=false) => {
        const { table, id } = parsePath(path);
        if (!id) throw new Error("set() needs a document path: " + path);
        return serial(table + "/" + id, async () => {
          let doc;
          if (merge){ const existing = await getRow(table, id); doc = deepMerge(existing ? stripId(existing) : {}, val); }
          else doc = applyFields({}, val);
          await putRow(table, id, doc);
        });
      },
      update: async (path, val) => {
        const { table, id } = parsePath(path);
        if (!id) throw new Error("update() needs a document path: " + path);
        // Creates the row if it is missing (earlier versions of this adapter behaved the same way)
        return serial(table + "/" + id, async () => {
          // Preferred: the database applies the changes in one locked step (safe across devices; see ll_apply in supabase-schema.sql)
          if (rpcAvailable){
            const { error } = await client.rpc("ll_apply", { p_table: table, p_id: id, p_ops: toOps(val) });
            if (!error) return;
            if (!isMissingFunctionError(error)) check(error, table);
            rpcAvailable = false;                     // the SQL has not been run yet: fall back to read-modify-write
          }
          const existing = await getRow(table, id);
          await putRow(table, id, applyFields(existing ? stripId(existing) : {}, val));
        });
      },
      del: async path => {
        const { table, id } = parsePath(path);
        if (!id) return;
        const { error } = await client.from(table).delete().eq("id", id);
        check(error, table);
      },
      add: async (path, val) => {
        const { table, prefix } = parsePath(path);
        const key = (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2, 10));
        const { error } = await client.from(table).insert({ id: (prefix || "") + key, data: applyFields({}, val) });
        check(error, table);
        return key;
      },
      list: async (path, o={}) => {
        const { table, id, prefix } = parsePath(path);
        if (id) throw new Error("list() needs a collection path: " + path);
        let q = scope(client.from(table).select("id,data"), prefix);
        (o.where || []).forEach(([field, op, val]) => {
          const col = typeof val === "number" ? `data->${field}` : `data->>${field}`;
          const v = val instanceof Date ? val.getTime() : val;
          if (op === "==") q = q.eq(`data->>${field}`, String(v));
          else if (op === "!=") q = q.neq(`data->>${field}`, String(v));
          else if (op === ">") q = q.gt(col, v);
          else if (op === "<") q = q.lt(col, v);
          else if (op === ">=") q = q.gte(col, v);
          else if (op === "<=") q = q.lte(col, v);
          else throw new Error("Unsupported where operator: " + op);
        });
        if (o.orderBy){ const [field, dir] = o.orderBy; q = q.order(`data->${field}`, { ascending: dir !== "desc", nullsFirst: false }); }
        if (o.limit) q = q.limit(o.limit);
        const { data, error } = await q;
        if (error && isMissingTableError(error) && !prefix){
          let rows = (await seedRows(table)).map(r => Object.assign({}, r));
          (o.where || []).forEach(([f, op, v]) => { if (op === "==") rows = rows.filter(r => String(r[f]) === String(v)); });
          return o.limit ? rows.slice(0, o.limit) : rows;
        }
        check(error, table);
        return (data || []).map(r => rowToDoc(r, prefix || ""));
      },
      count: async (path, o={}) => {
        if (o.where) return (await api.db.list(path, o)).length;
        const { table, prefix } = parsePath(path);
        const { count, error } = await scope(client.from(table).select("id", { count: "exact", head: true }), prefix);
        if (error && isMissingTableError(error)) return (await seedRows(table)).length;
        check(error, table);
        return count || 0;
      },
      // Not atomic: operations run one after another.
      batch: async ops => {
        for (const op of ops){
          if (op.op === "del") await api.db.del(op.path);
          else if (op.op === "update") await api.db.update(op.path, op.data);
          else await api.db.set(op.path, op.data, op.merge);
        }
      },
      inc: n => ({ [INC]: n }),
      delField: () => DELF
    },
    storage: {
      upload: async (file, path) => {
        const bucket = "laolao-assets";
        const { error } = await client.storage.from(bucket).upload(path, file, { upsert: true, contentType: file.type || undefined });
        if (error) throw error;
        return client.storage.from(bucket).getPublicUrl(path).data.publicUrl;
      }
    }
  };
  return api;
}

function stripId(doc){ const o = Object.assign({}, doc); delete o.id; return o; }
