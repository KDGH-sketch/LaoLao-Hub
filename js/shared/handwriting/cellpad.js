// A writing strip of cells — one letter, or a whole word written left to right, cell by cell.
// Pointer Events (finger, pen, mouse), crisp on any screen (devicePixelRatio), strokes kept in each cell's own 0..1
// coordinates so the size of the screen never matters. The guide letters are drawn with drawGlyph(), the same function
// that builds the target of the shape check, so what the learner traces is exactly what is checked.
// Two views: "strip" (every cell side by side) and "focus" (made for phones: the current cell big, the whole word as a
// small map above it). Finger strokes go through the smooth pen (./smooth.js): a stabilizer while drawing, a light
// clean-up when the finger lifts, and curves on screen. Pen size and smoothing are the learner's own settings.
//
//   const pad = createCellPad({ cells:[{ text:"ເ" }, { text:"ຂົ້" }, …], view:"strip"|"focus", onStroke: (pts, info) => true|false })
//   pad.el · pad.setCurrent(i) · pad.setCellState(i, "ok"|"bad"|"") · pad.setGuide("trace"|"copy"|"memory") · pad.setView(v)
//   pad.cellInk(i) → strokes · pad.undo() · pad.clear() · pad.showOrder() → Promise · pad.enable(on)
import { h } from "../ui.js";
import { drawGlyph } from "./shape.js";
import { getPen, onPenChange, penWidth, createStabilizer, smoothStroke, tracePath } from "./smooth.js";

const DPR = () => Math.min(3, (typeof window !== "undefined" && window.devicePixelRatio) || 1);
const css = n => getComputedStyle(document.documentElement).getPropertyValue(n).trim();

