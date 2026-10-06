// LaoLao Admin Backend
import { getApi } from "../api/index.js";
import { OWNER_EMAIL } from "../config.js";
import { h, $, $$, icon, toast, dialog, confirmDialog, fmtDate, errText } from "../shared/ui.js";
import { setLang, lang } from "../shared/i18n.js";
import { CONTENT_TYPES } from "../shared/content.js";
import { bootstrapOwner, importSeed, ensureDemo, DEMO } from "../shared/setup.js";
import { loadDict } from "../shared/dict.js";
import { createWaitingScreen, dokChampaSvg } from "../shared/lao-decorations.js";
import { adminProfileChip, adminSignOut, loadAdminProfile, closeAdminProfile } from "./profile.js";
import { S, L, t, go, isSuper, isOwner, getActiveRole, canContent, canSupport, canViewMenu, canEditMenu, canManageAdmins, canManageSettings, refreshPlans, fld, lockedScreen } from "./state.js";
import { viewLearners, viewLearner } from "./learners.js";
import { viewPlans } from "./plans.js";
import { viewAccessMatrix, viewAccessLogs } from "./access.js";
import { viewHandwriting, viewHandwritingEditor } from "./handwriting.js";
import { viewContentHome, viewContentList, viewEditor } from "./cms.js";
import { EXT_VIEWS } from "./cms-extended.js";
import { viewAdmins } from "./admins.js";
import { publishPanel } from "./publish.js";
import { viewWelcome, viewPromotions } from "./welcome-admin.js";
import { viewPayments } from "./payments.js";

const root = document.getElementById("root");
const pref = (() => { try { return localStorage.getItem("xuelu.admin.lang") || "en"; } catch(e){ return "en"; } })();
setLang(["lo","zh"].includes(pref) ? pref : "en");

async function boot(){
  const api = S.api = await getApi();
  if (api.mode==="demo"){ root.replaceChildren(createWaitingScreen("ສະບາຍດີ", t("loading")+"...")); await ensureDemo(api); }
  // arriving from a password-reset email: ask for the new password first
  let recovering = /type=recovery/.test(location.hash);
  if (api.auth.onRecovery) api.auth.onRecovery(() => { recovering = true; renderNewPassword(); });
  api.auth.onChange(async user => {
    if (!user){ S.me=null; return renderLogin(); }
    if (recovering) return renderNewPassword();
    if (!root.querySelector(".waiting-screen")) root.replaceChildren(createWaitingScreen("ສະບາຍດີ", "ກຳລັງເປີດລະບົບຈັດການ... / Opening LaoLao Admin..."));
    let adm = null; try { adm = await api.db.get(`admins/${user.uid}`); } catch(e){}
    if (!adm){
      let boot = null; try { boot = await api.db.get("settings/bootstrap"); } catch(e){}
      if (!boot) return renderSetup(user);
      return renderNoAccess(user);
    }
    S.me = { uid:user.uid, email:user.email, role:adm.role, name:adm.name||user.email, permissions:adm.permissions, allowedMenus:adm.allowedMenus };
    await Promise.all([refreshPlans().catch(()=>[]), api.db.get("settings/app").then(s=>S.settings=s||{}).catch(()=>{}), refreshBundleState()]);
    await loadAdminProfile();
    loadDict();
    S.render = renderShell; renderShell();
    // closing or reloading the tab with unsaved edits: the browser asks too
    window.addEventListener("beforeunload", e => { if (S.leaveGuard && S.leaveGuard()){ e.preventDefault(); e.returnValue = ""; } });
  });
}
export async function refreshBundleState(){ try { S.bundle = await S.api.db.get("settings/bundle") || {}; } catch(e){ S.bundle = {}; } }

