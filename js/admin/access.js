// Access matrix (which plan includes which feature, and usage limits) and Access logs (refused attempts, limits reached).
// The feature list is js/shared/features.js; the rules are applied by ll_resolve()/ll_use() in the database. See docs/ACCESS.md.
import { h, icon, toast, confirmDialog, fmtDate, errText, tr } from "../shared/ui.js";
import { lang } from "../shared/i18n.js";
import { FEATURES, FEATURE_GROUPS, PERIODS, RECOMMENDED, featureByKey } from "../shared/features.js";
import { DEFAULT_TZ } from "../shared/access.js";
import { S, t, go, isSuper, canSupport, refreshPlans, planName } from "./state.js";

const L = obj => tr(obj, lang());
const fName = f => featureByKey[f] ? L(featureByKey[f].label) : f;
const configured = p => p.entitlements && typeof p.entitlements === "object" && !Array.isArray(p.entitlements);

// ---------- matrix ----------
export async function viewAccessMatrix(){
  await refreshPlans();
  const settings = await S.api.db.get("settings/app").catch(() => null) || {};
  const plans = S.plans.slice().sort((a, b) => ((a.tier||1) - (b.tier||1)) || ((a.order||0) - (b.order||0)));
  // working copy: a plan without entitlements behaves as "every feature, no limits"
  const draft = Object.fromEntries(plans.map(p => [p.id, {
    on: configured(p) ? Object.assign({}, p.entitlements) : Object.fromEntries(FEATURES.map(f => [f.key, true])),
    limits: JSON.parse(JSON.stringify(p.limits || {})), touched: false }]));
  let off = new Set(Array.isArray(settings.disabledFeatures) ? settings.disabledFeatures : []);
  const tz = h("input",{class:"input",value:settings.timezone || DEFAULT_TZ,style:"max-width:220px","aria-label":t("am_tz")});
  const editable = isSuper();

  const cell = (p, f) => {
    const d = draft[p.id];
    const cb = h("input",{type:"checkbox",checked:d.on[f.key] === true,disabled:!editable,"aria-label":planName(p.id)+" · "+fName(f.key),
      onchange:e => { d.on[f.key] = e.target.checked; d.touched = true; lim.disabled = per.disabled = !e.target.checked || !editable; }});
    const l = d.limits[f.key] || {};
    const lim = h("input",{class:"input am-n",type:"number",min:"0",placeholder:"∞",value:l.n ?? "",disabled:!editable || d.on[f.key] !== true,"aria-label":t("am_limit"),
      oninput:e => { const v = e.target.value.trim(); if (v === "") delete d.limits[f.key]; else d.limits[f.key] = { n: Math.max(0, Math.floor(+v)), per: per.value }; d.touched = true; }});
    const per = h("select",{class:"input am-per",disabled:!editable || d.on[f.key] !== true,"aria-label":t("am_period"),
      onchange:e => { if (d.limits[f.key]) d.limits[f.key].per = e.target.value; d.touched = true; }},
      PERIODS.map(x => h("option",{value:x,selected:(l.per||"day") === x}, t("am_per_"+x))));
    return h("td",{class:"am-cell"}, h("label",{class:"am-on"}, cb), f.limitable ? h("div",{class:"am-lim"}, lim, per) : null);
  };
  const head = h("tr",null, h("th",null,t("am_feature")),
    plans.map(p => h("th",null, h("div",null, planName(p.id)), h("div",{class:"small muted",style:"text-transform:none;letter-spacing:0"}, "tier "+(p.tier||1)+(configured(p) ? "" : " · "+t("am_all"))))),
    h("th",{title:t("am_off_d")}, t("am_off")));
  const body = h("tbody");
  FEATURE_GROUPS.forEach(([g, gl]) => {
    body.append(h("tr",{class:"am-group"}, h("td",{colspan:String(plans.length + 2)}, L(gl))));
    FEATURES.filter(f => f.group === g).forEach(f => body.append(h("tr",null,
      h("td",null, h("b",null, fName(f.key)), h("div",{class:"small muted"}, L(f.desc)), h("code",{class:"small muted"}, f.key)),
      plans.map(p => cell(p, f)),
      h("td",{class:"am-cell"}, h("input",{type:"checkbox",checked:off.has(f.key),disabled:!editable,"aria-label":t("am_off")+" · "+fName(f.key),
        onchange:e => { e.target.checked ? off.add(f.key) : off.delete(f.key); }})))));
  });

  const save = async () => {
    try {
      for (const p of plans){ const d = draft[p.id]; if (!d.touched) continue;
        const ent = Object.fromEntries(FEATURES.map(f => [f.key, d.on[f.key] === true]));
        const limits = Object.fromEntries(Object.entries(d.limits).filter(([k, v]) => ent[k] && v && v.n !== "" && v.n != null));
        await S.api.db.update(`plans/${p.id}`, { entitlements: ent, limits, accessUpdatedAt: new Date(), accessUpdatedBy: S.me.uid }); }
      await S.api.db.set("settings/app", { disabledFeatures: [...off], timezone: tz.value.trim() || DEFAULT_TZ }, true);
      toast(t("saved_ok")); S.render();
    } catch(e){ toast(errText(e), "err"); }
  };
  const applyDefaults = async () => {
    const ids = plans.map(p => p.id).filter(id => RECOMMENDED[id]);
    if (!ids.length){ toast(t("am_no_defaults"), "err"); return; }
    if (!await confirmDialog(t("am_defaults"), t("am_defaults_d", { p: ids.map(planName).join(", ") }), t("am_defaults"), t("cancel"))) return;
    try {
      for (const id of ids) await S.api.db.update(`plans/${id}`, { entitlements: RECOMMENDED[id].entitlements, limits: RECOMMENDED[id].limits, accessUpdatedAt: new Date(), accessUpdatedBy: S.me.uid });
      toast(t("saved_ok")); S.render();
    } catch(e){ toast(errText(e), "err"); }
  };
  const resetPlan = async p => {
    if (!await confirmDialog(t("am_reset"), t("am_reset_d", { p: planName(p.id) }), t("am_reset"), t("cancel"), true)) return;
    try { await S.api.db.update(`plans/${p.id}`, { entitlements: S.api.db.delField(), limits: S.api.db.delField() }); toast(t("saved_ok")); S.render(); }
    catch(e){ toast(errText(e), "err"); }
  };

  return h("div",{class:"stack-l"},
    h("div",{class:"pagehead"}, h("div",{class:"spread"}, h("h1",null,t("am_title")),
      editable ? h("div",{class:"row"}, h("button",{class:"btn",onclick:applyDefaults}, icon("spark"), t("am_defaults")), h("button",{class:"btn primary",onclick:save}, icon("check"), t("save"))) : null),
      h("p",null,t("am_sub"))),
    h("div",{class:"notice"}, icon("info"), h("span",null, t("am_note"))),
    h("div",{class:"tbl-wrap"}, h("table",{class:"tbl am-tbl"}, h("thead",null,head), body)),
    h("section",{class:"panel stack"}, h("h3",null,t("am_tz")), h("p",{class:"small muted"},t("am_tz_d")), tz,
      editable ? h("div",{class:"row"}, plans.filter(configured).map(p => h("button",{class:"btn sm ghost",onclick:()=>resetPlan(p)}, t("am_reset")+": "+planName(p.id)))) : null));
}

