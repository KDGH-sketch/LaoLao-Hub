// Start-up time (demo mode, Chrome, CPU slowed 4× like a mid-range tablet): from opening the app with a saved
// sign-in to the first screen, and the JavaScript loaded for it. Run: node scripts/perf_start.mjs
import { launch, sleep } from "./lib/cdp.mjs";
import { startDemoServer } from "./lib/demo-server.mjs";
const srv = await startDemoServer();
const b = await launch({ width: 1180, height: 820 });
await b.goto(srv.base + "/"); await b.waitFor(`!!document.querySelector("#em")`, 60000);
await b.eval(`(() => { const e = document.querySelector("#em"); e.value = "learner@demo.laolao"; document.querySelector("#pw").value = "demo1234"; e.form.requestSubmit(); })()`);
await b.waitFor(`!!document.querySelector(".app .side .nav-btn")`, 60000); await sleep(1500);
await b.send("Network.enable"); await b.send("Emulation.setCPUThrottlingRate", { rate: 4 });
let js = 0; b.send("Network.setCacheDisabled", { cacheDisabled: false });
const times = [];
for (let i = 0; i < 5; i++){
  const t0 = Date.now(); await b.goto(srv.base + "/");
  await b.waitFor(`!!document.querySelector("main") && document.querySelector("main").innerText.length > 50`, 60000);
  times.push(Date.now() - t0); await sleep(800);
}
js = await b.eval(`Math.round(performance.getEntriesByType("resource").filter(r => r.name.split("?")[0].endsWith(".js")).reduce((n, r) => n + (r.decodedBodySize || 0), 0) / 1024)`);
const mods = await b.eval(`performance.getEntriesByType("resource").filter(r => r.name.split("?")[0].endsWith(".js")).length`);
times.sort((a, b) => a - b);
console.log(JSON.stringify({ startMedianMs: times[2], startBestMs: times[0], jsKB: js, jsFiles: mods }));
await b.close(); srv.close && srv.close();
