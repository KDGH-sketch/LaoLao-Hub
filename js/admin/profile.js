// Profile button and menu in the admin top bar: the same look and behaviour as the learner app's (css/app.css .pchip / .pmenu).
// On phones the top-bar theme, language and role-preview controls are hidden (css/admin.css) and live in this menu instead.
// The photo and nickname are the admin's own learner profile (users/{uid}); they are changed on the learner Account page.
import { h, icon, confirmDialog, leave, setTheme, getTheme, normTheme, withTransition } from "../shared/ui.js";
import { setLang, lang } from "../shared/i18n.js";
import { S, L, t } from "./state.js";

const safeAvatar = v => typeof v === "string" && (/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(v) || /^https:\/\/[^\s"'<>]+$/.test(v)) ? v : null;
const initials = n => (n.match(/[\p{L}\p{N}]/gu) || ["?"]).slice(0, 2).join("").toUpperCase();
const hue = s => { let x = 0; for (const c of String(s || "")) x = (x * 31 + c.charCodeAt(0)) % 360; return x; };
export const adminName = () => String((S.profile && (S.profile.nickname || S.profile.name)) || (S.me && S.me.name && S.me.name !== S.me.email ? S.me.name : "") || (S.me && S.me.email ? S.me.email.split("@")[0] : "") || "Admin").trim();
function avatarEl(size){
  const src = safeAvatar(S.profile && S.profile.avatar);
  return src ? h("img",{class:"av av-"+size, src, alt:"", decoding:"async"})
    : h("span",{class:"av av-"+size, "aria-hidden":"true", style:`--av-h:${hue(S.me && S.me.uid)}`}, initials(adminName()));
}
const roleText = () => t("role_" + (S.simulatedRole || S.me.role)) || S.me.role;

// The admin's learner profile (photo, nickname); missing is fine
export async function loadAdminProfile(){
  try { S.profile = await S.api.db.get(`users/${S.me.uid}`) || {}; } catch(e){ S.profile = {}; }
}

// Language of the admin panel (saved separately from the learner app's)
export function setAdminLang(l, rerender){
  closeAdminProfile();
  withTransition(() => { setLang(l); try { localStorage.setItem("xuelu.admin.lang", l); } catch(e){} return rerender(); }, { kind:"fade" });
}

export function adminProfileChip({ rerender, rolePreview }){
  return h("button",{class:"pchip",type:"button","aria-haspopup":"menu","aria-expanded":"false","aria-label":t("pf_menu"),onclick:e=>openAdminProfile(e.currentTarget, { rerender, rolePreview })},
    avatarEl("sm"), h("span",{class:"pchip-t"}, h("b",null, adminName()), h("small",null, roleText())), icon("down","pchip-c"));
}

export function closeAdminProfile(){
  const m = document.querySelector(".pmenu:not(.out)"); if (!m) return;
  leave(m, 180); leave(document.querySelector(".pmenu-scrim:not(.out)"), 180);
  const chip = document.querySelector(".pchip"); if (chip) chip.setAttribute("aria-expanded","false");
}

export async function adminSignOut(){
  closeAdminProfile();
  if (!await confirmDialog(t("pf_logout_q"), t("pf_logout_d"), t("sign_out"), t("cancel"), true)) return;
  closeAdminProfile();
  document.body.classList.add("leaving");                   // the panel fades away before the sign-in screen appears
  setTimeout(async () => { try { await S.api.auth.signOut(); } finally { document.body.classList.remove("leaving"); } }, 260);
}

function openAdminProfile(anchor, { rerender, rolePreview }){
  if (document.querySelector(".pmenu:not(.out)")) return closeAdminProfile();
  anchor.setAttribute("aria-expanded","true");
  const r = anchor.getBoundingClientRect();
  let i = 0; const stag = el => { el.style.setProperty("--i", i++); return el; };
  const seg = (label, items) => stag(h("div",{class:"pmenu-row"}, h("span",null,label), h("div",{class:"seg pmenu-seg",role:"group","aria-label":label}, items)));
  const link = (ic, label, attrs) => stag(h(attrs.href ? "a" : "button", Object.assign({class:"pmenu-link",role:"menuitem"}, attrs), icon(ic), h("span",null,label), icon("right","pmenu-go")));
  const preview = rolePreview ? rolePreview() : null;
  const menu = h("div",{class:"pmenu adm-pmenu",role:"menu","aria-label":t("pf_menu")},
    stag(h("div",{class:"pmenu-head"},
      h("div",{class:"pmenu-av"}, avatarEl("lg")),
      h("div",{class:"pmenu-id"}, h("b",null, adminName()), h("small",null, S.me.email || ""), h("span",{class:"chip lv"}, icon("shield"), roleText())))),
    stag(h("div",{class:"pmenu-lbl"}, t("pf_quick"))),
    seg(t("theme"), [["system","theme_auto","monitor"],["day","theme_light","sun"],["night","theme_dark","moon"]].map(([k,l,ic]) => h("button",{"aria-pressed":String(normTheme(getTheme())===k),title:t(l),"aria-label":t(l),onclick:e=>{
      e.currentTarget.parentElement.querySelectorAll("button").forEach(b => b.setAttribute("aria-pressed", String(b === e.currentTarget)));
      const b = e.currentTarget.getBoundingClientRect();
      withTransition(() => { setTheme(k); document.querySelectorAll(".topbar .themesw button").forEach((x, n) => x.setAttribute("aria-pressed", String(["day","night","system"][n] === k))); }, { kind:"theme", x: b.left + b.width/2, y: b.top + b.height/2 }); }}, icon(ic)))),
    seg(t("ui_lang"), [["en","EN"],["lo","ລາວ"],["zh","中"]].map(([l,n]) => h("button",{"aria-pressed":String(lang()===l),lang:l==="zh"?"zh-CN":l,onclick:()=>setAdminLang(l, rerender)}, n))),
    preview ? stag(h("label",{class:"pmenu-row adm-preview"}, h("span",null, L(["Preview as","ເບິ່ງເປັນ"])), preview)) : null,
    stag(h("div",{class:"pmenu-sep"})),
    link("home", t("adm_open_learner"), { href:"../" }),
    link("user", L(["My profile & photo","ໂປຣໄຟລ໌ ແລະ ຮູບ"]), { href:"../#account" }),
    stag(h("button",{class:"pmenu-logout",type:"button",role:"menuitem",onclick:adminSignOut}, icon("logout"), t("sign_out"))));
  menu.style.top = Math.round(r.bottom + 8) + "px";
  menu.style.right = Math.max(8, Math.round(innerWidth - r.right)) + "px";
  const scrim = h("div",{class:"pmenu-scrim",onclick:closeAdminProfile});
  document.body.append(scrim, menu);
  const onKey = e => { if (e.key === "Escape"){ closeAdminProfile(); anchor.focus(); document.removeEventListener("keydown", onKey); } };
  document.addEventListener("keydown", onKey);
  const first = menu.querySelector(".pmenu-seg button[aria-pressed=true]"); if (first) first.focus({ preventScroll:true });
}
