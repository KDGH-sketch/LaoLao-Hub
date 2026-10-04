// LaoLao learner app
import { getApi } from "../api/index.js";
import { h, $, $$, icon, toast, errText, pyHTML, stripTone, debounce, tr, withTransition, leave, confirmDialog, normTheme, dialog } from "../shared/ui.js";
import { t, lang, setLang } from "../shared/i18n.js";
import { ensureDemo, DEMO } from "../shared/setup.js";
import { dict, searchDict } from "../shared/dict.js";
import { onMissingVoice, speak } from "../shared/speech.js";
import { openWord, closeSheet } from "../shared/widgets.js";
import { createWaitingScreen, dokChampaSvg, LAO_SAMPLES } from "../shared/lao-decorations.js";
import { A, loadAccount, refreshAccess, prefs, setPref, applyPrefs, srsDue, T, createLearnerProfile, rememberPendingProfile, displayName, avatarEl, imageToAvatar, saveProfile, setThemeFrom } from "./core.js";
import * as LV from "./views-learn.js";
import * as TV from "./views-tools.js";
import { LAB_VIEWS } from "./views-labs.js";
import { MEDIA_VIEWS } from "./views-media.js";
import { HANDWRITING_VIEWS } from "./views-handwriting.js";
import { VIEWS as BILLING_VIEWS } from "./views-billing.js";
import { renderWelcome, pendingResource } from "./welcome.js";
import { lockedPanel, featureForView, navLock, planLabel } from "./upgrade.js";
import { themeSwitcher } from "../shared/ui.js";

const root = document.getElementById("root");
try { const l = localStorage.getItem("xuelu.lang"); if (l) setLang(l); } catch(e){}

// Moving between pages slides the content (forward from the right, back from the left); see "transitions" in css/app.css
const show = kind => withTransition(() => { const done = render(); window.scrollTo(0,0); return done; }, { kind });
export function go(name, params={}, push=true){ if (push) A.hist.push(A.view); A.view = { name, params }; closeSheet(); closeProfileMenu(); show(push ? "page" : "back"); }
export function back(){ const v = A.hist.pop(); closeSheet(); closeProfileMenu(); if (v){ A.view = v; show("back"); } else go("home",{},false); }
A.go = go; A.back = back; A.signOut = (...a) => signOutNow(...a);

async function boot(){
  root.innerHTML = "";
  root.append(createWaitingScreen("ສະບາຍດີ", "ກຳລັງເລີ່ມຕົ້ນລະບົບ... / Starting LaoLao..."));
  const api = A.api = await getApi();
  if (api.mode==="demo"){
    root.innerHTML = "";
    root.append(createWaitingScreen("ສະບາຍດີ", t("loading")+"..."));
    await ensureDemo(api);
  }
  onMissingVoice(() => toast(t("voice_none")));
  // arriving from a password-reset email: ask for the new password before anything else
  let recovering = /type=recovery/.test(location.hash);
  if (api.auth.onRecovery) api.auth.onRecovery(() => { recovering = true; renderNewPassword(); });
  // Admin → Welcome Page → Preview opens ?welcome-preview=1: an admin sees the unpublished draft (others the normal page)
  const previewWanted = new URLSearchParams(location.search).has("welcome-preview");
  api.auth.onChange(async user => {
    if (!user) return renderAuth("signin");
    if (recovering) return renderNewPassword();
    if (previewWanted){
      const adm = await api.db.get(`admins/${user.uid}`).catch(() => null);
      return renderWelcome({ root, api, mode: "signin", preview: !!adm && adm.status !== "disabled", onLanguage: () => location.reload() });
    }
    root.innerHTML = "";
    root.append(createWaitingScreen("ສະບາຍດີ", "ກຳລັງໂຫລດຂໍ້ມູນ... / Preparing your account..."));
    try { await loadAccount(user); } catch(e){ console.error(e); }
    if (A.profile.status!=="active" && !A.isAdmin) return renderDisabled();
    A.render = render;
    // #view or #view?key=value (e.g. #payment?order=LLH-… after the payment page); only simple, known keys are read
    const [start, query] = location.hash.slice(1).split("?");
    const params = {};
    for (const [k, v] of new URLSearchParams(query || "")) if (["order","plan","cycle","id","type"].includes(k) && /^[A-Za-z0-9_.-]{1,60}$/.test(v)) params[k] = v;
    if (/^p\d+$/.test(start)) A.view = { name:"pattern", params:{ n:+start.slice(1) } };
    else if (VIEWS[start]) A.view = { name:start, params };
    if (query) history.replaceState(null, "", location.pathname + location.search);
    render();
    // a free download chosen on the welcome page before signing up
    const res = pendingResource();
    if (res) dialog({ title: t("wl_res_ready"), body: h("div",{class:"stack"}, h("p",null, res.title || ""),
      h("a",{class:"btn primary",href:res.url,target:"_blank",rel:"noopener",download:""}, icon("download"), t("wl_download"))), actions:[{ label:t("close"), value:true }] });
  });
  // back online: the database decides the plan again (a cached plan is never proof of payment)
  window.addEventListener("online", () => { updateNet(); if (A.user && A.ac) refreshAccess().then(() => A.render && A.render()).catch(() => {}); });
  window.addEventListener("offline", () => updateNet());
}

