// Audio engine for LaoLao. For Lao text the order is:
//   1. a recording of that exact text (Admin → Voice Studio)
//   2. the sentence stitched from recordings of its words and phrases (planSentence: fewest pieces first)
//   3. the computer voice (Azure, generated once in Voice Studio): only when 1 and 2 have nothing, and never mixed
//      with the teacher's voice inside one sentence
//   4. a real Lao voice installed on the device (rare). Thai voices are never used for Lao: they teach wrong sounds.
//   5. nothing: onMissingAudio(text) lets the app say "audio coming soon" and report the request to the admins
// Text without Lao letters (e.g. an English example) is read by the device voice.
import { normText, planSentence } from "./audio-proc.js";

let VOICES = [], ALL_VOICES = [], settings = { rate: 0.85, voice: "", wordByWord: false }, AUDIO_MAP = new Map(), TTS_MAP = new Map(), onMissing = null, current = null, audioGate = null, playId = 0;
export function setSpeechSettings(s){ settings = Object.assign(settings, s||{}); }
// The published recordings (bundle "audio"), keyed by their text without spaces or punctuation
// The published recordings (bundle "audio"), keyed by their text without spaces or punctuation; the teacher's voice and
// the computer voice (source "azure") are kept apart
export const isComputerVoice = a => a && (a.source === "azure" || a.source === "tts");
export function setAudioLibrary(items=[]){
  const ok = items.filter(a => a.url && a.text);
  AUDIO_MAP = new Map(ok.filter(a => !isComputerVoice(a)).map(a => [normText(a.text), a]));
  TTS_MAP = new Map(ok.filter(isComputerVoice).map(a => [normText(a.text), a]));
}
export const hasRecording = text => AUDIO_MAP.has(normText(text));
// Called with the text when there is no recording and no Lao voice; the old name is kept for older callers
export function onMissingAudio(cb){ onMissing = cb; }
export const onMissingVoice = cb => onMissingAudio(() => cb());
// gate(text) → true to play recordings, false to skip them (plans and limits; decided synchronously so playback stays inside the tap)
export function setAudioGate(fn){ audioGate = fn; }
// Lao voices installed on the device (only these are offered and used)
export function voices(){ return VOICES; }
const LAO = /[\u0E80-\u0EFF]/;
function loadVoices(){
  try {
    ALL_VOICES = speechSynthesis.getVoices() || [];
    VOICES = ALL_VOICES.filter(v => /^lo/i.test(v.lang) || /\bLao\b/i.test(v.name));
  } catch(e){ VOICES = []; ALL_VOICES = []; }
}
if (typeof window !== "undefined" && "speechSynthesis" in window){ loadVoices(); speechSynthesis.addEventListener?.("voiceschanged", loadVoices); }
const pickVoice = () => VOICES.find(v => v.name === settings.voice) || VOICES[0] || null;

export function stop(){ playId++; try { speechSynthesis.cancel(); } catch(e){} if (current){ try { current.pause(); } catch(e){} current = null; } }

// What will play for a text: "recording" | "stitched" | "computer" | "voice" | "none" (for hints in the UI and the studio)
export function audioSource(text){
  if (!LAO.test(String(text || ""))) return "voice";
  const plan = planSentence(text, k => AUDIO_MAP.has(k));
  if (plan && plan.length === 1) return "recording";
  if (plan) return "stitched";
  if (planSentence(text, k => TTS_MAP.has(k))) return "computer";
  if (VOICES.length) return "voice";
  return "none";
}
// the pieces to play and the map they come from: the teacher's voice first, then the computer voice
function choose(text){
  const own = planSentence(text, k => AUDIO_MAP.has(k));
  if (own) return { plan: own, map: AUDIO_MAP };
  const tts = planSentence(text, k => TTS_MAP.has(k));
  return tts ? { plan: tts, map: TTS_MAP } : null;
}

