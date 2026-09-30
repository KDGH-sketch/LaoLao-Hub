// Content management: lists, schema-driven editor, versions, previews, quiz builder
import { h, $$, icon, toast, dialog, confirmDialog, fmtDate, errText, debounce, tr, pyHTML, isHan } from "../shared/ui.js";
import { lang } from "../shared/i18n.js";
import { CONTENT_TYPES, ACCESS_KEYS, STATUS_KEYS, saveContent, listVersions } from "../shared/content.js";
import { loadDict, dict, chars, segment } from "../shared/dict.js";
import { makeEngine } from "../shared/engine.js";
import { runQuiz, QTYPES, QTYPE_SKILL } from "../shared/quiz.js";
import { sentenceEl, ctx } from "../shared/widgets.js";
import { SKILLS } from "../shared/content.js";
import { S, L, t, go, canContent, fld } from "./state.js";
import { SCHEMAS, STEP_TYPE_TO_COL, APP_PAGES } from "./schemas.js";
import { publishFlow } from "./main.js";

const cache = {};   // collection → rows (for pickers)
async function rows(col, force){ if (force || !cache[col]) cache[col] = await S.api.db.list(col); return cache[col]; }
const titleOf = (type, d) => { const s = SCHEMAS[type]; const ti = s && s.title ? s.title(d) : d.title; return (ti && (tr(ti, lang()) || ti.en)) || d.hz || d.id; };
let ENGINE = null, LEXICON = null;
async function engine(){ await loadDict(); if (!LEXICON){ LEXICON = {}; (await rows("lexicon")).forEach(x => LEXICON[x.cat||x.id] = x.data); } if (!ENGINE) ENGINE = makeEngine(dict(), chars(), LEXICON); return ENGINE; }
export function autoPinyin(eng, zh){ const toks = eng.tokenize(segment(zh).join(" ")); return { tokens: toks.map(x=>({ z:x.z, p:x.p })), py: eng.pinyinLine(toks) }; }

// ---------- content home ----------
export async function viewContentHome(){
  const counts = await Promise.all(CONTENT_TYPES.map(async ty => [ty, await S.api.db.count(ty).catch(()=>0)]));
  const ICON = {
    lessons:"learn", patterns:"gen", grammar:"layers", vocabulary:"dict", dialogues:"users",
    quizzes:"practice", audio:"speaker", paths:"path", releases:"gift", lexicon:"content",
    videos:"play", tones:"speaker", culture:"culture", characters:"chars", dictionary:"dict"
  };
  return h("div",null, h("div",{class:"pagehead"}, h("h1",null,t("adm_content")), h("p",null,"Universal Content Management System: Create, edit, duplicate, bulk-manage, and publish curriculum entities.")),
    h("div",{class:"grid3"}, counts.map(([ty,n]) => h("button",{class:"qs",onclick:()=>go("contentList",{type:ty})}, h("span",{class:"qi",style:"background:var(--surface-2);color:var(--accent)"}, icon(ICON[ty]||"content")), h("span",null, h("b",null,t("type_"+ty)||ty), h("div",{class:"small muted"}, n+" "+t("items")))))));
}