// ---------- auth ----------
// Signed out: the welcome page with the sign-in card (js/learner/welcome.js). mode = signin | register | reset.
async function renderAuth(mode){
  return renderWelcome({ root, api: A.api, mode, onLanguage: m => withTransition(() => renderAuth(m), { kind:"fade" }) });
}

function renderNewPassword(){
  const pw = h("input",{class:"input",type:"password",id:"npw",autocomplete:"new-password",minlength:"6"});
  const pw2 = h("input",{class:"input",type:"password",id:"npw2",autocomplete:"new-password"});
  const msg = h("p",{class:"small",style:"color:var(--bad);margin:0",role:"alert"});
  const save = async e => { e.preventDefault(); msg.textContent = "";
    if (pw.value.length < 6){ msg.textContent = t("weak_pw") !== "weak_pw" ? t("weak_pw") : "Password must be at least 6 characters."; return; }
    if (pw.value !== pw2.value){ msg.textContent = lang()==="lo" ? "ລະຫັດຜ່ານບໍ່ກົງກັນ." : "The passwords do not match."; return; }
    try { await A.api.auth.changePassword(null, pw.value); toast(lang()==="lo" ? "ປ່ຽນລະຫັດຜ່ານແລ້ວ" : "Password changed"); location.replace(location.pathname); }
    catch(err){ msg.textContent = errText(err); } };
  root.innerHTML = "";
  root.append(h("div",{class:"auth"}, h("div",{class:"auth-art"}, h("div",{class:"big lo"},"ລ")), h("div",{class:"auth-form-wrap"},
    h("form",{class:"auth-form",onsubmit:save},
      h("h1",null, lang()==="lo" ? "ຕັ້ງລະຫັດຜ່ານໃໝ່" : "Choose a new password"),
      h("div",{class:"field"}, h("label",{for:"npw"}, lang()==="lo" ? "ລະຫັດຜ່ານໃໝ່" : "New password"), pw),
      h("div",{class:"field"}, h("label",{for:"npw2"}, lang()==="lo" ? "ຢືນຢັນລະຫັດຜ່ານ" : "Repeat the new password"), pw2),
      msg, h("button",{class:"btn primary",type:"submit"}, t("save"))))));
}

