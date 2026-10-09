// No more "null" on screen. The browser's own insert functions (append, prepend, replaceChildren, before, after,
// replaceWith) turn null / undefined / false into the text "null" / "undefined" / "false": that is how the DOM
// standard defines them. The app writes optional parts as `condition ? element : null` everywhere; the h() helper
// skips those, but a direct `el.append(a, cond ? b : null, c)` printed "null" — and several in a row "nullnullnull".
// This module makes those six functions skip empty values too, once, for the whole app (learner, admin, welcome).
// Imported first by js/shared/ui.js, so it runs before anything is drawn. Tested by scripts/qa_null_text.mjs.
const keep = x => x !== null && x !== undefined && x !== false;
function guard(proto, name){
  const orig = proto && proto[name];
  if (typeof orig !== "function" || orig.__llKeepsEmpty) return;
  const safe = function(...nodes){ return orig.apply(this, nodes.some(n => !keep(n)) ? nodes.filter(keep) : nodes); };
  safe.__llKeepsEmpty = true;
  Object.defineProperty(proto, name, { value: safe, writable: true, configurable: true, enumerable: false });
}
if (typeof Element !== "undefined"){
  for (const P of [Element.prototype, Document.prototype, DocumentFragment.prototype]) for (const n of ["append", "prepend", "replaceChildren"]) guard(P, n);
  for (const P of [Element.prototype, CharacterData.prototype, DocumentType.prototype]) for (const n of ["before", "after", "replaceWith"]) guard(P, n);
}
export const DOM_GUARD = true;
