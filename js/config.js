// ============================================================
//  Xuélù configuration
//  1. Config is loaded from window.__FIREBASE_CONFIG__ if available.
//  2. While firebaseConfig is null the platform runs in DEMO MODE:
//     everything works in this browser only, with sample accounts, so you can try it.
// ============================================================
export const firebaseConfig = (typeof window !== "undefined" && window.__FIREBASE_CONFIG__) || null;

// The email of the platform owner. Must match OWNER_EMAIL_HERE in firestore.rules.
export const OWNER_EMAIL = (typeof window !== "undefined" && window.__OWNER_EMAIL__) || "kindathanomsuck@gmail.com";

// Name shown in the apps
export const APP_NAME = "LaoLao";
