// The "tts" Edge Function (supabase/functions/tts/handler.js) with a fake Azure and a fake database:
// who may use it, input checks, the monthly character limit, the SSML sent to Azure, and that the key never leaks.
// Run: node scripts/test_tts_server.mjs
import { createHandler, ssml, VOICES } from "../supabase/functions/tts/handler.js";

let failed = 0;
const ok = (c, m, d) => { console.log((c ? "  PASS " : "  FAIL ") + m + (!c && d !== undefined ? "  → " + JSON.stringify(d).slice(0, 300) : "")); if (!c) failed++; };
const KEY = "secret-azure-key-123";

function setup({ env = {}, admin = true, used = 0, azure = () => new Response(new Uint8Array([0x49, 0x44, 0x33, 1, 2, 3]), { status: 200 }), month = "2026-10" } = {}){
  const calls = [], settings = { ttsUsage: { month, chars: used } };
  const db = {
    rpc: async (name, args, o) => { calls.push({ rpc: name, args, token: o && o.token }); if (name !== "ll_can_edit" || args.menu !== "audio") throw new Error("unexpected rpc"); return o && o.token === "admin-token" && admin; },
    get: async (t, id) => settings[id] || null,
    upsert: async (t, id, data) => { settings[id] = data; }
  };
  const azureCalls = [];
  const fetchImpl = async (url, init) => { azureCalls.push({ url, init }); return azure(url, init); };
  const handle = createHandler({ env: Object.assign({ AZURE_SPEECH_KEY: KEY, AZURE_SPEECH_REGION: "southeastasia" }, env), db, fetchImpl, now: () => new Date(month + "-15T10:00:00Z") });
  const req = (method, path, body, token = "admin-token", origin = "https://kdgh-sketch.github.io") => handle(new Request("https://x.supabase.co/functions/v1/tts" + path,
    { method, headers: Object.assign({ origin, "content-type": "application/json" }, token ? { authorization: "Bearer " + token } : {}), body: body ? JSON.stringify(body) : undefined }));
  return { req, calls, azureCalls, settings };
}
const body = async r => { try { return await r.clone().json(); } catch(e){ return null; } };

console.log("who may use it");
{ const { req } = setup();
  ok((await req("GET", "/status", null, null)).status === 403, "no sign-in: refused");
  ok((await req("GET", "/status", null, "learner-token")).status === 403, "a learner (ll_can_edit('audio') false): refused");
  const r = await req("GET", "/status"); const b = await body(r);
  ok(r.status === 200 && b.configured === true && b.region === "southeastasia" && b.voices.length === 2, "an audio editor sees the status", b);
  ok(!JSON.stringify(b).includes(KEY), "the Azure key is never sent to the browser"); }
{ const { req, calls } = setup({ admin: false });
  ok((await req("POST", "/speak", { texts: ["ກິນ"] })).status === 403 && calls[0].token === "admin-token", "the permission check runs with the caller's own token"); }
{ const { req } = setup({ env: { AZURE_SPEECH_KEY: "" } });
  const b = await body(await req("GET", "/status"));
  ok(b.configured === false, "without a key the status says not connected");
  ok((await req("POST", "/speak", { texts: ["ກິນ"] })).status === 503, "and speaking is refused (503)"); }
{ const { req } = setup({ env: { AZURE_SPEECH_REGION: "south east asia!" } });
  ok((await body(await req("GET", "/status"))).configured === false, "a malformed region is not used in the Azure URL"); }

console.log("\nspeaking");
{ const { req, azureCalls, settings } = setup({ used: 1000 });
  const r = await req("POST", "/speak", { texts: ["ຂ້ອຍກິນເຂົ້າ", "ສະບາຍດີ"], voice: "lo-LA-ChanthavongNeural" }); const b = await body(r);
  ok(r.status === 200 && b.items.length === 2 && b.items.every(i => i.audio && !i.error), "two texts → two MP3s (base64)", b);
  ok(azureCalls.length === 2 && azureCalls[0].url === "https://southeastasia.tts.speech.microsoft.com/cognitiveservices/v1", "Azure's regional endpoint is called");
  const h = azureCalls[0].init.headers;
  ok(h["Ocp-Apim-Subscription-Key"] === KEY && h["X-Microsoft-OutputFormat"] === "audio-24khz-48kbitrate-mono-mp3" && h["Content-Type"] === "application/ssml+xml", "key, MP3 format and SSML headers");
  ok(/name="lo-LA-ChanthavongNeural"/.test(azureCalls[0].init.body) && /xml:lang="lo-LA"/.test(azureCalls[0].init.body), "the chosen Lao voice");
  ok(settings.ttsUsage.chars === 1000 + "ຂ້ອຍກິນເຂົ້າ".length + "ສະບາຍດີ".length && b.used === settings.ttsUsage.chars, "characters are counted for the month", settings.ttsUsage);
  ok(Buffer.from(b.items[0].audio, "base64")[0] === 0x49, "the audio bytes come back intact"); }
{ const { req, azureCalls } = setup();
  await req("POST", "/speak", { texts: ["ກິນ"], voice: "en-US-JennyNeural" });
  ok(/lo-LA-KeomanyNeural/.test(azureCalls[0].init.body), "an unknown voice falls back to Keomany (only Lao voices)"); }
