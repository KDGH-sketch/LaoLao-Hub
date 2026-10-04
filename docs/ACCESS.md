# Plans, features and usage limits

How LaoLao decides what each account may open, use and how often. Written for developers and the platform owner.

## 1. Architecture

```
auth user ─► users/{uid}  (role learner, status active/disabled)
admins/{uid} (role super/editor/reviewer/support/custom) ─► admin = tier 99, every feature
access/{uid} (planId, status, start, expiresAt, grants) ─► plans/{planId} (tier, entitlements, limits, graceDays, trialDays)
                                   │
                  ll_resolve()  ◄──┘  one function decides (supabase-schema.sql)
                   ├─ ll_my_tier()      → which content bundles the account can read (row-level security)
                   ├─ ll_can(feature)   → yes/no for one feature
                   ├─ ll_use(feature)   → count one use, under a row lock, against the plan's limit
                   └─ ll_entitlements() → everything above + current counters, for the app's UI (one call per session)

js/shared/access.js  resolveEntitlements() = the same rules in JavaScript (demo mode, tests, display)
                     createAccessControl() = the app's service: can(), check(), use(), limit(), usage()
js/shared/features.js  the list of features (keys, labels, which screens they open, which may be limited)
```

**Roles and plans are separate.** A role (`admins/{uid}.role`) says what someone may manage in the Admin. A plan (`access/{uid}.planId`) says what a learner may study. Admin rights never come from a plan, and an admin always has every learner feature.

## 2. Database tables

All tables have the shape `id text, data jsonb` (see `supabase-schema.sql`).

| Table | Row | Fields used for access |
|---|---|---|
| `plans` | `{planId}` | `tier`, `entitlements {feature:true}`, `limits {feature:{n, per}}`, `graceDays`, `trialDays`, `price`, `currency`, `billingPeriod`, `durationDays`, `description`, `badge`, `features` (marketing bullets), `active`, `order` |
| `access` | `{uid}` | `planId`, `status` (active / trial / pending / suspended / cancelled), `start`, `expiresAt`, `grants [feature]`, `source` |
| `subscriptions` | `{uid}-{time}` | history of every assign / extend / suspend / cancel / grant |
| `usage` | `{uid}__{feature}__{period}` | `n` (uses), `limit`, `per`, `resetAt`, `refs` (items already counted) |
| `accessLogs` | `{uid}__{uuid}` | refused attempts and limits reached: `feature`, `plan`, `status`, `reason`, `used`, `limit`, `at` |
| `settings/app` | | `defaultPlanId`, `disabledFeatures [feature]`, `timezone` (default Asia/Vientiane), `paymentInstructions`, `paymentQrUrl`, `supportContact` |

## 3. Plans and tiers

The **tier** is the content level: 0 public, 1 Free, 2 Basic (`standard`), 3 Premium, 4+ any other plan (e.g. VVIP), 99 admin. A learner reads the content of their tier and every tier below.
The tier comes from the plan row, so changing a plan's tier applies to all its learners at once.

A plan **without** an `entitlements` field means "every feature, no limits" (how plans behaved before this system). Nothing changes for anyone until a Super Admin configures the plans.

## 4. Features

Each entry in `js/shared/features.js` has a `key` (stored in plans; never rename one in use), the screens it opens (`routes`), practice types (`types`), whether it may carry a limit (`limitable`) and whether it counts distinct items (`ref`: opening the same lesson twice in one period counts once).

## 5. Account status and subscription lifecycle

```
pending ──(admin approves / payment)──► active ──(expiresAt passes)──► grace (graceDays) ──► expired → default plan
trial (until expiresAt) ──────────────────────────────────────────────────────────────────► expired → default plan
active ──(admin)──► suspended  (public content only, nothing usable)
active ──(admin)──► cancelled  (default plan)
user disabled ─────────────────────► nothing (sign-in refused screen)
```

Expiry is decided by the database clock (`now()`), never by the browser. Nothing is deleted when a plan ends: progress, scores, reviews, notes, bookmarks and the account stay; the learner just sees the Free plan again.

## 6. Precedence (how one decision is made)

1. Global switch-off: `settings/app.disabledFeatures` (learners only; admins unaffected) → `feature_disabled`
2. Account status: disabled / suspended / no learner profile → refused
3. Plan: the feature is in the plan's `entitlements` → allowed
4. Personal grant: `access.grants` adds the feature **and lifts its limit** → `granted`
5. Usage limit: `ll_use` counts and refuses at the limit → `limit_reached`

## 7. Usage limits

`limits[feature] = { n, per }` with `per` = `day`, `week` (Monday start), `month`, `period` (the current subscription, from `start` to `expiresAt`), or `lifetime`. Empty = unlimited. Periods follow `settings/app.timezone`.
`ll_use(feature, amount, ref)` locks the counter row (`select … for update`), compares, increments and returns `{allowed, reason, used, limit, per, resetAt}`. Parallel requests wait for each other, so 5/5 can never become 6/5. `amount 0` only checks. Learners cannot write counters; only this function can.