function renderDisabled(){
  root.innerHTML = "";
  root.append(h("div",{class:"auth"}, h("div",{class:"auth-art"}, h("div",{class:"big lo"},"ລ")), h("div",{class:"auth-form-wrap"}, h("div",{class:"auth-form"}, h("h1",null,t("disabled")), A.settings.supportContact ? h("p",null,t("contact")+": "+A.settings.supportContact) : null, h("button",{class:"btn",onclick:()=>A.api.auth.signOut()}, t("sign_out"))))));
}

// ---------- shell ----------
const VIEWS = Object.assign({}, LV.VIEWS, TV.VIEWS, LAB_VIEWS, MEDIA_VIEWS, HANDWRITING_VIEWS, BILLING_VIEWS, {
  chars: HANDWRITING_VIEWS.handwriting, script_lab: HANDWRITING_VIEWS.handwriting
});
// Grouped so the sidebar reads as sections instead of one long flat list.
const NAV_GROUPS = [
  { title: "nav_group_overview", items: [
    ["home","nav_home","home"],
    ["progress","nav_progress","chart"]
  ]},
  { title: "nav_group_learn", items: [
    ["paths","nav_learn","path"],
    ["videos","nav_videos","video"],
    ["dict","nav_dict","dict"],
    ["vocab","nav_vocab","cards"],
    ["grammar","nav_grammar","structure"],
    ["patterns","nav_patterns","gen"],
    ["handwriting","nav_script","pen"]
  ]},
  { title: "nav_group_practice", items: [
    ["practice","nav_practice","practice"],
    ["review","nav_review","review"],
    ["speak","nav_speak","mic"],
    ["pronounce_lab","nav_pronounce","headphones"],
    ["tone_lab","nav_tone_lab","sound"]
  ]},
  { title: "nav_group_labs", items: [
    ["culture_lab","nav_culture","globe"],
    ["particle_lab","nav_particles","flame"],
    ["kinship_lab","nav_kinship","users"],
    ["classifiers_lab","nav_classifiers","layers"],
    ["pinyin","nav_pinyin","book"]
  ]},
  { title: "nav_group_myspace", items: [
    ["saved","nav_saved","bookmark"],
    ["notes","nav_notes","note"],
    ["downloads","nav_offline","download"],
    ["myplan","bl_myplan","wallet"],
    ["account","nav_account","user"]
  ]}
];
const TABS = [["home","nav_home","home"],["paths","nav_learn","path"],["dict","nav_dict","dict"],["videos","nav_videos","video"],["practice","nav_practice","practice"],["more","nav_more","more"]];
const PARENT = { video:"videos", lesson:"paths", path:"paths", pattern:"patterns", grammarItem:"grammar", quiz:"practice", gen:"patterns", handwriting:"handwriting", videos:"videos", vocab:"vocab", grammar:"grammar", tone_lab:"tone_lab", pronounce_lab:"pronounce_lab", culture_lab:"culture_lab", particle_lab:"culture_lab", kinship_lab:"culture_lab", classifiers_lab:"culture_lab" };
// Mobile bottom bar only pins 5 tabs; "More" opens the full grouped menu in a sheet.
function openMoreMenu(){
  const cur = PARENT[A.view.name] || A.view.name;
  const scrim = h("div",{class:"scrim sheet-scrim",onclick:()=>closeSheet()});
  const sheet = h("aside",{class:"sheet",role:"dialog","aria-modal":"true","aria-label":t("nav_more")},
    h("div",{class:"sheet-h"}, h("b",null,t("nav_more")), h("span",{style:"flex:1"}),
      h("button",{class:"ib","aria-label":t("close"),onclick:()=>closeSheet()}, icon("x"))),
    h("div",{class:"sheet-b"}, NAV_GROUPS.map(g => h("div",{class:"stack",style:"gap:2px"},
      h("div",{class:"side-group-label",style:"padding-left:0"}, t(g.title)),
      ...g.items.map(([id,k,ic]) => h("button",{class:"nav-btn","aria-current":cur===id?"page":null,onclick:()=>go(id)}, icon(ic), t(k), navLock(id)))))));
  document.body.append(scrim, sheet);
}
let searchPop, netEl;
function render(){
  const cur = PARENT[A.view.name] || A.view.name;
  root.innerHTML = "";
  const side = h("nav",{class:"side","aria-label":"Main"},
    h("div",{class:"brand"}, h("div",{class:"seal lo"},"ລ"), h("div",null, h("b",null,A.settings.appName||"LaoLao"), h("small",null,t("tagline")))));
  NAV_GROUPS.forEach(g => {
    side.append(h("div",{class:"side-group-label"}, t(g.title)));
    g.items.forEach(([id,k,ic]) => { const due = id==="review" ? srsDue().length : 0;
      side.append(h("button",{class:"nav-btn","aria-current":cur===id?"page":null,onclick:()=>go(id)}, cur===id ? h("span",{class:"nav-ind","aria-hidden":"true"}) : null, icon(ic), t(k), due ? h("span",{class:"count"},due) : navLock(id))); });
  });
  // the admin link is only useful to administrators (access is still checked in the admin app and the database)
  if (A.isAdmin) side.append(h("div",{class:"sep"}), h("a",{class:"nav-btn",href:"admin/",style:"text-decoration:none;color:var(--accent);font-weight:600"}, icon("shield"), (lang()==="lo"?"ຈັດການລະບົບ ":"Admin Backend ")+"(CMS)"));
  netEl = h("span",{class:"netdot"}, h("i"), " ");
  side.append(h("div",{class:"side-foot"}, netEl));
  const search = h("input",{id:"search",type:"search",autocomplete:"off","aria-label":t("search_ph"),placeholder:t("search_ph")});
  searchPop = h("div",{class:"search-pop",hidden:true});
  const p = prefs();
  const top = h("header",{class:"topbar"},
    h("button",{class:"mbrand",style:"border:0;background:none;padding:0",onclick:()=>go("home")}, h("span",{class:"seal lo"},"ລ"), h("span",null,A.settings.appName||"LaoLao")),
    h("div",{class:"search",role:"search"}, icon("dict"), search, searchPop),
    h("div",{class:"toggles"},
      !A.isAdmin ? null : h("a",{class:"btn sm ghost",href:"admin/",style:"text-decoration:none;display:inline-flex;align-items:center;gap:4px;padding:4px 10px;font-weight:600;color:var(--accent);border:1px solid var(--accent)",title:"Content Management Portal"}, icon("shield"), h("span",{class:"hide-sm"}, lang()==="lo"?"ຈັດການເນື້ອຫາ":"Admin CMS")),
      h("button",{class:"tg","data-k":"showPy","aria-pressed":String(p.showPy),onclick:e=>{ setPref("showPy",!prefs().showPy); e.currentTarget.setAttribute("aria-pressed",String(prefs().showPy)); }}, t("show_pinyin")),
      h("button",{class:"tg","data-k":"showTr","aria-pressed":String(p.showTr),onclick:e=>{ setPref("showTr",!prefs().showTr); e.currentTarget.setAttribute("aria-pressed",String(prefs().showTr)); }}, t("show_trans")),
      h("div",{class:"langsw",role:"group","aria-label":t("ui_lang")}, [["en","EN"],["lo","ລາວ"],["zh","中"]].map(([l,n]) => h("button",{"aria-pressed":String(lang()===l),lang:l==="zh"?"zh-CN":l,onclick:()=>setLanguage(l)}, n)))),
    profileChip());
  const main = h("main",{id:"main",tabindex:"-1"});
  const tabs = h("nav",{class:"tabbar","aria-label":"Tabs"}, TABS.map(([id,k,ic]) => { const on = id==="more" ? !TABS.some(x=>x[0]===cur) : cur===id;
    return h("button",{"aria-current":on?"page":null,onclick:()=>id==="more" ? openMoreMenu() : go(id)}, on ? h("span",{class:"tab-ind","aria-hidden":"true"}) : null, icon(ic), t(k)); }));
  const demoBarEl = A.api.mode==="demo" ? h("div",{class:"demo-bar",style:"display:flex;justify-content:space-between;align-items:center;padding:4px 14px;flex-wrap:wrap;gap:8px"},
    h("span",null, t("demo_banner")),
    h("div",{class:"row",style:"gap:8px"},
      h("button",{class:"btn sm",style:"padding:2px 10px;font-size:.78rem;background:var(--accent);color:#fff",onclick:async()=>{
        try {
          await A.api.auth.signIn(DEMO.admin.email, DEMO.admin.pw);
          location.href = "admin/";
        } catch(e){ location.href = "admin/"; }
      }}, icon("shield"), "Open Admin CMS (admin@demo.laolao) →")
    )
  ) : "";
  root.append(demoBarEl, h("div",{class:"app"}, side, h("div",{class:"mainwrap"}, top, main)), tabs);
  setupSearch(search);
  updateNet();
  const fn = VIEWS[A.view.name] || VIEWS.home;
  // Router guard: a view the plan does not include shows the locked screen (also for direct links like #tone_lab).
  // The attempt is reported to the database (Admin → Access logs). Content above the plan is never in the browser anyway.
  const need = featureForView(A.view.name, A.view.params);
  if (!document.startViewTransition) main.classList.add("enter");      // browsers without View Transitions: a CSS fade-in
  if (need && A.ac && !A.ac.can(need)){ main.append(lockedPanel({ feature:need })); A.ac.report(need); return Promise.resolve(); }
  try { const el = fn(A.view.params||{}); return Promise.resolve(el).then(x => { main.innerHTML=""; main.append(x); }).catch(e => { console.error(e); main.append(h("div",{class:"banner"}, errText(e))); }); }
  catch(e){ console.error(e); main.append(h("div",{class:"banner"}, errText(e))); return Promise.resolve(); }
}

