# Plans, payments and subscriptions

How a learner buys a plan, how the payment is verified, and how that changes what they can use.
Access rules themselves (features, limits, content tiers) are in [ACCESS.md](ACCESS.md).

```
USER → ORDER (price snapshot) → PAYMENT (verified by the server) → ACCESS / subscription → ENTITLEMENTS → features & content
```

The browser never decides any step. It asks for a plan; the database sets the price; only a payment result that the
server has verified (signature, amount, currency, merchant, not seen before) changes the learner's access.

## Parts

| Part | Where | Job |
|---|---|---|
| Plans | `plans` table, Admin → Pricing Plans | Name, tier, features and limits (Access matrix), **online prices** per cycle and currency (`prices.month.LAK`, `prices.year.USD`, …), `recommended` |
| Current subscription | `access/{uid}` | planId, status, start, expiresAt, `billingCycle`, `source` (payment / admin / trial / promotion / registration), `orderId`, `cancelAtPeriodEnd`, `scheduledPlanId` |
| Subscription history | `subscriptions` | One row per change: action, old plan → new plan, source, amount, reason, who, when |
| Orders | `orders` (new) | `LLH-XXXXXXXXXX`, learner, plan, cycle, method, **amount and currency copied at order time**, status, history, return target |
| Payments | `payments` (new) | One row per provider transaction (`{provider}__{transactionId}`, unique): amount, currency, card brand and last 4 digits, verification, status |
| Payment settings | `settings/app.payments` | Online checkout on/off, methods offered, currency per method. No secrets |
| Payment rules | `supabase-schema.sql` | `ll_quote`, `ll_create_order`, `ll_activate_order`, `ll_fail_order`, `ll_refund_order`, `ll_set_cancel`, `ll_schedule_plan` |
| Payments function | `supabase/functions/payments/` | Supabase Edge Function: holds the provider keys, opens checkouts, verifies the provider's signed results, refunds |
| Demo mirror | `js/shared/billing.js` | The same rules in JavaScript for demo mode (and price display). Tested against the SQL |
| Learner screens | `js/learner/views-billing.js` | Plans, checkout, payment result, My learning plan (history, receipts, cancel, downgrade) |
| Admin screens | `js/admin/payments.js`, `plans.js`, `learners.js` | Orders, transactions, refunds, payment settings, prices, manual grants with source and reason |

## Who can do what (enforced by the database)

| | Learner | Support admin | Super Admin | Payments function (service key) |
|---|---|---|---|---|
| Read orders / payments | own only | all | all | all |
| Create an order | yes, via `ll_create_order` (price from the plan) | — | — | — |
| Mark an order paid, failed, refunded | **no** | **no** | **no** | yes, after verification |
| Change `access` | no (only cancel / schedule a downgrade via functions) | yes (manual grant, recorded) | yes | yes (on payment / refund) |
| Refund | no | no | yes, through the function | — |

There is no insert / update / delete policy on `orders` or `payments` at all, so not even an admin can mark an order paid by hand.
Manual grants (Learners → Assign plan) change `access` and write a history row with the source and reason; they never create
orders or payments.

## Checkout flow

1. The learner hits a locked feature → upgrade popup (reason: feature locked, limit reached, content above the plan, plan or trial ended).
   "Upgrade to …" remembers where they were and opens **Plans**.
2. **Plans**: monthly / yearly switch, prices from the database, current and recommended plan, Upgrade / Renew / Switch at renewal.
3. **Checkout**: methods enabled in Settings and supported by the provider (Mastercard, Visa, BCEL OnePay QR), each with the
   amount in its currency, and what will happen ("starts today, valid until …", renewal, or upgrade with credited days).
