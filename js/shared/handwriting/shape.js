// Shape checking for any Lao letter, vowel, tone mark, numeral or whole cell of a word — no stroke template needed.
// The target is the letter as the Lao font draws it (rendered into a small grid in the browser, glyphMask); the
// learner's strokes are drawn into the same grid (inkMask). Two numbers decide the score:
//   recall    how much of the letter the ink covers (a missing loop or tail lowers it)
//   precision how much of the ink lies on the letter (scribbles and extra strokes lower it)
// Both with a small tolerance (a few pixels), so a hand-drawn line need not match the font exactly.
// Letters that have a teacher's stroke template are still checked stroke by stroke (recognizer.js).
// Pure except glyphMask (needs a canvas). Tests: scripts/test_shape_check.mjs.

export const GRID = 64;
export const PASS = 70;

// strokes ([[x,y]…] in 0..1 of the cell) → a GRID×GRID mask, lines `width` cells thick
export function inkMask(strokes, { grid = GRID, width = 0.075 } = {}){
  const m = new Uint8Array(grid * grid), r = Math.max(1, (width * grid) / 2), r2 = r * r;
  const seg = (ax, ay, bx, by) => {
    const x0 = Math.max(0, Math.floor(Math.min(ax, bx) - r)), x1 = Math.min(grid - 1, Math.ceil(Math.max(ax, bx) + r));
    const y0 = Math.max(0, Math.floor(Math.min(ay, by) - r)), y1 = Math.min(grid - 1, Math.ceil(Math.max(ay, by) + r));
    const dx = bx - ax, dy = by - ay, L = dx * dx + dy * dy || 1e-9;
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++){
      const px = x + 0.5, py = y + 0.5, t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / L));
      const qx = ax + t * dx - px, qy = ay + t * dy - py;
      if (qx * qx + qy * qy <= r2) m[y * grid + x] = 1;
    }
  };
  for (const s of strokes || []){
    const pts = (s.points || s).map(p => [p[0] * grid, p[1] * grid]);
    if (pts.length === 1) seg(pts[0][0], pts[0][1], pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) seg(pts[i - 1][0], pts[i - 1][1], pts[i][0], pts[i][1]);
  }
  return m;
}
// grow a mask by r cells (tolerance)
export function dilate(m, r, grid = GRID){
  const out = new Uint8Array(m.length), r2 = r * r;
  for (let y = 0; y < grid; y++) for (let x = 0; x < grid; x++){
    if (!m[y * grid + x]) continue;
    for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++){
      if (dx * dx + dy * dy > r2) continue;
      const X = x + dx, Y = y + dy; if (X >= 0 && Y >= 0 && X < grid && Y < grid) out[Y * grid + X] = 1;
    }
  }
  return out;
}
const count = m => { let n = 0; for (let i = 0; i < m.length; i++) n += m[i]; return n; };
const overlap = (a, b) => { let n = 0; for (let i = 0; i < a.length; i++) if (a[i] && b[i]) n++; return n; };
export function bboxOf(m, grid = GRID){
  let x0 = grid, y0 = grid, x1 = -1, y1 = -1;
  for (let y = 0; y < grid; y++) for (let x = 0; x < grid; x++) if (m[y * grid + x]){ if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  return x1 < 0 ? null : [x0, y0, x1, y1];
}

// glyph (target) vs ink → { score 0..100, passed, recall, precision, tip }
export function compareShape(glyph, ink, { grid = GRID, tol = 4, pass = PASS } = {}){
  const g = count(glyph), k = count(ink);
  if (!g) return { score: 0, passed: false, recall: 0, precision: 0, tip: "no_target" };
  if (!k) return { score: 0, passed: false, recall: 0, precision: 0, tip: "empty" };
  const recall = overlap(glyph, dilate(ink, tol, grid)) / g;
  const precision = overlap(ink, dilate(glyph, tol, grid)) / k;
  // the weaker of the two decides: a letter missing its tail (ບ for ປ, ດ for ຕ) loses as much as one with extra lines.
  // 75 % or less is not the letter; 97 % or more is full marks (the tolerance already forgives position and wobble).
  const m = Math.min(recall, precision);
  const score = Math.round(100 * Math.max(0, Math.min(1, (m - 0.75) / 0.22)));
  const gb = bboxOf(glyph, grid), kb = bboxOf(ink, grid);
  const size = gb && kb ? ((kb[2] - kb[0] + 1) * (kb[3] - kb[1] + 1)) / ((gb[2] - gb[0] + 1) * (gb[3] - gb[1] + 1)) : 1;
  const tip = score >= 90 ? "great" : size < 0.45 ? "too_small" : size > 2.2 ? "too_big" : recall < 0.9 && recall <= precision ? "missing" : precision < 0.9 ? "extra" : score >= pass ? "good" : "shape";
  return { score, passed: score >= pass, recall: r3(recall), precision: r3(precision), size: r3(size), tip };
}
const r3 = x => Math.round(x * 1000) / 1000;

export const FONT = "'Noto Sans Lao', 'Phetsarath OT', 'Saysettha OT', sans-serif";
export const SCALE = 0.62;              // letter size as a share of the cell width
// Draws `text` into a cell of width w and height h (pixels) on a 2D context: the guide on screen and the target of
// the check are drawn by this one function, so they always line up.
export function drawGlyph(ctx, text, w, h, { x = 0, y = 0, font = FONT, scale = SCALE, color = "#000" } = {}){
  ctx.save(); ctx.fillStyle = color; ctx.textAlign = "center"; ctx.textBaseline = "middle";
  ctx.font = `${Math.round(w * scale)}px ${font}`;
  ctx.fillText(text, x + w / 2, y + h / 2);
  ctx.restore();
}
// The target as the Lao font draws it, in the same grid as inkMask (browser only). aspect = cell height / width.
export function glyphMask(text, { grid = GRID, font = FONT, scale = SCALE, aspect = 1 } = {}){
  const W = 256, H = Math.round(256 * aspect);
  const c = typeof OffscreenCanvas !== "undefined" ? new OffscreenCanvas(W, H) : Object.assign(document.createElement("canvas"), { width: W, height: H });
  const ctx = c.getContext("2d", { willReadFrequently: true });
  drawGlyph(ctx, text, W, H, { font, scale });
  const d = ctx.getImageData(0, 0, W, H).data, m = new Uint8Array(grid * grid);
  // each grid cell takes the pixels it covers (the cell's x and y are scaled separately, like the ink)
  for (let gy = 0; gy < grid; gy++) for (let gx = 0; gx < grid; gx++){
    const x0 = Math.floor(gx * W / grid), x1 = Math.floor((gx + 1) * W / grid), y0 = Math.floor(gy * H / grid), y1 = Math.floor((gy + 1) * H / grid);
    let on = 0, all = 0;
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++){ all++; if (d[(y * W + x) * 4 + 3] > 90) on++; }
    m[gy * grid + gx] = all && on / all > 0.3 ? 1 : 0;
  }
  return m;
}
