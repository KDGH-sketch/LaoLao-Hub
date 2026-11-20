// Admin notifications (docs/NOTIFICATIONS.md): a bell in the admin top bar and a count on Payments & Orders in the menu.
// What needs someone: transfer slips waiting for approval, orders flagged "Needs review" (a payment that did not match),
// and new paid orders. A new slip drops in as an alert card with a chime, so it is not missed. Checked every 45 s while
// the admin is open (support, admin and Super Admin: those who may approve).
import { h, icon, fmtDate } from "../shared/ui.js";
import { lang } from "../shared/i18n.js";
import { money } from "../shared/billing.js";
import { sfx } from "../shared/sfx.js";
import { S, L, go, canSupport, planName } from "./state.js";

const SEEN = () => "laolao.anotify.seen:" + (S.me && S.me.uid);
const SNAP = () => "laolao.anotify.slips:" + (S.me && S.me.uid);
const read = (k, d) => { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch(e){ return d; } };
const write = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch(e){} };
const ago = ms => { const m = Math.round((Date.now() - ms) / 6e4); return m < 1 ? L(["now","ດຽວນີ້"]) : m < 60 ? m + " " + L(["min","ນາທີ"]) : m < 1440 ? Math.round(m / 60) + " " + L(["h","ຊມ"]) : fmtDate(ms, lang()); };

let orders = [], users = {}, timer = null, bellEl = null, started = false;
export const waitingSlips = () => orders.filter(o => o.method === "transfer" && o.status === "review");

function items(){
  const out = [], who = uid => (users[uid] && (users[uid].name || users[uid].email)) || String(uid || "").slice(0, 8);
  for (const o of waitingSlips()) out.push({ id: "slip:" + o.id + ":" + o.slipAt, at: o.slipAt || o.createdAt, kind: "wait", ic: "qr", urgent: true,
    title: L(["Transfer slip to approve","ສະລິບລໍຖ້າອະນຸມັດ"]), text: who(o.uid) + " · " + money(o.amount, o.currency, lang()) + " · " + planName(o.planId) + (o.slipDupOf ? " · ⚠ " + L(["same image as another order","ຮູບຊ້ຳ"]) : ""), go: ["payments", { tab: "transfers" }] });
  for (const o of orders.filter(o => o.needsReview)) out.push({ id: "rev:" + o.id, at: o.createdAt, kind: "bad", ic: "info", urgent: true,
    title: L(["Payment needs review","ການຈ່າຍຕ້ອງກວດສອບ"]), text: o.id + " · " + who(o.uid), go: ["payments", { review: 1 }] });
  for (const o of orders.filter(o => o.status === "paid" && o.paidAt > Date.now() - 7 * 864e5)) out.push({ id: "paid:" + o.id, at: o.paidAt, kind: "good", ic: "wallet",
    title: L(["New payment","ການຈ່າຍໃໝ່"]), text: who(o.uid) + " · " + money(o.amount, o.currency, lang()) + " · " + planName(o.planId), go: ["payments", {}] });
  return out.sort((a, b) => (b.urgent - a.urgent) || (b.at - a.at)).slice(0, 30);
}
const count = () => { const seen = read(SEEN(), 0); return items().filter(n => n.urgent || n.at > seen).length; };

