// Learner handwriting activity: watch the stroke order, draw it, get feedback per stroke, a score, and progress.
// Characters come from the published content (characters/{id}.handwriting holds the stroke template).
// Characters without a template can still be practised freely, clearly marked as not scored.
import { h, icon, tr } from "../shared/ui.js";
import { t, lang } from "../shared/i18n.js";
import { speak } from "../shared/speech.js";
import { createPad } from "../shared/handwriting/pad.js";
import { playDemo } from "../shared/handwriting/animator.js";
import { readTemplate, mergeHwRules } from "../shared/handwriting/model.js";
import { createSession } from "../shared/handwriting/recognizer.js";
import { scoreAttempt, strokeFeedback, attemptTip, COMPONENTS } from "../shared/handwriting/scorer.js";
import { A, recordHandwriting, handwritingProgress, touchDay } from "./core.js";
import { allowUse } from "./upgrade.js";

export const HANDWRITING_VIEWS = {};
const go = (...a) => A.go(...a);

// Names, meanings and sounds of the consonants (shown when the database row has none)
const LETTER_INFO = {
  "ກ":["kɔ̀ɔ kái","chicken","[k]"], "ຂ":["khɔ̌ɔ khǎi","egg","[kh]"], "ຄ":["khɔ́ɔ khwáai","water buffalo","[kh]"], "ງ":["ngɔ́ɔ ngúu","snake","[ŋ]"],
  "ຈ":["jɔ̀ɔ jɔ́ɔk","cup","[tɕ]"], "ສ":["sɔ̌ɔ sɯ̌a","tiger","[s]"], "ຊ":["sɔ́ɔ xâang","elephant","[s]"], "ຍ":["ɲɔ́ɔ ɲúng","mosquito","[ɲ]"],
  "ດ":["dɔ̀ɔ dék","child","[d]"], "ຕ":["tɔ̀ɔ taa","eye","[t]"], "ຖ":["thɔ̌ɔ thǒng","bag","[th]"], "ທ":["thɔ́ɔ thúng","flag","[th]"],
  "ນ":["nɔ́ɔ nók","bird","[n]"], "ບ":["bɔ̀ɔ bɛ́ɛ","goat","[b]"], "ປ":["pɔ̀ɔ paa","fish","[p]"], "ຜ":["phɔ̌ɔ phɯ̂ng","bee","[ph]"],
  "ຝ":["fɔ̌ɔ fǒn","rain","[f]"], "ພ":["phɔ́ɔ phúu","mountain","[ph]"], "ຟ":["fɔ́ɔ fái","fire","[f]"], "ມ":["mɔ́ɔ máa","horse","[m]"],
  "ຢ":["jɔ̀ɔ jaa","medicine","[j]"], "ຣ":["rɔ́ɔ rót","car","[r]"], "ລ":["lɔ́ɔ líng","monkey","[l]"], "ວ":["wɔ́ɔ wīi","hand fan","[w]"],
  "ຫ":["hɔ̌ɔ hǎan","goose","[h]"], "ອ":["ɔ̀ɔ oo","bowl","[ʔ]"], "ຮ":["hɔ́ɔ hɯ́an","house","[h]"]
};
const info = c => { const i = LETTER_INFO[c.char] || []; return { name: c.name && c.name !== c.char ? c.name : i[0] || "", meaning: (c.meaning && tr(c.meaning, lang())) || i[1] || "", sound: c.ipa || i[2] || "" }; };

export function handwritingCharacters(){
  return Object.values(A.byType.characters || {}).filter(c => c && c.char)
    .map(c => Object.assign({}, c, { tpl: readTemplate(c.handwriting) }))
    .sort((a, b) => (!!b.tpl - !!a.tpl) || ((a.order ?? 999) - (b.order ?? 999)) || String(a.char).localeCompare(String(b.char)));
}
export const platformHwRules = () => (A.settings && A.settings.handwriting) || {};

HANDWRITING_VIEWS.handwriting = ({ id } = {}) => {
  const all = handwritingCharacters();
  const root = h("div", { class: "stack-l" });
  root.append(h("div", { class: "pagehead" }, h("h1", null, t("hw_title")), h("p", null, t("hw_sub"))));
  if (!all.length){ root.append(h("div", { class: "empty" }, t("no_rows"))); return root; }
  const cur = all.find(c => c.id === id) || all[0];
  root.append(h("nav", { class: "hw-pick", "aria-label": t("hw_pick") }, all.map(c => {
    const p = handwritingProgress(c.id);
    return h("button", { class: c.tpl ? "" : "free", "aria-pressed": String(c.id === cur.id), title: c.tpl ? (p ? t("hw_best") + ": " + p.best : "") : t("hw_free"),
      "aria-label": c.char + (c.tpl ? "" : " · " + t("hw_free")), onclick: () => go("handwriting", { id: c.id }, false) },
      c.char, p && p.passed ? h("span", { class: "tick", "aria-hidden": "true" }, "✓") : null);
  })));
  root.append(activity(cur, all));
  return root;
};

