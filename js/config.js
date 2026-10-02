// ============================================================
//  LaoLao configuration
//  1. Supabase config is loaded from window.__SUPABASE_CONFIG__ (set in env-config.js).
//  2. While it is missing the platform runs in DEMO MODE:
//     everything works in this browser only, with sample accounts, so you can try it.
// ============================================================
export const supabaseConfig = (typeof window !== "undefined" && window.__SUPABASE_CONFIG__) || null;

// The email of the platform owner. Must match the owner email in the RLS policies of supabase-schema.sql.
export const OWNER_EMAIL = (typeof window !== "undefined" && window.__OWNER_EMAIL__) || "kindathanomsuck@gmail.com";

// Name shown in the apps
export const APP_NAME = "LaoLao";