// ---------- auth screens ----------
// The admin sign-in screens (sign in, new password, no access, first setup) share this frame: an animated night-blue
// background (light blobs, Lao textile pattern, drifting Lao letters, Mekong waves), a hero with what the console is for,
// and the card. Styles: css/admin.css "admin sign-in".
const AUTH_FEATURES = [
  ["content", ["Content & publishing","ເນື້ອຫາ ແລະ ການເຜີຍແຜ່","内容与发布"], ["Lessons, words, videos and the welcome page","ບົດຮຽນ, ຄຳສັບ, ວິດີໂອ ແລະ ໜ້າຕ້ອນຮັບ","课程、词汇、视频和欢迎页"]],
  ["users", ["Learners & plans","ຜູ້ຮຽນ ແລະ ແພັກເກດ","学员与套餐"], ["Accounts, access and progress","ບັນຊີ, ສິດເຂົ້າເຖິງ ແລະ ຄວາມຄືບໜ້າ","账户、权限和进度"]],
  ["wallet", ["Payments & reports","ການຊຳລະ ແລະ ລາຍງານ","付款与报表"], ["Orders, refunds and activity","ຄຳສັ່ງຊື້, ການຄືນເງິນ ແລະ ກິດຈະກຳ","订单、退款和活动"]]
];
const WAVES = '<svg viewBox="0 0 1440 160" preserveAspectRatio="none"><path class="w1" d="M0 80 C 180 40 360 120 540 80 S 900 40 1080 80 S 1440 120 1620 80 S 1980 40 2160 80 S 2520 120 2880 80 V160 H0Z"/><path class="w2" d="M0 100 C 200 70 400 130 600 100 S 1000 70 1200 100 S 1600 130 1800 100 S 2200 70 2400 100 S 2700 130 2880 100 V160 H0Z"/></svg>';
function authFrame(...kids){
  let n = 0; const st = el => { el.style.setProperty("--d", (n++ * 70) + "ms"); return el; };
  const glyphs = ["ກ","ລ","ສ","ນ","ຮ","ດ","ມ","ວ"].map((g, i) => h("span",{class:"aa-glyph",style:`--x:${6 + i * 12}%;--s:${18 + (i % 3) * 7}s;--o:${-i * 2.7}s`}, g));
  const waves = h("div",{class:"aa-waves"}); waves.innerHTML = WAVES;      // a fixed string, no user data
  root.replaceChildren(...[demoBar(), h("div",{class:"aa"},
    h("div",{class:"aa-bg","aria-hidden":"true"}, h("i",{class:"aa-blob b1"}), h("i",{class:"aa-blob b2"}), h("i",{class:"aa-blob b3"}), h("div",{class:"aa-pattern"}), ...glyphs, waves),
    h("section",{class:"aa-hero"},
      st(h("div",{class:"aa-brand"}, h("div",{class:"aa-seal"}, dokChampaSvg(54)),
        h("div",null, h("b",null, (S.settings && S.settings.appName) || "LaoLao"), h("span",{class:"aa-tag"}, icon("shield"), L(["Admin console","ລະບົບຈັດການ","管理后台"]))))),
      st(h("p",{class:"aa-hello",lang:"lo"},"ສະບາຍດີ")),
      st(h("h2",{class:"aa-title"}, L(["Run LaoLao from one place.","ຈັດການ LaoLao ໄດ້ໃນບ່ອນດຽວ.","在一个地方管理 LaoLao。"]))),
      st(h("p",{class:"aa-sub"}, L(["Manage learners, access and learning content: everything the app shows starts here.","ຈັດການຜູ້ຮຽນ, ສິດເຂົ້າເຖິງ ແລະ ເນື້ອຫາ: ທຸກຢ່າງໃນແອັບເລີ່ມຈາກບ່ອນນີ້.","管理学员、权限和学习内容：应用里的一切都从这里开始。"]))),
      h("ul",{class:"aa-feats"}, AUTH_FEATURES.map(([ic, tt, d]) => st(h("li",null, h("span",{class:"aa-fi"}, icon(ic)), h("div",null, h("b",null, L(tt)), h("small",null, L(d)))))))),
    h("section",{class:"aa-panel"},
      h("div",{class:"aa-card"}, ...kids.filter(Boolean)),
      h("p",{class:"aa-foot"}, icon("lock"), L(["Secure area · what you can do depends on your role · changes are logged","ພື້ນທີ່ປອດໄພ · ສິດຂຶ້ນກັບບົດບາດ · ທຸກການປ່ຽນແປງຖືກບັນທຶກ","安全区域 · 权限取决于角色 · 所有更改都有记录"]))))].filter(Boolean));
}
// Heading of an auth card: icon badge, title and a short line
const authHead = (ic, title, sub) => h("div",{class:"aa-head"}, h("span",{class:"aa-badge"}, icon(ic)), h("div",null, h("h1",null,title), sub ? h("p",null,sub) : null));
function demoBar(){ return S.api && S.api.mode==="demo" ? h("div",{class:"demo-bar"}, t("demo_banner")+" ", h("button",{onclick:async()=>{ if(await confirmDialog(t("reset_demo"), "Delete all demo data in this browser and start again?", t("reset_demo"), t("cancel"), true)){ await S.api._reset(); location.reload(); } }}, t("reset_demo"))) : ""; }
function renderLogin(){
  const email = h("input",{class:"input",type:"email",autocomplete:"username",id:"em",placeholder:"name@example.com"});
  const pw = h("input",{class:"input",type:"password",autocomplete:"current-password",id:"pw",placeholder:"••••••••"});
  let showPw = false;
  const pwToggle = h("button",{type:"button",class:"aa-eye","aria-label":L(["Show password","ສະແດງລະຫັດຜ່ານ","显示密码"]),"aria-pressed":"false",onclick:()=>{
    showPw = !showPw;
    pw.type = showPw ? "text" : "password"; pwToggle.setAttribute("aria-pressed", String(showPw));
    pwToggle.replaceChildren(icon(showPw ? "eyeOff" : "eye"));
  }}, icon("eye"));
  const msg = h("p",{class:"aa-msg",role:"alert"});
  const submit = h("button",{class:"aa-submit",type:"submit"}, h("span",null, t("sign_in")), icon("right"));
  const fail = text => { msg.textContent = text; msg.classList.remove("shake"); void msg.offsetWidth; msg.classList.add("shake"); };
  const go_ = async e => {
    if (e) e.preventDefault();
    msg.textContent = "";
    if (!email.value.trim() || !pw.value) return fail(L(["Enter your email and password.","ໃສ່ອີເມວ ແລະ ລະຫັດຜ່ານ.","请输入邮箱和密码。"]));
    submit.disabled = true; submit.classList.add("busy");
    try { await S.api.auth.signIn(email.value.trim(), pw.value); }
    catch(err){ fail(errText(err)); submit.disabled = false; submit.classList.remove("busy"); }
  };
  const demoBtn = (acc, ic, label) => h("button",{class:"aa-demo-btn",type:"button",onclick:()=>{ email.value=acc.email; pw.value=acc.pw; go_(); }}, icon(ic), h("span",null,label));
  const demoCard = S.api.mode==="demo" ? h("div",{class:"aa-demo"},
    h("b",null, t("demo_accounts") + " · " + L(["one-click sign in","ເຂົ້າດ້ວຍຄລິກດຽວ","一键登录"])),
    h("div",{class:"aa-demo-grid"}, demoBtn(DEMO.admin, "shield", "Super Admin"), demoBtn(DEMO.editor, "edit", "Content Editor"), demoBtn(DEMO.reviewer, "eye", "Content Reviewer"), demoBtn(DEMO.support, "users", "Support Admin")),
    h("small",{class:"mono"}, "Password for all demo accounts: demo1234")) : null;

  authFrame(
    authHead("shield", t("sign_in"), L(["Administrators only. Use the account you were invited with.","ສຳລັບຜູ້ດູແລເທົ່ານັ້ນ. ໃຊ້ບັນຊີທີ່ທ່ານໄດ້ຮັບເຊີນ.","仅限管理员。请使用受邀的账户。"])),
    demoCard,
    h("form",{class:"aa-form",onsubmit:go_,novalidate:true},
      h("div",{class:"aa-field"}, h("label",{for:"em"},t("email")), h("div",{class:"aa-input"}, icon("user"), email)),
      h("div",{class:"aa-field"}, h("label",{for:"pw"},t("password")), h("div",{class:"aa-input"}, icon("lock"), pw, pwToggle)),
      msg, submit),
    h("div",{class:"aa-row"},
      h("button",{class:"aa-link",type:"button",onclick:async()=>{ if(!email.value.trim()) { fail(L(["Enter your email first, then tap Forgot password.","ໃສ່ອີເມວກ່ອນ, ແລ້ວກົດລືມລະຫັດຜ່ານ.","请先输入邮箱，再点忘记密码。"])); email.focus(); return; } try{ await S.api.auth.resetPassword(email.value.trim()); toast(t("reset_sent")); }catch(err){ fail(errText(err)); } }}, t("forgot")),
      langSwitch()),
    h("a",{href:"../",class:"aa-back"}, icon("home"), h("span",null, t("adm_open_learner")), icon("right")));
}
function renderNewPassword(){
  const pw = h("input",{class:"input",type:"password",id:"npw",autocomplete:"new-password"}), pw2 = h("input",{class:"input",type:"password",id:"npw2",autocomplete:"new-password"});
  const msg = h("p",{class:"small",style:"color:var(--bad)"});
  authFrame(authHead("lock", L(["Choose a new password","ຕັ້ງລະຫັດຜ່ານໃໝ່","设置新密码"])),
    h("form",{class:"stack",onsubmit:async e=>{ e.preventDefault(); msg.textContent="";
      if (pw.value.length < 6){ msg.textContent = "Password must be at least 6 characters."; return; }
      if (pw.value !== pw2.value){ msg.textContent = "The passwords do not match."; return; }
      try { await S.api.auth.changePassword(null, pw.value); toast("Password changed"); location.replace(location.pathname); } catch(err){ msg.textContent = errText(err); } }},
      h("div",{class:"field"}, h("label",{for:"npw"},"New password"), pw), h("div",{class:"field"}, h("label",{for:"npw2"},"Repeat the new password"), pw2), msg,
      h("button",{class:"btn primary",type:"submit"}, t("save"))));
}
function renderNoAccess(user){
  authFrame(authHead("shield", t("adm_title")),
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
  authFrame(authHead("spark", t("adm_setup_title")), h("p",{class:"muted"}, t("adm_setup_d")), h("p",{class:"small"}, user.email),
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
      { id:"characters", label:["Lao Script & Handwriting", "ອັກສອນ ແລະ ລາຍມື"], icon:"chars", view:"handwriting" },
      { id:"dictionary", label:["Dictionary Database", "ວັດຈະນານຸກົມ"], icon:"dict", view:"contentList", params:{ type:"dictionary" } }
    ]
  },
  {
    title: ["Studio & Operations", "ເຄື່ອງມື ແລະ ສະຕູດິໂອ"],
    items: [
      { id:"audioStudio", label:["Voice Studio", "ສະຕູດິໂອບັນທຶກສຽງ"], icon:"mic", view:"audioStudio" },
      { id:"excelImport", label:["Excel / CSV Importer", "ນຳເຂົ້າ Excel/CSV"], icon:"upload", view:"excelImport" },
      { id:"contentHealth", label:["Content Health Audit", "ກວດສອບຄວາມສົມບູນ"], icon:"spark", view:"contentHealth" }
    ]
  },
  {
    title: ["Website & Welcome", "ເວັບໄຊ ແລະ ໜ້າຕ້ອນຮັບ"],
    items: [
      { id:"welcome", label:["Welcome Page", "ໜ້າຕ້ອນຮັບ"], icon:"home", view:"welcome" },
      { id:"places", label:["Journey Places", "ສະຖານທີ່"], icon:"globe", view:"contentList", params:{ type:"places" } },
      { id:"festivals", label:["Festivals", "ບຸນ"], icon:"star", view:"contentList", params:{ type:"festivals" } },
      { id:"promotions", label:["Promotions & Feed", "ໂປຣໂມຊັ່ນ ແລະ ຂ່າວ"], icon:"gift", view:"promotions" },
      { id:"resources", label:["Free Resources", "ຊັບພະຍາກອນຟຣີ"], icon:"download", view:"contentList", params:{ type:"resources" } }
    ]
  },
  {
    title: ["Platform & System", "ລະບົບ ແລະ ການຕັ້ງຄ່າ"],
    items: [
      { id:"plans", label:["Pricing Plans", "ແຜນການຮຽນ"], icon:"plan", view:"plans" },
      { id:"accessMatrix", label:["Plan Access & Limits", "ສິດ ແລະ ຂີດຈຳກັດແພັກເກດ"], icon:"sliders", view:"accessMatrix" },
      { id:"accessLogs", label:["Access Logs", "ບັນທຶກການເຂົ້າເຖິງ"], icon:"eye", view:"accessLogs" },
      { id:"payments", label:["Payments & Orders", "ການຈ່າຍເງິນ ແລະ ຄຳສັ່ງຊື້"], icon:"wallet", view:"payments" },
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
      h("button",{class:"nav-btn",onclick:()=>{ closeAdminSheet(); adminSignOut(); }}, icon("logout"), t("sign_out"))));
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
  if (item.view === "handwriting") {
    return S.view === "handwriting" || S.view === "handwritingEditor" || (S.view === "editor" && S.params && S.params.type === "characters");
  }
  return S.view === item.view;
}

