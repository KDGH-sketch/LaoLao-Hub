// Drawing pad for handwriting: a square, responsive canvas with Pointer Events (mouse, touch, pen/stylus).
// Everything is stored and redrawn in normalised coordinates (0..1), so resizing or rotating the device never distorts
// the drawing. Used by the learner activity, quizzes and the admin Stroke Editor.
//
//   const pad = createPad({ guideChar:"ກ", onStroke: points => … })
//   pad.el  · pad.setGuide({ level, template, current }) · pad.setInk(strokes) · pad.flash(points, kind) · pad.enable(on)
//   pad.animate(template, { speed }) → Promise (stroke-order demonstration drawn from the stroke data)
import { h } from "../ui.js";
import { strokeDrawMs } from "./model.js";

const DPR = () => Math.min(3, (typeof window !== "undefined" && window.devicePixelRatio) || 1);
const css = name => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

export function createPad({ guideChar = "", label = "", onStroke = null, onStart = () => {} } = {}){
  const glyph = h("div", { class: "hwp-glyph", lang: "lo", "aria-hidden": "true" }, guideChar);
  const guide = h("canvas", { class: "hwp-layer", "aria-hidden": "true" });
  const ink = h("canvas", { class: "hwp-layer hwp-ink", role: "img", "aria-label": label || "Drawing area" });
  const el = h("div", { class: "hwp" }, h("div", { class: "hwp-grid", "aria-hidden": "true" }), glyph, guide, ink);
  const gctx = guide.getContext("2d"), ictx = ink.getContext("2d");
  let size = 0, enabled = true, strokes = [], cur = null, guideState = { level: 1, template: null, current: 0 }, flashes = [], anim = null;

  const P = (p, s = size) => [p[0] * s, p[1] * s];
  function fit(){
    const w = Math.round(el.clientWidth); if (!w || w === size) return;
    size = w;
    for (const c of [guide, ink]){ c.width = Math.round(w * DPR()); c.height = Math.round(w * DPR()); c.getContext("2d").setTransform(DPR(), 0, 0, DPR(), 0, 0); }
    glyph.style.fontSize = Math.round(w * 0.62) + "px";
    drawGuide(); drawInk();
  }
  const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(fit) : null;
  if (ro) ro.observe(el);

  function line(ctx, pts, color, width, dash){
    if (pts.length < 2) return;
    ctx.save(); ctx.strokeStyle = color; ctx.lineWidth = width; ctx.lineCap = "round"; ctx.lineJoin = "round"; if (dash) ctx.setLineDash(dash);
    ctx.beginPath(); const a = P(pts[0]); ctx.moveTo(a[0], a[1]);
    for (let i = 1; i < pts.length; i++){ const b = P(pts[i]); ctx.lineTo(b[0], b[1]); }
    ctx.stroke(); ctx.restore();
  }
  function dot(ctx, p, r, color, text){
    const [x, y] = P(p); ctx.save(); ctx.fillStyle = color; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
    if (text){ ctx.fillStyle = "#fff"; ctx.font = `700 ${Math.round(r * 1.2)}px system-ui, sans-serif`; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText(text, x, y + 0.5); }
    ctx.restore();
  }
  function arrow(ctx, pts, color, w){
    if (pts.length < 2) return;
    const a = P(pts[pts.length - 2]), b = P(pts[pts.length - 1]), ang = Math.atan2(b[1] - a[1], b[0] - a[0]), L = w * 2.6;
    ctx.save(); ctx.fillStyle = color; ctx.beginPath(); ctx.moveTo(b[0] + Math.cos(ang) * L * 0.4, b[1] + Math.sin(ang) * L * 0.4);
    ctx.lineTo(b[0] - Math.cos(ang - 0.5) * L, b[1] - Math.sin(ang - 0.5) * L); ctx.lineTo(b[0] - Math.cos(ang + 0.5) * L, b[1] - Math.sin(ang + 0.5) * L); ctx.closePath(); ctx.fill(); ctx.restore();
  }
  const W = () => Math.max(4, size * 0.035);

  // Guide levels: 1 faint letter + all strokes · 2 the current stroke only · 3 its start dot only · 4 nothing.
  // show:"all" (admin editor / preview) draws every stroke with its number.
  function drawGuide(){
    gctx.clearRect(0, 0, size, size);
    const { level, template, current, show } = guideState;
    glyph.style.opacity = level === 1 || show === "all" || !template ? "" : "0";
    if (!template) return;
    const faint = css("--accent-3") || "#BAE6FD", strong = css("--accent") || "#0284C7";
    template.strokes.forEach((s, i) => {
      const isCur = i === current;
      if (show === "all"){ line(gctx, s.points, isCur ? strong : faint, W() * 0.8, null); dot(gctx, s.start, W() * 0.8, strong, String(i + 1)); return; }
      if (level === 1) line(gctx, s.points, faint, W() * 0.7, isCur ? [W(), W() * 1.2] : null);
      if (level === 2 && isCur) line(gctx, s.points, faint, W() * 0.8, [W(), W() * 1.2]);
      if (level <= 3 && isCur) dot(gctx, s.start, W() * 0.8, strong, String(i + 1));
    });
  }
  function drawInk(){
    ictx.clearRect(0, 0, size, size);
    const inkC = css("--ink") || "#0F172A";
    strokes.forEach(s => line(ictx, s.points, s.color || inkC, W(), null));
    flashes.forEach(f => line(ictx, f.points, f.color, W(), null));
    if (cur) line(ictx, cur.points, css("--accent") || "#0284C7", W(), null);
  }

  // ---------- input ----------
  const norm = e => { const r = ink.getBoundingClientRect(); return [Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)), Math.max(0, Math.min(1, (e.clientY - r.top) / r.height))]; };
  ink.addEventListener("pointerdown", e => {
    if (!enabled || anim || (e.pointerType === "mouse" && e.button !== 0)) return;
    e.preventDefault(); try { ink.setPointerCapture(e.pointerId); } catch(err){}
    cur = { id: e.pointerId, t0: performance.now(), type: e.pointerType, points: [[...norm(e), 0]], pressure: [] };
    if (e.pressure) cur.pressure.push(e.pressure);
    flashes = []; onStart(); drawInk();
  });
  ink.addEventListener("pointermove", e => {
    if (!cur || e.pointerId !== cur.id) return;
    e.preventDefault();
    const evs = e.getCoalescedEvents ? e.getCoalescedEvents() : [e];
    for (const ev of (evs.length ? evs : [e])){ cur.points.push([...norm(ev), Math.round(performance.now() - cur.t0)]); if (ev.pressure) cur.pressure.push(ev.pressure); }
    drawInk();
  });
  const end = e => {
    if (!cur || e.pointerId !== cur.id) return;
    const done = cur; cur = null;
    if (done.points.length < 2) done.points.push([done.points[0][0] + 0.001, done.points[0][1], 1]);
    drawInk();
    const handler = api.onStroke || onStroke;
    if (handler) handler(done.points.map(p => [Math.round(p[0] * 10000) / 10000, Math.round(p[1] * 10000) / 10000, p[2]]), { pointerType: done.type, pressure: done.pressure.length ? done.pressure.reduce((a, b) => a + b) / done.pressure.length : null });
  };
  ink.addEventListener("pointerup", end); ink.addEventListener("pointercancel", end);

  // ---------- demonstration (generated from the stroke data) ----------
  function animate(template, { speed = 1 } = {}){
    stop();
    const ss = template.strokes, color = css("--accent") || "#0284C7", faint = css("--accent-3") || "#BAE6FD";
    return new Promise(resolve => {
      let i = 0, t0 = null, cancelled = false;
      anim = { cancel(){ cancelled = true; } };
      const frame = now => {
        if (cancelled){ anim = null; drawGuide(); return resolve(false); }
        if (t0 === null) t0 = now;
        const s = ss[i], dur = strokeDrawMs(s) / speed, k = Math.min(1, (now - t0) / dur);
        // what has been drawn so far: finished strokes in full, the current one up to k of its length
        gctx.clearRect(0, 0, size, size);
        ss.slice(0, i).forEach((p, j) => { line(gctx, p.points, color, W(), null); dot(gctx, p.start, W() * 0.8, color, String(j + 1)); });
        const part = partial(s.points, k);
        line(gctx, part, color, W(), null); dot(gctx, s.start, W() * 0.8, color, String(i + 1)); if (k < 1) arrow(gctx, part, color, W());
        if (k < 1) return requestAnimationFrame(frame);
        i++; t0 = now + 350 / speed;               // short pause between strokes
        if (i >= ss.length){ setTimeout(() => { anim = null; drawGuide(); resolve(true); }, 600 / speed); return; }
        const wait = () => requestAnimationFrame(n => n < t0 ? wait() : (t0 = n, frame(n)));
        wait();
      };
      glyph.style.opacity = "0";                   // the demonstration replaces the guide while it plays
      requestAnimationFrame(frame);
    });
  }
  const stop = () => { if (anim){ anim.cancel(); anim = null; } };

  const api = {
    el, onStroke: null, get size(){ return size; }, get animating(){ return !!anim; },
    setGuide(state){ guideState = Object.assign({}, guideState, state); drawGuide(); },
    setGlyph(ch){ glyph.textContent = ch || ""; },
    setInk(list){ strokes = list.map(s => Array.isArray(s) ? { points: s } : s); flashes = []; drawInk(); },
    // briefly show a refused stroke (kind: "error" | "ok") before it disappears
    flash(points, kind = "error", ms = 900){ const f = { points, color: kind === "error" ? (css("--bad") || "#E11D48") : (css("--jade") || "#059669") }; flashes.push(f); drawInk();
      setTimeout(() => { flashes = flashes.filter(x => x !== f); drawInk(); }, ms); },
    enable(on){ enabled = !!on; el.classList.toggle("locked", !enabled); },
    animate, stop,
    refresh(){ size = 0; fit(); },
    destroy(){ stop(); if (ro) ro.disconnect(); }
  };
  requestAnimationFrame(fit);
  return api;
}

// the first k (0..1) of a path, by length
export function partial(pts, k){
  if (k >= 1) return pts;
  const seg = []; let total = 0; for (let i = 1; i < pts.length; i++){ const d = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]); seg.push(d); total += d; }
  let want = total * k; const out = [pts[0]];
  for (let i = 1; i < pts.length; i++){
    if (want >= seg[i - 1]){ out.push(pts[i]); want -= seg[i - 1]; continue; }
    const f = seg[i - 1] ? want / seg[i - 1] : 0; out.push([pts[i - 1][0] + (pts[i][0] - pts[i - 1][0]) * f, pts[i - 1][1] + (pts[i][1] - pts[i - 1][1]) * f]); break;
  }
  return out;
}
