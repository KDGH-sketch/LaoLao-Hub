// The Lao life calendar on the welcome page (docs/WELCOME.md → Life calendar): a month view with holidays, Buddhist
// days, festivals, culture, seasons and the moon (Buddhist holy days), a list of the month's events, and a glass sheet
// per event with its story, why it matters today, a "good to know" remark, words to hear, a video, an .ics download and
// a way into the app. Data: the "events" collection (defaults in welcome-calendar-data.js). Everything editors type is
// inserted as text.
import { h, icon, reducedMotion, videoSource } from "../shared/ui.js";
import { t, lang } from "../shared/i18n.js";
import { speak } from "../shared/speech.js";

const pad = n => String(n).padStart(2, "0");
const ymd = d => d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate());
export const parseDay = s => { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s || ""); return m ? new Date(+m[1], +m[2] - 1, +m[3]) : null; };
const sameDay = (a, b) => a && b && a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
const dayNo = d => Math.round(new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime() / 864e5);
const loc = () => lang() === "lo" ? "lo-LA" : lang() === "zh" ? "zh-CN" : "en-GB";
const fmt = (d, o) => { try { return new Intl.DateTimeFormat(loc(), o).format(d); } catch(e){ return d.toDateString(); } };
const KIND_ICON = { holiday: "star", buddhist: "sun", festival: "spark", culture: "culture", season: "globe", daily: "clock" };

// ---------- dates ----------
// the occurrences of an event in a year: [{ start, end }] (dates, end inclusive)
export function occurrences(ev, year){
  const out = [];
  if (ev.when === "date"){
    for (const o of [{ start: ev.start, end: ev.end }, ...(Array.isArray(ev.also) ? ev.also : [])]){
      const s = parseDay(o && o.start); if (!s) continue;
      const e = parseDay(o.end) || s;
      if (s.getFullYear() <= year && e.getFullYear() >= year) out.push({ start: s, end: e < s ? s : e });
    }
  } else if (ev.when === "yearly"){
    const s0 = parseDay(ev.start); if (!s0) return out;
    const e0 = parseDay(ev.end) || s0;
    const s = new Date(year, s0.getMonth(), s0.getDate()), len = Math.max(0, dayNo(e0) - dayNo(s0));
    out.push({ start: s, end: new Date(year, s0.getMonth(), s0.getDate() + len) });
  }
  return out;
}
export const inSeason = (ev, month) => { const a = +ev.monthFrom, b = +ev.monthTo; if (!(a >= 1 && b >= 1)) return false; return a <= b ? month >= a && month <= b : month >= a || month <= b; };
// the next (or current) occurrence from a day: { start, end } or null
export function nextOccurrence(ev, from){
  const y = from.getFullYear(), today = dayNo(from);
  for (const yr of [y, y + 1]) for (const o of occurrences(ev, yr)) if (dayNo(o.end) >= today) return o;
  return null;
}
// moon: 0 = new, 0.5 = full (mean synodic month; within about a day). Buddhist holy days (ວັນສິນ) follow the moon.
const SYN = 29.530588853, NEW0 = Date.UTC(2000, 0, 6, 18, 14) / 864e5;
const phase = d => { const x = ((Date.UTC(d.getFullYear(), d.getMonth(), d.getDate(), 12) / 864e5 - NEW0) / SYN) % 1; return x < 0 ? x + 1 : x; };
export function moonOn(d){
  const p = [-1, 0, 1].map(k => phase(new Date(d.getFullYear(), d.getMonth(), d.getDate() + k)));
  const full = p.map(x => Math.abs(x - .5)), nw = p.map(x => Math.min(x, 1 - x));
  if (full[1] <= full[0] && full[1] < full[2] && full[1] < 1 / SYN) return "full";
  if (nw[1] <= nw[0] && nw[1] < nw[2] && nw[1] < 1 / SYN) return "new";
  return null;
}

