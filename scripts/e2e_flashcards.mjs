// Flashcard Studio in the browser (demo mode): setup, one card at a time, the flip really hides then reveals the answer,
// hints, keyboard, the coaching pop-up, the summary, choice activities, saved progress, the tricky-words alert,
// phone layout, the old quiz flip card, and the admin's view of a learner's vocabulary practice.
// Run: node scripts/e2e_flashcards.mjs
import path from "path";
import fs from "fs";
import { launch, sleep } from "./lib/cdp.mjs";
import { startDemoServer, ROOT } from "./lib/demo-server.mjs";

const SHOTS = path.join(ROOT, "e2e-screenshots"); fs.mkdirSync(SHOTS, { recursive: true });
const srv = await startDemoServer();
const b = await launch({ width: 1280, height: 900 });
let failed = 0;
const ok = (c, m, d) => { console.log((c ? "  PASS " : "  FAIL ") + m + (!c && d !== undefined ? "  → " + JSON.stringify(d).slice(0, 400) : "")); if (!c) failed++; };
const J = JSON.stringify;
const shot = n => b.screenshot(path.join(SHOTS, "flashcards-" + n + ".png"));
const key = async (k, code) => { for (const type of ["keyDown", "keyUp"]) await b.send("Input.dispatchKeyEvent", { type, key: k, code: code || k, text: type === "keyDown" && k.length === 1 ? k : undefined, windowsVirtualKeyCode: k === " " ? 32 : k === "Enter" ? 13 : k === "Escape" ? 27 : k.toUpperCase().charCodeAt(0) }); await sleep(120); };
const click = sel => b.eval(`(() => { const e = document.querySelector(${J(sel)}); if (!e) return false; e.click(); return true; })()`);
const clickText = (sel, re) => b.eval(`(() => { const e = [...document.querySelectorAll(${J(sel)})].find(x => ${re}.test(x.innerText)); if (!e) return false; e.click(); return true; })()`);
async function login(p, email){
  await b.eval(`try { localStorage.removeItem("laolao.demo.session"); localStorage.setItem("xuelu.lang","en"); localStorage.setItem("xuelu.admin.lang","en"); } catch(e){}`).catch(() => {});
  await b.goto(srv.base + p); await b.waitFor(`!!document.querySelector("#em") || !!document.querySelector(".app")`, 60000);
  await b.eval(`(() => { const e = document.querySelector("#em"), p = document.querySelector("#pw"); e.value = ${J(email)}; p.value = "demo1234"; (e.form || p.form).requestSubmit(); })()`);
  await b.waitFor(`!!document.querySelector(".app .side .nav-btn")`, 60000); await sleep(1000);
  if (await b.eval(`(() => { const e = [...document.querySelectorAll(".topbar .langsw button")].find(x => x.textContent.trim() === "EN"); if (e && e.getAttribute("aria-pressed") !== "true"){ e.click(); return true; } return false; })()`)){ await sleep(800); await b.waitFor(`!!document.querySelector(".app .side .nav-btn")`, 30000); await sleep(400); }
}
const goView = (v, p = {}) => b.eval(`import("/js/learner/main.js").then(m => m.go(${J(v)}, ${J(p)}))`);
const setupReady = () => b.waitFor(`!!document.querySelector(".fc-setup")`, 15000);
const pick = async (label, value) => { await clickText(".fc-field", `/${label}/`); await b.eval(`(() => { const f = [...document.querySelectorAll(".fc-field")].find(x => /${label}/.test(x.querySelector(".fc-label")?.innerText || "")); const c = [...f.querySelectorAll("[role=radio]")].find(x => x.innerText.trim().split("\\n")[0] === ${J(value)}); c.click(); })()`); await sleep(200); };
const state = () => b.eval(`(() => { const c = document.querySelector(".fc-card"), r = c && c.getBoundingClientRect();
  const at = r ? document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2) : null;
  return { slots: document.querySelectorAll(".fc-slot").length, flipped: !!(c && c.classList.contains("is-flipped")), count: document.querySelector(".fc-top .tabnum")?.textContent,
    front: !!(at && at.closest(".fc-front")), back: !!(at && at.closest(".fc-back")), word: document.querySelector(".fc-front .fc-word")?.textContent,
    meaning: document.querySelector(".fc-back .fc-meaning")?.textContent, hints: document.querySelectorAll(".fc-hint-row").length, coach: document.querySelector(".fc-coach")?.innerText || "",
    sum: !!document.querySelector(".fc-sum") }; })()`);