export function createCellPad({ cells, aspect = 1.3, maxCell = 210, minCell = 92, maxFocus = 380, label = "", view = "strip", onStroke = () => true, onStart = () => {} }){
  const n = cells.length;
  const guide = h("canvas", { class: "cp-layer", "aria-hidden": "true" });
  const ink = h("canvas", { class: "cp-layer cp-ink", role: "img", "aria-label": label || "Writing area" });
  const strip = h("div", { class: "cp-strip" }, guide, ink);
  // focus view: the word as small cells (the current one marked), drawn on their own little canvases
  const thumbs = cells.map((c, i) => h("canvas", { class: "cp-thumb", "data-i": String(i), "aria-hidden": "true" }));
  const map = h("div", { class: "cp-map", "aria-hidden": "true" }, thumbs);
  const pos = h("div", { class: "cp-pos tabnum", "aria-live": "polite" });
  const el = h("div", { class: "cp", "data-cells": String(n) }, map, pos, strip);
  const gctx = guide.getContext("2d"), ictx = ink.getContext("2d");
  let cw = 0, ch = 0, current = 0, enabled = true, mode = "trace", cur = null, order = null, focus = view === "focus", pen = getPen(), lastAvail = 0;
  const strokes = cells.map(() => []), state = cells.map(() => "");
  const shown = () => focus ? [current] : cells.map((_, i) => i);           // the cells on the main canvas, left to right
  const X = i => focus ? 0 : i * cw;                                       // where cell i starts on the main canvas

  function fit(force){
    const avail = el.clientWidth; if (!avail) return;
    if (!force && avail === lastAvail && cw) return;
    lastAvail = avail;
    el.classList.toggle("focus", focus);
    let w;
    if (focus){
      // one big cell: as wide as the screen allows, but never taller than about 60 % of the window
      const vh = (typeof window !== "undefined" && window.innerHeight) || 800;
      w = Math.max(minCell, Math.floor(Math.min(avail - 2, maxFocus, (vh * 0.6) / aspect)));
    } else w = Math.max(minCell, Math.min(maxCell, Math.floor(avail / n)));
    cw = w; ch = Math.round(w * aspect);
    const cols = focus ? 1 : n;
    strip.style.width = cw * cols + "px"; strip.style.height = ch + "px";
    for (const c of [guide, ink]){ c.width = Math.round(cw * cols * DPR()); c.height = Math.round(ch * DPR()); c.style.width = cw * cols + "px"; c.style.height = ch + "px"; c.getContext("2d").setTransform(DPR(), 0, 0, DPR(), 0, 0); }
    // the map: small cells that fit one row (up to 56 px wide each)
    const tw = Math.max(26, Math.min(56, Math.floor((avail - 8 * (n - 1)) / n))), th = Math.round(tw * aspect);
    thumbs.forEach(c => { c.width = Math.round(tw * DPR()); c.height = Math.round(th * DPR()); c.style.width = tw + "px"; c.style.height = th + "px"; c.getContext("2d").setTransform(DPR(), 0, 0, DPR(), 0, 0); c._w = tw; c._h = th; });
    draw();
  }
  // only a change of width matters (the pad sets its own height); the new size is applied on the next frame, so the
  // browser never sees the pad resize itself inside its own resize callback ("ResizeObserver loop")
  let rof = 0;
  const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(entries => {
    const w = Math.round(entries[0] && entries[0].contentRect ? entries[0].contentRect.width : el.clientWidth);
    if (w === lastAvail || rof) return;
    rof = requestAnimationFrame(() => { rof = 0; fit(); });
  }) : null;
  if (ro) ro.observe(el);
  const stopPen = onPenChange(v => { pen = v; drawInk(); drawThumbs(); });

  // ---------- drawing ----------
  function draw(){ drawGuide(); drawInk(); drawThumbs(); }
  const fillFor = i => state[i] === "ok" ? (css("--jade-2") || "#dff5ea") : state[i] === "bad" ? (css("--bad-2") || "#fde2e7") : i === current && enabled ? (css("--accent-2") || "#e0f0fb") : (css("--surface") || "#fff");
  function drawGuide(){
    gctx.clearRect(0, 0, guide.width, guide.height);
    const line = css("--line") || "#cfe2f4", faint = css("--ink-3") || "#4A6685", accent = css("--accent") || "#0379B9";
    for (const i of shown()){
      const x = X(i), st = state[i];
      gctx.fillStyle = fillFor(i);
      gctx.fillRect(x + 1, 1, cw - 2, ch - 2);
      // writing lines: top of the letter band and the baseline (marks go above and below them)
      gctx.strokeStyle = line; gctx.lineWidth = 1; gctx.setLineDash([4, 4]);
      for (const f of [0.3, 0.7]){ gctx.beginPath(); gctx.moveTo(x + 6, Math.round(ch * f) + 0.5); gctx.lineTo(x + cw - 6, Math.round(ch * f) + 0.5); gctx.stroke(); }
      gctx.setLineDash([]); gctx.strokeStyle = i === current && enabled ? accent : line; gctx.lineWidth = i === current && enabled ? 2 : 1;
      gctx.strokeRect(x + 1, 1, cw - 2, ch - 2);
      // the guide letter: always while tracing; once a cell is finished, as the model to compare with
      if (mode === "trace" || st){ gctx.globalAlpha = st ? 0.24 : 0.2; drawGlyph(gctx, cells[i].text, cw, ch, { x, color: faint }); gctx.globalAlpha = 1; }
      // step number in the corner: the writing order
      gctx.fillStyle = i === current && enabled ? accent : faint; gctx.font = `700 ${focus ? 13 : 11}px system-ui, sans-serif`; gctx.textAlign = "left"; gctx.textBaseline = "top";
      gctx.fillText(focus ? (i + 1) + " / " + n : String(i + 1), x + 7, 6);
    }
    if (order) order();
    pos.textContent = focus && n > 1 ? (current + 1) + " / " + n : "";
  }
  const W = () => penWidth(cw, pen);
  function path(ctx, pts, x0, color, width, w = cw, hh = ch){
    if (!pts.length) return;
    ctx.save(); ctx.strokeStyle = color; ctx.lineWidth = width; ctx.lineCap = "round"; ctx.lineJoin = "round";
    tracePath(ctx, pts, p => [x0 + p[0] * w, p[1] * hh]); ctx.stroke(); ctx.restore();
  }
  function drawInk(){
    ictx.clearRect(0, 0, ink.width, ink.height);
    const inkC = css("--ink") || "#0A1B2E", bad = css("--bad") || "#c81e4a";
    for (const i of shown()) strokes[i].forEach(s => path(ictx, s, X(i), state[i] === "bad" ? bad : inkC, W()));
  }
  function drawThumbs(){
    if (!focus) return;
    const faint = css("--ink-3") || "#4A6685", inkC = css("--ink") || "#0A1B2E", accent = css("--accent") || "#0379B9", line = css("--line-2") || "#B5D2EC";
    thumbs.forEach((c, i) => {
      const x = c.getContext("2d"), w = c._w || 40, hh = c._h || 52;
      x.clearRect(0, 0, c.width, c.height);
      x.fillStyle = fillFor(i); x.fillRect(0, 0, w, hh);
      x.strokeStyle = i === current ? accent : line; x.lineWidth = i === current ? 2.5 : 1; x.strokeRect(1, 1, w - 2, hh - 2);
      x.globalAlpha = strokes[i].length ? 0.18 : 0.55; drawGlyph(x, cells[i].text, w, hh, { color: faint }); x.globalAlpha = 1;
      strokes[i].forEach(s => path(x, s, 0, state[i] === "bad" ? (css("--bad") || "#c81e4a") : inkC, Math.max(1.5, w * 0.06), w, hh));
      c.classList.toggle("on", i === current);
    });
  }

  // ---------- input ----------
  // live points are kept in canvas coordinates (0..1 over the whole canvas) and converted to the cell on release
  const norm = e => { const r = ink.getBoundingClientRect(); return [Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)), Math.max(0, Math.min(1, (e.clientY - r.top) / r.height))]; };
  const cols = () => focus ? 1 : n;
  const liveDraw = () => { drawInk(); if (cur && cur.pts.length){ ictx.save(); ictx.strokeStyle = css("--accent") || "#0379B9"; ictx.lineWidth = W(); ictx.lineCap = "round"; ictx.lineJoin = "round";
    tracePath(ictx, cur.pts, p => [p[0] * cw * cols(), p[1] * ch]); ictx.stroke(); ictx.restore(); } };
  let raf = 0;
  const schedule = () => { if (raf) return; raf = (typeof requestAnimationFrame !== "undefined" ? requestAnimationFrame : f => setTimeout(f, 16))(() => { raf = 0; liveDraw(); }); };
  ink.addEventListener("pointerdown", e => {
    if (!enabled || order || cur || (e.pointerType === "mouse" && e.button !== 0)) return;
    e.preventDefault(); try { ink.setPointerCapture(e.pointerId); } catch(err){}
    // the smoothing follows the learner's setting (a pen or mouse is steadier: half of it)
    const level = e.pointerType === "touch" ? pen.smooth : Math.round(pen.smooth / 2);
    const stab = createStabilizer(level, [cw * cols(), ch]);
    cur = { id: e.pointerId, level, stab, pts: stab.start(norm(e)), t0: performance.now() }; onStart(); liveDraw();
  });
  ink.addEventListener("pointermove", e => {
    if (!cur || e.pointerId !== cur.id) return; e.preventDefault();
    for (const ev of (e.getCoalescedEvents && e.getCoalescedEvents().length ? e.getCoalescedEvents() : [e])) cur.pts.push(...cur.stab.move(norm(ev)));
    schedule();
  });
  const end = e => {
    if (!cur || e.pointerId !== cur.id) return;
    const done = cur; cur = null;
    if (e.type === "pointerup") done.pts.push(...done.stab.end(norm(e)));
    const pts = smoothStroke(done.pts, done.level);
    // the stroke belongs to the cell under its centre (in the focus view: the current cell)
    const xs = pts.map(p => p[0]), ys = pts.map(p => p[1]);
    const cx = (Math.min(...xs) + Math.max(...xs)) / 2, cy = (Math.min(...ys) + Math.max(...ys)) / 2;
    const cell = focus ? current : Math.max(0, Math.min(n - 1, Math.floor(cx * n)));
    const off = focus ? 0 : cell;
    const local = pts.map(p => [Math.round((p[0] * cols() - off) * 10000) / 10000, Math.round(p[1] * 10000) / 10000]);
    const keep = onStroke(local, { cell, cx: focus ? (cell + cx) / n : cx, cy, ms: Math.round(performance.now() - done.t0) });
    if (keep !== false) strokes[cell].push(local);
    drawInk(); drawThumbs();
    if (keep === false) flash(local, cell);
  };
  ink.addEventListener("pointerup", end); ink.addEventListener("pointercancel", end);
  // a refused stroke shows in red for a moment
  function flash(pts, cell){ if (!shown().includes(cell)) return; path(ictx, pts, X(cell), css("--bad") || "#c81e4a", W()); setTimeout(drawInk, 650); }

  // ---------- writing order demonstration: each cell's parts appear left to right ----------
  function showOrder({ step = 650 } = {}){
    return new Promise(resolve => {
      const seq = [];
      // a consonant first, then each mark on it in turn (a lone mark is shown on the vowel holder ອ)
      cells.forEach((c, i) => { let acc = c.kind === "mark" ? "ອ" : ""; (c.steps || [{ glyph: c.text }]).forEach(st => { acc += st.glyph; seq.push({ i, text: acc }); }); });
      const parts = cells.map(() => ""); let k = 0;
      const accent = css("--accent") || "#0379B9", was = current;
      order = () => { for (const i of shown()) if (parts[i]) drawGlyph(gctx, parts[i], cw, ch, { x: X(i), color: accent }); };
      const tick = () => {
        if (k >= seq.length){ setTimeout(() => { order = null; current = was; draw(); resolve(true); }, step); return; }
        parts[seq[k].i] = seq[k].text;
        if (focus) current = seq[k].i;                                     // the big cell follows the demonstration
        k++; drawGuide(); drawInk(); drawThumbs(); setTimeout(tick, step);
      };
      tick();
    });
  }

  const api = {
    el, cells, get current(){ return current; }, get cellSize(){ return [cw, ch]; }, get view(){ return focus ? "focus" : "strip"; },
    setCurrent(i){ current = Math.max(0, Math.min(n - 1, i)); draw(); scrollIntoView(); },
    setCellState(i, s){ state[i] = s || ""; draw(); },
    setGuide(m){ mode = m; drawGuide(); },
    setView(v){ const f = v === "focus"; if (f === focus) return; focus = f; cur = null; fit(true); scrollIntoView(); },
    cellInk: i => strokes[i].slice(),
    undo(){ for (let i = n - 1; i >= 0; i--) if (strokes[i].length && !state[i]){ strokes[i].pop(); draw(); return i; } return -1; },
    clear(){ strokes.forEach(s => s.length = 0); state.fill(""); current = 0; draw(); scrollIntoView(); },
    enable(on){ enabled = !!on; el.classList.toggle("locked", !enabled); drawGuide(); drawThumbs(); },
    showOrder, refresh(){ fit(true); }, destroy(){ if (ro) ro.disconnect(); stopPen(); }
  };
  // long words scroll sideways inside the pad (strip view); the current cell is kept in view
  function scrollIntoView(){ if (!cw || focus) return; const x = current * cw; if (x < el.scrollLeft || x + cw > el.scrollLeft + el.clientWidth) el.scrollTo({ left: Math.max(0, x - cw), behavior: "smooth" }); }
  el.__pad = api;                                                           // for the browser tests
  requestAnimationFrame(() => fit(true));
  return api;
}
