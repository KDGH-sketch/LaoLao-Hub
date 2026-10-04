// Browser tests of the welcome page and its admin control, in DEMO mode (Supabase is never contacted).
// Plans from the table, registration closed, offer windows and on/off, empty resources, hidden news, a draft invisible
// until published, revert, preview of the draft, a new place gets a pin, hash safety, offline load, sign-up attribution.
// Run: node scripts/e2e_welcome.mjs   (Chrome or Edge required)
import fs from "fs";
import path from "path";
import { launch, sleep } from "./lib/cdp.mjs";
import { startDemoServer, ROOT } from "./lib/demo-server.mjs";

const SHOTS = path.join(ROOT, "e2e-screenshots");
fs.mkdirSync(SHOTS, { recursive: true });
const srv = await startDemoServer();
const b = await launch({ width: 1366, height: 900 });
let failed = 0, section = "";
const ok = async (cond, name) => {
  console.log((cond ? "  PASS " : "  FAIL ") + name);
  if (!cond){ failed++; await b.screenshot(path.join(SHOTS, `fail-welcome-${section}-${name}`.replace(/[^\w.-]+/g, "_").slice(0, 110) + ".png")).catch(() => {}); }
};
const step = s => { section = s; console.log("\n" + s); };
const J = JSON.stringify;
const text = () => b.eval(`document.body.innerText`);
const jsErrors = () => b.consoleLog.filter(l => /^exception|^error/.test(l) && !/favicon|net::ERR|Failed to load resource/i.test(l));
// demo database, from the page (the demo backend has no row-level security; Supabase rules are in test_sql_access.mjs)
const api = expr => b.eval(`(async () => { const { getApi } = await import("/js/api/index.js"); const api = await getApi(); const C = await import("/js/shared/content.js"); ${expr} })()`);
const publish = () => api(`await C.buildBundles(api, "e2e"); await api._flush(); return true;`);
const save = (p, d, merge = true) => api(`await api.db.set(${J(p)}, ${J(d)}, ${merge}); await api._flush(); return true;`);
async function visitor(hash = "", query = ""){
  await b.eval(`try { localStorage.removeItem("laolao.demo.session"); } catch(e){}`).catch(() => {});
  await b.goto(srv.base + "/?r=" + Date.now() + query + hash);
  await b.waitFor(`!!document.querySelector(".wl .wl-hero")`, 60000);
  await b.eval(`(async () => { const i = await import("/js/shared/i18n.js"); i.setLang("en"); try { localStorage.setItem("xuelu.lang","en"); } catch(e){} })()`);
  await sleep(2600);                                   // the backend fill-in (each read waits at most 2.5 s)
}
async function admin(){
  await b.eval(`try { localStorage.removeItem("laolao.demo.session"); } catch(e){}`).catch(() => {});
  await b.goto(srv.base + "/admin/");
  await b.waitFor(`!!document.querySelector("#em") || !!document.querySelector(".app")`, 60000);
  if (!(await b.eval(`!!document.querySelector(".app")`))){
    await b.eval(`(() => { const e = document.querySelector("#em"), p = document.querySelector("#pw"); e.value = "admin@demo.laolao"; p.value = "demo1234"; (e.form || p.form).requestSubmit(); })()`);
    await b.waitFor(`!!document.querySelector(".app")`, 30000);
  }
  await sleep(1000);
}
const adminGo = async (v, p = {}) => { await b.eval(`(async () => { const st = await import("/js/admin/state.js"); st.go(${J(v)}, ${J(p)}); })()`); await sleep(2200); };
const clickDlg = async re => b.eval(`(() => { const x = [...document.querySelectorAll(".dialog .dialog-f button")].find(e => ${re}.test(e.innerText.trim())); if (x) x.click(); return !!x; })()`);

