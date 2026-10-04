// Signing helpers on Web Crypto (works the same in Supabase Edge Functions / Deno and in Node for the tests)
const enc = new TextEncoder();
const key = secret => crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
const sign = async (secret, text) => new Uint8Array(await crypto.subtle.sign("HMAC", await key(secret), enc.encode(text)));

export const hmacBase64 = async (secret, text) => { let s = ""; for (const b of await sign(secret, text)) s += String.fromCharCode(b); return btoa(s); };
export const hmacHex = async (secret, text) => Array.from(await sign(secret, text), b => b.toString(16).padStart(2, "0")).join("");

// Compare signatures without leaking where they differ
export function safeEqual(a, b){
  a = String(a || ""); b = String(b || "");
  let diff = a.length ^ b.length;
  for (let i = 0; i < Math.max(a.length, b.length); i++) diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  return diff === 0 && a.length > 0;
}
