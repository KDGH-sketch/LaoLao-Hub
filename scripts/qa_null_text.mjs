// Crawls the whole app (demo mode) looking for stray "null", "undefined", "NaN" or "[object Object]" text:
// every admin menu and content editor for each admin role, every learner page (premium and free), with item pages.
// Run: node scripts/qa_null_text.mjs
import path from "path";
import fs from "fs";
import { launch, sleep } from "./lib/cdp.mjs";
import { startDemoServer, ROOT } from "./lib/demo-server.mjs";

const srv = await startDemoServer();
const b = await launch({ width: 1366, height: 900 });
const J = JSON.stringify;
let checked = 0; const found = [];
async function login(p, email){
  await b.eval(`try { localStorage.removeItem("laolao.demo.session"); localStorage.setItem("xuelu.lang","en"); localStorage.setItem("xuelu.admin.lang","en"); } catch(e){}`).catch(() => {});
  await b.goto(srv.base + p); await b.waitFor(`!!document.querySelector("#em") || !!document.querySelector(".app")`, 60000);
  await b.eval(`(() => { const e = document.querySelector("#em"), p = document.querySelector("#pw"); if (!e) return; e.value = ${J(email)}; p.value = "demo1234"; (e.form || p.form).requestSubmit(); })()`);
  await b.waitFor(`!!document.querySelector(".app .side .nav-btn") || /administrator/i.test(document.body.innerText)`, 60000); await sleep(900);
}
// visible text nodes that are (or contain) a JavaScript empty value printed as text
const scan = where => b.eval(`(() => {
  const bad = [], w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  while (w.nextNode()){
    const n = w.currentNode, v = n.nodeValue; if (!v || !v.trim()) continue;
    const p = n.parentElement; if (!p || p.closest("script,style,textarea,code,pre,[contenteditable]")) continue;
    if (/^\\s*(null|undefined|NaN|false|\\[object Object\\])\\s*$/.test(v) || /(null){2,}|\\bundefined\\b|\\[object Object\\]|\\bNaN\\b/.test(v)){
      const prev = (n.previousSibling && (n.previousSibling.textContent || "").trim().slice(0, 30)) || "", path = [];
      for (let e = p; e && e !== document.body && path.length < 4; e = e.parentElement) path.unshift(e.tagName.toLowerCase() + (e.className && typeof e.className === "string" ? "." + e.className.trim().split(/\\s+/).slice(0, 2).join(".") : ""));
      bad.push({ text: v.trim().slice(0, 40), path: path.join(" > "), after: prev });
    }
  }
  return bad; })()`).then(bad => { checked++; for (const x of bad) found.push(Object.assign({ where }, x)); return bad.length; });
const settle = async () => { await sleep(700); await b.waitFor(`!document.querySelector(".skel, .loading-row")`, 4000).catch(() => {}); };

// ---------- the guard itself, and incomplete rows (live databases have rows with missing fields) ----------
let failedSelf = 0;
await login("/admin/", "admin@demo.laolao");
const self = await b.eval(`(() => { const d = document.createElement("div"); d.append(null, "a", undefined, false); d.prepend(null); const s = document.createElement("span"); d.append(s); s.before(null); s.after(undefined, "b"); s.replaceWith(null, "c");
  const r = d.textContent; d.replaceChildren(null, null, null); return { r, empty: d.textContent }; })()`);
if (self.r !== "acb" || self.empty !== ""){ failedSelf++; console.log("  FAIL the guard: " + JSON.stringify(self)); } else console.log("  PASS append / prepend / replaceChildren / before / after / replaceWith skip null, undefined and false");
const TYPES = await b.eval(`import("/js/shared/content.js").then(m => m.CONTENT_TYPES.map(c => c.id || c.type || c).filter(x => typeof x === "string"))`).catch(() => []);
await b.eval(`import("/js/admin/state.js").then(async m => { for (const t of ${J(TYPES)}) await m.S.api.db.set(t + "/zz-sparse", { status: "published", access: "free" }).catch(() => {}); })`);
await b.eval(`Promise.all([import("/js/admin/state.js"), import("/js/shared/content.js")]).then(([m, c]) => c.buildBundles(m.S.api, m.S.me.uid)).catch(e => console.warn("publish", e.message))`);
for (const type of TYPES){
  await b.eval(`import("/js/admin/state.js").then(m => m.go("contentList", { type: ${J(type)} }))`).catch(() => {}); await settle(); await scan("incomplete row · list " + type);
  await b.eval(`import("/js/admin/state.js").then(m => m.go("editor", { type: ${J(type)}, id: "zz-sparse" }))`).catch(() => {}); await settle(); await scan("incomplete row · edit " + type);
  await b.eval(`import("/js/admin/state.js").then(m => m.S.leaveGuard = null)`).catch(() => {});
}

