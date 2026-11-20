// Real photos on the welcome page, in DEMO mode: the admin photo field shrinks a big phone photo before upload, the
// focus point is picked by tapping the photo, alt text is required, and the published photo appears on the page
// (festival, place, offer, resource, news, About and the hero) with its alt text and focus point, on a phone and a
// computer, in Day and Night, with no sideways scroll.
// Run: node scripts/e2e_welcome_photos.mjs   (Chrome or Edge required)
import fs from "fs";
import path from "path";
import { launch, sleep } from "./lib/cdp.mjs";
import { startDemoServer, ROOT } from "./lib/demo-server.mjs";

const SHOTS = path.join(ROOT, "e2e-screenshots"); fs.mkdirSync(SHOTS, { recursive: true });
const srv = await startDemoServer();
const b = await launch({ width: 1366, height: 900 });
let failed = 0;
const ok = (c, m, d) => { console.log((c ? "  PASS " : "  FAIL ") + m + (!c && d !== undefined ? "  → " + JSON.stringify(d).slice(0, 300) : "")); if (!c) failed++; };
const J = JSON.stringify;
const step = s => console.log("\n" + s);
const api = expr => b.eval(`(async () => { const { getApi } = await import("/js/api/index.js"); const api = await getApi(); const C = await import("/js/shared/content.js"); ${expr} })()`);
const publish = () => api(`await C.buildBundles(api, "e2e"); await api._flush(); return true;`);
// (the refused save without alt text is expected: the test triggers it on purpose)
const errors = () => b.consoleLog.filter(l => /^exception|^error/.test(l) && !/favicon|net::ERR|Failed to load resource|needs alt text/i.test(l));
// a "photo" drawn in the page: a sky, hills and a sun, as JPEG (w × h)
const PHOTO = (w, hh, q = .92) => `(() => { const c = document.createElement("canvas"); c.width = ${w}; c.height = ${hh}; const g = c.getContext("2d");
  const s = g.createLinearGradient(0, 0, 0, ${hh}); s.addColorStop(0, "#0c4a6e"); s.addColorStop(.6, "#38bdf8"); s.addColorStop(1, "#fde68a"); g.fillStyle = s; g.fillRect(0, 0, ${w}, ${hh});
  for (let i = 0; i < 60000; i++){ g.fillStyle = "hsl(" + (Math.random() * 360) + ",60%,60%)"; g.fillRect(Math.random() * ${w}, Math.random() * ${hh}, 6, 6); }
  g.fillStyle = "#fbbf24"; g.beginPath(); g.arc(${w} * .3, ${hh} * .25, ${hh} * .12, 0, 7); g.fill();
  g.fillStyle = "#0f766e"; g.beginPath(); g.moveTo(0, ${hh}); g.quadraticCurveTo(${w} * .5, ${hh} * .45, ${w}, ${hh}); g.fill();
  return c; })()`;
async function admin(){
  await b.eval(`try { localStorage.removeItem("laolao.demo.session"); } catch(e){}`).catch(() => {});
  await b.goto(srv.base + "/admin/"); await b.waitFor(`!!document.querySelector("#em") || !!document.querySelector(".app")`, 60000);
  if (!(await b.eval(`!!document.querySelector(".app")`))){
    await b.eval(`(() => { const e = document.querySelector("#em"), p = document.querySelector("#pw"); e.value = "admin@demo.laolao"; p.value = "demo1234"; (e.form || p.form).requestSubmit(); })()`);
    await b.waitFor(`!!document.querySelector(".app")`, 30000);
  }
  await sleep(1000);
}
const adminGo = async (v, p = {}) => { await b.eval(`(async () => { const st = await import("/js/admin/state.js"); st.go(${J(v)}, ${J(p)}); })()`); await sleep(1800); };
async function visitor(){
  await b.eval(`try { localStorage.removeItem("laolao.demo.session"); localStorage.setItem("xuelu.lang","en"); } catch(e){}`).catch(() => {});
  await b.goto(srv.base + "/?r=" + Date.now()); await b.waitFor(`!!document.querySelector(".wl .wl-hero")`, 60000); await sleep(2800);
}

