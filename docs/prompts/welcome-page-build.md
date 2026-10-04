# Prompt: build the LaoLao welcome page, with full admin control

You are working in the LaoLao repo (branch `claude/gifted-meitner-o8lktt`). Build the new logged-out welcome page so it looks and behaves like the approved mockup `docs/mockups/welcome-landing.html`, **and** give the admin team full control over every piece of content, copy, offer, section and publish step from the existing Admin Backend, with no code changes needed for day-to-day management. Read first, then build. Backend changes are allowed but must be additive and covered by the existing SQL tests.

## 1. Read before writing code
- `docs/mockups/welcome-landing.html` and `docs/mockups/qa/` (design and test harness).
- Learner: `js/learner/main.js` (`renderAuth`, `boot`), `js/learner/core.js` (`loadAccount`, `createLearnerProfile`, `rememberPendingProfile`), `js/learner/upgrade.js` (`priceText`, `planLabel`), `js/shared/ui.js` (`h`, `icon`, `setTheme`, `themeSwitcher`), `js/shared/i18n.js`, `js/shared/content.js` (`CONTENT_TYPES`, `saveContent`, `buildBundles`, `loadBundle`), `sw.js`, `index.html`.
- Data layer: `js/api/index.js`, `supabase.js`, `local.js` (same interface; `api.mode === "demo"` without Supabase config).
- Admin: `js/admin/main.js` (`NAV_SECTIONS`, views), `admins.js` (`ALL_ADMIN_MENUS`, roles), `state.js` (`canViewMenu`, `canEditMenu`, `lockedScreen`), `schemas.js` + `cms.js` (declarative editors and field types), `cms-extended.js` (`EXT_VIEWS.promotions`), `publish.js`, `plans.js`.
- Backend: `supabase-schema.sql` (tables, helper functions, RLS), `docs/ARCHITECTURE.md`, `docs/ACCESS.md`, `docs/PAYMENTS.md`, `data/seed.json`, `scripts/test_sql_access.mjs`.

## 2. The page
Sticky nav (Home, Journey, Services, Free resources, Promotions, News, About; Day/Night/Auto switch; EN/ລາວ/中文; Sign in; mobile menu) and: hero with the sign-in card, greetings marquee, silk ribbon, alphabet strip, stats strip, **Journey through Laos** (real map, landmark scenes, Lao words with audio), festival calendar (current festival highlighted), services bento, free resources, promotions and plans, news, about, closing call to action, footer. Keep the mockup's animations, sun/moon and petal/firefly behaviour, fire boats on the Mekong, and reduced-motion support.

## 3. Where each piece of data lives (anonymous visitors can read only `settings/*`, `plans`, `bundles/meta` and tier-0 bundle parts; never call `ll_*` RPCs before sign-in)

| Page part | Source | Managed in admin by |
|---|---|---|
| Site name, registration open, contact, social links | `settings/app` (existing) | Settings (super only, unchanged) |
| Hero copy, section on/off and order, marquee greetings, stats, about text, footer links, SEO title and description, nav labels (all `{en,lo,zh}`) | `settings/welcome`: `{ draft, published, publishedAt, publishedBy }` | **Welcome Page** (new menu) |
| Journey places | new content type `places` | **Journey Places** (new menu) |
| Festival calendar | new content type `festivals` | **Festivals** (new menu) |
| Offers, banners, countdowns | new content type `offers` (replaces `settings/promotions`; keep reading the old doc as a fallback and migrate it on first save) | **Promotions & Feed** (existing menu, rebuilt) |
| Free resources | new content type `resources` | **Free Resources** (new menu) |
| News | existing `releases` and `culture` with new field `featured` (bool) | existing editors |
| Plans and prices | existing `plans`, plus new optional fields `highlight` (bool), `badge`, `ctaLabel`, `showOnWelcome` | Pricing Plans (existing) |

Delivery: new content types are published like all content, through `buildBundles()`. Items with `access: "public"` and `status: "published"` go into the tier-0 bundle that anonymous visitors can read. Add `loadPublicBundle(api)` to `js/shared/content.js` that reads `bundles/meta` and `bundles/t0_p*` directly. **Do not** reuse `loadBundle` for the landing page: it overwrites the shared IndexedDB `bundle` cache that the signed-in app relies on.

