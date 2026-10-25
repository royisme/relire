# Vocabulary as a game (working title: Parcours)

Plan of record for the vocabulary game mode. Written 2026-10-24 by the lead after the owner's direction (games are an optional learning mode, not a change of the app's tone; vocabulary first, on an Anki-style spaced-repetition base; `DESIGN.md` has a scoped game-surface exception) and an advisor consultation. Nothing here is built. The advisor's six corrections are applied below. It still needs a review (gpt-6-astra, sent after the pending debt review and its fixes, not at the same moment, so the two jobs do not exhaust the same 5-hour window) before any worker is dispatched. Inputs: `docs/learning-games-plan.md`, the Gemini research (`.pi-runs/vocab-game-research/report.md`, local; its reliability is noted in `PROGRESS.md`: real references, over-read conclusions), the owner's check of Le ou la ("works, but no game feel").

## The one idea

**Make retrieval the play.** Today a card is: see the word, flip, rate yourself. The game puts an explicit, varied retrieval act *before* the flip (choose the meaning, fill the blank, hear and type, produce the French from the gloss), then the learner reveals and **rates themselves exactly as now**. The evidence that holds is on retrieval and spacing (the vocabulary meta-analysis of game design features, the retrieval-practice papers; see Evidence); the game layer around it (map, collection, feedback) is what makes a session feel like a game, and it is allowed to be as expressive as the `DESIGN.md` exception permits, but it never touches the scheduler.

## Fixed seams (not forks)

1. **FSRS receives only the learner's own Forgot / Fuzzy / Remembered through the existing review command.** The game wraps `useVocabularyReview` (`reveal()` → `introduceVocabularyCard`, `recall(outcome)` → `rateVocabularyCard` with its pending `operationId` for retries, the per-word `tokens`, `StaleVocabularyError` and `VocabularyQuotaError` handling). It adds no second rating path and no new write to rows or history. `PRODUCT.md`: review outcomes are self-reported recall, not correctness. A challenge result is **never** turned into a rating, never preselects a rating button, and never changes scheduling; it is shown to the learner as plain information ("you chose X, the card says Y") before they rate. (Hypothesis, not a finding: a visible attempt before rating may make self-rating better informed. Karpicke and Roediger 2008 report only that students' predictions of their performance were uncorrelated with actual performance. The kill criteria below test the hypothesis.)
2. **Every number shown comes from the learner's real rows** (phase, `dueAt`, stability, difficulty, lapses, repetitions, history) or from the session's real counts. No XP, no invented levels or scores.
3. **No grinding outside the schedule.** The game plays today's queue (`vocabularyQueue`: learning/relearning due now, reviews due, bookmarked new words within `newPerDay`, unseen catalogue words within `newPerDay`). No "practice more" mode that earns progress; extra reviews outside the spacing curve have no benefit and invite farming.
4. **No timers that punish speed**, no streak counter that can be lost. (Time, if ever shown, is the real elapsed time of the run, not a score.)
5. **The mode is optional** (a separate entry beside Start in Words; the plain review stays), device-local settings only for effects and sound, and the app's quiet tone elsewhere is unchanged.

## Facts (read 2026-10-24)

