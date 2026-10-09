// Which plan feature a Practice Studio set needs (practice.basic or practice.advanced), from its id alone. Kept apart from
// js/shared/practice-library.js so the router and the lock badges do not load the whole practice bank at start-up.
export const ADV_MODES = new Set(["talk","say","spell","grammar","pattern","dialogue","rules","hear","write","marks"]);
export const setFeature = id => { const m = String(id || "").split(":"); const mode = m[0] === "th" ? m[2] : m[0] === "gr" ? m[2] : { gm:"grammar", tn:m[1], sc:m[1], pt:"pattern", dl:"dialogue", vt:"teacher" }[m[0]];
  return ADV_MODES.has(mode) || (m[0] === "tn" && ADV_MODES.has(m[1])) ? "practice.advanced" : "practice.basic"; };
