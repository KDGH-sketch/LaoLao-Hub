// Admin stroke editor for Lao handwriting characters. Wired into the "characters" content editor
// (js/admin/cms.js renderField, type:"strokes") as one more field, next to the existing metadata
// fields -- not a separate top-level menu, since strokes are intrinsic to a character record.
//
// Authors structured, normalized [0,1] stroke data (see js/shared/handwriting-engine.js) by letting
// the admin draw each stroke with Pointer Events on a canvas. The same data drives both the
// learner's "Show Stroke Order" animation (replayed, not a separate GIF) and recognition scoring,
// so they can never go out of sync. Also includes a Preview/Test panel (Phase 19 of the spec): the
// admin can draw the character themselves and see the exact score a learner would get, using the
// same scoring engine, before publishing.
import { h, icon, toast } from "../shared/ui.js";
import { t } from "../shared/i18n.js";
import { scoreAttempt, feedbackFor } from "../shared/handwriting-engine.js";

const COLORS = ["#0284C7", "#059669", "#D97706", "#E11D48", "#7C3AED", "#0D9488"];
const clamp01 = x => Math.max(0, Math.min(1, x));

function makeCanvas(size, char){
  const canvas = h("canvas",{width:size,height:size,style:`width:${size}px;height:${size}px;touch-action:none;cursor:crosshair;border:2px solid var(--line);border-radius:12px;background:#fff`});
  const ctx = canvas.getContext("2d");
  const drawGrid = () => {
    ctx.save();
    ctx.strokeStyle = "#e2e8f0"; ctx.lineWidth = 1; ctx.setLineDash([4,4]);
    ctx.beginPath(); ctx.moveTo(size/2,0); ctx.lineTo(size/2,size); ctx.moveTo(0,size/2); ctx.lineTo(size,size/2); ctx.stroke();
    ctx.setLineDash([]);
    ctx.strokeStyle = "#f1f5f9"; ctx.strokeRect(1,1,size-2,size-2);
    ctx.restore();
  };
  const drawGlyph = () => {
    if (!char) return;
    ctx.save();
    ctx.font = `bold ${Math.round(size*0.6)}px "Noto Sans Lao", sans-serif`;
    ctx.fillStyle = "rgba(2,132,199,.14)"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillText(char, size/2, size/2 + size*0.04);
    ctx.restore();
  };
  const drawStroke = (points, color, withLabel, label) => {
    if (!points || points.length < 2) return;
    ctx.save();
    ctx.strokeStyle = color; ctx.lineWidth = Math.max(3, size*0.03); ctx.lineCap = "round"; ctx.lineJoin = "round";
    ctx.beginPath();
    points.forEach((p,i) => { const x=p.x*size, y=p.y*size; i===0 ? ctx.moveTo(x,y) : ctx.lineTo(x,y); });
    ctx.stroke();
    if (withLabel){
      const p0 = points[0];
      ctx.fillStyle = color; ctx.beginPath(); ctx.arc(p0.x*size, p0.y*size, size*0.035, 0, Math.PI*2); ctx.fill();
      ctx.fillStyle = "#fff"; ctx.font = `bold ${Math.round(size*0.045)}px sans-serif`; ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.fillText(String(label), p0.x*size, p0.y*size);
    }
    ctx.restore();
  };
  const redraw = (strokes, live) => {
    ctx.clearRect(0,0,size,size);
    drawGrid(); drawGlyph();
    (strokes||[]).forEach((s,i) => drawStroke(s.points, COLORS[i % COLORS.length], true, i+1));
    if (live) drawStroke(live, "#0284C7", false);
  };
  return { canvas, ctx, redraw, toNorm: (clientX, clientY) => { const r = canvas.getBoundingClientRect(); return { x: clamp01((clientX-r.left)/r.width), y: clamp01((clientY-r.top)/r.height) }; } };
}

