// LaoLao Admin Backend
import { getApi } from "../api/index.js";
import { OWNER_EMAIL } from "../config.js";
import { h, $, $$, icon, toast, dialog, confirmDialog, fmtDate, errText, themeSwitcher } from "../shared/ui.js";
import { setLang, lang } from "../shared/i18n.js";
import { buildBundles, CONTENT_TYPES } from "../shared/content.js";
import { bootstrapOwner, importSeed, ensureDemo, DEMO } from "../shared/setup.js";
import { loadDict } from "../shared/dict.js";
import { S, L, t, go, isSuper, isOwner, getActiveRole, canContent, canSupport, canViewMenu, canEditMenu, canManageAdmins, canManageSettings, refreshPlans, fld } from "./state.js";
import { viewLearners, viewLearner } from "./learners.js";
import { viewPlans } from "./plans.js";
import { viewContentHome, viewContentList, viewEditor } from "./cms.js";
import { EXT_VIEWS } from "./cms-extended.js";
import { viewAdmins } from "./admins.js";

const root = document.getElementById("root");
const pref = (() => { try { return localStorage.getItem("xuelu.admin.lang") || "en"; } catch(e){ return "en"; } })();
setLang(pref==="lo" ? "lo" : "en");

async function boot(){
  const api = S.api = await getApi();
  if (api.mode==="demo"){ root.innerHTML=""; root.append(h("div",{class:"empty",style:"margin:40px"}, t("loading")+" (demo setup)")); await ensureDemo(api); }
  // arriving from a password-reset email: ask for the new password first
  let recovering = /type=recovery/.test(location.hash);
  if (api.auth.onRecovery) api.auth.onRecovery(() => { recovering = true; renderNewPassword(); });
  api.auth.onChange(async user => {
    if (!user){ S.me=null; return renderLogin(); }
    if (recovering) return renderNewPassword();
    let adm = null; try { adm = await api.db.get(`admins/${user.uid}`); } catch(e){}
    if (!adm){
      let boot = null; try { boot = await api.db.get("settings/bootstrap"); } catch(e){}
      if (!boot) return renderSetup(user);
      return renderNoAccess(user);
    }
    S.me = { uid:user.uid, email:user.email, role:adm.role, name:adm.name||user.email, permissions:adm.permissions, allowedMenus:adm.allowedMenus };
    await Promise.all([refreshPlans().catch(()=>[]), api.db.get("settings/app").then(s=>S.settings=s||{}).catch(()=>{}), refreshBundleState()]);
    loadDict();
    S.render = renderShell; renderShell();
  });
}
export async function refreshBundleState(){ try { S.bundle = await S.api.db.get("settings/bundle") || {}; } catch(e){ S.bundle = {}; } }

