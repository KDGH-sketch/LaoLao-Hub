// Watching videos on every device (demo mode, real YouTube player): the player is never covered by the top bar,
// the bar hides when scrolling down and comes back when scrolling up, a phone held sideways shows the video full
// screen, swipe / double-tap on the caption, "watch next" and the "up next" screen at the end.
// Run: node scripts/e2e_video_ux.mjs
import path from "path";
import fs from "fs";
import { launch, sleep } from "./lib/cdp.mjs";
import { startDemoServer, ROOT } from "./lib/demo-server.mjs";

const SHOTS = path.join(ROOT, "e2e-screenshots"); fs.mkdirSync(SHOTS, { recursive: true });
const srv = await startDemoServer();
const b = await launch({ width: 390, height: 844 });
let failed = 0;
const ok = (c, m, d) => { console.log((c ? "  PASS " : "  FAIL ") + m + (!c && d !== undefined ? "  → " + JSON.stringify(d).slice(0, 300) : "")); if (!c) failed++; };
const J = JSON.stringify;
const shot = n => b.screenshot(path.join(SHOTS, "video-" + n + ".png"));
const device = (w, hh, mobile = true) => b.send("Emulation.setDeviceMetricsOverride", { width: w, height: hh, deviceScaleFactor: mobile ? 2 : 1, mobile, screenOrientation: w > hh ? { type: "landscapePrimary", angle: 90 } : { type: "portraitPrimary", angle: 0 } });
const scrollTo = async y => { await b.eval(`window.scrollTo(0, ${y})`); await sleep(120); await b.eval(`window.dispatchEvent(new Event("scroll"))`); await sleep(450); };
const geo = () => b.eval(`(() => { const t = document.querySelector(".topbar").getBoundingClientRect(), s = document.querySelector(".vd-stage").getBoundingClientRect();
  return { barTop: Math.round(t.top), barBottom: Math.round(t.bottom), stageTop: Math.round(s.top), hide: document.documentElement.classList.contains("tb-hide"), y: Math.round(scrollY) }; })()`);
// three short timed lines so the caption has something to move between
const LINES = [{ start: 0, text: "ສະບາຍດີ", en: "Hello" }, { start: 6, text: "ຂອບໃຈ", en: "Thank you" }, { start: 12, text: "ລາກ່ອນ", en: "Goodbye" }];

