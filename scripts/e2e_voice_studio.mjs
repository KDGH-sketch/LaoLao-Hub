// Voice Studio and narration, end to end in demo mode (Supabase is never contacted). Chrome's microphone is fed a
// generated WAV (silence, a 0.7 s "word", silence), so recording, auto-stop, trimming and saving are real.
//   admin: the to-do list comes from the content; record → stops by itself → Save & next → a WAV row in "audio";
//          an unsaved take asks before leaving; a sentence whose words are recorded shows "Plays from words"
//   learner: after Publish the sentence plays from the word recordings in order; word-by-word mode leaves longer gaps;
//          Lao text without audio says "coming soon", never uses a device (Thai) voice, and is reported to the admins
// Run: node scripts/e2e_voice_studio.mjs   (Chrome or Edge required)
import fs from "fs";
import os from "os";
import path from "path";
import { launch, sleep } from "./lib/cdp.mjs";
import { startDemoServer, ROOT } from "./lib/demo-server.mjs";
import { encodeWav } from "../js/shared/audio-proc.js";

const SHOTS = path.join(ROOT, "e2e-screenshots");
fs.mkdirSync(SHOTS, { recursive: true });
// the fake microphone: 0.5 s silence, a 0.7 s voiced burst, 2.5 s silence (Chrome loops it)
const rate = 48000, mic = new Float32Array(Math.round(rate * 3.7));
for (let i = 0; i < mic.length; i++){ const t = i / rate; mic[i] = t > 0.5 && t < 1.2 ? 0.35 * Math.sin(2 * Math.PI * 180 * t) * Math.sin(Math.PI * (t - 0.5) / 0.7) : 0; }
const micFile = path.join(os.tmpdir(), "laolao-fake-mic.wav");
fs.writeFileSync(micFile, encodeWav(mic, rate));