Field definitions (all text fields `{en,lo,zh}` via the `tr` type; every type also has the standard `status`, `access`, `order`, `version`, `createdAt/updatedAt/updatedBy`):
- `places`: `scene` (select: the built-in scene art keys luangprabang, vangvieng, phonsavan, vientiane, champasak, siphandon, plus generic temple, mountain, river, waterfall, market, cave), `imageUrl` (optional upload that overrides the SVG scene), `lat`, `lon` (validated to Laos: 13.9 to 22.5 N, 100.1 to 107.7 E; the page projects them with the same function as the mockup, so a new place gets a pin automatically), `title`, `laoName`, `badge`, `text`, `facts[]`, `words[] {lo, rom, en, audio}`, `unesco` (year, optional).
- `festivals`: `month` (1 to 12), `dateText`, `lunar` (bool, shows "dates move each year"), `art` (select: water, rocket, candle, fireboat, stupa, flag, generic), `title`, `laoName`, `text`.
- `offers`: `kind` (banner | countdown), `title`, `text`, `badge`, `ctaLabel`, `planId` (ref to plans), `discountText`, `startsAt`, `endsAt`, `placement` (hero strip | promotions section), `active`. The page shows an offer only inside its window and hides it automatically after `endsAt`.
- `resources`: `kind` (pdf | audio | chart | cheatsheet | video), `title`, `text`, `url` or uploaded file, `glyph`, `requiresAccount` (bool).

Be honest about what is protected: tier-0 content and resource URLs are readable by anyone, so `requiresAccount` is a sign-up funnel, not security. Say so in the admin help text and code comments. (Real gating later: `access: "free"` items are only readable after sign-in.)

## 4. Admin management (the new requirement: full control)
Add a section **"Website & Welcome"** to `NAV_SECTIONS` and `ALL_ADMIN_MENUS` with menus `welcome`, `places`, `festivals`, `offers` (existing Promotions & Feed id may be kept), `resources`. Follow existing patterns exactly: declarative schemas in `schemas.js` (labels `[English, Lao]`), the generic content list and editor, `ids` and slugs, `canViewMenu`/`canEditMenu`, `lockedScreen`.

Every editor must provide:
1. **Draft, Published, Archived** status, **version history with restore** (`saveContent` / `listVersions`), duplicate, delete with confirm, drag or numeric **ordering**, search and filters.
2. **Trilingual fields** with a visible warning when Lao or Chinese is empty; character and URL validation; no HTML accepted in text fields (the page renders text only).
3. **Uploads**: generalise the existing `audio` field uploader in `cms.js` into `file` and `image` field types using `S.api.storage.upload` (bucket `laolao-assets`; reject files over 5 MB and wrong MIME types; require alt text for images).
4. **Welcome Page editor** (`settings/welcome`): edits go to `draft`; an explicit **Publish welcome page** button copies `draft` to `published`, stamps `publishedAt/By`, and writes a line to `activity`. A **Revert to published** button discards the draft. Section toggles and drag-to-reorder for every page section, per-section titles and intro text, hero copy, greetings list, stats, about, footer, SEO.
5. **Preview**: a "Preview" button opens `../?welcome-preview=1`; when an admin session exists, the page renders from draft data (admins can read raw tables and `settings/welcome.draft`) with a visible "Preview, not published" banner, in Day and Night and at phone, tablet and desktop widths via a device-size switcher in the editor.
6. **Unpublished-changes indicator** using the existing `settings/bundle.dirty` flag, and a link to the existing Publish panel. The panel's step list includes the new types.
7. **Attribution and results**: capture `?ref=` / `utm_*` and the clicked offer id in `sessionStorage`; `createLearnerProfile` stores `signup: { source, offerId, planId }` on the new `users` row (the existing insert policy already allows it). The Welcome Page admin view shows sign-ups by source and by offer for the last 7, 30 and 90 days, read from `users` (admin-readable). Do not add any anonymous write endpoint.
8. **Roles** (use the existing model, do not invent roles): super and owner have full control; editor, content and admin can edit all new menus; custom roles get per-menu view and edit toggles for each new menu id; reviewer is read-only; support has no access. Locked screens for everyone else.
9. **Audit**: every create, update, delete, publish and revert writes an `activity` row with who, what and when, shown in the Activity Audit Log.

## 5. Backend changes (additive only)
- `supabase-schema.sql`: add `places`, `festivals`, `offers`, `resources` to the table list and to the content-policy loop (admin read, `ll_can_edit(table)` writes). Add to the `settings` write policies: `id = 'welcome' and public.ll_can_edit('welcome')`. Do not weaken any existing policy. Add the new types to `CONTENT_TYPES` in `js/shared/content.js` and to `buildBundles()`.
- Ship `supabase-welcome-migration.sql` (idempotent, same style as the existing `supabase-fix-*.sql`) so a live project can upgrade without re-running everything.
- `data/seed.json`: add starter rows that reproduce the mockup exactly (6 places, 6 festivals, offers, resources) and a default `settings.welcome`, so demo mode and the missing-table fallback give the same page out of the box.
- Update `docs/ARCHITECTURE.md` (tables, menus, publish flow) and add `docs/WELCOME.md` (how an editor runs the page, step by step, with the publish flow).
- Extend `scripts/test_sql_access.mjs`: anonymous reads tier-0 only and cannot write; learner, reviewer and support cannot write the new tables; editor, content and admin can; custom role works per menu; only super writes anything outside its menu; `settings/welcome` follows the new policy.

