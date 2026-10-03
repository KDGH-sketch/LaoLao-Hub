// Plan upgrade / purchase flow: manual QR-transfer request + admin approval (see docs/PAYMENTS.md step 1).
// No payment gateway is wired up here -- the learner uploads proof of a bank transfer and an admin
// approves it in Admin -> Payment Requests, which grants access the same way a manual assignment does.
import { h, icon, toast, dialog, errText, tr } from "../shared/ui.js";
import { t, lang } from "../shared/i18n.js";
import { A, tierName } from "./core.js";

export async function fetchMyPendingOrder(){
  try {
    const rows = await A.api.db.list("orders", { where:[["uid","==",A.user.uid]] });
    return rows.filter(o => o.status === "pending").sort((a,b) => (b.createdAt||0)-(a.createdAt||0))[0] || null;
  } catch(e){ return null; }
}

function closeDialog(){ document.querySelector(".dialog .ib")?.click(); }

export async function openUpgradeFlow(plan){
  const pending = await fetchMyPendingOrder();
  if (pending){
    await dialog({ title: t("upgrade"), body: h("p",null, t("order_pending_banner", { s: tierName(pending.tier || plan.tier) })) });
    return;
  }
  if (!A.settings.paymentQrUrl && !A.settings.paymentInstructions){
    await dialog({ title: t("upgrade"), body: h("p",null, t("no_payment_setup")) });
    return;
  }

  let proofUrl = "";
  const proofPreview = h("div");
  const fileInp = h("input",{type:"file",accept:"image/*",onchange: async e => {
    const fl = e.target.files[0]; if (!fl) return;
    try { toast(t("importing")); proofUrl = await A.api.storage.upload(fl, `payment-proof/${A.user.uid}-${Date.now()}-${fl.name.replace(/[^\w.\-]/g,"_")}`); proofPreview.replaceChildren(h("img",{src:proofUrl,style:"max-width:100%;border-radius:8px"})); }
    catch(err){ toast(errText(err), "err"); }
  }});
  const errBox = h("p",{class:"small",style:"color:var(--bad)"});

  await dialog({ title: t("upgrade_to", { s: tr(plan.name, lang()) }), wide:true, body: h("div",{class:"stack"},
      h("p",null, h("b",{style:"font-size:1.15rem"}, (plan.price||0)+" "+(plan.currency||"")), plan.durationDays ? " · "+plan.durationDays+" "+t("days") : ""),
      h("div",{class:"panel",style:"background:var(--surface-2)"},
        h("h3",null, t("pay_how_to")),
        h("p",{class:"small"}, t("pay_qr_label")),
        A.settings.paymentQrUrl ? h("img",{src:A.settings.paymentQrUrl,style:"max-width:220px;border-radius:10px;border:1px solid var(--line)"}) : null,
        A.settings.paymentInstructions ? h("p",{class:"small muted",style:"white-space:pre-line"}, A.settings.paymentInstructions) : null),
      h("div",{class:"field"}, h("span",{class:"lbl"}, t("proof_of_payment")),
        h("div",{class:"stack",style:"gap:8px"},
          h("label",{class:"btn sm",style:"align-self:flex-start"}, icon("upload"), t("proof_upload_ph"), h("span",{hidden:true}, fileInp)),
          proofPreview)),
      errBox),
    actions:[
      { label:t("cancel"), value:false },
      { label:t("submit_request"), primary:true, onClick: async () => {
          if (!proofUrl){ errBox.textContent = t("proof_of_payment")+"?"; return false; }
          try {
            await A.api.db.add("orders", { uid:A.user.uid, email:A.user.email, planId:plan.id, tier:plan.tier||1, amount:plan.price||0, currency:plan.currency||"LAK", proofUrl, status:"pending", createdAt:new Date() });
            toast(t("order_submitted_ok"), "ok");
            return true;
          } catch(err){ errBox.textContent = errText(err); return false; }
        } }
    ] });
}

// The "ads popup": shown when a learner clicks a locked item, listing the plans that unlock it.
export async function openUpsellModal(requiredTier){
  const eligible = A.plans.filter(p => (p.tier||1) >= requiredTier && p.active !== false).sort((a,b) => (a.tier||1)-(b.tier||1));
  await dialog({ title: t("upgrade_to", { s: tierName(requiredTier) }), wide:true, body: h("div",{class:"stack"},
    eligible.length ? h("div",{class:"grid3"}, eligible.map(p => h("div",{class:"card stack",style:"gap:8px"},
      h("b",null, tr(p.name, lang())),
      h("p",{class:"small muted"}, (p.price||0)+" "+(p.currency||"")+(p.durationDays ? " · "+p.durationDays+" "+t("days") : "")),
      h("ul",{class:"obj small"+(lang()==="lo"?" lo":"")}, ((p.features&&(p.features[lang()]||p.features.en))||[]).map(f=>h("li",null,f))),
      h("button",{class:"btn sm primary",onclick: async () => { closeDialog(); await openUpgradeFlow(p); }}, t("upgrade")))))
      : h("p",{class:"muted"}, t("no_payment_setup"))) });
}
