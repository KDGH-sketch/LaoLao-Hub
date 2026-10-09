// Voice analysis for the pronunciation coach, all on the device: the pitch of a recording frame by frame (YIN),
// cleaned into a curve in semitones, then compared with the target (the teacher's recording, or the tone shapes from
// the Tone Lab) for tone shape, length and clarity, with feedback the learner can act on. Pure functions on sample
// arrays, no DOM (tests: scripts/test_pron.mjs with synthesised voices).

// pitch of one frame in Hz (0 = no clear pitch): YIN with parabolic interpolation
export function yin(buf, sr, { fmin = 70, fmax = 450, thr = 0.15 } = {}){
  const tauMin = Math.max(2, Math.floor(sr / fmax)), tauMax = Math.min(Math.floor(sr / fmin), Math.floor(buf.length / 2));
  const W = buf.length - tauMax; if (W < 32 || tauMax <= tauMin) return 0;
  const d = new Float32Array(tauMax + 1);
  for (let tau = 1; tau <= tauMax; tau++){ let s = 0; for (let j = 0; j < W; j++){ const x = buf[j] - buf[j + tau]; s += x * x; } d[tau] = s; }
  let run = 0, tau = -1; const c = new Float32Array(tauMax + 1); c[0] = 1;
  for (let k = 1; k <= tauMax; k++){ run += d[k]; c[k] = run ? d[k] * k / run : 1; }
  for (let k = tauMin; k <= tauMax; k++){ if (c[k] < thr){ while (k + 1 <= tauMax && c[k + 1] < c[k]) k++; tau = k; break; } }
  if (tau < 0) return 0;
  const a = c[tau - 1] ?? c[tau], b = c[tau], e = c[tau + 1] ?? c[tau], den = a + e - 2 * b;
  const t = den ? tau + (a - e) / (2 * den) : tau;
  return sr / t;
}
const median = a => { const s = a.filter(x => x > 0).sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : 0; };
// to about 16 kHz (enough for voice pitch, 3× faster)
export function downsample(samples, sr, target = 16000){
  const f = Math.max(1, Math.floor(sr / target)); if (f === 1) return { x: samples, sr };
  const out = new Float32Array(Math.floor(samples.length / f));
  for (let i = 0; i < out.length; i++){ let s = 0; for (let k = 0; k < f; k++) s += samples[i * f + k]; out[i] = s / f; }
  return { x: out, sr: sr / f };
}
// the pitch track of a recording: frames every 10 ms, { f0[], rms[], hop, start, end } (start/end: the voiced part)
export function track(samples, sampleRate){
  const { x, sr } = downsample(samples, sampleRate);
  const win = Math.round(sr * 0.04), hop = Math.round(sr * 0.01), f0 = [], rms = [];
  for (let i = 0; i + win <= x.length; i += hop){
    const fr = x.subarray(i, i + win); let s = 0; for (let k = 0; k < fr.length; k++) s += fr[k] * fr[k];
    rms.push(Math.sqrt(s / fr.length)); f0.push(yin(fr, sr));
  }
  const peak = Math.max(0, ...rms), gate = Math.max(0.008, peak * 0.12);
  for (let i = 0; i < f0.length; i++) if (rms[i] < gate) f0[i] = 0;
  // octave slips: a frame twice or half the median is folded back
  const med = median(f0);
  for (let i = 0; i < f0.length; i++){ if (!f0[i]) continue; if (f0[i] > med * 1.75) f0[i] /= 2; else if (f0[i] < med / 1.75) f0[i] *= 2; }
  // median filter (5) over voiced frames, single-frame dropouts filled
  const sm = f0.map((v, i) => { if (!v) return 0; const w = f0.slice(Math.max(0, i - 2), i + 3).filter(Boolean).sort((a, b) => a - b); return w[Math.floor(w.length / 2)]; });
  for (let i = 1; i < sm.length - 1; i++) if (!sm[i] && sm[i - 1] && sm[i + 1]) sm[i] = (sm[i - 1] + sm[i + 1]) / 2;
  let start = sm.findIndex(Boolean), end = sm.length - 1 - [...sm].reverse().findIndex(Boolean);
  if (start < 0){ start = 0; end = -1; }
  return { f0: sm, rms, hop: 0.01, start, end, peak, voiced: sm.filter(Boolean).length };
}
// the voiced part as semitones around the speaker's own median (gaps bridged): [semitones]
export function semitones(tr){
  if (tr.end < tr.start) return [];
  const part = tr.f0.slice(tr.start, tr.end + 1), med = median(part);
  const st = part.map(v => v ? 12 * Math.log2(v / med) : null);
  for (let i = 0; i < st.length; i++) if (st[i] === null){ let j = i; while (j < st.length && st[j] === null) j++;
    const a = st[i - 1] ?? st[j] ?? 0, b = st[j] ?? a; for (let k = i; k < j; k++) st[k] = a + (b - a) * (k - i + 1) / (j - i + 1); i = j; }
  return st;
}
export function resample(a, n){ if (!a.length) return Array(n).fill(0); if (a.length === 1) return Array(n).fill(a[0]);
  return Array.from({ length: n }, (_, i) => { const x = i * (a.length - 1) / (n - 1), k = Math.floor(x), f = x - k; return a[k] + ((a[k + 1] ?? a[k]) - a[k]) * f; }); }
