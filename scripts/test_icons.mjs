// The logo and app icons (built by scripts/build_icons.mjs): every file the pages, manifest and service worker point to
// exists, PNGs have the size they claim, and the SVGs are clean enough to inline and scale.
// Run: node scripts/test_icons.mjs
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = f => fs.readFileSync(path.join(ROOT, f));
let failed = 0;
const ok = (c, m, d) => { console.log((c ? "  PASS " : "  FAIL ") + m + (!c && d !== undefined ? "  → " + JSON.stringify(d) : "")); if (!c) failed++; };
const pngSize = f => { const b = read(f); return b.toString("ascii", 1, 4) === "PNG" ? [b.readUInt32BE(16), b.readUInt32BE(20)] : null; };

console.log("SVG files");
for (const f of ["logo-mark.svg", "icon.svg"]){
  const s = read(f).toString();
  ok(/viewBox="0 0 512 512"/.test(s) && !/\swidth="/.test(s.slice(0, 200)), f + ": 0 0 512 512 frame, no fixed size (scales with CSS)");
  ok(/role="img"/.test(s) && /<title>LaoLao<\/title>/.test(s), f + ": has a name for screen readers");
  const ids = [...s.matchAll(/id="([^"]+)"/g)].map(m => m[1]);
  ok(ids.every(i => /^(ll|logo)-/.test(i)), f + ": ids are prefixed, so two logos on one page don't clash", ids);
  ok(!/#000000|#000"/i.test(s), f + ": no leftover black from the trace");
  ok(s.length < 6000, f + ": small (" + s.length + " bytes)");
}

console.log("\nPNG files");
for (const [f, w] of [["favicon-32.png", 32], ["apple-touch-icon.png", 180], ["icon-192.png", 192], ["icon-512.png", 512], ["icon-maskable-512.png", 512]]){
  const sz = pngSize(f); ok(sz && sz[0] === w && sz[1] === w, `${f}: ${w}×${w}`, sz);
}

console.log("\nWhere they are used");
const man = JSON.parse(read("manifest.webmanifest"));
for (const i of man.icons){
  ok(fs.existsSync(path.join(ROOT, i.src)), "manifest icon exists: " + i.src);
  if (i.type === "image/png"){ const [w] = i.sizes.split("x").map(Number); ok(pngSize(i.src)[0] === w, `manifest size matches the file: ${i.src} ${i.sizes}`); }
}
ok(man.icons.some(i => i.purpose === "maskable" && i.type === "image/png") && !man.icons.some(i => /any maskable/.test(i.purpose || "")),
  "a separate maskable icon (one icon for both purposes gets cropped on Android)");
ok(man.icons.some(i => i.sizes === "192x192") && man.icons.some(i => i.sizes === "512x512"), "192 and 512 PNGs for installing");
for (const page of ["index.html", "admin/index.html"]){
  const s = read(page).toString(), base = page.includes("/") ? "../" : "";
  const links = [...s.matchAll(/<link rel="(icon|apple-touch-icon)" href="([^"]+)"/g)].map(m => [m[1], m[2]]);
  ok(links.some(([r, f]) => r === "apple-touch-icon" && /\.png$/.test(f)), page + ": iPhone icon is a PNG (iOS ignores SVG there)");
  ok(links.length >= 3 && links.every(([, f]) => fs.existsSync(path.join(ROOT, page, "..", f))), page + ": every icon link points to a real file", links);
  ok(links.every(([, f]) => f.startsWith(base)), page + ": icon links are relative to the page");
}
const sw = read("sw.js").toString();
for (const f of ["icon.svg", "logo-mark.svg", "favicon-32.png", "apple-touch-icon.png"]) ok(sw.includes(`"${f}"`), "works offline: sw.js caches " + f);
ok(sw.includes('"js/shared/logo-data.js"'), "works offline: sw.js caches the inline logo data");
ok(/id="logo-circle"/.test(read("logo-mark.svg")) && /id="logo-letter-big"/.test(read("logo-mark.svg")) && /id="logo-letter-small"/.test(read("logo-mark.svg")), "logo-mark.svg parts have their ids");

console.log(failed ? `\n${failed} icon checks FAILED` : "\nAll icon checks passed");
process.exit(failed ? 1 : 0);
