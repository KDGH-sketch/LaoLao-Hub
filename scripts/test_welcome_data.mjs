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
ok(same(seed.events, W.EVENTS), "life calendar events in the seed = defaults (" + W.EVENTS.length + ")");
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
  // the life calendar
  const ev = W.EVENTS.find(e => e.id === "that-luang");
  ok(W.EVENTS.every(e => checkWebItem("events", e).errors.length === 0), "every default calendar event passes the checks");
  ok(checkWebItem("events", { title: { en: "x" }, when: "date", start: "" }).errors.length > 0, "an event on a date needs a start date");
  ok(checkWebItem("events", { title: { en: "x" }, when: "date", start: "2026-11-24", end: "2026-11-01" }).errors.length > 0, "an event that ends before it starts is refused");
  ok(checkWebItem("events", { title: { en: "x" }, when: "season", monthFrom: 0, monthTo: 3 }).errors.length > 0, "a season needs both months");
  ok(checkWebItem("events", Object.assign({}, ev, { videoUrl: "http://x.example/v" })).errors.length > 0, "a video link must be https://");
  ok(checkWebItem("events", Object.assign({}, ev, { also: [] })).warnings.some(w => /lunar/i.test(w)), "a lunar date without next year's date is a visible warning");
} else { ok(false, "admin checks could not be loaded"); }

// life calendar data and date logic (js/learner/welcome-calendar-data.js, welcome-calendar.js)
const C = await import("../js/learner/welcome-calendar.js");
ok(W.EVENTS.every(e => W.EVENT_KINDS.includes(e.kind) && W.EVENT_WHEN.includes(e.when)), "events: known kinds and kinds of date");
ok(W.EVENTS.every(e => !["date", "yearly"].includes(e.when) || C.parseDay(e.start)), "events on a date have a valid start");
ok(W.EVENTS.filter(e => e.lunar && e.when === "date").every(e => (e.also || []).length), "lunar events also carry next year's date");
ok(W.EVENTS.every(e => e.title.en && e.title.lo && e.title.zh && e.summary.en && e.summary.lo && e.summary.zh), "every event has its name and summary in en / lo / zh");
ok(W.EVENTS.every(e => /[຀-໿]/.test(e.laoName || "")), "every event has a Lao name in Lao script");
const occ = (id, y) => C.occurrences(W.EVENTS.find(e => e.id === id), y).map(o => o.start.getDate() + "/" + (o.start.getMonth() + 1) + "-" + o.end.getDate() + "/" + (o.end.getMonth() + 1));
ok(occ("pi-mai", 2031).join() === "14/4-16/4", "a yearly event repeats in any year (Pi Mai 14–16 April 2031)");
ok(occ("that-luang", 2026).join() === "18/11-24/11" && occ("that-luang", 2027).join() === "8/11-14/11", "a lunar event uses this year's date, and next year's from 'also'");
ok(occ("that-luang", 2030).length === 0, "a lunar event with no date for a year is not guessed");
const cool = W.EVENTS.find(e => e.id === "cool-season");
ok(C.inSeason(cool, 12) && C.inSeason(cool, 1) && !C.inSeason(cool, 6), "a season can wrap past December (Nov–Feb)");
ok(C.moonOn(new Date(2026, 10, 24)) === "full" && C.moonOn(new Date(2026, 10, 9)) === "new" && C.moonOn(new Date(2026, 10, 16)) === null, "moon: full 24 Nov 2026, new 9 Nov 2026, nothing on 16 Nov");
const fulls = []; for (let d = new Date(2026, 0, 1); d.getFullYear() === 2026; d.setDate(d.getDate() + 1)) if (C.moonOn(d) === "full") fulls.push(d.getMonth() + 1 + "/" + d.getDate());
ok(fulls.length >= 12 && fulls.length <= 13 && fulls.includes("7/29") && fulls.includes("10/26"), "13 full moons in 2026, including Khao Phansa (29 Jul) and Ok Phansa (26 Oct): " + fulls.join(" "));
const n = C.nextOccurrence(W.EVENTS.find(e => e.id === "national-day"), new Date(2026, 11, 3));
ok(n && n.start.getFullYear() === 2027, "the next National Day after 3 Dec 2026 is in 2027");

console.log(failed ? `\n${failed} welcome data checks FAILED` : "\nAll welcome data checks passed");
process.exit(failed ? 1 : 0);
