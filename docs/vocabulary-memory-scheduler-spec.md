# Vocabulary memory scheduling

Implemented contract: one **FSRS-6** scheduler using exactly **ts-fsrs@5.4.2**. This supersedes the former scheduling/history/preferences portions of `vocabulary-flashcards-spec.md`; content, identity, card presentation, quota and read-only content-service contracts stay unchanged. Code completion is not permission to activate this breaking unreleased schema against real learner data.

## Outcomes and interaction

| Semantic outcome | Recall BEFORE flipping | Private library grade |
| --- | --- | --- |
| `forgot` | Could not recall the core meaning | Again1 |
| `fuzzy` | Recalled it, with hesitation or effort | Hard2 |
| `remembered` | Recalled it without that difficulty | Good3 |

Recognition only after revealing is Forgot. Easy is neither shown nor inferred. Keyboard1/2/3 are control positions, not persisted grades. There are no numeric q codes, old-model records, algorithm selectors or compatibility overloads.

Keep the two-sided paper card, natural clicks, selectable/scrollable prose, independent explicit Listen, native-key/IME/overlay guards and the equal bad/ink/ok circular controls. No visible Flip buttons, interval captions, extra answer headings or instruction dashboard. Brief meaning clarification belongs only in Settings → Words. Saving, reveal and review never automatically call AI, TTS or the network.

First reveal awaits the atomic row/snapshot/introduction/day-ledger commit before answer DOM mounts. It creates **New** memory with zero observations, not an invented Good. Later flips and Skip write no observations or quota. An introduced but unrated New remains a priority due card, never a second new introduction.

## One pure scheduling seam

`src/utils/srs.ts` owns:

- `initialVocabularySchedule(now)` → serialized empty FSRS Card;
- `vocabularyDue(schedule, now)` → the shared availability predicate;
- `nextVocabularySchedule(prior, outcome, reviewedAt, preferences)` → serialized library `next(...).card`;
- `VocabularyClockError` → invalid observation time or time before the previous review;
- `formatDate(date)` → device-local date label, also used by daily ledgers.

No storage, DOM, implicit clock, asynchronous initialization, optimizer, handwritten model formula or strategy framework lives here. Library Date/enum conversion is private. A fresh library instance per transition receives the explicit retention; there is no mutable shared scheduler/config cache. The static import is ready before any IndexedDB readwrite transaction opens.

Pinned internal policy (`fsrs6/ts-fsrs@5.4.2/policy1`): default21 weights, default target0.9, maximum interval36500days, fuzzfalse, short-termtrue, learning1m/10m, relearning10m. The package defaults are verified by tests. First New outcomes are1/6/10minutes; that is not a promise of those delays on every subsequent review. Rounded/capped outputs can coincide, and successful stability need not always strictly increase. The36500-day value is the library's parameter, not an application output clamp: published grade ordering can produce Good36501 at the cap edge; retain and validate that actual output.