// The admin stroke editor itself. `obj` is the character draft doc; strokes are edited in place on
// obj.strokes so the normal save flow (viewEditor's save()) picks them up like any other field.
export function strokeEditorField(obj){
  obj.strokes = Array.isArray(obj.strokes) ? obj.strokes : [];
  const SIZE = 280;
  const cv = makeCanvas(SIZE, obj.char);
  let liveStroke = null;

  const countLabel = h("span",{class:"small muted"});
  const syncCount = () => { obj.strokeCount = obj.strokes.length; countLabel.textContent = obj.strokes.length + " " + (obj.strokes.length===1 ? "stroke" : "strokes"); };

  const redraw = () => { cv.redraw(obj.strokes, liveStroke); syncCount(); };

  cv.canvas.addEventListener("pointerdown", e => {
    e.preventDefault();
    try { cv.canvas.setPointerCapture(e.pointerId); } catch(err){ /* capture is a nice-to-have; drawing still works without it */ }
    liveStroke = [cv.toNorm(e.clientX, e.clientY)];
  });
  cv.canvas.addEventListener("pointermove", e => {
    if (!liveStroke) return;
    liveStroke.push(cv.toNorm(e.clientX, e.clientY));
    cv.redraw(obj.strokes, liveStroke);
  });
  const endStroke = () => {
    if (liveStroke && liveStroke.length > 1){
      obj.strokes.push({ order: obj.strokes.length+1, points: liveStroke, start: liveStroke[0], end: liveStroke[liveStroke.length-1] });
    }
    liveStroke = null; redraw();
  };
  cv.canvas.addEventListener("pointerup", endStroke);
  cv.canvas.addEventListener("pointercancel", () => { liveStroke = null; redraw(); });

  const list = h("div",{class:"stack",style:"gap:4px"});
  const drawList = () => {
    list.innerHTML = "";
    obj.strokes.forEach((s,i) => {
      list.append(h("div",{class:"row",style:"gap:6px;align-items:center;padding:4px 8px;border-radius:8px;background:var(--surface-2)"},
        h("span",{style:`width:18px;height:18px;border-radius:50%;background:${COLORS[i%COLORS.length]};color:#fff;font-size:.7rem;display:flex;align-items:center;justify-content:center;font-weight:700`}, i+1),
        h("span",{class:"small",style:"flex:1"}, (s.points||[]).length + " pts"),
        h("button",{class:"ib",type:"button","aria-label":t("move_up"),disabled:i===0,onclick:()=>{ [obj.strokes[i-1],obj.strokes[i]]=[obj.strokes[i],obj.strokes[i-1]]; obj.strokes.forEach((x,k)=>x.order=k+1); redraw(); drawList(); }}, icon("up")),
        h("button",{class:"ib",type:"button","aria-label":t("move_down"),disabled:i===obj.strokes.length-1,onclick:()=>{ [obj.strokes[i+1],obj.strokes[i]]=[obj.strokes[i],obj.strokes[i+1]]; obj.strokes.forEach((x,k)=>x.order=k+1); redraw(); drawList(); }}, icon("down")),
        h("button",{class:"ib",type:"button","aria-label":t("remove"),onclick:()=>{ obj.strokes.splice(i,1); obj.strokes.forEach((x,k)=>x.order=k+1); redraw(); drawList(); }}, icon("trash"))));
    });
    if (!obj.strokes.length) list.append(h("p",{class:"small muted"}, "Draw on the grid above to record the first stroke."));
  };

  let playing = false;
  const playAnimation = async () => {
    if (playing || !obj.strokes.length) return;
    playing = true;
    for (let i=0;i<obj.strokes.length;i++){
      const partial = obj.strokes.slice(0,i);
      const pts = obj.strokes[i].points;
      for (let k=2;k<=pts.length;k+=Math.max(1,Math.floor(pts.length/24))){
        cv.redraw(partial, pts.slice(0,k));
        await new Promise(r=>setTimeout(r,16));
      }
      cv.redraw(obj.strokes.slice(0,i+1));
      await new Promise(r=>setTimeout(r,250));
    }
    playing = false;
  };

  redraw(); drawList();

  const controls = h("div",{class:"row",style:"gap:8px;flex-wrap:wrap"},
    h("button",{class:"btn sm ghost",type:"button",onclick:()=>{ if (obj.strokes.length){ obj.strokes.pop(); redraw(); drawList(); } }}, icon("left"), "Undo last stroke"),
    h("button",{class:"btn sm ghost",type:"button",onclick:()=>{ obj.strokes.length=0; redraw(); drawList(); }}, icon("x"), t("clear")),
    h("button",{class:"btn sm",type:"button",onclick:playAnimation}, icon("play"), "Preview animation"),
    countLabel);

  return h("div",{class:"stack",style:"gap:10px"},
    h("p",{class:"small muted"}, "Draw each stroke in the order a learner should write it. Each mouse/touch/pen gesture becomes one stroke. Coordinates are stored normalized (0-1), so this works at any canvas size."),
    cv.canvas, controls, list,
    testPanel(obj));
}

