# Built-in vocabulary and flashcards: implementation specification

Status: **Development handoff; not implemented.** The owner requested this specification on 2026-10-19 after approving the product direction: a system-provided TCF vocabulary list, deduplicated with user-added vocabulary, with Anki-style flashcards and shared review progress. This document defines the recommended engineering defaults. It authorizes no deployment, public distribution of source data, destructive data reset or functional change in this documentation task.

Source baseline: `6baff62`. Read `CLAUDE.md`, `PRODUCT.md`, `DESIGN.md`, `docs/conventions.md`, `docs/architecture.md`, `docs/development.md`, `.claude/rules/{ui,storage,i18n,speech,typescript}.md`, and this specification before implementation. Preserve unrelated work, including edits to the separate grammar-topic learning specification. Grammar checkpoints are not a prerequisite for this feature.

## 1. Deliverable and fixed boundaries

Build one vocabulary system, not parallel built-in and personal flashcard engines:

1. A built-in TCF wordbook supplies words, meanings and optional examples.
2. Reading bookmarks attach context to the same canonical word; they never create a second schedule for it.
3. Study presents French first, then reveals meanings, then accepts a self-rating and commits the next schedule locally.
4. Unseen book words are not automatically due. Default new introductions are limited to 20 unique words per local calendar day.
5. Short learning/relearning steps supplement the existing SM-2-style long-term calculation. There is one scheduler and no new dependency.
6. Durable-first writes, offline saved-card review, backup/restore and honest failure states are part of the feature, not later polish.

Not building: FSRS, Anki sync or `.apkg` import/export, cloud accounts, cross-device progress, a deck hierarchy, reverse cards, spelling/listening tests, automatic AI examples, pronunciation assessment, bulk audio generation, custom card templates, a new manual word editor, undo, heatmaps, streaks or mastery claims. Existing article lookup/AI features remain separate and explicitly user-initiated.

