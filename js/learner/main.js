// LaoLao learner app
import { getApi } from "../api/index.js";
import { h, $, $$, icon, toast, errText, pyHTML, stripTone, debounce, tr } from "../shared/ui.js";
import { t, lang, setLang } from "../shared/i18n.js";
import { ensureDemo, DEMO } from "../shared/setup.js";
import { dict, searchDict } from "../shared/dict.js";
import { onMissingVoice, speak } from "../shared/speech.js";
import { openWord, closeSheet } from "../shared/widgets.js";
import { createWaitingScreen, dokChampaSvg, LAO_SAMPLES } from "../shared/lao-decorations.js";
import { A, loadAccount, prefs, setPref, applyPrefs, srsDue, T, createLearnerProfile, rememberPendingProfile } from "./core.js";
import * as LV from "./views-learn.js";
import * as TV from "./views-tools.js";
import { LAB_VIEWS } from "./views-labs.js";
import { MEDIA_VIEWS } from "./views-media.js";
import { themeSwitcher } from "../shared/ui.js";

const root = document.getElementById("root");
try { const l = localStorage.getItem("xuelu.lang"); if (l) setLang(l); } catch(e){}

export function go(name, params={}, push=true){ if (push) A.hist.push(A.view); A.view = { name, params }; closeSheet(); render(); window.scrollTo(0,0); }
export function back(){ const v = A.hist.pop(); if (v){ A.view = v; render(); } else go("home",{},false); }
A.go = go; A.back = back;

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
  api.auth.onChange(async user => {
    if (!user) return renderAuth("signin");
    if (recovering) return renderNewPassword();
    root.innerHTML = "";
    root.append(createWaitingScreen("ສະບາຍດີ", "ກຳລັງໂຫລດຂໍ້ມູນ... / Preparing your account..."));
    try { await loadAccount(user); } catch(e){ console.error(e); }
    if (A.profile.status!=="active" && !A.isAdmin) return renderDisabled();
    A.render = render;
    const start = location.hash.slice(1);
    if (/^p\d+$/.test(start)) A.view = { name:"pattern", params:{ n:+start.slice(1) } };
    else if (VIEWS[start]) A.view = { name:start, params:{} };
    render();
  });
  window.addEventListener("online", () => updateNet()); window.addEventListener("offline", () => updateNet());
}

