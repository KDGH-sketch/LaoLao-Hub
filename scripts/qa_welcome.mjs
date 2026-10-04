// QA of the real welcome page and the new admin screens (ported from docs/mockups/qa to the app, demo backend).
//   layout: 20 device sizes × Day and Night: no sideways scroll, nothing off screen or clipped, touch targets ≥ 44 px
//           on touch screens (≥ 24 px otherwise), no text under 12 px, layout shift under 0.1, no console errors
//   a11y:   axe-core (WCAG 2.0 / 2.1 / 2.2 A + AA) on the welcome page (phone and desktop, Day and Night, reduced motion)
//           and on each Website & Welcome admin screen; 200% text at 1280 px and 320 px reflow without sideways scroll;
//           the skip link is the first Tab stop; reduced motion stops the animations.
// Run: node scripts/qa_welcome.mjs [layout|a11y]   (Chrome or Edge required; screenshots in e2e-screenshots/qa-welcome)
import fs from "fs";
import path from "path";
import { launch, sleep } from "./lib/cdp.mjs";
import { startDemoServer, ROOT } from "./lib/demo-server.mjs";

const ONLY = process.argv[2] || "";
const SHOTS = path.join(ROOT, "e2e-screenshots", "qa-welcome");
fs.mkdirSync(SHOTS, { recursive: true });
const AXE = fs.readFileSync(path.join(ROOT, "node_modules", "axe-core", "axe.min.js"), "utf8");
const DEVICES = [
  ["fold-cover-280", 280, 653, 3, true], ["iphone-se1-320", 320, 568, 2, true], ["android-360", 360, 740, 3, true], ["iphone-13-390", 390, 844, 3, true],
  ["pixel-7-412", 412, 915, 2.6, true], ["iphone-promax-430", 430, 932, 3, true], ["phone-land-667x375", 667, 375, 2, true], ["phone-land-844x390", 844, 390, 3, true],
  ["surface-duo-540", 540, 720, 2.5, true], ["ipad-mini-768", 768, 1024, 2, true], ["ipad-air-820", 820, 1180, 2, true], ["ipad-land-1024", 1024, 768, 2, true],
  ["ipad-pro-1024x1366", 1024, 1366, 2, true], ["ipad-pro-land-1366", 1366, 1024, 2, true], ["laptop-1280", 1280, 720, 1, false], ["laptop-1366", 1366, 768, 1, false],
  ["desktop-1440", 1440, 900, 1, false], ["fhd-1920", 1920, 1080, 1, false], ["qhd-2560", 2560, 1440, 1, false], ["4k-3840", 3840, 2160, 1, false]
];
const SHOT_FOR = new Set(["fold-cover-280", "iphone-13-390", "phone-land-844x390", "ipad-mini-768", "laptop-1366", "fhd-1920", "4k-3840"]);

const srv = await startDemoServer();
const b = await launch({ width: 1366, height: 768 });
let failed = 0;
const ok = (c, m, extra = "") => { console.log((c ? "  PASS " : "  FAIL ") + m + (extra ? "  " + extra : "")); if (!c) failed++; };
const errs = () => b.consoleLog.filter(l => /^exception|^error/.test(l) && !/favicon|net::ERR|Failed to load resource|fonts\.g/i.test(l));
await b.send("Page.addScriptToEvaluateOnNewDocument", { source: `window.__cls = 0; try { new PerformanceObserver(l => { for (const e of l.getEntries()) if (!e.hadRecentInput) window.__cls += e.value; }).observe({ type: "layout-shift", buffered: true }); } catch(e){}` });

