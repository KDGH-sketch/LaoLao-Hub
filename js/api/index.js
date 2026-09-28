// Picks the backend: Supabase, Firebase, or in-browser demo.
import { firebaseConfig, supabaseConfig } from "../config.js";
let apiPromise;
export function getApi(){
  if (!apiPromise){
    if (supabaseConfig && supabaseConfig.url && supabaseConfig.anonKey){
      apiPromise = import("./supabase.js").then(m => m.createSupabaseApi(supabaseConfig.url, supabaseConfig.anonKey));
    } else if (firebaseConfig){
      apiPromise = import("./firebase.js").then(m => m.createFirebaseApi(firebaseConfig));
    } else {
      apiPromise = import("./local.js").then(m => m.createLocalApi());
    }
  }
  return apiPromise;
}
