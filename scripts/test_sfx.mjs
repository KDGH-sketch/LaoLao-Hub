// Sound effects (js/shared/sfx.js) with a stand-in for the browser's Web Audio: every sound plays short notes,
// nothing plays when sound is off, at zero volume or in a hidden tab, quick repeats are dropped, volume is applied.
// Run: node scripts/test_sfx.mjs
let failed = 0;
const ok = (c, m, d) => { console.log((c ? "  PASS " : "  FAIL ") + m + (!c && d !== undefined ? "  → " + JSON.stringify(d) : "")); if (!c) failed++; };
const notes = [];
const param = () => ({ value: 0, setValueAtTime(){}, exponentialRampToValueAtTime(){} });
class FakeCtx {
  constructor(){ this.currentTime = 0; this.state = "running"; this.destination = {}; }
  createGain(){ return { gain: param(), connect(){} }; }
  createOscillator(){ const o = { type: "", frequency: param(), connect(){}, start: t => notes.push({ at: t }), stop: t => { notes[notes.length - 1].end = t; } }; return o; }
  resume(){ this.state = "running"; }
}
globalThis.window = { AudioContext: FakeCtx };
globalThis.document = { hidden: false };
const { sfx, setSfx, SOUNDS, sfxState } = await import("../js/shared/sfx.js");
const wait = ms => new Promise(r => setTimeout(r, ms));

const names = Object.keys(SOUNDS);
ok(["correct","wrong","combo","complete","fail","perfect","levelup","record","goal","tick","timeup","tile","match","tap"].every(n => names.includes(n)), names.length + " sounds: " + names.join(", "));
for (const n of names){ notes.length = 0; await wait(50); const played = sfx(n); const len = Math.max(...notes.map(x => x.end)) - Math.min(...notes.map(x => x.at));
  ok(played && notes.length >= 1 && len <= 1.2, `${n}: ${notes.length} note(s), ${len.toFixed(2)} s`); }
notes.length = 0; await wait(50); sfx("correct"); const c1 = notes.length; sfx("correct"); sfx("correct");
ok(notes.length === c1, "the same sound right away again is dropped (no machine-gun repeats)");
setSfx({ on:false }); notes.length = 0; await wait(50);
ok(!sfx("correct") && notes.length === 0, "off: nothing plays");
setSfx({ on:true, vol:0 }); ok(!sfx("wrong") && notes.length === 0, "volume 0: nothing plays");
setSfx({ vol:5 }); ok(sfxState().vol === 1, "volume is kept between 0 and 1");
setSfx({ vol:0.6 }); document.hidden = true; await wait(50);
ok(!sfx("complete") && notes.length === 0, "hidden tab: nothing plays"); document.hidden = false;
ok(sfx("nope") === false, "an unknown sound name does nothing");
delete globalThis.window.AudioContext;
console.log(failed ? `\n${failed} sound checks FAILED` : "\nAll sound checks passed");
process.exit(failed ? 1 : 0);
