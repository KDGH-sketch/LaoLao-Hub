# Notifications and the Smart Calendar

What learners and admins are told, and where. Code: `js/learner/notify.js` (learners), `js/admin/notify.js` (admins),
the order conversation in `js/admin/payments.js` and `js/learner/views-transfer.js`, and two database functions
(`ll_order_message`, `ll_delete_orders`) in `supabase-transfer-migration.sql`.

## Learners

**The bell** (top bar, next to the profile) shows how many updates are new. It rings when the count grows. Opening the
panel marks everything as read.

**Alert cards** drop in at the top of the screen, with a sound, the moment something happens to a payment, even if it
happened while the learner was away (it is announced at their next visit on that device):

| What happened | Card |
|---|---|
| A transfer is approved, or a card payment confirmed | "Premium is open! 🎉", the end date, confetti; the plan unlocks at once, no sign-out needed |
| A slip is rejected | "Your transfer slip was not approved" with the reason; *View* opens the transfer page to send a new slip |
| The team writes about an order | "Message from the LaoLao team" with the message |

**The panel** has two tabs:

- **Updates**: slip received and being checked, slip not approved (with the reason), plan open, a transfer not finished
  after an hour, messages from the team, the plan ending within 7 days, the plan ended, and Lao life calendar events today
  and tomorrow. Each one opens the right page.
- **Smart Calendar**: the learner's own time line, to check by themselves:
  - a card with the **days left** on their plan (a ring that empties as time passes), the end date, and *Renew* in the
    last week; free accounts see *View plans*;
  - **Coming up**: when to renew (7 days before the end), when the plan ends, and the Lao life calendar's events for
    the next 60 days (lunar dates marked "about");
  - **Earlier**: payments confirmed, slips sent, the plan's start.

**The transfer page** shows the team's messages as a conversation under the slip.

How it stays up to date: the app reads the learner's own orders every 45 seconds while it is open (every 2 minutes in a
background tab) and when it comes back to the front. What was already shown is remembered in the browser (`localStorage`
`laolao.notify.*`). Nothing new is stored for notifications: they come from the orders, the plan and the public calendar.

## Admins (support, admin, Super Admin)

- **The bell** in the admin top bar counts what needs someone: transfer slips waiting, payments flagged *Needs review*,
  and new paid orders. A new slip drops in as an alert card with a chime and *Review now*.
- **The menu**: *Payments & Orders* shows a red count while slips wait.
- **Payments**: every tab shows its count (Transfers waiting, Orders, Transactions); the transfer filters (To approve,
  Rejected, Approved, All) and the order status filter show theirs too.
- **Rejecting a slip**: choose a reason (one tap) and a friendly message to the learner is written for you, ready to
  edit: what happened and what to do next. The learner sees both at once (alert card, panel, transfer page).
- **Messages with the learner**: every order has a conversation (*Messages with the learner*); write to the learner at
  any time, for example "We got your second slip, checking now". At most 50 messages per order.
- **Clearing out orders** (Super Admin): tick orders and *Delete*, or *Clean up* removes expired, cancelled, failed and
  abandoned orders older than 7 days. Only orders that never became money can be deleted: paid and refunded orders, and
  any order with a payment recorded against it (including mismatches), show a lock and are always kept. Their slips are
  deleted with them.

## Live project

The message and delete functions are in `supabase-transfer-migration.sql`: run it (again) in the Supabase SQL Editor.
It is safe to run more than once.

## Tests

| Command | What it checks |
|---|---|
| `node scripts/e2e_notify.mjs` | Learner bell and count; the admin's bell, menu count and new-slip alert; counts on tabs and filters; rejecting with a message → the learner's alert, the message on the transfer page and in the panel; a message on an order; approving → "Premium is open" with confetti and the plan unlocked; the Smart Calendar (days left, end, renew); phone bottom sheet; selecting and deleting orders (paid kept) |
| `node scripts/test_sql_payments.mjs` | The rejection keeps the reason and the message; learners cannot post as the team or delete orders; empty messages refused; Super Admin deletes only orders without money; slips go with them |