// ---------- auth screens ----------
function authFrame(...kids){
  root.innerHTML = "";
  root.append(demoBar(), h("div",{class:"auth"},
    h("div",{class:"auth-art",style:"background:var(--ink)"}, h("div",null, h("div",{class:"big lo"},"ລ"), h("h2",{style:"margin-top:12px"},"LaoLao · "+t("adm_title"))), h("p",null,"Manage learners, access and learning content.")),
    h("div",{class:"auth-form"}, ...kids)));
}
function demoBar(){ return S.api && S.api.mode==="demo" ? h("div",{class:"demo-bar"}, t("demo_banner")+" ", h("button",{onclick:async()=>{ if(await confirmDialog(t("reset_demo"), "Delete all demo data in this browser and start again?", t("reset_demo"), t("cancel"), true)){ await S.api._reset(); location.reload(); } }}, t("reset_demo"))) : ""; }
function renderLogin(){
  const email = h("input",{class:"input",type:"email",autocomplete:"username",id:"em"});
  const pw = h("input",{class:"input",type:"password",autocomplete:"current-password",id:"pw"});
  let showPw = false;
  const pwToggle = h("button",{type:"button",class:"pw-toggle-btn","aria-label":"Toggle password visibility",onclick:()=>{
    showPw = !showPw;
    pw.type = showPw ? "text" : "password";
    pwToggle.replaceChildren(icon(showPw ? "eyeOff" : "eye"));
  }}, icon("eye"));
  const pwWrap = h("div",{class:"input-wrap"}, pw, pwToggle);
  const msg = h("p",{class:"small",style:"color:var(--bad)"});
  const go_ = async e => { e && e.preventDefault(); msg.textContent=""; try { await S.api.auth.signIn(email.value.trim(), pw.value); } catch(err){ msg.textContent = errText(err); } };

  const demoCard = S.api.mode==="demo" ? h("div",{class:"banner info stack",style:"gap:10px;margin-bottom:16px"},
    h("b",null,t("demo_accounts") + " · One-Click Role Sign In:"),
    h("div",{class:"grid2",style:"gap:8px"},
      h("button",{class:"btn primary sm",type:"button",onclick:()=>{ email.value=DEMO.admin.email; pw.value=DEMO.admin.pw; go_(); }}, icon("shield"), "👑 Super Admin"),
      h("button",{class:"btn sm",type:"button",onclick:()=>{ email.value=DEMO.editor.email; pw.value=DEMO.editor.pw; go_(); }}, icon("edit"), "✍️ Content Editor"),
      h("button",{class:"btn sm",type:"button",onclick:()=>{ email.value=DEMO.reviewer.email; pw.value=DEMO.reviewer.pw; go_(); }}, icon("eye"), "👁️ Content Reviewer"),
      h("button",{class:"btn sm",type:"button",onclick:()=>{ email.value=DEMO.support.email; pw.value=DEMO.support.pw; go_(); }}, icon("users"), "🎧 Support Admin")
    ),
    h("div",{class:"small muted mono"}, "Password for all demo accounts: demo1234")
  ) : null;

  authFrame(h("h1",null,t("sign_in")),
    demoCard,
    h("form",{class:"stack",onsubmit:go_}, h("div",{class:"field"}, h("label",{for:"em"},t("email")), email), h("div",{class:"field"}, h("label",{for:"pw"},t("password")), pwWrap), msg,
      h("button",{class:"btn primary",type:"submit"}, t("sign_in"))),
    h("button",{class:"linkbtn",onclick:async()=>{ if(!email.value) { msg.textContent=t("email")+"?"; return; } try{ await S.api.auth.resetPassword(email.value.trim()); toast(t("reset_sent")); }catch(err){ msg.textContent=errText(err); } }}, t("forgot")),
    h("div",{class:"row"}, langSwitch(), h("a",{href:"../",class:"small"}, t("adm_open_learner"))));
}
function renderNewPassword(){
  const pw = h("input",{class:"input",type:"password",id:"npw",autocomplete:"new-password"}), pw2 = h("input",{class:"input",type:"password",id:"npw2",autocomplete:"new-password"});
  const msg = h("p",{class:"small",style:"color:var(--bad)"});
  authFrame(h("h1",null,"Choose a new password"),
    h("form",{class:"stack",onsubmit:async e=>{ e.preventDefault(); msg.textContent="";
      if (pw.value.length < 6){ msg.textContent = "Password must be at least 6 characters."; return; }
      if (pw.value !== pw2.value){ msg.textContent = "The passwords do not match."; return; }
      try { await S.api.auth.changePassword(null, pw.value); toast("Password changed"); location.replace(location.pathname); } catch(err){ msg.textContent = errText(err); } }},
      h("div",{class:"field"}, h("label",{for:"npw"},"New password"), pw), h("div",{class:"field"}, h("label",{for:"npw2"},"Repeat the new password"), pw2), msg,
      h("button",{class:"btn primary",type:"submit"}, t("save"))));
}
function renderNoAccess(user){
  authFrame(h("h1",null,t("adm_title")),
    h("p",null, t("adm_no_access")),
    h("p",{class:"muted small"}, user.email),
    S.api.mode==="demo" ? h("div",{class:"banner info stack",style:"gap:8px;margin:14px 0"},
      h("b",null,"Demo Administrator Access:"),
      h("p",{class:"small"}, "You are currently signed in with a learner account (" + user.email + "). Click below to switch to the administrator account:"),
      h("button",{class:"btn primary sm",onclick:async()=>{
        await S.api.auth.signIn(DEMO.admin.email, DEMO.admin.pw);
        location.reload();
      }}, icon("shield"), "Switch to Admin (" + DEMO.admin.email + ")")
    ) : null,
    h("div",{class:"row"}, h("button",{class:"btn",onclick:()=>S.api.auth.signOut()}, icon("logout"), t("sign_out")), h("a",{href:"../",class:"btn ghost"}, t("adm_open_learner"))));
}
function renderSetup(user){
  const name = h("input",{class:"input",id:"nm",value:""});
  const ok = S.api.mode==="demo" || user.email.toLowerCase()===String(OWNER_EMAIL).toLowerCase();
  const msg = h("p",{class:"small",style:"color:var(--bad)"});
  authFrame(h("h1",null,t("adm_setup_title")), h("p",{class:"muted"}, t("adm_setup_d")), h("p",{class:"small"}, user.email),
    ok ? h("div",{class:"field"}, h("label",{for:"nm"},t("name")), name) : h("div",{class:"banner"}, "This email doesn't match the owner email in env-config.js."),
    msg,
    h("div",{class:"row"}, ok ? h("button",{class:"btn primary",onclick:async e=>{ e.currentTarget.disabled=true; try{ await bootstrapOwner(S.api, user, name.value.trim()); location.reload(); }catch(err){ msg.textContent=errText(err); e.currentTarget.disabled=false; } }}, icon("shield"), t("adm_become_super")) : null,
      h("button",{class:"btn ghost",onclick:()=>S.api.auth.signOut()}, t("sign_out"))));
}
function langSwitch(){
  return h("div",{class:"langsw"}, [["en","EN"],["lo","ລາວ"],["zh","中"]].map(([l,n]) => h("button",{"aria-pressed":String(lang()===l),onclick:()=>{ setLang(l); try{ localStorage.setItem("xuelu.admin.lang",l); }catch(e){} S.me ? renderShell() : renderLogin(); }}, n)));
}