// ---------- one character ----------
function activity(c, all){
  const tpl = c.tpl, I = info(c);
  const rules = mergeHwRules(platformHwRules(), tpl && tpl.rules);
  const fb = h("div", { class: "hw-fb", role: "status", "aria-live": "polite" });
  const steps = h("div", { class: "hw-steps", "aria-hidden": "true" });
  const result = h("div", { class: "stack" });
  const say = (kind, key, vars) => { fb.className = "hw-fb" + (kind ? " " + kind : ""); fb.textContent = t(key, vars); };
  const nextChar = () => { const i = all.findIndex(x => x.id === c.id); const n = all[(i + 1) % all.length]; go("handwriting", { id: n.id }, false); };
  let counted = false;
  const countUse = () => { if (!counted){ counted = true; allowUse("handwriting.practice", { ref: c.char }).then(ok => { if (!ok){ pad.enable(false); pad.setInk([]); } }); } };

  let onStroke = () => {};
  const pad = createPad({ guideChar: c.char, label: t("hw_canvas", { c: c.char }), onStart: countUse, onStroke: pts => onStroke(pts) });
  const head = h("div", { class: "hw-letter" }, h("span", { class: "big", lang: "lo" }, c.char),
    h("div", null, h("b", null, I.name), h("div", { class: "small muted" }, [I.meaning, I.sound].filter(Boolean).join(" · "))),
    h("button", { class: "ib", "aria-label": t("play"), title: t("play"), onclick: () => speak(c.char) }, icon("speaker")));

  // ----- free practice (no template yet) -----
  if (!tpl){
    let ink = [];
    onStroke = pts => { ink.push(pts); pad.setInk(ink); touchDay(); };
    pad.setGuide({ level: 1, template: null });
    say("info", "hw_free_d");
    return h("div", { class: "hw-act" }, pad.el, h("div", { class: "hw-side" }, head, h("span", { class: "chip warn" }, t("hw_free")), fb,
      h("div", { class: "hw-tools" }, h("button", { class: "btn", onclick: () => { ink = []; pad.setInk([]); } }, icon("trash"), t("hw_clear")),
        h("button", { class: "btn ghost", onclick: nextChar }, t("next"), icon("right")))));
  }

  // ----- checked practice -----
  const n = tpl.strokes.length;
  let session = createSession(tpl, rules), demoPlays = 0, retries = 0, t0 = 0, finished = false, pendingInk = [];
  const demoBtn = h("button", { class: "btn primary", onclick: () => demo() }, icon("play"), t("hw_show_demo"));
  const undoBtn = h("button", { class: "btn", disabled: true, onclick: () => { if (rules.feedback === "final") pendingInk.pop(); session.undo(); redraw(); } }, icon("left"), t("hw_undo"));
  const clearBtn = h("button", { class: "btn", disabled: true, onclick: () => restart(false) }, icon("trash"), t("hw_clear"));
  const checkBtn = rules.feedback === "final" ? h("button", { class: "btn primary", disabled: true, onclick: () => finish() }, icon("check"), t("hw_check")) : null;
  const canReplay = () => rules.demo.plays === 0 || demoPlays < rules.demo.plays;

  function drawSteps(){
    steps.innerHTML = "";
    const acc = session.accepted;
    for (let i = 0; i < n; i++){
      const a = acc.find(x => x.index === i);
      steps.append(h("span", { class: a ? (a.error ? "bad" : "ok") : i === session.next && !finished ? "cur" : "" }, String(i + 1)));
    }
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
    demoPlays++;
    pad.enable(false); demoBtn.disabled = true; say("info", "hw_playing");
    await playDemo(pad, tpl, { speed: rules.demo.speed });
    demoBtn.disabled = !canReplay();
    demoBtn.lastChild.textContent = canReplay() ? t("hw_demo_again") : t("hw_demo_used");
    startDrawing();
  }
  function startDrawing(){
    if (finished) return;
    pad.enable(true); if (!t0) t0 = Date.now();
    redraw();
    say("info", "hw_draw_now", { n: session.next + 1, c: n });
  }
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
    say(sc.passed ? "ok" : "error", sc.passed ? "hw_passed" : "hw_failed", { p: rules.passScore });
    result.innerHTML = "";
    result.append(h("section", { class: "card stack" },
      h("div", { class: "hw-score" }, h("b", null, String(sc.total)), h("span", { class: "muted" }, "/ 100"), sc.passed ? h("span", { class: "chip lv" }, icon("check"), t("hw_pass")) : null,
        award && award.xp ? h("span", { class: "chip" }, "+" + award.xp + " XP") : null),
      h("p", { class: "small" }, t(attemptTip(sc))),
      h("div", { class: "hw-comp" }, COMPONENTS.filter(k => sc.weights[k] > 0).flatMap(k => [
        h("span", null, t("hw_c_" + k)), h("div", { class: "bar" }, h("i", { style: `width:${Math.round(100 * sc.ratios[k])}%` })),
        h("span", { class: "tabnum small" }, sc.components[k] + " / " + sc.weights[k])])),
      h("div", { class: "hw-tools" },
        h("button", { class: "btn primary", onclick: () => restart(true) }, icon("repeat"), t("hw_retry")),
        h("button", { class: "btn", onclick: nextChar }, t("next"), icon("right")))));
  }
  function restart(isRetry){
    if (isRetry) retries++;
    session = createSession(tpl, rules); pendingInk = []; finished = false; result.innerHTML = "";
    if (demoPlays === 0) return intro();
    startDrawing();
  }
  function intro(){
    pad.enable(false); pad.setInk([]);
    pad.setGuide({ level: 1, template: null });   // only the faint letter until the demonstration has been watched
    say("info", "hw_demo_first", { c: n });
    drawSteps();
  }
  intro();
  return h("div", { class: "hw-act" }, pad.el,
    h("div", { class: "hw-side" }, head,
      h("div", { class: "row small muted" }, t("hw_strokes", { n }), " · ", t("hw_guide_" + rules.guide), tpl.sample ? h("span", { class: "chip warn", title: t("hw_sample_d") }, t("hw_sample")) : null),
      steps, fb,
      h("div", { class: "hw-tools" }, demoBtn, undoBtn, clearBtn, checkBtn),
      result));
}
