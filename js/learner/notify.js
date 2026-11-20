// Notifications for learners (docs/NOTIFICATIONS.md): a bell in the top bar with an unread count, an eye-catching alert
// the moment something changes (a transfer approved or rejected, a message from the team), and a panel with two tabs:
//   Updates        payment news, messages from the team, the plan ending soon, Lao events today and tomorrow
//   Smart Calendar the learner's own time line: days left on the plan, when it ends and when to renew, their payments
//                  and transfers, and the Lao life calendar's coming events, to check by themselves
// Everything comes from what the learner may read anyway (their own orders and plan, the public life calendar). The app
// checks their orders every 45 s while open and when it comes back to the front; what was already shown is remembered in
// this browser (localStorage), so a change made while they were away is announced at the next visit.
import { h, icon, fmtDate, reducedMotion } from "../shared/ui.js";
import { t, lang } from "../shared/i18n.js";
import { money, TRANSFER_OPEN } from "../shared/billing.js";
import { sfx } from "../shared/sfx.js";
import { A, refreshAccess } from "./core.js";
import { planLabel } from "./upgrade.js";
import { occurrences } from "./welcome-calendar.js";

const DAY = 864e5;
const SEEN = () => "laolao.notify.seen:" + A.user.uid;        // when the panel was last opened
const SNAP = () => "laolao.notify.snap:" + A.user.uid;        // what each order looked like last time (to announce changes)
const read = (k, d) => { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch(e){ return d; } };
const write = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch(e){} };
const planById = id => (A.plans || []).find(p => p.id === id) || null;
const pl = o => planLabel(planById(o.planId)) || o.planId;
const dayStart = d => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x.getTime(); };
const ago = ms => { const m = Math.round((Date.now() - ms) / 6e4); return m < 1 ? t("nt_now") : m < 60 ? t("nt_min", { n: m }) : m < 1440 ? t("nt_hours", { n: Math.round(m / 60) }) : fmtDate(ms, lang()); };

let orders = [], waiting = [], timer = null, bellEl = null, started = false;

