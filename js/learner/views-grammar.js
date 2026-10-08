// Grammar Studio. Lao grammar is mostly word order and a few key words, so every grammar point is taught with
// building blocks: each word is coloured by its job in the sentence (subject, verb, object, describing word, "not",
// question word…). A point has five steps: Learn the formula → See it in real sentences (word-by-word meaning, sound
// with the words lighting up) → Build sentences from shuffled blocks → Fix: spot the wrong word order → Master: a short
// mixed challenge. Progress is saved per point (progress.grammar). Logic: js/shared/grammar.js.
import { h, icon, toast, pyHTML, tr, reducedMotion } from "../shared/ui.js";
import { t, lang } from "../shared/i18n.js";
import { dict, gloss } from "../shared/dict.js";
import { speak, audioSource } from "../shared/speech.js";
import { openWord, ensureTokens, toggleBtn } from "../shared/widgets.js";
import { ROLES, parseFormula, formulaMarkers, tagTokens, meaningful, checkBuild, shuffleWords, wrongOrders, STEPS, stepsDone, mastery, grammarStatus, nextPoint, explainOf } from "../shared/grammar.js";
import { A, T, expLang, genMany, grammarProgress, saveGrammar, award, logEvent, touchDay, tierName } from "./core.js";
import { upgradeSheet } from "./upgrade.js";

export const GRAMMAR_VIEWS = {};
const go = (...a) => A.go(...a);
const put = (el, ...kids) => el.replaceChildren(...kids.filter(k => k != null));
const RL = (code, f = "") => { const r = ROLES[code] || ROLES.W; const L = lang(); return f ? (r[f][L] || r[f].en) : (r[L] || r.en); };
const STEP_ICON = { learn: "book", see: "eye", build: "layers", fix: "edit", master: "trophy" };
// automatic sound after an answer only when the sentence has audio (pressing Play still explains when it has none)
const sayIf = zh => { if (audioSource(zh) !== "none") speak(zh); };
const progMap = gs => Object.fromEntries(gs.map(g => [g.id, grammarProgress(g.id)]));
const points = () => Object.values(A.byType.grammar || {}).sort((a, b) => (a.level - b.level) || ((a.order || 0) - (b.order || 0)));
const LAO = /[຀-໿]/;

// ---------- building blocks ----------
function formulaBlocks(f, { big = false } = {}){
  const parts = parseFormula(f);
  if (!parts.length) return null;
  return h("div", { class: "gs-formula" + (big ? " big" : ""), role: "list", "aria-label": t("structure") },
    parts.flatMap((p, i) => [i ? h("span", { class: "gs-plus", "aria-hidden": "true" }, "+") : null,
      h("span", { class: "gb" + (p.optional ? " opt" : ""), "data-role": p.lit ? "M" : p.code, role: "listitem" },
        h("b", { class: p.lit ? "lo" : "", lang: p.lit ? "lo" : null }, p.lit || (p.code === "X" ? p.label : RL(p.code))),
        big ? h("small", null, p.lit ? RL("M") : (p.alt || []).length ? (p.alt.map(c => RL(c)).join(" / ")) : RL(p.code, "hint")) : null)]).filter(Boolean));
}
// a sentence as role-coloured blocks; tap a block to open the word
function sentenceBlocks(toks, { gloss: showGloss = false, rom = true, roles = true } = {}){
  return h("div", { class: "gs-sent" + (roles ? "" : " plain"), lang: "lo" }, meaningful(toks).map((w, i) =>
    h("button", { type: "button", class: "gb tok", "data-role": w.role, "data-i": i, onclick: () => openWord(w.z), title: RL(w.role) },
      h("b", { class: "lo" }, w.z), rom && w.p ? h("small", { html: pyHTML(w.p) }) : null,
      showGloss ? h("em", { class: "gs-gl" }, gl(w)) : null)));
}
const gl = w => (w.role === "M" || w.role === "Neg" || w.role === "Q" || w.role === "P") && !gloss(w.z, expLang()) ? "·" : (gloss(w.z, expLang()) || "—");
const trOf = s => (s.tr && (s.tr[expLang()] || s.tr.en)) || s.en || "";
// lights the words up one by one while the sentence plays (an estimate of the speaking pace)
function karaoke(box, zh){
  speak(zh);
  if (reducedMotion()) return;
  const toks = [...box.querySelectorAll(".tok")]; let i = 0;
  const step = () => { toks.forEach((x, k) => x.classList.toggle("lit", k === i)); if (i++ < toks.length) setTimeout(step, 260 + 90 * ((toks[i - 1] && toks[i - 1].textContent.length) || 2) / 2); else toks.forEach(x => x.classList.remove("lit")); };
  step();
}