// ---------- admin, every role ----------
for (const email of ["admin@demo.laolao", "editor@demo.laolao", "reviewer@demo.laolao", "support@demo.laolao"]){
  await login("/admin/", email);
  const role = email.split("@")[0];
  const views = await b.eval(`[...document.querySelectorAll(".side .nav-btn")].map((x, i) => i)`);
  for (const i of views){
    const name = await b.eval(`(() => { const x = document.querySelectorAll(".side .nav-btn")[${i}]; if (!x) return ""; x.click(); return x.innerText.trim(); })()`);
    if (!name || /sign out|log out/i.test(name)) continue;
    await settle(); await scan(role + " · " + name);
  }
  // one editor per content type, a new item, and the first learner's page
  const types = await b.eval(`import("/js/shared/content.js").then(m => m.CONTENT_TYPES.map(c => c.id || c.type || c).filter(x => typeof x === "string"))`).catch(() => []);
  for (const type of types){
    const id = await b.eval(`import("/js/admin/state.js").then(m => m.S.api.db.list(${J(type)})).then(r => r[0] && r[0].id).catch(() => null)`);
    if (id){ await b.eval(`import("/js/admin/state.js").then(m => m.go("editor", { type: ${J(type)}, id: ${J(id)} }))`).catch(() => {}); await settle(); await scan(role + " · edit " + type); }
    await b.eval(`import("/js/admin/state.js").then(m => m.go("editor", { type: ${J(type)}, isNew: true }))`).catch(() => {}); await settle(); await scan(role + " · new " + type);
    await b.eval(`import("/js/admin/state.js").then(m => m.S.leaveGuard = null)`).catch(() => {});
  }
  const uid = await b.eval(`import("/js/admin/state.js").then(m => m.S.api.db.list("users")).then(r => r[0] && r[0].id).catch(() => null)`);
  if (uid){ await b.eval(`import("/js/admin/state.js").then(m => m.go("learner", { uid: ${J(uid)} }))`).catch(() => {}); await settle(); await scan(role + " · learner page"); }
  // the profile menu
  await b.eval(`(() => { const x = document.querySelector(".topbar .pchip, .topbar [aria-haspopup]"); x && x.click(); })()`); await sleep(400); await scan(role + " · profile menu");
}

// ---------- learner ----------
for (const email of ["learner@demo.laolao", "free@demo.laolao"]){
  await login("/", email);
  const who = email.split("@")[0];
  const navs = await b.eval(`document.querySelectorAll(".side .nav-btn").length`);
  for (let i = 0; i < navs; i++){
    const name = await b.eval(`(() => { const x = document.querySelectorAll(".side .nav-btn")[${i}]; if (!x) return ""; x.click(); return x.innerText.trim(); })()`);
    if (!name || /sign out|log out/i.test(name)) continue;
    await settle(); await scan(who + " · " + name);
  }
  const pages = await b.eval(`import("/js/learner/core.js").then(m => { const A = m.A, first = o => Object.keys(o || {})[0];
    return [["lesson", { id: first(A.byType.lessons) }], ["grammarItem", { id: first(A.byType.grammar) }], ["pattern", { n: +first(A.P) }], ["quiz", { id: first(A.byType.quizzes) }],
      ["video", { id: first(A.byType.videos) }], ["path", { id: first(A.byType.paths) }], ["dialogue", { id: first(A.byType.dialogues) }], ["cards", {}], ["account", {}], ["plans", {}], ["saved", {}], ["review", {}], ["news", {}]]
      .filter(([, p]) => Object.values(p).every(v => v !== undefined && v !== null && !Number.isNaN(v))); })`);
  // the incomplete rows, as learners get them
  pages.push(["lesson", { id: "zz-sparse" }], ["grammarItem", { id: "zz-sparse" }], ["quiz", { id: "zz-sparse" }], ["video", { id: "zz-sparse" }], ["path", { id: "zz-sparse" }], ["dialogue", { id: "zz-sparse" }]);
  for (const [v, p] of pages){ await b.eval(`import("/js/learner/main.js").then(m => m.go(${J(v)}, ${J(p)}))`).catch(() => {}); await settle(); await scan(who + " · " + v); }
  await b.eval(`(() => { const x = document.querySelector(".topbar .pchip, .topbar [aria-haspopup]"); x && x.click(); })()`); await sleep(400); await scan(who + " · profile menu");
}
// the welcome page (signed out)
await b.eval(`localStorage.removeItem("laolao.demo.session")`); await b.goto(srv.base + "/"); await sleep(2500); await scan("welcome page");

await b.close(); srv.close && srv.close();
const by = {}; for (const f of found){ const k = f.where; (by[k] = by[k] || []).push(f); }
for (const [k, list] of Object.entries(by)){ console.log("  FOUND " + k); for (const f of list.slice(0, 4)) console.log("        [" + f.text + "] in " + f.path + (f.after ? "  (after: " + f.after + ")" : "")); }
console.log(`\n${checked} screens checked · ${found.length ? found.length + " stray texts on " + Object.keys(by).length + " screens" : "no stray null / undefined / NaN text"}`);
process.exit(found.length || failedSelf ? 1 : 0);
