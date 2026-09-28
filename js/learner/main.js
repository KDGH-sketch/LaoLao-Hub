// LaoLao learner app
import { getApi } from "../api/index.js";
import { h, $, $$, icon, toast, errText, pyHTML, stripTone, debounce, tr } from "../shared/ui.js";
import { t, lang, setLang } from "../shared/i18n.js";
import { ensureDemo, DEMO } from "../shared/setup.js";
import { dict, searchDict } from "../shared/dict.js";
import { onMissingVoice, speak } from "../shared/speech.js";
import { openWord, closeSheet } from "../shared/widgets.js";
import { createWaitingScreen, dokChampaSvg, LAO_SAMPLES } from "../shared/lao-decorations.js";
import { A, loadAccount, prefs, setPref, applyPrefs, srsDue, T } from "./core.js";
import * as LV from "./views-learn.js";
import * as TV from "./views-tools.js";
import { LAB_VIEWS } from "./views-labs.js";

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
  api.auth.onChange(async user => {
    if (!user) return renderAuth("signin");
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
        const u = await A.api.auth.signUp(email.value.trim(), pw.value);
        const now = new Date();
        await A.api.db.set(`users/${u.uid}`, { email:u.email, name:name.value.trim(), status:"active", level:1, role:"learner", prefs:{ uiLang:lang(), explainLang:lang() }, createdAt:now, lastActive:now });
        await A.api.db.set(`access/${u.uid}`, { planId: settings.defaultPlanId||"free", tier:1, status:"active", start:now, expiresAt:null, source:"registration" });
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
        h("div",{class:"langsw"}, [["en","EN"],["lo","ລາວ"],["zh","中文"]].map(([l,n]) =>
          h("button",{type:"button","aria-pressed":String(L===l),onclick:()=>{ setLang(l); try{ localStorage.setItem("xuelu.lang",l); }catch(e){} renderAuth(mode); }}, n)
        )),
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
      ) : null
    )
  );

  root.append(
    A.api.mode==="demo" ? h("div",{class:"demo-bar"}, t("demo_banner")) : "",
    h("div",{class:"auth"}, heroArt, authFormWrap)
  );
}

function renderDisabled(){
  root.innerHTML = "";
  root.append(h("div",{class:"auth"}, h("div",{class:"auth-art"}, h("div",{class:"big lo"},"ລ")), h("div",{class:"auth-form-wrap"}, h("div",{class:"auth-form"}, h("h1",null,t("disabled")), A.settings.supportContact ? h("p",null,t("contact")+": "+A.settings.supportContact) : null, h("button",{class:"btn",onclick:()=>A.api.auth.signOut()}, t("sign_out"))))));
}

// ---------- shell ----------
const VIEWS = Object.assign({}, LV.VIEWS, TV.VIEWS, LAB_VIEWS, {
  script_lab: TV.VIEWS.chars
});
const NAV = [
  ["home","nav_home","home"],
  ["paths","nav_paths","path"],
  ["lessons","nav_lessons","learn"],
  ["tone_lab","nav_tone_lab","spark"],
  ["pronounce_lab","nav_pronounce","speaker"],
  ["chars","nav_chars","pen"],
  ["particle_lab","nav_particles","flame"],
  ["kinship_lab","nav_kinship","users"],
  ["classifiers_lab","nav_classifiers","layers"],
  ["culture_lab","nav_culture","globe"],
  ["patterns","nav_patterns","gen"],
  ["practice","nav_practice","practice"],
  ["review","nav_review","review"],
  null,
  ["dict","nav_dict","dict"],
  ["pinyin","nav_pinyin","pinyin"],
  ["speak","nav_speak","mic"],
  null,
  ["saved","nav_saved","bookmark"],
  ["notes","nav_notes","note"],
  ["progress","nav_progress","chart"],
  ["downloads","nav_offline","download"],
  ["account","nav_account","user"]];
