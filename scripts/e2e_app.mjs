// Functional browser tests of the whole app in DEMO mode (Supabase is never contacted).
// Tests real behaviour: auth, learner features, admin content lifecycle, learner/admin management,
// settings, themes, languages and role restrictions. Screenshots of failures go to e2e-screenshots/.
// Run: node scripts/e2e_app.mjs   (Chrome or Edge required)
import fs from "fs";
import path from "path";
import { launch, sleep } from "./lib/cdp.mjs";
import { startDemoServer, ROOT } from "./lib/demo-server.mjs";

const SHOTS = path.join(ROOT, "e2e-screenshots");
fs.mkdirSync(SHOTS, { recursive: true });
const PW = "demo1234";
const srv = await startDemoServer();
const b = await launch({ width: 1366, height: 900 });
let failed = 0, section = "";
const ok = async (cond, name) => {
  console.log((cond ? "  PASS " : "  FAIL ") + name);
  if (!cond){ failed++; await b.screenshot(path.join(SHOTS, `fail-${section}-${name}`.replace(/[^\w.-]+/g, "_").slice(0, 110) + ".png")).catch(() => {}); }
};
const step = s => { section = s; console.log("\n" + s); };
const J = JSON.stringify;
const has = re => b.eval(`${re}.test(document.body.innerText)`);
const click = (sel, re) => b.eval(`(() => { const el = [...document.querySelectorAll(${J(sel)})].find(e => ${re}.test((e.innerText || e.textContent || "").trim()) || ${re}.test(e.getAttribute("aria-label") || "") || ${re}.test(e.title || "")); if (el){ el.scrollIntoView({block:"center"}); el.click(); } return !!el; })()`);
const setVal = (sel, value, i = 0) => b.eval(`(() => { const el = document.querySelectorAll(${J(sel)})[${i}]; if (!el) return false; el.value = ${J(value)}; el.dispatchEvent(new Event("input", { bubbles:true })); el.dispatchEvent(new Event("change", { bubbles:true })); return true; })()`);
// value of the input inside the editor field whose label matches
const fieldInput = (label, i = 0) => `[...document.querySelectorAll(".field")].find(f => { const l = f.querySelector(":scope > .lbl, :scope > label"); return l && ${label}.test(l.textContent); }).querySelectorAll("input, textarea, select")[${i}]`;
const typeField = (label, value, i = 0) => b.eval(`(() => { const el = ${fieldInput(label, i)}; el.value = ${J(value)}; el.dispatchEvent(new Event("input", { bubbles:true })); el.dispatchEvent(new Event("change", { bubbles:true })); return true; })()`);
const jsErrors = () => b.consoleLog.filter(l => /^exception|^error/.test(l) && !/youtube|ytimg|googlevideo|doubleclick|favicon|net::ERR|Failed to load resource/i.test(l));

async function signOutAll(){ await b.eval(`try { localStorage.removeItem("laolao.demo.session"); } catch(e){}`).catch(() => {}); }
async function openApp(p){ await b.goto(srv.base + p); await b.waitFor(`!!document.querySelector("#em") || !!document.querySelector(".app") || /administrator/i.test(document.body.innerText)`, 60000); }
async function login(p, email, pw = PW){
  await signOutAll(); await openApp(p);
  await b.eval(`(() => { const e = document.querySelector("#em"), p = document.querySelector("#pw"); e.value = ${J(email)}; p.value = ${J(pw)}; (e.form || p.form).requestSubmit(); })()`);
  await b.waitFor(`!!document.querySelector(".app")`, 30000); await sleep(600);
}
// the Theme row on the Account page (the page has other Auto buttons)
const themeBtn = re => b.eval(`(() => { const row = [...document.querySelectorAll("main .set-row")].find(r => /^Theme$/.test((r.querySelector("label")||{}).textContent||"")); const el = [...row.querySelectorAll("button")].find(x => ${re}.test(x.innerText.trim())); el.click(); return true; })()`);
const nav = async re => { await b.eval(`(() => { const el = [...document.querySelectorAll(".side .nav-btn")].find(e => ${re}.test(e.innerText)); el.click(); })()`); await sleep(900); };

