// The side menu of the learner app and the admin: sections that fold open and closed (remembered per device; the
// section of the open page always opens), a slim icon-only rail for tablets and small laptops, the open page kept in
// view (the menu is built once and keeps its scroll position), and "Find a page" (Ctrl / ⌘ K): type a few letters to
// jump anywhere, with the pages visited last at the top. Tests: scripts/e2e_nav.mjs.
import { h, icon } from "./ui.js";

const store = {
  get(k, d){ try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch(e){ return d; } },
  set(k, v){ try { localStorage.setItem(k, JSON.stringify(v)); } catch(e){} }
};
const norm = s => String(s || "").toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "");

// sections: [{ key, title, items: [{ key, label, icon, extra?: () => Node|null, href?, cls? }] }]
// onGo(item), texts: { find, rail, expand, recent, none, hint }
export function createSideNav({ sections, storageKey, brand = null, footer = [], onGo, texts, ariaLabel = "Main" }){
  const K = { closed: storageKey + ".closed", rail: storageKey + ".rail", recent: storageKey + ".recent" };
  const closed = new Set(store.get(K.closed, []));
  let active = null;
  const btnOf = new Map(), secOf = new Map(), secEls = new Map();
  const findBtn = h("button",{class:"sn-find",type:"button","aria-keyshortcuts":"Control+K Meta+K",title:texts.find + " (Ctrl K)",onclick:() => openPalette()},
    icon("search"), h("span",{class:"sn-lbl"}, texts.find), h("kbd",{class:"sn-kbd"}, /Mac|iPhone|iPad/.test(navigator.platform || "") ? "⌘K" : "Ctrl K"));
  const nav = h("nav",{class:"side sn","aria-label":ariaLabel}, brand, findBtn);
  for (const sec of sections){
    if (!sec.items.length) continue;
    const list = h("div",{class:"sn-items",role:"group"}, h("div",{class:"sn-inner"}, sec.items.map(it => {
      const b = it.href ? h("a",{class:"nav-btn" + (it.cls ? " " + it.cls : ""),href:it.href,title:it.label}, icon(it.icon), h("span",{class:"sn-lbl"}, it.label))
        : h("button",{class:"nav-btn" + (it.cls ? " " + it.cls : ""),type:"button",title:it.label,"data-key":it.key,onclick:() => onGo(it)}, icon(it.icon), h("span",{class:"sn-lbl"}, it.label), h("span",{class:"sn-extra"}, it.extra ? it.extra() : null));
      btnOf.set(it.key, b); secOf.set(it.key, sec.key); return b; })));
    const head = h("button",{class:"sn-head",type:"button","aria-expanded":String(!closed.has(sec.key)),onclick:() => toggle(sec.key)},
      h("span",{class:"sn-lbl"}, sec.title), icon("down","sn-chev"));
    const el = h("div",{class:"sn-sec" + (closed.has(sec.key) ? " closed" : ""),"data-sec":sec.key}, head, list);
    secEls.set(sec.key, el); nav.append(el);
  }
  const railBtn = h("button",{class:"sn-rail-btn",type:"button","aria-pressed":String(!!store.get(K.rail, false)),title:texts.rail,onclick:() => setRail(!document.documentElement.classList.contains("sn-rail"))},
    icon("left","sn-rail-ic"), h("span",{class:"sn-lbl"}, texts.rail));
  nav.append(...footer.filter(Boolean), railBtn);

  function toggle(key, open){
    const el = secEls.get(key); if (!el) return;
    const willOpen = open ?? el.classList.contains("closed");
    el.classList.toggle("closed", !willOpen); el.querySelector(".sn-head").setAttribute("aria-expanded", String(willOpen));
    if (willOpen) closed.delete(key); else closed.add(key);
    store.set(K.closed, [...closed]);
  }
  function setRail(on){
    document.documentElement.classList.toggle("sn-rail", on); railBtn.setAttribute("aria-pressed", String(on));
    railBtn.title = on ? texts.expand : texts.rail; railBtn.querySelector(".sn-lbl").textContent = on ? texts.expand : texts.rail;
    store.set(K.rail, on);
  }
  setRail(!!store.get(K.rail, false));
  // the open page: highlighted, its section open, scrolled into view inside the menu (the page itself does not move)
  function setActive(key){
    if (active === key){ keepInView(); return; }
    if (active && btnOf.get(active)){ const o = btnOf.get(active); o.removeAttribute("aria-current"); const ind = o.querySelector(".nav-ind"); if (ind) ind.remove(); }
    active = key; const b = btnOf.get(key);
    if (b){ b.setAttribute("aria-current", "page"); b.prepend(h("span",{class:"nav-ind","aria-hidden":"true"}));
      const sk = secOf.get(key); if (sk && secEls.get(sk).classList.contains("closed")) toggle(sk, true);
      const rec = store.get(K.recent, []).filter(x => x !== key); rec.unshift(key); store.set(K.recent, rec.slice(0, 6)); }
    keepInView();
  }
  function keepInView(){
    const b = active && btnOf.get(active); if (!b || !nav.isConnected) return;
    requestAnimationFrame(() => { const nr = nav.getBoundingClientRect(), br = b.getBoundingClientRect(), pad = 12;
      if (br.top < nr.top + pad) nav.scrollTop -= (nr.top + pad) - br.top; else if (br.bottom > nr.bottom - pad) nav.scrollTop += br.bottom - (nr.bottom - pad); });
  }
  // refresh the badges / locks (e.g. the number of reviews due)
  function refresh(){ for (const sec of sections) for (const it of sec.items) if (it.extra){ const b = btnOf.get(it.key); const slot = b && b.querySelector(".sn-extra"); if (slot) slot.replaceChildren(...[it.extra()].filter(Boolean)); } }

  // ---------- Find a page ----------
  function openPalette(){
    if (document.querySelector(".pal")) return;
    const all = sections.flatMap(sec => sec.items.filter(it => !it.href).map(it => Object.assign({ group: sec.title }, it)));
    const recentKeys = store.get(K.recent, []).filter(k => all.some(x => x.key === k));
    const input = h("input",{class:"pal-in",type:"search",autocomplete:"off",spellcheck:"false","aria-label":texts.find,placeholder:texts.find + "…","aria-controls":"pal-list","aria-activedescendant":""});
    const list = h("div",{class:"pal-list",id:"pal-list",role:"listbox"});
    let shown = [], sel = 0;
    const pick = it => { close(); onGo(it); };
    const draw = () => {
      const q = norm(input.value).trim(), words = q.split(/\s+/).filter(Boolean);
      if (!q){ const rec = recentKeys.map(k => all.find(x => x.key === k)).filter(Boolean); shown = [...rec, ...all.filter(x => !rec.includes(x))]; }
      else shown = all.map(x => { const hay = norm(x.label + " " + x.group + " " + (x.keywords || "") + " " + x.key); if (!words.every(w => hay.includes(w))) return null;
        const lab = norm(x.label); return { x, s: (lab.startsWith(words[0]) ? 0 : lab.includes(words[0]) ? 1 : 2) + lab.length / 100 }; }).filter(Boolean).sort((a, b) => a.s - b.s).map(o => o.x);
      sel = Math.min(sel, Math.max(0, shown.length - 1));
      list.replaceChildren(...(shown.length ? [] : [h("div",{class:"pal-none"}, texts.none)]),
        ...(!q && recentKeys.length ? [h("div",{class:"pal-sep"}, texts.recent)] : []),
        ...shown.map((x, i) => [
          !q && recentKeys.length && i === recentKeys.length ? h("div",{class:"pal-sep"}, texts.all) : null,
          h("button",{class:"pal-item",type:"button",role:"option",id:"pal-o" + i,"aria-selected":String(i === sel),onclick:() => pick(x),onmousemove:() => { if (sel !== i){ sel = i; mark(); } }},
            icon(x.icon), h("span",{class:"pal-l"}, x.label), h("small",null, x.group))]).flat().filter(Boolean));
      mark();
    };
    const mark = () => { list.querySelectorAll(".pal-item").forEach((b, i) => b.setAttribute("aria-selected", String(i === sel)));
      const cur = list.querySelector('[aria-selected="true"]'); input.setAttribute("aria-activedescendant", cur ? cur.id : ""); if (cur) cur.scrollIntoView({ block:"nearest" }); };
    input.addEventListener("input", () => { sel = 0; draw(); });
    input.addEventListener("keydown", e => {
      if (e.key === "ArrowDown" || e.key === "ArrowUp"){ e.preventDefault(); if (!shown.length) return; sel = (sel + (e.key === "ArrowDown" ? 1 : -1) + shown.length) % shown.length; mark(); }
      else if (e.key === "Enter"){ e.preventDefault(); if (shown[sel]) pick(shown[sel]); }
      else if (e.key === "Escape"){ e.preventDefault(); close(); }
    });
    const scrim = h("div",{class:"pal-scrim",onclick:() => close()});
    const box = h("div",{class:"pal",role:"dialog","aria-modal":"true","aria-label":texts.find}, h("div",{class:"pal-top"}, icon("search"), input, h("kbd",{class:"sn-kbd"},"Esc")), list, h("div",{class:"pal-hint"}, texts.hint));
    const back = document.activeElement;
    function close(){ scrim.remove(); box.remove(); if (back && back.focus && back.isConnected) back.focus({ preventScroll:true }); }
    document.body.append(scrim, box); draw(); input.focus();
  }
  return { el: nav, setActive, refresh, openPalette, toggle, setRail };
}

// Ctrl / ⌘ K opens "Find a page" of whichever menu is on screen (installed once per page)
let keyInstalled = false, current = null;
export function useShortcut(sn){
  current = sn;
  if (keyInstalled) return; keyInstalled = true;
  document.addEventListener("keydown", e => {
    if ((e.ctrlKey || e.metaKey) && !e.altKey && (e.key === "k" || e.key === "K")){ if (current && current.el.isConnected){ e.preventDefault(); current.openPalette(); } }
  });
}
