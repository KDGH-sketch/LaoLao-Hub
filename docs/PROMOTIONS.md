# Promotions inside the app

What a **free account** sees to encourage an upgrade, once it has signed in. Code: `js/learner/promo.js`; the locked
screen is in `js/learner/upgrade.js`, the plans page in `js/learner/views-billing.js`. The welcome page (before sign-in)
has its own sign-up pop-up: see [WELCOME.md](WELCOME.md).

## The promotion pop-up

After signing in (from the welcome page, or opening the app straight into a lesson), a free account sees one
promotion, **once per sign-in**. It does not come back on a reload or when moving between lessons; it comes back after
signing out and in again (it is remembered in the browser tab, `sessionStorage` `laolao.promo.seen:<uid>`).

- **Who sees it:** learners with no paid plan running: the free plan, or a paid plan or trial that ended. Not
  Premium / Standard learners (a plan in its grace days counts as paid), not admins.
- **When it waits:** not on the plans, checkout and payment pages, and not on top of the free download chosen on the
  welcome page.
- **What it shows**, in this order:
  1. an offer whose *Where* is **Pop-up in the app for free accounts** (Admin → Promotions & Feed): its photo, badge or
     discount text, headline, text, a countdown to its end, the plan's price and perks, and its own button text;
  2. otherwise a running offer for a paid plan (for example one placed in the Promotions section). Its button says
     *Get Premium* instead of the visitor wording *Create a free account*;
  3. otherwise an ad for the recommended paid plan (*Unlock all of LaoLao with Premium*), unless
     **Admin → Settings → Upgrade pop-up without an offer** is switched off.
- **Buttons:** *Get Premium* (or the offer's button text) opens that plan's checkout; *See all plans*; *Maybe later*.
  After paying, the learner comes back to where they were.
- An offer is shown only while it is **Published**, **Public**, **Active** and inside its start and end dates, like on
  the welcome page. Discounts are not applied automatically at checkout: say in the text how the offer is claimed.

## Locked content

When a free account opens something its plan does not include (a locked lesson, lab or practice), the locked screen
names the plan that includes it and its price, and now also shows **what is on sale** for that plan (or for a bigger
plan that includes it): badge, headline and countdown. *Upgrade to …* opens the plans page, which shows the sale on
top, a sale badge on that plan's card, and remembers what the learner wanted to unlock.

## Results

Each time the pop-up is shown or its button is used, the learner's activity gets a row (`promo_view`, `promo_click`,
`promo_plans`) with the offer id (or `plan:<id>` for the plan ad), next to the existing sign-up attribution.

## Tests

`node scripts/e2e_promo.mjs`: shown after sign-in to a free account, once per sign-in (not on reload or in the
lessons, again after signing out and in), never to Premium; the app offer comes first, then the running offer, then the
plan ad and its switch; *Get Premium* opens the checkout; the locked screen and the plans page show the sale; phone
bottom sheet in Night with no sideways scroll. Automated browsers get no pop-up unless the test sets `localStorage`
`laolao.promo.test`, so the other tests are not interrupted.
