// Small UI toolkit shared by the learner app and the admin panel.
import { t } from "./i18n.js";
import { LOGO } from "./logo-data.js";
export const $ = (s, r=document) => r.querySelector(s);
export const $$ = (s, r=document) => Array.from(r.querySelectorAll(s));
export function h(tag, attrs, ...kids){
  const el = document.createElement(tag);
  if (attrs) for (const [k,v] of Object.entries(attrs)){
    if (v===null || v===undefined || v===false) continue;
    if (k==="class") el.className = v;
    else if (k==="html") el.innerHTML = v;
    else if (k==="value" && (tag==="input"||tag==="textarea"||tag==="select")) el.value = v;
    else if (k.startsWith("on") && typeof v==="function") el.addEventListener(k.slice(2), v);
    else el.setAttribute(k, v===true ? "" : v);
  }
  for (const k of kids.flat(Infinity)){ if (k===null || k===undefined || k===false) continue; el.append((typeof Node !== "undefined" && k instanceof Node) || (k && k.nodeType) ? k : document.createTextNode(String(k))); }
  if (tag==="select" && attrs && attrs.value!==undefined) el.value = attrs.value;
  return el;
}
export const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
export const rnd = a => a[Math.floor(Math.random()*a.length)];
export const shuffle = a => { a=a.slice(); for (let i=a.length-1;i>0;i--){ const j=Math.floor(Math.random()*(i+1)); [a[i],a[j]]=[a[j],a[i]]; } return a; };
export const isLao = c => !!c && c>="\u0E80" && c<="\u0EFF";
export const isHan = c => !!c && ((c>="\u0E80" && c<="\u0EFF") || (c>="一" && c<="鿿") || /[a-zA-Z]/.test(c));
export const debounce = (fn, ms=150) => { let t; return (...a) => { clearTimeout(t); t=setTimeout(()=>fn(...a), ms); }; };

// Pick a translation: obj = {en:..., lo:..., zh:...}; falls back to English, then any.
export function tr(obj, lang){ if (obj==null) return ""; if (typeof obj!=="object") return String(obj); return obj[lang] ?? obj.en ?? obj.zh ?? Object.values(obj)[0] ?? ""; }
export function trs(obj, lang, key){ if (!obj) return ""; const o = obj[lang] && obj[lang][key] ? obj[lang] : obj.en; return o ? (o[key] ?? "") : ""; }

