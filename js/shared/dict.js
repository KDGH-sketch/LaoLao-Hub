// Dictionary layer: the built-in Lao dictionary (static, cached offline) merged with
// vocabulary entries that admins add or edit in the Admin Backend.
import { stripTone } from "./ui.js";
const url = f => new URL(`../../data/${f}`, import.meta.url).href;
let DICT = null, CHARS = null, STROKES = null, INDEX = null, loading = null;

export async function loadDict(){
  if (DICT) return DICT;
  if (!loading) loading = Promise.all([fetch(url("dictionary.json")).then(r=>r.json()), fetch(url("chars.json")).then(r=>r.json())]).then(([d,c]) => {
    DICT = {}; for (const k in d){ const a = d[k]; DICT[k] = { p:a[0], pos:a[1], en:a[2], h:a[3], n:a[4], fq:a[5], lo:a[6]||"", alt:a[7]||"" }; }
    CHARS = c; return DICT;
  });
  return loading;
}
export const dict = () => DICT || {};
export const chars = () => CHARS || {};
export async function strokes(){ if (!STROKES) STROKES = await fetch(url("strokes.json")).then(r=>r.json()).catch(()=>({})); return STROKES; }

// Merge admin vocabulary (from the bundle) over the static dictionary
export function mergeVocabulary(vocab=[]){
  if (!DICT) return;
  for (const v of vocab){
    const base = DICT[v.hz] || { fq: 99999, n: 0 };
    DICT[v.hz] = Object.assign({}, base, { p: v.py || base.p, pos: v.pos || base.pos, h: v.level || base.h,
      en: (v.tr && v.tr.en && v.tr.en.meaning) || base.en || "", lo: (v.tr && v.tr.lo && v.tr.lo.meaning) || base.lo || "",
      zh: (v.tr && v.tr.zh && v.tr.zh.meaning) || "", examples: v.examples || [], custom: true, vid: v.id });
  }
  INDEX = null;
}
export function meaning(w, lang){
  const d = DICT && DICT[w]; if (!d) return "";
  return (lang==="lo" && d.lo) ? d.lo : (lang==="zh" && d.zh) ? d.zh : d.en;
}
export function gloss(w, lang){
  const d = DICT && DICT[w];
  if (d) return meaning(w, lang).split(/;|\//)[0].replace(/\(.*?\)/g,"").trim();
  return [...w].map(c => CHARS && CHARS[c] ? (CHARS[c].d||"").split(/[;,]/)[0] : c).join(" + ");
}
// p = tone-marked romanization, a = the simple spelling people type (e.g. "sabaidee")
function index(){ if (!INDEX) INDEX = Object.keys(DICT).map(k => ({ k, p: stripTone(DICT[k].p), a: stripTone(DICT[k].alt||""), en: " "+DICT[k].en.toLowerCase()+" ", lo: DICT[k].lo||"", d: DICT[k] })); return INDEX; }
export function searchDict(q, limit=40){
  q = String(q||"").trim(); if (!q || !DICT) return [];
  const ql = q.toLowerCase(), qp = stripTone(q), lao = /[\u0E80-\u0EFF]/.test(q);
  const out = [];
  for (const e of index()){
    let sc = 0;
    if (lao){
      if (e.k===q) sc=100;
      else if (e.k.startsWith(q)) sc=80-e.k.length;
      else if (e.k.includes(q)) sc=60-e.k.length;
      else if (e.lo && e.lo.includes(q)) sc=50;
    } else {
      if (e.p===qp || (e.a && e.a===qp)) sc=90;
      else if (qp.length>=2 && (e.p.startsWith(qp) || (e.a && e.a.startsWith(qp)))) sc=70-(Math.min(e.p.length, e.a.length||99)-qp.length);
      else if (qp.length>=2 && (e.p.includes(qp) || (e.a && e.a.includes(qp)))) sc=50;
      if (ql.length>=2){
        if (e.en.includes(" "+ql+" ")||e.en.includes(" "+ql+";")||e.en.includes("to "+ql+";")) sc=Math.max(sc,85);
        else if (ql.length>=3 && e.en.includes(ql)) sc=Math.max(sc,45);
      }
    }
    if (sc>0){ sc += (e.d.h ? (7-e.d.h)*3 : 0) + (e.d.custom?6:0) - Math.min(20, Math.log10(e.d.fq+1)*3); out.push([sc,e.k]); }
  }
  out.sort((a,b)=>b[0]-a[0]);
  return out.slice(0,limit).map(x=>x[1]);
}
export function segment(text){
  const out=[]; let i=0;
  while (i<text.length){
    const c = text[i];
    if (/\s/.test(c)){ i++; continue; }
    if (/[.,!?;:()\[\]"']/.test(c)){ out.push(c); i++; continue; }
    let matched = "";
    const maxLen = Math.min(12, text.length - i);
    for (let L = maxLen; L >= 1; L--){
      const sub = text.substr(i, L);
      if (DICT && DICT[sub]){ matched = sub; break; }
    }
    if (matched){
      out.push(matched);
      i += matched.length;
    } else {
      // Advance by 1 char or whitespace cluster
      out.push(c);
      i++;
    }
  }
  return out;
}
