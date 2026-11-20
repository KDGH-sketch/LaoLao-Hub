# The welcome page

The page visitors see before they sign in: the hero with the live sentence builder, greetings, the alphabet, the journey
through Laos, the festival calendar, services, free resources, promotions and plans, news, about, and the closing call to
action. Signing in and creating an account happen in a glass pop-up. Design: [mockups/welcome-landing.html](mockups/welcome-landing.html).
Code: `js/learner/welcome.js` (page), `welcome-data.js` (defaults), `welcome-scenes.js` (drawings),
`js/admin/welcome-admin.js` and `web-checks.js` (admin).

Everything on it is managed in the Admin Backend under **Website & Welcome**. No code changes are needed day to day.

## Sign-in pop-up and hooks

The page opens without a sign-in form, so visitors can look around first. Sign-in, registration and password reset live
in one pop-up (`glassDialog()`): a frosted-glass card in the middle of the screen, a bottom sheet on phones (pull it down
to close), with a burst of champa petals when it opens. Esc, the ×, *Not now, keep exploring* or a tap outside close it.

**What opens it**

| Trigger | Opens on | Message at the top |
|---|---|---|
| *Sign in* in the top bar (icon with "Sign in · or start free"), the phone dock | Sign in | none |
| *Start free*, the closing button, a plan, an offer, a free resource | Create account (Sign in when registration is closed) | the plan / offer / resource note, as before |
| **1 minute** on the page (time the tab is visible; `startHooks()`) | Create account | "You've been exploring for a minute…" |
| The mouse heading for the tabs or address bar, after 15 s (computers only) | Create account | "Before you go…" |
| **4 taps** on Lao sounds (alphabet, greeting, sentence builder, journey words, pattern demo; `nudge()`) | Create account | "Nice ear! You've already played 4 Lao sounds…" |

The three automatic hooks open the pop-up **at most once per visit** (`sessionStorage` `laolao.wl.hooked`), never in the
admin preview, and never while the pop-up or the phone menu is open. Automated browsers get no automatic pop-up unless
a test sets `localStorage` `laolao.wl.hookSec` (the wait in seconds).

**Hero.** The right side (below the text on phones) is the live sentence builder (`sentenceStage()`): *I + want + verb +
object* built block by block from the *pattern demo* words in the Welcome Page editor, with role colours, romanization,
the whole line and its translation. It moves to the next sentence every few seconds, pauses while pointed at, and reads
the sentence (*Hear it*) or a single word (tap a block) aloud.

**Top bar.** The theme picker is hidden on phones and sits in the menu instead. On phones a *Start free · Sign in* dock
slides up once the hero has scrolled away. A thin line under the top bar shows how far down the page you are.

## Running the page: step by step

1. **Change texts and sections** in *Website & Welcome → Welcome Page*.
   - Sections: switch each on or off, and drag (or use the arrows) to change the order. The top of the page with the
     sign-in card is always first.
   - Section headings: small heading, title, Lao subtitle and intro for each section.
   - Texts: the top of the page (badge, headline, intro, buttons, the greeting played), the greetings ribbon, the
     alphabet chips, the numbers strip, the services cards, About, the closing call to action, footer links, menu labels,
     and the page title and description for search engines.
   - Every text has English, Lao and Chinese. The **Checks** panel lists any that are empty (English is shown when a
     language is missing) and refuses HTML: the page shows plain text only.
2. **Save** keeps a draft. Visitors still see the published page.
3. **Preview**: the preview under the editor shows the saved draft at phone, tablet or desktop width, in Day or Night.
   *Open preview in a new tab* opens the real page (`?welcome-preview=1`) with a "Preview, not published" banner. Only
   signed-in admins see the draft there.
4. **Publish welcome page** copies the draft to the published page and records who and when. **Revert to published**
   throws the draft away.
5. **Places, festivals, offers and free resources** have their own menus (*Journey Places*, *Festivals*,
   *Promotions & Feed*, *Free Resources*). Each works like the other content editors: draft / published / archived,
   version history with restore, duplicate, delete, order, search and filters. They reach visitors only when they are
   **Published** with access **Public**, and after **Publish now** (the button in the header, which builds the bundles).
6. **News** comes from *Releases* and *Culture & Context*: tick *Feature on the welcome page*. Visitors see the title of a
   featured item; its text only if the item itself is Public.
7. **Plans and prices** come from *Pricing Plans*: active plans, in order. A plan can be hidden from the page
   (`showOnWelcome: false`), highlighted (`highlight` or *Recommended*), and given a badge and button text.
8. **Results**: the Welcome Page editor shows sign-ups from the last 7, 30 or 90 days by source and by offer.
   Links with `?ref=` or `utm_source=` (for example `…/LaoLao-Hub/?ref=facebook`) set the source.

Every create, update, delete, publish and revert is written to the *Activity Audit Log*.

## Places