// ---------- shell ----------
const NAV_SECTIONS = [
  {
    title: ["Overview", "ພາບລວມ"],
    items: [
      { id:"dashboard", label:["Dashboard", "ໜ້າຫຼັກ"], icon:"chart", view:"dashboard" },
      { id:"learners", label:["Learners", "ຜູ້ຮຽນ"], icon:"users", view:"learners" },
      { id:"content", label:["All Content", "ເນື້ອຫາທັງໝົດ"], icon:"content", view:"content" }
    ]
  },
  {
    title: ["Core Curriculum", "ຫຼັກສູດຫຼັກ"],
    items: [
      { id:"lessons", label:["Lessons", "ບົດຮຽນ"], icon:"learn", view:"contentList", params:{ type:"lessons" } },
      { id:"patterns", label:["Sentence Patterns", "ໂຄງສ້າງປະໂຫຍກ"], icon:"gen", view:"contentList", params:{ type:"patterns" } },
      { id:"grammar", label:["Grammar Points", "ໄວຍາກອນ"], icon:"layers", view:"contentList", params:{ type:"grammar" } },
      { id:"vocabulary", label:["Vocabulary", "ຄຳສັບ"], icon:"dict", view:"contentList", params:{ type:"vocabulary" } },
      { id:"dialogues", label:["Dialogues", "ບົດສົນທະນາ"], icon:"users", view:"contentList", params:{ type:"dialogues" } },
      { id:"quizzes", label:["Quizzes & Tests", "ແບບທົດສອບ"], icon:"practice", view:"contentList", params:{ type:"quizzes" } }
    ]
  },
  {
    title: ["Media & Reference", "ມີເດຍ ແລະ ອ້າງອີງ"],
    items: [
      { id:"videos", label:["Video Manager", "ຈັດການວິດີໂອ"], icon:"video", view:"videoManager" },
      { id:"tones", label:["Tone Lab", "ສຽງວັນນະຍຸດ"], icon:"sound", view:"contentList", params:{ type:"tones" } },
      { id:"culture", label:["Culture & Context", "ວັດທະນະທຳ"], icon:"culture", view:"contentList", params:{ type:"culture" } },
      { id:"characters", label:["Lao Script & Handwriting", "ອັກສອນ ແລະ ລາຍມື"], icon:"chars", view:"contentList", params:{ type:"characters" } },
      { id:"dictionary", label:["Dictionary Database", "ວັດຈະນານຸກົມ"], icon:"dict", view:"contentList", params:{ type:"dictionary" } }
    ]
  },
  {
    title: ["Studio & Operations", "ເຄື່ອງມື ແລະ ສະຕູດິໂອ"],
    items: [
      { id:"audioStudio", label:["Voice Studio", "ສະຕູດິໂອບັນທຶກສຽງ"], icon:"mic", view:"audioStudio" },
      { id:"excelImport", label:["Excel / CSV Importer", "ນຳເຂົ້າ Excel/CSV"], icon:"upload", view:"excelImport" },
      { id:"promotions", label:["Promotions & Feed", "ໂປຣໂມຊັ່ນ ແລະ ຂ່າວ"], icon:"gift", view:"promotions" },
      { id:"contentHealth", label:["Content Health Audit", "ກວດສອບຄວາມສົມບູນ"], icon:"spark", view:"contentHealth" }
    ]
  },
  {
    title: ["Platform & System", "ລະບົບ ແລະ ການຕັ້ງຄ່າ"],
    items: [
      { id:"plans", label:["Pricing Plans", "ແຜນການຮຽນ"], icon:"plan", view:"plans" },
      { id:"activity", label:["Activity Audit Log", "ປະຫວັດການໃຊ້ງານ"], icon:"clock", view:"activity" },
      { id:"admins", label:["Administrators", "ຜູ້ດູແລລະບົບ"], icon:"shield", view:"admins", superOnly:true },
      { id:"settings", label:["Settings", "ຕັ້ງຄ່າລະບົບ"], icon:"settings", view:"settings" }
    ]
  }
];

