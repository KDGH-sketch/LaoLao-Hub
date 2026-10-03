# Setting up LaoLao

LaoLao has two apps:

| App | Address | Who uses it |
|---|---|---|
| **Learner app** | `https://YOUR-SITE/` | Your clients (learners) |
| **Admin Backend** | `https://YOUR-SITE/admin/` | You and your administrators |

Both apps use **Supabase** (Auth + PostgreSQL + Storage). The connection settings live in `env-config.js`.
If `env-config.js` has no Supabase settings, both apps run in **demo mode**: everything works, but the data stays in that one browser. Demo sign-ins (password `demo1234` for all):

- Super Admin: `admin@demo.laolao`
- Content Editor / Reviewer / Support: `editor@demo.laolao`, `reviewer@demo.laolao`, `support@demo.laolao`
- Learner, Premium plan: `learner@demo.laolao`
- Learner, Free plan: `free@demo.laolao`

---

## Run locally

```
npm install
npm run dev
```

Open http://localhost:3000/ (learner) and http://localhost:3000/admin/ (admin). Set `PORT` to use another port.
`server.js` serves `env-config.js` unchanged, so the local app talks to whatever Supabase project `env-config.js` points to.
**If that is your production project, everything you do locally changes real data.**

## 1. Create the Supabase project

1. Go to **supabase.com** → **New project**.
2. **Authentication → Providers → Email**: make sure Email sign-in is enabled, and turn on **Confirm email** (recommended: addresses are then verified before an account can sign in; LaoLao creates the learner profile at the first sign-in).
3. **Authentication → URL Configuration**: add your site URL (for example `https://kdgh-sketch.github.io/LaoLao-Hub/`) and `http://localhost:3000` to the redirect URLs.

## 2. Create the tables and security policies

1. Open `supabase-schema.sql` and replace `kindathanomsuck@gmail.com` with your owner email if it is different.
2. In Supabase: **SQL Editor → New query**, paste the whole file, **Run**. It is safe to run again after updates: tables and data are kept, and the security policies are replaced. It ends with a self-test of the `ll_apply` function and a list of accounts that have no learner profile.

On an existing installation, also run these once (each only changes rows that still have the old values):

| File | What it does |
|---|---|
| `supabase-seed-missing-tables.sql` | Starter rows for videos, tones, culture, characters and dictionary |
| `supabase-fix-video-links.sql` | Replaces made-up YouTube links with real videos |
| `supabase-fix-content.sql` | Repairs lesson links and the beginner learning path |

Then open the Admin and click **Publish now**.

To check the result without signing in: `npm run check:live` (read-only).

## 3. Connect the website

Copy `env-config.example.js` to `env-config.js` and fill in **Project Settings → API**:

```js
window.__SUPABASE_CONFIG__ = {
  url: "https://YOUR_PROJECT_ID.supabase.co",
  anonKey: "YOUR_SUPABASE_ANON_PUBLIC_KEY"
};
window.__OWNER_EMAIL__ = "you@example.com";
```

The anon key is public by design. The Row Level Security policies in `supabase-schema.sql` are what protect your data.

## 4. Upload the website

Push to the `main` branch. `.github/workflows/deploy.yml` publishes the repository to GitHub Pages automatically.

## 5. Become Super Admin and load the starter content

1. In Supabase: **Authentication → Users → Add user**. Enter your owner email and a password.
2. Open `https://YOUR-SITE/admin/` and sign in.
3. Click **Make me Super Admin**. This works once, and only for the owner email.
4. Go to **Settings → Import starter content**. This imports `data/seed.json` and publishes it to learners.

## 6. Add your first learner

**Learners → New learner** → name, email, level, plan and expiry date → **Create**.

---

## Everyday tasks

| I want to… | Where |
|---|---|
| Give someone access after they pay | Learners → learner → **Assign plan** or **+1 year** |
| Pause or end access | Learner → **Suspend** / **Cancel access** |
| Block an account | Learner → **Disable** |
| Write a new lesson | Content → Lessons → **New** → fill in → **Published + Publish now** |
| Keep work private until ready | Leave **Status: Draft**, then click **Save** |
| Make content Premium-only | In the editor, set **Access: Premium** |
| Let people sign up themselves | Settings → **Allow self-registration** (new accounts get the Free plan) |
| Add another admin | Administrators → **Add administrator** (Super Admin only) |

**Publishing:** learners don't read your content tables directly. When you click **Publish now**, LaoLao builds one package per plan (`bundles` table). Learners download their package once and keep it in the browser for offline use.

## Audio

Every word and sentence plays with the device's Lao (or Thai) voice. To use your own recordings: **Content → Audio → New**, type the exact Lao text, then paste a link to the MP3 or upload a file. Uploads go to the Supabase Storage bucket `laolao-assets`, which must exist and allow uploads for admins.
