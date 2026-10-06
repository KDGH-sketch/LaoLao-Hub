// Audio helpers shared by the Voice Studio (recording) and the speech engine (playback). No DOM: unit-tested in Node
// (scripts/test_audio_proc.mjs).
//   - normText: the key a recording is stored under, so "ກິນ", " ກິນ " and "ກິນ." find the same file
//   - trimSilence / normalize / resample / encodeWav: turn a raw microphone take into a small, even, universally
//     playable file (WAV, mono, 16-bit; plays on iPhone, Android and every desktop browser)
//   - planSentence: covers a sentence with recorded pieces (whole sentence, phrases, words), fewest pieces first,
//     so a sentence "talks" as soon as all of its words are recorded

// ---------- text keys ----------
const PUNCT = /[\s\u200b\u00a0.,!?;:()\[\]{}"'\u201c\u201d\u2018\u2019\u00ab\u00bb\u2026\u3001\u3002\uff0c\uff01\uff1f\uff1b\uff1a\u00b7\u2022\-\u2013\u2014/\|]+/g;
const REPEAT = "\u0ec6";                                                  // ໆ Lao repeat mark: say the word before it again
// The key of a text: Unicode NFC, without spaces, punctuation or zero-width spaces
export const normText = s => String(s || "").normalize("NFC").replace(PUNCT, "");
// The spoken parts of a sentence: split at punctuation, which becomes a pause
export const phrasesOf = s => String(s || "").normalize("NFC").split(/[.,!?;:…。，！？；：\n]+/).map(normText).filter(Boolean);

// ---------- sentence planning ----------
// has(key) → true when a recording exists for that key. Returns the pieces to play in order (keys; null = a pause
// between phrases), or null when some part of the sentence has no recording. Fewest pieces wins, so a recording of the
// whole sentence or of a longer phrase beats stitching single words.
export function planSentence(text, has, maxPiece = 40){
  const whole = normText(text);
  if (!whole) return null;
  if (has(whole)) return [whole];
  const out = [];
  for (const phrase of phrasesOf(text)){
    const n = phrase.length, best = new Array(n + 1).fill(null);
    best[0] = [];
    for (let i = 0; i < n; i++){
      if (!best[i]) continue;
      if (phrase[i] === REPEAT && best[i].length){                        // ຫຼາຍໆ → ຫຼາຍ, ຫຼາຍ (unless ຫຼາຍໆ itself is recorded)
        const cand = best[i].concat(best[i][best[i].length - 1]);
        if (!best[i + 1] || cand.length < best[i + 1].length) best[i + 1] = cand;
      }
      for (let L = Math.min(maxPiece, n - i); L >= 1; L--){
        const piece = phrase.substr(i, L);
        if (!has(piece)) continue;
        const cand = best[i].concat(piece);
        if (!best[i + L] || cand.length < best[i + L].length) best[i + L] = cand;
      }
    }
    if (!best[n]) return null;
    if (out.length) out.push(null);
    out.push(...best[n]);
  }
  return out.length ? out : null;
}
// The words of a sentence that still need a recording, using a word list (e.g. the dictionary): the pieces that are
// not covered. Used by the studio to say "record ກິນ and ເຂົ້າ to complete this sentence".
export function missingPieces(text, has, isWord, maxPiece = 40){
  const missing = new Set();
  for (const phrase of phrasesOf(text)){
    let i = 0, unknown = "";
    while (i < phrase.length){
      if (phrase[i] === REPEAT){ i++; continue; }
      let L = Math.min(maxPiece, phrase.length - i);
      for (; L >= 1; L--){ const p = phrase.substr(i, L); if (has(p) || isWord(p)) break; }
      if (L < 1){ unknown += phrase[i++]; continue; }                     // letters no word list knows: one piece
      if (unknown){ missing.add(unknown); unknown = ""; }
      const p = phrase.substr(i, L); if (!has(p)) missing.add(p);
      i += L;
    }
    if (unknown) missing.add(unknown);
  }
  return [...missing];
}

// ---------- signal processing (Float32Array samples, -1..1) ----------
export function analyze(samples, rate){
  let peak = 0, sum = 0, clipped = 0;
  for (let i = 0; i < samples.length; i++){ const v = Math.abs(samples[i]); if (v > peak) peak = v; sum += v * v; if (v >= 0.999) clipped++; }
  return { peak, rms: Math.sqrt(sum / Math.max(1, samples.length)), durationMs: Math.round(samples.length / rate * 1000), clipped };
}
// Cut the silence before and after the voice (keeps padMs on each side). Silence = 20 ms windows quieter than
// `threshold` × the loudest window, so it works for quiet and loud microphones alike.
export function trimSilence(samples, rate, { threshold = 0.06, padMs = 90 } = {}){
  const win = Math.max(1, Math.round(rate * 0.02)), n = Math.ceil(samples.length / win), lv = new Float32Array(n);
  let max = 0;
  for (let w = 0; w < n; w++){ let s = 0, c = 0; for (let i = w * win; i < Math.min(samples.length, (w + 1) * win); i++){ s += samples[i] * samples[i]; c++; } lv[w] = Math.sqrt(s / Math.max(1, c)); if (lv[w] > max) max = lv[w]; }
  if (max < 1e-4) return samples.slice(0, 0);                               // nothing but silence
  const cut = max * threshold;
  let a = 0, b = n - 1;
  while (a < n && lv[a] < cut) a++;
  while (b > a && lv[b] < cut) b--;
  const pad = Math.round(rate * padMs / 1000);
  return samples.slice(Math.max(0, a * win - pad), Math.min(samples.length, (b + 1) * win + pad));
}
// Even loudness: scale so the peak is at `peak` (-1 dBFS by default), with a short fade in and out against clicks
export function normalize(samples, rate, { peak = 0.89, fadeMs = 8 } = {}){
  const { peak: p } = analyze(samples, rate);
  const out = new Float32Array(samples.length), g = p > 1e-4 ? peak / p : 1, f = Math.min(Math.round(rate * fadeMs / 1000), samples.length >> 1);
  for (let i = 0; i < samples.length; i++){
    let k = g;
    if (i < f) k *= i / f; else if (i >= samples.length - f) k *= (samples.length - 1 - i) / f;
    out[i] = Math.max(-1, Math.min(1, samples[i] * k));
  }
  return out;
}
// Linear resampling (speech only needs up to ~11 kHz, so 22.05 kHz keeps it clear and the files small)
export function resample(samples, from, to){
  if (from === to) return samples;
  const n = Math.max(1, Math.round(samples.length * to / from)), out = new Float32Array(n), r = from / to;
  for (let i = 0; i < n; i++){ const x = i * r, j = Math.floor(x), t = x - j; out[i] = (samples[j] || 0) * (1 - t) + (samples[Math.min(j + 1, samples.length - 1)] || 0) * t; }
  return out;
}
// 16-bit PCM WAV, mono
export function encodeWav(samples, rate){
  const buf = new ArrayBuffer(44 + samples.length * 2), v = new DataView(buf);
  const str = (o, s) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
  str(0, "RIFF"); v.setUint32(4, 36 + samples.length * 2, true); str(8, "WAVE");
  str(12, "fmt "); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
  v.setUint32(24, rate, true); v.setUint32(28, rate * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true);
  str(36, "data"); v.setUint32(40, samples.length * 2, true);
  for (let i = 0; i < samples.length; i++){ const s = Math.max(-1, Math.min(1, samples[i])); v.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true); }
  return new Uint8Array(buf);
}
export const STUDIO_RATE = 22050;
// Raw take → { wav, durationMs, peak, clipped, empty }: trim, normalise, resample, encode
export function processTake(samples, rate){
  const trimmed = trimSilence(samples, rate);
  const empty = trimmed.length < rate * 0.12;                              // under 120 ms of sound: nothing was said
  const info = analyze(samples, rate);
  const out = resample(normalize(trimmed, rate), rate, STUDIO_RATE);
  return { wav: encodeWav(out, STUDIO_RATE), durationMs: Math.round(out.length / STUDIO_RATE * 1000), peak: info.peak, clipped: info.clipped > rate * 0.002, empty, samples: out };
}
// A short stable id for a recording's text (FNV-1a), used in file names and row ids
export function textId(s){
  let h = 0x811c9dc5; for (const ch of normText(s)){ h ^= ch.codePointAt(0); h = Math.imul(h, 0x01000193) >>> 0; }
  return h.toString(36);
}
