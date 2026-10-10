// Building blocks shared by the Grammar Studio and the Pattern Studio: each word is a coloured block with its job in
// the sentence (js/shared/grammar.js ROLES), sentences play with the words lighting up, and two exercises:
// Build (put shuffled blocks in order) and Fix (pick the right word order out of believable wrong ones).
import { h, icon, pyHTML, tr, reducedMotion } from "../shared/ui.js";
import { t, lang } from "../shared/i18n.js";
import { gloss } from "../shared/dict.js";
import { speak, audioSource } from "../shared/speech.js";
import { openWord } from "../shared/widgets.js";
import { ROLES, parseFormula, meaningful, checkBuild, shuffleWords, wrongOrders } from "../shared/grammar.js";
import { expLang } from "./core.js";

export const put = (el, ...kids) => el.replaceChildren(...kids.filter(k => k != null));
export const RL = (code, f = "") => { const r = ROLES[code] || ROLES.W; const L = lang(); return f ? (r[f][L] || r[f].en) : (r[L] || r.en); };
// automatic sound after an answer only when the sentence has audio (pressing Play still explains when it has none)
export const sayIf = zh => { if (audioSource(zh) !== "none") speak(zh); };
export const trOf = s => (s.tr && (s.tr[expLang()] || s.tr.en)) || s.en || "";
const gl = w => (w.role === "M" || w.role === "Neg" || w.role === "Q" || w.role === "P") && !gloss(w.z, expLang()) ? "·" : (gloss(w.z, expLang()) || "—");

// the formula as blocks ("S + ບໍ່ + V") — big: with a hint under each block
export function formulaBlocks(f, { big = false } = {}){
  const parts = parseFormula(f);
  if (!parts.length) return null;
  return h("div", { class: "gs-formula" + (big ? " big" : ""), role: "list", "aria-label": t("structure") },
    parts.flatMap((p, i) => [i ? h("span", { class: "gs-plus", "aria-hidden": "true" }, "+") : null,
      h("span", { class: "gb" + (p.optional ? " opt" : ""), "data-role": p.lit ? "M" : p.code, role: "listitem" },
        h("b", { class: p.lit ? "lo" : "", lang: p.lit ? "lo" : null }, p.lit || (p.code === "X" ? p.label : RL(p.code))),
        big ? h("small", null, p.lit ? RL("M") : (p.alt || []).length ? (p.alt.map(c => RL(c)).join(" / ")) : RL(p.code, "hint")) : null)]).filter(Boolean));
}
// a sentence as role-coloured blocks; tap a block to open the word
export function sentenceBlocks(toks, { gloss: showGloss = false, rom = true, roles = true } = {}){
  return h("div", { class: "gs-sent" + (roles ? "" : " plain"), lang: "lo" }, meaningful(toks).map((w, i) =>
    h("button", { type: "button", class: "gb tok", "data-role": w.role, "data-i": i, onclick: () => openWord(w.z), title: RL(w.role) },
      h("b", { class: "lo" }, w.z), rom && w.p ? h("small", { html: pyHTML(w.p) }) : null,
      showGloss ? h("em", { class: "gs-gl" }, gl(w)) : null)));
}
// lights the words up one by one while the sentence plays (an estimate of the speaking pace)
export function karaoke(box, zh){
  speak(zh);
  if (reducedMotion()) return;
  const toks = [...box.querySelectorAll(".tok")]; let i = 0;
  const step = () => { toks.forEach((x, k) => x.classList.toggle("lit", k === i)); if (i++ < toks.length) setTimeout(step, 260 + 90 * ((toks[i - 1] && toks[i - 1].textContent.length) || 2) / 2); else toks.forEach(x => x.classList.remove("lit")); };
  step();
}

