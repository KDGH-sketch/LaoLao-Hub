// Supabase implementation of the LaoLao data layer.
// Connects to Supabase Auth & PostgreSQL database with JSONB document support.
// You can use standard Supabase cloud credentials (URL + anon key).

const SUPABASE_CDN = "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";

export async function createSupabaseApi(supabaseUrl, supabaseAnonKey){
  const { createClient } = await import(SUPABASE_CDN);
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

  const api = {
    mode: "supabase",
    client,
    auth: {
      current: () => {
        const u = client.auth.getUser ? null : null; // async in supabase v2
        const s = client.auth.getSession ? null : null;
        // cached session
        return null;
      },
      onChange: cb => {
        client.auth.getSession().then(({ data: { session } }) => {
          const u = session?.user;
          cb(u ? { uid: u.id, email: u.email } : null);
        });
        const { data: { subscription } } = client.auth.onAuthStateChange((_event, session) => {
          const u = session?.user;
          cb(u ? { uid: u.id, email: u.email } : null);
        });
        return () => subscription.unsubscribe();
      },
      signIn: async (email, password) => {
        const { data, error } = await client.auth.signInWithPassword({ email, password });
        if (error) throw error;
        return { uid: data.user.id, email: data.user.email };
      },
      signUp: async (email, password) => {
        const { data, error } = await client.auth.signUp({ email, password });
        if (error) throw error;
        return { uid: data.user.id, email: data.user.email };
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
        if (!id){
          const { data, error } = await client.from(table).select("*").limit(1);
          if (error) throw error;
          return data?.[0] ? Object.assign({ id: data[0].id }, data[0].data || data[0]) : null;
        }
        const { data, error } = await client.from(table).select("*").eq("id", id).maybeSingle();
        if (error) throw error;
        if (!data) return null;
        return Object.assign({ id: data.id }, data.data || data);
      },
      set: async (path, val, merge=false) => {
        const { table, id } = parsePath(path);
        if (!id) throw new Error("Path must contain an ID for set()");
        let payload = val;
        if (merge){
          const existing = await api.db.get(path);
          if (existing) payload = Object.assign({}, existing, val);
        }
        const { error } = await client.from(table).upsert({ id, data: payload, updated_at: new Date() });
        if (error) throw error;
      },
      update: async (path, val) => {
        const { table, id } = parsePath(path);
        const existing = await api.db.get(path) || {};
        const merged = Object.assign({}, existing, val);
        const { error } = await client.from(table).upsert({ id, data: merged, updated_at: new Date() });
        if (error) throw error;
      },
      del: async path => {
        const { table, id } = parsePath(path);
        if (!id) return;
        const { error } = await client.from(table).delete().eq("id", id);
        if (error) throw error;
      },
      add: async (path, val) => {
        const { table } = parsePath(path);
        const id = crypto.randomUUID ? crypto.randomUUID() : "id_" + Math.random().toString(36).slice(2, 10);
        const { error } = await client.from(table).insert({ id, data: val, created_at: new Date() });
        if (error) throw error;
        return id;
      },
      list: async (path, o={}) => {
        const { table } = parsePath(path);
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
        if (error) throw error;
        return (data || []).map(r => Object.assign({ id: r.id }, r.data || r));
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
