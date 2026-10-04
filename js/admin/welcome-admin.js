// Admin → Website & Welcome: the Welcome Page editor (draft → publish, revert, preview), the rebuilt Promotions & Feed,
// and the checks used by the editors of places, festivals, offers and resources (docs/WELCOME.md).
// settings/welcomeDraft holds the draft (admins only); settings/welcome holds what visitors see.
import { h, icon, toast, dialog, confirmDialog, fmtDate, errText } from "../shared/ui.js";
import { lang } from "../shared/i18n.js";
import { S, L, t, go, isSuper, canViewMenu, canEditMenu, fld, lockedScreen, audit, markUnpublished } from "./state.js";
import { renderField, viewContentList } from "./cms.js";
import { publishFlow } from "./main.js";
import { WELCOME, SECTION_IDS, NAV_SECTIONS } from "../learner/welcome-data.js";

const clone = v => JSON.parse(JSON.stringify(v));
export { checkWebItem, uploadChecked, migrateLegacyPromo } from "./web-checks.js";
import { migrateLegacyPromo } from "./web-checks.js";
import { checkWebItem } from "./web-checks.js";

// ---------- Welcome Page editor ----------
const HEAD_FIELDS = [{ key:"eyebrow", type:"tr", label:["Small heading","ຫົວຂໍ້ນ້ອຍ"] }, { key:"title", type:"tr", label:["Title","ຫົວຂໍ້"] },
  { key:"loSub", type:"text", cls:"lo", label:["Lao subtitle (optional)","ຫົວຂໍ້ຍ່ອຍພາສາລາວ"] }, { key:"intro", type:"tr", multiline:true, label:["Intro text","ຂໍ້ຄວາມແນະນຳ"] }];
const SECTION_NAMES = { greetings:["Greetings ribbon","ແຖບຄຳທັກທາຍ"], alphabet:["Alphabet chips","ຕົວອັກສອນ"], stats:["Numbers strip","ແຖບຕົວເລກ"], journey:["Journey through Laos","ເດີນທາງທົ່ວລາວ"],
  festivals:["Festival calendar","ປະຕິທິນບຸນ"], services:["Services","ບໍລິການ"], resources:["Free resources","ຊັບພະຍາກອນຟຣີ"], promotions:["Promotions and plans","ໂປຣໂມຊັນ ແລະ ແພັກເກດ"],
  news:["News","ຂ່າວ"], about:["About","ກ່ຽວກັບ"], closing:["Closing call to action","ປຸ່ມສະຫຼຸບທ້າຍໜ້າ"] };
