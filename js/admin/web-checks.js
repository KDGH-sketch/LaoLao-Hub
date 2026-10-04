// Rules for the welcome-page editors (places, festivals, offers, resources, the Welcome Page): checks before saving,
// uploads with type and size limits, and converting the old Promotions banner. No DOM, so the tests run it in Node.
import { L, S, audit } from "./state.js";
import { inLaos } from "../learner/welcome-data.js";
import { saveContent } from "../shared/content.js";

const MAX_UPLOAD = 5 * 1024 * 1024;
const MIME = {
  image: /^image\/(png|jpeg|webp)$/,
  audio: /^audio\/(mpeg|mp3|mp4|aac|ogg|wav|webm|x-m4a)$/,
  file: /^(application\/pdf|audio\/[\w.+-]+|image\/(png|jpeg|webp)|video\/mp4)$/
};
const LO_RE = /[຀-໿]/;
const HTML_RE = /<\s*\/?\s*[a-z!][^>]*>/i;
const URL_OK = v => !v || /^https:\/\/[^\s<>"]+$/i.test(v) || /^http:\/\/(localhost|127\.0\.0\.1)[:/][^\s<>"]*$/i.test(v) || /^data:(image|audio|application\/pdf)[\w.+/-]*;base64,/.test(v);

// ---------- uploads (images, files, audio): type and size checked before anything is sent ----------
export async function uploadChecked(file, kind, folder){
  if (!file) throw new Error(L(["No file chosen.","ບໍ່ໄດ້ເລືອກໄຟລ໌."]));
  if (file.size > MAX_UPLOAD) throw new Error(L(["The file is larger than 5 MB.","ໄຟລ໌ໃຫຍ່ກວ່າ 5 MB."]));
  if (!(MIME[kind] || MIME.file).test(file.type || "")) throw new Error(L(["This type of file is not accepted here: ","ບໍ່ຮັບໄຟລ໌ປະເພດນີ້: "]) + (file.type || "?"));
  return S.api.storage.upload(file, `${folder || "web"}/${Date.now()}-${file.name.replace(/[^\w.\-]/g, "_").slice(-80)}`);
}

