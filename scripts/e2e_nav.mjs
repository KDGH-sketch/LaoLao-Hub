// The side menus of the learner app and the admin (js/shared/sidenav.js), in the browser (demo mode):
//   - sections fold and unfold, remembered after a reload; the open page's section always opens
//   - opening an item near the bottom keeps the menu where it was, and the open item stays in view
//   - Find a page (Ctrl+K): recent pages first, typing filters (also by the screens inside an entry), Enter opens
//   - the slim rail (icons only), remembered; phones keep the tab bar and the "More" sheet
//   - moving around 40 times adds no document / window listeners (the shell is built once)
//   - combined entries: Culture & context (4 tabs), Tone & sound lab (2 tabs); old links still open the right tab
//   - the labs: tone finder and syllable parts agree with the tone rules; the tone cards' examples too
//   - the kinship table is a table on wide screens and cards on a phone; no screen scrolls sideways
//   - the admin menu: same folding, Find a page, scroll kept, the publish button still live
// Run: node scripts/e2e_nav.mjs
import path from "path";
import fs from "fs";
import { launch, sleep } from "./lib/cdp.mjs";
import { startDemoServer, ROOT } from "./lib/demo-server.mjs";

const SHOTS = path.join(ROOT, "e2e-screenshots"); fs.mkdirSync(SHOTS, { recursive: true });
const srv = await startDemoServer();
const b = await launch({ width: 1366, height: 820 });
let failed = 0;
const ok = (c, m, d) => { console.log((c ? "  PASS " : "  FAIL ") + m + (!c && d !== undefined ? "  → " + JSON.stringify(d).slice(0, 400) : "")); if (!c) failed++; };
const J = JSON.stringify;
async function login(email, base = "/"){
  await b.eval(`try { localStorage.removeItem("laolao.demo.session"); localStorage.setItem("xuelu.lang","en"); localStorage.setItem("xuelu.admin.lang","en"); } catch(e){}`).catch(() => {});
  await b.goto(srv.base + base); await b.waitFor(`!!document.querySelector("#em") || !!document.querySelector(".app")`, 60000);
  await b.eval(`(() => { const e = document.querySelector("#em"), p = document.querySelector("#pw"); if (!e) return; e.value = ${J(email)}; p.value = "demo1234"; (e.form || p.form).requestSubmit(); })()`);
  await b.waitFor(`!!document.querySelector(".app .side .nav-btn")`, 60000); await sleep(900);
  if (base === "/"){ await b.eval(`import("/js/learner/core.js").then(m => { m.setPref("uiLang","en"); m.setPref("explainLang","en"); })`); await sleep(200);
    await b.eval(`import("/js/learner/main.js").then(m => m.go("home", {}))`); await sleep(600); }   // the shell is rebuilt in English
}
const go = (v, p = {}) => b.eval(`import("/js/learner/main.js").then(m => m.go(${J(v)}, ${J(p)}))`).then(() => sleep(700));
const active = () => b.eval(`document.querySelector('.sn [aria-current="page"]')?.dataset.key || null`);
async function listeners(){
  const n = async expr => { const { result } = await b.send("Runtime.evaluate", { expression: expr }); return (await b.send("DOMDebugger.getEventListeners", { objectId: result.objectId })).listeners.length; };
  return (await n("document")) + (await n("window"));
}
const key = (k, opts = {}) => b.eval(`document.dispatchEvent(new KeyboardEvent("keydown", Object.assign({ key:${J(k)}, bubbles:true }, ${J(opts)})))`);
const palKey = k => b.eval(`document.querySelector(".pal-in").dispatchEvent(new KeyboardEvent("keydown", { key:${J(k)}, bubbles:true }))`);

