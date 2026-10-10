// LaoLao service worker: network-first for scripts & styles so bug fixes load immediately; offline fallback from cache.
const SHELL = "laolao-shell-v46", RUNTIME = "laolao-runtime-v46";
const CORE = [
  "./","index.html","admin/index.html","css/app.css","css/admin.css","manifest.webmanifest","icon.svg","logo-mark.svg","favicon-32.png","apple-touch-icon.png","icon-192.png",
  "js/config.js","js/api/index.js","js/api/supabase.js","js/api/local.js",
  "js/shared/ui.js","js/shared/logo-data.js","js/shared/flashcards.js","js/shared/sheet-io.js","js/shared/grammar.js","js/shared/dom-guard.js","js/shared/autohide.js","js/shared/lao-script.js","js/shared/handwriting/shape.js","js/shared/handwriting/cellpad.js","js/shared/shape.js","js/admin/schemas.js","js/shared/word-pictures.js","js/shared/i18n.js","js/shared/content.js","js/shared/video.js","js/shared/dict.js","js/shared/engine.js","js/shared/speech.js","js/shared/audio-proc.js","js/shared/widgets.js","js/shared/quiz.js","js/shared/setup.js","js/shared/content-pack.js","js/shared/lao-decorations.js","js/shared/scoring.js","js/shared/features.js","js/shared/access.js","js/shared/billing.js","js/shared/plan-format.js",
  "js/shared/handwriting/geometry.js","js/shared/handwriting/model.js","js/shared/handwriting/recognizer.js","js/shared/handwriting/scorer.js","js/shared/handwriting/pad.js","js/shared/handwriting/smooth.js","js/shared/handwriting/pen-panel.js","js/shared/handwriting/animator.js",
  "js/learner/main.js","js/learner/core.js","js/learner/views-learn.js","js/learner/views-tools.js","js/learner/views-practice.js","js/shared/practice-bank.js","js/shared/practice-library.js","js/shared/practice-coach.js","js/shared/practice-ui.js","js/shared/sfx.js","js/shared/lao-tone.js","js/shared/pitch.js","js/shared/recorder.js","js/shared/pron-course.js","js/learner/views-pronounce.js","js/learner/views-review.js","js/learner/views-patterns.js","js/learner/blocks.js","js/shared/pattern-studio.js","js/learner/views-soundlab.js","js/shared/sidenav.js","js/shared/practice-feature.js","js/shared/pron-profile.js","js/shared/review-doctor.js","js/learner/views-labs.js","js/learner/views-media.js","js/learner/upgrade.js","js/learner/views-handwriting.js","js/learner/views-cards.js","js/learner/views-grammar.js","js/learner/views-billing.js","js/learner/welcome.js","js/learner/welcome-data.js","js/learner/welcome-scenes.js",
  "js/admin/cms-extended.js","js/admin/import-sheet.js","js/admin/import-map.js","js/admin/import-types.js","js/admin/voice-studio.js",
  "data/dictionary.json","data/chars.json","data/seed.json"
];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(SHELL).then(c => c.addAll(CORE)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", e => {
  e.waitUntil(
    caches.keys().then(ks => Promise.all(ks.filter(k => k !== SHELL && k !== RUNTIME).map(k => caches.delete(k)))).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", e => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);

  // Supabase API traffic (cross-origin) is never cached: it falls through the check below.
  const sameOrigin = url.origin === location.origin;
  const isFont = /fonts\.(googleapis|gstatic)\.com/.test(url.host);
  if (!sameOrigin && !isFont && !/\.(mp3|m4a|ogg|wav|webm)$/i.test(url.pathname)) return;

  // Network-First with cache fallback: guarantees newest bug-free code online, works offline
  e.respondWith((async () => {
    try {
      const netRes = await fetch(req);
      if (netRes && (netRes.ok || netRes.type === "opaque")) {
        const c = await caches.open(RUNTIME);
        c.put(req, netRes.clone());
        return netRes;
      }
    } catch (err) {
      // offline fallback
    }
    const hit = (await (await caches.open(RUNTIME)).match(req)) || (await caches.match(req));
    if (hit) return hit;
    if (req.mode === "navigate") return (await caches.match("index.html")) || Response.error();
    return Response.error();
  })());
});
