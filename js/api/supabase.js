// Supabase implementation of the LaoLao data layer.
// Connects to Supabase Auth & PostgreSQL database with JSONB document support.
// You can use standard Supabase cloud credentials (URL + anon key).

export async function createSupabaseApi(supabaseUrl, supabaseAnonKey){
  let createClient;
  try {
    const mod = await import("@supabase/supabase-js");
    createClient = mod.createClient;
  } catch(e){
    const mod = await import("https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm");
    createClient = mod.createClient;
  }

  const client = createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true
    }
  });

  // Map collection paths (e.g. "users/abc" -> table "users", id "abc")
  function parsePath(path){
    const parts = path.replace(/^\/+|\/+$/g, "").split("/");
    if (parts.length === 1) return { table: parts[0], id: null };
    if (parts.length === 2) return { table: parts[0], id: parts[1] };
    // For nested paths (e.g. a/b/c/d)
    return { table: parts[0], id: parts.slice(1).join("__") };
  }

  function isMissingTableError(error) {
    if (!error) return false;
    const msg = String(error.message || error.details || error.hint || error).toLowerCase();
    const code = String(error.code || "").toUpperCase();
    return (
      code === "PGRST205" ||
      code === "PGRST200" ||
      code === "42P01" ||
      msg.includes("schema cache") ||
      msg.includes("could not find the table") ||
      (msg.includes("relation") && msg.includes("does not exist"))
    );
  }

  const FALLBACK_KEY = "laolao_supabase_fallback_v1";
  let fallbackStore = {};
  try {
    const raw = localStorage.getItem(FALLBACK_KEY);
    if (raw) fallbackStore = JSON.parse(raw);
  } catch(e){}

  function saveFallback(){
    try {
      localStorage.setItem(FALLBACK_KEY, JSON.stringify(fallbackStore));
    } catch(e){}
  }

  async function ensureSeedFallback(table){
    if (fallbackStore[table] && Object.keys(fallbackStore[table]).length > 0) return;
    try {
      const res = await fetch("data/seed.json");
      if (res.ok) {
        const seed = await res.json();
        const list = seed[table] || (table==="vocabulary"?seed.vocab:null);
        if (Array.isArray(list)) {
          fallbackStore[table] = fallbackStore[table] || {};
          list.forEach(item => {
            if (item && item.id) fallbackStore[table][item.id] = item;
          });
          saveFallback();
        }
      }
    } catch(e){}
  }

  let currentUser = null;

  const api = {
    mode: "supabase",
    client,
    auth: {
      current: () => currentUser,
      onChange: cb => {
        client.auth.getSession().then(({ data: { session } }) => {
          const u = session?.user;
          currentUser = u ? { uid: u.id, email: u.email } : null;
          cb(currentUser);
        });
        const { data: { subscription } } = client.auth.onAuthStateChange((_event, session) => {
          const u = session?.user;
          currentUser = u ? { uid: u.id, email: u.email } : null;
          cb(currentUser);
        });
        return () => subscription.unsubscribe();
      },
      signIn: async (email, password) => {
        const { data, error } = await client.auth.signInWithPassword({ email, password });
        if (error) throw error;
        currentUser = { uid: data.user.id, email: data.user.email };
        return currentUser;
      },
      signOut: async () => {
        const { error } = await client.auth.signOut();
        if (error) throw error;
      },
      resetPassword: async email => {
        const { error } = await client.auth.resetPasswordForEmail(email, {
          redirectTo: window.location.origin
        });
        if (error) throw error;
      },
      changePassword: async (_oldPw, newPw) => {
        const { error } = await client.auth.updateUser({ password: newPw });
        if (error) throw error;
      },
      createAccount: async (email, password) => {
        // Creates a new user via standard signup
        const { data, error } = await client.auth.signUp({ email, password });
        if (error) throw error;
        return data.user?.id;
      }
    },
    db: {
      get: async path => {
        const { table, id } = parsePath(path);
        try {
          if (!id){
            const { data, error } = await client.from(table).select("*").limit(1);
            if (error) {
              if (isMissingTableError(error)) {
                await ensureSeedFallback(table);
                const items = Object.values(fallbackStore[table] || {});
                return items[0] || null;
              }
              throw error;
            }
            return data?.[0] ? Object.assign({ id: data[0].id }, data[0].data || data[0]) : null;
          }
          const { data, error } = await client.from(table).select("*").eq("id", id).maybeSingle();
          if (error) {
            if (isMissingTableError(error)) {
              await ensureSeedFallback(table);
              return fallbackStore[table]?.[id] || null;
            }
            throw error;
          }
          if (!data) {
            if (fallbackStore[table]?.[id]) return fallbackStore[table][id];
            return null;
          }
          return Object.assign({ id: data.id }, data.data || data);
        } catch(err) {
          if (isMissingTableError(err)) {
            await ensureSeedFallback(table);
            return (id ? fallbackStore[table]?.[id] : Object.values(fallbackStore[table] || {})[0]) || null;
          }
          throw err;
        }
      },
      set: async (path, val, merge=false) => {
        const { table, id } = parsePath(path);
        if (!id) throw new Error("Path must contain an ID for set()");
        let payload = val;
        if (merge){
          const existing = await api.db.get(path);
          if (existing) payload = Object.assign({}, existing, val);
        }
        try {
          const { error } = await client.from(table).upsert({ id, data: payload, updated_at: new Date() });
          if (error) {
            if (isMissingTableError(error)) {
              fallbackStore[table] = fallbackStore[table] || {};
              fallbackStore[table][id] = Object.assign({ id }, payload);
              saveFallback();
              return;
            }
            throw error;
          }
          fallbackStore[table] = fallbackStore[table] || {};
          fallbackStore[table][id] = Object.assign({ id }, payload);
          saveFallback();
        } catch(err) {
          if (isMissingTableError(err)) {
            fallbackStore[table] = fallbackStore[table] || {};
            fallbackStore[table][id] = Object.assign({ id }, payload);
            saveFallback();
            return;
          }
          throw err;
        }
      },
      update: async (path, val) => {
        const { table, id } = parsePath(path);
        const existing = await api.db.get(path) || {};
        const merged = Object.assign({}, existing, val);
        try {
          const { error } = await client.from(table).upsert({ id, data: merged, updated_at: new Date() });
          if (error) {
            if (isMissingTableError(error)) {
              fallbackStore[table] = fallbackStore[table] || {};
              fallbackStore[table][id] = Object.assign({ id }, merged);
              saveFallback();
              return;
            }
            throw error;
          }
          fallbackStore[table] = fallbackStore[table] || {};
          fallbackStore[table][id] = Object.assign({ id }, merged);
          saveFallback();
        } catch(err) {
          if (isMissingTableError(err)) {
            fallbackStore[table] = fallbackStore[table] || {};
            fallbackStore[table][id] = Object.assign({ id }, merged);
            saveFallback();
            return;
          }
          throw err;
        }
      },
      del: async path => {
        const { table, id } = parsePath(path);
        if (!id) return;
        try {
          const { error } = await client.from(table).delete().eq("id", id);
          if (error && !isMissingTableError(error)) throw error;
        } catch(err) {
          if (!isMissingTableError(err)) throw err;
        }
        if (fallbackStore[table]?.[id]) {
          delete fallbackStore[table][id];
          saveFallback();
        }
      },
      add: async (path, val) => {
        const { table } = parsePath(path);
        const id = crypto.randomUUID ? crypto.randomUUID() : "id_" + Math.random().toString(36).slice(2, 10);
        try {
          const { error } = await client.from(table).insert({ id, data: val, created_at: new Date() });
          if (error) {
            if (isMissingTableError(error)) {
              fallbackStore[table] = fallbackStore[table] || {};
              fallbackStore[table][id] = Object.assign({ id }, val);
              saveFallback();
              return id;
            }
            throw error;
          }
        } catch(err) {
          if (isMissingTableError(err)) {
            fallbackStore[table] = fallbackStore[table] || {};
            fallbackStore[table][id] = Object.assign({ id }, val);
            saveFallback();
            return id;
          }
          throw err;
        }
        return id;
      },
      list: async (path, o={}) => {
        const { table } = parsePath(path);
        try {
          let q = client.from(table).select("*");
          if (o.where){
            o.where.forEach(([field, op, val]) => {
              if (op === "==") q = q.eq(`data->>${field}`, String(val));
              else if (op === ">") q = q.gt(`data->>${field}`, val);
              else if (op === "<") q = q.lt(`data->>${field}`, val);
              else if (op === ">=") q = q.gte(`data->>${field}`, val);
              else if (op === "<=") q = q.lte(`data->>${field}`, val);
            });
          }
          if (o.orderBy){
            const [field, dir] = o.orderBy;
            q = q.order(`data->>${field}`, { ascending: dir !== "desc" });
          }
          if (o.limit) q = q.limit(o.limit);
          const { data, error } = await q;
          if (error) {
            if (isMissingTableError(error)) {
              await ensureSeedFallback(table);
              let rows = Object.values(fallbackStore[table] || {});
              if (o.where) {
                o.where.forEach(([f, op, v]) => {
                  if (op === "==") rows = rows.filter(r => String(r[f]) === String(v));
                });
              }
              if (o.limit) rows = rows.slice(0, o.limit);
              return rows;
            }
            throw error;
          }
          const mapped = (data || []).map(r => Object.assign({ id: r.id }, r.data || r));
          if (!mapped.length && fallbackStore[table] && Object.keys(fallbackStore[table]).length > 0) {
            return Object.values(fallbackStore[table]);
          }
          return mapped;
        } catch(err) {
          if (isMissingTableError(err)) {
            await ensureSeedFallback(table);
            let rows = Object.values(fallbackStore[table] || {});
            if (o.where) {
              o.where.forEach(([f, op, v]) => {
                if (op === "==") rows = rows.filter(r => String(r[f]) === String(v));
              });
            }
            if (o.limit) rows = rows.slice(0, o.limit);
            return rows;
          }
          throw err;
        }
      },
      count: async (path, o={}) => {
        const list = await api.db.list(path, o);
        return list.length;
      },
      batch: async ops => {
        for (const op of ops){
          if (op.op === "del") await api.db.del(op.path);
          else if (op.op === "update") await api.db.update(op.path, op.data);
          else await api.db.set(op.path, op.data, op.merge);
        }
      },
      inc: n => (curr=0) => (curr || 0) + n,
      delField: () => undefined
    },
    storage: {
      upload: async (file, path) => {
        const bucket = "laolao-assets";
        const { error } = await client.storage.from(bucket).upload(path, file, { upsert: true });
        if (error) throw error;
        const { data } = client.storage.from(bucket).getPublicUrl(path);
        return data.publicUrl;
      }
    }
  };

  return api;
}
