// Grammar Studio. Lao grammar is mostly word order and a few key words, so every grammar point is taught with
// building blocks: each word is coloured by its job in the sentence (subject, verb, object, describing word, "not",
// question word…). A point has five steps: Learn the formula → See it in real sentences (word-by-word meaning, sound
// with the words lighting up) → Build sentences from shuffled blocks → Fix: spot the wrong word order → Master: a short
// mixed challenge. Progress is saved per point (progress.grammar). Logic: js/shared/grammar.js.
import { h, icon, toast, tr, reducedMotion } from "../shared/ui.js";
import { t, lang } from "../shared/i18n.js";
import { dict } from "../shared/dict.js";
import { ensureTokens, toggleBtn } from "../shared/widgets.js";
import { parseFormula, formulaMarkers, tagTokens, meaningful, shuffleWords, STEPS, stepsDone, mastery, grammarStatus, nextPoint, explainOf } from "../shared/grammar.js";
import { A, T, expLang, genMany, grammarProgress, saveGrammar, award, logEvent, touchDay, tierName } from "./core.js";
import { upgradeSheet } from "./upgrade.js";
import { put, RL, trOf, formulaBlocks, sentenceBlocks, karaoke, buildTask, fixTask } from "./blocks.js";

export const GRAMMAR_VIEWS = {};
const go = (...a) => A.go(...a);
const STEP_ICON = { learn: "book", see: "eye", build: "layers", fix: "edit", master: "trophy" };
const progMap = gs => Object.fromEntries(gs.map(g => [g.id, grammarProgress(g.id)]));
const points = () => Object.values(A.byType.grammar || {}).sort((a, b) => (a.level - b.level) || ((a.order || 0) - (b.order || 0)));
const LAO = /[຀-໿]/;

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
      const task = (kind === "build" ? buildTask : (s2, cb) => fixTask(s2, cb, { mistakes: g.mistakes }))(s, (ok, first = true) => {
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
        (it.kind === "build" ? buildTask : (s2, cb) => fixTask(s2, cb, { mistakes: g.mistakes }))(it.s, ok => { if (ok) score++; next.hidden = false; next.focus({ preventScroll: true }); }), h("div", { class: "row gs-actions" }, next));
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