| Field | Notes |
|---|---|
| Name, Lao name, badge, description, facts | Facts are the small chips |
| Latitude, longitude | Must be inside Laos (13.9 to 22.5 N, 100.1 to 107.7 E). The pin is placed from them automatically |
| Scene art | Six drawn landmarks (Luang Prabang, Vang Vieng, Plain of Jars, Vientiane, Champasak, Si Phan Don) or a generic temple, mountains, river, waterfall, market or cave |
| Photo | Optional; replaces the drawing. PNG, JPEG or WebP up to 5 MB, and **alt text is required** |
| Words | Lao, romanization, English, and an optional recording (otherwise the device reads the Lao aloud) |
| UNESCO year | Optional |

## Festivals

Month (1 to 12, for the calendar order), the date as shown ("13–16 April"), *Follows the lunar calendar* (shows that the
date moves each year), a picture (water bowl, rocket, candle, fire boat, stupa, flag, lanterns), name, Lao name, text.
The festival of the current month (or the next one) is highlighted.

## Life calendar

The section right after the festival calendar (menu: *Calendar*): what is happening in Laos through the year.
Admin → **Website & Welcome → Life Calendar** (`events`), with the same draft / published / archived, history and
*Publish now* as festivals. Code: `js/learner/welcome-calendar.js` (page), `welcome-calendar-data.js` (the 22 starter
events).

**What visitors see**

- **Today in Laos**: today's date, the season(s), the full or new moon, and the event happening now (or the next one)
  with *Explore*.
- **Filters**: Everything, Holidays, Buddhist days, Festivals, Culture, Seasons, Daily life (each kind has its colour).
- **The month**: arrows and *Today*; each day with events has coloured dots; the full and new moons are marked (they are
  Buddhist holy days, ວັນສິນ, worked out from the moon's mean cycle, so within about a day). Tapping a day lists its
  events; the seasons of the month are chips above the days.
- **The list**: the month's events (or the chosen day's) with their dates, *Happening now* / *In 5 days* / *Ended*, and
  *Explore*; below it, the everyday customs (morning alms, baci).
- **The event sheet** (*Explore*): photo or a coloured card with the Lao name, kind, dates (*about* for lunar dates),
  summary, **The story**, **Why it matters today**, **Good to know** (a remark for visitors), **Words to know** (tap to
  hear), **Watch** (a YouTube or video link), **Add to my calendar** (an .ics file; yearly events repeat), **Learn the
  words with LaoLao** (opens Create account with a note), and *Previous / Next* through the month's events. A bottom
  sheet on phones.

**The event form**

| Field | Notes |
|---|---|
| Name, Lao name, kind | Kind sets the colour and the filter |
| When | *On a date* (Start, optional End), *Same date every year* (the year is ignored), *Months every year* (a season, may wrap past December), *Every day* (optional time), *Any time* |
| Follows the moon | Shown as "about" with a note that the date moves. Add next year's date under **Other years**; a lunar date with none is a warning. Dates are never guessed for a year that has none |
| Summary, The story, Why it matters today, Good to know | Short summary on the calendar; the rest in the sheet |
| Words | Lao, romanization, English, optional recording |
| Video, photo | https:// links only; the photo needs alt text and has a focus point (see Photos) |

## Offers (Promotions & Feed)

Kind (banner, or countdown to the end), where (Promotions section, or a strip above the top of the page), headline,
text, badge, discount text, button text, the plan it promotes, start and end, and *Active*. An offer appears only while
it is Published, Public, Active and inside its dates; after the end it disappears by itself.

**Discounts are not applied automatically.** The checkout charges the plan's price. Say in the text how the offer is
claimed. The example offer in the starter content ships switched off for this reason (it is on only in demo mode).

The old *Promotions* download banner (`settings/promotions`) is still shown as a free resource until it is converted:
use *Convert to a resource* on the Promotions page; this also happens the first time an offer is saved.

## Free resources

Kind, title, text, cover letters and colour, the file (upload up to 5 MB: PDF, audio, image or MP4, or a link), and
*Ask visitors to create a free account first*. Without a file a resource shows "Coming soon".

**What is protected, honestly.** Published Public items, including resource links, are readable by anyone: that is how
visitors see them before signing in. *Ask visitors to create a free account first* is a sign-up step, not protection;
the link opens right after sign-up. Only put files here that may be shared freely. Real gating would mean `access: "free"`
items, which are readable only after sign-in, and a download page in the app (not built).

## How it is put together

- **First paint never waits.** The page renders from `welcome-data.js` at once, then fills in from the backend. Each
  read gives up after 2.5 s; offline, the defaults (and the last cached public bundle) stay.
- **Visitors read only public data**: `settings/*` (except the draft), `plans`, `bundles/meta` and the tier-0 bundle
  parts. The page never calls an `ll_*` function before sign-in. `loadPublicBundle()` keeps its own cache, apart from
  the signed-in app's bundle cache.
- **Database rules** (`supabase-schema.sql`, or `supabase-welcome-migration.sql` for a live project):
  `places`, `festivals`, `offers`, `resources` are readable by admins and writable by editors of the matching menu
  (`ll_can_edit`; offers belong to *Promotions & Feed*). `settings/welcome` and `settings/welcomeDraft` are writable by
  editors of the *Welcome Page* menu; the draft is readable by admins only.
