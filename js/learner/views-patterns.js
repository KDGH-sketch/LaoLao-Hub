// Pattern Studio. A sentence pattern is a ready-made frame (ຖ້າ … ກໍ …) you fill with your own words. The map shows every
// pattern as a card with its frame as coloured blocks, the next one to study, a pattern of the day and a quick drill.
// One pattern is learned in five steps, like a grammar point: Learn the frame → See it in real sentences (and make new
// ones in the Lab) → Build sentences from shuffled blocks → Fix the wrong word order → Master a short challenge.
// Logic: js/shared/pattern-studio.js · blocks and exercises: ./blocks.js · progress: progress.pstudio (core.js).
import { h, icon, toast, pyHTML, tr, reducedMotion, debounce, todayKey } from "../shared/ui.js";
import { t, lang, secName } from "../shared/i18n.js";
import { dict } from "../shared/dict.js";
import { speak } from "../shared/speech.js";
import { ensureTokens, toggleBtn } from "../shared/widgets.js";
import { runQuiz } from "../shared/quiz.js";
import { tagTokens, meaningful, shuffleWords, STEPS, formulaMarkers, parseFormula } from "../shared/grammar.js";
import { summary, nextPattern, patternOfDay, filterPatterns, patternStatus, stepsDone, mastery, usableSentence, STATUSES } from "../shared/pattern-studio.js";
import { A, T, expLang, genMany, exampleOf, patternProgress, savePattern, award, logEvent, touchDay, setLast, recordAnswer, tierName } from "./core.js";
import { patternQuestions } from "./views-tools.js";
import { lockedPanel, upgradeSheet } from "./upgrade.js";
import { put, RL, trOf, formulaBlocks, sentenceBlocks, karaoke, buildTask, fixTask } from "./blocks.js";

export const PATTERN_VIEWS = {};
const go = (...a) => A.go(...a);
const STEP_ICON = { learn: "book", see: "eye", build: "layers", fix: "edit", master: "trophy" };
const pats = () => Object.values(A.P || {});
const progOf = p => patternProgress(p.n);
const num = n => "#" + String(n).padStart(3, "0");
const meaningOf = p => { const x = p.tr || {}; return T({ en: x.en && x.en.meaning, lo: x.lo && x.lo.meaning, zh: x.zh && x.zh.meaning }) || p.gloss || ""; };
const allMeanings = p => { const x = p.tr || {}; return [x.en && x.en.meaning, x.lo && x.lo.meaning, x.zh && x.zh.meaning, p.gloss]; };
const sayPattern = p => speak(String(p.hz || "").replace(/[.…+A-Za-z/ ]+/g, " ").trim());
// the map remembers its stage / status filter for this visit
const MAP = { stage: null, status: "", q: "" };

function ring(done, total, label, big = false){
  const pct = total ? Math.round(100 * done / total) : 0;
  return h("div", { class: "gs-ring" + (big ? " big" : ""), style: "--p:" + pct, role: "img", "aria-label": done + " / " + total + " " + label },
    h("b", { class: "tabnum" }, done + "/" + total), h("small", null, label));
}
const statusChip = st => h("span", { class: "chip gs-st-" + st }, t("gs_st_" + st));
const dots = m => h("span", { class: "gs-dots", "aria-label": m + " / 5" }, STEPS.map((s, i) => h("i", { class: i < m ? "on" : "" })));

