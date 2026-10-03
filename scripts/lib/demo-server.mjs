// Static server for browser tests: serves the repository with an empty env-config.js,
// so the app runs in DEMO mode (data stays in the test browser; Supabase is never contacted).
import http from "http";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const MIME = { ".html":"text/html", ".js":"application/javascript", ".mjs":"application/javascript", ".css":"text/css", ".json":"application/json",
  ".svg":"image/svg+xml", ".webmanifest":"application/manifest+json", ".png":"image/png", ".sql":"text/plain" };

export async function startDemoServer(){
  const server = http.createServer((req, res) => {
    let p = decodeURIComponent(new URL(req.url, "http://x").pathname);
    if (p === "/env-config.js"){ res.writeHead(200, { "Content-Type": "application/javascript" }); return res.end('window.__OWNER_EMAIL__ = "owner@test.local";'); }
    if (p.endsWith("/")) p += "index.html";
    const file = path.join(ROOT, p);
    if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()){ res.writeHead(404); return res.end("not found"); }
    res.writeHead(200, { "Content-Type": MIME[path.extname(file)] || "application/octet-stream", "Cache-Control": "no-store" });
    fs.createReadStream(file).pipe(res);
  });
  await new Promise(r => server.listen(0, "127.0.0.1", r));
  return { base: `http://127.0.0.1:${server.address().port}`, close: () => server.close() };
}