const GROUPS = [
  ["hero", ["Top of the page","ສ່ວນເທິງ"], [{ key:"hero", type:"object", label:["Hero","ສ່ວນເທິງ"], fields:[
    { key:"badge", type:"tr", label:["Badge","ປ້າຍ"] }, { key:"loWord", type:"text", cls:"lo", label:["Big Lao word","ຄຳລາວໃຫຍ່"] },
    { row:[ { key:"h1a", type:"tr", label:["Headline, part 1","ຫົວຂໍ້ 1"] }, { key:"h1b", type:"tr", label:["Underlined part","ສ່ວນຂີດກ້ອງ"] }, { key:"h1c", type:"tr", label:["Part 3","ສ່ວນ 3"] } ] },
    { key:"lead", type:"tr", multiline:true, label:["Intro","ແນະນຳ"] },
    { row:[ { key:"ctaStart", type:"tr", label:["Main button","ປຸ່ມຫຼັກ"] }, { key:"ctaTour", type:"tr", label:["Second button","ປຸ່ມທີສອງ"] } ] },
    { key:"hear", type:"tr", label:["Greeting button hint","ຄຳແນະນຳປຸ່ມທັກທາຍ"] },
    { key:"greeting", type:"object", label:["Greeting played","ຄຳທັກທາຍ"], fields:[{ row:[ { key:"lo", type:"text", cls:"lo", label:["Lao","ລາວ"] }, { key:"rom", type:"text", label:["Romanization","ຄຳອ່ານ"] } ] }] } ] }]],
  ["lists", ["Ribbons, letters and numbers","ແຖບ, ຕົວອັກສອນ ແລະ ຕົວເລກ"], [
    { key:"greetings", type:"list", label:["Greetings ribbon","ແຖບຄຳທັກທາຍ"], itemLabel:["Greeting","ຄຳທັກທາຍ"], summary: g => g.lo || "", item:[{ row:[ { key:"lo", type:"text", cls:"lo", label:["Lao","ລາວ"] }, { key:"rom", type:"text", label:["Romanization","ຄຳອ່ານ"] }, { key:"en", type:"text", label:["English","ອັງກິດ"] } ] }] },
    { key:"alphabet", type:"list", label:["Alphabet chips","ຕົວອັກສອນ"], itemLabel:["Letter","ອັກສອນ"], summary: c => c.lo || "", item:[{ row:[ { key:"lo", type:"text", cls:"lo", label:["Letter","ອັກສອນ"] }, { key:"name", type:"text", label:["Name","ຊື່"] }, { key:"meaning", type:"text", label:["Meaning","ຄວາມໝາຍ"] }, { key:"ipa", type:"text", label:["Sound","ສຽງ"] } ] }] },
    { key:"stats", type:"list", label:["Numbers strip","ແຖບຕົວເລກ"], itemLabel:["Number","ຕົວເລກ"], summary: x => x.value || "", item:[{ key:"value", type:"text", label:["Number","ຕົວເລກ"] }, { key:"label", type:"tr", label:["Label","ປ້າຍ"] }] } ]],
  ["services", ["Services cards","ບັດບໍລິການ"], [{ key:"services", type:"list", label:["Cards","ບັດ"], itemLabel:["Card","ບັດ"], summary: c => (c.title && c.title.en) || "", item:[
    { row:[ { key:"size", type:"select", label:["Size","ຂະໜາດ"], options:[["big","Big"],["mid","Wide"],["sm","Small"]] }, { key:"icon", type:"select", label:["Icon","ໄອຄອນ"], options:[["book","Book"],["wave","Sound"],["pen","Pen"],["search","Search"],["repeat","Repeat"],["lamp","Culture"]] } ] },
    { key:"title", type:"tr", label:["Title","ຫົວຂໍ້"] }, { key:"text", type:"tr", multiline:true, label:["Text","ຂໍ້ຄວາມ"] }, { key:"lock", type:"tr", label:["Plan badge (optional)","ປ້າຍແພັກ"] },
    { key:"demo", type:"bool", label:["Show the interactive sentence demo","ສະແດງຕົວຢ່າງປະໂຫຍກ"] } ] }]],
  ["about", ["About and closing","ກ່ຽວກັບ ແລະ ທ້າຍໜ້າ"], [
    { key:"about", type:"object", label:["About","ກ່ຽວກັບ"], fields:[ { key:"eyebrow", type:"tr", label:["Small heading","ຫົວຂໍ້ນ້ອຍ"] }, { key:"title", type:"tr", label:["Title","ຫົວຂໍ້"] },
      { key:"text", type:"tr", multiline:true, label:["Text","ຂໍ້ຄວາມ"] }, { key:"points", type:"list", label:["Points","ຈຸດເດັ່ນ"], itemLabel:["Point","ຈຸດ"], summary: x => x.en || "", item:[{ key:"", type:"tr", label:["Point","ຈຸດ"] }] },
      { key:"tagline", type:"text", cls:"lo", label:["Lao tagline under the flower","ຄຳຂວັນພາສາລາວ"] } ] },
    { key:"closing", type:"object", label:["Closing call to action","ທ້າຍໜ້າ"], fields:[ { key:"title", type:"tr", label:["Title","ຫົວຂໍ້"] }, { key:"cta", type:"tr", label:["Button","ປຸ່ມ"] } ] } ]],
  ["footer", ["Footer, menu and SEO","ລຸ່ມສຸດ, ເມນູ ແລະ SEO"], [
    { key:"footer", type:"object", label:["Footer","ລຸ່ມສຸດ"], fields:[ { key:"copyright", type:"tr", label:["Copyright line","ລິຂະສິດ"] },
      { key:"links", type:"list", label:["Links","ລິ້ງ"], itemLabel:["Link","ລິ້ງ"], summary: x => (x.label && x.label.en) || "", item:[ { key:"label", type:"tr", label:["Text","ຂໍ້ຄວາມ"] },
        { key:"target", type:"text", label:["Section (about, news, promotions…) or https:// link","ພາກສ່ວນ ຫຼື ລິ້ງ"] } ] } ],
      help:["Support contact and social links come from Settings (Super Admin).","ຂໍ້ມູນຕິດຕໍ່ ແລະ ໂຊຊຽວມາຈາກ Settings."] },
    { key:"nav", type:"object", label:["Menu labels","ຊື່ເມນູ"], fields:["home", ...NAV_SECTIONS].map(k => ({ key:k, type:"tr", label:[k, k] })) },
    { key:"seo", type:"object", label:["Search engines (title and description)","SEO"], fields:[ { key:"title", type:"tr", label:["Page title","ຫົວຂໍ້ໜ້າ"] }, { key:"description", type:"tr", multiline:true, label:["Description","ຄຳອະທິບາຍ"] } ] } ]]
];