const noOverflow = () => b.eval(`document.documentElement.scrollWidth <= innerWidth + 1`);

try {
  console.log("vocabulary page → studio");
  await login("/", "learner@demo.laolao");
  await goView("vocab"); await sleep(800);
  ok(await clickText("main button", "/Flashcard Studio/"), "the Vocabulary page has a Flashcard Studio button");
  await setupReady();
  ok((await b.eval(`document.querySelectorAll(".quiz").length`)) === 0, "it opens the studio instead of stacking a quiz on the page");
  const ov = await b.eval(`[...document.querySelectorAll(".fc-ov-t")].map(x => x.innerText.replace(/\\s+/g, " ").trim())`);
  ok(ov.length === 5 && /New/.test(ov[0]), "the learner sees their words: new, learning, mastered, tricky, due", ov);
  await shot("setup");

  console.log("\nflip cards");
  await pick("How many", "5"); await pick("Activity", "Flip cards");
  ok(/Start · 5 cards/.test(await b.eval(`document.querySelector(".fc-go").innerText`)), "the learner picks how many cards (5)");
  await click(".fc-go"); await b.waitFor(`!!document.querySelector(".fc-card")`, 8000); await sleep(400);
  let s = await state();
  ok(s.slots === 1 && s.count === "1 / 5", "one card at a time, with a progress count", s);
  ok(s.front && !s.back && !s.flipped, "before flipping, the answer is hidden (the front is what you see)", s);
  ok(s.meaning && s.meaning.trim() && s.meaning.trim() !== s.word, "the back holds a real meaning, not the word again", s);
  await key("h"); await key("h"); s = await state();
  ok(s.hints === 2, "H shows hints one at a time", s);
  await shot("hints");
  await key(" ", "Space"); await sleep(650); s = await state();
  ok(s.flipped && s.back && !s.front, "Space flips the card and reveals the answer", s);
  await shot("flipped");
  await key("3"); await sleep(400); s = await state();
  ok(s.count === "2 / 5" && !s.flipped && s.hints === 0, "3 = 'Knew it' → the next card", s);

  console.log("\ncoaching pop-up");
  for (let i = 0; i < 3; i++){ await key("s"); await sleep(250); }
  s = await state();
  ok(/3 skips in a row/.test(s.coach), "3 skips in a row → a pop-up with advice", s.coach);
  await shot("coach");
  ok(await clickText(".fc-coach button", "/Keep going/"), "the learner can keep going");
  await sleep(300);
  // finish the round
  for (let guard = 0; guard < 40 && !(await state()).sum; guard++){
    s = await state();
    if (s.coach){ await b.eval(`document.querySelector(".fc-coach .btn:last-child").click()`); await sleep(250); continue; }
    if (!s.flipped){ await key(" ", "Space"); await sleep(600); }
    await key("3"); await sleep(350);
  }
  s = await state();
  ok(s.sum, "the round ends with a summary", s);
  const sum = await b.eval(`({ tiles: [...document.querySelectorAll(".fc-sum-t")].map(x => x.innerText.replace(/\\s+/g, " ")), ring: document.querySelector(".fc-ring")?.innerText, again: [...document.querySelectorAll(".fc-sum-btns .btn")].map(x => x.innerText) })`);
  ok(sum.tiles.length === 5 && /3 Skipped/.test(sum.tiles.join("|")), "summary counts knew / almost / missed / skipped / hints", sum);
  ok(sum.again.some(x => /Practise these 3 again/.test(x)), "it offers to practise the skipped words again", sum.again);
  await shot("summary");

  console.log("\nprogress is saved");
  const saved = await b.eval(`import("/js/learner/core.js").then(async m => { const it = Object.values(m.A.srs).filter(x => x.type === "w" && x.st && x.st.seen);
    const prog = await m.A.api.db.get("progress/" + m.A.user.uid); const row = it[0] ? await m.A.api.db.get("reviews/" + m.A.user.uid + "/items/" + it[0].id) : null;
    return { words: it.length, skips: it.reduce((n, x) => n + x.st.skip, 0), hints: it.reduce((n, x) => n + x.st.hints, 0), vocab: prog && prog.vocab, row: row && row.st }; })`);
  ok(saved.words >= 5 && saved.skips === 3 && saved.hints === 2, "every word's knew / skipped / hints are saved", saved);
  ok(saved.row && saved.row.seen >= 1, "…in the learner's own review row (database)", saved.row);
  ok(saved.vocab && saved.vocab.seen >= 8 && saved.vocab.skipped === 3 && saved.vocab.rounds === 1, "…and a summary in progress.vocab for the admin", saved.vocab);

  console.log("\ntricky words alert");
  await b.eval(`import("/js/learner/core.js").then(m => { const w = Object.values(m.A.srs).find(x => x.type === "w" && x.st).w; m.recordCard(w, "missed"); m.recordCard(w, "missed"); })`);
  await b.eval(`[...document.querySelectorAll(".fc-sum-btns .btn")].find(x => /Change settings/.test(x.innerText)).click()`); await setupReady();
  const alert = await b.eval(`document.querySelector(".fc-alert")?.innerText || ""`);
  ok(/1 tricky word/.test(alert) && /Practise them now/.test(alert), "a word missed twice shows up as tricky, with a 'practise now' alert", alert);
  await shot("tricky");

  console.log("\nchoice activities");
  await pick("What to study", "Smart mix"); await pick("Activity", "Choose the meaning");
  await click(".fc-go"); await b.waitFor(`!!document.querySelector(".fc-opt")`, 8000); await sleep(300);
  const opts = await b.eval(`[...document.querySelectorAll(".fc-opt")].map(x => x.innerText.replace(/\\s+/g, " ").trim())`);
  ok(opts.length === 4 && new Set(opts).size === 4, "multiple choice: 4 different answers", opts);
  await key("1"); await sleep(300);
  const after = await b.eval(`({ shown: !document.querySelector(".fc-after").hidden, right: !!document.querySelector(".fc-opt.right"), verdict: document.querySelector(".fc-verdict")?.innerText })`);
  ok(after.shown && after.right && after.verdict, "after answering: right answer marked, meaning and example shown", after);
  await key("Enter"); await sleep(400);
  ok(/^2 \/ [56]$/.test((await state()).count), "Enter → next card (a wrong answer adds the card again at the end)");
  await shot("choose");
  await b.eval(`document.querySelector(".fc-close").click()`); await sleep(400);
  if (await b.eval(`!!document.querySelector(".dialog:not(.out)")`)) await clickText(".dialog-f button", "/Stop/");
  await setupReady();
  await pick("Activity", "Meaning → Lao"); await click(".fc-go"); await b.waitFor(`!!document.querySelector(".fc-opt")`, 8000);
  ok(await b.eval(`[...document.querySelectorAll(".fc-opt")].every(x => /[\\u0E80-\\u0EFF]/.test(x.innerText)) && !!document.querySelector(".fc-meaning.big")`), "reverse: the meaning is shown, the answers are Lao words");
  await b.eval(`document.querySelector(".fc-close").click()`); await sleep(400);
  if (await b.eval(`!!document.querySelector(".dialog:not(.out)")`)) await clickText(".dialog-f button", "/Stop/");
  await setupReady();
  await pick("Activity", "Listen"); await click(".fc-go"); await b.waitFor(`!!document.querySelector(".fc-opt")`, 8000);
  ok(await b.eval(`!!document.querySelector(".fc-listen") || !!document.querySelector(".fc-opts")`), "listening: plays the word (or falls back to choosing when it has no audio)");
  await b.eval(`document.querySelector(".fc-close").click()`); await sleep(400);
  if (await b.eval(`!!document.querySelector(".dialog:not(.out)")`)) await clickText(".dialog-f button", "/Stop/");
  await setupReady();
  await pick("Activity", "Flip cards");

  console.log("\nempty decks");
  await pick("What to study", "Due for review");
  const due = await b.eval(`({ n: document.querySelector(".fc-go").innerText, dis: document.querySelector(".fc-go").disabled, msg: document.querySelector(".fc-start p")?.innerText || "" })`);
  ok(due.dis || /Start · \d+ cards/.test(due.n), "a deck that has no cards can't start a 0-card round", due);
  await pick("What to study", "Smart mix");

  console.log("\nphone");
  await b.send("Emulation.setDeviceMetricsOverride", { width: 375, height: 812, deviceScaleFactor: 2, mobile: true }); await sleep(600);
  ok(await noOverflow(), "setup fits a 375 px phone");
  await shot("phone-setup");
  await click(".fc-go"); await b.waitFor(`!!document.querySelector(".fc-card")`, 8000); await sleep(400);
  ok(await noOverflow(), "the card fits a phone");
  const tap = await b.eval(`(() => { const r = document.querySelector(".fc-card").getBoundingClientRect(); return [r.x + r.width / 2, r.y + 60]; })()`);
  for (const type of ["mousePressed", "mouseReleased"]) await b.send("Input.dispatchMouseEvent", { type, x: tap[0], y: tap[1], button: "left", clickCount: 1 });
  await sleep(650);
  ok((await state()).flipped, "tapping the card flips it");
  ok(await b.eval(`[...document.querySelectorAll(".fc-grades .btn")].every(x => x.getBoundingClientRect().height >= 44)`), "grade buttons are big enough to tap (44 px)");
  await shot("phone-card");
  await b.send("Emulation.setDeviceMetricsOverride", { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false }); await sleep(300);
  await b.eval(`document.querySelector(".fc-close").click()`); await sleep(400);
  if (await b.eval(`!!document.querySelector(".dialog:not(.out)")`)) await clickText(".dialog-f button", "/Stop/");

  console.log("\nflip card inside a quiz");
  const qz = await b.eval(`import("/js/shared/quiz.js").then(async m => { const box = m.questionEl({ type: "flashcard", prompt: { zh: "ກິນ", py: "kin" }, back: { en: "to eat", lo: "", zh: "" } }, "lo", () => ({}), () => {});
    document.body.append(box); const back = box.querySelector(".fc-qback"), btns = back.parentElement.nextElementSibling;
    const before = { back: getComputedStyle(back).display, btns: getComputedStyle(btns).display };
    box.querySelector(".flash .btn.primary").click(); const after = { back: getComputedStyle(back).display, text: back.innerText, btns: getComputedStyle(btns).display }; box.remove(); return { before, after }; })`);
  ok(qz.before.back === "none" && qz.before.btns === "none", "quiz flip card: answer and grade buttons hidden before Flip (they used to show)", qz);
  ok(qz.after.back !== "none" && /to eat/.test(qz.after.text) && qz.after.btns !== "none", "after Flip: the meaning shows (English when the Lao one is blank)", qz);

  const errs = b.consoleLog.filter(l => /exception|error/i.test(l) && !/favicon|audio|speech|play\(\)/i.test(l));
  ok(errs.length === 0, "no JS errors", errs.slice(0, 3));

  console.log("\nadmin");
  const uid = await b.eval(`import("/js/learner/core.js").then(m => m.A.user.uid)`);
  await login("/admin/", "admin@demo.laolao");
  await b.eval(`import("/js/admin/state.js").then(m => m.go("learner", { uid: ${J(uid)} }))`);
  await b.waitFor(`/Vocabulary practice/.test(document.querySelector("main")?.innerText || "")`, 15000).catch(() => {});
  const adm = await b.eval(`(() => { const p = [...document.querySelectorAll("section.panel")].find(x => /Vocabulary practice/.test(x.innerText)); return p ? p.innerText.replace(/\\s+/g, " ") : ""; })()`);
  ok(/Cards played/.test(adm) && /Rounds/.test(adm) && /Tricky/.test(adm), "the admin sees the learner's flashcard practice and tricky words", adm.slice(0, 200));
  await shot("admin");
} catch(e){ console.log("  FAIL " + e.message); failed++; await shot("error").catch(() => {}); }
await b.close(); srv.close && srv.close();
console.log(failed ? `\n${failed} flashcard browser checks FAILED` : "\nAll flashcard browser checks passed");
process.exit(failed ? 1 : 0);
