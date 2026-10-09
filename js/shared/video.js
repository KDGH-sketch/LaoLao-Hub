// Video helpers shared by the learner app and the admin:
//   - transcript parsing (YouTube "Show transcript" copy, SRT, WebVTT, plain text)
//   - time sync (which transcript line is playing at a given second)
//   - a player wrapper that reports the current time (YouTube IFrame API, or <video> for files)
import { videoSource } from "./ui.js";

// ---------- time ----------
// "1:02:03.5", "02:03", "00:00:01,000", "83", 83 → seconds (null when not a time)
export function parseTime(v){
  if (typeof v === "number") return Number.isFinite(v) && v >= 0 ? v : null;
  const s = String(v ?? "").trim().replace(",", ".");
  if (!s) return null;
  if (/^\d+(\.\d+)?$/.test(s)) return +s;
  const m = s.match(/^(?:(\d{1,2}):)?(\d{1,2}):(\d{2})(\.\d+)?$/);
  if (!m) return null;
  return (+m[1] || 0) * 3600 + (+m[2]) * 60 + (+m[3]) + (m[4] ? +m[4] : 0);
}
// 75.4 → "1:15", 3725 → "1:02:05"
export function formatTime(sec){
  if (sec == null || !Number.isFinite(+sec)) return "";
  sec = Math.max(0, Math.floor(+sec));
  const h = Math.floor(sec / 3600), m = Math.floor(sec / 60) % 60, s = sec % 60;
  return (h ? h + ":" + String(m).padStart(2, "0") : m) + ":" + String(s).padStart(2, "0");
}

// ---------- transcript parsing ----------
const decode = s => s.replace(/<[^>]+>/g, "").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&#39;/g, "'").replace(/&quot;/g, '"');
const clean = s => decode(s).replace(/\s+/g, " ").trim();
const TS = "(?:\\d{1,2}:)?\\d{1,2}:\\d{2}(?:[.,]\\d{1,3})?";
// "5 seconds", "1 minute, 5 seconds" — accessibility labels that YouTube's panel copies along with the text
const DURATION_LABEL = /^\d+\s+(hours?|minutes?|seconds?)(,?\s+\d+\s+(hours?|minutes?|seconds?))*$/i;

// Returns { format, segments:[{start,end,text}], timed, warnings }
export function parseTranscript(input){
  const text = String(input || "").replace(/^﻿/, "").replace(/\r\n?/g, "\n");
  if (!text.trim()) return { format: "empty", segments: [], timed: false, warnings: ["Nothing to import."] };
  if (/^\s*WEBVTT/.test(text) || new RegExp(TS + "\\s*-->\\s*" + TS).test(text)) return parseCues(text);
  return parseLines(text);
}

function parseCues(text){
  const format = /^\s*WEBVTT/.test(text) ? "vtt" : "srt";
  const segs = [];
  for (const block of text.split(/\n{2,}/)){
    const lines = block.split("\n");
    const i = lines.findIndex(l => l.includes("-->"));
    if (i < 0) continue;
    const [a, b] = lines[i].split("-->");
    const start = parseTime(a.trim().split(/\s/)[0]), end = parseTime(b.trim().split(/\s/)[0]);
    if (start == null) continue;
    let body = clean(lines.slice(i + 1).join(" "));
    // YouTube auto-captions repeat the previous line at the top of each cue ("rolling" captions)
    const prev = segs[segs.length - 1];
    if (prev && body === prev.text){ prev.end = Math.max(prev.end || 0, end || 0); continue; }
    if (prev && body.startsWith(prev.text + " ")) body = body.slice(prev.text.length + 1).trim();
    if (!body) continue;
    segs.push({ start, end, text: body });
  }
  const segments = normalizeSegments(segs);
  return { format, segments, timed: segments.length > 0, warnings: segments.length ? [] : ["No caption lines found."] };
}