// ---------- the map ----------
PATTERN_VIEWS.patterns = (params = {}) => {
  const list = pats(), now = Date.now();
  const sum = summary(list, progOf, now), nx = nextPattern(list, progOf, now);
  const daily = patternOfDay(list, todayKey(), progOf, now);
  if (params.stage !== undefined) MAP.stage = +params.stage || 0;
  if (MAP.stage === null) MAP.stage = nx ? nx.level || 1 : 0;
  const locked = (A.catalog || []).filter(c => c.type === "patterns" && c.tier > A.tier);
  const stages = [...new Set([...list.map(p => p.level || 1), ...locked.map(c => c.level || 1)])].sort((a, b) => a - b);
  const root = h("div", { class: "gs ps" });
  const grid = h("div", { class: "ps-grid", "aria-live": "polite" });
  const drill = h("section", { class: "ps-drill", hidden: true });
  const countEl = h("span", { class: "muted small tabnum" });

  const card = p => {
    const pr = progOf(p), st = patternStatus(pr, now), m = mastery(pr);
    return h("button", { class: "ps-card", "data-status": st, "data-n": p.n, onclick: () => go("pattern", { n: p.n }) },
      h("span", { class: "ps-card-top" }, h("span", { class: "ps-no tabnum" }, num(p.n)), statusChip(st)),
      h("span", { class: "ps-card-hz lo", lang: "lo" }, p.hz),
      p.py ? h("span", { class: "ps-card-py", html: pyHTML(p.py) }) : null,
      h("span", { class: "ps-card-m" + (expLang() === "lo" ? " lo" : "") }, meaningOf(p)),
      p.formula ? h("span", { class: "ps-card-f" }, formulaBlocks(p.formula)) : null,
      h("span", { class: "ps-card-foot" }, dots(m), h("small", { class: "muted" }, "Stage " + (p.level || 1))));
  };
  const drawGrid = () => {
    const items = filterPatterns(list, { stage: MAP.stage, status: MAP.status, q: MAP.q, meaningOf: allMeanings }, progOf, now);
    const lk = !MAP.status && !MAP.q ? locked.filter(c => !MAP.stage || (c.level || 1) === MAP.stage) : [];
    countEl.textContent = items.length + " " + t("patterns");
    const kids = items.map(card);
    // locked patterns: one card per plan (opens the upgrade sheet)
    const byTier = {}; lk.forEach(c => (byTier[c.tier] = byTier[c.tier] || []).push(c));
    Object.entries(byTier).forEach(([tier, cs]) => kids.push(h("button", { class: "ps-card locked", onclick: () => upgradeSheet({ tier: +tier }) },
      h("span", { class: "ps-card-top" }, h("span", { class: "chip" }, icon("lock"), tierName(+tier))),
      h("span", { class: "ps-card-hz" }, "+" + cs.length), h("span", { class: "ps-card-m" }, t("ps_locked_n", { n: cs.length, p: tierName(+tier) })))));
    put(grid, ...(kids.length ? kids : [h("div", { class: "empty" }, t("search_none"))]));
  };

  // stage tabs with their progress
  const stageTabs = h("div", { class: "ps-tabs", role: "tablist", "aria-label": t("ps_stages") });
  const drawTabs = () => put(stageTabs, ...[0, ...stages].map(s => {
    const inS = s ? list.filter(p => (p.level || 1) === s) : list, d = inS.filter(p => patternStatus(progOf(p), now) === "mastered").length;
    return h("button", { role: "tab", class: "ps-tab", "aria-selected": String(MAP.stage === s), onclick: () => { MAP.stage = s; drawTabs(); drawGrid(); } },
      h("b", null, s ? "Stage " + s : t("ps_all")), h("span", { class: "ps-tab-bar", style: "--p:" + (inS.length ? Math.round(100 * d / inS.length) : 0) }, h("i")),
      h("small", { class: "tabnum" }, d + "/" + inS.length));
  }));
  const statusSel = h("select", { class: "input ps-status", "aria-label": t("ps_status"), onchange: e => { MAP.status = e.target.value; drawStats(); drawGrid(); } },
    h("option", { value: "" }, t("ps_status_all")), STATUSES.map(s => h("option", { value: s, selected: MAP.status === s }, t("gs_st_" + s))));
  const search = h("input", { class: "input ps-search", type: "search", placeholder: t("ps_search_ph"), value: MAP.q, "aria-label": t("ps_search_ph"),
    oninput: debounce(e => { MAP.q = e.target.value; drawGrid(); }, 120) });

  // the four numbers: tap one to filter by it
  const stats = h("div", { class: "ps-stats" });
  const drawStats = () => put(stats, ...[["mastered", "trophy"], ["learning", "spark"], ["review", "repeat"], ["new", "plus"]].map(([s, ic]) =>
    h("button", { class: "ps-stat", "data-s": s, "aria-pressed": String(MAP.status === s), onclick: () => { MAP.status = MAP.status === s ? "" : s; statusSel.value = MAP.status; drawStats(); drawGrid(); grid.scrollIntoView({ behavior: reducedMotion() ? "auto" : "smooth", block: "start" }); } },
      h("span", { class: "ps-stat-ic" }, icon(ic)), h("b", { class: "tabnum" }, String(sum[s])), h("small", null, t("gs_st_" + s)))));

  // quick drill: 8 mixed questions on the patterns that need it most (due, being learned, then mastered, then the stage)
  const startDrill = () => {
    const pick = st => list.filter(p => patternStatus(progOf(p), now) === st);
    let pool = [...pick("review"), ...pick("learning"), ...pick("mastered")].slice(0, 12);
    if (pool.length < 4) pool = pool.concat(list.filter(p => !pool.includes(p) && (!MAP.stage || p.level === MAP.stage)).slice(0, 12 - pool.length));
    const qs = patternQuestions(pool, 8);
    drill.hidden = false;
    const box = h("div", { class: "quiz" });
    put(drill, h("div", { class: "spread" }, h("h2", null, icon("flame"), " " + t("ps_drill")), h("button", { class: "btn ghost sm", onclick: () => { drill.hidden = true; put(drill); } }, icon("x"), t("close"))), box);
    if (!qs.length){ put(box, h("div", { class: "empty" }, t("ps_drill_none"))); return; }
    runQuiz(box, qs, { key: "pdrill", onAnswer: (q, ok, m) => recordAnswer(q.skill, ok, m), onFinish: r => { logEvent("pattern_drill", { pct: r.pct }); if (r.pct >= 60) award(5, "patterns"); }, onAgain: startDrill });
    drill.scrollIntoView({ behavior: reducedMotion() ? "auto" : "smooth", block: "start" });
  };

  const st = nx ? patternStatus(progOf(nx), now) : "";
  put(root,
    h("section", { class: "gs-hero ps-hero card" },
      h("div", { class: "gs-hero-txt" }, h("span", { class: "eyebrow" }, t("nav_patterns")), h("h1", null, t("ps_title")), h("p", null, t("ps_sub")),
        h("div", { class: "row" },
          nx ? h("button", { class: "btn primary ps-go", onclick: () => go("pattern", { n: nx.n }) }, icon("play"), (st === "new" ? t("gs_start") : st === "review" ? t("ps_review") : t("gs_continue")) + ": ",
            h("span", { class: "lo", lang: "lo" }, nx.hz)) : null,
          h("button", { class: "btn", onclick: startDrill }, icon("flame"), t("ps_drill")),
          h("button", { class: "btn ghost", onclick: () => go("gen") }, icon("spark"), t("gen_title")))),
      ring(sum.mastered, sum.total, t("gs_mastered"), true)),
    stats,
    daily ? h("section", { class: "ps-daily card" },
      h("div", { class: "ps-daily-l" }, h("span", { class: "eyebrow" }, icon("sun"), " " + t("ps_daily")),
        h("div", { class: "row ps-daily-hz" }, h("b", { class: "lo", lang: "lo" }, daily.hz), h("button", { class: "ib", "aria-label": t("play"), onclick: () => sayPattern(daily) }, icon("speaker"))),
        daily.py ? h("div", { class: "py", html: pyHTML(daily.py) }) : null,
        h("p", { class: expLang() === "lo" ? "lo" : "" }, meaningOf(daily))),
      h("div", { class: "ps-daily-r" }, daily.formula ? formulaBlocks(daily.formula) : null,
        h("button", { class: "btn primary sm", onclick: () => go("pattern", { n: daily.n }) }, t("ps_open"), icon("right")))) : null,
    drill,
    h("section", { class: "ps-browse" },
      h("div", { class: "ps-bar" }, stageTabs),
      h("div", { class: "ps-bar2" }, search, statusSel, countEl),
      grid));
  drawTabs(); drawStats(); drawGrid();
  if (!list.length && !locked.length) root.append(h("div", { class: "empty" }, t("no_rows")));
  return root;
};

