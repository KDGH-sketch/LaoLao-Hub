// Practice coach pieces shared by the learner's Practice Studio and the admin's learner page: the skill radar and the
// coach's advice as text (data from js/shared/practice-coach.js).
import { esc } from "./ui.js";
import { t } from "./i18n.js";

// skill radar: one axis per skill, the shape is the current score (skills not tried yet sit at the centre).
// The labels sit inside the drawing (a wide canvas leaves room for them on the left and right), and once the chart is
// on the page its frame is fitted to what was drawn, so long names in any language never spill out of the card.
export function radarSVG(profile, size = 300){
  const skillName = k => t("sk_" + k);
  const W = 480, H = 380, cx = W / 2, cy = H / 2 + 6, R = 118;
  const n = profile.length, pt = (i, v) => { const a = -Math.PI / 2 + i * 2 * Math.PI / n; return [cx + Math.cos(a) * R * v, cy + Math.sin(a) * R * v]; };
  const f = x => x.toFixed(1);
  const ring = v => profile.map((_, i) => pt(i, v).map(f).join(",")).join(" ");
  const area = profile.map((p, i) => pt(i, Math.max(0.04, (p.score || 0) / 100)).map(f).join(",")).join(" ");
  const s = document.createElementNS("http://www.w3.org/2000/svg","svg"); s.setAttribute("viewBox",`0 0 ${W} ${H}`); s.setAttribute("class","pz-radar"); s.setAttribute("role","img");
  s.setAttribute("preserveAspectRatio","xMidYMid meet"); s.style.maxWidth = Math.round(size * 1.45) + "px";
  s.setAttribute("aria-label", profile.map(p => skillName(p.skill) + " " + (p.score === null ? "—" : p.score + "%")).join(", "));
  s.innerHTML = [0.25, 0.5, 0.75, 1].map(v => `<polygon class="rd-ring" points="${ring(v)}"/>`).join("") +
    profile.map((_, i) => { const [x, y] = pt(i, 1); return `<line class="rd-axis" x1="${cx}" y1="${f(cy)}" x2="${f(x)}" y2="${f(y)}"/>`; }).join("") +
    `<polygon class="rd-area" points="${area}"/>` +
    profile.map((p, i) => { const [x, y] = pt(i, Math.max(0.04, (p.score || 0) / 100)); return p.score === null ? "" : `<circle class="rd-dot" cx="${f(x)}" cy="${f(y)}" r="4"/>`; }).join("") +
    profile.map((p, i) => { const [x, y] = pt(i, 1.13), anchor = Math.abs(x - cx) < 10 ? "middle" : x > cx ? "start" : "end";
      const top = y < cy - R * 0.9, ly = top ? y - 14 : y + 2;
      return `<text class="rd-label${p.score === null ? " none" : ""}" x="${f(x)}" y="${f(ly)}" text-anchor="${anchor}">${esc(skillName(p.skill))}</text>` +
        (p.score === null ? "" : `<text class="rd-val" x="${f(x)}" y="${f(ly + 16)}" text-anchor="${anchor}">${p.score}</text>`); }).join("");
  // fit the frame to the drawing (labels included) once it can be measured
  let tries = 0;
  const fit = () => { if (!s.isConnected){ if (++tries < 120) requestAnimationFrame(fit); return; }
    try { const b = s.getBBox(); if (!b.width) { if (++tries < 120) requestAnimationFrame(fit); return; }
      const pad = 6; s.setAttribute("viewBox", `${f(b.x - pad)} ${f(b.y - pad)} ${f(b.width + 2 * pad)} ${f(b.height + 2 * pad)}`); } catch(e){} };
  if (typeof requestAnimationFrame === "function") requestAnimationFrame(fit);
  return s;
}
// one piece of advice as a sentence
export const insightText = x => t("pz_in_" + x.kind, { s: x.skill ? t("sk_" + x.skill) : "", n: x.n, w: (x.words || []).slice(0, 3).join(", ") });
