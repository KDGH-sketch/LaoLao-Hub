// Promotions inside the app (docs/PROMOTIONS.md):
//   - the promotion pop-up a FREE account sees once per sign-in, right after the app opens (from the welcome page or
//     straight into a lesson): an offer placed "Pop-up in the app", else a running offer for a paid plan, else an ad
//     for the recommended plan (Admin → Settings can switch that last one off);
//   - the sale strip on a locked screen: what is on sale for the plan the learner needs, with a button straight to its
//     checkout (js/learner/upgrade.js lockedPanel).
// Offers come from the public bundle (A.B.offers: Published, Public); they are shown only while Active and inside their
// dates. Views and clicks are written to the learner's own activity (type promo_view / promo_click) for the admin.
import { h, icon, dialog, tr, reducedMotion } from "../shared/ui.js";
import { t, lang } from "../shared/i18n.js";
import { planPrice, money, enabledMethods, methodCurrency } from "../shared/billing.js";
import { planLabel as sharedPlanLabel } from "../shared/plan-format.js";
import { A } from "./core.js";

export const PROMO_KEY = "laolao.promo.seen";          // + ":" + uid, in sessionStorage: once per sign-in (cleared on sign-out)
const LT = o => o == null ? "" : typeof o === "string" ? o : tr(o, lang());
const planLabel = p => sharedPlanLabel(p, lang());
const FOCUS_RE = /^\d{1,3}(\.\d)?% \d{1,3}(\.\d)?%$/;

export const isPaidPlan = p => !!p && ["month", "year"].some(c => ["USD", "LAK"].some(cur => +planPrice(p, c, cur) > 0));
const planById = id => (A.plans || []).find(p => p.id === id && p.active !== false) || null;
// free: not an admin, and no PAID plan running now (an "active" free plan is still free; grace days count as paid)
export const isFreeAccount = () => !A.isAdmin && !!A.ent && A.ent.status !== "admin"
  && !(["active", "trial", "grace"].includes(A.ent.status) && isPaidPlan((A.plans || []).find(p => p.id === A.ent.planId)));

// offers that are switched on and inside their dates, in the admin's order
export function liveOffers(){
  const now = Date.now(), ms = v => v ? Date.parse(v) : NaN;
  return ((A.B && A.B.offers) || []).filter(o => o && o.active === true && o.status !== "archived" && (o.access || "public") === "public"
    && !(ms(o.startsAt) > now) && !(ms(o.endsAt) <= now)).sort((a, b) => (a.order || 0) - (b.order || 0));
}
// the offer for one plan (the locked screen), preferring one made for the app
export function offerForPlan(planId){
  if (!planId) return null;
  const list = liveOffers().filter(o => o.planId === planId);
  return list.find(o => o.placement === "app") || list[0] || null;
}
// what the pop-up shows: { offer, plan } or null
export function pickPromo(){
  const offers = liveOffers();
  const forApp = offers.find(o => o.placement === "app" && (!o.planId || isPaidPlan(planById(o.planId))));
  if (forApp) return { offer: forApp, plan: planById(forApp.planId) };
  const onSale = offers.find(o => o.planId && isPaidPlan(planById(o.planId)));
  if (onSale) return { offer: onSale, plan: planById(onSale.planId) };
  if (A.settings && A.settings.promoPlanAd === false) return null;
  const paid = (A.plans || []).filter(p => p.active !== false && isPaidPlan(p));
  const plan = paid.find(p => p.recommended || p.highlight) || paid.sort((a, b) => ((+a.tier || 1) - (+b.tier || 1)))[0];
  return plan ? { offer: null, plan } : null;
}

function fromPrice(plan){
  if (!plan) return "";
  const curs = [...new Set(enabledMethods(A.settings).map(m => methodCurrency(A.settings, m)))];
  for (const c of (curs.length ? curs : ["LAK", "USD"])){ const v = planPrice(plan, "month", c); if (v) return t("bl_from", { a: money(v, c, lang()) }); }
  return "";
}
const track = (type, ref) => { try { A.api.db.add("activity", { uid: A.user.uid, name: (A.profile && A.profile.name) || "", type, ref: ref || "", at: new Date() }).catch(() => {}); } catch(e){} };

// a countdown to the offer's end: "2 d 04 h 31 min", updated every 30 s while on screen
function countdown(endsAt){
  if (!endsAt || isNaN(Date.parse(endsAt))) return null;
  const el = h("div", { class: "promo-count", role: "timer" });
  const tick = () => { const left = Math.max(0, Date.parse(endsAt) - Date.now()), d = Math.floor(left / 864e5), hh = Math.floor(left / 36e5) % 24, mm = Math.floor(left / 6e4) % 60;
    el.setAttribute("aria-label", t("wl_offer_ends", { d, h: hh, m: mm }));
    el.replaceChildren(h("span", { class: "promo-count-l" }, icon("clock"), t("pr_ends")),
      ...[[d, "wl_days"], [String(hh).padStart(2, "0"), "wl_hours"], [String(mm).padStart(2, "0"), "wl_min"]].map(([v, k]) => h("div", null, h("b", null, String(v)), h("small", null, t(k))))); };
  tick();
  const id = setInterval(() => { if (!el.isConnected) return clearInterval(id); tick(); }, 30000);
  return el;
}