export async function viewWelcome(){
  if (!canViewMenu("welcome")) return lockedScreen(t("only_super"), t("credential_menu_restricted"));
  const canEdit = canEditMenu("welcome");
  const [pubDoc, draftDoc, users] = await Promise.all([S.api.db.get("settings/welcome").catch(() => null), S.api.db.get("settings/welcomeDraft").catch(() => null), S.api.db.list("users").catch(() => [])]);
  const published = (pubDoc && pubDoc.published) || null;
  // the same filling-in of missing parts as the page does, so "changed" compares like with like
  const complete = src => { const d = Object.assign(clone(WELCOME), clone(src || {})); d.heads = Object.assign(clone(WELCOME.heads), d.heads || {});
    const known = new Set((d.sections || []).map(s => s.id));
    d.sections = (d.sections || []).filter(s => SECTION_IDS.includes(s.id)).concat(SECTION_IDS.filter(id => !known.has(id)).map(id => ({ id, on:true }))); return d; };
  let draft = complete((draftDoc && draftDoc.data) || published);
  const baseline = JSON.stringify(complete(published));
  const changed = () => JSON.stringify(draft) !== baseline;

  // ----- status bar -----
  const state = h("div",{class:"wl-adm-state",role:"status","aria-live":"polite"});
  const drawState = () => state.replaceChildren(...[
    h("span",{class:"pill "+(changed() ? "draft" : "active")}, changed() ? L(["Draft has unpublished changes","ຮ່າງມີການປ່ຽນແປງທີ່ຍັງບໍ່ເຜີຍແຜ່"]) : L(["Published copy is up to date","ສະບັບເຜີຍແຜ່ເປັນປັດຈຸບັນ"])),
    h("span",{class:"small muted"}, pubDoc && pubDoc.publishedAt ? L(["Last published","ເຜີຍແຜ່ລ່າສຸດ"]) + " " + fmtDate(pubDoc.publishedAt, lang(), true) + ((users.find(u => u.id === pubDoc.publishedBy) || {}).email ? " · " + users.find(u => u.id === pubDoc.publishedBy).email : "") : L(["Never published (visitors see the built-in defaults)","ຍັງບໍ່ເຄີຍເຜີຍແຜ່"])),
    S.bundle && (S.bundle.dirty || !S.bundle.builtAt) ? h("span",{class:"wl-adm-bundle"}, icon("upload"), L(["Places, festivals, offers or resources changed: visitors see them after","ເນື້ອຫາປ່ຽນ: ຜູ້ເຂົ້າຊົມຈະເຫັນຫຼັງ"]) + " ", h("button",{class:"btn sm primary",onclick:()=>publishFlow()}, t("publish_now"))) : null].filter(Boolean));

  // ----- sections: on / off and order (drag, or the arrow buttons) -----
  const secList = h("ol",{class:"wl-adm-secs","aria-label":L(["Page sections","ພາກສ່ວນຂອງໜ້າ"])});
  let dragFrom = -1;
  const drawSections = () => {
    secList.replaceChildren(...draft.sections.map((s, i) => h("li",{class:"wl-adm-sec"+(s.on ? "" : " off"),draggable: canEdit ? "true" : "false",
        ondragstart:e=>{ dragFrom = i; e.dataTransfer.effectAllowed = "move"; }, ondragover:e=>{ e.preventDefault(); }, ondrop:e=>{ e.preventDefault(); if (dragFrom < 0 || dragFrom === i) return; const [m] = draft.sections.splice(dragFrom, 1); draft.sections.splice(i, 0, m); dragFrom = -1; drawSections(); drawState(); }},
      h("span",{class:"wl-adm-grip","aria-hidden":"true"}, icon("menu")),
      h("label",{class:"row",style:"gap:8px;flex:1"}, h("input",{type:"checkbox",class:"switch",checked:s.on !== false,disabled:!canEdit,onchange:e=>{ s.on = e.target.checked; drawSections(); drawState(); }}), h("b",null, L(SECTION_NAMES[s.id] || [s.id]))),
      h("button",{class:"ib",type:"button","aria-label":t("move_up"),disabled:!canEdit || i === 0,onclick:()=>{ [draft.sections[i-1], draft.sections[i]] = [draft.sections[i], draft.sections[i-1]]; drawSections(); drawState(); }}, icon("up")),
      h("button",{class:"ib",type:"button","aria-label":t("move_down"),disabled:!canEdit || i === draft.sections.length - 1,onclick:()=>{ [draft.sections[i+1], draft.sections[i]] = [draft.sections[i], draft.sections[i+1]]; drawSections(); drawState(); }}, icon("down")))));
  };
  drawSections();

  // ----- section headings + every text group -----
  const headsBox = h("div",{class:"stack"}, ["alphabet","journey","festivals","services","resources","promotions","news"].map(id => {
    draft.heads[id] = draft.heads[id] || {};
    return h("details",{class:"panel"}, h("summary",null, h("b",null, L(SECTION_NAMES[id]))), h("div",{class:"stack",style:"margin-top:10px"},
      HEAD_FIELDS.concat(id === "journey" ? [{ key:"mapCaption", type:"tr", label:["Map caption","ຄຳອະທິບາຍແຜນທີ່"] }] : []).map(f => renderField(f, draft.heads[id], "welcome")))); }));
  const groups = GROUPS.map(([id, title, fields]) => h("details",{class:"panel"}, h("summary",null, h("b",null, L(title))), h("div",{class:"stack",style:"margin-top:10px"}, fields.map(f => renderField(f, draft, "welcome")))));
  const form = h("div",{class:"stack wl-adm-form"}, h("section",{class:"panel stack"}, h("h3",null, L(["Sections: show, hide and order","ພາກສ່ວນ: ສະແດງ, ເຊື່ອງ ແລະ ລຳດັບ"])),
      h("p",{class:"small muted"}, L(["Drag a section, or use the arrows. The top of the page with the sign-in card is always first.","ລາກ ຫຼື ໃຊ້ລູກສອນ. ສ່ວນເທິງທີ່ມີການເຂົ້າສູ່ລະບົບຢູ່ທຳອິດສະເໝີ."])), secList),
    h("section",{class:"stack"}, h("h3",null, L(["Section headings","ຫົວຂໍ້ພາກສ່ວນ"])), headsBox),
    h("section",{class:"stack"}, h("h3",null, L(["Texts","ຂໍ້ຄວາມ"])), ...groups));
  if (!canEdit) setTimeout(() => form.querySelectorAll("input,textarea,select,button").forEach(el => { if (!el.closest("summary")) el.disabled = true; }), 0);
  form.addEventListener("input", () => drawState());

  // ----- checks -----
  const checks = h("div",{class:"panel stack web-checks",role:"status","aria-live":"polite"});
  const drawChecks = () => { const c = checkWebItem("welcome", draft);
    checks.replaceChildren(...[h("h3",null, L(["Checks","ກວດສອບ"])), ...(c.errors.length || c.warnings.length ? [
      ...c.errors.map(m => h("p",{class:"small",style:"color:var(--bad);margin:0"}, icon("x"), " ", m)),
      ...c.warnings.slice(0, 40).map(m => h("p",{class:"small",style:"color:var(--warn);margin:0"}, icon("info"), " ", m)),
      c.warnings.length > 40 ? h("p",{class:"small muted"}, "+ " + (c.warnings.length - 40)) : null] : [h("p",{class:"small",style:"color:var(--jade);margin:0"}, icon("check"), " ", L(["All texts filled in.","ຂໍ້ຄວາມຄົບ."]))])].filter(Boolean)); return c; };
  form.addEventListener("change", drawChecks);

  // ----- actions -----
  const saveDraft = async quiet => {
    const c = drawChecks(); if (c.errors.length){ toast(c.errors[0], "err"); return false; }
    await S.api.db.set("settings/welcomeDraft", { data: clone(draft), updatedAt: new Date(), updatedBy: S.me.uid });
    if (!quiet){ toast(L(["Draft saved. Visitors still see the published page.","ບັນທຶກຮ່າງແລ້ວ. ຜູ້ເຂົ້າຊົມຍັງເຫັນສະບັບເຜີຍແຜ່."]), "ok"); audit("update", "settings/welcome", "draft"); }
    drawState(); return true;
  };
  const publish = async () => {
    if (!await saveDraft(true)) return;
    if (!await confirmDialog(L(["Publish welcome page","ເຜີຍແຜ່ໜ້າຕ້ອນຮັບ"]), L(["Visitors will see this version right away.","ຜູ້ເຂົ້າຊົມຈະເຫັນສະບັບນີ້ທັນທີ."]), L(["Publish","ເຜີຍແຜ່"]), t("cancel"))) return;
    const now = new Date();
    await S.api.db.set("settings/welcome", { published: clone(draft), publishedAt: now, publishedBy: S.me.uid });
    audit("publish", "settings/welcome");
    toast(L(["Welcome page published.","ເຜີຍແຜ່ໜ້າຕ້ອນຮັບແລ້ວ."]), "ok"); S.render();
  };
  const revert = async () => {
    if (!await confirmDialog(L(["Revert to published","ກັບໄປສະບັບເຜີຍແຜ່"]), L(["Your unpublished changes will be discarded.","ການປ່ຽນແປງທີ່ຍັງບໍ່ເຜີຍແຜ່ຈະຖືກຍົກເລີກ."]), L(["Revert","ກັບຄືນ"]), t("cancel"), true)) return;
    await S.api.db.set("settings/welcomeDraft", { data: clone(published || WELCOME), updatedAt: new Date(), updatedBy: S.me.uid });
    audit("revert", "settings/welcome"); toast(L(["Draft reverted to the published page.","ກັບຄືນສະບັບເຜີຍແຜ່ແລ້ວ."]), "ok"); S.render();
  };

  // ----- preview: device sizes and Day / Night -----
  const DEV = [["phone", 390, 780, ["Phone","ໂທລະສັບ"]], ["tablet", 768, 900, ["Tablet","ແທັບເລັດ"]], ["desktop", 1366, 860, ["Desktop","ຄອມພິວເຕີ"]]];
  let dev = "phone", night = false, frame = null;
  const frameBox = h("div",{class:"wl-adm-frame"});
  const loadFrame = () => {
    const [, w, hgt] = DEV.find(d => d[0] === dev);
    frame = h("iframe",{title:L(["Welcome page preview","ຕົວຢ່າງໜ້າຕ້ອນຮັບ"]),src:"../?welcome-preview=1&r=" + Date.now(),style:`width:${w}px;height:${hgt}px`});
    frame.addEventListener("load", () => { try { frame.contentDocument.documentElement.setAttribute("data-theme", night ? "night" : "day"); } catch(e){} });
    const scale = Math.min(1, (frameBox.clientWidth || 600) / w);
    frameBox.replaceChildren(h("div",{class:"wl-adm-scale",style:`width:${w * scale}px;height:${hgt * scale}px`}, h("div",{style:`transform:scale(${scale});transform-origin:0 0;width:${w}px`}, frame)));
  };
  const devSeg = h("div",{class:"seg",role:"group","aria-label":L(["Device size","ຂະໜາດຈໍ"])}, DEV.map(([k, , , l]) => h("button",{type:"button","aria-pressed":String(dev === k),onclick:e=>{ dev = k; devSeg.querySelectorAll("button").forEach(b => b.setAttribute("aria-pressed", String(b === e.currentTarget))); loadFrame(); }}, L(l))));
  const themeSeg = h("div",{class:"seg",role:"group","aria-label":t("theme")}, [[false,"theme_light"],[true,"theme_dark"]].map(([n, l]) => h("button",{type:"button","aria-pressed":String(night === n),onclick:e=>{ night = n; themeSeg.querySelectorAll("button").forEach(b => b.setAttribute("aria-pressed", String(b === e.currentTarget))); try { frame.contentDocument.documentElement.setAttribute("data-theme", night ? "night" : "day"); } catch(err){} }}, t(l))));
  const previewPanel = h("section",{class:"panel stack"}, h("div",{class:"spread",style:"flex-wrap:wrap;gap:8px"}, h("h3",null, L(["Preview of the draft","ຕົວຢ່າງຮ່າງ"])), h("div",{class:"row"}, devSeg, themeSeg)),
    h("div",{class:"row"}, h("button",{class:"btn sm",onclick:async()=>{ if (canEdit && !await saveDraft(true)) return; loadFrame(); }}, icon("repeat"), L(["Save draft and refresh","ບັນທຶກຮ່າງ ແລະ ໂຫຼດໃໝ່"])),
      h("a",{class:"btn sm ghost",href:"../?welcome-preview=1",target:"_blank",rel:"noopener",onclick:async e=>{ if (canEdit){ e.preventDefault(); if (await saveDraft(true)) window.open("../?welcome-preview=1", "_blank", "noopener"); } }}, icon("external"), L(["Open preview in a new tab","ເປີດໃນແທັບໃໝ່"]))), frameBox);

  // ----- sign-ups by source and offer (from the learners' own records) -----
  const statsBox = h("section",{class:"panel stack"});
  const drawStats = days => {
    const since = Date.now() - days * 864e5, rows = users.filter(u => u.role === "learner" && (u.createdAt || 0) >= since);
    const count = key => { const m = {}; rows.forEach(u => { const k = (u.signup && u.signup[key]) || (key === "source" ? "unknown" : null); if (k) m[k] = (m[k] || 0) + 1; }); return Object.entries(m).sort((a, b) => b[1] - a[1]); };
    const table = (title, list) => h("div",null, h("h4",null,title), list.length ? h("table",{class:"tbl"}, h("tbody",null, list.map(([k, n]) => h("tr",null, h("td",null,k), h("td",{class:"tabnum"},String(n)))))) : h("p",{class:"small muted"}, t("no_rows")));
    statsBox.replaceChildren(h("div",{class:"spread",style:"flex-wrap:wrap;gap:8px"}, h("h3",null, L(["Sign-ups from the welcome page","ການສະໝັກຈາກໜ້າຕ້ອນຮັບ"])),
        h("div",{class:"seg",role:"group","aria-label":L(["Period","ໄລຍະ"])}, [7, 30, 90].map(d => h("button",{type:"button","aria-pressed":String(d === days),onclick:()=>drawStats(d)}, d + " " + t("days"))))),
      h("p",{class:"small muted"}, L(["New learner accounts and where they came from (?ref= or utm_source in the link, the referring site, or direct). ","ບັນຊີໃໝ່ ແລະ ແຫຼ່ງທີ່ມາ. "]) + rows.length + " " + L(["sign-ups","ການສະໝັກ"])),
      h("div",{class:"grid2"}, table(L(["By source","ຕາມແຫຼ່ງ"]), count("source")), table(L(["By offer","ຕາມໂປຣໂມຊັນ"]), count("offerId"))));
  };
  drawStats(30);

  const side = h("aside",{class:"editor-side"},
    h("div",{class:"panel stack"}, state,
      canEdit ? h("button",{class:"btn primary",onclick:()=>saveDraft(false)}, t("save")) : h("div",{class:"pill muted"}, icon("lock"), " ", t("read_only_mode")),
      canEdit ? h("button",{class:"btn jade",onclick:publish}, icon("upload"), L(["Publish welcome page","ເຜີຍແຜ່ໜ້າຕ້ອນຮັບ"])) : null,
      canEdit && published ? h("button",{class:"btn ghost",onclick:revert}, icon("history"), L(["Revert to published","ກັບໄປສະບັບເຜີຍແຜ່"])) : null),
    checks);
  drawState(); drawChecks();
  setTimeout(loadFrame, 50);
  return h("div",{class:"stack-l"},
    h("div",{class:"pagehead"}, h("h1",null, L(["Welcome Page","ໜ້າຕ້ອນຮັບ"])), h("p",null, L(["The page visitors see before signing in. Edit the draft, check it in the preview, then publish. Places, festivals, offers and free resources have their own menus.","ໜ້າທີ່ຜູ້ເຂົ້າຊົມເຫັນກ່ອນເຂົ້າສູ່ລະບົບ. ແກ້ໄຂຮ່າງ, ເບິ່ງຕົວຢ່າງ, ແລ້ວເຜີຍແຜ່."]))),
    h("div",{class:"row",style:"flex-wrap:wrap;gap:8px"}, ["places","festivals","promotions","resources"].filter(canViewMenu).map(k => h("button",{class:"btn sm",onclick:()=>k === "promotions" ? go("promotions") : go("contentList",{ type:k })}, L(({ places:["Journey places","ສະຖານທີ່"], festivals:["Festivals","ບຸນ"], promotions:["Promotions & Feed","ໂປຣໂມຊັນ"], resources:["Free resources","ຊັບພະຍາກອນຟຣີ"] })[k])))),
    h("div",{class:"editor"}, form, side), previewPanel, statsBox);
}

