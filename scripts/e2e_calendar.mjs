// The Lao life calendar on the welcome page, in DEMO mode (js/learner/welcome-calendar.js, docs/WELCOME.md):
// placed right after the festival calendar with a menu link; "Today in Laos"; month navigation; filters by kind; a day
// with events lists them; Explore opens the event sheet (story, why it matters, good to know, words, previous / next,
// .ics, and the way into the app); a new event made in the admin appears once published; phone and Night without
// sideways scroll; the admin form exists. Independent of today's date.
// Run: node scripts/e2e_calendar.mjs   (Chrome or Edge required)
import fs from "fs";
import path from "path";
import { launch, sleep } from "./lib/cdp.mjs";
import { startDemoServer, ROOT } from "./lib/demo-server.mjs";

const SHOTS = path.join(ROOT, "e2e-screenshots"); fs.mkdirSync(SHOTS, { recursive: true });
const srv = await startDemoServer();
const b = await launch({ width: 1366, height: 900 });
const J = JSON.stringify;
let failed = 0;
const ok = (c, m, d) => { console.log((c ? "  PASS " : "  FAIL ") + m + (!c && d !== undefined ? "  → " + J(d).slice(0, 300) : "")); if (!c) failed++; };
const step = s => console.log("\n" + s);
const errors = () => b.consoleLog.filter(l => /^exception|^error/.test(l) && !/favicon|net::ERR|Failed to load resource|youtube/i.test(l));
const api = expr => b.eval(`(async () => { const { getApi } = await import("/js/api/index.js"); const api = await getApi(); const C = await import("/js/shared/content.js"); ${expr} })()`);
const publish = () => api(`await C.buildBundles(api, "e2e"); await api._flush(); return true;`);
async function visitor(){
  await b.eval(`try { localStorage.removeItem("laolao.demo.session"); localStorage.setItem("xuelu.lang","en"); } catch(e){}`).catch(() => {});
  await b.goto(srv.base + "/?r=" + Date.now()); await b.waitFor(`!!document.querySelector("#w-lifecal")`, 90000); await sleep(2800);
}
const title = () => b.eval(`document.querySelector(".wl-cal-mt span").innerText`);
const sheetOpen = () => b.eval(`!!document.querySelector(".wl-evdlg")?.open`);
// move the calendar to a month (0-11) of a year with the arrows
async function goMonth(y, m){
  const now = new Date(), diff = (y - now.getFullYear()) * 12 + (m - now.getMonth());
  await b.eval(`document.querySelector(".wl-cal-todaybtn").click()`); await sleep(150);
  for (let i = 0; i < Math.abs(diff); i++){ await b.eval(`document.querySelectorAll(".wl-cal-arrow")[${diff > 0 ? 1 : 0}].click()`); await sleep(60); }
  await sleep(300);
}

