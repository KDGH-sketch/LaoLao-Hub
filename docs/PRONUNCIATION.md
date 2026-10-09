# Pronunciation Studio and Smart Review

## Pronunciation Studio (learner menu "Pronunciation", route `speak`)

**Course.** 14 built-in units in three areas, each tied to a CEFR Companion Volume (2020) *Phonological control* scale:

| Area | CEFR scale | Units |
|---|---|---|
| Sounds of Lao | Sound articulation | short / long vowels, vowels English lacks, aspiration (ປ/ພ/ບ), ng- / ny-, final -k -t -p, final -ng -n -m -y -w |
| Tones | Prosodic features | the six tones, unmarked words (consonant class), ◌່ ◌້, short checked syllables, tones in longer words |
| Speaking smoothly | Overall phonological control | sentence-final particles, shadowing sentences, shadowing the teacher's dialogues |

Each unit has three steps:

1. **Learn.** How to make the sound, a CEFR "I can…" goal, and tips for English or Chinese speakers. The learner chooses their first language.
2. **Hear the difference.** Minimal pairs: the learner hears one word and picks it.
3. **Say it.** The learner records themselves. Their pitch is drawn live, then over the target, with a score for tone shape, length and clarity, and concrete advice (for example "your voice went up, but this tone falls").

**Accent check.** Eight listening items and four spoken words. The result says where to start.

**Profile.** A score per tone (1–6) and per sound area, a history of attempts, and the trickiest sounds.

### How the voice is analysed (all on the device; nothing is sent anywhere)
- **Tones from the spelling.** `js/shared/lao-tone.js` splits a word into syllables and works out each tone from the consonant class, live / dead syllable, vowel length and tone mark. It uses the same rules as the Tone Lab.
- **Target pitch.**
  - If Voice Studio has a recording of the exact text, it is measured and used as the model.
  - Otherwise the target is built from the tone contours in **Admin → Tone Lab**, the Chao numbers such as `33` or `52`.
- **Pitch tracking.** `js/shared/pitch.js` runs YIN pitch tracking every 10 ms, converts the result to semitones around the speaker's own median, and compares it with the target using dynamic time warping. It then checks length and loudness.
- **Microphone.** `js/shared/recorder.js` uses the microphone (MediaRecorder and the Web Audio analyser) and stops by itself after a short silence.

### Managed in Admin → Pronunciation units
- **Change a built-in unit.** Create a unit with the same id (`pr-length`, `pr-six`, …) to replace it.
- **Hide a built-in unit.** Create a unit with that id and tick **Hide**.
- **Add a unit.** Any other id adds a new unit.
- **What a unit holds:** title, area, CEFR level, explanation, tips for English and Chinese speakers, words to say, and listening pairs (`ປາ | ພາ`).
- **Publishing.** Units appear for learners after **Publish**, like all content.

### One database step (Supabase)
The units need a new table, `pronunciation`. Run `supabase-schema.sql` again in the Supabase SQL editor.
- The script is additive: it creates the table if it is missing and gives it the same policies as the other content tables.
- No data is changed or dropped.
- Until the script is run, publishing still works (without teacher units) and learners get the built-in course.

## Smart Review (learner menu "Review", route `review`)
- **What is recorded.** Every checked answer in practice records what the learner picked instead, their recent right / wrong history and their answer time (`progress.coach.it`).
- **Diagnosis.** `js/shared/review-doctor.js` names the cause of each mistake:
  - tone mix-up (including ໝ/ມ and the same-sound letter pairs ຂ/ຄ, ສ/ຊ…);
  - short or long vowel;
  - look-alike letters (ບ/ປ, ດ/ຕ…);
  - different vowel;
  - related meanings (same topic);
  - word order;
  - forgetting;
  - slow recall.

  It shows the right word and the picked word side by side, with the differing letters marked.
- **Sessions.** Questions aim at the cause:
  - a tone or length mix-up → hear both and pick;
  - look-alike letters → choose the right spelling;
  - related meanings → choose the meaning against the confused word.

  Results grade the spaced-repetition deck (wrong 0, right but slow 2, right and quick 3) and update the coach. Due cards come first, the most overdue first.
- **Page.** Due now, to fix, memory strength, why you miss words (train one cause), trouble words with explanations, the 7-day forecast, and the classic flip cards.

Tests: `scripts/test_pron.mjs`, `scripts/test_review.mjs`, `scripts/e2e_pronounce.mjs` (with a synthesised voice as the microphone), `scripts/e2e_review.mjs`.
