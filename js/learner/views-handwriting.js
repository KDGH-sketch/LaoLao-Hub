// Learner Script & Handwriting, organised the way Lao is taught:
//   Consonants by class (middle · high · low · ຫ-combinations) · Vowels by where they are written (after · above ·
//   below · before · around the consonant) · Tone marks and signs · Numerals · Words (a random word, written left to right).
// Two ways to check writing:
//   - stroke order, for letters whose teacher-made stroke template exists (characters/{id}.handwriting, recognizer.js)
//   - shape, for every letter, vowel, mark and word (the letter as the Lao font draws it, shape.js) — so practice never
//     depends on templates being drawn first.
// Words follow the writing rules of Lao: left to right, a vowel such as ເ before its consonant, a consonant before the
// vowel or tone mark written on it (lao-script.js writingCells / placeStroke / zoneOf).
import { h, icon, tr, toast, reducedMotion } from "../shared/ui.js";
import { t, lang } from "../shared/i18n.js";
import { speak, audioSource } from "../shared/speech.js";
import { dict } from "../shared/dict.js";
import { createPad } from "../shared/handwriting/pad.js";
import { sfx } from "../shared/sfx.js";
import { createCellPad } from "../shared/handwriting/cellpad.js";
import { penPanel } from "../shared/handwriting/pen-panel.js";
import { glyphMask, inkMask, compareShape, PASS } from "../shared/handwriting/shape.js";
import { playDemo } from "../shared/handwriting/animator.js";
import { readTemplate, mergeHwRules } from "../shared/handwriting/model.js";
import { createSession } from "../shared/handwriting/recognizer.js";
import { scoreAttempt, strokeFeedback, attemptTip, COMPONENTS } from "../shared/handwriting/scorer.js";
import { CONSONANTS, VOWELS, VOWEL_POSITIONS, TONE_MARKS, SIGNS, NUMERALS, CLASSES, SECTIONS, section, glyphId, writingCells, writingRules, zoneOf, writingWords, randomWord } from "../shared/lao-script.js";
import { A, recordHandwriting, handwritingProgress, touchDay, logEvent } from "./core.js";
import { allowUse } from "./upgrade.js";

export const HANDWRITING_VIEWS = {};
const go = (...a) => A.go(...a);
const put = (el, ...kids) => el.replaceChildren(...kids.filter(k => k != null));
const SEC_ICON = { consonants: "chars", vowels: "spark", tones: "sound", numbers: "list", words: "pen" };
const POS_DEMO = { after: "◌າ", above: "◌ິ", below: "◌ຸ", before: "ເ◌", around: "ເ◌າ" };
// make sure the Lao font is ready before letters are drawn into canvases
const fontReady = () => (document.fonts && document.fonts.load ? document.fonts.load("48px 'Noto Sans Lao'").catch(() => null) : Promise.resolve());

// ---------- the letters, with what the database adds (stroke templates, names written by the teacher) ----------
export function handwritingCharacters(){
  return Object.values(A.byType.characters || {}).filter(c => c && c.char)
    .map(c => Object.assign({}, c, { tpl: readTemplate(c.handwriting) }))
    .sort((a, b) => (!!b.tpl - !!a.tpl) || ((a.order ?? 999) - (b.order ?? 999)) || String(a.char).localeCompare(String(b.char)));
}
export const platformHwRules = () => (A.settings && A.settings.handwriting) || {};
// The database may hold letters that are not in the standard list (a vowel sign on its own, a syllable with a tone
// mark, anything a teacher adds): they join the section they belong to, in a group of their own.
const INVENTORY = new Set(SECTIONS.flatMap(s => section(s).map(x => x.char)));
export function sectionFor(ch){
  if (/[໐-໙]/.test(ch)) return "numbers";
  if (/[່-໋]/.test(ch)) return "tones";
  if (/[ະ-ຽເ-ໄໍ]/.test(ch)) return "vowels";
  return "consonants";
}
function items(sec){
  const all = handwritingCharacters(), db = Object.fromEntries(all.map(c => [c.char, c]));
  const std = section(sec).map(it => { const d = db[it.char];
    return Object.assign({}, it, { id: d ? d.id : glyphId(it.char), tpl: d ? d.tpl : null, db: d || null }); });
  const extra = sec === "words" ? [] : all.filter(c => !INVENTORY.has(c.char) && sectionFor(c.char) === sec)
    .map(c => ({ char: c.char, name: c.name && c.name !== c.char ? c.name : "", meaning: c.meaning ? tr(c.meaning, lang()) : "", id: c.id, tpl: c.tpl, db: c, extra: true, kind: "extra" }));
  return std.concat(extra);
}
const progOf = it => handwritingProgress(it.id);
const secOf = ch => INVENTORY.has(ch) ? SECTIONS.find(s => section(s).some(x => x.char === ch)) : sectionFor(ch);

