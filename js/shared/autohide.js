// Phones and tablets: the top bar slides away while you scroll down (more room for the lesson or the video) and comes
// back as soon as you scroll up. Anything pinned while scrolling (the video player, the grammar steps) sits right under
// the bar through the CSS variable --sticky-top, so it is never covered: --tb-h is the bar's real height (measured,
// it changes with the window and the language), and html.tb-hide sets --sticky-top to 0 while the bar is away.
// Call autoHideTopbar() after the app draws its shell. CSS: "auto-hiding top bar" in css/app.css.
const SMALL = "(max-width:900px)";
let lastY = 0, ticking = false, ro = null, installed = false;

function measure(){
  const bar = document.querySelector(".topbar");
  document.documentElement.style.setProperty("--tb-h", (bar ? Math.round(bar.getBoundingClientRect().height) : 0) + "px");
}
// the bar stays while the reader is near the top, typing in it, or using a menu that hangs from it
function mustShow(y){
  if (!matchMedia(SMALL).matches || y < 80) return true;
  const a = document.activeElement;
  if (a && a.closest && a.closest(".topbar")) return true;
  return !!document.querySelector(".topbar .search-pop:not([hidden]), .pmenu:not(.out), .sheet:not(.out), .dialog:not(.out)");
}
// iPad / iPhone Safari report the "rubber band" bounce past the top or the bottom of the page as scrolling: past the
// end y keeps growing, then shrinks as the page springs back — which read as "scrolling up" and slid the bar in and
// out during the bounce. Only scrolling inside the page counts: a position past either end is ignored.
const maxY = () => Math.max(0, (document.documentElement.scrollHeight || 0) - window.innerHeight);
export const inBounce = (y, max) => y < 0 || y > max + 1;
function update(){
  ticking = false;
  const root = document.documentElement, raw = window.scrollY, max = maxY();
  if (inBounce(raw, max)) return;
  const y = Math.max(0, Math.min(raw, max));
  if (mustShow(y)) root.classList.remove("tb-hide");
  else if (y > lastY + 6) root.classList.add("tb-hide");          // a little dead zone: no flicker on tiny moves
  else if (y < lastY - 6) root.classList.remove("tb-hide");
  lastY = y;
}
export function autoHideTopbar(){
  if (!installed){
    installed = true;
    addEventListener("scroll", () => { if (!ticking){ ticking = true; requestAnimationFrame(update); } }, { passive: true });
    addEventListener("resize", measure, { passive: true });
  }
  if (ro) ro.disconnect();
  const bar = document.querySelector(".topbar");
  if (bar && typeof ResizeObserver === "function"){ ro = new ResizeObserver(measure); ro.observe(bar); }
  measure();
  document.documentElement.classList.remove("tb-hide");
  lastY = window.scrollY;
}
// for a page that wants the bar back (e.g. after jumping to the top)
export const showTopbar = () => document.documentElement.classList.remove("tb-hide");