// Mobile fallback: the sidebar hides below 900px, so this opens the same grouped
// menu in a sheet (same pattern as the learner app's bottom-sheet "More" menu).
function closeAdminSheet(){ $$(".scrim.sheet-scrim,.sheet").forEach(e => e.remove()); }
function openAdminMenu(){
  const scrim = h("div",{class:"scrim sheet-scrim",onclick:closeAdminSheet});
  const sheet = h("aside",{class:"sheet",role:"dialog","aria-modal":"true","aria-label":t("adm_title")},
    h("div",{class:"sheet-h"}, h("b",null,"LaoLao · "+t("adm_title")), h("span",{style:"flex:1"}),
      h("button",{class:"ib","aria-label":t("close"),onclick:closeAdminSheet}, icon("x"))),
    h("div",{class:"sheet-b"},
      NAV_SECTIONS.map(sec => {
        const secItems = sec.items.filter(it => canViewMenu(it.id));
        if (!secItems.length) return null;
        return h("div",{class:"stack",style:"gap:2px"},
          h("div",{class:"side-group-label",style:"padding-left:0"}, lang()==="lo" ? sec.title[1] : sec.title[0]),
          ...secItems.map(it => h("button",{class:"nav-btn","aria-current":isItemActive(it)?"page":null,
            onclick:()=>{ closeAdminSheet(); go(it.view, it.params || {}); }}, icon(it.icon), lang()==="lo" ? it.label[1] : it.label[0])));
      }).filter(Boolean),
      h("div",{class:"sep"}),
      h("a",{class:"nav-btn",href:"../",style:"text-decoration:none",onclick:closeAdminSheet}, icon("home"), t("adm_open_learner")),
      h("button",{class:"nav-btn",onclick:()=>{ closeAdminSheet(); S.api.auth.signOut(); }}, icon("logout"), t("sign_out"))));
  document.body.append(scrim, sheet);
}

function isItemActive(item) {
  if (item.view === "contentList") {
    if (S.view === "contentList") {
      return (S.params && S.params.type) === (item.params && item.params.type);
    }
    if (S.view === "editor") {
      return (S.params && S.params.type) === (item.params && item.params.type);
    }
    return false;
  }
  if (item.view === "content") {
    return S.view === "content";
  }
  if (item.view === "learners") {
    return S.view === "learners" || S.view === "learner";
  }
  return S.view === item.view;
}

function rolePreviewSwitch(){
  if (!isOwner() && !["super", "owner"].includes(S.me?.role)) return "";
  if (S.simulatedRole) {
    return h("button", {
      class: "btn sm",
      style: "background:rgba(217,119,6,0.18);color:var(--accent);border:1px solid var(--accent);display:inline-flex;align-items:center;gap:6px;font-weight:600",
      title: "Click to exit simulation and restore Super Admin",
      onclick: () => {
        S.simulatedRole = null;
        S.simulatedPermissions = null;
        toast("Restored full Super Admin privileges", "ok");
        S.render();
      }
    }, icon("spark"), "Simulating: " + (t("role_" + S.simulatedRole) || S.simulatedRole), h("span", { class: "mono small" }, "✕"));
  }
  return h("select", {
    class: "input hide-sm",
    style: "width:auto;padding:3px 8px;font-size:.78rem;color:var(--ink-2);background:var(--surface)",
    "aria-label": "Preview role permissions",
    onchange: e => {
      if (e.target.value) {
        S.simulatedRole = e.target.value;
        toast(`Simulating as ${t("role_" + e.target.value)}... Check sidebar & CMS!`, "ok");
        S.render();
      }
    }
  },
    h("option", { value: "" }, "👑 Super Admin (Live)"),
    h("option", { value: "reviewer" }, "👁️ Content Reviewer (Read-Only)"),
    h("option", { value: "editor" }, "✍️ Content Editor (No Credentials)"),
    h("option", { value: "support" }, "🎧 Support Admin (Learners Only)")
  );
}

