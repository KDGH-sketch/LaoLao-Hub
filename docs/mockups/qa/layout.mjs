import fs from "fs";
import { chromium, DEVICES, newPage, scrollThrough } from "./lib.mjs";

const inPage = () => {
  const vw = document.documentElement.clientWidth;
  const out = { vw, sw: document.documentElement.scrollWidth, over: [], clip: [], tapSmall: [], tapMid: [], tiny: [], cls: window.__cls };
  const skip = el => el.closest(".track, .scene, .stars, .drift, svg.map-svg, .fest, svg");
  const name = el => el.tagName.toLowerCase() + (el.id ? "#" + el.id : "") + (typeof el.className === "string" && el.className ? "." + el.className.trim().split(/\s+/).slice(0, 2).join(".") : "");
  for (const el of document.querySelectorAll("body *")) {
    const cs = getComputedStyle(el);
    if (cs.display === "none" || cs.visibility === "hidden") continue;
    const r = el.getBoundingClientRect(); if (!r.width || !r.height) continue;
    if (!skip(el) && (r.right > vw + 1 || r.left < -1)) {
      let a = el.parentElement, clipped = false;
      while (a && a !== document.body) { const o = getComputedStyle(a); if (["hidden", "clip", "auto", "scroll"].includes(o.overflowX)) { const ar = a.getBoundingClientRect(); if (ar.right <= vw + 1 && ar.left >= -1) { clipped = true; break; } } a = a.parentElement; }
      if (!clipped) out.over.push(`${name(el)} L${Math.round(r.left)} R${Math.round(r.right)}`);
    }
    if (!skip(el) && ["hidden", "clip"].includes(cs.overflow) || ["hidden", "clip"].includes(cs.overflowX)) {
      if (!el.closest("svg") && el.childNodes.length && [...el.childNodes].some(n => n.nodeType === 3 && n.textContent.trim()) && (el.scrollWidth > el.clientWidth + 1 || el.scrollHeight > el.clientHeight + 2)) out.clip.push(`${name(el)} sw${el.scrollWidth}/cw${el.clientWidth} sh${el.scrollHeight}/ch${el.clientHeight}`);
    }
    if (el.matches("a[href], button, input:not([type=hidden]), select, textarea, [role=tab]") && !el.closest(".track, [aria-hidden=true]")) {
      if (r.width < 24 || r.height < 24) out.tapSmall.push(`${name(el)} ${Math.round(r.width)}x${Math.round(r.height)}`);
      else if (r.width < 44 || r.height < 44) out.tapMid.push(`${name(el)} ${Math.round(r.width)}x${Math.round(r.height)}`);
    }
    if (!el.closest("svg") && [...el.childNodes].some(n => n.nodeType === 3 && n.textContent.trim()) && parseFloat(cs.fontSize) < 12) out.tiny.push(`${name(el)} ${cs.fontSize}`);
  }
  return out;
};

const only = process.argv[2];
const shotsFor = new Set(["fold-cover-280", "iphone-se1-320", "iphone-13-390", "phone-land-844x390", "ipad-mini-768", "ipad-land-1024", "laptop-1366", "fhd-1920", "4k-3840"]);
fs.mkdirSync("shots", { recursive: true });
const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const report = [];
let bad = 0;
for (const d of DEVICES) {
  if (only && !d.n.includes(only)) continue;
  for (const scheme of ["light", "dark"]) {
    const { ctx, page, errors } = await newPage(browser, d, { scheme });
    await scrollThrough(page);
    const r = await page.evaluate(inPage);
    r.dev = d.n; r.scheme = scheme; r.errors = errors.filter(e => !/fonts\.(googleapis|gstatic)/.test(e));
    r.hscroll = r.sw > r.vw;
    if (shotsFor.has(d.n)) {
      await page.screenshot({ path: `shots/${d.n}-${scheme}-top.png` });
      if (scheme === "light" && d.w <= 1400) await page.screenshot({ path: `shots/${d.n}-${scheme}-full.png`, fullPage: true });
    }
    report.push(r);
    const fail = r.hscroll || r.over.length || r.clip.length || r.tapSmall.length || r.errors.length;
    if (fail) bad++;
    console.log(`${fail ? "FAIL" : "ok  "} ${d.n.padEnd(22)} ${scheme.padEnd(5)} vw${r.vw} sw${r.sw} over${r.over.length} clip${r.clip.length} tap<24:${r.tapSmall.length} tap<44:${r.tapMid.length} tiny${r.tiny.length} err${r.errors.length} cls${(r.cls || 0).toFixed(3)}`);
    await ctx.close();
  }
}
await browser.close();
fs.writeFileSync("layout-report.json", JSON.stringify(report, null, 1));
console.log("failures:", bad, "of", report.length);
