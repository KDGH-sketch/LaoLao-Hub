// Builds every logo and app icon from the traced logo in assets/brand/logo-mark-source.svg.
// Run after changing the source:  node scripts/build_icons.mjs
//
//   logo-mark.svg          the logo inside the app (sidebars, top bar, welcome page)
//   icon.svg               browser tab icon: the big letter only, larger, so it stays readable at 16-32 px
//   favicon-32.png         the same for browsers without SVG tab icons
//   apple-touch-icon.png   iPhone / iPad home screen (180 px, square, no transparency; iOS rounds the corners)
//   icon-192.png, icon-512.png   Android / desktop install icons (round logo, transparent corners)
//   icon-maskable-512.png  Android adaptive icon: full-bleed blue, letters inside the middle 80 % safe zone
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { launch } from "./lib/cdp.mjs";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const src = fs.readFileSync(path.join(ROOT, "assets/brand/logo-mark-source.svg"), "utf8");

// Brand colours. The small letter was black in the trace; a deep navy keeps the two-tone idea but belongs to the palette.
export const BRAND = { dark: "#023dbd", mid: "#2d82dc", light: "#57c7fb", big: "#ffffff", small: "#0a2a6b" };

// ---- read the trace and move it to a 0 0 512 512 frame ----
const vb = src.match(/viewBox="([^"]+)"/)[1].split(/\s+/).map(Number);
const S = 512 / vb[2], X = v => (v - vb[0]) * S, Y = v => (v - vb[1]) * S;
const dOf = id => src.match(new RegExp(`id="${id}"[^>]*\\sd="([^"]+)"`))[1];
const g = src.match(/x1="([\d.]+)" y1="([\d.]+)" x2="([\d.]+)" y2="([\d.]+)"/).slice(1).map(Number);
const GRAD = [X(g[0]), Y(g[1]), X(g[2]), Y(g[3])];

// a path is a list of [command, [x, y, ...]] (the trace only uses absolute M, C and Z)
function parse(d){
  const out = []; let m; const re = /([MCZ])([^MCZ]*)/gi;
  while ((m = re.exec(d))){ const n = (m[2].match(/-?[\d.]+/g) || []).map(Number); out.push([m[1].toUpperCase(), n]); }
  return out;
}
const mapPts = (p, f) => p.map(([c, n]) => { const o = []; for (let i = 0; i < n.length; i += 2){ const [x, y] = f(n[i], n[i + 1]); o.push(x, y); } return [c, o]; });
const fmt = v => { const s = (Math.round(v * 10) / 10).toFixed(1).replace(/\.0$/, ""); return s === "-0" ? "0" : s; };
// compact path text: numbers to 0.1 px (invisible at any icon size), no separator before a minus sign
const str = p => p.map(([c, n]) => c + n.map(fmt).join(" ").replace(/ -/g, "-")).join("");
const bbox = p => { const xs = [], ys = []; p.forEach(([, n]) => n.forEach((v, i) => (i % 2 ? ys : xs).push(v))); return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)]; };

const big = mapPts(parse(dOf("logo-letter-big")), (x, y) => [X(x), Y(y)]);
const small = mapPts(parse(dOf("logo-letter-small")), (x, y) => [X(x), Y(y)]);
// scale about the centre (256, 256)
const around = (p, k, dx = 0, dy = 0) => mapPts(p, (x, y) => [256 + (x - 256) * k + dx, 256 + (y - 256) * k + dy]);

const grad = id => `<linearGradient id="${id}" gradientUnits="userSpaceOnUse" x1="${fmt(GRAD[0])}" y1="${fmt(GRAD[1])}" x2="${fmt(GRAD[2])}" y2="${fmt(GRAD[3])}">` +
  `<stop offset="0" stop-color="${BRAND.dark}"/><stop offset=".5" stop-color="${BRAND.mid}"/><stop offset="1" stop-color="${BRAND.light}"/></linearGradient>`;
const svg = (body, id, title = "LaoLao") =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" role="img" aria-label="${title}"><title>${title}</title><defs>${grad(id)}</defs>${body}</svg>\n`;
const letters = (b, s) => `<path fill="${BRAND.big}" fill-rule="evenodd" d="${str(b)}"/>` + (s ? `<path fill="${BRAND.small}" fill-rule="evenodd" d="${str(s)}"/>` : "");

