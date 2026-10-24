# Today: a short daily checklist for beginners

Status: T1 to T4 landed. Accepted by the owner (2026-10-24: Today is the landing page; step 3 always shown). Advisor-reviewed once. Steps are in `TASKS.md`.

## Why

The learning tools exist (graded readers, FSRS words, sound pairs, mistakes), but a zero-basis learner opens the app and sees the Library of imported articles. Nothing says what to do first today. Today answers one question: **what is worth doing now, and have I done it?**

Not a "session runner": no wizard, no timer, no streaks, no scores, no AI. A page of at most five steps; each is a link into a page that already exists, with a status read from data the learner has already produced.

## What it is

Route `#/today`, a new top-level item in `NavTree`. A pure function `buildTodayPlan(input)` in `src/services/today/plan.ts` turns plain inputs into an ordered list of steps; pure counters in `src/services/today/activity.ts` derive "done today"; a hook `useToday` gathers the inputs; `TodayPage` renders them. No new store, persisted field or setting.

The page itself needs no key and no content service, so `worksWithoutKey` includes `today` (it only controls the missing-key banner). Individual steps may still depend on a voice or a service; see their rows.

## Steps

In this order. A step is omitted, never faked, when its inputs say it does not apply.

| # | Step | Shown when | Status line (counts are real) | Opens | Done today when |
| --- | --- | --- | --- | --- | --- |
| 1 | Review words | `vocabularyQueue(...).candidates` is not empty | "N due, M new" where M = new candidates actually available (never just the daily limit) | `wordsReview` | at least one review today and the queue is now empty |
| 2 | Read | a reader of the merged catalogue is not completed | "Continue reader N" if opened, else "Start reader N" (first by `order` not completed) | `gradedReader` | any checked answer or completion today; then the line names the reader just worked on ("Continue reader N" while unfinished, "Reader N done" when completed today) |
| 3 | Sound pairs | always | "Practise a sound pair" | `speaking` | an attempt today on an item with `meta.source === 'minimal-pairs'` |
| 4 | Redo mistakes | `listMistakes()` has at least one entry with `resolved === false` | "N saved mistakes" (unresolved only) | `study/mistakes` | an attempt today on an item that has a mistake entry |
| 5 | Grammar topic | a content service is configured and an unstudied topic remains in the loaded list | "Next topic: {title}" (interface-language title of the first unstudied topic in book order) | `grammarTopic` | any topic was marked studied today (`at` in the local day) |

All shown steps done: "You are done for today". Step 3 keeps the page non-empty. The grammar step is service-gated: `useToday` makes no request at all without a configured service (the step is omitted, never faked), and while the list loads or fails the other four steps stand on their own; a load failure shows on the grammar step only, and when every topic is marked studied the step is omitted.

Honest limits:

- Step 3 listening plays through the voice chosen in Settings. The device voice is free; a provider voice needs its key. A failed clip shows its real reason on the control (existing behaviour); Today does not promise audio.
- With no content service there is no built-in wordbook: step 1 appears only when the learner has saved words (personal bookmarks, including words saved from readers). An empty queue hides the step.

Left out of v1:

- **Noun gender and conjugation drills.** Add as an extra step when a second reason appears.
- **Streaks, totals, "XP".** Derived numbers nobody asked for (`RULES.md`).
- **Return-to-Today after a step.** The learner uses the nav; Today refreshes through the existing subscriptions.

## Decisions

1. **Stateless.** All derived at render time. "Today" is the local calendar day; one `now` for every step, the vocabulary model's `now` (it already wakes at midnight).
2. **Existing data only.** Words: `rows[].history[].reviewedAt`. Readers: `ReaderProgress.answers[].checked.checkedAt`, `completedAt`. Practice: attempts via the `timestamp` index, with a local-midnight lower bound, not a full read. Sources and failures are separate: a read error shows on that step only and never becomes "0".
3. **Reuse, do not duplicate.**
   - Vocabulary: App owns the shared model (`App.tsx` `dueCount`); pass it to Today, do not call `useVocabulary` again. `useVocabularyBook` supplies the book for the queue.
   - Readers: `listReaderProgress()` only returns opened readers, so the next reader comes from the merged catalogue (`useGradedReaders` + `useReaderCatalogue`) joined with progress, the same list as `#/read/graded`. Extract the status logic at `GradedReadersPage.tsx:19` into a shared function; Today is its second caller.
   - Refresh: `subscribeExercises` and `subscribeReaders`.
4. **Landing.** Today becomes the default route for `''` and `#/` (owner agreed). T4 also touches `notFound` → `#/read`, the `|| '#/read'` fallbacks in `App.tsx`, the default for `keyRequest.returnTo`, and onboarding step 3's "toLibrary" exit label.
5. **Onboarding unchanged** unless T4 lands: step 3 still opens reader 1.
6. **Copy** in both locales; counts through i18next plurals.

## Tasks (each lands separately)

- T1 `plan.ts` + `activity.ts`: pure functions, unit tests for ordering, omission, local-midnight boundaries, done-today rules, the empty-queue and all-readers-complete cases.
- T2 `useToday` hook plus the extracted reader-status function; each source reports its own error.
- T3 `TodayPage`, route, nav item, copy, `worksWithoutKey`, `docs/architecture.md` and `CHANGELOG.md` lines.
- T4 Landing change and onboarding exit (only after the owner answers).

## Owner decisions (2026-10-24)

1. Today is the landing page (T4 is in scope).
2. Step 3 (Sound pairs) is always shown.