try {
  step("the section and its menu link");
  await b.goto(srv.base + "/"); await b.waitFor(`!!document.querySelector("#em") || !!document.querySelector(".app")`, 60000);
  await visitor();
  ok(await b.eval(`document.querySelector("#w-festivals")?.nextElementSibling?.id === "w-lifecal"`), "the life calendar comes right after the festival calendar");
  ok(await b.eval(`[...document.querySelectorAll(".wl-links [data-scroll]")].some(x => x.dataset.scroll === "lifecal" && /Calendar/.test(x.innerText))`), "the top menu has a Calendar link");
  const now = new Date();
  ok(new RegExp(now.toLocaleString("en-GB", { month: "long" })).test(await title()) && /Today in Laos/i.test(await b.eval(`document.querySelector(".wl-cal-today").innerText`)), "it opens on this month, with 'Today in Laos'");
  ok(await b.eval(`!!document.querySelector(".wl-cal-d.today")`), "today is marked on the calendar");
  ok(await b.eval(`document.querySelectorAll(".wl-cal-d .wl-moon.full").length >= 1`), "the full moon (a Buddhist holy day) is marked");

  step("months, filters and days");
  const y = now.getMonth() > 3 ? now.getFullYear() + 1 : now.getFullYear();
  await goMonth(y, 3);
  ok(/April/.test(await title()) && /Boun Pi Mai/.test(await b.eval(`document.querySelector(".wl-cal-list").innerText`)), `April ${y}: Boun Pi Mai is listed`);
  ok(await b.eval(`[14,15,16].every(n => { const d = [...document.querySelectorAll(".wl-cal-d")].find(x => x.querySelector(".wl-cal-n")?.innerText === String(n)); return d && d.matches("button.has"); })`), "14, 15 and 16 April are marked");
  ok(/Hot season/.test(await b.eval(`document.querySelector(".wl-cal-seasons").innerText`)), "the season of the month is shown (Hot season)");
  await b.eval(`[...document.querySelectorAll(".wl-cal-filters button")].find(x => /Holidays/.test(x.innerText)).click()`); await sleep(300);
  ok(!/Boun Pi Mai/.test(await b.eval(`document.querySelector(".wl-cal-list").innerText`)), "the Holidays filter hides festivals");
  await b.eval(`[...document.querySelectorAll(".wl-cal-filters button")].find(x => /Everything/.test(x.innerText)).click()`); await sleep(300);
  await b.eval(`[...document.querySelectorAll("button.wl-cal-d")].find(x => x.querySelector(".wl-cal-n").innerText === "15").click()`); await sleep(300);
  const day = await b.eval(`document.querySelector(".wl-cal-lh h3").innerText`);
  ok(/15 April/.test(day) && /Boun Pi Mai/.test(await b.eval(`document.querySelector(".wl-cal-list").innerText`)) && await b.eval(`document.querySelectorAll(".wl-cal-list .wl-cal-ev").length === 1`), "choosing a day lists that day's events", day);
  await b.eval(`[...document.querySelectorAll(".wl-cal-lh .wl-linkbtn")][0].click()`); await sleep(200);
  ok(/In April/.test(await b.eval(`document.querySelector(".wl-cal-lh h3").innerText`)), "'Show the whole month' goes back to the month");
  ok(/Tak Bat/.test(await b.eval(`document.querySelector(".wl-cal-always").innerText`)) && /Baci/.test(await b.eval(`document.querySelector(".wl-cal-always").innerText`)), "everyday customs are listed (Tak Bat, Baci)");

  step("the event sheet");
  await b.eval(`[...document.querySelectorAll(".wl-cal-go")].find(x => /Pi Mai/.test(x.getAttribute("aria-label"))).click()`); await sleep(800);
  const sheet = await b.eval(`document.querySelector(".wl-evdlg").innerText`);
  ok(await sheetOpen() && /The story/.test(sheet) && /Why it matters today/.test(sheet) && /Good to know/.test(sheet) && /Words to know/.test(sheet), "Explore opens the sheet: story, why it matters, good to know, words");
  ok(/14 April/.test(sheet) && /Add to my calendar/.test(sheet), "with its dates and 'Add to my calendar'");
  const ics = await b.eval(`(async () => { let got = ""; const orig = URL.createObjectURL; URL.createObjectURL = blob => { blob.text().then(t => got = t); return orig.call(URL, blob); };
    [...document.querySelectorAll(".wl-evdlg button")].find(x => /Add to my calendar/.test(x.innerText)).click(); await new Promise(r => setTimeout(r, 300)); URL.createObjectURL = orig; return got; })()`);
  ok(/BEGIN:VCALENDAR/.test(ics) && /DTSTART;VALUE=DATE:\d{4}0414/.test(ics) && /RRULE:FREQ=YEARLY/.test(ics) && /SUMMARY:Boun Pi Mai/.test(ics), "the .ics file has the date, repeats yearly and is named", ics.slice(0, 120));
  const first = await b.eval(`document.querySelector("#wl-ev-title").innerText`);
  ok(!(await b.eval(`!!document.querySelector(".wl-ev-nav")`)), "a month with one dated event has no previous / next");
  await b.eval(`document.querySelector(".wl-evdlg .wl-ev-word")?.click()`); await sleep(200);
  await b.send("Input.dispatchKeyEvent", { type: "keyDown", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 }); await b.send("Input.dispatchKeyEvent", { type: "keyUp", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 }); await sleep(500);
  ok(!(await sheetOpen()), "Esc closes the sheet");
  await goMonth(y, 4);
  await b.eval(`document.querySelector(".wl-cal-evs .wl-cal-go").click()`); await sleep(700);
  const t1 = await b.eval(`document.querySelector("#wl-ev-title").innerText`);
  await b.eval(`[...document.querySelectorAll(".wl-ev-nav button")][1].click()`); await sleep(300);
  const t2 = await b.eval(`document.querySelector("#wl-ev-title").innerText`);
  ok(t1 !== t2 && /^2 \/ \d+$/.test(await b.eval(`document.querySelector(".wl-ev-nav span").innerText`)), `May: Next moves to the following event (${t1} → ${t2})`);
  await b.eval(`document.querySelector(".wl-evdlg .wl-x").click()`); await sleep(500);
  await goMonth(now.getFullYear(), now.getMonth());
  await b.eval(`document.querySelector(".wl-cal-feature, .wl-cal-go").click()`); await sleep(700);
  ok(await sheetOpen() && first.length > 0, "the 'Today in Laos' card opens its event too");
  await b.eval(`[...document.querySelectorAll(".wl-evdlg button")].find(x => /Learn the words/.test(x.innerText)).click()`); await sleep(900);
  ok(!(await sheetOpen()) && await b.eval(`document.querySelector("#wl-dlg").open && document.querySelector("#wl-tab-up").getAttribute("aria-selected") === "true" && /learn the Lao words for/.test(document.querySelector(".wl-msg").innerText)`),
    "'Learn the words with LaoLao' opens Create account with a note about the event");
  await b.eval(`document.querySelector("#wl-dlg .wl-x").click()`); await sleep(500);
  await b.screenshot(path.join(SHOTS, "calendar-desktop.png"));

  step("a new event from the admin");
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  await api(`await api.db.set("events/e2e-today", { status:"published", access:"public", order:0, kind:"culture", when:"date", start:${J(today)}, title:{ en:"E2E Market Day" }, laoName:"ມື້ຕະຫຼາດ", summary:{ en:"A test event for today." }, history:{ en:"Story." }, relevance:{ en:"Why." }, tip:{ en:"Tip." }, words:[] }); await api._flush(); return true;`);
  await publish(); await visitor();
  ok(/E2E Market Day/.test(await b.eval(`document.querySelector(".wl-cal-list").innerText`)), "a published event appears on the calendar");
  ok(await b.eval(`/E2E Market Day/.test(document.querySelector(".wl-cal-d.today")?.getAttribute("aria-label") || "")`), "on its day");

  step("phone and Night");
  await b.viewport(390, 844, true);
  await b.eval(`try { localStorage.setItem("laolao_theme", "night"); } catch(e){}`); await visitor();
  await b.eval(`document.querySelector("#w-lifecal").scrollIntoView()`); await sleep(600);
  ok(await b.eval(`document.documentElement.scrollWidth <= innerWidth + 1`), "phone: no sideways scroll");
  await b.screenshot(path.join(SHOTS, "calendar-phone-night.png"));
  await b.eval(`document.querySelector(".wl-cal-go").click()`); await sleep(800);
  const ph = await b.eval(`(() => { const r = document.querySelector(".wl-evdlg .wl-glass-in").getBoundingClientRect(); return { b: Math.round(r.bottom), h: innerHeight, w: Math.round(r.width), iw: innerWidth }; })()`);
  ok(Math.abs(ph.b - ph.h) <= 1 && ph.w >= ph.iw - 1, "phone: the event opens as a bottom sheet", ph);
  await b.screenshot(path.join(SHOTS, "calendar-phone-sheet.png"));
  // the close button stands out: a solid light circle with a dark cross, 44 px
  const xb = await b.eval(`(() => { const x = document.querySelector(".wl-evdlg .wl-x"), r = x.getBoundingClientRect(), cs = getComputedStyle(x); return { w: Math.round(r.width), bg: cs.backgroundColor, fg: cs.color }; })()`);
  ok(xb.w >= 44 && /255, 255, 255/.test(xb.bg) && !/255, 255, 255/.test(xb.fg), "phone: the close button is a solid light circle, 44 px", xb);
  // swipe down with a finger (real touch events)
  await b.send("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 5 });
  const swipe = async (y0, y1, steps = 8) => { const x = 195;
    await b.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x, y: y0 }] });
    for (let i = 1; i <= steps; i++){ await b.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x, y: y0 + (y1 - y0) * i / steps }] }); await sleep(30); }
    await b.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] }); await sleep(700); };
  const top = await b.eval(`Math.round(document.querySelector(".wl-evdlg .wl-ev-art").getBoundingClientRect().top + 60)`);
  await swipe(top, top + 40);
  ok(await b.eval(`document.querySelector(".wl-evdlg").open`), "phone: a short pull springs back (the sheet stays)");
  await swipe(top, top + 260);
  ok(!(await b.eval(`document.querySelector(".wl-evdlg").open`)), "phone: swiping down from the top of the card (its picture) closes it");
  await b.eval(`document.querySelector(".wl-cal-go").click()`); await sleep(900);
  const mid = await b.eval(`Math.round(document.querySelector(".wl-evdlg .wl-ev-sum").getBoundingClientRect().top + 10)`);
  await swipe(mid, mid - 200);
  ok(await b.eval(`document.querySelector(".wl-evdlg").open && document.querySelector(".wl-evdlg .wl-glass-in").scrollTop > 0`), "phone: swiping up scrolls the card, it does not close");
  await b.eval(`document.querySelector(".wl-evdlg .wl-glass-in").scrollTop = 0`); await sleep(200);
  const mid2 = await b.eval(`Math.round(document.querySelector(".wl-evdlg .wl-ev-sum").getBoundingClientRect().top + 10)`);
  await swipe(mid2, mid2 + 260);
  ok(!(await b.eval(`document.querySelector(".wl-evdlg").open`)), "phone: at the top, swiping down from the middle of the card closes it too");
  await b.send("Emulation.setTouchEmulationEnabled", { enabled: false });
  await b.eval(`try { localStorage.setItem("laolao_theme", "day"); } catch(e){}`);
  await b.viewport(1366, 900, false);

  step("the admin form");
  await b.eval(`try { localStorage.removeItem("laolao.demo.session"); } catch(e){}`);
  await b.goto(srv.base + "/admin/"); await b.waitFor(`!!document.querySelector("#em") || !!document.querySelector(".app")`, 60000);
  if (!(await b.eval(`!!document.querySelector(".app")`))){ await b.eval(`(() => { const e = document.querySelector("#em"), p = document.querySelector("#pw"); e.value = "admin@demo.laolao"; p.value = "demo1234"; (e.form || p.form).requestSubmit(); })()`); await b.waitFor(`!!document.querySelector(".app")`, 30000); }
  await sleep(800);
  ok(await b.eval(`[...document.querySelectorAll(".side .nav-btn, .side button")].some(x => /Life Calendar/.test(x.innerText))`), "the admin menu has Life Calendar");
  await b.eval(`(async () => { const st = await import("/js/admin/state.js"); st.go("editor", { type:"events", id:"that-luang" }); })()`); await sleep(1800);
  const form = await b.eval(`document.querySelector("main").innerText`);
  ok(/The story/.test(form) && /Why it matters today/.test(form) && /Good to know/.test(form) && /Other years/.test(form) && /Video to watch/.test(form) && /Upload photo/.test(form), "the event form: story, why it matters, good to know, other years, video and photo");
  ok(!errors().length, "no console errors", errors());
} catch(e){ console.log("  FAIL crashed: " + (e && e.stack || e)); failed++; }

console.log(failed ? `\n${failed} calendar checks FAILED` : "\nAll calendar checks passed");
await b.close?.(); srv.close?.();
process.exit(failed ? 1 : 0);
