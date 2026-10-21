# Built-in vocabulary and flashcards: implementation specification

Status: **Code accepted and locally integrated; original corpus imported to local D1, explicitly unreviewed.** Code acceptance uses synthetic content and mocked AI. On 2026-10-20 the owner authorized preserving their Reader changes and continuing real local vocabulary preparation. The stable supplied source was normalized privately and, after the owner's final direct-import instruction, applied to local D1: 7,391 source ids, 7,362 entries and 30 verified pages. No partial AI decisions were applied and no completed linguistic review was marked; actual local/browser evidence is recorded in the joint kickoff. The owner has since explicitly waived linguistic review for original unfiltered local use after the corpus review failed; actual AI corpus review is stopped, not treated as passed. Earlier local import authorization remains. Reviewed/CEFR/Canadian-usage policies remain the default outside this local exception, and public distribution remains gated. The owner requested this specification on 2026-10-19 after approving the product direction: a system-provided TCF vocabulary list, deduplicated with user-added vocabulary, with Anki-style flashcards and shared review progress. This document defines the recommended engineering defaults. It authorizes no deployment, public distribution of source data, destructive data reset or functional change in this documentation task.

Source baseline: `e876e6a`, rechecked against `517ba2d`. Revised on 2026-10-19 after the source-checked Argon review and the owner's instruction to revise, then again after a second source-checked review of `517ba2d` (C1 content ceiling, a cut client error extension, file-map corrections). First reveal now commits a new introduction; the existing long-term formula remains an explicit version-one limitation. Both specification reviews' dispositions are recorded in section 14; they do not constitute runtime acceptance. Subsequent implementation acceptance and private preparation are recorded in the joint kickoff's execution checkpoint.

**Approved Words flip-card amendment (2026-10-20):** the owner adopted the two-way card with external binary Forgot/Remembered recall feedback. This supersedes the original flat/no-flip/four-rating UI contract, not the scheduler, storage, quota, identity, backup or historical-rating contracts. No future memory-curve algorithm is selected or promised to reconstruct state from history.

Read `CLAUDE.md`, `PRODUCT.md`, `DESIGN.md`, `docs/conventions.md`, `docs/architecture.md`, `docs/development.md`, `.claude/rules/{ui,storage,i18n,speech,typescript}.md`, and this specification before implementation. Preserve unrelated work. Grammar checkpoints are not a product prerequisite, but [the joint kickoff plan](learning-implementation-kickoff.md) schedules Grammar acceptance first to serialize shared unit/notebook/backup edits. Joint readiness feedback and remaining owner gates are in section 15.

## 1. Deliverable and fixed boundaries

Build one vocabulary system, not parallel built-in and personal flashcard engines:

1. A built-in TCF wordbook supplies words, meanings and optional examples.
2. Reading bookmarks attach context to the same canonical word; they never create a second schedule for it.
3. Study presents French first on a two-sided card, commits first reveal before showing meanings, then accepts explicit Forgot/Remembered recall outside the back face and commits the next schedule locally. Subsequent front/back flips are display-only.
4. Unseen book words are not automatically due. Default new introductions are limited to 20 unique words per local calendar day.
5. Short learning/relearning steps supplement the existing SM-2-style long-term calculation. There is one scheduler and no new dependency.
6. Durable-first writes, offline saved-card review, backup/restore and honest failure states are part of the feature, not later polish.

Not building: FSRS, Anki sync or `.apkg` import/export, cloud accounts, cross-device progress, a deck hierarchy, reverse cards, spelling/listening tests, automatic AI examples, pronunciation assessment, bulk audio generation, custom card templates, a new manual word editor, undo, heatmaps, streaks or mastery claims. Existing article lookup/AI features remain separate and explicitly user-initiated.

