// Microphone for the pronunciation coach: records one attempt (MediaRecorder), shows the pitch live while the learner
// speaks (Web Audio analyser + YIN), stops by itself after a short silence, and gives back the samples for analysis
// and a link to play the attempt back. Also loads the model recording of a text for comparison.
import { yin, track, semitones } from "./pitch.js";

let AC = null;
const ctx = () => { if (!AC){ const C = window.AudioContext || window.webkitAudioContext; AC = new C(); } if (AC.state === "suspended") AC.resume(); return AC; };
export const canRecord = () => typeof navigator !== "undefined" && !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia && window.MediaRecorder && (window.AudioContext || window.webkitAudioContext));

// start recording: { stop(), done: Promise<{ samples, sampleRate, url }> }; onLive({ f0, rms, t }) about 25 times a second
export async function startRecording({ maxMs = 4000, silenceMs = 900, onLive = null } = {}){
  const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
  const ac = ctx(), src = ac.createMediaStreamSource(stream), an = ac.createAnalyser(); an.fftSize = 2048; src.connect(an);
  const mime = ["audio/webm;codecs=opus","audio/webm","audio/mp4","audio/ogg"].find(t => window.MediaRecorder.isTypeSupported && MediaRecorder.isTypeSupported(t)) || "";
  const rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined), chunks = [];
  rec.ondataavailable = e => { if (e.data && e.data.size) chunks.push(e.data); };
  const buf = new Float32Array(an.fftSize), t0 = performance.now();
  let heard = false, quietSince = 0, timer = null, stopped = false;
  const finish = () => { if (stopped) return; stopped = true; clearInterval(timer); try { rec.state !== "inactive" && rec.stop(); } catch(e){} };
  timer = setInterval(() => {
    an.getFloatTimeDomainData(buf); let s = 0; for (let i = 0; i < buf.length; i++) s += buf[i] * buf[i];
    const rms = Math.sqrt(s / buf.length), f0 = rms > 0.01 ? yin(buf, ac.sampleRate) : 0, t = performance.now() - t0;
    if (onLive) onLive({ f0, rms, t });
    if (f0 && rms > 0.015){ heard = true; quietSince = 0; } else if (heard){ quietSince = quietSince || t; if (t - quietSince > silenceMs) finish(); }
    if (t > maxMs) finish();
  }, 40);
  const done = new Promise((resolve, reject) => {
    rec.onstop = async () => {
      stream.getTracks().forEach(tr => tr.stop()); try { src.disconnect(); } catch(e){}
      try {
        const blob = new Blob(chunks, { type: rec.mimeType || mime || "audio/webm" });
        const audio = await ac.decodeAudioData(await blob.arrayBuffer());
        resolve({ samples: audio.getChannelData(0), sampleRate: audio.sampleRate, url: URL.createObjectURL(blob), seconds: audio.duration });
      } catch(e){ reject(e); }
    };
  });
  rec.start(100);
  return { stop: finish, done };
}

// the teacher's (or computer voice's) recording of a text, measured once: { semis, seconds } or null
const MODEL = new Map();
export async function modelCurve(url){
  if (!url) return null;
  if (MODEL.has(url)) return MODEL.get(url);
  const p = (async () => { try {
    const r = await fetch(url); if (!r.ok) return null;
    const audio = await ctx().decodeAudioData(await r.arrayBuffer()), x = audio.getChannelData(0), tr = track(x, audio.sampleRate);
    return tr.voiced > 5 ? { semis: semitones(tr), seconds: (tr.end - tr.start + 1) * tr.hop } : null;
  } catch(e){ return null; } })();
  MODEL.set(url, p); return p;
}
export function playUrl(url){ try { const a = new Audio(url); a.play().catch(() => {}); return a; } catch(e){ return null; } }