// ----- phonetics / romanization colouring -----
const TONEV = {"ā":1,"á":2,"ǎ":3,"à":4,"â":5,"ē":1,"é":2,"ě":3,"è":4,"ê":5,"ī":1,"í":2,"ǐ":3,"ì":4,"î":5,"ō":1,"ó":2,"ǒ":3,"ò":4,"ô":5,"ū":1,"ú":2,"ǔ":3,"ù":4,"û":5,"ǖ":1,"ǘ":2,"ǚ":3,"ǜ":4,"ɯ":1,"ɯ́":2,"ɯ̌":3,"ɯ̀":4,"ɯ̂":5};
const V = "aeiouüɯvāáǎàâēéěèêīíǐìîōóǒòôūúǔùûǖǘǚǜ";
const SYL = new RegExp("(?:[zcs]h|[bpmfdtnlgkhjqxrzcsyw])?["+V+"]+(?:ng(?!["+V+"])|n(?!["+V+"])|r(?!["+V+"]))?|[a-zA-Z"+V+"]+","gi");
export function toneOf(s){ for (const c of String(s).toLowerCase()){ if (TONEV[c]) return TONEV[c]; } return 0; }
export function pyHTML(py){
  return esc(py||"").replace(new RegExp("[A-Za-z"+V+V.toUpperCase()+"ĀÁǍÀÂĒÉĚÈÊĪÍǏÌÎŌÓǑÒÔŪÚǓÙÛ]+","g"), word => (word.match(SYL)||[word]).map(s => `<span class="t${toneOf(s)}">${s}</span>`).join(""));
}
export const stripTone = s => String(s||"").normalize("NFD").replace(/[̀-ͯ]/g,"").replace(/ü/g,"v").replace(/[\s'’·…\-]/g,"").replace(/[1-6]/g,"").toLowerCase();

// ----- icons -----
// Icons: Lucide 0.468.0 (https://lucide.dev, ISC licence), keyed by the names the app uses.
const IC = {
 home:'<path d="M15 21v-8a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v8" /><path d="M3 10a2 2 0 0 1 .709-1.528l7-5.999a2 2 0 0 1 2.582 0l7 5.999A2 2 0 0 1 21 10v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />',
 learn:'<path d="M21.42 10.922a1 1 0 0 0-.019-1.838L12.83 5.18a2 2 0 0 0-1.66 0L2.6 9.08a1 1 0 0 0 0 1.832l8.57 3.908a2 2 0 0 0 1.66 0z" /><path d="M22 10v6" /><path d="M6 12.5V16a6 3 0 0 0 12 0v-3.5" />',
 path:'<circle cx="6" cy="19" r="3" /><path d="M9 19h8.5a3.5 3.5 0 0 0 0-7h-11a3.5 3.5 0 0 1 0-7H15" /><circle cx="18" cy="5" r="3" />',
 gen:'<path d="m21.64 3.64-1.28-1.28a1.21 1.21 0 0 0-1.72 0L2.36 18.64a1.21 1.21 0 0 0 0 1.72l1.28 1.28a1.2 1.2 0 0 0 1.72 0L21.64 5.36a1.2 1.2 0 0 0 0-1.72" /><path d="m14 7 3 3" /><path d="M5 6v4" /><path d="M19 14v4" /><path d="M10 2v2" /><path d="M7 8H3" /><path d="M21 16h-4" /><path d="M11 3H9" />',
 practice:'<circle cx="12" cy="12" r="10" /><circle cx="12" cy="12" r="6" /><circle cx="12" cy="12" r="2" />',
 dict:'<path d="M12 7v14" /><path d="M16 12h2" /><path d="M16 8h2" /><path d="M3 18a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h5a4 4 0 0 1 4 4 4 4 0 0 1 4-4h5a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1h-6a3 3 0 0 0-3 3 3 3 0 0 0-3-3z" /><path d="M6 12h2" /><path d="M6 8h2" />',
 pinyin:'<path d="m5 8 6 6" /><path d="m4 14 6-6 2-3" /><path d="M2 5h12" /><path d="M7 2h1" /><path d="m22 22-5-10-5 10" /><path d="M14 18h6" />',
 chars:'<path d="M15.707 21.293a1 1 0 0 1-1.414 0l-1.586-1.586a1 1 0 0 1 0-1.414l5.586-5.586a1 1 0 0 1 1.414 0l1.586 1.586a1 1 0 0 1 0 1.414z" /><path d="m18 13-1.375-6.874a1 1 0 0 0-.746-.776L3.235 2.028a1 1 0 0 0-1.207 1.207L5.35 15.879a1 1 0 0 0 .776.746L13 18" /><path d="m2.3 2.3 7.286 7.286" /><circle cx="11" cy="11" r="2" />',
 review:'<path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" /><path d="M3 3v5h5" />',
 settings:'<path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" /><circle cx="12" cy="12" r="3" />',
 more:'<circle cx="12" cy="12" r="1" /><circle cx="19" cy="12" r="1" /><circle cx="5" cy="12" r="1" />',
 menu:'<line x1="4" x2="20" y1="6" y2="6" /><line x1="4" x2="20" y1="12" y2="12" /><line x1="4" x2="20" y1="18" y2="18" />',
 play:'<polygon points="6 3 20 12 6 21 6 3" />',
 video:'<path d="M20.2 6 3 11l-.9-2.4c-.3-1.1.3-2.2 1.3-2.5l13.5-4c1.1-.3 2.2.3 2.5 1.3Z" /><path d="m6.2 5.3 3.1 3.9" /><path d="m12.4 3.4 3.1 4" /><path d="M3 11h18v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z" />',
 gift:'<rect x="3" y="8" width="18" height="4" rx="1" /><path d="M12 8v13" /><path d="M19 12v7a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2v-7" /><path d="M7.5 8a2.5 2.5 0 0 1 0-5A4.8 8 0 0 1 12 8a4.8 8 0 0 1 4.5-5 2.5 2.5 0 0 1 0 5" />',
 culture:'<line x1="3" x2="21" y1="22" y2="22" /><line x1="6" x2="6" y1="18" y2="11" /><line x1="10" x2="10" y1="18" y2="11" /><line x1="14" x2="14" y1="18" y2="11" /><line x1="18" x2="18" y1="18" y2="11" /><polygon points="12 2 20 7 4 7" />',
 sound:'<path d="M2 10v3" /><path d="M6 6v11" /><path d="M10 3v18" /><path d="M14 8v7" /><path d="M18 5v13" /><path d="M22 10v3" />',
 layers:'<path d="M12.83 2.18a2 2 0 0 0-1.66 0L2.6 6.08a1 1 0 0 0 0 1.83l8.58 3.91a2 2 0 0 0 1.66 0l8.58-3.9a1 1 0 0 0 0-1.83z" /><path d="M2 12a1 1 0 0 0 .58.91l8.6 3.91a2 2 0 0 0 1.65 0l8.58-3.9A1 1 0 0 0 22 12" /><path d="M2 17a1 1 0 0 0 .58.91l8.6 3.91a2 2 0 0 0 1.65 0l8.58-3.9A1 1 0 0 0 22 17" />',
 clock:'<circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" />',
 slow:'<path d="M2 13a6 6 0 1 0 12 0 4 4 0 1 0-8 0 2 2 0 0 0 4 0" /><circle cx="10" cy="13" r="8" /><path d="M2 21h12c4.4 0 8-3.6 8-8V7a2 2 0 1 0-4 0v6" /><path d="M18 3 19.1 5.2" /><path d="M22 3 20.9 5.2" />',
 repeat:'<path d="m17 2 4 4-4 4" /><path d="M3 11v-1a4 4 0 0 1 4-4h14" /><path d="m7 22-4-4 4-4" /><path d="M21 13v1a4 4 0 0 1-4 4H3" />',
 split:'<path d="M16 3h5v5" /><path d="M8 3H3v5" /><path d="M12 22v-8.3a4 4 0 0 0-1.172-2.872L3 3" /><path d="m15 9 6-6" />',
 star:'<path d="M11.525 2.295a.53.53 0 0 1 .95 0l2.31 4.679a2.123 2.123 0 0 0 1.595 1.16l5.166.756a.53.53 0 0 1 .294.904l-3.736 3.638a2.123 2.123 0 0 0-.611 1.878l.882 5.14a.53.53 0 0 1-.771.56l-4.618-2.428a2.122 2.122 0 0 0-1.973 0L6.396 21.01a.53.53 0 0 1-.77-.56l.881-5.139a2.122 2.122 0 0 0-.611-1.879L2.16 9.795a.53.53 0 0 1 .294-.906l5.165-.755a2.122 2.122 0 0 0 1.597-1.16z" />',
 bookmark:'<path d="m19 21-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16z" />',
 x:'<path d="M18 6 6 18" /><path d="m6 6 12 12" />',
 left:'<path d="m15 18-6-6 6-6" />',
 right:'<path d="m9 18 6-6-6-6" />',
 down:'<path d="m6 9 6 6 6-6" />',
 up:'<path d="m18 15-6-6-6 6" />',
 check:'<path d="M20 6 9 17l-5-5" />',
 spark:'<path d="M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .963 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.581a.5.5 0 0 1 0 .964L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.963 0z" /><path d="M20 3v4" /><path d="M22 5h-4" /><path d="M4 17v2" /><path d="M5 18H3" />',
 speaker:'<path d="M11 4.702a.705.705 0 0 0-1.203-.498L6.413 7.587A1.4 1.4 0 0 1 5.416 8H3a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h2.416a1.4 1.4 0 0 1 .997.413l3.383 3.384A.705.705 0 0 0 11 19.298z" /><path d="M16 9a5 5 0 0 1 0 6" /><path d="M19.364 18.364a9 9 0 0 0 0-12.728" />',
 mic:'<path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" /><path d="M19 10v2a7 7 0 0 1-14 0v-2" /><line x1="12" x2="12" y1="19" y2="22" />',
 pen:'<path d="M12 20h9" /><path d="M16.376 3.622a1 1 0 0 1 3.002 3.002L7.368 18.635a2 2 0 0 1-.855.506l-2.872.838a.5.5 0 0 1-.62-.62l.838-2.872a2 2 0 0 1 .506-.854z" />',
 user:'<path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" />',
 users:'<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" />',
 plan:'<path d="M3.85 8.62a4 4 0 0 1 4.78-4.77 4 4 0 0 1 6.74 0 4 4 0 0 1 4.78 4.78 4 4 0 0 1 0 6.74 4 4 0 0 1-4.77 4.78 4 4 0 0 1-6.75 0 4 4 0 0 1-4.78-4.77 4 4 0 0 1 0-6.76Z" /><path d="M16 8h-6a2 2 0 1 0 0 4h4a2 2 0 1 1 0 4H8" /><path d="M12 18V6" />',
 content:'<path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z" /><path d="M14 2v4a2 2 0 0 0 2 2h4" /><path d="M10 9H8" /><path d="M16 13H8" /><path d="M16 17H8" />',
 chart:'<path d="M3 3v16a2 2 0 0 0 2 2h16" /><path d="M18 17V9" /><path d="M13 17V5" /><path d="M8 17v-3" />',
 note:'<path d="M13.4 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-7.4" /><path d="M2 6h4" /><path d="M2 10h4" /><path d="M2 14h4" /><path d="M2 18h4" /><path d="M21.378 5.626a1 1 0 1 0-3.004-3.004l-5.01 5.012a2 2 0 0 0-.506.854l-.837 2.87a.5.5 0 0 0 .62.62l2.87-.837a2 2 0 0 0 .854-.506z" />',
 download:'<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" x2="12" y1="15" y2="3" />',
 upload:'<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="17 8 12 3 7 8" /><line x1="12" x2="12" y1="3" y2="15" />',
 logout:'<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><polyline points="16 17 21 12 16 7" /><line x1="21" x2="9" y1="12" y2="12" />',
 shield:'<path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z" /><path d="m9 12 2 2 4-4" />',
 plus:'<path d="M5 12h14" /><path d="M12 5v14" />',
 trash:'<path d="M3 6h18" /><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" /><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" /><line x1="10" x2="10" y1="11" y2="17" /><line x1="14" x2="14" y1="11" y2="17" />',
 edit:'<path d="M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z" /><path d="m15 5 4 4" />',
 eye:'<path d="M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0" /><circle cx="12" cy="12" r="3" />',
 eyeOff:'<path d="M10.733 5.076a10.744 10.744 0 0 1 11.205 6.575 1 1 0 0 1 0 .696 10.747 10.747 0 0 1-1.444 2.49" /><path d="M14.084 14.158a3 3 0 0 1-4.242-4.242" /><path d="M17.479 17.499a10.75 10.75 0 0 1-15.417-5.151 1 1 0 0 1 0-.696 10.75 10.75 0 0 1 4.446-5.143" /><path d="m2 2 20 20" />',
 lock:'<rect width="18" height="11" x="3" y="11" rx="2" ry="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" />',
 trophy:'<path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6" /><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18" /><path d="M4 22h16" /><path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22" /><path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22" /><path d="M18 2H6v7a6 6 0 0 0 12 0V2Z" />',
 flame:'<path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z" />',
 globe:'<circle cx="12" cy="12" r="10" /><path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20" /><path d="M2 12h20" />',
 sun:'<circle cx="12" cy="12" r="4" /><path d="M12 2v2" /><path d="M12 20v2" /><path d="m4.93 4.93 1.41 1.41" /><path d="m17.66 17.66 1.41 1.41" /><path d="M2 12h2" /><path d="M20 12h2" /><path d="m6.34 17.66-1.41 1.41" /><path d="m19.07 4.93-1.41 1.41" />',
 moon:'<path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z" />',
 monitor:'<rect width="20" height="14" x="2" y="3" rx="2" /><line x1="8" x2="16" y1="21" y2="21" /><line x1="12" x2="12" y1="17" y2="21" />',
 history:'<path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" /><path d="M3 3v5h5" /><path d="M12 7v5l4 2" />',
 headphones:'<path d="M3 14h3a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-7a9 9 0 0 1 18 0v7a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3" />',
 cards:'<path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H19a1 1 0 0 1 1 1v18a1 1 0 0 1-1 1H6.5a1 1 0 0 1 0-5H20" /><path d="m8 13 4-7 4 7" /><path d="M9.1 11h5.7" />',
 structure:'<rect width="7" height="7" x="14" y="3" rx="1" /><path d="M10 21V8a1 1 0 0 0-1-1H4a1 1 0 0 0-1 1v12a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-5a1 1 0 0 0-1-1H3" />',
 book:'<path d="M12 7v14" /><path d="M3 18a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h5a4 4 0 0 1 4 4 4 4 0 0 1 4-4h5a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1h-6a3 3 0 0 0-3 3 3 3 0 0 0-3-3z" />',
 send:'<path d="M14.536 21.686a.5.5 0 0 0 .937-.024l6.5-19a.496.496 0 0 0-.635-.635l-19 6.5a.5.5 0 0 0-.024.937l7.93 3.18a2 2 0 0 1 1.112 1.11z" /><path d="m21.854 2.147-10.94 10.939" />',
 copy:'<rect width="14" height="14" x="8" y="8" rx="2" ry="2" /><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2" />',
 wallet:'<path d="M19 7V4a1 1 0 0 0-1-1H5a2 2 0 0 0 0 4h15a1 1 0 0 1 1 1v4h-3a2 2 0 0 0 0 4h3a1 1 0 0 0 1-1v-2a1 1 0 0 0-1-1" /><path d="M3 5v14a2 2 0 0 0 2 2h15a1 1 0 0 0 1-1v-4" />',
 qr:'<rect width="5" height="5" x="3" y="3" rx="1" /><rect width="5" height="5" x="16" y="3" rx="1" /><rect width="5" height="5" x="3" y="16" rx="1" /><path d="M21 16h-3a2 2 0 0 0-2 2v3" /><path d="M21 21v.01" /><path d="M12 7v3a2 2 0 0 1-2 2H7" /><path d="M3 12h.01" /><path d="M12 3h.01" /><path d="M12 16v.01" /><path d="M16 12h1" /><path d="M21 12v.01" /><path d="M12 21v-1" />',
 receipt:'<path d="M4 2v20l2-1 2 1 2-1 2 1 2-1 2 1 2-1 2 1V2l-2 1-2-1-2 1-2-1-2 1-2-1-2 1Z" /><path d="M16 8h-6a2 2 0 1 0 0 4h4a2 2 0 1 1 0 4H8" /><path d="M12 17.5v-11" />',
 crown:'<path d="M11.562 3.266a.5.5 0 0 1 .876 0L15.39 8.87a1 1 0 0 0 1.516.294L21.183 5.5a.5.5 0 0 1 .798.519l-2.834 10.246a1 1 0 0 1-.956.734H5.81a1 1 0 0 1-.957-.734L2.02 6.02a.5.5 0 0 1 .798-.519l4.276 3.664a1 1 0 0 0 1.516-.294z" /><path d="M5 21h14" />',
 image:'<rect width="18" height="18" x="3" y="3" rx="2" ry="2" /><circle cx="9" cy="9" r="2" /><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21" />',
 card:'<rect width="20" height="14" x="2" y="5" rx="2" /><line x1="2" x2="22" y1="10" y2="10" />',
 verified:'<path d="M3.85 8.62a4 4 0 0 1 4.78-4.77 4 4 0 0 1 6.74 0 4 4 0 0 1 4.78 4.78 4 4 0 0 1 0 6.74 4 4 0 0 1-4.77 4.78 4 4 0 0 1-6.75 0 4 4 0 0 1-4.78-4.77 4 4 0 0 1 0-6.76Z" /><path d="m9 12 2 2 4-4" />',
 ok:'<circle cx="12" cy="12" r="10" /><path d="m9 12 2 2 4-4" />',
 fail:'<circle cx="12" cy="12" r="10" /><path d="m15 9-6 6" /><path d="m9 9 6 6" />',
 info:'<circle cx="12" cy="12" r="10" /><path d="M12 16v-4" /><path d="M12 8h.01" />',
 sliders:'<line x1="21" x2="14" y1="4" y2="4" /><line x1="10" x2="3" y1="4" y2="4" /><line x1="21" x2="12" y1="12" y2="12" /><line x1="8" x2="3" y1="12" y2="12" /><line x1="21" x2="16" y1="20" y2="20" /><line x1="12" x2="3" y1="20" y2="20" /><line x1="14" x2="14" y1="2" y2="6" /><line x1="8" x2="8" y1="10" y2="14" /><line x1="16" x2="16" y1="18" y2="22" />',
 hourglass:'<path d="M5 22h14" /><path d="M5 2h14" /><path d="M17 22v-4.172a2 2 0 0 0-.586-1.414L12 12l-4.414 4.414A2 2 0 0 0 7 17.828V22" /><path d="M7 2v4.172a2 2 0 0 0 .586 1.414L12 12l4.414-4.414A2 2 0 0 0 17 6.172V2" />',
 unlock:'<rect width="18" height="11" x="3" y="11" rx="2" ry="2" /><path d="M7 11V7a5 5 0 0 1 9.9-1" />',
 list:'<path d="m3 17 2 2 4-4" /><path d="m3 7 2 2 4-4" /><path d="M13 6h8" /><path d="M13 12h8" /><path d="M13 18h8" />',
 search:'<circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" />',
 filter:'<polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />',
 external:'<path d="M15 3h6v6" /><path d="M10 14 21 3" /><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />'
};
// Every icon carries class "ic": its size and stroke come from the icon tokens in css/app.css (:root --ic-*).
// Contexts pick a token (e.g. .nav-btn .ic = --ic-lg); never give an icon a one-off pixel size.
// The LaoLao logo, inline so it can draw itself (shapes from logo-data.js, built with logo-mark.svg by scripts/build_icons.mjs).
// Decorative: the app name is always written next to it. The first copy on a page gets the ids #logo-circle,
// #logo-letter-big and #logo-letter-small; later copies get a "-2", "-3"… suffix so ids and gradients never clash.
// Every logo loops its line-drawing animation (.lm-anim, 6 s, CSS in app.css), except with reduced motion.
let logoSeq = 0;
export function brandMark(cls){
  const n = ++logoSeq, sfx = n === 1 ? "" : "-" + n;
  const C = LOGO.colors, [x1, y1, x2, y2] = LOGO.grad, s = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  s.setAttribute("viewBox", "0 0 512 512"); s.setAttribute("width", "38"); s.setAttribute("height", "38");
  s.setAttribute("aria-hidden", "true"); s.setAttribute("focusable", "false");
  s.setAttribute("class", "seal logo" + (cls ? " " + cls : "") + (!reducedMotion() ? " lm-anim" : ""));
  s.innerHTML = `<defs><linearGradient id="logo-g${sfx}" gradientUnits="userSpaceOnUse" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}">` +
    `<stop offset="0" stop-color="${C.dark}"/><stop offset=".5" stop-color="${C.mid}"/><stop offset="1" stop-color="${C.light}"/></linearGradient>` +
    `<clipPath id="logo-c${sfx}"><circle cx="256" cy="256" r="256"/></clipPath></defs>` +
    `<circle id="logo-circle${sfx}" class="lm-part lm-circle" cx="256" cy="256" r="256" transform="rotate(-90 256 256)" pathLength="1" fill="url(#logo-g${sfx})"/>` +
    `<g clip-path="url(#logo-c${sfx})"><path id="logo-letter-big${sfx}" class="lm-part lm-big" pathLength="1" fill="${C.big}" fill-rule="evenodd" d="${LOGO.big}"/>` +
    `<path id="logo-letter-small${sfx}" class="lm-part lm-small" pathLength="1" fill="${C.small}" fill-rule="evenodd" d="${LOGO.small}"/></g>`;
  return s;
}
export function icon(n, cls){ const s=document.createElementNS("http://www.w3.org/2000/svg","svg"); s.setAttribute("viewBox","0 0 24 24"); s.setAttribute("aria-hidden","true"); s.setAttribute("class", cls ? "ic "+cls : "ic"); s.innerHTML = IC[n] || IC.more; return s; }

// ----- theme management (Day, Night, System) -----
export function getTheme(){
  try {
    const saved = localStorage.getItem("laolao_theme");
    if (saved && ["day","night","system"].includes(saved)) return saved;
  } catch(e){}
  return "day";
}
// Older preferences used light / dark / auto
const THEME_ALIAS = { light:"day", dark:"night", auto:"system" };
export const normTheme = mode => { mode = THEME_ALIAS[mode] || mode; return ["day","night","system"].includes(mode) ? mode : "day"; };
export function setTheme(mode="day"){
  mode = normTheme(mode);
  try { localStorage.setItem("laolao_theme", mode); } catch(e){}
  if (mode === "day") {
    document.documentElement.setAttribute("data-theme", "day");
  } else if (mode === "night") {
    document.documentElement.setAttribute("data-theme", "night");
  } else {
    document.documentElement.setAttribute("data-theme", "system");
  }
}
export function themeSwitcher(onChange){
  let cur = getTheme();
  const wrap = h("div",{class:"themesw","aria-label":"Theme switcher"});
  const modes = [["day","sun","Day"],["night","moon","Night"],["system","monitor","Auto"]];
  const updateBtns = () => {
    $$("button", wrap).forEach((btn, idx) => {
      const active = modes[idx][0] === cur;
      btn.setAttribute("aria-pressed", String(active));
    });
  };
  modes.forEach(([mode, ic, label]) => {
    const btn = h("button",{type:"button","aria-pressed":String(cur===mode),title:label,onclick:()=>{
      cur = mode;
      setTheme(mode);
      updateBtns();
      if (onChange) onChange(mode);
    }}, icon(ic), h("span",{class:"hide-sm"}, label));
    wrap.append(btn);
  });
  return wrap;
}

// ----- motion -----
export const reducedMotion = () => typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
// Run a DOM update as an animated View Transition (css/app.css "transitions"): kind "page" / "back" slide the page,
// "theme" reveals the new theme in a circle from (x, y), anything else cross-fades. Without support, or with reduced
// motion, the update simply happens. Slow updates are not waited for longer than 450 ms, so the screen never freezes.
export function withTransition(update, { kind = "page", x = null, y = null } = {}){
  const de = document.documentElement;
  if (!document.startViewTransition || reducedMotion()) return Promise.resolve().then(update);
  de.dataset.vt = kind;
  if (x != null){ de.style.setProperty("--vt-x", x + "px"); de.style.setProperty("--vt-y", y + "px"); }
  const tr = document.startViewTransition(() => Promise.race([Promise.resolve().then(update), new Promise(r => setTimeout(r, 450))]));
  tr.finished.catch(() => {}).finally(() => { if (de.dataset.vt === kind) delete de.dataset.vt; });
  return tr.updateCallbackDone.catch(() => {});
}
// Remove an element after its exit animation (class "out")
export function leave(el, ms = 170){
  if (!el || el.classList.contains("out")) return;
  el.classList.add("out");
  setTimeout(() => el.remove(), reducedMotion() ? 0 : ms);
}

// ----- feedback -----
let toastT;
export function toast(msg, kind){
  let el = $(".toast:not(.out)"); if (!el){ el = h("div",{class:"toast",role:"status"}); document.body.append(el); }
  el.textContent = msg; el.className = "toast" + (kind ? " "+kind : ""); clearTimeout(toastT); toastT = setTimeout(()=>leave(el, 220), 2800);
}
// In-page dialog (native confirm/prompt are blocked in some viewers)
// Open dialogs, newest last: only the top one reacts to Escape
const OPEN = [];
// Modal dialog. An action with a value closes with that value; one with onClick closes with its result unless it returns false.
// Cancelling (an action with value false, ×, Escape or a click outside) asks "Discard changes?" first when something was typed
// or picked in the dialog; pass guard: () => bool to decide that yourself.
export function dialog({ title, body, actions=[], wide=false, cls="", guard }){
  return new Promise(resolve => {
    const scrim = h("div",{class:"scrim"});
    const box = h("div",{class:"dialog"+(wide?" wide":"")+(cls?" "+cls:""),role:"dialog","aria-modal":"true","aria-label":title||""});
    let touched = false, asking = false;
    const mark = e => { if (e.isTrusted) touched = true; };
    box.addEventListener("input", mark); box.addEventListener("change", mark);
    const close = v => { if (box.classList.contains("out")) return; leave(scrim, 160); leave(box, 160); OPEN.splice(OPEN.indexOf(box), 1); document.removeEventListener("keydown", onKey); resolve(v); };
    const cancel = async v => {
      if (asking || box.classList.contains("out")) return;
      if (guard ? guard() : touched){ asking = true; const sure = await discardDialog(); asking = false; if (!sure) return; }
      close(v);
    };
    const onKey = e => { if (e.key==="Escape" && OPEN[OPEN.length-1]===box){ e.preventDefault(); cancel(null); } };
    document.addEventListener("keydown", onKey);
    scrim.addEventListener("click", () => cancel(null));
    box.append(...[
      title ? h("div",{class:"dialog-h"}, h("h2",null,title), h("button",{class:"ib","aria-label":t("close")||"Close",onclick:()=>cancel(null)}, icon("x"))) : null,
      h("div",{class:"dialog-b"}, typeof body === "function" ? body(close) : body),   // body(close) lets the content close the dialog
      actions.length ? h("div",{class:"dialog-f"}, actions.map(a => h("button",{class:"btn"+(a.primary?" primary":"")+(a.danger?" danger":""),onclick:async()=>{
        if (a.value === false && !a.onClick) return cancel(false);
        if (a.value !== undefined) return close(a.value);
        const v = a.onClick ? await a.onClick() : true; if (v!==false) close(v); }}, a.label))) : null].filter(Boolean));   // append() would print "null"
    document.body.append(scrim, box); OPEN.push(box);
    const f = box.querySelector("input,select,textarea,button.primary"); if (f) f.focus();
  });
}
export const confirmDialog = (title, text, okLabel="OK", cancelLabel="Cancel", danger=false) =>
  dialog({ title, body: h("p",null,text), actions:[{label:cancelLabel, value:null},{label:okLabel, value:true, primary:!danger, danger}] }).then(v=>v===true);

// "Discard changes?" asked before unsaved edits are thrown away. Resolves true to discard, false to keep editing.
export function discardDialog(){
  return dialog({ cls:"discard-dlg", body: h("div",{class:"dc"},
      h("div",{class:"dc-ic","aria-hidden":"true"}, h("span",{class:"dc-ring"}), icon("edit")),
      h("h2",null, t("dc_title")), h("p",null, t("dc_text"))),
    actions:[{ label:t("dc_keep"), value:false, primary:true }, { label:t("dc_discard"), value:true, danger:true }] }).then(v => v === true);
}

export function fmtDate(ms, lang="en", withTime=false){
  if (!ms) return "—";
  const d = new Date(ms); const loc = lang==="zh"?"zh-CN":lang==="lo"?"lo-LA":"en-GB";
  try { return d.toLocaleDateString(loc, withTime ? {year:"numeric",month:"short",day:"numeric",hour:"2-digit",minute:"2-digit"} : {year:"numeric",month:"short",day:"numeric"}); } catch(e){ return d.toISOString().slice(0,10); }
}
export const todayKey = (d=new Date()) => d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+String(d.getDate()).padStart(2,"0");
export function errText(e){
  const c = e && e.code || "";
  const map = {"auth/invalid-credential":"Wrong email or password.","auth/wrong-password":"Wrong email or password.","auth/user-not-found":"No account with that email.",
    "auth/email-already-in-use":"That email already has an account.","auth/weak-password":"Password must be at least 6 characters.","auth/invalid-email":"That email address isn't valid.",
    "auth/too-many-requests":"Too many attempts. Wait a minute and try again.","auth/network-request-failed":"No internet connection.","permission-denied":"You don't have permission to do that."};
  return map[c] || (e && e.message) || String(e);
}

// ----- video links -----
// YouTube only plays inside an iframe through its /embed/ URL; watch, youtu.be, shorts and live links are refused.
// videoSource() turns any of those into a playable source:
//   { kind:"youtube", id, src, watch } · { kind:"file", src } (mp4/webm/ogg) · { kind:"iframe", src } · { kind:"invalid" }
export function videoSource(url){
  const raw = String(url || "").trim();
  if (!raw) return { kind: "invalid" };
  if (/^[\w-]{11}$/.test(raw)) return ytSource(raw, 0);              // a bare video ID
  let u; try { u = new URL(raw); } catch(e){ return { kind: "invalid" }; }
  if (!/^https?:$/.test(u.protocol)) return { kind: "invalid" };
  const host = u.hostname.replace(/^(www|m|music)\./, "");
  const start = parseInt(u.searchParams.get("start") || u.searchParams.get("t") || "0", 10) || 0;
  let id = null;
  if (host === "youtu.be") id = u.pathname.slice(1).split("/")[0];
  else if (host === "youtube.com" || host === "youtube-nocookie.com"){
    if (u.pathname === "/watch") id = u.searchParams.get("v");
    else { const m = u.pathname.match(/^\/(embed|shorts|live|v)\/([\w-]{11})/); if (m) id = m[2]; }
  }
  if (id && /^[\w-]{11}$/.test(id)) return ytSource(id, start);
  if (host === "youtube.com" || host === "youtu.be") return { kind: "invalid" };
  if (/\.(mp4|webm|ogg|ogv|m4v)$/i.test(u.pathname)) return { kind: "file", src: u.href };
  return { kind: "iframe", src: u.href };
}
function ytSource(id, start){
  return { kind: "youtube", id, src: `https://www.youtube.com/embed/${id}?rel=0${start ? "&start=" + start : ""}`,
    watch: `https://www.youtube.com/watch?v=${id}`, thumb: `https://i.ytimg.com/vi/${id}/hqdefault.jpg` };
}
