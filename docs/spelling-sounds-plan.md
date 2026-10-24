# Letter sounds: spelling to sound before IPA

Status: S1, C1, C2, S1b, C3 (UI copy) and S2 have landed. S3 drills are separate and not built here. Revised after Argon's review (seven findings, all checked against the code and applied). Queue item 2 of the standing goal. Framework first, content later (`RULES.md`): the platform, the review gate and a small seed pack; the full inventory of French spellings is later content work. Visual, device-voice and human language acceptance remain owner checks.

## Why

The Speaking page shows the 36 IPA symbols with one word each. A zero-basis learner cannot read IPA, and the spellings they can already read (`ou`, `eau`, `on`, `ch`) are never taught as spellings. This epic teaches what a spelling sounds like by hearing real words first; IPA is one tap away, never the entry point.

## What it is

A "Letter sounds" section on the Speaking page, above French sounds:

1. **Reference.** Tiles grouped as vowels, nasal vowels, consonants and silent letters. Tapping a spelling opens a sheet: one plain sentence about it (including the condition under which it holds), three or four example words that each play with the device voice, and a "Show IPA" fold, closed by default.
2. **Practice.** A "Practise these sounds" button creates a Listening set: the learner hears a word and chooses which spelling makes its main sound. An ordinary saved unit (Practice, Mistakes, backup unchanged).

No key, no content service, no network: the pack is bundled, audio is the device voice, grading is deterministic.

## Honest scope: one sound per spelling

French spellings are rarely context-free. v1 therefore maps each spelling to the ONE sound the learner meets first, picks examples only from that reading, and states the condition in the note ("nasal only when not followed by a vowel or another n or m"). Other readings (`ai` as /e/, `eu` as /œ/, `ui` after `q`) are not taught in v1; patterns whose first reading is not clear-cut (`ai`, `ui`) are left out of the seed. This is content-risk the human review must still confirm.

## Data (a reviewed pack, modelled on `data/minimal-pairs/`)

Authored source `data/spelling-sounds/patterns.json` (hand-written; the generator never edits it):

```json
{ "schemaVersion": 1, "patterns": [
  { "id": "ou", "spelling": "ou", "group": "vowels", "sound": ["u"],
    "examples": ["vous", "jour", "rouge"] } ] }
```

- `id`: ASCII slug (`c-cedille` for `ç`; the slug rule of `minimalPairs.ts` rejects non-ASCII). `group`: `vowels | nasals | consonants | silent`. `sound`: an array of one or two symbols of `FRENCH_IPA` taken from ANY of its groups (so `oi` is `["w","a"]` through the semivowels), or `[]` for `silent`. `examples`: 3 to 4 lowercase NFC A1 words, all distinct across the pack.
- The plain sentence is the locale key `spellingSounds.notes.<id>` in both locales. IPA appears in the UI only through `sound`.
- **Build gate** (`scripts/spelling-sounds/build.ts`, cloned from `scripts/minimal-pairs/build.ts`): schema; unique ids and examples; at most 24 patterns; both locale notes exist for every id (read from the locale files, because the i18n checker does not see dynamic keys); every example contains its pattern's spelling; **no example contains the spelling of any pattern with a different sound** (`oiseau` is rejected for `oi`; `au` inside `eau` and `in` inside `ain` are allowed because they share a sound); for `nasals` the spelling is followed by the end of the word or a consonant other than `n` or `m`; for `oi` it is not followed by `n`; for `silent` (`h`) every example starts with the spelling. The row hash covers the authored row AND both locale notes, so editing a note lapses its review.
- **Review.** `data/spelling-sounds/reviews.json`, append-only, same hash lapse as minimal-pairs, recorded with the `--kind ai|human` contract of `scripts/graded-readers/review.ts` (an AI review's `reviewedBy` starts with `AI review:`). The pack stores `review: { kind, by, at }` per pattern and NEVER the word "reviewed" for an AI review; the UI says so with a quiet notice ("checked by an AI, not yet by a teacher") like the graded readers. **A worker never records a review**: the reviewer model writes a findings report, the lead records the agreed rows. Authors and reviewers are different model families (author Gemini, reviewer GPT).
- Committed pack `src/data/spelling-sounds/patterns.json` (generated) and its CI `--check` line land only after C1 and C2 (S1b), so CI never sees an empty or unreviewed pack.

Seed content v1 (16 patterns): vowels `ou oi au eau eu`, nasals `on an en in ain`, consonants `ch gn qu ç ph`, silent `h`. Left for later content: `ai`, `ui`, `c`/`g` before e/i, final silent consonants, `s` between vowels, liaison.

## Drill

`prepareSpellingDrill({ pack, count = 8, rng, makeId, now, t })` returns one `ExerciseUnit[]`: type `CHOICE_SELECT`, learning area `listening`. The pool is every pattern except the `silent` group. Per item: sample distinct example words without replacement (so no two items share an `audioText`, which would share a Listen button's state); `audioText` = the word; `prompt` = `{a|b|c}`: the right spelling plus two distractors chosen from other patterns whose `sound` differs from the target's AND whose spelling is not a substring of the heard word; same group preferred, any group allowed when fewer than two fit; shuffled; `expectedAnswer` = the target spelling; item `id` = `${patternId}-${word}`; `meta: { source: 'spelling-sounds', patternId, strictAccents: true, playbackEngine: 'device' }`. `count` is capped at the number of distinct words available. The unit `title` and `instruction` come from `t()`.

`supportsListening` accepts `CHOICE_SELECT` with `meta.source === 'spelling-sounds'`. `ItemRow` plays Listen with the device voice when `meta.playbackEngine === 'device'` (the declared exception of reader dictation, extended). The error text in `src/types/exercises.ts` that names the allowed listening items, the comment on `speechAfterCheck`, `.claude/rules/speech.md` and `.claude/rules/ui.md` change in the same step.

## Decisions

1. IPA stays secondary: only behind the sheet's fold. We do not hide IPA elsewhere (word sheet) in this epic.
2. Device voice only for this section and its drills; a failing clip shows its real reason on the control. The Listen button keeps its existing label.
3. No runtime AI for patterns, notes or IPA (`docs/pronunciation-training-plan.md` section 8).
4. Owner checks: hear the words on a real device voice (it may nasalize or stress oddly), read the notes in both languages, and the human review that replaces the AI review before a real beginner uses the section.

## Steps (each lands separately)

- S1 data layer on fixtures only: types and schema, build script with the gate above, review tool (`--kind`), loader, tests. No seed file, no committed pack, no CI line.
- C1 content (agy `gemini-3.8-flash`, its own task): the 16 patterns' examples in `data/spelling-sounds/patterns.json` and the 16 English and Chinese notes in the locale files; verified by the S1 gate and `i18n:check`.
- C2 AI review (GPT, findings report only): the lead fixes disagreements and records `AI review:` records for the agreed rows.
- S1b the generated pack, the CI `--check` line, the loader pointing at it (lead, small).
- S2 section and sheet: tiles, device-voice example words, the IPA fold, the review notice, copy, tests, changelog, architecture.
- S3a `prepareSpellingDrill`, `supportsListening`, meta schema, tests.
- S3b `ItemRow` device branch, the "Practise these sounds" button, the error text and rule/comment lines, copy, tests, changelog.