// ---------- one pattern ----------
PATTERN_VIEWS.pattern = ({ n, step }) => {
  const p = A.P[n];
  if (!p){ const lk = (A.catalog || []).find(c => c.type === "patterns" && String(c.n || "") === String(n) && c.tier > A.tier) ||
      (A.catalog || []).find(c => c.type === "patterns" && ["p" + n, "p" + String(n).padStart(3, "0")].includes(String(c.id)) && c.tier > A.tier);
    return lk ? lockedPanel({ tier: lk.tier }) : h("div", { class: "empty" }, t("no_rows")); }
  setLast("pattern", n); touchDay(); logEvent("pattern_open", { ref: "#" + n });
  const D = dict(), EL = expLang(), x = p.tr || {}, trx = x[EL] && x[EL].how ? x[EL] : (x.en || {});
  const tagged = s => { const e = ensureTokens(s, A.engine); return Object.assign({}, e, { toks: tagTokens(e.tokens || [], p.formula, D) }); };
  const examples = (p.examples || []).filter(e => e && e.zh).map(e => tagged(exampleOf(p, e)));
  // sentences for Build, Fix and Master: the examples, then fresh ones from the pattern's generator
  const pool = (() => {
    const seen = new Set(), out = [];
    const add = s => { if (!s || !s.zh || seen.has(s.zh)) return; seen.add(s.zh); const y = s.toks ? s : tagged(s); if (usableSentence(y.toks)) out.push(y); };
    examples.forEach(add);
    try { genMany(p, 6).forEach(add); } catch(e){}
    return out;
  })();
  const markers = new Set(formulaMarkers(parseFormula(p.formula)));
  const grammar = Object.values(A.byType.grammar || {}).filter(g => (g.patterns || []).includes(p.n) ||
    (markers.size && formulaMarkers(parseFormula(g.structure)).some(m => markers.has(m)))).slice(0, 4);
  let P = patternProgress(n);
  const root = h("div", { class: "gs gs-item ps-item" });
  const panel = h("div", { class: "gs-panel" });
  let cur = step && STEPS.includes(step) ? step : (STEPS.find(s => !stepsDone(P)[s]) || "learn");
  const headRing = h("span"), headStatus = h("span");
  const drawHeadRing = () => { const m = mastery(P); put(headRing, h("span", { class: "ps-mini-ring", style: "--p:" + (m * 20), role: "img", "aria-label": m + " / 5" }, h("b", { class: "tabnum" }, m + "/5"))); };
  const drawStatus = () => put(headStatus, statusChip(patternStatus(P)));
  const mark = (patch, msg) => { P = savePattern(n, patch); drawNav(); drawHeadRing(); drawStatus(); if (msg) toast(msg, "ok"); };
  const nav = h("nav", { class: "gs-steps", "aria-label": t("gs_steps") });
  function drawNav(){
    const d = stepsDone(P);
    put(nav, ...STEPS.map((s, i) => h("button", { class: "gs-step" + (s === cur ? " on" : "") + (d[s] ? " done" : ""), "aria-current": s === cur ? "step" : null, onclick: () => { cur = s; draw(); } },
      h("span", { class: "gs-step-ic" }, d[s] ? icon("check") : icon(STEP_ICON[s])), h("span", null, h("small", null, (i + 1) + ""), t("gs_s_" + s)))));
  }
  const toTop = () => root.scrollIntoView({ behavior: reducedMotion() ? "auto" : "smooth", block: "start" });
  const nextBtn = (s, label) => h("button", { class: "btn primary", onclick: () => { cur = s; draw(); toTop(); } }, label || t("gs_next_" + s), icon("right"));

  // 1 Learn: the frame, how it works, the classic mistake
  function learn(){
    const mis = p.mistake && p.mistake.wrong ? p.mistake : null;
    let shown = false;
    const misRight = mis ? h("div", { class: "gs-mis-v ps-reveal", hidden: true }, icon("check"), h("span", { class: "lo", lang: "lo" }, mis.right),
      h("button", { class: "ib", "aria-label": t("play"), onclick: () => speak(String(mis.right).split("/")[0]) }, icon("play"))) : null;
    return h("div", { class: "stack" },
      p.formula ? h("section", { class: "card gs-formula-card" }, h("div", { class: "eyebrow" }, t("gs_formula")), formulaBlocks(p.formula, { big: true }),
        h("p", { class: "small muted" }, t("ps_formula_d"))) : null,
      trx.how || x.en && x.en.how ? h("section", { class: "card" }, h("h3", null, t("how_why")),
        h("p", { class: "gs-explain" + (trx === x.lo ? " lo" : "") }, trx.how || x.en.how),
        trx.note || (x.en && x.en.note) ? h("p", { class: "ps-note" }, icon("info"), h("span", null, trx.note || x.en.note)) : null) : null,
      mis ? h("section", { class: "card stack" }, h("h3", null, t("gs_watch_out")),
        h("div", { class: "gs-mis" }, h("div", { class: "gs-mis-x" }, icon("x"), h("span", { class: "lo", lang: "lo" }, mis.wrong)), misRight,
          mis.tr ? h("small", { class: "muted ps-reveal", hidden: true }, tr(mis.tr, EL)) : null),
        h("button", { class: "btn sm ghost ps-reveal-btn", onclick: e => { shown = !shown; e.currentTarget.closest(".card").querySelectorAll(".ps-reveal").forEach(el => el.hidden = !shown);
          e.currentTarget.textContent = shown ? t("ps_hide_fix") : t("ps_show_fix"); } }, t("ps_show_fix"))) : null,
      grammar.length ? h("div", { class: "wordchips" }, h("span", { class: "muted small" }, t("ps_related") + ":"), grammar.map(g => h("button", { onclick: () => go("grammarItem", { id: g.id }) }, icon("layers"), " ", T(g.title)))) : null,
      h("div", { class: "row gs-actions" }, h("button", { class: "btn primary", onclick: () => { if (!P.learn) mark({ learn: 1 }); cur = "see"; draw(); toTop(); } }, icon("check"), t("gs_got_it"))));
  }

  // 2 See it: examples as blocks + the Lab (new sentences from the generator)
  function see(){
    let showGloss = true, showRoles = true;
    const list = h("div", { class: "stack" });
    const exCard = (s, fresh) => { const blocks = sentenceBlocks(s.toks, { gloss: showGloss, roles: showRoles });
      return h("article", { class: "card gs-ex" + (fresh ? " ps-fresh" : "") }, blocks,
        h("div", { class: "gs-ex-foot" }, h("p", { class: "gs-ex-tr" + (EL === "lo" ? " lo" : "") }, trOf(s)),
          h("button", { class: "btn sm", onclick: () => { karaoke(blocks, s.zh); if (!P.see) mark({ see: 1 }); } }, icon("play"), t("play")))); };
    const fresh = [];
    const drawList = () => put(list, ...examples.map(s => exCard(s)));
    const labList = h("div", { class: "stack" });
    const drawLab = () => put(labList, ...fresh.map(s => exCard(s, true)));
    drawList();
    const canGen = (p.gen || []).length > 0;
    const make = () => { const got = genMany(p, 1).map(tagged).filter(s => !fresh.some(f => f.zh === s.zh) && !examples.some(e => e.zh === s.zh));
      if (!got.length){ toast(t("ps_lab_same")); return; }
      fresh.unshift(got[0]); if (fresh.length > 6) fresh.pop(); drawLab(); logEvent("generate", { ref: "#" + n }); };
    const tog = (label, get, set) => h("label", { class: "gs-tog" }, h("input", { type: "checkbox", checked: get(), onchange: e => { set(e.target.checked); drawList(); drawLab(); } }), label);
    return h("div", { class: "stack" },
      p.formula ? formulaBlocks(p.formula) : null,
      h("div", { class: "row" }, tog(t("gs_show_gloss"), () => showGloss, v => showGloss = v), tog(t("gs_show_roles"), () => showRoles, v => showRoles = v),
        examples.length > 1 ? h("button", { class: "btn sm ghost", onclick: () => speak(examples.map(e => e.zh).join(" ")) }, icon("play"), t("play_all")) : null),
      examples.length ? list : h("div", { class: "empty" }, t("gs_no_examples")),
      canGen ? h("section", { class: "card ps-lab" }, h("div", { class: "spread" }, h("div", null, h("h3", null, icon("spark"), " " + t("ps_lab_t")), h("p", { class: "small muted" }, t("ps_lab_d"))),
        h("button", { class: "btn primary", onclick: make }, icon("spark"), t("ps_lab_btn"))), labList) : null,
      h("p", { class: "small muted" }, t("gs_see_d")),
      h("div", { class: "row gs-actions" }, h("button", { class: "btn primary", onclick: () => { if (!P.see) mark({ see: 1 }); cur = "build"; draw(); toTop(); } }, t("gs_next_build"), icon("right"))));
  }

  const fix = (s, cb) => fixTask(s, cb, { mistakes: p.mistake ? [p.mistake] : [] });
  // 3 Build and 4 Fix: two right answers complete the step (more practice stays possible)
  function practice(kind){
    const box = h("div", { class: "stack" });
    let i = 0;
    const counter = h("span", { class: "chip" });
    const items = shuffleWords(pool.map((_, k) => k)).map(k => pool[k]);
    const need = 2;
    const one = () => {
      if (!items.length){ put(box, h("div", { class: "empty" }, t("gs_no_examples"))); return; }
      const s = items[i % items.length]; i++;
      counter.textContent = t("gs_count_" + kind, { n: Math.min(P[kind] || 0, need), m: need });
      const next = h("button", { class: "btn primary", hidden: true, onclick: one }, t("next"), icon("right"));
      const actions = h("div", { class: "row gs-actions" }, next);
      const offerNext = () => { if (!stepsDone(P)[kind] || actions.querySelector(".gs-go")) return; next.className = "btn"; next.replaceChildren(icon("repeat"), t("gs_one_more"));
        const go2 = nextBtn(kind === "build" ? "fix" : "master"); go2.classList.add("gs-go"); actions.append(go2); };
      const task = (kind === "build" ? buildTask : fix)(s, (ok, first = true) => {
        if (ok){ mark({ [kind]: (P[kind] || 0) + 1 }); award(kind === "build" ? (first ? 4 : 2) : 3, "patterns"); counter.textContent = t("gs_count_" + kind, { n: Math.min(P[kind], need), m: need }); }
        next.hidden = false;
        if (ok && stepsDone(P)[kind] && P[kind] === need) toast(t("gs_step_done"), "ok");
        offerNext();
        (actions.querySelector(".gs-go") || next).focus({ preventScroll: true });
      });
      put(box, h("div", { class: "spread" }, h("span", { class: "muted small" }, t("gs_s_" + kind) + " · " + i), counter), task, actions);
      offerNext();
    };
    one();
    return box;
  }

  // 5 Master: 6 mixed questions; 80 % or more masters the pattern
  function master(){
    const box = h("div", { class: "stack" });
    const N = Math.min(6, Math.max(2, pool.length * 2));
    const mix = shuffleWords(pool.map((_, k) => k)), items = [];
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
        (it.kind === "build" ? buildTask : fix)(it.s, ok => { if (ok) score++; next.hidden = false; next.focus({ preventScroll: true }); }), h("div", { class: "row gs-actions" }, next));
    };
    const result = () => {
      const pct = Math.round(100 * score / items.length), passed = pct >= 80, first = passed && !stepsDone(P).master;
      const patch = { best: Math.max(P.best || 0, pct), tries: (P.tries || 0) + 1 };
      if (passed){ patch.masteredAt = Date.now(); if (P.masteredAt) patch.reviews = (P.reviews || 0) + 1; }
      mark(patch); if (passed) award(first ? 20 : 8, "patterns");
      logEvent("pattern_master", { ref: "#" + n, pct });
      const others = pats().filter(q => q.n !== p.n), nx = nextPattern(others, progOf);
      put(box, h("div", { class: "card gs-result" + (passed ? " win" : "") },
        h("div", { class: "gs-ring big", style: "--p:" + pct }, h("b", { class: "tabnum" }, pct + "%"), h("small", null, score + "/" + items.length)),
        h("h2", null, t(passed ? "ps_master_win" : "gs_master_again")), h("p", { class: "muted" }, t(passed ? "ps_master_win_d" : "gs_master_again_d")),
        h("div", { class: "row" }, h("button", { class: "btn" + (passed ? "" : " primary"), onclick: () => { i = 0; score = 0; run(); } }, icon("repeat"), t("again")),
          passed && nx ? h("button", { class: "btn primary", onclick: () => go("pattern", { n: nx.n }) }, t("ps_next_pattern"), icon("right")) : null,
          h("button", { class: "btn ghost", onclick: () => go("patterns") }, t("ps_map")))));
    };
    put(box, h("div", { class: "card stack gs-intro" }, h("div", { class: "gs-intro-ic" }, icon("trophy")), h("b", null, t("gs_master_t", { n: N })), h("p", { class: "muted small" }, t("gs_master_d")),
      h("button", { class: "btn primary", onclick: run, disabled: !pool.length }, icon("play"), t("start"))));
    return box;
  }

  function draw(){
    drawNav();
    const body = cur === "learn" ? learn() : cur === "see" ? see() : cur === "build" ? practice("build") : cur === "fix" ? practice("fix") : master();
    put(panel, h("div", { class: "gs-enter" }, body));
  }
  const all = pats().sort((a, b) => ((a.level || 1) - (b.level || 1)) || (a.n - b.n)), idx = all.indexOf(p), pv = all[idx - 1], nxp = all[idx + 1];
  const sub = EL !== "lo" && x.lo && x.lo.meaning ? x.lo.meaning : "";
  drawHeadRing(); drawStatus();
  put(root,
    h("div", { class: "crumb" }, h("button", { onclick: () => go("patterns") }, t("nav_patterns")), "›", h("button", { onclick: () => go("patterns", { stage: p.level || 1 }) }, "Stage " + (p.level || 1)), "›", h("span", null, num(p.n))),
    h("section", { class: "card ps-head" },
      h("div", { class: "ps-head-l" },
        h("div", { class: "row ps-head-meta" }, h("span", { class: "ps-no tabnum" }, num(p.n)), p.sec ? h("span", { class: "chip" }, p.sec + " · " + secName(p.sec)) : null, headStatus),
        h("div", { class: "row ps-head-hz" }, h("h1", { class: "lo", lang: "lo" }, p.hz), h("button", { class: "ib ps-say", "aria-label": t("play"), onclick: () => sayPattern(p) }, icon("speaker"))),
        p.py ? h("div", { class: "py ps-head-py", html: pyHTML(p.py) }) : null,
        h("p", { class: "ps-head-m" + (EL === "lo" ? " lo" : "") }, meaningOf(p)),
        sub ? h("p", { class: "ps-head-sub lo", lang: "lo" }, sub) : null),
      h("div", { class: "ps-head-r" }, headRing, toggleBtn("p:" + n, { type: "pattern", n }, "btn sm"))),
    nav, panel,
    h("div", { class: "pnav" }, pv ? h("button", { class: "btn", onclick: () => go("pattern", { n: pv.n }) }, icon("left"), h("span", { class: "lo" }, pv.hz)) : h("span"),
      nxp ? h("button", { class: "btn", onclick: () => go("pattern", { n: nxp.n }) }, h("span", { class: "lo" }, nxp.hz), icon("right")) : h("span")));
  draw();
  return root;
};
