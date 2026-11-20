// Promotions in the app, in DEMO mode (js/learner/promo.js, docs/PROMOTIONS.md):
// a free account sees the promotion pop-up once per sign-in (not again on reload, again after signing out and in), a
// Premium account never; an offer placed "Pop-up in the app" comes first, else the running offer for a paid plan, else
// the recommended plan (unless switched off); the button goes to that plan's checkout; the locked screen and the plans
// page show the sale; phone bottom sheet with no sideways scroll; Day and Night; no console errors.
// Run: node scripts/e2e_promo.mjs   (Chrome or Edge required)
import fs from "fs";
import path from "path";
import { launch, sleep } from "./lib/cdp.mjs";
import { startDemoServer, ROOT } from "./lib/demo-server.mjs";

const SHOTS = path.join(ROOT, "e2e-screenshots"); fs.mkdirSync(SHOTS, { recursive: true });
const srv = await startDemoServer();
const b = await launch({ width: 1366, height: 900 });
const PW = "demo1234", J = JSON.stringify;
let failed = 0;
const ok = (c, m, d) => { console.log((c ? "  PASS " : "  FAIL ") + m + (!c && d !== undefined ? "  → " + J(d).slice(0, 300) : "")); if (!c) failed++; };
const step = s => console.log("\n" + s);
const text = () => b.eval(`document.body.innerText`);
const errors = () => b.consoleLog.filter(l => /^exception|^error/.test(l) && !/youtube|ytimg|favicon|net::ERR|Failed to load resource/i.test(l));
const api = expr => b.eval(`(async () => { const { getApi } = await import("/js/api/index.js"); const api = await getApi(); const C = await import("/js/shared/content.js"); ${expr} })()`);
const publish = () => api(`await C.buildBundles(api, "e2e"); await api._flush(); return true;`);
const promoOpen = () => b.eval(`!!document.querySelector(".dialog.promo-dlg:not(.out)")`);
const promoText = () => b.eval(`(document.querySelector(".dialog.promo-dlg") || {}).innerText || ""`);

async function signOut(){ await b.eval(`(async () => { try { (await import("/js/learner/promo.js")).forgetPromo(); } catch(e){} const { getApi } = await import("/js/api/index.js"); await (await getApi()).auth.signOut(); })()`); await sleep(1200); }
async function login(email, hash = ""){
  await b.goto(srv.base + "/?r=" + Date.now() + hash);
  await b.waitFor(`!!document.querySelector("#em") || !!document.querySelector(".app")`, 60000);
  await b.eval(`try { localStorage.setItem("laolao.promo.test", "1"); localStorage.setItem("xuelu.lang", "en"); } catch(e){}`);
  if (await b.eval(`!!document.querySelector(".app")`)){ await signOut(); await b.goto(srv.base + "/?r=" + Date.now() + hash); await b.waitFor(`!!document.querySelector("#em")`, 60000); }
  await b.eval(`(() => { const e = document.querySelector("#em"), p = document.querySelector("#pw"); e.value = ${J(email)}; p.value = ${J(PW)}; (e.form || p.form).requestSubmit(); })()`);
  await b.waitFor(`!!document.querySelector(".app")`, 30000); await sleep(2200);
}
const closePromo = async () => { await b.eval(`document.querySelector(".dialog.promo-dlg .promo-later")?.click()`); await sleep(500); };

