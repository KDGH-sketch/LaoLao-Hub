// Demo implementation of the data layer: same interface as js/api/supabase.js, stored in this browser.
// Used automatically while env-config.js has no Supabase config.
import { resolveEntitlements, consumeUsage, usageSnapshot, decide } from "../shared/access.js";
import { METHODS, methodCurrency, quote, createOrder, orderCheckout, activateOrder, failOrder, refundOrder, setCancel, schedulePlan } from "../shared/billing.js";
const DBKEY = "laolao.demo.db", AUTHKEY = "laolao.demo.auth", SESSKEY = "laolao.demo.session";
const load = k => { try { return JSON.parse(localStorage.getItem(k) || "null"); } catch(e){ return null; } };
const store = (k,v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch(e){ console.warn("Demo storage full", e); } };
const clone = v => v === undefined ? v : JSON.parse(JSON.stringify(v));
const uidGen = () => Math.random().toString(36).slice(2,10) + Date.now().toString(36).slice(-4);
const INC = "__inc__", DELF = "__delete__";

const idb = () => new Promise(res => {
  if (typeof indexedDB === "undefined") return res(null);
  const timer = setTimeout(() => res(null), 1200);
  try {
    const r = indexedDB.open("laolao-demo", 1);
    r.onupgradeneeded = () => { try { r.result.createObjectStore("kv"); } catch(e){} };
    r.onsuccess = () => { clearTimeout(timer); res(r.result); };
    r.onerror = () => { clearTimeout(timer); res(null); };
  } catch(e) { clearTimeout(timer); res(null); }
});
async function idbGet(key){
  try {
    const d = await idb();
    if (!d) return null;
    return await new Promise(res => {
      try {
        const t = d.transaction("kv").objectStore("kv").get(key);
        t.onsuccess = () => res(t.result);
        t.onerror = () => res(null);
      } catch(e) { res(null); }
    });
  } catch(e){ return null; }
}
async function idbSet(key, val){
  try {
    const d = await idb();
    if (!d) return;
    await new Promise(res => {
      try {
        const t = d.transaction("kv","readwrite");
        t.objectStore("kv").put(val, key);
        t.oncomplete = res;
        t.onerror = res;
      } catch(e) { res(); }
    });
  } catch(e){ console.warn(e); }
}

