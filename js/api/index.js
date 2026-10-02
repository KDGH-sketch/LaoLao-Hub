// Picks the backend: Supabase, or the in-browser demo when env-config.js has no Supabase config.
import { supabaseConfig } from "../config.js";
let apiPromise;
export function getApi(){
  if (!apiPromise){
    if (supabaseConfig && supabaseConfig.url && supabaseConfig.anonKey){
      apiPromise = import("./supabase.js").then(m => m.createSupabaseApi(supabaseConfig.url, supabaseConfig.anonKey));
    } else {
      console.warn("LaoLao: no Supabase config in env-config.js, running in browser demo mode.");
      apiPromise = import("./local.js").then(m => m.createLocalApi());
    }
  }
  return apiPromise;
}