// ---------- the map ----------
GRAMMAR_VIEWS.grammar = () => {
  const gs = points(), prog = progMap(gs);
  const locked = (A.catalog || []).filter(c => c.type === "grammar" && c.tier > A.tier);
  const done = gs.filter(g => grammarStatus(prog[g.id]) === "mastered").length;
  const nx = nextPoint(gs, prog);
  const ring = h("div", { class: "gs-ring", style: "--p:" + (gs.length ? Math.round(100 * done / gs.length) : 0), role: "img", "aria-label": done + " / " + gs.length },
    h("b", { class: "tabnum" }, done + "/" + gs.length), h("small", null, t("gs_mastered")));
  const legend = ["S", "V", "O", "Adj", "Neg", "Q", "P", "Time"].map(c => h("span", { class: "gb sm", "data-role": c, title: RL(c, "hint") }, h("b", null, RL(c))));
  const card = g => {
    const p = prog[g.id], st = grammarStatus(p), m = mastery(p);
    return h("button", { class: "gs-card", "data-status": st, onclick: () => go("grammarItem", { id: g.id }) },
      h("div", { class: "gs-card-top" }, h("span", { class: "chip gs-st-" + st }, t("gs_st_" + st)),
        h("span", { class: "gs-dots", "aria-label": m + " / 5" }, STEPS.map((s, i) => h("i", { class: i < m ? "on" : "" })))),
      h("b", { class: "gs-card-t" }, T(g.title)),
      g.structure ? formulaBlocks(g.structure) : h("small", { class: "muted" }, t("gs_no_formula")));
  };
  const stages = [...new Set(gs.map(g => g.level))].sort((a, b) => a - b);
  return h("div", { class: "gs" },
    h("div", { class: "gs-hero card" },
      h("div", { class: "gs-hero-txt" }, h("span", { class: "eyebrow" }, t("nav_grammar")), h("h1", null, t("gs_title")), h("p", null, t("gs_sub")),
        h("div", { class: "row" }, nx ? h("button", { class: "btn primary", onclick: () => go("grammarItem", { id: nx.id }) }, icon("play"),
          (grammarStatus(prog[nx.id]) === "new" ? t("gs_start") : t("gs_continue")) + ": ", h("span", null, T(nx.title))) : null,
          h("button", { class: "btn ghost", onclick: () => go("patterns") }, icon("structure"), Object.keys(A.P || {}).length + " " + t("patterns")))),
      ring),
    h("section", { class: "gs-legend card" }, h("div", null, h("b", null, t("gs_blocks_t")), h("p", { class: "small muted" }, t("gs_blocks_d"))),
      h("div", { class: "gs-legend-row" }, legend),
      h("div", { class: "gs-demo" }, sentenceBlocks(tagTokens([{ z: "ອາຫານ", p: "āa-hǎan" }, { z: "ລາວ", p: "láao" }, { z: "ແຊບ", p: "sɛ̂ɛp" }, { z: "ຫຼາຍ", p: "lǎai" }], "", { "ອາຫານ": { pos: "n" }, "ລາວ": { pos: "n" }, "ແຊບ": { pos: "adj" }, "ຫຼາຍ": { pos: "adv" } }), { gloss: true }),
        h("small", { class: "muted" }, t("gs_demo")))),
    gs.length ? null : h("div", { class: "empty" }, t("no_rows")),
    ...stages.map(s => h("section", { class: "gs-stage" }, h("h2", null, "Stage " + s), h("div", { class: "gs-grid" }, gs.filter(g => g.level === s).map(card)))),
    locked.length ? h("section", { class: "gs-stage" }, h("h2", null, icon("lock"), " " + t("locked")), h("div", { class: "gs-grid" }, locked.map(c =>
      h("button", { class: "gs-card locked", onclick: () => upgradeSheet({ tier: c.tier }) }, h("span", { class: "chip" }, icon("lock"), tierName(c.tier)), h("b", { class: "gs-card-t" }, T(c.title)))))) : null);
};

