// Admin → Payments: orders, payment transactions, refunds and payment settings.
// Admins can see what learners bought and what the provider reported (card brand and last 4 digits at most, never card numbers).
// Nobody marks an order paid here: only a verified provider result does (supabase/functions/payments). Refunds go through
// the provider, or are recorded with the provider's refund reference when made in its merchant portal. See docs/PAYMENTS.md.
import { h, icon, toast, dialog, confirmDialog, fmtDate, errText } from "../shared/ui.js";
import { lang } from "../shared/i18n.js";
import { METHODS, CURRENCIES, money, methodCurrency } from "../shared/billing.js";
import { S, L, t, isSuper, canSupport, planName, lockedScreen } from "./state.js";
import { shrinkPhoto } from "../shared/image.js";
import { uploadChecked } from "./web-checks.js";
import { refreshAdminNotify } from "./notify.js";

const STATUS = { created:["Started","ເລີ່ມແລ້ວ"], pending:["Pending","ລໍຖ້າ"], paid:["Paid","ຈ່າຍແລ້ວ"], failed:["Failed","ບໍ່ສຳເລັດ"], cancelled:["Cancelled","ຍົກເລີກ"],
  expired:["Expired","ໝົດເວລາ"], refunded:["Refunded","ຄືນເງິນແລ້ວ"], review:["Slip to approve","ລໍຖ້າອະນຸມັດສະລິບ"], rejected:["Slip rejected","ສະລິບຖືກປະຕິເສດ"], duplicate:["Duplicate","ຊ້ຳ"], mismatch:["Mismatch","ບໍ່ກົງກັນ"] };
const PILL = { review:"draft", rejected:"expired", paid:"active", pending:"draft", created:"draft", failed:"expired", mismatch:"expired", duplicate:"expired", cancelled:"cancelled", expired:"cancelled", refunded:"archived" };
const pill = s => h("span",{class:"pill "+(PILL[s]||"none")}, L(STATUS[s] || [s]));
const cyc = c => L(c === "year" ? ["Yearly","ລາຍປີ"] : ["Monthly","ລາຍເດືອນ"]);
const mName = m => m === "transfer" ? L(["Bank transfer","ໂອນເງິນ"]) : (METHODS[m] && METHODS[m].brand) || m || "—";
const ERR = { forbidden:["Only a Super Admin can refund.","ສະເພາະ Super Admin ຄືນເງິນໄດ້."], refund_reference_required:["Enter the refund reference from the provider's portal.","ໃສ່ເລກອ້າງອີງການຄືນເງິນຈາກລະບົບຂອງທະນາຄານ."],
  already_refunded:["Already refunded.","ຄືນເງິນແລ້ວ."], order_not_paid:["Only paid orders can be refunded.","ຄືນເງິນໄດ້ສະເພາະຄຳສັ່ງທີ່ຈ່າຍແລ້ວ."],
  transaction_reused:["This bank reference was already used to pay another order. Check the slip: it may have been sent twice.","ເລກອ້າງອີງນີ້ຖືກໃຊ້ຈ່າຍຄຳສັ່ງອື່ນແລ້ວ. ກວດສອບສະລິບ."],
  amount_mismatch:["The amount received is not the order's amount, so the plan was not opened. The order is marked for review.","ຈຳນວນເງິນບໍ່ກົງກັບຄຳສັ່ງ, ບໍ່ໄດ້ເປີດແພັກ."],
  empty_message:["Write a message first.","ຂຽນຂໍ້ຄວາມກ່ອນ."], too_many_messages:["This order already has 50 messages.","ຂໍ້ຄວາມເຕັມແລ້ວ."],
  order_not_in_review:["This slip was already handled.","ສະລິບນີ້ຖືກຈັດການແລ້ວ."],
  refund_not_confirmed:["The provider did not confirm the refund. Nothing was changed.","ທະນາຄານບໍ່ຢືນຢັນການຄືນເງິນ. ບໍ່ມີການປ່ຽນແປງ."], network_error:["No connection.","ບໍ່ມີການເຊື່ອມຕໍ່."] };
const errMsg = e => ERR[e && (e.code || e.message)] ? L(ERR[e.code || e.message]) : errText(e);