// ---------- auth ----------
async function renderAuth(mode){
  let settings = {}; try { settings = await A.api.db.get("settings/app") || {}; } catch(e){}
  const email = h("input",{class:"input",type:"email",id:"em",autocomplete:"username",placeholder:"name@example.com"});
  const pw = h("input",{class:"input",type:"password",id:"pw",autocomplete:mode==="register"?"new-password":"current-password",placeholder:"••••••••"});
  const name = h("input",{class:"input",id:"nm",autocomplete:"name",placeholder:lang()==="lo"?"ຊື່ຂອງທ່ານ":"Your name"});
  const msg = h("p",{class:"small",style:"color:var(--bad);margin:0",role:"alert"});
  const submitBtn = h("button",{class:"btn primary",type:"submit"}, mode==="register" ? t("register") : mode==="reset" ? t("send_reset") : t("sign_in"));

  // Password visibility toggle
  let showPw = false;
  const pwToggle = h("button",{type:"button",class:"pw-toggle-btn","aria-label":"Toggle password visibility",onclick:()=>{
    showPw = !showPw;
    pw.type = showPw ? "text" : "password";
    pwToggle.replaceChildren(icon(showPw ? "eyeOff" : "eye"));
  }}, icon("eye"));

  const pwWrap = h("div",{class:"input-wrap"}, pw, pwToggle);

  const submit = async e => {
    e && e.preventDefault(); msg.textContent = "";
    submitBtn.disabled = true;
    submitBtn.textContent = lang()==="lo" ? "ກຳລັງດຳເນີນການ..." : "Please wait...";
    try {
      if (mode==="signin") await A.api.auth.signIn(email.value.trim(), pw.value);
      else if (mode==="reset"){ await A.api.auth.resetPassword(email.value.trim()); toast(t("reset_sent")); renderAuth("signin"); }
      else {
        rememberPendingProfile(email.value.trim(), name.value.trim());   // used if the email must be confirmed first
        let u;
        try { u = await A.api.auth.signUp(email.value.trim(), pw.value); }
        catch(err){
          if (err.code !== "auth/confirm-email") throw err;
          await renderAuth("signin");
          const note = document.querySelector(".auth-form [role=alert]");
          if (note){ note.style.color = "var(--jade)"; note.textContent = err.message; }
          return;
        }
        await createLearnerProfile(A.api, u, name.value.trim(), settings);
        if (A.api._flush) await A.api._flush();   // demo mode saves with a short delay; finish before reloading
        location.reload();
      }
    } catch(err){
      msg.textContent = errText(err);
      submitBtn.disabled = false;
      submitBtn.textContent = mode==="register" ? t("register") : mode==="reset" ? t("send_reset") : t("sign_in");
    }
  };

  const L = lang();
  root.innerHTML = "";

  // Left Hero (Authentic Lao Interactive Experience)
  const heroArt = h("div",{class:"auth-art"});

  // Floating background ambient glyphs
  const floatCont = h("div",{class:"floating-elements"});
  ["ກ","ດ","ນ","ສ","ລ","ຮ"].forEach(g => floatCont.appendChild(h("div",{class:"float-glyph"}, g)));
  heroArt.appendChild(floatCont);

  const heroTop = h("div",{class:"auth-hero-top"},
    h("div",{class:"auth-badge"}, h("i"), "ຮຽນຮູ້ພາສາລາວ · Authentic Lao Journey"),
    h("div",{class:"auth-brand-row"},
      h("div",{class:"auth-champa-icon"}, dokChampaSvg(56)),
      h("div",{class:"auth-title-group"},
        h("h2",null, settings.appName||"LaoLao"),
        h("small",null, "ຮຽນພາສາລາວດ້ວຍຄວາມສຸກ · Learn Lao Joyfully")
      )
    )
  );

  // Interactive Sabaidee Audio Button
  const sabaideeBtn = h("button",{type:"button",class:"sabaidee-interactive-btn",onclick:()=>{
    sabaideeBtn.classList.add("playing");
    speak("ສະບາຍດີ");
    setTimeout(() => sabaideeBtn.classList.remove("playing"), 1500);
  }},
    h("span",{style:"font-size:1.35rem"}, "🔊"),
    h("div",null,
      h("div",{class:"lo",style:"font-size:1.15rem;font-weight:700"}, "ສະບາຍດີ! (Sabaidee)"),
      h("small",{style:"opacity:.85;font-size:.78rem;display:block"}, "ແຕະເພື່ອຟັງສຽງທັກທາຍ · Tap to hear greeting")
    ),
    h("div",{class:"sound-bars"}, h("span"), h("span"), h("span"), h("span"))
  );

  // Interactive Consonants Showcase
  const chipDesc = h("div",{class:"small",style:"color:rgba(255,255,255,.9);font-weight:600;min-height:20px"}, "ແຕະພະຍັນຊະນະເພື່ອຟັງສຽງ · Tap any consonant to hear its sound:");
  const chipsCont = h("div",{class:"consonant-chips"});
  LAO_SAMPLES.slice(0, 7).forEach(c => {
    const chip = h("button",{
      type: "button",
      class: "consonant-chip",
      title: `${c.char} - ${c.name} (${c.meaning})`,
      onclick: e => {
        e.preventDefault();
        chipsCont.querySelectorAll(".consonant-chip").forEach(x => x.classList.remove("active"));
        chip.classList.add("active");
        chipDesc.innerHTML = `<span style="color:#FEF08A;font-weight:700">${c.char}</span> · <b>${c.name}</b> (${c.meaning}) · Sound: /${c.ipa}/`;
        speak(c.char);
      }
    },
      h("span",{class:"c-char"}, c.char),
      h("span",{class:"c-name"}, c.name)
    );
    chipsCont.appendChild(chip);
  });

  const heroConsonants = h("div",{class:"hero-consonants"},
    h("div",{class:"hero-consonants-title"}, "Lao Alphabet Preview"),
    chipsCont,
    chipDesc
  );

  // Proverb Box
  const proverbBox = h("div",{class:"lao-proverb-box"},
    h("div",{class:"pv-lao"}, "“ຄວາມພະຍາຍາມ ຢູ່ໃສ, ຄວາມສຳເລັດ ຢູ່ຫັ້ນ”"),
    h("div",{class:"pv-tr"}, "Where there is perseverance, there is success.")
  );

  heroArt.append(heroTop, sabaideeBtn, heroConsonants, proverbBox);

  // Right Form
  const authFormWrap = h("div",{class:"auth-form-wrap"},
    h("form",{class:"auth-form",onsubmit:submit},
      h("div",{class:"auth-form-header"},
        h("div",{class:"row",style:"align-items:center;gap:8px"},
          themeSwitcher(),
          h("div",{class:"langsw"}, [["en","EN"],["lo","ລາວ"],["zh","中文"]].map(([l,n]) =>
            h("button",{type:"button","aria-pressed":String(L===l),onclick:()=>{ setLang(l); try{ localStorage.setItem("xuelu.lang",l); }catch(e){} renderAuth(mode); }}, n)
          ))
        ),
        h("div",{class:"small",style:"color:var(--accent);font-weight:700"}, mode==="register" ? "New Account" : mode==="reset" ? "Reset Access" : "Welcome Back")
      ),
      h("h1",null, mode==="register" ? t("register") : mode==="reset" ? t("forgot") : t("sign_in")),
      mode==="register" ? h("div",{class:"field"}, h("label",{for:"nm"},t("name")), name) : null,
      h("div",{class:"field"}, h("label",{for:"em"},t("email")), email),
      mode!=="reset" ? h("div",{class:"field"}, h("label",{for:"pw"},t("password")), pwWrap) : null,
      msg,
      submitBtn,
      mode==="signin" ? h("button",{type:"button",class:"linkbtn",onclick:()=>renderAuth("reset")}, t("forgot")) : h("button",{type:"button",class:"linkbtn",onclick:()=>renderAuth("signin")}, t("have_account")),
      mode==="signin" ? (settings.allowRegistration ? h("p",{class:"small"}, t("no_account")+" ", h("button",{type:"button",class:"linkbtn",onclick:()=>renderAuth("register")}, t("register"))) : h("p",{class:"small muted"}, t("reg_closed"), settings.supportContact ? " · "+settings.supportContact : "")) : null,
      A.api.mode==="demo" && mode==="signin" ? h("div",{class:"demo-quick-box"},
        h("div",{class:"demo-quick-header"},
          h("span",null,"⚡ "+t("demo_accounts")),
          h("a",{href:"admin/",class:"linkbtn",style:"font-size:.8rem"}, "Admin Portal →")
        ),
        h("div",{class:"demo-btn-group"},
          h("button",{type:"button",class:"btn primary sm",onclick:()=>{ email.value=DEMO.premium.email; pw.value=DEMO.premium.pw; submit(); }}, "✨ Premium Learner"),
          h("button",{type:"button",class:"btn sm",onclick:()=>{ email.value=DEMO.free.email; pw.value=DEMO.free.pw; submit(); }}, "🌱 Free Learner")
        )
      ) : null,

      // Lao Learning Feed (Interesting Culture, Daily Tip)
      h("div",{class:"card stack",style:"gap:8px;background:var(--surface-2);border:1px solid var(--line);border-radius:14px;padding:14px;margin-top:14px"},
        h("div",{class:"spread"},
          h("b",{style:"font-size:.85rem;color:var(--accent);text-transform:uppercase;letter-spacing:.04em"}, "🇱🇦 Lao Learning Feed"),
          h("span",{class:"chip lv"}, "Daily Tip")
        ),
        h("div",{class:"lo",style:"font-size:1.05rem;font-weight:700"}, "“ບໍ່ເປັນຫຍັງ” (Bo Pen Nyang)"),
        h("p",{class:"small muted",style:"margin:0"}, "The cornerstone of Lao social harmony: means 'no problem / it is alright'. Use it whenever someone apologizes or thanks you."),
        h("button",{type:"button",class:"btn sm ghost",style:"align-self:flex-start;padding:4px 8px;font-size:.8rem",onclick:()=>speak("ບໍ່ເປັນຫຍັງ")}, icon("play"), "Listen")
      ),

      // Promotional Resource Banner & Socials
      h("div",{class:"promo-card",style:"margin-top:10px"},
        h("div",{class:"spread"},
          h("b",{style:"font-size:.9rem"}, "🎁 Free Lao Starter PDF Guide"),
          h("span",{class:"chip lv"}, "Free")
        ),
        h("p",{class:"small muted",style:"margin:0"}, "Download our structured 30-day Lao script, tones, and survival conversation reference book."),
        h("div",{class:"row",style:"justify-content:space-between;align-items:center;margin-top:6px"},
          h("button",{type:"button",class:"btn primary sm",onclick:()=>toast("Downloading Lao Beginner PDF guide...", "ok")}, icon("download"), "Free Download"),
          h("div",{class:"row",style:"gap:8px"},
            h("a",{href:"https://youtube.com/@laolaohub",target:"_blank",rel:"noreferrer",class:"btn sm ghost",title:"YouTube Channel"}, icon("video")),
            h("a",{href:"https://facebook.com/laolaohub",target:"_blank",rel:"noreferrer",class:"btn sm ghost",title:"Facebook"}, icon("globe"))
          )
        )
      )
    )
  );

  root.append(
    A.api.mode==="demo" ? h("div",{class:"demo-bar"}, t("demo_banner")) : "",
    h("div",{class:"auth"}, heroArt, authFormWrap)
  );
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
const VIEWS = Object.assign({}, LV.VIEWS, TV.VIEWS, LAB_VIEWS, MEDIA_VIEWS, {
  script_lab: TV.VIEWS.chars
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
      ...g.items.map(([id,k,ic]) => h("button",{class:"nav-btn","aria-current":cur===id?"page":null,onclick:()=>go(id)}, icon(ic), t(k)))))));
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
      side.append(h("button",{class:"nav-btn","aria-current":cur===id?"page":null,onclick:()=>go(id)}, icon(ic), t(k), due ? h("span",{class:"count"},due) : null)); });
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
      h("button",{class:"tg","aria-pressed":String(p.showPy),onclick:e=>{ setPref("showPy",!prefs().showPy); e.currentTarget.setAttribute("aria-pressed",String(prefs().showPy)); }}, t("show_pinyin")),
      h("button",{class:"tg","aria-pressed":String(p.showTr),onclick:e=>{ setPref("showTr",!prefs().showTr); e.currentTarget.setAttribute("aria-pressed",String(prefs().showTr)); }}, t("show_trans")),
      h("div",{class:"langsw",role:"group","aria-label":t("ui_lang")}, [["en","EN"],["lo","ລາວ"],["zh","中"]].map(([l,n]) => h("button",{"aria-pressed":String(lang()===l),lang:l==="zh"?"zh-CN":l,onclick:()=>{ setPref("uiLang",l); try{ localStorage.setItem("xuelu.lang",l); }catch(e){} render(); }}, n)))));
  const main = h("main",{id:"main",tabindex:"-1"});
  const tabs = h("nav",{class:"tabbar","aria-label":"Tabs"}, TABS.map(([id,k,ic]) => h("button",{"aria-current":(id==="more" ? !TABS.some(x=>x[0]===cur) : cur===id)?"page":null,onclick:()=>id==="more" ? openMoreMenu() : go(id)}, icon(ic), t(k))));
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
  try { const el = fn(A.view.params||{}); Promise.resolve(el).then(x => { main.innerHTML=""; main.append(x); }); }
  catch(e){ console.error(e); main.append(h("div",{class:"banner"}, errText(e))); }
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
