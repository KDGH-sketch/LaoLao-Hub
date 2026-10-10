// Learner app state, data access and progress tracking
import { h, icon, toast, todayKey, tr, rnd, shuffle, isHan, setTheme, getTheme, withTransition } from "../shared/ui.js";
import { t, lang, setLang } from "../shared/i18n.js";
import { loadBundle, SKILLS, TIERS } from "../shared/content.js";
import { createAccessControl } from "../shared/access.js";
import { loadDict, dict, chars, mergeVocabulary } from "../shared/dict.js";
import { makeEngine } from "../shared/engine.js";
import { updateStats, isTricky, srsGradeFor } from "../shared/flashcards.js";
import { normalizeGrammar } from "../shared/grammar.js";
import { patternProg } from "../shared/pattern-studio.js";
import { shapeItem } from "../shared/shape.js";
import { setSpeechSettings, setAudioLibrary, setAudioGate } from "../shared/speech.js";
import { ctx } from "../shared/widgets.js";
import { coachInit, coachTrim } from "../shared/practice-coach.js";
import { pronInit } from "../shared/pron-profile.js";
import { setSfx, sfx } from "../shared/sfx.js";
import { mergeRules, lessonPoints, reviewPoints, dailyAward, levelFromXP, wilsonLower, skillMastery, earnedAchievements, handwritingRound } from "../shared/scoring.js";

export const A = {
  api:null, user:null, profile:null, access:null, isAdmin:false, tier:0, settings:{}, plans:[], ac:null, ent:null,
  B:null, P:{}, byType:{}, catalog:[], examples:[], engine:null,
  prog:{ skills:{}, lessons:{}, patterns:{}, days:{}, answers:{r:0,t:0}, last:null },
  srs:{}, saved:{}, view:{ name:"home", params:{} }, hist:[], render:()=>{}
};
export const prefs = () => Object.assign({ uiLang:"en", explainLang:"", showPy:true, showTr:true, toneColor:true, rate:0.85, voice:"", sfx:true, sfxVol:0.6, theme:getTheme()||"day" }, (A.profile && A.profile.prefs) || {});
export const expLang = () => prefs().explainLang || lang();
let prefT;
export function setPref(k, v){
  A.profile.prefs = Object.assign({}, A.profile.prefs||{}, { [k]:v });
  if (k==="uiLang") setLang(v);
  if (k==="theme") setTheme(v);
  applyPrefs();
  clearTimeout(prefT); prefT = setTimeout(() => A.api.db.update(`users/${A.user.uid}`, { prefs: A.profile.prefs }).catch(()=>{}), 400);
}
export function applyPrefs(){
  const p = prefs();
  document.body.classList.toggle("hide-py", !p.showPy);
  document.body.classList.toggle("hide-tr", !p.showTr);
  document.body.classList.toggle("no-tone", !p.toneColor);
  const th = p.theme || getTheme() || "day";
  setTheme(th);
  document.documentElement.lang = lang()==="zh" ? "zh-CN" : lang();
  setSpeechSettings({ rate:p.rate, voice:p.voice, wordByWord:!!p.wordByWord });
  setSfx({ on: p.sfx !== false, vol: p.sfxVol ?? 0.6 });
}

// A theme change reveals the new colours in a circle growing from the button that was pressed (css: "transitions")
export function setThemeFrom(k, ev){
  const r = ev && ev.currentTarget ? ev.currentTarget.getBoundingClientRect() : null;
  return withTransition(() => setPref("theme", k), { kind:"theme", x: r ? r.left + r.width/2 : innerWidth - 40, y: r ? r.top + r.height/2 : 40 });
}