// ---------- what to tell the learner ----------
function updates(){
  const out = [], now = Date.now();
  // admins in the learner app: the slips waiting for them (they approve them in Admin → Payments)
  if (A.isAdmin && waiting.length) out.push({ id: "adm:slips:" + waiting.map(o => o.id).join(","), at: Math.max(...waiting.map(o => o.slipAt || 0)), kind: "wait", ic: "shield",
    title: t("nt_adm_slips", { n: waiting.length }), text: t("nt_adm_slips_d"), go: ["__admin", {}] });
  for (const o of orders){
    const tr = o.method === "transfer", view = tr && TRANSFER_OPEN.includes(o.status) ? ["transfer", { order: o.id }] : ["myplan", {}];
    if (tr && o.status === "review" && o.slipAt) out.push({ id: o.id + ":review:" + o.slipAt, at: o.slipAt, kind: "wait", ic: "hourglass", title: t("nt_slip_got"), text: t("nt_slip_got_d", { p: pl(o) }), go: view });
    if (o.status === "rejected" && o.rejectedAt) out.push({ id: o.id + ":rej:" + o.rejectedAt, at: o.rejectedAt, kind: "bad", ic: "info", title: t("nt_rejected"), text: o.rejectReason || t("nt_rejected_d"), go: view });
    if (o.status === "paid" && o.paidAt) out.push({ id: o.id + ":paid", at: Math.max(o.paidAt, o.approvedAt || 0), kind: "good", ic: "crown", title: t("nt_paid", { p: pl(o) }),
      text: o.activatedUntil ? t("nt_paid_d", { d: fmtDate(o.activatedUntil, lang()) }) : money(o.amount, o.currency, lang()), go: ["myplan", {}] });
    if (tr && o.status === "created" && now - (o.createdAt || 0) > 3600e3) out.push({ id: o.id + ":todo", at: o.createdAt + 3600e3, kind: "warn", ic: "qr", title: t("nt_finish"), text: t("nt_finish_d", { p: pl(o), a: money(o.amount, o.currency, lang()) }), go: view });
    for (const m of (o.messages || []).filter(m => m.from === "team" && m.kind !== "rejected"))
      out.push({ id: o.id + ":m:" + m.at, at: m.at, kind: "msg", ic: "send", title: t("nt_msg"), text: m.text, go: view });
  }
  // the plan: ending within a week, or just ended
  const a = A.access || {}, ent = A.ent || {}, exp = +a.expiresAt || 0, p = planById(a.planId);
  if (exp && a.source === "payment" && ["active", "grace"].includes(ent.status) && exp - now < 7 * DAY && exp > now)
    out.push({ id: "ends:" + exp + ":" + dayStart(now), at: dayStart(now), kind: "warn", ic: "clock", title: t("nt_ends", { p: planLabel(p) || "" }),
      text: t("nt_ends_d", { d: fmtDate(exp, lang()), n: Math.max(1, Math.ceil((exp - now) / DAY)) }), go: ["myplan", {}] });
  if (exp && ent.status === "expired" && now - exp < 14 * DAY) out.push({ id: "ended:" + exp, at: exp, kind: "bad", ic: "clock", title: t("nt_ended", { p: planLabel(p) || "" }), text: t("nt_ended_d"), go: ["plans", {}] });
  // Lao life: today and tomorrow
  for (const x of laoEvents(now - DAY, now + 2 * DAY)){
    const d = Math.round((dayStart(x.o.start) - dayStart(now)) / DAY);
    if (d < 0 && dayStart(x.o.end) < dayStart(now)) continue;
    out.push({ id: "ev:" + x.e.id + ":" + dayStart(now), at: dayStart(now), kind: "cal", ic: "calendar", title: (d <= 0 ? t("nt_today") : t("nt_tomorrow")) + ": " + L(x.e.title), text: L(x.e.summary), go: null });
  }
  return out.sort((x, y) => y.at - x.at).slice(0, 40);
}
const L = o => o == null ? "" : typeof o === "string" ? o : (o[lang()] || o.en || "");
function laoEvents(from, to){
  const evs = (A.B && A.B.events) || [], out = [];
  for (const e of evs) if (e && (e.when === "date" || e.when === "yearly") && e.status !== "archived")
    for (const y of [new Date(from).getFullYear(), new Date(to).getFullYear()]) for (const o of occurrences(e, y))
      if (o.end.getTime() + DAY > from && o.start.getTime() < to && !out.some(z => z.e.id === e.id && z.o.start - o.start === 0)) out.push({ e, o });
  return out.sort((a, b) => a.o.start - b.o.start);
}
const unreadCount = () => { const seen = read(SEEN(), 0); return updates().filter(n => n.at > seen).length; };

// ---------- the bell ----------
export function bellButton(){
  if (!A.user) return null;
  const badge = h("span", { class: "nb-badge", hidden: true, "aria-hidden": "true" });
  bellEl = h("button", { class: "nb", type: "button", "aria-label": t("nt_title"), title: t("nt_title"), "aria-haspopup": "dialog", onclick: () => openPanel() }, icon("bell"), badge);
  drawBadge(false);
  if (!started){ started = true; check(true); document.addEventListener("visibilitychange", () => { if (!document.hidden) check(); }); }
  return bellEl;
}
function drawBadge(ring){
  if (!bellEl || !bellEl.isConnected && !bellEl.parentNode) return;
  const n = unreadCount(), b = bellEl.querySelector(".nb-badge");
  b.hidden = !n; b.textContent = n > 9 ? "9+" : String(n);
  bellEl.setAttribute("aria-label", t("nt_title") + (n ? " · " + t("nt_unread", { n }) : ""));
  if (ring && n && !reducedMotion()){ bellEl.classList.remove("ring"); void bellEl.offsetWidth; bellEl.classList.add("ring"); }
}

