// Cancel and "Discard changes?" in the admin panel and the learner app (demo mode, Supabase is never contacted).
// Cancel must close every dialog; with unsaved edits (in a dialog, the content editor, or when leaving through the menu)
// the discard popup asks first, and "Keep editing" keeps the edits. Typing is real keyboard input (CDP), because the
// app only counts edits a person made. Screenshots of the popup go to e2e-screenshots/discard-*.png.
// Run: node scripts/e2e_cancel.mjs   (Chrome or Edge required)
import fs from "fs";
import path from "path";
import { launch, sleep } from "./lib/cdp.mjs";
import { startDemoServer, ROOT } from "./lib/demo-server.mjs";

const SHOTS = path.join(ROOT, "e2e-screenshots");
fs.mkdirSync(SHOTS, { recursive: true });
const srv = await startDemoServer();
const b = await launch({ width: 1366, height: 900 });
let failed = 0;
const ok = async (c, m) => { console.log((c ? "  PASS " : "  FAIL ") + m); if (!c){ failed++; await b.screenshot(path.join(SHOTS, "fail-cancel-" + m.replace(/[^\w.-]+/g, "_").slice(0, 90) + ".png")).catch(() => {}); } };
const J = JSON.stringify;
const click = (sel, re) => b.eval(`(() => { const el = [...document.querySelectorAll(${J(sel)})].reverse().find(e => ${re}.test((e.innerText || e.textContent || "").trim()) || ${re}.test(e.getAttribute("aria-label") || "")); if (el){ el.scrollIntoView({block:"center"}); el.click(); } return !!el; })()`);
const dialogs = () => b.eval(`document.querySelectorAll(".dialog:not(.out)").length`);
const discardShown = () => b.eval(`!!document.querySelector(".discard-dlg:not(.out)")`);
const gone = async () => { await sleep(450); };
// real typing into the element matching sel (the app ignores scripted input events)
async function type(sel, text){
  await b.eval(`(() => { const el = document.querySelector(${J(sel)}); el.scrollIntoView({block:"center"}); el.focus(); el.select && el.select(); return true; })()`);
  await b.send("Input.insertText", { text });
  await sleep(150);
}
async function key(k, code){ await b.send("Input.dispatchKeyEvent", { type: "keyDown", key: k, code, windowsVirtualKeyCode: 27 }); await b.send("Input.dispatchKeyEvent", { type: "keyUp", key: k, code, windowsVirtualKeyCode: 27 }); await sleep(450); }
async function login(p, email){
  await b.eval(`try { localStorage.removeItem("laolao.demo.session"); } catch(e){}`).catch(() => {});
  await b.goto(srv.base + p); await b.waitFor(`!!document.querySelector("#em") || !!document.querySelector(".app")`, 60000);
  await b.eval(`(() => { const e = document.querySelector("#em"), p = document.querySelector("#pw"); e.value = ${J(email)}; p.value = "demo1234"; (e.form || p.form).requestSubmit(); })()`);
  await b.waitFor(`!!document.querySelector(".app")`, 60000); await sleep(800);
}
const nav = async re => { await b.eval(`(() => { const el = [...document.querySelectorAll(".side .nav-btn")].find(e => ${re}.test(e.innerText)); el.click(); })()`); await sleep(900); };
const inEditor = () => b.eval(`!!document.querySelector(".editor-side")`);
const TITLE = `[...document.querySelectorAll(".field")].find(f => /^Title$/.test((f.querySelector(":scope > .lbl, :scope > label")||{}).textContent||"")).querySelector("input")`;