export function adminBell(){
  if (!canSupport()) return null;
  bellEl = h("button", { class: "nb", type: "button", "aria-label": L(["Notifications","ການແຈ້ງເຕືອນ"]), title: L(["Notifications","ການແຈ້ງເຕືອນ"]), onclick: () => openPanel() },
    icon("bell"), h("span", { class: "nb-badge", hidden: true, "aria-hidden": "true" }));
  draw(false); setTimeout(() => draw(false), 0);        // the menu is in the page a moment later
  if (!started){ started = true; check(true); document.addEventListener("visibilitychange", () => { if (!document.hidden) check(); }); }
  return bellEl;
}
function draw(ring){
  const n = count();
  if (bellEl){ const b = bellEl.querySelector(".nb-badge"); b.hidden = !n; b.textContent = n > 9 ? "9+" : String(n);
    if (ring && n){ bellEl.classList.remove("ring"); void bellEl.offsetWidth; bellEl.classList.add("ring"); } }
  // the menu: a count on Payments & Orders while slips wait
  const slot = document.querySelector('.nav-btn[data-key="payments"] .sn-extra');
  if (slot){ const w = waitingSlips().length; slot.replaceChildren(w ? h("span", { class: "nav-count", title: L(["Transfers to approve","ໂອນເງິນລໍຖ້າ"]) }, String(w)) : ""); }
}
async function check(first = false){
  clearTimeout(timer);
  if (!canSupport()) return;
  try {
    const [o, u] = await Promise.all([S.api.db.list("orders"), Object.keys(users).length ? Promise.resolve(null) : S.api.db.list("users").catch(() => [])]);
    orders = o; if (u) users = Object.fromEntries(u.map(x => [x.id, x]));
    // a slip that was not there last time: an alert
    const before = read(SNAP(), null), now = waitingSlips().map(x => x.id);
    write(SNAP(), now);
    const fresh = before ? waitingSlips().filter(x => !before.includes(x.id)) : [];
    if (fresh.length) spotlight(fresh);
  } catch(e){}
  draw(!first);
  timer = setTimeout(() => check(), document.hidden ? 120000 : 45000);
}
export const refreshAdminNotify = () => check();

function spotlight(list){
  document.querySelectorAll(".nspot").forEach(x => x.remove());
  const o = list[0], u = users[o.uid] || {};
  const close = () => { card.classList.add("out"); setTimeout(() => card.remove(), 260); };
  const card = h("div", { class: "nspot k-wait", role: "alert" }, h("span", { class: "nspot-ic" }, icon("qr")),
    h("div", { class: "nspot-tx" }, h("b", null, list.length > 1 ? L(["New transfer slips: ","ສະລິບໃໝ່: "]) + list.length : L(["New transfer slip","ສະລິບການໂອນໃໝ່"])),
      h("p", null, (u.name || u.email || "") + " · " + money(o.amount, o.currency, lang()) + " · " + planName(o.planId)),
      h("button", { class: "btn sm primary", onclick: () => { close(); go("payments", { tab: "transfers" }); } }, L(["Review now","ກວດດຽວນີ້"]))),
    h("button", { class: "ib nspot-x", "aria-label": "Close", onclick: close }, icon("x")));
  document.body.append(card);
  try { sfx("goal"); } catch(e){}
  setTimeout(() => { if (card.isConnected) close(); }, 16000);
}

function openPanel(){
  if (document.querySelector(".npanel:not(.out)")) return closePanel();
  const list = items(), seen = read(SEEN(), 0);
  const panel = h("div", { class: "npanel", role: "dialog", "aria-label": L(["Notifications","ການແຈ້ງເຕືອນ"]) },
    h("div", { class: "npanel-h" }, h("b", null, L(["Notifications","ການແຈ້ງເຕືອນ"])), h("button", { class: "ib", "aria-label": "Close", onclick: closePanel }, icon("x"))),
    h("div", { class: "npanel-b" }, list.length ? h("ul", { class: "nlist" }, list.map((n, i) => h("li", { class: "nitem k-" + n.kind + (n.urgent || n.at > seen ? " new" : ""), style: "--i:" + i },
      h("button", { type: "button", onclick: () => { closePanel(); go(n.go[0], n.go[1]); } }, h("span", { class: "nitem-ic" }, icon(n.ic)),
        h("span", { class: "nitem-tx" }, h("b", null, n.title), h("span", null, n.text), h("small", null, ago(n.at))),
        n.urgent ? h("i", { class: "nitem-dot" }) : null)))) :
      h("div", { class: "nempty" }, h("span", null, icon("check")), h("b", null, L(["All caught up","ບໍ່ມີຫຍັງຄ້າງ"])), h("p", { class: "small muted" }, L(["New slips and payments appear here.","ສະລິບ ແລະ ການຈ່າຍໃໝ່ຈະສະແດງທີ່ນີ້."])))));
  const scrim = h("div", { class: "npanel-scrim", onclick: closePanel });
  document.body.append(scrim, panel);
  write(SEEN(), Date.now()); draw(false);
}
function closePanel(){ document.querySelectorAll(".npanel:not(.out),.npanel-scrim:not(.out)").forEach(x => { x.classList.add("out"); setTimeout(() => x.remove(), 200); }); }
