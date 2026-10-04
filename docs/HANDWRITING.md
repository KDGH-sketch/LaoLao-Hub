# Lao handwriting: stroke templates, checking and scoring

How the handwriting system works, for developers and for the teachers who create stroke templates.

## 1. Overview

```
Admin → Lao Script & Handwriting                         Learner → Script & Handwriting
  Stroke Editor  ─┐                                         watch the stroke order (once by default)
  Rules           ├─► characters/{id}.handwriting ─Publish─► draw on the canvas
  Animation       │   (versioned, draft/published)           checked after every stroke → feedback
  Preview / Test ─┘                                         score → progress, history, XP

js/shared/handwriting/       the engine, shared by learner, quizzes and admin
  geometry.js     resampling, simplification, DTW, distances, alignment (pure)
  model.js        data format, defaults, validation, version upgrades (pure)
  recognizer.js   compares strokes, drawing session: order, direction, path, start/end, count (pure)
  scorer.js       weighted score, components, feedback codes (pure)
  pad.js          drawing canvas: Pointer Events, responsive, high-DPI, guides, generated animation
  animator.js     demonstration (generated or uploaded GIF/WebP), GIF length, upload checks
  samples.js      approximate sample templates (tests and demo mode only, never written to a live database)
js/learner/views-handwriting.js   the learner activity
js/admin/handwriting.js            the admin manager and Stroke Editor
```

The same engine checks the quiz question type `write_char` and Practice → Write, and draws the stroke order in the dictionary's word sheet.

## 2. Data format (`characters/{id}.handwriting`, version 1)

```js
{
  v: 1,
  box: { aspect: 1 },                              // square drawing box; all coordinates are 0..1 (y down)
  strokes: [{
    id: "s1",                                      // stable: results refer to it, so reordering is safe
    points: [[0.42, 0.31, 0], [0.40, 0.29, 16]],   // x, y, ms since the stroke started (simplified, at most 64 points)
    note: { en: "Start with the head loop" },      // optional teaching hint
    tol: { start: [0.05, 0.15] }                   // optional per-stroke tolerance override
    // start, end, dir, len, bbox are derived from the points when read (never trusted from storage)
  }],
  rules: { … },                                    // per-character overrides (section 5)
  animation: { kind: "generated" } | { kind: "gif", url, durationMs, bytes, type },
  sample: true                                     // only on the approximate demo templates
}
```

- **The stroke data is the authority.** The animation is only a demonstration; checking always uses `strokes`.
- **Normalised coordinates:** the same template works on any canvas size, screen or orientation (tested: 240 to 1600 px give the same score).
- **Future versions:** `readTemplate()` upgrades older data when it reads it, so new algorithm fields never need a database redesign.
- **No new tables:** templates live in the existing `characters` content table, so versions, draft/published, plan tiers (`access`) and the Publish button apply unchanged.

## 3. Recognition algorithm

Every stroke, learner's and template's, is **resampled to 32 evenly spaced points**. Drawing speed and the number of pointer events then don't matter.

| Check | How | Why |
|---|---|---|
| **Path / shape** | **Dynamic Time Warping (DTW)** between the learner's and the template's points: the average distance along the best alignment | DTW follows the order of the points and tolerates uneven speed and wobble. About 1,000 steps per comparison, well under 1 ms |
| **Direction** | DTW against the template *and* against the reversed template. If the reversed fit is clearly better (ratio below 0.7), the direction is wrong | Works for loops, where start ≈ end and a simple start→end vector would fail. Hausdorff distance was rejected because it ignores point order, so it can't see direction |
| **Start / end** | Distance between the first and last points | "Start at the head loop" is the core rule of Lao writing |
| **Worst deviation** | Largest distance from the learner's stroke to the template path | Catches a stroke that is right on average but wanders off somewhere |
| **Length** | Learner length ÷ template length | Too short = "incomplete" |
| **Order** | If a stroke fails against the expected template stroke but clearly fits a *later* one, it's "wrong order: that was stroke 3" | Gives a useful message instead of "wrong" |
| **Count** | Missing strokes at the end, extra strokes after the last | |

The $1/$P gesture recognizers were rejected because they deliberately ignore position, size and rotation. Here the stroke must sit on the guide.

**Guide levels:**
- 1: faint letter plus all strokes
- 2: current stroke only
- 3: its start dot only
- 4: no guide

Levels 1–3 compare positions directly. At level 4 the whole drawing is first fitted onto the template's box, so writing smaller or off-centre isn't punished, while shape, order and direction still are. Level 4 is checked when the learner finishes, because a single stroke can't be aligned on its own.