export function speak(text, opt={}){
  text = String(text||"").trim(); if (!text) return;
  stop();
  if (!LAO.test(text)) return speakTTS(text, opt, ALL_VOICES.find(v => /^en/i.test(v.lang)) || null);
  const pick = choose(text);
  if (pick && (!audioGate || audioGate(text))) return playPlan(pick.plan, opt, pick.map);   // the gate counts a play only when there is audio
  if (VOICES.length) return speakTTS(text, opt, pickVoice());
  if (!pick && onMissing) onMissing(text);                                  // a plan limit says so itself (the gate's message)
}

// Play recorded pieces one after another: short gaps between words (longer in word-by-word mode or when slow),
// a pause at punctuation. Files are preloaded so the words follow each other without stutter.
function playPlan(plan, opt, map = AUDIO_MAP){
  const id = ++playId, rate = opt.slow ? 0.75 : 1;
  const wordGap = settings.wordByWord ? 380 : (opt.slow ? 160 : 45), pause = settings.wordByWord ? 650 : 320;
  const els = plan.map(k => { if (!k) return null; const a = new Audio(map.get(k).url); a.preload = "auto"; a.playbackRate = rate; return a; });
  let times = opt.times || 1, i = 0;
  const next = () => {
    if (id !== playId) return;
    if (i >= els.length){ if (--times > 0){ i = 0; return setTimeout(next, 600); } current = null; return; }
    const a = els[i++];
    if (!a) return setTimeout(next, pause);
    current = a; a.currentTime = 0;
    a.onended = () => setTimeout(next, i < els.length && els[i] ? (els.length > 1 ? wordGap : 0) : 0);
    a.onerror = () => next();
    a.play().catch(() => next());
  };
  next();
}

function speakTTS(text, opt, voice){
  if (!("speechSynthesis" in window)){ if (onMissing && LAO.test(text)) onMissing(text); return; }
  try {
    for (let i=0;i<(opt.times||1);i++){
      const u = new SpeechSynthesisUtterance(text);
      u.lang = voice && voice.lang ? voice.lang : (LAO.test(text) ? "lo-LA" : "en-US");
      if (voice) u.voice = voice;
      u.rate = opt.slow ? Math.max(.4, settings.rate*0.65) : settings.rate;
      speechSynthesis.speak(u);
    }
  } catch(e){}
}
// Pronunciation check with speech recognition
export const canListen = () => !!(window.SpeechRecognition || window.webkitSpeechRecognition);
export function listen(){
  return new Promise((resolve, reject) => {
    const R = window.SpeechRecognition || window.webkitSpeechRecognition; if (!R) return reject(new Error("unsupported"));
    const r = new R(); r.lang = "lo-LA"; r.interimResults = false; r.maxAlternatives = 3;
    let done = false;
    const timer = setTimeout(() => { if (!done){ done = true; try { r.abort(); } catch(e){} resolve([]); } }, 8000);
    r.onresult = e => { if (done) return; done = true; clearTimeout(timer); resolve(Array.from(e.results[0]).map(a=>a.transcript)); };
    r.onerror = e => { if (!done){ done = true; clearTimeout(timer); reject(e.error || e); } };
    r.onend = () => { if (!done){ done = true; clearTimeout(timer); resolve([]); } };
    try { r.start(); } catch(e){ reject(e); }
  });
}
// similarity 0..1 between two Lao or text strings
export function similarity(a, b){
  a = String(a).replace(/[^\u0E80-\u0EFF\u4E00-\u9FA5a-zA-Z]/g,"");
  b = String(b).replace(/[^\u0E80-\u0EFF\u4E00-\u9FA5a-zA-Z]/g,"");
  if (!a || !b) return 0;
  const m = a.length, n = b.length, dp = Array.from({length:m+1},()=>new Array(n+1).fill(0));
  for (let i=1;i<=m;i++) for (let j=1;j<=n;j++) dp[i][j] = a[i-1]===b[j-1] ? dp[i-1][j-1]+1 : Math.max(dp[i-1][j], dp[i][j-1]);
  return dp[m][n] / Math.max(m, n);
}