function rolePreviewSwitch(){
  if (!isOwner() && !["super", "owner"].includes(S.me?.role)) return "";
  if (S.simulatedRole) {
    return h("button", {
      class: "btn sm",
      style: "background:var(--warn-2);color:var(--warn);border:1px solid var(--warn);display:inline-flex;align-items:center;gap:6px;font-weight:600",
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
    h("option", { value: "" }, "Super Admin (Live)"),
    h("option", { value: "reviewer" }, "Content Reviewer (Read-Only)"),
    h("option", { value: "editor" }, "Content Editor (No Credentials)"),
    h("option", { value: "support" }, "Support Admin (Learners Only)")
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
        active ? h("span",{class:"nav-ind","aria-hidden":"true"}) : null,     // the sliding highlight, as in the learner app
        icon(it.icon),
        lang() === "lo" ? it.label[1] : it.label[0]
      ));
    });
  });

  side.append(h("div",{class:"sep"}), h("a",{class:"nav-btn",href:"../",style:"text-decoration:none"}, icon("home"), t("adm_open_learner")),
    h("button",{class:"nav-btn",onclick:adminSignOut}, icon("logout"), t("sign_out")),
    h("div",{class:"side-foot"}, S.me.email));

  const top = h("header",{class:"topbar"},
    h("button",{class:"ib hide-desk","aria-label":t("nav_more")||"Menu",onclick:openAdminMenu}, icon("menu")),
    h("div",{class:"mbrand"}, h("span",{class:"seal lo"},"ລ"), h("b",null,t("adm_title"))),
    h("div",{style:"flex:1"}),
    // on phones these move into the profile menu (css/admin.css)
    h("div",{class:"adm-tools"},
      rolePreviewSwitch(),
      h("a",{class:"btn sm ghost",href:"../",style:"text-decoration:none;display:inline-flex;align-items:center;gap:4px;padding:5px 9px",title:t("adm_open_learner")}, icon("home"), h("span",{class:"hide-sm"}, t("adm_open_learner"))),
      langSwitch()),
    publishChip(),
    adminProfileChip({ rerender: () => renderShell(), rolePreview: () => { const el = rolePreviewSwitch(); if (!el) return null; el.classList.remove("hide-sm"); el.addEventListener("change", closeAdminProfile); return el; } }));

  const main = h("main",{id:"main"});
  root.append(demoBar(), h("div",{class:"app adm"}, side, h("div",{class:"mainwrap"}, top, main)));

  let allowed = canViewMenu(S.view);
  if (S.view === "contentList" || S.view === "editor") {
    allowed = canViewMenu(S.params?.type || "content");
  } else if (S.view === "learner") {
    allowed = canViewMenu("learners");
  } else if (S.view === "handwriting" || S.view === "handwritingEditor") {
    allowed = canViewMenu("characters");      // same rights as the characters content (the database checks ll_can_edit('characters'))
  }

  if (!allowed) {
    main.innerHTML = "";
    main.append(lockedScreen(t("only_super"), t("credential_menu_restricted")));
    return;
  }

  const V = Object.assign({ dashboard:viewDashboard, learners:viewLearners, learner:viewLearner, plans:viewPlans, accessMatrix:viewAccessMatrix, accessLogs:viewAccessLogs, payments:viewPayments, handwriting:viewHandwriting, handwritingEditor:viewHandwritingEditor, content:viewContentHome, contentList:viewContentList, editor:viewEditor, activity:viewActivity, admins:viewAdmins, settings:viewSettings }, EXT_VIEWS, { welcome:viewWelcome, promotions:viewPromotions });
  const fn = V[S.view] || viewDashboard;
  Promise.resolve(fn(S.params||{})).then(el => { main.innerHTML=""; main.append(el); }).catch(err => { console.error(err); main.innerHTML=""; main.append(h("div",{class:"banner"}, errText(err))); });
}