## 4. Scoring

Each stroke gets 0..1 for direction, path, start and end (linear falloff between "full credit" and "error" tolerances).

```
order     = share of strokes drawn in the right place on the first try
count     = 1 − (extra + missing) / expected
total     = Σ weight × component       (weights are scaled to 100)
default   = order 30 · direction 20 · path 25 · start 10 · end 10 · count 5
passed    = total ≥ pass score (70)  AND  every stroke drawn  AND  no error left in the final drawing
```

- **Strict mode** (default): a wrong stroke is refused and must be redrawn. A corrected mistake earns half: the average of the wrong and the corrected try. The mistake is still recorded.
- **Retry penalty:** optional points off per retry of the whole character.
- **XP:** a passed character is a round in the normal XP rules, with points `handwriting` (default 15) × score, the pass/perfect bonus, stars and the replay factor.

`scoreAttempt()` returns `{ total, passed, components, ratios, weights, errors, strokes:[{ id, order, direction, path, start, end, error, tries, corrected }] }`.

## 5. Rules and tolerances

Rules are merged in layers: code defaults (`DEFAULT_HW_RULES` in `model.js`), then platform defaults (`settings/app.handwriting`, set by a Super Admin from any character's rules tab), then each character's `rules`.

| Rule | Default | Meaning |
|---|---|---|
| `tolerance.start` / `end` | `[0.06, 0.18]` | Full credit within 6% of the box; an error beyond 18% |
| `tolerance.path` | `[0.05, 0.16]` | Average DTW distance |
| `tolerance.maxDev` | `0.2` | Worst single deviation |
| `tolerance.minLength` | `0.5` | Shorter than half the template = incomplete |
| `tolerance.reverseRatio` | `0.7` | Direction decision |
| `passScore` | `70` | |
| `demo.plays` | `1` | How often "Show stroke order" can be used (0 = unlimited). The canvas stays locked until it has been watched |
| `demo.speed` | `1` | |
| `feedback` | `perStroke` | Or `final` (check when finished) |
| `strict` | `true` | A wrong stroke must be redrawn |
| `guide` | `1` | 1–4 |
| `retryPenalty` | `0` | |

**How the defaults were chosen:** measured on 9 real Lao characters × 100 random variations each (`npm test`).
- Sloppy but correct drawings stay below about 0.15–0.18 of the box at start and end.
- A *different* letter usually starts or ends 0.19 or more away.

Teachers should fine-tune difficult characters in Preview/Test.

## 6. Admin workflow

1. **Admin → Lao Script & Handwriting** lists every character with its template status: none, sample (not official), or ready.
2. Open a character. In **Strokes**, draw each stroke on the canvas *in the official order and direction*, over the faint letter. Every stroke appears numbered.
   - Select a stroke to **redraw**, **move up/down** or **delete** it.
   - **Undo/Redo** cover every change; **Clear all**; **Play animation**.
   - An optional teaching hint can be added per stroke.
3. **Scoring & rules:** weights, tolerances, pass score, demonstration plays and speed, guide level, checking mode, wrong-stroke handling, retry penalty. A Super Admin can make these the defaults for all characters.
4. **Animation:**
   - The default demonstration is drawn from the strokes.
   - You can instead upload a **GIF or WebP**, at most 2 MB. Its type is checked against the file's actual bytes, and a GIF's length is read from its frames.
   - Switching back keeps the uploaded file in storage, because older versions may use it.
5. **Preview / Test:** draw like a learner, with exactly the learner's checking and the current (even unsaved) settings. It shows per-stroke feedback with measurements (start, end, shape, length) and the score breakdown. Adjust and test again.
6. **Save** (stays draft) or **Save & publish**, then the **Publish now** button sends it to learners. Draft characters are never sent to learners.

**Who may do what:**

| Role | Can |
|---|---|
| Content editor / Super Admin | Edit templates |
| Reviewer | View and test (read-only) |
| Support | Doesn't see this menu |
| Custom roles | Follow their permission for the "characters" menu |

The database enforces the same rule (`ll_can_edit('characters')`).

## 7. Learner workflow

1. Choose a letter. Letters with a template come first; ✓ marks passed letters.
2. **Show stroke order:** the animation plays; the canvas is locked until then. By default it can be watched once per attempt, and a retry doesn't replay it.
3. Draw stroke by stroke with mouse, finger or pen. A numbered dot marks where the current stroke starts (guide levels 1–3), and the step indicator shows progress.
4. After each stroke, short feedback:
   - "Good! Stroke 1 is correct."
   - "Wrong stroke order: that was stroke 2. Draw stroke 1 first."
   - "Check the direction of stroke 1: start at the numbered dot."
   - "Stroke 2 is too far from the guide…"
   - "Please finish stroke 1." / "Start stroke 1 at the numbered dot." / "…ends in the wrong place."

   A refused stroke flashes red and disappears.
5. **Result:** total, passed or not, a tip from the most common error, the component bars, and XP.
6. **Try again** or **Next**.

Letters without a template are labelled **Practice only**: the learner can trace them, but nothing is checked or claimed.

**Saved progress:**
- `progress/{uid}.handwriting.{charId}` = `{ attempts, best, last, lastAt, passed, retries, errors:{ direction:n, … } }`, updated in one locked database step.
- `progress/{uid}/events` gets `type:"handwriting"` with the full result and per-stroke scores.
- Skill accuracy for "characters".
- Admins see attempts on the learner's page (Activity).

## 8. Security

- **Templates:** raw `characters` rows are readable and writable by content admins only. Learners receive templates only inside published bundles of their plan tier. Learners can't create or change templates (covered by `npm run test:sql`).
- **Attempts:** learners write only their own `progress` rows and can't read or write anyone else's (`npm run test:sql`).
- **Uploads:** only admins who can publish may upload. Type (GIF/WebP), the file's real signature and size (2 MB) are checked before upload. The bucket is public, like audio: demonstrations aren't secret.
- **Scores** are calculated in the learner's browser, like every quiz score in LaoLao. A technical user could submit a fake score for themselves; they can't change templates or other learners' data. Server-side re-scoring (an Edge Function receiving the raw strokes) is a possible future improvement.

## 9. Performance

- Scoring a 3-stroke character takes about 0.2–0.5 ms (measured in the tests).
- Pointer input uses coalesced events, and ink is redrawn only on movement.
- Templates are at most 64 points per stroke, about 1–3 KB per character in the bundle.
- The canvas follows the device pixel ratio (up to 3×) and is redrawn from normalised data on resize, so it never distorts.

## 10. Testing

| Command | Covers |
|---|---|
| `npm test` (`scripts/test_handwriting_engine.mjs`, 54 checks) | Correct/incorrect order, direction (including loops), exact/imperfect/scribbled path, missing, extra, wrong letter, start/end deviation, canvas sizes, retries, weights, guide levels, data format, GIF length, performance, plus an accuracy run of 5,000 drawings |
| `npm run test:sql` | Templates and attempts are protected by the database |
| `npm run test:e2e` (`scripts/e2e_handwriting.mjs`) | Real browser: mouse **and touch** drawing, one demonstration, feedback, scoring, saved progress and history, retry, phone/landscape/tablet layouts, admin drawing/undo/redo/reorder/delete, Preview/Test, rules, GIF upload and fake-file refusal, publish, drafts hidden, reviewer read-only, support hidden, Practice → Write, word sheet |

**Accuracy on the sample set** (deterministic, see the test output):

| Drawing | Passes |
|---|---|
| Correct | 100% |
| Sloppy but correct | 100% |
| One stroke reversed | 0.8% (very short tone marks are the hardest) |
| Scribble | 0% |
| A different letter | 2% (ບ/ປ differ only by the tail height) |
| Strokes swapped | 0% |
| Stroke missing | 0% |

## 11. Limitations

- **The sample templates are approximations,** written by a developer and not a teacher. They are marked "Sample" everywhere and exist only in demo mode. Official stroke order must be drawn by a teacher.
- **The test drawings are generated variations, not real learners.** Finger drawing on small phones and children's handwriting need manual testing, and tolerances may need tuning per character.
- **Very short strokes** (tone marks of about 10% of the box) give direction the least evidence.
- **Very similar letters** whose only difference is a small part (ບ/ປ) may be confused at lenient tolerances. Tighten `end` for those characters.
- **The drawing itself needs a pointer** (mouse, touch or pen). All controls work with the keyboard, but drawing can't be done from the keyboard.
- **Offline:** checking and scoring work offline, but the result is **not saved** without a connection. This applies to all progress in the app today: writes that fail are not queued.

## 12. Adding characters and improving the engine

- **New character:** Admin → Lao Script & Handwriting → **New**, then draw, test, publish.
- **New rule:** add it to `DEFAULT_HW_RULES` and `mergeHwRules()` (with validation), use it in `recognizer.js` or `scorer.js`, expose it in the admin rules tab, and add a test.
- **New data field:** bump `FORMAT_VERSION` and upgrade old data in `readTemplate()`.