function renderShell(){
  root.innerHTML = "";
  const effectiveRole = getActiveRole() || S.me.role;
  const side = h("nav",{class:"side","aria-label":"Admin",style:"overflow-y:auto;max-height:100vh"},
    h("div",{class:"brand"}, h("div",{class:"seal lo"},"ລ"), h("div",null, h("b",null,"LaoLao"), h("small",null,t("adm_title")+" · "+t("role_"+effectiveRole)))));

  NAV_SECTIONS.forEach(sec => {
    const secItems = sec.items.filter(it => canViewMenu(it.id));
    if (!secItems.length) return;
    side.append(h("div",{class:"side-group-label"}, lang()==="lo" ? sec.title[1] : sec.title[0]));
    secItems.forEach(it => {
      const active = isItemActive(it);
      side.append(h("button",{
        class: "nav-btn",
        "aria-current": active ? "page" : null,
        onclick: () => go(it.view, it.params || {})
      },
        icon(it.icon),
        lang() === "lo" ? it.label[1] : it.label[0]
      ));
    });
  });

  side.append(h("div",{class:"sep"}), h("a",{class:"nav-btn",href:"../",style:"text-decoration:none"}, icon("home"), t("adm_open_learner")),
    h("button",{class:"nav-btn",onclick:()=>S.api.auth.signOut()}, icon("logout"), t("sign_out")),
    h("div",{class:"side-foot"}, S.me.email));

  const top = h("header",{class:"topbar"},
    h("button",{class:"ib hide-desk","aria-label":t("nav_more")||"Menu",onclick:openAdminMenu}, icon("menu")),
    h("div",{class:"mbrand"}, h("span",{class:"seal lo"},"ລ"), h("b",null,t("adm_title"))),
    h("div",{style:"flex:1"}),
    rolePreviewSwitch(),
    h("a",{class:"btn sm ghost",href:"../",style:"text-decoration:none;display:inline-flex;align-items:center;gap:4px;padding:5px 9px",title:t("adm_open_learner")}, icon("home"), h("span",{class:"hide-sm"}, t("adm_open_learner"))),
    publishChip(),
    themeSwitcher(),
    langSwitch());

  const main = h("main",{id:"main"});
  root.append(demoBar(), h("div",{class:"app adm"}, side, h("div",{class:"mainwrap"}, top, main)));

  let allowed = canViewMenu(S.view);
  if (S.view === "contentList" || S.view === "editor") {
    allowed = canViewMenu(S.params?.type || "content");
  } else if (S.view === "learner") {
    allowed = canViewMenu("learners");
  }

  if (!allowed) {
    main.innerHTML = "";
    main.append(h("div", { class: "panel stack", style: "text-align:center;padding:48px 24px;max-width:540px;margin:40px auto" },
      h("div", { style: "font-size:3rem;margin-bottom:8px" }, "🔒"),
      h("h2", null, t("only_super")),
      h("p", { class: "muted" }, t("credential_menu_restricted")),
      h("div", { class: "row", style: "justify-content:center;margin-top:16px" },
        h("button", { class: "btn primary", onclick: () => go("dashboard") }, "← " + t("adm_dashboard"))
      )
    ));
    return;
  }

  const V = Object.assign({ dashboard:viewDashboard, learners:viewLearners, learner:viewLearner, plans:viewPlans, content:viewContentHome, contentList:viewContentList, editor:viewEditor, activity:viewActivity, admins:viewAdmins, settings:viewSettings }, EXT_VIEWS);
  const fn = V[S.view] || viewDashboard;
  Promise.resolve(fn(S.params||{})).then(el => { main.innerHTML=""; main.append(el); }).catch(err => { console.error(err); main.innerHTML=""; main.append(h("div",{class:"banner"}, errText(err))); });
}

function publishChip(){
  if (!canContent() || !canEditMenu("lessons")) return "";
  const dirty = !!S.bundle.dirty || !S.bundle.builtAt;
  return h("button",{class:"btn sm"+(dirty?" primary":""),title: dirty ? t("unpublished_changes") : t("up_to_date"),onclick:publishFlow}, icon(dirty?"upload":"check"), dirty ? t("publish_now") : t("up_to_date"));
}
export async function publishFlow(){
  const status = h("p",{class:"muted"}, t("publishing"));
  const dlg = dialog({ title: t("adm_publish"), body: status });
  try {
    await buildBundles(S.api, S.me.uid, step => status.textContent = t("publishing")+" "+step);
    await refreshBundleState();
    document.querySelector(".dialog .ib")?.click();
    toast(t("published_ok")); S.render();
  } catch(e){ status.textContent = errText(e); }
  return dlg;
}