// ---------- checks for welcome-page content ----------
// errors block saving; warnings are shown (e.g. a Lao or Chinese text is missing)
export function checkWebItem(type, o){
  const errors = [], warnings = [];
  const walk = (v, path) => {
    if (typeof v === "string"){ if (HTML_RE.test(v)) errors.push(L(["No HTML allowed","ບໍ່ອະນຸຍາດ HTML"]) + ": " + path); return; }
    if (Array.isArray(v)) return v.forEach((x, i) => walk(x, path + "[" + (i + 1) + "]"));
    if (v && typeof v === "object"){
      const keys = Object.keys(v);
      if (keys.length && keys.every(k => ["en","lo","zh"].includes(k)) && (v.en || v.lo || v.zh)){
        const miss = ["lo","zh"].filter(k => !String(v[k] || "").trim());
        if (!String(v.en || "").trim()) warnings.push(path + ": " + L(["English is empty (it is the fallback)","ພາສາອັງກິດຫວ່າງ"]));
        if (miss.length) warnings.push(path + ": " + miss.map(k => k === "lo" ? L(["Lao missing","ຂາດພາສາລາວ"]) : L(["Chinese missing","ຂາດພາສາຈີນ"])).join(", "));
        if (v.lo && !LO_RE.test(v.lo)) warnings.push(path + ": " + L(["the Lao text has no Lao letters","ຂໍ້ຄວາມລາວບໍ່ມີອັກສອນລາວ"]));
      }
      keys.forEach(k => walk(v[k], path ? path + "." + k : k));
    }
  };
  const skip = new Set(["id","status","access","order","version","createdAt","updatedAt","updatedBy","createdBy"]);
  const body = {}; for (const k in (o || {})) if (!skip.has(k)) body[k] = o[k];
  walk(body, "");
  const needTitle = () => { if (!o.title || !String(o.title.en || "").trim()) errors.push(L(["An English title is required","ຕ້ອງມີຫົວຂໍ້ພາສາອັງກິດ"])); };
  for (const k of ["url","imageUrl"]) if (o[k] && !URL_OK(o[k])) errors.push(k + ": " + L(["use a full https:// link","ໃຊ້ລິ້ງ https:// ເຕັມ"]));
  if (type === "places"){
    needTitle();
    if (o.lat === "" || o.lon === "" || o.lat == null || o.lon == null) errors.push(L(["Latitude and longitude are required","ຕ້ອງມີເສັ້ນຂະໜານ ແລະ ເສັ້ນແວງ"]));
    else if (!inLaos(o.lat, o.lon)) errors.push(L(["The coordinates are outside Laos (13.9 to 22.5 N, 100.1 to 107.7 E)","ພິກັດຢູ່ນອກລາວ"]));
    if (o.laoName && !LO_RE.test(o.laoName)) warnings.push(L(["The Lao name has no Lao letters","ຊື່ລາວບໍ່ມີອັກສອນລາວ"]));
    if (o.imageUrl && !(o.imageAlt && String(o.imageAlt.en || "").trim())) errors.push(L(["A photo needs alt text (what it shows)","ຮູບຕ້ອງມີຄຳອະທິບາຍ"]));
    (o.words || []).forEach((w, i) => { if (w.audio && !URL_OK(w.audio)) errors.push(L(["Word","ຄຳ"]) + " " + (i + 1) + ": " + L(["audio link must be https://","ລິ້ງສຽງຕ້ອງເປັນ https://"])); });
    if (o.unesco !== "" && o.unesco != null && !(+o.unesco >= 1972 && +o.unesco <= 2100)) errors.push(L(["UNESCO year looks wrong","ປີ UNESCO ບໍ່ຖືກ"]));
  }
  if (type === "festivals"){ needTitle(); if (!(+o.month >= 1 && +o.month <= 12)) errors.push(L(["Month must be 1 to 12","ເດືອນຕ້ອງແມ່ນ 1-12"])); }
  if (type === "offers"){
    needTitle();
    const a = o.startsAt ? Date.parse(o.startsAt) : null, b = o.endsAt ? Date.parse(o.endsAt) : null;
    if ((o.startsAt && isNaN(a)) || (o.endsAt && isNaN(b))) errors.push(L(["A date is not valid","ວັນທີບໍ່ຖືກຕ້ອງ"]));
    if (a && b && b <= a) errors.push(L(["The end must be after the start","ວັນສິ້ນສຸດຕ້ອງຫຼັງວັນເລີ່ມ"]));
    if (o.kind === "countdown" && !o.endsAt) errors.push(L(["A countdown needs an end date","ການນັບຖອຍຫຼັງຕ້ອງມີວັນສິ້ນສຸດ"]));
    if (b && b < Date.now()) warnings.push(L(["This offer has already ended and will not be shown","ໂປຣໂມຊັນນີ້ໝົດແລ້ວ"]));
  }
  if (type === "resources"){ needTitle(); if (!o.url) warnings.push(L(["No file yet: visitors see \"Coming soon\"","ຍັງບໍ່ມີໄຟລ໌: ຜູ້ເຂົ້າຊົມຈະເຫັນ \"ໄວໆນີ້\""])); if (o.glyph && !LO_RE.test(o.glyph)) warnings.push(L(["Cover letters should be Lao","ຕົວອັກສອນໜ້າປົກຄວນເປັນລາວ"])); }
  if (["places","festivals","offers","resources"].includes(type) && o.access && o.access !== "public") warnings.push(L(["Access is not \"Public\": visitors who are not signed in will not see it","ບໍ່ແມ່ນ \"ສາທາລະນະ\": ຜູ້ທີ່ບໍ່ໄດ້ເຂົ້າສູ່ລະບົບຈະບໍ່ເຫັນ"]));
  for (const k of (type === "welcome" ? [] : ["text"])) if (o[k] && o[k].en && o[k].en.length > 1200) warnings.push(L(["The description is very long","ຄຳອະທິບາຍຍາວຫຼາຍ"]));
  return { errors: [...new Set(errors)], warnings: [...new Set(warnings)] };
}

// ---------- legacy settings/promotions (the old download banner) → a free resource ----------
export async function migrateLegacyPromo(){
  const old = await S.api.db.get("settings/promotions").catch(() => null);
  if (!old || old.migratedAt || !old.link) return null;
  const id = "legacy-download";
  await saveContent(S.api, "resources", id, { status:"draft", access:"public", order:99, kind:"pdf", cover:1, glyph:"ລ", requiresAccount:true, url: old.link,
    title: Object.assign({ en:"", lo:"", zh:"" }, old.title || {}), text: Object.assign({ en:"", lo:"", zh:"" }, old.desc || {}) }, S.me.uid);
  await S.api.db.set("settings/promotions", { migratedAt: new Date(), migratedTo: "resources/" + id }, true);
  audit("create", "resources/" + id, "from the old Promotions banner");
  return id;
}

