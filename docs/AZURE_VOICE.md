# Computer voice (Microsoft Azure) for Voice Studio

Voice Studio can fill gaps with Microsoft Azure's two Lao voices, **Keomany** (female) and **Chanthavong** (male),
until you have recorded the text yourself. Your own recordings always play first, and a sentence is never mixed from
both voices.

## How it works

```
Voice Studio (admin's browser) ──► Supabase Edge Function "tts" ──► Azure Speech (Lao voice)
          ▲                          · holds the Azure key (never in the browser or GitHub)
          │                          · checks ll_can_edit('audio') with the admin's own sign-in
          │                          · monthly character limit (default 450,000)
          └── MP3 comes back ─► saved like a recording (laolao-assets storage + an "audio" row, source "azure")
                                ─► learners hear it after Publish now
```

Each text is created **once** and saved. Learners play the saved file, so they never cost anything, and they cannot
call Azure.

## Cost

- **Free tier:** 500,000 characters a month on Azure's free (F0) Speech resource.
- **This app stops at 450,000 a month by default,** so you stay inside the free tier.
- **After that,** the paid (S0) tier is about **$16 per million characters**. Check the
  [Azure pricing page](https://azure.microsoft.com/en-us/pricing/details/cognitive-services/speech-services/)
  for the current rate.
- **For scale:** a Lao sentence is roughly 30–40 characters, so 10,000 sentences is about 350,000 characters, which is
  free.

## Setup (about 15 minutes, once)

### 1. Create the Azure Speech resource

1. Go to <https://portal.azure.com> and sign in, or create a free account. Azure usually asks for a card to verify
   you, but the free tier is not charged.
2. Search for **Speech services** and choose **Create**.
3. Fill in the form:
   - **Subscription:** your subscription.
   - **Resource group:** create one, for example `laolao`.
   - **Region:** pick one close to Laos, for example **Southeast Asia** (`southeastasia`).
   - **Name:** for example `laolao-speech`.
   - **Pricing tier:** **Free F0**.
4. Choose **Review + create**, then **Create**. Wait about a minute.
5. Open the resource, then **Keys and Endpoint**. Copy **KEY 1** and the **Location/Region** (for example
   `southeastasia`).

Keep KEY 1 private. Don't paste it into the app, `env-config.js`, GitHub or chat.

### 2. Deploy the function and store the key in Supabase

You need your Supabase project reference: the part before `.supabase.co` in your project URL, also shown under
Project Settings → General. Run these in a terminal, in the project folder:

```bash
npx supabase login                                   # opens the browser once
npx supabase link --project-ref YOUR_PROJECT_REF
npx supabase functions deploy tts
npx supabase secrets set AZURE_SPEECH_KEY=PASTE_KEY_1 AZURE_SPEECH_REGION=southeastasia
```

Optional settings:

```bash
# only your site may call it from a browser (recommended)
npx supabase secrets set TTS_ALLOWED_ORIGINS=https://kdgh-sketch.github.io
# a different monthly character limit (0 turns the computer voice off)
npx supabase secrets set TTS_MONTHLY_CHAR_LIMIT=450000
```

If you prefer not to use the terminal for secrets, the Supabase dashboard has them too: **Edge Functions → Secrets**.
Deploying the function itself needs the CLI.

### 3. Use it

1. Open **Admin → Voice Studio**. The **Computer voice (Azure)** card should say **Connected** and show this month's
   characters.
2. Choose the voice (Keomany or Chanthavong), and tick **Slower** if you want.
3. Pick what to create:
   - **This text:** the word or sentence shown in the recorder.
   - **Learner requests:** what learners tried to play that had no audio.
   - **Sentences without audio:** every sentence that can't play yet.
4. Press **Publish now** in the yellow bar. Learners hear the new audio after that.
5. In the **Recorded** tab, computer audio is marked **Computer voice**. Listen, and set **Approved** or delete it.

When you later record a text yourself, your recording replaces the computer voice for learners automatically. The
computer file stays as a backup; delete it in **Recorded** if you want.

## Troubleshooting

| What you see | What to do |
|---|---|
| **Not connected** | Run step 2 again (deploy the function, set both secrets). It can take a minute to update. |
| "Azure refused the key" | KEY 1 or the region is wrong: `npx supabase secrets set AZURE_SPEECH_KEY=… AZURE_SPEECH_REGION=…` |
| "This month's character limit is reached" | Wait for next month, or raise `TTS_MONTHLY_CHAR_LIMIT`. Over 500,000 needs the paid S0 tier in Azure. |
| "Not allowed" | Your admin role can't edit audio. A Super Admin can grant it in Administrators. |

## Security notes

- **The Azure key lives only in Supabase's secret store,** read by the `tts` function. It never reaches the browser,
  GitHub or `env-config.js`.
- **Who can use it:** only admins for whom the database says `ll_can_edit('audio')` is true. Learners can't call it.
- **Limits per request:** at most 20 texts, Lao only, 300 characters each. The monthly limit is checked before Azure is
  called.
- **Where usage is stored:** `settings/ttsUsage` holds the monthly character count, and only the function writes it.
- **Tests:** `node scripts/test_tts_server.mjs` (the function, with a fake Azure) and
  `node scripts/e2e_voice_studio.mjs` (the studio and playback, with a demo voice).