// ---------- logs ----------
export async function viewAccessLogs(p = {}){
  const [rows, users] = await Promise.all([
    S.api.db.list("accessLogs", { orderBy:["at","desc"], limit:400 }).catch(() => []),
    S.api.db.list("users", { where:[["role","==","learner"]] }).catch(() => []) ]);
  const who = Object.fromEntries(users.map(u => [u.id, u]));
  let q = p.q || "", ff = "", fr = "";
  const body = h("tbody");
  const draw = () => {
    body.innerHTML = "";
    const f = q.trim().toLowerCase();
    const list = rows.filter(r => (!ff || r.feature === ff) && (!fr || r.reason === fr)
      && (!f || ((who[r.uid] && ((who[r.uid].email||"") + " " + (who[r.uid].name||"")).toLowerCase().includes(f)) || String(r.uid).includes(f))));
    list.forEach(r => body.append(h("tr",{onclick:()=>{ if (who[r.uid]) go("learner",{ uid:r.uid }); }},
      h("td",{class:"small tabnum"}, fmtDate(r.at, lang(), true)),
      h("td",null, who[r.uid] ? h("div",null, h("b",null, who[r.uid].name||"—"), h("div",{class:"small muted"}, who[r.uid].email)) : h("code",{class:"small"}, r.uid)),
      h("td",null, fName(r.feature)), h("td",null, planName(r.plan)),
      h("td",null, h("span",{class:"pill "+(r.reason === "limit_reached" ? "expired" : "suspended")}, t("rs_"+r.reason) !== "rs_"+r.reason ? t("rs_"+r.reason) : r.reason)),
      h("td",{class:"tabnum small"}, r.limit != null ? (r.used ?? 0)+" / "+r.limit : "—"))));
    if (!list.length) body.append(h("tr",null, h("td",{colspan:"6",class:"muted"}, t("no_rows"))));
  };
  const reasons = [...new Set(rows.map(r => r.reason).filter(Boolean))];
  const wrap = h("div",{class:"stack-l"},
    h("div",{class:"pagehead"}, h("h1",null,t("al_title")+" ("+rows.length+")"), h("p",null,t("al_sub"))),
    h("div",{class:"toolbar"},
      h("input",{class:"input grow",placeholder:t("search_learners"),value:q,oninput:e=>{ q = e.target.value; draw(); }}),
      h("select",{class:"input","aria-label":t("am_feature"),onchange:e=>{ ff = e.target.value; draw(); }}, h("option",{value:""}, t("am_feature")+": "+t("all")), FEATURES.map(f => h("option",{value:f.key}, fName(f.key)))),
      h("select",{class:"input","aria-label":t("al_reason"),onchange:e=>{ fr = e.target.value; draw(); }}, h("option",{value:""}, t("al_reason")+": "+t("all")), reasons.map(r => h("option",{value:r}, t("rs_"+r) !== "rs_"+r ? t("rs_"+r) : r)))),
    h("div",{class:"tbl-wrap"}, h("table",{class:"tbl"}, h("thead",null, h("tr",null, [t("al_time"),t("learner"),t("am_feature"),t("plan"),t("al_reason"),t("am_limit")].map(x => h("th",null,x)))), body)),
    canSupport() ? null : h("p",{class:"small muted"}, t("only_super")));
  draw();
  return wrap;
}

