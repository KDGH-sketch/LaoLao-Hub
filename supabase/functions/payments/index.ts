// Supabase Edge Function "payments" (deploy: see docs/PAYMENTS.md). The logic is in handler.js so it can be tested in Node.
// SUPABASE_URL, SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY are provided by Supabase; the rest are set with `supabase secrets set`.
import { createHandler } from "./handler.js";
import { postgrest } from "./db.js";
import { pickProviders } from "./providers/index.js";

const env = Deno.env.toObject();
const db = postgrest({ url: env.SUPABASE_URL, anonKey: env.SUPABASE_ANON_KEY, serviceKey: env.SUPABASE_SERVICE_ROLE_KEY });
Deno.serve(createHandler({ env, db, providers: pickProviders(env) }));