function parseLines(text){
  const lead = new RegExp("^[\\[(]?(" + TS + ")[\\])]?\\s*(?:[-–—:|]\\s*)?(.*)$");
  const segs = []; let cur = null, timedCount = 0;
  for (const raw of text.split("\n")){
    const line = raw.trim();
    if (!line || DURATION_LABEL.test(line)) continue;
    const m = line.match(lead);
    if (m){ timedCount++; cur = { start: parseTime(m[1]), text: clean(m[2]) }; segs.push(cur); continue; }
    if (cur) cur.text = clean((cur.text ? cur.text + " " : "") + line);
    else segs.push({ start: null, text: clean(line) });
  }
  if (!timedCount){
    return { format: "text", segments: segs.filter(s => s.text), timed: false,
      warnings: ["No timestamps found: lines will show as a plain transcript without syncing to the video."] };
  }
  const untimed = segs.filter(s => s.start == null).length;
  const segments = normalizeSegments(segs.filter(s => s.start != null));
  const warnings = untimed ? [`${untimed} line(s) before the first timestamp were skipped.`] : [];
  if (segs.some(s => s.start != null && !s.text)) warnings.push("Some timestamps had no text and were skipped.");
  return { format: "youtube", segments, timed: true, warnings };
}

// Sort by start time, drop empty lines, and give every line an end (the next line's start).
export function normalizeSegments(segs){
  const out = (segs || []).filter(s => s && String(s.text || "").trim()).map(s => Object.assign({}, s, { text: String(s.text).trim() }));
  if (!out.length || out.some(s => parseTime(s.start) == null)) return out;
  out.forEach(s => { s.start = parseTime(s.start); if (s.end != null) s.end = parseTime(s.end); });
  out.sort((a, b) => a.start - b.start);
  out.forEach((s, i) => {
    const next = out[i + 1];
    if (next && (s.end == null || s.end > next.start)) s.end = next.start;
    if (s.end == null || s.end <= s.start) s.end = s.start + Math.max(2, Math.min(6, s.text.length / 12));
  });
  return out;
}

// Adds a translation (e.g. English) to each line, matched by the nearest start time (within `tolerance` seconds).
export function mergeTranslation(segs, trSegs, key = "en", tolerance = 2.5){
  let matched = 0;
  for (const s of segs){
    let best = null, d = Infinity;
    for (const t of trSegs){ const dd = Math.abs((t.start ?? 1e9) - s.start); if (dd < d){ d = dd; best = t; } }
    if (best && d <= tolerance){ s[key] = best.text; matched++; }
  }
  return matched;
}

// Index of the line playing at time t (the last line that has started), or -1 before the first line.
export function activeIndex(segs, t){
  let lo = 0, hi = segs.length - 1, ans = -1;
  while (lo <= hi){ const mid = (lo + hi) >> 1; if (segs[mid].start <= t + 0.05){ ans = mid; lo = mid + 1; } else hi = mid - 1; }
  return ans;
}

// ---------- reading video documents (supports the older data shape) ----------
// Older videos stored "transcript" as untimed teaching phrases { sp, lo, rom, en } with no start times.
const isTimedLine = l => l && parseTime(l.start) != null;
export function transcriptOf(v){
  const raw = Array.isArray(v && v.transcript) ? v.transcript : [];
  if (raw.length && raw.every(isTimedLine)){
    const lines = normalizeSegments(raw.map(l => Object.assign({}, l, { text: l.text || l.lo || "" })));
    return { timed: true, lines };
  }
  return { timed: false, lines: [] };
}
export function recapOf(v){
  const r = (v && v.recap) || {};
  let points = Array.isArray(r.points) ? r.points.filter(p => p && (p.lo || p.en)) : [];
  const raw = Array.isArray(v && v.transcript) ? v.transcript : [];
  if (!points.length && raw.length && !raw.every(isTimedLine)) points = raw.filter(p => p && (p.lo || p.en)).map(p => ({ lo: p.lo || p.text || "", rom: p.rom || "", en: p.en || "" }));
  const summary = r.summary && Object.values(r.summary).some(Boolean) ? r.summary : null;
  const vocab = Array.isArray(v && v.vocab) ? v.vocab.filter(w => w && w.lo) : [];
  return { summary, points, vocab, empty: !summary && !points.length && !vocab.length };
}

// ---------- player ----------
let ytApi = null;
export function loadYouTubeApi(timeout = 12000){
  if (typeof window === "undefined") return Promise.reject(new Error("no window"));
  if (window.YT && window.YT.Player) return Promise.resolve(window.YT);
  if (!ytApi) ytApi = new Promise((res, rej) => {
    const prev = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => { if (prev) try { prev(); } catch(e){} res(window.YT); };
    const s = document.createElement("script");
    s.src = "https://www.youtube.com/iframe_api"; s.async = true;
    s.onerror = () => { ytApi = null; rej(new Error("YouTube player could not load")); };
    document.head.append(s);
    setTimeout(() => { if (!(window.YT && window.YT.Player)){ ytApi = null; rej(new Error("YouTube player timed out")); } }, timeout);
  });
  return ytApi;
}