ok(ssml('ກິນ <b>&"', "lo-LA-KeomanyNeural", false).includes("ກິນ &lt;b&gt;&amp;&quot;") && !ssml("<x/>", "v").includes("<x/>"), "text is escaped inside the SSML (no tag injection)");
ok(/rate="-20%"/.test(ssml("ກິນ", "v", true)) && /rate="-5%"/.test(ssml("ກິນ", "v", false)), "slower speech when asked");

console.log("\ninput checks");
{ const { req, azureCalls } = setup();
  ok((await req("POST", "/speak", { texts: [] })).status === 400, "no texts: 400");
  ok((await req("POST", "/speak", { texts: Array(21).fill("ກິນ") })).status === 400, "more than 20 texts: 400");
  ok((await req("POST", "/speak", { texts: ["hello"] })).status === 400, "text without Lao letters: 400");
  ok((await req("POST", "/speak", { texts: ["ກ".repeat(301)] })).status === 400, "over 300 characters: 400");
  ok(azureCalls.length === 0, "nothing was sent to Azure for bad input");
  ok((await req("GET", "/nope")).status === 404 || (await req("GET", "/nope")).status === 403, "unknown route: refused"); }

console.log("\nmonthly limit");
{ const { req, azureCalls } = setup({ used: 449995 });
  const r = await req("POST", "/speak", { texts: ["ຂ້ອຍກິນເຂົ້າ"] }); const b = await body(r);
  ok(r.status === 429 && b.error === "monthly_limit" && azureCalls.length === 0, "over the 450 000 default: refused before calling Azure", b); }
{ const { req } = setup({ used: 449995, month: "2026-10" });
  const s2 = setup({ used: 449995, month: "2026-10" });
  s2.settings.ttsUsage.month = "2026-09";
  ok((await s2.req("POST", "/speak", { texts: ["ຂ້ອຍກິນເຂົ້າ"] })).status === 200, "a new month starts from zero"); }
{ const { req } = setup({ env: { TTS_MONTHLY_CHAR_LIMIT: "10" } });
  ok((await req("POST", "/speak", { texts: ["ຂ້ອຍກິນເຂົ້າແລ້ວ"] })).status === 429, "the limit can be set lower (TTS_MONTHLY_CHAR_LIMIT)"); }

console.log("\nAzure errors");
{ const { req, settings } = setup({ azure: () => new Response("no", { status: 401 }) });
  const b = await body(await req("POST", "/speak", { texts: ["ກິນ", "ດື່ມ"] }));
  ok(b.items.length === 1 && b.items[0].error === "azure_key_rejected", "a rejected key is reported once, and the batch stops", b);
  ok(settings.ttsUsage.chars === 0, "failed texts are not counted"); }
{ let n = 0; const { req } = setup({ azure: () => (++n === 1 ? new Response("busy", { status: 429 }) : new Response(new Uint8Array([1]), { status: 200 })) });
  const b = await body(await req("POST", "/speak", { texts: ["ກິນ", "ດື່ມ"] }));
  ok(b.items[0].error === "azure_busy" && b.items[1].audio, "one failed text does not stop the others", b); }
{ const { req } = setup({ azure: () => { throw new Error("boom " + KEY); } });
  const r = await req("POST", "/speak", { texts: ["ກິນ"] }); const txt = await r.text();
  ok(!txt.includes(KEY) && !txt.includes("boom"), "internal errors never reach the browser"); }

console.log("\nbrowser access (CORS)");
{ const { req } = setup({ env: { TTS_ALLOWED_ORIGINS: "https://kdgh-sketch.github.io" } });
  const good = await req("OPTIONS", "/speak", null, null), bad = await req("OPTIONS", "/speak", null, null, "https://evil.example");
  ok(good.headers.get("access-control-allow-origin") === "https://kdgh-sketch.github.io" && !bad.headers.get("access-control-allow-origin"), "only the listed site may call it from a browser"); }
ok(VOICES.every(v => /^lo-LA-/.test(v.id)), "only Lao voices are offered");

console.log(failed ? `\n${failed} tts server checks FAILED` : "\nAll tts server checks passed");
process.exit(failed ? 1 : 0);