async function device(w, h, dpr, touch){
  await b.send("Emulation.setDeviceMetricsOverride", { width: w, height: h, deviceScaleFactor: dpr, mobile: touch && w < 900 });
  await b.send("Emulation.setTouchEmulationEnabled", touch ? { enabled: true, maxTouchPoints: 5 } : { enabled: false });
  await b.send("Emulation.setEmulatedMedia", { media: "", features: [{ name: "pointer", value: touch ? "coarse" : "fine" }, { name: "hover", value: touch ? "none" : "hover" }] }).catch(() => {});
}
async function openWelcome(theme, extra = ""){
  await b.goto(srv.base + "/?r=" + Date.now() + extra);
  await b.waitFor(`!!document.querySelector(".wl .wl-hero") && !!document.querySelector(".wl-plans")`, 60000);
  await b.eval(`localStorage.setItem("laolao_theme", ${JSON.stringify(theme)}); document.documentElement.setAttribute("data-theme", ${JSON.stringify(theme)}); document.fonts && document.fonts.ready`);
  await sleep(500);
}
async function scrollThrough(){
  const H = await b.eval(`document.documentElement.scrollHeight`), vh = await b.eval(`innerHeight`);
  for (let y = 0; y < H; y += Math.max(300, vh * 0.8)){ await b.eval(`window.scrollTo({ top: ${y}, behavior: "instant" })`); await sleep(50); }
  await b.eval(`window.scrollTo({ top: 0, behavior: "instant" })`); await sleep(250);
}
const IN_PAGE = `(() => {
  const vw = document.documentElement.clientWidth, touch = matchMedia("(pointer:coarse)").matches;
  const out = { vw, sw: document.documentElement.scrollWidth, over: [], clip: [], tapSmall: [], tapMid: [], tiny: [], cls: window.__cls || 0 };
  const skip = el => el.closest(".wl-track, .wl-scene, .wl-stars, .wl-drift, .wl-map-svg, .wl-fest, svg, .wl-defs, .wl-sheet:not(:popover-open), .wl-skip");
  const name = el => el.tagName.toLowerCase() + (el.id ? "#" + el.id : "") + (typeof el.className === "string" && el.className ? "." + el.className.trim().split(/\\s+/).slice(0, 2).join(".") : "");
  for (const el of document.querySelectorAll(".wl *")){
    const cs = getComputedStyle(el);
    if (cs.display === "none" || cs.visibility === "hidden") continue;
    const r = el.getBoundingClientRect(); if (!r.width || !r.height) continue;
    if (!skip(el) && (r.right > vw + 1 || r.left < -1)){
      let a = el.parentElement, clipped = false;
      while (a && a !== document.body){ const o = getComputedStyle(a); if (["hidden","clip","auto","scroll"].includes(o.overflowX)){ const ar = a.getBoundingClientRect(); if (ar.right <= vw + 1 && ar.left >= -1){ clipped = true; break; } } a = a.parentElement; }
      if (!clipped) out.over.push(name(el) + " L" + Math.round(r.left) + " R" + Math.round(r.right));
    }
    if (!skip(el) && (["hidden","clip"].includes(cs.overflowX)) && [...el.childNodes].some(n => n.nodeType === 3 && n.textContent.trim()) && (el.scrollWidth > el.clientWidth + 1 || el.scrollHeight > el.clientHeight + 2)) out.clip.push(name(el));
    if (el.matches("a[href], button, input:not([type=hidden]), select, textarea, [role=tab]") && !el.closest(".wl-track, [aria-hidden=true], .wl-skip, .wl-sheet:not(:popover-open)") && !el.disabled){
      if (r.width < 24 || r.height < 24) out.tapSmall.push(name(el) + " " + Math.round(r.width) + "x" + Math.round(r.height));
      else if (touch && (r.width < 44 || r.height < 44)) out.tapMid.push(name(el) + " " + Math.round(r.width) + "x" + Math.round(r.height));
    }
    if (!el.closest("svg") && [...el.childNodes].some(n => n.nodeType === 3 && n.textContent.trim()) && parseFloat(cs.fontSize) < 12) out.tiny.push(name(el) + " " + cs.fontSize);
  }
  return out;
})()`;
async function axeRun(label){
  await b.eval(`window.axe || (function(){ ${AXE}\n })()`).catch(() => {});
  if (!(await b.eval(`!!window.axe`))) await b.eval(AXE + ";true");
  const res = await b.eval(`(async () => { const r = await axe.run(document, { runOnly: { type: "tag", values: ["wcag2a","wcag2aa","wcag21a","wcag21aa","wcag22aa"] }, resultTypes: ["violations"] });
    return r.violations.map(v => ({ id: v.id, impact: v.impact, nodes: v.nodes.slice(0, 3).map(n => n.target.join(" ") + " :: " + ((n.any[0] || n.all[0] || n.none[0] || {}).message || "").slice(0, 120)), count: v.nodes.length })); })()`);
  ok(res.length === 0, `axe (WCAG 2.2 AA) · ${label}: ${res.length} violations`, res.map(v => `${v.id}×${v.count} [${v.nodes.join(" | ")}]`).join(" ;; ").slice(0, 900));
  return res;
}