## 8. Where each check lives

| Layer | Checks | Can a technical user get around it? |
|---|---|---|
| Database (RLS + functions) | content tier (bundles), who may change plans / access / settings / counters, counting | **No** |
| App service (`A.ac`) | locked screens, lock icons, upgrade messages, asking `ll_use` before limited actions | The *screens* of labs and tools are public JavaScript (an owner's decision): someone editing the code can open them. Content above their tier and the counters stay protected. |

Offline: limited actions are allowed and not counted while there is no connection (the app works offline by design).

## 9. Using it in the learner app

```js
if (A.ac.can("tones.lab")) …                                   // UI decision, no network
A.ac.check("tones.lab")   // → { allowed:false, reason:"feature_not_in_plan", requiredPlan:"standard" }
const r = await A.ac.use("lessons.open", { ref: lessonId });  // asks the database; r.allowed / r.reason / r.used / r.limit / r.resetAt
return withUse("videos.watch", { ref:id }, () => videoView(id));  // js/learner/upgrade.js: build the page or show the limit screen
upgradeSheet({ feature:"tones.lab" }) / lockedPanel({ tier:3 })   // the explanations
```

Screens listed in a feature's `routes` are guarded by the router (`js/learner/main.js`), including direct links such as `#tone_lab`. Debug: run `localStorage.laolao_debug_access = "1"` in the browser console to print every decision.

## 10. Database functions (backend use)

`ll_entitlements()`, `ll_can(text)`, `ll_use(text, int, text)` can be called by any signed-in user and decide for that user only. `ll_count` and `ll_log` are internal (not callable). Future RLS policies or Edge Functions can use `public.ll_can('feature')` directly.

## 11. Admin how-tos

- **Create or edit a plan:** Admin → Pricing Plans (Super Admin). Name, tier, duration, price, currency, billing period, trial and grace days, description, badge, marketing bullets, active.
- **Choose features and limits:** Admin → Plan access & limits. Tick features per plan; type a number and period to limit (empty = unlimited). *Apply recommended defaults* fills free / standard / premium / vvip with a starting point. *Off for everyone* switches a feature off globally.
- **Assign a plan:** Admin → Learners → a learner → Assign plan: plan, status (active / trial / pending), start, expiry. Extend / suspend / reactivate / cancel buttons stay as before; everything is written to the history.
- **Personal access:** on the learner page, *Personal access* grants extra features (teachers, testers, partners). *Usage* shows today's counters; Super Admin can reset one.
- **Access logs:** Admin → Access Logs (support and Super Admin): refused attempts and limits reached.
- **Make content Free / Basic / Premium:** in any content editor, *Access* = Public, Free, Basic, Premium, Admin only, or *Custom* (any other plan tier, e.g. VVIP). Then **Publish**: each tier's bundle only contains what that tier may read.
- **Show "Basic" to learners:** the `standard` plan keeps its id; edit its name to "Basic" in Pricing Plans.

## 12. Adding a feature

1. Add an entry to `FEATURES` in `js/shared/features.js` (key, group, labels, routes or types, `limitable`).
2. If it is a new screen, list it in `routes`: the router locks it automatically. For an action, call `await A.ac.use("your.key")` (limited) or `A.ac.can("your.key")`.
3. It appears in the Access matrix; tick it for the plans that include it. Existing configured plans do **not** get it until ticked.

## 13. Adding a usage limit

Mark the feature `limitable:true`, count the action with `A.ac.use(key, { ref })` at the moment it happens, and set the number in the Access matrix. No SQL change is needed.

## 14. Payments later

Payment is not part of access. A provider's webhook (Supabase Edge Function with the service key, see [PAYMENTS.md](PAYMENTS.md)) verifies the payment, then writes `subscriptions/{id}` and `access/{uid}` = `{ planId, status:"active", start, expiresAt }`. Nothing else changes: `ll_resolve()` reads the new access on the learner's next request. A manual flow works the same way today: the learner pays, an admin assigns the plan (status `pending` while waiting).

## 15. Tests

| Command | What it proves |
|---|---|
| `npm test` (`scripts/test_access_control.mjs`) | resolver, statuses, expiry, grace, grants, switch-offs, every limit period, 20 parallel uses vs a limit of 5, demo database functions, tampered browser state |
| `npm run test:sql` | runs `supabase-schema.sql` in an embedded Postgres: self-tests, RLS for learner / premium / suspended / admin / anonymous, every bypass attempt refused, SQL and JS resolvers agree |
| `npm run test:e2e` (`scripts/e2e_access.mjs`) | the real app: matrix, locked screens by direct link, limit message, phone and night theme, upgrade, expiry, admin roles |
| `npm run check:access` | the **live** project, with your two test accounts (see the top of `scripts/check_access_live.mjs`) |