// ---------- per-learner: personal grants and current usage (learner page) ----------
export async function learnerAccessPanel(uid, access, setAccess){
  const usage = await S.api.db.list("usage", { where:[["uid","==",uid]] }).catch(() => []);
  const grants = new Set((access && Array.isArray(access.grants)) ? access.grants : []);
  const box = h("section",{class:"panel stack"}, h("h3",null,t("am_overrides")), h("p",{class:"small muted"}, t("am_overrides_d")));
  if (canSupport()){
    const list = h("div",{class:"am-grants"}, FEATURES.map(f => h("label",{class:"row small"},
      h("input",{type:"checkbox",checked:grants.has(f.key),onchange:e=>{ e.target.checked ? grants.add(f.key) : grants.delete(f.key); }}), fName(f.key))));
    box.append(h("details",null, h("summary",{class:"small"}, t("am_overrides")+" ("+grants.size+")"), list,
      h("button",{class:"btn sm primary",style:"margin-top:8px",disabled:!access,onclick:()=>setAccess({ grants:[...grants] }, "grant")}, t("save"))));
    if (!access) box.append(h("p",{class:"small muted"}, t("am_need_plan")));
  } else if (grants.size) box.append(h("p",{class:"small"}, [...grants].map(fName).join(", ")));
  const now = Date.now(), cur = usage.filter(u => u.resetAt == null || u.resetAt > now).sort((a, b) => (b.updatedAt||0) - (a.updatedAt||0));
  box.append(h("h3",{style:"margin-top:8px"}, t("ac_usage")),
    cur.length ? h("div",{class:"feed"}, cur.map(u => h("div",{class:"feed-row"},
      h("span",{class:"small"}, fName(u.feature)+" · "+(u.n||0)+" / "+(u.limit ?? "∞")+" · "+t("am_per_"+(u.per||"day"))),
      h("span",{class:"row",style:"gap:6px"}, h("span",{class:"small muted"}, u.resetAt ? t("ac_resets",{ d:fmtDate(u.resetAt, lang(), true) }) : ""),
        isSuper() ? h("button",{class:"btn sm ghost",onclick:async()=>{ if (await confirmDialog(t("am_reset_usage"), fName(u.feature), t("am_reset_usage"), t("cancel"), true)){ await S.api.db.del(`usage/${u.id}`); S.render(); } }}, t("am_reset_usage")) : null))))
      : h("p",{class:"small muted"}, t("no_rows")));
  return box;
}
