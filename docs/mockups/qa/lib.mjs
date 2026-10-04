import { createRequire } from "module";
import fs from "fs";
import path from "path";
const require = createRequire(import.meta.url);
export const { chromium } = require(path.join(process.env.NODE_PATH || "", "playwright"));
const NM = path.resolve("node_modules");
// Wrap the page in the same skeleton the Artifact publisher adds (viewport meta, safe-area padding, small reset).
const SKEL_HEAD = '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><style>:root{color-scheme:light;padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px)}body{margin:0;font:14px system-ui,sans-serif;background:#fafafa}img{max-width:100%}[hidden]{display:none!important}</style></head><body>';
fs.writeFileSync(path.resolve("wrapped.html"), SKEL_HEAD + fs.readFileSync(path.resolve("..", "welcome-landing.html"), "utf8") + "</body></html>");
export const PAGE = "file://" + path.resolve("wrapped.html");
export const AXE = fs.readFileSync(path.join(NM, "axe-core/axe.min.js"), "utf8");

// Serve the real webfonts locally so text metrics match production (the sandbox cannot reach fonts.googleapis.com).
const F = (pkg, file) => path.join(NM, pkg, "files", file);
const faces = [
  ["Bricolage Grotesque", "200 800", "@fontsource-variable/bricolage-grotesque", "bricolage-grotesque-latin-wght-normal.woff2", ""],
  ["Source Sans 3", "200 900", "@fontsource-variable/source-sans-3", "source-sans-3-latin-wght-normal.woff2", ""],
  ...[400, 600, 700].flatMap(w => [
    ["Noto Sans Lao", String(w), "@fontsource/noto-sans-lao", `noto-sans-lao-lao-${w}-normal.woff2`, "U+0E80-0EFF"],
    ["Noto Sans Lao", String(w), "@fontsource/noto-sans-lao", `noto-sans-lao-latin-${w}-normal.woff2`, "U+0000-00FF"],
  ]),
  ...[600, 700].flatMap(w => [
    ["Noto Serif Lao", String(w), "@fontsource/noto-serif-lao", `noto-serif-lao-lao-${w}-normal.woff2`, "U+0E80-0EFF"],
    ["Noto Serif Lao", String(w), "@fontsource/noto-serif-lao", `noto-serif-lao-latin-${w}-normal.woff2`, "U+0000-00FF"],
  ]),
];
const css = faces.map(([fam, w, pkg, file, ur]) =>
  `@font-face{font-family:"${fam}";font-weight:${w};font-style:normal;font-display:swap;src:url(https://fonts.gstatic.com/qa/${pkg.replace("/", "_")}/${file}) format("woff2");${ur ? `unicode-range:${ur};` : ""}}`).join("\n");

export async function wireFonts(ctx) {
  await ctx.route("**/fonts.googleapis.com/**", r => r.fulfill({ status: 200, contentType: "text/css", body: css }));
  await ctx.route("**/fonts.gstatic.com/qa/**", r => {
    const u = new URL(r.request().url()).pathname.split("/").slice(2);
    const pkg = u[0].replace("_", "/"); const file = u[1];
    r.fulfill({ status: 200, contentType: "font/woff2", body: fs.readFileSync(F(pkg, file)), headers: { "access-control-allow-origin": "*" } });
  });
}

export const DEVICES = [
  // phones (portrait)
  { n: "fold-cover-280", w: 280, h: 653, dpr: 3, touch: true },
  { n: "iphone-se1-320", w: 320, h: 568, dpr: 2, touch: true },
  { n: "android-360", w: 360, h: 740, dpr: 3, touch: true },
  { n: "iphone-13-390", w: 390, h: 844, dpr: 3, touch: true },
  { n: "pixel-7-412", w: 412, h: 915, dpr: 2.6, touch: true },
  { n: "iphone-promax-430", w: 430, h: 932, dpr: 3, touch: true },
  // phones (landscape)
  { n: "phone-land-667x375", w: 667, h: 375, dpr: 2, touch: true },
  { n: "phone-land-844x390", w: 844, h: 390, dpr: 3, touch: true },
  // foldable / small tablets / tablets
  { n: "surface-duo-540", w: 540, h: 720, dpr: 2.5, touch: true },
  { n: "ipad-mini-768", w: 768, h: 1024, dpr: 2, touch: true },
  { n: "ipad-air-820", w: 820, h: 1180, dpr: 2, touch: true },
  { n: "ipad-land-1024", w: 1024, h: 768, dpr: 2, touch: true },
  { n: "ipad-pro-1024x1366", w: 1024, h: 1366, dpr: 2, touch: true },
  { n: "ipad-pro-land-1366", w: 1366, h: 1024, dpr: 2, touch: true },
  // laptops / desktops
  { n: "laptop-1280", w: 1280, h: 720, dpr: 1, touch: false },
  { n: "laptop-1366", w: 1366, h: 768, dpr: 1, touch: false },
  { n: "desktop-1440", w: 1440, h: 900, dpr: 1, touch: false },
  { n: "fhd-1920", w: 1920, h: 1080, dpr: 1, touch: false },
  { n: "qhd-2560", w: 2560, h: 1440, dpr: 1, touch: false },
  { n: "4k-3840", w: 3840, h: 2160, dpr: 1, touch: false },
];

export async function newPage(browser, d, opts = {}) {
  const ctx = await browser.newContext({
    viewport: { width: d.w, height: d.h }, deviceScaleFactor: d.dpr, hasTouch: d.touch, isMobile: d.touch && d.w < 900,
    colorScheme: opts.scheme || "light", reducedMotion: opts.reduce ? "reduce" : "no-preference",
  });
  await wireFonts(ctx);
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", e => errors.push("pageerror: " + e.message));
  page.on("console", m => { if (m.type() === "error") errors.push("console: " + m.text()); });
  page.on("requestfailed", r => errors.push("requestfailed: " + r.url().slice(0, 100)));
  await page.addInitScript(() => {
    window.__cls = 0;
    try { new PerformanceObserver(l => { for (const e of l.getEntries()) if (!e.hadRecentInput) window.__cls += e.value; }).observe({ type: "layout-shift", buffered: true }); } catch {}
  });
  await page.goto(PAGE);
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(600);
  return { ctx, page, errors };
}

export async function scrollThrough(page) {
  const h = await page.evaluate(() => document.documentElement.scrollHeight);
  const vh = await page.evaluate(() => innerHeight);
  for (let y = 0; y < h; y += Math.max(300, vh * 0.8)) { await page.evaluate(v => window.scrollTo({ top: v, behavior: "instant" }), y); await page.waitForTimeout(60); }
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
  await page.waitForTimeout(250);
}
