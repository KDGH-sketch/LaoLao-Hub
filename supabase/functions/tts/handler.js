// The "tts" Edge Function: the only place that holds the Azure Speech key. Admins who may edit audio send Lao text and
// get MP3 audio back; their browser then saves the file and the "audio" row like a recording of their own (versioned,
// audited, live after Publish). Setup: docs/AZURE_VOICE.md.
//   GET  /status  (audio editors)  connected or not, the voices, characters used this month and the monthly limit
//   POST /speak   (audio editors)  { texts: [..], voice, slow } → { items: [{ text, audio (base64 MP3), chars } | { text, error }] }
// Every request is checked with the caller's own token: ll_can_edit('audio') in the database decides.
// A monthly character limit (TTS_MONTHLY_CHAR_LIMIT, default 450 000: under Azure's free 500 000) stops surprise bills.

export const VOICES = [
  { id: "lo-LA-KeomanyNeural", label: "Keomany (female)" },
  { id: "lo-LA-ChanthavongNeural", label: "Chanthavong (male)" }
];
const MAX_TEXTS = 20, MAX_CHARS = 300, LAO = /[຀-໿]/;
const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });
const xml = s => String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" })[c]);
export const ssml = (text, voice, slow) =>
  `<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="lo-LA"><voice name="${voice}"><prosody rate="${slow ? "-20%" : "-5%"}">${xml(text)}</prosody></voice></speak>`;
const b64 = buf => { let s = ""; const a = new Uint8Array(buf); for (let i = 0; i < a.length; i += 0x8000) s += String.fromCharCode.apply(null, a.subarray(i, i + 0x8000)); return btoa(s); };

export function createHandler({ env, db, fetchImpl = fetch, now = () => new Date() }){
  const key = env.AZURE_SPEECH_KEY || "", region = (env.AZURE_SPEECH_REGION || "").trim().toLowerCase();
  const limit = Math.max(0, parseInt(env.TTS_MONTHLY_CHAR_LIMIT || "450000", 10) || 0);
  const configured = !!(key && /^[a-z0-9]+$/.test(region));
  const origins = (env.TTS_ALLOWED_ORIGINS || env.PAYMENT_ALLOWED_ORIGINS || "").split(",").map(s => s.trim()).filter(Boolean);
  const month = () => now().toISOString().slice(0, 7);

  async function mayEdit(token){
    if (!token) return false;
    try { return (await db.rpc("ll_can_edit", { menu: "audio" }, { token })) === true; } catch(e){ return false; }
  }
  async function usage(){
    const row = await db.get("settings", "ttsUsage").catch(() => null);
    return row && row.month === month() ? (+row.chars || 0) : 0;
  }
  const addUsage = async (used, n) => db.upsert("settings", "ttsUsage", { month: month(), chars: used + n, updatedAt: now().toISOString() });

  async function synth(text, voice, slow){
    const r = await fetchImpl(`https://${region}.tts.speech.microsoft.com/cognitiveservices/v1`, { method: "POST",
      headers: { "Ocp-Apim-Subscription-Key": key, "Content-Type": "application/ssml+xml", "X-Microsoft-OutputFormat": "audio-24khz-48kbitrate-mono-mp3", "User-Agent": "laolao-tts" },
      body: ssml(text, voice, slow) });
    if (!r.ok) throw Object.assign(new Error("azure " + r.status), { azure: r.status });
    return b64(await r.arrayBuffer());
  }

  const routes = {
    async "GET /status"(){
      return json({ configured, region: configured ? region : null, voices: VOICES, month: month(), used: configured ? await usage() : 0, limit });
    },
    async "POST /speak"(req){
      if (!configured) return json({ error: "not_configured" }, 503);
      let body = {}; try { body = await req.json(); } catch(e){}
      const texts = Array.isArray(body.texts) ? body.texts.map(s => String(s || "").trim()) : [];
      const voice = VOICES.some(v => v.id === body.voice) ? body.voice : VOICES[0].id;
      if (!texts.length || texts.length > MAX_TEXTS) return json({ error: "bad_request", detail: `1 to ${MAX_TEXTS} texts` }, 400);
      const bad = texts.find(s => !s || s.length > MAX_CHARS || !LAO.test(s));
      if (bad !== undefined) return json({ error: "bad_request", detail: `Lao text, up to ${MAX_CHARS} characters each` }, 400);
      const used = await usage(), want = texts.reduce((n, s) => n + s.length, 0);
      if (used + want > limit) return json({ error: "monthly_limit", used, limit }, 429);
      const items = [];
      let spent = 0;
      for (const text of texts){
        try { items.push({ text, audio: await synth(text, voice, !!body.slow), chars: text.length, voice }); spent += text.length; }
        catch(e){ items.push({ text, error: e.azure === 401 || e.azure === 403 ? "azure_key_rejected" : e.azure === 429 ? "azure_busy" : "azure_error" }); if (e.azure === 401 || e.azure === 403) break; }
      }
      if (spent) await addUsage(used, spent).catch(e => console.error("[tts] usage", e.message));
      return json({ items, used: used + spent, limit });
    }
  };

  return async function handle(req){
    const origin = req.headers.get("origin") || "";
    const allow = !origins.length || origins.includes(origin);      // requests carry the admin's token; no cookies are used
    const cors = allow && origin ? { "Access-Control-Allow-Origin": origin, "Vary": "Origin", "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info", "Access-Control-Allow-Methods": "GET, POST, OPTIONS" } : {};
    if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
    const path = new URL(req.url).pathname.replace(/^.*\/tts(?=\/|$)/, "") || "/";
    const fn = routes[req.method + " " + path];
    const done = res => { for (const [k, v] of Object.entries(cors)) res.headers.set(k, v); return res; };
    if (!fn) return done(json({ error: "not_found" }, 404));
    const auth = req.headers.get("authorization") || "", token = /^Bearer\s+(.+)$/i.test(auth) ? auth.replace(/^Bearer\s+/i, "") : null;
    try {
      if (!(await mayEdit(token))) return done(json({ error: "not_allowed" }, 403));
      return done(await fn(req, token));
    } catch(e){
      console.error("[tts] error", req.method, path, e && e.message);         // details stay in the log; never the key
      return done(json({ error: "server_error" }, 500));
    }
  };
}
