// End-to-end browser test of the video feature, in DEMO mode (no Supabase, data lives in a throwaway browser profile).
//   admin: Video Manager → Transcript dialog → paste a test transcript → save → publish
//   learner: video library → video page → player loads → transcript follows the video time → click a line → recap
// Screenshots are written to ./e2e-screenshots/. Needs Chrome or Edge and an internet connection (YouTube player).
// Run: node scripts/e2e_video.mjs
import http from "http";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { launch, sleep } from "./lib/cdp.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SHOTS = path.join(ROOT, "e2e-screenshots");
fs.mkdirSync(SHOTS, { recursive: true });

// Test data only: clearly marked lines at known times, used to check syncing (never written to Supabase).
const TEST_TRANSCRIPT = `0:00
[TEST] ສະບາຍດີ — line one
0:04
4 seconds
[TEST] line two starts at 0:04
0:09
[TEST] line three starts at 0:09
0:15
[TEST] line four starts at 0:15
0:22
[TEST] line five starts at 0:22`;
const TEST_TRANSLATION = `0:00\nHello (test translation)\n0:09\nThird line (test translation)`;

// --- static server for the repo, with an empty env-config.js so the app runs in demo mode ---
const MIME = { ".html":"text/html", ".js":"application/javascript", ".mjs":"application/javascript", ".css":"text/css", ".json":"application/json", ".svg":"image/svg+xml", ".webmanifest":"application/manifest+json", ".png":"image/png" };
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(new URL(req.url, "http://x").pathname);
  if (p === "/env-config.js"){ res.writeHead(200, { "Content-Type": "application/javascript" }); return res.end('window.__OWNER_EMAIL__ = "owner@test.local";'); }
  if (p.endsWith("/")) p += "index.html";
  const file = path.join(ROOT, p);
  if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()){ res.writeHead(404); return res.end("not found"); }
  res.writeHead(200, { "Content-Type": MIME[path.extname(file)] || "application/octet-stream", "Cache-Control": "no-store" });
  fs.createReadStream(file).pipe(res);
});
await new Promise(r => server.listen(0, "127.0.0.1", r));
const BASE = `http://127.0.0.1:${server.address().port}`;

let failed = 0;
const ok = (cond, name) => { console.log((cond ? "  PASS " : "  FAIL ") + name); if (!cond) failed++; };
const b = await launch({ width: 1366, height: 900 });
const clickText = (sel, re) => b.eval(`(() => { const el = [...document.querySelectorAll(${JSON.stringify(sel)})].find(e => ${re}.test(e.textContent)); if (el) el.click(); return !!el; })()`);