- **Queue and cards.** `src/services/vocabulary/queue.ts` `vocabularyQueue(rows, book, day, newPerDay, now, excluded)` returns `candidates` in this order: learning/relearning due now (`minute`), reviews due (by due day, then key), bookmarked words not yet introduced and within the day's quota (`personal`, by bookmark time), then unseen catalogue words in book order (`unseen`); and `nextDue`. Each word is in exactly one place. A `Forgot` puts a card on FSRS's short learning step, so it comes back in the same session when its due time passes (the hook ticks every second); that is the only in-session repeat.
- **Review flow.** `src/hooks/useVocabularyReview.ts`: `active` (candidate + `tokens` + row), `reveal()` (calls `introduceVocabularyCard`, which introduces a new word on its first reveal), `recall(outcome)` (calls `rateVocabularyCard` with a pending `{ operationId, outcome, reviewedAt }` so a retry repeats the same operation), `skip()` (excludes the key for this visit), counts `ratings`, `introductions`, `due`, `remaining`. `VocabularyReview.tsx` draws the `Flashcard`, the three outcome buttons, a fixed `h-16` status slot, and handles keys `1/2/3`, Enter/Space with repeat, held-key, IME and overlay guards.
- **Content.** A book entry (`VocabularyEntrySchema`): `word`, `position` (book order), `senses[]` each with `pos?`, `gloss { en, zh }` and `examples[] { fr, en, zh }`. The book is 7,362 entries in pages of 250 (`pageSize` is a schema literal) = 30 pages. A personal row has contexts with an AI analysis (translation, IPA, `memoryTrick`, `usageExamples`) or a reader definition. A schedule has `phase` (new, learning, review, relearning), `dueAt`, `stability`, `difficulty`, `scheduledDays`, `repetitions`, `lapses`; history keeps every review with `prior` and `next` schedules.
- **The book is not always there.** `useVocabularyBook` returns the cached book from IndexedDB if one was downloaded, otherwise it downloads only when the content service is configured (enabled with a key); with the service off and no cached copy `book` is `undefined` (`busy` false). The free build therefore has **no wordbook**: its queue holds only bookmarked saved words (and, after the Anki step, imported cards). The wordbook is the owner's own book, kept behind the service by choice.
- **The rating command already returns the updated row.** `rateVocabularyCard` resolves `{ row, tokens }` (`src/storage/vocabulary.ts`); `useVocabularyReview.recall` discards it.
- **Today and elsewhere:** Today's words step reads the same model (`useVocabulary`); Settings → Words owns `newPerDay` (default 20) and the retention target.
- **Anki.** Nothing is imported today. `.apkg` (a zip holding a SQLite collection, compressed in newer exports) needs new dependencies; Anki's plain-text export does not. Anki's review history and ease are not imported (a fresh FSRS state; seeding FSRS from a revlog is a later idea).
- **Evidence that bears on the design** (references in the research report; the lead spot-checked that the papers exist and what their abstracts say): spacing and active retrieval have strong support; a meta-analysis of digital game-based vocabulary learning found effects vary with game design features and not with learner age or background, and proposes that challenge matters (adventure above plain drills is a proposal, not a finding); gamification overall has small, unstable effects that are sensitive to novelty, and a one-semester classroom study with badges and leaderboards found lower intrinsic motivation; the large vocabulary effect in a 2026 meta-analysis is about commercial games, not game layers on flashcards. So: retrieval is the play; the shell around it is mostly for motivation and must not add cognitive load or rewards for speed.

## Design

### 1. The run

A run plays today's queue (with the free build's caveat above: the pool can be only saved words and imported cards) in the queue's own order; the game may reorder only the **beats** (when a pause or map moment appears), not which cards are due or how they are rated. Cards that come back (learning steps) re-enter through the queue, never a separate discard pile. A run ends when `candidates` is empty ("queue cleared", with the real next due time) or the learner stops. Chunks: after every 20 ratings a short breather beat (default; fork 3) shows the map's real change and offers Continue or Stop.

### 2. The challenge (retrieval before the flip)

One data-driven interpreter, not a component per type. `buildChallenge(card, state, pool, seed)` returns `{ kind, prompt, options?, expected }`. The **seed is (local date, word key, appearance index)**, where the appearance index is the number of history records plus the card's appearances so far in this session, so a card that comes back through a learning step shows different options in a different order (otherwise the second appearance tests memory of the screen). Deterministic for tests.

| Kind | What the learner does | Defined as |
| --- | --- | --- |
| `recognize` | choose the meaning (gloss in the app language) among up to 4 | the card's first sense, or its context's translation for a personal word; distractors defined below |
| `cloze` | the example sentence with the word blanked; choose the form among 4, or type it | the expected answer is **the surface form as it appears in the sentence**, found by the headword, elision-aware (`l’`, `d’`, `qu’`), and for verbs by the forms in the bundled lexicon (`lexiconLemma`/forms) |
| `listen` | hear the word with the device voice and type it, **with the gloss shown as a clue** (as reader dictation does), because French has many homophones (vert, verre, vers) | the headword, accent rules from `practiceGrading`; offered only when the device voice is available |
| `produce` | see the gloss and part of speech, type the French | the headword; for nouns a leading article (le, la, l’, un, une, les, des) is ignored; synonyms are not accepted but the result simply shows the card's word |

Because the challenge result is information only and never reaches the scheduler, a false negative (typing `gros` for `grand`) costs nothing but a moment; the learner still rates.

**Distractors** (for `recognize` and choice `cloze`): drawn from the pool of the learner's own cards plus the book when present (same part of speech when both have `pos`, since `senses[].pos` is optional; fall back to any if fewer than 3 are found); entries whose normalized gloss equals the answer's are excluded and duplicate glosses among the options are removed; the answer never appears twice. With fewer than 3 distractors the options drop to 2 or the card gets "just flip". A personal word has no book page: its pool is the learner's other cards.