try {
  // ---------- layout ----------
  if (!ONLY || ONLY === "layout"){
    console.log("layout: 20 sizes × Day / Night");
    const report = [];
    for (const [n, w, h, dpr, touch] of DEVICES) for (const theme of ["day", "night"]){
      await device(w, h, dpr, touch);
      await openWelcome(theme);
      await scrollThrough();
      const r = await b.eval(IN_PAGE);
      r.dev = n; r.theme = theme; r.errors = errs(); b.consoleLog.length = 0;
      report.push(r);
      const bad = r.sw > r.vw + 1 || r.over.length || r.clip.length || r.tapSmall.length || r.tapMid.length || r.tiny.length || r.errors.length || r.cls >= 0.1;
      ok(!bad, `${n.padEnd(20)} ${theme.padEnd(5)} vw${r.vw} sw${r.sw} over${r.over.length} clip${r.clip.length} tap<24:${r.tapSmall.length} touch<44:${r.tapMid.length} tiny${r.tiny.length} cls${r.cls.toFixed(3)} err${r.errors.length}`,
        bad ? [...r.over.slice(0, 3), ...r.clip.slice(0, 3), ...r.tapSmall.slice(0, 3), ...r.tapMid.slice(0, 4), ...r.tiny.slice(0, 3), ...r.errors.slice(0, 2)].join(" · ") : "");
      if (SHOT_FOR.has(n)) await b.screenshot(path.join(SHOTS, `${n}-${theme}.png`));
    }
    fs.writeFileSync(path.join(SHOTS, "layout-report.json"), JSON.stringify(report, null, 1));
  }

  // ---------- accessibility ----------
  if (!ONLY || ONLY === "a11y"){
    console.log("\naccessibility");
    for (const [w, h, touch] of [[1366, 768, false], [390, 844, true]]) for (const theme of ["day", "night"]){
      await device(w, h, 1, touch); await openWelcome(theme); await scrollThrough();
      await axeRun(`welcome ${w}px ${theme}`);
    }
    await b.send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] });
    await device(1366, 768, 1, false); await openWelcome("day");
    await b.send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] });
    await axeRun("welcome reduced motion");
    const running = await b.eval(`document.getAnimations().filter(a => a.playState === "running" && a.effect && a.effect.getTiming().iterations === Infinity).length`);
    ok(running === 0, "reduced motion: no endless animations running (" + running + ")");
    await b.send("Emulation.setEmulatedMedia", { features: [] });
    // skip link first, keyboard focus visible
    await device(1280, 720, 1, false); await openWelcome("day");
    await b.send("Input.dispatchKeyEvent", { type: "keyDown", key: "Tab", code: "Tab", windowsVirtualKeyCode: 9 }); await b.send("Input.dispatchKeyEvent", { type: "keyUp", key: "Tab", code: "Tab", windowsVirtualKeyCode: 9 });
    ok(await b.eval(`document.activeElement && document.activeElement.classList.contains("wl-skip")`), "keyboard: the first Tab stop is the skip link");
    ok(await b.eval(`(() => { const cs = getComputedStyle(document.activeElement); return cs.outlineStyle !== "none" && parseFloat(cs.outlineWidth) >= 2; })()`), "keyboard: the focused control shows an outline");
    // 200% text at 1280 px; 320 px with 150% text (WCAG 1.4.4, 1.4.10)
    await b.eval(`document.documentElement.style.fontSize = "200%"`); await sleep(400);
    let r = await b.eval(`({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth })`);
    ok(r.sw <= r.cw + 1, "200% text at 1280 px: no sideways scroll", r.sw + "/" + r.cw);
    await device(320, 640, 2, true); await openWelcome("day"); await b.eval(`document.documentElement.style.fontSize = "150%"`); await sleep(400);
    r = await b.eval(`({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth })`);
    ok(r.sw <= r.cw + 1, "320 px with 150% text: reflows without sideways scroll", r.sw + "/" + r.cw);

    // the new admin screens
    await device(1440, 900, 1, false);
    await b.goto(srv.base + "/admin/");
    await b.waitFor(`!!document.querySelector("#em") || !!document.querySelector(".app")`, 60000);
    if (!(await b.eval(`!!document.querySelector(".app")`))){
      await b.eval(`(() => { const e = document.querySelector("#em"), p = document.querySelector("#pw"); e.value = "admin@demo.laolao"; p.value = "demo1234"; (e.form || p.form).requestSubmit(); })()`);
      await b.waitFor(`!!document.querySelector(".app")`, 30000);
    }
    await sleep(1200);
    for (const [label, view, params] of [["Welcome Page editor", "welcome", {}], ["Journey Places list", "contentList", { type: "places" }], ["place editor", "editor", { type: "places", id: "vientiane" }],
        ["Festivals list", "contentList", { type: "festivals" }], ["Promotions & Feed", "promotions", {}], ["offer editor", "editor", { type: "offers", id: "sample-premium" }], ["Free Resources list", "contentList", { type: "resources" }]]){
      await b.eval(`(async () => { const st = await import("/js/admin/state.js"); st.go(${JSON.stringify(view)}, ${JSON.stringify(params)}); })()`); await sleep(2200);
      // the preview iframe is checked as the welcome page above
      await b.eval(`document.querySelectorAll(".wl-adm-frame iframe").forEach(f => f.remove())`);
      await axeRun("admin · " + label);
    }
    ok(errs().length === 0, "no console errors", errs().slice(0, 3).join(" | "));
  }
} catch(e){ console.error(e); failed++; }
finally { await b.close(); srv.close(); }
console.log(failed ? `\n${failed} welcome QA checks FAILED` : "\nAll welcome QA checks passed");
process.exit(failed ? 1 : 0);
