// Flashcard Studio: the learner builds a deck (which words, how many, which activity), plays it one card at a time,
// gets hints and coaching pop-ups, and sees a summary. Every answer is saved per word (see recordCard in core.js).
// Logic (decks, hints, the round, coaching) is in js/shared/flashcards.js.
import { h, icon, pyHTML, confirmDialog, reducedMotion } from "../shared/ui.js";
import { t } from "../shared/i18n.js";
import { dict } from "../shared/dict.js";
import { speak, audioSource } from "../shared/speech.js";
import { openWord } from "../shared/widgets.js";
import { pictureFor } from "../shared/word-pictures.js";
import { SIZES, MODES, SOURCES, WORD_TYPES, wordPool, backMeaning, firstGloss, buildDeck, choicesFor, modeFor, hintsFor, createRound, coachFor, overview } from "../shared/flashcards.js";
import { A, prefs, setPref, expLang, recordCard, recordCardRound, wordItems, trickyWords } from "./core.js";

export const CARD_VIEWS = {};
const go = (...a) => A.go(...a);
const DEFAULTS = { source: "smart", size: 10, mode: "flip", type: "all", rom: true, sound: true };
const MODE_ICON = { flip: "cards", choose: "list", listen: "headphones", reverse: "repeat", mix: "spark" };
const HINT_ICON = { picture: "image", type: "info", clue: "book", context: "note", sound: "speaker", letters: "pen" };
const POS_KEY = { noun: "fc_k_noun", pron: "fc_k_pron", clf: "fc_k_clf", verb: "fc_k_verb", adj: "fc_k_adj", adv: "fc_k_adv", num: "fc_k_num", phrase: "fc_k_phrase", particle: "fc_k_particle", joiner: "fc_k_joiner" };
// replaceChildren() would print a missing (null) child as the text "null"
const put = (el, ...kids) => el.replaceChildren(...kids.filter(k => k != null));
const loEl = (txt, cls = "") => h("span", { class: ("lo " + cls).trim(), lang: "lo" }, txt);