## 6. Repo conventions (must match)
- **No build step, no framework, no new dependencies.** Plain ES modules, DOM via `h()` and `icon()`. Static SVG scene art may be inserted as trusted strings from one module; no user data inside them. User-entered text is always inserted with `textContent`.
- **Files:** `js/learner/welcome.js` (page), `welcome-data.js` (defaults used when the backend has nothing), `welcome-scenes.js` (SVG), admin views in `js/admin/welcome-admin.js`, styles under `.wl-` in `css/app.css` and `css/admin.css`. `renderAuth(mode)` keeps its signature and calls the welcome page.
- **Theme:** the app uses `data-theme="day" | "night" | "system"` and `localStorage["laolao_theme"]`; reuse `themeSwitcher()` / `setTheme()` and port the mockup's tokens into the existing selectors (`:root`, `night`, `dark`, and the `system` media block). The mockup's `light/dark/auto` names do not exist in the app.
- **Language:** `setLang()`, `localStorage["xuelu.lang"]`. UI strings go through `t("wl_…")` with `en`, `lo`, `zh` keys (`scripts/test_i18n.mjs` enforces parity). Admin-entered content uses its own `{en,lo,zh}` values with a fallback to English. Mark Lao text `lang="lo"`.
- **Auth unchanged:** reuse the existing `submit()` logic (`signIn`, `signUp`, `resetPassword`, modes `signin | register | reset`, the `auth/confirm-email` path, `rememberPendingProfile`). Keep `#em`, `#pw`, `#nm`, a real `<form>` submit, `.msg` with `role="alert"`, and add class `auth-card` to the form (the startup fallback in `index.html` looks for it). Demo-account buttons only when `api.mode === "demo"`. If `allowRegistration` is false, hide Create account and show `t("reg_closed")` with the contact, as today.
- **Hash safety:** the app reads `location.hash` for `#p12`, view names and `type=recovery`. Do not use plain `href="#services"` for in-page navigation; use `data-scroll` buttons with `scrollIntoView`, or a `#w-` prefix.
- **Offline and PWA:** add every new file to the precache list in `sw.js` and bump its cache version. First paint never waits on the network: render defaults immediately, then fill from the backend with a 2.5 s timeout and `try/catch` on every read. Works with the demo backend, with Supabase, and offline.
- **Plans and prices** come from `plans` only (`active !== false`, sorted by `order`, `showOnWelcome !== false`). Move `priceText` and `planLabel` into `js/shared/`. Paid plan buttons open Create account with a note to upgrade in the app; no checkout (payments are manual today).

## 7. Modern web tech (each with a fallback)
CSS `@layer`, nesting, container queries with **rem** thresholds (they follow the user's font size), `:has()`, `:user-invalid`, `@property`, `color-mix()`, oklch gradients, scroll-driven animation, CSS motion path, `@starting-style`, View Transitions for the theme switch, Popover API for the mobile menu. Each needs an `@supports` or JS fallback. Also logical properties, `dvh`, safe-area insets, `prefers-reduced-motion`, `prefers-contrast`, `forced-colors`; pause off-screen animation with `IntersectionObserver`.

## 8. Acceptance criteria (show command output for each)
1. `npm run lint`, `npm test`, `npm run test:sql`, `npm run test:e2e` pass. Update existing e2e scripts only where a selector legitimately moved. `scripts/test_every_admin_menu.mjs`, `test_crud_traceability.mjs`, `test_rbac_admin_crud.mjs` and `test_live_crud_stress.mjs` cover the new menus.
2. New `scripts/e2e_welcome.mjs`: plans rendered from the table; registration-closed state; offer hidden before `startsAt` and after `endsAt`; hidden when `active:false`; resource list empty state; news hidden when none; a draft is invisible to visitors until published; revert works; preview shows the draft; a new place with lat/lon gets a pin; hash handling; offline load; sign-up stores `signup.source`.
3. Port `docs/mockups/qa/` to run against the real app (`npm start`, demo backend). Required: no horizontal scroll or clipped text at 280, 320, 360, 390, 412, 430, 540, 667x375, 768, 820, 844x390, 1024, 1280, 1366, 1440, 1920, 2560, 3840 px in Day and Night; touch targets 44 px or larger (24 px or larger otherwise); no text under 12 px; layout shift under 0.1; **zero axe-core violations (WCAG 2.2 AA)** on the welcome page and on each new admin screen; 200% text and 320 px reflow without sideways scroll; keyboard-only sign-in; skip link first.
4. Visual parity with the mockup at 390, 768 and 1366 px in both themes (attach screenshots). No console errors. No requests except Supabase, jsDelivr (supabase-js) and Google Fonts.

## 9. Do not
Weaken or remove any RLS policy; change auth behaviour; hardcode plans, prices, offers, contact details or any text an editor should control (defaults live only in `welcome-data.js` and the seed); add a framework, bundler or CDN script; fetch third-party images; allow HTML in admin text; claim a download is protected when it is only hidden; leave the landmark and festival facts unreviewed (list them in the PR description for a Lao speaker to check).

Finish by committing to the branch with a short summary and the test output. Do not open a pull request unless asked.
