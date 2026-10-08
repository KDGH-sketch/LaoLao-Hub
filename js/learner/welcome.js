// The logged-out welcome page (docs/WELCOME.md, design: docs/mockups/welcome-landing.html).
// First paint uses the defaults in welcome-data.js; the published copy (settings/welcome), plans and the public (tier-0)
// bundle fill it in afterwards, each read with a time limit and never before sign-in calls an ll_* function.
// Everything editors type is inserted as text (h() makes text nodes); only the static scene art in welcome-scenes.js is HTML.
import { h, icon, brandMark, toast, errText, setTheme, getTheme, normTheme, withTransition, reducedMotion } from "../shared/ui.js";
import { t, lang, setLang } from "../shared/i18n.js";
import { speak } from "../shared/speech.js";
import { loadPublicBundle } from "../shared/content.js";
import { planPrice, money, enabledMethods, methodCurrency } from "../shared/billing.js";
import { planLabel } from "../shared/plan-format.js";
import { DEMO } from "../shared/setup.js";
import { A, createLearnerProfile, rememberPendingProfile, SIGNUP_KEY } from "./core.js";
import * as D from "./welcome-data.js";
import * as ART from "./welcome-scenes.js";

const RESOURCE_KEY = "laolao.pendingResource";
const LT = o => o == null ? "" : typeof o === "string" ? o : (o[lang()] || o.en || "");   // editor text, falling back to English
const svgHTML = html => { const t = document.createElement("template"); t.innerHTML = html; return t.content.firstElementChild; };   // trusted art only
const loEl = (tag, text, cls = "") => h(tag, { class: ("wl-lo " + cls).trim(), lang: "lo" }, text);
const within = (p, ms = 2500) => Promise.race([Promise.resolve(p).catch(() => null), new Promise(r => setTimeout(() => r(null), ms))]);
const ICONS = { book:"book", wave:"sound", pen:"pen", search:"search", repeat:"repeat", lamp:"culture" };

// ---------- attribution: where this visit came from (kept in this tab until sign-up; see createLearnerProfile) ----------
export function captureAttribution(){
  try {
    const q = new URLSearchParams(location.search), prev = JSON.parse(sessionStorage.getItem(SIGNUP_KEY) || "null") || {};
    let ref = "";
    try { ref = document.referrer && new URL(document.referrer).host !== location.host ? new URL(document.referrer).host : ""; } catch(e){}
    const source = q.get("ref") || q.get("utm_source") || prev.source || ref || "direct";
    sessionStorage.setItem(SIGNUP_KEY, JSON.stringify(Object.assign(prev, { source, campaign: q.get("utm_campaign") || prev.campaign || null })));
  } catch(e){}
}
const remember = patch => { try { sessionStorage.setItem(SIGNUP_KEY, JSON.stringify(Object.assign(JSON.parse(sessionStorage.getItem(SIGNUP_KEY) || "{}"), patch))); } catch(e){} };

// ---------- data: defaults now, the backend when it answers ----------
function assemble({ welcome, app, plans, bundle, rows, legacy }){
  const W = Object.assign({}, D.WELCOME, welcome || {});
  W.heads = Object.assign({}, D.WELCOME.heads, (welcome && welcome.heads) || {});
  const known = new Set((W.sections || []).map(s => s.id));
  W.sections = (W.sections || []).filter(s => D.SECTION_IDS.includes(s.id)).concat(D.SECTION_IDS.filter(id => !known.has(id)).map(id => ({ id, on: true })));
  const src = rows || bundle;                                     // preview: the raw tables; visitors: the tier-0 bundle
  const live = list => (list || []).filter(x => x && x.status !== "archived" && (rows ? true : x.status === "published"));
  const byOrder = (a, b) => (a.order || 0) - (b.order || 0);
  const pick = (key, fallback) => { const l = src && Array.isArray(src[key]) ? live(src[key]) : null; return l && l.length ? l.sort(byOrder) : fallback; };
  const now = Date.now(), ms = v => v ? Date.parse(v) : NaN;
  const offers = (src && Array.isArray(src.offers) ? live(src.offers) : []).filter(o => o.active === true
    && !(ms(o.startsAt) > now) && !(ms(o.endsAt) <= now)).sort(byOrder);
  const featured = src ? (rows ? ["releases","culture"].flatMap(ty => live(src[ty]).filter(d => d.featured === true).map(d => Object.assign({ type: ty }, d)))
    : (src.catalog || []).filter(c => c.featured && ["releases","culture"].includes(c.type)).map(c => Object.assign({}, (src[c.type] || []).find(x => x.id === c.id) || {}, c))) : null;
  return {
    W, app: app || {}, plans: (plans || []).filter(p => p.active !== false && p.showOnWelcome !== false).sort((a, b) => (a.order || 0) - (b.order || 0)),
    places: pick("places", D.PLACES).filter(p => D.inLaos(p.lat, p.lon)),
    festivals: pick("festivals", D.FESTIVALS).sort((a, b) => (a.month || 0) - (b.month || 0)),
    // the old Promotions banner (settings/promotions) still counts as a free resource until an admin converts it
    resources: src && Array.isArray(src.resources) ? (live(src.resources).length || !legacy || legacy.migratedAt || legacy.active === false || !/^https:\/\//.test(legacy.link || "") ? live(src.resources).sort(byOrder)
      : [{ id:"legacy-download", kind:"pdf", glyph:"ລ", cover:1, requiresAccount:true, url: legacy.link, title: legacy.title || { en:"Free download" }, text: legacy.desc || {} }]) : D.RESOURCES,
    offers,
    news: featured ? featured.sort((a, b) => String(b.date || "").localeCompare(String(a.date || "")) || (a.order || 0) - (b.order || 0)) : D.NEWS
  };
}
async function fetchData(api, preview){
  const get = p => within(api.db.get(p));
  if (preview){
    const [draft, app, plans, ...lists] = await Promise.all([get("settings/welcomeDraft"), get("settings/app"), within(api.db.list("plans")),
      ...["places","festivals","offers","resources","releases","culture"].map(ty => within(api.db.list(ty)))]);
    const rows = {}; ["places","festivals","offers","resources","releases","culture"].forEach((ty, i) => rows[ty] = (lists[i] || []).filter(x => !String(x.id).includes("__")));
    return assemble({ welcome: draft && draft.data, app, plans, rows });
  }
  const [pub, app, plans, bundle, legacy] = await Promise.all([get("settings/welcome"), get("settings/app"), within(api.db.list("plans")), loadPublicBundle(api, 2500), get("settings/promotions")]);
  return assemble({ welcome: pub && pub.published, app, plans, bundle, legacy });
}