// Preview/Test (spec Phase 19): the admin draws the character and sees the exact engine score a
// learner would get, using the strokes just authored above -- before publishing.
function testPanel(obj){
  const SIZE = 220;
  const cv = makeCanvas(SIZE, obj.char);
  let strokes = [], live = null;
  const result = h("div",{class:"stack",style:"gap:4px"});

  cv.canvas.addEventListener("pointerdown", e => { e.preventDefault(); try { cv.canvas.setPointerCapture(e.pointerId); } catch(err){} live = [cv.toNorm(e.clientX,e.clientY)]; });
  cv.canvas.addEventListener("pointermove", e => { if (!live) return; live.push(cv.toNorm(e.clientX,e.clientY)); cv.redraw(strokes, live); });
  cv.canvas.addEventListener("pointerup", () => {
    if (live && live.length>1) strokes.push({ points: live });
    live = null; cv.redraw(strokes);
  });

  const runScore = () => {
    if (!obj.strokes || !obj.strokes.length){ toast("Draw and save strokes above first", "err"); return; }
    const r = scoreAttempt(strokes, obj.strokes);
    const fb = feedbackFor(r, "en");
    result.innerHTML = "";
    result.append(
      h("div",{class:"row",style:"gap:10px;align-items:baseline"}, h("b",{style:"font-size:1.4rem"}, r.total), h("span",{class:"small muted"},"/ 100" + (r.passed ? " · pass" : " · below pass mark")),
        h("span",{class:"small muted"}, `order ${r.components.order} · direction ${r.components.direction} · path ${r.components.path} · start ${r.components.start} · end ${r.components.end}`)),
      h("div",{class:"stack",style:"gap:2px"}, fb.map(f => h("p",{class:"small",style:`color:${f.kind==="ok"?"var(--jade)":f.kind==="bad"?"var(--bad)":"var(--warn)"}`}, f.text))));
  };

  return h("details",{class:"panel",style:"padding:14px"},
    h("summary",null, h("b",null,"Preview / Test this character")),
    h("p",{class:"small muted",style:"margin-top:8px"},"Draw the character yourself to see the score a learner would get against the strokes you just saved."),
    h("div",{class:"row",style:"gap:16px;align-items:flex-start;flex-wrap:wrap;margin-top:8px"},
      h("div",{class:"stack",style:"gap:8px"}, cv.canvas,
        h("div",{class:"row",style:"gap:8px"},
          h("button",{class:"btn sm ghost",type:"button",onclick:()=>{ strokes=[]; live=null; cv.redraw([]); result.innerHTML=""; }}, icon("x"), t("clear")),
          h("button",{class:"btn sm primary",type:"button",onclick:runScore}, icon("check"), "Score my attempt"))),
      h("div",{style:"flex:1;min-width:220px"}, result)));
}