// ---------- watching the orders ----------
async function check(first = false){
  clearTimeout(timer);
  if (!A.user) return;
  try {
    // RLS: a learner reads only their own orders; an admin reads all of them, so keep only the admin's own here
    const list = await A.api.db.list("orders");
    orders = list.filter(o => o.uid === A.user.uid).sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
    waiting = A.isAdmin ? list.filter(o => o.method === "transfer" && o.status === "review" && o.uid !== A.user.uid) : [];
    announce(first);
  } catch(e){}
  drawBadge(!first);
  timer = setTimeout(() => check(), document.hidden ? 120000 : 45000);
}
// compare with what was shown before: approved / rejected / a new message from the team → a big alert
function announce(first){
  const snap = read(SNAP(), null), next = {};
  for (const o of orders) next[o.id] = o.status + ":" + (o.messages || []).length;
  write(SNAP(), next);
  if (!snap) return;                                         // the very first time on this device: nothing to compare
  for (const o of orders){
    const was = snap[o.id];
    if (!was || was === next[o.id]) continue;
    const [st, nm] = was.split(":");
    if (o.status === "paid" && st !== "paid"){
      refreshAccess().then(() => A.render && A.render()).catch(() => {});
      spotlight({ kind: "good", ic: "crown", title: t("nt_paid", { p: pl(o) }), text: o.activatedUntil ? t("nt_paid_d", { d: fmtDate(o.activatedUntil, lang()) }) : "", go: ["myplan", {}], party: true });
    } else if (o.status === "rejected" && st !== "rejected"){
      spotlight({ kind: "bad", ic: "info", title: t("nt_rejected"), text: o.rejectReason || t("nt_rejected_d"), go: ["transfer", { order: o.id }] });
    } else if ((o.messages || []).length > +nm){
      const m = o.messages[o.messages.length - 1];
      if (m && m.from === "team" && m.kind !== "rejected") spotlight({ kind: "msg", ic: "send", title: t("nt_msg"), text: m.text, go: TRANSFER_OPEN.includes(o.status) && o.method === "transfer" ? ["transfer", { order: o.id }] : ["myplan", {}] });
    }
  }
}

// ---------- the alert: a card that drops in from the top, with a chime (and confetti when a plan opens) ----------
function spotlight(n){
  document.querySelectorAll(".nspot").forEach(x => x.remove());
  const close = () => { card.classList.add("out"); setTimeout(() => card.remove(), 260); };
  const card = h("div", { class: "nspot k-" + n.kind, role: "alert" },
    n.party && !reducedMotion() ? h("div", { class: "nspot-party", "aria-hidden": "true" }, Array.from({ length: 18 }, (_, i) => h("i", { style: "--i:" + i + ";--x:" + (Math.random() * 100).toFixed(0) + "%" }))) : null,
    h("span", { class: "nspot-ic" }, icon(n.ic)),
    h("div", { class: "nspot-tx" }, h("b", null, n.title), n.text ? h("p", null, n.text) : null,
      n.go ? h("button", { class: "btn sm primary", onclick: () => { close(); A.go(n.go[0], n.go[1]); } }, t("nt_view")) : null),
    h("button", { class: "ib nspot-x", "aria-label": t("close"), onclick: close }, icon("x")));
  document.body.append(card);
  try { sfx(n.kind === "good" ? "perfect" : n.kind === "bad" ? "wrong" : "tick"); } catch(e){}
  setTimeout(() => { if (card.isConnected) close(); }, 14000);
}