4. `POST /payments/checkout` (learner's token) → `ll_create_order` runs as the learner: account from the token, price from the
   plan, currency from the method. A second click reuses the open order. The function asks the provider for a checkout page
   and marks the order `pending`.
5. The learner pays on the **provider's page** (card numbers never reach LaoLao).
6. The provider sends its signed result to `POST /payments/webhook` (server to server) and with the learner's browser to
   `POST /payments/return`. Both are verified the same way; a result that does not verify changes nothing.
7. `ll_activate_order` locks the order, refuses a used transaction id, compares the **amount and currency with the order's
   snapshot**, then extends `access`, records the payment and the history row, and marks the order `paid`. Repeating it does nothing.
8. The app shows the **payment result** page, polling `GET /payments/status`. When paid it reloads the learner's access
   (no sign-out) and offers "Continue: <the feature they wanted>".

A redirect to the success page proves nothing: the result page only shows what the database says.

## State machines

**Order**: `created → pending → paid → refunded`; `created | pending → failed | cancelled | expired` (open checkouts expire after
an hour). A payment that still arrives for a failed, cancelled or expired order is honoured (the money was taken). A second
payment for a paid order is recorded as `duplicate` and flagged *Needs review* for a refund; a payment with the wrong amount or
currency is recorded as `mismatch` and flagged; neither unlocks anything.

**Subscription (access)**: `active` (paid / granted) → `cancelAtPeriodEnd` (still active) → expired at `expiresAt` → the
resolver falls back to the default (Free) plan. Also `trial`, `pending` (admin-set), `suspended`, `cancelled` (see ACCESS.md).
Nothing is deleted: history, orders and payments stay.

## Policies

| Situation | Behaviour |
|---|---|
| New plan | Starts now, ends one calendar month or year later (31 Jan + 1 month = 28/29 Feb) |
| Renew the same plan | Added after the current end date |
| Upgrade (e.g. Basic → Premium) | **Immediate, days credited**: Premium starts now at the full price; the unused paid days of Basic are converted to extra Premium days by value (remaining days × old daily price ÷ new daily price). Only paid time is credited (not admin grants or trials) |
| Downgrade | Not sold while a higher plan runs. The learner schedules it ("Switch at renewal"); the current plan stays until its end date |
| Cancel | Cancel at period end: the plan stays until its end date, then the account returns to Free. Can be undone |
| Renewal | **Manual.** Neither BCEL Hosted Checkout nor the test provider charge automatically, so the app never pretends to auto-renew. The learner renews from My learning plan; a banner appears in the last 7 days |
| Payment failed / cancelled | No change. The result page offers "Try <method> again", another method, or back to plans |
| Payment pending | No access until the provider confirms |
| Refund | **Access ends when the refund is confirmed**: the plan bought with that order ends at once and the learner returns to Free. Progress is kept |
| Price change | Affects new orders only; orders keep the price they were created with |

## Payment provider: BCEL

Chosen by the business: a BCEL merchant account.

- **Cards (Visa, Mastercard)** — BCEL's Online Payment Gateway runs on **CyberSource**. The adapter
  (`providers/bcel.js`) uses CyberSource **Secure Acceptance Hosted Checkout**: a form POSTed to the gateway with fields signed
  by HMAC-SHA256, and a signed reply (decision, reason code, reference = order number, amount, currency, transaction id, masked card).
  The reply is checked for signature, merchant profile and access key; `ACCEPT` + reason 100 = paid, `DECLINE`/`ERROR` = failed,
  `CANCEL` = cancelled, `REVIEW` = pending.
  Public reference: [Secure Acceptance Hosted Checkout](https://developer.cybersource.com/docs/cybs/en-us/sa/developer/all/sa-hosted/secure-acceptance.html).
  BCEL also lists JCB, UnionPay and Amex; they appear on the same hosted page if BCEL enables them.
- **BCEL OnePay QR** — not implemented: its merchant API is not public. It can be offered in Settings only once a provider
  adapter supports it (the checkout refuses methods the active provider does not support).
- **Refunds** — Hosted Checkout has no refund call. Refund in BCEL's merchant portal, then record it in Admin → Payments with
  the portal's refund reference.
- **Currencies** — LAK and USD. Default: cards charge USD, QR charges LAK (Admin → Payments → Settings). Confirm with BCEL
  which currencies your merchant account settles.
- **Merchant requirements** (BCEL, Oct 2026): registered business in Laos, business and tax licences, a BCEL LAK/USD account.
  Card centre: +856 21 211012 ext. 3, cardcenter@bcel.com.la.

**Status: NOT TESTED — REQUIRES MERCHANT CREDENTIALS.** The signing and reply parsing follow the public CyberSource
specification and are unit-tested offline, but no request has been sent to BCEL. Before going live, confirm with BCEL that
your profile uses Secure Acceptance Hosted Checkout and get the endpoint and keys, then run a test payment in their sandbox.

Another provider (e.g. PhaJay) is added as one more file in `providers/` with `createCheckout`, `parse`, and optionally
`query` and `refund`, and listed in `providers/index.js`.

### Test provider

`providers/mock.js` serves its own checkout page (Pay / Decline / Cancel / Leave pending) and signs its results with
`PAYMENT_MOCK_SECRET`, so the whole flow can be tried on a staging project. It is **never loaded when `PAYMENT_ENV=production`**.
Demo mode (no Supabase) uses an in-app test checkout with the same rules.

## Setting it up

1. Run `supabase-schema.sql` in the Supabase SQL Editor (adds `orders`, `payments` and the payment functions; changes no rows).
2. Install the [Supabase CLI](https://supabase.com/docs/guides/cli), then from the project folder:
   ```
   supabase login
   supabase link --project-ref <your-project-id>
   copy supabase\functions\payments\.env.example supabase\functions\payments\.env   (fill it in; it is git-ignored)
   supabase secrets set --env-file supabase/functions/payments/.env
   supabase functions deploy payments --no-verify-jwt
   ```
   `--no-verify-jwt` is required because the bank calls the webhook without a Supabase login; the function checks learners'
   tokens itself for checkout, status and refunds.
3. Give BCEL these URLs for the profile: merchant POST / notification URL `https://<project>.supabase.co/functions/v1/payments/webhook?p=bcel`,
   receipt and cancel pages are sent with each checkout (`…/payments/return`).
4. Admin → Pricing Plans: set monthly / yearly prices (LAK, USD) and the recommended plan.
5. Admin → Payments → Settings: check the provider shows as connected, choose methods and currencies, switch on online checkout.
6. Make a test purchase (staging with the test provider, then BCEL's sandbox), then switch `PAYMENT_ENV=production`.

| Secret | Meaning |
|---|---|
| `PAYMENT_PROVIDER` | `bcel` (or `mock` on staging) |
| `PAYMENT_ENV` | `production` or `staging` |
| `PAYMENT_APP_URL` | Where learners return, e.g. `https://kdgh-sketch.github.io/LaoLao-Hub/` |
| `PAYMENT_ALLOWED_ORIGINS` | Origins allowed to call the function, e.g. `https://kdgh-sketch.github.io` |
| `BCEL_SA_ENDPOINT`, `BCEL_SA_PROFILE_ID`, `BCEL_SA_ACCESS_KEY`, `BCEL_SA_SECRET_KEY` | From BCEL |
| `BCEL_SA_LOCALE`, `BCEL_SA_PRESELECT_CARD` | Optional |
| `PAYMENT_ALLOW_MOCK`, `PAYMENT_MOCK_SECRET` | Staging only |

Never put real values in GitHub, `env-config.js`, `.env.example` or the browser. Until steps 2 and 5 are done, learners see
the manual instructions (Settings → payment instructions / QR image) instead of a checkout.

## Security checklist

- Price, currency, account and status are decided in the database; the browser's values are ignored.
- Activation only with the service key, only after the provider's signature (and merchant profile) verified.
- Amount and currency compared with the order snapshot; mismatches flagged, never activated.
- Transaction ids unique (primary key): duplicate and replayed callbacks are no-ops; one transaction cannot pay two orders.
- Test-provider callbacks older than 15 minutes are refused; the test provider is impossible in production.
- One order creation at a time per account (advisory lock), open orders reused, at most 20 orders an hour.
- Return targets are app view names checked against a pattern, never URLs.
- No card numbers or CVV anywhere: hosted checkout; only brand and last 4 digits are stored.
- Errors shown to learners are codes turned into plain messages; details stay in the function log.
- Offline: cached access is display only; the app reloads access from the database when it reconnects.

## Tests

| Command | Covers |
|---|---|
| `node scripts/test_sql_payments.mjs` | Orders and price snapshot, tampering as a learner (insert / update / call service functions), wrong amount / currency, duplicates, transaction reuse, renew, upgrade credit, downgrade scheduling, cancel, failed / cancelled / pending / expired, refund, expiry, admin grants without payments, 112 quotes SQL = JavaScript |
| `node scripts/test_payments_server.mjs` | The Edge Function in Node: checkout, fake success return, forged / tampered / replayed callbacks, verified payment, retry, pending, refunds, production safety, BCEL signing and reply parsing (offline) |
| `node scripts/e2e_payments.mjs` | Browser (demo): locked feature → plans → checkout → decline → retry → pending → paid → back to the feature; My learning plan, receipt, cancel / reactivate, downgrade; "Maybe later"; admin orders and refund; phone and night layouts |

All three run in `npm run test:sql` / `npm run test:e2e` and in CI before every deploy.