// ---------- one grammar point ----------
GRAMMAR_VIEWS.grammarItem = ({ id, step }) => {
  const g = A.byType.grammar && A.byType.grammar[id];
  if (!g) return h("div", { class: "empty" }, t("no_rows"));
  logEvent("grammar", { ref: id }); touchDay();
  const D = dict(), EL = expLang();
  const tagged = s => { const e = ensureTokens(s, A.engine); return Object.assign({}, e, { toks: tagTokens(e.tokens || [], g.structure, D) }); };
  // sentences: the point's examples, examples and fresh sentences from its patterns (linked, or sharing its key words)
  const markers = formulaMarkers(parseFormula(g.structure));
  const pats = Object.values(A.P || {}).filter(p => g.patterns.includes(p.n) || (markers.length && markers.some(m => (p.markers || []).includes(m))));
  const pool = (() => {
    const seen = new Set(), out = [];
    const add = s => { if (!s || !s.zh || seen.has(s.zh)) return; seen.add(s.zh); const x = tagged(s); const n = meaningful(x.toks).length; if (n >= 2 && n <= 10) out.push(x); };
    g.examples.forEach(add); pats.forEach(p => (p.examples || []).forEach(add));
    try { pats.forEach(p => genMany(p, 3).forEach(add)); } catch(e){}
    return out;
  })();
  const examples = g.examples.map(tagged);
  let P = Object.assign({}, grammarProgress(id));
  const root = h("div", { class: "gs gs-item" });
  const panel = h("div", { class: "gs-panel" });
  let cur = step && STEPS.includes(step) ? step : (STEPS.find(s => !stepsDone(P)[s]) || "learn");
  const mark = (patch, msg) => { P = saveGrammar(id, patch); drawNav(); if (msg) toast(msg, "ok"); };
  const nav = h("nav", { class: "gs-steps", "aria-label": t("gs_steps") });
  function drawNav(){
    const d = stepsDone(P);
    put(nav, ...STEPS.map((s, i) => h("button", { class: "gs-step" + (s === cur ? " on" : "") + (d[s] ? " done" : ""), "aria-current": s === cur ? "step" : null, onclick: () => { cur = s; draw(); } },
      h("span", { class: "gs-step-ic" }, d[s] ? icon("check") : icon(STEP_ICON[s])), h("span", null, h("small", null, (i + 1) + ""), t("gs_s_" + s)))));
  }
  const nextBtn = (s, label) => h("button", { class: "btn primary", onclick: () => { cur = s; draw(); root.scrollIntoView({ behavior: reducedMotion() ? "auto" : "smooth", block: "start" }); } }, label || t("gs_next_" + s), icon("right"));

  // 1 Learn
  function learn(){
    const x = explainOf(g, EL);
    return h("div", { class: "stack" },
      g.structure ? h("section", { class: "card gs-formula-card" }, h("div", { class: "eyebrow" }, t("gs_formula")), formulaBlocks(g.structure, { big: true }),
        h("p", { class: "small muted" }, t("gs_formula_d"))) : null,
      h("section", { class: "card" },
        x.lang !== EL ? h("span", { class: "chip" }, t("gs_in_lang_" + x.lang)) : null,
        h("p", { class: "gs-explain" + (x.lang === "lo" ? " lo" : "") }, x.text || t("gs_no_explain")),
        x.usage.length ? h("ul", { class: "obj" + (x.lang === "lo" ? " lo" : "") }, x.usage.map(u => h("li", null, u))) : null),
      g.mistakes.length ? h("section", { class: "card stack" }, h("h3", null, t("gs_watch_out")), g.mistakes.map(m =>
        h("div", { class: "gs-mis" }, h("div", { class: "gs-mis-x" }, icon("x"), h("span", { class: "lo", lang: "lo" }, m.wrong)), h("div", { class: "gs-mis-v" }, icon("check"), h("span", { class: "lo", lang: "lo" }, m.right)),
          m.tr ? h("small", { class: "muted" }, tr(m.tr, EL)) : null))) : null,
      pats.length ? h("div", { class: "wordchips" }, pats.map(p => h("button", { onclick: () => go("pattern", { n: p.n }) }, "#" + p.n + " ", h("span", { class: "hz lo" }, p.hz)))) : null,
      h("div", { class: "row gs-actions" }, h("button", { class: "btn primary", onclick: () => { if (!P.learn) mark({ learn: 1 }); cur = "see"; draw(); } }, icon("check"), t("gs_got_it"))));
  }

  // 2 See it: examples as blocks, word-by-word meaning, sound with the words lighting up
  function see(){
    let showGloss = true, showRoles = true;
    const list = h("div", { class: "stack" });
    const drawList = () => put(list, ...examples.map(s => {
      const blocks = sentenceBlocks(s.toks, { gloss: showGloss, roles: showRoles });
      return h("article", { class: "card gs-ex" }, blocks,
        h("div", { class: "gs-ex-foot" }, h("p", { class: "gs-ex-tr" + (EL === "lo" ? " lo" : "") }, trOf(s)),
          h("button", { class: "btn sm", onclick: () => { karaoke(blocks, s.zh); if (!P.see) mark({ see: 1 }); } }, icon("play"), t("play"))));
    }));
    drawList();
    const tog = (label, get, set) => h("label", { class: "gs-tog" }, h("input", { type: "checkbox", checked: get(), onchange: e => { set(e.target.checked); drawList(); } }), label);
    return h("div", { class: "stack" },
      g.structure ? formulaBlocks(g.structure) : null,
      h("div", { class: "row" }, tog(t("gs_show_gloss"), () => showGloss, v => showGloss = v), tog(t("gs_show_roles"), () => showRoles, v => showRoles = v)),
      examples.length ? list : h("div", { class: "empty" }, t("gs_no_examples")),
      h("p", { class: "small muted" }, t("gs_see_d")),
      h("div", { class: "row gs-actions" }, h("button", { class: "btn primary", onclick: () => { if (!P.see) mark({ see: 1 }); cur = "build"; draw(); } }, t("gs_next_build"), icon("right"))));
  }

  // 3 Build: put shuffled blocks in order
  function buildTask(s, onDone){
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
  // 4 Fix: which order is right?
  function fixTask(s, onDone){
    const right = meaningful(s.toks), wrong = wrongOrders(s.toks).slice(0, 2);
    const fromData = g.mistakes.find(m => m.right && s.zh.replace(/[.\s?!]/g, "") === m.right.replace(/[.\s?!]/g, ""));
    const opts = [{ ok: true, words: right.map(w => w.z), roles: right.map(w => w.role) }, ...wrong.map(w => ({ ok: false, words: w.words, roles: w.roles, why: w.why }))];
    if (fromData && opts.length < 4) opts.push({ ok: false, words: [fromData.wrong], roles: ["W"], why: "data", note: tr(fromData.tr || {}, EL) });
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
        bad ? h("p", null, h("b", null, t("gs_why") + " "), bad.note || t("gs_why_" + bad.why)) : null, h("p", { class: "muted " + (EL === "lo" ? "lo" : "") }, trOf(s)));
      sayIf(s.zh); onDone(o.ok);
    }
    return h("div", { class: "stack" }, h("p", { class: "gs-prompt" }, t("gs_fix_q")), list, fb);
  }
  function practice(kind){
    const box = h("div", { class: "stack" });
    let i = 0, right = 0;
    const counter = h("span", { class: "chip" });
    const items = shuffleWords(pool.map((_, k) => k)).map(k => pool[k]);
    const one = () => {
      if (!items.length){ put(box, h("div", { class: "empty" }, t("gs_no_examples"))); return; }
      const s = items[i % items.length]; i++;
      const need = 2, have = P[kind] || 0;
      counter.textContent = t("gs_count_" + kind, { n: Math.min(have, need), m: need });
      const next = h("button", { class: "btn primary", hidden: true, onclick: one }, t("next"), icon("right"));
      const actions = h("div", { class: "row gs-actions" }, next);
      // once the step is done, the way on to the next step is offered right away (more practice stays possible)
      const offerNext = () => { if (!stepsDone(P)[kind] || actions.querySelector(".gs-go")) return; next.className = "btn"; next.replaceChildren(icon("repeat"), t("gs_one_more"));
        const go2 = nextBtn(kind === "build" ? "fix" : "master"); go2.classList.add("gs-go"); actions.append(go2); };
      const task = (kind === "build" ? buildTask : fixTask)(s, (ok, first = true) => {
        if (ok){ right++; mark({ [kind]: (P[kind] || 0) + 1 }); award(kind === "build" ? (first ? 4 : 2) : 3, "grammar"); counter.textContent = t("gs_count_" + kind, { n: Math.min(P[kind], need), m: need }); }
        next.hidden = false;
        if (stepsDone(P)[kind] && (P[kind] === need) && ok) toast(t("gs_step_done"), "ok");
        offerNext();
        (actions.querySelector(".gs-go") || next).focus({ preventScroll: true });
      });
      put(box, h("div", { class: "spread" }, h("span", { class: "muted small" }, t("gs_s_" + kind) + " · " + i), counter), task, actions);
      offerNext();
    };
    one();
    return box;
  }

  // 5 Master: 6 mixed questions; 80 % or more masters the point
  function master(){
    const box = h("div", { class: "stack" });
    const N = Math.min(6, Math.max(2, pool.length * 2));
    const items = []; const mix = shuffleWords(pool.map((_, k) => k));
    for (let k = 0; k < N; k++) items.push({ kind: k % 2 ? "fix" : "build", s: pool[mix[k % mix.length]] });
    let i = 0, score = 0;
    const bar = h("i");
    const run = () => {
      if (!pool.length){ put(box, h("div", { class: "empty" }, t("gs_no_examples"))); return; }
      if (i >= items.length) return result();
      const it = items[i];
      const next = h("button", { class: "btn primary", hidden: true, onclick: () => { i++; run(); } }, t("next"), icon("right"));
      bar.style.width = Math.round(100 * i / items.length) + "%";
      put(box, h("div", { class: "gs-mbar" }, bar), h("span", { class: "muted small tabnum" }, (i + 1) + " / " + items.length),
        (it.kind === "build" ? buildTask : fixTask)(it.s, ok => { if (ok) score++; next.hidden = false; next.focus({ preventScroll: true }); }), h("div", { class: "row gs-actions" }, next));
    };
    const result = () => {
      const pct = Math.round(100 * score / items.length), passed = pct >= 80, first = passed && !stepsDone(P).master;
      const patch = { best: Math.max(P.best || 0, pct), tries: (P.tries || 0) + 1 };
      if (passed){ patch.masteredAt = Date.now(); if (P.masteredAt) patch.reviews = (P.reviews || 0) + 1; }
      mark(patch); if (passed) award(first ? 20 : 8, "grammar");
      logEvent("grammar_master", { ref: id, pct });
      const others = points().filter(x => x.id !== id), nx = nextPoint(others, progMap(others));
      put(box, h("div", { class: "card gs-result" + (passed ? " win" : "") },
        h("div", { class: "gs-ring big", style: "--p:" + pct }, h("b", { class: "tabnum" }, pct + "%"), h("small", null, score + "/" + items.length)),
        h("h2", null, t(passed ? "gs_master_win" : "gs_master_again")), h("p", { class: "muted" }, t(passed ? "gs_master_win_d" : "gs_master_again_d")),
        h("div", { class: "row" }, h("button", { class: "btn" + (passed ? "" : " primary"), onclick: () => { i = 0; score = 0; run(); } }, icon("repeat"), t("again")),
          passed && nx ? h("button", { class: "btn primary", onclick: () => go("grammarItem", { id: nx.id }) }, t("gs_next_point"), icon("right")) : null,
          h("button", { class: "btn ghost", onclick: () => go("grammar") }, t("gs_map")))));
    };
    put(box, h("div", { class: "card stack gs-intro" }, h("div", { class: "gs-intro-ic" }, icon("trophy")), h("b", null, t("gs_master_t", { n: N })), h("p", { class: "muted small" }, t("gs_master_d")),
      h("button", { class: "btn primary", onclick: run }, icon("play"), t("start"))));
    return box;
  }

  function draw(){
    drawNav();
    const body = cur === "learn" ? learn() : cur === "see" ? see() : cur === "build" ? practice("build") : cur === "fix" ? practice("fix") : master();
    put(panel, h("div", { class: "gs-enter" }, body));
  }
  put(root,
    h("div", { class: "crumb" }, h("button", { onclick: () => go("grammar") }, t("nav_grammar")), "›", h("span", null, "Stage " + g.level)),
    h("div", { class: "spread gs-title" }, h("h1", null, T(g.title)), toggleBtn("g:" + id, { type: "grammar", id, title: g.title }, "btn sm")),
    nav, panel);
  draw();
  return root;
};
