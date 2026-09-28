// Lao authentic symbols, Dok Champa SVG, and animated waiting screen components
import { h } from "./ui.js";
import { speak } from "./speech.js";

export const LAO_SAMPLES = [
  { char: "ກ", name: "Kai", meaning: "Chicken", ipa: "k" },
  { char: "ຂ", name: "Khai", meaning: "Egg", ipa: "kh" },
  { char: "ງ", name: "Ngua", meaning: "Ox", ipa: "ng" },
  { char: "ຈ", name: "Chork", meaning: "Glass", ipa: "ch" },
  { char: "ດ", name: "Dek", meaning: "Child", ipa: "d" },
  { char: "ນ", name: "Nok", meaning: "Bird", ipa: "n" },
  { char: "ລ", name: "Ling", meaning: "Monkey", ipa: "l" },
  { char: "ສ", name: "Seua", meaning: "Tiger", ipa: "s" },
  { char: "ຮ", name: "Huan", meaning: "House", ipa: "h" }
];

export function dokChampaSvg(size=120){
  const el = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  el.setAttribute("class", "champa-svg");
  el.setAttribute("viewBox", "0 0 200 200");
  el.setAttribute("width", String(size));
  el.setAttribute("height", String(size));
  el.innerHTML = `
    <defs>
      <radialGradient id="champaYellowCore" cx="50%" cy="50%" r="50%">
        <stop offset="0%" stop-color="#F59E0B" />
        <stop offset="40%" stop-color="#FBBF24" />
        <stop offset="70%" stop-color="#FEF08A" stop-opacity="0.9" />
        <stop offset="100%" stop-color="#FFFFFF" stop-opacity="0" />
      </radialGradient>
      <linearGradient id="champaPetalGrad" x1="0%" y1="100%" x2="0%" y2="0%">
        <stop offset="0%" stop-color="#FEF3C7" />
        <stop offset="35%" stop-color="#FFFFFF" />
        <stop offset="100%" stop-color="#FFFFFF" />
      </linearGradient>
      <filter id="champaSoftGlow" x="-20%" y="-20%" width="140%" height="140%">
        <feDropShadow dx="0" dy="4" stdDeviation="6" flood-color="#0284C7" flood-opacity="0.3" />
      </filter>
    </defs>
    <g filter="url(#champaSoftGlow)" transform="translate(100, 100)">
      <!-- 5 Sacred Dok Champa Petals (Rotated 72 deg each) -->
      <path d="M 0,-15 C -24,-34 -34,-74 0,-92 C 34,-74 24,-34 0,-15 Z" fill="url(#champaPetalGrad)" stroke="#BAE6FD" stroke-width="1.2" transform="rotate(0)" />
      <path d="M 0,-15 C -24,-34 -34,-74 0,-92 C 34,-74 24,-34 0,-15 Z" fill="url(#champaPetalGrad)" stroke="#BAE6FD" stroke-width="1.2" transform="rotate(72)" />
      <path d="M 0,-15 C -24,-34 -34,-74 0,-92 C 34,-74 24,-34 0,-15 Z" fill="url(#champaPetalGrad)" stroke="#BAE6FD" stroke-width="1.2" transform="rotate(144)" />
      <path d="M 0,-15 C -24,-34 -34,-74 0,-92 C 34,-74 24,-34 0,-15 Z" fill="url(#champaPetalGrad)" stroke="#BAE6FD" stroke-width="1.2" transform="rotate(216)" />
      <path d="M 0,-15 C -24,-34 -34,-74 0,-92 C 34,-74 24,-34 0,-15 Z" fill="url(#champaPetalGrad)" stroke="#BAE6FD" stroke-width="1.2" transform="rotate(288)" />
      <!-- Golden Solar Core (ດອກຈຳປາ stamen) -->
      <circle cx="0" cy="0" r="32" fill="url(#champaYellowCore)" />
      <circle cx="0" cy="0" r="14" fill="#D97706" fill-opacity="0.25" />
      <!-- Central Lao Character 'ລ' -->
      <text x="0" y="8" font-family="'Noto Sans Lao', 'Phetsarath OT', sans-serif" font-size="22" font-weight="700" fill="#B45309" text-anchor="middle">ລ</text>
    </g>
  `;
  return el;
}

export function createWaitingScreen(title="ສະບາຍດີ", sub="ກຳລັງຕຽມຄວາມພ້ອມ... / Preparing your learning journey..."){
  const wrap = h("div", { class: "waiting-screen" });

  // Floating background ambient Lao glyphs
  const glyphs = ["ກ", "ດ", "ນ", "ສ", "ລ", "ຮ"];
  const floatCont = h("div", { class: "floating-elements" });
  glyphs.forEach(g => {
    floatCont.appendChild(h("div", { class: "float-glyph" }, g));
  });
  wrap.appendChild(floatCont);

  // Center card with Dok Champa & Mekong Shimmer
  const card = h("div", { class: "waiting-card" });
  const champaWrap = h("div", { class: "champa-wrap" },
    h("div", { class: "champa-halo" }),
    dokChampaSvg(110)
  );

  const head = h("h1", { class: "lao-sabaidee" }, title);
  const subEl = h("p", { class: "waiting-sub" }, "LaoLao · ຮຽນພາສາລາວ");
  const noteEl = h("p", { class: "waiting-note" }, sub);

  const mekong = h("div", { class: "mekong-stream" },
    h("div", { class: "mekong-shimmer" })
  );

  card.append(champaWrap, head, subEl, noteEl, mekong);
  wrap.appendChild(card);
  return wrap;
}