// ---------- page ----------
let timers = [];
export async function renderWelcome({ root, api, mode = "signin", preview = false, onLanguage }){
  timers.forEach(clearInterval); timers = [];
  captureAttribution();
  document.documentElement.lang = lang() === "zh" ? "zh-CN" : lang();
  const keep = { em: (root.querySelector("#em") || {}).value || "", nm: (root.querySelector("#nm") || {}).value || "" };
  let M = assemble({});                                         // defaults: first paint never waits
  const S = { mode, plan: null };
  root.innerHTML = "";
  const page = h("div", { class: "wl", id: "wl-top" });
  page.append(svgHTML(ART.DEFS));
  root.append(page);

  // ----- nav -----
  const scrollTo = id => { const el = page.querySelector("#w-" + id); if (el) el.scrollIntoView({ behavior: reducedMotion() ? "auto" : "smooth", block: "start" }); };
  const navBtn = (id, cls) => h("button", { type: "button", class: cls, "data-scroll": id, onclick: () => { closeSheet(); scrollTo(id); } }, LT(M.W.nav[id]));
  const themeSeg = h("div", { class: "wl-seg", role: "group", "aria-label": t("theme") },
    [["day","sun","theme_light"],["night","moon","theme_dark"],["system","monitor","theme_auto"]].map(([k, ic, l]) =>
      h("button", { type: "button", "aria-pressed": String(normTheme(getTheme()) === k), "aria-label": t(l), title: t(l), "data-theme-set": k,
        onclick: e => { const r = e.currentTarget.getBoundingClientRect(); page.querySelectorAll("[data-theme-set]").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.themeSet === k)));
          withTransition(() => setTheme(k), { kind: "theme", x: r.left + r.width / 2, y: r.top + r.height / 2 }); } }, icon(ic))));
  const langSeg = cls => h("div", { class: "wl-seg " + cls, role: "group", "aria-label": t("ui_lang") },
    [["en","EN"],["lo","ລາວ"],["zh","中文"]].map(([l, n]) => h("button", { type: "button", lang: l === "zh" ? "zh-CN" : l, "aria-pressed": String(lang() === l),
      onclick: () => { closeSheet(); setLang(l); try { localStorage.setItem("xuelu.lang", l); } catch(e){} onLanguage && onLanguage(S.mode); } }, n)));
  const links = h("nav", { class: "wl-links", "aria-label": t("wl_main_nav") });
  const sheet = h("nav", { class: "wl-sheet", id: "wl-sheet", popover: "", "aria-label": t("wl_mobile_nav") });
  const hasPopover = typeof HTMLElement !== "undefined" && "showPopover" in HTMLElement.prototype;
  function closeSheet(){ try { if (hasPopover) sheet.hidePopover(); else sheet.classList.remove("open"); } catch(e){} }
  const menuBtn = h("button", { class: "wl-btn sm wl-menu-btn", type: "button", "aria-label": t("wl_menu"), popovertarget: "wl-sheet",
    onclick: hasPopover ? null : () => sheet.classList.toggle("open") }, icon("menu"));
  const signinBtn = h("button", { class: "wl-btn sm", type: "button", id: "wl-go-signin", onclick: () => toAuth("signin") }, t("sign_in"));
  const nav = h("header", { class: "wl-nav" }, h("div", { class: "wl-nav-in" },
    h("button", { type: "button", class: "wl-brand", "aria-label": (M.app.appName || "LaoLao") + " · " + t("wl_top"), onclick: () => window.scrollTo({ top: 0, behavior: reducedMotion() ? "auto" : "smooth" }) },
      brandMark("wl-logo"), h("span", null, h("span", { class: "wl-brand-name" }, M.app.appName || "LaoLao"), h("small", { lang: "lo" }, "ຮຽນພາສາລາວ"))),
    links, h("div", { class: "wl-tools" }, themeSeg, langSeg("wl-nav-lang"), signinBtn, menuBtn)), sheet);
  const skip = h("a", { class: "wl-skip", href: "#w-main", onclick: e => { e.preventDefault(); const m = page.querySelector("#w-main"); m.focus(); m.scrollIntoView(); } }, t("wl_skip"));

  // ----- hero with the sign-in card -----
  const hero = h("div", { class: "wl-hero", id: "w-home" });
  const stars = h("div", { class: "wl-stars", "aria-hidden": "true" }), drift = h("div", { class: "wl-drift", "aria-hidden": "true" });
  const rnd = (a, b) => a + Math.random() * (b - a);
  for (let i = 0; i < 46; i++) stars.append(h("i", { style: `left:${rnd(0,100)}%;top:${rnd(0,100)}%;--s:${rnd(1,2.6).toFixed(1)}px;--d:${rnd(0,3).toFixed(1)}s` }));
  for (let i = 0; i < 16; i++) drift.append(h("i", { style: `--x:${rnd(2,98).toFixed(0)}%;--s:${rnd(7,13).toFixed(0)}px;--t:${rnd(11,20).toFixed(1)}s;--d:-${rnd(0,18).toFixed(1)}s` }));
  const heroCopy = h("div", { class: "wl-hero-copy" });
  const auth = authCard();
  hero.append(stars, drift, svgHTML(ART.HERO), h("div", { class: "wl-hero-grid" }, heroCopy,
    h("div", { class: "wl-auth-wrap" }, h("div", { class: "wl-bloom", "aria-hidden": "true" }, svgHTML(ART.CHAMPA)), auth.el)));
  if (!reducedMotion() && matchMedia("(hover:hover)").matches)
    hero.addEventListener("pointermove", e => { const r = hero.getBoundingClientRect(); hero.style.setProperty("--px", (((e.clientX - r.left) / r.width) * 2 - 1).toFixed(3)); });
  const heroStrip = h("div", { class: "wl-offer-strips" });

  const main = h("main", { class: "wl-main", id: "w-main", tabindex: "-1" });
  const sectionsBox = h("div", { class: "wl-sections" });
  main.append(heroStrip, hero, sectionsBox);
  const footer = h("footer", { class: "wl-footer" });
  page.append(...[skip, nav, preview ? h("div", { class: "wl-preview", role: "status" }, icon("eye"), t("wl_preview_banner")) : null, main, footer].filter(Boolean));

  function fillHero(){
    const H = M.W.hero;
    heroCopy.replaceChildren(
      h("span", { class: "wl-badge" }, h("i"), h("span", null, LT(H.badge))),
      h("h1", null, loEl("span", H.loWord || "ສະບາຍດີ", "wl-lo-word"), h("span", null, LT(H.h1a)), " ", h("em", null, LT(H.h1b)), " ", h("span", null, LT(H.h1c))),
      h("p", { class: "wl-lead" }, LT(H.lead)),
      h("div", { class: "wl-hero-cta" },
        h("button", { class: "wl-btn gold", type: "button", onclick: () => toAuth(M.app.allowRegistration === false ? "signin" : "register") }, h("span", null, LT(H.ctaStart)), icon("right")),
        sectionOn("journey") ? h("button", { class: "wl-btn ghost", type: "button", onclick: () => scrollTo("journey") }, LT(H.ctaTour)) : null),
      hearButton(H));
    document.title = LT(M.W.seo.title) || "LaoLao";
    let md = document.querySelector('meta[name="description"]');
    if (!md){ md = document.createElement("meta"); md.name = "description"; document.head.append(md); }
    md.content = LT(M.W.seo.description);
  }
  function hearButton(H){
    const b = h("button", { class: "wl-hear", type: "button", onclick: () => { b.classList.add("playing"); speak((H.greeting && H.greeting.lo) || "ສະບາຍດີ"); setTimeout(() => b.classList.remove("playing"), 2000); } },
      svgHTML(ART.NOP), h("span", null, h("b", { lang: "lo", class: "wl-lo" }, ((H.greeting && H.greeting.lo) || "ສະບາຍດີ") + "! · " + ((H.greeting && H.greeting.rom) || "Sabaidee")), h("small", null, LT(H.hear))),
      h("span", { class: "wl-bars", "aria-hidden": "true" }, h("span"), h("span"), h("span"), h("span")));
    return b;
  }

  // ----- sign-in card: the same sign-in, registration and reset as before -----
  function authCard(){
    const email = h("input", { class: "wl-input", type: "email", id: "em", inputmode: "email", enterkeyhint: "next", autocomplete: "username", placeholder: "name@example.com", required: true, value: keep.em });
    const pw = h("input", { class: "wl-input", type: "password", id: "pw", enterkeyhint: "go", autocomplete: "current-password", placeholder: "••••••••", minlength: "6", required: true });
    const name = h("input", { class: "wl-input", id: "nm", autocomplete: "name", placeholder: t("wl_name_ph"), value: keep.nm });
    const msg = h("p", { class: "wl-msg msg", role: "alert", hidden: true });
    const title = h("h2", { id: "wl-auth-title" }), sub = h("p", { class: "wl-sub" });
    const submitBtn = h("button", { class: "wl-btn primary", type: "submit" });
    const eye = h("button", { type: "button", class: "wl-eye", "aria-label": t("wl_show_pw"), onclick: () => { const show = pw.type === "password"; pw.type = show ? "text" : "password"; eye.setAttribute("aria-label", t(show ? "wl_hide_pw" : "wl_show_pw")); eye.replaceChildren(icon(show ? "eyeOff" : "eye")); } }, icon("eye"));
    const tabIn = h("button", { type: "button", role: "tab", id: "wl-tab-in", onclick: () => setMode("signin") }, t("sign_in"));
    const tabUp = h("button", { type: "button", role: "tab", id: "wl-tab-up", onclick: () => setMode("register") }, t("wl_tab_register"));
    const fName = h("div", { class: "wl-field" }, h("label", { for: "nm" }, t("name")), name);
    const fPw = h("div", { class: "wl-field" }, h("label", { for: "pw" }, t("password")), h("div", { class: "wl-pw" }, pw, eye));
    const forgot = h("button", { class: "wl-linkbtn", type: "button", onclick: () => setMode(S.mode === "signin" ? "reset" : "signin") });
    const planChip = h("span", { class: "wl-chip gold", hidden: true });
    const perks = h("ul", { class: "wl-perks", hidden: true }, h("li", null, icon("check"), t("wl_perk_free")), h("li", null, icon("check"), t("wl_perk_saved")));
    const closed = h("p", { class: "wl-closed", hidden: true });
    const demo = A.api && A.api.mode === "demo" ? h("div", { class: "wl-demo" },
      h("div", { class: "wl-demo-h" }, h("span", null, t("demo_accounts")), h("a", { href: "admin/", class: "wl-linkbtn" }, t("wl_admin_portal"))),
      h("div", { class: "wl-demo-b" },
        h("button", { class: "wl-btn primary sm", type: "button", onclick: () => { setMode("signin"); email.value = DEMO.premium.email; pw.value = DEMO.premium.pw; submit(); } }, t("wl_demo_premium")),
        h("button", { class: "wl-btn sm", type: "button", onclick: () => { setMode("signin"); email.value = DEMO.free.email; pw.value = DEMO.free.pw; submit(); } }, t("wl_demo_free")))) : null;
    const tabs = h("div", { class: "wl-tabs", role: "tablist", "aria-label": t("wl_account") }, tabIn, tabUp);
    const form = h("form", { class: "wl-auth auth-card auth-form", id: "wl-auth", novalidate: true, "aria-labelledby": "wl-auth-title", onsubmit: e => { e.preventDefault(); submit(); } },
      tabs, title, sub, fName, h("div", { class: "wl-field" }, h("label", { for: "em" }, t("email")), email), fPw, msg, submitBtn,
      h("div", { class: "wl-row" }, forgot, planChip), perks, closed, demo);
    const say = (text, ok = false) => { msg.hidden = !text; msg.className = "wl-msg msg" + (ok ? " ok" : ""); msg.textContent = text || ""; };
    function setMode(m, note){
      if (m === "register" && M.app.allowRegistration === false){ m = "signin"; note = null; }
      S.mode = m;
      title.textContent = t(m === "register" ? "wl_title_register" : m === "reset" ? "wl_title_reset" : "wl_title_signin");
      sub.textContent = t(m === "register" ? "wl_sub_register" : m === "reset" ? "wl_sub_reset" : "wl_sub_signin");
      submitBtn.textContent = t(m === "register" ? "wl_btn_register" : m === "reset" ? "send_reset" : "sign_in");
      tabIn.setAttribute("aria-selected", String(m !== "register")); tabUp.setAttribute("aria-selected", String(m === "register"));
      tabUp.hidden = M.app.allowRegistration === false;
      tabs.classList.toggle("one", M.app.allowRegistration === false);
      fName.hidden = m !== "register"; fPw.hidden = m === "reset"; perks.hidden = m !== "register";
      planChip.hidden = m !== "register" || !S.plan; if (S.plan) planChip.textContent = t("wl_plan_chip", { p: S.plan });
      if (demo) demo.hidden = m !== "signin";
      forgot.textContent = m === "signin" ? t("forgot") : t("wl_back_signin");
      pw.autocomplete = m === "register" ? "new-password" : "current-password"; pw.required = m !== "reset";
      closed.hidden = !(M.app.allowRegistration === false && m === "signin");
      closed.textContent = t("reg_closed") + (M.app.supportContact ? " · " + M.app.supportContact : "");
      say(note || "");
    }
    async function submit(){
      const em = email.value.trim();
      if (!/^\S+@\S+\.\S+$/.test(em)){ say(t("wl_err_email")); email.focus(); return; }
      if (S.mode !== "reset" && pw.value.length < 6){ say(t("wl_err_pw")); pw.focus(); return; }
      const label = submitBtn.textContent; submitBtn.disabled = true; submitBtn.textContent = t("wl_wait"); say("");
      try {
        if (S.mode === "signin") await A.api.auth.signIn(em, pw.value);
        else if (S.mode === "reset"){ await A.api.auth.resetPassword(em); setMode("signin", t("reset_sent")); msg.classList.add("ok"); }
        else {
          rememberPendingProfile(em, name.value.trim());                   // used if the email must be confirmed first
          let u;
          try { u = await A.api.auth.signUp(em, pw.value); }
          catch(err){ if (err.code !== "auth/confirm-email") throw err; setMode("signin"); say(err.message, true); return; }
          await createLearnerProfile(A.api, u, name.value.trim(), M.app);
          if (A.api._flush) await A.api._flush();
          location.reload();
        }
      } catch(err){ say(errText(err)); }
      finally { submitBtn.disabled = false; if (submitBtn.textContent === t("wl_wait")) submitBtn.textContent = label; }
    }
    setMode(S.mode);
    return { el: form, setMode, refresh: () => setMode(S.mode) };
  }
  // every call to action ends at the same card
  function toAuth(m, note){
    auth.setMode(m, note);
    auth.el.scrollIntoView({ behavior: reducedMotion() ? "auto" : "smooth", block: "center" });
    setTimeout(() => { try { page.querySelector(m === "register" ? "#nm" : "#em").focus({ preventScroll: true }); } catch(e){} }, 400);
  }

  // ----- sections -----
  const sectionOn = id => (M.W.sections.find(s => s.id === id) || {}).on !== false;
  const head = (id, extra) => { const H = M.W.heads[id] || {};
    return h("div", { class: "wl-sec-h wl-rv" }, H.eyebrow ? h("span", { class: "wl-eyebrow" }, LT(H.eyebrow)) : null, H.title ? h("h2", null, LT(H.title)) : null,
      H.loSub ? loEl("p", H.loSub, "wl-lo-sub") : null, H.intro ? h("p", null, LT(H.intro)) : null, extra || null); };
  const BUILD = {
    greetings(){
      const track = h("div", { class: "wl-track" });
      for (let k = 0; k < 2; k++) M.W.greetings.forEach(g => track.append(h("div", { class: "wl-greet", "aria-hidden": k ? "true" : null }, loEl("b", g.lo), h("span", null, (g.rom || "") + " · " + (g.en || "")))));
      return h("div", null, h("div", { class: "wl-marquee", role: "region", "aria-label": t("wl_greetings") }, track), h("div", { class: "wl-silk", "aria-hidden": "true" }));
    },
    alphabet(){
      const note = h("p", { class: "wl-chip-note", "aria-live": "polite" }, t("wl_tap_consonant"));
      const chips = h("div", { class: "wl-chips", role: "group", "aria-label": t("wl_consonants") });
      M.W.alphabet.forEach(c => chips.append(h("button", { type: "button", "aria-pressed": "false", title: `${c.lo} ${c.name} (${c.meaning})`,
        onclick: e => { chips.querySelectorAll("button").forEach(x => x.setAttribute("aria-pressed", String(x === e.currentTarget)));
          note.replaceChildren(loEl("b", c.lo), " · ", h("b", null, c.name), ` (${c.meaning}) · /${c.ipa}/`); speak(c.lo); } }, loEl("b", c.lo), h("small", null, c.name))));
      return h("div", { class: "wl-alpha wl-rv" }, h("div", null, h("span", { class: "wl-eyebrow" }, LT((M.W.heads.alphabet || {}).eyebrow)), note), chips);
    },
    stats(){ return h("div", { class: "wl-strip wl-rv", role: "region", "aria-label": t("wl_at_glance") }, M.W.stats.map(s => h("div", null, h("b", null, s.value), h("span", null, LT(s.label))))); },
    journey(){ return journey(); },
    festivals(){ return festivals(); },
    services(){
      return h("section", { id: "w-services" }, head("services"), h("div", { class: "wl-bento-wrap" }, h("div", { class: "wl-bento" }, M.W.services.map(c =>
        h("article", { class: "wl-card wl-b-" + (c.size || "sm") + " wl-rv" }, h("span", { class: "wl-tile" }, icon(ICONS[c.icon] || "spark")), h("h3", null, LT(c.title)), h("p", null, LT(c.text)),
          c.demo ? patternDemo() : null, c.lock && LT(c.lock) ? h("span", { class: "wl-lock" }, icon("lock"), LT(c.lock)) : null)))));
    },
    resources(){
      const list = M.resources;
      return h("section", { id: "w-resources" }, head("resources"), list.length ? h("div", { class: "wl-res" }, list.map((r, i) => {
        const has = !!r.url, title = LT(r.title);
        const btn = !has ? h("button", { class: "wl-btn sm", type: "button", disabled: true }, t("wl_coming_soon"))
          : r.requiresAccount ? h("button", { class: "wl-btn sm" + (i ? "" : " primary"), type: "button", onclick: () => { try { sessionStorage.setItem(RESOURCE_KEY, JSON.stringify({ id: r.id, url: r.url, title })); } catch(e){} remember({ resourceId: r.id }); toAuth("register", t("wl_res_note", { r: title })); } }, icon("download"), t("wl_get_free"))
          : h("a", { class: "wl-btn sm" + (i ? "" : " primary"), href: r.url, target: "_blank", rel: "noopener", download: "" }, icon("download"), t("wl_download"));
        return h("article", { class: "wl-card wl-rv" }, h("div", { class: "wl-cover c" + ((r.cover || (i % 4) + 1)) }, h("span", { class: "wl-chip" }, t("wl_kind_" + (r.kind || "pdf"))), loEl("span", r.glyph || "ລ")),
          h("h3", null, title), h("p", null, LT(r.text)), btn);
      })) : h("p", { class: "wl-empty" }, t("wl_res_empty")));
    },
    promotions(){
      const offers = M.offers.filter(o => (o.placement || "promotions") === "promotions");
      return h("section", { id: "w-promotions" }, head("promotions"), offers.map(offerBlock), M.plans.length ? h("div", { class: "wl-plans" }, M.plans.map(planCard)) : null);
    },
    news(){
      const N = M.news; if (!N.length) return null;
      const story = (n, i, lead) => h("article", { class: "wl-card wl-story wl-rv" + (lead ? " lead" : "") },
        h("div", { class: "wl-thumb g" + ((i % 4) + 1), "aria-hidden": "true" }, loEl("span", n.glyph || ((n.title && n.title.lo) || "ລ").slice(0, lead ? 8 : 1))),
        h("div", { class: "wl-tx" }, h("div", { class: "wl-meta" }, h("span", { class: "wl-chip" + (n.type === "culture" ? " gold" : "") }, t(n.type === "culture" ? "wl_news_culture" : "wl_news_release")),
          n.date ? h("span", null, icon("clock"), n.date) : null),
          h("h3", null, LT(n.title)), n.loTitle || (n.title && n.title.lo && lang() !== "lo") ? loEl("p", n.loTitle || n.title.lo, "wl-lo-t") : null,
          lead && (n.text || n.notes || n.desc) ? h("p", null, LT(n.text || n.notes || n.desc)) : null));
      return h("section", { id: "w-news" }, head("news"), h("div", { class: "wl-news" }, story(N[0], 0, true), N.length > 1 ? h("div", { class: "wl-news-l" }, N.slice(1, 4).map((n, i) => story(n, i + 1, false))) : null));
    },
    about(){
      const B = M.W.about;
      return h("section", { id: "w-about" }, h("div", { class: "wl-about" },
        h("div", { class: "wl-about-art wl-rv" }, svgHTML(ART.CHAMPA), loEl("div", B.tagline || "", "wl-tagline")),
        h("div", { class: "wl-rv" }, h("span", { class: "wl-eyebrow" }, LT(B.eyebrow)), h("h2", null, LT(B.title)), h("p", null, LT(B.text)),
          h("ul", null, (B.points || []).map(p => h("li", null, icon("check"), LT(p)))))));
    },
    closing(){
      const C = M.W.closing;
      return h("div", null, h("div", { class: "wl-silk", "aria-hidden": "true" }), h("div", { class: "wl-closing wl-rv" }, h("h2", null, LT(C.title)),
        h("button", { class: "wl-btn gold", type: "button", onclick: () => toAuth(M.app.allowRegistration === false ? "signin" : "register") }, LT(C.cta), icon("right"))),
        h("div", { class: "wl-flagbar", "aria-hidden": "true" }));
    }
  };
  function patternDemo(){
    const lao = loEl("div", "", "wl-p-lao"), trl = h("div", { class: "wl-p-tr" }), words = h("div", { class: "wl-words" });
    const pick = (w, sayIt) => { lao.textContent = "ຂ້ອຍຢາກ" + w.vlo + w.lo; trl.textContent = `khoy yak ${w.vrom} ${w.rom} · I want to ${w.ven} ${w.en}.`; if (sayIt) speak(lao.textContent); };
    M.W.patternDemo.forEach((w, i) => words.append(h("button", { type: "button", class: i ? "" : "sel", "aria-pressed": String(!i),
      onclick: e => { words.querySelectorAll("button").forEach(x => { x.classList.toggle("sel", x === e.currentTarget); x.setAttribute("aria-pressed", String(x === e.currentTarget)); }); pick(w, true); } }, loEl("b", w.lo), h("small", null, w.en))));
    if (M.W.patternDemo[0]) pick(M.W.patternDemo[0], false);
    return h("div", { class: "wl-pattern", role: "group", "aria-label": t("wl_pattern_demo") }, words, lao, trl);
  }
  function offerBlock(o){
    const count = o.kind === "countdown" && o.endsAt ? h("div", { class: "wl-count", role: "timer" }) : null;
    const tick = () => { if (!count) return; const left = Math.max(0, Date.parse(o.endsAt) - Date.now()), d = Math.floor(left / 864e5), hh = Math.floor(left / 36e5) % 24, mm = Math.floor(left / 6e4) % 60;
      count.setAttribute("aria-label", t("wl_offer_ends", { d, h: hh, m: mm }));
      count.replaceChildren(...[[d, "wl_days"], [String(hh).padStart(2, "0"), "wl_hours"], [String(mm).padStart(2, "0"), "wl_min"]].map(([v, k]) => h("div", null, h("b", null, String(v)), h("small", null, t(k))))); };
    tick(); if (count) timers.push(setInterval(() => { if (!count.isConnected) return; tick(); }, 30000));
    const plan = M.plans.find(p => p.id === o.planId);
    return h("div", { class: "wl-promo wl-rv", "data-offer": o.id }, h("div", null,
      (o.badge || o.discountText) ? h("span", { class: "wl-chip gold" }, LT(o.badge) || LT(o.discountText)) : null, h("h3", null, LT(o.title)), o.text ? h("p", null, LT(o.text)) : null,
      h("button", { class: "wl-btn primary sm", type: "button", onclick: () => { remember({ offerId: o.id, planId: o.planId || null }); S.plan = plan ? planLabel(plan, lang()) : null;
        toAuth(M.app.allowRegistration === false ? "signin" : "register", plan && +planPrice(plan, "month", "USD") ? t("wl_upgrade_note", { p: planLabel(plan, lang()) }) : null); } }, LT(o.ctaLabel) || t("wl_btn_register"))), count);
  }
  function priceOf(p){
    const curs = [...new Set(enabledMethods(M.app).map(m => methodCurrency(M.app, m)))];
    for (const c of (curs.length ? curs : ["LAK","USD"])){ const v = planPrice(p, "month", c); if (v) return h("div", { class: "wl-price" }, money(v, c, lang()), h("small", null, " " + t("bl_per_month"))); }
    return h("div", { class: "wl-price" }, t("ac_price_free"));
  }
  function planCard(p){
    const label = planLabel(p, lang()), paid = !!(planPrice(p, "month", "USD") || planPrice(p, "month", "LAK") || planPrice(p, "year", "USD") || planPrice(p, "year", "LAK"));
    const feats = (p.features && (p.features[lang()] || p.features.en)) || [];
    return h("article", { class: "wl-card wl-plan wl-rv" + (p.highlight || p.recommended ? " feat" : "") },
      LT(p.badge) ? h("span", { class: "wl-chip wl-tag" }, LT(p.badge)) : (p.highlight || p.recommended) ? h("span", { class: "wl-chip wl-tag" }, t("bl_recommended")) : null,
      h("h3", null, label), priceOf(p), h("ul", null, feats.map(f => h("li", null, icon("check"), f))),
      h("button", { class: "wl-btn" + (p.highlight || p.recommended ? " primary" : ""), type: "button", onclick: () => { remember({ planId: p.id }); S.plan = label;
        toAuth(M.app.allowRegistration === false ? "signin" : "register", paid ? t("wl_upgrade_note", { p: label }) : null); } },
        LT(p.ctaLabel) || (paid ? t("wl_choose", { p: label }) : t("wl_btn_register"))));
  }

  // ----- journey through Laos -----
  function journey(){
    const places = M.places; if (!places.length) return null;
    const tabs = h("div", { class: "wl-j-tabs", role: "tablist", "aria-label": t("wl_places") });
    const map = h("div", { class: "wl-map" }); map.style.setProperty("--river", `path("${ART.RIVER_PATH}")`);
    map.append(svgHTML(ART.MAP));
    const stage = h("div", { class: "wl-stage" }), badge = h("span", { class: "wl-chip gold wl-stage-badge" });
    const name = h("span"), lo = loEl("span", "", "wl-lo-t"), text = h("p"), facts = h("div", { class: "wl-j-facts" }), words = h("div", { class: "wl-j-words" });
    const panel = h("article", { class: "wl-j-panel wl-rv", id: "wl-jpanel", role: "tabpanel", "aria-live": "polite" }, stage, h("div", { class: "wl-j-body" }, h("h3", null, name, lo), text, facts, words));
    const pins = places.map(p => { const at = D.project(p.lat, p.lon);
      const pin = h("button", { class: "wl-pin" + (at.x < 38 ? " left" : ""), type: "button", tabindex: "-1", "aria-hidden": "true", "data-id": p.id, style: `--x:${at.x}%;--y:${at.y}%`, onclick: () => select(p.id) }, loEl("span", p.laoName || ""));
      map.append(pin); return pin; });
    places.forEach((p, i) => tabs.append(h("button", { type: "button", role: "tab", id: "wl-jt-" + p.id, "data-id": p.id, "aria-controls": "wl-jpanel", "aria-selected": String(!i), tabindex: i ? "-1" : "0",
      onclick: () => select(p.id) }, LT(p.title).split(" and ")[0] + " ", loEl("span", (p.laoName || "").split(" · ")[0]))));
    tabs.addEventListener("keydown", e => {
      const all = [...tabs.querySelectorAll("[role=tab]")], i = all.findIndex(x => x.getAttribute("aria-selected") === "true");
      const j = ["ArrowRight","ArrowDown"].includes(e.key) ? (i + 1) % all.length : ["ArrowLeft","ArrowUp"].includes(e.key) ? (i - 1 + all.length) % all.length : e.key === "Home" ? 0 : e.key === "End" ? all.length - 1 : -1;
      if (j >= 0){ e.preventDefault(); select(all[j].dataset.id, true); }
    });
    function select(id, focus){
      const p = places.find(x => x.id === id); if (!p) return;
      tabs.querySelectorAll("[role=tab]").forEach(x => { const on = x.dataset.id === id; x.setAttribute("aria-selected", String(on)); x.tabIndex = on ? 0 : -1; if (on && focus) x.focus(); });
      pins.forEach(n => n.dataset.on = String(n.dataset.id === id));
      // an uploaded image replaces the drawn scene (its alt text describes it); otherwise the scene art
      stage.replaceChildren(p.imageUrl && /^https?:|^data:image\//.test(p.imageUrl) ? h("img", { class: "wl-scn", src: p.imageUrl, alt: LT(p.imageAlt) || LT(p.title), loading: "lazy" }) : svgHTML(ART.SCENES[p.scene] || ART.SCENES.temple), badge);
      badge.textContent = LT(p.badge); badge.hidden = !LT(p.badge);
      name.textContent = LT(p.title); lo.textContent = p.laoName || ""; text.textContent = LT(p.text);
      facts.replaceChildren(...(p.facts || []).map(f => h("span", { class: "wl-chip" }, LT(f))));
      words.replaceChildren(...(p.words || []).map(w => h("div", { class: "wl-word" }, h("div", null, loEl("b", w.lo || ""), h("small", null, (w.rom || "") + " · " + (w.en || ""))),
        h("button", { type: "button", class: "wl-btn sm", "aria-label": t("wl_listen", { w: w.rom || w.lo }), onclick: () => { if (w.audio && /^https?:/.test(w.audio)) new Audio(w.audio).play().catch(() => speak(w.lo)); else speak(w.lo); } }, icon("speaker")))));
      panel.setAttribute("aria-labelledby", "wl-jt-" + id);
    }
    select(places[0].id);
    const H = M.W.heads.journey || {};
    return h("section", { id: "w-journey", class: "wl-journey" }, head("journey"), tabs,
      h("div", { class: "wl-j-grid" }, h("div", { class: "wl-j-map wl-rv" }, map, H.mapCaption ? h("p", { class: "wl-eyebrow wl-map-cap" }, LT(H.mapCaption)) : null), panel));
  }
  function festivals(){
    const F = M.festivals; if (!F.length) return null;
    const m = new Date().getMonth() + 1;
    let k = F.findIndex(f => (f.month || 0) >= m); if (k < 0) k = 0;
    const list = h("ul", { class: "wl-fest", "aria-label": t("wl_fest_label") }, F.map((f, i) => h("li", { class: "wl-fcard", "data-now": String(i === k), "data-m": String(f.month || "") },
      i === k ? h("span", { class: "wl-chip gold wl-now" }, t(F[k].month === m ? "wl_this_month" : "wl_next_up")) : null,
      svgHTML(ART.FEST_ART[f.art] || ART.FEST_ART.generic), h("span", { class: "wl-mo" }, LT(f.dateText)), h("h3", null, LT(f.title)), loEl("div", f.laoName || "", "wl-lo-t"),
      h("p", null, LT(f.text)), f.lunar ? h("small", { class: "wl-lunar" }, icon("moon"), t("wl_lunar")) : null)));
    const sync = () => { if (list.scrollWidth > list.clientWidth + 1) list.setAttribute("tabindex", "0"); else list.removeAttribute("tabindex"); };
    if (typeof ResizeObserver !== "undefined") new ResizeObserver(sync).observe(list);
    const H = M.W.heads.festivals || {};
    return h("section", { id: "w-festivals", class: "wl-fest-wrap" }, h("div", { class: "wl-fest-head wl-rv" }, h("div", null, h("span", { class: "wl-eyebrow" }, LT(H.eyebrow)), h("h2", null, LT(H.title))), H.intro ? h("p", null, LT(H.intro)) : null), list);
  }

  function fillSections(){
    sectionsBox.replaceChildren();
    for (const s of M.W.sections){ if (!s.on || !BUILD[s.id]) continue; const el = BUILD[s.id](); if (el) sectionsBox.append(el); }
    // nav: the sections that are on and have something to show
    const shown = D.NAV_SECTIONS.filter(id => sectionsBox.querySelector("#w-" + id));
    links.replaceChildren(...shown.map(id => navBtn(id, "")));
    sheet.replaceChildren(...shown.map(id => navBtn(id, "")), langSeg("wl-sheet-lang"));
    heroStrip.replaceChildren(...M.offers.filter(o => o.placement === "hero").map(o => h("div", { class: "wl-strip-offer", "data-offer": o.id }, h("b", null, LT(o.title)), o.text ? h("span", null, LT(o.text)) : null,
      h("button", { class: "wl-btn sm gold", type: "button", onclick: () => { remember({ offerId: o.id, planId: o.planId || null }); toAuth("register"); } }, LT(o.ctaLabel) || t("wl_btn_register")))));
    const F = M.W.footer, app = M.app;
    footer.replaceChildren(h("span", null, LT(F.copyright)), h("nav", { "aria-label": t("wl_footer_nav") },
      (F.links || []).map(l => /^https?:\/\//.test(l.target || "") ? h("a", { href: l.target, rel: "noopener", target: "_blank" }, LT(l.label))
        : sectionsBox.querySelector("#w-" + l.target) ? h("button", { type: "button", class: "wl-linkbtn", onclick: () => scrollTo(l.target) }, LT(l.label)) : null),
      app.supportContact ? (/@/.test(app.supportContact) ? h("a", { href: "mailto:" + app.supportContact }, t("wl_support") + ": " + app.supportContact) : h("span", null, t("wl_support") + ": " + app.supportContact)) : null,
      ...Object.entries(app.social || {}).filter(([, u]) => /^https:\/\//.test(u || "")).map(([k, u]) => h("a", { href: u, rel: "noopener", target: "_blank" }, ({ fb:"Facebook", yt:"YouTube", tt:"TikTok" })[k] || k))));
    observe();
  }
  // active nav link, and animations paused while off screen
  let io, po;
  function observe(){
    if (!("IntersectionObserver" in window)) return;
    io && io.disconnect(); po && po.disconnect();
    io = new IntersectionObserver(es => es.forEach(en => { if (en.isIntersecting){ const id = en.target.id.slice(2);
      page.querySelectorAll(".wl-links [data-scroll]").forEach(b => b.dataset.scroll === id ? b.setAttribute("aria-current", "true") : b.removeAttribute("aria-current")); } }), { rootMargin: "-40% 0px -55% 0px" });
    D.NAV_SECTIONS.forEach(id => { const el = page.querySelector("#w-" + id); el && io.observe(el); });
    po = new IntersectionObserver(es => es.forEach(en => en.target.toggleAttribute("data-off", !en.isIntersecting)), { rootMargin: "120px" });
    [hero, page.querySelector("#w-journey"), page.querySelector(".wl-marquee")].forEach(el => el && po.observe(el));
  }
  const onVis = () => page.toggleAttribute("data-off", document.hidden);
  document.addEventListener("visibilitychange", onVis);

  fillHero(); fillSections();
  // then the real data (each read gives up after 2.5 s; offline, the defaults stay)
  if (A.api){
    try {
      const fresh = await fetchData(A.api, preview);
      if (page.isConnected){ M = fresh; fillHero(); auth.refresh(); fillSections(); }
    } catch(e){ console.warn("Welcome page: kept the defaults:", e && e.message); }
  }
  return { page, model: () => M };
}

// After sign-up: a free resource the visitor asked for on the welcome page (shown once in the app)
export function pendingResource(){
  try { const r = JSON.parse(sessionStorage.getItem(RESOURCE_KEY) || "null"); sessionStorage.removeItem(RESOURCE_KEY); return r && /^https?:\/\//.test(r.url) ? r : null; } catch(e){ return null; }
}