const centred = a => { const m = a.reduce((s, v) => s + v, 0) / (a.length || 1); return a.map(v => v - m); };
// dynamic time warping: mean absolute difference along the best alignment (allows small timing differences)
export function dtw(a, b, band = 0.2){
  const n = a.length, m = b.length, w = Math.max(2, Math.round(Math.max(n, m) * band));
  const D = Array.from({ length: n + 1 }, () => new Float64Array(m + 1).fill(Infinity)); D[0][0] = 0;
  const L = Array.from({ length: n + 1 }, () => new Uint16Array(m + 1));
  for (let i = 1; i <= n; i++) for (let j = Math.max(1, Math.round(i * m / n) - w); j <= Math.min(m, Math.round(i * m / n) + w); j++){
    const c = Math.abs(a[i - 1] - b[j - 1]); let best = D[i - 1][j - 1], len = L[i - 1][j - 1];
    if (D[i - 1][j] < best){ best = D[i - 1][j]; len = L[i - 1][j]; } if (D[i][j - 1] < best){ best = D[i][j - 1]; len = L[i][j - 1]; }
    D[i][j] = best + c; L[i][j] = len + 1; }
  return D[n][m] / Math.max(1, L[n][m]);
}
// Chao levels (1–5) to semitones: about 2.5 semitones a step for a relaxed speaking range
export const levelsToSemis = curve => centred(curve.map(v => (v - 3) * 2.5));
const slope = a => { const k = Math.max(1, Math.round(a.length * 0.25)); const head = a.slice(0, k), tail = a.slice(-k); return tail.reduce((s, v) => s + v, 0) / tail.length - head.reduce((s, v) => s + v, 0) / head.length; };