try {
  step("the photo field in the admin (Festivals)");
  await admin();
  if (!(await api(`return !!(await api.db.get("festivals/pi-mai"));`))) await api(`await api.db.set("festivals/pi-mai", { status:"published", access:"public", month:4, art:"water", title:{ en:"Boun Pi Mai" }, laoName:"ບຸນປີໃໝ່", dateText:{ en:"13–16 April" }, text:{ en:"Lao New Year." } }); await api._flush(); return true;`);
  await adminGo("editor", { type: "festivals", id: "pi-mai" });
  const fileSel = `[...document.querySelectorAll('input[type=file]')].find(i => /image\\/png/.test(i.accept))`;
  ok(await b.eval(`!!${fileSel}`), "the festival form has a photo upload");
  // a 4000 × 3000 phone photo of several MB
  const big = await b.eval(`(async () => { const c = ${PHOTO(4000, 3000, .97)}; const blob = await new Promise(r => c.toBlob(r, "image/jpeg", 1));
    const f = new File([blob], "IMG_2041.JPG", { type: "image/jpeg" }); const dt = new DataTransfer(); dt.items.add(f); const i = ${fileSel}; i.files = dt.files; i.dispatchEvent(new Event("change", { bubbles: true })); return f.size; })()`);
  await b.waitFor(`!!document.querySelector(".pf-pick img")`, 20000).catch(() => {});
  const up = await b.eval(`(() => { const im = document.querySelector(".pf-pick img"); return { src: im ? im.src.slice(0, 22) : "", len: im ? im.src.length : 0, status: [...document.querySelectorAll('.help[role=status]')].map(x => x.innerText).join(" ") }; })()`);
  ok(big > 900e3 && up.src.startsWith("data:image/webp") && up.len * .75 < 900e3 && /resized/i.test(up.status), `a ${(big / 1e6).toFixed(1)} MB photo is resized to WebP before upload (${Math.round(up.len * .75 / 1e3)} KB): "${up.status}"`, up);
  ok(await b.eval(`document.querySelectorAll(".pf-crop").length === 3`), "wide, square and tall crop previews are shown");
  // tap the photo at 30 % across, 20 % down
  await b.eval(`(() => { const p = document.querySelector(".pf-pick"), r = p.getBoundingClientRect(); p.dispatchEvent(new MouseEvent("click", { bubbles: true, clientX: r.left + r.width * .3, clientY: r.top + r.height * .2 })); })()`); await sleep(200);
  const dot = await b.eval(`(() => { const d = document.querySelector(".pf-dot"); return d ? d.style.left + " " + d.style.top : ""; })()`);
  ok(dot === "30% 20%" && /30% 20%/.test(await b.eval(`document.querySelector(".pf-crop span").style.backgroundPosition`)), "tapping the photo sets the focus point and the crops follow it", dot);
  // saving without alt text is refused
  const jade = `[...document.querySelectorAll(".btn.jade")].pop()`;
  await b.eval(`${jade}.click()`); await sleep(1200);
  ok(/alt text/i.test(await b.eval(`document.body.innerText`)), "without alt text the photo cannot be published");
  await b.eval(`(() => { const f = [...document.querySelectorAll(".field, label, div")].find(x => /^Alt text/.test((x.firstChild && x.firstChild.textContent) || x.innerText || "") && x.querySelector("input"));
    const i = f.querySelector("input"); i.value = "Water blessing at Lao New Year"; i.dispatchEvent(new Event("input", { bubbles: true })); })()`);
  await b.eval(`${jade}.click()`); await sleep(2500);
  const saved = await api(`const d = await api.db.get("festivals/pi-mai"); return { u: (d.imageUrl || "").slice(0, 16), alt: d.imageAlt && d.imageAlt.en, f: d.imageFocus, st: d.status };`);
  ok(saved.u.startsWith("data:image/webp") && saved.alt === "Water blessing at Lao New Year" && saved.f === "30% 20%" && saved.st === "published", "saved with the photo, the alt text and the focus point", saved);

  step("the other sections: place, offer, resource, news, About, hero");
  const url = await b.eval(`${PHOTO(1200, 800)}.toDataURL("image/jpeg", .8)`);
  const P = (alt, focus) => ({ imageUrl: url, imageAlt: { en: alt }, imageFocus: focus || "" });
  await api(`
    const P = ${J(P("x"))};
    const put = async (p, d) => { const cur = (await api.db.get(p)) || {}; await api.db.set(p, Object.assign(cur, d)); };
    await put("places/luangprabang", Object.assign({ status:"published", access:"public", order:1, scene:"temple", lat:19.886, lon:102.135, title:{ en:"Luang Prabang" }, laoName:"ຫຼວງພະບາງ" }, ${J(P("Monks at dawn in Luang Prabang", "50% 70%"))}));
    await put("offers/photo-offer", Object.assign({ status:"published", access:"public", active:true, kind:"banner", placement:"promotions", title:{ en:"Photo offer" }, text:{ en:"With a picture." } }, ${J(P("A bowl of sticky rice"))}));
    await put("resources/starter-guide", Object.assign({ status:"published", access:"public", order:1, kind:"pdf", title:{ en:"Starter guide" }, url:"https://example.com/a.pdf" }, ${J(P("The starter guide cover"))}));
    await put("culture/photo-news", Object.assign({ status:"published", access:"public", featured:true, date:"2026-11-20", title:{ en:"Photo news" } }, ${J(P("A night market"))}));
    const w = await api.db.get("settings/welcome") || {}; const pub = w.published || {};
    pub.hero = Object.assign({}, pub.hero || (await import("/js/learner/welcome-data.js")).WELCOME.hero, ${J(P("The Mekong at sunset", "50% 60%"))});
    pub.about = Object.assign({}, pub.about || (await import("/js/learner/welcome-data.js")).WELCOME.about, ${J(P("Learners with a Lao teacher"))});
    await api.db.set("settings/welcome", Object.assign(w, { published: pub }));
    await api._flush(); return true;`);
  await publish();
  await visitor();
  const page = await b.eval(`(() => { const im = s => document.querySelector(s); const pos = e => e ? getComputedStyle(e).objectPosition : "";
    return { hero: !!im(".wl-hero.has-photo > img.wl-hero-photo") && getComputedStyle(im(".wl-hero .wl-scene")).display === "none", heroPos: pos(im(".wl-hero-photo")), heroAlt: im(".wl-hero-photo")?.alt,
      fest: im("#w-festivals img.wl-fphoto")?.alt, festPos: pos(im("#w-festivals img.wl-fphoto")),
      place: im("#w-journey .wl-stage img")?.alt, placePos: pos(im("#w-journey .wl-stage img")),
      offer: im("[data-offer='photo-offer'] .wl-promo-ph img")?.alt, res: im(".wl-cover.has-photo img")?.alt, news: im(".wl-thumb.has-photo img")?.alt,
      about: im(".wl-about-art.has-photo img")?.alt, sw: document.documentElement.scrollWidth, iw: innerWidth }; })()`);
  ok(page.hero && page.heroAlt === "The Mekong at sunset" && page.heroPos === "50% 60%", "hero: the photo replaces the drawn sky, with its alt text and focus", page);
  ok(page.fest === "Water blessing at Lao New Year" && page.festPos === "30% 20%", "festival calendar: the uploaded photo with the focus point picked in the admin", page);
  ok(page.place === "Monks at dawn in Luang Prabang" && page.placePos === "50% 70%", "journey: the place photo", page);
  ok(page.offer === "A bowl of sticky rice" && page.res === "The starter guide cover" && page.news === "A night market" && page.about === "Learners with a Lao teacher", "offer, free resource, news and About show their photos", page);
  ok(page.sw <= page.iw, "no sideways scroll on a computer");
  await b.screenshot(path.join(SHOTS, "welcome-photos-desktop.png"));
  await b.eval(`document.querySelector("#w-festivals").scrollIntoView()`); await sleep(900); await b.screenshot(path.join(SHOTS, "welcome-photos-festivals.png"));

  step("phone, Day and Night");
  await b.viewport(390, 844, true);
  for (const th of ["day", "night"]){
    await b.eval(`try { localStorage.setItem("laolao_theme", ${J(th)}); } catch(e){}`); await visitor();
    ok(await b.eval(`document.documentElement.scrollWidth <= innerWidth + 1 && !!document.querySelector(".wl-hero.has-photo")`), `phone (${th}): the photos fit, no sideways scroll`);
    await b.screenshot(path.join(SHOTS, `welcome-photos-phone-${th}.png`));
  }
  await b.viewport(1366, 900, false);

  step("a photo can be removed: the drawing comes back");
  await api(`const d = await api.db.get("festivals/pi-mai"); d.imageUrl = ""; await api.db.set("festivals/pi-mai", d); await api._flush(); return true;`);
  await publish(); await visitor();
  ok(await b.eval(`!document.querySelector("#w-festivals img.wl-fphoto") && document.querySelectorAll("#w-festivals .wl-fcard svg").length >= 1`), "without a photo the festival shows its drawing again");
  ok(!errors().length, "no console errors", errors());
} catch(e){ console.log("  FAIL crashed: " + (e && e.stack || e)); failed++; }

console.log(failed ? `\n${failed} welcome photo checks FAILED` : "\nAll welcome photo checks passed");
await b.close?.(); srv.close?.();
process.exit(failed ? 1 : 0);
