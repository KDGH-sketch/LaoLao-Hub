// Supabase Edge Function "tts": Azure's Lao voices for Voice Studio (setup: docs/AZURE_VOICE.md). The logic is in
// handler.js so it can be tested in Node. SUPABASE_URL, SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY are provided by
// Supabase; AZURE_SPEECH_KEY and AZURE_SPEECH_REGION are set with `supabase secrets set`.
import { createHandler } from "./handler.js";

const env = Deno.env.toObject();
// Database calls: the permission check runs with the admin's own token (row-level security and auth.uid() apply);
// the monthly usage counter (settings/ttsUsage) is written with the service key, which only this function holds.
async function call(path: string, { method = "GET", body, token, prefer }: { method?: string; body?: unknown; token?: string; prefer?: string } = {}){
  const r = await fetch(env.SUPABASE_URL + path, { method, body: body === undefined ? undefined : JSON.stringify(body),
    headers: Object.assign({ apikey: token ? env.SUPABASE_ANON_KEY : env.SUPABASE_SERVICE_ROLE_KEY, Authorization: "Bearer " + (token || env.SUPABASE_SERVICE_ROLE_KEY),
      "Content-Type": "application/json" }, prefer ? { Prefer: prefer } : {}) });
  const text = await r.text();
  let data = null; try { data = text ? JSON.parse(text) : null; } catch(e){ data = text; }
  if (!r.ok) throw Object.assign(new Error((data && data.message) || r.statusText), { status: r.status });
  return data;
}
const db = {
  rpc: (name: string, args = {}, o: { token?: string } = {}) => call(`/rest/v1/rpc/${name}`, { method: "POST", body: args, token: o.token }),
  get: async (table: string, id: string) => { const rows = await call(`/rest/v1/${table}?id=eq.${encodeURIComponent(id)}&select=id,data`); return rows && rows[0] ? rows[0].data : null; },
  upsert: (table: string, id: string, data: unknown) => call(`/rest/v1/${table}`, { method: "POST", body: { id, data }, prefer: "resolution=merge-duplicates" })
};
Deno.serve(createHandler({ env, db }));
