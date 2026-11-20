// Pull a bottom sheet down to close it (phones), the way native sheets behave:
//   - from its header or handle (handle(target) says which parts) at any time;
//   - from anywhere else in the sheet when its content is scrolled to the top (pulling further down closes instead of
//     bouncing);
//   - the sheet follows the finger and fades a little; it closes past 90 px or on a quick downward flick, otherwise it
//     springs back. Pulling up scrolls the content as usual.
// Touch events with a non-passive touchmove, so the browser does not turn the gesture into a scroll and cancel it
// (which is why a pointer-events drag on a small handle did nothing on phones).
export function sheetDrag(panel, { onClose, handle = () => false, scroller = () => panel, enabled = () => matchMedia("(max-width: 35.99rem)").matches } = {}){
  let y0 = null, t0 = 0, dy = 0, fromHandle = false, dragging = false;
  const reset = () => { panel.style.transition = ""; panel.style.translate = ""; panel.style.opacity = ""; };
  panel.addEventListener("touchstart", e => {
    if (!enabled() || e.touches.length !== 1) return;
    fromHandle = !!handle(e.target);
    const sc = scroller();
    if (!fromHandle && sc && sc.scrollTop > 0) return;                    // reading further down: a normal scroll
    y0 = e.touches[0].clientY; t0 = Date.now(); dy = 0; dragging = false;
  }, { passive: true });
  panel.addEventListener("touchmove", e => {
    if (y0 == null) return;
    dy = e.touches[0].clientY - y0;
    const sc = scroller();
    if (!dragging){
      if (dy < -6 && !fromHandle){ y0 = null; return; }                    // pulling up: let the content scroll
      if (dy < 6) return;
      if (!fromHandle && sc && sc.scrollTop > 0){ y0 = null; return; }
      dragging = true; panel.style.transition = "none";
    }
    if (e.cancelable) e.preventDefault();
    const d = Math.max(0, dy);
    panel.style.translate = "0 " + d + "px";
    panel.style.opacity = String(Math.max(.55, 1 - d / 700));
  }, { passive: false });
  const end = () => {
    if (y0 == null) return;
    const fast = dy > 40 && Date.now() - t0 < 260, far = dy > 90, was = dragging;
    y0 = null; dragging = false;
    if (was && (far || fast)){ panel.style.transition = "translate .2s ease-in, opacity .2s"; panel.style.translate = "0 100%"; panel.style.opacity = "0";
      setTimeout(() => { onClose && onClose({ instant: true }); requestAnimationFrame(reset); }, 190); }   // already slid away: close without a second animation
    else reset();
  };
  panel.addEventListener("touchend", end);
  panel.addEventListener("touchcancel", end);
}
