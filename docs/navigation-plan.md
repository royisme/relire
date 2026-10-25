# Navigation plan: a flat tree with Words at the top level

Plan of record for the app's navigation and feature classification. Written 2026-10-25 by the lead after the owner's direction and an Opus (xhigh) design review. Nothing here is built. The full analysis, with `file:line` evidence, the persona paths and the rejected alternatives, is the Opus report kept locally at `.pi-runs/nav-design/design.md`; this file keeps the decisions, the design and the steps.

## Decisions

Owner, 2026-10-25: **"Follow the flat design"** and **"App.tsx can be split; componentisation and modularisation are part of the engineering."**

- No "My" area and no "My study" group. The sidebar mixed two axes (skill and ownership); a "My" area would mix them again (one look-back page, two action pages, one page that does not exist), and 我的 reads as account/profile in Chinese apps.
- **Words** becomes a top-level row, with the due badge on that row at every width. This is the main gain: today the due badge shows only on the expanded sidebar, inside My study.
- **Mistakes** becomes a top-level row with its own unresolved-count badge. Mistakes span four learning areas (`PRODUCT.md`), so it cannot sit under one skill.
- **Shadowing** becomes **Speaking → Recordings**.
- `App.tsx` is split first (step N0), because it is at 498 of the 500 lines `shape:check` allows and every later step would otherwise fail.
- This **reverses** `docs/learning-navigation-tasks.md` ("My study retains Words, Mistakes and Shadowing"); N3 adds a dated reversal line there and keeps the history.

Defaults the lead applies until the owner says otherwise (cheap to change; they only touch labels and one link):

