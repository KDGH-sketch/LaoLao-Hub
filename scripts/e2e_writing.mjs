// Script & Handwriting in the browser (demo mode): sections (consonants by class, vowels by position, tone marks,
// numbers, words), writing by shape with real pointer strokes, the left-to-right rule, "consonant before the mark on
// it", a random word written box by box, progress, and phone / tablet layouts.
// Strokes are generated from the letter's own shape (rows across the glyph), so a "good" drawing really covers it.
// Run: node scripts/e2e_writing.mjs
import path from "path";
import fs from "fs";
import { launch, sleep } from "./lib/cdp.mjs";
import { startDemoServer, ROOT } from "./lib/demo-server.mjs";

const SHOTS = path.join(ROOT, "e2e-screenshots"); fs.mkdirSync(SHOTS, { recursive: true });
const srv = await startDemoServer();
const b = await launch({ width: 1280, height: 900 });
let failed = 0;
const ok = (c, m, d) => { console.log((c ? "  PASS " : "  FAIL ") + m + (!c && d !== undefined ? "  → " + JSON.stringify(d).slice(0, 300) : "")); if (!c) failed++; };
const J = JSON.stringify;
const shot = n => b.screenshot(path.join(SHOTS, "writing-" + n + ".png"));
const goL = (v, p = {}) => b.eval(`import("/js/learner/main.js").then(m => m.go(${J(v)}, ${J(p)}))`);
const fb = () => b.eval(`document.querySelector(".hww .hw-fb")?.innerText || ""`);

// draw strokes (cell-local 0..1 points) into cell i of the visible writing strip, with real mouse events
async function drawInCell(i, strokes){
  const g = await b.eval(`(() => { const s = document.querySelector(".hww .cp-strip"); s.scrollIntoView({ block: "center" }); const r = s.getBoundingClientRect(); const n = +document.querySelector(".hww .cp").dataset.cells; return { x: r.x, y: r.y, w: r.width / n, h: r.height }; })()`);
  await sleep(150);
  for (const st of strokes){
    const P = p => ({ x: g.x + (i + p[0]) * g.w, y: g.y + p[1] * g.h });
    const a = P(st[0]);
    await b.send("Input.dispatchMouseEvent", { type: "mousePressed", x: a.x, y: a.y, button: "left", clickCount: 1 });
    for (const p of st.slice(1)){ const q = P(p); await b.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: q.x, y: q.y, button: "left" }); }
    const z = P(st[st.length - 1]);
    await b.send("Input.dispatchMouseEvent", { type: "mouseReleased", x: z.x, y: z.y, button: "left", clickCount: 1 });
  }
  await sleep(120);
}
// strokes that cover a glyph: one horizontal stroke per run of glyph pixels, every 2nd row (in the cell's proportions)
const glyphStrokes = (text, aspect = 1.3) => b.eval(`import("/js/shared/handwriting/shape.js").then(m => { const g = m.glyphMask(${J(text)}, { aspect: ${aspect} }), N = m.GRID, out = [];
  for (let y = 0; y < N; y += 2){ let x = 0; while (x < N){ if (g[y * N + x]){ let e = x; while (e + 1 < N && g[y * N + e + 1]) e++; out.push([[(x + .5) / N, (y + .5) / N], [(e + .5) / N, (y + .5) / N]]); x = e + 1; } else x++; } }
  return out; })`);
const check = async () => { await b.eval(`[...document.querySelectorAll(".hww .btn.primary")].find(x => /Check/.test(x.innerText)).click()`); await sleep(500);
  return b.eval(`({ score: +(document.querySelector(".hww-result .hw-score b")?.innerText || -1), pass: !!document.querySelector(".hww-result .chip.lv"), fb: document.querySelector(".hww .hw-fb")?.innerText, cells: [...document.querySelectorAll(".hww-cell")].map(c => c.className.split(" ").pop()) })`); };