// ---------- profile button and menu (sticky top bar) ----------
function setLanguage(l){
  closeProfileMenu();
  withTransition(() => { setPref("uiLang", l); try { localStorage.setItem("xuelu.lang", l); } catch(e){} return render(); }, { kind:"fade" });
}
const planText = () => A.isAdmin ? t("bl_st_admin") : (planLabel((A.plans||[]).find(p => p.id === (A.ent && A.ent.planId))) || t("current_plan"));
function profileChip(){
  return h("button",{class:"pchip",type:"button","aria-haspopup":"menu","aria-expanded":"false","aria-label":t("pf_menu"),onclick:e=>openProfileMenu(e.currentTarget)},
    avatarEl("sm"), h("span",{class:"pchip-t"}, h("b",null, displayName()), h("small",null, planText())), icon("down","pchip-c"));
}
export function closeProfileMenu(){
  const m = document.querySelector(".pmenu:not(.out)"); if (!m) return;
  leave(m, 180); leave(document.querySelector(".pmenu-scrim:not(.out)"), 180);
  const chip = document.querySelector(".pchip"); if (chip) chip.setAttribute("aria-expanded","false");
}
// Also used by the Account page (A.signOut)
export async function signOutNow(){
  if (!await confirmDialog(t("pf_logout_q"), t("pf_logout_d"), t("sign_out"), t("cancel"), true)) return;
  closeProfileMenu();
  document.body.classList.add("leaving");                   // the app fades away before the sign-in screen appears
  setTimeout(async () => { try { await A.api.auth.signOut(); } finally { document.body.classList.remove("leaving"); } }, 260);
}
function openProfileMenu(anchor){
  if (document.querySelector(".pmenu:not(.out)")) return closeProfileMenu();
  anchor.setAttribute("aria-expanded","true");
  const p = prefs(), r = anchor.getBoundingClientRect();
  const fileIn = h("input",{type:"file",accept:"image/*",hidden:true,onchange:async e=>{
    const f = e.target.files && e.target.files[0]; if (!f) return;
    try { await saveProfile({ avatar: await imageToAvatar(f) }); toast(t("pf_photo_saved")); closeProfileMenu(); render(); } catch(err){ toast(err.message || t("pf_photo_type"), "err"); } }});
  let i = 0; const stag = el => { el.style.setProperty("--i", i++); return el; };
  const seg = (label, items) => stag(h("div",{class:"pmenu-row"}, h("span",null,label), h("div",{class:"seg pmenu-seg",role:"group","aria-label":label}, items)));
  const sw = (label, k) => stag(h("label",{class:"pmenu-row pmenu-sw"}, h("span",null,label), h("input",{type:"checkbox",class:"switch",checked:!!p[k],onchange:e=>{
    setPref(k, e.target.checked); const tb = document.querySelector('.topbar .tg[data-k="'+k+'"]'); if (tb) tb.setAttribute("aria-pressed", String(e.target.checked)); }})));
  const link = (ic, label, view) => stag(h("button",{class:"pmenu-link",role:"menuitem",onclick:()=>go(view)}, icon(ic), h("span",null,label), icon("right","pmenu-go")));
  const menu = h("div",{class:"pmenu",role:"menu","aria-label":t("pf_menu")},
    stag(h("div",{class:"pmenu-head"},
      h("div",{class:"pmenu-av"}, avatarEl("lg"), h("button",{class:"pmenu-cam",type:"button","aria-label":t("pf_change_photo"),title:t("pf_change_photo"),onclick:()=>fileIn.click()}, icon("image"))),
      h("div",{class:"pmenu-id"}, h("b",null, displayName()), h("small",null, A.user.email || ""), h("span",{class:"chip lv"}, icon(A.isAdmin ? "shield" : "star"), planText())), fileIn)),
    stag(h("div",{class:"pmenu-lbl"}, t("pf_quick"))),
    seg(t("theme"), [["system","theme_auto","monitor"],["day","theme_light","sun"],["night","theme_dark","moon"]].map(([k,l,ic]) => h("button",{"aria-pressed":String(normTheme(prefs().theme)===k),title:t(l),"aria-label":t(l),onclick:e=>{
      e.currentTarget.parentElement.querySelectorAll("button").forEach(b => b.setAttribute("aria-pressed", String(b === e.currentTarget))); setThemeFrom(k, e); }}, icon(ic)))),
    seg(t("ui_lang"), [["en","EN"],["lo","ລາວ"],["zh","中"]].map(([l,n]) => h("button",{"aria-pressed":String(lang()===l),lang:l==="zh"?"zh-CN":l,onclick:()=>setLanguage(l)}, n))),
    sw(t("show_pinyin"), "showPy"), sw(t("show_trans"), "showTr"),
    stag(h("div",{class:"pmenu-sep"})),
    A.isAdmin ? null : link("wallet", t("bl_myplan"), "myplan"),
    link("user", t("pf_account"), "account"),
    link("chart", t("nav_progress"), "progress"),
    A.isAdmin ? stag(h("a",{class:"pmenu-link",role:"menuitem",href:"admin/"}, icon("shield"), h("span",null,"Admin CMS"), icon("right","pmenu-go"))) : null,
    stag(h("button",{class:"pmenu-logout",type:"button",role:"menuitem",onclick:signOutNow}, icon("logout"), t("sign_out"))));
  // under the button on wide screens; a bottom sheet on phones (css)
  menu.style.top = Math.round(r.bottom + 8) + "px";
  menu.style.right = Math.max(8, Math.round(innerWidth - r.right)) + "px";
  const scrim = h("div",{class:"pmenu-scrim",onclick:closeProfileMenu});
  document.body.append(scrim, menu);
  const onKey = e => { if (e.key === "Escape"){ closeProfileMenu(); anchor.focus(); document.removeEventListener("keydown", onKey); } };
  document.addEventListener("keydown", onKey);
  const first = menu.querySelector(".pmenu-cam"); if (first) first.focus({ preventScroll:true });
}
function updateNet(){ if (!netEl) return; const on = navigator.onLine; netEl.className = "netdot"+(on?"":" off"); netEl.lastChild.textContent = on ? t("online")+" · "+t("offline_ok") : t("offline")+" · "+t("sync_note").split(".")[0]; }

