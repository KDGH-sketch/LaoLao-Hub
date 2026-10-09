// Practice coach pieces shared by the learner's Practice Studio and the admin's learner page: the skill radar and the
// coach's advice as text (data from js/shared/practice-coach.js).
import { esc } from "./ui.js";
import { t } from "./i18n.js";

// skill radar: one axis per skill, the shape is the current score (skills not tried yet sit at the centre)
export function radarSVG(profile, size = 280){
  const skillName = k => t("sk_" + k);
  const n = profile.length, c = size / 2, R = c - 46, pt = (i, v) => { const a = -Math.PI / 2 + i * 2 * Math.PI / n; return [c + Math.cos(a) * R * v, c + Math.sin(a) * R * v]; };
  const ring = v => profile.map((_, i) => pt(i, v).map(x => x.toFixed(1)).join(",")).join(" ");
  const area = profile.map((p, i) => pt(i, Math.max(0.04, (p.score || 0) / 100)).map(x => x.toFixed(1)).join(",")).join(" ");
  const s = document.createElementNS("http://www.w3.org/2000/svg","svg"); s.setAttribute("viewBox",`0 0 ${size} ${size}`); s.setAttribute("class","pz-radar"); s.setAttribute("role","img");
  s.setAttribute("aria-label", profile.map(p => skillName(p.skill) + " " + (p.score === null ? "—" : p.score + "%")).join(", "));
  s.innerHTML = [0.25, 0.5, 0.75, 1].map(v => `<polygon class="rd-ring" points="${ring(v)}"/>`).join("") +
    profile.map((_, i) => { const [x, y] = pt(i, 1); return `<line class="rd-axis" x1="${c}" y1="${c}" x2="${x.toFixed(1)}" y2="${y.toFixed(1)}"/>`; }).join("") +
    `<polygon class="rd-area" points="${area}"/>` +
    profile.map((p, i) => { const [x, y] = pt(i, Math.max(0.04, (p.score || 0) / 100)); return p.score === null ? "" : `<circle class="rd-dot" cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="3.5"/>`; }).join("") +
    profile.map((p, i) => { const [x, y] = pt(i, 1.2), anchor = Math.abs(x - c) < 8 ? "middle" : x > c ? "start" : "end";
      return `<text class="rd-label${p.score === null ? " none" : ""}" x="${x.toFixed(1)}" y="${(y + 4).toFixed(1)}" text-anchor="${anchor}">${esc(skillName(p.skill))}</text>` +
        (p.score === null ? "" : `<text class="rd-val" x="${x.toFixed(1)}" y="${(y + 18).toFixed(1)}" text-anchor="${anchor}">${p.score}</text>`); }).join("");
  return s;
}
// one piece of advice as a sentence
export const insightText = x => t("pz_in_" + x.kind, { s: x.skill ? t("sk_" + x.skill) : "", n: x.n, w: (x.words || []).slice(0, 3).join(", ") });