try {
  await b.goto(srv.base + "/"); await b.waitFor(`!!document.querySelector("#em")`, 60000);
  await b.eval(`(() => { const e = document.querySelector("#em"), p = document.querySelector("#pw"); e.value = "learner@demo.laolao"; p.value = "demo1234"; (e.form || p.form).requestSubmit(); })()`);
  await b.waitFor(`!!document.querySelector(".app .topbar")`, 60000); await sleep(800);
  await b.eval(`import("/js/learner/core.js").then(m => { m.setPref("uiLang", "en"); m.setPref("explainLang", "en"); })`); await sleep(300);
  await b.eval(`document.fonts && document.fonts.load("48px 'Noto Sans Lao'")`).catch(() => {});

  console.log("sections");
  await goL("handwriting"); await b.waitFor(`!!document.querySelector(".hwh-tabs")`, 15000); await sleep(600);
  const hub = await b.eval(`({ tabs: [...document.querySelectorAll(".hwh-tab b")].map(x => x.innerText), groups: [...document.querySelectorAll(".hwh-group")].map(g => g.querySelector("h2").innerText.replace(/\\s+/g, " ") + "|" + g.querySelectorAll(".hwh-tile").length) })`);
  ok(hub.tabs.join() === "Consonants,Vowels,Tone marks,Numbers,Words", "five sections: consonants, vowels, tone marks, numbers, words", hub.tabs);
  ok(hub.groups.join(" ; ") === "Middle class 8|8 ; High class 6|6 ; Low class 13|13 ; ຫ + letter 6|6", "consonants grouped by class: middle 8, high 6, low 13, ຫ-combinations 6", hub.groups);
  ok(await b.eval(`getComputedStyle(document.querySelector('.hwh-group[data-cls="high"] .hwh-glyph')).color !== getComputedStyle(document.querySelector('.hwh-group[data-cls="low"] .hwh-glyph')).color`), "each class has its own colour");
  await shot("hub");
  await b.eval(`[...document.querySelectorAll(".hwh-tab")].find(x => /Vowels/.test(x.innerText)).click()`); await sleep(600);
  const vg = await b.eval(`[...document.querySelectorAll(".hwh-group h2")].map(x => x.innerText.replace(/\\s+\\d+$/, ""))`);
  ok(vg.slice(0, 5).join() === "After the consonant,Above the consonant,Below the consonant,Before the consonant,Around the consonant" && (vg.length === 5 || vg[5] === "More from your teacher"), "vowels grouped by where they are written (vowel signs added in the lessons follow in their own group)", vg);
  await shot("vowels");

  console.log("\na letter, written by shape");
  await goL("handwriting", { sec: "consonants", ch: "ດ" }); await b.waitFor(`!!document.querySelector(".hww .cp-strip")`, 15000); await sleep(700);
  const head = await b.eval(`({ big: document.querySelector(".hwl-big")?.innerText, cls: document.querySelector(".hwl-cls")?.innerText, word: document.querySelector(".hwl-word")?.innerText, sound: document.querySelector(".hwl-info .small.muted")?.innerText })`);
  ok(head.big === "ດ" && head.cls === "Middle class" && /ເດັກ/.test(head.word) && /d.*t/.test(head.sound), "the letter with its class, key word (ເດັກ child) and sounds (d at the start, t at the end)", head);
  const good = await glyphStrokes("ດ");
  await drawInCell(0, good);
  let r = await check();
  ok(r.pass && r.score >= 70, "writing the letter's shape passes (" + r.score + ")", r);
  await shot("letter-pass");
  const prog = await b.eval(`import("/js/learner/core.js").then(m => m.handwritingProgress("lo-e94") || m.handwritingProgress(Object.values(m.A.byType.characters || {}).find(c => c.char === "ດ")?.id))`);
  ok(prog && prog.passed && prog.best >= 70, "progress saved for the letter", prog);
  await b.eval(`[...document.querySelectorAll(".hww .btn")].find(x => /Try again/.test(x.innerText)).click()`); await sleep(300);
  await drawInCell(0, [[[0.1, 0.1], [0.9, 0.9]], [[0.9, 0.1], [0.1, 0.9]]]);
  r = await check();
  ok(!r.pass && r.score < 50, "a cross instead of the letter fails (" + r.score + ")", r);
  const half = good.filter((_, k) => k % 3 !== 0 && k < good.length * 0.5);
  await b.eval(`[...document.querySelectorAll(".hww .btn")].find(x => /Try again/.test(x.innerText)).click()`); await sleep(300);
  await drawInCell(0, half);
  r = await check();
  ok(!r.pass && /missing|bigger/.test(await b.eval(`document.querySelector(".hww-result p")?.innerText || ""`)), "only half the letter: fails, says part is missing", r);

  console.log("\nwriting rules: left to right, consonant before the mark on it");
  await goL("handwriting", { sec: "vowels", ch: "ເອ" }); await b.waitFor(`!!document.querySelector(".hww .cp-strip")`, 15000); await sleep(600);
  ok(await b.eval(`document.querySelector(".hww .cp").dataset.cells === "2"`), "ເອ is written in two boxes: ເ first, then ອ");
  await drawInCell(1, (await glyphStrokes("ອ")).slice(0, 3));
  ok(/left to right: finish ເ first/.test(await fb()), "writing ອ before ເ is refused: 'Lao is written left to right: finish ເ first'", await fb());
  await drawInCell(0, await glyphStrokes("ເ"));
  await drawInCell(1, await glyphStrokes("ອ"));
  r = await check();
  ok(r.pass && r.cells.join() === "ok,ok", "ເ then ອ: both boxes pass", r);
  await goL("handwriting", { sec: "tones", ch: "ອ່" }); await b.waitFor(`!!document.querySelector(".hww .cp-strip")`, 15000); await sleep(600);
  await drawInCell(0, [[[0.48, 0.12], [0.5, 0.2]]]);
  ok(/consonant ອ first/.test(await fb()), "the tone mark before its consonant is refused: 'Write the consonant ອ first'", await fb());
  const toneStrokes = await glyphStrokes("ອ່");
  await drawInCell(0, toneStrokes.filter(s => s[0][1] >= 0.3).concat(toneStrokes.filter(s => s[0][1] < 0.3)));
  r = await check();
  ok(r.pass, "consonant first, then the mark: passes (" + r.score + ")", r);

  console.log("\nwords");
  await goL("handwriting", { sec: "words" }); await b.waitFor(`!!document.querySelector(".hww-card")`, 15000); await sleep(700);
  const w1 = await b.eval(`({ meaning: document.querySelector(".hww-meaning")?.innerText, rules: [...document.querySelectorAll(".hww-rules li")].map(x => x.innerText), cells: +document.querySelector(".hww .cp").dataset.cells, model: document.querySelector(".hww-model")?.innerText })`);
  ok(w1.meaning && w1.cells >= 2 && w1.cells <= 3 && /left to right/.test(w1.rules[0]), "a random short word: its meaning, 2–3 boxes, and the rules to follow", w1);
  await b.eval(`[...document.querySelectorAll(".hww-card .btn")].find(x => /New word/.test(x.innerText)).click()`); await sleep(500);
  const w2 = await b.eval(`document.querySelector(".hww-model")?.innerText`);
  ok(w2 && w2 !== w1.model, "New word gives another word (" + w1.model + " → " + w2 + ")");
  await b.eval(`[...document.querySelectorAll(".hwh-group .seg button")].find(x => /Long/.test(x.innerText)).click()`); await sleep(500);
  ok(await b.eval(`+document.querySelector(".hww .cp").dataset.cells >= 6`), "Long: 6 or more boxes");
  await b.eval(`[...document.querySelectorAll(".hwh-group .seg button")].find(x => /Short/.test(x.innerText)).click()`); await sleep(500);
  const word = await b.eval(`document.querySelector(".hww-model").innerText`);
  const cells = await b.eval(`import("/js/shared/lao-script.js").then(m => m.writingCells(${J(word)}).map(c => c.text))`);
  for (let i = 0; i < cells.length; i++){
    const st = await glyphStrokes(cells[i]);
    await drawInCell(i, st.filter(s => s[0][1] >= 0.3 && s[0][1] <= 0.78).concat(st.filter(s => s[0][1] < 0.3 || s[0][1] > 0.78)));
  }
  r = await check();
  ok(r.pass && r.cells.every(c => c === "ok"), "writing " + word + " box by box, left to right: every box passes (" + r.score + ")", r);
  await shot("word-pass");
  ok(await b.eval(`import("/js/learner/core.js").then(m => !!m.handwritingProgress("w:" + ${J(word)}))`), "the word is saved in progress");
  await b.eval(`[...document.querySelectorAll(".hww .btn")].find(x => /Show writing order/.test(x.innerText))?.click()`); await sleep(400);
  ok(await b.eval(`/Watch the order/.test(document.querySelector(".hww .hw-fb").innerText)`), "Show writing order plays the order");

  console.log("\nphone and tablet");
  for (const [w, hh] of [[375, 812], [390, 844], [820, 1180]]){
    await b.send("Emulation.setDeviceMetricsOverride", { width: w, height: hh, deviceScaleFactor: 2, mobile: w < 900 }); await sleep(400);
    for (const [v, p] of [["handwriting", {}], ["handwriting", { sec: "consonants", ch: "ກ" }], ["handwriting", { sec: "words" }]]){
      await goL(v, p); await sleep(700);
      const fit = await b.eval(`document.documentElement.scrollWidth <= innerWidth + 1`);
      ok(fit, w + "px: " + (p.sec === "words" ? "words" : p.ch ? "a letter" : "sections") + " fit (long words scroll inside their box)");
    }
  }
  await shot("phone-word");
  await b.send("Emulation.setDeviceMetricsOverride", { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false });
  ok(!(await b.eval(`/\\bnull\\b|undefined|NaN/.test(document.querySelector("main").innerText)`)), "no stray null / undefined / NaN");
  const errs = b.consoleLog.filter(l => /exception|error/i.test(l) && !/favicon|audio|speech|play\(\)/i.test(l));
  ok(errs.length === 0, "no JS errors", errs.slice(0, 3));
} catch(e){ console.log("  FAIL " + e.message); failed++; await shot("error").catch(() => {}); }
await b.close(); srv.close && srv.close();
console.log(failed ? `\n${failed} writing checks FAILED` : "\nAll writing checks passed");
process.exit(failed ? 1 : 0);