// ---------- profile: nickname and photo ----------
export const displayName = () => String((A.profile && (A.profile.nickname || A.profile.name)) || (A.user && A.user.email ? A.user.email.split("@")[0] : "") || "Learner").trim();
// Only our own resized photos (data:image/…) or https images are shown; anything else falls back to initials
const safeAvatar = v => typeof v === "string" && (/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(v) || /^https:\/\/[^\s"'<>]+$/.test(v)) ? v : null;
const initials = n => (n.match(/[\p{L}\p{N}]/gu) || ["?"]).slice(0, 2).join("").toUpperCase();
const hue = s => { let x = 0; for (const c of String(s || "")) x = (x * 31 + c.charCodeAt(0)) % 360; return x; };
export function avatarEl(size = "md"){
  const src = safeAvatar(A.profile && A.profile.avatar), name = displayName();
  return src ? h("img",{class:"av av-"+size, src, alt:"", decoding:"async"})
    : h("span",{class:"av av-"+size, "aria-hidden":"true", style:`--av-h:${hue(A.user && A.user.uid)}`}, initials(name));
}
// A chosen photo becomes a small square JPEG (192 px, about 15 KB) stored on the learner's own profile
export async function imageToAvatar(file){
  if (!file || !/^image\//.test(file.type)) throw new Error(t("pf_photo_type"));
  if (file.size > 10e6) throw new Error(t("pf_photo_big"));
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error(t("pf_photo_type"))); i.src = url; });
    const S = 192, c = document.createElement("canvas"), side = Math.min(img.naturalWidth, img.naturalHeight);
    c.width = c.height = S;
    c.getContext("2d").drawImage(img, (img.naturalWidth - side) / 2, (img.naturalHeight - side) / 2, side, side, 0, 0, S, S);
    return c.toDataURL("image/jpeg", 0.85);
  } finally { URL.revokeObjectURL(url); }
}
export async function saveProfile(patch){
  Object.assign(A.profile, patch);
  await A.api.db.update(`users/${A.user.uid}`, patch);
}