export async function createLocalApi(){
  let db = (await idbGet(DBKEY)) || {};
  let accounts = load(AUTHKEY) || {};
  let session = load(SESSKEY);
  const listeners = new Set();
  // Changes are saved to the browser 120 ms after the last one (many writes in a row → one save). Leaving or hiding the
  // page saves at once: publishing and then opening the learner app straight away used to lose the publish.
  let saveT = null;
  const flush = () => { clearTimeout(saveT); saveT = null; return idbSet(DBKEY, db); };
  const persist = () => { clearTimeout(saveT); saveT = setTimeout(flush, 120); };
  if (typeof addEventListener === "function"){
    addEventListener("pagehide", () => { if (saveT) flush(); });
    if (typeof document !== "undefined") document.addEventListener("visibilitychange", () => { if (document.visibilityState === "hidden" && saveT) flush(); });
  }
  const toStore = v => {
    if (v instanceof Date) return v.getTime();
    if (Array.isArray(v)) return v.map(toStore);
    if (v && typeof v === "object"){ const o={}; for (const k in v) o[k]=toStore(v[k]); return o; }
    return v;
  };
  const applyFields = (target, data) => {
    for (const [k,v] of Object.entries(data)){
      const parts = k.split("."); let t = target;
      for (let i=0;i<parts.length-1;i++){ if (typeof t[parts[i]] !== "object" || t[parts[i]]===null) t[parts[i]]={}; t=t[parts[i]]; }
      const last = parts[parts.length-1];
      if (v && v[INC] !== undefined) t[last] = (typeof t[last]==="number"?t[last]:0) + v[INC];
      else if (v === DELF) delete t[last];
      else t[last] = toStore(v);
    }
  };
  const deepMerge = (a, b) => { for (const k in b){ const v=b[k];
      if (v && typeof v==="object" && !Array.isArray(v) && v[INC]===undefined && a[k] && typeof a[k]==="object" && !Array.isArray(a[k])) deepMerge(a[k], v);
      else if (v && v[INC]!==undefined) a[k]=(typeof a[k]==="number"?a[k]:0)+v[INC];
      else if (v===DELF) delete a[k];
      else a[k]=toStore(v); } return a; };
  const inCol = (path, colPath) => path.startsWith(colPath + "/") && path.slice(colPath.length+1).indexOf("/") === -1;
  const cmp = (a, op, b) => op==="=="?a===b: op==="!="?a!==b: op==="<"?a<b: op==="<="?a<=b: op===">"?a>b: op===">="?a>=b:
    op==="in"?b.includes(a): op==="array-contains"?(Array.isArray(a)&&a.includes(b)): false;
  const getPath = (o, f) => f.split(".").reduce((x,k)=>x==null?x:x[k], o);
  const emit = () => listeners.forEach(cb => cb(session ? { uid: session.uid, email: session.email } : null));
  const hash = s => { let h=0; for (const c of s) h=(h*31+c.charCodeAt(0))|0; return String(h); };

  const api = {
    mode: "demo",
    auth: {
      current: () => session ? { uid: session.uid, email: session.email } : null,
      onChange: cb => { listeners.add(cb); setTimeout(() => cb(api.auth.current()), 0); return () => listeners.delete(cb); },
      signIn: async (e,p) => {
        const a = accounts[e.toLowerCase()];
        if (!a || a.pw !== hash(p)) { const err = new Error("Wrong email or password."); err.code="auth/invalid-credential"; throw err; }
        session = { uid: a.uid, email: e.toLowerCase() }; store(SESSKEY, session); emit(); return api.auth.current();
      },
      signUp: async (e,p) => { const uid = await api.auth.createAccount(e,p); session={uid,email:e.toLowerCase()}; store(SESSKEY,session); emit(); return api.auth.current(); },
      signOut: async () => { session = null; store(SESSKEY, null); emit(); },
      resetPassword: async e => { if (!accounts[e.toLowerCase()]) { const err=new Error("No account with that email."); err.code="auth/user-not-found"; throw err; } },
      changePassword: async (oldPw, newPw) => { const a=accounts[session.email]; if (a.pw!==hash(oldPw)) throw new Error("Current password is wrong."); a.pw=hash(newPw); store(AUTHKEY,accounts); },
      createAccount: async (e,p) => {
        e = e.toLowerCase();
        if (accounts[e]) { const err=new Error("That email already has an account."); err.code="auth/email-already-in-use"; throw err; }
        if (!p || p.length<6) { const err=new Error("Password must be at least 6 characters."); err.code="auth/weak-password"; throw err; }
        const uid = uidGen(); accounts[e] = { uid, pw: hash(p) }; store(AUTHKEY, accounts); return uid;
      },
      // demo only: set a password directly
      _setPassword: (e,p) => { if (accounts[e]) { accounts[e].pw = hash(p); store(AUTHKEY, accounts); } }
    },
    db: {
      get: async p => db[p] ? Object.assign({ id: p.split("/").pop() }, clone(db[p])) : null,
      set: async (p, d, merge=false) => { if (merge && db[p]) deepMerge(db[p], d); else { db[p] = {}; applyFields(db[p], d); } persist(); },
      update: async (p, d) => { if (!db[p]) throw new Error("Document not found: "+p); applyFields(db[p], d); persist(); },
      del: async p => { delete db[p]; Object.keys(db).forEach(k => { if (k.startsWith(p+"/")) delete db[k]; }); persist(); },
      add: async (p, d) => { const id = uidGen(); await api.db.set(p+"/"+id, d); return id; },
      list: async (p, o={}) => {
        let rows = Object.keys(db).filter(k => inCol(k, p)).map(k => Object.assign({ id: k.split("/").pop() }, clone(db[k])));
        (o.where||[]).forEach(([f,op,v]) => { rows = rows.filter(r => cmp(getPath(r,f), op, v)); });
        if (o.orderBy){ const [f,dir] = o.orderBy; rows.sort((a,b)=>{ const x=getPath(a,f), y=getPath(b,f); return (x>y?1:x<y?-1:0)*(dir==="desc"?-1:1); }); }
        if (o.limit) rows = rows.slice(0, o.limit);
        return rows;
      },
      count: async (p, o) => (await api.db.list(p, o)).length,
      batch: async ops => { for (const o of ops){ if (o.op==="del") await api.db.del(o.path); else if (o.op==="update") await api.db.update(o.path, o.data); else await api.db.set(o.path, o.data, !!o.merge); } },
      inc: n => ({ [INC]: n }),
      delField: () => DELF
    },
    // Same database functions as supabase-schema.sql, run on the demo database with the same resolver
    rpc: async (name, args = {}) => {
      const uid = session ? session.uid : null;
      const adm = uid && db["admins/"+uid];
      const ent = resolveEntitlements({ uid, isAdmin: !!adm && adm.status !== "disabled", user: uid ? db["users/"+uid] || null : null,
        access: uid ? db["access/"+uid] || null : null, settings: db["settings/app"] || {},
        plans: Object.keys(db).filter(k => inCol(k, "plans")).map(k => Object.assign({ id: k.split("/").pop() }, db[k])) });
      const rows = new Proxy({}, { get: (_, id) => db["usage/"+String(id)], set: (_, id, v) => { db["usage/"+String(id)] = v; return true; } });
      if (name === "ll_entitlements"){ persist(); return clone(Object.assign(ent, { usage: usageSnapshot(rows, ent) })); }
      if (name === "ll_can") return decide(ent, args.f).allowed;
      if (name === "ll_use"){
        const r = consumeUsage(rows, ent, args.p_feature, { amount: args.p_amount ?? 1, ref: args.p_ref ?? null });
        if (!r.allowed && uid) db["accessLogs/"+uid+"__"+uidGen()] = { uid, feature: args.p_feature, plan: ent.planId, status: ent.status, decision:"deny", reason: r.reason, used: r.used, limit: r.limit, at: Date.now() };
        persist();
        return clone(r);
      }
      const e = new Error("Could not find the function " + name); e.code = "PGRST202"; throw e;
    },
    // Payments in demo mode: the same rules as the database functions (js/shared/billing.js) and a test checkout
    // inside the app instead of a provider. No money moves; nothing here exists in Supabase mode.
    pay: (() => {
      const store = {
        get: (t, id) => db[t + "/" + id] ? clone(db[t + "/" + id]) : null,
        put: (t, id, d) => { const { id: _drop, ...rest } = d; db[t + "/" + id] = toStore(rest); },
        list: t => Object.keys(db).filter(k => inCol(k, t)).map(k => Object.assign({ id: k.split("/").pop() }, clone(db[k])))
      };
      const me = () => session ? session.uid : null;
      const role = () => { const a = me() && db["admins/" + me()]; return a && a.status !== "disabled" ? a.role : null; };
      const fail = code => { throw Object.assign(new Error(code), { code }); };
      const done = r => { persist(); return clone(r); };
      return {
        live: false,
        config: async () => ({ provider: "demo", label: "Demo test checkout", live: false, methods: Object.keys(METHODS) }),
        quote: async (planId, cycle, method) => Object.assign(quote(store, me(), planId, cycle, methodCurrency(db["settings/app"] || {}, method)), { method }),
        checkout: async args => {
          const o = createOrder(store, me(), args || {});
          if (!o.ok) fail(o.reason);
          return done({ order: orderCheckout(store, o.id, "demo", { page: "in-app" }), checkout: { kind: "demo" } });
        },
        // What a provider would report once the tester picks an outcome on the demo checkout
        complete: async (id, outcome) => {
          const o = store.get("orders", id);
          if (!o || o.uid !== me()) fail("order_not_found");
          const m = METHODS[o.method] || {};
          if (outcome === "paid") activateOrder(store, id, { provider: "demo", txnId: "DEMO-" + uidGen().toUpperCase(), amount: o.amount, currency: o.currency,
            method: o.method, brand: m.brand || "", last4: m.kind === "card" ? "4242" : "", verification: { provider: "demo" } });
          else if (outcome === "failed" || outcome === "cancelled") failOrder(store, id, outcome, { reason: outcome });
          return done(Object.assign({ id }, store.get("orders", id)));
        },
        status: async id => { const o = store.get("orders", id); if (!o || (o.uid !== me() && !role())) fail("order_not_found"); return Object.assign({ id }, o); },
        cancelOrder: async id => { const o = store.get("orders", id); if (!o || o.uid !== me()) return { ok: false, reason: "order_not_found" }; return done(failOrder(store, id, "cancelled", { reason: "learner_cancelled" })); },
        setCancel: async on => done(setCancel(store, me(), on)),
        schedule: async planId => done(schedulePlan(store, me(), planId)),
        refund: async ({ orderId, reason, ref, by } = {}) => {
          if (!["super", "owner"].includes(role())) fail("forbidden");
          const r = refundOrder(store, orderId, { reason, ref: ref || "DEMO-RF-" + orderId, by });
          if (!r.ok) fail(r.reason);
          return done(r);
        }
      };
    })(),
    // Demo stand-in for Azure's Lao voices: a short tone per text (WAV, base64), so Voice Studio can be tried and tested
    // without an Azure key. The real voices come from the "tts" Edge Function (docs/AZURE_VOICE.md).
    tts: (() => {
      let used = 0;
      const VOICES = [{ id: "lo-LA-KeomanyNeural", label: "Keomany (female)" }, { id: "lo-LA-ChanthavongNeural", label: "Chanthavong (male)" }];
      const tone = n => { const rate = 16000, len = Math.round(rate * Math.min(2.5, 0.25 + n * 0.06)), buf = new ArrayBuffer(44 + len * 2), v = new DataView(buf);
        const w = (o, s) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
        w(0, "RIFF"); v.setUint32(4, 36 + len * 2, true); w(8, "WAVE"); w(12, "fmt "); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
        v.setUint32(24, rate, true); v.setUint32(28, rate * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true); w(36, "data"); v.setUint32(40, len * 2, true);
        for (let i = 0; i < len; i++) v.setInt16(44 + i * 2, Math.round(Math.sin(2 * Math.PI * 330 * i / rate) * 6000 * Math.sin(Math.PI * i / len)), true);
        let s = ""; const a = new Uint8Array(buf); for (let i = 0; i < a.length; i += 0x8000) s += String.fromCharCode.apply(null, a.subarray(i, i + 0x8000)); return btoa(s); };
      return {
        demo: true,
        status: async () => ({ configured: true, demo: true, region: "demo", voices: VOICES, month: new Date().toISOString().slice(0, 7), used, limit: 450000 }),
        speak: async (texts, voice) => { const items = texts.map(text => ({ text, audio: tone(text.length), chars: text.length, voice, mime: "audio/wav" })); used += texts.join("").length; return { items, used, limit: 450000 }; }
      };
    })(),
    storage: {
      upload: async file => {
        if (file.size > 1.5e6) throw new Error("In demo mode files must be under 1.5 MB.");
        return new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(file); });
      }
    },
    _isEmpty: () => Object.keys(db).length === 0,
    _flush: () => idbSet(DBKEY, db),
    _flush: () => flush(),                              // tests: wait until every change is saved
    _reset: async () => { db = {}; accounts = {}; session = null; await idbSet(DBKEY, {}); localStorage.removeItem(AUTHKEY); localStorage.removeItem(SESSKEY); }
  };
  return api;
}