Anki is a behavioral reference, not a compatibility promise. Its manual distinguishes learning steps, relearning and review, and distinguishes forgotten answers from difficult-but-recalled answers: [Studying](https://docs.ankiweb.net/studying.html), [Deck Options](https://docs.ankiweb.net/deck-options.html). The exact scheduling rules below are Relire's specified rules, not a claim to reproduce current Anki/FSRS output.

## 2. Input facts and private content boundary

Owner input: `/Users/royzhu/software/my-local-service/llm-server/artifacts/tcf-vocab-7000/words.json`.

Read-only observation on 2026-10-19: 7,391 rows, 7,391 unique numeric source ids, 7,365 exact spellings, 26 duplicated-spelling groups, 309 empty part-of-speech fields, nonblank English/Chinese glosses throughout, and 5,940 complete trilingual examples. Example filling may still be running; these are observations, **not constants or the final normalized count**. Re-read and hash one stable input snapshot before preparing content.

The input contains `id`, `word`, `pos`, `gloss`, `gloss_en`, `raw`, `tags` and optional `example.{fr,en,zh}`. `raw` includes original HTML; never deliver or render it. Empty tags are not frequency, level or topic annotations. Do not invent CEFR labels, priorities, missing IPA, translations or examples. Some source spellings/examples disagree; parsing successfully is not linguistic review.

The adjacent README names a third-party shared deck and says no distribution licence was stated. Personal access is not proof of public redistribution permission. **Code and synthetic fixtures can be implemented without distributing the corpus.** The owner must approve the corrected private artifact and distribution rights before any public content publication. Do not turn this into an automatic network/legal research or publishing task.

Recommended delivery is an extension of the existing optional read-only content Worker/D1, not a front-end bundle or a personal-import-only product. This intentionally extends the [hosted-content ADR](adr-hosted-content-service.md) from topics/lexicon to the built-in wordbook; update that scope and the privacy text with implementation. No new backend service, account, key or learner-write endpoint is needed. Without a configured service, personal bookmarks and previously saved learning cards continue to work; the built-in-book entry explains that its content service is unavailable.

## 3. Word identity, senses and bookmark semantics

### 3.1 One canonical key

Implement one exported `vocabularyKey` used by content preparation, bookmark lookup/save, card creation, browser joins and backup validation:

- Unicode NFC.
- Trim and collapse Unicode whitespace to a single space.
- Fold ASCII apostrophe to U+2019.
- Lowercase French spelling; preserve accents, punctuation, hyphens and phrase word order.

Thus spacing/case/apostrophe variants deduplicate, but accentless versus accented words do not. Do not use the exercise grader's accent-folding normalizer. Do not automatically collapse an inflected spelling into an AI-guessed lemma. This first version matches the displayed word/phrase, not semantic similarity.

The learner-row id is the deterministic string `word:<canonical key>`. No content version or source id is part of this identity. Always encode identifiers through route helpers when used in a URL; never interpolate raw spellings into paths.

### 3.2 Merge content, never schedules

Group built-in rows by canonical key. Retain all distinct senses, source note ids and examples. An exact repeated sense/example can be collapsed structurally, but conflicting glosses are retained for review, not silently selected by an AI. Preserve first-source occurrence order for browsing and new-word selection; do not call it frequency order.

There is one learner row and one schedule per canonical key across book and personal sources:

| Event | Required outcome |
| --- | --- |
| Bookmark a word already present in the downloaded book | Associate its personal context/analysis with that word. Do not reset or duplicate its schedule. |
| Download the book after bookmarking a matching word | Join by key and add the built-in source when the row is next explicitly used/saved. Do not rewrite every learner row or reset progress on download. |
| Bookmark the same word again from another context | Keep one learner row; preserve distinct contexts. Same context/language duplicate is an idempotent save. |
| Remove a bookmark | Clear its personal-bookmark status, not its built-in content or learning history. Removal is an explicit action, not the side effect of re-saving. |
| A word exists only in personal data | It remains a valid new/review candidate without any content service. |
| A later book release changes glosses/examples | Show current book content in browsing, but do not overwrite a saved study snapshot or its schedule automatically. No history reset. |
| A later release corrects the spelling to a different key | Treat it as a different word; keep the old saved card. No silent fuzzy rename/merge. |

The reader's Save control represents **personal bookmarking**, not “exists anywhere in the system dictionary.” A built-in-only word must not make that control look personally saved. Replace `App.tsx`'s current lowercased-string toggle/delete logic with explicit transactional save/remove-bookmark operations.

For the same word, built-in senses and personal context remain separately attributed. Never replace a user's context with the book's example or fabricate a missing translation. A single card may show several senses on the answer side; it is not one independent card per source or sense in this version.

## 4. Proposed domain and persistence contracts

All shapes in this section are **new contracts**, not existing APIs. Add Zod schemas in a focused proposed `src/types/vocabulary.ts`; replace the unreleased `VocabWord`/`ReviewRecord` shape and all real readers/writers together. Do not add a second old-shape reader or background migration. Never clear the owner's browser data to make a new shape work; stop and request a safe test database/profile if encountering incompatible development data.

### 4.1 Content contracts

- **Book manifest:** `bookId` (`tcf-7000`), bilingual title, 64-hex canonical content hash `version`, normalized `entryCount`, `pageCount`, `pageSize` (250), source attribution and actual review metadata. Only reviewed content is publishable.
- **Book entry:** canonical `key`, display `word`, nonnegative source-order `position`, source note ids as strings, and one or more senses.
- **Built-in sense:** optional nonblank POS, nonblank English and Chinese glosses, zero or more `{ fr, en, zh }` examples. Missing POS is omitted; missing example is omitted. Partial examples are rejected, not completed at runtime.
- **Personal context:** original French sentence when supplied, save timestamp, interface language at save, and the actual `WordAnalysis` snapshot. Include a source reference (article/unit id and saved title) only when supplied by that lookup's actual context; never borrow an unrelated last-open reader source. Keep the sentence readable after its source is deleted. The generic `analysis.translation` is in the request language (the English template explicitly says so); do not relabel every saved translation as Chinese. Keep the language with it. Optional `translationEn`/example translations are used only when actually present.

Published data contains no HTML, `raw`, unknown injected fields, private paths or secrets. Validate NFC/nonblank text and field languages; normalize French apostrophes before validation. Retain original input and correction decisions privately, rather than destroying evidence in place.

### 4.2 Learner row in existing `vocab`

A row carries:

- `id`, canonical `key`, display `word`, creation timestamp.
- `bookSource?`: `{ bookId, version, sourceIds, senses }`, a self-contained snapshot for offline answers.
- `bookmarked: boolean` and `contexts: PersonalContext[]`.
- `schedule: null | VocabularySchedule`.
- `introducedAt: number | null`, set once at the first committed introduction, not on download/bookmark.
- `revision: nonnegative integer`, increased on each committed rating/reset.
- `history: VocabularyReviewRecord[]`, kept through bookmark removal and scheduling reset.

A row requires book content or a personal context. `schedule: null` means unintroduced; it is not a due date of today. No row is needed for every unseen downloaded book entry: join the book cache and learner rows at the Words page. Starting a new word creates/reuses its row; bookmarking may create an unintroduced row.

`VocabularySchedule` has common `repetitions`, `intervalDays`, `easeFactor` plus a discriminated phase:

| Phase | Required due fields |
| --- | --- |
| `learning` or `relearning` | `step` is 0 or 1; `dueAt` is epoch milliseconds. |
| `review` | `dueDate: YYYY-MM-DD` in the browser's local calendar |

No simultaneous `dueAt`/`dueDate` ambiguity. Learning uses `repetitions=0`, `intervalDays=0`; review uses a positive integer interval and repetitions at least 1. Ease is finite and at least 1.3; new cards start at 2.5. Minute scheduling uses elapsed milliseconds; review-day scheduling uses local calendar addition, not fixed 24-hour durations across DST.

Each review record contains a unique operation id, timestamp, rating (`1 | 3 | 4 | 5`), prior/new schedule and resulting row revision. Ratings are self-reports, not automatically graded correct/incorrect answers. Do not send them to the exercise `attempts` store or grammar-accuracy calculations.

### 4.3 Metadata in existing `meta`

Use owned, named vocabulary metadata, not another IndexedDB store:

- `vocabularyPreferences`: `{ newPerDay: integer 0..100 }`, default 20; 0 disables new introductions, not reviews.
- `vocabularyDay:<YYYY-MM-DD>`: `{ date, introducedKeys: string[] }`, unique canonical keys introduced that local day.
- `vocabularyEpoch`: a monotonically increasing reset/restore invalidation counter, not backed up.

Daily ledger keys may refer to cards later deleted; this is valid quota history, not a dangling reference. Historical day labels are the browser's local date when introduced; do not reinterpret them using a later time zone.

Daily introduction entries survive sessions, deletion/reset and page reload. They are an actual introduction ledger, not a count derived from the currently visible queue. Retain them for backup and honest quota accounting. Changing the limit never makes already introduced cards “new” again.

Use existing stores `vocab`, `meta` and disposable `cache`; no client DB version bump/new object store is required. Vocabulary operations belong in proposed `src/storage/vocabulary.ts`; schemas/restore validation in proposed `src/storage/vocabularyBackup.ts`. Only `src/storage/` touches IndexedDB.

## 5. Exact scheduler transition contract

Replace/extend `src/utils/srs.ts` as the one pure scheduling authority. Pass `now` explicitly; do not call the clock repeatedly inside a transition. A preview and a commit use the same transition rules. No scheduler network calls or configurable preset system.

Ratings: **Again=1, Hard=3, Good=4, Easy=5**. The UI says forgotten, difficult-but-recalled, recalled, and easy; never “mastered.”

### 5.1 New introduction

When first presented, atomically materialize the row/snapshot, set `introducedAt=now`, assign `learning, step=0, dueAt=now`, and add the key to today's introduction ledger. This is not a rating and appends no history. Do not prepare all 20 rows as “introduced” before the learner actually sees them. A failed introduction write shows no successful card and consumes no quota.

### 5.2 Learning and relearning

Use the same two steps for both phases:

| Current step | Again | Hard | Good | Easy |
| --- | --- | --- | --- | --- |
| 0 | Step 0, due in 1 minute | Step 0, due in 6 minutes | Step 1, due in 10 minutes | Graduate to review tomorrow |
| 1 | Step 0, due in 1 minute | Step 1, due in 10 minutes | Graduate to review tomorrow | Graduate to review tomorrow |

Graduation sets `phase=review`, `intervalDays=1`, `repetitions=1`, `dueDate=local tomorrow`. Learning/relearning ratings do not alter ease. Easy skips remaining learning, not a promise of mastery. Some buttons legitimately have equal intervals; show the real output rather than inventing four different labels.

### 5.3 Long-term review

Retain the existing SM-2-style rule, stated explicitly:

- **Again:** update ease with rating 1 using the formula below, set repetitions/interval to 0, enter `relearning, step=0`, due in 1 minute.
- **Hard/Good/Easy:** when prior repetitions is 1, schedule 3 calendar days for Hard and 6 for Good/Easy. Otherwise schedule `max(1, round(prior intervalDays × prior easeFactor))` calendar days. Increment repetitions, then update ease.
- Ease update: `max(1.3, roundTo2(priorEase + 0.1 - (5-q) × (0.08 + (5-q) × 0.02)))`.

This is intentionally not current Anki's complete legacy scheduler. Do not quietly add easy bonuses, fuzz, automatic parameter optimization or a second scheduler. Replace tests that currently demand every failed recall wait a day; keep and extend the pure calendar/ease/immutability tests.

### 5.4 Previews and time

Display the computed delay under each rating: minutes for learning/relearning, calendar days for review. Never hard-code button captions such as 1/3/7 days independent of state. The click captures current `now` and assigns the actual due instant/date; the displayed duration comes from the same pure rule. A preview must not mutate history or advance a card.

A card is due when `dueAt <= now` for minute phases or `dueDate <= local today` for review. The global navigation badge counts actual due introduced cards only. It does not include unseen book words or all bookmarked-but-unintroduced rows.

## 6. Queue, sessions and daily quota

One shared queue service serves built-in and personal words. Rebuild from committed rows and the complete available book, never maintain two independently scheduled copies.

Order at each selection:

1. Due learning/relearning, ascending `dueAt`.
2. Due review cards, ascending `dueDate`, stable canonical-key tie-break.
3. Unintroduced personally bookmarked words, oldest bookmark first, then unseen built-in entries in source order, while today's unique introduction allowance remains.

Deduplicate candidates by canonical key before selection. A saved/bookmarked word matching the book appears once. At most one active card exists in a workbench. Queue entries reference ids, not mutable full-row copies captured for an entire session.

If only future minute steps remain, show the actual next due time and a countdown; allow ending the session. Wake selection at that due time and on visibility/focus return. Do not instantly repeat a forgotten card while pretending one minute passed. Do not label “all learned” when cards are waiting or unseen words remain. If the daily new limit is reached, continue due reviews and say no more new words will be introduced today.

Skip-for-now excludes the card from this visit's queue only, with no rating or schedule change; it still counts as due outside that transient exclusion. Re-entering the review route makes it eligible again. No pause/suspension preference or persistent session cursor is added in version one.

Reload ends the transient reveal/skip state, rebuilds from storage and presents the next eligible card front-side. Committed ratings and introductions survive; an unsubmitted self-rating does not. Count “unique words introduced” separately from “ratings submitted”; a repeated forgotten word is not several new words. Never imply self-rating measures objective accuracy.

## 7. Transactional operations and concurrency

Remove `usePersist('vocabulary', vocabList, saveVocab, ...)` and its whole-library replacement behavior. Statistics persistence can remain unchanged. `saveVocab` must not remain a competing vocabulary writer after this change. App state becomes a read model refreshed after owned operations commit, not the authoritative store to autosave.

Required storage API responsibilities (proposed names):

- `saveVocabularyBookmark`: canonical-key get/merge in one transaction; preserve schedule/revision/history, record actual context/language, notify after commit.
- Before presenting an existing learner row, attach a matching available book snapshot only if `bookSource` is absent, in the owning storage transaction. Keep an already saved book snapshot even if the downloaded catalogue is newer. This enriches content without changing schedule/revision/history. Without a catalogue, personal-only presentation still works.
- `removeVocabularyBookmark`: clear bookmarked status; keep contexts/content and learning history. Explicit forget/delete is a separate confirmed operation.
- `introduceVocabularyCard`: read current row, today's ledger, preference and epoch in one read-write transaction; enforce global daily quota, commit one introduction only. Race between two tabs must not introduce 21 distinct words against a limit of 20.
- `rateVocabularyCard`: read row and validate epoch first. If the operation id already exists in its history, return an already-committed outcome with the current authoritative row, without another rating. Otherwise require the expected row revision, append one history record and new schedule atomically, and return the committed row. A different stale operation rejects and asks the session to reload. A retry must not replace a newer row with the older operation's historical next schedule.
- `resetVocabularySchedule`: confirmation; preserve content/bookmark/history, restart learning without decrementing previous daily introductions, increment revision/epoch. Reset never claims to erase remembered exposure.
- `deleteVocabularyCard`: explicit confirmed removal of learner row and its history; bump epoch. It does not remove the built-in dictionary entry or today's introduction ledger. Returning to a built-in word can start a fresh learner row; say that history is deleted, unlike bookmark removal.

Generate a rating operation id once per button submission and retain it for a storage-only retry. Disable rating/navigation that could duplicate the operation while it commits. A failed write keeps the answer side, the current word and the real error; retry does not call AI or lose the entered decision. Publish the next card only after the write succeeds.

Capture epoch/revision with the displayed card. Reset/delete/restore invalidate late writes, including delete-and-recreate of the same canonical id. Bookmark/content merge must not overwrite a schedule from another tab. Use transaction reads, not caller-owned copies of whole rows. No live collaborative editing or message bus is promised; refresh on focus and after committed same-tab operations, and reject stale submissions honestly.

## 8. Built-in content preparation and service delivery

### 8.1 Preparation/publish contract

Add a Bun-only private pipeline under proposed `scripts/vocabulary/` (do not run the external Python builders from the app):

1. Explicit `--source <absolute words.json>`; no hard-coded default private path in executable code.
2. Read one stable snapshot, validate, normalize and group by the canonical identity. Emit a private report of source rows, canonical groups, missing fields, conflicting senses and example issues. Do not guess corrections.
3. Write the normalized artifact/review sheet to ignored `.local/vocabulary/`; logs to ignored `.pi-runs/vocabulary/`. Omit `raw`. Hash the complete normalized content with canonical SHA-256; array order is significant, object keys use code-point sorting.
4. Maintain public metadata/review hashes only in proposed `data/vocabulary/manifest.json` and `reviews.json`. No corpus strings in committed fixtures/artifacts. A content change invalidates the review hash. Record the actual authorized reviewer, not fabricated owner review.
5. Publish only matching reviewed artifacts to private SQL; `--apply-local` uses local D1 only. No default source rewrite, automatic generation, remote publish or credential lookup. `--check` validates public metadata only and works in CI without the private source.

Pipeline commands to implement: `bun scripts/vocabulary/prepare.ts --source <file>`, `bun scripts/vocabulary/review.ts print`, `bun scripts/vocabulary/review.ts mark --by <actual reviewer>`, `bun scripts/vocabulary/publish.ts [--check | --apply-local]`. `mark` and applying real content require the owner's authorization; test them with synthetic data.

### 8.2 Read-only endpoint

Add **one** resource to the existing Worker:

`GET /v1/vocabulary/tcf-7000?page=<zero-based integer>[&version=<64-hex hash>]`.

- Page size is 250 entries. Each response carries the manifest, page index and entries. Normalized grouping can change the observed page count; derive it.
- First request uses page 0 without a version. All subsequent pages pin the returned version. Reject invalid/extra query arguments, malformed page/version and out-of-range pages with fixed machine-readable errors. Never return a different version under a pinned request.
- Store prebuilt pages in a new D1 `vocabulary_pages` table keyed by `(book_id, version, page)`, with JSON `body`. This avoids putting an entire growing corpus in one database field. Existing D1 `meta` holds the current version pointer. Use prepared bindings.
- Publication updates page rows/current pointer atomically. If an old pinned version is no longer available, return an explicit version-unavailable error; the client discards the incomplete candidate and offers restart, not a mixed-version book.
- Reuse current method/CORS/rate-limit/error-header behavior. Correctly derive ETag from the vocabulary version, not `packVersion`/`lexiconVersion`. Preserve GET/HEAD/OPTIONS and reject writes. Do not expose SQL/private corpus text in errors.
- Add table-creation SQL in proposed `worker/migrations/0003_vocabulary.sql`, following the Worker's existing D1 convention. This creates new content structure only, **not** a client IndexedDB upgrade or a backward-compatibility/data-conversion layer. Do not alter existing topic/lexicon rows.

Use existing `VITE_CONTENT_SERVICE_URL`, transport and timeout handling; no second URL/key setting. Requests disclose only book id, page and version, not saved words, answers, language, grades or schedules. Add that fact to the configured-service privacy description. Do not repurpose the lexicon endpoint as an implicit source for this wordbook.

### 8.3 Complete-book cache and failures

Load the book only at the Words entry/download action, not application startup or every card flip. Reuse the existing `content` cache kind but publish a single **validated complete-book** cache entry only after every page/version/count/key invariant passes. Partial downloads never appear as installed or become review content.

Known complete cached content may be used directly; an explicit Check for updates starts a pinned fresh download. If refresh gets HTTP 429/500, bad JSON/schema or version mismatch, show the real failure and leave the previously downloaded book intact. Do not call that refresh successful. With no previous book, a network failure shows unavailable; already saved learning cards still review from their snapshots.

Important source fact: `putCached` deliberately swallows quota/write failures. Its resolved promise is **not evidence of offline availability**. Add a narrow complete-wordbook cache storage operation in `src/storage/` that awaits commit and propagates errors before showing “available offline”; do not change AI cache failure policy globally. The book cache is still disposable and not backed up. Cache clearing/expiry means unseen content needs downloading again; it must not destroy saved cards, history or quota ledgers. The current `content` policy is 365 days, not permanent storage.

Keep current topic network-first/cache-fallback semantics unchanged. This wordbook's explicit complete-download/update flow is not permission to make HTTP failures look like stale success elsewhere.

## 9. Routes, screens and visual contract

Keep Words under My study; no new top-level navigation. Define real routes for places, not a component-local page switch:

| Route | Purpose |
| --- | --- |
| `#/study/words` | Today: actual due/new counts, Continue/Start, book download/update status and new-per-day setting. |
| `#/study/words/all` | Browse the merged dictionary/personal list with search and source/learning-state filters. |
| `#/study/words/review` | One active flashcard, answer reveal, self-rating and waiting/finish states. |

Extend `Route`, `routeHref`, `parseRoute`, `areaOf`, shell current-area logic and `StudyView` deliberately; preserve Back/reload. Use new route variants for the two deeper Words places rather than overloading Grammar's `section: 'conjugation'`. Review is a local place; no current word id or source text is sent in network requests. Transient filters and card reveal need no extra routes.

### Today and browser

Today shows real pending review count, learning/relearning count and remaining new introduction allowance. Unavailable book data is not a fake zero-word catalogue. New limit input accepts integer 0..100; save explicitly with fixed-size control/status and default 20. This is the only scheduling preference exposed in version one.

Browse composes existing `ui/table` with TanStack Table. Search word and actually available glosses/context; paginate at 50 rows and do not render 7,000 DOM rows. Filters: source All/Built-in/Bookmarked and learning state All/Unintroduced/Learning/Review. A word may match both source filters. No “mastered after four reviews” filter or invented level/frequency labels. Details use a Sheet; download/update, storage and no-match states belong to the page.

### Flashcard wireframe

```text
Back to Words                         Session ratings: n
Due now: n    New remaining today: n
----------------------------------------------------
                         French word
                  [Listen, explicit only]
----------------------------------------------------
Fixed control region:
[Show answer]                         [Skip for now]
[Again: delay] [Hard: delay] [Good: delay] [Easy: delay]
Fixed status slot for saving, failure or next due time.
----------------------------------------------------
Front: recall its meaning before revealing.
Back:  POS / meanings / optional examples / saved context
       (language follows interface; source remains visible)
```

- Page follows DESIGN: warm paper, `bg-surface`, `ink-*` rules/text, one blue accent, serif word/headings, 14px body and 12px minimum metadata. Word 32px phone/40px desktop, semibold, wrapping; never fit by shrinking below readable sizes.
- One flat reading/study surface, not nested gradient cards. Controls `rounded-md`, surfaces `rounded-lg`; no decorative icons, flags, rainbow rating buttons or flipping/3D animation.
- Show answer is the single filled action before reveal; Good is the single filled action after reveal. Other buttons outline/ghost. Four ratings stay mounted but disabled/hidden from interaction before reveal, with their geometry reserved; phone uses a fixed two-by-two grid of 40px-or-larger controls. Do not insert a new button row on flip.
- Front/back is deliberate reveal, not a transient spinner: back content may increase normal page height for long definitions. Preserve the top word/viewport anchor. Put the controls **above** the answer detail at every width, so revealing long content below them does not move the controls. Desktop and phone use the same DOM order. Do not fix the entire card/page height or clip definitions to force identical front/back size.
- Reserve a bounded local status slot from first render; saving/error changes that slot/control only. Long error details use a Sheet. Full long definitions/examples remain in normal page flow or an explicitly opened detail Sheet, not a tiny nested reading scroll pane.
- The word itself is plain text, not a giant clickable container surrounding nested buttons. Space/Enter reveals only when focus is on the reveal control/study surface, never in an input or overlay. After reveal, 1/2/3/4 map to Again/Hard/Good/Easy outside inputs/IME composition. Ignore held-key repeats and disable shortcuts while saving; never let the reveal Space also rate the next card.
- Before reveal, no gloss, POS/gender cue, contextual sentence, translated example, hidden answer attributes or accessible answer text is mounted. Manual word audio may be requested but no autoplay or example audio reveals a cue.
- Optional Listen uses existing `SpeakButton` and the user's selected engine; explicit remote speech may require their configured key. Never switch their provider silently or bulk-prefetch all book audio. Moving cards/leaving review stops owned playback through the shared speech layer. Text review itself needs no key or AI network calls.
- Answer-side book text follows current EN/ZH. Personal analysis shows its actual saved language if no requested translation exists, with a truthful saved-language label; never invent one. Switching language/theme preserves current card/reveal state and progress.
- Use a polite status announcement for revealed/saved/failure states, visible focus, named controls and overlay focus return. At 360px, 16px gutters, no horizontal document overflow; check light, sepia, dark and reduced motion. Visual acceptance is manual, not a screenshot-diff gate.

## 10. Backup, restore, statistics and removal

Extend existing `db.ts` export/import and `BackupControls`, not a separate backup system:

- Always include learner `vocab` rows with their content snapshots, contexts, schedule, exact history/revision and introduction timestamps; include vocabulary preferences/day ledgers in a named `vocabularyMeta` backup field. Do not export arbitrary `meta` or the epoch.
- Read vocabulary rows and vocabulary metadata in one consistent snapshot. Settings API keys and disposable complete-book/page caches are not included. Optional protected audio continues using existing audio backup behavior.
- Validate the full vocabulary payload with Zod before the restore transaction: key/id agreement, unique ids/keys, required content, languages, finite times/ease, schedule-phase invariants, supported ratings, history ordering/revisions, unique daily ledger keys and consistent dates. Corrupt data rejects the whole restore; do not silently strip schedule fields or coerce malformed `vocab` into “absent.”
- Preserve absent-key/explicit-empty semantics. A provided `vocab` array replaces learner rows. When replacing `vocab`, require its paired `vocabularyMeta` for complete restoration; do not combine imported rows with an unrelated current daily ledger. With both absent, preserve them. Explicit empty learner rows still retain whatever valid ledger the backup explicitly provides. There is no old-format converter for unreleased shapes.
- Restore rows/metadata atomically with the other owned stores; increment vocabulary epoch so a stale tab cannot rate into restored state. Refresh App's vocabulary read model after restore, not only after a delayed page reload. No stale whole-list autosave may overwrite the restore.
- A restored saved card can be reviewed/revealed without the service. Unseen built-in entries require a separately downloaded book and are not falsely counted as backed up.

Update consumers together: sidebar due badge uses introduced cards actually due; Analytics distinguishes personal bookmark count, introduced words and submitted self-ratings. Remove the current `repetitions >= 4` mastery metric/claim. No grammar exercise attempts, pronunciation scores or predicted retention are fabricated from these self-ratings.

Keep bookmark removal, schedule reset and full learner-card deletion visibly distinct with correct confirmation wording. No bulk “reset everything” action or automatic pruning of history is added. Download/update/cache clearing never resets learner data.

## 11. Implementation work packages and file map

This is a cross-cutting change well beyond eight files. Deliver it as **one integrated feature batch**; the work packages below define implementation order/ownership, not independently shippable partial features. Use one writer per checkout; do not build vocabulary and grammar spec changes in the same files concurrently without an explicit integration owner. There are no new package/provider requirements. Read the actual files again before editing; this map is not permission to skip call-site discovery.

```text
Worker wordbook -> complete local book cache ---+
                                               +-> canonical join -> Words pages
Reader bookmark -> vocabulary storage ---------+                      |
                          ^                                           v
                          +--- atomic rating <- pure scheduler <- review session
                          |
                      backup/restore
```

### Work package A: identity, scheduler and durable vocabulary

Existing: `src/types/index.ts`, `src/utils/srs.ts`, `src/storage/db.ts`, `src/App.tsx`, `src/components/VocabularyView.tsx`, `src/components/AnalyticsDashboard.tsx`, `src/storage/audio.ts`; relevant `tests/srs.test.ts` and persistence fixtures.

New proposed: `src/types/vocabulary.ts`, `src/services/vocabulary/identity.ts`, `src/storage/vocabulary.ts`, `src/storage/vocabularyBackup.ts`, `src/hooks/useVocabulary.ts`, focused tests under `tests/`.

Replace vocabulary whole-list autosave and all its callers; keep stats persistence untouched. Update audio's vocabulary-text discovery to the new real snapshots, not fake missing IPA. This package is only mergeable if existing personal bookmarking/review/backup still work on the new shape. Do not land an unused schema while leaving old writers active.

### Work package B: private built-in book pipeline and delivery

Existing: `worker/src/index.ts`, `worker/README.md`, `worker/NOTICE.md` if attribution requires it; existing content transport/cache modules are reused, not globally renamed.

New proposed: `src/services/vocabulary/load.ts`, `src/storage/vocabularyBook.ts`, `scripts/vocabulary/{prepare,review,publish}.ts` (split a pure preparation module only if size/tests justify it), public metadata-only `data/vocabulary/{manifest,reviews}.json`, Worker table initialization SQL, `tests/vocabularyBook.test.ts`, `tests/vocabularyPublish.test.ts`, `tests/vocabularyWorker.test.ts`.

Deliver synthetic end-to-end read-only content first; real publication remains a separate owner-authorized local operation. Test new endpoint methods, headers, rate limits, version pinning and no disruption of existing topic/lexicon endpoints. Public CI uses metadata-only checking, never the external corpus.

### Work package C: Words pages and shared flashcard session

Existing: `src/components/VocabularyView.tsx` (replace rather than retain a second flashcard engine), `src/components/study/StudyView.tsx`, `src/utils/routes.ts`, shell navigation/current-route helpers, `src/components/WordDetailModal.tsx`, `src/App.tsx`, `src/i18n/locales/en.json`, `src/i18n/locales/zh.json`.

New proposed: `src/components/vocabulary/{VocabularyHome,VocabularyBrowser,VocabularyReview,Flashcard}.tsx`, `src/hooks/useVocabularyReview.ts`, `src/services/vocabulary/queue.ts`, `e2e/vocabulary-flashcards.spec.ts`.

Home/browser/review share one storage read model and canonical identity. Session hook owns active id/reveal/skip/operation state; Flashcard only renders. No control performs its own IndexedDB writes. Existing house `Button`, `Table`, `Sheet`, `Dialog`, `Segmented` and speech controls are sufficient; do not add a UI dependency.

### Work package D: integrated backup, documentation and real local acceptance

Existing: `src/components/settings/BackupControls.tsx`, `src/components/settings/DataSection.tsx` if counters change, relevant backup/storage/route/e2e tests, `PRODUCT.md`, `DESIGN.md`, `docs/architecture.md`, `docs/adr-hosted-content-service.md`, `docs/development.md`, matching area rules and `CHANGELOG.md` Unreleased.

Audit all `VocabWord`, `ReviewRecord`, `saveVocab`, `nextReviewDate`, `repetitions`, bookmark membership, vocabulary export and protected-audio call sites; update their fixtures. Remove superseded controls, keys and “mastered” labels. Keep dependent packages together in the integration batch until the existing bookmark/review/backup capability works on the new contract. Do not present a partial shape change with broken writers as a shippable milestone.

## 12. Acceptance matrix and execution gates

Use synthetic invented French/English/Chinese fixtures only. Do not copy the private wordbook into tests or tracked examples. Pure logic and fake-indexeddb tests live in `tests/`; browser tests live in `e2e/`, not a new Vitest/test-runner structure.

| Area | Required checks |
| --- | --- |
| Identity/content | NFC/case/whitespace/apostrophe matches; accents/hyphens retained; phrases stable; same spelling preserves multiple senses; empty POS/absent example accepted, partial example rejected; raw HTML never rendered; original source ids retained; no automatic lemma merge. |
| Personal/built-in join | Bookmark-before-download and download-before-bookmark both yield one canonical card; contexts survive; removing bookmark preserves learning; existing row progress wins over downloaded content; content update/spelling correction has specified non-destructive behavior. |
| Scheduling | Every cell of learning/relearning table; graduation; long-term Hard/Good/Easy/ease minimum; failure returns in one minute; preview is pure; due instant boundaries; local midnight, month/leap-year and DST calendar behavior; self-rating is not objective accuracy. |
| Quota/queue | 20 unique introductions across repeated sessions/reload/two tabs; 0 limit permits reviews; failed introduction doesn't consume quota; overdue review before new; future relearning waits; repeated word isn't new again; deleting/resetting doesn't refund today's ledger; skip changes no schedule. |
| Transactions | Rating write failure retains answer side; retry same operation logs once; stale different operation rejected; double-click/held key creates one commit; bookmark merge doesn't erase concurrent rating; reset/delete/recreate/restore rejects old epoch; no whole-vocab autosave remains. |
| Cache/service | No configured service; first offline use; partial pages; pinned version change; HTTP 429/500, timeout, JSON/schema errors; failed update retains old complete book; swallowed generic cache writes don't produce false offline success; cache clearing retains saved-card review. |
| Backup | Full roundtrip of senses/language/contexts/schedule/history/ledger/preferences; malformed vocab rejects; absent versus empty fields; paired restore metadata; snapshot consistency, atomic failure and stale writer invalidation; saved-card review works without book/service. |
| Browser | Browse pagination/search/source/state filters; reveal then rating; save/bookmark dedup from reader; language/theme switch mid-card; reload/resume; waiting countdown/focus return; no answers in DOM/accessibility before reveal; overlays/input/IME don't trigger grading shortcuts. |
| Layout/audio/network | EN/ZH at 1280×900 and 360×740, all three themes, long words/definitions, zoom and reduced motion; stable control/status bounds during saving/error; intentional reveal readable; no horizontal page overflow; zero automatic AI/TTS calls, no bulk prefetch, explicit Listen follows chosen engine and stops on leave; Worker never receives learner data. |

For each nontrivial new contract, observe a meaningful failing test before implementation, then record passing output. Examples: current minute scheduling cannot express one-minute relearning; current duplicate save creates/deletes the wrong row; current full-list persistence overwrites a restore. A missing module/compiler error alone is not behavioral regression evidence.

Required checks from the lead's shell after assembly:

```sh
bun run typecheck
bun run lint
bun run format:check
bun run test
bun run i18n:check
bun run shape:check
bun run build
bun scripts/grammar-topics/publish.ts --check
bun scripts/vocabulary/publish.ts --check
bun run --cwd worker typecheck
~/.agents/skills/impeccable/scripts/impeccable detect --json src index.html
```

`worker/package.json` currently defines `typecheck` as `tsc -p tsconfig.json`; re-check for drift before running. Add no package just to run this specification.

Playwright is milestone-only, one process across all checkouts. `lsof -iTCP:5174 -sTCP:LISTEN` must show no listener first; if occupied, stop rather than reuse/kill it. Then run `CI=1 bunx playwright test` at the assembled milestone; isolate a failed spec before classifying it. AI calls are mocked/guarded; tests must fail on unexpected text-AI/speech/learner-data traffic, permitting explicit selected-engine Listen only in its dedicated test. Preserve the owner's servers on 5173/8787. Do not claim real AI or a new UI was verified by earlier repository checks.

Final local content acceptance requires an owner-approved corrected artifact, actual normalized count/hash/report, read-only local Worker/D1 serving, and real browser study of sampled entries including a duplicate-sense word and a missing-example word. Do not publish or deploy as a side effect. Report any content/rights blocker separately from code/test completeness.

## 13. Completion and agent handoff

An implementation is complete when both built-in and personal words share canonical cards and schedules; the specified learning/queue rules work; UI, failures, persistence, backup and privacy checks pass; no duplicate engine/autosave remains; and local real-content acceptance is reported honestly. Full public distribution remains blocked without owner approval of the content/rights, not disguised as a successful deploy.

Handoff instruction: **Implement this specification on the designated branch, using a complete vertical slice before expanding polish. Re-check the working tree and source contracts, preserve unrelated edits, use Bun and existing primitives, and stop for new dependency/provider/service, destructive data handling, incompatible development data or unapproved real-content publication. Run ship-change with named-file staging and a behavior changelog entry. No push, PR, merge, remote database write or deployment unless separately requested.**

This documentation task ran no new flashcard implementation, corpus import, publisher, schema initialization or browser acceptance. No private lesson/wordbook text is committed here; examples and counts above describe structure/observations only. Any coding agent must produce its own implementation evidence rather than inheriting a claim that this unbuilt flow passed.