// ---------- loading ----------
const PENDING = "laolao.pendingProfile";
export const rememberPendingProfile = (email, name) => { try { localStorage.setItem(PENDING, JSON.stringify({ email: String(email).toLowerCase(), name })); } catch(e){} };
// The learner profile + free access created at self-registration (the database only allows this while registration is open)
// Where a sign-up came from (?ref= / utm_* and the offer or plan clicked on the welcome page; see welcome.js).
// Read from this tab only; nothing is sent anywhere before the account exists.
export const SIGNUP_KEY = "laolao.signup";
function signupInfo(){
  try { const v = JSON.parse(sessionStorage.getItem(SIGNUP_KEY) || "null"); if (!v || typeof v !== "object") return null;
    const s = x => x == null ? null : String(x).replace(/[^\w .:/-]/g, "").slice(0, 60) || null;
    return { source: s(v.source) || "direct", offerId: s(v.offerId), planId: s(v.planId), campaign: s(v.campaign) };
  } catch(e){ return null; }
}
export async function createLearnerProfile(api, user, name, settings){
  const now = new Date();
  const profile = { email:user.email, name:name||"", status:"active", level:1, role:"learner", prefs:{ uiLang:lang(), explainLang:lang() }, createdAt:now, lastActive:now };
  const signup = signupInfo(); if (signup) profile.signup = signup;
  await api.db.set(`users/${user.uid}`, profile);
  await api.db.set(`access/${user.uid}`, { planId:(settings && settings.defaultPlanId)||"free", tier:1, status:"active", start:now, expiresAt:null, source:"registration" });
  try { localStorage.removeItem(PENDING); } catch(e){}
  return profile;
}
export async function loadAccount(user){
  const api = A.api;
  A.user = user;
  const [profile, access, adm, settings, plans] = await Promise.all([
    api.db.get(`users/${user.uid}`).catch(()=>null), api.db.get(`access/${user.uid}`).catch(()=>null),
    api.db.get(`admins/${user.uid}`).catch(()=>null), api.db.get("settings/app").catch(()=>null), api.db.list("plans").catch(()=>[]) ]);
  let prof = profile, acc = access;
  // Signed in without a profile: a self-registration that needed email confirmation first. Finish it now.
  if (!prof && !adm && settings && settings.allowRegistration){
    let pending = null; try { pending = JSON.parse(localStorage.getItem(PENDING) || "null"); } catch(e){}
    const name = pending && pending.email === String(user.email).toLowerCase() ? pending.name : "";
    try { prof = await createLearnerProfile(api, user, name, settings); acc = await api.db.get(`access/${user.uid}`).catch(()=>null); } catch(e){ console.warn("Could not create the learner profile:", e.message); }
  }
  A.profile = prof || { email:user.email, name:"", status:"active", level:1, prefs:{} };
  A.rules = mergeRules(settings && settings.scoring);   // admin overrides from Settings → Scoring rules
  A.access = acc; A.isAdmin = !!adm; A.settings = settings || {}; A.plans = plans.sort((a,b)=>(a.order||0)-(b.order||0));
  // One entitlement payload per session (plan, features, limits, counters); the database decides content and counts.
  // Without a profile the database gives public content only; the resolver matches that.
  A.ac = createAccessControl(api); ctx.ac = A.ac;
  A.ent = await A.ac.load({ uid:user.uid, isAdmin:A.isAdmin, user: prof ? A.profile : null, access: acc, plans: A.plans, settings: A.settings });
  A.tier = A.ent.tier;
  // Native recordings: plays while the plan allows it (counted in the background); otherwise the device voice reads the text
  let audioNoted = false;
  setAudioGate(() => {
    const lim = A.ac.limit("audio.play"), u = A.ac.usage("audio.play");
    const ok = A.ac.can("audio.play") && !(lim && u && u.used >= lim.n);
    if (ok && lim) A.ac.use("audio.play");
    if (!ok && !audioNoted){ audioNoted = true; toast(t("ac_audio_tts")); }
    return ok;
  });
  const p = prefs(); setLang(p.uiLang || "en"); applyPrefs();
  await Promise.all([loadDict(), loadContent(), loadProgress()]);
  if (A.profile.status==="active") api.db.update(`users/${user.uid}`, { lastActive: new Date() }).catch(()=>{});
}
// After a payment, a plan change, or coming back online: reload the account's access from the database
// (the authority) and, when the content tier changed, the matching content bundle. No sign-out needed.
export async function refreshAccess(){
  const api = A.api, uid = A.user.uid;
  const [access, settings, plans] = await Promise.all([api.db.get(`access/${uid}`).catch(()=>A.access), api.db.get("settings/app").catch(()=>null), api.db.list("plans").catch(()=>A.plans)]);
  A.access = access; if (settings) A.settings = settings; A.plans = (plans||[]).sort((a,b)=>(a.order||0)-(b.order||0));
  const before = A.tier;
  A.ent = await A.ac.load({ uid, isAdmin:A.isAdmin, user:A.profile, access, plans:A.plans, settings:A.settings });
  A.tier = A.ent.tier;
  if (A.tier !== before) await loadContent();
  return A.ent;
}
export async function loadContent(){
  A.B = await loadBundle(A.api, A.tier) || { patterns:[], lessons:[], grammar:[], vocabulary:[], dialogues:[], quizzes:[], audio:[], paths:[], releases:[], lexicon:[], videos:[], tones:[], culture:[], characters:[], dictionary:[], catalog:[] };
  const B = A.B; A.byType = {};
  // every row completed from its type's defaults: a missing field never shows as "undefined" or breaks a page
  for (const ty of ["patterns","lessons","grammar","vocabulary","dialogues","quizzes","audio","paths","releases","videos","tones","culture","characters","dictionary"]) B[ty] = (B[ty]||[]).filter(d => d && d.id != null).map(d => shapeItem(ty, d));
  for (const ty of ["lessons","grammar","vocabulary","dialogues","quizzes","audio","paths","releases","videos","tones","culture","characters","dictionary"]) A.byType[ty] = Object.fromEntries((B[ty]||[]).map(d=>[d.id,d]));
  // the teacher's Pronunciation Studio units (merged with the built-in course in views-pronounce.js)
  A.byType.pronunciation = Object.fromEntries((B.pronunciation||[]).filter(d => d && d.id != null).map(d=>[d.id,d]));
  // grammar rows come in two shapes (older ones keep the explanation in "body"); the pages read one
  for (const id in A.byType.grammar) A.byType.grammar[id] = normalizeGrammar(A.byType.grammar[id]);
  A.P = {};
  (B.patterns||[]).forEach(p => { p.markers = (p.hz.match(/[\u0E80-\u0EFF\u4E00-\u9FA5\w]+/g)||[]); p.l = p.level; A.P[p.n] = p; });
  A.catalog = B.catalog || [];
  const LEX = {}; (B.lexicon||[]).forEach(x => LEX[x.cat||x.id] = x.data);
  mergeVocabulary([...(B.vocabulary||[]), ...(B.dictionary||[])]);
  setAudioLibrary(B.audio||[]);
  A.engine = makeEngine(dict(), chars(), LEX);
  // every example sentence, for "in example sentences" in the dictionary
  A.examples = [];
  (B.patterns||[]).forEach(p => (p.examples||[]).forEach(e => A.examples.push(Object.assign({ pn:p.n }, e))));
  (B.grammar||[]).forEach(g => (g.examples||[]).forEach(e => A.examples.push(e)));
  (B.dialogues||[]).forEach(d => (d.lines||[]).forEach(e => A.examples.push(e)));
}
async function loadProgress(){
  const api = A.api, uid = A.user.uid;
  const [prog, srs, saved] = await Promise.all([
    api.db.get(`progress/${uid}`).catch(()=>null), api.db.list(`reviews/${uid}/items`).catch(()=>[]), api.db.list(`bookmarks/${uid}/items`).catch(()=>[]) ]);
  A.prog = Object.assign({ skills:{}, lessons:{}, patterns:{}, days:{}, answers:{r:0,t:0}, last:null, xp:0, xpDays:{}, goalDays:{}, rounds:{}, stats:{ passed:0, threeStars:0 } }, prog||{});
  ["xpDays","goalDays","rounds"].forEach(k => { if (!A.prog[k] || typeof A.prog[k] !== "object") A.prog[k] = {}; });
  A.prog.stats = Object.assign({ passed:0, threeStars:0 }, A.prog.stats || {});
  if (!prog && A.profile.status==="active") api.db.set(`progress/${uid}`, { skills:{}, lessons:{}, patterns:{}, days:{}, answers:{r:0,t:0}, createdAt:new Date() }).catch(()=>{});
  A.srs = Object.fromEntries(srs.map(x=>[x.id,x]));
  A.saved = Object.fromEntries(saved.map(x=>[x.id,x]));
}