// Mounts a player into `host` and calls onTime(seconds) while it plays.
// Returns { sync, seek(t), play(), pause(), time(), destroy() }; sync=false when the time can't be read.
export async function mountPlayer(host, url, { onTime = () => {}, onState = () => {} } = {}){
  const src = videoSource(url);
  let timer = null, last = -1, destroyed = false;
  const stop = () => { clearInterval(timer); timer = null; };
  const watch = getTime => {
    stop();
    timer = setInterval(() => {
      if (!host.isConnected){ ctl.destroy(); return; }          // the page was left
      const t = getTime(); if (t != null && Math.abs(t - last) > 0.01){ last = t; onTime(t); }
    }, 200);
  };
  const plainIframe = s => {
    host.replaceChildren(Object.assign(document.createElement("iframe"), { src: s, title: "Video", allowFullscreen: true }));
    host.firstChild.setAttribute("allow", "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share");
    host.firstChild.setAttribute("referrerpolicy", "strict-origin-when-cross-origin");
  };
  const ctl = { sync: false, kind: src.kind, seek(){}, play(){}, pause(){}, time: () => last,
    destroy(){ if (destroyed) return; destroyed = true; stop(); try { ctl._destroy && ctl._destroy(); } catch(e){} } };
  host.__player = ctl;                                          // used by the browser tests

  if (src.kind === "invalid"){ host.replaceChildren(Object.assign(document.createElement("div"), { className: "vd-novideo", textContent: "This video link is not valid." })); return ctl; }
  if (src.kind === "iframe"){ plainIframe(src.src); return ctl; }

  if (src.kind === "file"){
    const v = document.createElement("video");
    Object.assign(v, { src: src.src, controls: true, preload: "metadata", playsInline: true });
    host.replaceChildren(v);
    Object.assign(ctl, { sync: true, seek: (t, play = true) => { v.currentTime = t; if (play) v.play().catch(() => {}); },
      play: () => v.play().catch(() => {}), pause: () => v.pause(), time: () => v.currentTime, _destroy: () => v.pause() });
    v.addEventListener("play", () => { onState("playing"); watch(() => v.currentTime); });
    v.addEventListener("pause", () => { onState("paused"); stop(); onTime(v.currentTime); });
    v.addEventListener("seeked", () => onTime(v.currentTime));
    v.addEventListener("ended", () => { stop(); onTime(v.currentTime); onState("ended"); });
    return ctl;
  }

  // YouTube: use the IFrame API so the current time can be read
  try {
    const YT = await loadYouTubeApi();
    if (destroyed) return ctl;
    const div = document.createElement("div"); host.replaceChildren(div);
    const start = (src.src.match(/[?&]start=(\d+)/) || [])[1];
    await new Promise((res, rej) => {
      const p = new YT.Player(div, {
        videoId: src.id, width: "100%", height: "100%",
        playerVars: { rel: 0, playsinline: 1, modestbranding: 1, origin: location.origin, ...(start ? { start: +start } : {}) },
        events: {
          onReady: () => {
            Object.assign(ctl, { sync: true, player: p,
              seek: (t, play = true) => { p.seekTo(t, true); if (play) p.playVideo(); onTime(t); },
              play: () => p.playVideo(), pause: () => p.pauseVideo(), time: () => p.getCurrentTime(),
              _destroy: () => p.destroy() });
            res();
          },
          onStateChange: e => {
            const S = YT.PlayerState;
            if (e.data === S.PLAYING){ onState("playing"); watch(() => p.getCurrentTime()); }
            else { if (e.data === S.PAUSED) onState("paused"); if (e.data === S.ENDED) onState("ended"); stop(); try { onTime(p.getCurrentTime()); } catch(err){} }
          },
          onError: e => { onState("error", e.data); }
        }
      });
      setTimeout(() => rej(new Error("YouTube player did not become ready")), 15000);
    });
  } catch(e){
    console.warn("LaoLao video:", e.message, "— falling back to a plain embed (no transcript sync).");
    if (!destroyed){ ctl.sync = false; plainIframe(src.src); }
  }
  return ctl;
}