try {
  step("first paint and live data");
  await visitor();
  await ok(await b.eval(`!!document.querySelector("form.auth-card #em") && !!document.querySelector("#pw") && !!document.querySelector(".msg[role=alert]")`), "sign-in card keeps #em, #pw, .msg[role=alert] and .auth-card");
  await ok(await b.eval(`document.querySelectorAll(".wl-pin").length === 6 && document.querySelectorAll(".wl-fcard").length === 6`), "journey: 6 places with pins, festival calendar: 6");
  await ok(await b.eval(`document.querySelectorAll(".wl-fcard[data-now=true]").length === 1`), "festival calendar: the current festival is highlighted");
  await ok(/Learn Lao, one/.test(await text()) && /Welcome back/.test(await text()), "hero copy and sign-in card in English");

  step("plans come from the plans table");
  await save("plans/premium", { prices: { month: { USD: 7.77, LAK: 100000 }, year: { USD: 59, LAK: 990000 } } });
  await visitor();
  await ok(/7\.77|100,000/.test(await b.eval(`[...document.querySelectorAll(".wl-plan")].map(e => e.innerText).join(" ")`)), "a price changed in the table appears on the page");
  await save("plans/standard", { showOnWelcome: false });
  await visitor();
  await ok(!(await b.eval(`[...document.querySelectorAll(".wl-plan h3")].some(e => /Basic|Standard/.test(e.innerText))`)), "showOnWelcome: false hides a plan");
  await save("plans/standard", { showOnWelcome: true });

  step("registration closed");
  await save("settings/app", { allowRegistration: false, supportContact: "help@laolao.test" });
  await visitor();
  await ok(await b.eval(`document.querySelector("#wl-tab-up").hidden`) && !(await b.eval(`document.querySelector(".wl-closed").hidden`)) && /help@laolao\.test/.test(await text()), "the Create account tab is hidden and the closed message shows the contact");
  await b.eval(`document.querySelector(".wl-hero-cta .wl-btn").click()`); await sleep(500);
  await ok(await b.eval(`document.querySelector("#wl-tab-in").getAttribute("aria-selected") === "true" && document.querySelector("#nm").closest(".wl-field").hidden`), "Start free opens sign-in, not registration");
  await save("settings/app", { allowRegistration: true });

  step("offers: dates and on / off");
  const offer = async patch => { await save("offers/sample-premium", patch); await publish(); await visitor(); return b.eval(`!!document.querySelector("[data-offer='sample-premium']")`); };
  await ok(await offer({ active: true, startsAt: "2026-10-01", endsAt: "2099-12-31T23:59:00" }), "an active offer inside its dates is shown");
  await ok(!(await offer({ startsAt: "2099-01-01", endsAt: "2099-12-31" })), "hidden before startsAt");
  await ok(!(await offer({ startsAt: "2020-01-01", endsAt: "2020-12-31" })), "hidden after endsAt");
  await ok(!(await offer({ startsAt: "2026-01-01", endsAt: "2099-12-31", active: false })), "hidden when active is off");
  await ok(await offer({ active: true }), "back on");
  await ok(await b.eval(`!!document.querySelector(".wl-count[role=timer]")`), "countdown offer shows the timer");

  step("resources and news");
  const resIds = await api(`return (await api.db.list("resources")).map(r => r.id);`);
  await api(`for (const id of ${J(resIds)}) await api.db.del("resources/" + id); await api._flush(); return true;`); await publish(); await visitor();
  await ok(await b.eval(`!!document.querySelector("#w-resources .wl-empty")`), "no resources: the empty state is shown");
  await api(`for (const [t, id] of [["culture","cul-alms"],["culture","cul-baci"],["culture","cul-khao-niao"],["releases","r100"]]) await api.db.set(t + "/" + id, { featured:false }, true); await api._flush(); return true;`); await publish(); await visitor();
  await ok(!(await b.eval(`!!document.querySelector("#w-news")`)) && !(await b.eval(`[...document.querySelectorAll(".wl-links button")].some(x => /News/.test(x.innerText))`)), "no featured news: the News section and its menu link are hidden");

  step("a new place gets a pin");
  await save("places/kuang-si", { status: "published", access: "public", order: 7, scene: "waterfall", lat: 19.749, lon: 101.991, laoName: "ຕາດກວາງຊີ",
    title: { en: "Kuang Si Falls", lo: "ນ້ຳຕົກຕາດກວາງຊີ", zh: "光西瀑布" }, text: { en: "Turquoise pools.", lo: "ອ່າງນ້ຳສີຟ້າ.", zh: "碧绿的水潭。" }, words: [], facts: [] }, false);
  await save("places/outside", { status: "published", access: "public", order: 8, scene: "river", lat: 30, lon: 101, title: { en: "Not in Laos" } }, false);
  await publish(); await visitor();
  const pin = await b.eval(`(() => { const p = document.querySelector(".wl-pin[data-id='kuang-si']"); return p ? p.getAttribute("style") : null; })()`);
  const want = await b.eval(`(async () => { const d = await import("/js/learner/welcome-data.js"); return d.project(19.749, 101.991); })()`);
  await ok(!!pin && pin.includes("--x:" + want.x + "%") && pin.includes("--y:" + want.y + "%"), "Kuang Si gets a pin from its latitude and longitude (" + pin + ")");
  await ok(!(await b.eval(`!!document.querySelector(".wl-pin[data-id='outside']")`)), "a place outside Laos gets no pin");
  await b.eval(`document.querySelector("#wl-jt-kuang-si").click()`); await sleep(300);
  await ok(/Kuang Si Falls/.test(await b.eval(`document.querySelector("#wl-jpanel").innerText`)), "its tab opens its scene and text");

  step("draft, publish, revert, preview");
  await save("settings/welcomeDraft", { data: Object.assign(await api(`return (await api.db.get("settings/welcome")).published;`), { hero: Object.assign(await api(`return (await api.db.get("settings/welcome")).published.hero;`), { h1a: { en: "DRAFT HEADLINE", lo: "ຮ່າງ", zh: "草稿" } }) }) }, false);
  await visitor();
  await ok(!/DRAFT HEADLINE/.test(await text()), "a saved draft is invisible to visitors");
  await admin();
  await b.goto(srv.base + "/?welcome-preview=1&r=" + Date.now()); await b.waitFor(`!!document.querySelector(".wl .wl-hero")`, 60000); await sleep(2800);
  await ok(/DRAFT HEADLINE/.test(await text()) && await b.eval(`!!document.querySelector(".wl-preview")`), "preview (?welcome-preview=1, admin): shows the draft with the 'not published' banner");
  await admin(); await adminGo("welcome"); await sleep(800);
  await ok(/Draft has unpublished changes/.test(await text()), "the editor says the draft has unpublished changes");
  await b.eval(`[...document.querySelectorAll(".editor-side button")].find(x => /Publish welcome page/.test(x.innerText)).click()`); await sleep(500);
  await clickDlg(/^Publish$/); await sleep(1500);
  await visitor();
  await ok(/DRAFT HEADLINE/.test(await text()), "after Publish welcome page, visitors see it");
  const acts = await api(`return (await api.db.list("activity")).filter(a => /admin:publish/.test(a.type) && /settings\\/welcome/.test(a.ref)).length;`);
  await ok(acts >= 1, "publishing is in the activity audit log");
  await save("settings/welcomeDraft", { data: Object.assign(await api(`return (await api.db.get("settings/welcome")).published;`), { closing: { title: { en: "REVERT ME" }, cta: { en: "x" } } }) }, false);
  await admin(); await adminGo("welcome"); await sleep(800);
  await b.eval(`[...document.querySelectorAll(".editor-side button")].find(x => /Revert to published/.test(x.innerText)).click()`); await sleep(500);
  await clickDlg(/^Revert$/); await sleep(1500);
  const draft = await api(`return JSON.stringify((await api.db.get("settings/welcomeDraft")).data);`);
  await ok(!/REVERT ME/.test(draft) && /DRAFT HEADLINE/.test(draft), "Revert to published discards the draft");
  await ok((await api(`return (await api.db.list("activity")).filter(a => /admin:revert/.test(a.type)).length;`)) >= 1, "revert is in the audit log");

  step("hashes, language, theme");
  await visitor("#tone_lab");
  await ok(await b.eval(`!!document.querySelector(".wl .wl-hero")`), "a deep link (#tone_lab) while signed out shows the welcome page");
  await visitor("#p12");
  const h0 = await b.eval(`location.hash`);
  await b.eval(`document.querySelector(".wl-links [data-scroll='services']").click()`); await sleep(800);
  await ok((await b.eval(`location.hash`)) === h0 && (await b.eval(`scrollY`)) > 200, "in-page menu scrolls without changing the address hash");
  await b.eval(`[...document.querySelectorAll(".wl-nav-lang button")].find(x => x.innerText === "ລາວ").click()`); await sleep(1200);
  await ok(await b.eval(`/ການເດີນທາງ|ບໍລິການ/.test(document.querySelector(".wl-links").innerText) && document.documentElement.lang === "lo"`), "ລາວ: the page switches to Lao");
  await b.eval(`[...document.querySelectorAll(".wl-nav-lang button")].find(x => x.innerText === "EN").click()`); await sleep(1200);
  await b.eval(`document.querySelector("[data-theme-set='night']").click()`); await sleep(900);
  await ok((await b.eval(`document.documentElement.getAttribute("data-theme")`)) === "night" && (await b.eval(`localStorage.getItem("laolao_theme")`)) === "night", "Night theme uses the app's data-theme and laolao_theme");
  await b.eval(`document.querySelector("[data-theme-set='day']").click()`); await sleep(700);

  step("phone: menu");
  await b.viewport(390, 844, true); await visitor();
  await b.eval(`document.querySelector(".wl-menu-btn").click()`); await sleep(500);
  await ok(await b.eval(`(() => { const s = document.querySelector("#wl-sheet"); try { return s.matches(":popover-open"); } catch(e){ return s.classList.contains("open"); } })()`), "the mobile menu opens (Popover API)");
  await b.eval(`document.querySelector("#wl-sheet [data-scroll='about']").click()`); await sleep(800);
  await ok(await b.eval(`(() => { const s = document.querySelector("#wl-sheet"); try { return !s.matches(":popover-open"); } catch(e){ return !s.classList.contains("open"); } })()`), "choosing a section closes it");
  await ok(await b.eval(`document.documentElement.scrollWidth <= innerWidth + 1`), "no sideways scroll on a phone");
  await b.viewport(1366, 900, false);

  step("sign-up remembers where it came from");
  await visitor("", "&ref=fb-test");
  await b.eval(`[...document.querySelectorAll(".wl-plan button")].find(x => /Premium/.test(x.innerText)).click()`); await sleep(700);
  await ok(await b.eval(`document.querySelector("#wl-tab-up").getAttribute("aria-selected") === "true"`) && /upgrade to Premium/i.test(await b.eval(`document.querySelector(".wl-msg").innerText`)), "a paid plan opens Create account with the upgrade note");
  const email = "wl" + Date.now() + "@test.laolao";
  await b.eval(`(() => { document.querySelector("#nm").value = "Welcome Test"; document.querySelector("#em").value = ${J(email)}; document.querySelector("#pw").value = "secret123"; document.querySelector("form.auth-card").requestSubmit(); })()`);
  await b.waitFor(`!!document.querySelector(".app")`, 30000).catch(() => {});
  await sleep(1500);
  const u = await api(`return (await api.db.list("users")).find(x => x.email === ${J(email)});`);
  await ok(u && u.signup && u.signup.source === "fb-test" && u.signup.planId === "premium", "the new learner's profile stores signup.source = fb-test and the plan clicked (" + J(u && u.signup) + ")");

  step("keyboard sign-in");
  await visitor();
  await b.eval(`document.querySelector("#em").focus()`);
  await b.send("Input.insertText", { text: "free@demo.laolao" });
  await b.send("Input.dispatchKeyEvent", { type: "keyDown", key: "Tab", code: "Tab", windowsVirtualKeyCode: 9 }); await b.send("Input.dispatchKeyEvent", { type: "keyUp", key: "Tab", code: "Tab", windowsVirtualKeyCode: 9 });
  await ok(await b.eval(`document.activeElement.id === "pw"`), "Tab goes from email to password");
  await b.send("Input.insertText", { text: "demo1234" });
  await b.send("Input.dispatchKeyEvent", { type: "keyDown", key: "Enter", code: "Enter", windowsVirtualKeyCode: 13, text: "\r" }); await b.send("Input.dispatchKeyEvent", { type: "keyUp", key: "Enter", code: "Enter", windowsVirtualKeyCode: 13 });
  await b.waitFor(`!!document.querySelector(".app")`, 30000).catch(() => {});
  await ok(await b.eval(`!!document.querySelector(".app")`), "Enter signs in (keyboard only)");

  step("offline");
  await b.eval(`try { localStorage.removeItem("laolao.demo.session"); } catch(e){}`);
  await b.goto(srv.base + "/"); await b.waitFor(`!!document.querySelector(".wl .wl-hero")`, 60000); await sleep(1500);
  const sw = await b.eval(`(async () => { if (!navigator.serviceWorker) return false; const r = await navigator.serviceWorker.ready; for (let i = 0; i < 40 && !navigator.serviceWorker.controller; i++) await new Promise(x => setTimeout(x, 250)); return !!navigator.serviceWorker.controller || !!r.active; })()`);
  await b.goto(srv.base + "/"); await b.waitFor(`!!document.querySelector(".wl .wl-hero")`, 60000); await sleep(1200);
  await b.send("Network.enable"); await b.send("Network.emulateNetworkConditions", { offline: true, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
  await b.goto(srv.base + "/?offline=" + Date.now());
  const offline = await b.waitFor(`!!document.querySelector(".wl .wl-hero") && document.querySelectorAll(".wl-pin").length > 0`, 20000).then(() => true, () => false);
  await ok(sw && offline, "offline: the page loads from the app cache with its content");
  await b.send("Network.emulateNetworkConditions", { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });

  await ok(jsErrors().length === 0, "no JavaScript errors" + (jsErrors().length ? ": " + jsErrors().slice(0, 3).join(" | ") : ""));
} catch(e){ console.error(e); failed++; }
finally { await b.close(); srv.close(); }
console.log(failed ? `\n${failed} welcome browser checks FAILED` : "\nAll welcome browser checks passed");
process.exit(failed ? 1 : 0);