CARD_VIEWS.cards = ({ words, title, stage } = {}) => {
  const D = dict(), EL = expLang();
  const pool = wordPool(D, { words });
  const S = Object.assign({}, DEFAULTS, prefs().cards || {});
  S.stage = stage || S.stage || A.profile.level || 1;
  if (words) S.source = "smart";
  const root = h("div", { class: "fc" });
  const save = () => { const { stage: _, ...keep } = S; setPref("cards", keep); };
  const examples = A.examples || [];
  const items = () => wordItems();
  const deck = (o = {}) => buildDeck(pool, items(), Object.assign({}, S, o));

  // ---------- setup ----------
  function setup(){
    const ov = overview(pool, items());
    const tricky = trickyWords().filter(x => !words || words.includes(x.w));
    const stages = [1, 2, 3, 4, 5, 6].map(n => ({ n, c: pool.filter(e => (e.h || 1) === n).length }));
    const chips = (key, opts, label) => h("div", { class: "fc-field" }, h("div", { class: "fc-label" }, label),
      h("div", { class: "fc-chips", role: "radiogroup", "aria-label": label }, opts.map(([v, txt, n]) =>
        h("button", { type: "button", role: "radio", "aria-checked": String(S[key] === v), class: "fc-chip", disabled: n === 0 && key !== "size" ? true : null,
          onclick: () => { S[key] = v; save(); setup(); } }, txt, n !== undefined && n !== null ? h("small", null, String(n)) : null))));
    const n = deck().length;
    const tiles = [["new", "fc_s_new", "spark"], ["learning", "fc_s_learning", "repeat"], ["mastered", "fc_s_mastered", "trophy"], ["tricky", "fc_s_tricky", "flame"], ["due", "fc_s_due", "clock"]];
    put(root,
      h("div", { class: "pagehead" }, h("div", { class: "crumb" }, h("button", { onclick: () => go("vocab") }, t("nav_vocab")), "›", h("span", null, t("fc_title"))),
        h("h1", null, title ? t("fc_title") + " · " + title : t("fc_title")), h("p", null, t("fc_sub"))),
      h("div", { class: "fc-ov" }, tiles.map(([k, label, ic]) => h("div", { class: "fc-ov-t fc-" + k }, icon(ic), h("b", { class: "tabnum" }, String(ov[k])), h("span", null, t(label))))),
      tricky.length ? h("div", { class: "fc-alert", role: "status" }, h("span", { class: "fc-alert-ic" }, icon("flame")),
        h("div", null, h("b", null, t("fc_tricky_t", { n: tricky.length })), h("p", null, t("fc_tricky_d")),
          h("div", { class: "fc-mini" }, tricky.slice(0, 6).map(x => h("button", { class: "chip", onclick: () => openWord(x.w) }, loEl(x.w), h("small", null, " ×" + (x.miss + x.skip)))))),
        h("button", { class: "btn primary sm", onclick: () => { S.source = "tricky"; save(); start(); } }, t("fc_practise_now"))) : null,
      h("section", { class: "card fc-setup" },
        chips("source", SOURCES.filter(s => !(words && s === "stage")).map(s => [s, t("fc_src_" + s), s === "new" ? ov.new : s === "due" ? ov.due : s === "tricky" ? ov.tricky : null]), t("fc_what")),
        !words && (S.source === "stage" || S.source === "new" || S.source === "smart") ? chips("stage", stages.map(x => [x.n, "Stage " + x.n, x.c]), t("fc_stage")) : null,
        chips("type", Object.keys(WORD_TYPES).map(k => [k, t("fc_type_" + k)]), t("fc_type")),
        chips("size", SIZES.map(z => [z, String(z)]), t("fc_size")),
        h("div", { class: "fc-field" }, h("div", { class: "fc-label" }, t("fc_activity")),
          h("div", { class: "fc-modes", role: "radiogroup", "aria-label": t("fc_activity") }, MODES.map(m =>
            h("button", { type: "button", role: "radio", "aria-checked": String(S.mode === m), class: "fc-mode", onclick: () => { S.mode = m; save(); setup(); } },
              h("span", { class: "fc-mode-ic" }, icon(MODE_ICON[m])), h("b", null, t("fc_m_" + m)), h("small", null, t("fc_m_" + m + "_d")))))),
        h("div", { class: "fc-field fc-toggles" },
          h("label", { class: "fc-tog" }, h("input", { type: "checkbox", checked: S.rom, onchange: e => { S.rom = e.target.checked; save(); } }), t("fc_opt_rom")),
          h("label", { class: "fc-tog" }, h("input", { type: "checkbox", checked: S.sound, onchange: e => { S.sound = e.target.checked; save(); } }), t("fc_opt_sound"))),
        h("div", { class: "fc-start" },
          n ? null : h("p", { class: "muted small", role: "status" }, t("fc_empty_" + S.source)),
          h("button", { class: "btn primary fc-go", disabled: n ? null : true, onclick: () => start() }, icon("play"), n ? t("fc_start", { n }) : t("fc_start0")))));
  }
  function start(cards){
    cards = cards || deck();
    if (!cards.length){ setup(); return; }
    play(cards);
  }

  // ---------- the round ----------
  function play(cards){
    const round = createRound(cards), shown = {};
    let card, mode, hints, hintList, flipped, answered, t0, coachEl = null;
    const stage = h("div", { class: "fc-play" });
    const bar = h("i"), count = h("span", { class: "tabnum" }), streakEl = h("span", { class: "fc-streak", hidden: true });
    const closeBtn = h("button", { class: "btn ghost fc-close", "aria-label": t("fc_stop"), onclick: stop }, icon("x"));
    const head = h("div", { class: "fc-top" }, closeBtn, h("div", { class: "fc-bar", "aria-hidden": "true" }, bar), count, streakEl);
    const body = h("div", { class: "fc-body" });
    stage.append(head, body);
    root.replaceChildren(stage);
    const say = w => speak(w);
    const autoSay = w => { if (audioSource(w) !== "none") say(w); };
    let streak = 0;

    function next(){
      if (coachEl) return;
      if (round.done){ finish(); return; }
      const cur = round.current(); card = cur.card;
      mode = modeFor(S.mode, round.index, { hasAudio: audioSource(card.w) !== "none" });
      hints = 0; flipped = false; answered = false; t0 = Date.now();
      hintList = hintsFor(card, { lang: EL, examples, picture: pictureFor(card.en) });
      const total = round.queue.length;
      bar.style.width = Math.round(100 * round.index / total) + "%";
      count.textContent = (round.index + 1) + " / " + total;
      body.replaceChildren(mode === "flip" ? flipCard(cur.again) : choiceCard(cur.again));
      if (mode === "listen" || (S.sound && mode === "flip")) setTimeout(() => body.isConnected && autoSay(card.w), 250);
    }
    const againTag = again => again ? h("span", { class: "chip warn fc-again" }, icon("repeat"), t("fc_again_tag")) : null;
    const romEl = () => S.rom && card.p ? h("div", { class: "fc-rom", html: pyHTML(card.p) }) : null;
    const meaningEl = () => h("div", { class: "fc-meaning" + (EL === "lo" && backMeaning(card, EL) !== card.en ? " lo" : "") }, backMeaning(card, EL));
    function details(){
      const ex = examples.find(e => e && e.zh && e.zh.includes(card.w) && e.zh !== card.w);
      const pic = pictureFor(card.en), kind = (hintsFor(card, {}).find(x => x.kind === "type") || {}).value;
      return h("div", { class: "fc-details" },
        pic ? h("div", { class: "fc-pic", "aria-hidden": "true" }, pic) : null,
        meaningEl(),
        h("div", { class: "fc-meta" }, card.p ? h("span", { html: pyHTML(card.p) }) : null, kind ? h("span", { class: "chip" }, t(POS_KEY[kind])) : null,
          h("button", { class: "btn sm ghost", onclick: e => { e.stopPropagation(); say(card.w); } }, icon("speaker"), t("play"))),
        ex ? h("div", { class: "fc-ex" }, loEl(ex.zh), ex.tr ? h("small", null, ex.tr[EL] || ex.tr.en || "") : null) : null);
    }
    // hints, gentlest first; each press shows one more
    const hintBox = h("div", { class: "fc-hints", "aria-live": "polite" });
    function hintBtn(){
      return h("button", { class: "btn fc-hint", disabled: hints >= hintList.length ? true : null, onclick: showHint },
        icon("spark"), t("fc_hint"), h("small", { class: "tabnum" }, " " + (hintList.length - hints)), h("kbd", null, "H"));
    }
    function hintEl(x){
      const val = x.kind === "type" ? t(POS_KEY[x.value]) : x.kind === "sound" ? h("span", { html: pyHTML(x.value) }) : x.kind === "context" || x.kind === "clue" ? loEl(x.value) : x.value;
      return h("div", { class: "fc-hint-row fc-h-" + x.kind }, icon(HINT_ICON[x.kind]), h("span", { class: "fc-hint-k" }, t("fc_h_" + x.kind)),
        h("span", { class: "fc-hint-v" }, val, x.tr ? h("small", null, " · " + x.tr) : null, x.kind === "letters" ? h("small", null, " (" + t("fc_letters", { n: x.len }) + ")") : null));
    }
    function showHint(){
      if (answered || flipped || hints >= hintList.length) return;
      const x = hintList[hints++]; hintBox.append(hintEl(x));
      if (x.kind === "sound") say(card.w);
      const b = body.querySelector(".fc-hint"); if (b) b.replaceWith(hintBtn());
    }
    hintBox.replaceChildren();

    function flipCard(again){
      hintBox.replaceChildren();
      const inner = h("div", { class: "fc-inner" },
        h("div", { class: "fc-face fc-front" }, againTag(again), h("div", { class: "fc-word lo", lang: "lo" }, card.w), romEl(),
          h("button", { class: "btn sm ghost", onclick: e => { e.stopPropagation(); say(card.w); } }, icon("speaker"), t("play")), h("small", { class: "muted" }, t("fc_tap_flip"))),
        h("div", { class: "fc-face fc-back", "aria-hidden": "true" }, h("div", { class: "fc-word sm lo", lang: "lo" }, card.w), details()));
      const cardEl = h("div", { class: "fc-card", role: "button", tabindex: "0", "aria-label": t("fc_flip") }, inner);
      const pre = h("div", { class: "fc-actions" }, hintBtn(), h("button", { class: "btn primary", onclick: flip }, icon("repeat"), t("fc_flip"), h("kbd", null, "␣")),
        h("button", { class: "btn ghost", onclick: () => grade("skipped") }, t("q_skip"), h("kbd", null, "S")));
      const post = h("div", { class: "fc-actions fc-grades", hidden: true },
        h("button", { class: "btn fc-g0", onclick: () => grade("missed") }, icon("x"), t("fc_g_missed"), h("kbd", null, "1")),
        h("button", { class: "btn fc-g1", onclick: () => grade("almost") }, icon("hourglass"), t("fc_g_almost"), h("kbd", null, "2")),
        h("button", { class: "btn fc-g2", onclick: () => grade("known") }, icon("check"), t("fc_g_known"), h("kbd", null, "3")));
      const swipeTip = h("p", { class: "muted small fc-swipe", hidden: true }, t("fc_swipe"));
      function flip(){
        if (flipped) return; flipped = true;
        cardEl.classList.add("is-flipped"); inner.children[0].setAttribute("aria-hidden", "true"); inner.children[1].removeAttribute("aria-hidden");
        cardEl.setAttribute("aria-label", backMeaning(card, EL));
        pre.hidden = true; post.hidden = false; swipeTip.hidden = false;
        post.querySelector(".fc-g2").focus({ preventScroll: true });
      }
      cardEl.addEventListener("click", () => { if (!flipped) flip(); });
      cardEl.addEventListener("keydown", e => { if ((e.key === "Enter") && !flipped){ e.preventDefault(); flip(); } });
      // after the flip: swipe right = knew it, left = didn't know
      let x0 = null;
      cardEl.addEventListener("pointerdown", e => { if (flipped) { x0 = e.clientX; cardEl.setPointerCapture(e.pointerId); } });
      cardEl.addEventListener("pointermove", e => { if (x0 !== null){ const dx = e.clientX - x0; cardEl.style.translate = dx + "px 0"; cardEl.style.rotate = (dx / 30) + "deg"; cardEl.dataset.swipe = dx > 60 ? "right" : dx < -60 ? "left" : ""; } });
      const endSwipe = e => { if (x0 === null) return; const dx = e.clientX - x0; x0 = null; cardEl.style.translate = cardEl.style.rotate = ""; cardEl.dataset.swipe = "";
        if (dx > 90) grade("known"); else if (dx < -90) grade("missed"); };
      cardEl.addEventListener("pointerup", endSwipe); cardEl.addEventListener("pointercancel", () => { x0 = null; cardEl.style.translate = cardEl.style.rotate = ""; });
      return h("div", { class: "fc-slot fc-enter" }, cardEl, hintBox, pre, post, swipeTip);
    }

    function choiceCard(again){
      hintBox.replaceChildren();
      const reverse = mode === "reverse", listen = mode === "listen";
      const opts = choicesFor(card, pool.length >= 4 ? pool : wordPool(D), { lang: EL, reverse: reverse || listen });
      const prompt = listen
        ? h("button", { class: "fc-listen", "aria-label": t("play"), onclick: () => say(card.w) }, icon("headphones"), h("span", null, t("fc_listen_again")))
        : reverse ? h("div", { class: "fc-meaning big" + (EL === "lo" && backMeaning(card, EL) !== card.en ? " lo" : "") }, firstGloss(backMeaning(card, EL)))
        : h("div", null, h("div", { class: "fc-word lo", lang: "lo" }, card.w), romEl());
      const q = h("p", { class: "fc-q" }, t(listen ? "fc_q_listen" : reverse ? "fc_q_reverse" : "fc_q_choose"));
      const after = h("div", { class: "fc-after", hidden: true });
      const list = h("div", { class: "fc-opts" + (reverse || listen ? " lo-opts" : "") }, opts.map((o, i) =>
        h("button", { class: "fc-opt", "data-right": o.right ? "1" : null, onclick: e => pick(o, e.currentTarget) },
          h("kbd", null, String(i + 1)), reverse || listen ? loEl(o.label) : h("span", { class: EL === "lo" && /[຀-໿]/.test(o.label) ? "lo" : "" }, o.label))));
      const actions = h("div", { class: "fc-actions" }, hintBtn(), h("button", { class: "btn ghost", onclick: () => { if (!answered){ answered = true; reveal(null); commit("skipped"); } } }, t("q_skip"), h("kbd", null, "S")));
      let outcome = null;
      function pick(o, btn){
        if (answered) return; answered = true;
        outcome = o.right ? (hints ? "almost" : "known") : "missed";
        reveal(btn); commit(outcome);
      }
      function reveal(btn){
        list.querySelectorAll(".fc-opt").forEach(b => { b.disabled = true; if (b.dataset.right) b.classList.add("right"); });
        if (btn && !btn.dataset.right) btn.classList.add("wrong");
        actions.hidden = true;
        after.replaceChildren(h("div", { class: "fc-verdict " + (outcome === "missed" || !btn ? "no" : "ok") }, icon(outcome === "missed" || !btn ? "fail" : "ok"),
          btn ? t(outcome === "missed" ? "incorrect" : "correct") : t("fc_skipped")),
          h("div", { class: "fc-word sm lo", lang: "lo" }, card.w), details(),
          h("button", { class: "btn primary fc-next", onclick: () => next() }, t("next"), icon("right"), h("kbd", null, "↵")));
        after.hidden = false;
        after.querySelector(".fc-next").focus({ preventScroll: true });
        if (S.sound && !listen) autoSay(card.w);
      }
      return h("div", { class: "fc-slot fc-enter" }, h("div", { class: "fc-card flat" }, againTag(again), prompt, q), hintBox, list, actions, after);
    }

    // a grade from the flip card: save it and move on
    function grade(outcome){
      if (answered) return; answered = true;
      commit(outcome);
      if (!coachEl) setTimeout(next, reducedMotion() ? 0 : 160);
    }
    function commit(outcome){
      recordCard(card.w, outcome, { hints });
      round.answer(outcome, { hints, ms: Date.now() - t0 });
      streak = outcome === "known" || outcome === "almost" ? streak + 1 : 0;
      streakEl.hidden = streak < 3; streakEl.replaceChildren(icon("flame"), String(streak));
      const c = coachFor(round.results, shown);
      if (c){ shown[c.key] = round.results.length; coach(c); }
    }

    // ---------- coaching pop-up ----------
    function coach(c){
      // a flip card moves on when the pop-up closes; a choice card waits for Next as usual
      const close = () => { coachEl.remove(); coachEl = null; if (mode === "flip") next(); };
      const actions = [];
      if (c.key === "skips" || c.key === "misses"){
        if (S.mode !== "choose") actions.push(h("button", { class: "btn primary", onclick: () => { S.mode = "choose"; close(); } }, t("fc_coach_choose")));
        actions.push(h("button", { class: "btn" + (actions.length ? "" : " primary"), onclick: close }, t("fc_coach_keep")));
      } else actions.push(h("button", { class: "btn primary", onclick: close }, t("fc_coach_ok")));
      coachEl = h("div", { class: "fc-coach fc-coach-" + c.tone, role: "alertdialog", "aria-modal": "false", "aria-labelledby": "fc-coach-t" },
        h("div", { class: "fc-coach-ic", "aria-hidden": "true" }, { skips: "⏭️", misses: "🧗", hints: "💡", streak: "🔥" }[c.key]),
        h("b", { id: "fc-coach-t" }, t("fc_coach_" + c.key + "_t", { n: c.n })), h("p", null, t("fc_coach_" + c.key + "_d", { n: c.n })),
        h("div", { class: "row" }, actions));
      stage.append(coachEl);
      coachEl.querySelector("button").focus({ preventScroll: true });
    }

    async function stop(){
      if (round.index > 0 && !round.done && !(await confirmDialog(t("fc_stop_q"), t("fc_stop_d"), t("fc_stop"), t("cancel")))) return;
      if (round.index > 0) recordCardRound(round.summary(), { mode: S.mode, source: S.source });
      setup();
    }

    // ---------- summary ----------
    function finish(){
      const s = round.summary();
      recordCardRound(s, { mode: S.mode, source: S.source });
      const tile = (k, n, ic) => h("div", { class: "fc-sum-t fc-" + k }, icon(ic), h("b", { class: "tabnum" }, String(n)), h("span", null, t("fc_r_" + k)));
      const ring = h("div", { class: "fc-ring", style: "--p:" + s.pct, role: "img", "aria-label": s.pct + "%" }, h("b", { class: "tabnum" }, s.pct + "%"), h("small", null, t("fc_r_score")));
      const msg = s.pct >= 90 ? "fc_msg_great" : s.pct >= 60 ? "fc_msg_good" : "fc_msg_keep";
      const prac = s.toPractise.map(w => pool.find(e => e.w === w)).filter(Boolean);
      root.replaceChildren(h("div", { class: "fc-sum card" },
        h("div", { class: "eyebrow" }, t("round_done")), h("h2", null, t(msg)),
        h("div", { class: "fc-sum-top" }, ring, h("div", { class: "fc-sum-tiles" },
          tile("known", s.known, "check"), tile("almost", s.almost, "hourglass"), tile("missed", s.missed, "x"), tile("skipped", s.skipped, "right"), tile("hints", s.hints, "spark"))),
        h("p", { class: "muted small" }, t("fc_r_time", { m: Math.max(1, Math.round(s.ms / 60000)) }) + (s.fixed.length ? " · " + t("fc_r_fixed", { n: s.fixed.length }) : "")),
        prac.length ? h("div", { class: "fc-field" }, h("div", { class: "fc-label" }, t("fc_r_practise")),
          h("div", { class: "fc-mini" }, prac.map(e => h("button", { class: "chip", onclick: () => openWord(e.w) }, loEl(e.w), h("small", null, " " + firstGloss(backMeaning(e, EL))))))) : null,
        h("div", { class: "row fc-sum-btns" },
          prac.length ? h("button", { class: "btn primary", onclick: () => play(prac) }, icon("repeat"), t("fc_r_again", { n: prac.length })) : null,
          h("button", { class: "btn" + (prac.length ? "" : " primary"), onclick: () => start() }, icon("play"), t("fc_r_new")),
          h("button", { class: "btn ghost", onclick: setup }, icon("sliders"), t("fc_r_settings")))));
      root.querySelector(".fc-sum-btns .btn").focus({ preventScroll: true });
    }

    // keyboard: Space flips, 1-4 answer, H hint, S skip, Enter next
    const onKey = e => {
      if (!stage.isConnected){ document.removeEventListener("keydown", onKey); return; }
      if (e.target.closest && e.target.closest("input, textarea, select") || e.ctrlKey || e.metaKey || e.altKey) return;
      if (coachEl){ if (e.key === "Escape") coachEl.querySelector(".btn:last-child").click(); return; }
      const k = e.key.toLowerCase(), slot = body.querySelector(".fc-slot");
      if (!slot) return;
      if (k === "h"){ e.preventDefault(); showHint(); return; }
      if (mode === "flip"){
        if ((k === " " || k === "enter") && !flipped){ e.preventDefault(); slot.querySelector(".fc-actions .btn.primary").click(); }
        else if (k === "s" && !flipped){ e.preventDefault(); grade("skipped"); }
        else if (flipped && ["1", "2", "3"].includes(k)){ e.preventDefault(); grade(["missed", "almost", "known"][+k - 1]); }
      } else {
        if (!answered && ["1", "2", "3", "4"].includes(k)){ const b = slot.querySelectorAll(".fc-opt")[+k - 1]; if (b){ e.preventDefault(); b.click(); } }
        else if (!answered && k === "s"){ e.preventDefault(); slot.querySelector(".fc-actions .btn.ghost").click(); }
        else if (answered && k === "enter"){ e.preventDefault(); next(); }
      }
    };
    document.addEventListener("keydown", onKey);
    next();
  }

  setup();
  return root;
};
