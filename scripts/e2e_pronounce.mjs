// Pronunciation Studio in the browser (demo mode) with a fake microphone that "speaks" a synthesised voice (a WAV with
// a rising pitch): the hub (course by area and CEFR level, profile, first-language tips), a unit's three steps (learn,
// hear the difference, say it: recording, live pitch, the curve over the target, score and advice, playback), the
// accent check from start to result, the teacher's units from Admin (a new unit, a hidden built-in), Lao interface,
// phone layout and no JS errors.
// Run: node scripts/e2e_pronounce.mjs
import path from "path";
import fs from "fs";
import os from "os";
import { launch, sleep } from "./lib/cdp.mjs";
import { startDemoServer, ROOT } from "./lib/demo-server.mjs";

const SHOTS = path.join(ROOT, "e2e-screenshots"); fs.mkdirSync(SHOTS, { recursive: true });
// the fake microphone: 0.4 s quiet, 0.55 s of a voice rising 150 → 215 Hz, 1.4 s quiet (Chrome loops the file)
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), "laolao-pron-")), WAV = path.join(TMP, "voice.wav");
{ const sr = 48000, n = Math.round(sr * 2.35), pcm = Buffer.alloc(44 + n * 2); let ph = 0;
  const s0 = Math.round(sr * 0.4), s1 = s0 + Math.round(sr * 0.55);
  for (let i = 0; i < n; i++){ let v = 0; if (i >= s0 && i < s1){ const t = (i - s0) / (s1 - s0), f = 150 + 65 * t; ph += 2 * Math.PI * f / sr;
      for (let k = 1; k <= 6; k++) v += Math.sin(k * ph) / k; v *= 0.25 * Math.min(1, (i - s0) / 600, (s1 - i) / 600); }
    pcm.writeInt16LE(Math.max(-32767, Math.min(32767, Math.round(v * 32767))), 44 + i * 2); }
  pcm.write("RIFF", 0); pcm.writeUInt32LE(36 + n * 2, 4); pcm.write("WAVE", 8); pcm.write("fmt ", 12); pcm.writeUInt32LE(16, 16); pcm.writeUInt16LE(1, 20); pcm.writeUInt16LE(1, 22);
  pcm.writeUInt32LE(sr, 24); pcm.writeUInt32LE(sr * 2, 28); pcm.writeUInt16LE(2, 32); pcm.writeUInt16LE(16, 34); pcm.write("data", 36); pcm.writeUInt32LE(n * 2, 40);
  fs.writeFileSync(WAV, pcm); }
