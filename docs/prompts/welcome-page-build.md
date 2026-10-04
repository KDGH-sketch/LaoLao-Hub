# Prompt: build the LaoLao welcome page

You are working in the LaoLao repo (branch `claude/gifted-meitner-o8lktt`). Build the new logged-out welcome page so that it looks and behaves like the approved mockup `docs/mockups/welcome-landing.html`, and so that every piece of data comes from the existing backend. Do not invent new backend. Read first, then build.

## 1. Read these files before writing code
- `docs/mockups/welcome-landing.html` (the design: copy its CSS tokens, SVG scenes, animations and copy), and `docs/mockups/qa/` (the test harness).
- `js/learner/main.js` (`renderAuth`, `boot`, `renderNewPassword`), `js/learner/core.js` (`loadAccount`, `createLearnerProfile`, `rememberPendingProfile`).
- `js/api/index.js`, `js/api/supabase.js`, `js/api/local.js` (same interface in both: `auth`, `db`, `storage`; `api.mode === "demo"` without Supabase config).
- `supabase-schema.sql` (RLS), `docs/ARCHITECTURE.md`, `docs/ACCESS.md`, `js/shared/content.js` (`loadBundle`), `js/learner/upgrade.js` (`priceText`, `planLabel`), `js/admin/cms-extended.js` (`EXT_VIEWS.promotions`), `js/shared/ui.js` (`h`, `icon`, `setTheme`, `themeSwitcher`), `js/shared/i18n.js`, `sw.js`, `index.html`.

## 2. What the page must contain
Sticky nav (Home, Journey, Services, Free resources, Promotions, News, About; theme switch; EN/ລາວ/中文; Sign in; mobile menu) and: hero with the sign-in card, greetings marquee, silk ribbon, alphabet strip, stats strip, **Journey through Laos** (real map, six landmark scenes, Lao words with audio), festival calendar (current festival highlighted), services bento, free resources, promotions and plans, news, about, closing call to action, footer. Keep the mockup's animations, Day/Night/Auto behaviour (sun and moon, petals and fireflies, fire boats on the Mekong), and reduced-motion support.

## 3. Backend rules the page must respect (verified in the repo)
**Anonymous visitors can read only:** `settings/*`, `plans`, `bundles/meta` and public-tier bundle parts (`bundles/t0_p{n}`). Everything else is blocked by RLS. Never call `ll_*` RPCs before sign-in.

| Page part | Source | Notes |
|---|---|---|
| App name, registration open, support contact, social links | `settings/app`: `appName`, `allowRegistration`, `supportContact`, `social.{fb,yt,tt}`, `defaultPlanId` | If `allowRegistration` is false, hide "Create account" and show `t("reg_closed")` plus the support contact, as `renderAuth` does today. |
| Plans and prices | `api.db.list("plans")`: `id`, `name` (string or `{en,lo,zh}`), `tier`, `price`, `currency`, `billingPeriod`, `durationDays`, `features` (array or `{lang:[]}`), `order`, `active` | Render only `active !== false`, sorted by `order`. Use `priceText`/`planLabel` (move them to `js/shared/` so the welcome page and `upgrade.js` share them). Never hardcode prices or plan names. Free plan button opens Create account; paid plan buttons open Create account with a note to upgrade in the app (payments are manual today, see `docs/PAYMENTS.md`). No checkout. |
| Promo banner and free PDF card | `settings/promotions`: `title`, `desc`, `link`, `badge`, `active` | Show only when `active !== false`. |
| Limited offer and countdown | Add `offer: { title, text, planId, endsAt }` (ms) to `settings/promotions`, and fields for it to the existing admin "Promotions & Feed" editor | No schema change (settings is public-read, super-write). Hide the block when missing or `endsAt` has passed. |
| Free resources list | New doc `settings/resources`: `{ items: [{ id, kind, title, desc, url, glyph }] }`, edited in the same admin editor | Be honest in the UI and code comments: these URLs are public to anyone who reads settings, so "free account" gating is a UI funnel, not security. Logged-out click opens Create account; after sign-in the link opens. |
| News | `releases` and `culture` items with `access: "public"`, `status: "published"`, delivered through the tier-0 bundle | Add `loadPublicBundle(api)` to `js/shared/content.js` that reads `bundles/meta` and `bundles/t0_p*` directly. Do not use `loadBundle` for this: it overwrites the shared IndexedDB `bundle` cache that the signed-in app relies on. If nothing is published, hide the News section. |
| Journey places, festival calendar, hero copy | Static module `js/learner/welcome-data.js` with `{en,lo,zh}` text | Map outline, Mekong path and pin positions are pre-projected in the mockup; copy them. Facts are reviewed content, keep them in this one file. |