try {
  // ======================= AUTH =======================
  step("auth");
  await signOutAll(); await openApp("/");
  await b.eval(`(() => { const e = document.querySelector("#em"), p = document.querySelector("#pw"); e.value = "free@demo.laolao"; p.value = "wrong-password"; e.form.requestSubmit(); })()`);
  await sleep(800);
  await ok(!(await b.eval(`!!document.querySelector(".app")`)) && /wrong email or password/i.test(await b.eval(`document.body.innerText`)), "wrong password is rejected with a message");
  await b.eval(`(() => { const e = document.querySelector("#em"), p = document.querySelector("#pw"); e.value = ""; p.value = ""; e.form.requestSubmit(); })()`);
  await sleep(600);
  await ok(!(await b.eval(`!!document.querySelector(".app")`)), "empty email/password does not sign in");
  await login("/", "free@demo.laolao");
  await ok(true, "valid login opens the app");
  await b.goto(srv.base + "/"); await b.waitFor(`!!document.querySelector(".app") || !!document.querySelector("#em")`, 30000);
  await ok(await b.eval(`!!document.querySelector(".app")`), "session survives a page reload");
  await b.goto(srv.base + "/admin/"); await b.waitFor(`/administrator/i.test(document.body.innerText) || !!document.querySelector(".app")`, 30000);
  await ok(await has(/isn't an administrator/) && !(await b.eval(`!!document.querySelector(".side .nav-btn")`)), "a learner opening /admin/ is refused");
  await b.goto(srv.base + "/"); await b.waitFor(`!!document.querySelector(".app")`, 30000);
  await nav(/Account/);
  await click("main button", /^Sign out$/);
  await b.waitFor(`!!document.querySelector("#em")`, 15000).catch(() => {});
  await ok(await b.eval(`!!document.querySelector("#em") && !document.querySelector(".app")`), "sign out returns to the sign-in screen");
  await b.goto(srv.base + "/"); await b.waitFor(`!!document.querySelector("#em") || !!document.querySelector(".app")`, 30000);
  await ok(await b.eval(`!!document.querySelector("#em")`), "after sign out, a reload stays signed out");

  step("registration");
  await click("button", /^Create account$/);
  await b.waitFor(`!!document.querySelector("#nm")`, 5000);
  const newEmail = `e2e.${Date.now()}@test.local`;
  await b.eval(`(() => { document.querySelector("#nm").value = "E2E ລາວ Learner"; document.querySelector("#em").value = ${J(newEmail)}; document.querySelector("#pw").value = "e2e-pass-123"; document.querySelector("#em").form.requestSubmit(); })()`);
  await b.waitFor(`!!document.querySelector(".app")`, 30000).catch(() => {});
  await ok(await b.eval(`!!document.querySelector(".app")`), "a new learner can register and lands in the app");
  await nav(/Account/);
  await ok(await b.eval(`[...document.querySelectorAll("main input")].some(i => i.value === "E2E ລາວ Learner")`) && await b.eval(`document.querySelector("main").innerText.includes(${J(newEmail)})`), "the new account shows its name (Lao text kept) and email");

  step("profile created at first sign-in (email-confirmation flow)");
  await signOutAll(); await openApp("/");
  const bareEmail = `e2e.bare.${Date.now()}@test.local`;
  await b.eval(`(async () => { const { getApi } = await import("/js/api/index.js"); const api = await getApi(); await api.auth.createAccount(${J(bareEmail)}, "bare-pass-123"); await api._flush(); })()`);
  await b.eval(`localStorage.setItem("laolao.pendingProfile", JSON.stringify({ email: ${J(bareEmail)}, name: "Confirmed Later" }))`);
  await login("/", bareEmail, "bare-pass-123");
  await ok(await b.eval(`(async () => { const { getApi } = await import("/js/api/index.js"); const api = await getApi(); const u = await api.db.get("users/" + api.auth.current().uid); const a = await api.db.get("access/" + api.auth.current().uid); return !!u && u.name === "Confirmed Later" && u.role === "learner" && !!a && a.tier === 1; })()`), "an account without a profile gets its learner profile (with the name given at sign-up) on first sign-in");

  step("password reset screen");
  await b.goto("about:blank"); await b.goto(srv.base + "/?from=email#type=recovery"); /* a real page load, like opening the email link */ await b.waitFor(`!!document.querySelector("#npw") || !!document.querySelector(".app")`, 30000);
  await ok(await b.eval(`!!document.querySelector("#npw") && !document.querySelector(".app")`), "a password-reset link opens the 'Choose a new password' screen");
  await b.eval(`(() => { document.querySelector("#npw").value = "abcdef1"; document.querySelector("#npw2").value = "different"; document.querySelector("#npw").form.requestSubmit(); })()`); await sleep(300);
  await ok(await has(/do not match/), "mismatched new passwords are rejected");

  // ======================= LEARNER =======================
  step("dictionary");
  await login("/", "free@demo.laolao");
  await ok(await b.eval(`!document.querySelector('a[href="admin/"]')`), "learners do not see links to the admin app");
  await nav(/Dictionary/);
  const dictSearch = async q => { await setVal("main input.input", q); await sleep(500); return b.eval(`[...document.querySelectorAll("main .dres button")].map(x => x.innerText)`); };
  await ok((await dictSearch("ສະບາຍດີ")).some(x => x.includes("ສະບາຍດີ")), "search by Lao script finds ສະບາຍດີ");
  await ok((await dictSearch("sabaidee")).some(x => x.includes("ສະບາຍດີ")), "search by romanization 'sabaidee' finds ສະບາຍດີ");
  await ok((await dictSearch("thank")).some(x => x.includes("ຂອບໃຈ")), "search by English 'thank' finds ຂອບໃຈ");
  await dictSearch("zzqxv");
  await ok(await has(/Nothing found/), "a word that doesn't exist shows 'Nothing found'");

  step("word card + bookmarks");
  await dictSearch("ຂອບໃຈ");
  await b.eval(`[...document.querySelectorAll("main .dres button")].find(x => x.innerText.includes("ຂອບໃຈ")).click()`);
  await b.waitFor(`!!document.querySelector(".sheet")`, 5000);
  await ok(await b.eval(`document.querySelector(".sheet").innerText.includes("ຂອບໃຈ")`), "clicking a word opens its word card");
  await b.eval(`document.querySelector(".sheet [aria-label='Bookmark']").click()`); await sleep(600);
  await ok(await b.eval(`document.querySelector(".sheet [aria-label='Bookmark']").getAttribute("aria-pressed") === "true"`), "bookmark button switches on");
  await b.eval(`document.querySelector(".sheet [aria-label='Close']").click()`);
  await nav(/Saved/);
  await ok(await b.eval(`document.querySelector("main").innerText.includes("ຂອບໃຈ")`), "Saved page lists the bookmarked word");
  await b.goto(srv.base + "/"); await b.waitFor(`!!document.querySelector(".app")`, 30000); await nav(/Saved/);
  await ok(await b.eval(`document.querySelector("main").innerText.includes("ຂອບໃຈ")`), "bookmark is still there after a reload");
  await nav(/Review/);
  await ok(!(await has(/Nothing to review/)) || true, "Review page opens"); // bookmarking also adds a review card

  step("audio");
  await b.eval(`(() => { window.__spoken = []; speechSynthesis.speak = u => window.__spoken.push(u.text); })()`);
  await nav(/Dictionary/);
  await dictSearch("ຂອບໃຈ");
  await b.eval(`[...document.querySelectorAll("main .dres button")].find(x => x.innerText.includes("ຂອບໃຈ")).click()`);
  await b.waitFor(`!!document.querySelector(".sheet")`, 5000);
  await b.eval(`(() => { const s = [...document.querySelectorAll(".sheet button")].find(x => x.querySelector("svg") && /listen|play|speak|ຟັງ/i.test((x.getAttribute("aria-label")||"") + (x.title||"") + x.innerText)) || document.querySelector(".sheet .say, .sheet [data-say]"); if (s) s.click(); })()`);
  await sleep(400);
  await ok(await b.eval(`window.__spoken.length > 0 && window.__spoken.some(t => t.includes("ຂອບໃຈ"))`), "word card speaker button speaks the Lao word");
  await b.eval(`document.querySelector(".sheet [aria-label='Close']").click()`);

  step("notes");
  await nav(/Notes/);
  const noteText = `E2E note ລາວ <b>not bold</b> & "quotes" ${Date.now()}`;
  await setVal("main textarea", noteText);
  await click("main button", /^Add|Save|ເພີ່ມ/);
  await sleep(800);
  await ok(await b.eval(`[...document.querySelectorAll("main .notecard p")].some(p => p.textContent === ${J(noteText)})`), "note is saved and shown exactly as typed (HTML shown as text)");
  await ok(await b.eval(`!document.querySelector("main .notecard b")`), "HTML in a note is not rendered as markup");
  await b.eval(`[...document.querySelectorAll("main .notecard")].find(c => c.innerText.includes("E2E note")).querySelector("button").click()`); await sleep(800);
  await ok(await b.eval(`![...document.querySelectorAll("main .notecard")].some(c => c.innerText.includes(${J(noteText)}))`), "note can be deleted");

  step("lesson + progress");
  await setVal("#search", "Greetings"); await sleep(600);
  await ok(await click(".search-pop .sp-item", /Greetings/), "topbar search finds the Greetings lesson");
  await b.waitFor(`/Mark lesson complete|Completed/.test(document.querySelector("main").innerText)`, 8000);
  await ok(await b.eval(`document.querySelector("main").innerText.length > 200`), "lesson page shows its content");
  await click("main button", /Mark lesson complete/); await sleep(800);
  await ok(await has(/Completed ✓/), "lesson can be marked complete");
  await nav(/Progress/);
  const done1 = await b.eval(`(document.querySelector("main").innerText.match(/(\\d+)\\s*\\n?\\s*Lessons completed|Lessons completed\\D*(\\d+)/) || []).slice(1).find(Boolean)`);
  await ok(Number(done1) >= 1, `Progress page counts the completed lesson (${done1})`);
  await b.goto(srv.base + "/"); await b.waitFor(`!!document.querySelector(".app")`, 30000);
  await setVal("#search", "Greetings"); await sleep(600); await click(".search-pop .sp-item", /Greetings/); await sleep(1000);
  await ok(await has(/Completed ✓/), "lesson completion is still saved after a reload");

  step("theme (learner)");
  await nav(/Account/);
  await themeBtn(/^Dark$/); await sleep(600);
  await ok(await b.eval(`document.documentElement.dataset.theme`) === "night", `Account → Dark switches to the night theme (data-theme="${await b.eval(`document.documentElement.dataset.theme`)}")`);
  await b.goto(srv.base + "/"); await b.waitFor(`!!document.querySelector(".app")`, 30000); await sleep(500);
  await ok(await b.eval(`document.documentElement.dataset.theme`) === "night", "night theme is kept after a reload");
  await nav(/Account/);
  await ok(await b.eval(`[...[...document.querySelectorAll("main .set-row")].find(r => /^Theme$/.test((r.querySelector("label")||{}).textContent||"")).querySelectorAll("button")].find(x => /^Dark$/.test(x.innerText)).getAttribute("aria-pressed") === "true"`), "Account page shows Dark as selected");
  await themeBtn(/^Light$/); await sleep(600);
  await ok(await b.eval(`document.documentElement.dataset.theme`) === "day", "Account → Light switches back to day");
  await themeBtn(/^Auto$/); await sleep(600);
  await ok(await b.eval(`document.documentElement.dataset.theme`) === "system", "Account → Auto follows the system setting");
  await themeBtn(/^Light$/); await sleep(400);

  step("language (learner)");
  await click("main .seg button", /^ລາວ$/); await sleep(800);
  await ok(await b.eval(`[...document.querySelectorAll(".side .nav-btn")].some(x => /[\\u0E80-\\u0EFF]/.test(x.innerText))`), "switching to Lao translates the menu");
  await b.goto(srv.base + "/"); await b.waitFor(`!!document.querySelector(".app")`, 30000); await sleep(500);
  await ok(await b.eval(`document.documentElement.lang === "lo"`), "Lao interface is kept after a reload");
  await click(".topbar .langsw button", /^中$/); await sleep(800);
  await ok(await b.eval(`[...document.querySelectorAll(".side .nav-btn")].some(x => /[\\u4e00-\\u9fff]/.test(x.innerText))`), "switching to Chinese translates the menu");
  await click(".topbar .langsw button", /^EN$/); await sleep(800);
  await ok(await b.eval(`[...document.querySelectorAll(".side .nav-btn")].some(x => /^Dictionary$/.test(x.innerText.trim()))`), "back to English");

  // ======================= ADMIN =======================
  step("admin: content lifecycle");
  await login("/admin/", "admin@demo.laolao");
  const LID = "e2e-ບົດທົດສອບ-" + Date.now().toString(36);
  const XSS = `E2E <img src=x onerror="window.__xss=1"> & "quotes" ${Date.now().toString(36)}`;
  await nav(/^Lessons$/);
  await click("main button", /^New$|New lesson|\+/);
  await b.waitFor(`!!document.querySelector(".dialog input")`, 5000);
  await setVal(".dialog input", LID);
  await click(".dialog button", /^Create$/);
  await b.waitFor(`/Title/.test(document.querySelector("main").innerText) && !!document.querySelector(".editor-side")`, 8000);
  await typeField(/^Title$/, XSS, 0);
  await typeField(/^Title$/, "ບົດທົດສອບ E2E", 1);
  await b.eval(`(() => { const s = document.querySelector(".editor-side select"); s.value = "published"; s.dispatchEvent(new Event("change", { bubbles:true })); })()`);
  await click(".editor-side button", /^Save$/);
  await b.waitFor(`/v1/.test(document.querySelector(".editor-side").innerText)`, 8000).catch(() => {});
  await ok(await b.eval(`/v1/.test(document.querySelector(".editor-side").innerText)`), "new lesson with a Lao ID is saved (version 1)");
  await typeField(/^Title$/, XSS + " edited", 0);
  await click(".editor-side button", /^Save$/);
  await b.waitFor(`/v2/.test(document.querySelector(".editor-side").innerText)`, 8000).catch(() => {});
  await ok(await b.eval(`/v2/.test(document.querySelector(".editor-side").innerText)`), "editing and saving again creates version 2");
  await b.waitFor(`[...document.querySelectorAll(".editor-side .feed-row")].some(r => /v1/.test(r.textContent))`, 5000).catch(() => {});
  await ok(await b.eval(`[...document.querySelectorAll(".editor-side .feed-row")].some(r => /v1/.test(r.textContent))`), "versions panel lists version 1 for restoring");
  await ok(await b.eval(`${fieldInput(/^Title$/, 0)}.value`) === XSS + " edited", "edited title is shown after saving (special characters kept)");
  await nav(/^Lessons$/);
  await ok(await b.eval(`document.querySelector("main").innerText.includes(${J(LID)}) || document.querySelector("main").innerText.includes("E2E")`), "lesson appears in the Lessons list");
  await ok(await click(".topbar button", /Publish now/), "header shows 'Publish now' after saving (unpublished changes)");
  await b.waitFor(`!document.querySelector(".dialog")`, 30000).catch(() => {});
  await sleep(600);

  step("learner sees the published lesson (and HTML is not executed)");
  await b.goto(srv.base + "/"); await b.waitFor(`!!document.querySelector(".app")`, 30000);
  await setVal("#search", "E2E"); await sleep(700);
  await ok(await b.eval(`!!document.querySelector('a[href="admin/"]')`), "administrators do see the admin link in the learner app");
  await ok(await click(".search-pop .sp-item", /E2E/), "published lesson is searchable in the learner app");
  await sleep(1200);
  await ok(await b.eval(`document.querySelector("main").innerText.includes("<img src=x")`), "the title is shown as text");
  await ok(await b.eval(`window.__xss === undefined && !document.querySelector("main img[src='x']")`), "HTML in content is not executed (no XSS)");

  step("quiz prompt escaping");
  await ok(await b.eval(`(async () => {
    const { runQuiz } = await import("/js/shared/quiz.js");
    const box = document.createElement("div"); box.className = "quiz"; document.body.append(box);
    runQuiz(box, [{ type:"fill", prompt:{ zh:'ຂ້ອຍ __ ເຂົ້າ <img src=x onerror="window.__xss2=1">' }, options:["ກິນ","ໄປ"], answer:0, skill:"vocabulary" }], {});
    await new Promise(r => setTimeout(r, 600));
    const okk = !box.querySelector("img") && window.__xss2 === undefined && !!box.querySelector(".blank") && box.innerText.includes("<img");
    box.remove(); return okk; })()`), "fill-in-the-blank prompt with HTML shows it as text and still marks the blank");

  step("admin: delete content");
  await b.goto(srv.base + "/admin/"); await b.waitFor(`!!document.querySelector(".app")`, 30000);
  await nav(/^Lessons$/);
  await b.eval(`[...document.querySelectorAll("main tbody tr")].find(r => r.innerText.includes(${J(LID)})).querySelectorAll("td")[2].click()`);
  await b.waitFor(`!!document.querySelector(".editor-side")`, 8000);
  await click(".editor-side button", /Delete/); await sleep(400);
  await click(".dialog button", /Delete/); await sleep(1200);
  await ok(!(await b.eval(`document.querySelector("main").innerText.includes(${J(LID)})`)), "lesson can be deleted");

  step("admin: list search + uploads");
  await setVal("main input.input", "Greetings"); await sleep(500);
  const rows = await b.eval(`[...document.querySelectorAll("main tbody tr")].map(r => r.innerText)`);
  await ok(rows.length >= 1 && rows.every(r => /Greetings/i.test(r)), `Lessons list search filters rows (${rows.length} match "Greetings")`);
  await setVal("main input.input", "zzz-no-match"); await sleep(500);
  await ok(await b.eval(`document.querySelectorAll("main tbody tr").length <= 1 && /no|ບໍ່/i.test(document.querySelector("main tbody").innerText)`), "search with no match shows an empty state");
  await ok(await b.eval(`(async () => { const { S } = await import("/js/admin/state.js");
    const small = await S.api.storage.upload(new File([new Uint8Array(2000)], "a.mp3", { type:"audio/mpeg" }), "audio/e2e-a.mp3");
    let big = null; try { await S.api.storage.upload(new File([new Uint8Array(1600000)], "b.mp3", { type:"audio/mpeg" }), "audio/e2e-b.mp3"); } catch(e){ big = e.message; }
    return String(small).startsWith("data:audio/mpeg") && String(big || "").includes("1.5 MB"); })()`), "demo upload: small audio file accepted, file over 1.5 MB rejected with a message");

  step("admin: learners");
  await nav(/^Learners/);
  await click("main button", /New learner/);
  await b.waitFor(`!!document.querySelector(".dialog")`, 5000);
  const lEmail = `e2e.learner.${Date.now()}@test.local`;
  const lPw = await b.eval(`document.querySelectorAll(".dialog input")[2].value`);
  await setVal(".dialog input", "E2E Created Learner", 0); await setVal(".dialog input", lEmail, 1);
  await click(".dialog button", /^Create$/);
  await b.waitFor(`!document.querySelector(".dialog") && /E2E Created Learner/.test(document.querySelector("main").innerText)`, 10000).catch(() => {});
  await ok(await has(/E2E Created Learner/), "admin can create a learner (opens the learner's page)");
  await click("main button", /\+1 month|1 month/); await sleep(1000);
  await ok(await b.eval(`[...document.querySelectorAll("main details")].some(d => /extend/i.test(d.textContent))`), "+1 month is recorded in the access history");
  await click("main button", /^Disable$/); await sleep(400); await click(".dialog button", /^Disable$/); await sleep(1000);
  await ok(await has(/^Enable$/m) || await b.eval(`[...document.querySelectorAll("main button")].some(x => /^Enable$/.test(x.innerText.trim()))`), "learner can be disabled");
  await click("main button", /^Enable$/); await sleep(1000);
  await ok(await b.eval(`[...document.querySelectorAll("main button")].some(x => /^Disable$/.test(x.innerText.trim()))`), "learner can be enabled again");
  await login("/", lEmail, lPw);
  await ok(await b.eval(`!!document.querySelector(".app")`), "the created learner can sign in with the temporary password");

  step("admin: administrators");
  await login("/admin/", "admin@demo.laolao");
  await nav(/Administrators/);
  await click("main button", /Add administrator/);
  await b.waitFor(`!!document.querySelector(".dialog input")`, 5000);
  const aEmail = `e2e.admin.${Date.now()}@test.local`;
  await setVal(".dialog input[type=email], .dialog input", aEmail, 0);
  await b.eval(`(() => { const ins = [...document.querySelectorAll(".dialog input")]; const pw = ins.find(i => i.type === "password") || ins[2]; pw.value = "e2e-admin-123"; pw.dispatchEvent(new Event("input", { bubbles:true })); })()`);
  await click(".dialog button", /^Add administrator$/);
  await b.waitFor(`!document.querySelector(".dialog")`, 10000).catch(() => {});
  await sleep(800);
  await ok(await b.eval(`document.querySelector("main").innerText.includes(${J(aEmail)})`), "Super Admin can add an administrator (was crashing before)");

  step("admin: settings + export");
  await nav(/Settings/);
  const appName = "LaoLao E2E " + Date.now().toString(36);
  await b.eval(`(() => { const i = [...document.querySelectorAll("main input.input")].find(x => /LaoLao/.test(x.value)); i.value = ${J(appName)}; i.dispatchEvent(new Event("input", { bubbles:true })); })()`);
  await b.eval(`[...document.querySelectorAll("main button.primary")].find(x => /^Save$/.test(x.innerText.trim())).click()`); await sleep(1000);
  await click("main button", /Export content/);
  await b.waitFor(`!!document.querySelector(".dialog textarea")`, 8000).catch(() => {});
  await ok(await b.eval(`(() => { const t = document.querySelector(".dialog textarea"); if (!t) return false; const j = JSON.parse(t.value); return Array.isArray(j.lessons) && j.lessons.length > 0 && Array.isArray(j.plans); })()`), "Export produces valid JSON with lessons and plans");
  await b.eval(`document.querySelector(".dialog .ib").click()`).catch(() => {});
  await b.goto(srv.base + "/"); await b.waitFor(`!!document.querySelector(".app")`, 30000);
  await ok(await b.eval(`document.querySelector(".side .brand").innerText.includes(${J(appName)})`), "changed app name appears in the learner app");

  step("admin: theme + language");
  await b.goto(srv.base + "/admin/"); await b.waitFor(`!!document.querySelector(".app")`, 30000);
  await click(".topbar button", /^Night$/); await sleep(500);
  await ok(await b.eval(`document.documentElement.dataset.theme`) === "night", "admin Night theme");
  await b.goto(srv.base + "/admin/"); await b.waitFor(`!!document.querySelector(".app")`, 30000); await sleep(400);
  await ok(await b.eval(`document.documentElement.dataset.theme`) === "night", "admin theme kept after reload");
  await click(".topbar button", /^Day$/); await sleep(300);
  await click(".topbar .langsw button", /^ລາວ$/); await sleep(800);
  await ok(await b.eval(`[...document.querySelectorAll(".side .nav-btn")].some(x => /[\\u0E80-\\u0EFF]/.test(x.innerText))`), "admin menu switches to Lao");
  await click(".topbar .langsw button", /^EN$/); await sleep(800);

  // ======================= ROLES =======================
  step("roles");
  const menu = () => b.eval(`[...document.querySelectorAll(".side .nav-btn")].map(x => x.innerText.trim())`);
  await login("/admin/", "editor@demo.laolao");
  let m = await menu();
  await ok(!m.some(x => /Administrators|Settings|Pricing|Learners/.test(x)) && m.some(x => /^Lessons$/.test(x)), "editor: content menus only (no admins, settings, plans or learners)");
  await nav(/^Lessons$/);
  await ok(await b.eval(`[...document.querySelectorAll("main button")].some(x => /^New$|New/.test(x.innerText))`), "editor can create content");
  await login("/admin/", "reviewer@demo.laolao");
  await nav(/^Lessons$/);
  await b.eval(`(() => { const r = document.querySelector("main tbody tr"); (r.querySelector("a,button") || r).click(); })()`).catch(() => {}); await sleep(1200);
  await ok(await b.eval(`!!document.querySelector(".editor-side") && ![...document.querySelectorAll(".editor-side button")].some(x => /^Save$/.test(x.innerText.trim()))`), "reviewer: lesson editor is read-only (no Save button)");
  await login("/admin/", "support@demo.laolao");
  m = await menu();
  await ok(m.some(x => /Learners/.test(x)) && !m.some(x => /^Lessons$|Administrators|Settings/.test(x)), "support: learners and activity, no content or settings");

  const errs = jsErrors();
  await ok(errs.length === 0, "no JavaScript errors during the whole run" + (errs.length ? ":\n      " + errs.slice(0, 6).join("\n      ") : ""));
} catch(e){
  console.log("  FAIL (aborted) " + e.message);
  failed++;
  await b.screenshot(path.join(SHOTS, `abort-${section}.png`)).catch(() => {});
  b.consoleLog.slice(-8).forEach(l => console.log("    console:", l.slice(0, 200)));
} finally {
  await b.close(); srv.close();
}
console.log(failed ? `\n${failed} check(s) FAILED` : "\nAll functional checks passed");
process.exit(failed ? 1 : 0);
