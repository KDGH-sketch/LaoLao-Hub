// Sentence generator + pinyin engine (runs fully on the device).
// ---------- Pinyin + sentence engine (shared by app and build tests) ----------
const IRR = {eat:["ate","eaten"],drink:["drank","drunk"],read:["read","read"],go:["went","gone"],do:["did","done"],write:["wrote","written"],buy:["bought","bought"],sing:["sang","sung"],swim:["swam","swum"],run:["ran","run"],sleep:["slept","slept"],take:["took","taken"],make:["made","made"],have:["had","had"],see:["saw","seen"],come:["came","come"],get:["got","gotten"],speak:["spoke","spoken"],drive:["drove","driven"],ride:["rode","ridden"],fly:["flew","flown"],leave:["left","left"],say:["said","said"],tell:["told","told"],find:["found","found"],think:["thought","thought"],teach:["taught","taught"],learn:["learned","learned"],give:["gave","given"],know:["knew","known"],put:["put","put"],sit:["sat","sat"],meet:["met","met"],forget:["forgot","forgotten"],lose:["lost","lost"],pay:["paid","paid"],send:["sent","sent"],spend:["spent","spent"],wake:["woke","woken"],win:["won","won"],break:["broke","broken"],bring:["brought","brought"],begin:["began","begun"],understand:["understood","understood"],hear:["heard","heard"],feel:["felt","felt"],keep:["kept","kept"],become:["became","become"],build:["built","built"],grow:["grew","grown"],draw:["drew","drawn"],choose:["chose","chosen"],hold:["held","held"],sell:["sold","sold"],wear:["wore","worn"]};
const DOUBLE = new Set(["shop","run","swim","jog","chat","stop","plan","get","sit","begin","win","put","hit","cut"]);
function conj(phrase, form){
  const i = phrase.indexOf(" ");
  const v = i<0 ? phrase : phrase.slice(0,i), rest = i<0 ? "" : phrase.slice(i);
  let out;
  if (form==="s"){
    if (v==="have") out="has"; else if (v==="be") out="is";
    else if (/(s|sh|ch|x|o|z)$/.test(v)) out=v+"es";
    else if (/[^aeiou]y$/.test(v)) out=v.slice(0,-1)+"ies"; else out=v+"s";
  } else if (form==="d"||form==="p"){
    if (IRR[v]) out=IRR[v][form==="d"?0:1];
    else if (v.endsWith("e")) out=v+"d";
    else if (/[^aeiou]y$/.test(v)) out=v.slice(0,-1)+"ied";
    else if (DOUBLE.has(v)) out=v+v.slice(-1)+"ed"; else out=v+"ed";
  } else if (form==="g"){
    if (v==="be"||v==="see") out=v+"ing";
    else if (v.endsWith("ie")) out=v.slice(0,-2)+"ying";
    else if (v.endsWith("e") && !v.endsWith("ee")) out=v.slice(0,-1)+"ing";
    else if (DOUBLE.has(v)) out=v+v.slice(-1)+"ing"; else out=v+"ing";
  } else out=v;
  return out+rest;
}

const TONEV = {"ā":1,"á":2,"ǎ":3,"à":4,"ē":1,"é":2,"ě":3,"è":4,"ī":1,"í":2,"ǐ":3,"ì":4,"ō":1,"ó":2,"ǒ":3,"ò":4,"ū":1,"ú":2,"ǔ":3,"ù":4,"ǖ":1,"ǘ":2,"ǚ":3,"ǜ":4};
function firstTone(py){ for (const c of py){ if (TONEV[c]) return TONEV[c]; } return 0; }
const PUNCT = {"，":", ","。":".","？":"?","！":"!","、":", ","：":": ","；":"; ","—":" — ","“":"\"","”":"\"","（":"(","）":")",",":", ",".":".","?":"?","!":"!"};
const isHan = c => (c>="\u0E80" && c<="\u0EFF") || (c>="一" && c<="鿿");

