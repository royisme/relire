# Sentence dictation from graded readers

Status: proposed (2026-10-24), not built. Queue item 1 of the standing goal. Platform only: no new reader text, no new model call.

## Why

A zero-basis learner can read a reader and answer its two checkpoints, but nothing makes them write what they hear. Dictation is the cheapest honest listening-and-spelling exercise: the reader's own sentences, the device voice, deterministic checking, results in Practice and Mistakes like every other exercise.

## What it is

On a graded reader's page, after the checkpoints, a button "Practise by dictation" prepares one listening exercise set from that reader's sentences (up to 6, random sample, at least the schema minimum of 3 exist) and opens it in Practice. The learner presses Listen, types the sentence, checks. The set is an ordinary saved unit: it shows in Practice → Listening, wrong answers appear in Mistakes and can be retried, backups and resets work with no change.

No key, no content service, no network: audio is the device voice, grading is deterministic.

## Design (facts from the code, 2026-10-24)

- **Item type.** The one hear-and-type control is `NumberDictationControl` (type `NUMBER_DICTATION`, `audioText`, scalar `expectedAnswer`, graded by `gradeItem`). Reuse it; do not add a type. The name says "number" but nothing in the control or grader is number-specific; renaming 11 types across fixtures and e2e is churn without a caller, so the plan records the oddity in `docs/architecture.md` instead.
- **Provenance.** Each item carries `meta: { source: 'reader-dictation', readerId, version, sentenceId, strictAccents: true, ignoreSentencePunctuation: true, playbackEngine: 'device' }` validated by a small Zod schema in `src/types/` (like `nounGenderDrill.ts`). `version` is the body hash, so a later edition never merges with this one.
- **Listening gate.** `supportsListening` (`src/types/learningArea.ts`) and its schema message accept a third kind: `meta.source === 'reader-dictation'` with nonblank `audioText`. The Practice caption `learning.listeningSupport` (both locales) names it.
- **Prompt and answer.** `audioText` = `expectedAnswer` = the sentence `fr` (already NFC, one sentence, ends in `.`, `!` or `?`, apostrophes U+2019). `prompt` = the sentence's authored translation in the interface language at creation time: it gives the meaning, never the French. The French text is not rendered before the check. The control and `ItemRow` must be read first: if either prints `prompt` or `expectedAnswer`, say so and stop.
- **Punctuation fairness.** `normalizeFrench` turns every punctuation mark into an apostrophe, so a learner who hears a sentence and types it without the final full stop is marked wrong. Add one rule to `gradeItem`'s scalar path: when `item.meta?.ignoreSentencePunctuation === true`, drop `. , ; : ! ? … « » ( )` before comparing. Hyphens and apostrophes stay (they are orthography: `est-ce`, `j'ai`), accents stay strict. The flag is item-level like `strictAccents`; no new setting.
- **Device voice only.** `NumberDictationControl` and `ItemRow` read `meta.playbackEngine === 'device'` and pass `engine="device"` to `SpeakButton` and to the speech-after-check call (`speechAfterCheck`). The device voice is an explicit source (`.claude/rules/speech.md`): nothing is synthesized or fetched; without a French voice the control shows the real error. Other dictation items are unchanged.
- **Saving.** A pure `prepareReaderDictation({ reader, count, rng, makeId, now, language })` in `src/services/exercises/fromReader.ts` returns one `ExerciseUnit` through `ExerciseUnitSchema.parse`, as `fromPairs.ts` does (learning area `listening`, level from the reader, `setTitle` = the reader's French title, section COMPRENDRE, `grammarTags: ['listening-dictation']`). The button uses `useUnitSaver` and `saveUnits` (retries keep the same prepared batch), then navigates to `practiceSet` listening. Each click creates a new set with a new sample; no dedupe in v1.

## Limits

- Dictation grading is only as good as the reader text; stages 1 to 3 carry AI review, not human review (unchanged).
- Long sentences make typing hard on a phone; the cap is 6 sentences, no length filter in v1.
- The Today checklist is not extended in this epic (the Sound pairs step already stands for listening practice); revisit when the owner has used both.

## Steps (each lands separately)

- D1 data: `types` meta schema, `supportsListening` extension, `gradeItem` flag, `prepareReaderDictation`, tests (preparation, schema gate, grading with and without terminal punctuation, hyphen and apostrophe still significant, missing minimum sentences rejected, retry through `saveUnits`).
- D2 control and page: device engine in `NumberDictationControl` and `ItemRow`, the button in `GradedReaderWorkspace` after the checkpoints (outline variant, one filled button per view stays), copy in both locales, caption update, tests, `CHANGELOG.md`, `docs/architecture.md`.

## Owner checks (never done by an agent)

Hear it on a real device voice (iOS Safari especially), type a full sentence on a phone, see the set in Practice and a wrong answer in Mistakes, and look at the button in three themes and at 360 px.