try {
  // ---------------- admin ----------------
  console.log("admin: import a transcript");
  await b.goto(`${BASE}/admin/`);
  await b.waitFor(`[...document.querySelectorAll("button")].some(e => /Super Admin/.test(e.textContent))`, 60000);
  await clickText("button", /Super Admin/);
  await b.waitFor(`!!document.querySelector(".side, nav")  && [...document.querySelectorAll("button,a")].some(e => /Video Manager/.test(e.textContent))`, 30000);
  ok(await clickText("button,a", /Video Manager/), "open Video Manager");
  await b.waitFor(`[...document.querySelectorAll("button")].some(e => e.textContent.trim() === "Transcript")`);
  ok(await b.eval(`document.body.innerText.includes("No transcript")`), "videos show a 'No transcript' badge");
  await clickText("button", /^Transcript$/);
  await b.waitFor(`!!document.querySelector(".dialog textarea")`);
  await b.eval(`(() => { const [ta, tr] = document.querySelectorAll(".dialog textarea");
    ta.value = ${JSON.stringify(TEST_TRANSCRIPT)}; ta.dispatchEvent(new Event("input"));
    tr.value = ${JSON.stringify(TEST_TRANSLATION)}; tr.dispatchEvent(new Event("input")); })()`);
  await b.waitFor(`/5 timed lines/.test(document.querySelector(".dialog").innerText)`);
  ok(true, "preview: 5 timed lines detected");
  ok(await b.eval(`/translation matched on 2 lines/.test(document.querySelector(".dialog").innerText)`), "preview: translation matched on 2 lines");
  await b.screenshot(path.join(SHOTS, "admin-transcript-dialog.png"));
  await clickText(".dialog button", /Save transcript/);
  await b.waitFor(`!document.querySelector(".dialog") && /Transcript · 5 lines/.test(document.body.innerText)`);
  ok(true, "saved: badge shows 'Transcript · 5 lines'");
  ok(await b.eval(`[...document.querySelectorAll("button")].some(e => /Publish now/.test(e.textContent))`), "header now asks to 'Publish now'");
  await b.screenshot(path.join(SHOTS, "admin-video-manager.png"));

  console.log("admin: recap editor");
  await clickText("button", /Recap & details/);
  await b.waitFor(`/Key phrases/.test(document.body.innerText)`);
  ok(await b.eval(`/Summary of the clip/.test(document.body.innerText) && /Jump to time/.test(document.body.innerText)`), "editor shows recap summary, key phrases and jump times");
  ok(await b.eval(`!!document.querySelector(".editor-side iframe, .panel iframe")`), "editor shows a video preview");
  await b.screenshot(path.join(SHOTS, "admin-recap-editor.png"));

  console.log("admin: publish");
  await clickText("button", /Publish now|publish/i);
  await b.waitFor(`!document.querySelector(".dialog")`, 30000);
  await sleep(500);

  // ---------------- learner, desktop ----------------
  console.log("learner: library");
  await b.goto(`${BASE}/`);
  await b.waitFor(`!!document.querySelector(".app")`, 30000);
  await clickText(".nav-btn", /Video/);
  await b.waitFor(`document.querySelectorAll(".vcard2").length > 0`);
  ok(await b.eval(`document.querySelectorAll(".vcard2").length >= 3`), "library shows the video cards");
  ok(await b.eval(`[...document.querySelectorAll(".vcard2")].some(c => /Transcript/.test(c.textContent))`), "card shows the Transcript badge");
  await sleep(1500);
  await b.screenshot(path.join(SHOTS, "learner-library.png"));

  console.log("learner: video page");
  await b.eval(`[...document.querySelectorAll(".vcard2")].find(c => /Transcript/.test(c.textContent)).click()`);
  await b.waitFor(`!!document.querySelector(".vd .vd-lines")`);
  ok(await b.eval(`document.querySelectorAll(".vd-line").length === 5`), "transcript lists 5 lines under the player");
  ok(await b.eval(`document.querySelectorAll(".vd-point").length > 0 && !!document.querySelector(".vd-say")`), "recap shows key phrases with play buttons");
  const ready = await b.waitFor(`(document.querySelector(".vd").__player || {}).sync === true`, 30000).catch(() => false);
  ok(ready, "YouTube player loaded and reports its time");

  if (ready){
    for (const [t, idx] of [[1, 0], [5, 1], [10, 2], [16, 3], [23, 4]]){
      await b.eval(`document.querySelector(".vd").__player.seek(${t}, false)`);
      await sleep(400);
      const st = await b.eval(`({ on: [...document.querySelectorAll(".vd-line")].findIndex(l => l.classList.contains("on")),
        cap: document.querySelector(".vd-cap-text").textContent })`);
      ok(st.on === idx && st.cap.includes(["line one","line two","line three","line four","line five"][idx]), `at ${t}s line ${idx + 1} is highlighted and shown as the caption`);
    }
    await b.eval(`document.querySelector(".vd").__player.seek(10, false)`);   // line 3 has a translation
    await sleep(400);
    const sub = await b.eval(`document.querySelector(".vd-cap-sub").textContent`);
    ok(sub.includes("Third line (test translation)"), `caption shows the translation under the line ("${sub}")`);

    // clicking a line seeks the real player
    await b.eval(`document.querySelectorAll(".vd-line")[3].click()`);
    await sleep(2500);
    const t = await b.eval(`document.querySelector(".vd").__player.time()`);
    ok(t >= 14.5 && t < 30, `clicking line 4 jumps the video to 0:15 (player time ${t.toFixed(1)}s)`);

    // real playback: time advances and the highlight follows on its own
    await b.eval(`document.querySelector(".vd").__player.seek(3, true)`);
    await sleep(4500);
    const play = await b.eval(`({ t: document.querySelector(".vd").__player.time(), on: [...document.querySelectorAll(".vd-line")].findIndex(l => l.classList.contains("on")) })`);
    ok(play.t > 3.5, `video plays (time moved from 3.0s to ${play.t.toFixed(1)}s)`);
    ok(play.on === (play.t >= 8.95 ? 2 : 1), `highlight follows playback (line ${play.on + 1} at ${play.t.toFixed(1)}s)`);
    await b.eval(`document.querySelector(".vd").__player.pause()`);
    await b.eval(`document.querySelector(".vd").__player.seek(10, false)`);
    await sleep(800);
  }
  ok(await b.eval(`document.querySelector(".vd-resume").offsetParent === null`), "\"Back to current line\" is hidden while following the video");
  await b.eval(`document.querySelector(".vd-lines").dispatchEvent(new WheelEvent("wheel", { deltaY: 200 }))`);
  ok(await b.eval(`document.querySelector(".vd-resume").offsetParent !== null`), "…and appears when the learner scrolls the transcript");
  await b.eval(`document.querySelector(".vd-resume").click()`);
  ok(await b.eval(`document.querySelector(".vd-resume").offsetParent === null`), "…and hides again after jumping back");
  const autoScrolled = await b.eval(`(() => { const box = document.querySelector(".vd-lines"), on = document.querySelector(".vd-line.on"); if (!on) return false;
    const r = on.getBoundingClientRect(), rb = box.getBoundingClientRect(); return r.top >= rb.top - 1 && r.bottom <= rb.bottom + 1; })()`);
  ok(autoScrolled, "the highlighted line is scrolled into view inside the transcript");
  await b.eval(`window.scrollTo(0, 0)`); await sleep(300);
  const lay = await b.eval(`(() => { const st = document.querySelector(".vd-stage").getBoundingClientRect(), tp = document.querySelector(".vd-transcript").getBoundingClientRect();
    return { stTop: Math.round(st.top), stBottom: Math.round(st.bottom), stW: Math.round(st.width), tpLeft: Math.round(tp.left), tpTop: Math.round(tp.top), tpBottom: Math.round(tp.bottom), vh: innerHeight }; })()`);
  ok(lay.tpLeft > lay.stTop && lay.tpLeft >= 0 && Math.abs(lay.tpTop - lay.stTop) <= 2 && Math.abs(lay.tpBottom - lay.stBottom) <= 2,
    `laptop 1366px: transcript beside the player, same height (player ${lay.stW}px wide, ${lay.stBottom - lay.stTop}px tall)`);
  ok(lay.stTop >= 0 && lay.stBottom <= lay.vh, `player, caption and transcript are all on screen without scrolling (bottom at ${lay.stBottom}px of ${lay.vh}px)`);
  await b.screenshot(path.join(SHOTS, "learner-video-desktop.png"));
  await b.eval(`window.scrollTo(0, document.body.scrollHeight)`); await sleep(500);
  ok(await b.eval(`document.querySelector(".vd-recap").getBoundingClientRect().top < innerHeight`), "recap section below the transcript");
  await b.screenshot(path.join(SHOTS, "learner-video-desktop-recap.png"));
  await b.viewport(1920, 1080);
  await b.eval(`window.scrollTo(0, 0)`); await sleep(500);
  await b.screenshot(path.join(SHOTS, "learner-video-desktop-1080p.png"));
  await b.viewport(1024, 768);
  await b.eval(`window.scrollTo(0, 0)`); await sleep(500);
  ok(await b.eval(`document.querySelector(".vd-transcript").getBoundingClientRect().top >= document.querySelector(".vd-stage").getBoundingClientRect().bottom - 1`), "tablet 1024px: transcript sits below the player");
  await b.screenshot(path.join(SHOTS, "learner-video-tablet.png"));

  // ---------------- learner, mobile ----------------
  console.log("learner: mobile layout");
  await b.viewport(390, 844, true);
  await b.eval(`window.scrollTo(0, 0)`); await sleep(800);
  ok(await b.eval(`getComputedStyle(document.querySelector(".vd-tabs")).display !== "none"`), "mobile shows Transcript / Recap tabs");
  ok(await b.eval(`getComputedStyle(document.querySelector(".vd-recap")).display === "none"`), "only the transcript panel is shown at first");
  ok(await b.eval(`document.documentElement.scrollWidth <= 391`), "no horizontal scrolling at phone width");
  ok(await b.eval(`(() => { const r = [...document.querySelectorAll(".tabbar button")].map(x => x.getBoundingClientRect().top); return r.length && r.every(t => Math.abs(t - r[0]) < 2); })()`), "bottom tab bar fits on one row");
  await b.eval(`window.scrollTo(0, 0)`); await sleep(300);
  await b.eval(`document.querySelector(".vd").__player.seek(5, false)`);
  await b.eval(`document.querySelector(".vd").__player.play()`); await sleep(3000);
  ok(await b.eval(`Math.abs(document.querySelector(".vd-stage").getBoundingClientRect().top) <= 2`), "pressing play brings the player to the top on a phone");
  await b.eval(`window.scrollBy(0, 300)`); await sleep(500);
  ok(await b.eval(`Math.abs(document.querySelector(".vd-stage").getBoundingClientRect().top) <= 2`), "player stays on screen (sticky) while scrolling on a phone");
  await b.eval(`document.querySelector(".vd").__player.pause()`);
  await b.screenshot(path.join(SHOTS, "learner-video-mobile-transcript.png"));
  await clickText(".vd-tabs button", /Recap/);
  await sleep(400);
  ok(await b.eval(`getComputedStyle(document.querySelector(".vd-recap")).display !== "none" && getComputedStyle(document.querySelector(".vd-transcript")).display === "none"`), "Recap tab switches panels");
  await b.screenshot(path.join(SHOTS, "learner-video-mobile-recap.png"));
  await b.eval(`document.querySelector(".vd-say").click()`);
  ok(true, "recap play button clickable");

  const errors = b.consoleLog.filter(l => /^exception|^error/.test(l) && !/youtube|ytimg|doubleclick|googlevideo|favicon|ERR_|net::/i.test(l));
  ok(errors.length === 0, "no JavaScript errors in the app" + (errors.length ? ":\n      " + errors.join("\n      ") : ""));
} catch(e){
  console.log("  FAIL", e.message);
  failed++;
  try { await b.screenshot(path.join(SHOTS, "failure.png")); console.log("  (screenshot: e2e-screenshots/failure.png)"); } catch(err){}
  b.consoleLog.slice(-15).forEach(l => console.log("    console:", l));
} finally {
  await b.close();
  server.close();
}
console.log(failed ? `\n${failed} check(s) FAILED` : "\nAll browser checks passed");
console.log("Screenshots: " + SHOTS);
process.exit(failed ? 1 : 0);
