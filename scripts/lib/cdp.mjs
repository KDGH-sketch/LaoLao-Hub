// Minimal headless-Chrome driver over the DevTools protocol (no npm packages needed).
// Uses a throwaway browser profile in the OS temp folder, never your own Chrome profile.
import { spawn } from "child_process";
import fs from "fs";
import os from "os";
import path from "path";

const CANDIDATES = [
  process.env.CHROME_PATH,
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  "/usr/bin/google-chrome", "/usr/bin/chromium", "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
].filter(Boolean);

export async function launch({ width = 1366, height = 900, args = [] } = {}){
  const exe = CANDIDATES.find(p => fs.existsSync(p));
  if (!exe) throw new Error("Chrome/Edge not found. Set CHROME_PATH.");
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), "laolao-cdp-"));
  const proc = spawn(exe, ["--headless=new", "--remote-debugging-port=0", `--user-data-dir=${profile}`, "--no-first-run",
    "--no-default-browser-check", "--autoplay-policy=no-user-gesture-required", "--mute-audio", `--window-size=${width},${height}`, ...args, "about:blank"],
    { stdio: "ignore" });
  const portFile = path.join(profile, "DevToolsActivePort");
  let port;
  for (let i = 0; i < 150 && !port; i++){
    await sleep(100);
    try { port = fs.readFileSync(portFile, "utf8").split("\n")[0].trim(); } catch(e){}   // file may still be being written
  }
  if (!port) throw new Error("Chrome did not start");
  const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
  const page = targets.find(t => t.type === "page");
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  let seq = 0; const pending = new Map(); const listeners = [];
  ws.onmessage = ev => {
    const msg = JSON.parse(ev.data);
    if (msg.id && pending.has(msg.id)){ const { res, rej } = pending.get(msg.id); pending.delete(msg.id); msg.error ? rej(new Error(msg.error.message)) : res(msg.result); }
    else if (msg.method) listeners.forEach(l => l(msg));
  };
  const send = (method, params = {}) => new Promise((res, rej) => { const id = ++seq; pending.set(id, { res, rej }); ws.send(JSON.stringify({ id, method, params })); });
  const consoleLog = [];
  listeners.push(m => {
    if (m.method === "Runtime.consoleAPICalled") consoleLog.push(m.params.type + ": " + m.params.args.map(a => a.value ?? a.description ?? "").join(" "));
    if (m.method === "Runtime.exceptionThrown") consoleLog.push("exception: " + (m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text));
  });
  await send("Page.enable"); await send("Runtime.enable");

  const b = {
    send, consoleLog,
    async viewport(w, h, mobile = false){ await send("Emulation.setDeviceMetricsOverride", { width: w, height: h, deviceScaleFactor: 1, mobile }); },
    async goto(url){
      const loaded = new Promise(res => { const l = m => { if (m.method === "Page.loadEventFired"){ listeners.splice(listeners.indexOf(l), 1); res(); } }; listeners.push(l); });
      await send("Page.navigate", { url }); await Promise.race([loaded, sleep(20000)]);
    },
    async eval(expr){
      const r = await send("Runtime.evaluate", { expression: expr, awaitPromise: true, returnByValue: true });
      if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
      return r.result.value;
    },
    async waitFor(expr, ms = 15000){
      const t0 = Date.now();
      while (Date.now() - t0 < ms){ try { const v = await b.eval(expr); if (v) return v; } catch(e){} await sleep(200); }
      throw new Error("Timed out waiting for: " + expr);
    },
    async screenshot(file){ const { data } = await send("Page.captureScreenshot", { format: "png" }); fs.writeFileSync(file, Buffer.from(data, "base64")); return file; },
    async close(){ try { await send("Browser.close"); } catch(e){} try { proc.kill(); } catch(e){} await sleep(300); try { fs.rmSync(profile, { recursive: true, force: true }); } catch(e){} }
  };
  return b;
}
export const sleep = ms => new Promise(r => setTimeout(r, ms));
