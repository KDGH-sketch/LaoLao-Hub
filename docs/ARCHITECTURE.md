# LaoLao architecture

```
Learner app (index.html) ─┐                            ┌─ Supabase Auth (accounts)
                          ├─ js/api (data layer) ──────┼─ Supabase PostgreSQL (tables + Row Level Security)
Admin Backend (admin/) ───┘   Supabase or demo         └─ Supabase Storage (bucket "laolao-assets")
        │
        └─ Publish → bundles/{tier} ← learners download their plan's package
```

- **No build step.** Plain ES modules. `@supabase/supabase-js` is loaded from jsDelivr through the import map in `index.html` and `admin/index.html`. The site is hosted on GitHub Pages; `server.js` is only a local static server.
- **Data layer:** `js/api/` exposes one interface (`auth`, `db`, `storage`), with two implementations:
  - `supabase.js`, used when `env-config.js` sets `window.__SUPABASE_CONFIG__`;
  - `local.js`, the demo mode in IndexedDB.
- **Content is data, not HTML.** Every lesson, pattern, word, quiz and path is a database row. It's edited in the Admin Backend and published without redeploying the site.

## Terminology

| Term | Meaning | Where |
|---|---|---|
| Admin | Platform owner or staff | `admins/{uid}` with role `super` / `editor` / `reviewer` / `support` / `custom` |
| Learner | A client who studies | `users/{uid}` with `role: "learner"` |
| Account | Login identity | Supabase Auth + `users/{uid}` |
| Plan | What a tier unlocks | `plans/{planId}` → `tier` |
| Access | The learner's current entitlement | `access/{uid}` (effective) + `subscriptions/{id}` (history) |
| Content | Lessons, patterns, grammar… | Content tables below |

## How paths map to tables

The app addresses data with paths such as `users/abc` or `reviews/abc/items/xyz`. `js/api/supabase.js` maps them onto tables that all have the same shape (`id text primary key, data jsonb, created_at, updated_at`; see `supabase-schema.sql`):

- `table/id` → row `id` in `table`
- `table/a/b/c` → row `a__b__c` in `table` (sub-collections share the parent table)

## Tables

| Table | Purpose |
|---|---|
| `users` | Profile: name, email, status, level, prefs (UI and explanation language) |
| `admins` | Role and menu permissions |
| `adminNotes` | Private notes about a learner |
| `plans` | Name (en/lo/zh), tier, duration, price, features |
| `access` | planId, tier, status, start, expiresAt, source |
| `subscriptions` | Every assign / extend / suspend / cancel, with who and when |
| `patterns`, `lessons`, `grammar`, `vocabulary`, `dialogues`, `quizzes`, `audio`, `paths`, `releases`, `lexicon`, `videos`, `tones`, `culture`, `characters`, `dictionary` | Content. Each has `status`, `access`, `level`, `order`, `version`, `createdAt`, `updatedAt`, `updatedBy` |
| `places`, `festivals`, `offers`, `resources` | The public welcome page: journey places (lat/lon → map pin), festival calendar, offers with start/end dates, free resources. Published like other content; visitors get `access: "public"` items through the tier-0 bundle. See WELCOME.md |
| `orders`, `payments` | Plan purchases and verified provider transactions; see PAYMENTS.md |
| `usage`, `accessLogs` | Usage counters (written only by `ll_use`) and refused attempts; see ACCESS.md |
| `bundles` | `meta` and `t{tier}_p{n}`: published content per tier, split into parts |
| `progress` | Skills, lessons, patterns, study days, last position; events as `{uid}__events__{id}` |
| `reviews` | Spaced-repetition cards (SM-2 style) as `{uid}__items__{id}` |
| `notes` | Learner notes as `{uid}__items__{id}` |
| `activity` | Feed for the admin dashboard |
| `settings` | `app`, `bundle`, `bootstrap`, `promotions` (old download banner, read as a fallback until converted), `welcome` (published welcome-page copy, public) and `welcomeDraft` (its draft, admins only) |

Who can read and write each table is defined by the RLS policies at the end of `supabase-schema.sql`.

## Access control

| Tier | Level |
|---|---|
| 0 | Public |
| 1 | Free (any active account) |
| 2 | Standard |
| 3 | Premium |
| 4+ | Any other plan (e.g. VVIP), chosen as *Custom* in the content editor |
| 99 | Admin only |

Plans also decide which **features** a learner may use and **how often** (usage limits). One database function, `ll_resolve()`, decides plan, status, expiry, features, limits and tier; `ll_my_tier()` uses it for the bundles policy and `ll_use()` counts limited actions. The browser loads the result once per session (`ll_entitlements()`) for its screens. See **[ACCESS.md](ACCESS.md)** for the full design, lifecycle, admin how-tos and tests.
Admin roles and menu permissions are checked in the browser by `js/admin/state.js`. The database enforces the rules with the row-level security policies in `supabase-schema.sql`: raw content is readable by admins only, and writes follow the admin roles (`ll_can_edit`, `ll_can_support`, `ll_is_super`). The owner is the account that completed the first-time setup (`settings/bootstrap.uid`). Progress changes are applied in one locked step by the `ll_apply` function, so updates from several devices do not overwrite each other.

## Publishing

`buildBundles()` in `js/shared/content.js`:

1. Reads all content.
2. Keeps `status == "published"`.
3. For every tier builds a JSON package with the items that tier may see.
4. Writes the package parts, then `bundles/meta` with a new version number.

The learner app reads `meta`. It downloads parts only when the version changed, and caches the package in IndexedDB.

## Welcome page (signed out)

The page visitors see before signing in (`js/learner/welcome.js`). It paints at once from `js/learner/welcome-data.js`,
then fills in from `settings/welcome` (published copy), `settings/app`, `plans` and the tier-0 bundle (`loadPublicBundle`,
cached apart from the signed-in app's bundle). Each read gives up after 2.5 s, so it also works offline. It never calls
an `ll_*` function before sign-in. Admins manage it in **Website & Welcome** (Welcome Page, Journey Places, Festivals,
Promotions & Feed, Free Resources): drafts, preview (`?welcome-preview=1`), publish, revert, and every change in the
Activity Audit Log. Full guide: [WELCOME.md](WELCOME.md).

## Offline

- **App shell and data:** `sw.js` caches pages, scripts, the dictionary and fonts.
- **Content:** the learner's bundle is kept in IndexedDB.
- **Admin:** the Admin Backend needs a connection.

## Sentence generator

Patterns carry templates with slots such as `{P}`, `{VO}`, `{PL}`. Shared word lists live in `lexicon` and admins can edit them; per-template lists go in the template's Slots field. The engine (`js/shared/engine.js`) builds the sentence, romanization and English entirely on the device.

## Handwriting

Lao handwriting (stroke templates drawn by teachers, stroke-order demonstration, checking of order, direction, shape, start/end and count, scoring and progress) is a separate engine in `js/shared/handwriting/`. Templates are stored in `characters/{id}.handwriting`. See **[HANDWRITING.md](HANDWRITING.md)**.

## Quiz engine

`js/shared/quiz.js` renders every question type from data: mc, fill, order, match, type, listen_select, listen_type, tone, speak (browser speech recognition), write_char and flashcard. The admin Quiz Builder writes the same format.

## Adding online payments later

Access is already separate from payment. A Supabase Edge Function can receive the payment provider's webhook, verify it, then write `subscriptions/{id}` with `source: "payment"` and update `access/{uid}` with `{ planId, tier, status: "active", expiresAt }`. See [PAYMENTS.md](PAYMENTS.md) for Lao payment options (LAO QR, BCEL, PhaJay) and the full design.