// ---------- dashboard ----------
async function viewDashboard(){
  const api = S.api, now = Date.now();
  const [users, access, activity, counts] = await Promise.all([
    api.db.list("users", { where:[["role","==","learner"]] }).catch(()=>[]),
    api.db.list("access").catch(()=>[]),
    api.db.list("activity", { orderBy:["at","desc"], limit:15 }).catch(()=>[]),
    Promise.all(CONTENT_TYPES.filter(t=>t!=="lexicon").map(async ty => [ty, await api.db.count(ty).catch(()=>0)]))
  ]);
  const active = users.filter(u=>u.status==="active").length;
  const accMap = Object.fromEntries(access.map(a=>[a.id,a]));
  const learnerAccess = users.map(u=>accMap[u.id]).filter(Boolean);
  const activeSubs = learnerAccess.filter(a=>a.status==="active" && (a.expiresAt==null || a.expiresAt>now) && a.tier>1).length;
  const expired = learnerAccess.filter(a=>a.expiresAt!=null && a.expiresAt<=now).length;
  const week = activity.filter(a=>a.at>now-7*86400000).length;
  const root_ = h("div",{class:"stack-l"});
  root_.append(h("div",{class:"pagehead"}, h("h1",null,t("adm_dashboard")), h("p",null, S.settings.appName || "Xuélù")));
  root_.append(h("div",{class:"kpis"},
    kpi(users.length, t("total_learners")), kpi(active, t("active_learners")), kpi(users.length-active, t("inactive_learners")),
    kpi(activeSubs, t("active_subs")), kpi(expired, t("expired_subs")), kpi(week, t("adm_activity")+" · 7d")));
  root_.append(h("div",{class:"grid2"},
    h("section",{class:"panel"}, h("h3",null,t("content_counts")), h("div",{class:"kpis"}, counts.map(([ty,n]) => h("button",{class:"kpi",style:"text-align:left",onclick:()=>go("contentList",{type:ty})}, h("b",null,n), h("span",null,t("type_"+ty)))))),
    h("section",{class:"panel"}, h("h3",null,t("publish_state")),
      h("div",{class:"banner "+(S.bundle.dirty||!S.bundle.builtAt?"":"ok")}, h("span",null, S.bundle.dirty||!S.bundle.builtAt ? t("unpublished_changes") : t("up_to_date")), canContent()? h("button",{class:"btn sm",onclick:publishFlow}, t("publish_now")) : null),
      h("p",{class:"small muted"}, t("last_published")+": "+fmtDate(S.bundle.builtAt, lang(), true)),
      h("p",{class:"small muted"}, t("payments_note")))));
  root_.append(h("section",{class:"panel"}, h("h3",null,t("recent_activity"), h("button",{class:"btn sm ghost",onclick:()=>go("activity")}, t("view_all"))), activityFeed(activity)));
  return root_;
}
const kpi = (n, label) => h("div",{class:"kpi"}, h("b",null,n), h("span",null,label));
export function activityFeed(rows){
  if (!rows.length) return h("p",{class:"muted"}, t("no_rows"));
  return h("div",{class:"feed"}, rows.map(a => h("div",{class:"feed-row"},
    h("span",null, h("b",null,a.name||"—"), " · ", a.type, a.ref ? " · "+a.ref : "", a.total ? ` · ${a.score}/${a.total}` : ""),
    h("span",{class:"muted small"}, fmtDate(a.at, lang(), true)))));
}
async function viewActivity(){
  const rows = await S.api.db.list("activity", { orderBy:["at","desc"], limit:200 }).catch(()=>[]);
  return h("div",null, h("div",{class:"pagehead"}, h("h1",null,t("adm_activity"))), h("div",{class:"panel"}, activityFeed(rows)));
}