HANDWRITING_VIEWS.handwriting = ({ sec, ch, id } = {}) => {
  // older links: ?id=<database id>
  if (id && !ch){ const d = (A.byType.characters || {})[id]; if (d && d.char){ ch = d.char; sec = secOf(d.char); } }
  sec = SECTIONS.includes(sec) ? sec : "consonants";
  fontReady();
  return ch && sec !== "words" ? letterView(sec, ch) : hubView(sec);
};

// ---------- the hub: sections ----------
function hubView(sec){
  const root = h("div", { class: "hwh" });
  const stats = SECTIONS.filter(s => s !== "words").map(s => { const list = items(s); return [s, list.filter(it => (progOf(it) || {}).passed).length, list.length]; });
  const words = Object.keys(A.prog.handwriting || {}).filter(k => k.startsWith("w:")).length;
  const allPassed = stats.reduce((a, s) => a + s[1], 0), allCount = stats.reduce((a, s) => a + s[2], 0);
  const tabs = h("nav", { class: "hwh-tabs", "aria-label": t("hw_sections") }, SECTIONS.map(s => {
    const st = stats.find(x => x[0] === s);
    return h("button", { class: "hwh-tab", "aria-current": s === sec ? "page" : null, onclick: () => go("handwriting", { sec: s }, false) },
      h("span", { class: "hwh-tab-ic" }, icon(SEC_ICON[s])), h("span", { class: "hwh-tab-t" }, h("b", null, t("hw_sec_" + s)),
        h("small", { class: "tabnum" }, st ? st[1] + " / " + st[2] : t("hw_words_n", { n: words }))),
      st ? h("i", { class: "hwh-tab-bar", style: "--p:" + Math.round(100 * st[1] / Math.max(1, st[2])) }) : null);
  }));
  put(root,
    h("div", { class: "hwh-hero card" },
      h("div", null, h("span", { class: "eyebrow" }, t("hw_eyebrow")), h("h1", null, t("hw_title")), h("p", null, t("hw_hub_sub"))),
      h("div", { class: "hwh-ring", style: "--p:" + Math.round(100 * allPassed / Math.max(1, allCount)), role: "img", "aria-label": allPassed + " / " + allCount },
        h("b", { class: "tabnum" }, String(allPassed)), h("small", null, "/ " + allCount))),
    tabs,
    sec === "words" ? wordWriter() : sectionBody(sec));
  return root;
}
function tile(it, sec){
  const p = progOf(it) || {};
  const st = p.passed ? "passed" : p.attempts ? "tried" : "new";
  return h("button", { class: "hwh-tile", "data-state": st, "data-cls": it.cls || null, onclick: () => go("handwriting", { sec, ch: it.char }),
    "aria-label": it.char + " " + (it.name || it.sound || "") + (p.passed ? " ✓" : "") },
    h("span", { class: "hwh-glyph", lang: "lo" }, it.char),
    h("span", { class: "hwh-sub" }, it.kind === "vowel" ? it.sound : it.kind === "number" ? h("span", { lang: "lo" }, it.name) : it.kind === "tone" ? h("span", { lang: "lo" }, it.name) : it.name),
    it.word ? h("span", { class: "hwh-word", lang: "lo" }, it.word) : null,
    p.passed ? h("span", { class: "hwh-ok", "aria-hidden": "true" }, icon("check")) : p.best ? h("span", { class: "hwh-best tabnum" }, String(p.best)) : null,
    it.tpl ? h("span", { class: "hwh-tpl", title: t("hw_stroke_avail") }, icon("pen")) : null);
}
function group(title, desc, list, sec, extra = {}){
  return h("section", { class: "hwh-group card", "data-cls": extra.cls || null },
    h("header", { class: "hwh-group-h" }, extra.demo ? h("span", { class: "hwh-demo", lang: "lo", "aria-hidden": "true" }, extra.demo) : null,
      h("div", null, h("h2", null, title, h("span", { class: "chip" }, String(list.length))), desc ? h("p", { class: "small muted" }, desc) : null)),
    h("div", { class: "hwh-grid" }, list.map(it => tile(it, sec))));
}
function sectionBody(sec){
  const list = items(sec), more = list.filter(it => it.extra);
  const extraGroup = more.length ? group(t("hw_more_teacher"), t("hw_more_teacher_d"), more, sec) : null;
  const body = sectionBodyStd(sec, list.filter(it => !it.extra));
  if (extraGroup) body.append(extraGroup);
  return body;
}
function sectionBodyStd(sec, list){
  if (sec === "consonants") return h("div", { class: "hwh-body" },
    ...CLASSES.map(c => group(t("hw_cls_" + c), t("hw_cls_" + c + "_d"), list.filter(it => it.cls === c && !it.combo), sec, { cls: c })),
    group(t("hw_cls_combo"), t("hw_cls_combo_d"), list.filter(it => it.combo), sec, { cls: "high" }));
  if (sec === "vowels") return h("div", { class: "hwh-body" },
    h("p", { class: "hwh-note small" }, icon("info"), t("hw_vowel_holder")),
    ...VOWEL_POSITIONS.map(p => group(t("hw_pos_" + p), t("hw_pos_" + p + "_d"), list.filter(it => it.pos === p), sec, { demo: POS_DEMO[p] })));
  if (sec === "tones") return h("div", { class: "hwh-body" },
    group(t("hw_tones_t"), t("hw_tones_d"), list.filter(it => it.mark), sec, { demo: "◌່" }),
    group(t("hw_signs_t"), "", list.filter(it => !it.mark), sec));
  return h("div", { class: "hwh-body" }, group(t("hw_numbers_t"), t("hw_numbers_d"), list, sec));
}