const TABS = [["home","nav_home","home"],["paths","nav_learn","path"],["tone_lab","nav_tone_lab","spark"],["practice","nav_practice","practice"],["review","nav_review","review"],["more","nav_more","more"]];
const PARENT = { lesson:"lessons", path:"paths", pattern:"patterns", grammarItem:"grammar", quiz:"practice", gen:"patterns" };
let searchPop, netEl;
function render(){
  const cur = PARENT[A.view.name] || A.view.name;
  root.innerHTML = "";
  const side = h("nav",{class:"side","aria-label":"Main"},
    h("div",{class:"brand"}, h("div",{class:"seal lo"},"ລ"), h("div",null, h("b",null,A.settings.appName||"LaoLao"), h("small",null,t("tagline")))));
  NAV.forEach(n => { if (!n){ side.append(h("div",{class:"sep"})); return; } const [id,k,ic] = n; const due = id==="review" ? srsDue().length : 0;
    side.append(h("button",{class:"nav-btn","aria-current":cur===id?"page":null,onclick:()=>go(id)}, icon(ic), t(k), due ? h("span",{class:"count"},due) : null)); });
  if (A.isAdmin) side.append(h("div",{class:"sep"}), h("a",{class:"nav-btn",href:"admin/",style:"text-decoration:none"}, icon("shield"), t("adm_title")));
  netEl = h("span",{class:"netdot"}, h("i"), " ");
  side.append(h("div",{class:"side-foot"}, netEl));
  const search = h("input",{id:"search",type:"search",autocomplete:"off","aria-label":t("search_ph"),placeholder:t("search_ph")});
  searchPop = h("div",{class:"search-pop",hidden:true});
  const p = prefs();
  const top = h("header",{class:"topbar"},
    h("button",{class:"mbrand",style:"border:0;background:none;padding:0",onclick:()=>go("home")}, h("span",{class:"seal lo"},"ລ"), h("span",null,A.settings.appName||"LaoLao")),
    h("div",{class:"search",role:"search"}, icon("dict"), search, searchPop),
    h("div",{class:"toggles"},
      h("button",{class:"tg","aria-pressed":String(p.showPy),onclick:e=>{ setPref("showPy",!prefs().showPy); e.currentTarget.setAttribute("aria-pressed",String(prefs().showPy)); }}, t("show_pinyin")),
      h("button",{class:"tg","aria-pressed":String(p.showTr),onclick:e=>{ setPref("showTr",!prefs().showTr); e.currentTarget.setAttribute("aria-pressed",String(prefs().showTr)); }}, t("show_trans")),
      h("div",{class:"langsw",role:"group","aria-label":t("ui_lang")}, [["en","EN"],["lo","ລາວ"],["zh","中"]].map(([l,n]) => h("button",{"aria-pressed":String(lang()===l),lang:l==="zh"?"zh-CN":l,onclick:()=>{ setPref("uiLang",l); try{ localStorage.setItem("xuelu.lang",l); }catch(e){} render(); }}, n)))));
  const main = h("main",{id:"main",tabindex:"-1"});
  const tabs = h("nav",{class:"tabbar","aria-label":"Tabs"}, TABS.map(([id,k,ic]) => h("button",{"aria-current":(id==="more" ? !TABS.some(x=>x[0]===cur) : cur===id)?"page":null,onclick:()=>go(id)}, icon(ic), t(k))));
  root.append(A.api.mode==="demo" ? h("div",{class:"demo-bar"}, t("demo_banner")) : "", h("div",{class:"app"}, side, h("div",{class:"mainwrap"}, top, main)), tabs);
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
    add(t("nav_lessons"), Object.values(A.byType.lessons||{}).filter(l => match(T(l.title)) || match(l.title&&l.title.zh) || (l.vocab||[]).includes(q)).slice(0,4).map(l => h("button",{class:"sp-item",onclick:()=>{ close(); go("lesson",{id:l.id}); }}, h("span",null,T(l.title)), h("span",{class:"muted small"},"HSK "+l.level))));
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
