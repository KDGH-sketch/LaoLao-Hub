// Plans (what an account can access)
import { h, icon, toast, dialog, confirmDialog, errText } from "../shared/ui.js";
import { lang } from "../shared/i18n.js";
import { S, t, go, isSuper, refreshPlans, planName, fld, markUnpublished, lockedScreen } from "./state.js";

export async function viewPlans(){
  if (!isSuper()) {
    return lockedScreen(t("only_super"), t("credential_menu_restricted"));
  }
  await refreshPlans();
  const access = await S.api.db.list("access").catch(()=>[]);
  const count = id => access.filter(a=>a.planId===id && a.status==="active" && (a.expiresAt==null||a.expiresAt>Date.now())).length;
  const wrap = h("div");
  wrap.append(h("div",{class:"pagehead"}, h("div",{class:"spread"}, h("h1",null,t("adm_plans")), isSuper() ? h("button",{class:"btn primary",onclick:()=>editPlan(null)}, icon("plus"), t("new_item")) : null), h("p",null,t("plan_tier_d"))),
    h("div",{class:"grid3"}, S.plans.map(p => h("div",{class:"panel"},
      h("div",{class:"spread"}, h("h2",null, planName(p.id)), h("span",{class:"chip lv"},"tier "+p.tier)),
      h("p",{class:"small"}, p.entitlements ? t("am_configured", { n: Object.values(p.entitlements).filter(v=>v===true).length, l: Object.keys(p.limits||{}).length }) : t("am_all_long"),
        " ", h("button",{class:"linkbtn small",onclick:()=>go("accessMatrix")}, t("am_title")+" →")),
      h("ul",{class:"obj"}, ((p.features && (p.features[lang()]||p.features.en))||[]).map(f=>h("li",null,f))),
      h("p",{class:"small muted"}, (p.durationDays? p.durationDays+" "+t("days") : t("never"))+" · "+(p.price? p.price+" "+(p.currency||"") : "—")+" · "+count(p.id)+" "+t("active_learners").toLowerCase()),
      p.active===false ? h("span",{class:"pill archived"},"inactive") : null,
      isSuper() ? h("div",{class:"row"}, h("button",{class:"btn sm",onclick:()=>editPlan(p)}, icon("edit"), t("edit")),
        h("button",{class:"btn sm ghost",onclick:async()=>{ if(count(p.id)){ toast("Learners still use this plan.","err"); return; } if(await confirmDialog(t("delete_item"),planName(p.id),t("delete_item"),t("cancel"),true)){ await S.api.db.del(`plans/${p.id}`); S.render(); } }}, t("delete_item"))) : null))),
    h("p",{class:"small muted",style:"margin-top:16px"}, t("payments_note")));
  return wrap;
}

async function editPlan(p){
  const isNew = !p; p = p || { name:{en:"",lo:"",zh:""}, tier:2, durationDays:365, price:0, currency:"LAK", features:{en:[],lo:[],zh:[]}, active:true, order:S.plans.length+1 };
  const id = h("input",{class:"input mono",value:p.id||"",disabled:!isNew,placeholder:"gold"});
  const nm = ["en","lo","zh"].map(l => h("input",{class:"input"+(l==="lo"?" lo":""),value:(p.name||{})[l]||"",placeholder:l.toUpperCase()}));
  const tier = h("input",{class:"input",type:"number",min:"1",max:"50",value:p.tier});
  const dur = h("input",{class:"input",type:"number",min:"0",value:p.durationDays||0});
  const price = h("input",{class:"input",type:"number",min:"0",value:p.price||0}), cur = h("input",{class:"input",value:p.currency||"LAK"});
  const order = h("input",{class:"input",type:"number",value:p.order||0});
  const feats = ["en","lo","zh"].map(l => h("textarea",{class:"input"+(l==="lo"?" lo":""),placeholder:l.toUpperCase(),value:((p.features||{})[l]||[]).join("\n")}));
  const active = h("input",{type:"checkbox",checked:p.active!==false});
  const desc = ["en","lo","zh"].map(l => h("input",{class:"input"+(l==="lo"?" lo":""),value:(p.description||{})[l]||"",placeholder:l.toUpperCase()}));
  const badge = ["en","lo","zh"].map(l => h("input",{class:"input"+(l==="lo"?" lo":""),value:(p.badge||{})[l]||"",placeholder:l.toUpperCase()}));
  const bill = h("select",{class:"input"}, [["",t("pl_bill_none")],["month",t("ac_bill_month")],["year",t("ac_bill_year")],["once",t("ac_bill_once")]].map(([v,l])=>h("option",{value:v,selected:(p.billingPeriod||"")===v},l)));
  const trial = h("input",{class:"input",type:"number",min:"0",value:p.trialDays||0}), grace = h("input",{class:"input",type:"number",min:"0",value:p.graceDays||0});
  const msg = h("p",{class:"small",style:"color:var(--bad)"});
  await dialog({ title: isNew ? t("new_item") : planName(p.id), wide:true, body:h("div",{class:"stack"},
      fld(t("id_f"), id, t("id_d")), fld(t("name")+" (EN / ລາວ / 中文)", h("div",{class:"field-row"}, nm)),
      h("div",{class:"field-row"}, fld(t("tier"),tier), fld(t("duration"),dur), fld(t("price"),price), fld("Currency",cur), fld(t("order"),order)),
      fld(t("pl_desc")+" (EN / ລາວ / 中文)", h("div",{class:"field-row"}, desc)), fld(t("pl_badge")+" (EN / ລາວ / 中文)", h("div",{class:"field-row"}, badge), t("pl_badge_d")),
      h("div",{class:"field-row"}, fld(t("pl_bill"),bill), fld(t("pl_trial"),trial, t("pl_trial_d")), fld(t("pl_grace"),grace, t("pl_grace_d"))),
      fld(t("features")+" (EN / ລາວ / 中文)", h("div",{class:"field-row"}, feats), t("pl_features_d")), h("label",{class:"row"}, active, "Active"), h("p",{class:"small muted"},t("plan_tier_d")), msg),
    actions:[{label:t("cancel"),value:false},{label:t("save"),primary:true,onClick:async()=>{
      const pid = (isNew ? id.value.trim().toLowerCase() : p.id).replace(/[^a-z0-9-]/g,"");
      if (!pid){ msg.textContent = t("id_f")+"?"; return false; }
      const data = { name:{en:nm[0].value.trim(),lo:nm[1].value.trim(),zh:nm[2].value.trim()}, tier:Math.max(1,+tier.value||1), durationDays:+dur.value||0, price:+price.value||0, currency:cur.value.trim(),
        features:{en:feats[0].value.split("\n").map(s=>s.trim()).filter(Boolean),lo:feats[1].value.split("\n").map(s=>s.trim()).filter(Boolean),zh:feats[2].value.split("\n").map(s=>s.trim()).filter(Boolean)}, active:active.checked, order:+order.value||0,
        description:{en:desc[0].value.trim(),lo:desc[1].value.trim(),zh:desc[2].value.trim()}, badge:{en:badge[0].value.trim(),lo:badge[1].value.trim(),zh:badge[2].value.trim()},
        billingPeriod:bill.value, trialDays:Math.max(0,+trial.value||0), graceDays:Math.max(0,+grace.value||0) };
      // merge on edit, so the features & limits set in the Access matrix are kept
      try { await S.api.db.set(`plans/${pid}`, data, !isNew); await S.api.db.set("settings/bundle",{dirty:true},true); markUnpublished(); toast(t("saved_ok")); S.render(); return true; } catch(e){ msg.textContent = errText(e); return false; }
    }}] });
}
