// Audio engine for LaoLao.
// Order of preference: a recorded audio file → native Lao voice (lo-LA / lo) → Thai fallback (th-TH phonetics) → device default.
let VOICES = [], settings = { rate: 0.85, voice: "" }, AUDIO_MAP = new Map(), onNoVoice = null, current = null;
export function setSpeechSettings(s){ settings = Object.assign(settings, s||{}); }
export function setAudioLibrary(items=[]){ AUDIO_MAP = new Map(items.filter(a=>a.url && a.text).map(a => [a.text.trim(), a])); }
export function onMissingVoice(cb){ onNoVoice = cb; }
export function voices(){ return VOICES; }
function loadVoices(){
  try {
    const all = speechSynthesis.getVoices() || [];
    VOICES = all.filter(v => /^(lo|th)/i.test(v.lang) || /Lao|Thai/i.test(v.name));
    if (!VOICES.length) VOICES = all;
  } catch(e){ VOICES = []; }
}
if ("speechSynthesis" in window){ loadVoices(); speechSynthesis.addEventListener?.("voiceschanged", loadVoices); }
function pickVoice(){
  return VOICES.find(v=>v.name===settings.voice)
    || VOICES.find(v=>/^lo/i.test(v.lang))
    || VOICES.find(v=>/Lao/i.test(v.name))
    || VOICES.find(v=>/^th/i.test(v.lang))
    || VOICES.find(v=>/Thai/i.test(v.name))
    || VOICES[0] || null;
}
export function stop(){ try { speechSynthesis.cancel(); } catch(e){} if (current){ current.pause(); current = null; } }
export function speak(text, opt={}){
  text = String(text||"").trim(); if (!text) return;
  stop();
  const rec = AUDIO_MAP.get(text);
  if (rec){
    let n = opt.times || 1;
    const play = () => { const a = new Audio(rec.url); a.playbackRate = opt.slow ? 0.7 : 1; current = a; a.onended = () => { if (--n > 0) play(); }; a.play().catch(()=>speakTTS(text,opt)); };
    return play();
  }
  speakTTS(text, opt);
}
function speakTTS(text, opt){
  if (!("speechSynthesis" in window)){ onNoVoice && onNoVoice(); return; }
  try {
    const v = pickVoice();
    const langCode = (v && v.lang) ? v.lang : "lo-LA";
    for (let i=0;i<(opt.times||1);i++){
      const u = new SpeechSynthesisUtterance(text);
      u.lang = langCode;
      if (v) u.voice = v;
      u.rate = opt.slow ? Math.max(.4, settings.rate*0.65) : settings.rate;
      speechSynthesis.speak(u);
    }
    if (!VOICES.length) setTimeout(() => { loadVoices(); if (!VOICES.length && onNoVoice) onNoVoice(); }, 900);
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