References: [published tag](https://github.com/open-spaced-repetition/ts-fsrs/tree/v5.4.2), [Anki recall semantics](https://docs.ankiweb.net/studying.html), [FSRS settings](https://docs.ankiweb.net/deck-options.html#fsrs). Do not substitute the repository's unreleased package-v6/FSRS-7 API.

## Preferences and Settings

One owned `vocabularyPreferences` meta row:

```ts
{ newPerDay: number; retentionPercent: number }
```

Both are integers. Daily-new accepts0–100, default20;0 pauses new introductions, not reviews. Target retention accepts80–95%, step1%, default90. The scheduler alone maps the percentage to `request_retention = retentionPercent / 100`. This is a model target, not measured accuracy, an examination score or a guarantee; higher targets mean more review work.

`saveVocabularyPreferences(preferences)` replaces both values through the vocabulary storage owner. It is not an AppSettings/localStorage field. App owns one shared `useVocabulary` model, including readiness after its first successful read. Words Save cannot commit startup defaults before that read or while a read error is present.

SettingsPage owns two nullable text drafts. Null follows the latest saved value, including late initial loading; edited values survive section changes. Each save captures both submitted texts; completion clears each draft only if it still equals that submitted text. This preserves newer edits even after the section remounts. Errors/saving use the fixed local status slot/control. Book management remains intact.

Retention changes do not bulk-reschedule existing cards. Effective preferences are read inside each review transaction. An aborted operation retried after a preference change may use and log the new retention. An already committed operation returns without recalculation or preference reads.

## Persisted facts and audit

Shared content types import no FSRS runtime. Worker/book content and canonical identity are unchanged.

`VocabularySchedule` is a strict numeric object:

- `phase`: `new | learning | review | relearning`;
- `dueAt`: valid epoch milliseconds; `lastReviewedAt`: epoch milliseconds or null;
- `stability`, `difficulty`, `elapsedDays`, `scheduledDays`, `learningSteps`, `repetitions`, `lapses`.

New has null last review and zero model facts/counters. Other phases require a prior actual review, positive stability/repetitions, difficulty1–10 and consistent timestamps/counters. Library Card dates become numeric instants, never ISO strings/Date instances in learner storage or backups. There is no SM-2 ease/interval/dormant state. FSRS repetitions count observations, not the former scheduler's mature repetitions.

Review history contains only submitted observations:

```ts
{ operationId, outcome, reviewedAt, retentionPercent, prior, next, revision }
```

`reviewedAt` is the actual captured judgment instant, not retry/commit time. `retentionPercent` is the target actually used in that transaction, not measured recall. `prior`/`next` are validated schedules; the next lastReviewedAt matches the observation, and repetitions increase by one. Scheduler policy is bound once at backup level, not repeated per observation. No redundant opaque library log or manufactured historical observations are stored.

A confirmed ordinary per-card reset retains content, bookmark, introduction, history and day ledgers; it creates fresh New memory due now and increments row revision and the retained per-word reset token. It is not a review. Current memory validation uses only the row revision and latest history record: with no record or a row revision above the latest record, the schedule must be New; at the latest record's revision, the schedule must equal its next schedule. History revisions remain strictly increasing and cannot exceed the row revision; operation ids remain unique. An unintroduced row has revision0 and empty history. No historical reset segments are reconstructed or marked. Submitted-review counts remain `history.length`, not resets or mastery.

## Time, queue and durability

Store the library's due instant unchanged. New/Learning/Relearning require `dueAt <= now`. Review is available on the device-local calendar date of dueAt, including earlier than its original time of day. Timezone changes affect interpretation of due days, not saved instants. Do not alter model timestamps to implement presentation policy.

**Source-verified distinction from the design probe:** the package's exported `date_diff(..., 'days')` floors actual elapsed milliseconds/86400000. However, the published `AbstractScheduler.init`, used by `fsrs().next`, calls `dateDiffInDays`, counting **UTC calendar-date boundaries**. Consequently23 elapsed hours can count as one model day, and one minute across UTC midnight can add one model day. The next interval is nonlinear: that boundary can change it by more than one day, not at most one day. The default20 daily introductions do not bound this model effect. The wrapper passes actual instants unchanged and preserves that pinned behavior, not a guessed elapsed-ms override or FSRS-7 fractional-day claim. Tests cover both functions, DST and timezone examples. A future model/policy change needs a new explicit decision.

Queue order remains due intraday phases (including introduced New), local due-day reviews, quota-eligible personal new, then source-order unseen book entries. Preserve visit exclusions, unique daily introductions and already-ledgered recreation eligibility. No early look-ahead, review cap or hidden overdue backlog. App sidebar, Today and session counts share `vocabularyDue`; Browse maps all active non-Review phases to its existing Learning filter. Analytics counts bookmarks, introductions and actual history observations only. Wake at exact intraday due times, local midnight, focus/visibility return; do not pre-empt an active card.

On submission the review hook captures operationId, semantic outcome and a valid reviewedAt once, retaining all three on ordinary storage failure. Alternatives and Skip cannot replace pending work. A clock error clears the invalid pending observation, keeps the answer and shows localized guidance; a corrected fresh submission gets a new operation/time.

`rateVocabularyCard(key, originalTokens, operationId, outcome, reviewedAt)`:

1. Open the owned vocab/meta transaction and check original epoch/per-word token.
2. Read/validate the row. If the operation committed already, require the same outcome/time and return the current authoritative row without recalculation or replaying its old next schedule over newer work.
3. Otherwise require the original row revision, read effective preferences, calculate synchronously, append one observation/increment revision and write schedule/history together.
4. Publish change notifications only after commit.

Stale reset/delete/restore work is never retried with freshly adopted tokens. Reset/delete of wordA does not invalidate wordB. Native transaction aborts leave schedule/history/quota unchanged. A device clock before lastReviewedAt is an error, never a clamped elapsed time.

## Backup

Every new backup pairs `vocab` with:

```ts
vocabularyMeta: {
  schedulerPolicy: 'fsrs6/ts-fsrs@5.4.2/policy1',
  preferences: { newPerDay, retentionPercent },
  days: [{ date, introducedKeys }]
}
```

Raw paired inputs are validated before restore, including schedules/history/current-memory consistency, unique rows/days/keys and policy. Either vocabulary field alone rejects; both absent preserve vocabulary. A paired replacement touches only its rows, preference/day namespace and local epoch. It retains per-word token ledgers and unrelated exercise/topic metadata. There is no old backup decoder, migration, replay, bulk progress reset or mixed-model runtime. Removed row/history fields are rejected by strict schemas, not stripped; prior unreleased FSRS rows/backups containing them are intentionally incompatible. No real learner data is converted or deleted by this shape change.

## Verification boundary

Bun unit tests use invented content and fake IndexedDB. They cover published-library parity/nonmutation/determinism, all semantic outcomes/phases, mature retention direction, exact minute and local-day availability, actual pinned time behavior, clock recovery, immutable retry identity, quota/introduction, stale/reset/restore guards, strict backups/current-memory consistency/namespace isolation/native abort, ordinary and consecutive per-card resets, and Settings ranges/readiness/drafts/older saves.

Static/unit/i18n/shape/format/build checks plus actual Vite bundle delta and PWA precache inclusion are implementation evidence, not browser/offline or real-provider claims. No automatic browser gate: manual visual and actual study acceptance belong to the owner. No optimizer, raw weights/steps UI, new provider/backend, real corpus changes or real-data activation is included.
