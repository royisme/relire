# Letter sounds: spelling to sound before IPA

Status: proposed (2026-10-24), not built. Queue item 2 of the standing goal. Framework first, content later (`RULES.md`): the platform, the review gate and a small seed pack; the full inventory of French spellings is later content work.

## Why

The Speaking page shows the 36 IPA symbols with one word each. A zero-basis learner cannot read IPA, and the sounds they can already read (`ou`, `eau`, `on`, `ch`) are never taught as spellings. This epic teaches what a spelling sounds like by hearing real words first; IPA is one tap away, never the entry point.

## What it is

A "Letter sounds" section on the Speaking page, above French sounds:

1. **Reference.** Tiles grouped as vowels, nasal vowels, consonants and silent letters. Tapping a spelling opens a sheet: one plain sentence about it, three or four example words that each play with the device voice, and a "Show IPA" fold, closed by default, with the symbol from the existing IPA chart.
2. **Practice.** A "Practise these sounds" button creates a Listening set: the learner hears a word and chooses which spelling makes its main sound. The set is an ordinary saved unit (Practice, Mistakes, backup unchanged).

No key, no content service, no network: the pack is bundled, audio is the device voice, grading is deterministic.

## Data (a reviewed pack, modelled on `data/minimal-pairs/`)

Authored source `data/spelling-sounds/patterns.json` (hand-written, never edited by the generator):

```json
{ "schemaVersion": 1, "patterns": [
  { "id": "ou", "spelling": "ou", "group": "vowels", "sound": "u",
    "examples": ["vous", "jour", "rouge"] } ] }
```

- `id`: slug; `group`: `vowels | nasals | consonants | silent`; `sound`: a symbol of `FRENCH_IPA` in the matching group, or `null` for `silent`; `examples`: 3 to 4 lowercase NFC words, A1 vocabulary.
- The plain sentence for each pattern is a locale key `spellingSounds.notes.<id>` in both locales (like `minimalPairs.notes.*`). IPA is never a typed string in the pack except through `sound`.
- Machine gates (build script): schema; unique ids; every example contains the pattern's `spelling` as a substring; `sound` is in the right IPA group; example count; at most 24 patterns; both locale notes exist for every id; no example repeated across patterns of different sounds.
- Review: `data/spelling-sounds/reviews.json`, append-only, one record per pattern with the hash of its authored row (as `scripts/minimal-pairs`): a changed row lapses its review; the build refuses unreviewed rows. A record whose `reviewedBy` starts with `AI review:` is an AI review; the loaded pack tells the UI which patterns are AI-reviewed only, and the section shows the same quiet notice the graded readers use. A human review replaces it later. Authors and reviewers are different model families.
- Committed pack `src/data/spelling-sounds/patterns.json` (generated), checked in CI like the other packs (`--check`).

Seed content (v1, 18 patterns, all context-free so a substring check is honest): vowels `ou oi ai au eau eu ui`, nasals `on an en in ain`, consonants `ch gn qu ç ph`, silent `h`. Later content: `c`/`g` before e/i, final silent consonants, `s` between vowels, liaison. Examples whose spelling is ambiguous (`en` in `bien`) are left out of v1.

## Drill

`prepareSpellingDrill({ pack, group?, count = 8, rng, makeId, now, t })` returns one `ExerciseUnit[]`: type `CHOICE_SELECT`, learning area `listening`, each item `audioText` = an example word, `prompt` = `{ou|on|eau}` (the right spelling plus two others of the same group, shuffled), `expectedAnswer` = the pattern's spelling, `meta: { source: 'spelling-sounds', patternId, strictAccents: true, playbackEngine: 'device' }`. Distractors come only from the pack, so no extra authoring. `supportsListening` accepts `CHOICE_SELECT` with `meta.source === 'spelling-sounds'`. `ItemRow` plays the Listen button with the device voice when `meta.playbackEngine === 'device'` (the same declared exception as reader dictation).

## Decisions

1. **IPA stays secondary.** The sheet shows IPA only behind its fold; the chart keeps working as it does. We do not hide IPA elsewhere (word sheet) in this epic.
2. **Device voice only** for this section and its drills, labelled by the existing device-voice behaviour; without a French voice the control shows the real error.
3. **No runtime AI** for patterns, notes or IPA (`docs/pronunciation-training-plan.md` section 8 rule).
4. **Owner checks.** Hearing the words on a real device (the device voice may stress or nasalize oddly), the notes' wording in both languages, and the human review that replaces the AI review before a real beginner uses it.

## Steps (each lands separately)

- S1 data and gate: types and schema, authored seed file, generator/check script, review tool, loader, CI line, tests (a doc-and-data task for the worker; the seed words and notes are a separate content task, see C1).
- C1 content (agy `gemini-3.8-flash`): the 18 patterns' example words and the 18 English and Chinese notes, in the shapes above; verified by the build script and `i18n:check`.
- C2 AI review (a different family, GPT): record `AI review:` records through the review tool for the rows it agrees with and report the disagreements; the lead fixes them.
- S2 section and sheet: Letter sounds on the Speaking page, tiles, the sheet with device-voice example words and the IPA fold, the review notice, copy, tests, changelog, architecture.
- S3 drill: `prepareSpellingDrill`, the "Practise these sounds" buttons, `supportsListening` and the `ItemRow` device branch, caption and rule lines, tests.
