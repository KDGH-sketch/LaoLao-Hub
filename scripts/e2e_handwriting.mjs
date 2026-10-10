// Browser tests of the handwriting system in DEMO mode (Supabase is never contacted): learner activity with real
// mouse and touch input, demonstration rules, scoring, progress, admin Stroke Editor and Preview/Test, layouts.
// Run: node scripts/e2e_handwriting.mjs   (Chrome or Edge required)
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
  if (!cond){ failed++; await b.screenshot(path.join(SHOTS, `fail-hw-${section}-${name}`.replace(/[^\w.-]+/g, "_").slice(0, 110) + ".png")).catch(() => {}); }
};
const step = s => { section = s; console.log("\n" + s); };
const J = JSON.stringify;
const text = () => b.eval(`document.body.innerText`);
const jsErrors = () => b.consoleLog.filter(l => /^exception|^error/.test(l) && !/youtube|ytimg|googlevideo|favicon|net::ERR|Failed to load resource/i.test(l));
const click = (sel, re) => b.eval(`(() => { const el = [...document.querySelectorAll(${J(sel)})].find(e => ${re}.test((e.innerText || e.textContent || "").trim()) || ${re}.test(e.getAttribute("aria-label") || "")); if (el && !el.disabled){ el.scrollIntoView({block:"center"}); el.click(); return true; } return false; })()`);

async function login(p, email){
  await b.eval(`try { localStorage.removeItem("laolao.demo.session"); localStorage.setItem("xuelu.lang","en"); } catch(e){}`).catch(() => {});
  await b.goto(srv.base + p);
  await b.waitFor(`!!document.querySelector("#em") || !!document.querySelector(".app")`, 90000);
  if (!(await b.eval(`!!document.querySelector(".app")`))){
    await b.eval(`(() => { const e = document.querySelector("#em"), p = document.querySelector("#pw"); e.value = ${J(email)}; p.value = "demo1234"; (e.form || p.form).requestSubmit(); })()`);
    await b.waitFor(`!!document.querySelector(".app")`, 30000);
  }
  await sleep(700);
  // checks below read English texts
  if (p === "/") await b.eval(`(async () => { const c = await import("/js/learner/core.js"); c.setPref("uiLang", "en"); })()`).catch(() => {});
}
const openHw = async (id = null) => { await b.eval(`(async () => { const m = await import("/js/learner/main.js"); m.go("handwriting", ${J(id ? { id } : {})}); })()`); await sleep(900); };
// template strokes of the character on screen, and the canvas position on the page
const tplOf = ch => b.eval(`(async () => { const { A } = await import("/js/learner/core.js"); const c = Object.values(A.byType.characters).find(x => x.char === ${J(ch)}); return c && c.handwriting ? c.handwriting.strokes.map(s => s.points) : null; })()`);
const rect = (i = 0) => b.eval(`(() => { const el = document.querySelectorAll(".hwp-ink")[${i}]; el.scrollIntoView({ block: "center" }); const r = el.getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; })()`);
// draw one stroke through normalised points with the mouse (pointerType "mouse") or a finger (pointerType "touch")
async function drawStroke(pts, kind = "mouse", jitter = 0, padIndex = 0){
  const r = await rect(padIndex);
  const P = p => ({ x: r.x + (p[0] + (Math.random() - 0.5) * jitter) * r.w, y: r.y + (p[1] + (Math.random() - 0.5) * jitter) * r.h });
  const dense = []; for (let i = 0; i < pts.length; i++){ dense.push(pts[i]); if (i < pts.length - 1) for (let k = 1; k < 3; k++) dense.push([pts[i][0] + (pts[i + 1][0] - pts[i][0]) * k / 3, pts[i][1] + (pts[i + 1][1] - pts[i][1]) * k / 3]); }
  if (kind === "touch"){
    const tp = p => [{ x: P(p).x, y: P(p).y, id: 1, radiusX: 4, radiusY: 4, force: 0.5 }];
    await b.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: tp(dense[0]) });
    for (const p of dense.slice(1)) await b.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: tp(p) });
    await b.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  } else {
    const a = P(dense[0]);
    await b.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: a.x, y: a.y });
    await b.send("Input.dispatchMouseEvent", { type: "mousePressed", x: a.x, y: a.y, button: "left", buttons: 1, clickCount: 1 });
    for (const p of dense.slice(1)){ const q = P(p); await b.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: q.x, y: q.y, button: "left", buttons: 1 }); }
    const z = P(dense[dense.length - 1]);
    await b.send("Input.dispatchMouseEvent", { type: "mouseReleased", x: z.x, y: z.y, button: "left", buttons: 0, clickCount: 1 });
  }
  await sleep(250);
}
const fbText = () => b.eval(`(document.querySelector(".hw-fb")||{}).innerText || ""`);
const watchDemo = async () => { await click(".hw-tools button", /Show stroke order|Show again/); await b.waitFor(`/Your turn/.test((document.querySelector(".hw-fb")||{}).innerText||"")`, 20000); };