Anki is a behavioral reference, not a compatibility promise. Its manual distinguishes learning steps, relearning and review, and distinguishes forgotten answers from difficult-but-recalled answers: [Studying](https://docs.ankiweb.net/studying.html), [Deck Options](https://docs.ankiweb.net/deck-options.html). The exact scheduling rules below are Relire's specified rules, not a claim to reproduce current Anki/FSRS output.

## 2. Input facts and private content boundary

Owner input: `/Users/royzhu/software/my-local-service/llm-server/artifacts/tcf-vocab-7000/words.json`.

Read-only observation on 2026-10-19: 7,391 rows, 7,391 unique numeric source ids, 7,365 exact spellings, 26 duplicated-spelling groups, 309 empty part-of-speech fields, nonblank English/Chinese glosses throughout, and 5,940 complete trilingual examples. Example filling may still be running; these are observations, **not constants or the final normalized count**. Re-read and hash one stable input snapshot before preparing content.

The input contains `id`, `word`, `pos`, `gloss`, `gloss_en`, `raw`, `tags` and optional `example.{fr,en,zh}`. `raw` includes original HTML; never deliver or render it. Empty tags are not frequency, level or topic annotations. Do not invent CEFR labels, priorities, missing IPA, translations or examples. Some source spellings/examples disagree; parsing successfully is not linguistic review.

**Default content ceiling: C1 for the reviewed system-supplied book.** Review omits whole entries, senses or examples that are beyond C1, rare, isolated, regional-only or outdated; it does not ship them with an uncertainty, level or rarity marker. This offline corpus gate does **not** delete, reject or reschedule personally bookmarked words/contexts on an inferred CEFR level. An omission is a recorded review decision (section 8.1), not a runtime AI decision or a correction of the source. The owner still selects the review method and resolves the regional-only rule for target-relevant standard French-Canadian vocabulary (sections 14–15). Frequency is supporting evidence, not a CEFR classifier or permission to import a new dataset.

**Owner-authorized local exception:** use the original corpus without partial AI keep/omit/correction decisions, retaining structural normalization/grouping and every hash/staged-write check. `--apply-local-unreviewed` consumes the current prepared artifact unchanged; it neither reads those decisions nor reverses any already-prepared omissions. Its manifest records explicit hash-bound `unreviewed` provenance, never invented reviewer identity/time. This waiver is not linguistic approval, an official C1 claim, Canadian-usage validation, permission to add content or public distribution rights. The owner-authorized local import is now complete as recorded in the joint kickoff; no remote/public delivery is implied.

The adjacent README names a third-party shared deck and says no distribution licence was stated. Personal access is not proof of public redistribution permission. **Code and synthetic fixtures can be implemented without distributing the corpus.** The owner must approve the corrected private artifact and distribution rights before any public content publication. Do not turn this into an automatic network/legal research or publishing task.

Recommended delivery is an extension of the existing optional read-only content Worker/D1, not a front-end bundle or a personal-import-only product. This intentionally extends the [hosted-content ADR](adr-hosted-content-service.md) from topics/lexicon to the built-in wordbook; update that scope and the privacy text with implementation. The complete-book download deliberately lets any client read the whole book in roughly 30 paged requests at the observed pre-review count; derive the actual count after omissions. The existing 60-per-minute limit is shared with other requests and can still produce 429, so it is not a download-success guarantee. The ADR's "no endpoint returns all text at once" only raised scraping cost for topics; its update must state this whole-book-download trade-off (section 14). No new backend service, account, key or learner-write endpoint is needed. Without a configured service, personal bookmarks and saved learning cards continue to work. A previously completed book cache can still be browsed/studied offline; its entry says updates are unavailable. With neither service nor complete book cache, the entry explains that the built-in content is unavailable rather than showing an empty book.

## 3. Word identity, senses and bookmark semantics

### 3.1 One canonical key

Implement one exported `vocabularyKey` used by content preparation, bookmark lookup/save, card creation, browser joins and backup validation:

- Unicode NFC.
- Trim and collapse Unicode whitespace to a single space.
- Fold ASCII apostrophe to U+2019.
- Lowercase French spelling; preserve accents, punctuation, hyphens and phrase word order.

Thus spacing/case/apostrophe variants deduplicate, but accentless versus accented words do not. Do not use the exercise grader's accent-folding normalizer. A built-in entry uses its reviewed `word`; a personal lookup uses the original cleaned clicked spelling retained by `useLookupSheets`, never the model-returned `word` or `lemma`. Require the returned analysis word to have the same canonical key before enabling bookmark save; a mismatch shows the real mismatch and existing explicit Retry action, not a silently merged/relabelled explanation. This first version matches spelling, not semantic similarity.

The learner-row id is the deterministic string `word:<canonical key>`. No content version or source id is part of this identity. Always encode identifiers through route helpers when used in a URL; never interpolate raw spellings into paths.

### 3.2 Merge content, never schedules

Group built-in rows by canonical key. Retain all distinct senses, source note ids and examples that survive the C1 review in section 2. An exact repeated sense/example can be collapsed structurally, but conflicting glosses are retained for review, not silently selected by an AI. Preserve first-source occurrence order for browsing and new-word selection; do not call it frequency order.

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

### 3.3 Word-sheet actions and context identity

Replace the single `onToggleVocab` prop with explicit save-current-context and remove-bookmark actions. The footer always reserves the same two action cells plus its local save/error slot:

| Membership | First action | Second action |
| --- | --- | --- |
| Not personally bookmarked | Save word, enabled after matching analysis is ready | Remove bookmark, disabled |
| Bookmarked, current context not saved | Save this context | Remove bookmark |
| Bookmarked, current context already saved | Context saved, disabled | Remove bookmark |

Each action keeps its cell/size while saving or failing. Only Save is filled when enabled; removal is outline and never performs full learner-card deletion. Removal clears the word-level bookmark, not a single context; retained contexts and learning history are stated in the action's help. An unbookmarked word whose old context survives can be saved again without duplicating that context.

Define context identity as `JSON.stringify([source?.kind ?? null, source?.id ?? null, normalizedSentence, requestLanguage])`, with sentence NFC/trim/whitespace collapse for identity only. Store the original sentence for display. Source title, timestamp and model explanation are not identity fields. First successful save owns the existing context snapshot; repeating it is idempotent. Changing the interface language alone does not create a translated context; only a new completed lookup in that language can do so.

`useLookupSheets` captures cleaned clicked word, sentence, source descriptor and the EN/ZH branch immediately before the synchronous `fetchWordAnalysis` call. That is the request language, not the language when the user eventually saves. Retry is a new request using the same original source/word and the current request language. Late lookup/session results keep the existing stale-request guards.

Extend the lookup callback with an optional fourth source argument `{ kind: 'article' | 'unit', id, title }`, where `id` is the existing `ReaderSource` `articleId` or `unitId`. A passage is always kind `'unit'`, so Reader and `UnitSheet` agree on source identity. Contexts deduplicate only when normalized source text and request language also match: `LookupText`/`InlineMarkup` may supply a whole passage or marked-up prompt while Reader supplies a split sentence. Different supplied text remains distinct contexts on the same word/card. Do not guess a sentence boundary, strip source markup or add a new extraction engine merely to force them to merge. Reader supplies its actual article or passage-unit source; `UnitSheet` supplies its unit; the notebook and its explanation lookup supply the selected surviving unit, if present. Forward through `UnitView`, `StudyView` and App, then freeze it with the request. Without a known source, omit it rather than using App's last reader. No new Open source control is required in version one; stored provenance and the sentence remain readable after deletion.

## 4. Proposed domain and persistence contracts

All shapes in this section are **new contracts**, not existing APIs. Add the row, content and metadata Zod schemas in a focused proposed `src/types/vocabulary.ts` (the backup payload schema belongs to `vocabularyBackup.ts`, section 4.3); replace the unreleased `VocabWord`/`ReviewRecord` shape and all real readers/writers together. Do not add a second old-shape reader or background migration. Never clear the owner's browser data to make a new shape work; stop and request a safe test database/profile if encountering incompatible development data.

### 4.1 Content contracts

- **Book manifest:** `bookId` (`tcf-7000`), bilingual title, 64-hex served-artifact hash `version` (section 8.1), normalized `entryCount`, `pageCount`, `pageSize` (250), source attribution and review provenance: either the actual strict `{ bookId, contentHash, reviewedBy, reviewedAt }` record or the distinct strict `{ bookId: 'tcf-7000', contentHash, status: 'unreviewed' }` local-waiver state. No null/default/mixed status is accepted. Actual review records/public `reviews.json` accept only the reviewed shape. Reviewed publication remains the default; only the explicit local mode permits the waiver.
- **Book entry:** canonical `key`, display `word`, nonnegative source-order `position`, source note ids as strings, and one or more senses.
- **Built-in sense:** optional nonblank POS, nonblank English and Chinese glosses, zero or more `{ fr, en, zh }` examples. Missing POS is omitted; missing example is omitted. Partial examples are rejected, not completed at runtime.
- **Personal context:** context identity from section 3.3, original French sentence when supplied, actual save timestamp, frozen request language, optional actual source descriptor, and the `WordAnalysis` snapshot for that same canonical word. The generic `analysis.translation` is in the request language (the English template explicitly says so); do not relabel every saved translation as Chinese or use the current UI language as its provenance. Optional `translationEn`/example translations are used only when actually present.

Published data contains no HTML, `raw`, unknown injected fields, private paths or secrets. Validate NFC/nonblank text and field languages; normalize French apostrophes before validation. Retain original input and correction decisions privately, rather than destroying evidence in place.

### 4.2 Learner row in existing `vocab`

A row carries:

- `id`, canonical `key`, display `word`, creation timestamp.
- `bookSource?`: `{ bookId, version, sourceIds, senses }`, a self-contained snapshot for offline answers.
- `bookmarked: boolean`, `bookmarkedAt: number | null` and `contexts: PersonalContext[]`. False means null bookmark time; changing false to true captures now, while saving another context on an already bookmarked row preserves that bookmark time.
- `schedule: null | VocabularySchedule`.
- `introducedAt: number | null`, set once at the first committed introduction, not on download/bookmark.
- `revision: nonnegative integer`, increased on each committed rating/reset.
- `history: VocabularyReviewRecord[]`, kept through bookmark removal and scheduling reset.

A row requires book content or a personal context. `schedule` and `introducedAt` are either both null (unintroduced) or both non-null. A front-side preview is transient and needs no new row; first reveal creates/reuses the learner row. Bookmarking may create an unintroduced row. No row is needed for every unseen downloaded book entry: join the book cache and learner rows at the Words page. Schedule reset is only available on an introduced row; it never converts a row back to unintroduced.

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
- `vocabularyEpoch`: a monotonically increasing **restore-wide** invalidation counter, not backed up. Single-card reset/delete does not move it.
- `vocabularyReset:<canonical key>`: a per-word reset/delete token, initially 0 and monotonically bumped, never removed or backed up. Recreating a deleted row reads the retained token; it must not reset to 0. This prevents old writes from reaching a new row with the same deterministic id without invalidating another word's session.

Daily ledger keys may refer to cards later deleted; this is valid quota history, not a dangling reference. Historical day labels are the browser's local date when introduced; do not reinterpret them using a later time zone.

Daily introduction entries survive sessions, deletion/reset and page reload. They are an actual introduction ledger, not a count derived from the currently visible queue. Retain them for backup and honest quota accounting. Changing the limit never makes already introduced cards “new” again.

Use existing stores `vocab`, `meta` and disposable `cache`; no client DB version bump/new object store is required. Vocabulary operations belong in proposed `src/storage/vocabulary.ts`; the backup payload schema and restore validation, reusing the section 4 schemas, in proposed `src/storage/vocabularyBackup.ts` (like `exerciseBackup.ts`). Only `src/storage/` touches IndexedDB.

## 5. Exact scheduler transition contract

Replace/extend `src/utils/srs.ts` as the one pure scheduling authority. Pass `now` explicitly; do not call the clock repeatedly inside a transition. A preview and a commit use the same transition rules. No scheduler network calls or configurable preset system.

Stored scheduler ratings remain **Again=1, Hard=3, Good=4, Easy=5**, including all historical 3/5 records. The current learning-flow seam (`useVocabularyReview.recall`) maps explicit **Forgot → 1** and **Remembered → 4**. These two actions appear outside the card only while the unlocked back is shown, with no four-grade UI. Neither Flip nor Skip is a recall outcome; never call a word “mastered.” The tables below define the unchanged scheduler, not additional visible actions.

### 5.1 New introduction

Showing a new word's front, navigating Back, reloading it, or skipping before reveal does not introduce it or consume quota. On **first Flip card**, atomically materialize/reuse its row/snapshot, set `introducedAt=now`, assign `learning, step=0, dueAt=now`, and add its key to the current local day's introduction ledger. This is not a rating and appends no history. Only reveal the answer after commit. A generic introduction storage failure leaves the unrevealed front and real error available for retry; it consumes no quota. Typed quota/stale failures keep the existing refresh-and-advance contract below, never expose the rejected answer.

The transaction re-reads today's limit/ledger and existing schedule. If another tab already introduced this key, return that current row without another quota charge. If its schedule changed since the displayed front was read, reload it front-side before accepting a rating. If other words exhausted the allowance first, return quota-reached without inserting/revealing; show the current counts and choose a due card or the waiting/end state. Do not silently bypass the limit. A deleted/recreated key already in today's ledger consumes no second unique introduction; it remains eligible even when the new allowance is otherwise exhausted.

After reveal, leaving or skipping without a rating retains this real introduction and its due learning state. That is distinct from skipping an untouched front. Capture the local day at the reveal transaction, so midnight while previewing charges the day of actual reveal, not the earlier preview.

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
- **Hard/Good/Easy:** when prior repetitions is 1, schedule 3 calendar days for Hard and 6 for Good/Easy. Otherwise schedule `round(prior intervalDays × prior easeFactor)` calendar days (at least 1, since review intervals are at least 1 and ease at least 1.3; no clamp). Increment repetitions, then update ease.
- Ease update: `max(1.3, roundTo2(priorEase + 0.1 - (5-q) × (0.08 + (5-q) × 0.02)))`.

This is intentionally not current Anki's complete legacy scheduler. For prior repetitions at least 2, **Hard, Good and Easy have the same next interval; their ease updates can affect subsequent reviews**, subject to the shared 1.3 floor. This is an explicit version-one limitation, not an open instruction to choose another formula. Add regression cases with prior ease 2.5 proving equal immediate intervals and distinct next ease values, plus a floor case where Hard/Good may converge. The current binary UI omits interval previews; this limitation still applies to stored four-grade history and the unchanged pure scheduling contract. Do not quietly add easy bonuses, fuzz, automatic parameter optimization or a second scheduler. Replace the `tests/srs.test.ts` cases that demand every first review and every failed recall schedule one day; keep and extend the pure calendar/ease/immutability tests.

### 5.4 Time and presentation boundary

Do not display scheduling interval captions on either face or in the external binary action bar. The recall command captures current `now`; the storage transaction uses the unchanged pure scheduler to assign the actual due instant/date. Pure preview calculations remain side-effect-free and tested, but are not part of Flashcard or VocabularyReview. Move actual due/remaining counts into the session hook, not the rendering component.

A card is due when `dueAt <= now` for minute phases or `dueDate <= local today` for review. The global navigation badge counts actual due introduced cards only. It does not include unseen book words or all bookmarked-but-unintroduced rows.

## 6. Queue, sessions and daily quota

One shared queue service serves built-in and personal words. Rebuild from committed rows and the complete available book, never maintain two independently scheduled copies.

Order at each selection:

1. Due learning/relearning, ascending `dueAt`.
2. Due review cards, ascending `dueDate`, stable canonical-key tie-break.
3. Unintroduced personally bookmarked words, ascending `bookmarkedAt`, then unseen built-in entries in source order. An unintroduced candidate is eligible when its key is already in today's ledger or unique introduction allowance remains. A genuinely new key is ineligible at limit 0 or when the allowance is exhausted.

Deduplicate candidates by canonical key before selection. At most one active card exists in a workbench. An unintroduced front references a catalogue/bookmark candidate without a schedule; it is not a fabricated due card. Read the authoritative learner row/tokens for an introduced card rather than rating a mutable full-row copy captured for the whole session.

If only future minute steps remain, show the actual next due time and countdown; allow ending the session. Wake selection at that time, local midnight and visibility/focus return. Do not pre-empt an actively shown card when another becomes due; select again on the next card transition. Do not instantly repeat a forgotten card while pretending one minute passed. No eligible card means an honest waiting/quota/session-end state, not “all learned” when unseen/skipped/future cards remain.

Skip-for-now changes this visit's exclusion set only, with no rating or schedule write. Before first reveal it consumes zero quota; after a committed reveal it does not undo the introduction. Due introduced skipped cards still count as due outside this visit. Re-entering the route drops exclusions. There is no persistent suspension or session cursor.

Reload ends transient reveal/skip state and presents the next eligible card front-side. Committed ratings and first reveals survive; an unsubmitted self-rating does not. Count unique words introduced separately from ratings submitted. Repeated review is not another new word, and self-rating is not objective accuracy.

## 7. Transactional operations and concurrency

Remove `usePersist('vocabulary', vocabList, saveVocab, ...)` and whole-library replacement writes; stats persistence remains unchanged. App state is a read model refreshed after owned commits. No competing vocabulary autosave may survive.

Required API responsibilities (proposed names):

- `saveVocabularyBookmark`: canonical-key transaction using frozen lookup identity/context; preserve schedule/revision/history, set bookmark time only on false-to-true, and idempotently add the current context. No TTS side effect.
- Attach matching book content only when the existing row has no `bookSource` and is explicitly saved or prepared for study. Preserve an existing snapshot even if the downloaded catalogue is newer. Preparation of a new front does not materialize a row or introduce a word.
- `removeVocabularyBookmark`: clear bookmark/time, keep contexts/content/schedule/history. It is not card deletion.
- `introduceVocabularyCard`: called by first reveal, not route entry/render. In one `vocab`/`meta` read-write transaction validate tokens, read row/preferences/day ledger, enforce quota and commit section 5.1. Return the committed row/tokens, or typed quota-reached/stale outcomes. First reveal of an already introduced card writes no second introduction. Return current state without another charge on a same-key race; stale changed state reloads front-side, never silently grades from the old one.
- `rateVocabularyCard`: require an introduced row. In one transaction validate restore epoch and this word's reset token first. If the operation id already exists in its history, require the same submitted rating and return already-committed with the current authoritative row. Otherwise require the expected row revision, compute the transition with captured `now`, append history/increment revision and commit. Never replay a historical next schedule over a newer row.
- `resetVocabularySchedule`: only for an introduced row, with confirmation and current tokens/revision. Set `learning`, step 0, `dueAt=now`, repetitions/interval 0 and ease 2.5; keep `introducedAt`, content/bookmark/history and day ledgers. Increment row revision and this word's reset token atomically; do not bump the global restore epoch. The next view is front-side and immediately due, not a quota-consuming new introduction.
- `deleteVocabularyCard`: confirmed removal of this learner row/history plus a bump of this word's reset token in the same transaction. Keep book content/day ledgers and other words' tokens. A later explicit reintroduction creates a new row under the retained token, not under token 0. Explain that this deletes history, unlike bookmark removal.

Capture `{ epoch, resetToken, revision }` with a displayed introduced card; a new front captures epoch/token before reveal. Restore moves the global epoch. Same-word reset/delete moves only its reset token. An operation made stale by either returns stale/missing, drops pending work and reloads front-side; **do not storage-retry it under a freshly adopted token**. Resetting word A must not invalidate word B's in-flight rating.

Generate a rating operation id once per submission and retain it only for a non-stale storage retry of that submission. Disable duplicate rating/navigation during commit. Failed writes keep the answer side, selected rating and real error; retry uses the same operation id, and a different rating cannot reuse it. Advance only after successful commit. An already-committed retry returns the current row, so later ratings are not overwritten. Epoch/token invalidation deliberately takes precedence over old-operation replay after destructive changes.

Bookmark/content merges read the transaction's current row and preserve its schedule. There is no live co-editing/message-bus promise: refresh on focus and after same-tab commits, use transaction ownership and reject stale submissions honestly.

## 8. Built-in content preparation and service delivery

### 8.1 Preparation/publish contract

Add a Bun-only private pipeline under proposed `scripts/vocabulary/` (do not run the external Python builders from the app):

1. Explicit `--source <absolute words.json>`; no hard-coded default private path in executable code.
2. Read one stable snapshot, validate, normalize and group by the canonical identity. Emit a private report of source rows, canonical groups, missing fields, conflicting senses and example issues. Do not guess corrections. Apply the reviewer's recorded C1-ceiling omissions (section 2) from the private correction decisions (section 4.1), and report omitted entry/sense/example counts; omission is not a guessed correction.
3. Write the normalized artifact/review sheet to ignored `.local/vocabulary/`; logs to ignored `.pi-runs/vocabulary/`. Omit `raw`. `contentHash` is canonical SHA-256 of the normalized book metadata/entries before review metadata; array order is significant, object keys use code-point sorting.
4. Maintain public metadata/review hashes only in proposed `data/vocabulary/manifest.json` and `reviews.json`. Review records are `{ bookId, contentHash, reviewedBy, reviewedAt }`. No corpus strings in committed fixtures/artifacts. Any content change invalidates that review. Record the actual authorized reviewer, not fabricated owner review.
5. Default staging and `--apply-local` require an actual matching review. Only owner-authorized `--apply-local-unreviewed` constructs the explicit local-waiver state for the current prepared content hash, ignoring even a matching actual review without creating/altering public reviews or reading partial decisions. Both provenance variants retain `contentHash` and the same assembly/full-book hash binding. The served `version` is SHA-256 of `{ manifestWithoutVersion, entries }`, including exact review provenance and pagination metadata. This makes every served page immutable under its version even after a re-review or provenance change. Keep review-content hash and served-version hash distinct; no hash contains itself.
6. Generate private staged publish SQL; both apply modes follow the identical verified switch protocol below using only installed local Wrangler. No validation bypass, default source rewrite, automatic generation, remote publish or credential lookup. Unknown/multiple/remote options are refused. `--check` validates public metadata only and works in CI without private source access.

Pipeline commands to implement: `bun scripts/vocabulary/prepare.ts --source <file>`, `bun scripts/vocabulary/review.ts print`, `bun scripts/vocabulary/review.ts mark --by <actual reviewer>`, `bun scripts/vocabulary/publish.ts [--check | --apply-local | --apply-local-unreviewed]`. `mark` and applying real content require the owner's authorization; test them with synthetic data.

### 8.2 Read-only endpoint

Add **one** resource to the existing Worker:

`GET /v1/vocabulary/tcf-7000?page=<zero-based integer>[&version=<64-hex hash>]`.

- Page size is 250 entries; each response carries the same manifest, page index and entries. Derive normalized counts. First request uses page 0 without a version; later requests pin its version. An unversioned request for any other page is invalid, not permission to mix the current release into a pinned download.
- Store prebuilt pages in new D1 `vocabulary_pages`, keyed by `(book_id, version, page)`, with JSON `body`. In existing D1 `meta`, `vocabularyCurrent:tcf-7000` holds the current version and `vocabularyPublished:tcf-7000:<version>` holds the complete published manifest. The Worker serves only versions with that publication marker, never partially staged rows. Use prepared bindings.
- For an unversioned page-0 request, read the current pointer once, then use that resolved version for its publication manifest/page. A concurrent pointer switch cannot mix them. Pinned reads use exactly the requested published manifest/version.
- Add table-creation SQL in proposed `worker/migrations/0003_vocabulary.sql`; this is new D1 structure, not a client IndexedDB upgrade or an old-shape converter. Preserve topic/lexicon rows.
- Preserve current GET/HEAD/OPTIONS, CORS/rate-limit behavior, fixed error messages and `no-store` errors. ETag is the returned vocabulary version, not the grammar/lexicon version. Unversioned page 0 uses `Cache-Control: no-cache`, so Check for updates revalidates the current pointer rather than reusing a fresh older HTTP response; pinned pages retain the existing public max-age policy. No learner write method or SQL details in errors.

Lock the error contract (JSON `{ error: <code> }`):

| Condition | HTTP | Code |
| --- | --- | --- |
| Malformed, duplicate or extra query argument; missing/invalid page; malformed version; unversioned nonzero page | 400 | `invalid-query` |
| Unknown book/resource | 404 | `not-found` |
| No published current version | 404 | `book-unavailable` |
| Pinned version has no publication marker | 410 | `version-unavailable` |
| Page outside the published manifest's bounds | 404 | `page-not-found` |
| Published marker/pointer exists but required page/manifest is missing, or D1 fails | 500 | `unavailable` |
| Rate limit / unsupported write method | 429 / 405 | Existing `rate-limited` / `method-not-allowed` |

**Publish protocol, not an all-statements SQL-file transaction:** the current publisher/Worker README warn that Wrangler strips transaction wrappers. Never copy delete-first replacement or claim BEGIN/COMMIT around a SQL file proves atomicity.

1. Stage immutable new-version page rows without deleting/modifying current or older published versions. Re-publishing an existing version is idempotent only if stored bodies exactly match; mismatched bodies fail rather than overwrite.
2. After the stage command succeeds, read back and validate every expected page body, version, index, count and aggregate hash against the prepared artifact. A failed/missing/mismatched read prevents publication; counting rows alone is insufficient. Capture private readback without printing the corpus.
3. Write its complete publication-manifest marker **only after** successful verification. If interrupted here, the old current pointer still names a complete book; the new marked version is also complete for any pinned reader.
4. Switch `vocabularyCurrent:tcf-7000` with one final atomic upsert statement. Read the pointer back before reporting current-publication success. If switching/reporting fails, return a real failure; rerunning the same prepared version is safe.
5. Keep old published versions and incomplete staging rows; no automatic cleanup policy is added. A separate owner-authorized maintenance task may remove them later. This trades bounded-per-publish growth for simple safe readers; it does not promise zero storage growth.

Only one publisher writes this book at a time, like the existing local content workflow; multi-writer publication is not introduced. Test failure/interruption before each step and prove the old current version stays complete. The guarantee is an atomic **current-version switch after complete staging**, not a fictitious transaction across multiple Wrangler invocations.

Use existing `VITE_CONTENT_SERVICE_URL` and low-level `contentServiceFetch` timeout/transport and its `ContentServiceHttpError` unchanged; no second URL/key setting. The loader branches on its public `status` (410 offers Restart download); its message is already the untranslated `HTTP <status>: <code>`, shown as the real error. No client-side code or `Retry-After` parsing is added. Requests disclose only book id, page and version, not saved words, answers, language, grades or schedules. Update privacy text; do not repurpose the lexicon endpoint.

### 8.3 Complete-book cache and failures

Load at the Words entry/download action, never application startup or each flip. Fetch pages with **`contentServiceFetch`, not `contentRequest`**: the latter automatically writes/falls back per request. Accumulate pages only in memory, validate manifest/version/count/unique-key invariants and recompute the aggregate served-version hash. Commit exactly one complete-book `content` cache entry through `storage/vocabularyBook.ts`; no per-page cache entries or persistent partial-download manifest.

Use an already validated complete cached book directly. Explicit Check for updates downloads a fresh pinned candidate; replace the cache only after complete validation/commit. On HTTP/JSON/schema/hash failure, clear the incomplete in-memory candidate, show the real failure and preserve the old book. Retry restarts at page 0; no unbounded automatic retry. In particular 410 says that version is unavailable and offers Restart download. HTTP 429 shows its real error; it is not a stale-success refresh.

Download, update and their failures show on the Today page's download control and its fixed-size status slot (page n of total while running), reserved from first render; they never insert or remove a row.

`putCached` deliberately swallows quota failures: do not use its resolved promise as proof of offline storage. The narrow complete-book storage operation must await commit and propagate errors before “available offline.” On failure, do not mark/install the candidate; keep the old cache and storage Retry/restart action. Do not change AI/topic cache policy globally.

With no complete book, first-use failure is unavailable, not zero words. Saved learning cards still review from snapshots. Cache clear/expiry removes only unseen downloadable content, never saved cards/history/quota. Existing `content` TTL is 365 days, not permanent storage; the completed book retains that policy. Topic network-first/cache-fallback semantics remain unchanged.

## 9. Routes, screens and visual contract

Keep Words under My study; no new top-level navigation. Define real routes for places, not a component-local page switch:

| Route | Purpose |
| --- | --- |
| `#/study/words` | Today: actual due/new counts, Continue/Start, book download/update status and new-per-day setting. |
| `#/study/words/all` | Browse the merged dictionary/personal list with search and source/learning-state filters. |
| `#/study/words/review` | One active two-sided flashcard, durable answer unlock, external binary recall and waiting/finish states. |

Extend `Route`, `routeHref`, `parseRoute`, `areaOf`, `NavTree`, shell current-area logic and `StudyView`; preserve Back/reload. Use new route variants for the deeper Words places, not Grammar's `section: 'conjugation'`. All three routes keep My study/Words active in expanded sidebar, rail and compact study navigation. No current word/source is sent over the network; transient filters/reveal need no routes.

Today and Browse share two real page links, Today and All words, above their content, with `aria-current="page"` on the matching destination; these are not Segmented radios. Today's Start/Continue links to Review; Browse has an outline Review due words link to that same review route (it does not bypass queue/quota). Review's Back to Words always targets Today and its Browse words link targets All words. Do not add a second sidebar or label Review as the All words destination.

### Today and browser

Today shows real pending review count, learning/relearning count and remaining new introduction allowance. Unavailable book data is not a fake zero-word catalogue. New limit input accepts integer 0..100; save explicitly with fixed-size control/status and default 20. This is the only scheduling preference exposed in version one.

Browse composes existing `ui/table` with TanStack Table. Search word and actually available glosses/context; paginate at 50 rows and do not render 7,000 DOM rows. Filters: source All/Built-in/Bookmarked and learning state All/Unintroduced/Learning/Review. A word may match both source filters. No “mastered after four reviews” filter or invented level/frequency labels. Details use a Sheet; download/update, storage and no-match states belong to the page.

### Flashcard wireframe

```text
Back to Words                         Session ratings / introductions
Due now: n    New remaining today: n
+----------------------------------------------------+
| Front: French word, explicit Listen, Flip card      |
|               < actual two-way flip >              |
| Back: word, Listen, Flip to front                  |
|       full POS / meanings / examples / saved context|
|       (language follows interface; sources visible)|
+----------------------------------------------------+
External session actions:
Back only: [Forgot] [Remembered]
[Skip for now]
Bounded status slot for saving/failure; details in Sheet.
```

- Page follows DESIGN: warm paper, `bg-surface`, `ink-*` rules/text, one blue accent, serif word/headings, 14px body and 12px minimum metadata. Word 32px phone/40px desktop, semibold, wrapping; never fit by shrinking below readable sizes.
- One centered, readable two-sided surface, not nested cards. Controls `rounded-md`, surfaces `rounded-lg`; no decorative icons, flags or rainbow ratings. A functional 180ms `ease-out` flip is the sole new motion; reduced motion switches faces immediately without rotation/transition.
- Flip card is the single filled action on the front; Remembered is filled on the back. Forgot is outline; Skip is independent. External binary actions mount only on the unlocked back, never a disabled four-rating panel. All targets are at least 40px. No interval previews or rating knowledge inside Flashcard.
- VocabularyReview is the single owner of visual face, separate from the hook's durable `revealed` fact. Flashcard is controlled presentation only: word, nullable unlocked answer, face, busy and flip/listen requests. It imports no scheduler, queue, storage, clock or numeric rating types and reuses VocabularyAnswer/SpeakButton. New active word, restore and stale refresh return to front before paint. Subsequent flips perform no introduction, quota charge, history/rating or I/O.
- Intentional flips can change natural content height; preserve the card top/viewport anchor. Active full multi-sense/context prose grows in normal page flow, without a fixed total height, clipping or tiny internal reading scroll box. Only the inactive mounted face is removed from layout, inert and aria-hidden, with no focusable controls. Long content may also be read through the explicitly opened existing details Sheet.
- Reserve a bounded local status slot from first render; saving/error changes that slot/control only. Long error details use a Sheet. Full long definitions/examples remain in normal page flow or an explicitly opened detail Sheet, not a tiny nested reading scroll pane.
- The word is plain text, not a giant clickable container. Dedicated native Flip controls use Enter/Space once; independent Listen/details controls never flip. Before first reveal, the fixed-size flip control shows saving while introduction commits. No back answer DOM or recall action mounts before actual commit.
- Back flips focus the answer heading (`tabIndex=-1`, `preventScroll`); front flips focus Flip card. A committed recall/Skip focuses the next Flip card or wait/session-end heading. Generic failures retain the face/decision and restore the submitted control's focus; typed quota/stale failures refresh and advance front-side. Overlay close restores its opener; language/theme changes do not move focus.
- On the unlocked back, only 1=Forgot and 2=Remembered apply, outside independent child controls, inputs, editable text, overlays and IME composition. No numeric recall on the front or while returning to it. Ignore held/repeated keydowns and prevent their native default on study action buttons; disable shortcuts while saving. One physical key press/release must never flip and grade or act on the next word. These are interaction requirements, not a browser assertion-matrix mandate.
- Before reveal, no gloss, POS/gender cue, contextual sentence, translated example, hidden answer attributes or accessible answer text is mounted. Manual word audio may be requested but no autoplay or example audio reveals a cue.
- Optional word Listen uses existing `SpeakButton` and the user's selected engine; explicit remote speech may require its key. Do not switch engines silently. Remove the existing `prefetchSpeech([data.word, contextSentence])` side effect from App's bookmark-save path: saving/removing a bookmark, adding context, downloading, revealing and rating trigger no automatic AI/TTS. Reader playback initiated elsewhere keeps its existing behavior. Moving cards/leaving review stops this session's owned playback through the shared layer. Text review needs no key; version one adds no example-audio controls or bulk prefetch.
- For optional vocabulary-audio backup/LRU protection, qualify only learner rows with `bookmarked === true` or non-null `schedule`. Include their word, personal context sentences and personal analysis usage-example French text. Do not include unseen catalogue entries or built-in sense examples. Protection only retains already acquired clips; it never synthesizes missing clips. Use that same set for vocabulary-audio export; shadowing keeps its existing separate rules. The existing 200 MiB threshold trims unprotected audio and is not a guaranteed ceiling for protected assets.
- Answer-side book text follows current EN/ZH. Personal analysis shows its actual saved language if no requested translation exists, with a truthful saved-language label; never invent one. Switching language/theme preserves current card/reveal state and progress.
- Use a polite status announcement for revealed/saved/failure states, visible focus, named controls and overlay focus return. At 360px, 16px gutters, no horizontal document overflow. Appearance, focus and motion acceptance is owner-manual only; light/sepia/dark and reduced-motion support remain product requirements, not automated assertion matrices or screenshot gates.

## 10. Backup, restore, statistics and removal

Extend existing `db.ts` export/import and `BackupControls`, not a separate backup system:

- Always export learner `vocab` rows and the paired field `vocabularyMeta: { preferences: { newPerDay }, days: [{ date, introducedKeys }] }`. Export days sorted by date and unique keys per day; include all retained ledgers, even those referring to deleted cards. Use effective default preferences when no preference row exists. Never export arbitrary `meta`, reset tokens, restore epoch, API keys or disposable content caches.
- Read `vocab` and owned vocabulary metadata in one consistent `vocab`/`meta` read transaction. Optional vocabulary-audio export uses the eligibility set in section 9; shadowing/audio restoration keeps its existing separate error reporting.
- Validate raw inputs before the restore transaction. Forward raw `data.vocab`/`data.vocabularyMeta` from `BackupControls`; remove its non-array-to-undefined coercion. Require key/id and bookmark/time agreement, content/language shapes, matching schedule/introduced-nullability, finite fields, ratings, increasing history revisions (gaps after reset allowed), unique day labels/keys and date format. Reject malformed fields rather than stripping them. A day key need not have a surviving card, and historical local dates are not recomputed in a later timezone.
- Both backup fields absent means preserve vocabulary/metadata and do not bump its epoch. Either one present without the other rejects, including `vocab: []` without metadata. Both present replace the pair; `vocab: [], vocabularyMeta: { preferences, days: [] }` explicitly clears rows/day ledgers while setting those preferences. Empty rows with a supplied nonempty valid ledger deliberately retain that introduction history. No unreleased old-format converter; update callers/fixtures to the new paired contract.
- In the existing whole-restore transaction, replace `vocab`, delete only `vocabularyPreferences` and keys with the exact `vocabularyDay:` prefix, then write imported preferences/day entries. Never clear the `meta` store. Preserve `started`, stats/exercise tokens and all other metadata except changes the rest of that restore explicitly owns. Keep every `vocabularyReset:` counter and increment the local `vocabularyEpoch` once; never import/reduce either counter. Any failure aborts all row/metadata changes.
- Notify/refresh the vocabulary read model immediately after successful restore, before `BackupControls`' delayed reload. A still-open review's old epoch rejects late submissions. No whole-list autosave may overwrite the restore. A restored saved card reveals/reviews without the service; unseen entries are not backed up and need a separate book download.

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

Existing: `worker/src/index.ts`, `worker/README.md`, `worker/NOTICE.md` if attribution requires it; `src/services/grammarTopics/service.ts` is reused unchanged. Reuse low-level transport, not `contentRequest`'s per-page caching; do not globally rename these modules.

New proposed: `src/services/vocabulary/load.ts`, `src/storage/vocabularyBook.ts`, `scripts/vocabulary/{prepare,review,publish}.ts` (split a pure preparation module only if size/tests justify it), public metadata-only `data/vocabulary/{manifest,reviews}.json`, Worker table initialization SQL, `tests/vocabularyBook.test.ts`, `tests/vocabularyPublish.test.ts`, `tests/vocabularyWorker.test.ts`.

Deliver synthetic end-to-end read-only content first; real publication remains a separate owner-authorized local operation. Test new endpoint methods, headers, rate limits, version pinning and no disruption of existing topic/lexicon endpoints. Public CI uses metadata-only checking, never the external corpus.

### Work package C: Words pages and shared flashcard session

Existing: `src/components/VocabularyView.tsx` (replace, not a second engine), `src/components/study/StudyView.tsx`, `src/utils/routes.ts`, `src/components/shell/NavTree.tsx` and current-route helpers, `src/components/WordDetailModal.tsx`, `src/hooks/useLookupSheets.ts`, `src/App.tsx`, both `src/i18n/locales/en.json` and `zh.json`. Wire source descriptors through `src/components/practice/UnitView.tsx`, `UnitSheet.tsx`, `src/components/study/MistakeNotebook.tsx` and its explanation callback; add lookup-context tests. Update `e2e/practice-crosslinks.spec.ts` and `e2e/mistakes.spec.ts` to use the explicit All words destination for saved-list assertions, while preserving active Words navigation checks. Rewrite `e2e/vocabulary-review.spec.ts` (it seeds the old `VocabWord` shape and imports `calculateNextReview`) as the flashcard browser spec rather than adding a second one.

New proposed: `src/components/vocabulary/{VocabularyHome,VocabularyBrowser,VocabularyReview,Flashcard}.tsx`, `src/hooks/useVocabularyReview.ts`, `src/services/vocabulary/queue.ts`.

Home/browser/review share one storage read model and canonical identity. Session hook owns candidate/active id, durable reveal/skip/operation state, captured epoch/token/revision, semantic binary recall mapping and due/remaining counts. VocabularyReview alone owns visual face and external session actions; Flashcard only renders and focuses the shown face. Word-sheet membership uses both the canonical word bookmark and the current frozen context key, not a single dictionary-exists boolean. No control performs its own IndexedDB writes. Use existing `ui/` `Button`, `Table`, overlay `Sheet`/`Dialog`, `Segmented` and speech controls. `ui/` has no text/number input: add one for search and the new-per-day limit with `bunx shadcn@latest add input` (Base UI is already a dependency), not a hand-written control; stop and ask if that would add a package.

### Work package D: integrated backup, documentation and real local acceptance

Existing: `src/components/settings/BackupControls.tsx`, `src/components/settings/DataSection.tsx` if counters change, relevant backup/storage/route/e2e tests (for example `tests/exerciseBackup.test.ts` imports `vocab: []` without the paired metadata), `PRODUCT.md`, `DESIGN.md`, `docs/architecture.md`, `docs/adr-hosted-content-service.md`, `docs/development.md`, matching area rules and `CHANGELOG.md` Unreleased.

Audit all `VocabWord`, `ReviewRecord`, `saveVocab`, `nextReviewDate`, `repetitions`, bookmark membership, vocabulary export and protected-audio call sites; update their fixtures. Remove superseded controls, keys and “mastered” labels. Keep dependent packages together in the integration batch until the existing bookmark/review/backup capability works on the new contract. Do not present a partial shape change with broken writers as a shippable milestone.

## 12. Acceptance matrix and execution gates

Use synthetic invented French/English/Chinese fixtures only. Do not copy the private wordbook into tests or tracked examples. Pure logic and fake-indexeddb tests live in `tests/`; necessary browser tests live in `e2e/`, not a new Vitest/test-runner structure. Owner decision 2026-10-20 supersedes earlier automated UI/milestone gates: use units for logic and owner-manual visual acceptance only. Browser automation is exceptional for necessary critical frontend/backend, browser persistence or backup/restore risk not covered by units; prefer existing focused specs and grow coverage only for a necessary uncovered risk. Historical matrix/run evidence remains historical, not a current requirement.

| Area | Required checks |
| --- | --- |
| Identity/content | NFC/case/whitespace/apostrophe matches, accents/hyphens retained, phrases/senses/source ids preserved; optional POS/example rules; recorded C1-ceiling omissions drop their entries/senses/examples and are counted, with no level/uncertainty marker; no raw HTML or automatic lemma merge. A mismatched model-returned word cannot supply the bookmark key or silently attach its analysis. |
| Personal/built-in join | Both save/download orders yield one card; each footer state in 3.3; new source/context saves without removing the bookmark; same-context retry is idempotent; remove/re-save keeps contexts/history. Lookup language/source stay frozen through UI changes and practice/notebook callbacks; never inherit the last reader. |
| Scheduling | Every learning/relearning transition; graduation; long-term ease/minimum; mature ratings have equal immediate intervals and rating-specific ease updates (including floor convergence); reset is exactly learning step 0/due now/ease 2.5 with history kept; null introduction state cannot be reset to bypass quota. Preview is pure; minute/local-calendar/DST boundaries hold. |
| Quota/queue | Preview/Back/reload/Skip-before-reveal consume zero; first committed reveal consumes once; reveal failure/quota race reveals no answer; same-key two-tab reveal charges once; midnight charges the reveal day; 20 distinct keys maximum; limit 0 still permits reviews; already-ledgered recreated key charges no second introduction. Skip after reveal keeps that introduction; future relearning waits. |
| Transactions | Failed rating keeps answer/selected decision; same operation retries once, different rating cannot reuse it; stale revision/token/epoch reloads without adopting fresh tokens for old work. Reset/delete A does not invalidate rating B; same-key delete/recreate rejects old writes. No competing whole-list autosave. |
| Cache/service | No service/offline/partial pages; published manifests gate pinned reads; exact Worker HTTP error/code matrix; loader branches on `status` (410 restart, 429 real error); no page-cache writes; aggregate version/hash verification and committed single-book cache. Interrupt every publish step: old current stays complete; same-version rerun doesn't overwrite; no cleanup/deletion during staging. Failed refresh/storage keeps old book. |
| Backup | Paired shape roundtrip; raw malformed fields reject; either key alone rejects; explicit empty days remove old vocabulary-day keys but keep unrelated meta and local per-word tokens; epoch moves on replacement only. Deleted-card ledgers remain valid; imported data cannot lower tokens/epoch. Atomic failure and immediate read-model refresh; restored saved cards work without service. |
| Critical browser persistence | Existing bookmark crosslinks still reach saved lists. No back answer DOM before durable reveal, including delayed/failed commit. Repeated unlocked flips do zero DB I/O/quota/history work. Explicit Forgot/Remembered store 1/4 with expected schedules; Skip implies no success. Retry keeps the operation id and rejects alternatives; quota/stale refresh never accepts stale answers/ratings. Preserve existing high-risk cache/service/offline evidence, not a UI permutation matrix. |
| UI acceptance | Owner-manual only for section 9's appearance, navigation, focus, keys, layout and motion requirements; no automated theme/viewport/focus/animation/screenshot matrix. Meaningful normal motion and separate reduced-motion accessibility remain required product behavior. |
| Audio/network | No automatic AI/TTS on save/download/reveal/rate. Unit-test exact audio-protection/export set (not the whole book); retain existing explicit Listen selected-engine/stop-on-leave evidence. Worker receives no learner data. |

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

Full E2E is only for an explicit owner request or separately justified broad integration need, never a default assembly/batch/phase gate. Workers run no browsers/servers unless explicitly authorized. Any justified authorized browser check uses one process across checkouts: first `lsof -iTCP:5174 -sTCP:LISTEN` must show no listener; if busy, stop, never reuse/kill it. Then run an existing focused spec with `CI=1 bunx playwright test e2e/<spec>.spec.ts -g "<critical flow>"`, not a full rerun or second server. Mock existing explicit reader lookups as setup for bookmark integration, then assert saving adds no AI/TTS requests. Flashcard review/download/reveal/rating allow no text-AI/TTS requests; explicit selected-engine Listen is tested separately. Every path rejects learner-data traffic to Worker. Preserve owner servers on 5173/8787. Earlier baseline checks do not verify this unbuilt flow.

Final local content acceptance requires an owner-approved artifact (reviewed by default, explicitly unreviewed for the owner's local waiver), actual normalized count/hash/report, read-only local Worker/D1 serving, and real browser study of sampled entries including a duplicate-sense word and a missing-example word. The waiver does not satisfy linguistic/CEFR review or public-delivery gates. Do not publish or deploy as a side effect. Report any content/rights blocker separately from code/test completeness.

## 13. Completion and agent handoff

An implementation is complete when both built-in and personal words share canonical cards and schedules; the specified learning/queue rules work; UI, failures, persistence, backup and privacy checks pass; no duplicate engine/autosave remains; and local real-content acceptance is reported honestly. Full public distribution remains blocked without owner approval of the content/rights, not disguised as a successful deploy.

Handoff instruction: **Implement this specification on the designated branch, using a complete vertical slice before expanding polish. Re-check the working tree and source contracts, preserve unrelated edits, use Bun and existing primitives, and stop for new dependency/provider/service, destructive data handling, incompatible development data or unapproved real-content publication. Run ship-change with named-file staging and a behavior changelog entry. No push, PR, merge, remote database write or deployment unless separately requested.**

This documentation task ran no new flashcard implementation, corpus import, publisher, schema initialization or browser acceptance. No private lesson/wordbook text is committed here; examples and counts above describe structure/observations only. Any coding agent must produce its own implementation evidence rather than inheriting a claim that this unbuilt flow passed.

## 14. Source-checked review disposition

The Argon advisory reviewed baseline `e876e6a` and returned FAIL. The lead checked its claims against source, rejected incorrect file omissions/corpus facts and old-backup compatibility advice, and revised the real gaps below. This table records fixes to the **specification**, not runtime proof or an external PASS.

| Item | Resolved contract |
| --- | --- |
| R1: bookmark/context/identity | Original clicked-word key, matching analysis, frozen request language/source, deterministic context identity and explicit footer save/add/remove states (3.1, 3.3, 4.1). |
| R2: publication/cache | Verified immutable staging, publication marker, atomic final pointer switch, retained old versions, exact HTTP/code matrix, low-level page transport and one committed complete-book cache (8). |
| R3: reset/invalidation | Exact introduced-card reset output; per-word tokens for reset/delete and restore-wide epoch only; no cross-word invalidation or unsafe stale retries (4.3, 7). |
| R4: automatic speech | Remove reader bookmark prefetch, preserve explicit Listen/other reader playback, specify protected/exported vocabulary audio exactly (7, 9). |
| R5: backup metadata | Concrete paired export shape and namespace-only replacement, raw validation, preserved unrelated metadata/local tokens and immediate restore refresh (10). |
| R6: navigation/focus | Real Today/All words/Review links, Words active state, explicit reveal/advance/failure focus and physical-key safety; named crosslink test updates (9, 11, 12). |
| D1: new-card quota | First successful reveal, not front presentation; specified Skip/Back/reload, quota-race and midnight behavior (5.1, 6). |
| D2: equal mature intervals | Retain existing formula as an explicit limitation, with floor-aware ease updates and regression coverage (visible interval previews were removed by the approved flip-card amendment); no unapproved scheduler/dependency change (5.3, 12). |

### 14.1 Second source-checked review (`517ba2d`)

Checked by the lead against source on 2026-10-19: every named existing file, `VocabWord`/`ReviewRecord`, `calculateNextReview`, `saveVocab`, the `usePersist('vocabulary', …)` call, App's lowercased toggle and `prefetchSpeech([data.word, contextSentence])`, `useLookupSheets`' cleaned word, `contentServiceFetch`/`contentRequest`/`ContentServiceHttpError`, `putCached`'s swallowed errors, the 365-day `content` TTL, `AUDIO_CAP_BYTES` (200 MiB), IndexedDB version 1 with `vocab`/`meta`/`cache`, Worker headers, rate limit, migrations `0001`/`0002` and README transaction warning, the Worker `typecheck` script, route helpers, Playwright port 5174 and the check commands. The section 2 corpus counts were not re-read. R1–R6, D1 and D2 stand.

| Item | Disposition |
| --- | --- |
| S1: C1 ceiling | Fixed. Every entry, sense and example was retained; review now omits beyond-C1, rare, isolated, regional-only or outdated content with no marker, recorded privately and counted (2, 3.2, 8.1, 12). |
| S2: client error extension | Fixed by cutting it. `ContentServiceHttpError.status` is already public and its message is the untranslated `HTTP <status>: <code>`, so the code/`Retry-After` extension had no need. The Worker error matrix (R2) is unchanged (8.2, 8.3, 11, 12). |
| S3: missed old e2e/tests | Fixed. `e2e/vocabulary-review.spec.ts` uses the old shape and is rewritten instead of adding a second spec; the `tests/srs.test.ts` first-review case and `tests/exerciseBackup.test.ts`' unpaired `vocab: []` are named (5.3, 11). |
| S4: schema home | Fixed. Section 4 put every schema in `types/vocabulary.ts` while 4.3 put them in `vocabularyBackup.ts`; the backup payload schema alone now lives there (4, 4.3). |
| S5: missing input primitive | Fixed. "Add no UI dependency" conflicted with shadcn-first while `ui/` has no input; add it with the shadcn CLI (11). |
| S6: impossible clamp | Fixed. `max(1, …)` can never bind for a review interval at least 1 and ease at least 1.3 (5.3). |
| S7: download status layout | Fixed. Today's download/update/failure now uses its control and a reserved status slot (8.3, 12). |
| S8: source descriptor | Fixed. Ids come from `ReaderSource`; a passage is always kind `'unit'`. Joint review clarified that equal source ids do not force equal context text across views; only an equal full context key merges (3.3, 15). |
| O1: C1 selection method | Content gate, not a synthetic-code blocker. Owner chooses/accepts the omission-review method and any external evidence source; frequency alone is not CEFR. Resolve target-relevant Canadian usage before marking the real artifact reviewed; do not silently omit personal data (2, 15). |
| O2: whole-book scraping | Public-delivery gate. Owner must accept that an authorized/public client can download the full served book and confirm distribution rights before real public availability. Local synthetic endpoint tests do not require this decision. Access control remains the precondition for selling (ADR section 6). |

## 15. Joint readiness feedback and kickoff boundary

Source-checked at `517ba2d` with the owner's latest revisions. Keep the smaller HTTP-error contract, existing vocabulary e2e rewrite, schema ownership, fixed download status slot and shadcn Input requirement. Do not reintroduce client error-code/Retry-After parsing or a second test runner/scheduler.

| Joint feedback | Disposition |
| --- | --- |
| C1 policy could be applied destructively to personal bookmarks | Limited to reviewed built-in content; personal words/contexts and schedules survive independently, with no runtime CEFR inference (2). |
| Equal source id was overstated as equal sentence/context | Reader splits sentences while exercise lookup may supply a whole passage/prompt. Merge identical full keys only; distinct contexts still share one canonical word schedule (3.3). |
| Whole-book paging was described as fitting under a guaranteed rate budget | Actual pages derive from reviewed count; the shared limiter can return 429 and its honest failure/restart path remains required (2, 8). |
| Remaining content decisions could stall implementation or be silently invented | Keep C1-method/Canadian-usage review and real publication as separate owner gates. Use recorded synthetic omission decisions to test the pipeline; do not auto-import a frequency list or assert frequency proves a C1 label (14, kickoff plan). |
| Vocabulary overlaps the new grammar branch in unit/notebook/backup code | Implement on the accepted Grammar baseline and preserve topic `topicOrigin`/`topicQuestion`/`topicResult`, exercise reset tokens and the no-AI topic branch (kickoff plan). |

Code authorization does not authorize live corpus transmission, review marking, local data application or public distribution. The wordbook can be delivered as tested code with synthetic data while real-content gates remain pending; report those statuses separately. Likewise, a UI/control generator adding a new package is still a stop-and-ask event.

Follow [the joint kickoff plan](learning-implementation-kickoff.md). Its historical proposal used one full-stack writer at a time, Grammar acceptance first, Vocabulary integration second, and a combined regression gate; current verification follows section 12's conservative risk-based policy, not an automatic full-suite gate. No implementer/reviewer was launched for this documentation pass; no new external PASS, corpus audit or runtime validation is claimed.