// Tone shape: learner's semitone curve against the target (both centred, so only the shape and the relative heights
// inside the word count, not how high or low the voice is). { score 0–100, issue, slope, want }
export function toneShape(learner, target, n = 48){
  if (learner.length < 5) return { score: 0, issue: "no_voice" };
  const a = centred(resample(learner, n)), b = centred(resample(target, n));
  const dist = dtw(a, b), s1 = slope(a), s2 = slope(b);
  let score = Math.round(Math.max(0, Math.min(100, 100 - Math.max(0, dist - 0.5) * 22)));
  let issue = "ok";
  if (Math.abs(s2) >= 2 && Math.sign(s1) !== Math.sign(s2) && Math.abs(s1) >= 1.2) issue = s2 > 0 ? "should_rise" : "should_fall";
  else if (s2 >= 2 && s1 < s2 * 0.4) issue = "rise_more";
  else if (s2 <= -2 && s1 > s2 * 0.4) issue = "fall_more";
  else if (Math.abs(s2) < 1.5 && Math.abs(s1) > 3.5) issue = "keep_level";
  if (issue !== "ok" && score > 60) score = 60;              // a shape that needs work is never a good score
  if (issue === "should_rise" || issue === "should_fall") score = Math.min(score, 45);
  return { score, issue, slope: Math.round(s1 * 10) / 10, want: Math.round(s2 * 10) / 10 };
}
// Length: voiced seconds against the model's (or the expected length of the word's syllables)
export function lengthCheck(seconds, want){
  if (!(seconds > 0)) return { score: 0, issue: "no_voice" };
  const r = seconds / want;
  if (r < 0.55) return { score: Math.round(100 * r / 0.55 * 0.6), issue: "too_short", ratio: r };
  if (r > 2.1) return { score: Math.max(30, Math.round(100 - (r - 2.1) * 60)), issue: "too_long", ratio: r };
  return { score: r < 0.75 ? 80 : 100, issue: r < 0.75 ? "bit_short" : "ok", ratio: r };
}
// expected length of a word from its syllables (long vowels ~0.38 s, short ~0.22 s, short closed ~0.18 s)
export const expectedSeconds = syl => syl.reduce((s, x) => s + (x.long ? 0.38 : x.dead ? 0.18 : 0.22), 0);
// Clarity: loud enough, mostly voiced, not clipped
export function clarity(tr, samples){
  if (!tr.voiced) return { score: 0, issue: "no_voice" };
  let clip = 0; for (let i = 0; i < samples.length; i += 4) if (Math.abs(samples[i]) > 0.985) clip++;
  if (tr.peak < 0.015) return { score: 40, issue: "too_quiet" };
  if (clip > samples.length / 4 * 0.01) return { score: 60, issue: "too_loud" };
  const span = tr.end - tr.start + 1, ratio = tr.voiced / Math.max(1, span);
  return ratio < 0.5 ? { score: 60, issue: "unclear" } : { score: 100, issue: "ok" };
}

// Everything for one attempt. target: { curve (Chao levels, the word's tones), syl } and optionally model: { semis, seconds }
// (from the teacher's recording); recognised: similarity 0–1 from speech recognition, when the browser has it.
export function assess(samples, sampleRate, target, { model = null, recognised = null } = {}){
  const tr = track(samples, sampleRate), st = semitones(tr), seconds = tr.voiced ? (tr.end - tr.start + 1) * tr.hop : 0;
  const clear = clarity(tr, samples);
  if (!tr.voiced || st.length < 5) return { score: 0, tone: { score: 0, issue: "no_voice" }, length: { score: 0, issue: "no_voice" }, clarity: clear, curve: [], target: [], seconds: 0, issues: ["no_voice"] };
  const want = model && model.semis && model.semis.length > 5 ? model.semis : levelsToSemis(target.curve);
  const tone = toneShape(st, want);
  // per syllable (words of 2+ syllables): the learner's curve cut in proportion to the syllables' lengths
  let worst = null;
  if (!model && target.syl && target.syl.length > 1){
    const w = target.syl.map(s => s.long ? 1 : 0.7), tot = w.reduce((a, b) => a + b, 0); let a0 = 0, b0 = 0; const T = levelsToSemis(target.curve);
    target.syl.forEach((s, i) => { const la = Math.round(a0 / tot * st.length), lb = Math.round((a0 + w[i]) / tot * st.length), ta = Math.round(b0 / tot * T.length), tb = Math.round((b0 + w[i]) / tot * T.length);
      a0 += w[i]; b0 += w[i]; if (lb - la < 4) return; const r = toneShape(st.slice(la, lb), T.slice(ta, tb), 24);
      if (r.issue !== "ok" && (!worst || r.score < worst.score)) worst = Object.assign(r, { syllable: s.text, index: i, tone: s.tone }); });
    if (worst && tone.issue === "ok"){ tone.issue = worst.issue; tone.score = Math.min(tone.score, Math.max(worst.score, 50)); }
  }
  const length = lengthCheck(seconds, model && model.seconds ? model.seconds : expectedSeconds(target.syl || []) || 0.4);
  const parts = recognised === null ? [[tone.score, 0.65], [length.score, 0.2], [clear.score, 0.15]] : [[tone.score, 0.5], [length.score, 0.15], [clear.score, 0.1], [Math.round(recognised * 100), 0.25]];
  const score = Math.round(parts.reduce((s, [v, w]) => s + v * w, 0));
  const issues = [tone.issue, length.issue, clear.issue].filter(x => x && x !== "ok");
  return { score, tone, length, clarity: clear, worst, curve: st, target: want, seconds, issues, recognised };
}