// ---------- settings ----------
async function viewSettings(){
  if (!isSuper()) {
    return h("div", { class: "panel stack", style: "text-align:center;padding:48px 24px;max-width:540px;margin:40px auto" },
      h("div", { style: "font-size:3rem;margin-bottom:8px" }, "🔒"),
      h("h2", null, t("only_super")),
      h("p", { class: "muted" }, t("credential_menu_restricted")),
      h("div", { class: "row", style: "justify-content:center;margin-top:16px" },
        h("button", { class: "btn primary", onclick: () => go("dashboard") }, "← " + t("adm_dashboard"))
      )
    );
  }

  const s = Object.assign({ appName:"Xuélù", allowRegistration:false, defaultPlanId:"free", supportContact:"" }, await S.api.db.get("settings/app").catch(()=>null)||{});
  const name = h("input",{class:"input",value:s.appName}), reg = h("input",{type:"checkbox",class:"switch",checked:!!s.allowRegistration,"aria-label":t("allow_reg")});
  const plan = h("select",{class:"input"}, S.plans.map(p=>h("option",{value:p.id,selected:p.id===s.defaultPlanId},(p.name&&p.name.en)||p.id)));
  const contact = h("input",{class:"input",value:s.supportContact,placeholder:"WhatsApp / email / Facebook page"});
  const wrap = h("div",{class:"stack-l"});
  wrap.append(h("div",{class:"pagehead"}, h("h1",null,t("adm_settings")), h("p",null,"Configure platform settings, database schema, and test accounts.")));

  // Learner & Admin Test Accounts Card (these accounts exist only in demo mode)
  if (S.api.mode === "demo") wrap.append(h("section",{class:"panel",style:"background:var(--surface-2);border:1px solid var(--accent)"},
    h("h3",{style:"color:var(--accent);display:flex;align-items:center;gap:6px"}, icon("users"), "Learner & Admin Login Credentials"),
    h("p",{class:"small muted"}, "Pre-configured user accounts with distinct roles to test permissions, read-only modes, and access tiers:"),
    h("div",{class:"grid3",style:"gap:10px;margin-top:8px"},
      h("div",{class:"card",style:"padding:10px;background:var(--surface)"},
        h("b",{style:"color:var(--accent)"}, "🛡️ Super Admin / Owner"),
        h("div",{class:"small mono",style:"margin-top:4px"}, "admin@demo.laolao"),
        h("div",{class:"small muted"}, "Password: ", h("b",{class:"mono"}, "demo1234")),
        h("div",{class:"small muted",style:"font-size:.75rem;margin-top:2px"}, "Full privileges: Credentials, settings & admin CRUD")
      ),
      h("div",{class:"card",style:"padding:10px;background:var(--surface)"},
        h("b",{style:"color:var(--jade)"}, "✍️ Content Editor"),
        h("div",{class:"small mono",style:"margin-top:4px"}, "editor@demo.laolao"),
        h("div",{class:"small muted"}, "Password: ", h("b",{class:"mono"}, "demo1234")),
        h("div",{class:"small muted",style:"font-size:.75rem;margin-top:2px"}, "Full edit on curriculum & studio. No credentials.")
      ),
      h("div",{class:"card",style:"padding:10px;background:var(--surface)"},
        h("b",{style:"color:#7c3aed"}, "👁️ Content Reviewer (Read-Only)"),
        h("div",{class:"small mono",style:"margin-top:4px"}, "reviewer@demo.laolao"),
        h("div",{class:"small muted"}, "Password: ", h("b",{class:"mono"}, "demo1234")),
        h("div",{class:"small muted",style:"font-size:.75rem;margin-top:2px"}, "Can view and preview curriculum, CANNOT edit or delete")
      ),
      h("div",{class:"card",style:"padding:10px;background:var(--surface)"},
        h("b",{style:"color:#2563eb"}, "🎧 Support Admin"),
        h("div",{class:"small mono",style:"margin-top:4px"}, "support@demo.laolao"),
        h("div",{class:"small muted"}, "Password: ", h("b",{class:"mono"}, "demo1234")),
        h("div",{class:"small muted",style:"font-size:.75rem;margin-top:2px"}, "Can manage learners and view activity only")
      ),
      h("div",{class:"card",style:"padding:10px;background:var(--surface)"},
        h("b",{style:"color:var(--jade)"}, "🎓 Learner (Premium)"),
        h("div",{class:"small mono",style:"margin-top:4px"}, "learner@demo.laolao"),
        h("div",{class:"small muted"}, "Password: ", h("b",{class:"mono"}, "demo1234")),
        h("div",{class:"small muted",style:"font-size:.75rem;margin-top:2px"}, "Full access to all stages & lessons")
      ),
      h("div",{class:"card",style:"padding:10px;background:var(--surface)"},
        h("b",{style:"color:var(--ink-2)"}, "🆓 Learner (Free Tier)"),
        h("div",{class:"small mono",style:"margin-top:4px"}, "free@demo.laolao"),
        h("div",{class:"small muted"}, "Password: ", h("b",{class:"mono"}, "demo1234")),
        h("div",{class:"small muted",style:"font-size:.75rem;margin-top:2px"}, "Free tier access for testing paywalls")
      )
    ),
    h("div",{class:"row",style:"margin-top:10px;gap:8px"},
      h("a",{href:"../",target:"_blank",class:"btn sm",style:"text-decoration:none"}, icon("home"), "Open Learner App (New Tab) ↗"),
      h("button",{class:"btn sm ghost",onclick:()=>go("admins")}, icon("shield"), "Manage Admins & Custom Roles →")
    )
  ));

  // Supabase PostgreSQL Schema Integration Card
  wrap.append(h("section",{class:"panel"},
    h("h3",{style:"display:flex;align-items:center;gap:6px"}, icon("content"), "Supabase PostgreSQL Database Schema (30 Tables)"),
    h("p",{class:"small muted"}, "Current Mode: ", h("span",{class:"chip ok mono"}, S.api.mode.toUpperCase()), " · All 15 curriculum collections (lessons, patterns, grammar, vocabulary, dialogues, quizzes, videos, tones, culture, characters, dictionary, audio, lexicon, paths, releases) have dedicated tables."),
    h("p",{class:"small muted"}, "If your Supabase project displays 'Could not find the table ... in the schema cache', run the complete SQL script in your Supabase SQL Editor:"),
    h("div",{class:"row",style:"gap:8px"},
      h("button",{class:"btn sm primary",onclick:async()=>{
        try {
          const res = await fetch("../supabase-schema.sql");
          const sql = await res.text();
          await navigator.clipboard.writeText(sql);
          toast("Supabase SQL Schema copied to clipboard!", "ok");
        } catch(e){
          window.open("../supabase-schema.sql", "_blank");
        }
      }}, icon("copy"), "Copy Supabase SQL Schema (30 Tables)"),
      h("a",{href:"../supabase-schema.sql",target:"_blank",download:"supabase-schema.sql",class:"btn sm ghost",style:"text-decoration:none"}, icon("download"), "Download supabase-schema.sql")
    )
  ));

  wrap.append(h("section",{class:"panel"},
    fld(t("app_name"), name), h("div",{class:"set-row"}, h("div",null,h("label",null,t("allow_reg")),h("p",null,t("allow_reg_d"))), reg),
    fld(t("support_contact"), contact),
    h("div",{class:"row"}, h("button",{class:"btn primary",disabled:!isSuper(),onclick:async()=>{ await S.api.db.set("settings/app",{appName:name.value.trim(),allowRegistration:reg.checked,defaultPlanId:plan.value,supportContact:contact.value.trim()},true); S.settings = await S.api.db.get("settings/app"); toast(t("saved_ok")); }}, t("save")), isSuper()?null:h("span",{class:"muted small"},t("only_super")))));

  wrap.append(h("section",{class:"panel"}, h("h3",null,t("adm_import")), h("p",{class:"muted"},t("adm_import_d")),
    h("div",{class:"row"}, h("button",{class:"btn",disabled:!isSuper(),onclick:async()=>{
      if (!await confirmDialog(t("adm_import"), t("confirm_import"), t("adm_import"), t("cancel"))) return;
      const st = h("p",{class:"muted"}, t("importing")); dialog({ title:t("adm_import"), body:st });
      try { const n = await importSeed(S.api, S.me.uid, step => st.textContent = t("importing")+" "+step); await refreshPlans(); await refreshBundleState(); document.querySelector(".dialog .ib")?.click(); toast(t("imported")+" ("+n+")"); S.render(); }
      catch(e){ st.textContent = errText(e); }
    }}, icon("download"), t("adm_import")),
    h("button",{class:"btn",onclick:exportAll}, icon("copy"), t("export")))));

  if (S.api.mode==="demo") wrap.append(h("section",{class:"panel"}, h("h3",null,t("danger")), h("button",{class:"btn danger",style:"align-self:flex-start",onclick:async()=>{ if(await confirmDialog(t("reset_demo"),"Delete all demo data in this browser?",t("reset_demo"),t("cancel"),true)){ await S.api._reset(); location.reload(); } }}, t("reset_demo"))));
  return wrap;
}
async function exportAll(){
  const out = {};
  for (const ty of [...CONTENT_TYPES, "plans"]) out[ty] = await S.api.db.list(ty);
  const text = JSON.stringify(out, null, 1);
  const ta = h("textarea",{class:"code",style:"min-height:320px","aria-label":"JSON"}); ta.value = text;
  dialog({ title:t("export"), wide:true, body:h("div",{class:"stack"}, h("p",{class:"muted small"}, Math.round(text.length/1024)+" KB"), ta),
    actions:[{label:t("copy"),primary:true,onClick:async()=>{ try{ await navigator.clipboard.writeText(text); toast(t("copied")); }catch(e){ ta.select(); } return false; }}] });
}

boot().catch(e => { root.innerHTML=""; root.append(h("div",{class:"banner",style:"margin:40px"}, errText(e))); console.error(e); });