// "Upgrade" from a promotion: straight to the checkout of its plan (back here after paying), or the plans page
async function buy(plan, offer){
  track("promo_click", offer ? offer.id : plan ? "plan:" + plan.id : "");
  const { saveReturn } = await import("./upgrade.js");
  saveReturn();
  if (plan) A.go("checkout", { plan: plan.id, cycle: "month" }); else A.go("plans");
}

// ---------- the pop-up ----------
export function promoSheet({ offer, plan }){
  const title = offer ? LT(offer.title) : t("pr_title_plan", { p: planLabel(plan) });
  const text = offer ? LT(offer.text) : t("pr_text_plan");
  const badge = offer ? (LT(offer.discountText) || LT(offer.badge)) : t("pr_badge_plan");
  // an offer written for visitors says "Create a free account": inside the app the button buys the plan instead
  const cta = (offer && offer.placement === "app" && LT(offer.ctaLabel)) || (plan ? t("pr_cta", { p: planLabel(plan) }) : t("ac_view_plans"));
  const perks = ((plan && plan.features && (plan.features[lang()] || plan.features.en)) || []).slice(0, 4);
  const photo = offer && offer.imageUrl && /^https?:\/\/|^data:image\//.test(offer.imageUrl)
    ? h("img", { class: "promo-photo", src: offer.imageUrl, alt: LT(offer.imageAlt) || "", style: FOCUS_RE.test(offer.imageFocus || "") ? "object-position:" + offer.imageFocus : null }) : null;
  const burst = h("div", { class: "promo-burst", "aria-hidden": "true" });
  if (!reducedMotion()) for (let i = 0; i < 22; i++){ const a = (i / 22) * Math.PI * 2 + Math.random() * .3, r = 90 + Math.random() * 120;
    burst.append(h("i", { style: "--tx:" + (Math.cos(a) * r).toFixed(0) + "px;--ty:" + (Math.sin(a) * r * .7).toFixed(0) + "px;--r:" + (Math.random() * 500 - 250).toFixed(0) + "deg;--d:" + (Math.random() * .15).toFixed(2) + "s" })); }
  track("promo_view", offer ? offer.id : plan ? "plan:" + plan.id : "");
  return dialog({ title: "", cls: "promo-dlg", body: close => h("div", { class: "promo" },
    h("div", { class: "promo-art" + (photo ? " has-photo" : "") }, photo || h("span", { class: "promo-glyph lo", lang: "lo", "aria-hidden": "true" }, "ລ"),
      burst, badge ? h("span", { class: "promo-badge" }, icon("spark"), badge) : null,
      h("button", { class: "ib promo-x", "aria-label": t("close"), onclick: () => close(null) }, icon("x"))),
    h("div", { class: "promo-b" },
      plan ? h("span", { class: "promo-plan" }, icon("crown"), planLabel(plan)) : null,
      h("h2", { class: "promo-t" }, title),
      text ? h("p", { class: "promo-d" }, text) : null,
      perks.length ? h("ul", { class: "promo-perks" + (lang() === "lo" ? " lo" : "") }, perks.map(x => h("li", null, icon("check"), x))) : null,
      offer ? countdown(offer.endsAt) : null,
      plan && fromPrice(plan) ? h("p", { class: "promo-price" }, fromPrice(plan)) : null,
      h("div", { class: "promo-act" },
        h("button", { class: "btn primary promo-cta", onclick: () => { close(true); buy(plan, offer); } }, icon("spark"), cta),
        h("button", { class: "btn ghost", onclick: () => { close(null); track("promo_plans", offer ? offer.id : ""); import("./upgrade.js").then(m => m.goPlans()); } }, t("pr_all_plans")),
        h("button", { class: "btn ghost promo-later", onclick: () => close(null) }, t("bl_later"))))) });
}

// After the app opens: a free account sees the promotion once per sign-in (a short pause so the page appears first)
export function maybeShowPromo({ delay = 1200 } = {}){
  if (!A.user || !isFreeAccount()) return false;
  const key = PROMO_KEY + ":" + A.user.uid;
  try { if (sessionStorage.getItem(key)) return false; } catch(e){}
  // automated test browsers opt in (scripts/e2e_promo.mjs), so the other tests are not interrupted
  try { if (navigator.webdriver && !localStorage.getItem("laolao.promo.test")) return false; } catch(e){}
  const promo = pickPromo(); if (!promo) return false;
  try { sessionStorage.setItem(key, "1"); } catch(e){}
  setTimeout(() => { if (A.user && !document.querySelector(".dialog")) promoSheet(promo); else try { sessionStorage.removeItem(key); } catch(e){} }, delay);
  return true;
}
export function forgetPromo(){ try { Object.keys(sessionStorage).filter(k => k.startsWith(PROMO_KEY)).forEach(k => sessionStorage.removeItem(k)); } catch(e){} }

// ---------- the sale strip on a locked screen ----------
// (an offer for that plan, else one for a bigger plan, which also includes what is locked)
export function saleStrip(plan){
  if (!plan) return null;
  const tierOf = p => +((p && p.tier) || 1);
  const o = offerForPlan(plan.id) || liveOffers().find(x => x.planId && tierOf(planById(x.planId)) >= tierOf(plan) && isPaidPlan(planById(x.planId)));
  if (!o) return null;
  return h("div", { class: "lockp-sale", "data-offer": o.id },
    h("div", { class: "lockp-sale-h" }, h("span", { class: "promo-badge" }, icon("spark"), LT(o.discountText) || LT(o.badge) || t("pr_on_sale")), h("b", null, LT(o.title))),
    countdown(o.endsAt));
}