// ---------- list (Universal Admin DataTable) ----------
export async function viewContentList({ type, q="", status="", level="" }){
  const all = await rows(type, true);
  const s = SCHEMAS[type] || {};
  const selected = new Set();
  let page = 1;
  const pageSize = 30;

  const body = h("tbody");
  const bulkBar = h("div",{class:"bulk-bar",style:"display:none;padding:12px 16px;background:var(--surface-2);border-radius:10px;margin-bottom:12px;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:10px"});
  const selCountLabel = h("span",{style:"font-weight:600"});
  const selectAllBox = h("input",{type:"checkbox","aria-label":"Select all"});

  const paginator = h("div",{class:"row",style:"justify-content:space-between;align-items:center;margin-top:14px;padding:8px 0"});

  const updateBulkBar = () => {
    if (selected.size > 0) {
      bulkBar.style.display = "flex";
      selCountLabel.textContent = `${selected.size} item${selected.size > 1 ? "s" : ""} selected`;
    } else {
      bulkBar.style.display = "none";
    }
  };

  const getFiltered = () => {
    const f = q.trim().toLowerCase();
    return all.filter(d => (!status || d.status===status) && (!level || String(d.level)===level) && (!f || String(d.id).toLowerCase().includes(f) || titleOf(type,d).toLowerCase().includes(f) || JSON.stringify(d.title||d.tr||"").toLowerCase().includes(f)))
      .sort((a,b)=>(a.level||0)-(b.level||0) || (a.order??a.n??0)-(b.order??b.n??0) || String(a.id).localeCompare(String(b.id)));
  };

  const draw = () => {
    body.innerHTML = "";
    const filtered = getFiltered();
    const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
    if (page > totalPages) page = totalPages;
    const startIdx = (page - 1) * pageSize;
    const pageItems = filtered.slice(startIdx, startIdx + pageSize);

    selectAllBox.checked = pageItems.length > 0 && pageItems.every(d => selected.has(d.id));

    pageItems.forEach(d => {
      const isSel = selected.has(d.id);
      const rowBox = h("input",{type:"checkbox",checked:isSel,onclick:e=>{
        e.stopPropagation();
        if (e.target.checked) selected.add(d.id); else selected.delete(d.id);
        updateBulkBar();
        draw();
      }});

      const dupBtn = h("button",{class:"btn sm ghost",title:"Duplicate with new ID",onclick:async e=>{
        e.stopPropagation();
        const newId = d.id + "-copy-" + Date.now().toString(36).slice(-4);
        const copy = JSON.parse(JSON.stringify(d));
        copy.id = newId;
        copy.status = "draft";
        if (copy.n !== undefined && type==="patterns"){
          const allP = await rows("patterns");
          copy.n = Math.max(0, ...allP.map(p=>p.n||0)) + 1;
        }
        await saveContent(S.api, type, newId, copy, S.me ? S.me.uid : "admin");
        delete cache[type];
        toast("Duplicated as " + newId, "ok");
        go("editor", { type, id: newId });
      }}, icon("copy"));

      const delBtn = h("button",{class:"btn sm ghost",style:"color:var(--bad)",title:"Delete item",onclick:async e=>{
        e.stopPropagation();
        if (await confirmDialog(t("delete_item"), `Delete "${titleOf(type,d)}" (${d.id})?`, t("delete_item"), t("cancel"), true)){
          await S.api.db.del(`${type}/${d.id}`);
          await S.api.db.set("settings/bundle", { dirty:true }, true);
          delete cache[type];
          selected.delete(d.id);
          toast("Deleted " + d.id, "ok");
          const idx = all.findIndex(x=>x.id===d.id);
          if (idx>=0) all.splice(idx, 1);
          updateBulkBar();
          draw();
        }
      }}, icon("trash"));

      body.append(h("tr",{class:isSel?"active-row":"",onclick:()=>go("editor",{type,id:d.id})},
        h("td",{onclick:e=>e.stopPropagation(),style:"width:36px;text-align:center"}, rowBox),
        h("td",{class:"mono small"}, d.id),
        h("td",{class:/[\u0E80-\u0EFF]/.test(titleOf(type,d).slice(0,2))?"hz lo":""}, titleOf(type,d)),
        h("td",null, d.level ? "Stage "+d.level : "—"),
        h("td",null, s.noAccess ? "—" : h("span",{class:"chip"}, t("acc_"+(d.access||"free")))),
        h("td",null, s.noAccess ? "" : h("span",{class:"pill "+(d.status||"draft")}, t("status_"+(d.status||"draft")))),
        h("td",{class:"small muted"}, fmtDate(d.updatedAt, lang())),
        h("td",{onclick:e=>e.stopPropagation(),style:"text-align:right;white-space:nowrap"}, h("div",{class:"row",style:"gap:4px;justify-content:flex-end"}, dupBtn, delBtn))));
    });

    if (!pageItems.length) body.append(h("tr",null,h("td",{colspan:"8",class:"muted",style:"text-align:center;padding:24px"},t("no_rows"))));

    // Render pagination
    paginator.innerHTML = "";
    const prevBtn = h("button",{class:"btn sm",disabled:page<=1,onclick:()=>{ if (page>1){ page--; draw(); } }}, "← Previous");
    const nextBtn = h("button",{class:"btn sm",disabled:page>=totalPages,onclick:()=>{ if (page<totalPages){ page++; draw(); } }}, "Next →");
    const info = h("span",{class:"small muted"}, `Page ${page} of ${totalPages} · Showing ${filtered.length ? startIdx+1 : 0}–${Math.min(startIdx+pageSize, filtered.length)} of ${filtered.length} items`);
    paginator.append(prevBtn, info, nextBtn);
  };

  selectAllBox.onclick = e => {
    const filtered = getFiltered();
    const startIdx = (page - 1) * pageSize;
    const pageItems = filtered.slice(startIdx, startIdx + pageSize);
    if (e.target.checked) pageItems.forEach(d => selected.add(d.id));
    else pageItems.forEach(d => selected.delete(d.id));
    updateBulkBar();
    draw();
  };

  // Bulk actions handlers
  const bulkPublish = async () => {
    if (!selected.size) return;
    const count = selected.size;
    const ops = [];
    selected.forEach(id => ops.push({ op:"set", path:`${type}/${id}`, data:{ status:"published", updatedAt:new Date() }, merge:true }));
    await S.api.db.batch(ops);
    await S.api.db.set("settings/bundle", { dirty:true }, true);
    delete cache[type];
    all.forEach(d => { if (selected.has(d.id)) d.status = "published"; });
    selected.clear();
    toast(`Published ${count} items`, "ok");
    updateBulkBar();
    draw();
  };

  const bulkDraft = async () => {
    if (!selected.size) return;
    const count = selected.size;
    const ops = [];
    selected.forEach(id => ops.push({ op:"set", path:`${type}/${id}`, data:{ status:"draft", updatedAt:new Date() }, merge:true }));
    await S.api.db.batch(ops);
    await S.api.db.set("settings/bundle", { dirty:true }, true);
    delete cache[type];
    all.forEach(d => { if (selected.has(d.id)) d.status = "draft"; });
    selected.clear();
    toast(`Set ${count} items to Draft`, "ok");
    updateBulkBar();
    draw();
  };

  const bulkDelete = async () => {
    if (!selected.size) return;
    const count = selected.size;
    if (await confirmDialog("Bulk Delete", `Are you sure you want to permanently delete ${count} selected items from ${type}?`, "Delete All", t("cancel"), true)){
      const ops = [];
      selected.forEach(id => ops.push({ op:"del", path:`${type}/${id}` }));
      await S.api.db.batch(ops);
      await S.api.db.set("settings/bundle", { dirty:true }, true);
      delete cache[type];
      const selArr = Array.from(selected);
      for (const id of selArr){
        const idx = all.findIndex(x=>x.id===id);
        if (idx>=0) all.splice(idx,1);
      }
      selected.clear();
      toast(`Deleted ${count} items`, "ok");
      updateBulkBar();
      draw();
    }
  };

  const bulkExport = () => {
    const items = all.filter(d => selected.has(d.id) || (!selected.size && getFiltered().includes(d)));
    const blob = new Blob([JSON.stringify(items, null, 2)], { type:"application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${type}-export-${new Date().toISOString().slice(0,10)}.json`;
    a.click();
    toast(`Exported ${items.length} items`, "ok");
  };

  bulkBar.append(
    h("div",{class:"row",style:"align-items:center;gap:12px"},
      selCountLabel,
      h("button",{class:"btn sm ghost",onclick:()=>{ selected.clear(); updateBulkBar(); draw(); }}, "Deselect All")
    ),
    h("div",{class:"row",style:"gap:8px"},
      h("button",{class:"btn sm jade",onclick:bulkPublish}, icon("upload"), "Publish Selected"),
      h("button",{class:"btn sm",onclick:bulkDraft}, "Set as Draft"),
      h("button",{class:"btn sm",onclick:bulkExport}, icon("download"), "Export"),
      h("button",{class:"btn sm ghost",style:"color:var(--bad)",onclick:bulkDelete}, icon("trash"), "Delete Selected")
    )
  );

  const wrap = h("div");
  wrap.append(
    h("div",{class:"crumb"}, h("button",{onclick:()=>go("content")}, t("adm_content")), "›", h("span",null,t("type_"+type)||type)),
    h("div",{class:"pagehead"},
      h("div",{class:"spread"},
        h("h1",null,(t("type_"+type)||type)+" ("+all.length+")"),
        h("div",{class:"row",style:"gap:8px"},
          h("button",{class:"btn ghost sm",onclick:bulkExport}, icon("download"), "Export All"),
          canContent() ? h("button",{class:"btn primary",onclick:()=>newItem(type)}, icon("plus"), t("new_item")) : null
        )
      )
    ),
    bulkBar,
    h("div",{class:"toolbar"},
      h("input",{class:"input grow",placeholder:t("filter_ph"),value:q,oninput:debounce(e=>{ q=e.target.value; page=1; draw(); },120)}),
      s.noAccess ? null : h("select",{class:"input",onchange:e=>{ status=e.target.value; page=1; draw(); }}, h("option",{value:""},t("status")+": "+t("all")), STATUS_KEYS.map(k=>h("option",{value:k,selected:status===k},t("status_"+k)))),
      h("select",{class:"input",onchange:e=>{ level=e.target.value; page=1; draw(); }}, h("option",{value:""},t("level")+": "+t("all")), [1,2,3,4,5,6].map(n=>h("option",{value:String(n)},"Stage "+n)))
    ),
    h("div",{class:"tbl-wrap"},
      h("table",{class:"tbl"},
        h("thead",null,
          h("tr",null,
            h("th",{style:"width:36px;text-align:center"}, selectAllBox),
            [t("id_f"),t("title_f"),t("level"),t("access"),t("status"),t("updated"),"Actions"].map(x=>h("th",null,x))
          )
        ),
        body
      )
    ),
    paginator
  );

  draw();
  return wrap;
}
async function newItem(type){
  const s = SCHEMAS[type];
  const id = h("input",{class:"input mono",placeholder:s.idHint||""});
  if (s.idFrom) return go("editor",{ type, id:"", isNew:true });
  if (type==="patterns"){ const all = await rows("patterns"); id.value = "p"+String(Math.max(0,...all.map(p=>p.n||0))+1).padStart(3,"0"); }
  const r = await dialog({ title:t("new_item")+" · "+(t("type_"+type)||type), body:h("div",{class:"stack"}, fld(t("id_f"), id, t("id_d"))),
    actions:[{label:t("cancel"),value:false},{label:t("create"),primary:true,onClick:async()=>{ const v = id.value.trim().replace(/[^A-Za-z0-9_\-一-鿿]/g,"-"); if (!v) return false; if (await S.api.db.get(`${type}/${v}`)){ toast("That ID already exists.","err"); return false; } return v; }}] });
  if (r) go("editor",{ type, id:r, isNew:true });
}

// ---------- editor ----------
export async function viewEditor({ type, id, isNew }){
  const s = SCHEMAS[type];
  let doc = !isNew && id ? await S.api.db.get(`${type}/${id}`) : null;
  let draft = JSON.parse(JSON.stringify(doc || Object.assign({ status:"draft", access:"free", order:0 }, s.defaults)));
  if (type==="patterns" && isNew && id) draft.n = parseInt(id.replace(/\D/g,""))||0;
  const form = h("div",{class:"stack"});
  const renderForm = () => { form.innerHTML=""; s.fields.forEach(f => form.append(renderField(f, draft, type))); };
  renderForm();
  const statusSel = h("select",{class:"input",onchange:e=>draft.status=e.target.value}, STATUS_KEYS.map(k=>h("option",{value:k,selected:draft.status===k},t("status_"+k))));
  const accessSel = h("select",{class:"input",onchange:e=>draft.access=e.target.value}, ACCESS_KEYS.map(k=>h("option",{value:k,selected:draft.access===k},t("acc_"+k))));
  const orderIn = h("input",{class:"input",type:"number",value:draft.order??0,oninput:e=>draft.order=+e.target.value});
  const save = async publishToo => {
    try {
      if (publishToo) draft.status = "published";
      const clean = await normalize(type, draft);
      const docId = s.idFrom ? (clean[s.idFrom]||"").trim() : id;
      if (!docId){ toast(t("id_f")+"?","err"); return; }
      await saveContent(S.api, type, docId, clean, S.me.uid);
      delete cache[type]; if (type==="lexicon"){ LEXICON=null; ENGINE=null; }
      toast(t("saved_ok"));
      if (publishToo) await publishFlow();
      go("editor",{ type, id:docId });
    } catch(e){ console.error(e); toast(errText(e),"err"); }
  };
  const side = h("aside",{class:"editor-side"},
    h("div",{class:"panel"},
      s.noAccess ? null : fld(t("status"), statusSel), s.noAccess ? null : fld(t("access"), accessSel), fld(t("order"), orderIn),
      h("div",{class:"stack",style:"gap:8px"},
        h("button",{class:"btn primary",onclick:()=>save(false)}, t("save")),
        s.noAccess ? null : h("button",{class:"btn jade",onclick:()=>save(true)}, icon("upload"), t("status_published")+" + "+t("publish_now"))),
      doc ? h("p",{class:"small muted"}, "v"+(doc.version||1)+" · "+t("updated")+" "+fmtDate(doc.updatedAt, lang(), true)) : null),
    previewPanel(type, draft),
    doc ? versionsPanel(type, id, v => { draft = JSON.parse(JSON.stringify(Object.assign({}, v, { status: draft.status }))); renderForm(); toast("v"+v.version+" → "+t("save")); }) : null,
    doc ? h("div",{class:"row"},
      h("button",{class:"btn sm",onclick:async()=>{ const nid = id+"-copy"; await saveContent(S.api, type, nid, Object.assign({}, draft, { status:"draft" }), S.me.uid); go("editor",{type,id:nid}); }}, icon("copy"), t("duplicate")),
      h("button",{class:"btn sm ghost",style:"color:var(--bad)",onclick:async()=>{ if(await confirmDialog(t("delete_item"),t("confirm_delete"),t("delete_item"),t("cancel"),true)){ await S.api.db.del(`${type}/${id}`); await S.api.db.set("settings/bundle",{dirty:true},true); delete cache[type]; go("contentList",{type}); } }}, icon("trash"), t("delete_item"))) : null);
  return h("div",null,
    h("div",{class:"crumb"}, h("button",{onclick:()=>go("content")}, t("adm_content")), "›", h("button",{onclick:()=>go("contentList",{type})}, t("type_"+type)), "›", h("span",{class:"mono"}, id || t("new_item"))),
    h("div",{class:"pagehead"}, h("h1",null, doc ? titleOf(type, doc) : t("new_item"))),
    h("div",{class:"editor"}, form, side));
}
async function normalize(type, d){
  const eng = await engine();
  const o = JSON.parse(JSON.stringify(d));
  const fixSentence = snt => { if (!snt || !snt.zh) return snt; const a = autoPinyin(eng, snt.zh.trim()); snt.zh = snt.zh.trim(); snt.tokens = a.tokens; if (!snt.py) snt.py = a.py; return snt; };
  ["examples","lines"].forEach(k => { if (Array.isArray(o[k])) o[k] = o[k].filter(x=>x && x.zh).map(fixSentence); });
  if (type==="vocabulary"){ o.hz = (o.hz||"").trim(); if (!o.py) o.py = autoPinyin(eng, o.hz).py.toLowerCase(); }
  if (type==="patterns"){ o.markers = undefined; (o.gen||[]).forEach(g => { if (g.slots){ JSON.parse(g.slots); } }); if (!o.hz) throw new Error("Pattern (Lao) is required."); }
  if (type==="lexicon" && typeof o.data==="string") o.data = JSON.parse(o.data);
  if (type==="quizzes") (o.questions||[]).forEach(q => { if (q.prompt && q.prompt.zh && !q.prompt.py && !["listen_select","listen_type"].includes(q.type)) q.prompt.py = autoPinyin(eng, q.prompt.zh).py; if (q.type==="order" && q.tokens && !q.answer) q.answer = q.tokens.join(""); });
  Object.keys(o).forEach(k => o[k]===undefined && delete o[k]);
  return o;
}

// ---------- field renderers ----------
const LANGS = [["en","EN"],["lo","ລາວ"],["zh","中文"]];
function renderField(f, obj, type){
  if (f.row) return h("div",{class:"field-row"}, f.row.map(x => renderField(x, obj, type)));
  const label = L(f.label||""), help = f.help ? L(f.help) : null;
  const get = () => f.key ? obj[f.key] : obj, set = v => { if (f.key) obj[f.key] = v; };
  const input = (v, onv, extra={}) => h(extra.multi?"textarea":"input",{class:"input"+(extra.cls?" "+extra.cls:""),value:v??"",placeholder:extra.placeholder||"",type:extra.type||null,lang:extra.lang||null,oninput:e=>onv(e.target.value)});
  switch (f.type){
    case "text": return fld(label, input(get(), set, { cls:f.cls, placeholder:f.placeholder }), help);
    case "textarea": return fld(label, input(get(), set, { multi:true }), help);
    case "number": return fld(label, input(get(), v=>set(+v), { type:"number" }), help);
    case "date": return fld(label, input(get(), set, { type:"date" }), help);
    case "select": return fld(label, h("select",{class:"input",onchange:e=>set(f.num?+e.target.value:e.target.value)}, f.options.map(([v,l])=>h("option",{value:v,selected:String(get())===String(v)},l))), help);
    case "pinyin": { const inp = input(get(), set); return fld(label, h("div",{class:"row",style:"flex-wrap:nowrap"}, inp, h("button",{class:"btn sm",type:"button",onclick:async()=>{ const e = await engine(); const v = autoPinyin(e, obj[f.from]||"").py.toLowerCase(); set(v); inp.value = v; }}, t("auto_pinyin"))), help); }
    case "tr": { const v = get() || {}; set(v); return fld(label, h("div",{class:f.multiline?"stack":"field-row",style:f.multiline?"gap:6px":""}, LANGS.map(([l,n]) => h("div",{class:"field"}, h("span",{class:"help"},n), input(v[l], x=>v[l]=x, { multi:f.multiline, cls:l==="lo"?"lo":"" })))), help); }
    case "trlines": { const v = get() || {}; set(v); return fld(label, h("div",{class:"field-row"}, LANGS.map(([l,n]) => h("div",{class:"field"}, h("span",{class:"help"},n), input((v[l]||[]).join("\n"), x=>v[l]=x.split("\n").map(s=>s.trim()).filter(Boolean), { multi:true, cls:l==="lo"?"lo":"" })))), help); }
    case "lines": return fld(label, input((get()||[]).join("\n"), x=>set(x.split("\n").map(s=>s.trim()).filter(Boolean)), { multi:true }), help);
    case "tags": return fld(label, input((get()||[]).join(", "), x=>set(x.split(/[,，]/).map(s=>s.trim()).filter(Boolean)), { placeholder:f.placeholder }), help);
    case "words": {
      const v = get() || []; set(v); const tags = h("div",{class:"refpick"});
      const draw = () => { tags.innerHTML=""; v.forEach((w,i) => tags.append(h("span",{class:"tag"}, h("span",{class:"hz"},w), " ", h("span",{class:"small muted",html:pyHTML(dict()[w]?dict()[w].p:"")}), h("button",{type:"button","aria-label":t("remove"),onclick:()=>{ v.splice(i,1); draw(); }},"×")))); };
      const inp = h("input",{class:"input",placeholder:"ກິນ, ດື່ມ, ສະບາຍດີ …",onkeydown:e=>{ if (e.key==="Enter"){ e.preventDefault(); e.target.value.split(/[,，\s]+/).map(s=>s.trim()).filter(Boolean).forEach(w=>{ if(!v.includes(w)) v.push(w); }); e.target.value=""; draw(); } }});
      loadDict().then(draw); draw();
      return fld(label, h("div",{class:"stack",style:"gap:8px"}, tags, inp), "Type a word and press Enter");
    }
    case "refs": case "ref": {
      const multi = f.type==="refs"; let v = get(); if (multi){ v = v || []; set(v); }
      const tags = h("div",{class:"refpick"}), sel = h("select",{class:"input"}, h("option",{value:""},t("select")));
      rows(f.to).then(list => { list.sort((a,b)=>(a.n??a.order??0)-(b.n??b.order??0)).forEach(d => sel.append(h("option",{value:f.num?d.n:d.id, selected: !multi && String(v)===String(f.num?d.n:d.id)}, (f.num?"#"+d.n+" ":d.id+" · ")+titleOf(f.to,d).slice(0,70)))); draw(); });
      const draw = () => { if (!multi) return; tags.innerHTML=""; const list = cache[f.to]||[];
        v.forEach((id,i) => { const d = list.find(x=>String(f.num?x.n:x.id)===String(id)); tags.append(h("span",{class:"tag"}, f.num?"#"+id+" ":"", d ? titleOf(f.to,d).slice(0,40) : String(id), h("button",{type:"button","aria-label":t("remove"),onclick:()=>{ v.splice(i,1); draw(); }},"×"))); }); };
      sel.addEventListener("change", () => { const val = f.num ? +sel.value : sel.value; if (!multi){ set(sel.value ? val : ""); return; } if (sel.value && !v.includes(val)) v.push(val); sel.value=""; draw(); });
      return fld(label, multi ? h("div",{class:"stack",style:"gap:8px"}, tags, sel) : sel, help);
    }
    case "stepref": {
      const inp = h("input",{class:"input mono",value:get()||"",list:"dl-"+Math.random().toString(36).slice(2),oninput:e=>set(e.target.value.split(" · ")[0])});
      const dl = h("datalist",{id:inp.getAttribute("list")});
      const fill = async () => { dl.innerHTML=""; const col = STEP_TYPE_TO_COL[obj.type]; if (obj.type==="page") APP_PAGES.forEach(([id,n])=>dl.append(h("option",{value:id},n))); else if (col) (await rows(col)).forEach(d=>dl.append(h("option",{value:(col==="patterns"?String(d.n):d.id)}, titleOf(col,d).slice(0,60)))); };
      inp.addEventListener("focus", fill);
      return fld(label, h("div",null, inp, dl), help);
    }
    case "object": {
      let v = get(); const box = h("div",{class:"listed-item"});
      const draw = () => { box.innerHTML=""; if (!v){ box.append(h("button",{class:"btn sm",type:"button",onclick:()=>{ v={}; set(v); draw(); }}, icon("plus"), t("add"))); return; }
        f.fields.forEach(x => box.append(renderField(x, v, type)));
        if (f.nullable) box.append(h("button",{class:"btn sm ghost",type:"button",style:"align-self:flex-start",onclick:()=>{ v=null; set(null); draw(); }}, icon("trash"), t("remove"))); };
      draw(); return fld(label, box, help);
    }
    case "sentence": {
      const v = obj; v.tr = v.tr || {};
      const pyIn = input(v.py, x=>v.py=x);
      const zhIn = input(v.zh, x=>{ v.zh=x; v.tokens=null; }, { cls:"hz", placeholder:"ຂ້ອຍຮຽນພາສາລາວທຸກມື້." });
      return h("div",{class:"stack",style:"gap:8px"},
        fld(L(["Lao","ພາສາລາວ"]), zhIn),
        fld(L(["Romanization (leave empty for automatic)","ຄຳອ່ານໂຣມັນ (ປ່ອຍວ່າງເພື່ອສ້າງອັດຕະໂນມັດ)"]), h("div",{class:"row",style:"flex-wrap:nowrap"}, pyIn, h("button",{class:"btn sm",type:"button",onclick:async()=>{ const e = await engine(); v.py = autoPinyin(e, v.zh||"").py; pyIn.value = v.py; }}, t("auto_pinyin")))),
        h("div",{class:"field-row"}, LANGS.map(([l,n]) => fld(n, input(v.tr[l], x=>v.tr[l]=x, { cls:l==="lo"?"lo":"" })))));
    }
    case "trgroup": {
      const v = get() || {}; set(v); let cur = "en";
      const body = h("div",{class:"stack"}), tabs = h("div",{class:"trtabs"});
      const draw = () => { tabs.innerHTML=""; LANGS.forEach(([l,n]) => { const filled = v[l] && Object.values(v[l]).some(x => Array.isArray(x) ? x.length : x); tabs.append(h("button",{type:"button","aria-pressed":String(cur===l),class:filled?"":"empty",onclick:()=>{ cur=l; draw(); }}, n)); });
        body.innerHTML=""; v[cur] = v[cur] || {}; f.fields.forEach(x => { const el = renderField(x, v[cur], type); if (cur==="lo") $$("input,textarea",el).forEach(i=>i.classList.add("lo")); body.append(el); }); };
      draw();
      return h("div",{class:"panel",style:"padding:14px"}, h("h3",null, label, tabs), body);
    }
    case "list": {
      const v = get() || []; set(v);
      const box = h("div",{class:"listed"});
      const draw = () => { box.innerHTML="";
        v.forEach((item,i) => {
          const head = h("div",{class:"listed-head"}, h("b",null, (L(f.itemLabel)||"")+" "+(i+1)+(f.summary && f.summary(item) ? " · "+f.summary(item).slice(0,50) : "")),
            h("div",{class:"row",style:"gap:2px"}, h("button",{class:"ib",type:"button","aria-label":t("move_up"),disabled:i===0,onclick:()=>{ [v[i-1],v[i]]=[v[i],v[i-1]]; draw(); }}, icon("left")), h("button",{class:"ib",type:"button","aria-label":t("move_down"),disabled:i===v.length-1,onclick:()=>{ [v[i+1],v[i]]=[v[i],v[i+1]]; draw(); }}, icon("right")), h("button",{class:"ib",type:"button","aria-label":t("remove"),onclick:()=>{ v.splice(i,1); draw(); }}, icon("trash"))));
          const el = h("div",{class:"listed-item"}, head); f.item.forEach(x => el.append(renderField(x, item, type))); box.append(el);
        });
        box.append(h("button",{class:"btn sm",type:"button",style:"align-self:flex-start",onclick:()=>{ v.push({}); draw(); }}, icon("plus"), t("add")+" "+(L(f.itemLabel)||"").toLowerCase()));
      };
      draw(); return h("div",{class:"field"}, h("span",{class:"lbl"},label), help ? h("span",{class:"help"},help) : null, box);
    }
    case "json": { const ta = h("textarea",{class:"input mono",style:"min-height:260px"}); ta.value = typeof get()==="string" ? get() : JSON.stringify(get(), null, 1); ta.addEventListener("input", () => set(ta.value)); return fld(label, ta, help); }
    case "audio": {
      const url = input(get(), set, { placeholder:"https://…/nihao.mp3" });
      const file = h("input",{type:"file",accept:"audio/*",onchange:async e=>{ const fl = e.target.files[0]; if (!fl) return; try { toast(t("importing")); const u = await S.api.storage.upload(fl, `audio/${Date.now()}-${fl.name.replace(/[^\w.\-]/g,"_")}`); set(u); url.value = u; toast(t("saved_ok")); } catch(err){ toast(errText(err),"err"); } }});
      return fld(label, h("div",{class:"stack",style:"gap:8px"}, h("label",{class:"btn sm",style:"align-self:flex-start"}, icon("upload"), t("upload_audio"), h("span",{hidden:true}, file)), h("span",{class:"help"}, t("or_url")), url,
        h("button",{class:"btn sm",type:"button",style:"align-self:flex-start",onclick:()=>{ if (obj.url) new Audio(obj.url).play().catch(e=>toast(errText(e),"err")); }}, icon("play"), t("play"))), "Uploads need Firebase Storage (Blaze plan). On the free plan, paste a link to an audio file hosted anywhere.");
    }
    case "questions": return questionsBuilder(obj, f.key);
  }
  return h("div",null,"?");
}

// ---------- previews & versions ----------
function previewPanel(type, draft){
  if (type==="patterns"){
    const out = h("div");
    return h("div",{class:"panel"}, h("h3",null,t("test_generate")), h("button",{class:"btn sm",onclick:async()=>{
      out.innerHTML=""; const e = await engine();
      for (const g of (draft.gen||[])){ if (!g.zh) continue;
        for (let k=0;k<2;k++){ try { const r = e.generate([g.zh, g.en||"", g.slots ? JSON.parse(g.slots) : undefined]); out.append(h("div",{class:"small",style:"padding:6px 0;border-top:1px solid var(--line)"}, h("div",{class:"hz",style:"font-size:1.05rem"},r.zh), h("div",{html:pyHTML(r.py)}), h("div",{class:"muted"},r.en))); } catch(err){ out.append(h("p",{class:"small",style:"color:var(--bad)"}, g.zh+" → "+err.message)); break; } } }
      if (!out.childElementCount) out.append(h("p",{class:"muted small"},t("no_rows")));
    }}, icon("spark"), t("generate")), out);
  }
  if (type==="quizzes") return h("div",{class:"panel"}, h("h3",null,t("preview")), h("button",{class:"btn sm",onclick:async()=>{ const c = await normalize(type, draft); const box = h("div",{class:"quiz"}); dialog({ title:t("preview"), wide:true, body:box }); runQuiz(box, c.questions||[], {}); }}, icon("eye"), t("preview")));
  if (["dialogues","grammar","vocabulary"].includes(type)) return h("div",{class:"panel"}, h("h3",null,t("preview")), h("button",{class:"btn sm",onclick:async()=>{ const c = await normalize(type, draft); const box = h("div"); (c.lines||c.examples||[]).forEach(sn => box.append(sentenceEl(sn,{ speaker:sn.speaker, noSave:true }))); dialog({ title:t("preview"), wide:true, body: box.childElementCount ? box : h("p",{class:"muted"},t("no_rows")) }); }}, icon("eye"), t("preview")));
  return null;
}
function versionsPanel(type, id, onRestore){
  const list = h("div",{class:"feed"}, h("p",{class:"muted small"},t("loading")));
  listVersions(S.api, type, id).then(vs => { list.innerHTML=""; if (!vs.length) list.append(h("p",{class:"muted small"},t("no_rows")));
    vs.forEach(v => list.append(h("div",{class:"feed-row"}, h("span",{class:"small"}, "v"+v.version+" · "+fmtDate(v.savedAt, lang(), true)), h("button",{class:"btn sm ghost",onclick:()=>onRestore(Object.assign({version:v.version}, v.data))}, t("restore"))))); }).catch(()=>{ list.innerHTML=""; });
  return h("details",{class:"panel"}, h("summary",null, h("b",null, icon("history"), " ", t("versions"))), list);
}

// ---------- quiz builder ----------
const QLABEL = { mc:"Multiple choice", fill:"Fill the blank", order:"Arrange words", match:"Match pairs", type:"Type the answer", listen_select:"Listen & choose", listen_type:"Listen & type", tone:"Identify the tone", speak:"Speak (pronunciation)", write_char:"Write the character", flashcard:"Flashcard" };
function questionsBuilder(obj, key){
  const v = obj[key] = obj[key] || [];
  const box = h("div",{class:"listed"});
  const draw = () => {
    box.innerHTML = "";
    v.forEach((q,i) => {
      const item = h("div",{class:"listed-item"});
      const typeSel = h("select",{class:"input",style:"width:auto",onchange:e=>{ q.type=e.target.value; q.skill = QTYPE_SKILL[q.type]; draw(); }}, QTYPES.map(x=>h("option",{value:x,selected:q.type===x},QLABEL[x])));
      item.append(h("div",{class:"listed-head"}, h("div",{class:"row"}, h("b",null,"Q"+(i+1)), typeSel),
        h("div",{class:"row",style:"gap:2px"},
          h("button",{class:"ib",type:"button","aria-label":t("preview"),onclick:()=>{ const b=h("div",{class:"quiz"}); dialog({title:t("preview"),wide:true,body:b}); normalize("quizzes",{questions:[q]}).then(c=>runQuiz(b,c.questions,{})); }}, icon("eye")),
          h("button",{class:"ib",type:"button","aria-label":t("move_up"),disabled:i===0,onclick:()=>{ [v[i-1],v[i]]=[v[i],v[i-1]]; draw(); }}, icon("left")),
          h("button",{class:"ib",type:"button","aria-label":t("move_down"),disabled:i===v.length-1,onclick:()=>{ [v[i+1],v[i]]=[v[i],v[i+1]]; draw(); }}, icon("right")),
          h("button",{class:"ib",type:"button","aria-label":t("remove"),onclick:()=>{ v.splice(i,1); draw(); }}, icon("trash")))));
      item.append(h("div",{class:"field-row"},
        fld(t("skill"), h("select",{class:"input",onchange:e=>q.skill=e.target.value}, SKILLS.map(s=>h("option",{value:s,selected:(q.skill||QTYPE_SKILL[q.type])===s},t("sk_"+s))))),
        fld(t("difficulty"), h("select",{class:"input",onchange:e=>q.difficulty=+e.target.value}, [1,2,3].map(n=>h("option",{value:n,selected:(q.difficulty||1)===n},"★".repeat(n)))))));
      q.ask = q.ask || {}; item.append(renderField({ key:"ask", type:"tr", label:["Instruction shown to the learner","ຄຳແນະນຳສຳລັບຜູ້ຮຽນ"] }, q));
      q.prompt = q.prompt || {};
      const needsZh = ["mc","fill","listen_select","listen_type","tone","speak","write_char","flashcard","type"].includes(q.type);
      if (needsZh) item.append(h("div",{class:"field-row"},
        fld(L(["Lao prompt","ຄຳຖາມພາສາລາວ"])+(q.type==="fill"?" (use ___ for the blank)":""), h("input",{class:"input hz",value:q.prompt.zh||"",oninput:e=>{ q.prompt.zh=e.target.value; q.prompt.py=""; }})),
        fld(L(["Romanization (auto if empty)","ຄຳອ່ານໂຣມັນ (ອັດຕະໂນມັດຖ້າວ່າງ)"]), h("input",{class:"input",value:q.prompt.py||"",oninput:e=>q.prompt.py=e.target.value}))));
      if (["mc","type","fill"].includes(q.type)){ q.prompt.tr = q.prompt.tr || {}; item.append(renderField({ key:"tr", type:"tr", label:["Prompt translation (optional; shown when there's no Lao text)","ຄຳແປຂອງຄຳຖາມ"] }, q.prompt)); }
      if (["mc","fill","listen_select"].includes(q.type)){
        q.options = q.options || [{},{},{},{}]; if (q.answer==null) q.answer = 0;
        const ob = h("div",{class:"stack",style:"gap:6px"});
        const drawOpts = () => { ob.innerHTML="";
          q.options.forEach((o,k) => { if (typeof o==="string") o = q.options[k] = { zh:o };
            ob.append(h("div",{class:"row",style:"flex-wrap:nowrap;align-items:flex-end"},
              h("label",{class:"row small",style:"flex:none"}, h("input",{type:"radio",name:"ans"+i+Math.random(),checked:q.answer===k,onchange:()=>q.answer=k}), "✓"),
              h("input",{class:"input hz",placeholder:"ລາວ (Lao)",value:o.zh||"",oninput:e=>o.zh=e.target.value}),
              q.type==="listen_select" ? null : h("input",{class:"input",placeholder:"English",value:o.en||"",oninput:e=>o.en=e.target.value}),
              q.type==="listen_select" ? null : h("input",{class:"input lo",placeholder:"ລາວ",value:o.lo||"",oninput:e=>o.lo=e.target.value}),
              h("button",{class:"ib",type:"button","aria-label":t("remove"),onclick:()=>{ q.options.splice(k,1); if (q.answer>=q.options.length) q.answer=0; drawOpts(); }}, icon("x")))); });
          ob.append(h("button",{class:"btn sm",type:"button",style:"align-self:flex-start",onclick:()=>{ q.options.push({}); drawOpts(); }}, icon("plus"), t("add"))); };
        drawOpts(); item.append(fld(L(["Options (tick the correct one; use Lao or a translation)","ຕົວເລືອກ (ໝາຍອັນທີ່ຖືກ)"]), ob));
      }
      if (q.type==="order") item.append(fld(L(["Words in the correct order, separated by spaces","ຄຳຕາມລຳດັບທີ່ຖືກ ແຍກດ້ວຍຍະຫວ່າງ"]), h("input",{class:"input hz",value:(q.tokens||[]).join(" "),placeholder:"ຂ້ອຍ ຮຽນ ພາສາ ລາວ",oninput:e=>{ q.tokens = e.target.value.split(/\s+/).filter(Boolean); q.answer = q.tokens.join(""); }})));
      if (q.type==="match"){
        q.pairs = q.pairs || [{a:"",b:{}},{a:"",b:{}},{a:"",b:{}}];
        const pb = h("div",{class:"stack",style:"gap:6px"});
        const drawP = () => { pb.innerHTML=""; q.pairs.forEach((p,k) => { if (typeof p.b==="string") p.b = { en:p.b };
          pb.append(h("div",{class:"row",style:"flex-wrap:nowrap"}, h("input",{class:"input hz",placeholder:"ລາວ (Lao)",value:p.a||"",oninput:e=>p.a=e.target.value}), h("input",{class:"input",placeholder:"English",value:p.b.en||"",oninput:e=>p.b.en=e.target.value}), h("input",{class:"input lo",placeholder:"ລາວ",value:p.b.lo||"",oninput:e=>p.b.lo=e.target.value}), h("button",{class:"ib",type:"button",onclick:()=>{ q.pairs.splice(k,1); drawP(); }}, icon("x")))); });
          pb.append(h("button",{class:"btn sm",type:"button",style:"align-self:flex-start",onclick:()=>{ q.pairs.push({a:"",b:{}}); drawP(); }}, icon("plus"), t("add"))); };
        drawP(); item.append(fld(L(["Pairs","ຄູ່"]), pb));
      }
      if (["type","listen_type"].includes(q.type)) item.append(h("div",{class:"field-row"},
        fld(L(["Accepted answers (one per line)","ຄຳຕອບທີ່ຍອມຮັບ (ແຖວລະອັນ)"]), h("textarea",{class:"input",value:(q.accept||[]).join("\n"),oninput:e=>q.accept=e.target.value.split("\n").map(s=>s.trim()).filter(Boolean)})),
        fld(L(["Checking","ວິທີກວດ"]), h("select",{class:"input",onchange:e=>q.mode=e.target.value}, [["pinyin","Romanization (tones optional)"],["script","Lao script (exact)"],["text","Text"]].map(([k,n])=>h("option",{value:k,selected:(q.mode||"script")===k||q.mode==="hanzi"},n))))));
      if (q.type==="tone") item.append(fld(L(["Correct tone (1-6)","ວັນນະຍຸດທີ່ຖືກ (1-6)"]), h("select",{class:"input",style:"width:auto",onchange:e=>q.answer=+e.target.value}, [1,2,3,4,5,6].map(n=>h("option",{value:n,selected:+q.answer===n},"Tone "+n)))));
      if (q.type==="flashcard"){ q.back = q.back || {}; item.append(renderField({ key:"back", type:"tr", label:["Back of the card","ດ້ານຫຼັງບັດ"] }, q)); }
      q.explain = q.explain || {}; item.append(renderField({ key:"explain", type:"tr", label:["Explanation after answering (optional)","ຄຳອະທິບາຍຫຼັງຕອບ"] }, q));
      box.append(item);
    });
    box.append(h("button",{class:"btn",type:"button",style:"align-self:flex-start",onclick:()=>{ v.push({ type:"mc", skill:"reading", options:[{},{},{},{}], answer:0 }); draw(); }}, icon("plus"), t("add_question")));
  };
  draw();
  return h("div",{class:"field"}, h("span",{class:"lbl"}, t("questions")+" ("+v.length+")"), box);
}
// widgets need an explanation language in the admin preview
ctx.exp = () => lang();