// ---------- the panel ----------
function openPanel(){
  if (document.querySelector(".npanel:not(.out)")) return closePanel();
  const list = updates(), seen = read(SEEN(), 0);
  let tab = "up";
  const body = h("div", { class: "npanel-b" });
  const unread = list.filter(n => n.at > seen).length;
  const tabs = h("div", { class: "seg npanel-tabs", role: "tablist" },
    h("button", { role: "tab", "aria-selected": "true", onclick: () => setTab("up") }, icon("bell"), t("nt_updates"), unread ? h("span", { class: "nb-count" }, String(unread)) : null),
    h("button", { role: "tab", "aria-selected": "false", onclick: () => setTab("cal") }, icon("calendar"), t("nt_smart_cal")));
  function setTab(k){ tab = k; tabs.querySelectorAll("button").forEach((b, i) => b.setAttribute("aria-selected", String((i === 0) === (k === "up")))); body.replaceChildren(k === "up" ? updatesList(list, seen) : smartCalendar()); }
  const panel = h("div", { class: "npanel", role: "dialog", "aria-label": t("nt_title") },
    h("div", { class: "npanel-h" }, h("b", null, t("nt_title")), h("button", { class: "ib", "aria-label": t("close"), onclick: closePanel }, icon("x"))),
    tabs, body);
  const scrim = h("div", { class: "npanel-scrim", onclick: closePanel });
  document.body.append(scrim, panel);
  setTab(tab);
  write(SEEN(), Date.now()); drawBadge(false);
  document.addEventListener("keydown", escClose);
}
function escClose(e){ if (e.key === "Escape") closePanel(); }
export function closePanel(){
  document.removeEventListener("keydown", escClose);
  document.querySelectorAll(".npanel:not(.out),.npanel-scrim:not(.out)").forEach(x => { x.classList.add("out"); setTimeout(() => x.remove(), 200); });
}
function updatesList(list, seen){
  if (!list.length) return h("div", { class: "nempty" }, h("span", null, icon("bell")), h("b", null, t("nt_empty")), h("p", { class: "small muted" }, t("nt_empty_d")));
  return h("ul", { class: "nlist" }, list.map((n, i) => h("li", { class: "nitem k-" + n.kind + (n.at > seen ? " new" : ""), style: "--i:" + i },
    h("button", { type: "button", disabled: !n.go, onclick: () => { if (!n.go) return; closePanel(); if (n.go[0] === "__admin"){ location.href = "admin/"; return; } A.go(n.go[0], n.go[1]); } },
      h("span", { class: "nitem-ic" }, icon(n.ic)),
      h("span", { class: "nitem-tx" }, h("b", null, n.title), n.text ? h("span", null, n.text) : null, h("small", null, ago(n.at))),
      n.at > seen ? h("i", { class: "nitem-dot", "aria-label": t("nt_new") }) : null))));
}