try {
  step("learner: activity with mouse input");
  await login("/", "learner@demo.laolao");
  await openHw();
  await ok(await b.eval(`document.querySelectorAll(".hwh-tile").length >= 33 && document.querySelectorAll(".hwh-tile .hwh-tpl").length >= 3`), "handwriting sections list the letters; letters with a stroke template are marked");
  await b.eval(`[...document.querySelectorAll(".hwh-tile")].find(x => x.querySelector(".hwh-glyph").textContent === "ກ").click()`); await sleep(900);
  await ok(await b.eval(`document.querySelector(".hwp").classList.contains("locked")`) && /Watch the stroke order first/.test(await fbText()), "canvas is locked until the demonstration is watched");
  const ko = await tplOf("ກ");
  await ok(Array.isArray(ko) && ko.length === 1, "the first character has a stroke template (demo sample)");
  const t0 = Date.now(); await watchDemo();
  await ok(Date.now() - t0 > 600, "the demonstration plays before drawing (" + (Date.now() - t0) + " ms)");
  await ok(!(await b.eval(`document.querySelector(".hwp").classList.contains("locked")`)), "after the demonstration the canvas is unlocked");
  await ok(await b.eval(`[...document.querySelectorAll(".hw-tools button")].find(x => /Demonstration watched/.test(x.innerText)).disabled`), "one demonstration only: the replay button is disabled");
  await drawStroke(ko[0].slice().reverse(), "mouse", 0.01);
  await ok(/direction/i.test(await fbText()), "reversed stroke (mouse): 'check the direction' feedback");
  await ok(await b.eval(`document.querySelector(".hw-steps span").classList.contains("cur")`), "strict mode: the wrong stroke is not accepted");
  await drawStroke(ko[0], "mouse", 0.012);
  await b.waitFor(`!!document.querySelector(".hw-score")`, 5000).catch(() => {});
  await ok(await b.eval(`!!document.querySelector(".hw-score")`), "correct stroke: character finished, score shown");
  const score = await b.eval(`+document.querySelector(".hw-score b").textContent`);
  await ok(score >= 70 && score < 100 && /Passed/.test(await text()), "score reflects the direction mistake but passes (" + score + ")");
  await ok(/Direction/.test(await text()) && /Stroke order/.test(await text()), "per-component breakdown is shown");
  const prog = await b.eval(`(async () => { const { A } = await import("/js/learner/core.js"); return A.prog.handwriting; })()`);
  const key = Object.keys(prog || {})[0];
  await ok(key && prog[key].attempts === 1 && prog[key].best === score && prog[key].errors.direction === 1, "attempt saved to progress (attempts, best, errors)");
  const ev = await b.eval(`(async () => { const { getApi } = await import("/js/api/index.js"); const api = await getApi(); const u = api.auth.current(); await new Promise(r => setTimeout(r, 400)); return (await api.db.list("progress/" + u.uid + "/events")).filter(e => e.type === "handwriting"); })()`);
  await ok(ev.length === 1 && ev[0].strokes.length === 1 && ev[0].score === score, "attempt saved to history with per-stroke results");
  await b.screenshot(path.join(SHOTS, "hw-learner-desktop-result.png"));

  step("learner: retry and multi-stroke order (touch input)");
  await click(".hw-tools button", /Try again/); await sleep(400);
  await ok(!(await b.eval(`document.querySelector(".hwp").classList.contains("locked")`)) && /Your turn/.test(await fbText()), "retry: drawing continues without replaying the demonstration");
  await b.send("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 1 });
  await openHw((await b.eval(`(async () => { const { A } = await import("/js/learner/core.js"); return Object.values(A.byType.characters).find(x => x.char === "ແ").id; })()`)));
  const ae = await tplOf("ແ");
  await watchDemo();
  await drawStroke(ae[1], "touch", 0.01);
  await ok(/Wrong stroke order: that was stroke 2\. Draw stroke 1 first/.test(await fbText()), "touch: right stroke first → 'that was stroke 2, draw stroke 1 first'");
  await drawStroke(ae[0], "touch", 0.01); await drawStroke(ae[1], "touch", 0.01);
  await b.waitFor(`!!document.querySelector(".hw-score")`, 5000).catch(() => {});
  await ok(await b.eval(`!!document.querySelector(".hw-score")`), "touch: two-stroke character completed");
  await b.send("Emulation.setTouchEmulationEnabled", { enabled: false });

  step("learner: Practice → Write and the word sheet use the engine");
  await b.eval(`(async () => { const m = await import("/js/learner/main.js"); m.go("practice", { type: "write" }); })()`); await sleep(1500);
  await ok(await b.eval(`!!document.querySelector(".quiz .hwp")`), "Practice → Write shows a writing question (it produced none before)");
  const qChar = await b.eval(`document.querySelector(".quiz .hwp-glyph").textContent`);
  const qTpl = await tplOf(qChar);
  await ok(Array.isArray(qTpl), "the question's character has a stroke template (" + qChar + ")");
  await click(".quiz button", /Show stroke order/);
  await b.waitFor(`/Your turn/.test((document.querySelector(".quiz .hw-fb")||{}).innerText||"")`, 20000);
  for (const st of qTpl) await drawStroke(st, "mouse", 0.008);
  await b.waitFor(`/\/ 100/.test(document.querySelector(".quiz").innerText)`, 6000).catch(() => {});
  await ok(/\/ 100/.test(await b.eval(`document.querySelector(".quiz").innerText`)), "the question is checked by the engine (score shown), not self-graded");
  await b.eval(`(async () => { const w = await import("/js/shared/widgets.js"); w.openWord("ກ"); })()`); await sleep(900);
  await ok(await b.eval(`!!document.querySelector(".hw-box .hwp")`), "word sheet: stroke order drawn from the template (the dead Chinese library is gone)");
  await b.eval(`document.querySelectorAll(".scrim,.sheet").forEach(e => e.remove())`);

  step("learner: layouts");
  for (const [w, h, name] of [[390, 844, "phone"], [844, 390, "phone landscape"], [768, 1024, "tablet"]]){
    await b.viewport(w, h, w < 900); await b.eval(`import("/js/learner/main.js").then(m => m.go("handwriting", { sec: "consonants", ch: "ກ" }))`); await sleep(900);
    const m = await b.eval(`(() => { const r = document.querySelector(".hwp").getBoundingClientRect(); return { w: r.width, h: r.height, fits: document.documentElement.scrollWidth <= innerWidth + 1 }; })()`);
    await ok(Math.abs(m.w - m.h) < 2 && m.w > 200 && m.fits, `${name}: square canvas ${Math.round(m.w)}×${Math.round(m.h)}, no horizontal scrolling`);
    if (name === "phone") await b.screenshot(path.join(SHOTS, "hw-learner-phone.png"));
  }
  await b.viewport(1366, 900, false);
  await b.eval(`document.documentElement.setAttribute("data-theme","night")`); await b.eval(`import("/js/learner/main.js").then(m => m.go("handwriting", { sec: "consonants", ch: "ກ" }))`); await sleep(900);
  await b.screenshot(path.join(SHOTS, "hw-learner-night.png"));
  await b.eval(`document.documentElement.setAttribute("data-theme","day")`);

  step("admin: Stroke Editor, Preview/Test, rules, animation, publish");
  await login("/admin/", "admin@demo.laolao");
  await b.eval(`[...document.querySelectorAll(".side .nav-btn")].find(e => /Script & Handwriting/.test(e.innerText)).click()`); await sleep(1200);
  await ok(/Sample \(not official\)/.test(await text()) && /No template/.test(await text()), "character list shows template status (sample / none)");
  const target = await b.eval(`[...document.querySelectorAll(".tbl tbody tr")].find(r => /No template/.test(r.innerText) && /char-ຄ/.test(r.innerText)) ? "char-ຄ" : null`);
  await ok(target === "char-ຄ", "ຄ has no template yet");
  await b.eval(`[...document.querySelectorAll(".tbl tbody tr")].find(r => /char-ຄ/.test(r.innerText)).click()`); await sleep(1200);
  await ok(await b.eval(`!!document.querySelector(".hwp") && /No strokes yet/.test(document.body.innerText)`), "Stroke Editor opens with an empty template");
  // the Pen panel is under the Stroke editor too: a shaky mouse stroke becomes a smooth template stroke
  await ok(await b.eval(`!!document.querySelector(".hw-act .hw-pen")`), "the Stroke editor has the Pen panel (smoothing and size)");
  const setSmooth = v => b.eval(`(() => { const d = document.querySelector(".hw-act .hw-pen"); d.open = true; const r = d.querySelector("input[type=range]"); r.value = "${v}"; r.dispatchEvent(new Event("input", { bubbles: true })); })()`);
  const tplWobble = () => b.eval(`import("/js/shared/handwriting/smooth.js").then(m => { const t = document.querySelector(".hw-act .hwp").__pad.template; const s = t && t.strokes[t.strokes.length - 1]; return s ? m.wobble(s.points) : -1; })`);
  const WAVE = Array.from({ length: 14 }, (_, i) => [0.2 + 0.6 * i / 13, 0.5 + 0.15 * Math.sin(i / 13 * Math.PI)]);
  await setSmooth(0); await drawStroke(WAVE, "mouse", 0.03); const wRaw = await tplWobble();
  await b.eval(`[...document.querySelectorAll(".hwe-item")].pop().querySelector('[title="Delete"]').click()`); await sleep(150);
  await setSmooth(10); await drawStroke(WAVE, "mouse", 0.03); const wSm = await tplWobble();
  await b.eval(`[...document.querySelectorAll(".hwe-item")].pop().querySelector('[title="Delete"]').click()`); await sleep(150);
  await ok(wRaw > 0 && wSm >= 0 && wSm < wRaw * 0.5, "with smoothing at 10 a shaky mouse stroke is saved smooth (wobble " + wRaw.toFixed(2) + " → " + wSm.toFixed(2) + ")");
  await setSmooth(5);
  const A1 = [[0.30,0.36],[0.36,0.30],[0.30,0.26],[0.26,0.32],[0.30,0.38],[0.35,0.62],[0.36,0.80]], A2 = [[0.36,0.30],[0.52,0.20],[0.68,0.30],[0.70,0.55],[0.70,0.80]], A3 = [[0.2,0.9],[0.8,0.9]];
  const items = () => b.eval(`document.querySelectorAll(".hwe-item").length`);
  const itemBtn = (i, title) => b.eval(`[...document.querySelectorAll(".hwe-item")][${i}].querySelector('[title="${title}"]').click()`);
  await drawStroke(A1, "mouse"); await drawStroke(A2, "mouse");
  await ok(await items() === 2, "admin draws two strokes: both listed in order");
  await drawStroke(A3, "mouse");
  await itemBtn(2, "Delete"); await sleep(200);
  await ok(await items() === 2, "delete a stroke");
  await click(".row button", /^Undo$/); await sleep(200);
  await ok(await items() === 3, "undo brings it back");
  await click(".row button", /^Redo$/); await sleep(200);
  await ok(await items() === 2, "redo removes it again");
  const lenOf = i => b.eval(`[...document.querySelectorAll(".hwe-item")][${i}].querySelector(".hwe-meta span").innerText`);
  const before = await lenOf(0);
  await itemBtn(1, "Move up"); await sleep(200);
  await ok((await lenOf(1)) === before, "reorder: stroke 2 moved up (the old first stroke is now second)");
  await itemBtn(1, "Move up"); await sleep(200);
  await click(".tabs button", /Scoring & rules/); await sleep(300);
  await b.eval(`(() => { const f = [...document.querySelectorAll(".field")].find(x => /Pass score/.test(x.innerText)); const i = f.querySelector("input"); i.value = "60"; i.dispatchEvent(new Event("input", { bubbles: true })); })()`);
  await click(".tabs button", /Preview \/ Test/); await sleep(500);
  await ok(await b.eval(`document.querySelectorAll(".hwp").length === 2`), "Preview/Test opens a second canvas");
  await drawStroke(A1, "mouse", 0.01, 1); await drawStroke(A2, "mouse", 0.01, 1);
  await b.waitFor(`/Passed|Not passed/.test(document.querySelector(".hw-side").innerText)`, 5000).catch(() => {});
  await ok(/Passed/.test(await b.eval(`document.querySelector(".hw-side").innerText`)) && /start 0\.\d+/.test(await text()), "Preview/Test: drawing the template passes, with measurements shown");
  await click(".row button", /Test again/); await sleep(300);
  await drawStroke(A2, "mouse", 0, 1);
  await ok(/Wrong order: that was stroke 2/.test(await text()), "Preview/Test: wrong order is detected");
  // GIF upload: a real 2-frame GIF with delays of 0.5 s + 0.3 s
  await click(".tabs button", /Animation/); await sleep(300);
  await b.eval(`(() => { const hex = "47494638396101000100800000000000ffffff21f90400320000002c000000000100010000020244010021f904001e0000002c00000000010001000002024401003b";
    const bytes = new Uint8Array(hex.match(/../g).map(x => parseInt(x, 16))); const f = new File([bytes], "demo.gif", { type: "image/gif" });
    const dt = new DataTransfer(); dt.items.add(f); const inp = document.querySelector('input[type=file][accept*="gif"]'); inp.files = dt.files; inp.dispatchEvent(new Event("change")); })()`);
  await b.waitFor(`/Uploaded animation/.test(document.body.innerText)`, 8000).catch(() => {});
  await ok(/Uploaded animation/.test(await text()) && /0\.8 s/.test(await text()), "GIF upload: accepted, its length read from the file (0.8 s)");
  await b.eval(`(() => { const f = new File([new Uint8Array([1,2,3,4,5,6,7,8,9,10,11,12])], "x.gif", { type: "image/gif" }); const dt = new DataTransfer(); dt.items.add(f); const inp = document.querySelector('input[type=file][accept*="gif"]'); inp.files = dt.files; inp.dispatchEvent(new Event("change")); })()`);
  await sleep(500);
  await ok(/does not match its type/.test(await text()), "a fake GIF (wrong bytes) is refused");
  await click(".row button", /Use generated animation/); await sleep(200);
  await click(".row button", /Save & publish/); await sleep(1500);
  const saved = await b.eval(`(async () => { const st = await import("/js/admin/state.js"); return await st.S.api.db.get("characters/char-ຄ"); })()`);
  await ok(saved.status === "published" && saved.handwriting.strokes.length === 2 && saved.handwriting.rules.passScore === 60 && saved.version >= 2, "saved: 2 strokes, rules, published, new version");
  await b.eval(`[...document.querySelectorAll(".topbar button")].find(e => /Publish now/.test(e.innerText)).click()`); await sleep(2500);
  await b.screenshot(path.join(SHOTS, "hw-admin-editor.png"));

  step("learner sees the new template; drafts stay hidden");
  await b.eval(`(async () => { const st = await import("/js/admin/state.js"); const api = st.S.api; await api.db.update("characters/char-ຈ", { status: "draft" }); const { buildBundles } = await import("/js/shared/content.js"); await buildBundles(api, "test"); await api._flush(); })()`);
  await login("/", "learner@demo.laolao");
  await openHw("char-ຄ");
  await ok(!(await b.eval(`/Practice only/.test(document.querySelector(".hw-side").innerText)`)) && /Strokes: 2/.test(await text()), "ຄ is now a checked activity with 2 strokes");
  await b.eval(`import("/js/learner/main.js").then(m => m.go("handwriting", { sec: "consonants" }))`); await sleep(800);
  await ok(!(await b.eval(`!![...document.querySelectorAll(".hwh-tile")].find(x => x.querySelector(".hwh-glyph").textContent === "ຈ")?.querySelector(".hwh-tpl")`)), "a draft character's stroke template is not sent to learners (ຈ is practised by shape only)");

  step("admin roles");
  await login("/admin/", "reviewer@demo.laolao");
  await b.eval(`(async () => { const st = await import("/js/admin/state.js"); st.go("handwritingEditor", { id: "char-ຄ" }); })()`); await sleep(1200);
  await ok(/Read-only/.test(await text()) && !(await b.eval(`[...document.querySelectorAll("button")].some(x => /Save & publish/.test(x.innerText))`)), "reviewer: read-only editor (can view and test, no save)");
  await login("/admin/", "support@demo.laolao");
  await ok(!(await b.eval(`[...document.querySelectorAll(".side .nav-btn")].some(e => /Script & Handwriting/.test(e.innerText))`)), "support admin: no handwriting menu");

  await ok(jsErrors().length === 0, "no JavaScript errors" + (jsErrors().length ? ": " + jsErrors().slice(0, 3).join(" | ") : ""));
} catch(e){
  failed++; console.log("  FAIL " + section + ": " + e.message);
  await b.screenshot(path.join(SHOTS, "fail-hw-exception.png")).catch(() => {});
} finally {
  await b.close(); srv.close();
}
console.log(failed ? `\n${failed} browser check(s) failed` : "\nAll handwriting browser checks passed");
process.exit(failed ? 1 : 0);