try {
  await b.eval(`try { ["laolao.nav.closed","laolao.nav.rail","laolao.nav.recent","laolao.admnav.closed","laolao.admnav.rail"].forEach(k => localStorage.removeItem(k)); } catch(e){}`).catch(() => {});
  await login("learner@demo.laolao");
  console.log("learner menu");
  const secs = await b.eval(`[...document.querySelectorAll(".sn-sec")].map(s => s.dataset.sec + ":" + s.querySelectorAll(".nav-btn").length)`);
  const total = await b.eval(`document.querySelectorAll(".sn .sn-sec .nav-btn").length`);
  ok(secs.length === 5 && total === 20, `5 sections, ${total} entries (was 24: the culture labs and the sound labs are combined)`, secs);
  ok(await b.eval(`!!document.querySelector(".sn-find") && /Find a page/.test(document.querySelector(".sn-find").innerText)`), "a 'Find a page' button with its shortcut");
  // fold a section and reload
  await b.eval(`document.querySelector('.sn-sec[data-sec="learn"] .sn-head').click()`); await sleep(400);
  ok(await b.eval(`document.querySelector('.sn-sec[data-sec="learn"]').classList.contains("closed") && document.querySelector('.sn-sec[data-sec="learn"] .sn-head').getAttribute("aria-expanded") === "false"`), "a section folds closed");
  await b.goto(srv.base + "/"); await b.waitFor(`!!document.querySelector(".sn-sec")`, 60000); await sleep(800);
  ok(await b.eval(`document.querySelector('.sn-sec[data-sec="learn"]').classList.contains("closed")`), "…and stays closed after a reload");
  await go("vocab");
  ok(await b.eval(`!document.querySelector('.sn-sec[data-sec="learn"]').classList.contains("closed")`) && await active() === "vocab", "opening a page inside a closed section opens it and highlights the page");
  // the menu keeps its place
  await b.viewport(1366, 620);
  await go("home");
  const keep = await b.eval(`(async () => { const s = document.querySelector(".sn"); s.scrollTop = s.scrollHeight; await new Promise(r => setTimeout(r, 120)); const before = s.scrollTop;
    const btn = [...s.querySelectorAll(".sn-sec .nav-btn")].pop(); btn.click(); await new Promise(r => setTimeout(r, 900));
    const s2 = document.querySelector(".sn"), a = s2.querySelector('[aria-current="page"]').getBoundingClientRect(), r2 = s2.getBoundingClientRect();
    return { same: s2 === s, before: Math.round(before), after: Math.round(s2.scrollTop), visible: a.top >= r2.top && a.bottom <= r2.bottom, key: s2.querySelector('[aria-current="page"]').dataset.key }; })()`);
  ok(keep.same && Math.abs(keep.after - keep.before) < 40 && keep.visible, `opening '${keep.key}' at the bottom: the menu stays (scroll ${keep.before} → ${keep.after}) and the item is in view`, keep);
  await b.eval(`document.querySelector(".sn").scrollTop = 0`); await go("account");
  ok(await b.eval(`(() => { const s = document.querySelector(".sn"), a = s.querySelector('[aria-current="page"]').getBoundingClientRect(), r = s.getBoundingClientRect(); return a.top >= r.top && a.bottom <= r.bottom; })()`), "opened from elsewhere (search, a link), a low item is scrolled into view");
  await b.viewport(1366, 820);
  // no listeners pile up
  const l0 = await listeners();
  for (let i = 0; i < 40; i++) await b.eval(`import("/js/learner/main.js").then(m => m.go(${J(["home","practice","dict","review","speak","tone_lab","culture_lab","account"][i % 8])}, {}))`);
  await sleep(600);
  const l1 = await listeners();
  ok(l1 <= l0 + 1, `40 page changes: document / window listeners ${l0} → ${l1} (no leak)`);

  console.log("\nscreens loaded on first use");
  const lazy = await b.eval(`import("/js/learner/main.js").then(async m => { const bad = [];
    for (const [mod, name, views] of m.LAZY_VIEWS){ const x = await import("/js/learner/" + mod.slice(2)); for (const v of views) if (typeof (x[name] || {})[v] !== "function") bad.push(mod + " " + v);
      const real = Object.keys(x[name] || {}); for (const r of real) if (!views.includes(r)) bad.push(mod + " exports " + r + " (not in the list)"); }
    return { n: m.LAZY_VIEWS.reduce((a, x) => a + x[2].length, 0), bad }; })`);
  ok(lazy.n === 22 && !lazy.bad.length, `the list of ${lazy.n} lazily loaded screens matches what each module provides`, lazy.bad);
  for (const v of ["culture_lab","tone_lab","videos","handwriting","cards","grammar","patterns","myplan","plans","practice","practice_report","speak","review","chars"]){
    await go(v); const st = await b.eval(`({ banner: document.querySelector("main .banner")?.innerText || "", n: document.querySelector("main").innerText.length })`);
    if (st.n < 40 || /error|undefined/i.test(st.banner)) ok(false, v + " opens", st); }
  ok(true, "every lazily loaded screen opens");

  console.log("\nFind a page (Ctrl+K)");
  await key("k", { ctrlKey: true }); await sleep(250);
  const pal = await b.eval(`({ open: !!document.querySelector(".pal"), focus: document.activeElement === document.querySelector(".pal-in"), recent: document.querySelector(".pal-sep")?.innerText, first: document.querySelector(".pal-item .pal-l")?.innerText })`);
  ok(pal.open && pal.focus && /Recent/i.test(pal.recent || ""), "Ctrl+K opens it with the cursor in the box and recent pages first", pal);
  await b.eval(`(() => { const i = document.querySelector(".pal-in"); i.value = "kinship"; i.dispatchEvent(new Event("input")); })()`); await sleep(150);
  ok(await b.eval(`document.querySelector(".pal-item .pal-l")?.innerText`) === "Culture & context", "typing 'kinship' finds 'Culture & context' (a screen inside the entry)");
  await palKey("Enter"); await sleep(800);
  ok(!(await b.eval(`!!document.querySelector(".pal")`)) && await active() === "culture_lab", "Enter opens it and closes the box");
  await key("k", { metaKey: true }); await sleep(200);
  await b.eval(`(() => { const i = document.querySelector(".pal-in"); i.value = "voc"; i.dispatchEvent(new Event("input")); })()`); await sleep(120);
  await palKey("ArrowDown"); await palKey("ArrowUp");
  ok(await b.eval(`document.querySelector('.pal-item[aria-selected="true"] .pal-l')?.innerText`) === "Vocabulary", "⌘K works too; arrows move the choice ('voc' → Vocabulary)");
  await palKey("Escape"); await sleep(150);
  ok(!(await b.eval(`!!document.querySelector(".pal")`)), "Esc closes it");

  console.log("\nthe rail");
  await b.eval(`document.querySelector(".sn-rail-btn").click()`); await sleep(400);
  const rail = await b.eval(`({ w: Math.round(document.querySelector(".sn").getBoundingClientRect().width), labels: [...document.querySelectorAll(".sn .nav-btn .sn-lbl")].filter(x => x.offsetParent).length, cls: document.documentElement.classList.contains("sn-rail") })`);
  ok(rail.cls && rail.w <= 80 && rail.labels === 0, `rail: ${rail.w} px wide, icons only`, rail);
  await b.goto(srv.base + "/"); await b.waitFor(`!!document.querySelector(".sn")`, 60000); await sleep(600);
  ok(await b.eval(`document.documentElement.classList.contains("sn-rail")`), "…remembered after a reload");
  await b.eval(`document.querySelector(".sn-rail-btn").click()`); await sleep(300);
  ok(await b.eval(`document.querySelector(".sn").getBoundingClientRect().width > 200`), "…and back to the full menu");

  console.log("\ncombined entries and labs");
  await go("particle_lab");
  ok(await active() === "culture_lab" && await b.eval(`document.querySelectorAll(".sl-seg4 [role=tab]").length === 4 && /Particle/.test(document.querySelector('.sl-seg4 [aria-selected="true"]').innerText)`), "an old link (particle_lab) opens its tab inside Culture & context");
  await b.eval(`[...document.querySelectorAll(".sl-seg4 [role=tab]")][3].click()`); await sleep(700);
  ok(await b.eval(`/Classifiers/.test(document.querySelector('.sl-seg4 [aria-selected="true"]').innerText)`) && await active() === "culture_lab", "tabs switch between the four labs");
  await go("pronounce_lab");
  ok(await active() === "tone_lab" && await b.eval(`/Pronunciation Lab/.test(document.querySelector('.sl-seg [aria-selected="true"]').innerText)`), "pronounce_lab opens the second tab of the Tone & sound lab");
  const anat = await b.eval(`(() => { const parts = [...document.querySelectorAll(".sl-anat .sl-part b")].map(x => x.innerText); return { parts, tone: document.querySelector(".sl-anat .sl-tchip")?.innerText }; })()`);
  ok(anat.parts.join("|") === "ຮ|ເືອ|—|ນ" && anat.tone === "1", "syllable parts of ເຮືອນ: ຮ · ເ-ືອ · no mark · ນ → tone 1", anat);
  ok(await b.eval(`document.querySelectorAll(".sl-final").length === 8 && document.querySelectorAll(".sl-vp").length === 8`), "8 final sounds, 8 short / long vowel pairs");
  await go("tone_lab");
  ok(await b.eval(`document.querySelectorAll(".sl-tone").length === 6 && document.querySelectorAll(".sl-spark polyline").length === 6`), "6 tone cards with their pitch lines (from the Tone Lab contours)");
  await b.eval(`(() => { const i = document.querySelector(".sl-finder .sl-input"); i.value = "ຂາ"; i.dispatchEvent(new Event("input")); })()`); await sleep(150);
  ok(await b.eval(`document.querySelector(".sl-syl .sl-res .sl-tchip")?.innerText`) === "5", "tone finder: ຂາ → tone 5 (high letter, live syllable)");
  const agree = await b.eval(`import("/js/shared/lao-tone.js").then(m => [...document.querySelectorAll(".sl-tone")].flatMap(c => [...c.querySelectorAll(".sl-ex span")].map(s => [s.innerText, +c.dataset.tone, m.tonesOf(s.innerText)])).filter(([w, n, t]) => !(t.length === 1 && t[0] === n)))`);
  ok(!agree.length, "every example on the tone cards has the tone the finder gives it", agree);
  ok(await b.eval(`[...document.querySelectorAll(".sl-rr")].slice(1).map(r => [...r.querySelectorAll(".sl-tchip")].map(x => x.innerText).join("")).join(" ")`) === "12322 52322 12464", "rules at a glance: middle 1 2 3 2 2 · high 5 2 3 2 2 · low 1 2 4 6 4");

  console.log("\nthe kinship table, every size");
  for (const [w, hh, cards] of [[1366, 820, false], [820, 1180, false], [390, 844, true]]){
    await b.viewport(w, hh, w < 900); await go("kinship_lab");
    const tb = await b.eval(`(() => { const t = document.querySelector(".rtable"), th = t.querySelector("thead"); const td = t.querySelector("td"); return { head: getComputedStyle(th).display, label: getComputedStyle(td, "::before").content, sw: document.scrollingElement.scrollWidth - innerWidth, inCard: t.getBoundingClientRect().right <= innerWidth + 1 }; })()`);
    ok((cards ? tb.head === "none" && /PERSON|Person/.test(tb.label) : tb.head !== "none") && tb.sw <= 1 && tb.inCard, `${w}px: ${cards ? "one card per row with labels" : "a table"}, nothing sticks out`, tb);
  }
  await b.screenshot(path.join(SHOTS, "nav-kinship-phone.png"));
  for (const [w, hh] of [[360, 740], [390, 844], [820, 1180], [1024, 768], [1366, 820], [1920, 1080]]){
    await b.viewport(w, hh, w < 900);
    for (const v of ["tone_lab", "pronounce_lab", "culture_lab", "particle_lab", "classifiers_lab"]){ await go(v); const sw = await b.eval(`document.scrollingElement.scrollWidth - innerWidth`); if (sw > 1) ok(false, `${w}px ${v}: no sideways scrolling`, sw); }
  }
  ok(true, "the labs never scroll sideways at 360 / 390 / 820 / 1024 / 1366 / 1920 px");
  await b.viewport(390, 844, true); await go("home");
  await b.eval(`[...document.querySelectorAll(".tabbar button")].pop().click()`); await sleep(400);
  ok(await b.eval(`/Tone & sound lab/.test(document.querySelector(".sheet")?.innerText || "") && /Culture & context/.test(document.querySelector(".sheet").innerText)`), "phone: the More sheet has the new entries");
  await b.eval(`document.querySelector(".sheet-scrim")?.click()`); await b.viewport(1366, 820);
  await b.eval(`import("/js/learner/core.js").then(m => m.setPref("uiLang","lo"))`); await go("tone_lab");
  ok(!/nav_|undefined|null|NaN/.test(await b.eval(`document.body.innerText`)), "Lao interface: menu and labs without missing texts");
  await b.eval(`import("/js/learner/core.js").then(m => m.setPref("uiLang","en"))`); await go("tone_lab"); await b.screenshot(path.join(SHOTS, "nav-tone-lab.png"));

  console.log("\nadmin menu");
  await login("admin@demo.laolao", "/admin/");
  const adm = await b.eval(`({ secs: document.querySelectorAll(".sn-sec").length, items: document.querySelectorAll(".sn .sn-sec .nav-btn").length, find: !!document.querySelector(".sn-find") })`);
  ok(adm.secs === 6 && adm.items >= 28 && adm.find, `admin: ${adm.secs} folding sections, ${adm.items} entries, Find a page`, adm);
  await b.viewport(1366, 620); await sleep(300);
  const akeep = await b.eval(`(async () => { const s = document.querySelector(".sn"); s.scrollTop = s.scrollHeight; await new Promise(r => setTimeout(r, 120)); const before = s.scrollTop;
    [...s.querySelectorAll(".sn-sec .nav-btn")].pop().click(); await new Promise(r => setTimeout(r, 1200));
    const s2 = document.querySelector(".sn"), a = s2.querySelector('[aria-current="page"]'); const ar = a && a.getBoundingClientRect(), r2 = s2.getBoundingClientRect();
    return { same: s2 === s, before: Math.round(before), after: Math.round(s2.scrollTop), visible: !!ar && ar.top >= r2.top && ar.bottom <= r2.bottom }; })()`);
  ok(akeep.same && Math.abs(akeep.after - akeep.before) < 40 && akeep.visible, `admin: opening the last entry keeps the menu in place (${akeep.before} → ${akeep.after})`, akeep);
  await b.viewport(1366, 820);
  await key("k", { ctrlKey: true }); await sleep(200);
  await b.eval(`(() => { const i = document.querySelector(".pal-in"); i.value = "voice"; i.dispatchEvent(new Event("input")); })()`); await sleep(120);
  await palKey("Enter"); await sleep(1200);
  ok(await b.eval(`document.querySelector('.sn [aria-current="page"]')?.dataset.key`) === "audioStudio", "admin: Ctrl+K 'voice' → Voice Studio");
  ok(await b.eval(`!!document.querySelector(".topbar .pub-chip")`), "admin: the publish button is still in the top bar");
  await b.eval(`document.querySelector('.sn-sec[data-sec="s1"] .sn-head').click()`); await sleep(300);
  ok(await b.eval(`document.querySelector('.sn-sec[data-sec="s1"]').classList.contains("closed")`), "admin: sections fold");
  await b.screenshot(path.join(SHOTS, "nav-admin.png"));
  const errs = b.consoleLog.filter(l => /exception|error/i.test(l) && !/favicon|audio|speech|play\(\)|youtube|not-allowed|network|aborted|recognition/i.test(l));
  ok(errs.length === 0, "no JS errors", errs.slice(0, 4));
} catch(e){ console.log("  FAIL " + e.message); failed++; await b.screenshot(path.join(SHOTS, "nav-error.png")).catch(() => {}); }
await b.close(); srv.close && srv.close();
console.log(failed ? `\n${failed} navigation checks FAILED` : "\nAll navigation checks passed");
process.exit(failed ? 1 : 0);
