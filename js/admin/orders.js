// Learner plan-upgrade payment requests: review proof of payment, approve (grants access) or reject.
import { h, icon, toast, dialog, fmtDate, errText } from "../shared/ui.js";
import { lang } from "../shared/i18n.js";
import { S, t, canSupport, planName, fld } from "./state.js";

const STATUS_PILL = { pending:"draft", approved:"published", rejected:"expired" };
const pill = o => h("span",{class:"pill "+(STATUS_PILL[o.status]||"draft")}, t("order_status_"+(o.status||"pending")));

export async function viewOrders(){
  if (!canSupport()) {
    return h("div", { class: "panel stack", style: "text-align:center;padding:48px 24px;max-width:540px;margin:40px auto" },
      h("div", { style: "font-size:3rem;margin-bottom:8px" }, "🔒"),
      h("h2", null, t("only_super")),
      h("p", { class: "muted" }, t("credential_menu_restricted")));
  }

  const [orders, users] = await Promise.all([
    S.api.db.list("orders").catch(()=>[]),
    S.api.db.list("users").catch(()=>[])
  ]);
  orders.sort((a,b)=>(b.createdAt||0)-(a.createdAt||0));
  const userMap = Object.fromEntries(users.map(u=>[u.id,u]));
  const pendingCount = orders.filter(o=>o.status==="pending").length;

  const wrap = h("div",{class:"stack-l"});
  wrap.append(h("div",{class:"pagehead"},
    h("h1",null, t("adm_orders")+(pendingCount ? " ("+pendingCount+" "+t("order_status_pending").toLowerCase()+")" : "")),
    h("p",null, t("payments_note"))));

  const body = h("tbody");
  orders.forEach(o => {
    const u = userMap[o.uid] || {};
    body.append(h("tr",{onclick:()=>openDecision(o,u)},
      h("td",null, h("div",{style:"font-weight:600"}, u.name||o.email||o.uid), h("div",{class:"small mono muted"}, o.email||u.email||"")),
      h("td",null, planName(o.planId)),
      h("td",null, o.amount!=null ? o.amount+" "+(o.currency||"") : "—"),
      h("td",null, pill(o)),
      h("td",{class:"small muted"}, fmtDate(o.createdAt, lang(), true))));
  });
  if (!orders.length) body.append(h("tr",null,h("td",{colspan:"5",class:"muted",style:"text-align:center;padding:32px"},t("no_rows"))));

  wrap.append(h("section",{class:"panel"}, h("div",{class:"tbl-wrap"}, h("table",{class:"tbl"},
    h("thead",null, h("tr",null, [t("learner"),t("requested_plan"),t("amount"),t("status"),"Requested"].map(x=>h("th",null,x)))),
    body))));
  return wrap;
}

async function openDecision(o, u){
  const title = planName(o.planId)+" · "+(u.name||o.email||o.uid);
  const proof = o.proofUrl
    ? h("a",{href:o.proofUrl,target:"_blank",rel:"noopener"}, h("img",{src:o.proofUrl,style:"max-width:100%;border-radius:10px;border:1px solid var(--line)"}))
    : h("p",{class:"muted small"}, "—");

  if (o.status !== "pending"){
    await dialog({ title, body: h("div",{class:"stack"},
      h("div",{class:"row"}, pill(o), o.decidedAt ? h("span",{class:"small muted"}, fmtDate(o.decidedAt, lang(), true)) : null),
      o.decisionNote ? h("p",{class:"small muted"}, t("decision_note")+": "+o.decisionNote) : null,
      proof) });
    return;
  }

  const note = h("textarea",{class:"input",placeholder:t("reject_reason_ph")});
  const errBox = h("p",{class:"small",style:"color:var(--bad)"});
  await dialog({ title, wide:true, body: h("div",{class:"stack"},
      h("p",null, t("requested_plan")+": "+planName(o.planId)+(o.amount!=null?" · "+o.amount+" "+(o.currency||""):"")),
      proof,
      fld(t("decision_note"), note),
      errBox),
    actions:[
      { label:t("cancel"), value:false },
      { label:t("reject"), danger:true, onClick: async ()=>{ try { await decide(o,"rejected",note.value.trim()); return true; } catch(e){ errBox.textContent = errText(e); return false; } } },
      { label:t("approve"), primary:true, onClick: async ()=>{ try { await decide(o,"approved",note.value.trim()); return true; } catch(e){ errBox.textContent = errText(e); return false; } } }
    ] });
}

async function decide(o, status, note){
  const now = new Date();
  if (status === "approved"){
    const plan = S.plans.find(p=>p.id===o.planId) || { tier:1 };
    const expiresAt = plan.durationDays ? new Date(Date.now()+plan.durationDays*86400000) : null;
    await S.api.db.batch([
      { op:"set", path:`access/${o.uid}`, data:{ planId:o.planId, tier:plan.tier||1, status:"active", start:now, expiresAt, source:"payment", orderId:o.id, updatedAt:now, updatedBy:S.me.uid } },
      { op:"set", path:`subscriptions/${o.uid}-${now.getTime()}`, data:{ uid:o.uid, planId:o.planId, action:"assign", start:now, expiresAt, by:S.me.uid, at:now, source:"payment", orderId:o.id } },
      { op:"update", path:`orders/${o.id}`, data:{ status:"approved", decidedAt:now, decidedBy:S.me.uid, decisionNote:note } }
    ]);
    await S.api.db.add("activity", { uid:S.me.uid, name:S.me.name||S.me.email, type:"order_approve", ref:(o.email||o.uid)+" -> "+o.planId, at:now }).catch(()=>{});
  } else {
    await S.api.db.update(`orders/${o.id}`, { status:"rejected", decidedAt:now, decidedBy:S.me.uid, decisionNote:note });
    await S.api.db.add("activity", { uid:S.me.uid, name:S.me.name||S.me.email, type:"order_reject", ref:(o.email||o.uid)+" -> "+o.planId, at:now }).catch(()=>{});
  }
  toast(t("saved_ok"), "ok");
  S.render();
}
