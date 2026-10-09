// Sound effects for learning moments: right / wrong answers, combo streaks, finishing a round, a perfect round,
// rank up, a new record, the daily goal, the last seconds of a timed round, placing a word tile, matching a pair.
// Made on the device with the Web Audio API (no files to download). Short and quiet on purpose, never on menus or
// navigation, and off when the learner turns them off (Account → Sound effects). Tests: scripts/test_sfx.mjs.
let ctx = null, master = null;
const S = { on: true, vol: 0.6 };
const last = {};
export function setSfx(o = {}){ if ("on" in o) S.on = !!o.on; if ("vol" in o && Number.isFinite(+o.vol)) S.vol = Math.max(0, Math.min(1, +o.vol)); if (master) master.gain.value = S.vol * 0.5; }
export const sfxState = () => Object.assign({}, S);

function audio(){
  if (ctx) return ctx;
  const AC = typeof window !== "undefined" && (window.AudioContext || window.webkitAudioContext); if (!AC) return null;
  try { ctx = new AC(); master = ctx.createGain(); master.gain.value = S.vol * 0.5; master.connect(ctx.destination); } catch(e){ ctx = null; }
  return ctx;
}
// one note: frequency (Hz) or [from, to] glide, start offset and length (s), wave, loudness
function note(c, f, at, len, { type = "sine", gain = 0.3, attack = 0.008 } = {}){
  const o = c.createOscillator(), g = c.createGain(), t0 = c.currentTime + at;
  o.type = type;
  if (Array.isArray(f)){ o.frequency.setValueAtTime(f[0], t0); o.frequency.exponentialRampToValueAtTime(f[1], t0 + len); } else o.frequency.setValueAtTime(f, t0);
  g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(gain, t0 + attack); g.gain.exponentialRampToValueAtTime(0.0001, t0 + len);
  o.connect(g); g.connect(master); o.start(t0); o.stop(t0 + len + 0.03);
}
const N = { C5:523.25, D5:587.33, E5:659.25, G5:783.99, A5:880, C6:1046.5, D6:1174.66, E6:1318.5, G6:1567.98, C7:2093 };
// the sounds: each a few notes (seconds from now)
export const SOUNDS = {
  tap:     c => note(c, 660, 0, 0.05, { gain:0.12 }),
  tile:    c => note(c, [520, 640], 0, 0.06, { type:"triangle", gain:0.16 }),
  match:   c => { note(c, N.E6, 0, 0.07, { gain:0.16 }); note(c, N.G6, 0.05, 0.09, { gain:0.14 }); },
  correct: c => { note(c, N.C6, 0, 0.09, { type:"triangle", gain:0.26 }); note(c, N.E6, 0.075, 0.16, { type:"triangle", gain:0.24 }); },
  wrong:   c => { note(c, [233, 185], 0, 0.22, { type:"triangle", gain:0.2 }); note(c, [175, 140], 0.09, 0.22, { type:"sine", gain:0.12 }); },
  combo:   c => [N.E6, N.G6, N.C7].forEach((f, i) => note(c, f, i * 0.055, 0.1, { type:"triangle", gain:0.16 })),
  complete:c => [N.C5, N.E5, N.G5, N.C6].forEach((f, i) => note(c, f, i * 0.09, 0.2, { type:"triangle", gain:0.22 })),
  fail:    c => { note(c, N.E5, 0, 0.18, { type:"triangle", gain:0.18 }); note(c, N.C5, 0.15, 0.3, { type:"triangle", gain:0.16 }); },
  perfect: c => { [N.C5, N.E5, N.G5, N.C6, N.E6].forEach((f, i) => note(c, f, i * 0.08, 0.22, { type:"triangle", gain:0.22 }));
                  [N.G6, N.C7, N.G6, N.C7].forEach((f, i) => note(c, f, 0.45 + i * 0.07, 0.12, { gain:0.08 })); },
  levelup: c => { [N.G5, N.C6, N.E6].forEach((f, i) => note(c, f, i * 0.1, 0.14, { type:"square", gain:0.07 })); note(c, N.G6, 0.3, 0.45, { type:"triangle", gain:0.22 }); note(c, N.C6, 0.3, 0.45, { type:"triangle", gain:0.12 }); },
  record:  c => { [N.C6, N.G5, N.C6, N.E6, N.G6].forEach((f, i) => note(c, f, i * 0.07, 0.13, { type:"triangle", gain:0.2 })); },
  goal:    c => { note(c, N.A5, 0, 0.35, { gain:0.18 }); note(c, N.E6, 0.12, 0.5, { gain:0.16 }); },
  tick:    c => note(c, 1250, 0, 0.03, { type:"square", gain:0.05 }),
  timeup:  c => { note(c, 880, 0, 0.12, { type:"square", gain:0.07 }); note(c, 660, 0.14, 0.25, { type:"square", gain:0.07 }); }
};
// play a sound by name (quietly does nothing when off, when the tab is hidden, or without Web Audio)
export function sfx(name){
  if (!S.on || !S.vol || !SOUNDS[name]) return false;
  if (typeof document !== "undefined" && document.hidden) return false;
  const now = Date.now(); if (last[name] && now - last[name] < 45) return false; last[name] = now;   // no machine-gun repeats
  const c = audio(); if (!c) return false;
  try { if (c.state === "suspended") c.resume(); SOUNDS[name](c); return true; } catch(e){ return false; }
}
