// Live check that Voice Studio can upload recordings to the Supabase project in env-config.js.
// It signs in as YOUR admin account, uploads a 1-second test tone to laolao-assets/audio/test/, plays it back
// through the public link, then removes it. It writes no database rows and changes no settings or policies.
//
// Run (PowerShell), in the project folder:
//   npm run check:upload
// It asks for your admin email and password (the password is not shown or saved). Or set them first:
//   $env:LAOLAO_ADMIN_EMAIL="you@…"; $env:LAOLAO_ADMIN_PASSWORD="…"; npm run check:upload
import fs from "fs";
import readline from "readline";
import { createClient } from "@supabase/supabase-js";

const cfg = fs.readFileSync(new URL("../env-config.js", import.meta.url), "utf8");
const url = (cfg.match(/url:\s*["']([^"']+)["']/) || [])[1], key = (cfg.match(/anonKey:\s*["']([^"']+)["']/) || [])[1];
if (!url || !key){ console.error("No Supabase url/anonKey in env-config.js"); process.exit(1); }
const BUCKET = "laolao-assets";

function ask(q, hidden){
  return new Promise(res => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    if (hidden) rl._writeToOutput = s => { if (s.includes(q)) process.stdout.write(s); };
    rl.question(q, a => { rl.close(); if (hidden) process.stdout.write("\n"); res(a.trim()); });
  });
}
// 1 second, 440 Hz, 22.05 kHz mono 16-bit: the same format Voice Studio saves
function toneWav(){
  const rate = 22050, n = rate, buf = Buffer.alloc(44 + n * 2);
  buf.write("RIFF", 0); buf.writeUInt32LE(36 + n * 2, 4); buf.write("WAVEfmt ", 8); buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20); buf.writeUInt16LE(1, 22); buf.writeUInt32LE(rate, 24); buf.writeUInt32LE(rate * 2, 28);
  buf.writeUInt16LE(2, 32); buf.writeUInt16LE(16, 34); buf.write("data", 36); buf.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i++) buf.writeInt16LE(Math.round(Math.sin(2 * Math.PI * 440 * i / rate) * 8000), 44 + i * 2);
  return buf;
}

let fail = 0;
const ok = (c, m, hint) => { console.log((c ? "  OK   " : "  FAIL ") + m); if (!c){ fail++; if (hint) console.log("         → " + hint); } };
const note = m => console.log("  NOTE " + m);

const email = process.env.LAOLAO_ADMIN_EMAIL || await ask("Admin email: ");
const password = process.env.LAOLAO_ADMIN_PASSWORD || await ask("Password (hidden): ", true);
const c = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

console.log("\nSign-in and permissions:");
const { error: authErr } = await c.auth.signInWithPassword({ email, password });
ok(!authErr, "signed in as " + email, authErr && authErr.message);
if (authErr) process.exit(1);
const rpc = async (name, args) => { const { data, error } = await c.rpc(name, args); return error ? "error: " + error.message : data; };
const canPublish = await rpc("ll_can_publish"), canAudio = await rpc("ll_can_edit", { menu: "audio" });
ok(canPublish === true, "this account may upload files (ll_can_publish)", "ask the Super Admin for an editor role, or run supabase-schema.sql (" + canPublish + ")");
ok(canAudio === true, "this account may edit Audio (ll_can_edit('audio'))", "give this admin edit rights on Audio in Administrators (" + canAudio + ")");

console.log("\nUpload (what Voice Studio does now):");
const wav = toneWav(), path = `audio/test/upload-check-${Date.now().toString(36)}.wav`;
const up = await c.storage.from(BUCKET).upload(path, wav, { upsert: false, contentType: "audio/wav" });
ok(!up.error, "uploaded a test recording to " + BUCKET + "/" + path,
  up.error && (up.error.message + " — run supabase-schema.sql in the SQL Editor; it adds the \"ll assets insert\" storage policy"));
if (!up.error){
  const pub = c.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
  const r = await fetch(pub + "?t=" + Date.now()), body = Buffer.from(await r.arrayBuffer());
  ok(r.ok && body.length === wav.length, "learners can play it from the public link (" + r.status + ", " + body.length + " bytes)");
}

console.log("\nThe old upload (overwrite allowed), for comparison:");
const path2 = `audio/test/upload-check-old-${Date.now().toString(36)}.wav`;
const old = await c.storage.from(BUCKET).upload(path2, wav, { upsert: true, contentType: "audio/wav" });
if (old.error) note("refused, as expected: \"" + old.error.message + "\". This was the Save error in Voice Studio.");
else note("the overwrite upload works too on this database.");

console.log("\nClean-up:");
const paths = [up.error ? null : path, old.error ? null : path2].filter(Boolean);
if (paths.length){
  const del = await c.storage.from(BUCKET).remove(paths);
  if (del.error || !del.data || del.data.length < paths.length)
    note("the test file could not be removed (" + ((del.error && del.error.message) || "no delete permission") + "). It is tiny and harmless: " + BUCKET + "/audio/test/. Delete it in Supabase → Storage if you like.");
  else console.log("  OK   test file removed");
}
await c.auth.signOut();
console.log(fail ? `\n${fail} upload checks FAILED` : "\nUploads work. Voice Studio can save your recordings.");
process.exit(fail ? 1 : 0);
