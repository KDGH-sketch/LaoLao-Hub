// Practice coach: follows every checked answer and works out, per skill, how good the learner is now (recent answers
// count more than old ones), how sure that estimate is, whether the skill is going up or down, how fast the answers
// come, and which words and sentences keep going wrong. From that it writes plain-language advice, picks the next
// practice sets and builds a Smart session that trains the weak skills most. All on the device; pure functions, no DOM
// (tests: scripts/test_practice.mjs). Stored in progress/{uid}.coach.
export const COACH_SKILLS = ["vocabulary","listening","speaking","reading","writing","grammar","sentence","pinyin","characters"];
const DECAY = 0.94;            // each new answer in a skill weighs as much as ~16 old ones together: the estimate follows recent form
const DAY = 864e5;
export const dayKey = (t = Date.now()) => { const d = new Date(t); return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"); };

export function coachInit(state, legacy = {}){
  const s = state && typeof state === "object" ? state : {};
  s.v = 1; for (const k of ["sk","d","it","sets","daily","best"]) if (!s[k] || typeof s[k] !== "object") s[k] = {};
  // first time: start from the old right / total counters (worth at most 12 answers, so new practice takes over quickly)
  if (!s.seeded){ for (const [k, v] of Object.entries(legacy || {})) if (COACH_SKILLS.includes(k) && v && v.t > 0){ const f = Math.min(1, 12 / v.t);
    s.sk[k] = { a:1 + v.r * f, b:1 + (v.t - v.r) * f, n:v.t, ms:0, last:0 }; } s.seeded = 1; }
  return s;
}
// one checked answer: { skill, correct, ms, item:{ k, py, en, zh }, now }
export function coachAnswer(s, { skill, correct, ms = 0, item = null, now = Date.now() }){
  if (!COACH_SKILLS.includes(skill)) skill = "reading";
  const k = s.sk[skill] = s.sk[skill] || { a:1, b:1, n:0, ms:0, last:0 };
  k.a = 1 + (k.a - 1) * DECAY + (correct ? 1 : 0); k.b = 1 + (k.b - 1) * DECAY + (correct ? 0 : 1); k.n++; k.last = now;
  if (ms > 300 && ms < 120000) k.ms = k.ms ? Math.round(k.ms * 0.8 + ms * 0.2) : Math.round(ms);
  const day = dayKey(now), d = s.d[day] = s.d[day] || {}; const c = d[skill] = d[skill] || [0, 0]; c[1]++; if (correct) c[0]++;
  if (item && item.k){ const key = String(item.k).slice(0, 80); const it = s.it[key] = s.it[key] || { w:0, r:0, s:0, t:0 };
    Object.assign(it, { py:item.py || it.py || "", en:String(item.en || it.en || "").slice(0, 120), zh:String(item.zh || it.zh || "").slice(0, 60) });
    if (correct){ it.r++; it.s++; } else { it.w++; it.s = 0; } it.t = now; }
  return s;
}
// a finished round of a practice set
export function coachRound(s, { setId, right, total, stars = 0, now = Date.now() }){
  if (!setId || !total) return s;
  const r = s.sets[setId] = s.sets[setId] || { b:0, s:0, p:0, l:0 };
  const pct = Math.round(100 * right / total); r.b = Math.max(r.b, pct); r.s = Math.max(r.s, stars | 0); r.p++; r.l = now;
  return s;
}
// keep the record small: 120 days of history, the 300 most recent words and sentences
export function coachTrim(s, now = Date.now()){
  for (const k of Object.keys(s.d)) if (now - new Date(k + "T00:00:00").getTime() > 120 * DAY) delete s.d[k];
  const items = Object.entries(s.it); if (items.length > 300){ items.sort((a, b) => b[1].t - a[1].t); s.it = Object.fromEntries(items.slice(0, 300)); }
  for (const k of Object.keys(s.daily)) if (now - new Date(k + "T00:00:00").getTime() > 60 * DAY) delete s.daily[k];
  return s;
}

// ---------- reading the record ----------
export const levelOf = score => score >= 90 ? "mastered" : score >= 75 ? "strong" : score >= 55 ? "good" : score >= 35 ? "developing" : "beginner";
// accuracy in a window of days for a skill (or all skills): { r, t }
export function windowAcc(s, skill, fromDaysAgo, toDaysAgo, now = Date.now()){
  let r = 0, t = 0;
  for (let i = toDaysAgo; i < fromDaysAgo; i++){ const d = s.d[dayKey(now - i * DAY)]; if (!d) continue;
    for (const [k, c] of Object.entries(d)) if (!skill || k === skill){ r += c[0]; t += c[1]; } }
  return { r, t };
}
export function skillProfile(s, now = Date.now()){
  return COACH_SKILLS.map(skill => {
    const k = s.sk[skill];
    if (!k || !k.n) return { skill, score:null, conf:0, n:0, trend:null, ms:0, level:"none" };
    const est = k.a / (k.a + k.b), eff = k.a + k.b - 2, conf = 1 - Math.exp(-eff / 6);
    // shown score: the estimate pulled toward 50% while there is little evidence
    const score = Math.round(100 * (est * conf + 0.5 * (1 - conf)));
    const a = windowAcc(s, skill, 7, 0, now), b = windowAcc(s, skill, 14, 7, now);
    const trend = a.t >= 5 && b.t >= 5 ? Math.round(100 * (a.r / a.t - b.r / b.t)) : null;
    return { skill, score, conf, n:k.n, trend, ms:k.ms || 0, level:k.n < 5 ? "calibrating" : levelOf(score), last:k.last };
  });
}
// words and sentences that keep going wrong (not yet put right twice in a row), worst first
export function mistakes(s, limit = 30){
  return Object.entries(s.it).filter(([, it]) => it.w > 0 && it.s < 2).map(([k, it]) => Object.assign({ k }, it))
    .sort((a, b) => (b.w - b.r * 0.5) - (a.w - a.r * 0.5) || b.t - a.t).slice(0, limit);
}
export function daysActive(s, days = 7, now = Date.now()){ let n = 0; for (let i = 0; i < days; i++) if (s.d[dayKey(now - i * DAY)]) n++; return n; }
export function totalStars(s){ return Object.values(s.sets).reduce((n, r) => n + (r.s || 0), 0); }

// ---------- Practice Master ranks (stars earned across the library) ----------
export const RANKS = [
  { key:"starter", at:0 }, { key:"explorer", at:6 }, { key:"achiever", at:20 }, { key:"skilled", at:45 },
  { key:"expert", at:80 }, { key:"master", at:130 }, { key:"grandmaster", at:200 }, { key:"legend", at:300 }
];
export function rankOf(stars){
  let i = 0; while (i + 1 < RANKS.length && stars >= RANKS[i + 1].at) i++;
  const cur = RANKS[i], next = RANKS[i + 1] || null;
  return { idx:i, key:cur.key, stars, next: next ? next.key : null, need: next ? next.at - stars : 0, pct: next ? Math.round(100 * (stars - cur.at) / (next.at - cur.at)) : 100 };
}

// ---------- advice ----------
// [{ kind: "start"|"strong"|"focus"|"up"|"down"|"slow"|"mistakes"|"habit"|"untried"|"steady", skill?, n?, words? }] most useful first
export function insights(s, now = Date.now()){
  const prof = skillProfile(s, now), known = prof.filter(p => p.n >= 5), out = [];
  if (!known.length) return [{ kind:"start" }];
  const best = known.slice().sort((a, b) => b.score - a.score)[0], worst = known.slice().sort((a, b) => a.score - b.score)[0];
  if (worst && worst.score < 70) out.push({ kind:"focus", skill:worst.skill, n:worst.score });
  const down = prof.filter(p => p.trend !== null && p.trend <= -10).sort((a, b) => a.trend - b.trend)[0];
  if (down) out.push({ kind:"down", skill:down.skill, n:-down.trend });
  const miss = mistakes(s, 3); if (miss.length >= 2) out.push({ kind:"mistakes", n:mistakes(s, 99).length, words:miss.map(m => m.k) });
  const up = prof.filter(p => p.trend !== null && p.trend >= 10).sort((a, b) => b.trend - a.trend)[0];
  if (up) out.push({ kind:"up", skill:up.skill, n:up.trend });
  if (best && best.score >= 70 && (!worst || best.skill !== worst.skill)) out.push({ kind:"strong", skill:best.skill, n:best.score });
  const timed = known.filter(p => p.ms > 0), avg = timed.length ? timed.reduce((n, p) => n + p.ms, 0) / timed.length : 0;
  const slow = timed.filter(p => p.ms > avg * 1.5 && p.ms > 6000).sort((a, b) => b.ms - a.ms)[0];
  if (slow) out.push({ kind:"slow", skill:slow.skill, n:Math.round(slow.ms / 1000) });
  const untried = prof.filter(p => !p.n).map(p => p.skill); if (untried.length) out.push({ kind:"untried", skill:untried[0], n:untried.length });
  const act = daysActive(s, 7, now); out.push({ kind: act >= 5 ? "steady" : "habit", n:act });
  return out;
}

// how much each skill should be trained now: weak, unsure and not-yet-tried skills get more
export function skillWeights(s, now = Date.now()){
  const w = {};
  for (const p of skillProfile(s, now)){
    if (p.score === null){ w[p.skill] = 0.9; continue; }
    const stale = p.last ? Math.min(1, (now - p.last) / (7 * DAY)) : 1;
    w[p.skill] = 0.15 + (1 - p.score / 100) * 1.4 + (1 - p.conf) * 0.4 + stale * 0.25 + (p.trend !== null && p.trend < 0 ? 0.3 : 0);
  }
  return w;
}
// the skills of a Smart session, n questions: drawn by weight, at least 3 different skills, weakest first
export function planSkills(s, n = 10, rand = Math.random, now = Date.now()){
  const w = skillWeights(s, now), keys = Object.keys(w), out = [];
  const total = keys.reduce((t, k) => t + w[k], 0);
  for (let i = 0; i < n; i++){ let x = rand() * total, k = keys[0]; for (const kk of keys){ x -= w[kk]; if (x <= 0){ k = kk; break; } } out.push(k); }
  // variety: swap repeated skills for the next-weakest missing ones until there are at least 3 different skills
  const order = keys.slice().sort((a, b) => w[b] - w[a]), need = Math.min(3, keys.length, n);
  for (const k of order){
    if (new Set(out).size >= need) break; if (out.includes(k)) continue;
    const counts = {}; out.forEach(x => counts[x] = (counts[x] || 0) + 1);
    const at = out.map((x, i) => i).reverse().find(i => counts[out[i]] > 1); if (at === undefined) break; out[at] = k;
  }
  return out.sort((a, b) => w[b] - w[a]);
}
// the next practice sets: the weakest skills' tracks at the learner's stage, unfinished first
export function recommend(s, catalog, { stage = 1, can = () => true, n = 3, now = Date.now(), trackSkill = {} } = {}){
  const w = skillWeights(s, now);
  const scored = catalog.filter(x => x.stage <= stage + 1 && can(x)).map(x => {
    const rec = s.sets[x.id], skill = trackSkill[x.track] || "vocabulary";
    const done = rec ? rec.s / 3 : 0, fresh = rec ? Math.min(1, (now - rec.l) / (5 * DAY)) : 1;
    return { x, v: (w[skill] || 0.5) * 2 + (1 - done) * 1.2 + fresh * 0.4 - Math.max(0, x.stage - stage) * 0.6 + (rec ? 0 : 0.2) };
  }).sort((a, b) => b.v - a.v);
  const out = [], tracks = new Set();
  for (const { x } of scored){ if (out.length >= n) break; if (tracks.has(x.track)) continue; tracks.add(x.track); out.push(x); }
  for (const { x } of scored){ if (out.length >= n) break; if (!out.includes(x)) out.push(x); }
  return out;
}