// ---------- tracking ----------
const safeId = id => String(id).replace(/\//g,"∕").slice(0,300);
function progUpdate(data){ if (A.profile.status!=="active") return; A.api.db.update(`progress/${A.user.uid}`, Object.assign(data, { updatedAt:new Date() })).catch(()=>{}); }
// the Practice Studio coach record (progress/{uid}.coach): created from the old skill counters the first time
export function coach(){ if (!A.prog.coach || !A.prog.coach.v) A.prog.coach = coachInit(A.prog.coach, A.prog.skills); return A.prog.coach; }
let coachTimer = null;
export function saveCoach(){ clearTimeout(coachTimer); coachTimer = setTimeout(() => { if (!A.prog || !A.prog.coach) return; coachTrim(A.prog.coach); progUpdate({ coach: A.prog.coach }); }, 200); }
// the Pronunciation Studio profile (progress/{uid}.pron)
export function pron(){ if (!A.prog.pron || !A.prog.pron.u) A.prog.pron = pronInit(A.prog.pron); return A.prog.pron; }
let pronTimer = null;
export function savePron(){ clearTimeout(pronTimer); pronTimer = setTimeout(() => { if (A.prog && A.prog.pron) progUpdate({ pron: A.prog.pron }); }, 300); }
export function touchDay(){ const k = todayKey(); if (!A.prog.days[k]){ A.prog.days[k]=1; progUpdate({ ["days."+k]:1 }); } }
// Checked answers count toward skill accuracy. Self-graded answers (flashcards, handwriting, "I said it well")
// and skipped questions only count as study activity.
export function recordAnswer(skill, correct, meta){
  if (meta && (meta.self || meta.skipped)){ touchDay(); return; }
  skill = SKILLS.includes(skill) ? skill : "reading";
  const s = A.prog.skills[skill] = A.prog.skills[skill] || { r:0, t:0 }; s.t++; if (correct) s.r++;
  A.prog.answers.t++; if (correct) A.prog.answers.r++;
  touchDay();
  progUpdate({ [`skills.${skill}.t`]:A.api.db.inc(1), [`skills.${skill}.r`]:A.api.db.inc(correct?1:0), "answers.t":A.api.db.inc(1), "answers.r":A.api.db.inc(correct?1:0) });
}
export function logEvent(type, data={}, feed=false){
  if (A.profile.status!=="active") return;
  const ev = Object.assign({ type, at:new Date() }, data);
  A.api.db.add(`progress/${A.user.uid}/events`, ev).catch(()=>{});
  if (feed) A.api.db.add("activity", Object.assign({ uid:A.user.uid, name:A.profile.name||A.user.email }, ev)).catch(()=>{});
}
export function setLast(type, id){ A.prog.last = { type, id, at:Date.now() }; progUpdate({ last:{ type, id, at:new Date() } }); }
// A lesson finished through a passed quiz earns full points; "Mark complete" earns a little.
export function completeLesson(id, score, total, stars){
  const viaQuiz = total > 0 && Math.round(100 * score / total) >= A.rules.passPct;
  A.prog.lessons[id] = { done:true, at:Date.now(), score:score||0, total:total||0, stars:stars||0, viaQuiz };
  progUpdate({ ["lessons."+safeId(id)]: { done:true, at:new Date(), score:score||0, total:total||0, stars:stars||0, viaQuiz } });
  logEvent("lesson", { ref:id, score:score||0, total:total||0 }, true); touchDay();
  return award(lessonPoints({ viaQuiz }, A.rules), "lesson");
}

// ---------- XP ----------
// Adds XP with the daily rules: streak bonus on the first XP of the day, goal bonus when crossing the daily goal, daily cap.
export function award(points, reason){
  if (!A.profile || A.profile.status !== "active" || !(points > 0)) return { xp:0, streak:0, goal:0, capped:false };
  const day = todayKey(), todayXP = A.prog.xpDays[day] || 0, lvBefore = level().level;
  const a = dailyAward(points, { todayXP, firstToday: todayXP === 0, streakDays: streak() }, A.rules);
  if (a.xp > 0){
    A.prog.xp = (A.prog.xp || 0) + a.xp; A.prog.xpDays[day] = todayXP + a.xp;
    const upd = { xp: A.api.db.inc(a.xp), ["xpDays."+day]: A.api.db.inc(a.xp) };
    if (a.goal){ A.prog.goalDays[day] = 1; upd["goalDays."+day] = 1; }
    progUpdate(upd);
    logEvent("xp", { ref: reason||"", xp: a.xp });
  }
  if (a.goal) toast(t("sc_goal_reached"));
  // after the round's own sound: the daily goal, or a new level
  if (level().level > lvBefore) setTimeout(() => sfx("levelup"), 1000); else if (a.goal) setTimeout(() => sfx("goal"), 1000);
  return a;
}
const roundKey = k => String(k||"practice").replace(/[.\s/]+/g, "_").slice(0, 80);
// how many times this quiz was already played today (for the replay rule)
export const roundRepeat = key => { const r = A.prog.rounds[roundKey(key)]; return r && r.d === todayKey() ? r.n : 0; };
export function scoreRound(key, res){
  const k = roundKey(key), day = todayKey(), prev = A.prog.rounds[k] || {};
  const firstPass = res.passed && !prev.passed, firstThree = res.stars === 3 && (prev.stars||0) < 3;
  const next = { d: day, n: prev.d === day ? (prev.n||0) + 1 : 1, best: Math.max(prev.best||0, res.pct), stars: Math.max(prev.stars||0, res.stars), passed: !!(prev.passed || res.passed) };
  A.prog.rounds[k] = next;
  const upd = { ["rounds."+k]: next };
  if (firstPass){ A.prog.stats.passed++; upd["stats.passed"] = A.api.db.inc(1); }
  if (firstThree){ A.prog.stats.threeStars++; upd["stats.threeStars"] = A.api.db.inc(1); }
  progUpdate(upd);
  return award(res.points, "quiz:" + k);
}
export const level = () => levelFromXP(A.prog.xp || 0, A.rules);
export const todayXP = () => A.prog.xpDays[todayKey()] || 0;
export const mastery = k => { const s = A.prog.skills[k] || { r:0, t:0 }; return skillMastery(s.r||0, s.t||0, A.rules); };
export function learnerStats(){
  const ans = A.prog.answers || { r:0, t:0 };
  return { lessons: Object.entries(A.prog.lessons).filter(([id,x]) => x.done && !id.startsWith("quiz:")).length,
    passedRounds: A.prog.stats.passed||0, threeStarRounds: A.prog.stats.threeStars||0, streak: streak(),
    answers: ans.t||0, accuracyLower: wilsonLower(ans.r||0, ans.t||0), xp: A.prog.xp||0, level: level().level,
    wordsMastered: wordsMastered(), goalDays: Object.keys(A.prog.goalDays||{}).length };
}
export const achievements = () => earnedAchievements(learnerStats());
export function learnPattern(n, on=true){
  if (on){ A.prog.patterns[n] = Date.now(); progUpdate({ ["patterns."+n]: Date.now() }); logEvent("pattern", { ref:"#"+n }, true); srsAdd("p:"+n, { type:"p", n }); }
  else { delete A.prog.patterns[n]; progUpdate({ ["patterns."+n]: A.api.db.delField() }); }
}
// A checked handwriting attempt: totals per character in progress/{uid}.handwriting (one locked update), the full
// result as a history event, writing-skill accuracy, and XP through the round rules (stars, replay factor).
export function recordHandwriting(id, sc, meta = {}){
  if (!A.profile || A.profile.status !== "active") return null;
  const k = safeId(id).replace(/[.\s]/g, "_"), prev = (A.prog.handwriting = A.prog.handwriting || {})[k] || {};
  const errors = Object.assign({}, prev.errors || {}); for (const e in sc.errors) errors[e] = (errors[e] || 0) + sc.errors[e];
  const next = { attempts: (prev.attempts || 0) + 1, best: Math.max(prev.best || 0, sc.total), last: sc.total, lastAt: Date.now(),
    passed: !!(prev.passed || sc.passed), retries: (prev.retries || 0) + (meta.retries || 0), errors };
  A.prog.handwriting[k] = next;
  const upd = { [`handwriting.${k}.attempts`]: A.api.db.inc(1), [`handwriting.${k}.best`]: next.best, [`handwriting.${k}.last`]: sc.total,
    [`handwriting.${k}.lastAt`]: new Date(), [`handwriting.${k}.passed`]: next.passed };
  if (meta.retries) upd[`handwriting.${k}.retries`] = A.api.db.inc(meta.retries);
  for (const e in sc.errors) upd[`handwriting.${k}.errors.${e}`] = A.api.db.inc(sc.errors[e]);
  progUpdate(upd);
  logEvent("handwriting", { ref: id, score: sc.total, total: 100, passed: sc.passed, components: sc.components, errors: sc.errors,
    strokes: sc.strokes.map(s => ({ id: s.id, order: s.order, direction: s.direction, path: s.path, start: s.start, end: s.end, error: s.error || null, tries: s.tries })),
    retries: meta.retries || 0, durationMs: meta.durationMs || 0, guide: meta.guide || 1 }, sc.passed);
  recordAnswer("characters", sc.passed);
  return scoreRound("hw:" + k, handwritingRound(sc, { repeat: roundRepeat("hw:" + k) }, A.rules));
}
export const handwritingProgress = id => (A.prog.handwriting || {})[safeId(id).replace(/[.\s]/g, "_")] || null;
export function quizDone(id, score, total){ logEvent("quiz", { ref:id, score, total }, true); }

// ---------- SRS ----------
export function srsAdd(id, data){
  id = safeId(id); if (A.srs[id]) return false;
  const item = Object.assign({ due:Date.now(), ivl:0, ease:2.5, reps:0, added:Date.now() }, data);
  A.srs[id] = Object.assign({ id }, item);
  A.api.db.set(`reviews/${A.user.uid}/items/${id}`, item).catch(()=>{});
  return true;
}
export const srsDue = () => Object.values(A.srs).filter(x => x.due <= Date.now());
export function srsGrade(id, q){
  const c = A.srs[id]; if (!c) return;
  if (q===0){ if (c.reps > 0) c.lapses = (c.lapses || 0) + 1; c.reps=0; c.ivl=0; c.ease=Math.max(1.3,c.ease-0.2); c.due=Date.now()+5*60000; }
  else { c.reps++; c.ivl = c.reps===1 ? (q===3?3:1) : c.reps===2 ? (q===1?3:6) : Math.round(c.ivl*(q===1?1.2:q===3?c.ease*1.3:c.ease)); c.ease=Math.max(1.3,c.ease+(q===1?-0.15:q===3?0.15:0)); c.due=Date.now()+c.ivl*86400000; }
  const { id:_, ...rest } = c;
  A.api.db.set(`reviews/${A.user.uid}/items/${id}`, rest).catch(()=>{});
  if (c.type==="w" && c.reps===3) logEvent("word_mastered", { ref:c.w });
  logEvent("review", { ref:id, grade:q }); touchDay();
  award(reviewPoints(q, A.rules), "review");
}
export const wordsMastered = () => Object.values(A.srs).filter(x=>x.type==="w" && x.reps>=3).length;

// ---------- grammar studio ----------
// progress.grammar[id] = { learn, see, build (right answers), fix, best (challenge %), tries, masteredAt, reviews }
const gKey = id => String(id).replace(/[.\s]/g, "_");
export const grammarProgress = id => ((A.prog.grammar || {})[gKey(id)]) || {};
export function saveGrammar(id, patch){
  const k = gKey(id), cur = Object.assign({}, grammarProgress(id), patch, { at: Date.now() });
  A.prog.grammar = Object.assign({}, A.prog.grammar, { [k]: cur });
  const upd = {}; for (const f in patch) upd["grammar."+k+"."+f] = patch[f]; upd["grammar."+k+".at"] = cur.at;
  progUpdate(upd); touchDay();
  return cur;
}

// ---------- pattern studio ----------
// progress.pstudio[n] = the same step record as a grammar point. Mastering a pattern also marks it learned
// (progress.patterns[n], used by the home page, paths and Review); a pattern learned before the studio counts as mastered.
export const patternProgress = n => patternProg((A.prog.pstudio || {})[n], A.prog.patterns[n]);
export function savePattern(n, patch){
  const cur = Object.assign({}, (A.prog.pstudio || {})[n], patch, { at: Date.now() });
  A.prog.pstudio = Object.assign({}, A.prog.pstudio, { [n]: cur });
  const upd = {}; for (const f in patch) upd["pstudio."+n+"."+f] = patch[f]; upd["pstudio."+n+".at"] = cur.at;
  progUpdate(upd); touchDay();
  if (patch.masteredAt && !A.prog.patterns[n]) learnPattern(n, true);
  return patternProg(cur, A.prog.patterns[n]);
}

// ---------- flashcards ----------
// Each word's flashcard statistics live in its review item ("st": seen, ok, almost, miss, skip, hints, streak), so the
// learner's own row holds them. A summary (counts, tricky words) goes in progress.vocab, which admins can read.
export const wordItems = () => Object.fromEntries(Object.values(A.srs).filter(x => x.type==="w" && x.w).map(x => [x.w, x]));
export function recordCard(w, outcome, { hints = 0 } = {}){
  const id = safeId("w:"+w);
  srsAdd(id, { type:"w", w });
  const c = A.srs[id];
  c.st = updateStats(c.st, outcome, { hints });
  if (outcome === "skipped"){ const { id:_, ...rest } = c; A.api.db.set(`reviews/${A.user.uid}/items/${id}`, rest).catch(()=>{}); touchDay(); }
  else srsGrade(id, srsGradeFor(outcome, hints));          // schedules the next review, saves the item, gives XP
  const v = A.prog.vocab = Object.assign({ seen:0, known:0, almost:0, missed:0, skipped:0, hints:0, rounds:0 }, A.prog.vocab || {});
  v.seen++; v[outcome]++; v.hints += hints;
  progUpdate({ "vocab.seen":A.api.db.inc(1), ["vocab."+outcome]:A.api.db.inc(1), "vocab.hints":A.api.db.inc(hints) });
}
export const trickyWords = () => Object.values(A.srs).filter(x => x.type==="w" && isTricky(x.st))
  .sort((a,b) => (b.st.miss+b.st.skip) - (a.st.miss+a.st.skip)).map(x => ({ w:x.w, miss:x.st.miss, skip:x.st.skip }));
export function recordCardRound(sum, { mode, source }){
  const v = A.prog.vocab = Object.assign({ rounds:0 }, A.prog.vocab || {}); v.rounds = (v.rounds||0) + 1;
  progUpdate({ "vocab.rounds":A.api.db.inc(1), "vocab.tricky":trickyWords().slice(0,20), "vocab.lastAt":new Date() });
  logEvent("flashcards", { mode, source, n:sum.cards, known:sum.known, almost:sum.almost, missed:sum.missed, skipped:sum.skipped, hints:sum.hints, pct:sum.pct, ms:sum.ms });
}

// ---------- bookmarks ----------
export const isSaved = id => !!A.saved[safeId(id)];
export async function toggleSave(id, data){
  id = safeId(id);
  if (A.saved[id]){ delete A.saved[id]; A.api.db.del(`bookmarks/${A.user.uid}/items/${id}`).catch(()=>{}); return false; }
  A.saved[id] = Object.assign({ id, at:Date.now() }, data);
  A.api.db.set(`bookmarks/${A.user.uid}/items/${id}`, Object.assign({ at:new Date() }, data)).catch(()=>{});
  if (data.type==="word") srsAdd("w:"+data.w, { type:"w", w:data.w });
  if (data.type==="sentence") srsAdd("s:"+data.zh, { type:"s", zh:data.zh, py:data.py, tr:data.tr });
  return true;
}

// ---------- skills ----------
export function skillPct(k){ const s = A.prog.skills[k]; if (!s || !s.t) return 0; return Math.round(100 * (s.r/s.t) * Math.min(1, s.t/40)); }
export function streak(){ let n=0; const d=new Date(); if (!A.prog.days[todayKey(d)]) d.setDate(d.getDate()-1); while (A.prog.days[todayKey(d)]){ n++; d.setDate(d.getDate()-1); } return n; }

// ---------- content helpers ----------
export const T = obj => tr(obj, expLang());
export const planForTier = tier => A.plans.find(p => p.tier===tier) || A.plans.find(p => p.tier>=tier);
export const tierName = tier => { if (tier<=1) return t("acc_free")==="acc_free"?"Free":t("acc_free"); const p = planForTier(tier); return p ? tr(p.name, lang()) : "Premium"; };
export const lockedItem = (type, id) => A.catalog.find(c => c.type===type && String(c.id)===String(id) && c.tier > A.tier);
export function orderedLessons(){ return Object.values(A.byType.lessons||{}).sort((a,b)=>(a.level-b.level)||((a.order||0)-(b.order||0))); }
export function nextLesson(){
  const last = A.prog.last && A.prog.last.type==="lesson" && A.byType.lessons[A.prog.last.id];
  if (last && !(A.prog.lessons[last.id]||{}).done) return last;
  const lv = A.profile.level || 1;
  return orderedLessons().find(l => l.level>=lv && !(A.prog.lessons[l.id]||{}).done) || orderedLessons().find(l => !(A.prog.lessons[l.id]||{}).done) || orderedLessons()[0];
}
export function genSentence(p){ if (!p || !p.gen || !p.gen.length) return null;
  for (let i=0;i<6;i++){ try { const g = rnd(p.gen); const r = A.engine.generate([g.zh, g.en, g.slots ? JSON.parse(g.slots) : undefined]); r.pn = p.n; r.tokens = r.toks.map(x=>({z:x.z,p:x.p})); r.tr = { en:r.en }; return r; } catch(e){ console.warn(p.n, e.message); } } return null; }
export function genMany(p, n){ const out=[], seen=new Set(); for (let i=0;i<n*4 && out.length<n;i++){ const s=genSentence(p); if (s && !seen.has(s.zh)){ seen.add(s.zh); out.push(s); } } return out; }
export const exampleOf = (p, e) => Object.assign({ pn:p.n }, e);

// widgets context
ctx.exp = expLang;
ctx.rules = () => A.rules; ctx.roundRepeat = roundRepeat; ctx.scoreRound = scoreRound;
ctx.isSaved = isSaved; ctx.toggleSave = toggleSave;
ctx.patterns = () => Object.values(A.P);
// handwriting templates for the quiz type write_char and the word sheet (published characters only)
ctx.hwTemplate = ch => { const c = Object.values(A.byType.characters || {}).find(x => x.char === ch); return c && c.handwriting || null; };
ctx.hwRules = () => (A.settings && A.settings.handwriting) || {};
ctx.openHandwriting = ch => { const c = Object.values(A.byType.characters || {}).find(x => x.char === ch); A.go("handwriting", c ? { id: c.id } : {}); };
ctx.examples = () => A.examples;
ctx.track = (type, data) => { if (type==="word"){ logEvent("word", { ref:data.w }); } if (type==="write"){ recordAnswer("writing", (data.mistakes||0)<=3); logEvent("writing", { ref:data.c }); } if (type==="listen") touchDay(); };
