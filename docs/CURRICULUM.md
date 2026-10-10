# LaoLao curriculum: Stage 1–6 (one year)

A full course of 52 weeks in six stages, delivered as a **curriculum pack** that Admin imports with one button.

| Stage | Level | Weeks | Theme | Access |
|---|---|---|---|---|
| 1 | A1 | 1–8 | Survival Lao: greetings, numbers, food, family, shopping, transport | Free |
| 2 | A1+ | 9–16 | Everyday Lao: time, routines, weather, clothes, restaurants, directions, home, work | Free |
| 3 | A2 | 17–26 | Getting things done: office, bank, phone, renting, doctor, travel, invitations, problems | Basic (standard) |
| 4 | B1 | 27–36 | Lao life and society: interviews, formal writing, school, village and farming, provinces, Mekong, environment, news, history, Buddhism | Basic (standard) |
| 5 | B2 | 37–44 | Lao in depth: opinions, business, law, public health, energy, media, Lan Xang, literature, proverbs | Premium |
| 6 | C1 | 45–52 | Mastery: monks' language, speeches, official letters, negotiation, poetry, idioms, dialects, humour, translation, diplomacy, ceremonies | Premium |

Each stage has 20 lessons, and each lesson has 6–10 words, one or more sentence patterns and grammar points, a dialogue (with romanization and English and Chinese translations), and a generated 8-question quiz. Each stage also has 4 culture stories and a learning path. In total:

- 120 lessons
- 1,156 words
- 71 patterns (n 301–371)
- 37 grammar points
- 120 dialogues
- 120 quizzes (960 questions)
- 24 culture stories
- 6 paths

Pace: about 2.5 lessons a week. Each lesson takes 3–4 sessions (words, dialogue, pattern and grammar, quiz), and Practice and Review run alongside.

## Where things are

- `content/curriculum/stage1.mjs` … `stage6.mjs`: the authoring files, which people edit.
  - A word is either a string, meaning a word from the practice bank (`js/shared/practice-bank.js`), or `[Lao, romanization, part of speech, English, Chinese]`.
  - Sentences are written **with spaces between the words**. The app joins them, and the spaces mark the word boundaries for tap-to-translate.
- `content/curriculum/words.mjs`: romanization for the small words used in sentences that are not lesson words.
  - It also holds `SYLLABLES_OK`: spellings where the automatic syllable counter is wrong but the romanization is right.
- `scripts/build_pack.mjs` builds `data/curriculum-pack.json`. `--check` only validates.
- `js/shared/content-pack.js`: `loadPack`, `planPack` and `importPack`. Import adds only the ids that are missing; existing items are never changed.
- Admin → **All content** → **Curriculum pack**:
  - **Check what's new** shows per-type counts.
  - **Import** adds the new items, then offers **Publish now**.
  - **Use a pack file…** imports a pack JSON from your computer.
- Demo mode imports the pack once, when lesson `c1-01` is missing.

## Editing the course

1. Edit a stage file.
2. Run `node scripts/build_pack.mjs`. It stops on any error and lists warnings:
   - Lao script only, with no Latin or Thai letters;
   - romanization for every word, with syllable counts that match the spelling;
   - every pattern, grammar point and lesson reference exists;
   - ids are unique and don't clash with the starter content;
   - every quiz answer is valid.
3. Run `node scripts/test_pack.mjs`. It also checks that the pack JSON was rebuilt.
4. In Admin, click **Check what's new**, then **Import**, then **Publish**.

Changing an item that a live site has already imported does **not** update it through the pack, because import never overwrites. Edit that item in Admin instead.

## Native review is required

The content was written carefully but **not yet checked by a native Lao teacher**. Before learners rely on it, review these:

- **Romanization tone marks.** Syllable counts are checked automatically; tones are not.
- **Stage 5–6 register:**
  - formal and monks' vocabulary;
  - idioms and proverbs;
  - historical facts and dates.
- **Spelling variants.** For example, ກໍ vs ກໍ່, and older vs reformed spellings.
- **The quizzes.** They are generated from each lesson's words and dialogue. Check that the distractors are sensible.

## Access

The access level is set per stage in `ACCESS_BY_STAGE` in `scripts/build_pack.mjs`, and each item can be changed in Admin afterwards. Learners only ever receive the content bundles of their plan (bundles + RLS).

**However,** files in this public repository, and anything served from GitHub Pages, can be read by anyone. That includes `content/curriculum/*` and `data/curriculum-pack.json`. To keep the paid stages private:

1. keep `stage3.mjs`–`stage6.mjs` out of the public repo;
2. build the full pack locally;
3. import it with **Use a pack file…**.
