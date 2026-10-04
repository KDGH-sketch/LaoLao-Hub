// Admin → Lao Script & Handwriting: the characters, their official stroke templates (Stroke Editor), scoring rules,
// demonstration animation and a Preview/Test that runs exactly the learner's checking. Saved into characters/{id}
// with the normal content pipeline (versions, draft/published, Publish button). Who may edit = "characters" edit rights.
import { h, icon, toast, dialog, confirmDialog, errText, fmtDate } from "../shared/ui.js";
import { lang } from "../shared/i18n.js";
import { saveContent } from "../shared/content.js";
import { createPad } from "../shared/handwriting/pad.js";
import { playDemo, checkAnimationFile, ANIM_MAX_BYTES } from "../shared/handwriting/animator.js";
import { makeStroke, readTemplate, validateTemplate, mergeHwRules, DEFAULT_HW_RULES, GUIDE_LEVELS, FORMAT_VERSION } from "../shared/handwriting/model.js";
import { createSession } from "../shared/handwriting/recognizer.js";
import { scoreAttempt, strokeFeedback, COMPONENTS } from "../shared/handwriting/scorer.js";
import { S, L, t, go, canEditMenu, isSuper, fld, markUnpublished } from "./state.js";

const canEdit = () => canEditMenu("characters");
const status = c => { const tp = readTemplate(c.handwriting); return !tp ? "none" : tp.sample ? "sample" : "ready"; };
const STATUS_LABEL = { none: ["No template", "ບໍ່ມີແມ່ແບບ"], sample: ["Sample (not official)", "ຕົວຢ່າງ (ບໍ່ທາງການ)"], ready: ["Template ready", "ມີແມ່ແບບແລ້ວ"] };
const COMP_LABEL = { order: ["Stroke order", "ລຳດັບເສັ້ນ"], direction: ["Direction", "ທິດທາງ"], path: ["Shape", "ຮູບຮ່າງ"], start: ["Start points", "ຈຸດເລີ່ມ"], end: ["End points", "ຈຸດຈົບ"], count: ["Stroke count", "ຈຳນວນເສັ້ນ"] };
const FB = { hw_fb_ok: "Stroke %n correct", hw_fb_done: "All strokes correct", hw_fb_order: "Wrong order: that was stroke %m, expected %n", hw_fb_direction: "Stroke %n: wrong direction",
  hw_fb_path: "Stroke %n: too far from the template", hw_fb_incomplete: "Stroke %n: incomplete", hw_fb_start: "Stroke %n: starts in the wrong place", hw_fb_end: "Stroke %n: ends in the wrong place", hw_fb_extra: "Extra stroke", hw_fb_next: "Next: stroke %n" };
const fbText = f => (FB[f.key] || f.key).replace("%n", f.vars.n).replace("%m", f.vars.m);

// ---------- list ----------
export async function viewHandwriting(){
  const rows = (await S.api.db.list("characters")).sort((a, b) => ((a.order ?? 999) - (b.order ?? 999)) || String(a.char).localeCompare(String(b.char)));
  const body = h("tbody");
  rows.forEach(c => { const st = status(c), tp = readTemplate(c.handwriting);
    body.append(h("tr", { onclick: () => go("handwritingEditor", { id: c.id }) },
      h("td", null, h("span", { class: "hz", lang: "lo", style: "font-size:1.6rem" }, c.char || "?")),
      h("td", null, h("b", null, c.name || "—"), h("div", { class: "small muted mono" }, c.id)),
      h("td", null, h("span", { class: "pill " + (st === "ready" ? "ok" : st === "sample" ? "suspended" : "") }, L(STATUS_LABEL[st]))),
      h("td", { class: "tabnum" }, tp ? String(tp.strokes.length) : "—"),
      h("td", null, h("span", { class: "pill " + (c.status === "published" ? "ok" : "") }, t("status_" + (c.status || "draft")))),
      h("td", { class: "small muted" }, fmtDate(c.updatedAt, lang())))); });
  if (!rows.length) body.append(h("tr", null, h("td", { colspan: "6", class: "muted" }, t("no_rows"))));
  return h("div", { class: "stack-l" },
    h("div", { class: "pagehead" }, h("div", { class: "spread" }, h("h1", null, L(["Lao Script & Handwriting", "ອັກສອນ ແລະ ການຂຽນ"])),
      canEdit() ? h("button", { class: "btn primary", onclick: newCharacter }, icon("plus"), t("new_item")) : null),
      h("p", null, L(["Draw the official stroke order of each character, set how strictly it is checked, test it, then publish. Learners only see published characters.",
        "ແຕ້ມລຳດັບການຂຽນທາງການຂອງແຕ່ລະຕົວອັກສອນ, ຕັ້ງຄ່າການກວດ, ທົດສອບ ແລ້ວເຜີຍແຜ່. ຜູ້ຮຽນເຫັນສະເພາະຕົວທີ່ເຜີຍແຜ່ແລ້ວ."]))),
    h("div", { class: "tbl-wrap" }, h("table", { class: "tbl" },
      h("thead", null, h("tr", null, [L(["Letter", "ຕົວອັກສອນ"]), t("name"), L(["Stroke template", "ແມ່ແບບເສັ້ນ"]), L(["Strokes", "ເສັ້ນ"]), t("status"), L(["Updated", "ອັບເດດ"])].map(x => h("th", null, x)))), body)));
}