try {
  step("a free account: the running offer, once per sign-in");
  await b.goto(srv.base + "/"); await b.waitFor(`!!document.querySelector("#em") || !!document.querySelector(".app")`, 60000);
  // the demo's sample offer (Premium, 30% off, a countdown) is the running offer for a paid plan
  await api(`const o = await api.db.get("offers/sample-premium"); await api.db.set("offers/sample-premium", Object.assign(o || {}, { status:"published", access:"public", active:true, placement:"promotions", planId:"premium", startsAt:"2026-01-01", endsAt:"2099-12-31T23:59:00" })); await api._flush(); return true;`);
  await publish();
  await login("free@demo.laolao");
  ok(await promoOpen(), "after signing in, the promotion pops up");
  const pt = await promoText();
  ok(/30%/.test(pt) && /Premium/.test(pt) && /Ends in/.test(pt) && /Get Premium/.test(pt), "it shows the offer: discount, plan, countdown, and 'Get Premium'", pt.slice(0, 200));
  ok(!/Create a free account/.test(pt), "the visitor wording ('Create a free account') is replaced inside the app");
  await b.screenshot(path.join(SHOTS, "promo-desktop.png"));
  await closePromo();
  ok(!(await promoOpen()), "Maybe later closes it");
  await b.goto(srv.base + "/?r=" + Date.now()); await b.waitFor(`!!document.querySelector(".app")`, 30000); await sleep(2200);
  ok(!(await promoOpen()), "a reload in the same sign-in does not show it again");
  await b.goto(srv.base + "/?r=" + Date.now() + "#learn"); await b.waitFor(`!!document.querySelector(".app")`, 30000); await sleep(2200);
  ok(!(await promoOpen()), "opening the lessons does not show it again either");
  const views = await api(`await api.auth.current(); return (await api.db.list("activity")).filter(a => a.type === "promo_view").length;`);
  ok(views >= 1, "the view is recorded for the admin (activity: promo_view)", views);

  step("Get Premium goes to the package purchase");
  await login("free@demo.laolao");
  ok(await promoOpen(), "signing out and in again shows it again");
  await b.eval(`document.querySelector(".dialog.promo-dlg .promo-cta").click()`); await sleep(1500);
  ok(await b.eval(`!!document.querySelector(".bill-checkout")`) && /Premium/.test(await text()), "the button opens the Premium checkout");

  step("an offer made for the app comes first");
  await api(`await api.db.set("offers/app-sale", { status:"published", access:"public", active:true, order:0, placement:"app", planId:"premium", kind:"banner", title:{ en:"Lao New Year sale" }, text:{ en:"Two months for the price of one." }, discountText:{ en:"2 for 1" }, ctaLabel:{ en:"Claim the sale" }, startsAt:"2026-01-01", endsAt:"2099-01-01" }); await api._flush(); return true;`);
  await publish();
  await login("free@demo.laolao");
  const at = await promoText();
  ok(/Lao New Year sale/.test(at) && /2 for 1/.test(at) && /Claim the sale/.test(at), "the app offer, with its own button text", at.slice(0, 160));
  await closePromo();

  step("no offer running: the recommended plan, unless switched off");
  await api(`for (const id of ["app-sale","sample-premium"]){ const o = await api.db.get("offers/" + id); await api.db.set("offers/" + id, Object.assign(o, { active:false })); } await api._flush(); return true;`);
  await publish();
  await login("free@demo.laolao");
  const pp = await promoText();
  ok(await promoOpen() && /Unlock all of LaoLao with Premium/.test(pp) && /from .*\/ month/.test(pp), "an ad for the recommended plan, with its price", pp.slice(0, 160));
  await closePromo();
  await api(`await api.db.set("settings/app", { promoPlanAd:false }, true); await api._flush(); return true;`);
  await login("free@demo.laolao");
  ok(!(await promoOpen()), "with 'Upgrade pop-up without an offer' switched off, nothing pops up");
  await api(`await api.db.set("settings/app", { promoPlanAd:true }, true); const o = await api.db.get("offers/sample-premium"); await api.db.set("offers/sample-premium", Object.assign(o, { active:true })); await api._flush(); return true;`);
  await publish();

  step("Premium accounts never see it");
  await login("learner@demo.laolao");
  ok(!(await promoOpen()), "a Premium account signs in without a promotion");

  step("locked content: the sale and the way to buy");
  // plan access as the admin would set it: Free has no tone lab, Premium has it
  await api(`await api.db.set("plans/free", { entitlements: { "dictionary.search": true } }, true); await api.db.set("plans/standard", { entitlements: { "dictionary.search": true } }, true);
    await api.db.set("plans/premium", { entitlements: { "dictionary.search": true, "tones.lab": true } }, true); await api._flush(); return true;`);
  await login("free@demo.laolao", "#tone_lab");
  await closePromo();
  await b.goto(srv.base + "/?r=" + Date.now() + "#tone_lab"); await b.waitFor(`!!document.querySelector(".app")`, 30000); await sleep(1500);
  ok(await b.eval(`!!document.querySelector("main .lockp .lockp-sale")`) && /30%/.test(await b.eval(`document.querySelector("main .lockp").innerText`)), "the locked screen shows what is on sale for the plan it needs");
  await b.eval(`[...document.querySelectorAll("main .lockp button")].find(x => /Upgrade to/.test(x.innerText)).click()`); await sleep(1200);
  ok(await b.eval(`!!document.querySelector(".bill-grid")`) && await b.eval(`!!document.querySelector(".stack-l > .lockp-sale")`) && await b.eval(`!!document.querySelector(".bill-plan .bill-sale")`), "Upgrade opens the plans: the sale on top and a sale badge on the plan");

  step("phone, Night");
  await b.viewport(390, 844, true);
  await b.eval(`try { localStorage.setItem("laolao_theme", "night"); } catch(e){}`);
  await login("free@demo.laolao");
  const ph = await b.eval(`(() => { const d = document.querySelector(".dialog.promo-dlg"); if (!d) return null; const r = d.getBoundingClientRect(); return { bottom: Math.round(r.bottom), h: innerHeight, w: Math.round(r.width), iw: innerWidth, sw: document.documentElement.scrollWidth }; })()`);
  ok(ph && Math.abs(ph.bottom - ph.h) <= 1 && ph.w >= ph.iw - 1 && ph.sw <= ph.iw + 1, "phone: a bottom sheet across the screen, no sideways scroll", ph);
  await sleep(900); await b.screenshot(path.join(SHOTS, "promo-phone-night.png"));
  await b.eval(`try { localStorage.setItem("laolao_theme", "day"); localStorage.removeItem("laolao.promo.test"); } catch(e){}`);
  ok(!errors().length, "no console errors", errors());
} catch(e){ console.log("  FAIL crashed: " + (e && e.stack || e)); failed++; }

console.log(failed ? `\n${failed} promotion checks FAILED` : "\nAll promotion checks passed");
await b.close?.(); srv.close?.();
process.exit(failed ? 1 : 0);