// ---------- one letter ----------
function letterView(sec, ch){
  const list = items(sec), i = Math.max(0, list.findIndex(x => x.char === ch)), it = list[i] || list[0];
  const prev = list[(i - 1 + list.length) % list.length], next = list[(i + 1) % list.length];
  const goTo = x => go("handwriting", { sec, ch: x.char }, false);
  const say = () => speak(it.word && it.kind === "consonant" ? it.char + " " + it.word : it.char);
  const p = progOf(it) || {};
  let mode = it.tpl ? "stroke" : "shape";
  const body = h("div");
  const modeSeg = it.tpl ? h("div", { class: "seg hwl-mode", role: "group" }, [["stroke", t("hw_mode_stroke")], ["shape", t("hw_mode_free")]].map(([k, l]) =>
    h("button", { "aria-pressed": String(k === mode), onclick: e => { mode = k; [...e.currentTarget.parentNode.children].forEach(b => b.setAttribute("aria-pressed", String(b === e.currentTarget))); draw(); } }, l))) : null;
  const draw = () => put(body, mode === "stroke" ? strokeActivity(it, { onNext: () => goTo(next) }) : shapeActivity(it, { onNext: () => goTo(next) }));
  draw();
  return h("div", { class: "hwl" },
    h("div", { class: "crumb" }, h("button", { onclick: () => go("handwriting", { sec }) }, t("hw_title")), "›", h("button", { onclick: () => go("handwriting", { sec }) }, t("hw_sec_" + sec)), "›", h("span", { lang: "lo" }, it.char)),
    h("section", { class: "hwl-head card", "data-cls": it.cls || null },
      h("button", { class: "hwl-nav", "aria-label": t("hw_prev_letter"), onclick: () => goTo(prev) }, icon("left")),
      h("div", { class: "hwl-big", lang: "lo" }, it.char),
      h("div", { class: "hwl-info" },
        h("div", { class: "row" }, h("b", { class: "hwl-name" }, it.name || it.sound || ""), it.cls ? h("span", { class: "chip hwl-cls" }, t("hw_cls_" + it.cls)) : null,
          it.pos ? h("span", { class: "chip" }, t("hw_pos_" + it.pos)) : null, it.length ? h("span", { class: "chip" }, t("hw_vlen_" + it.length)) : null),
        it.word ? h("div", { class: "hwl-word" }, h("span", { lang: "lo" }, it.word), " · ", it.meaning) : it.meaning ? h("div", { class: "hwl-word" }, it.meaning) : null,
        it.kind === "consonant" ? h("div", { class: "small muted" }, t("hw_initial_sound") + ": " + it.initial + (it.final ? " · " + t("hw_final_sound") + ": " + it.final : "")) : null,
        it.kind === "vowel" ? h("div", { class: "small muted" }, t("hw_sound") + ": " + it.sound) : null,
        h("div", { class: "row" }, h("button", { class: "btn sm", onclick: say }, icon("speaker"), t("play")),
          p.best ? h("span", { class: "chip " + (p.passed ? "lv" : "") }, (p.passed ? "✓ " : "") + t("hw_best") + " " + p.best) : null, modeSeg)),
      h("button", { class: "hwl-nav", "aria-label": t("hw_next_letter"), onclick: () => goTo(next) }, icon("right"))),
    body);
}