async function newCharacter(){
  const ch = h("input", { class: "input hz", lang: "lo", placeholder: "ກ" }), nm = h("input", { class: "input", placeholder: "ko kai" });
  const r = await dialog({ title: t("new_item"), body: h("div", { class: "stack" }, fld(L(["Lao letter or combination", "ຕົວອັກສອນ ຫຼື ການປະສົມ"]), ch), fld(t("name"), nm)),
    actions: [{ label: t("cancel"), value: false }, { label: t("create"), primary: true, onClick: async () => {
      const c = ch.value.trim(); if (!c) return false;
      const id = "char-" + c;
      if (await S.api.db.get(`characters/${id}`)){ toast(L(["That character already exists.", "ມີຕົວອັກສອນນີ້ແລ້ວ."]), "err"); return false; }
      await saveContent(S.api, "characters", id, { char: c, name: nm.value.trim(), meaning: "", ipa: "", class: "middle", strokeCount: 0, status: "draft", access: "free" }, S.me.uid);
      markUnpublished(); return id; } }] });
  if (r) go("handwritingEditor", { id: r });
}

// ---------- editor ----------
export async function viewHandwritingEditor({ id }){
  const row = await S.api.db.get(`characters/${id}`);
  if (!row) return h("div", { class: "empty" }, t("no_rows"));
  const editable = canEdit();
  const saved = readTemplate(row.handwriting);
  // working copy
  let strokes = saved ? saved.strokes.map(s => Object.assign({}, s)) : [];
  let rules = JSON.parse(JSON.stringify((saved && saved.rules) || {}));
  let animation = Object.assign({ kind: "generated" }, saved && saved.animation);
  let sel = strokes.length ? 0 : -1, mode = "add", dirty = false;
  const undoStack = [], redoStack = [];
  const snap = () => JSON.stringify({ strokes, sel });
  const remember = () => { undoStack.push(snap()); if (undoStack.length > 60) undoStack.shift(); redoStack.length = 0; dirty = true; };
  const restore = (s) => { const o = JSON.parse(s); strokes = o.strokes; sel = o.sel; dirty = true; refresh(); };
  const tpl = () => ({ v: FORMAT_VERSION, box: { aspect: 1 }, strokes, rules, animation });
  const platform = (S.settings && S.settings.handwriting) || {};

  // --- drawing pad: every stroke drawn here becomes a template stroke ---
  const pad = createPad({ guideChar: row.char, label: L(["Stroke editor", "ບ່ອນແຕ້ມເສັ້ນ"]), onStroke: pts => {
    if (!editable) return;
    const s = makeStroke(pts, { id: mode === "redraw" && strokes[sel] ? strokes[sel].id : "s" + Date.now().toString(36).slice(-5) });
    if (!s || s.len < 0.03){ toast(L(["Too short: draw the whole stroke.", "ສັ້ນເກີນ: ແຕ້ມທັງເສັ້ນ."]), "err"); pad.setInk([]); return; }
    remember();
    if (mode === "redraw" && strokes[sel]){ s.note = strokes[sel].note; strokes[sel] = s; mode = "add"; }
    else { strokes.push(s); sel = strokes.length - 1; }
    pad.setInk([]); refresh();
  } });
  pad.enable(editable);

  const list = h("ol", { class: "hwe-list" });
  const info = h("p", { class: "small muted" });
  const modeChip = h("span", { class: "chip" });
  const btn = (ic, label, fn, cls = "btn sm") => h("button", { class: cls, type: "button", onclick: fn }, icon(ic), label);
  const undoB = btn("left", L(["Undo", "ຍ້ອນກັບ"]), () => { if (undoStack.length){ redoStack.push(snap()); restore(undoStack.pop()); } });
  const redoB = btn("right", L(["Redo", "ເຮັດຊ້ຳ"]), () => { if (redoStack.length){ undoStack.push(snap()); restore(redoStack.pop()); } });

  function refresh(){
    pad.setGuide({ template: strokes.length ? { strokes } : null, show: "all", current: sel, level: 1 });
    modeChip.textContent = mode === "redraw" ? L(["Redraw stroke ", "ແຕ້ມເສັ້ນໃໝ່ "]) + (sel + 1) : L(["Draw to add stroke ", "ແຕ້ມເພື່ອເພີ່ມເສັ້ນ "]) + (strokes.length + 1);
    modeChip.className = "chip" + (mode === "redraw" ? " warn" : "");
    undoB.disabled = !editable || !undoStack.length; redoB.disabled = !editable || !redoStack.length;
    list.innerHTML = "";
    strokes.forEach((s, i) => {
      const note = h("input", { class: "input sm", placeholder: L(["Teaching hint (optional)", "ຄຳແນະນຳ (ບໍ່ບັງຄັບ)"]), value: (s.note && s.note.en) || "", disabled: !editable,
        onchange: e => { remember(); s.note = e.target.value.trim() ? { en: e.target.value.trim() } : undefined; } });
      list.append(h("li", { class: "hwe-item" + (i === sel ? " sel" : "") },
        h("button", { class: "hwe-num", type: "button", "aria-label": L(["Select stroke ", "ເລືອກເສັ້ນ "]) + (i + 1), onclick: () => { sel = i; mode = "add"; refresh(); } }, String(i + 1)),
        h("div", { class: "hwe-meta" }, h("span", { class: "small" }, L(["Length ", "ຄວາມຍາວ "]) + s.len.toFixed(2) + " · " + s.points.length + L([" points", " ຈຸດ"])), note),
        editable ? h("div", { class: "row", style: "gap:4px" },
          h("button", { class: "ib", type: "button", title: L(["Move up", "ຍ້າຍຂຶ້ນ"]), "aria-label": L(["Move up", "ຍ້າຍຂຶ້ນ"]), disabled: i === 0, onclick: () => { remember(); [strokes[i - 1], strokes[i]] = [strokes[i], strokes[i - 1]]; sel = i - 1; refresh(); } }, icon("up")),
          h("button", { class: "ib", type: "button", title: L(["Move down", "ຍ້າຍລົງ"]), "aria-label": L(["Move down", "ຍ້າຍລົງ"]), disabled: i === strokes.length - 1, onclick: () => { remember(); [strokes[i + 1], strokes[i]] = [strokes[i], strokes[i + 1]]; sel = i + 1; refresh(); } }, icon("down")),
          h("button", { class: "ib", type: "button", title: L(["Redraw this stroke", "ແຕ້ມເສັ້ນນີ້ໃໝ່"]), "aria-label": L(["Redraw this stroke", "ແຕ້ມເສັ້ນນີ້ໃໝ່"]), onclick: () => { sel = i; mode = "redraw"; refresh(); } }, icon("edit")),
          h("button", { class: "ib", type: "button", title: t("delete_item"), "aria-label": t("delete_item"), onclick: () => { remember(); strokes.splice(i, 1); sel = Math.min(sel, strokes.length - 1); refresh(); } }, icon("trash"))) : null));
    });
    if (!strokes.length) list.append(h("li", { class: "muted small" }, L(["No strokes yet. Draw the first stroke on the canvas, starting where the letter starts.", "ຍັງບໍ່ມີເສັ້ນ. ແຕ້ມເສັ້ນທຳອິດ ເລີ່ມຈາກບ່ອນທີ່ຕົວອັກສອນເລີ່ມ."])));
    const v = validateTemplate(tpl());
    info.textContent = strokes.length ? (v.ok ? L(["Template is valid.", "ແມ່ແບບຖືກຕ້ອງ."]) : L(["Fix before saving: ", "ແກ້ໄຂກ່ອນບັນທຶກ: "]) + v.errors.join(", ")) : "";
  }

  // --- rules ---
  const effective = () => mergeHwRules(platform, rules);
  const num = (val, set, attrs = {}) => h("input", Object.assign({ class: "input", type: "number", step: "any", value: val, disabled: !editable, oninput: e => { set(e.target.value); dirty = true; } }, attrs));
  function rulesPanel(){
    const R = effective(), wrap = h("div", { class: "stack" });
    const W = h("div", { class: "field-row" }, COMPONENTS.map(k => fld(L(COMP_LABEL[k]), num(R.weights[k], v => { rules.weights = Object.assign({}, rules.weights, { [k]: +v }); }, { min: "0" }))));
    const tolRow = (k, label) => h("div", { class: "field-row" }, fld(label + L([" · full credit within", " · ໄດ້ເຕັມພາຍໃນ"]), num(R.tolerance[k][0], v => setTol(k, 0, v), { min: "0", max: "1" })),
      fld(L(["error from", "ຜິດຕັ້ງແຕ່"]), num(R.tolerance[k][1], v => setTol(k, 1, v), { min: "0", max: "1" })));
    const setTol = (k, i, v) => { const cur = (rules.tolerance && rules.tolerance[k]) || R.tolerance[k].slice(); cur[i] = +v; rules.tolerance = Object.assign({}, rules.tolerance, { [k]: cur }); };
    const sel = (opts, val, set) => h("select", { class: "input", disabled: !editable, onchange: e => { set(e.target.value); dirty = true; } }, opts.map(([v, l]) => h("option", { value: v, selected: String(val) === String(v) }, l)));
    wrap.append(
      h("p", { class: "small muted" }, L(["Empty or unchanged values use the platform defaults. Distances are fractions of the drawing box (0.1 = 10% of its width).", "ຄ່າທີ່ບໍ່ປ່ຽນໃຊ້ຄ່າເລີ່ມຕົ້ນ. ໄລຍະແມ່ນສັດສ່ວນຂອງກອບ (0.1 = 10%)."])),
      h("h4", null, L(["Score weights (scaled to 100)", "ນ້ຳໜັກຄະແນນ (ປັບເປັນ 100)"])), W,
      h("h4", null, L(["Tolerance", "ຄວາມຍືດຫຍຸ່ນ"])), tolRow("start", L(["Start point", "ຈຸດເລີ່ມ"])), tolRow("end", L(["End point", "ຈຸດຈົບ"])), tolRow("path", L(["Shape (average distance)", "ຮູບຮ່າງ (ໄລຍະສະເລ່ຍ)"])),
      h("div", { class: "field-row" },
        fld(L(["Largest allowed deviation", "ຄວາມຫ່າງສູງສຸດ"]), num(R.tolerance.maxDev, v => { rules.tolerance = Object.assign({}, rules.tolerance, { maxDev: +v }); }, { min: "0.05", max: "1" })),
        fld(L(["Minimum length (share of template)", "ຄວາມຍາວຕ່ຳສຸດ"]), num(R.tolerance.minLength, v => { rules.tolerance = Object.assign({}, rules.tolerance, { minLength: +v }); }, { min: "0.1", max: "1" }))),
      h("h4", null, L(["Activity", "ກິດຈະກຳ"])),
      h("div", { class: "field-row" },
        fld(L(["Pass score", "ຄະແນນຜ່ານ"]), num(R.passScore, v => { rules.passScore = +v; }, { min: "0", max: "100" })),
        fld(L(["Demonstration plays (0 = unlimited)", "ເບິ່ງການສາທິດໄດ້ (0 = ບໍ່ຈຳກັດ)"]), num(R.demo.plays, v => { rules.demo = Object.assign({}, rules.demo, { plays: +v }); }, { min: "0" })),
        fld(L(["Animation speed", "ຄວາມໄວ"]), num(R.demo.speed, v => { rules.demo = Object.assign({}, rules.demo, { speed: +v }); }, { min: "0.25", max: "4" }))),
      h("div", { class: "field-row" },
        fld(L(["Guide", "ເສັ້ນນຳ"]), sel(GUIDE_LEVELS.map(g => [g, t("hw_guide_" + g)]), R.guide, v => { rules.guide = +v; })),
        fld(L(["Checking", "ການກວດ"]), sel([["perStroke", L(["After every stroke", "ທຸກເສັ້ນ"])], ["final", L(["When finished", "ເມື່ອຂຽນແລ້ວ"])]], R.feedback, v => { rules.feedback = v; })),
        fld(L(["Wrong stroke", "ເສັ້ນທີ່ຜິດ"]), sel([["true", L(["Must be redrawn", "ຕ້ອງແຕ້ມໃໝ່"])], ["false", L(["Accepted with a penalty", "ຮັບໄດ້ແຕ່ຫັກຄະແນນ"])]], R.strict, v => { rules.strict = v === "true"; })),
        fld(L(["Points off per retry", "ຫັກຕໍ່ການລອງໃໝ່"]), num(R.retryPenalty, v => { rules.retryPenalty = +v; }, { min: "0" }))),
      h("div", { class: "row" },
        editable ? btn("x", L(["Use platform defaults", "ໃຊ້ຄ່າເລີ່ມຕົ້ນ"]), () => { rules = {}; dirty = true; showTab("rules"); }) : null,
        isSuper() ? btn("settings", L(["Make these the defaults for all characters", "ໃຊ້ເປັນຄ່າເລີ່ມຕົ້ນຂອງທຸກຕົວ"]), async () => {
          const d = effective(); const keep = { weights: d.weights, tolerance: d.tolerance, passScore: d.passScore, retryPenalty: d.retryPenalty, demo: d.demo, feedback: d.feedback, strict: d.strict, guide: d.guide };
          try { await S.api.db.set("settings/app", { handwriting: keep }, true); S.settings = Object.assign({}, S.settings, { handwriting: keep }); toast(t("saved_ok")); } catch(e){ toast(errText(e), "err"); } }) : null));
    return wrap;
  }

  // --- animation ---
  function animationPanel(){
    const wrap = h("div", { class: "stack" });
    const fileIn = h("input", { type: "file", accept: "image/gif,image/webp", style: "display:none", onchange: async e => {
      const f = e.target.files[0]; e.target.value = ""; if (!f) return;
      const c = await checkAnimationFile(f);
      if (!c.ok){ toast({ type: L(["Only GIF or WebP animations.", "ສະເພາະ GIF ຫຼື WebP."]), size: L(["The file is larger than 2 MB.", "ໄຟລ໌ໃຫຍ່ກວ່າ 2 MB."]), content: L(["The file content does not match its type.", "ເນື້ອໃນໄຟລ໌ບໍ່ກົງກັບປະເພດ."]) }[c.error] || c.error, "err"); return; }
      try {
        toast(t("importing"));
        const ext = f.type === "image/gif" ? "gif" : "webp";
        const url = await S.api.storage.upload(f, `handwriting/${encodeURIComponent(row.id)}-${Date.now()}.${ext}`);
        animation = { kind: "gif", url, durationMs: c.durationMs || null, bytes: c.bytes, type: f.type };
        dirty = true; showTab("animation"); toast(L(["Uploaded. Save to keep it.", "ອັບໂຫຼດແລ້ວ. ກົດບັນທຶກເພື່ອເກັບ."]));
      } catch(err){ toast(errText(err), "err"); } } });
    const isGif = animation.kind === "gif" && animation.url;
    wrap.append(
      h("p", { class: "small muted" }, L(["The demonstration is drawn from the stroke template by default, so it always matches what is checked. You can show an uploaded GIF or WebP instead (max 2 MB). The template stays the authority for checking.",
        "ໂດຍປົກກະຕິການສາທິດແຕ້ມຈາກແມ່ແບບເສັ້ນ ຈຶ່ງກົງກັບສິ່ງທີ່ກວດສະເໝີ. ທ່ານສາມາດໃຊ້ GIF ຫຼື WebP ແທນ (ບໍ່ເກີນ 2 MB). ການກວດຍັງໃຊ້ແມ່ແບບເສັ້ນ."])),
      h("dl", { class: "kv" }, h("dt", null, L(["Shown to learners", "ສະແດງໃຫ້ຜູ້ຮຽນ"])), h("dd", null, isGif ? L(["Uploaded animation", "ພາບເຄື່ອນໄຫວທີ່ອັບໂຫຼດ"]) : L(["Generated from the strokes", "ສ້າງຈາກເສັ້ນ"])),
        isGif ? [h("dt", null, L(["Length", "ຄວາມຍາວ"])), h("dd", null, animation.durationMs ? (animation.durationMs / 1000).toFixed(1) + " s" : L(["unknown (WebP): the stroke timing is used", "ບໍ່ຮູ້ (WebP): ໃຊ້ເວລາຂອງເສັ້ນ"])),
          h("dt", null, L(["Size", "ຂະໜາດ"])), h("dd", null, Math.round((animation.bytes || 0) / 1024) + " KB")] : null),
      isGif ? h("img", { src: animation.url, alt: "", style: "max-width:220px;border:1px solid var(--line);border-radius:12px;background:var(--surface)" }) : null,
      h("div", { class: "row" },
        btn("play", L(["Preview the demonstration", "ເບິ່ງການສາທິດ"]), () => strokes.length && playDemo(pad, tpl(), { speed: effective().demo.speed }).then(() => refresh())),
        editable ? btn("upload", isGif ? L(["Replace animation", "ປ່ຽນພາບເຄື່ອນໄຫວ"]) : L(["Upload GIF / WebP", "ອັບໂຫຼດ GIF / WebP"]), () => fileIn.click()) : null,
        editable && isGif ? btn("x", L(["Use generated animation", "ໃຊ້ພາບທີ່ສ້າງຈາກເສັ້ນ"]), () => { animation = { kind: "generated" }; dirty = true; showTab("animation"); }) : null),
      isGif ? h("p", { class: "small muted" }, L(["Switching back keeps the uploaded file in storage (other versions may still use it).", "ການປ່ຽນກັບຄືນຈະເກັບໄຟລ໌ໄວ້ (ເວີຊັນອື່ນອາດໃຊ້ຢູ່)."])) : null,
      fileIn);
    return wrap;
  }

  // --- preview / test: the learner's checking, with the unsaved template and rules ---
  function testPanel(){
    const wrap = h("div", { class: "stack" });
    if (!strokes.length){ wrap.append(h("p", { class: "muted" }, L(["Draw the template first.", "ແຕ້ມແມ່ແບບກ່ອນ."]))); return wrap; }
    const R = effective();
    let session = createSession(tpl(), R);
    const log = h("ol", { class: "small stack", style: "gap:4px;padding-left:18px" });
    const out = h("div");
    const tpad = createPad({ guideChar: row.char, label: L(["Test drawing area", "ບ່ອນທົດສອບ"]), onStroke: pts => {
      const r = session.addStroke(pts), f = strokeFeedback(r);
      if (r.accepted === false) tpad.flash(pts, "error");
      tpad.setInk(R.feedback === "final" ? [...(tpad._ink = (tpad._ink || []).concat([pts]))] : session.accepted.map(a => a.points));
      tpad.setGuide({ level: R.guide, template: tpl(), current: Math.min(session.next, strokes.length - 1) });
      if (f) log.append(h("li", { style: "color:var(--" + (f.kind === "ok" ? "jade" : f.kind === "error" ? "bad" : "ink-2") + ")" }, fbText(f) + (r.res ? "  ·  start " + r.res.m.startD + " · end " + r.res.m.endD + " · shape " + Math.min(r.res.m.fwd, r.res.m.rev) + " · length " + r.res.m.lenRatio : "")));
      if (r.done && r.accepted) finish();
    } });
    const finish = () => {
      const sc = scoreAttempt(session.finish(), R);
      out.innerHTML = "";
      out.append(h("div", { class: "card stack" }, h("div", { class: "hw-score" }, h("b", null, String(sc.total)), h("span", { class: "muted" }, "/ 100"),
        h("span", { class: "pill " + (sc.passed ? "ok" : "expired") }, sc.passed ? L(["Passed", "ຜ່ານ"]) : L(["Not passed", "ບໍ່ຜ່ານ"]))),
        h("div", { class: "hw-comp" }, COMPONENTS.filter(k => sc.weights[k] > 0).flatMap(k => [h("span", null, L(COMP_LABEL[k])), h("div", { class: "bar" }, h("i", { style: `width:${Math.round(100 * sc.ratios[k])}%` })), h("span", { class: "tabnum small" }, sc.components[k] + " / " + sc.weights[k])])),
        Object.keys(sc.errors).length ? h("p", { class: "small" }, L(["Errors: ", "ຂໍ້ຜິດ: "]) + Object.entries(sc.errors).map(([k, v]) => k + " × " + v).join(", ")) : null));
    };
    const again = () => { session = createSession(tpl(), R); tpad._ink = []; tpad.setInk([]); log.innerHTML = ""; out.innerHTML = ""; tpad.setGuide({ level: R.guide, template: tpl(), current: 0 }); tpad.enable(true); };
    wrap.append(h("p", { class: "small muted" }, L(["Draw like a learner: this runs exactly the learner's checking with the settings above (saved or not). Numbers are distances as a share of the box.", "ແຕ້ມຄືຜູ້ຮຽນ: ໃຊ້ການກວດແບບດຽວກັບຜູ້ຮຽນ ກັບການຕັ້ງຄ່າຂ້າງເທິງ."])),
      tpad.el,
      h("div", { class: "row" }, btn("play", L(["Play demonstration", "ເບິ່ງການສາທິດ"]), async () => { tpad.enable(false); await playDemo(tpad, tpl(), { speed: R.demo.speed }); again(); }),
        btn("repeat", L(["Test again", "ທົດສອບອີກ"]), again), R.feedback === "final" ? btn("check", L(["Check", "ກວດ"]), finish, "btn sm primary") : null),
      log, out);
    requestAnimationFrame(again);
    return wrap;
  }

  // --- tabs, save ---
  const tabBody = h("div");
  const tabs = h("div", { class: "tabs", role: "tablist" });
  const TABS = [["strokes", L(["Strokes", "ເສັ້ນ"])], ["rules", L(["Scoring & rules", "ຄະແນນ ແລະ ກົດ"])], ["animation", L(["Animation", "ພາບເຄື່ອນໄຫວ"])], ["test", L(["Preview / Test", "ທົດສອບ"])]];
  let tab = "strokes";
  function showTab(k){
    tab = k; tabs.innerHTML = "";
    TABS.forEach(([id, label]) => tabs.append(h("button", { role: "tab", "aria-selected": String(id === tab), onclick: () => showTab(id) }, label)));
    tabBody.innerHTML = "";
    tabBody.append(k === "strokes" ? h("div", { class: "stack" }, h("div", { class: "row" }, modeChip, undoB, redoB,
        editable ? btn("trash", L(["Clear all", "ລຶບທັງໝົດ"]), async () => { if (strokes.length && await confirmDialog(L(["Clear all", "ລຶບທັງໝົດ"]), L(["Remove every stroke?", "ລຶບທຸກເສັ້ນບໍ?"]), L(["Clear all", "ລຶບທັງໝົດ"]), t("cancel"), true)){ remember(); strokes = []; sel = -1; mode = "add"; refresh(); } }) : null,
        btn("play", L(["Play animation", "ເບິ່ງພາບເຄື່ອນໄຫວ"]), () => strokes.length && pad.animate(tpl(), { speed: effective().demo.speed }).then(() => refresh()))),
        h("p", { class: "small muted" }, L(["Draw each stroke on the canvas in the official order, in the direction it is written. Select a stroke to redraw, move or delete it.",
          "ແຕ້ມແຕ່ລະເສັ້ນຕາມລຳດັບ ແລະ ທິດທາງທີ່ຂຽນແທ້. ເລືອກເສັ້ນເພື່ອແຕ້ມໃໝ່, ຍ້າຍ ຫຼື ລຶບ."])), list, info)
      : k === "rules" ? rulesPanel() : k === "animation" ? animationPanel() : testPanel());
    if (k === "strokes") refresh();
  }

  async function save(publish){
    const v = validateTemplate(tpl());
    if (strokes.length && !v.ok){ toast(info.textContent || v.errors.join(", "), "err"); return; }
    if (publish && !strokes.length && !await confirmDialog(L(["Publish", "ເຜີຍແຜ່"]), L(["This character has no stroke template, so learners can only practise it without checking. Publish anyway?", "ຍັງບໍ່ມີແມ່ແບບ: ຜູ້ຮຽນຝຶກໄດ້ແຕ່ບໍ່ກວດ. ເຜີຍແຜ່ບໍ?"]), L(["Publish", "ເຜີຍແຜ່"]), t("cancel"))) return;
    const data = Object.assign({}, row);
    delete data.id;
    data.handwriting = strokes.length ? { v: FORMAT_VERSION, box: { aspect: 1 }, strokes: strokes.map(s => { const o = { id: s.id, points: s.points }; if (s.note) o.note = s.note; if (s.tol) o.tol = s.tol; return o; }), rules, animation } : null;
    data.strokeCount = strokes.length || data.strokeCount || 0;
    if (publish) data.status = "published";
    try { await saveContent(S.api, "characters", row.id, data, S.me.uid); markUnpublished(); dirty = false; toast(publish ? L(["Saved as published. Press Publish now to send it to learners.", "ບັນທຶກເປັນເຜີຍແຜ່. ກົດ Publish ເພື່ອສົ່ງໃຫ້ຜູ້ຮຽນ."]) : t("saved_ok")); go("handwritingEditor", { id: row.id }); }
    catch(e){ toast(errText(e), "err"); }
  }

  refresh(); showTab("strokes");
  const leave = to => async () => { if (!dirty || await confirmDialog(L(["Unsaved changes", "ຍັງບໍ່ໄດ້ບັນທຶກ"]), L(["Leave without saving?", "ອອກໂດຍບໍ່ບັນທຶກບໍ?"]), L(["Leave", "ອອກ"]), t("cancel"), true)) go(to.view, to.params || {}); };
  return h("div", { class: "stack-l" },
    h("div", { class: "crumb" }, h("button", { onclick: leave({ view: "handwriting" }) }, L(["Lao Script & Handwriting", "ອັກສອນ ແລະ ການຂຽນ"])), "›", h("span", { lang: "lo" }, row.char)),
    h("div", { class: "spread" },
      h("div", { class: "hw-letter" }, h("span", { class: "big", lang: "lo" }, row.char), h("div", null, h("b", null, row.name || "—"),
        h("div", { class: "row small" }, h("span", { class: "pill " + (row.status === "published" ? "ok" : "") }, t("status_" + (row.status || "draft"))),
          saved && saved.sample ? h("span", { class: "pill suspended" }, L(STATUS_LABEL.sample)) : null))),
      h("div", { class: "row" },
        h("button", { class: "btn ghost", onclick: leave({ view: "editor", params: { type: "characters", id: row.id } }) }, icon("edit"), L(["Name, class, access…", "ຊື່, ໝວດ, ສິດເຂົ້າເຖິງ…"])),
        editable ? h("button", { class: "btn", onclick: () => save(false) }, icon("check"), t("save")) : null,
        editable ? h("button", { class: "btn primary", onclick: () => save(true) }, icon("upload"), L(["Save & publish", "ບັນທຶກ ແລະ ເຜີຍແຜ່"])) : null)),
    !editable ? h("div", { class: "notice" }, icon("info"), h("span", null, L(["Read-only: you can view and test, but not change templates.", "ອ່ານຢ່າງດຽວ: ເບິ່ງ ແລະ ທົດສອບໄດ້ ແຕ່ແກ້ໄຂບໍ່ໄດ້."]))) : null,
    h("div", { class: "hw-act" }, pad.el, h("div", { class: "hw-side" }, tabs, tabBody)));
}