// Build: put shuffled blocks in order. s = { zh, tr, toks (tagged) }; onDone(ok, firstTry)
export function buildTask(s, onDone){
  const EL = expLang();
  const words = meaningful(s.toks), correct = words.map(w => w.z), roles = words.map(w => w.role);
  const tiles = shuffleWords(words.map((w, i) => Object.assign({ k: i }, w)));
  let placed = [], tries = 0, colors = false, finished = false;
  const answer = h("div", { class: "gs-answer", "aria-live": "polite" }), bank = h("div", { class: "gs-bank" }), fb = h("div", { class: "gs-fb", role: "status" });
  const checkBtn = h("button", { class: "btn primary", onclick: check }, icon("check"), t("check"));
  const tileEl = (w, where) => h("button", { type: "button", class: "gb tok" + (colors ? "" : " mono"), "data-role": w.role, style: "view-transition-name:gs-t" + w.k,
    onclick: () => move(w, where) }, h("b", { class: "lo" }, w.z));
  function render(){
    put(answer, ...(placed.length ? placed.map(w => tileEl(w, "answer")) : [h("span", { class: "gs-ph" }, t("gs_tap_words"))]));
    put(bank, ...tiles.filter(w => !placed.includes(w)).map(w => tileEl(w, "bank")));
    checkBtn.disabled = placed.length !== tiles.length || finished;
  }
  function move(w, where){
    if (finished) return;
    const upd = () => { if (where === "bank") placed.push(w); else placed = placed.filter(x => x !== w); render(); };
    // View Transitions slide the word into place; the browser may cancel one (e.g. the screen rotates): that's fine
    if (document.startViewTransition && !reducedMotion()){ const vt = document.startViewTransition(upd); vt.ready.catch(() => {}); vt.finished.catch(() => {}); vt.updateCallbackDone.catch(() => {}); }
    else upd();
  }
  function check(){
    const r = checkBuild(placed.map(w => w.z), correct, roles); tries++;
    answer.querySelectorAll(".tok").forEach((b, i) => b.classList.toggle("wrong", !r.ok && i === r.at));
    if (r.ok){
      finished = true; colors = true; render(); answer.classList.add("ok");
      put(fb, h("div", { class: "gs-ok" }, icon("ok"), t(tries === 1 ? "gs_build_ok" : "gs_build_ok2")), h("p", { class: EL === "lo" ? "lo" : "" }, trOf(s)));
      sayIf(s.zh); onDone(true, tries === 1);       // right on the second try still counts (fewer XP)
    } else if (tries >= 2){
      finished = true;
      put(fb, h("div", { class: "gs-no" }, icon("fail"), t("gs_build_show")), sentenceBlocks(s.toks), h("p", { class: EL === "lo" ? "lo" : "" }, trOf(s)));
      onDone(false);
    } else put(fb, h("div", { class: "gs-no" }, icon("info"), t("gs_build_try", { n: r.at + 1 })));
  }
  render();
  return h("div", { class: "stack" },
    h("p", { class: "gs-prompt" }, h("span", { class: "muted" }, t("gs_build_q")), h("b", { class: EL === "lo" ? "lo" : "" }, " " + (trOf(s) || "…"))),
    answer, bank,
    h("div", { class: "row" }, checkBtn, h("button", { class: "btn ghost sm", onclick: () => { colors = !colors; render(); } }, icon("spark"), t("gs_color_hint")),
      h("button", { class: "btn ghost sm", onclick: () => { placed = []; render(); fb.replaceChildren(); } }, icon("repeat"), t("gs_reset"))),
    fb);
}
// Fix: which order is right? mistakes: [{ wrong, right, tr }] written by the teacher (used when one fits the sentence)
export function fixTask(s, onDone, { mistakes = [] } = {}){
  const EL = expLang();
  const right = meaningful(s.toks), wrong = wrongOrders(s.toks).slice(0, 2);
  const fromData = mistakes.find(m => m && m.right && m.wrong && s.zh.replace(/[.\s?!]/g, "") === m.right.replace(/[.\s?!]/g, ""));
  const opts = [{ ok: true, words: right.map(w => w.z), roles: right.map(w => w.role) }, ...wrong.map(w => ({ ok: false, words: w.words, roles: w.roles, why: w.why }))];
  // the teacher's own wrong sentence, unless it is the same as one of the generated wrong orders
  const flat = x => String(x).replace(/[\s.?!,]/g, "");
  if (fromData && opts.length < 4 && !opts.some(o => flat(o.words.join("")) === flat(fromData.wrong))) opts.push({ ok: false, words: [fromData.wrong], roles: ["W"], why: "data", note: tr(fromData.tr || {}, EL) });
  const order = shuffleWords(opts.map((_, i) => i)).map(i => opts[i]);
  let done = false;
  const fb = h("div", { class: "gs-fb", role: "status" });
  const list = h("div", { class: "gs-opts" }, order.map(o => h("button", { type: "button", class: "gs-opt", onclick: e => pick(o, e.currentTarget) },
    h("span", { class: "gs-sent mono" }, o.words.map((z, i) => h("span", { class: "gb tok", "data-role": o.roles[i] }, h("b", { class: "lo" }, z)))))));
  function pick(o, btn){
    if (done) return; done = true;
    list.querySelectorAll(".gs-opt").forEach((b, i) => { b.disabled = true; b.querySelector(".gs-sent").classList.remove("mono"); if (order[i].ok) b.classList.add("right"); });
    if (!o.ok) btn.classList.add("wrong");
    const bad = o.ok ? order.find(x => !x.ok) : o;
    put(fb, h("div", { class: o.ok ? "gs-ok" : "gs-no" }, icon(o.ok ? "ok" : "fail"), t(o.ok ? "correct" : "incorrect")),
      bad ? h("p", null, h("b", null, t(o.ok ? "gs_why_others" : "gs_why") + " "), bad.note || t("gs_why_" + bad.why)) : null, h("p", { class: "muted " + (EL === "lo" ? "lo" : "") }, trOf(s)));
    sayIf(s.zh); onDone(o.ok);
  }
  return h("div", { class: "stack" }, h("p", { class: "gs-prompt" }, t("gs_fix_q")), list, fb);
}