// The whole logo: disc + both letters, clipped to the disc (the small letter's edge touches the rim)
const LOGO = svg(`<clipPath id="ll-logo-c"><circle cx="256" cy="256" r="256"/></clipPath><circle cx="256" cy="256" r="256" fill="url(#ll-logo-g)"/>` +
  `<g clip-path="url(#ll-logo-c)">` + letters(big, small) + `</g>`, "ll-logo-g");

// Tab icon: big letter only, centred and enlarged so it reads at 16 px
const [bx0, by0, bx1, by1] = bbox(big), bw = bx1 - bx0, bh = by1 - by0;
const kFav = 330 / Math.max(bw, bh);
const favBig = mapPts(big, (x, y) => [256 + (x - (bx0 + bw / 2)) * kFav, 256 + (y - (by0 + bh / 2)) * kFav]);
const FAVICON = svg(`<circle cx="256" cy="256" r="256" fill="url(#ll-fav-g)"/>` + letters(favBig), "ll-fav-g");

// Square, full-bleed versions: the round logo on a deeper navy square, so the small letter's sweep still ends at the disc edge
const square = (k, id) => svg(`<linearGradient id="${id}b" x1="0" y1="1" x2="1" y2="0"><stop offset="0" stop-color="#011a55"/><stop offset="1" stop-color="#0a3f9e"/></linearGradient>` +
  `<clipPath id="${id}c"><circle cx="256" cy="256" r="${fmt(256 * k)}"/></clipPath>` +
  `<rect width="512" height="512" fill="url(#${id}b)"/><g transform="translate(${fmt(256 - 256 * k)} ${fmt(256 - 256 * k)}) scale(${k})"><circle cx="256" cy="256" r="256" fill="url(#${id})"/></g>` +
  `<g clip-path="url(#${id}c)">` + letters(around(big, k), around(small, k)) + `</g>`, id);
const MASKABLE = square(0.78, "ll-mask-g");     // Android keeps a centred circle of 80 % (radius 205 px); the disc is 200 px
const APPLE = square(0.86, "ll-apple-g");       // iOS rounds the corners only

// sanity checks: everything inside its frame
const far = (p, k = 1) => Math.max(...p.flatMap(([, n]) => n.filter((_, i) => i % 2 === 0).map((x, i) => Math.hypot((x - 256) * k, (n[i * 2 + 1] - 256) * k))));
const reach = Math.max(far(big), far(small));
if (256 * 0.78 > 205) throw new Error("the maskable disc leaves the safe zone");

const write = (f, s) => { fs.writeFileSync(path.join(ROOT, f), s); console.log(`  ${f.padEnd(24)} ${String(Buffer.byteLength(s)).padStart(6)} bytes`); };
console.log("SVG");
write("logo-mark.svg", LOGO);
write("icon.svg", FAVICON);
fs.mkdirSync(path.join(ROOT, "assets/brand"), { recursive: true });
write("assets/brand/maskable.svg", MASKABLE);
write("assets/brand/apple-touch.svg", APPLE);

// ---- PNGs, drawn by headless Chrome ----
console.log("PNG");
const b = await launch({ width: 600, height: 600 });
try {
  const png = async (svgText, size, file) => {
    const data = await b.eval(`new Promise((res, rej) => { const img = new Image(); img.onload = () => {
      const c = document.createElement("canvas"); c.width = c.height = ${size}; const x = c.getContext("2d");
      x.imageSmoothingQuality = "high"; x.drawImage(img, 0, 0, ${size}, ${size}); res(c.toDataURL("image/png").split(",")[1]); };
      img.onerror = rej; img.src = "data:image/svg+xml;base64," + ${JSON.stringify(Buffer.from(svgText).toString("base64"))}; })`);
    const buf = Buffer.from(data, "base64"); fs.writeFileSync(path.join(ROOT, file), buf);
    console.log(`  ${file.padEnd(24)} ${String(buf.length).padStart(6)} bytes  ${size}×${size}`);
  };
  await png(FAVICON, 32, "favicon-32.png");
  await png(APPLE, 180, "apple-touch-icon.png");
  await png(LOGO, 192, "icon-192.png");
  await png(LOGO, 512, "icon-512.png");
  await png(MASKABLE, 512, "icon-maskable-512.png");
} finally { await b.close(); }
