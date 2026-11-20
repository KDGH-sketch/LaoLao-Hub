// Pay by bank transfer (BCEL One QR or account number), then send the slip; an admin approves it (docs/PAYMENTS.md →
// Bank transfer). Three steps on one page: 1 pay (QR, account, the exact amount, the order code for the note),
// 2 send the slip (photo or screenshot, shrunk in the browser), 3 approval (the page checks by itself and opens the plan
// as soon as it is approved). The order and its amount come from the database (ll_create_order); the slip goes through
// ll_submit_slip; nothing here can approve a payment.
import { h, icon, toast, tr, fmtDate, reducedMotion } from "../shared/ui.js";
import { t, lang } from "../shared/i18n.js";
import { money, TRANSFER_OPEN } from "../shared/billing.js";
import { shrinkPhoto, kb } from "../shared/image.js";
import { A, refreshAccess } from "./core.js";
import { planLabel } from "./upgrade.js";
import { errorText } from "./views-billing.js";

export const VIEWS = {};
const go = (...a) => A.go(...a);
const L = o => tr(o, lang());
const planById = id => (A.plans || []).find(p => p.id === id) || null;
const keep = k => k.flat(Infinity).filter(x => x != null && x !== false);
const fill = (el, ...k) => el.replaceChildren(...keep(k));
const pad = n => String(n).padStart(2, "0");
const localNow = () => { const d = new Date(); return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()) + "T" + pad(d.getHours()) + ":" + pad(d.getMinutes()); };
const readAsDataURL = file => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(file); });
async function copy(text, what){
  try { await navigator.clipboard.writeText(text); toast(t("tr_copied", { w: what }), "ok"); }
  catch(e){ toast(text); }
}
const copyBtn = (text, what) => h("button", { type: "button", class: "ib tr-copy", "aria-label": t("tr_copy") + ": " + what, title: t("tr_copy"), onclick: () => copy(text, what) }, icon("copy"));