**Auth (do not change behaviour):** reuse the existing `submit()` logic in `renderAuth`: `api.auth.signIn`, `signUp`, `resetPassword`; modes `signin | register | reset`; handle `err.code === "auth/confirm-email"` by returning to sign in with the notice; keep `rememberPendingProfile` and the profile and free-access creation in `core.js`. After success do nothing: `api.auth.onChange` renders the app. Show demo-account buttons only when `api.mode === "demo"`. Link the admin portal at `admin/`. Do not touch `supabase-schema.sql` or RLS.

## 4. Repo conventions (must match)
- **No build step, no framework, no new dependencies.** Plain ES modules; DOM built with `h()` and `icon()`; static SVG scenes may be inserted as trusted strings from one module (no user data in them).
- **Files:** `js/learner/welcome.js` (page), `js/learner/welcome-data.js`, `js/learner/welcome-scenes.js` (SVG strings), styles appended to `css/app.css` under a `.wl-` prefix. `renderAuth` becomes a thin call into the welcome page, keeping its signature.
- **Theme:** the app uses `data-theme="day" | "night" | "system"` and `localStorage["laolao_theme"]`. Reuse `themeSwitcher()`/`setTheme()`. Port the mockup's tokens into the existing selectors (`:root`, `:root[data-theme="night"]`, `:root[data-theme="dark"]`, and the `system` media block). The mockup's `light/dark/auto` names do not exist in the app. Keep the sky, sun and moon tokens working in all three modes.
- **Language:** `setLang()`, `localStorage["xuelu.lang"]`. All visible text goes through `t("wl_…")` with keys in `en`, `lo` and `zh`; `scripts/test_i18n.mjs` enforces parity. Mark Lao text `lang="lo"`.
- **Selectors the e2e tests rely on:** the sign-in form keeps `#em`, `#pw`, `#nm`, a real `<form>` submit, `.msg` with `role="alert"` for errors. Add class `auth-card` to the form (the startup fallback in `index.html` looks for `.auth-card`).
- **Hash safety:** the app reads `location.hash` for `#p12`, view names and `type=recovery`. Do not use plain `href="#services"` anchors for in-page navigation; use `data-scroll` buttons with `scrollIntoView`, or a `#w-` prefix.
- **Offline/PWA:** add every new file to the precache list in `sw.js` and bump its cache version. First paint must not wait on the network: render defaults immediately, then fill from backend with a 2.5 s timeout and `try/catch` on every read. The page must work with the demo backend and with Supabase, and offline.

## 5. Modern web tech (use, with fallbacks)
CSS `@layer`, nesting, container queries with **rem** thresholds (so they follow the user's font size), `:has()`, `:user-invalid`, `@property`, `color-mix()`, oklch gradients, scroll-driven animation, CSS motion path, `@starting-style`, View Transitions for the theme switch, Popover API for the mobile menu. Each one needs an `@supports` or JS fallback so older browsers still get a working, readable page. Also: logical properties, `dvh`, safe-area insets, `prefers-reduced-motion`, `prefers-contrast`, `forced-colors`. Pause off-screen animation with `IntersectionObserver`.

## 6. Acceptance criteria (all must be shown with command output)
1. `npm run lint`, `npm test` and `npm run test:e2e` pass. Update `scripts/e2e_app.mjs` only if a selector legitimately moved; add `scripts/e2e_welcome.mjs` for: plans rendered from the `plans` table, registration-closed state, promo hidden when `active:false`, news hidden when empty, hash handling, offline load.
2. Port `docs/mockups/qa/` to run against the real app served by `npm start` (demo backend). Results required: no horizontal scroll or clipped text at 280, 320, 360, 390, 412, 430, 540, 667x375, 768, 820, 844x390, 1024, 1280, 1366, 1440, 1920, 2560, 3840 px in Day and Night; every control 44 px or larger on touch devices, 24 px or larger otherwise; no text under 12 px; layout shift under 0.1; **zero axe-core violations (WCAG 2.2 AA)**; 200 % text size and 320 px reflow with no sideways scroll; keyboard-only path through sign-in works; skip link first.
3. Visual parity with the mockup at 390, 768 and 1366 px in both themes (attach screenshots).
4. No console errors. No request to any host other than Supabase, jsDelivr (supabase-js) and Google Fonts.

## 7. Do not
Change RLS, schema or auth behaviour; add tables; hardcode plans, prices, promos or contact details; add a framework, bundler or CDN script; fetch third-party images; claim a download is protected when it is only hidden; leave the landmark facts unreviewed (list them in the PR description for a Lao speaker to check).

Finish by committing to the branch and giving a short summary with the test output. Do not open a pull request unless asked.