// ---------- .ics: add an event to the visitor's own calendar ----------
function icsFor(ev, occ, title, summary){
  const d = x => x.getFullYear() + pad(x.getMonth() + 1) + pad(x.getDate());
  const after = new Date(occ.end.getFullYear(), occ.end.getMonth(), occ.end.getDate() + 1);
  const esc = s => String(s || "").replace(/[\\;,]/g, m => "\\" + m).replace(/\r?\n/g, "\\n");
  return ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//LaoLao//Lao life calendar//EN", "BEGIN:VEVENT",
    "UID:" + ev.id + "-" + d(occ.start) + "@laolao", "DTSTAMP:" + new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d+/, ""),
    "DTSTART;VALUE=DATE:" + d(occ.start), "DTEND;VALUE=DATE:" + d(after), ev.when === "yearly" ? "RRULE:FREQ=YEARLY" : null,
    "SUMMARY:" + esc(title), "DESCRIPTION:" + esc(summary), "END:VEVENT", "END:VCALENDAR"].filter(Boolean).join("\r\n");
}

// ---------- the section ----------
export function lifeCalendar({ events, LT, loEl, photoOf, head, nudge, toAuth, regMode, today = new Date() }){
  const list = (events || []).filter(e => e && e.status !== "archived");
  if (!list.length) return null;
  const S = { y: today.getFullYear(), m: today.getMonth(), kind: "all", day: null };
  const kinds = ["all", ...["holiday", "buddhist", "festival", "culture", "season", "daily"].filter(k => list.some(e => e.kind === k))];
  const shown = e => S.kind === "all" || e.kind === S.kind;
  const title = e => LT(e.title);

  // what happens on a day / in the viewed month
  const onDay = d => list.filter(e => shown(e) && occurrences(e, d.getFullYear()).some(o => dayNo(d) >= dayNo(o.start) && dayNo(d) <= dayNo(o.end)));
  const inMonth = (y, m) => { const a = dayNo(new Date(y, m, 1)), b = dayNo(new Date(y, m + 1, 0));
    return list.filter(shown).map(e => ({ e, o: occurrences(e, y).find(o => dayNo(o.end) >= a && dayNo(o.start) <= b) })).filter(x => x.o)
      .sort((p, q) => p.o.start - q.o.start || (p.e.order || 0) - (q.e.order || 0)); };
  const seasonsIn = m => list.filter(e => e.when === "season" && inSeason(e, m + 1));
  const always = () => list.filter(e => (e.when === "daily" || e.when === "anytime") && shown(e));

  // "Happening now", "Tomorrow", "In 5 days", "Ended"
  function status(o){
    if (!o) return null;
    const n = dayNo(today), a = dayNo(o.start), b = dayNo(o.end);
    if (n >= a && n <= b) return { cls: "now", text: t("cal_now") };
    if (a > n) return { cls: "soon", text: a - n === 1 ? t("cal_tomorrow") : t("cal_in_days", { n: a - n }) };
    return { cls: "past", text: t("cal_ended") };
  }
  function whenText(e, o){
    if (e.when === "daily") return LT(e.time) || t("cal_daily");
    if (e.when === "anytime") return t("cal_anytime");
    if (e.when === "season") return fmt(new Date(2026, (+e.monthFrom || 1) - 1, 1), { month: "long" }) + " – " + fmt(new Date(2026, (+e.monthTo || 1) - 1, 1), { month: "long" });
    if (!o) return "";
    const one = sameDay(o.start, o.end), sy = o.start.getFullYear() === o.end.getFullYear();
    const txt = one ? fmt(o.start, { weekday: "long", day: "numeric", month: "long", year: "numeric" })
      : fmt(o.start, sy ? { day: "numeric", month: "long" } : { day: "numeric", month: "long", year: "numeric" }) + " – " + fmt(o.end, { day: "numeric", month: "long", year: "numeric" });
    return (e.lunar ? t("cal_about") + " " : "") + txt;
  }

  // ----- the event sheet (a glass <dialog>, like the sign-in pop-up) -----
  const sheetBody = h("div", { class: "wl-ev" });
  const grab = h("span", { class: "wl-grab", "aria-hidden": "true" });
  const panel = h("div", { class: "wl-glass-in" }, grab, h("button", { type: "button", class: "wl-x", "aria-label": t("close"), title: t("close"), onclick: () => closeSheet() }, icon("x")), sheetBody);
  const dlg = h("dialog", { class: "wl-glass wl-evdlg", "aria-labelledby": "wl-ev-title" }, panel);
  let order = [], cur = -1;
  function closeSheet(){ if (!dlg.open) return; if (reducedMotion()){ dlg.close(); return; } dlg.classList.add("out"); setTimeout(() => { dlg.classList.remove("out"); try { dlg.close(); } catch(e){ dlg.removeAttribute("open"); } }, 240); }
  dlg.addEventListener("cancel", e => { e.preventDefault(); closeSheet(); });
  let downOut = false;
  dlg.addEventListener("pointerdown", e => { downOut = e.target === dlg; });
  dlg.addEventListener("click", e => { if (e.target === dlg && downOut) closeSheet(); });
  let y0 = null;                                          // phones: pull the sheet down by its handle to close
  grab.addEventListener("pointerdown", e => { y0 = e.clientY; panel.style.transition = "none"; try { grab.setPointerCapture(e.pointerId); } catch(err){} });
  grab.addEventListener("pointermove", e => { if (y0 != null) panel.style.translate = "0 " + Math.max(0, e.clientY - y0) + "px"; });
  const end = e => { if (y0 == null) return; const dy = e.clientY - y0; y0 = null; panel.style.transition = ""; panel.style.translate = ""; if (dy > 90) closeSheet(); };
  grab.addEventListener("pointerup", end); grab.addEventListener("pointercancel", end);

  function openEvent(e, seq){
    order = seq && seq.length ? seq : [e]; cur = Math.max(0, order.indexOf(e));
    fillSheet(e);
    if (!dlg.open){ try { dlg.showModal(); } catch(err){ dlg.setAttribute("open", ""); } }
    nudge && nudge();
  }
  function fillSheet(e){
    const o = nextOccurrence(e, today) || occurrences(e, S.y)[0] || null, st = e.when === "date" || e.when === "yearly" ? status(o) : null;
    const ph = photoOf(e, "wl-ev-photo", title(e));
    const sec = (key, ic, val, cls) => LT(val) ? h("section", { class: "wl-ev-sec " + (cls || "") }, h("h3", null, icon(ic), t(key)), h("p", null, LT(val))) : null;
    const vs = e.videoUrl ? videoSource(e.videoUrl) : null;
    const video = h("div", { class: "wl-ev-video", hidden: true });
    const watch = vs && vs.kind !== "invalid" ? h("button", { type: "button", class: "wl-btn sm", onclick: () => {
      if (vs.kind === "youtube" || vs.kind === "iframe") video.replaceChildren(h("iframe", { src: vs.kind === "youtube" ? vs.src + "&autoplay=1" : vs.src, title: title(e), allow: "autoplay; encrypted-media; picture-in-picture", allowfullscreen: "", loading: "lazy" }));
      else video.replaceChildren(h("video", { src: vs.src, controls: true, autoplay: true, playsinline: true }));
      video.hidden = false; video.scrollIntoView({ behavior: reducedMotion() ? "auto" : "smooth", block: "nearest" }); } }, icon("play"), t("cal_watch")) : null;
    const ics = o && (e.when === "date" || e.when === "yearly") ? h("button", { type: "button", class: "wl-btn sm", onclick: () => {
      const url = URL.createObjectURL(new Blob([icsFor(e, o, title(e), LT(e.summary))], { type: "text/calendar" }));
      const a = h("a", { href: url, download: (e.id || "event") + ".ics" }); document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 4000); } }, icon("download"), t("cal_ics")) : null;
    const nav = order.length > 1 ? h("div", { class: "wl-ev-nav" },
      h("button", { type: "button", class: "wl-btn sm", disabled: cur <= 0, onclick: () => { cur--; fillSheet(order[cur]); panel.scrollTop = 0; } }, icon("left"), t("cal_prev_ev")),
      h("span", null, (cur + 1) + " / " + order.length),
      h("button", { type: "button", class: "wl-btn sm", disabled: cur >= order.length - 1, onclick: () => { cur++; fillSheet(order[cur]); panel.scrollTop = 0; } }, t("cal_next_ev"), icon("right"))) : null;
    sheetBody.replaceChildren(
      h("div", { class: "wl-ev-art k-" + (e.kind || "culture") + (ph ? " has-photo" : "") }, ph || loEl("span", e.laoName || "", "wl-ev-glyph"),
        h("span", { class: "wl-ev-kind" }, icon(KIND_ICON[e.kind] || "star"), t("cal_kind_" + (e.kind || "culture"))),
        st ? h("span", { class: "wl-ev-st " + st.cls }, st.text) : null),
      h("div", { class: "wl-ev-h" }, h("h2", { id: "wl-ev-title" }, title(e)),
        e.laoName && e.laoName !== title(e) ? loEl("p", e.laoName, "wl-ev-lo") : null,
        h("p", { class: "wl-ev-when" }, icon(e.when === "season" ? "globe" : "clock"), whenText(e, o)),
        e.lunar ? h("p", { class: "wl-ev-lunar" }, icon("moon"), t("cal_lunar_note")) : null),
      LT(e.summary) ? h("p", { class: "wl-ev-sum" }, LT(e.summary)) : null,
      sec("cal_story", "book", e.history), sec("cal_why", "users", e.relevance), sec("cal_know", "info", e.tip, "tip"),
      (e.words || []).length ? h("section", { class: "wl-ev-sec" }, h("h3", null, icon("sound"), t("cal_words")),
        h("div", { class: "wl-ev-words" }, e.words.map(x => h("button", { type: "button", class: "wl-ev-word", "aria-label": t("wl_listen", { w: x.rom || x.lo }),
          onclick: () => { nudge && nudge(); if (x.audio && /^https?:/.test(x.audio)) new Audio(x.audio).play().catch(() => speak(x.lo)); else speak(x.lo); } },
          loEl("b", x.lo || ""), h("small", null, [x.rom, x.en].filter(Boolean).join(" · ")), icon("speaker"))))) : null,
      video,
      h("div", { class: "wl-ev-act" }, watch, ics,
        h("button", { type: "button", class: "wl-btn primary", onclick: () => { closeSheet(); setTimeout(() => toAuth(regMode(), t("cal_learn_note", { e: title(e) })), reducedMotion() ? 0 : 260); } }, icon("spark"), t("cal_learn"))),
      nav);
  }

  // ----- the month -----
  const monthTitle = h("h3", { class: "wl-cal-mt", "aria-live": "polite" });
  const seasons = h("div", { class: "wl-cal-seasons" });
  const grid = h("div", { class: "wl-cal-days", role: "group", "aria-label": t("cal_days") });
  const listBox = h("div", { class: "wl-cal-list" });
  const chips = h("div", { class: "wl-cal-filters", role: "group", "aria-label": t("cal_filter") }, kinds.map(k =>
    h("button", { type: "button", class: "k-" + k, "aria-pressed": String(k === "all"), onclick: e => { S.kind = k; S.day = null;
      chips.querySelectorAll("button").forEach(b => b.setAttribute("aria-pressed", String(b === e.currentTarget))); draw(); } },
      k === "all" ? null : h("i", { "aria-hidden": "true" }), t("cal_kind_" + k))));
  const go = dm => { const d = new Date(S.y, S.m + dm, 1); S.y = d.getFullYear(); S.m = d.getMonth(); S.day = null; draw(dm); };
  const monthCard = h("div", { class: "wl-cal-card wl-rv" },
    h("div", { class: "wl-cal-top" },
      h("button", { type: "button", class: "wl-cal-arrow", "aria-label": t("cal_prev"), title: t("cal_prev"), onclick: () => go(-1) }, icon("left")),
      monthTitle,
      h("button", { type: "button", class: "wl-cal-arrow", "aria-label": t("cal_next"), title: t("cal_next"), onclick: () => go(1) }, icon("right"))),
    h("button", { type: "button", class: "wl-linkbtn wl-cal-todaybtn", onclick: () => { S.y = today.getFullYear(); S.m = today.getMonth(); S.day = today; draw(); } }, t("cal_today")),
    seasons,
    // the week grid scrolls sideways inside the card only on the narrowest screens (7 days × 44 px touch targets)
    h("div", { class: "wl-cal-scroll" },
      h("div", { class: "wl-cal-wd", "aria-hidden": "true" }, [0, 1, 2, 3, 4, 5, 6].map(i => h("span", null, fmt(new Date(2026, 5, 1 + i), { weekday: "narrow" })))),   // 1 June 2026 is a Monday
      grid),
    h("p", { class: "wl-cal-legend" }, h("span", { class: "wl-moon full", "aria-hidden": "true" }), t("cal_moon_full"), h("span", { class: "wl-moon new", "aria-hidden": "true" }), t("cal_moon_new")));

  function eventCard(e, o, seq){
    const st = o ? status(o) : null;
    return h("article", { class: "wl-cal-ev k-" + (e.kind || "culture") },
      h("div", { class: "wl-cal-date", "aria-hidden": "true" }, o ? [h("b", null, String(o.start.getDate())), h("small", null, fmt(o.start, { month: "short" }))] : icon(KIND_ICON[e.kind] || "star")),
      h("div", { class: "wl-cal-ev-tx" },
        h("div", { class: "wl-cal-ev-meta" }, h("span", { class: "wl-cal-kind" }, t("cal_kind_" + (e.kind || "culture"))), st ? h("span", { class: "wl-ev-st " + st.cls }, st.text) : null, e.lunar ? h("span", { class: "wl-cal-lunar", title: t("cal_lunar_note") }, icon("moon"), t("cal_about")) : null),
        h("h4", null, title(e), e.laoName ? [" ", loEl("span", e.laoName, "wl-cal-lo")] : null),
        h("p", null, o ? whenText(e, o) : whenText(e)), LT(e.summary) ? h("p", { class: "wl-cal-sum" }, LT(e.summary)) : null),
      h("button", { type: "button", class: "wl-btn sm wl-cal-go", "aria-label": t("cal_explore") + ": " + title(e), onclick: () => openEvent(e, seq) }, t("cal_explore"), icon("right")));
  }

  function draw(dir = 0){
    monthTitle.replaceChildren(h("span", null, fmt(new Date(S.y, S.m, 1), { month: "long", year: "numeric" })), lang() !== "lo" ? loEl("small", fmtLo(new Date(S.y, S.m, 1))) : null);
    seasons.replaceChildren(...seasonsIn(S.m).filter(shown).map(e => h("button", { type: "button", class: "wl-cal-season", onclick: () => openEvent(e, seasonsIn(S.m)) }, icon("globe"), title(e))));
    const first = new Date(S.y, S.m, 1), lead = (first.getDay() + 6) % 7, days = new Date(S.y, S.m + 1, 0).getDate();
    const cells = [];
    for (let i = 0; i < lead; i++) cells.push(h("span", { class: "wl-cal-d blank", "aria-hidden": "true" }));
    for (let n = 1; n <= days; n++){
      const d = new Date(S.y, S.m, n), evs = onDay(d), moon = moonOn(d), isToday = sameDay(d, today), sel = sameDay(d, S.day);
      const dots = h("span", { class: "wl-cal-dots", "aria-hidden": "true" }, [...new Set(evs.map(e => e.kind))].slice(0, 3).map(k => h("i", { class: "k-" + k })));
      const label = fmt(d, { weekday: "long", day: "numeric", month: "long" }) + (evs.length ? ": " + evs.map(title).join(", ") : "") + (moon ? " · " + t(moon === "full" ? "cal_moon_full" : "cal_moon_new") : "");
      const inner = [h("span", { class: "wl-cal-n" }, String(n)), moon ? h("span", { class: "wl-moon " + moon, "aria-hidden": "true" }) : null, dots];
      const cls = "wl-cal-d" + (isToday ? " today" : "") + (sel ? " sel" : "") + (evs.length ? " has" : "");
      cells.push(evs.length || moon
        ? h("button", { type: "button", class: cls, "aria-label": label, "aria-pressed": String(!!sel), style: "--i:" + n, onclick: () => { S.day = sel ? null : d; draw(); if (S.day && matchMedia("(max-width: 47.99rem)").matches) listBox.scrollIntoView({ behavior: reducedMotion() ? "auto" : "smooth", block: "start" }); } }, inner)
        : h("span", { class: cls, title: label, style: "--i:" + n }, inner));
    }
    grid.replaceChildren(...cells);
    if (dir && !reducedMotion()){ grid.classList.remove("next", "prev"); void grid.offsetWidth; grid.classList.add(dir > 0 ? "next" : "prev"); }
    // the list: the selected day, or the whole month, then everyday customs
    const items = S.day ? onDay(S.day).map(e => ({ e, o: occurrences(e, S.day.getFullYear()).find(o => dayNo(S.day) >= dayNo(o.start) && dayNo(S.day) <= dayNo(o.end)) })) : inMonth(S.y, S.m);
    const seq = items.map(x => x.e);
    const moonDay = S.day && moonOn(S.day);
    listBox.replaceChildren(
      h("div", { class: "wl-cal-lh" }, h("h3", null, S.day ? fmt(S.day, { weekday: "long", day: "numeric", month: "long" }) : t("cal_in_month", { m: fmt(new Date(S.y, S.m, 1), { month: "long" }) })),
        S.day ? h("button", { type: "button", class: "wl-linkbtn", onclick: () => { S.day = null; draw(); } }, t("cal_whole_month")) : null),
      moonDay ? h("p", { class: "wl-cal-moonnote" }, h("span", { class: "wl-moon " + moonDay, "aria-hidden": "true" }), t(moonDay === "full" ? "cal_moon_full_d" : "cal_moon_new_d")) : null,
      items.length ? h("div", { class: "wl-cal-evs" }, items.map(x => eventCard(x.e, x.o, seq)))
        : h("p", { class: "wl-cal-empty" }, t(S.day ? "cal_empty_day" : "cal_empty_month")),
      !S.day && always().length ? h("div", { class: "wl-cal-always" }, h("h3", null, t("cal_every_day")), h("div", { class: "wl-cal-evs" }, always().map(e => eventCard(e, null, always())))) : null);
  }
  // the Lao month name (ມັງກອນ, ກຸມພາ …), shown under the month in English or Chinese
  // (a fixed list: not every browser knows Lao month names)
  function fmtLo(d){ return ["ມັງກອນ", "ກຸມພາ", "ມີນາ", "ເມສາ", "ພຶດສະພາ", "ມິຖຸນາ", "ກໍລະກົດ", "ສິງຫາ", "ກັນຍາ", "ຕຸລາ", "ພະຈິກ", "ທັນວາ"][d.getMonth()]; }

  // ----- "Today in Laos": the date, the season, and what is on now or next -----
  const nowItems = list.filter(e => e.when === "date" || e.when === "yearly").map(e => ({ e, o: nextOccurrence(e, today) })).filter(x => x.o).sort((a, b) => a.o.start - b.o.start);
  const current = nowItems.find(x => status(x.o).cls === "now"), next = nowItems.find(x => status(x.o).cls === "soon");
  const feature = current || next;
  const todayMoon = moonOn(today);
  const todayCard = h("div", { class: "wl-cal-today wl-rv" },
    h("div", { class: "wl-cal-today-d" }, h("span", { class: "wl-eyebrow" }, t("cal_today_in")),
      h("b", null, fmt(today, { weekday: "long", day: "numeric", month: "long" })),
      h("div", { class: "wl-cal-today-s" }, seasonsIn(today.getMonth()).map(e => h("button", { type: "button", class: "wl-cal-season", onclick: () => openEvent(e, seasonsIn(today.getMonth())) }, icon("globe"), title(e))),
        todayMoon ? h("span", { class: "wl-cal-season moon" }, h("span", { class: "wl-moon " + todayMoon, "aria-hidden": "true" }), t(todayMoon === "full" ? "cal_moon_full" : "cal_moon_new")) : null)),
    feature ? h("button", { type: "button", class: "wl-cal-feature k-" + (feature.e.kind || "festival"), onclick: () => openEvent(feature.e, nowItems.map(x => x.e)) },
      h("span", { class: "wl-ev-st " + status(feature.o).cls }, current ? t("cal_now") : t("cal_next_up") + " · " + status(feature.o).text),
      h("b", null, title(feature.e)), feature.e.laoName ? loEl("span", feature.e.laoName, "wl-cal-lo") : null,
      h("span", { class: "wl-cal-feature-go" }, t("cal_explore"), icon("right"))) : null);

  draw();
  return h("section", { id: "w-lifecal", class: "wl-cal" }, head("lifecal"), todayCard, chips,
    h("div", { class: "wl-cal-grid" }, monthCard, listBox), dlg);
}