// stroke-order practice (the letter has a teacher's template)
function strokeActivity(c, { onNext }){
  const tpl = c.tpl;
  const rules = mergeHwRules(platformHwRules(), tpl && tpl.rules);
  const fb = h("div", { class: "hw-fb", role: "status", "aria-live": "polite" });
  const steps = h("div", { class: "hw-steps", "aria-hidden": "true" });
  const result = h("div", { class: "stack" });
  const say = (kind, key, vars) => { fb.className = "hw-fb" + (kind ? " " + kind : ""); fb.textContent = t(key, vars); };
  let counted = false;
  const countUse = () => { if (!counted){ counted = true; allowUse("handwriting.practice", { ref: c.char }).then(ok => { if (!ok){ pad.enable(false); pad.setInk([]); } }); } };
  let onStroke = () => {};
  const pad = createPad({ guideChar: c.char, label: t("hw_canvas", { c: c.char }), onStart: countUse, onStroke: pts => onStroke(pts) });
  const n = tpl.strokes.length;
  let session = createSession(tpl, rules), demoPlays = 0, retries = 0, t0 = 0, finished = false, pendingInk = [];
  const demoBtn = h("button", { class: "btn primary", onclick: () => demo() }, icon("play"), t("hw_show_demo"));
  const undoBtn = h("button", { class: "btn", disabled: true, onclick: () => { if (rules.feedback === "final") pendingInk.pop(); session.undo(); redraw(); } }, icon("left"), t("hw_undo"));
  const clearBtn = h("button", { class: "btn", disabled: true, onclick: () => restart(false) }, icon("trash"), t("hw_clear"));
  const checkBtn = rules.feedback === "final" ? h("button", { class: "btn primary", disabled: true, onclick: () => finish() }, icon("check"), t("hw_check")) : null;
  const canReplay = () => rules.demo.plays === 0 || demoPlays < rules.demo.plays;
  function drawSteps(){
    const acc = session.accepted;
    put(steps, ...Array.from({ length: n }, (_, i) => { const a = acc.find(x => x.index === i);
      return h("span", { class: a ? (a.error ? "bad" : "ok") : i === session.next && !finished ? "cur" : "" }, String(i + 1)); }));
  }
  function redraw(){
    const acc = session.accepted;
    pad.setInk(rules.feedback === "final" ? pendingInk : acc.map(a => ({ points: a.points })));
    pad.setGuide({ level: rules.guide, template: tpl, current: Math.min(session.next, n - 1) });
    undoBtn.disabled = finished || !(rules.feedback === "final" ? pendingInk.length : acc.length);
    clearBtn.disabled = finished || undoBtn.disabled;
    if (checkBtn) checkBtn.disabled = finished || !pendingInk.length;
    drawSteps();
  }
  async function demo(){
    if (!canReplay()) return;
    demoPlays++; pad.enable(false); demoBtn.disabled = true; say("info", "hw_playing");
    await playDemo(pad, tpl, { speed: rules.demo.speed });
    demoBtn.disabled = !canReplay();
    demoBtn.lastChild.textContent = canReplay() ? t("hw_demo_again") : t("hw_demo_used");
    startDrawing();
  }
  function startDrawing(){ if (finished) return; pad.enable(true); if (!t0) t0 = Date.now(); redraw(); say("info", "hw_draw_now", { n: session.next + 1, c: n }); }
  onStroke = pts => {
    if (finished) return;
    if (rules.feedback === "final"){ pendingInk.push(pts); session.addStroke(pts); redraw(); say("info", "hw_fb_next", { n: pendingInk.length + 1 }); return; }
    const r = session.addStroke(pts), f = strokeFeedback(r);
    if (!r.accepted) pad.flash(pts, "error");
    redraw();
    if (f) say(f.kind, f.key, f.vars);
    if (r.done && r.accepted) setTimeout(finish, 450);
  };
  function finish(){
    if (finished) return;
    finished = true; pad.enable(false);
    const sc = scoreAttempt(session.finish(), rules, { retries });
    redraw();
    const award = recordHandwriting(c.id, sc, { retries, durationMs: Date.now() - t0, guide: rules.guide });
    say(sc.passed ? "ok" : "error", sc.passed ? "hw_passed" : "hw_failed", { p: rules.passScore }); sfx(sc.passed ? "complete" : "fail");
    put(result, h("section", { class: "card stack" },
      h("div", { class: "hw-score" }, h("b", null, String(sc.total)), h("span", { class: "muted" }, "/ 100"), sc.passed ? h("span", { class: "chip lv" }, icon("check"), t("hw_pass")) : null,
        award && award.xp ? h("span", { class: "chip" }, "+" + award.xp + " XP") : null),
      h("p", { class: "small" }, t(attemptTip(sc))),
      h("div", { class: "hw-comp" }, COMPONENTS.filter(k => sc.weights[k] > 0).flatMap(k => [
        h("span", null, t("hw_c_" + k)), h("div", { class: "bar" }, h("i", { style: `width:${Math.round(100 * sc.ratios[k])}%` })),
        h("span", { class: "tabnum small" }, sc.components[k] + " / " + sc.weights[k])])),
      h("div", { class: "hw-tools" }, h("button", { class: "btn primary", onclick: () => restart(true) }, icon("repeat"), t("hw_retry")),
        h("button", { class: "btn", onclick: onNext }, t("next"), icon("right")))));
  }
  function restart(isRetry){
    if (isRetry) retries++;
    session = createSession(tpl, rules); pendingInk = []; finished = false; result.replaceChildren();
    if (demoPlays === 0) return intro();
    startDrawing();
  }
  function intro(){ pad.enable(false); pad.setInk([]); pad.setGuide({ level: 1, template: null }); say("info", "hw_demo_first", { c: n }); drawSteps(); }
  intro();
  return h("div", { class: "hw-act" }, pad.el,
    h("div", { class: "hw-side" },
      h("div", { class: "row small muted" }, t("hw_strokes", { n }), " · ", t("hw_guide_" + rules.guide), tpl.sample ? h("span", { class: "chip warn", title: t("hw_sample_d") }, t("hw_sample")) : null),
      steps, fb, h("div", { class: "hw-tools" }, demoBtn, undoBtn, clearBtn, checkBtn), penPanel(), result));
}