- zh labels: **词汇** for Words (the page title already says 词汇), **概览** for the Words home tab (was "Today", which collided with the app's Today), **跟读录音** for Recordings.
- Recordings sit under Speaking (the log compares your voice with the reference, which is pronunciation); fallback Reading → Recordings.

Still the owner's, **not part of N0 to N3** (listed at the end): G1, G2, K1.

## The tree

Expanded sidebar (240 px), the rail (56 px, icons only, badges on the corner) and the phone drawer use the same rows.

```
Today
Reading        (children unchanged: Library, Graded readers, Exercises, Import article)
Words   [due]  (no sidebar children; the page draws Overview / All words / Map)
Grammar        (children unchanged)
Listening
Speaking       (children: Read aloud, Recordings)
Writing        (only with a saved writing unit, unchanged)
──────
Mistakes [open]
Progress
──────
Install app · Settings · About
```

10 to 12 rows, one more than now. Words gets no sidebar children because `VocabularyView` already draws Overview / All words / Map, and a sidebar copy would be the second set of page links that `DESIGN.md` forbids. Reading and Grammar draw both sets today; that exception is left alone (separate issue).

## Routes (no redirects: nothing has shipped)

| Old | New | Route name | Area |
| --- | --- | --- | --- |
| `#/study/words` | `#/words` | `words` | `words` |
| `#/study/words/all`, `/review`, `/play`, `/map` | `#/words/all`, `/review`, `/play`, `/map` | `wordsAll`, `wordsReview`, `wordsPlay`, `wordsMap` (names kept) | `words` |
| `#/study/mistakes` | `#/mistakes` | `mistakes` | `mistakes` |
| `#/study/shadowing` | `#/speaking/recordings` | `recordings` | `speaking` |
| `#/study` | removed (not found) | removed | none |

`STUDY_TABS`, `StudyTab`, `StudyView` and the `study` area are deleted in N3. Old `#/study/*` addresses in the owner's browser history show not found; acceptable before release.

## Labels

| Row | en | zh |
| --- | --- | --- |
| Words (nav row, page title) | Words | 词汇 (also align `settings.sections.words.title` and `today.practice.words`, now 生词) |
| Words home tab (was Today) | Overview | 概览 |
| Speaking → Recordings (was Shadowing) | Recordings | 跟读录音 |
| Mistakes, Progress | unchanged | 错题本, 进度 |

`learning.shadowingContext` becomes "…Find them under Speaking → Recordings." / "…录音保存在“口语 → 跟读录音”。".

## Badge rules (written into `DESIGN.md` in N1; a worker must not "fix" them)

1. Words counts cards **due now** in learner rows (`App.tsx` `dueCount`). New cards never count, so it can differ from Today's "due · new".
2. Mistakes counts unresolved items.
3. Each count sits on its own top-level row at every width: row end when expanded and in the drawer, corner on the rail. Zero shows nothing.
4. Never a sum, a count on a parent or group, on the header or on the menu button, or a dot that stands for "something".
5. No badge on Recordings, Progress, Reading or Grammar.

Restated rail rule for `DESIGN.md` Navigation: *a row that owns one metric shows it as a corner badge; no row ever shows a combined count.*

## Steps

Each step is worker-sized and independently mergeable with all checks green (`typecheck`, `lint`, `test`, `i18n:check`, `format:check` including the 500-line shape limit, `build`, and `impeccable detect` printing `[]` for UI). Order: **N0 → N1 → N2 → N3**. The lead re-runs every check and reads each diff before merging; each diff gets a second-model read-only review (`gpt-6-astra` or Opus), and the lead reports e2e as "not run".

### N0. Split `App.tsx` (pure refactor, no behaviour change)

Goal: App shrinks well under 500 lines and later steps add routes without touching its size. Candidate seams (the worker confirms them against the code and keeps the smallest set that works):

- **App data hook** (`useAppData`): `ready`, `loadError`, `articles`, `stats`, `failedSaves`, `reportSave`, the `initializeData` effect, `usePersist('stats')`, the onboarding flag.
- **Shell** (`AppShell`): the `Header` / `Sidebar` / content-column layout with the save-failed and missing-key banners (each a small component) and `PageContentBoundary`, taking the route view as children.
- **Route view** (`AppRoutes`, or one small file per area such as reading, grammar, practice): the `route.name` to page switch, including the `LearningNavigation` strips and the reader branches.
- Reader lookup wiring (`useLookupSheets`, bookmark, word/sentence sheets, `handleRecordAssessmentComplete`) stays together in one hook or component so it does not scatter.

Acceptance: identical markup and behaviour (existing tests unchanged and green; add none that only restate the move); `wc -l` of every touched file ≤ 500, with App well below; each new file has a header comment naming what it owns; no new dependency, no new abstraction with a single caller beyond the seams above; protected review/scheduler files untouched.

### N1. Words at the top level

- `routes.ts`: `words` route and `#/words…` hrefs and parse; `Area` gains `words`; `STUDY_TABS = ['shadowing','mistakes']`; `#/study` defaults to mistakes; `vocabularyPlaceOf` `today` → `home`.
- `NavTree.tsx`: Words in `links` with `badge={dueCount}` and its `nav.due` label; Words removed from the study children. `StudyView` drops the words tab; App renders `VocabularyView` directly for the words routes.
- Callers: `VocabularyView.tsx`, `VocabularyReview.tsx`, `RunEnd.tsx`, `VocabularyRun.tsx`, `TodayView.tsx`; `useRoute.ts` comment.
- Locale: Words label, `vocab.today` → Overview / 概览.
- Tests: `routes.test.ts` (round trips, `#/study/words` is not found, `areaOf`), `navBadges.test.tsx` (due badge on the top-level row **expanded and rail**, no count on My study), `learningNavigation.test.tsx` (Words has no sidebar children), `todayView.test.tsx`, the vocabulary tests that build words hrefs, `onboardingReader.test.tsx` (banner still shows on `#/words`).
- e2e (typechecked, not run): `importNavigation.spec.ts:85` and the `study/words` hash users (`vocabulary*.spec.ts`, `shell.spec.ts`, `study-navigation.spec.ts`, `practice-*.spec.ts`, `conjugation.spec.ts`).
- Docs: `PRODUCT.md` Screens, `DESIGN.md` (Navigation, badge rules, Words Overview), `docs/architecture.md` (route table, which already lacks `play` and `map`), `.claude/rules/ui.md`, CHANGELOG.

### N2. Mistakes at the top level

`mistakes` route and area; Mistakes row with the unresolved badge before Progress; `MistakeNotebook` owns its page wrapper; `GenderGame.tsx` and `TodayCard.tsx` links; `STUDY_TABS = ['shadowing']` for one interim step. Tests: routes, badges (own row on rail and expanded, Words and Mistakes never summed), `todayView`, `nounGenderRound`. e2e: `mistakes.spec.ts`, `grammar-crosslinks.spec.ts`, `grammar-topic-learning.spec.ts`, `reverse-lookup-callers.spec.ts`. Docs: `PRODUCT.md`, `DESIGN.md`, `architecture.md`, CHANGELOG.

### N3. Recordings under Speaking; delete My study

`recordings` route in the `speaking` area; delete `study`, `STUDY_TABS`, `StudyTab`, `StudyView.tsx` and the study block in `NavTree`; Speaking children are Read aloud and Recordings; `ShadowingLog` owns its page wrapper and a back link to Speaking; `SpeakingPage` links to Recordings instead of the copy-only pointer; the reader's "open log" navigations; locale (`learning.shadowingContext`; remove `nav.vocab`, `study.label`, `study.words`, `study.shadowing`); stale comments. Tests: routes, `learningNavigation` (Speaking children, no My study), `navBadges` header and My study assertions removed. e2e: rewrite or delete `study-navigation.spec.ts`; `shadowing*.spec.ts`, `passage-shadowing.spec.ts`, `shell.spec.ts`. Docs: `PRODUCT.md`, `DESIGN.md`, `architecture.md` (`:40`, route table, shell layout, shadowing data flow), `ui.md`, `README.md`, `docs/roadmap.md`, `docs/grammar-pack.md`, a dated reversal line in `learning-navigation-tasks.md`, CHANGELOG. Leave older dated records (`merge-plan`, `merge-progress`, `shadowing-log-design`, `graded-readers-trial`, `today-plan`) as history.

## Risks

- **`App.tsx` size.** N0 exists for this; a worker reads `wc -l` before committing.
- **e2e is typechecked but never run.** A typed `navigate({ name: 'study' … })` breaks `typecheck`; hash strings and label selectors go stale silently. Grep `study/|My study|tab: '` in `e2e/` at each step.
- **The rail badge rule** in `DESIGN.md` and `tests/navBadges.test.tsx` must be restated in N1, or a reviewer will flag the new corner badge.
- **Sticky highlight.** `areaOf` maps `words*` → `words`, `mistakes` → `mistakes`, `recordings` → `speaking`; the reader's "open log" now moves the highlight from Reading to Speaking.
- **i18n.** Removed `study.*` and `nav.vocab` keys must leave no reference; every new key exists in both locales.
- **Interim states.** After N2 My study has one tab; N3 follows promptly.
- **Badge sources stay separate:** `dueCount` from `App` through Header and Sidebar, the Mistakes count from `useMistakes` in `NavTree`. Do not merge them.

## Owner-gated, not in these steps

- **G1:** Today shows one line, "N days until your exam" (`useToday` reads `appSettings.vocabularyGoal`). Reverses `DESIGN.md` ("no … goal" on Today) and `docs/vocab-game-plan.md` 5b item 1.
- **G2:** allow an exam date without a words target (`matureTarget` optional; unreleased shape change).
- **K1:** Words without the missing-key banner (reverses `tests/onboardingReader.test.tsx`).
- **Refused:** per-skill weekly quotas, "on track" labels, projections, bars or rings, streaks, a "My goal" page, a screen for the run log.
- **Separate issues, not here:** the Reading row opens the Library, which is empty for a zero-level learner (graded readers first?); Reading and Grammar draw two sets of page links; Sound pairs appears under both Listening and Speaking.