**Which kind a card gets** comes from its **real state**: new word, `recognize`; learning and relearning, choice `cloze`; young review (scheduledDays below the mature threshold), typed `cloze` or `produce`; mature, `listen` or `produce`. A card lacking the data for its kind falls to the next easier kind. **`cloze` is not the default for learning cards until measured**: step VG1 first measures on the owner's real book the share of entries with an example that contains the headword or a known form; below a stated bar (default 70%), `cloze` is offered only for entries where it works. After the learner answers (or taps "I don't know") the card shows the result as plain information, the learner reveals (the existing `reveal()`), then rates. A "just flip" control is always available (the plain review), so the game never blocks a card.

### 3. The map (progress as a real picture)

A **region** is a group of the learner's real cards: a wordbook page (30 of them, when the book is present), an imported Anki deck or tag, and "Saved from reading" (bookmarked words with contexts). Without the book the map still has regions from the first release because saved words and imported decks are regions too. Each region shows counts computed from the learner's rows and the book: words introduced, in learning, in review, mature (default threshold: phase review with `scheduledDays` of 21 or more, Anki's convention; fork 2), and lapsed. The frontier is wherever the queue is taking new words, so no artificial locks are added; the day's `newPerDay` is the only gate that exists. State is always also written as text (no colour-only meaning).

### 4. Collection

A word's card in a region list carries a tier label from its real state (new, learning, young, mature). Leeches (a real Anki concept; Anki's default threshold is 8 lapses, which is also this plan's default, adjustable; fork 4) are shown as a special group with the word's `memoryTrick` and examples; when a leech is due it is a **boss card**: more context shown after the reveal (never extra rating chances). All of this reads rows; nothing is stored.

### 5. Feel (the `DESIGN.md` game-surface exception)

Feedback tiers tied to real events, layered within about 100 ms and returning to rest: small (a challenge answered: a mark, a soft cue, the correct choice settling); medium (a word graduates to review, a word becomes mature, a region's mature count rises: a longer motion and a number pop of the real new count; the event is read from the row that `rateVocabularyCard` already returns, which the review hook may expose as `lastRated`, or from the row's newest history record after the model refreshes: the rating command itself is not changed); large (queue cleared, a breather's map change: a longer sequence). Sound cues are short synthesized tones from the Web Audio API (no assets, no dependency), unlocked by the first tap, with a visible mute remembered on the device (fork 1). Reduced motion means none; a "reduce effects" setting caps everything at small. Nothing blocks input; slots are fixed-size.

### 6. Anki-style base

Settings and import:
- Plain-text and TSV import first (Anki "Notes in Plain Text", and CSV): the learner picks which column is the French word and which are the answer and the example; tags and deck become region labels; rows are created as personal words (bookmarked so they enter the queue in order) with a new definition kind `imported` carrying the fields. It is a data-shape change to `VocabularyDefinitionSchema`; nothing has shipped, so the schema and code change together with no compatibility step. Duplicates by `vocabularyKey` merge into the existing row. A row's `word` must pass the `french` validator (NFC, no HTML, curly apostrophes), and Anki exports routinely carry HTML, `[sound:...]` tags and straight apostrophes, so the importer normalizes before validating: HTML tags and entities become plain text (`<br>` a space), `[sound:...]` is removed, straight apostrophes become curly, text is NFC and trimmed. A value that is still invalid or empty after that is **rejected with its row number and the real reason**, shown in the import result next to counts of imported, merged and rejected rows; nothing is dropped silently. The context `source` kinds today are article, unit and reader, so an `import` kind (with the deck name) is added together with `imported`.
- `.apkg` is a separate later step that needs new dependencies (a zip reader, SQLite in WebAssembly, a zstd decoder) and the owner's approval.
- Challenge availability for imported cards depends on their fields (front and back only: `produce`/`recognize` with distractors from the same deck).

### 7. Components (DOM and CSS only)

Pure code in `src/services/vocabulary/game/`: `challenge.ts` (kinds, builder, grading), `regions.ts` (region summaries from rows and book), `feedback.ts` (which tier an event gets), `cues.ts` (the synthesized tones and mute). UI in `src/components/vocabulary/game/`: the run view (wraps `useVocabularyReview`), the challenge card, the map, the breather. Game preferences (sound, reduce effects) in `appSettings` as device-local fields, excluded from backups like the other device settings. Existing `Button`, `Select` and the Base UI switch (`ui/switch`); no engine and no new dependency until VG6's `.apkg`.

## Steps (each small, a review per diff, the lead re-runs every check)

- **VG1 Pure core and one measurement.** `challenge.ts` (including the surface-form finder and the distractor rules above) and `regions.ts` over invented book and rows, deterministic seeded tests. First the measurement on the owner's real book (the lead runs it on the owner's machine): the share of entries with an example that contains the headword or a known form; it sets the `cloze` default. Acceptance: tests for kind selection by state, fall-back when data is missing, the seed changing with the appearance index, distractors never equal to the answer or sharing a gloss, a missing `pos`, a personal word's pool, article stripping in `produce`, elision in `cloze`, region counts matching hand-computed rows with and without a book.
- **VG2 The run, plain.** The run view wrapping `useVocabularyReview`: challenge before reveal, then the existing outcome buttons and keys, fixed slots, "just flip", chunks and the breather without effects, an entry beside Start. Acceptance: the same writes as the plain review (a test proves one `introduceVocabularyCard` and one `rateVocabularyCard` per card with the learner's outcome and nothing else; a retry reuses the operation id; the staleness and quota paths still behave), keys follow the review's guards.
- **VG3 Anki plain-text import** (moved up: without the book the game would be nearly empty). The import dialog, the `imported` definition kind and `import` source kind, normalization and refusals with real messages, tests for column choice, tags, duplicates and rejected rows, backup and restore of the new kinds.
- **VG4 Game feel.** Feedback tiers, number pops of real counts, synthesized cues, mute and reduce-effects settings. Acceptance: reduced motion shows no motion; sound is off until the first tap; every number traces to rows; nothing moves the page.
- **VG5 The map and the run summary.** The region view and the end-of-run summary from real data, the leech group.
- **VG6 Later.** `.apkg` (dependencies, owner approval), a weekly activity strip from real history (not a streak), seeding FSRS from a revlog.

## Kill criteria and what the owner measures by hand

After a week of use, no analytics: does the owner pick the game over the plain review unprompted; does the distribution of Forgot / Fuzzy / Remembered stay spread (if everything collapses to Remembered, the challenge is not making self-rating honest); do lapses over the following weeks look the same or better than before; is a card slower (the challenge adds time per card) in a way that reduces words reviewed per day more than it helps; is the sound or motion tiring. Kill or cut the parts that fail; keep the plain review untouched.

## Risks

- **Extra cognitive load** from game rules is the main documented risk: keep one challenge per card and the same fixed layout; the map and effects sit around, not inside, the retrieval.
- **Time per card rises** (a challenge, then a flip, then a rating); the plain review stays one tap away and the breather offers Stop.
- **Typed production on a phone** is slow: choice kinds come first for learning cards.
- **The challenge and the rating can disagree** (typed it right, rated Forgot). That is the learner's call; the game must not argue.
- **Distractor quality** depends on the book's glosses and parts of speech; imported decks may have too few cards for 4 options (fall back to 2 or to `just flip`).
- **Sound on a shared device** is why the default is a fork.
- **Scope creep** into a second scheduler: any proposal to change when a card is due because of a game result is out of this plan and needs a `PRODUCT.md` change by the owner.

## Forks for the owner (defaults)

1. **Sound default.** On in the game mode with one tap to mute (default), or off until the learner turns it on.
2. **"Mature" threshold** for the map: phase review with `scheduledDays` of 21 or more (default, Anki's convention).
3. **Chunk size** for breathers: 20 ratings (default), or one run per queue.
4. **Leech threshold:** 8 lapses (default, Anki's own), or lower.
5. **Region names:** page ranges by book order (default), or CEFR bands if the book carries them (it does not today).
6. **Anki import columns and decks as regions:** yes (default).
7. **Name** of the mode (working title Parcours; Chinese copy decided with it).
8. **Should the wordbook ship with the app** (about 3 MB, like the lexicon) so the free build has the 7,362-word map? Default: no, it stays behind the service (the owner's choice so far); the game works from saved words and imported decks without it.

## Questions for the reviewer

1. Do the fixed seams hold against `useVocabularyReview.ts`, `src/storage/vocabulary.ts` and `PRODUCT.md`: is there any way the design adds a second rating path or changes what a rating means? Could a challenge-before-reveal flow break the pending-operation retry, the epoch/token staleness handling or the quota behaviour?
2. Is the challenge design (kinds chosen by real state, a "just flip" always available) sound, and is the claim that a visible attempt improves self-rating fair to the cited abstract?
3. Which parts of the evidence section over-read their sources, and does the plan avoid relying on them?
4. Is anything in the steps not landable separately, or in the `imported` definition kind a problem for backup, the existing Zod schemas, `vocabularyKey` identity or the queue?
5. Does the feel section stay inside the `DESIGN.md` game-surface exception and the accessibility rules (reduced motion, mute, nothing flashing, nothing moving the page)?
