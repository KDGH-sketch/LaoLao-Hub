// The welcome page's built-in defaults (js/learner/welcome-data.js) and the starter content (data/seed.json) must match,
// so demo mode, the missing-table fallback and a fresh import show the same page. Also checks the map projection,
// the editors' validation (js/admin/welcome-admin.js checkWebItem) and that every place is inside Laos.
// Run: node scripts/test_welcome_data.mjs
import fs from "fs";
import * as W from "../js/learner/welcome-data.js";

let failed = 0;
const ok = (c, m) => { console.log((c ? "  PASS " : "  FAIL ") + m); if (!c) failed++; };
const seed = JSON.parse(fs.readFileSync(new URL("../data/seed.json", import.meta.url), "utf8"));
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

ok(same(seed.welcome, W.WELCOME), "settings.welcome in the seed = WELCOME defaults");
ok(same(seed.places, W.PLACES), "places in the seed = defaults (" + W.PLACES.length + ")");
ok(same(seed.festivals, W.FESTIVALS), "festivals in the seed = defaults (" + W.FESTIVALS.length + ")");
ok(same(seed.resources, W.RESOURCES), "resources in the seed = defaults (" + W.RESOURCES.length + ")");
ok(seed.offers.length === 1 && seed.offers[0].active === false && same(seed.offers[0], W.SAMPLE_OFFER), "the example offer ships inactive");
ok(seed.culture.filter(c => c.featured).length === 3 && seed.releases.filter(r => r.featured && r.status === "published").length === 1, "news: 3 culture stories and 1 release featured");

// pins: the projection reproduces the approved mockup's positions
const PINS = { luangprabang:[27.49,30.86], vangvieng:[31.43,41.78], phonsavan:[41.03,35.77], vientiane:[33.38,52.65], champasak:[74.74,88.10], siphandon:[76.26,96.59] };
for (const p of W.PLACES){ const at = W.project(p.lat, p.lon), m = PINS[p.id];
  ok(m && Math.abs(at.x - m[0]) < 0.2 && Math.abs(at.y - m[1]) < 0.2, `${p.id}: pin at ${at.x}%, ${at.y}% (mockup ${m})`); }
ok(W.PLACES.every(p => W.inLaos(p.lat, p.lon)), "every place is inside Laos");
ok(!W.inLaos(13.5, 105) && !W.inLaos(18, 108.2) && !W.inLaos(23, 102) && W.inLaos(17.97, 102.6), "inLaos rejects points outside the bounds");
ok(W.FESTIVALS.every(f => f.month >= 1 && f.month <= 12) && W.FESTIVALS.every(f => W.FEST_ART.includes(f.art)), "festivals: months 1-12, known art");
ok(W.PLACES.every(p => W.SCENES.includes(p.scene)), "places: known scenes");
// every text that admins edit has English, Lao and Chinese in the defaults
const missing = [];
const walk = (v, path) => { if (Array.isArray(v)) v.forEach((x, i) => walk(x, path + "[" + i + "]"));
  else if (v && typeof v === "object"){ const k = Object.keys(v); if (k.length && k.every(x => ["en","lo","zh"].includes(x))){ for (const l of ["en","lo","zh"]) if (!v[l]) missing.push(path + "." + l); } else k.forEach(x => walk(v[x], path + "." + x)); } };
walk({ W: W.WELCOME, P: W.PLACES, F: W.FESTIVALS, R: W.RESOURCES }, "");
ok(!missing.length, "all default texts exist in en / lo / zh" + (missing.length ? ": " + missing.slice(0, 6).join(", ") : ""));

// editors' checks (js/admin/web-checks.js)
const { checkWebItem } = await import("../js/admin/web-checks.js").catch(e => { console.log(e); return { checkWebItem: null }; });
if (checkWebItem){
  const good = W.PLACES[0];
  ok(checkWebItem("places", good).errors.length === 0, "a default place passes the checks");
  ok(checkWebItem("places", Object.assign({}, good, { lat: 25 })).errors.length > 0, "a place outside Laos is refused");
  ok(checkWebItem("places", Object.assign({}, good, { text: { en: "<b>hi</b>", lo: "ສະບາຍດີ", zh: "你好" } })).errors.some(e => /HTML/.test(e)), "HTML in a text is refused");
  ok(checkWebItem("places", Object.assign({}, good, { imageUrl: "https://x.example/a.jpg", imageAlt: { en: "", lo: "", zh: "" } })).errors.length > 0, "a photo without alt text is refused");
  ok(checkWebItem("places", Object.assign({}, good, { imageUrl: "javascript:alert(1)" })).errors.length > 0, "a non-https link is refused");
  ok(checkWebItem("places", Object.assign({}, good, { badge: { en: "New", lo: "", zh: "" } })).warnings.some(w => /Lao missing/.test(w)), "a missing Lao text is a visible warning");
  ok(checkWebItem("offers", { title: { en: "x" }, startsAt: "2026-12-01", endsAt: "2026-11-01" }).errors.length > 0, "an offer that ends before it starts is refused");
  ok(checkWebItem("festivals", { title: { en: "x" }, month: 13 }).errors.length > 0, "month 13 is refused");
} else { ok(false, "admin checks could not be loaded"); }

console.log(failed ? `\n${failed} welcome data checks FAILED` : "\nAll welcome data checks passed");
process.exit(failed ? 1 : 0);
