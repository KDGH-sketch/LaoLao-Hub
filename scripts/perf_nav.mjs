// Navigation speed and health (demo mode, Chrome): how long a screen switch takes, whether document listeners pile
// up as the learner moves around (a leak makes the app slower over time), the JS heap, and whether the sidebar keeps
// its scroll position when an item near the bottom is opened.
// Run: node scripts/perf_nav.mjs            (prints numbers; used to compare before / after a change)
import { launch, sleep } from "./lib/cdp.mjs";
import { startDemoServer } from "./lib/demo-server.mjs";
const srv = await startDemoServer();
const b = await launch({ width: 1366, height: 768 });
await b.goto(srv.base + "/"); await b.waitFor(`!!document.querySelector("#em")`, 60000);
await b.eval(`(() => { const e = document.querySelector("#em"); e.value = "learner@demo.laolao"; document.querySelector("#pw").value = "demo1234"; e.form.requestSubmit(); })()`);
await b.waitFor(`!!document.querySelector(".app .side .nav-btn")`, 60000); await sleep(1000);
await b.eval(`import("/js/learner/core.js").then(m => m.setPref("uiLang", "en"))`); await sleep(300);
async function listeners(){
  const { result } = await b.send("Runtime.evaluate", { expression: "document" });
  const d = await b.send("DOMDebugger.getEventListeners", { objectId: result.objectId });
  const { result: w } = await b.send("Runtime.evaluate", { expression: "window" });
  const ww = await b.send("DOMDebugger.getEventListeners", { objectId: w.objectId });
  return d.listeners.length + ww.listeners.length;
}
const routes = ["home","paths","dict","vocab","grammar","patterns","practice","review","speak","tone_lab","pronounce_lab","culture_lab","kinship_lab","saved","notes","account","progress","videos"];
const l0 = await listeners();
const times = [];
for (let k = 0; k < 2; k++) for (const r of routes){
  const ms = await b.eval(`(async () => { const t0 = performance.now(); const m = await import("/js/learner/main.js"); await m.go(${JSON.stringify(r)}, {});
    await new Promise(res => requestAnimationFrame(() => requestAnimationFrame(res))); return performance.now() - t0; })()`);
  times.push(ms);
}
const l1 = await listeners();
await b.send("HeapProfiler.collectGarbage").catch(() => {});
const heap = await b.eval(`performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1048576) : -1`);
// open an item near the bottom of the sidebar by clicking it, then look at the sidebar scroll
const side = await b.eval(`(async () => { const s = document.querySelector(".side"); s.scrollTop = s.scrollHeight; await new Promise(r => setTimeout(r, 100));
  const before = s.scrollTop; const btns = [...s.querySelectorAll(".nav-btn")]; const target = btns[btns.length - 3]; target.click(); await new Promise(r => setTimeout(r, 900));
  const s2 = document.querySelector(".side"), act = s2.querySelector('[aria-current="page"]'), ar = act && act.getBoundingClientRect(), sr = s2.getBoundingClientRect();
  return { before: Math.round(before), after: Math.round(s2.scrollTop), activeVisible: !!ar && ar.top >= sr.top && ar.bottom <= sr.bottom }; })()`);
const sorted = times.slice().sort((a, b) => a - b), med = sorted[Math.floor(sorted.length / 2)];
console.log(JSON.stringify({ navigations: times.length, medianMs: Math.round(med), p90Ms: Math.round(sorted[Math.floor(sorted.length * 0.9)]), listenersStart: l0, listenersAfter: l1, heapMB: heap, sidebar: side }));
await b.close(); srv.close && srv.close();
