// Admin → Payments: orders, payment transactions, refunds and payment settings.
// Admins can see what learners bought and what the provider reported (card brand and last 4 digits at most, never card numbers).
// Nobody marks an order paid here: only a verified provider result does (supabase/functions/payments). Refunds go through
// the provider, or are recorded with the provider's refund reference when made in its merchant portal. See docs/PAYMENTS.md.
import { h, icon, toast, dialog, confirmDialog, fmtDate, errText } from "../shared/ui.js";
import { lang } from "../shared/i18n.js";
import { METHODS, CURRENCIES, money, methodCurrency } from "../shared/billing.js";
import { S, L, t, isSuper, canSupport, planName, lockedScreen } from "./state.js";

const STATUS = { created:["Started","ເລີ່ມແລ້ວ"], pending:["Pending","ລໍຖ້າ"], paid:["Paid","ຈ່າຍແລ້ວ"], failed:["Failed","ບໍ່ສຳເລັດ"], cancelled:["Cancelled","ຍົກເລີກ"],
  expired:["Expired","ໝົດເວລາ"], refunded:["Refunded","ຄືນເງິນແລ້ວ"], duplicate:["Duplicate","ຊ້ຳ"], mismatch:["Mismatch","ບໍ່ກົງກັນ"] };
const PILL = { paid:"active", pending:"draft", created:"draft", failed:"expired", mismatch:"expired", duplicate:"expired", cancelled:"cancelled", expired:"cancelled", refunded:"archived" };
const pill = s => h("span",{class:"pill "+(PILL[s]||"none")}, L(STATUS[s] || [s]));
const cyc = c => L(c === "year" ? ["Yearly","ລາຍປີ"] : ["Monthly","ລາຍເດືອນ"]);
const mName = m => (METHODS[m] && METHODS[m].brand) || m || "—";
const ERR = { forbidden:["Only a Super Admin can refund.","ສະເພາະ Super Admin ຄືນເງິນໄດ້."], refund_reference_required:["Enter the refund reference from the provider's portal.","ໃສ່ເລກອ້າງອີງການຄືນເງິນຈາກລະບົບຂອງທະນາຄານ."],
  already_refunded:["Already refunded.","ຄືນເງິນແລ້ວ."], order_not_paid:["Only paid orders can be refunded.","ຄືນເງິນໄດ້ສະເພາະຄຳສັ່ງທີ່ຈ່າຍແລ້ວ."],
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
  let tab = ["orders","payments","settings"].includes(p.tab) ? p.tab : "orders";

  // ---- summary ----
  const since = new Date(); since.setDate(1); since.setHours(0, 0, 0, 0);
  const paidMonth = {}; orders.filter(o => o.status === "paid" && (o.paidAt || 0) >= since.getTime()).forEach(o => paidMonth[o.currency] = (paidMonth[o.currency] || 0) + (+o.amount || 0));
  const review = orders.filter(o => o.needsReview);
  const tile = (label, value, ic, cls = "") => h("div",{class:"panel pay-tile "+cls}, h("span",{class:"pay-tile-ic"}, icon(ic)), h("div",null, h("div",{class:"small muted"}, label), h("b",null, value)));
  const tiles = h("div",{class:"pay-tiles"},
    tile(L(["Received this month","ຮັບເງິນເດືອນນີ້"]), Object.keys(paidMonth).length ? Object.entries(paidMonth).map(([c, v]) => money(v, c, lang())).join(" · ") : "—", "wallet"),
    tile(L(["Paid orders","ຄຳສັ່ງທີ່ຈ່າຍແລ້ວ"]), String(orders.filter(o => o.status === "paid").length), "check"),
    tile(L(["Waiting for payment","ລໍຖ້າການຈ່າຍ"]), String(orders.filter(o => ["created","pending"].includes(o.status)).length), "clock"),
    tile(L(["Needs review","ຕ້ອງກວດສອບ"]), String(review.length), "info", review.length ? "warn" : ""));

  // ---- orders ----
  let q = "", fs = review.length && p.review ? "review" : "";
  const obody = h("tbody");
  const drawOrders = () => {
    const f = q.trim().toLowerCase();
    const list = orders.filter(o => (!fs || (fs === "review" ? o.needsReview : o.status === fs))
      && (!f || o.id.toLowerCase().includes(f) || ((who[o.uid] && ((who[o.uid].email || "") + " " + (who[o.uid].name || ""))) || "").toLowerCase().includes(f)));
    obody.replaceChildren(...list.map(o => h("tr",{class:"clickable",onclick:()=>orderDialog(o)},
      h("td",null, h("code",{class:"small"}, o.id), o.needsReview ? h("div",null, h("span",{class:"pill expired"}, L(["Review","ກວດສອບ"]))) : null),
      h("td",null, person(o.uid)),
      h("td",null, planName(o.planId), h("div",{class:"small muted"}, cyc(o.cycle))),
      h("td",{class:"tabnum"}, money(o.amount, o.currency, lang())),
      h("td",null, mName(o.method), h("div",{class:"small muted"}, o.provider || "—")),
      h("td",null, pill(o.status)),
      h("td",{class:"small tabnum"}, fmtDate(o.createdAt, lang(), true)),
      h("td",{class:"small tabnum"}, o.paidAt ? fmtDate(o.paidAt, lang(), true) : "—"))));
    if (!list.length) obody.append(h("tr",null, h("td",{colspan:"8",class:"muted"}, t("no_rows"))));
  };
  const ordersPane = h("div",{class:"stack"},
    h("div",{class:"toolbar"},
      h("input",{class:"input grow",placeholder:L(["Search order number, name or email","ຄົ້ນຫາເລກຄຳສັ່ງ, ຊື່ ຫຼື ອີເມວ"]),oninput:e=>{ q = e.target.value; drawOrders(); }}),
      h("select",{class:"input","aria-label":t("status"),onchange:e=>{ fs = e.target.value; drawOrders(); }},
        h("option",{value:""}, t("status")+": "+t("all")), h("option",{value:"review",selected:fs==="review"}, L(["Needs review","ຕ້ອງກວດສອບ"])),
        ["paid","pending","created","failed","cancelled","expired","refunded"].map(s => h("option",{value:s}, L(STATUS[s]))))),
    h("div",{class:"tbl-wrap"}, h("table",{class:"tbl"}, h("thead",null, h("tr",null,
      [L(["Order","ຄຳສັ່ງ"]), t("learner"), t("plan"), L(["Amount","ຈຳນວນ"]), L(["Method","ວິທີຈ່າຍ"]), t("status"), L(["Created","ສ້າງເມື່ອ"]), L(["Paid","ຈ່າຍເມື່ອ"])].map(x => h("th",null,x)))), obody)));

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

  // ---- settings (Super Admin) ----
  async function settingsPane(){
    if (!isSuper()) return h("p",{class:"muted"}, t("only_super"));
    const app = (await S.api.db.get("settings/app").catch(() => null)) || {};
    const pay = Object.assign({ enabled:false, methods:[], currency:{} }, app.payments || {});
    const cfg = await S.api.pay.config().catch(() => ({ provider:null, methods:[] }));
    const enabled = h("input",{type:"checkbox",class:"switch",checked:pay.enabled === true});
    const rows = Object.entries(METHODS).map(([m, info]) => {
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
      h("section",{class:"panel stack"}, h("h3",null, L(["Online checkout","ການຈ່າຍເງິນອອນລາຍ"])),
        h("label",{class:"row"}, enabled, L(["Learners can buy plans online","ຜູ້ຮຽນຊື້ແພັກເກດອອນລາຍໄດ້"])),
        h("p",{class:"small muted"}, L(["Methods offered, and the currency each one charges in. Prices come from each plan (Pricing Plans).","ວິທີຈ່າຍທີ່ເປີດ ແລະ ສະກຸນເງິນ. ລາຄາມາຈາກແຕ່ລະແພັກເກດ."])),
        h("div",{class:"stack",style:"gap:8px"}, rows.map(r => r.el)),
        h("div",{class:"row"}, h("button",{class:"btn primary",onclick:async()=>{
          const next = { enabled: enabled.checked, methods: rows.filter(r => r.on.checked).map(r => r.m), currency: Object.fromEntries(rows.map(r => [r.m, r.cur.value])) };
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

  const pane = h("div");
  const tabsEl = h("div",{class:"seg",role:"tablist"});
  const showTab = async k => {
    tab = k;
    tabsEl.querySelectorAll("button").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.k === k)));
    pane.replaceChildren(k === "orders" ? ordersPane : k === "payments" ? paymentsPane : await settingsPane());
  };
  [["orders", L(["Orders","ຄຳສັ່ງຊື້"])], ["payments", L(["Transactions","ທຸລະກຳ"])], ["settings", L(["Settings","ຕັ້ງຄ່າ"])]].forEach(([k, label]) =>
    tabsEl.append(h("button",{"data-k":k,"aria-pressed":String(tab===k),onclick:()=>showTab(k)}, label)));
  drawOrders();
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