const srv = await startDemoServer();
const b = await launch({ width: 1366, height: 900, args: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream", `--use-file-for-fake-audio-capture=${WAV}`] });
let failed = 0;
const ok = (c, m, d) => { console.log((c ? "  PASS " : "  FAIL ") + m + (!c && d !== undefined ? "  → " + JSON.stringify(d).slice(0, 400) : "")); if (!c) failed++; };
const J = JSON.stringify;
async function login(email, ui = "en", base = "/"){
  await b.eval(`try { localStorage.removeItem("laolao.demo.session"); localStorage.setItem("xuelu.lang",${J(ui)}); localStorage.setItem("xuelu.admin.lang","en"); } catch(e){}`).catch(() => {});
  await b.goto(srv.base + base); await b.waitFor(`!!document.querySelector("#em") || !!document.querySelector(".app")`, 60000);
  await b.eval(`(() => { const e = document.querySelector("#em"), p = document.querySelector("#pw"); if (!e) return; e.value = ${J(email)}; p.value = "demo1234"; (e.form || p.form).requestSubmit(); })()`);
  await b.waitFor(`!!document.querySelector(".app .side .nav-btn")`, 60000); await sleep(800);
  if (base === "/") await b.eval(`import("/js/learner/core.js").then(m => { m.setPref("uiLang", ${J(ui)}); m.setPref("explainLang", ${J(ui)}); })`); await sleep(300);
}
const go = (v, p = {}) => b.eval(`import("/js/learner/main.js").then(m => m.go(${J(v)}, ${J(p)}))`).then(() => sleep(900));
const pron = () => b.eval(`import("/js/learner/core.js").then(m => JSON.parse(JSON.stringify(m.pron())))`);
const mainText = () => b.eval(`document.querySelector("main").innerText`);
// record one attempt with the fake microphone and wait for the score
async function recordOnce(){
  await b.eval(`document.querySelector(".pn-mic").click()`);
  await b.waitFor(`document.querySelector(".pn-mic")?.classList.contains("on")`, 8000).catch(() => {});
  const live = await b.waitFor(`(document.querySelector(".pn-live")?.getAttribute("points") || "").split(" ").filter(Boolean).length > 3`, 6000).then(() => true).catch(() => false);
  await b.waitFor(`!!document.querySelector(".pn-res")`, 15000).catch(() => {});
  return { live, res: await b.eval(`(() => { const r = document.querySelector(".pn-res"); return r ? { score: +r.querySelector(".pn-ring text").textContent, bars: r.querySelectorAll(".pn-bar").length,
    you: (document.querySelector(".pn-y").getAttribute("points") || "").split(" ").filter(Boolean).length, play: !document.querySelector(".pn-play .btn[disabled]") } : null; })()`) };
}

try {
  await login("learner@demo.laolao");
  console.log("the Pronunciation Studio");
  await go("speak");
  const hub = await b.eval(`({ title: document.querySelector(".pn-hero h1")?.innerText, units: document.querySelectorAll(".pn-unit").length, areas: document.querySelectorAll(".pn-area").length,
    tones: document.querySelectorAll(".pn-tonebar").length, next: !!document.querySelector(".pn-unit.next"), scales: [...document.querySelectorAll(".pn-area .chip")].map(c => c.innerText) })`);
  ok(hub.units >= 14 && hub.areas === 3 && hub.tones === 6 && hub.next, `hub: ${hub.units} units in 3 areas, 6 tone bars, the next unit marked`, hub);
  ok(hub.scales.every(s => /CEFR/.test(s)), "each area names its CEFR scale", hub.scales);
  ok(/Greet people like a local/.test(await mainText()), "the teacher's unit from the content (seed) is in the course");
  await b.screenshot(path.join(SHOTS, "pron-hub.png"));

  console.log("\na unit: learn → hear → say");
  await go("speak", { unit:"pr-six" });
  const learn = await b.eval(`({ tabs: document.querySelectorAll(".pn-tab").length, tip: document.querySelector(".pn-tip b")?.innerText, can: !!document.querySelector(".pn-can"), words: document.querySelectorAll(".pn-wordbtn").length,
    chips: [...document.querySelectorAll(".pn-wordbtn")].map(w => w.querySelector(".pn-syl small")?.innerText).join("") })`);
  ok(learn.tabs === 3 && learn.can && /English speakers/.test(learn.tip || "") && learn.words === 6, "learn: 3 steps, CEFR can-do, the tip for English speakers, 6 words", learn);
  ok(learn.chips === "123456", "the six-tone words show tones 1 2 3 4 5 6 (worked out from the spelling)", learn.chips);
  await b.eval(`import("/js/learner/core.js").then(m => m.setPref("pronL1", "zh"))`); await go("speak", { unit:"pr-six" });
  ok(/普通话/.test(await b.eval(`document.querySelector(".pn-tip").innerText`)), "first language Chinese: the tip for Chinese speakers");
  await b.eval(`import("/js/learner/core.js").then(m => m.setPref("pronL1", "en"))`);
  await go("speak", { unit:"pr-six", step:"hear" });
  for (let i = 0; i < 30; i++){ const s = await b.eval(`(() => { const q = document.querySelector(".qbox:not(.result)"); if (!q) return "done"; if (q.querySelector(".feedback")){ [...q.querySelectorAll(".qfoot .btn.primary")].pop().click(); return "next"; } q.querySelector(".opt").click(); return "opt"; })()`); if (s === "done") break; await sleep(250); }
  let p = await pron();
  ok(await b.eval(`!!document.querySelector(".qbox.result")`) && p.u["pr-six"] && p.u["pr-six"].l != null && Object.keys(p.tn).length >= 3, "hear: the minimal-pair round finishes and updates the profile (unit and tones)", p.u["pr-six"]);
  await go("speak", { unit:"pr-six", step:"say" });
  ok(await b.eval(`(document.querySelector(".pn-t").getAttribute("points") || "").split(" ").length > 5 && !!document.querySelector(".pn-chart .syl")`), "say: the target curve and the syllable with its tone are drawn before recording");
  const r1 = await recordOnce();
  ok(r1.live, "recording: the pitch is drawn live while speaking");
  ok(r1.res && r1.res.bars === 3 && r1.res.score >= 0 && r1.res.you > 10 && r1.res.play, "after recording: score ring, tone / length / clarity bars, the voice curve over the target, playback", r1.res);
  await b.screenshot(path.join(SHOTS, "pron-say.png"));
  p = await pron();
  ok(p.u["pr-six"].s != null && p.h.length >= 1 && p.h[0].w === "ກາ", "the attempt is saved (unit voice score, history)", p.h[0]);
  await b.eval(`[...document.querySelectorAll(".pn-nav .btn")].pop().click()`); await sleep(500);
  ok(/ກ່າ/.test(await b.eval(`document.querySelector(".pn-lao").innerText`)) && await b.eval(`document.querySelectorAll(".pn-dot").length === 6`), "next word, with a dot per word");
  // a two-syllable word: the chart is split per syllable
  await go("speak", { unit:"pr-words", step:"say" });
  ok(await b.eval(`document.querySelectorAll(".pn-chart .syl").length === 3 && document.querySelectorAll(".pn-chart .sep").length === 2`), "ສະບາຍດີ: the chart shows 3 syllables with their tones");

  console.log("\naccent check");
  await go("speak", { check:1 });
  for (let i = 0; i < 30; i++){ const s = await b.eval(`(() => { const q = document.querySelector(".qbox:not(.result)"); if (!q) return "done"; if (q.querySelector(".feedback")){ [...q.querySelectorAll(".qfoot .btn.primary")].pop().click(); return "next"; } q.querySelector(".opt").click(); return "opt"; })()`); if (s === "done") break; await sleep(250); }
  await b.eval(`[...document.querySelectorAll(".qbox.result .btn")].pop().click()`); await sleep(600);
  for (let k = 0; k < 4; k++){ await recordOnce(); await b.eval(`[...document.querySelectorAll(".pn-body > .row .btn.primary")].pop().click()`); await sleep(500); }
  const chk = await b.eval(`({ ring: !!document.querySelector(".pn-checkres .pn-ring"), start: [...document.querySelectorAll(".pn-body .btn.primary")].pop()?.innerText })`);
  p = await pron();
  ok(chk.ring && /Start:/.test(chk.start || "") && p.chk && p.chk.score >= 0 && p.chk.speak != null, "accent check: 8 listening items, 4 recordings, a result and where to start", { chk, saved: p.chk });
  await b.screenshot(path.join(SHOTS, "pron-check.png"));

  console.log("\nthe teacher's units (Admin → Pronunciation units)");
  await login("admin@demo.laolao", "en", "/admin/");
  ok(await b.eval(`[...document.querySelectorAll(".side .nav-btn, .side a, .side button")].some(x => /Pronunciation units/.test(x.innerText))`), "admin: the 'Pronunciation units' menu");
  await b.eval(`Promise.all([import("/js/admin/state.js"), import("/js/shared/content.js")]).then(async ([m, c]) => {
    await c.saveContent(m.S.api, "pronunciation", "pr-length", { hide:true, status:"published" }, m.S.me.uid);
    await c.saveContent(m.S.api, "pronunciation", "pr-food-words", { area:"sounds", cefr:"A2", order:9, focus:"words", title:{ en:"Food words", lo:"ຄຳສັບອາຫານ", zh:"食物词语" }, explain:{ en:"Say these food words." },
      items:[{ lao:"ເຝີ", py:"fə̌ə", en:"pho", cn:"米粉汤" }, { lao:"ລາບ", py:"lâap", en:"larb", cn:"拉布" }], pairs:[{ words:"ໄກ່ | ໄຂ່" }], status:"published" }, m.S.me.uid);
    await c.buildBundles(m.S.api, m.S.me.uid); if (m.S.api._flush) await m.S.api._flush(); })`);
  await login("learner@demo.laolao"); await go("speak");
  const units = await b.eval(`[...document.querySelectorAll(".pn-unit")].map(u => u.dataset.unit)`);
  ok(units.includes("pr-food-words") && !units.includes("pr-length"), "a unit added in Admin appears; a built-in unit hidden in Admin disappears", units);
  await go("speak", { unit:"pr-food-words", step:"hear" });
  ok(await b.eval(`[...document.querySelectorAll(".qbox .opt")].map(o => o.innerText).sort().join() === "ໄກ່,ໄຂ່"`), "the teacher's listening pair is used");

  console.log("\nLao interface, phone, night");
  await b.eval(`import("/js/learner/core.js").then(m => m.setPref("uiLang", "lo"))`); await go("speak");
  const lo = await mainText(); ok(/ສະຕູດິໂອອອກສຽງ/.test(lo) && !/pn_|undefined|null|NaN/.test(lo), "Lao: the studio is in Lao, no missing texts");
  await b.eval(`import("/js/learner/core.js").then(m => m.setPref("uiLang", "en"))`);
  for (const [w, hh] of [[360, 740], [390, 844], [768, 1024], [1366, 900], [1920, 1080]]){
    await b.viewport(w, hh, w < 900);
    for (const [v, pp] of [["speak", {}], ["speak", { unit:"pr-six" }], ["speak", { unit:"pr-words", step:"say" }]]){ await go(v, pp);
      const o = await b.eval(`({ sw: document.scrollingElement.scrollWidth, w: innerWidth })`); if (o.sw > o.w + 1) ok(false, `${w}px ${J(pp)}: no sideways scrolling`, o); }
  }
  ok(true, "no sideways scrolling at 360 / 390 / 768 / 1366 / 1920 px (hub, learn, say)");
  await b.viewport(390, 844, true); await go("speak"); await b.screenshot(path.join(SHOTS, "pron-phone.png"));
  await go("speak", { unit:"pr-six", step:"say" }); await b.screenshot(path.join(SHOTS, "pron-phone-say.png"));
  await b.eval(`document.documentElement.setAttribute("data-theme","night")`); await go("speak"); await b.screenshot(path.join(SHOTS, "pron-phone-night.png"));
  const errs = b.consoleLog.filter(l => /exception|error/i.test(l) && !/favicon|audio|speech|play\(\)|youtube|not-allowed|network|aborted|recognition/i.test(l));
  ok(errs.length === 0, "no JS errors", errs.slice(0, 4));
} catch(e){ console.log("  FAIL " + e.message); failed++; await b.screenshot(path.join(SHOTS, "pron-error.png")).catch(() => {}); }
await b.close(); srv.close && srv.close(); fs.rmSync(TMP, { recursive: true, force: true });
console.log(failed ? `\n${failed} pronunciation browser checks FAILED` : "\nAll pronunciation browser checks passed");
process.exit(failed ? 1 : 0);