// ---------- pen settings: js/shared/handwriting/pen-panel.js (also in Admin → Stroke editor) ----------
// word view: "focus" (one big cell at a time, the default on phones) or "strip" (the whole word side by side)
const VIEW_KEY = "laolao.hw.view";
const savedView = () => { try { return localStorage.getItem(VIEW_KEY) || ""; } catch(e){ return ""; } };
const saveView = v => { try { localStorage.setItem(VIEW_KEY, v); } catch(e){} };
// automatic choice: one cell at a time when the cells of the whole word would be narrower than 112 px
const autoView = n => n > 1 && ((typeof window !== "undefined" ? Math.min(window.innerWidth, document.documentElement.clientWidth || 9999) : 1200) - 48) / n < 112 ? "focus" : "strip";

// ---------- writing by shape: one letter (its cells) or a whole word ----------
// guide: trace (the letter faint in the cell) · copy (the model above, empty cells) · memory (the model hidden)
function writeBoard(target, { record, onNext, onNew, allowMemory = true, wordMode = false } = {}){
  const cells = writingCells(target), aspect = 1.3;
  let guide = "trace", current = 0, done = false, t0 = 0;
  const results = cells.map(() => null), baseDone = cells.map(c => !(c.base || c.kind === "mark") || c.steps.length < 2);
  const fb = h("div", { class: "hw-fb info", role: "status", "aria-live": "polite" }, t(wordMode ? "hw_word_start" : "hw_shape_start"));
  const msg = (kind, key, vars) => { fb.className = "hw-fb " + kind; fb.textContent = t(key, vars); };
  const model = h("div", { class: "hww-model", lang: "lo", "aria-hidden": "true" }, target);
  const result = h("div");
  let counted = false;
  let view = cells.length > 1 ? (savedView() || autoView(cells.length)) : "strip";
  const pad = createCellPad({ cells, aspect, view, label: t("hw_canvas", { c: target }), maxCell: wordMode ? 170 : 230, minCell: wordMode ? 84 : 110,
    onStart: () => { if (!t0) t0 = Date.now(); if (!counted){ counted = true; allowUse("handwriting.practice", { ref: target }).then(ok => { if (!ok){ pad.enable(false); } }); } },
    onStroke: (pts, { cell, cy }) => {
      if (done) return false;
      // left to right: the next cell starts once the current one has ink; further right is refused
      if (cell < current){ msg("error", "hw_refuse_back"); return false; }
      if (cell > current + 1 || (cell === current + 1 && !pad.cellInk(current).length)){ msg("error", "hw_refuse_ahead", { c: cells[current].text }); return false; }
      if (cell === current + 1){ check(current); current = cell; pad.setCurrent(current); }
      // in a cell: the consonant before the vowel or tone mark written on it
      const z = zoneOf(cy);
      if (!baseDone[cell] && z !== "middle"){ msg("error", "hw_refuse_base_first", { c: cells[cell].base || "ອ" }); return false; }
      if (z === "middle") baseDone[cell] = true;
      msg("info", cell === cells.length - 1 ? "hw_last_cell" : "hw_keep_going", { n: cell + 1, m: cells.length });
      touchDay();
      return true;
    } });
  pad.setGuide(guide);
  function check(i){
    const ink = pad.cellInk(i);
    const r = ink.length ? compareShape(glyphMask(cells[i].text, { aspect }), inkMask(ink)) : { score: 0, passed: false, tip: "empty" };
    results[i] = r; pad.setCellState(i, r.passed ? "ok" : "bad");
    return r;
  }
  // one-letter view: "Next letter" checks this cell and moves on (in the strip view, writing in the next cell does that)
  function nextCell(){
    if (done) return;
    if (!pad.cellInk(current).length){ msg("error", "hw_next_empty", { c: cells[current].text }); return; }
    if (current >= cells.length - 1) return finish();
    check(current); current++; pad.setCurrent(current); drawNext();
    msg("info", current === cells.length - 1 ? "hw_last_cell" : "hw_keep_going", { n: current + 1, m: cells.length });
  }
  const nextBtn = h("button", { class: "btn primary hww-next", onclick: () => nextCell() });
  function drawNext(){
    const last = current >= cells.length - 1;
    nextBtn.hidden = view !== "focus" || cells.length < 2 || done;
    put(nextBtn, ...(last ? [icon("check"), t("hw_check")] : [t("hw_next_letter"), h("span", { class: "lo", lang: "lo" }, " " + cells[current + 1].text), icon("right")]));
  }
  function finish(){
    if (done) return;
    if (!pad.cellInk(current).length && current === 0){ msg("error", "hw_shape_empty"); return; }
    for (let i = current; i < cells.length; i++) check(i);
    done = true; pad.enable(false); model.classList.add("shown"); drawNext();
    const total = Math.round(results.reduce((a, r) => a + r.score, 0) / cells.length), passed = results.every(r => r.passed);
    const worst = results.reduce((a, r, i) => (!a || r.score < a.r.score) ? { r, i } : a, null);
    const sc = { total, passed, errors: passed ? {} : { shape: results.filter(r => !r.passed).length }, components: { shape: total }, strokes: [] };
    const award = record ? record(sc, { durationMs: Date.now() - t0, guide }) : null;
    msg(passed ? "ok" : "error", passed ? (wordMode ? "hw_word_pass" : "hw_passed") : "hw_shape_fail", { p: PASS });
    put(result, h("section", { class: "card stack hww-result" },
      h("div", { class: "hw-score" }, h("b", null, String(total)), h("span", { class: "muted" }, "/ 100"), passed ? h("span", { class: "chip lv" }, icon("check"), t("hw_pass")) : null,
        award && award.xp ? h("span", { class: "chip" }, "+" + award.xp + " XP") : null),
      cells.length > 1 ? h("div", { class: "hww-cells" }, cells.map((c, i) => h("span", { class: "hww-cell " + (results[i].passed ? "ok" : "bad"), title: results[i].score + "/100" },
        h("b", { lang: "lo" }, c.text), h("small", { class: "tabnum" }, String(results[i].score))))) : null,
      worst && !worst.r.passed ? h("p", { class: "small" }, t("hw_shape_tip_" + worst.r.tip, { c: cells[worst.i].text })) : h("p", { class: "small" }, t(total >= 90 ? "hw_tip_great" : "hw_tip_good")),
      h("div", { class: "hw-tools" }, h("button", { class: "btn" + (passed ? "" : " primary"), onclick: reset }, icon("repeat"), t("hw_retry")),
        onNew ? h("button", { class: "btn" + (passed ? " primary" : ""), onclick: onNew }, icon("spark"), t("hw_new_word")) : null,
        onNext ? h("button", { class: "btn" + (passed ? " primary" : ""), onclick: onNext }, t("next"), icon("right")) : null)));
  }
  function reset(){ done = false; current = 0; results.fill(null); baseDone.forEach((_, i) => baseDone[i] = !(cells[i].base || cells[i].kind === "mark") || cells[i].steps.length < 2);
    pad.clear(); pad.enable(true); pad.setCurrent(0); result.replaceChildren(); drawNext(); model.classList.toggle("shown", guide !== "memory"); msg("info", wordMode ? "hw_word_start" : "hw_shape_start"); }
  const undo = () => { if (done) return; const i = pad.undo(); if (i >= 0 && i < current && !pad.cellInk(current).length){ current = i; pad.setCurrent(i); results[i] = null; pad.setCellState(i, ""); drawNext(); }
    if (i >= 0 && !pad.cellInk(i).some(s => zoneOf((Math.min(...s.map(p => p[1])) + Math.max(...s.map(p => p[1]))) / 2) === "middle")) baseDone[i] = !(cells[i].base || cells[i].kind === "mark") || cells[i].steps.length < 2; };
  const guideSeg = h("div", { class: "seg hww-guide", role: "group", "aria-label": t("hw_guide") }, ["trace", "copy", ...(allowMemory ? ["memory"] : [])].map(g =>
    h("button", { "aria-pressed": String(g === guide), title: t("hw_guide_" + g + "_d"), onclick: e => { guide = g; [...guideSeg.children].forEach(b => b.setAttribute("aria-pressed", String(b === e.currentTarget)));
      pad.setGuide(g === "trace" ? "trace" : "copy"); model.classList.toggle("shown", g !== "memory" || done); } }, t("hw_guide_" + g))));
  model.classList.add("shown");
  const viewSeg = cells.length > 1 ? h("div", { class: "seg hww-view", role: "group", "aria-label": t("hw_view") }, ["focus", "strip"].map(v =>
    h("button", { "aria-pressed": String(v === view), title: t("hw_view_" + v + "_d"), onclick: e => { view = v; saveView(v); [...viewSeg.children].forEach(b => b.setAttribute("aria-pressed", String(b === e.currentTarget)));
      pad.setView(v); drawNext(); } }, icon(v === "focus" ? "edit" : "list"), t("hw_view_" + v)))) : null;
  drawNext();
  // (the button is kept in a variable: after the await, the event no longer knows which element it came from)
  const orderBtn = h("button", { class: "btn", onclick: async () => { orderBtn.disabled = true; pad.enable(false); msg("info", "hw_watch_order");
    await pad.showOrder({ step: reducedMotion() ? 250 : 650 }); orderBtn.disabled = false; if (!done) pad.enable(true); msg("info", wordMode ? "hw_word_start" : "hw_shape_start"); } }, icon("play"), t("hw_show_order"));
  return h("div", { class: "hww" },
    h("div", { class: "hww-top" }, model, h("div", { class: "row hww-switches" }, viewSeg, guideSeg)),
    h("div", { class: "hww-pad" }, pad.el),
    fb,
    h("div", { class: "hww-nextrow" }, nextBtn),
    h("div", { class: "hw-tools" }, orderBtn, h("button", { class: "btn", onclick: undo }, icon("left"), t("hw_undo")),
      h("button", { class: "btn", onclick: reset }, icon("trash"), t("hw_clear")), h("button", { class: "btn" + (view === "focus" && cells.length > 1 ? "" : " primary") + " hww-check", onclick: finish }, icon("check"), t("hw_check"))),
    penPanel(),
    result);
}
function shapeActivity(it, { onNext }){
  return writeBoard(it.char, { onNext, record: (sc, meta) => recordHandwriting(it.id, sc, meta) });
}