function setupSearch(inp){
  let sel=-1, items=[];
  const close = () => { searchPop.hidden = true; sel=-1; };
  const run = () => {
    const q = inp.value.trim(); if (!q){ close(); return; }
    searchPop.innerHTML=""; items=[];
    const f = q.toLowerCase(), qp = stripTone(q);
    const add = (head, list) => { if (!list.length) return; searchPop.append(h("div",{class:"sp-head"},head)); list.forEach(b => { items.push(b); searchPop.append(b); }); };
    const match = s => s && (String(s).toLowerCase().includes(f) || (qp.length>1 && stripTone(s).includes(qp)));
    add(t("nav_lessons"), Object.values(A.byType.lessons||{}).filter(l => match(T(l.title)) || match(l.title&&l.title.zh) || (l.vocab||[]).includes(q)).slice(0,4).map(l => h("button",{class:"sp-item",onclick:()=>{ close(); go("lesson",{id:l.id}); }}, h("span",null,T(l.title)), h("span",{class:"muted small"},"Stage "+l.level))));
    add(t("nav_patterns"), Object.values(A.P).filter(p => String(p.n)===f || p.hz.includes(q) || match(T({en:p.tr.en.meaning, lo:p.tr.lo&&p.tr.lo.meaning})) || match(p.py)).slice(0,5).map(p => h("button",{class:"sp-item",onclick:()=>{ close(); go("pattern",{n:p.n}); }}, h("span",{class:"hz"},p.hz), h("span",{class:"muted small"},"#"+p.n+" · "+T({en:p.tr.en.meaning, lo:p.tr.lo&&p.tr.lo.meaning})))));
    add(t("nav_grammar"), Object.values(A.byType.grammar||{}).filter(g => match(T(g.title)) || (g.structure||"").includes(q)).slice(0,3).map(g => h("button",{class:"sp-item",onclick:()=>{ close(); go("grammarItem",{id:g.id}); }}, h("span",null,T(g.title)))));
    const D = dict(); add(t("nav_dict"), searchDict(q, 8).map(w => h("button",{class:"sp-item",onclick:()=>{ close(); openWord(w); }}, h("span",{class:"hz"},w), h("span",{class:"py",html:pyHTML(D[w].p)}), h("span",{class:"muted small"+(lang()==="lo"&&D[w].lo?" lo":"")}, ((lang()==="lo"&&D[w].lo)?D[w].lo:D[w].en).slice(0,60)))));
    if (!items.length) searchPop.append(h("div",{class:"sp-head",style:"text-transform:none;letter-spacing:0;font-weight:500"}, t("search_none")));
    searchPop.hidden = false;
  };
  inp.addEventListener("input", debounce(run, 140));
  inp.addEventListener("keydown", e => {
    if (e.key==="ArrowDown"||e.key==="ArrowUp"){ e.preventDefault(); if (!items.length) return; sel=(sel+(e.key==="ArrowDown"?1:-1)+items.length)%items.length; items.forEach((b,i)=>b.classList.toggle("active",i===sel)); }
    else if (e.key==="Enter"){ if (sel>=0) items[sel].click(); else { const q = inp.value.trim(); close(); if (q) go("dict",{q}); } }
    else if (e.key==="Escape") close();
  });
  document.addEventListener("click", e => { if (!e.target.closest(".search")) close(); });
}

boot().catch(e => { console.error(e); root.innerHTML=""; root.append(h("div",{class:"banner",style:"margin:40px"}, errText(e))); });