- **Roles**: Super Admin and owner do everything; editor, content and admin edit all five menus; custom roles get view
  and edit per menu; reviewers read only; support has no access.
- **Sign-up attribution**: `?ref=` / `utm_*`, the referring site and the clicked offer or plan are kept in the browser tab
  (sessionStorage) and saved as `signup: { source, offerId, planId, campaign }` on the new learner's own profile. No
  anonymous write endpoint exists.
- **Theme and language**: the app's Day / Night / Auto (`data-theme`, `laolao_theme`) and EN / ລາວ / 中文
  (`xuelu.lang`). Lao text is marked `lang="lo"`.
- **In-page links** are buttons that scroll; the address hash is never changed (the app reads it for its own links).
- **Modern CSS with fallbacks**: container queries in rem, `:has()`, `:user-invalid`, `@property`, `color-mix()`, oklch
  gradients, scroll-driven animation, CSS motion path (fire boats on the Mekong), `@starting-style`, View Transitions
  for the theme, the Popover API for the phone menu, logical properties, `dvh`, safe areas. Each has an `@supports`
  or script fallback. Off-screen animations pause; reduced motion, more contrast and forced colours are respected.
  The welcome styles are not in a cascade layer on purpose (`app.css` is unlayered, and unlayered rules would win);
  keyframes are in `@layer wl-motion`.

## Upgrading a live project

1. Run `supabase-welcome-migration.sql`, then `supabase-calendar-migration.sql` (the life calendar's `events` table), in
   the Supabase SQL Editor (both safe to run again; they change no rows).
2. Optional: *Settings → Import starter content* adds the six places, six festivals, four resources and the example
   offer (inactive), or create your own.
3. *Publish now*, then *Website & Welcome → Welcome Page → Publish welcome page*.

## Tests

| Command | What it checks |
|---|---|
| `node scripts/test_welcome_data.mjs` | Defaults = starter content; pins match the mockup; every place inside Laos; the editors' checks |
| `npm run test:sql` | Visitors read only tier 0 and the published copy; who may write the new tables and `settings/welcome`; the migration runs twice |
| `node scripts/e2e_calendar.mjs` | The life calendar after the festivals with its menu link, this month and today, the moon, month arrows, filters, a day's events, everyday customs, the event sheet (story, why, good to know, words, previous / next, .ics, Create account), a new event from the admin, phone bottom sheet in Night, the admin form |
| `node scripts/e2e_welcome_photos.mjs` | A 12.9 MB photo resized to WebP before upload, the focus point, alt text required, the photo shown in each section (hero, festival, place, offer, resource, news, About) with its alt text and focus, phone and computer, Day and Night, removing a photo brings the drawing back |
| `node scripts/e2e_welcome.mjs` | Plans from the table, registration closed, offer dates and on/off, empty resources, hidden news, draft / publish / revert / preview, a new place gets a pin, hashes, phone menu, sign-up source, keyboard sign-in, offline |
| `npm run test:qa` | 20 sizes (280 to 3840 px) × Day and Night: no sideways scroll, clipping, small targets or tiny text, layout shift under 0.1; axe-core WCAG 2.2 AA on the page and on each admin screen; 200% text; 320 px reflow; skip link first; reduced motion |

## For review by a Lao speaker

These texts were written for the mockup and translated without a native reviewer. Please check them in
*Website & Welcome* before relying on them:

- **Places**: Luang Prabang (Tak Bat at dawn, Phou Si and Wat Chom Si, Wat Xieng Thong, UNESCO 1995), Vang Vieng
  (Nam Song, karst, balloons), Plain of Jars (Xieng Khouang, Iron Age, UNESCO 2019), Vientiane (Pha That Luang, Boun That
  Luang in November), Champasak and Wat Phou (Khmer era, Phou Kao, dok champa, UNESCO 2001), Si Phan Don (Mekong up to
  14 km wide, Don Khone, Don Det, Li Phi and Khone Phapheng falls). The words and romanizations for each place.
- **Festivals**: Boun Pi Mai (13–16 April, Nang Sangkhan in Luang Prabang), Boun Bang Fai (May), Boun Khao Phansa
  (July full moon), Boun Ok Phansa and Suang Heua (October), Boun That Luang (November full moon, up to a week),
  National Day (2 December, 1975).
- **Life calendar** (`welcome-calendar-data.js`): the lunar dates for 2026 and 2027 (Makha Bousa, Visakha Bousa,
  Khao Phansa, Khao Padap Din, Ok Phansa, That Luang), which follow the Thai/Lao full moons and must be confirmed each
  year; the Hmong New Year dates (they differ by province); the Lao summaries. The story, why it matters and good to know
  are in English only so far (the page shows English when Lao or Chinese is empty).
- **All Lao and Chinese copy** in `welcome-data.js` (hero, section headings, services, about, resources).