VIEWS.transfer = async (params = {}) => {
  const id = params.order;
  const root = h("div", { class: "stack-l tr-page" });
  const back = h("button", { class: "btn ghost sm", onclick: () => go("plans") }, icon("left"), t("bl_back_plans"));
  if (!id || !/^LLH-[0-9A-F]{10}$/.test(id)){ fill(root, back, h("div", { class: "empty" }, t("bl_err_order"))); return root; }
  const T = (A.settings && A.settings.payments && A.settings.payments.transfer) || {};
  let o;
  try { o = await A.api.pay.order(id); }
  catch(e){ fill(root, back, h("div", { class: "banner" }, errorText(e.code || "server_error"))); return root; }
  if (o.status === "paid"){ go("payment", { order: id }); return root; }

  const plan = planById(o.planId), amount = money(o.amount, o.currency, lang());
  const steps = h("ol", { class: "tr-steps", "aria-label": t("tr_steps") });
  const gridEl = h("div", { class: "tr-grid" });
  const right = h("section", { class: "card tr-card tr-right" });
  let timer = null;
  const stop = () => { clearTimeout(timer); timer = null; };

  function drawSteps(){
    const at = o.status === "review" ? 3 : 2;           // created / rejected: paying and sending the slip
    fill(steps, [["tr_step_pay", "qr"], ["tr_step_slip", "upload"], ["tr_step_ok", "crown"]].map(([k, ic], i) =>
      h("li", { class: (i + 1 < at ? "done" : i + 1 === at ? "now" : "") }, h("span", { class: "tr-dot" }, icon(i + 1 < at ? "check" : ic)), h("span", null, t(k)))));
  }

  // ----- step 1: how to pay -----
  const qr = T.qrImage && /^https:\/\/|^data:image\//.test(T.qrImage) ? T.qrImage : null;
  const row = (label, value, copyable) => value ? h("div", { class: "tr-row" }, h("span", { class: "tr-k" }, label), h("b", { class: "tr-v" }, value), copyable ? copyBtn(String(value).replace(/\s+/g, ""), label) : null) : null;
  const payCard = h("section", { class: "card tr-card tr-pay" },
    h("div", { class: "tr-amount" }, h("span", null, t("tr_amount")), h("b", null, amount), copyBtn(String(o.amount), t("tr_amount")),
      h("small", null, (planLabel(plan) || o.planId) + " · " + t(o.cycle === "year" ? "bl_yearly" : "bl_monthly"))),
    qr ? h("figure", { class: "tr-qr" }, h("img", { src: qr, alt: t("tr_qr_alt"), loading: "eager" }),
      h("figcaption", null, icon("qr"), t("tr_qr_d")),
      h("a", { class: "btn sm", href: qr, download: "laolao-qr.png" }, icon("download"), t("tr_save_qr"))) : null,
    h("div", { class: "tr-acct" },
      row(t("tr_bank"), T.bank || "BCEL One"), row(t("tr_acct_name"), T.accountName, true), row(t("tr_acct_no"), T.accountNumber, true)),
    h("div", { class: "tr-ref" }, h("span", null, icon("edit"), t("tr_ref_note")), h("code", null, o.id), copyBtn(o.id, t("tr_order"))),
    L(T.instructions) ? h("p", { class: "small muted tr-inst" + (lang() === "lo" ? " lo" : "") }, L(T.instructions)) : null);

  // ----- step 2: the slip -----
  function slipForm(){
    let image = null;
    const preview = h("div", { class: "tr-preview", hidden: true });
    const file = h("input", { type: "file", accept: "image/png,image/jpeg,image/webp", hidden: true, onchange: async e => {
      const f = e.target.files && e.target.files[0]; e.target.value = ""; if (!f) return;
      if (!/^image\/(png|jpeg|webp)$/.test(f.type)){ toast(t("tr_err_type"), "err"); return; }
      drop.classList.add("busy");
      try {
        const small = await shrinkPhoto(f, 1400);
        image = await readAsDataURL(small);
        if (image.length > 3000000){ image = null; toast(t("tr_err_big"), "err"); return; }
        fill(preview, h("img", { src: image, alt: t("tr_slip_alt") }), h("span", { class: "small muted" }, f.name + " · " + kb(small.size)),
          h("button", { type: "button", class: "btn sm ghost", onclick: () => file.click() }, icon("repeat"), t("tr_change")));
        preview.hidden = false; drop.hidden = true; send.disabled = false;
      } catch(err){ toast(t("tr_err_type"), "err"); }
      finally { drop.classList.remove("busy"); }
    } });
    const drop = h("label", { class: "tr-drop", tabindex: "0", onkeydown: e => { if (e.key === "Enter" || e.key === " "){ e.preventDefault(); file.click(); } } },
      h("span", { class: "tr-drop-ic" }, icon("upload")), h("b", null, t("tr_drop")), h("span", { class: "small muted" }, t("tr_drop_d")), file);
    ["dragover", "dragenter"].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.add("over"); }));
    ["dragleave", "drop"].forEach(ev => drop.addEventListener(ev, () => drop.classList.remove("over")));
    drop.addEventListener("drop", e => { e.preventDefault(); const f = e.dataTransfer.files && e.dataTransfer.files[0]; if (f){ const dt = new DataTransfer(); dt.items.add(f); file.files = dt.files; file.dispatchEvent(new Event("change")); } });
    const ref = h("input", { class: "input", id: "tr-ref", maxlength: "60", autocomplete: "off", placeholder: t("tr_txn_ph") });
    const when = h("input", { class: "input", id: "tr-when", type: "datetime-local", value: localNow() });
    const note = h("input", { class: "input", id: "tr-note", maxlength: "300", placeholder: t("tr_note_ph") });
    const msg = h("p", { class: "small tr-msg", role: "alert" });
    const send = h("button", { class: "btn primary tr-send", type: "button", disabled: true, onclick: async () => {
      if (!image) return;
      send.disabled = true; msg.textContent = ""; send.replaceChildren(h("span", { class: "bill-spin", "aria-hidden": "true" }), t("tr_sending"));
      try {
        o = await A.api.pay.submitSlip(id, { image, ref: ref.value.trim(), paidAt: when.value ? new Date(when.value).getTime() : Date.now(), note: note.value.trim() });
        o = Object.assign({ id }, o);
        toast(t("tr_sent_toast"), "ok"); draw(); poll();
      } catch(e){ msg.textContent = errorText(e.code || e.message); send.disabled = false; send.replaceChildren(icon("send"), t("tr_send")); }
    } }, icon("send"), t("tr_send"));
    return [
      o.status === "rejected" ? h("div", { class: "tr-rejected", role: "status" }, icon("info"), h("div", null, h("b", null, t("tr_rejected")),
        o.rejectReason ? h("p", null, o.rejectReason) : null, h("p", { class: "small" }, t("tr_rejected_d")))) : null,
      h("h2", null, h("span", { class: "tr-num" }, "2"), t("tr_step_slip")),
      h("p", { class: "small muted" }, t("tr_slip_d")),
      drop, preview,
      h("div", { class: "field" }, h("label", { for: "tr-ref" }, t("tr_txn")), ref, h("span", { class: "help" }, t("tr_txn_help"))),
      h("div", { class: "field-row" }, h("div", { class: "field" }, h("label", { for: "tr-when" }, t("tr_when")), when), h("div", { class: "field" }, h("label", { for: "tr-note" }, t("tr_note")), note)),
      send, msg];
  }

  // ----- step 3: waiting for approval -----
  async function waiting(){
    const slip = await A.api.pay.slip(id).catch(() => null);
    return [
      h("div", { class: "tr-wait" }, h("span", { class: "tr-hourglass", "aria-hidden": "true" }, icon("hourglass")),
        h("h2", null, t("tr_review_t")), h("p", { class: "muted" }, L(T.eta) || t("tr_review_d"))),
      h("ol", { class: "tr-timeline" },
        h("li", { class: "done" }, icon("check"), h("span", null, t("tr_tl_sent")), h("small", null, fmtDate(o.slipAt, lang(), true))),
        h("li", { class: "now" }, h("span", { class: "bill-spin", "aria-hidden": "true" }), h("span", null, t("tr_tl_check"))),
        h("li", null, icon("crown"), h("span", null, t("tr_tl_active", { p: planLabel(plan) || o.planId })))),
      slip && slip.image ? h("details", { class: "tr-mine" }, h("summary", null, icon("image"), t("tr_your_slip")),
        h("img", { src: slip.image, alt: t("tr_slip_alt") }), slip.ref ? h("p", { class: "small" }, t("tr_txn") + ": ", h("b", null, slip.ref)) : null) : null,
      h("div", { class: "row" },
        h("button", { class: "btn", onclick: () => { stop(); load(); } }, icon("repeat"), t("bl_check_again")),
        h("button", { class: "btn ghost", onclick: () => { stop(); o = Object.assign({}, o, { status: "rejected", rejectReason: "" }); draw(true); } }, icon("upload"), t("tr_replace"))),
      h("p", { class: "small muted" }, t("tr_keep_learning"))];
  }

  async function draw(replacing = false){
    drawSteps();
    gridEl.classList.toggle("review", o.status === "review" && !replacing);      // phones: the status first while waiting
    if (o.status === "paid"){ stop(); await refreshAccess().catch(() => {}); go("payment", { order: id }); return; }
    if (!TRANSFER_OPEN.includes(o.status)){                 // expired / cancelled
      stop();
      fill(right, h("div", { class: "tr-wait" }, h("span", { class: "tr-hourglass off" }, icon("clock")), h("h2", null, t("bl_os_" + o.status)), h("p", { class: "muted" }, t("tr_closed_d"))),
        h("button", { class: "btn primary", onclick: () => go("checkout", { plan: o.planId, cycle: o.cycle }) }, t("tr_start_again")));
      return;
    }
    fill(right, ...(o.status === "review" && !replacing ? await waiting() : slipForm()));
  }
  async function load(){
    try { const n = await A.api.pay.order(id); const changed = n.status !== o.status; o = n; if (changed || n.status !== "review") draw(); else poll(); }
    catch(e){ poll(); }
  }
  // while the slip is being checked: ask again every 15 s (slower after 5 minutes), only while this page is open
  let tries = 0;
  function poll(){ stop(); if (o.status !== "review") return; timer = setTimeout(() => { if (!root.isConnected && tries > 0) return; tries++; load(); }, tries < 20 ? 15000 : 60000); }

  await draw();
  if (o.status === "review") poll();
  fill(root, back,
    h("div", { class: "pagehead tr-head" }, h("h1", null, t("tr_title")), h("p", null, t("tr_sub"))),
    steps,
    (gridEl.append(h("div", { class: "tr-left" }, h("h2", { class: "tr-h1" }, h("span", { class: "tr-num" }, "1"), t("tr_step_pay")), payCard), right), gridEl));
  if (!reducedMotion()) root.classList.add("tr-in");
  return root;
};