function makeEngine(DICT, CHARS, LEX){
  // Normalize LEX whether array of categories or map
  const NORM_LEX = {};
  if (Array.isArray(LEX)){
    LEX.forEach(cat => { if (cat && (cat.id || cat.cat)) NORM_LEX[cat.cat || cat.id] = cat.data || cat; });
  } else if (LEX && typeof LEX === "object"){
    Object.assign(NORM_LEX, LEX);
  }

  // Build fast romanization lookup from lexicon
  const LEX_MAP = {};
  for (const cat in NORM_LEX){
    const arr = NORM_LEX[cat];
    if (Array.isArray(arr)){
      arr.forEach(it => { if (it && it.z && it.p) LEX_MAP[it.z] = it.p; });
    }
  }

  function tokPinyin(tok){
    if (!tok) return "";
    if (tok.includes("|")) return tok.split("|")[1];
    if (LEX_MAP[tok]) return LEX_MAP[tok];
    const d = DICT && DICT[tok];
    if (d){
      const p = Array.isArray(d) ? d[0] : (d.p || d[0]);
      if (p) return p;
    }
    if (CHARS && CHARS[tok] && CHARS[tok].p){
      return CHARS[tok].p.split(",")[0].trim();
    }
    return tok;
  }
  function sandhi(tokens){
    return tokens;
  }
  function tokenize(zhSpaced){
    const raw = zhSpaced.replace(/([，。？！、：；,.?!])/g," $1 ").split(/\s+/).filter(Boolean);
    const toks = raw.map(r=>{
      if (PUNCT[r]!==undefined) return {z:r, p:"", punct:1};
      const z = r.split("|")[0];
      return {z, p: tokPinyin(r), lock: r.includes("|")};
    });
    return sandhi(toks);
  }
  function pinyinLine(toks){
    let s="", cap=true;
    for (const t of toks){
      if (t.punct){ s = s.replace(/\s+$/,"") + (PUNCT[t.z] || t.z); if (/[.?!]/.test(PUNCT[t.z]||t.z)) cap=true; continue; }
      let p=t.p; if (cap && p){ p=p[0].toUpperCase()+p.slice(1); cap=false; }
      s += (s && !s.endsWith(" ") ? " " : "") + p;
    }
    return s.trim().replace(/\s+/g," ");
  }
  const rnd = a => a[Math.floor(Math.random()*a.length)];
  function asItem(x){
    if (typeof x==="string"){
      const parts = x.split(";");
      const mk = s => { const [z,e,e2,e3]=s.split("|"); return {z, e: e===undefined?"":e, e2, e3}; };
      const it = mk(parts[0]);
      "BCDEF".split("").forEach((k,i)=>{ if (parts[i+1]!==undefined) it[k]=mk(parts[i+1]); });
      return it;
    }
    return x;
  }
  function adj(key){ const a=(NORM_LEX.ADJ && NORM_LEX.ADJ[key]) || {e:key}; return Object.assign({z:key}, a); }
  function pickFor(name, slots, ctx){
    if (ctx.picks[name]) return ctx.picks[name];
    let list, key, cat = name.replace(/\d+$/,"");
    let spec = slots && (slots[name]!==undefined && slots[name]!==null ? slots[name] : (name!==cat && slots[cat]!=null && typeof slots[cat]!=="string" ? slots[cat] : undefined));
    if (typeof spec==="string"){ list = NORM_LEX[spec]; key = spec; }
    else if (spec){ list = spec; key = "@"+cat; }
    else if (NORM_LEX[cat]){ list = NORM_LEX[cat]; key = cat; }
    else if (NORM_LEX[name]){ list = NORM_LEX[name]; key = name; }
    else throw new Error("Unknown slot "+name);
    if (!list) throw new Error("Bad slot "+name);
    if (Array.isArray(list) && typeof list[0]==="string" && !list[0].includes("|") && NORM_LEX.ADJ && NORM_LEX.ADJ[list[0]]) list = list.map(adj);
    list = list.map(asItem);
    const used = ctx.used[key] || (ctx.used[key]=new Set());
    let cands = list.filter(x=>!used.has(x.z)); if (!cands.length) cands=list;
    let it = Object.assign({}, rnd(cands));
    used.add(it.z);
    if (it.a && NORM_LEX.ADJ) it.A = adj(rnd(it.a));
    if (it.x && NORM_LEX.ADJ) it.A = adj(rnd(it.x));
    ctx.picks[name]=it; return it;
  }
  function subj(ctx){ return ctx.picks.P || ctx.picks.PS || ctx.picks.P1; }
  function field(it, path, ctx, lang){
    let cur = it;
    for (let k=0;k<path.length;k++){
      const f = path[k];
      if (cur[f]!==undefined && cur[f]!==null && typeof cur[f]==="object"){ cur=cur[f]; continue; }
      if (lang==="zh") return (typeof cur[f]==="string" && (f==="z"||f[0]==="z")) ? cur[f] : cur.z;
      if (cur[f]!==undefined) return cur[f];
      const s = cur.s===1, I = cur.e==="I";
      if (f==="do") return s?"does":"do";
      if (f==="have") return s?"has":"have";
      if (f==="was") return (s||I)?"was":"were";
      if (f==="Be") return cur.be || (s ? "is" : I ? "am" : "are");
      if (f==="po") return cur.o || cur.e;
      if (f==="@"){ const sb = subj(ctx); return conj(cur.e, sb && sb.s===1 ? "s":"b"); }
      if (["s","d","g","p","b"].includes(f)) return conj(cur.e, f);
      if (f==="E") return cur.e ? cur.e[0].toUpperCase()+cur.e.slice(1) : "";
      return cur.e!==undefined ? cur.e : "";
    }
    return lang==="zh" ? cur.z : (cur.e!==undefined?cur.e:cur.z);
  }
  function fill(str, lang, slots, ctx){
    for (let pass=0; pass<4 && str.includes("{"); pass++){
      str = str.replace(/\{([A-Za-z0-9_]+)((?:\.[A-Za-z0-9_@]+)*)(@?)\}/g, (m,name,path,at)=>{
        const it = pickFor(name, slots, ctx);
        const p = path ? path.slice(1).split(".") : [];
        if (at) p.push("@");
        const v = field(it, p, ctx, lang);
        return v;
      });
    }
    return str;
  }
  function generate(tpl){
    let zt, et, slots;
    if (Array.isArray(tpl)){
      [zt, et, slots] = tpl;
    } else if (tpl && typeof tpl === "object"){
      zt = tpl.zh || tpl.lo || tpl.lao || tpl.z;
      et = tpl.en || tpl.e;
      slots = tpl.slots ? (typeof tpl.slots === "string" ? JSON.parse(tpl.slots) : tpl.slots) : undefined;
    } else {
      throw new Error("Invalid template passed to generate");
    }
    const ctx = {picks:{}, used:{}};
    // Lao text first so picks are shared; en uses same picks
    const zhSp = fill(zt, "zh", slots, ctx);
    let et2 = et;
    for (const nm of ["P","PS","P1","P2"]){ let seen=0; et2 = et2.replace(new RegExp("\\{"+nm+"\\}","g"), m=>(seen++ ? "{"+nm+".pr}" : m)); }
    let en = fill(et2, "en", slots, ctx).replace(/\[\[([a-z' ]+)\]\]/g,(m,v)=>{
      const sb = subj(ctx);
      const isSingular = sb && sb.s === 1;
      const isI = sb && sb.e === "I";
      if (v === "be") return isSingular ? "is" : (isI ? "am" : "are");
      if (v === "have") return isSingular ? "has" : "have";
      if (v === "do") return isSingular ? "does" : "do";
      return conj(v, isSingular ? "s" : "b");
    }).replace(/\s+/g," ").replace(/\s([,.?!])/g,"$1").trim();
    en = en[0].toUpperCase()+en.slice(1);
    const toks = tokenize(zhSp);
    return {toks, zh: toks.map(t=>t.z).join(""), py: pinyinLine(toks), en};
  }
  return {generate, tokenize, pinyinLine, tokPinyin, conj};
}
export { makeEngine, conj, TONEV, firstTone };