function publishChip(){
  if (!canContent() || !canEditMenu("lessons")) return "";
  const dirty = !!S.bundle.dirty || !S.bundle.builtAt;
  // on phones the "up to date" text is hidden (the check mark and its tooltip remain); "Publish now" always shows
  return h("button",{class:"btn sm pub-chip"+(dirty?" primary":""),title: dirty ? t("unpublished_changes") : t("up_to_date"),"aria-label": dirty ? t("publish_now") : t("up_to_date"),onclick:publishFlow}, icon(dirty?"upload":"check"), h("span",{class: dirty ? "" : "pub-chip-t"}, dirty ? t("publish_now") : t("up_to_date")));
}
// Resolves when the panel is closed: true if it published (see js/admin/publish.js)
export async function publishFlow(){
  // refresh the header's publish button behind the panel as soon as it succeeds
  return publishPanel({ onDone: async () => { await refreshBundleState(); S.render(); } });
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
  root_.append(h("div",{class:"pagehead"}, h("span",{class:"eyebrow"}, fmtDate(now, lang())), h("h1",null,t("adm_dashboard")), h("p",null, S.settings.appName || "LaoLao")));
  root_.append(h("div",{class:"kpi-row"},
    kpiCard(users.length, t("total_learners"), "users", "accent"),
    kpiCard(active, t("active_learners"), "ok", "jade"),
    kpiCard(users.length-active, t("inactive_learners"), "user", "neutral"),
    kpiCard(activeSubs, t("active_subs"), "crown", "accent"),
    kpiCard(expired, t("expired_subs"), "hourglass", "warn"),
    kpiCard(week, t("adm_activity")+" · 7d", "spark", "jade")));
  root_.append(h("div",{class:"grid2"},
    h("section",{class:"panel"}, h("h3",null,t("content_counts")), h("div",{class:"kpis"}, counts.map(([ty,n]) => h("button",{class:"kpi",style:"text-align:left",onclick:()=>go("contentList",{type:ty})}, h("b",null,n), h("span",null,t("type_"+ty)))))),
    h("section",{class:"panel"}, h("h3",null,t("publish_state")),
      h("div",{class:"banner "+(S.bundle.dirty||!S.bundle.builtAt?"":"ok")}, h("span",null, S.bundle.dirty||!S.bundle.builtAt ? t("unpublished_changes") : t("up_to_date")), canContent()? h("button",{class:"btn sm",onclick:publishFlow}, t("publish_now")) : null),
      h("p",{class:"small muted"}, t("last_published")+": "+fmtDate(S.bundle.builtAt, lang(), true)),
      h("p",{class:"small muted"}, t("payments_note")))));
  root_.append(h("section",{class:"panel"}, h("h3",null,t("recent_activity"), h("button",{class:"btn sm ghost",onclick:()=>go("activity")}, t("view_all"))), activityFeed(activity)));
  return root_;
}
// a number with an icon tile (tone: accent, jade, warn, bad, neutral); css/app.css "stat cards"
const kpiCard = (n, label, iconName, tone="accent") => h("div",{class:"card kpi-card"},
  h("span",{class:"kpi-ic tone-"+tone}, icon(iconName)),
  h("div",{class:"kpi-t"}, h("b",null, n), h("span",null, label)));
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
    return lockedScreen(t("only_super"), t("credential_menu_restricted"));
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
        h("b",{style:"color:var(--accent)"}, icon("shield"), "Super Admin / Owner"),
        h("div",{class:"small mono",style:"margin-top:4px"}, "admin@demo.laolao"),
        h("div",{class:"small muted"}, "Password: ", h("b",{class:"mono"}, "demo1234")),
        h("div",{class:"small muted",style:"font-size:.75rem;margin-top:2px"}, "Full privileges: Credentials, settings & admin CRUD")
      ),
      h("div",{class:"card",style:"padding:10px;background:var(--surface)"},
        h("b",{style:"color:var(--jade)"}, icon("edit"), "Content Editor"),
        h("div",{class:"small mono",style:"margin-top:4px"}, "editor@demo.laolao"),
        h("div",{class:"small muted"}, "Password: ", h("b",{class:"mono"}, "demo1234")),
        h("div",{class:"small muted",style:"font-size:.75rem;margin-top:2px"}, "Full edit on curriculum & studio. No credentials.")
      ),
      h("div",{class:"card",style:"padding:10px;background:var(--surface)"},
        h("b",{style:"color:var(--violet)"}, icon("eye"), "Content Reviewer (Read-Only)"),
        h("div",{class:"small mono",style:"margin-top:4px"}, "reviewer@demo.laolao"),
        h("div",{class:"small muted"}, "Password: ", h("b",{class:"mono"}, "demo1234")),
        h("div",{class:"small muted",style:"font-size:.75rem;margin-top:2px"}, "Can view and preview curriculum, CANNOT edit or delete")
      ),
      h("div",{class:"card",style:"padding:10px;background:var(--surface)"},
        h("b",{style:"color:var(--accent)"}, icon("headphones"), "Support Admin"),
        h("div",{class:"small mono",style:"margin-top:4px"}, "support@demo.laolao"),
        h("div",{class:"small muted"}, "Password: ", h("b",{class:"mono"}, "demo1234")),
        h("div",{class:"small muted",style:"font-size:.75rem;margin-top:2px"}, "Can manage learners and view activity only")
      ),
      h("div",{class:"card",style:"padding:10px;background:var(--surface)"},
        h("b",{style:"color:var(--jade)"}, icon("learn"), "Learner (Premium)"),
        h("div",{class:"small mono",style:"margin-top:4px"}, "learner@demo.laolao"),
        h("div",{class:"small muted"}, "Password: ", h("b",{class:"mono"}, "demo1234")),
        h("div",{class:"small muted",style:"font-size:.75rem;margin-top:2px"}, "Full access to all stages & lessons")
      ),
      h("div",{class:"card",style:"padding:10px;background:var(--surface)"},
        h("b",{style:"color:var(--ink-2)"}, icon("user"), "Learner (Free Tier)"),
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
