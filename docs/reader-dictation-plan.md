# Sentence dictation from graded readers

Status: D1 and D2 landed (2026-10-24). Platform only: no new reader text, no new model call. Owner visual and device acceptance pending.

## Why

A zero-basis learner can read a reader and answer its two checkpoints, but nothing makes them write what they hear. Dictation is the cheapest honest listening-and-spelling exercise: the reader's own sentences, the device voice, deterministic checking, results in Practice and Mistakes like every other exercise.

## What it is

On a graded reader's page, after the checkpoints, a button "Practise by dictation" prepares one listening exercise set from that reader's sentences (up to 6, random sample, at least the schema minimum of 3 exist) and opens it in Practice. The learner presses Listen, types the sentence, checks. The set is an ordinary saved unit: it shows in Practice → Listening, wrong answers appear in Mistakes and can be retried, backups and resets work with no change.

No key, no content service, no network: audio is the device voice, grading is deterministic.

## Design (facts from the code, 2026-10-24)

- **Item type.** The one hear-and-type control is `NumberDictationControl` (type `NUMBER_DICTATION`, `audioText`, scalar `expectedAnswer`, graded by `gradeItem`). Reuse it; do not add a type. The name says "number" but nothing in the control or grader is number-specific; renaming 11 types across fixtures and e2e is churn without a caller, so the plan records the oddity in `docs/architecture.md` instead.
- **Provenance.** Each item carries `meta: { source: 'reader-dictation', readerId, version, sentenceId, strictAccents: true, ignoreSentencePunctuation: true, playbackEngine: 'device' }` validated by a small Zod schema in `src/types/` (like `nounGenderDrill.ts`). `version` is the body hash, so a later edition never merges with this one.
- **Listening gate.** No schema change: `supportsListening` already accepts every `NUMBER_DICTATION` item with nonblank `audioText`. A small meta schema ties the marker to the type (a `reader-dictation` item must be `NUMBER_DICTATION` with `audioText`), refined in `refineExerciseItem` like `noun-gender`. Only the Practice caption `learning.listeningSupport` (both locales) and the line "Listening supports number dictation only" in `.claude/rules/ui.md` change, to name reader sentences.
- **Prompt and answer.** `audioText` = `expectedAnswer` = the sentence `fr` (already NFC, one sentence, ends in `.`, `!` or `?`, apostrophes U+2019). `prompt` = the sentence's authored translation in the interface language at creation time: it gives the meaning, never the French. `NumberDictationControl` renders `item.prompt` (as the clue) and wires French word lookup (`onWord`) onto it; for `reader-dictation` items it must render the prompt without `onWord`, because the translation is not French. `expectedAnswer` appears only after a wrong check (existing behaviour, verified by review).
- **Punctuation fairness.** `normalizeFrench` turns most punctuation into apostrophes, so a learner who hears a sentence and types it without the final full stop is marked wrong. Add one rule to `gradeItem`'s scalar path: when `item.meta?.ignoreSentencePunctuation === true`, replace each of `. , ; : ! ? … « » ( )` with a space in the typed answer, the expected answer and the acceptable answers before `normalizeFrench` (which collapses whitespace). A space, not an empty string, so `Oui,tu` still reads as two words. Hyphens and apostrophes stay (orthography: `est-ce`, `j'ai`), accents stay strict. The flag is item-level like `strictAccents`; no new setting.
- **Device voice only.** Only `NumberDictationControl` changes (`ItemRow` draws no Listen button for dictation): when `meta.playbackEngine === 'device'` its `SpeakButton` gets `engine="device"` and the speech-after-check call passes `engine: 'device'`. `speechAfterCheck` still decides whether to speak after a check (master switch off means silence). This is a declared exception to "Explicit Listen always uses the selected engine": D2 updates `.claude/rules/speech.md` and the comment on `speechAfterCheck` in `src/utils/appSettings.ts`. The device voice is an explicit source: nothing is synthesized or fetched; without a French voice the control shows the real error. Other dictation items are unchanged.
- **Saving.** A pure `prepareReaderDictation({ reader, count, language, rng, makeId, now, t })` in `src/services/exercises/fromReader.ts` returns `ExerciseUnit[]` (one unit) through `ExerciseUnitSchema.parse`, as `fromPairs.ts` does; `title` and `instruction` come from `t()` keys in both locales (learning area `listening`, level from the reader, `setTitle` = the reader's French title, section COMPRENDRE, `grammarTags: ['listening-dictation']`); the translation language is the interface language of `t`. The button uses `useUnitSaver` and `saveUnits` (retries keep the same prepared batch), then navigates to `practiceSet` listening. Each click creates a new set with a new sample; no dedupe in v1. A saved unit is self-contained: Mistakes retry and backup/restore need no reader.

## Limits

- Dictation grading is only as good as the reader text; stages 1 to 3 carry AI review, not human review (unchanged).
- Long sentences make typing hard on a phone; the cap is 6 sentences, no length filter in v1.
- The Today checklist is not extended in this epic (the Sound pairs step already stands for listening practice); revisit when the owner has used both.

## Steps (each lands separately)

- D1 data: `types` meta schema and its refinement, `gradeItem` flag, `prepareReaderDictation`, tests (preparation, the marker-to-type refinement, grading with and without terminal punctuation, a comma without a following space, hyphen and apostrophe still significant, other item types unaffected, fewer than the minimum sentences rejected, retry through `saveUnits`).
- D2 control and page: device engine and no `onWord` on the prompt in `NumberDictationControl`, the button in `GradedReaderWorkspace` after the checkpoints (outline variant, one filled button per view stays), copy in both locales, caption update, the two rule-file lines, tests, `CHANGELOG.md`, `docs/architecture.md` (including that the type name says "number" but is the one hear-and-type control).

Plan review: Argon, 2026-10-24, six findings (control prints the prompt with lookup; `ItemRow` has no dictation Listen button; the `supportsListening` branch was redundant; the device-voice exception needed a rule update; `t` and an array return; punctuation replaced by a space); all checked against the code and applied above.

## Owner checks (never done by an agent)

Hear it on a real device voice (iOS Safari especially), type a full sentence on a phone, see the set in Practice and a wrong answer in Mistakes, and look at the button in three themes and at 360 px.