// ---------- words ----------
const LENGTHS = { short: [2, 3], medium: [4, 5], long: [6, 9] };
let lastWords = [];
function wordWriter(){
  let len = "short", word = null;
  const box = h("div", { class: "hww-word-area" });
  const lenSeg = h("div", { class: "seg", role: "group", "aria-label": t("hw_word_len") }, Object.keys(LENGTHS).map(k =>
    h("button", { "aria-pressed": String(k === len), onclick: e => { len = k; [...lenSeg.children].forEach(b => b.setAttribute("aria-pressed", String(b === e.currentTarget))); pick(); } }, t("hw_len_" + k))));
  function pick(){
    const [min, max] = LENGTHS[len];
    const list = writingWords(dict(), { min, max });
    const x = randomWord(list, { avoid: lastWords });
    if (!x){ put(box, h("div", { class: "empty" }, t("no_rows"))); return; }
    word = x; lastWords = [x.w, ...lastWords].slice(0, 8);
    const d = x.d || {}, EL = lang(), meaning = (EL === "lo" && d.lo && d.lo !== x.w ? d.lo : EL === "zh" && d.zh ? d.zh : d.en) || "";
    const rules = writingRules(x.w);
    put(box,
      h("section", { class: "card hww-card" },
        h("div", { class: "hww-card-top" },
          h("div", null, h("div", { class: "hww-meaning" }, meaning.split(";")[0]), d.p ? h("div", { class: "muted" }, d.p) : null),
          h("div", { class: "row" }, h("button", { class: "btn sm", onclick: () => speak(x.w) }, icon("speaker"), t("play")),
            h("button", { class: "btn sm primary", onclick: pick }, icon("spark"), t("hw_new_word")))),
        h("ul", { class: "hww-rules" }, rules.map(r => h("li", null, icon(r === "ltr" ? "right" : r === "before" ? "left" : r === "marks" ? "layers" : "sound"), t("hw_rule_" + r))))),
      writeBoard(x.w, { wordMode: true, onNew: pick, record: (sc, meta) => { logEvent("word_writing", { ref: x.w, score: sc.total }); return recordHandwriting("w:" + x.w, sc, meta); } }));
  }
  const wrap = h("div", { class: "hwh-body" },
    h("section", { class: "hwh-group card" }, h("header", { class: "hwh-group-h" }, h("span", { class: "hwh-demo", lang: "lo", "aria-hidden": "true" }, "ກ→ຂ"),
      h("div", null, h("h2", null, t("hw_words_t")), h("p", { class: "small muted" }, t("hw_words_d")))), h("div", { class: "row" }, h("span", { class: "small muted" }, t("hw_word_len")), lenSeg)),
    box);
  pick();
  return wrap;
}