// ---------- Smart Calendar: the learner's own time line ----------
function smartCalendar(){
  const now = Date.now(), a = A.access || {}, ent = A.ent || {}, p = planById(a.planId);
  const start = +a.start || 0, exp = +a.expiresAt || 0, paid = a.source === "payment" && ["active", "grace"].includes(ent.status) && exp > now;
  // the plan card: days left, how much of the period has passed
  const left = exp ? Math.max(0, Math.ceil((exp - now) / DAY)) : null;
  const pct = paid && start && exp > start ? Math.min(100, Math.max(0, Math.round(100 * (now - start) / (exp - start)))) : 0;
  const card = A.isAdmin ? h("div", { class: "scal-plan" }, h("span", { class: "scal-ring free" }, icon("shield")),
      h("div", null, h("b", null, t("nt_admin_plan")), h("p", { class: "small" }, t("nt_admin_plan_d"))))
    : paid
    ? h("div", { class: "scal-plan" + (left <= 7 ? " soon" : "") },
        h("div", { class: "scal-ring", style: "--p:" + (100 - pct) }, h("b", null, String(left)), h("small", null, t("nt_days_left"))),
        h("div", null, h("b", null, planLabel(p) || a.planId), h("p", { class: "small" }, t("nt_until", { d: fmtDate(exp, lang()) })),
          h("div", { class: "scal-bar" }, h("i", { style: "width:" + pct + "%" })),
          left <= 7 ? h("button", { class: "btn sm primary", onclick: () => { closePanel(); A.go("checkout", { plan: a.planId, cycle: a.billingCycle || "month" }); } }, icon("repeat"), t("bl_renew")) : null))
    : h("div", { class: "scal-plan free" }, h("span", { class: "scal-ring free" }, icon("star")),
        h("div", null, h("b", null, planLabel(p) || t("nt_free")), h("p", { class: "small" }, ent.status === "expired" && exp ? t("nt_ended_on", { d: fmtDate(exp, lang()) }) : t("nt_free_d")),
          h("button", { class: "btn sm primary", onclick: () => { closePanel(); A.go("plans"); } }, icon("spark"), t("ac_view_plans"))));
  // the time line: plan dates, payments and transfers, and Lao events for the next 60 days
  const items = [];
  if (paid){
    if (exp - 7 * DAY > now) items.push({ at: exp - 7 * DAY, ic: "repeat", kind: "warn", title: t("nt_cal_renew"), text: t("nt_cal_renew_d", { p: planLabel(p) || "" }) });
    items.push({ at: exp, ic: "clock", kind: "warn", title: t("nt_cal_ends", { p: planLabel(p) || "" }), text: "" });
  }
  if (start && paid) items.push({ at: start, ic: "crown", kind: "good", title: t("nt_cal_start", { p: planLabel(p) || "" }), text: "" });
  for (const o of orders.slice(0, 20)){
    if (o.status === "paid" && o.paidAt) items.push({ at: o.paidAt, ic: "wallet", kind: "good", title: t("nt_cal_paid"), text: pl(o) + " · " + money(o.amount, o.currency, lang()) });
    if (o.slipAt && o.status !== "paid") items.push({ at: o.slipAt, ic: "upload", kind: "wait", title: t("nt_cal_slip"), text: pl(o) + " · " + t("bl_os_" + o.status) });
  }
  for (const x of laoEvents(now - DAY, now + 60 * DAY)) items.push({ at: x.o.start.getTime(), end: x.o.end.getTime(), ic: "calendar", kind: "cal", title: L(x.e.title), text: L(x.e.summary), lunar: x.e.lunar });
  const future = items.filter(x => (x.end || x.at) >= dayStart(now)).sort((a, b) => a.at - b.at);
  const past = items.filter(x => (x.end || x.at) < dayStart(now) && x.at > now - 90 * DAY).sort((a, b) => b.at - a.at);
  const row = x => { const d = new Date(x.at), today = dayStart(x.at) === dayStart(now) || (x.end && x.at <= now && x.end >= dayStart(now));
    return h("li", { class: "scal-item k-" + x.kind + (today ? " today" : "") },
      h("span", { class: "scal-date" }, h("b", null, String(d.getDate())), h("small", null, fmtDate(x.at, lang()).replace(/\d{1,2}\s*|\s*\d{4}/g, "").trim().slice(0, 6))),
      h("span", { class: "scal-tx" }, h("b", null, x.title), x.text ? h("span", null, x.text) : null,
        h("small", null, today ? t("nt_today") : relDays(x.at, now), x.lunar ? " · " + t("cal_about") : "")),
      h("span", { class: "scal-ic" }, icon(x.ic))); };
  return h("div", { class: "scal" }, card,
    h("p", { class: "scal-today" }, icon("calendar"), h("b", null, fmtDate(now, lang())), " · ", t("nt_cal_intro")),
    future.length ? [h("h4", null, t("nt_cal_next")), h("ul", { class: "scal-list" }, future.slice(0, 25).map(row))] : null,
    past.length ? [h("h4", null, t("nt_cal_past")), h("ul", { class: "scal-list past" }, past.slice(0, 15).map(row))] : null);
}
function relDays(at, now){ const d = Math.round((dayStart(at) - dayStart(now)) / DAY); return d === 1 ? t("nt_tomorrow") : d === -1 ? t("nt_yesterday") : d > 0 ? t("nt_in_days", { n: d }) : t("nt_days_ago", { n: -d }); }

// tests and the sign-out: forget the watcher
export function stopNotify(){ clearTimeout(timer); started = false; orders = []; }
export const _test = { updates: () => updates(), check: () => check() };