try {
  await login("/admin/", "admin@demo.laolao");

  console.log("\ncontent editor");
  await nav(/^Lessons$/);
  await b.eval(`document.querySelector("main tbody tr").click()`); await b.waitFor(`!!document.querySelector(".editor-side")`, 10000);
  await ok(await b.eval(`[...document.querySelectorAll(".editor-side button")].some(x => /Cancel/.test(x.innerText))`), "the editor has a Cancel button");
  await click(".editor-side button", /Cancel/); await gone();
  await ok(!(await inEditor()) && !(await discardShown()), "Cancel without changes goes straight back to the list");
  await b.eval(`document.querySelector("main tbody tr").click()`); await b.waitFor(`!!document.querySelector(".editor-side")`, 10000);
  await b.eval(`${TITLE}.setAttribute("data-qa","title")`);
  const before = await b.eval(`${TITLE}.value`);
  await type('[data-qa="title"]', "Changed by the cancel test");
  await click(".editor-side button", /Cancel/); await sleep(500);
  await ok(await discardShown(), "Cancel with unsaved edits shows the Discard changes popup");
  await b.screenshot(path.join(SHOTS, "discard-desktop.png"));
  await click(".discard-dlg button", /Keep editing/); await gone();
  await ok(await inEditor() && (await b.eval(`document.querySelector('[data-qa="title"]').value`)) === "Changed by the cancel test", "Keep editing stays in the editor with the edit kept");
  await nav(/^Dashboard|^Overview|^Home/); await sleep(300);
  await ok(await discardShown(), "leaving through the side menu with unsaved edits asks too");
  await key("Escape", "Escape");
  await ok(await inEditor() && !(await discardShown()), "Escape on the popup means keep editing");
  await click(".editor-side button", /Cancel/); await sleep(500);
  await click(".discard-dlg button", /Discard/); await gone();
  await ok(!(await inEditor()), "Discard changes leaves the editor");
  await b.eval(`document.querySelector("main tbody tr").click()`); await b.waitFor(`!!document.querySelector(".editor-side")`, 10000);
  await ok(await b.eval(`${TITLE}.value`) === before, "the discarded edit was not saved");
  // undoing an edit by hand counts as no change
  await b.eval(`${TITLE}.setAttribute("data-qa","title")`);
  await type('[data-qa="title"]', "temp"); await type('[data-qa="title"]', before);
  await click(".editor-side button", /Cancel/); await sleep(500);
  await ok(!(await discardShown()) && !(await inEditor()), "an edit typed back to the original is not treated as a change");

  console.log("\ndialogs");
  await nav(/^Lessons$/);
  await click("main button", /^New$|New lesson|\+/); await b.waitFor(`!!document.querySelector(".dialog input")`, 5000);
  await click(".dialog-f button", /^Cancel$/); await gone();
  await ok(await dialogs() === 0, "Cancel closes the New item dialog");
  await click("main button", /^New$|New lesson|\+/); await b.waitFor(`!!document.querySelector(".dialog input")`, 5000);
  await type(".dialog input", "typed-id");
  await click(".dialog-f button", /^Cancel$/); await sleep(500);
  await ok(await discardShown(), "Cancel in a dialog with typed text asks first");
  await click(".discard-dlg button", /Keep editing/); await gone();
  await ok(await dialogs() === 1 && (await b.eval(`document.querySelector(".dialog input").value`)) === "typed-id", "Keep editing keeps the dialog and the text");
  await b.eval(`document.querySelector(".dialog .dialog-h .ib").click()`); await sleep(500);
  await ok(await discardShown(), "the × button asks too");
  await click(".discard-dlg button", /Discard/); await gone();
  await ok(await dialogs() === 0, "Discard closes the dialog");
  await click("main button", /^New$|New lesson|\+/); await b.waitFor(`!!document.querySelector(".dialog input")`, 5000);
  await key("Escape", "Escape");
  await ok(await dialogs() === 0, "Escape closes an unchanged dialog");

  // the delete confirmation: Cancel closes it and keeps the item
  const rows = await b.eval(`document.querySelectorAll("main tbody tr").length`);
  await b.eval(`document.querySelector("main tbody tr button[aria-label^='Delete']").click()`); await sleep(400);
  await click(".dialog-f button", /^Cancel$/); await gone();
  await ok(await dialogs() === 0 && (await b.eval(`document.querySelectorAll("main tbody tr").length`)) === rows, "Cancel on Delete closes the question and keeps the item");

  // plan editor (Super Admin)
  await nav(/Plans|Pricing/);
  if (await click("main button", /^Edit$/)){
    await b.waitFor(`!!document.querySelector(".dialog input")`, 5000);
    await click(".dialog-f button", /^Cancel$/); await gone();
    await ok(await dialogs() === 0, "Cancel closes the plan editor");
    await click("main button", /^Edit$/); await b.waitFor(`!!document.querySelector(".dialog input")`, 5000);
    await type(".dialog input.input:not([disabled])", "Edited plan");
    await click(".dialog-f button", /^Cancel$/); await sleep(500);
    await ok(await discardShown(), "Cancel in the plan editor with edits asks first");
    await click(".discard-dlg button", /Discard/); await gone();
    await ok(await dialogs() === 0, "Discard closes the plan editor");
  } else await ok(false, "plan Edit button found");

  console.log("\npopup on phones, day and night");
  for (const [w, hgt, name] of [[360, 780, "phone"], [320, 640, "small-phone"], [768, 1024, "tablet"]]){
    await b.send("Emulation.setDeviceMetricsOverride", { width: w, height: hgt, deviceScaleFactor: 1, mobile: true }); await sleep(400);
    for (const theme of ["day", "night"]){
      await b.eval(`document.documentElement.setAttribute("data-theme", ${J(theme)})`);
      await b.eval(`import("/js/shared/ui.js").then(m => { window.__dc = m.discardDialog(); })`); await sleep(900);
      const fit = await b.eval(`(() => { if (/null/.test(document.querySelector(".discard-dlg").firstChild.textContent || "")) return false; const r = document.querySelector(".discard-dlg").getBoundingClientRect(); const bs = [...document.querySelectorAll(".discard-dlg .btn")].map(x => x.getBoundingClientRect());
        return r.left >= 8 && r.right <= innerWidth - 8 && r.top >= 0 && r.bottom <= innerHeight && bs.every(x => x.height >= 44 && x.right <= r.right) && document.documentElement.scrollWidth <= innerWidth; })()`);
      await ok(fit, `popup fits ${name} ${w}x${hgt} (${theme}), buttons at least 44px tall`);
      await b.screenshot(path.join(SHOTS, `discard-${name}-${theme}.png`));
      await click(".discard-dlg button", /Keep editing/); await gone();
      await ok(await b.eval(`window.__dc.then(v => v === false)`), "Keep editing answers false");
    }
  }
  await b.send("Emulation.setDeviceMetricsOverride", { width: 1366, height: 900, deviceScaleFactor: 1, mobile: false });

  console.log("\nlearner app");
  await login("/", "free@demo.laolao");
  await b.eval(`(() => { const el = [...document.querySelectorAll(".side .nav-btn")].find(e => /Account/.test(e.innerText)); el.click(); })()`); await sleep(900);
  await click("main button", /^Sign out$/); await sleep(400);
  await ok(await dialogs() === 1, "sign-out asks for confirmation");
  await click(".dialog-f button", /^Cancel$/); await gone();
  await ok(await dialogs() === 0 && await b.eval(`!!document.querySelector(".app")`), "Cancel closes it and keeps the learner signed in");

  const errs = b.consoleLog.filter(l => /^exception|^error/.test(l) && !/favicon|net::ERR|Failed to load resource|youtube/i.test(l));
  await ok(!errs.length, "no JS errors" + (errs.length ? ": " + errs.slice(0, 3).join(" | ") : ""));
} catch (e){ console.log("  FAIL crashed: " + (e.stack || e)); failed++; await b.screenshot(path.join(SHOTS, "fail-cancel-crash.png")).catch(() => {}); }
finally { await b.close(); srv.close && srv.close(); }
console.log(failed ? `\n${failed} cancel checks FAILED` : "\nAll cancel checks passed");
process.exit(failed ? 1 : 0);
