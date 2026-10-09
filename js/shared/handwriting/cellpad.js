// A writing strip of cells — one letter, or a whole word written left to right, cell by cell.
// Pointer Events (finger, pen, mouse), crisp on any screen (devicePixelRatio), strokes kept in each cell's own 0..1
// coordinates so the size of the screen never matters. The guide letters are drawn with drawGlyph(), the same function
// that builds the target of the shape check, so what the learner traces is exactly what is checked.
//
//   const pad = createCellPad({ cells:[{ text:"ເ" }, { text:"ຂົ້" }, …], onStroke: (pts, info) => true|false })
//   pad.el · pad.setCurrent(i) · pad.setCellState(i, "ok"|"bad"|"") · pad.setGuide("trace"|"copy"|"memory")
//   pad.cellInk(i) → strokes · pad.undo() · pad.clear() · pad.showOrder() → Promise · pad.enable(on)
import { h } from "../ui.js";
import { drawGlyph } from "./shape.js";

const DPR = () => Math.min(3, (typeof window !== "undefined" && window.devicePixelRatio) || 1);
const css = n => getComputedStyle(document.documentElement).getPropertyValue(n).trim();

export function createCellPad({ cells, aspect = 1.3, maxCell = 210, minCell = 92, label = "", onStroke = () => true, onStart = () => {} }){
  const n = cells.length;
  const guide = h("canvas", { class: "cp-layer", "aria-hidden": "true" });
  const ink = h("canvas", { class: "cp-layer cp-ink", role: "img", "aria-label": label || "Writing area" });
  const strip = h("div", { class: "cp-strip" }, guide, ink);
  const el = h("div", { class: "cp", "data-cells": String(n) }, strip);
  const gctx = guide.getContext("2d"), ictx = ink.getContext("2d");
  let cw = 0, ch = 0, current = 0, enabled = true, mode = "trace", cur = null, order = null;
  const strokes = cells.map(() => []), state = cells.map(() => "");

  function fit(){
    const avail = el.clientWidth; if (!avail) return;
    const w = Math.max(minCell, Math.min(maxCell, Math.floor(avail / n)));
    if (w === cw) return;
    cw = w; ch = Math.round(w * aspect);
    strip.style.width = cw * n + "px"; strip.style.height = ch + "px";
    for (const c of [guide, ink]){ c.width = Math.round(cw * n * DPR()); c.height = Math.round(ch * DPR()); c.style.width = cw * n + "px"; c.style.height = ch + "px"; c.getContext("2d").setTransform(DPR(), 0, 0, DPR(), 0, 0); }
    draw();
  }
  const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(fit) : null;
  if (ro) ro.observe(el);

  // ---------- drawing ----------
  function draw(){ drawGuide(); drawInk(); }
  function drawGuide(){
    gctx.clearRect(0, 0, cw * n, ch);
    const line = css("--line") || "#cfe2f4", faint = css("--ink-3") || "#4A6685", accent = css("--accent") || "#0379B9";
    for (let i = 0; i < n; i++){
      const x = i * cw, st = state[i];
      // the current cell is lit; finished cells are tinted by their result
      gctx.fillStyle = st === "ok" ? (css("--jade-2") || "#dff5ea") : st === "bad" ? (css("--bad-2") || "#fde2e7") : i === current && enabled ? (css("--accent-2") || "#e0f0fb") : (css("--surface") || "#fff");
      gctx.fillRect(x + 1, 1, cw - 2, ch - 2);
      // writing lines: top of the letter band and the baseline (marks go above and below them)
      gctx.strokeStyle = line; gctx.lineWidth = 1; gctx.setLineDash([4, 4]);
      for (const f of [0.3, 0.7]){ gctx.beginPath(); gctx.moveTo(x + 6, Math.round(ch * f) + 0.5); gctx.lineTo(x + cw - 6, Math.round(ch * f) + 0.5); gctx.stroke(); }
      gctx.setLineDash([]); gctx.strokeStyle = i === current && enabled ? accent : line; gctx.lineWidth = i === current && enabled ? 2 : 1;
      gctx.strokeRect(x + 1, 1, cw - 2, ch - 2);
      // the guide letter: always while tracing; once a cell is finished, as the model to compare with
      const showGlyph = mode === "trace" || st;
      if (showGlyph){ gctx.globalAlpha = st ? 0.22 : 0.16; drawGlyph(gctx, cells[i].text, cw, ch, { x, color: faint }); gctx.globalAlpha = 1; }
      // step number in the corner: the writing order
      gctx.fillStyle = i === current && enabled ? accent : faint; gctx.font = "700 11px system-ui, sans-serif"; gctx.textAlign = "left"; gctx.textBaseline = "top";
      gctx.fillText(String(i + 1), x + 6, 5);
    }
    if (order) order();
  }
  const W = () => Math.max(3.5, cw * 0.06);
  function path(ctx, pts, x0, color, width){
    if (!pts.length) return;
    ctx.save(); ctx.strokeStyle = color; ctx.lineWidth = width; ctx.lineCap = "round"; ctx.lineJoin = "round";
    ctx.beginPath(); ctx.moveTo(x0 + pts[0][0] * cw, pts[0][1] * ch);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(x0 + pts[i][0] * cw, pts[i][1] * ch);
    if (pts.length === 1) ctx.lineTo(x0 + pts[0][0] * cw + 0.1, pts[0][1] * ch);
    ctx.stroke(); ctx.restore();
  }
  function drawInk(){
    ictx.clearRect(0, 0, cw * n, ch);
    const inkC = css("--ink") || "#0A1B2E";
    strokes.forEach((list, i) => list.forEach(s => path(ictx, s, i * cw, state[i] === "bad" ? (css("--bad") || "#c81e4a") : inkC, W())));
  }

  // ---------- input ----------
  // live points are kept in strip coordinates (x: 0..1 over the whole strip) and converted to the cell on release
  const norm = e => { const r = ink.getBoundingClientRect(); return [Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)), Math.max(0, Math.min(1, (e.clientY - r.top) / r.height))]; };
  const liveDraw = () => { drawInk(); if (cur){ ictx.save(); ictx.strokeStyle = css("--accent") || "#0379B9"; ictx.lineWidth = W(); ictx.lineCap = "round"; ictx.lineJoin = "round"; ictx.beginPath();
    cur.pts.forEach((p, i) => { const X = p[0] * cw * n, Y = p[1] * ch; if (i) ictx.lineTo(X, Y); else ictx.moveTo(X, Y); }); ictx.stroke(); ictx.restore(); } };
  ink.addEventListener("pointerdown", e => {
    if (!enabled || order || (e.pointerType === "mouse" && e.button !== 0)) return;
    e.preventDefault(); try { ink.setPointerCapture(e.pointerId); } catch(err){}
    cur = { id: e.pointerId, pts: [norm(e)], t0: performance.now() }; onStart(); liveDraw();
  });
  ink.addEventListener("pointermove", e => {
    if (!cur || e.pointerId !== cur.id) return; e.preventDefault();
    for (const ev of (e.getCoalescedEvents ? e.getCoalescedEvents() : [e])) cur.pts.push(norm(ev));
    liveDraw();
  });
  const end = e => {
    if (!cur || e.pointerId !== cur.id) return;
    const done = cur; cur = null;
    // the stroke belongs to the cell under its centre
    const xs = done.pts.map(p => p[0]), ys = done.pts.map(p => p[1]);
    const cx = (Math.min(...xs) + Math.max(...xs)) / 2, cy = (Math.min(...ys) + Math.max(...ys)) / 2;
    const cell = Math.max(0, Math.min(n - 1, Math.floor(cx * n)));
    const local = done.pts.map(p => [Math.round((p[0] * n - cell) * 10000) / 10000, Math.round(p[1] * 10000) / 10000]);
    const keep = onStroke(local, { cell, cx, cy, ms: Math.round(performance.now() - done.t0) });
    if (keep !== false) strokes[cell].push(local);
    else flash(local, cell);
    drawInk();
  };
  ink.addEventListener("pointerup", end); ink.addEventListener("pointercancel", end);
  // a refused stroke shows in red for a moment
  function flash(pts, cell){ path(ictx, pts, cell * cw, css("--bad") || "#c81e4a", W()); setTimeout(drawInk, 650); }

  // ---------- writing order demonstration: each cell's parts appear left to right ----------
  function showOrder({ step = 650 } = {}){
    return new Promise(resolve => {
      const seq = [];
      // a consonant first, then each mark on it in turn (a lone mark is shown on the vowel holder ອ)
      cells.forEach((c, i) => { let acc = c.kind === "mark" ? "ອ" : ""; (c.steps || [{ glyph: c.text }]).forEach(st => { acc += st.glyph; seq.push({ i, text: acc }); }); });
      const shown = cells.map(() => ""); let k = 0;
      const accent = css("--accent") || "#0379B9";
      order = () => shown.forEach((t, i) => { if (t) drawGlyph(gctx, t, cw, ch, { x: i * cw, color: accent }); });
      const tick = () => {
        if (k >= seq.length){ setTimeout(() => { order = null; drawGuide(); resolve(true); }, step); return; }
        shown[seq[k].i] = seq[k].text; k++; drawGuide(); setTimeout(tick, step);
      };
      tick();
    });
  }

  const api = {
    el, cells, get current(){ return current; }, get cellSize(){ return [cw, ch]; },
    setCurrent(i){ current = Math.max(0, Math.min(n - 1, i)); drawGuide(); scrollIntoView(); },
    setCellState(i, s){ state[i] = s || ""; draw(); },
    setGuide(m){ mode = m; drawGuide(); },
    cellInk: i => strokes[i].slice(),
    undo(){ for (let i = n - 1; i >= 0; i--) if (strokes[i].length && !state[i]){ strokes[i].pop(); drawInk(); return i; } return -1; },
    clear(){ strokes.forEach(s => s.length = 0); state.fill(""); current = 0; draw(); scrollIntoView(); },
    enable(on){ enabled = !!on; el.classList.toggle("locked", !enabled); drawGuide(); },
    showOrder, refresh(){ cw = 0; fit(); }, destroy(){ if (ro) ro.disconnect(); }
  };
  // long words scroll sideways inside the pad; the current cell is kept in view
  function scrollIntoView(){ if (!cw) return; const x = current * cw; if (x < el.scrollLeft || x + cw > el.scrollLeft + el.clientWidth) el.scrollTo({ left: Math.max(0, x - cw), behavior: "smooth" }); }
  requestAnimationFrame(fit);
  return api;
}