export async function viewPayments(p = {}){
  if (!canSupport()) return lockedScreen(t("only_super"), t("credential_menu_restricted"));
  const [orders, payments, users] = await Promise.all([
    S.api.db.list("orders").catch(() => []), S.api.db.list("payments").catch(() => []), S.api.db.list("users").catch(() => []) ]);
  orders.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  payments.sort((a, b) => (b.at || 0) - (a.at || 0));
  const who = Object.fromEntries(users.map(u => [u.id, u]));
  const person = uid => who[uid] ? h("div",null, h("b",null, who[uid].name || "—"), h("div",{class:"small muted"}, who[uid].email || "")) : h("code",{class:"small"}, String(uid || "").slice(0, 8));
  let tab = ["transfers","orders","payments","settings"].includes(p.tab) ? p.tab : "orders";

  // ---- summary ----
  const since = new Date(); since.setDate(1); since.setHours(0, 0, 0, 0);
  const paidMonth = {}; orders.filter(o => o.status === "paid" && (o.paidAt || 0) >= since.getTime()).forEach(o => paidMonth[o.currency] = (paidMonth[o.currency] || 0) + (+o.amount || 0));
  const review = orders.filter(o => o.needsReview);
  const slipsWaiting = orders.filter(o => o.method === "transfer" && o.status === "review").sort((a, b) => (a.slipAt || 0) - (b.slipAt || 0));
  const tile = (label, value, ic, cls = "") => h("div",{class:"panel pay-tile "+cls}, h("span",{class:"pay-tile-ic"}, icon(ic)), h("div",null, h("div",{class:"small muted"}, label), h("b",null, value)));
  const tiles = h("div",{class:"pay-tiles"},
    tile(L(["Received this month","ຮັບເງິນເດືອນນີ້"]), Object.keys(paidMonth).length ? Object.entries(paidMonth).map(([c, v]) => money(v, c, lang())).join(" · ") : "—", "wallet"),
    tile(L(["Paid orders","ຄຳສັ່ງທີ່ຈ່າຍແລ້ວ"]), String(orders.filter(o => o.status === "paid").length), "check"),
    tile(L(["Waiting for payment","ລໍຖ້າການຈ່າຍ"]), String(orders.filter(o => ["created","pending"].includes(o.status)).length), "clock"),
    tile(L(["Needs review","ຕ້ອງກວດສອບ"]), String(review.length), "info", review.length ? "warn" : ""),
    tile(L(["Transfers to approve","ໂອນເງິນລໍຖ້າອະນຸມັດ"]), String(slipsWaiting.length), "qr", slipsWaiting.length ? "warn pulse" : ""));

  // ---- orders ----
  let q = "", fs = review.length && p.review ? "review" : "";
  const obody = h("tbody");
  const DELETABLE = ["created","pending","expired","cancelled","failed","rejected"];
  const paidIds = new Set(payments.map(pm => pm.orderId));
  const canDelete = o => isSuper() && DELETABLE.includes(o.status) && !paidIds.has(o.id);
  const picked = new Set();
  const bulk = h("div",{class:"ord-bulk",hidden:true});
  const drawBulk = () => { bulk.hidden = !picked.size;
    bulk.replaceChildren(h("b",null, picked.size + " " + L(["selected","ເລືອກ"])), h("button",{class:"btn sm danger",onclick:()=>removeOrders([...picked])}, icon("trash"), L(["Delete","ລຶບ"])),
      h("button",{class:"btn sm ghost",onclick:()=>{ picked.clear(); drawOrders(); }}, L(["Clear selection","ຍົກເລີກການເລືອກ"]))); };
  async function removeOrders(ids){
    if (!ids.length) return;
    if (!await confirmDialog(L(["Delete orders","ລຶບຄຳສັ່ງ"]), L(["Delete ","ລຶບ "]) + ids.length + L([" order(s) for good? Paid and refunded orders, and orders with any payment recorded, are always kept.",
      " ຄຳສັ່ງ? ຄຳສັ່ງທີ່ຈ່າຍແລ້ວ ຫຼື ມີການຈ່າຍ ຈະຖືກເກັບໄວ້."]), L(["Delete","ລຶບ"]), t("cancel"), true)) return;
    try { const r = await S.api.pay.deleteOrders(ids); toast(L(["Deleted: ","ລຶບແລ້ວ: "]) + r.deleted + (r.kept ? " · " + L(["kept: ","ເກັບໄວ້: "]) + r.kept : ""), "ok");
      S.api.db.add("activity", { uid:S.me.uid, type:"orders_deleted", ref:String(r.deleted), at:new Date() }).catch(() => {}); refreshAdminNotify(); S.render(); }
    catch(e){ toast(errMsg(e), "err"); }
  }
  const stale = () => orders.filter(o => canDelete(o) && (o.createdAt || 0) < Date.now() - 7 * 864e5 && o.status !== "rejected" && !(o.method === "transfer" && o.status === "created" && (o.createdAt || 0) > Date.now() - 3 * 864e5));
  const drawOrders = () => {
    const f = q.trim().toLowerCase();
    const list = orders.filter(o => (!fs || (fs === "review" ? o.needsReview : o.status === fs))
      && (!f || o.id.toLowerCase().includes(f) || ((who[o.uid] && ((who[o.uid].email || "") + " " + (who[o.uid].name || ""))) || "").toLowerCase().includes(f)));
    obody.replaceChildren(...list.map(o => h("tr",{class:"clickable"+(picked.has(o.id)?" picked":""),onclick:()=>orderDialog(o)},
      isSuper() ? h("td",{class:"ord-pick",onclick:e=>e.stopPropagation()}, canDelete(o) ? h("input",{type:"checkbox","aria-label":L(["Select","ເລືອກ"])+" "+o.id,checked:picked.has(o.id),onchange:e=>{ e.target.checked ? picked.add(o.id) : picked.delete(o.id); e.target.closest("tr").classList.toggle("picked", e.target.checked); drawBulk(); }})
        : h("span",{class:"ord-lock",title:L(["Kept: money was recorded for this order","ເກັບໄວ້: ມີການຈ່າຍເງິນ"])}, icon("lock"))) : null,
      h("td",null, h("code",{class:"small"}, o.id), o.needsReview ? h("div",null, h("span",{class:"pill expired"}, L(["Review","ກວດສອບ"]))) : null, (o.messages||[]).length ? h("div",{class:"small muted"}, icon("send"), " ", String(o.messages.length)) : null),
      h("td",null, person(o.uid)),
      h("td",null, planName(o.planId), h("div",{class:"small muted"}, cyc(o.cycle))),
      h("td",{class:"tabnum"}, money(o.amount, o.currency, lang())),
      h("td",null, mName(o.method), h("div",{class:"small muted"}, o.provider || "—")),
      h("td",null, pill(o.status)),
      h("td",{class:"small tabnum"}, fmtDate(o.createdAt, lang(), true)),
      h("td",{class:"small tabnum"}, o.paidAt ? fmtDate(o.paidAt, lang(), true) : "—"))));
    if (!list.length) obody.append(h("tr",null, h("td",{colspan:"9",class:"muted"}, t("no_rows"))));
    drawBulk();
  };
  const ordersPane = h("div",{class:"stack"},
    h("div",{class:"toolbar"},
      h("input",{class:"input grow",placeholder:L(["Search order number, name or email","ຄົ້ນຫາເລກຄຳສັ່ງ, ຊື່ ຫຼື ອີເມວ"]),oninput:e=>{ q = e.target.value; drawOrders(); }}),
      h("select",{class:"input","aria-label":t("status"),onchange:e=>{ fs = e.target.value; drawOrders(); }},
        h("option",{value:""}, t("status")+": "+t("all")+" ("+orders.length+")"), h("option",{value:"review",selected:fs==="review"}, L(["Needs review","ຕ້ອງກວດສອບ"])+" ("+review.length+")"),
        ["review","rejected","paid","pending","created","failed","cancelled","expired","refunded"].map(st => h("option",{value:st}, L(STATUS[st])+" ("+orders.filter(o => o.status === st).length+")"))),
      isSuper() && stale().length ? h("button",{class:"btn sm",title:L(["Delete expired, cancelled, failed and abandoned orders older than 7 days (never paid ones only)","ລຶບຄຳສັ່ງເກົ່າທີ່ບໍ່ໄດ້ຈ່າຍ"]),onclick:()=>removeOrders(stale().map(o => o.id))},
        icon("trash"), L(["Clean up","ລ້າງ"])+" ("+stale().length+")") : null),
    bulk,
    h("div",{class:"tbl-wrap"}, h("table",{class:"tbl"}, h("thead",null, h("tr",null,
      [isSuper() ? "" : null, L(["Order","ຄຳສັ່ງ"]), t("learner"), t("plan"), L(["Amount","ຈຳນວນ"]), L(["Method","ວິທີຈ່າຍ"]), t("status"), L(["Created","ສ້າງເມື່ອ"]), L(["Paid","ຈ່າຍເມື່ອ"])].map(x => h("th",null,x)))), obody)));

  // ---- payments (what the provider reported) ----
  const paymentsPane = h("div",{class:"tbl-wrap"}, h("table",{class:"tbl"},
    h("thead",null, h("tr",null, [L(["Time","ເວລາ"]), L(["Order","ຄຳສັ່ງ"]), t("learner"), L(["Provider / transaction","ຜູ້ໃຫ້ບໍລິການ / ທຸລະກຳ"]), L(["Method","ວິທີຈ່າຍ"]), L(["Amount","ຈຳນວນ"]), t("status")].map(x => h("th",null,x)))),
    h("tbody",null, payments.length ? payments.map(pm => h("tr",{class:"clickable",onclick:()=>{ const o = orders.find(x => x.id === pm.orderId); if (o) orderDialog(o); }},
      h("td",{class:"small tabnum"}, fmtDate(pm.paidAt || pm.at, lang(), true)), h("td",null, h("code",{class:"small"}, pm.orderId)), h("td",null, person(pm.uid)),
      h("td",null, pm.provider, h("div",{class:"small muted"}, h("code",null, pm.txnId))),
      h("td",null, (pm.brand || mName(pm.method)) + (pm.last4 ? " •••• " + pm.last4 : "")),
      h("td",{class:"tabnum"}, money(pm.amount, pm.currency, lang())),
      h("td",null, pill(pm.status), pm.reason ? h("div",{class:"small muted"}, pm.reason) : null)))
      : h("tr",null, h("td",{colspan:"7",class:"muted"}, t("no_rows"))))));

  // ---- order detail, provider check and refund ----
  async function orderDialog(o){
    if (o.method === "transfer" && o.status === "review" && canSupport()) return reviewDialog(o);
    const pays = payments.filter(pm => pm.orderId === o.id);
    const kv = (k, v) => [h("dt",null,k), h("dd",null,v)];
    const body = h("div",{class:"stack"},
      h("dl",{class:"kv"},
        kv(L(["Order","ຄຳສັ່ງ"]), h("code",null,o.id)), kv(t("learner"), person(o.uid)), kv(t("plan"), planName(o.planId)+" · "+cyc(o.cycle)),
        kv(L(["Kind","ປະເພດ"]), L({ new:["New","ໃໝ່"], renew:["Renewal","ຕໍ່ອາຍຸ"], upgrade:["Upgrade","ອັບເກຣດ"] }[o.kind] || [o.kind || "—"]) + (o.creditDays ? " · +" + o.creditDays + " " + t("days") : "")),
        kv(L(["Amount (snapshot)","ຈຳນວນ (ລາຄາຕອນສັ່ງ)"]), money(o.amount, o.currency, lang())), kv(L(["Method","ວິທີຈ່າຍ"]), mName(o.method) + " · " + (o.provider || "—")),
        kv(t("status"), pill(o.status)), kv(L(["Created","ສ້າງເມື່ອ"]), fmtDate(o.createdAt, lang(), true)),
        o.paidAt ? kv(L(["Paid","ຈ່າຍເມື່ອ"]), fmtDate(o.paidAt, lang(), true)) : null,
        o.activatedUntil ? kv(L(["Access until","ໃຊ້ໄດ້ຮອດ"]), fmtDate(o.activatedUntil, lang())) : null,
        o.refundedAt ? kv(L(["Refunded","ຄືນເງິນເມື່ອ"]), fmtDate(o.refundedAt, lang(), true) + (o.refundRef ? " · " + o.refundRef : "") + (o.refundReason ? " · " + o.refundReason : "")) : null,
        o.failReason ? kv(L(["Provider reason","ເຫດຜົນຈາກທະນາຄານ"]), o.failReason) : null),
      o.needsReview ? h("div",{class:"banner"}, icon("info"), L(["A payment did not match this order (amount, currency, or the order was already paid). It did not unlock anything. Check it in the provider's portal and refund it there if needed.",
        "ມີການຈ່າຍເງິນທີ່ບໍ່ກົງກັບຄຳສັ່ງນີ້. ບໍ່ໄດ້ປົດລັອກຫຍັງ. ກວດສອບໃນລະບົບຂອງທະນາຄານ ແລະ ຄືນເງິນຖ້າຈຳເປັນ."])) : null,
      pays.length ? h("div",null, h("h3",null, L(["Provider transactions","ທຸລະກຳຈາກທະນາຄານ"])),
        h("div",{class:"feed"}, pays.map(pm => h("div",{class:"feed-row"}, h("span",{class:"small"}, pm.provider+" · ", h("code",null, pm.txnId), " · "+(pm.brand || mName(pm.method))+(pm.last4 ? " •••• "+pm.last4 : "")+" · "+money(pm.amount, pm.currency, lang())+(pm.reason ? " · "+pm.reason : "")), pill(pm.status))))) : null,
      canSupport() ? messagesBox(o) : null,
      h("details",null, h("summary",{class:"small"}, L(["History","ປະຫວັດ"])+" ("+(o.history||[]).length+")"),
        h("div",{class:"feed"}, (o.history||[]).map(x => h("div",{class:"feed-row"}, h("span",{class:"small"}, L(STATUS[x.status] || [x.status]) + (x.note ? " · " + x.note : "") + (x.provider ? " · " + x.provider : "")), h("span",{class:"small muted"}, fmtDate(x.at, lang(), true)))))));
    const actions = [{ label:t("close"), value:true }];
    if (["created","pending"].includes(o.status)) actions.unshift({ label:L(["Check with provider","ກວດກັບທະນາຄານ"]), onClick: async () => {
      try { const n = await S.api.pay.status(o.id); toast(L(STATUS[n.status] || [n.status])); if (n.status !== o.status) S.render(); return true; } catch(e){ toast(errMsg(e), "err"); return false; } } });
    if (o.status === "paid" && isSuper()) actions.unshift({ label:L(["Refund…","ຄືນເງິນ…"]), danger:true, onClick: async () => { await refundDialog(o); return true; } });
    dialog({ title:L(["Order","ຄຳສັ່ງ"])+" "+o.id, wide:true, body, actions });
  }
  async function refundDialog(o){
    const auto = o.provider === "mock" || o.provider === "demo";
    const reason = h("textarea",{class:"input",placeholder:L(["Why is this refunded? (kept in the history)","ເຫດຜົນການຄືນເງິນ (ເກັບໄວ້ໃນປະຫວັດ)"])});
    const ref = h("input",{class:"input",placeholder:"RF-…"});
    const msg = h("p",{class:"small",style:"color:var(--bad)"});
    await dialog({ title:L(["Refund","ຄືນເງິນ"])+" "+o.id, body:h("div",{class:"stack"},
        h("p",null, h("b",null, money(o.amount, o.currency, lang())), " · ", planName(o.planId), " · ", who[o.uid] ? who[o.uid].email : o.uid),
        h("div",{class:"banner"}, icon("info"), L(["Refund policy: the plan bought with this order ends as soon as the refund is recorded, and the learner goes back to Free. Their progress is kept.",
          "ນະໂຍບາຍ: ແພັກທີ່ຊື້ດ້ວຍຄຳສັ່ງນີ້ຈະສິ້ນສຸດທັນທີທີ່ບັນທຶກການຄືນເງິນ, ຜູ້ຮຽນກັບເປັນຟຣີ. ຄວາມຄືບໜ້າຍັງຢູ່."])),
        auto ? null : h("div",{class:"field"}, h("span",{class:"lbl"}, L(["Refund reference from the provider","ເລກອ້າງອີງການຄືນເງິນຈາກທະນາຄານ"])), ref,
          h("span",{class:"help"}, L(["Make the refund in the provider's merchant portal first, then enter its reference here. Only then is it recorded.","ຄືນເງິນໃນລະບົບຂອງທະນາຄານກ່ອນ ແລ້ວໃສ່ເລກອ້າງອີງທີ່ນີ້."]))),
        h("div",{class:"field"}, h("span",{class:"lbl"}, L(["Reason","ເຫດຜົນ"])), reason), msg),
      actions:[{ label:t("cancel"), value:false }, { label:L(["Record refund","ບັນທຶກການຄືນເງິນ"]), danger:true, onClick: async () => {
        if (!auto && !ref.value.trim()){ msg.textContent = L(ERR.refund_reference_required); return false; }
        if (!await confirmDialog(L(["Refund","ຄືນເງິນ"]), L(["The learner's plan from this order ends now. Continue?","ແພັກຈາກຄຳສັ່ງນີ້ຈະສິ້ນສຸດດຽວນີ້. ສືບຕໍ່ບໍ?"]), L(["Refund","ຄືນເງິນ"]), t("cancel"), true)) return false;
        try { await S.api.pay.refund({ orderId:o.id, reason:reason.value.trim(), ref:ref.value.trim(), by:S.me.uid }); toast(L(["Refund recorded.","ບັນທຶກການຄືນເງິນແລ້ວ."]), "ok"); S.render(); return true; }
        catch(e){ msg.textContent = errMsg(e); return false; }
      } }] });
  }

  // ---- bank transfers: slips to approve ----
  const REASONS = [["The amount does not match","ຈຳນວນເງິນບໍ່ກົງກັນ"], ["The slip cannot be read","ອ່ານສະລິບບໍ່ໄດ້"], ["No payment found in our account","ບໍ່ພົບເງິນເຂົ້າບັນຊີ"],
    ["Paid to another account","ໂອນເຂົ້າບັນຊີອື່ນ"], ["This slip was already used","ສະລິບນີ້ໃຊ້ແລ້ວ"]];
  const ago = ms => { const m = Math.max(0, Math.round((Date.now() - (ms || 0)) / 60000)); return m < 60 ? m + " " + L(["min ago","ນາທີກ່ອນ"]) : m < 1440 ? Math.round(m / 60) + " " + L(["h ago","ຊົ່ວໂມງກ່ອນ"]) : Math.round(m / 1440) + " " + L(["days ago","ມື້ກ່ອນ"]); };
  function slipThumb(o){
    const box = h("div",{class:"tr-thumb"}, h("span",{class:"bill-spin","aria-hidden":"true"}));
    S.api.pay.slip(o.id).then(sl => box.replaceChildren(sl && sl.image ? h("img",{src:sl.image,alt:L(["Transfer slip","ສະລິບການໂອນ"]),loading:"lazy"}) : icon("image"))).catch(() => box.replaceChildren(icon("image")));
    return box;
  }
  let tf = "review";
  const tgrid = h("div",{class:"tr-adm-grid"});
  const drawTransfers = () => {
    const list = orders.filter(o => o.method === "transfer" && (tf === "all" ? true : tf === "paid" ? o.status === "paid" : o.status === tf))
      .sort((a, b) => tf === "review" ? (a.slipAt || 0) - (b.slipAt || 0) : (b.slipAt || b.createdAt || 0) - (a.slipAt || a.createdAt || 0));
    tgrid.replaceChildren(...(list.length ? list.map((o, i) => h("button",{type:"button",class:"tr-adm-card"+(o.slipDupOf ? " dup" : ""),style:"--i:"+i,onclick:()=>o.status === "review" ? reviewDialog(o) : orderDialog(o)},
      slipThumb(o),
      h("div",{class:"tr-adm-tx"},
        h("div",{class:"spread"}, h("b",{class:"tabnum tr-adm-amt"}, money(o.amount, o.currency, lang())), pill(o.status)),
        person(o.uid),
        h("div",{class:"small muted"}, planName(o.planId), " · ", cyc(o.cycle)),
        h("div",{class:"small muted"}, icon("clock"), " ", o.slipAt ? ago(o.slipAt) : fmtDate(o.createdAt, lang(), true), o.slipRef ? " · " + o.slipRef : ""),
        o.slipDupOf ? h("div",{class:"tr-adm-warn"}, icon("info"), L(["Same image as order ","ຮູບດຽວກັບຄຳສັ່ງ "]) + o.slipDupOf) : null)))
      : [h("div",{class:"tr-adm-empty"}, icon("check"), h("b",null, tf === "review" ? L(["No slips waiting. All caught up!","ບໍ່ມີສະລິບລໍຖ້າ."]) : t("no_rows")))]));
  };
  const tseg = h("div",{class:"seg",role:"group"}, [["review",["To approve","ລໍຖ້າອະນຸມັດ"]],["rejected",["Rejected","ປະຕິເສດ"]],["paid",["Approved","ອະນຸມັດແລ້ວ"]],["all",["All transfers","ທັງໝົດ"]]].map(([k, l]) =>
    h("button",{type:"button","aria-pressed":String(tf===k),onclick:e=>{ tf = k; tseg.querySelectorAll("button").forEach(b => b.setAttribute("aria-pressed", String(b === e.currentTarget))); drawTransfers(); }},
      L(l), (n => n ? h("span",{class:"tr-badge"+(k === "review" ? "" : " soft")}, String(n)) : null)(orders.filter(o => o.method === "transfer" && (k === "all" ? true : o.status === k)).length))));
  const transfersPane = h("div",{class:"stack"},
    h("p",{class:"small muted"}, L(["Learners who paid by bank transfer sent these slips. Check that the money arrived in the account (amount and reference), then approve: the plan opens at once. Rejecting asks the learner for a new slip.",
      "ຜູ້ຮຽນທີ່ໂອນເງິນສົ່ງສະລິບເຫຼົ່ານີ້. ກວດວ່າເງິນເຂົ້າບັນຊີແລ້ວ ຈຶ່ງອະນຸມັດ: ແພັກຈະເປີດທັນທີ."])),
    tseg, tgrid);
  function messagesBox(o){
    const list = h("ul",{class:"msg-list"});
    const drawList = () => list.replaceChildren(...((o.messages || []).length ? o.messages.map(m => h("li",{class:m.kind === "rejected" ? "rej" : ""},
      h("p",null, m.text), h("small",{class:"muted"}, (m.kind === "rejected" ? L(["Rejection","ປະຕິເສດ"]) + " · " : "") + (who[m.by] ? (who[m.by].name || who[m.by].email) : L(["Team","ທີມງານ"])) + " · " + fmtDate(m.at, lang(), true))))
      : [h("li",{class:"empty"}, h("small",{class:"muted"}, L(["No messages yet. The learner sees what you write here, in their notifications and on their order.","ຍັງບໍ່ມີຂໍ້ຄວາມ."])))]));
    const txt = h("textarea",{class:"input",rows:"2",maxlength:"1000",placeholder:L(["Write to the learner (they get a notification)…","ຂຽນເຖິງຜູ້ຮຽນ…"])});
    const send = h("button",{class:"btn sm primary",type:"button",onclick:async()=>{
      const v = txt.value.trim(); if (!v) return;
      send.disabled = true;
      try { const r = await S.api.pay.message(o.id, v); o.messages = [...(o.messages || []), { at:r.at, by:S.me.uid, from:"team", kind:"message", text:v }]; txt.value = ""; drawList(); toast(L(["Sent to the learner.","ສົ່ງເຖິງຜູ້ຮຽນແລ້ວ."]), "ok"); }
      catch(e){ toast(errMsg(e), "err"); } finally { send.disabled = false; }
    }}, icon("send"), L(["Send","ສົ່ງ"]));
    drawList();
    return h("details",{class:"msg-box",open:(o.messages || []).length > 0},
      h("summary",null, icon("send"), " ", L(["Messages with the learner","ຂໍ້ຄວາມກັບຜູ້ຮຽນ"]), " (" + (o.messages || []).length + ")"),
      list, h("div",{class:"msg-write"}, txt, send));
  }

  async function reviewDialog(o){
    const sl = await S.api.pay.slip(o.id).catch(() => null) || {};
    const ref = h("input",{class:"input",value:sl.ref || "",maxlength:"60",placeholder:L(["Reference on the slip","ເລກອ້າງອີງໃນສະລິບ"])});
    const amt = h("input",{class:"input tabnum",type:"number",min:"0",step:"any",value:String(o.amount)});
    const reason = h("input",{class:"input",maxlength:"300",placeholder:L(["Short reason (the learner sees it)","ເຫດຜົນສັ້ນໆ (ຜູ້ຮຽນຈະເຫັນ)"])});
    const u0 = who[o.uid] || {};
    const note = h("textarea",{class:"input",rows:"4",maxlength:"1000",placeholder:L(["Message to the learner: what happened and what to do next","ຂໍ້ຄວາມເຖິງຜູ້ຮຽນ: ເກີດຫຍັງຂຶ້ນ ແລະ ຕ້ອງເຮັດແນວໃດ"])});
    const fillNote = r => { note.value = L(["Hello ","ສະບາຍດີ "]) + (u0.name || "") + ",\n" + L(["We could not approve your transfer slip for order ","ພວກເຮົາອະນຸມັດສະລິບຂອງຄຳສັ່ງ "]) + o.id + L([": "," ບໍ່ໄດ້: "]) + r.toLowerCase()
      + ".\n" + L(["Please check the payment and send a new slip from the same page. If you need help, just reply to us.","ກະລຸນາກວດສອບ ແລ້ວສົ່ງສະລິບໃໝ່. ຖ້າຕ້ອງການຄວາມຊ່ວຍເຫຼືອ ຕິດຕໍ່ພວກເຮົາ."]); };
    const msg = h("p",{class:"small",role:"alert",style:"color:var(--bad)"});
    const u = who[o.uid] || {};
    const kv = (k, v) => [h("dt",null,k), h("dd",null,v)];
    const img = sl.image ? h("a",{href:sl.image,target:"_blank",rel:"noopener",class:"tr-big",title:L(["Open full size","ເປີດຂະໜາດເຕັມ"])}, h("img",{src:sl.image,alt:L(["Transfer slip","ສະລິບການໂອນ"])})) : h("div",{class:"tr-big empty"}, icon("image"), L(["No slip image","ບໍ່ມີຮູບສະລິບ"]));
    let rejecting = false;
    const rejectBox = h("div",{class:"stack tr-reject",hidden:true},
      h("span",{class:"lbl"}, L(["Why is it rejected?","ເປັນຫຍັງປະຕິເສດ?"])),
      h("div",{class:"chips"}, REASONS.map(r => h("button",{type:"button",class:"chip",onclick:()=>{ reason.value = L(r); fillNote(L(r)); note.focus(); }}, L(r)))), reason,
      h("span",{class:"lbl"}, L(["Message to the learner","ຂໍ້ຄວາມເຖິງຜູ້ຮຽນ"])), note,
      h("span",{class:"help"}, L(["They see it at once: a notification, and on their transfer page.","ຜູ້ຮຽນຈະເຫັນທັນທີ ໃນການແຈ້ງເຕືອນ ແລະ ໜ້າການໂອນ."])));
    const body = h("div",{class:"tr-review"},
      img,
      h("div",{class:"stack"},
        h("div",{class:"tr-expect"}, h("span",{class:"small muted"}, L(["Expected amount","ຈຳນວນທີ່ຕ້ອງໄດ້ຮັບ"])), h("b",{class:"tabnum"}, money(o.amount, o.currency, lang()))),
        o.slipDupOf ? h("div",{class:"banner warn"}, icon("info"), L(["This image was already sent for order ","ຮູບນີ້ຖືກສົ່ງສຳລັບຄຳສັ່ງ "]) + o.slipDupOf + L([". Check carefully before approving.",". ກວດສອບໃຫ້ດີ."])) : null,
        h("dl",{class:"kv"},
          kv(t("learner"), h("span",null, h("b",null, u.name || "—"), " ", h("span",{class:"small muted"}, u.email || o.uid))),
          kv(t("plan"), planName(o.planId) + " · " + cyc(o.cycle)),
          kv(L(["Order code (in the transfer note)","ລະຫັດຄຳສັ່ງ"]), h("code",null, o.id)),
          kv(L(["Paid at (learner)","ເວລາໂອນ"]), sl.paidAt ? fmtDate(sl.paidAt, lang(), true) : "—"),
          kv(L(["Sent","ສົ່ງເມື່ອ"]), fmtDate(o.slipAt, lang(), true) + " · " + ago(o.slipAt)),
          sl.note ? kv(L(["Learner's note","ໝາຍເຫດ"]), sl.note) : null,
          (sl.count || 0) > 1 ? kv(L(["Slips sent","ຈຳນວນສະລິບ"]), String(sl.count)) : null),
        h("div",{class:"field-row"}, h("div",{class:"field"}, h("span",{class:"lbl"}, L(["Bank reference","ເລກອ້າງອີງທະນາຄານ"])), ref,
            h("span",{class:"help"}, L(["Saved as the transaction: the same reference cannot pay two orders.","ບັນທຶກເປັນທຸລະກຳ: ເລກດຽວກັນຈ່າຍສອງຄຳສັ່ງບໍ່ໄດ້."]))),
          h("div",{class:"field"}, h("span",{class:"lbl"}, L(["Amount received","ຈຳນວນທີ່ໄດ້ຮັບ"]) + " (" + o.currency + ")"), amt)),
        (o.messages || []).length ? messagesBox(o) : null,
        rejectBox, msg));
    await dialog({ title:L(["Approve transfer","ອະນຸມັດການໂອນ"]) + " · " + o.id, wide:true, body,
      actions:[{ label:t("cancel"), value:false },
        { label:L(["Reject…","ປະຕິເສດ…"]), danger:true, onClick: async () => {
          if (!rejecting){ rejecting = true; rejectBox.hidden = false; reason.focus(); return false; }
          if (!reason.value.trim()){ msg.textContent = L(["Tell the learner why (choose or write a reason).","ໃສ່ເຫດຜົນ."]); return false; }
          try { await S.api.pay.review(o.id, false, { reason: reason.value.trim(), message: note.value.trim() }); toast(L(["Slip rejected: the learner was told why and asked for a new one.","ປະຕິເສດແລ້ວ ແລະ ແຈ້ງຜູ້ຮຽນແລ້ວ."]), "ok"); refreshAdminNotify();
            S.api.db.add("activity", { uid:S.me.uid, type:"transfer_rejected", ref:o.id, at:new Date() }).catch(() => {}); S.render(); return true; }
          catch(e){ msg.textContent = errMsg(e); return false; } } },
        { label:L(["Approve and open the plan","ອະນຸມັດ ແລະ ເປີດແພັກ"]), primary:true, onClick: async () => {
          const a = +amt.value;
          if (!(a > 0)){ msg.textContent = L(["Enter the amount received.","ໃສ່ຈຳນວນທີ່ໄດ້ຮັບ."]); return false; }
          if (a !== +o.amount && !await confirmDialog(L(["Amount differs","ຈຳນວນບໍ່ກົງ"]), L(["The amount received is not the order's amount. The plan will NOT open and the order will be marked for review. Continue?","ຈຳນວນບໍ່ກົງ. ແພັກຈະບໍ່ເປີດ. ສືບຕໍ່ບໍ?"]), L(["Continue","ສືບຕໍ່"]), t("cancel"))) return false;
          try { const r = await S.api.pay.review(o.id, true, { ref: ref.value.trim(), amount: a });
            toast(L(["Approved: the plan is open until ","ອະນຸມັດແລ້ວ: ແພັກເປີດຮອດ "]) + fmtDate(r.expiresAt, lang()), "ok"); refreshAdminNotify();
            S.api.db.add("activity", { uid:S.me.uid, type:"transfer_approved", ref:o.id, at:new Date() }).catch(() => {}); S.render(); return true; }
          catch(e){ msg.textContent = errMsg(e); return false; } } }] });
  }

  // ---- settings (Super Admin) ----
  async function settingsPane(){
    if (!isSuper()) return h("p",{class:"muted"}, t("only_super"));
    const app = (await S.api.db.get("settings/app").catch(() => null)) || {};
    const pay = Object.assign({ enabled:false, methods:[], currency:{} }, app.payments || {});
    const cfg = await S.api.pay.config().catch(() => ({ provider:null, methods:[] }));
    const enabled = h("input",{type:"checkbox",class:"switch",checked:pay.enabled === true});
    const rows = Object.entries(METHODS).filter(([m]) => m !== "transfer").map(([m, info]) => {
      const on = h("input",{type:"checkbox",checked:(pay.methods||[]).includes(m)});
      const cur = h("select",{class:"input",style:"width:auto"}, CURRENCIES.map(c => h("option",{value:c,selected:methodCurrency(app, m) === c}, c)));
      const supported = !cfg.methods || cfg.methods.includes(m);
      return { m, on, cur, el: h("div",{class:"pay-mrow"}, h("label",{class:"row"}, on, h("b",null, info.brand)), h("span",{class:"small muted"}, info.kind === "qr" ? "QR" : L(["Card","ບັດ"])), cur,
        supported ? h("span",{class:"pill active"}, L(["Provider supports it","ຮອງຮັບ"])) : h("span",{class:"pill expired"}, L(["Not supported by the current provider","ຜູ້ໃຫ້ບໍລິການປັດຈຸບັນບໍ່ຮອງຮັບ"]))) };
    });
    const msg = h("p",{class:"small"});
    return h("div",{class:"stack"},
      h("section",{class:"panel stack"}, h("h3",null, L(["Payment provider","ຜູ້ໃຫ້ບໍລິການຈ່າຍເງິນ"])),
        cfg.provider ? h("p",null, h("b",null, cfg.label || cfg.provider), " · ", cfg.live ? h("span",{class:"pill active"}, L(["Live","ໃຊ້ງານຈິງ"])) : h("span",{class:"pill draft"}, L(["Test mode: no real money","ໂໝດທົດສອບ: ບໍ່ມີເງິນແທ້"])))
          : h("div",{class:"banner"}, icon("info"), L(["No payment provider is connected. Deploy the payments function and set its secrets (docs/PAYMENTS.md). Until then learners see the manual payment instructions.",
            "ຍັງບໍ່ໄດ້ເຊື່ອມຕໍ່ຜູ້ໃຫ້ບໍລິການ. ເບິ່ງ docs/PAYMENTS.md. ກ່ອນນັ້ນຜູ້ຮຽນຈະເຫັນວິທີຈ່າຍແບບແມນນວນ."])),
        h("p",{class:"small muted"}, L(["Provider keys are never stored here: they are Supabase secrets of the payments function.","ລະຫັດລັບບໍ່ໄດ້ເກັບທີ່ນີ້: ມັນຢູ່ໃນ Supabase secrets."]))),
      transferSettings(app, pay),
      h("section",{class:"panel stack"}, h("h3",null, L(["Online checkout","ການຈ່າຍເງິນອອນລາຍ"])),
        h("label",{class:"row"}, enabled, L(["Learners can buy plans online","ຜູ້ຮຽນຊື້ແພັກເກດອອນລາຍໄດ້"])),
        h("p",{class:"small muted"}, L(["Methods offered, and the currency each one charges in. Prices come from each plan (Pricing Plans).","ວິທີຈ່າຍທີ່ເປີດ ແລະ ສະກຸນເງິນ. ລາຄາມາຈາກແຕ່ລະແພັກເກດ."])),
        h("div",{class:"stack",style:"gap:8px"}, rows.map(r => r.el)),
        h("div",{class:"row"}, h("button",{class:"btn primary",onclick:async()=>{
          const next = Object.assign({}, pay, { enabled: enabled.checked, methods: rows.filter(r => r.on.checked && r.m !== "transfer").map(r => r.m), currency: Object.assign({}, pay.currency, Object.fromEntries(rows.map(r => [r.m, r.cur.value]))) });
          try { await S.api.db.set("settings/app", { payments: next }, true); msg.textContent = t("saved_ok"); msg.style.color = "var(--jade)"; }
          catch(e){ msg.textContent = errText(e); msg.style.color = "var(--bad)"; }
        }}, t("save")), msg)),
      h("section",{class:"panel stack"}, h("h3",null, L(["Policies","ນະໂຍບາຍ"])),
        h("ul",{class:"obj small"},
          h("li",null, L(["Upgrade: the new plan starts at once; unused paid days of the old plan are converted into extra days on the new one.","ອັບເກຣດ: ແພັກໃໝ່ເລີ່ມທັນທີ; ມື້ທີ່ເຫຼືອຂອງແພັກເກົ່າປ່ຽນເປັນມື້ເພີ່ມ."])),
          h("li",null, L(["Downgrade: scheduled for the end of the current paid period.","ດາວເກຣດ: ປ່ຽນເມື່ອໝົດຮອບທີ່ຈ່າຍແລ້ວ."])),
          h("li",null, L(["Cancel: the plan stays until its end date and is not renewed.","ຍົກເລີກ: ໃຊ້ໄດ້ຮອດວັນໝົດ ແລະ ບໍ່ຕໍ່ອາຍຸ."])),
          h("li",null, L(["Renewal is manual: plans never charge automatically.","ການຕໍ່ອາຍຸເຮັດເອງ: ບໍ່ມີການຕັດເງິນອັດຕະໂນມັດ."])),
          h("li",null, L(["Refund: access from the order ends when the refund is confirmed.","ຄືນເງິນ: ສິດຈາກຄຳສັ່ງນັ້ນສິ້ນສຸດເມື່ອຢືນຢັນການຄືນເງິນ."])),
          h("li",null, L(["Manual grants (Learners → Assign plan) never create payment records.","ການມອບສິດດ້ວຍມື ບໍ່ສ້າງບັນທຶກການຈ່າຍເງິນ."])))));
  }

  // Bank transfer (BCEL One QR or account): works without any online provider; an admin approves each slip
  function transferSettings(app, pay){
    const T = Object.assign({ enabled:false, bank:"BCEL One", accountName:"", accountNumber:"", qrImage:"", instructions:{ en:"", lo:"", zh:"" }, eta:{ en:"", lo:"", zh:"" } }, pay.transfer || {});
    if (!T.instructions.en && app.paymentInstructions) T.instructions = { en: typeof app.paymentInstructions === "string" ? app.paymentInstructions : (app.paymentInstructions.en || ""), lo: (app.paymentInstructions && app.paymentInstructions.lo) || "", zh: "" };
    const on = h("input",{type:"checkbox",class:"switch",checked:T.enabled === true});
    const inp = (v, ph) => h("input",{class:"input",value:v || "",placeholder:ph || ""});
    const bank = inp(T.bank, "BCEL One"), name = inp(T.accountName, "KHAMPHOUI …"), num = inp(T.accountNumber, "0101 …");
    const cur = h("select",{class:"input",style:"width:auto"}, CURRENCIES.map(c => h("option",{value:c,selected:methodCurrency(app, "transfer") === c}, c)));
    const tri = (o, rows = 3) => ["en","lo","zh"].map(l => h("textarea",{class:"input"+(l==="lo"?" lo":""),rows:String(rows),"data-l":l,placeholder:{ en:"English", lo:"ພາສາລາວ", zh:"中文" }[l]}, (o && o[l]) || ""));
    const inst = tri(T.instructions), eta = tri(T.eta, 1);
    let qr = T.qrImage || "";
    const qrBox = h("div",{class:"tr-qr-adm"});
    const drawQr = () => qrBox.replaceChildren(qr ? h("img",{src:qr,alt:"QR"}) : h("span",{class:"small muted"}, L(["No QR yet","ຍັງບໍ່ມີ QR"])));
    const qrFile = h("input",{type:"file",accept:"image/png,image/jpeg,image/webp",hidden:true,onchange:async e=>{ const f = e.target.files[0]; e.target.value = ""; if (!f) return;
      try { const small = await shrinkPhoto(f, 900);
        try { qr = await uploadChecked(small, "image", "payments"); } catch(err){ qr = await new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(small); }); }
        drawQr(); toast(L(["QR ready: press Save.","QR ພ້ອມແລ້ວ: ກົດບັນທຶກ."]), "ok"); } catch(err){ toast(errText(err), "err"); } }});
    drawQr();
    const msg = h("p",{class:"small"});
    const val = list => Object.fromEntries(list.map(x => [x.dataset.l, x.value.trim()]));
    return h("section",{class:"panel stack tr-settings"},
      h("h3",null, icon("qr"), " ", L(["Bank transfer (BCEL One QR)","ໂອນເງິນຜ່ານທະນາຄານ (BCEL One QR)"])),
      h("p",{class:"small muted"}, L(["Learners pay by scanning your QR or transferring to your account, then upload the slip. You approve each slip in Payments → Transfers; the plan opens at once. Works without any online payment provider, and is offered first when the card gateway is not connected.",
        "ຜູ້ຮຽນສະແກນ QR ຫຼື ໂອນເຂົ້າບັນຊີ ແລ້ວອັບໂຫຼດສະລິບ. ທ່ານອະນຸມັດໃນ ການຈ່າຍເງິນ → ໂອນເງິນ."])),
      h("label",{class:"row"}, on, h("b",null, L(["Offer bank transfer to learners","ເປີດໃຫ້ຜູ້ຮຽນໂອນເງິນ"]))),
      h("div",{class:"tr-set-grid"},
        h("div",{class:"stack",style:"gap:8px"}, h("span",{class:"lbl"}, L(["Your QR code (from BCEL One: My QR)","QR ຂອງທ່ານ"])), qrBox,
          h("div",{class:"row"}, h("button",{type:"button",class:"btn sm",onclick:()=>qrFile.click()}, icon("upload"), L(["Upload QR","ອັບໂຫຼດ QR"])),
            h("button",{type:"button",class:"btn sm ghost",onclick:()=>{ qr = ""; drawQr(); }}, icon("trash"), t("remove"))), qrFile),
        h("div",{class:"stack",style:"gap:8px"},
          h("div",{class:"field"}, h("span",{class:"lbl"}, L(["Bank","ທະນາຄານ"])), bank),
          h("div",{class:"field"}, h("span",{class:"lbl"}, L(["Account name","ຊື່ບັນຊີ"])), name),
          h("div",{class:"field"}, h("span",{class:"lbl"}, L(["Account number","ເລກບັນຊີ"])), num),
          h("div",{class:"field"}, h("span",{class:"lbl"}, L(["Currency learners pay in","ສະກຸນເງິນ"])), cur))),
      h("div",{class:"field"}, h("span",{class:"lbl"}, L(["Instructions (optional)","ຄຳແນະນຳ"])), h("div",{class:"field-row"}, inst)),
      h("div",{class:"field"}, h("span",{class:"lbl"}, L(["How long approval takes (shown while waiting, optional)","ໄລຍະເວລາອະນຸມັດ"])), h("div",{class:"field-row"}, eta),
        h("span",{class:"help"}, L(["For example: We check slips every day between 8:00 and 20:00, usually within 2 hours.","ຕົວຢ່າງ: ພວກເຮົາກວດທຸກມື້ 8:00-20:00."]))),
      h("div",{class:"row"}, h("button",{class:"btn primary",onclick:async()=>{
        if (on.checked && !qr && !num.value.trim()){ msg.textContent = L(["Add your QR or your account number first.","ໃສ່ QR ຫຼື ເລກບັນຊີກ່ອນ."]); msg.style.color = "var(--bad)"; return; }
        const next = Object.assign({}, pay, { transfer: { enabled: on.checked, bank: bank.value.trim() || "BCEL One", accountName: name.value.trim(), accountNumber: num.value.trim(), qrImage: qr,
          instructions: val(inst), eta: val(eta) }, currency: Object.assign({}, pay.currency, { transfer: cur.value }) });
        try { await S.api.db.set("settings/app", { payments: next }, true); Object.assign(pay, next); msg.textContent = t("saved_ok"); msg.style.color = "var(--jade)"; }
        catch(e){ msg.textContent = errText(e); msg.style.color = "var(--bad)"; }
      }}, t("save")), msg));
  }

  const pane = h("div");
  const tabsEl = h("div",{class:"seg",role:"tablist"});
  const showTab = async k => {
    tab = k;
    tabsEl.querySelectorAll("button").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.k === k)));
    pane.replaceChildren(k === "transfers" ? transfersPane : k === "orders" ? ordersPane : k === "payments" ? paymentsPane : await settingsPane());
  };
  if (!p.tab && slipsWaiting.length) tab = "transfers";          // slips waiting: open on them
  const TABN = { transfers: [slipsWaiting.length, ""], orders: [orders.length, " soft"], payments: [payments.length, " soft"] };
  [["transfers", L(["Transfers","ໂອນເງິນ"])], ["orders", L(["Orders","ຄຳສັ່ງຊື້"])], ["payments", L(["Transactions","ທຸລະກຳ"])], ["settings", L(["Settings","ຕັ້ງຄ່າ"])]].forEach(([k, label]) =>
    tabsEl.append(h("button",{"data-k":k,"aria-pressed":String(tab===k),onclick:()=>showTab(k)}, label, TABN[k] && TABN[k][0] ? h("span",{class:"tr-badge"+TABN[k][1]}, String(TABN[k][0])) : null)));
  drawOrders(); drawTransfers();
  const wrap = h("div",{class:"stack-l"},
    h("div",{class:"pagehead"}, h("h1",null, L(["Payments","ການຈ່າຍເງິນ"])), h("p",null, L(["Orders, provider transactions and refunds. Card numbers are never stored: only the brand and last 4 digits the provider reports.",
      "ຄຳສັ່ງຊື້, ທຸລະກຳ ແລະ ການຄືນເງິນ. ບໍ່ເກັບເລກບັດ: ມີແຕ່ປະເພດບັດ ແລະ 4 ຕົວສຸດທ້າຍ."]))),
    tiles, tabsEl, pane);
  await showTab(tab);
  return wrap;
}

// Learner page: this learner's orders (support and super admin)
export async function learnerPaymentsPanel(uid){
  const orders = (await S.api.db.list("orders").catch(() => [])).filter(o => o.uid === uid).sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  return h("section",{class:"panel"}, h("h3",null, L(["Payments","ການຈ່າຍເງິນ"])),
    orders.length ? h("div",{class:"feed"}, orders.slice(0, 12).map(o => h("div",{class:"feed-row"},
      h("span",{class:"small"}, h("code",null,o.id), " · "+planName(o.planId)+" · "+cyc(o.cycle)+" · "+money(o.amount, o.currency, lang())), pill(o.status))))
      : h("p",{class:"small muted"}, L(["No payments. Plans given by an admin do not create payments.","ບໍ່ມີການຈ່າຍເງິນ. ແພັກທີ່ admin ມອບໃຫ້ບໍ່ສ້າງການຈ່າຍເງິນ."])));
}
