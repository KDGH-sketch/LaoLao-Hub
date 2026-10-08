// Flashcard Studio logic, without the page: which words go in a deck, the hints for a card, the round itself
// (one card at a time, missed cards come back once), coaching alerts and per-word statistics.
// The page is js/learner/views-cards.js; tests: scripts/test_flashcards.mjs.

export const SIZES = [5, 10, 20, 30];
export const MODES = ["flip", "choose", "listen", "reverse", "mix"];
export const SOURCES = ["smart", "new", "due", "tricky", "stage"];
// word-type filter → parts of speech in the dictionary
export const WORD_TYPES = { all: null, n: ["n", "pron", "clf"], v: ["v", "aux"], adj: ["adj", "adv"], ph: ["ph", "part", "conj", "prep", "num"] };
export const OUTCOMES = ["known", "almost", "missed", "skipped"];

// ---------- words ----------
// One card per dictionary word: { w, p (romanization), pos, h (stage), fq (frequency rank), en, lo, zh }
export function wordPool(dict, { words } = {}){
  const keys = words && words.length ? words.filter(w => dict[w]) : Object.keys(dict);
  return keys.map(w => Object.assign({ w }, dict[w]));
}
const clean = s => String(s || "").replace(/\(.*?\)|（.*?）/g, "").trim();
// The meaning to show on the back. The Lao "meaning" of a Lao word is often the word itself with a note in brackets,
// so it is only used when it says something else; otherwise English.
export function backMeaning(e, lang){
  const own = lang === "lo" ? e.lo : lang === "zh" ? e.zh : e.en;
  if (own && clean(own) && clean(own) !== e.w) return own;
  return e.en || own || "";
}
export const firstGloss = s => clean(String(s || "").split(/;|\//)[0]);

// ---------- statistics per word ----------
// { seen, ok, almost, miss, skip, hints, streak (correct in a row), last (ms) }; kept inside the word's review item
export function updateStats(st, outcome, { hints = 0, now = Date.now() } = {}){
  const s = Object.assign({ seen: 0, ok: 0, almost: 0, miss: 0, skip: 0, hints: 0, streak: 0 }, st || {});
  s.seen++; s.hints += hints; s.last = now;
  if (outcome === "known"){ s.ok++; s.streak++; }
  else if (outcome === "almost"){ s.almost++; s.streak++; }
  else if (outcome === "missed"){ s.miss++; s.streak = 0; }
  else { s.skip++; s.streak = 0; }
  return s;
}
// Tricky: missed or skipped at least twice, and not yet answered right twice in a row since
export const isTricky = s => !!s && (s.miss || 0) + (s.skip || 0) >= 2 && (s.streak || 0) < 2;
export function wordStatus(item, now = Date.now()){
  const s = item && item.st;
  if (!s || !s.seen) return "new";
  if (isTricky(s)) return "tricky";
  if ((item.reps || 0) >= 3) return "mastered";
  return "learning";
}
// counts for the studio's "Your words" row; srs = review items by word
export function overview(pool, srs, now = Date.now()){
  const o = { new: 0, learning: 0, mastered: 0, tricky: 0, due: 0 };
  for (const e of pool){ const it = srs[e.w]; o[wordStatus(it, now)]++; if (it && it.st && it.st.seen && it.due <= now) o.due++; }
  return o;
}

// ---------- building a deck ----------
export function shuffle(a, rnd = Math.random){ a = a.slice(); for (let i = a.length - 1; i > 0; i--){ const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
const byFreq = (a, b) => (a.fq || 1e9) - (b.fq || 1e9);
// opts: { source, size, stage, type }; srs: review items by word. Returns cards (pool entries), at most size.
export function buildDeck(pool, srs, { source = "smart", size = 10, stage = 1, type = "all" } = {}, { now = Date.now(), rnd = Math.random } = {}){
  const pos = WORD_TYPES[type];
  const P = pool.filter(e => !pos || pos.includes(e.pos));
  const it = e => srs[e.w], seen = e => !!(it(e) && it(e).st && it(e).st.seen);
  const due = P.filter(e => seen(e) && it(e).due <= now).sort((a, b) => it(a).due - it(b).due);
  const tricky = P.filter(e => isTricky(it(e) && it(e).st)).sort((a, b) => ((it(b).st.miss + it(b).st.skip) - (it(a).st.miss + it(a).st.skip)));
  // new words: this stage first (most common first), then the next stages
  const fresh = P.filter(e => !seen(e)).sort((a, b) => (Math.abs((a.h || 1) - stage) - Math.abs((b.h || 1) - stage)) || ((a.h || 1) - (b.h || 1)) || byFreq(a, b));
  let list;
  if (source === "new") list = fresh;
  else if (source === "due") list = due;
  else if (source === "tricky") list = tricky;
  else if (source === "stage") list = shuffle(P.filter(e => (e.h || 1) === stage), rnd);
  else {
    // smart mix: a few tricky words, what is due, then new words; fill with words still being learned
    const learning = P.filter(e => seen(e) && !isTricky(it(e).st)).sort((a, b) => it(a).due - it(b).due);
    list = [...tricky.slice(0, Math.ceil(size * 0.3)), ...due, ...fresh.slice(0, size), ...learning];
  }
  const out = [], have = new Set();
  for (const e of list){ if (!have.has(e.w)){ have.add(e.w); out.push(e); } if (out.length >= size) break; }
  return source === "smart" || source === "new" ? shuffle(out, rnd) : out;
}

// four answers for the choice activities: the right one and three others of the same kind when possible
export function choicesFor(card, pool, { n = 4, lang = "en", reverse = false, rnd = Math.random } = {}){
  const label = e => reverse ? e.w : firstGloss(backMeaning(e, lang));
  const right = label(card), seenLabels = new Set([right]);
  const others = shuffle(pool.filter(e => e.w !== card.w), rnd).sort((a, b) => (a.pos === card.pos ? 0 : 1) - (b.pos === card.pos ? 0 : 1));
  const opts = [{ w: card.w, label: right, right: true }];
  for (const e of others){ const l = label(e); if (!l || seenLabels.has(l)) continue; seenLabels.add(l); opts.push({ w: e.w, label: l, right: false }); if (opts.length >= n) break; }
  return shuffle(opts, rnd);
}
// "mix" picks an activity per card; listening only when the word has audio
export function modeFor(mode, i, { hasAudio = true } = {}){
  let m = mode === "mix" ? ["flip", "choose", "reverse", "listen"][i % 4] : mode;
  if (m === "listen" && !hasAudio) m = "choose";
  return m;
}

// ---------- hints ----------
// The hints for a card, gentlest first. Words with no picture (abstract words) still get the kind of word, a clue in Lao,
// an example sentence with the word blanked out, the sound, and the first letter of the meaning.
const POS_KIND = { n: "noun", pron: "pron", clf: "clf", v: "verb", aux: "verb", adj: "adj", adv: "adv", num: "num", ph: "phrase", part: "particle", conj: "joiner", prep: "joiner" };
export function maskSentence(text, w){ return String(text || "").split(w).join("＿＿"); }
export function hintsFor(card, { lang = "en", examples = [], picture = "" } = {}){
  const out = [];
  if (picture) out.push({ kind: "picture", value: picture });
  if (POS_KIND[card.pos]) out.push({ kind: "type", value: POS_KIND[card.pos] });
  const loClue = (String(card.lo || "").match(/\(([^)]+)\)/) || [])[1];
  if (loClue && loClue.trim() !== card.w) out.push({ kind: "clue", value: loClue.trim() });
  const ex = examples.find(e => e && e.zh && e.zh.includes(card.w) && e.zh !== card.w);
  if (ex) out.push({ kind: "context", value: maskSentence(ex.zh, card.w), tr: ex.tr ? (ex.tr[lang] || ex.tr.en || "") : "" });
  if (card.p) out.push({ kind: "sound", value: card.p });
  const m = firstGloss(backMeaning(card, lang));
  if (m) out.push({ kind: "letters", value: m[0] + " " + m.slice(1).replace(/\S/g, "_"), len: m.replace(/\s/g, "").length });
  return out;
}

// ---------- the round ----------
// One card at a time. A missed card comes back once, three cards later, so it is practised again in the same round.
export function createRound(cards, { requeueGap = 3 } = {}){
  const queue = cards.map(c => ({ card: c, again: false })), results = [];
  const r = {
    queue, results,
    get index(){ return results.length; },
    get done(){ return results.length >= queue.length; },
    current(){ return queue[results.length] || null; },
    answer(outcome, { hints = 0, ms = 0 } = {}){
      const cur = queue[results.length]; if (!cur) return null;
      const res = { w: cur.card.w, outcome, hints, ms, again: cur.again };
      results.push(res);
      if ((outcome === "missed" || outcome === "skipped") && !cur.again){
        const at = Math.min(results.length + requeueGap, queue.length);
        queue.splice(at, 0, { card: cur.card, again: true });
      }
      return res;
    },
    summary(){
      const first = results.filter(x => !x.again), c = k => first.filter(x => x.outcome === k).length;
      const words = [...new Set(results.filter(x => x.outcome === "missed" || x.outcome === "skipped").map(x => x.w))];
      return { cards: first.length, known: c("known"), almost: c("almost"), missed: c("missed"), skipped: c("skipped"),
        hints: first.reduce((n, x) => n + x.hints, 0), pct: first.length ? Math.round(100 * (c("known") + c("almost")) / first.length) : 0,   // a skipped card counts as not known
        ms: results.reduce((n, x) => n + x.ms, 0), retried: results.filter(x => x.again).length,
        fixed: results.filter(x => x.again && (x.outcome === "known" || x.outcome === "almost")).map(x => x.w), toPractise: words };
    }
  };
  return r;
}

// ---------- coaching ----------
// A short pop-up while playing, when a pattern shows up. Each alert waits at least 5 cards before it can come back.
export function coachFor(results, lastShown = {}){
  const n = results.length, tail = k => results.slice(-k);
  const run = (k, f) => n >= k && tail(k).every(f);
  const ok = key => !(lastShown[key] >= 0 && n - lastShown[key] < 5);
  if (run(3, x => x.outcome === "skipped") && ok("skips")) return { key: "skips", tone: "warn", n: 3 };
  if (run(3, x => x.outcome === "missed") && ok("misses")) return { key: "misses", tone: "warn", n: 3 };
  if (run(4, x => x.hints > 0) && ok("hints")) return { key: "hints", tone: "info", n: 4 };
  if (run(5, x => x.outcome === "known" && !x.hints) && ok("streak")) return { key: "streak", tone: "good", n: 5 };
  return null;
}
// self-graded flip card: how the answer maps to spaced review (0 again, 1 hard, 2 good, 3 easy)
export const srsGradeFor = (outcome, hints) => outcome === "known" ? (hints ? 2 : 3) : outcome === "almost" ? 1 : 0;
