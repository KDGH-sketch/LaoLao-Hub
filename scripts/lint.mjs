// Syntax check of every JavaScript file in the app and scripts (node --check). Exits 1 on any error.
// Run: npm run lint
import { execFileSync } from "child_process";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const files = [];
const walk = d => fs.readdirSync(d, { withFileTypes: true }).forEach(e => {
  const p = path.join(d, e.name);
  if (e.isDirectory()) walk(p); else if (/\.m?js$/.test(e.name)) files.push(p);
});
["js", "scripts", "supabase/functions"].forEach(d => walk(path.join(ROOT, d)));
["server.js", "sw.js", "env-config.js"].forEach(f => files.push(path.join(ROOT, f)));

let failed = 0;
for (const f of files){
  try { execFileSync(process.execPath, ["--check", f], { stdio: "pipe" }); }
  catch(e){ failed++; console.log("✗ " + path.relative(ROOT, f) + "\n" + String(e.stderr).trim() + "\n"); }
}
console.log(failed ? `${failed} of ${files.length} files have syntax errors` : `All ${files.length} files parse cleanly`);
process.exit(failed ? 1 : 0);