const srv = await startDemoServer();
const b = await launch({ width: 1366, height: 900, args: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream", `--use-file-for-fake-audio-capture=${micFile}`] });
let failed = 0;
const ok = async (c, m, d) => { console.log((c ? "  PASS " : "  FAIL ") + m + (!c && d !== undefined ? "  → " + JSON.stringify(d).slice(0, 300) : "")); if (!c){ failed++; await b.screenshot(path.join(SHOTS, "fail-voice-" + m.replace(/[^\w.-]+/g, "_").slice(0, 80) + ".png")).catch(() => {}); } };
const J = JSON.stringify;
const key = async k => { const code = k === " " ? "Space" : k; await b.send("Input.dispatchKeyEvent", { type: "keyDown", key: k, code, windowsVirtualKeyCode: k === " " ? 32 : k === "Enter" ? 13 : k.toUpperCase().charCodeAt(0), text: k === "Enter" ? "\r" : k }); await b.send("Input.dispatchKeyEvent", { type: "keyUp", key: k, code }); };
async function login(p, email){
  await b.eval(`try { localStorage.removeItem("laolao.demo.session"); localStorage.setItem("xuelu.admin.lang","en"); } catch(e){}`).catch(() => {});
  await b.goto(srv.base + p); await b.waitFor(`!!document.querySelector("#em") || !!document.querySelector(".app")`, 60000);
  await b.eval(`(() => { const e = document.querySelector("#em"), p = document.querySelector("#pw"); e.value = ${J(email)}; p.value = "demo1234"; (e.form || p.form).requestSubmit(); })()`);
  await b.waitFor(`!!document.querySelector(".app .side .nav-btn")`, 60000); await sleep(800);
}
const nav = async re => { await b.eval(`(() => { const el = [...document.querySelectorAll(".side .nav-btn")].find(e => ${re}.test(e.innerText)); el.click(); })()`); await sleep(1200); };
const studioText = () => b.eval(`document.querySelector(".vs-text") && document.querySelector(".vs-text").textContent`);

try {
  console.log("\nVoice Studio");
  await login("/admin/", "admin@demo.laolao");
  await nav(/Voice Studio/);
  await b.waitFor(`!!document.querySelector(".vs-rec") && document.querySelectorAll(".vs-item").length > 0`, 30000);
  const todo = await b.eval(`+document.querySelector('.vs-lists [role=tab][aria-selected=true] .vs-count').textContent`);
  await ok(todo > 20, `the to-do list is built from the content (${todo} words)`);
  await ok(!!(await studioText()) && /[຀-໿]/.test(await studioText()), "the top word is ready to record: " + await studioText());
  await ok(/Completes|Used in/.test(await b.eval(`document.querySelector(".vs-ctx").innerText`)), "it says why this word matters (sentences it is used in / completes)");
  const before = await b.eval(`document.querySelector(".kpi-row .kpi-card .vs-sub").textContent`);

  const first = await studioText();
  await key(" ");
  await b.waitFor(`document.querySelector(".vs-rec").classList.contains("is-rec")`, 5000).catch(() => {});
  await ok(await b.eval(`document.querySelector(".vs-rec").classList.contains("is-rec")`), "Space starts recording");
  await b.waitFor(`!document.querySelector(".vs-rec").classList.contains("is-rec")`, 12000).catch(() => {});
  await ok(!(await b.eval(`document.querySelector(".vs-rec").classList.contains("is-rec")`)), "it stops by itself after the word (silence)");
  await b.waitFor(`/trimmed/.test(document.querySelector(".vs-info").textContent)`, 3000).catch(() => {});
  const info = await b.eval(`document.querySelector(".vs-info").textContent`);
  const ms = parseFloat(info);
  await ok(/trimmed and evened out/.test(info) && ms > 0.5 && ms < 1.3, "the take is trimmed to the word: " + info);
  await ok(await b.eval(`(() => { const c = document.querySelector(".vs-wave"), d = c.getContext("2d").getImageData(0, 0, c.width, c.height).data; let n = 0; for (let i = 3; i < d.length; i += 4) if (d[i]) n++; return n > 500; })()`), "the waveform is drawn");
  await b.screenshot(path.join(SHOTS, "voice-studio-take.png"));

  await b.eval(`(() => { const el = [...document.querySelectorAll(".side .nav-btn")].find(e => /Dashboard/.test(e.innerText)); el.click(); })()`); await sleep(500);
  await ok(await b.eval(`!!document.querySelector(".discard-dlg:not(.out)")`), "leaving with an unsaved take asks first");
  await b.eval(`[...document.querySelectorAll(".discard-dlg button")].find(x => /Keep editing/.test(x.innerText)).click()`); await sleep(500);

  await key("Enter");
  await b.waitFor(`document.querySelector(".vs-text").textContent !== ${J(first)}`, 10000).catch(() => {});
  await ok((await studioText()) !== first, "Enter saves and moves to the next word");
  const row = await b.eval(`import("/js/admin/state.js").then(m => m.S.api.db.list("audio")).then(rows => rows.find(r => r.text === ${J(first)}))`);
  await ok(row && /^data:audio\/wav;base64,/.test(row.url) && row.status === "published" && row.qc === "needs_review" && row.type === "word" && row.durationMs > 400, "a WAV recording row is saved (published, needs review)", row && { url: String(row.url).slice(0, 30), status: row.status, qc: row.qc, durationMs: row.durationMs });
  await ok((await b.eval(`document.querySelector(".kpi-row .kpi-card .vs-sub").textContent`)) !== before, "coverage goes up: " + before + " → " + await b.eval(`document.querySelector(".kpi-row .kpi-card .vs-sub").textContent`));
  await ok(await b.eval(`/publish/i.test(document.querySelector(".vs-pub") ? document.querySelector(".vs-pub").innerText : "")`), "a bar says learners hear it after publishing");

  // a sentence plays as soon as its words are recorded: record its missing words (fast path through the same save code is the UI;
  // here the remaining words are added as rows, then the studio must show the sentence as playable)
  const target = await b.eval(`(async () => {
    const P = await import("/js/shared/audio-proc.js"), st = await import("/js/admin/state.js"), D = await import("/js/shared/dict.js"); await D.loadDict();
    const audio = await st.S.api.db.list("audio"), rec = new Set(audio.filter(a => a.url).map(a => P.normText(a.text)));
    const pats = await st.S.api.db.list("patterns"), sents = pats.flatMap(p => p.examples || []).map(x => x.zh).filter(Boolean);
    const isWord = k => !!D.dict()[k];
    const best = sents.map(s => ({ s, miss: P.missingPieces(s, k => rec.has(k), isWord) })).filter(x => x.miss.length && x.miss.length <= 6).sort((a, b) => a.miss.length - b.miss.length)[0];
    return best; })()`);
  await ok(!!target, "a sentence to complete: " + (target && target.s), target);
  const wavUrl = await b.eval(`import("/js/admin/state.js").then(m => m.S.api.db.list("audio")).then(r => r.find(x => x.url).url)`);
  await b.eval(`(async () => { const st = await import("/js/admin/state.js"), C = await import("/js/shared/content.js"), P = await import("/js/shared/audio-proc.js");
    for (const w of ${J(target.miss)}) await C.saveContent(st.S.api, "audio", "rec-" + P.textId(w), { text: w, lang: "lo", type: "word", url: ${J(wavUrl)}, status: "published", access: "free", qc: "needs_review", source: "studio" }, st.S.me.uid); })()`);
  await nav(/Dashboard/); await nav(/Voice Studio/);
  await b.waitFor(`!!document.querySelector(".vs-lists")`, 20000);
  await b.eval(`[...document.querySelectorAll(".vs-lists [role=tab]")].find(x => /Sentences/.test(x.innerText)).click()`); await sleep(300);
  await b.eval(`(() => { const s = document.querySelector(".vs-lists input[type=search]"); s.value = ${J(target.s)}; s.dispatchEvent(new Event("input", { bubbles: true })); })()`); await sleep(400);
  await ok(/Plays from words/.test(await b.eval(`document.querySelector(".vs-list").innerText`)), "the studio shows the sentence as 'Plays from words'");
  await b.screenshot(path.join(SHOTS, "voice-studio-sentences.png"));

  // publish so learners get the recordings
  await b.eval(`[...document.querySelectorAll(".topbar button")].find(x => /Publish now/.test(x.innerText)).click()`);
  await b.waitFor(`!document.querySelector(".pub-scrim") || /published|ເຜີຍແຜ່/i.test(document.body.innerText)`, 60000).catch(() => {});
  await b.waitFor(`!document.querySelector(".dialog:not(.out), .pub:not(.out)")`, 60000).catch(() => {}); await sleep(800);
  await b.eval(`document.querySelectorAll(".pub-scrim, .pub").forEach(e => e.remove())`).catch(() => {});

  console.log("\nlearner playback");
  await login("/", "learner@demo.laolao");
  await b.waitFor(`!!document.querySelector(".app")`, 30000); await sleep(1500);
  const S = await b.eval(`(async () => { const sp = await import("/js/shared/speech.js");
    window.__played = []; window.__tts = 0;
    const orig = HTMLMediaElement.prototype.play; HTMLMediaElement.prototype.play = function(){ window.__played.push({ src: this.src.slice(0, 40), at: performance.now() }); return orig.call(this); };
    if (window.speechSynthesis) speechSynthesis.speak = () => { window.__tts++; };
    return { src: sp.audioSource(${J(target.s)}), first: sp.audioSource(${J(first)}), none: sp.audioSource("ຂໍ້ຄວາມທີ່ບໍ່ມີສຽງບັນທຶກແນ່ນອນ") }; })()`);
  await ok(S.src === "stitched" && S.first === "recording", "the learner app finds the recordings (sentence: stitched, word: recording)", S);
  await b.eval(`import("/js/shared/speech.js").then(sp => sp.speak(${J(target.s)}))`);
  await b.waitFor(`window.__played.length >= 2`, 15000).catch(() => {});
  await sleep(2500);
  const played = await b.eval(`window.__played`);
  await ok(played.length >= 2 && played.every(p => p.src.startsWith("data:audio/wav")), `the sentence plays from ${played.length} word recordings in a row`, played.length);
  const gaps = played.slice(1).map((p, i) => p.at - played[i].at);
  await b.eval(`import("/js/shared/speech.js").then(sp => sp.setSpeechSettings({ wordByWord: true }))`);
  await b.eval(`window.__played = []; import("/js/shared/speech.js").then(sp => sp.speak(${J(target.s)}))`);
  await b.waitFor(`window.__played.length >= 2`, 15000).catch(() => {}); await sleep(3500);
  const played2 = await b.eval(`window.__played`), gaps2 = played2.slice(1).map((p, i) => p.at - played2[i].at);
  await ok(gaps2.length && gaps.length && Math.min(...gaps2) > Math.min(...gaps) + 250, `word-by-word leaves longer pauses (${Math.round(Math.min(...gaps))} → ${Math.round(Math.min(...gaps2))} ms between words)`);

  await b.eval(`window.__tts = 0; import("/js/shared/speech.js").then(sp => sp.speak("ຂໍ້ຄວາມທີ່ບໍ່ມີສຽງບັນທຶກແນ່ນອນ"))`); await sleep(900);
  await ok(await b.eval(`window.__tts === 0`), "Lao text without a recording never uses a device (Thai) voice");
  await ok(/coming soon|ກຳລັງຈະມາ|即将上线/i.test(await b.eval(`document.body.innerText`)), "the learner is told the audio is coming soon");
  await sleep(800);
  const req = await b.eval(`import("/js/learner/core.js").then(m => m.A.api.db.list("activity")).then(r => r.filter(x => x.type === "audio_missing").map(x => x.ref))`).catch(() => []);
  await ok(req.includes("ຂໍ້ຄວາມທີ່ບໍ່ມີສຽງບັນທຶກແນ່ນອນ"), "the request is reported to the admins");

  // account settings: the new options
  await b.eval(`(() => { const el = [...document.querySelectorAll(".side .nav-btn")].find(e => /Account|ບັນຊີ/.test(e.innerText)); el.click(); })()`); await sleep(1000);
  await ok(await b.eval(`[...document.querySelectorAll("main .set-row label")].some(l => /Sentence audio|ສຽງປະໂຫຍກ/.test(l.textContent))`), "Account has the Sentence audio setting (Natural / Word by word)");
  await ok(!/Thai|th-TH|ໄທ/.test(await b.eval(`document.querySelector("main").innerText`)), "no Thai voice is offered");

  console.log("\nadmin sees the request");
  await login("/admin/", "admin@demo.laolao");
  await nav(/Voice Studio/);
  await b.waitFor(`!!document.querySelector(".vs-lists")`, 20000);
  await b.eval(`[...document.querySelectorAll(".vs-lists [role=tab]")].find(x => /Learner requests/.test(x.innerText)).click()`); await sleep(300);
  await ok(/ຂໍ້ຄວາມທີ່ບໍ່ມີສຽງບັນທຶກແນ່ນອນ/.test(await b.eval(`document.querySelector(".vs-list").innerText`)), "Voice Studio → Learner requests lists it");
  await b.eval(`[...document.querySelectorAll(".vs-lists [role=tab]")].find(x => /Recorded/.test(x.innerText)).click()`); await sleep(300);
  await ok((await b.eval(`document.querySelectorAll(".vs-done").length`)) >= 2, "Recorded lists the recordings with play, review status, re-record and delete");

  console.log("\ncomputer voice (demo stand-in for Azure)");
  await b.waitFor(`/Demo tone|Connected/.test((document.querySelector(".vs-cvcard") || {}).innerText || "")`, 10000).catch(() => {});
  const cvText = await b.eval(`document.querySelector(".vs-cvcard").innerText`);
  await ok(/Computer voice \(Azure\)/.test(cvText) && /characters used this month/.test(cvText), "the Computer voice card shows the connection and this month's usage");
  await b.eval(`[...document.querySelectorAll(".vs-cvcard button")].find(x => /Learner requests/.test(x.innerText)).click()`); await sleep(400);
  const asks = await b.eval(`!!document.querySelector(".dialog:not(.out)") && /characters/.test(document.querySelector(".dialog:not(.out)").innerText)`);
  if (await b.eval(`!!document.querySelector(".dialog:not(.out)")`)) await b.eval(`[...document.querySelectorAll(".dialog-f button")].find(x => /Create/.test(x.innerText)).click()`);
  await b.waitFor(`import("/js/admin/state.js").then(m => m.S.api.db.list("audio")).then(r => r.some(x => x.source === "azure" && x.text === "ຂໍ້ຄວາມທີ່ບໍ່ມີສຽງບັນທຶກແນ່ນອນ"))`, 20000).catch(() => {});
  const tts = await b.eval(`import("/js/admin/state.js").then(m => m.S.api.db.list("audio")).then(r => r.find(x => x.source === "azure" && x.text === "ຂໍ້ຄວາມທີ່ບໍ່ມີສຽງບັນທຶກແນ່ນອນ"))`);
  await ok(tts && /^data:audio\//.test(tts.url) && /^tts-/.test(tts.id) && /Azure/.test(tts.speaker) && tts.qc === "needs_review", "the requested text gets a computer-voice recording (its own row, needs review)" + (asks ? ", after a confirmation with the character count" : ""), tts && { id: tts.id, speaker: tts.speaker });
  await b.eval(`[...document.querySelectorAll(".vs-lists [role=tab]")].find(x => /Recorded/.test(x.innerText)).click()`); await sleep(300);
  const recList = await b.eval(`document.querySelector(".vs-list").innerText`);
  await ok(/Computer voice/.test(recList) && /Your voice/.test(recList), "Recorded marks each one 'Your voice' or 'Computer voice'");
  await b.screenshot(path.join(SHOTS, "voice-studio-computer.png"));
  // your voice always wins over the computer voice, and the two are never mixed inside one sentence
  const order = await b.eval(`import("/js/shared/speech.js").then(sp => {
    sp.setAudioLibrary([{ text: "ກິນ", url: "data:audio/wav;base64,AA", source: "studio" }, { text: "ກິນ", url: "data:audio/mp3;base64,BB", source: "azure" },
      { text: "ເຂົ້າ", url: "data:audio/mp3;base64,CC", source: "azure" }, { text: "ກິນເຂົ້າ", url: "data:audio/mp3;base64,DD", source: "azure" }]);
    return [sp.audioSource("ກິນ"), sp.audioSource("ກິນເຂົ້າ"), sp.audioSource("ດື່ມ")]; })`);
  await ok(order[0] === "recording" && order[1] === "computer" && order[2] === "none", "your recording beats the computer voice; one sentence is never mixed from both voices", order);
  await ok(await b.eval(`!!document.querySelector(".vs-pub button")`), "the studio's Publish bar appears after creating");
  await b.eval(`document.querySelector(".vs-pub button").click()`);
  await b.waitFor(`!document.querySelector(".pub:not(.out)")`, 60000).catch(() => {}); await sleep(800);
  await b.eval(`document.querySelectorAll(".pub-scrim, .pub").forEach(e => e.remove())`).catch(() => {});
  await login("/", "learner@demo.laolao"); await sleep(1500);
  await ok((await b.eval(`import("/js/shared/speech.js").then(sp => sp.audioSource("ຂໍ້ຄວາມທີ່ບໍ່ມີສຽງບັນທຶກແນ່ນອນ"))`)) === "computer", "after Publish the learner hears the computer voice for that text");
  await login("/admin/", "admin@demo.laolao");
  await nav(/Voice Studio/);
  await b.waitFor(`!!document.querySelector(".vs-rec")`, 20000);

  console.log("\nlayout");
  for (const [w, hgt] of [[360, 780], [768, 1024], [1366, 900]]){
    await b.send("Emulation.setDeviceMetricsOverride", { width: w, height: hgt, deviceScaleFactor: 1, mobile: w < 900 }); await sleep(400);
    const bad = await b.eval(`(() => { const r = []; if (document.documentElement.scrollWidth > innerWidth + 1) r.push("sideways scroll"); for (const e of document.querySelectorAll(".vs-mic, .vs-actions .btn, .vs-item")){ const x = e.getBoundingClientRect(); if (x.width && (x.right > innerWidth + 1 || x.left < -1)) r.push(e.className + " off screen"); } return r.slice(0, 4); })()`);
    await ok(!bad.length, `studio fits at ${w}px`, bad);
    if (w === 360) await b.screenshot(path.join(SHOTS, "voice-studio-phone.png"));
  }
  await b.send("Emulation.setDeviceMetricsOverride", { width: 1366, height: 900, deviceScaleFactor: 1, mobile: false });
  await b.eval(`document.documentElement.setAttribute("data-theme","night")`); await sleep(300);
  await b.screenshot(path.join(SHOTS, "voice-studio-night.png"));

  const errs = b.consoleLog.filter(l => /^exception|^error/.test(l) && !/favicon|net::ERR|Failed to load resource|youtube/i.test(l));
  await ok(!errs.length, "no JS errors" + (errs.length ? ": " + errs.slice(0, 3).join(" | ") : ""));
} catch (e){ console.log("  FAIL crashed: " + (e.stack || e)); failed++; await b.screenshot(path.join(SHOTS, "fail-voice-crash.png")).catch(() => {}); }
finally { await b.close(); srv.close && srv.close(); }
console.log(failed ? `\n${failed} voice checks FAILED` : "\nAll voice checks passed");
process.exit(failed ? 1 : 0);