try {
  await device(390, 844);
  await b.send("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 5 });
  await b.eval(`try { localStorage.setItem("xuelu.lang","en"); localStorage.removeItem("laolao.video.gesturehint"); localStorage.removeItem("laolao.video.watched"); } catch(e){}`).catch(() => {});
  await b.goto(srv.base + "/"); await b.waitFor(`!!document.querySelector("#em")`, 60000);
  await b.eval(`(() => { const e = document.querySelector("#em"), p = document.querySelector("#pw"); e.value = "learner@demo.laolao"; p.value = "demo1234"; (e.form || p.form).requestSubmit(); })()`);
  await b.waitFor(`!!document.querySelector(".app .topbar")`, 60000); await sleep(1000);
  if (await b.eval(`(() => { const e = [...document.querySelectorAll(".topbar .langsw button, .pmenu .langsw button")].find(x => x.textContent.trim() === "EN"); if (e && e.getAttribute("aria-pressed") !== "true"){ e.click(); return true; } return false; })()`)) await sleep(1200);
  await b.eval(`import("/js/learner/core.js").then(m => m.setPref("uiLang", "en"))`); await sleep(500);
  const vid = await b.eval(`import("/js/learner/core.js").then(m => { const vs = (m.A.B.videos || []); const v = vs[0]; if (v) v.transcript = ${J(LINES)}; return v ? { id: v.id, n: vs.length } : null; })`);
  await b.eval(`import("/js/learner/main.js").then(m => m.go("video", { id: ${J(vid && vid.id)} }))`);
  await b.waitFor(`!!document.querySelector(".vd-stage")`, 15000); await sleep(800);
  // make the page tall enough to scroll on any phone
  await b.eval(`document.querySelector(".vd").append(Object.assign(document.createElement("div"), { style: "height:1600px;order:99" }))`);

  console.log("phone: the player is never under the top bar");
  let g = await geo();
  ok(g.barTop >= 0 && g.barBottom > 0 && !g.hide, "at the top: the top bar shows", g);
  await scrollTo(700); g = await geo();
  ok(g.hide && g.barBottom <= 0, "scrolling down: the top bar slides away", g);
  ok(g.stageTop === 0, "…and the player sits at the very top of the screen (pinned)", g);
  await shot("phone-scrolled");
  await scrollTo(600); g = await geo();
  ok(!g.hide && g.barTop >= 0 && g.barBottom > 0, "scrolling up: the top bar comes back", g);
  await sleep(300); g = await geo();
  ok(g.stageTop >= g.barBottom - 1, "…and the player moves down below it: never covered (this was the bug)", g);
  await shot("phone-bar-back");
  await scrollTo(0); g = await geo();
  ok(!g.hide, "back at the top: bar shows");

  console.log("\ncaption gestures");
  await b.waitFor(`(document.querySelector(".vd").__player || {}).sync === true`, 30000).catch(() => {});
  const sync = await b.eval(`(document.querySelector(".vd").__player || {}).sync === true`);
  ok(await b.eval(`/Swipe/.test(document.querySelector(".vd-gesture-hint")?.innerText || "")`), "a one-time hint explains the gestures (touch screens)");
  if (sync){
    // the caption's position is measured right before each swipe (playing scrolls the player to the top on phones)
    const swipe = async (dx) => { const cap = await b.eval(`(() => { const r = document.querySelector(".vd-caption").getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; })()`);
      await b.send("Input.dispatchMouseEvent", { type: "mousePressed", x: cap[0], y: cap[1], button: "left", clickCount: 1 });
      for (let k = 1; k <= 5; k++) await b.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: cap[0] + dx * k / 5, y: cap[1], button: "left" });
      await b.send("Input.dispatchMouseEvent", { type: "mouseReleased", x: cap[0] + dx, y: cap[1], button: "left", clickCount: 1 }); await sleep(150); };
    const capNow = () => b.eval(`document.querySelector(".vd-cap-text").innerText`);
    // YouTube starts playing on a seek, so pause and settle on a known line before each swipe; check right after it
    const settleOn = async (t, text) => { await b.eval(`document.querySelector(".vd").__player.seek(${t}, false)`); await sleep(400);
      await b.eval(`document.querySelector(".vd").__player.pause()`); await b.waitFor(`document.querySelector(".vd-cap-text").innerText === ${J(text)}`, 4000).catch(() => {}); await sleep(1700); };
    await settleOn(1, "ສະບາຍດີ");
    await swipe(-120);
    const c1 = await capNow();
    ok(c1 === "ຂອບໃຈ", "swipe left on the caption: jumps to the next line (ຂອບໃຈ, 0:06)", c1);
    await settleOn(7, "ຂອບໃຈ");
    await swipe(120);
    const c2 = await capNow();
    ok(c2 === "ສະບາຍດີ", "swipe right: back to the previous line (ສະບາຍດີ, 0:00)", c2);
    await sleep(1200);
    ok((await capNow()) === "ສະບາຍດີ", "the caption doesn't flick back while the player catches up (stale times ignored)", await capNow());
    await b.eval(`document.querySelector(".vd").__player.pause()`);
  } else console.log("  NOTE YouTube player not available here: gesture seeking skipped");

  console.log("\nwatch next");
  const more = await b.eval(`({ panel: !!document.querySelector(".vd-more"), cards: document.querySelectorAll(".vd-more .vcard2").length, tag: document.querySelector(".vd-more .vd-upnext-tag")?.innerText, tabs: [...document.querySelectorAll(".vd-tabs button")].map(x => x.innerText) })`);
  ok(more.panel && more.cards >= 1 && /Up next/.test(more.tag || ""), "a 'Watch next' list with the next video marked 'Up next'", more);
  ok(more.tabs.join() === "Transcript,Recap,Next", "phones: a third tab 'Next'", more.tabs);
  await b.eval(`[...document.querySelectorAll(".vd-tabs button")].find(x => /Next/.test(x.innerText)).click()`); await sleep(300);
  ok(await b.eval(`getComputedStyle(document.querySelector(".vd-more")).display !== "none" && getComputedStyle(document.querySelector(".vd-transcript")).display === "none"`), "the Next tab shows the list");
  await shot("phone-next-tab");

  console.log("\nthe end of a video: up next");
  await b.eval(`document.querySelector(".vd").__upNext()`); await sleep(500);
  const up = await b.eval(`({ open: !!document.querySelector(".vd-next"), title: document.querySelector(".vd-next-t b")?.innerText, ring: document.querySelector(".vd-next-ring b")?.innerText, btns: [...document.querySelectorAll(".vd-next .btn")].map(x => x.innerText.trim()) })`);
  ok(up.open && up.title && up.btns.some(x => /Play now/.test(x)) && up.btns.some(x => /Cancel/.test(x)) && up.btns.some(x => /Replay/.test(x)), "'Up next' over the player: the next video, Play now, Cancel, Replay", up);
  await shot("phone-upnext");
  await sleep(1300);
  ok(+(await b.eval(`document.querySelector(".vd-next-ring b")?.innerText`)) < +up.ring, "the countdown runs");
  await b.eval(`[...document.querySelectorAll(".vd-next .btn")].find(x => /Cancel/.test(x.innerText)).click()`); await sleep(1500);
  ok(await b.eval(`!!document.querySelector(".vd-next") && !document.querySelector(".vd-next-ring")`), "Cancel stops the countdown (the choices stay)");
  const before = await b.eval(`location.hash + "|" + (document.querySelector(".vd-head h1")?.innerText || "")`);
  await b.eval(`[...document.querySelectorAll(".vd-next .btn")].find(x => /Play now/.test(x.innerText)).click()`);
  await b.waitFor(`!!document.querySelector(".vd-head h1") && document.querySelector(".vd-head h1").innerText !== ${J(before.split("|")[1])}`, 15000).catch(() => {});
  ok((await b.eval(`document.querySelector(".vd-head h1")?.innerText`)) !== before.split("|")[1], "Play now opens the next video");
  await b.eval(`document.querySelector(".vd").__upNext()`); await sleep(9500);
  ok(await b.eval(`!document.querySelector(".vd-next")`), "left alone, the countdown opens the next video by itself (8 s)");

  console.log("\nphone held sideways");
  await device(844, 390);
  await sleep(800);
  const land = await b.eval(`(() => { const w = document.querySelector(".vd-stage .video-embed-wrap").getBoundingClientRect();
    return { bar: getComputedStyle(document.querySelector(".topbar")).display, tabs: getComputedStyle(document.querySelector(".tabbar")).display, w: Math.round(w.width), h: Math.round(w.height), vw: innerWidth, vh: innerHeight }; })()`);
  ok(land.bar === "none" && land.tabs === "none", "landscape: the menus step aside", land);
  ok(land.w >= land.vw - 1 && land.h >= land.vh - 60, "landscape: the video fills the screen (only the caption below it)", land);
  await shot("landscape");

  console.log("\ntablet and desktop");
  await device(820, 1180); await sleep(600);
  await b.eval(`window.scrollTo(0, 0)`); await sleep(300);
  ok(await b.eval(`document.documentElement.scrollWidth <= innerWidth + 1`), "tablet: no sideways scrolling");
  await device(1366, 900, false); await sleep(700);
  await scrollTo(400); g = await geo();
  ok(!g.hide, "desktop: the top bar never hides", g);
  ok(await b.eval(`getComputedStyle(document.querySelector(".vd-more")).display !== "none" && document.querySelectorAll(".vd-more .vcard2").length >= 1`), "desktop: Watch next shows under the recap");
  await shot("desktop");
  const errs = b.consoleLog.filter(l => /exception|error/i.test(l) && !/favicon|youtube|www-widgetapi|postMessage|audio|speech|play\(\)/i.test(l));
  ok(errs.length === 0, "no JS errors", errs.slice(0, 3));
} catch(e){ console.log("  FAIL " + e.message); failed++; await shot("error").catch(() => {}); }
await b.close(); srv.close && srv.close();
console.log(failed ? `\n${failed} video checks FAILED` : "\nAll video watching checks passed");
process.exit(failed ? 1 : 0);
