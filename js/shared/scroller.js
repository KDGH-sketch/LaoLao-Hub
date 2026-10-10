// Which element scrolls the app. On iPhone and iPad the page itself must not scroll: Safari lets a scrolled page
// overshoot ("rubber band") past its end and moves the pinned bars with it (the tab bar rose to the middle of the
// screen, the side menu stopped short, an empty band showed underneath), and it ignores overscroll-behavior for the page.
// So on iOS / iPadOS the app is a frame: it fills the screen and only the app area (#root > .app) scrolls, with its
// bounce switched off (CSS "app frame" in css/app.css, html.ios). Everywhere else the page scrolls as usual.
// Code that reads or sets the scroll position goes through here: scrollPos(), scrollToTop(), maxScroll(), onScroll().
// Tests force the frame with window.__FORCE_FRAME__ (scripts/lib/demo-server.mjs, LAOLAO_FRAME=1).

const doc = () => document.documentElement;
// iPhone / iPod / iPad, including iPadOS that reports itself as a Mac (a Mac has no touch screen)
export function isIOS(){
  if (typeof navigator === "undefined") return false;
  const p = navigator.platform || "", ua = navigator.userAgent || "";
  return /iP(hone|od|ad)/.test(p) || /iP(hone|od|ad)/.test(ua) || (p === "MacIntel" && navigator.maxTouchPoints > 1);
}
export function setupFrame(){
  if (typeof document === "undefined") return;
  const on = (typeof window !== "undefined" && window.__FORCE_FRAME__) || isIOS();
  doc().classList.toggle("ios", !!on);
  if (on && !measuring){ measuring = true; addEventListener("resize", measureFrame, { passive: true }); }
}
let measuring = false;
// the side menu is as tall as the app area (CSS var --frame-h); call after the shell is drawn
export function measureFrame(){
  if (!frameOn()) return;
  doc().style.setProperty("--frame-h", frameEl().clientHeight + "px");
}
const frameEl = () => document.querySelector("#root > .app");
// true while the app is shown in frame mode (the CSS makes .app the scrolling element)
export function frameOn(){
  if (typeof document === "undefined" || !doc().classList.contains("ios")) return false;
  const app = frameEl(); if (!app) return false;
  const oy = getComputedStyle(app).overflowY;
  return oy === "auto" || oy === "scroll";
}
export const scroller = () => frameOn() ? frameEl() : (document.scrollingElement || doc());
export const scrollPos = () => frameOn() ? frameEl().scrollTop : window.scrollY;
export const viewHeight = () => frameOn() ? frameEl().clientHeight : window.innerHeight;
export const maxScroll = () => { const s = scroller(); return Math.max(0, s.scrollHeight - viewHeight()); };
export function scrollToTop(opts = {}){ const top = opts.top || 0; if (frameOn()) frameEl().scrollTo(Object.assign({ top }, opts.behavior ? { behavior: opts.behavior } : {})); else window.scrollTo(Object.assign({ top }, opts.behavior ? { behavior: opts.behavior } : {})); }
// scroll of the page or of the app area (not of the lists, menus and tab strips inside it)
export function onScroll(fn){
  const h = e => { const t = e.target; if (t === document || t === doc() || t === document.body || t === frameEl()) fn(e); };
  document.addEventListener("scroll", h, { capture: true, passive: true });
  return () => document.removeEventListener("scroll", h, { capture: true });
}