// ---------- Promotions & Feed (rebuilt): offers, plus the old download banner and social links ----------
export async function viewPromotions(){
  if (!canViewMenu("promotions")) return lockedScreen(t("only_super"), t("credential_menu_restricted"));
  const old = await S.api.db.get("settings/promotions").catch(() => null);
  const list = await viewContentList({ type:"offers" });
  const wrap = h("div",{class:"stack-l"});
  if (old && old.link && !old.migratedAt) wrap.append(h("div",{class:"banner"}, icon("info"),
    h("span",null, L(["The old download banner (","ແບນເນີດາວໂຫຼດເກົ່າ ("]) + ((old.title && old.title.en) || old.link) + L([") is still used as a free resource on the welcome page. Convert it to a resource to edit it there.",") ຍັງໃຊ້ຢູ່. ປ່ຽນເປັນຊັບພະຍາກອນເພື່ອແກ້ໄຂ."])),
    canEditMenu("resources") ? h("button",{class:"btn sm",onclick:async()=>{ try { const id = await migrateLegacyPromo(); markUnpublished(); toast(L(["Converted. Review it and publish.","ປ່ຽນແລ້ວ. ກວດ ແລະ ເຜີຍແຜ່."]), "ok"); if (id) go("editor",{ type:"resources", id }); } catch(e){ toast(errText(e), "err"); } }}, L(["Convert to a resource","ປ່ຽນເປັນຊັບພະຍາກອນ"])) : null));
  wrap.append(list);
  if (isSuper()){
    const app = (await S.api.db.get("settings/app").catch(() => null)) || {};
    const soc = Object.assign({ fb:"", yt:"", tt:"" }, app.social || {});
    const ins = Object.fromEntries(Object.keys(soc).map(k => [k, h("input",{class:"input",value:soc[k],placeholder:"https://…"})]));
    wrap.append(h("section",{class:"panel stack"}, h("h3",null, L(["Social links (footer of the welcome page)","ລິ້ງໂຊຊຽວ"])),
      h("div",{class:"grid3"}, fld("Facebook", ins.fb), fld("YouTube", ins.yt), fld("TikTok", ins.tt)),
      h("button",{class:"btn sm",style:"align-self:flex-start",onclick:async()=>{
        const v = Object.fromEntries(Object.entries(ins).map(([k, el]) => [k, el.value.trim()]));
        if (Object.values(v).some(u => u && !/^https:\/\/[^\s<>"]+$/.test(u))){ toast(L(["Links must start with https://","ລິ້ງຕ້ອງເລີ່ມດ້ວຍ https://"]), "err"); return; }
        await S.api.db.set("settings/app", { social: v }, true); audit("update", "settings/app", "social links"); toast(t("saved_ok"), "ok"); }}, t("save"))));
  }
  return wrap;
}
