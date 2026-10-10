// The Pen panel: smoothing (for writing with a finger) and pen size, with a live preview. The same panel is under the
// learner's writing pads and under the admin Stroke editor / Test area; the settings are shared on this device
// (js/shared/handwriting/smooth.js), so every open pad follows a change at once.
import { h, icon } from "../ui.js";
import { t } from "../i18n.js";
import { getPen, setPen, onPenChange, createStabilizer, smoothStroke, tracePath, penWidth } from "./smooth.js";

// A small panel under the writing area. The preview shows a shaky line as the finger drew it (faint) and as the pen
// draws it at the chosen smoothing, so the setting can be judged before writing. Settings stay on this device.
export function penPanel(){
  const pen = getPen();
  const prev = h("canvas", { class: "hw-pen-prev", "aria-hidden": "true", width: 240, height: 64 });
  const val = h("b", { class: "tabnum" });
  const range = h("input", { type: "range", min: "0", max: "10", step: "1", value: String(pen.smooth), "aria-label": t("hw_pen_smooth"),
    oninput: e => { setPen({ smooth: +e.target.value }); paint(); } });
  const sizes = h("div", { class: "seg", role: "group", "aria-label": t("hw_pen_size") }, ["s", "m", "l"].map(k =>
    h("button", { "aria-pressed": String(pen.size === k), onclick: e => { setPen({ size: k }); [...sizes.children].forEach(b => b.setAttribute("aria-pressed", String(b === e.currentTarget))); paint(); } }, t("hw_pen_" + k))));
  const sum = h("span", { class: "hw-pen-sum small muted" });
  function paint(){
    const p = getPen(); val.textContent = p.smooth ? String(p.smooth) : t("hw_pen_off");
    sum.textContent = t("hw_pen_smooth") + ": " + (p.smooth ? p.smooth + "/10" : t("hw_pen_off")) + " · " + t("hw_pen_" + p.size);
    const ctx = prev.getContext("2d"), W = prev.width, H = prev.height, cs = getComputedStyle(document.documentElement);
    ctx.clearRect(0, 0, W, H);
    let seed = 3; const r = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    const shaky = Array.from({ length: 60 }, (_, i) => { const k = i / 59; return [0.06 + 0.88 * k + (r() - 0.5) * 0.02, 0.5 + 0.3 * Math.sin(k * Math.PI * 2) + (r() - 0.5) * 0.08, i]; });
    const st = createStabilizer(p.smooth, [W, H]), pts = [...st.start(shaky[0])]; shaky.slice(1, -1).forEach(q => pts.push(...st.move(q))); pts.push(...st.end(shaky[59]));
    const draw = (list, color, w) => { ctx.save(); ctx.strokeStyle = color; ctx.lineWidth = w; ctx.lineCap = "round"; ctx.lineJoin = "round"; tracePath(ctx, list, q => [q[0] * W, q[1] * H]); ctx.stroke(); ctx.restore(); };
    ctx.globalAlpha = 0.55; draw(shaky, cs.getPropertyValue("--ink-3").trim(), 1.5); ctx.globalAlpha = 1;
    draw(smoothStroke(pts, p.smooth), cs.getPropertyValue("--accent").trim(), Math.min(9, penWidth(80, p)));
  }
  const box = h("details", { class: "hw-pen" },
    h("summary", null, icon("pen"), h("span", null, t("hw_pen")), sum),
    h("div", { class: "hw-pen-body" },
      h("div", { class: "hw-pen-row" }, h("span", null, t("hw_pen_smooth")), val),
      h("label", { class: "hw-pen-range" }, h("small", null, t("hw_pen_off")), range, h("small", null, t("hw_pen_strong"))),
      h("p", { class: "small muted" }, t("hw_pen_smooth_d")),
      h("div", { class: "hw-pen-row" }, h("span", null, t("hw_pen_size")), sizes),
      prev));
  // other panels (another pad on the page) keep this one in step
  const stop = onPenChange(v => { if (!box.isConnected){ stop(); return; } range.value = String(v.smooth); [...sizes.children].forEach((b, i) => b.setAttribute("aria-pressed", String(["s", "m", "l"][i] === v.size))); paint(); });
  requestAnimationFrame(paint);
  return box;
}
