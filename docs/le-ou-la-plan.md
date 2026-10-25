# Le ou la: a noun-gender round (prototype)

Plan of record for the first learning-game prototype. Written 2026-10-24 on the owner's go-ahead ("do the Le ou la prototype") after `docs/learning-games-plan.md` (section 3.1 and 5). It is a **prototype with kill criteria**: one question, answered by the owner's own use. Not reviewed before the build; its diff gets a review (gpt-6-astra).

## The question

Does one card at a time, answered with one key, with a missed card coming back in the same round, help more than the existing eight-row gender sheet (`GenderDrillForm`)? Kill it if, after a week of the owner's use, it is no better than the sheet or the saved sets clutter more than they help.

## Decisions taken (the defaults of `docs/learning-games-plan.md` section 6; the owner can change any)

1. **FSRS:** a game never rates or introduces a word card (`PRODUCT.md`: review outcomes are the learner's own recall report). It records into Mistakes only.
2. **Saved sets:** each round saves one ordinary `GENDER_CHECK` set (like the sheet); the clutter is part of what the prototype tests.
3. **Today:** not touched.
4. **Data:** only the owner-reviewed noun-gender pack (337 nouns, 17 rules). No lexicon nouns.
5. **In-round retries:** a missed card returns later in the same round; only the **first** answer to a card is recorded; there is no Redo in a round.
6. **Placement:** on Grammar → Gender (`#/grammar/gender`), no new route and no sidebar entry.

## Facts (read 2026-10-24)

- `src/services/exercises/fromGender.ts` `prepareGenderDrills({ pack, count, level, rng, makeId, now, t })` returns one `GENDER_CHECK` unit (`learningArea: 'grammar'`, tag `gender-number`); each item has `id` = the noun id, `prompt` = the bare lemma, `expectedAnswer` `'M'` or `'F'`, and `meta` holding the matching rule (`rules: [{ id, percent, n }]`) and `exception`. `DEFAULT_GENDER_COUNT` is 8.
- `src/components/practice/controls/GenderCheckControl.tsx` is the sheet's control: answer shape `{ singleAnswer: 'M' | 'F' }`; labels `practice.genderMasculine` / `practice.genderFeminine`; feedback via `nounGenderDrillMeta(item.meta)`, `tendencyPercent(rule.percent)` and the keys `nounGender.ruleLine` ({ rule, percent, n }) and `nounGender.exception`, with `nounGender.rules.<id>` names.
- Persistence path (verified): `saveUnits(units)`, `getResetToken(unitId)` (read once when work starts), `gradeUnitItem(unit, item, answer, practiceGrading())` in `src/hooks/exerciseUnit/actions.ts`, then `checkItem({ unitId, itemId, resetToken, answer, result: { correct, strictAccents } })`. `checkItem` returns the existing state without writing when the item is already checked (`created: false`), so a returning card writes nothing. `useUnitSaver` (`src/hooks/useUnitSaver.ts`) keeps a failed payload for retry.
- `GenderPage.tsx` renders the reference and `GenderDrillForm` inside `min-h-96`; the drill form's result slot is a fixed `h-16`.
- Keyboard pattern to follow: `VocabularyReview.tsx` (keys 1/2/3, guards against `event.repeat`, held keys, IME composition (`isComposing`, `keyCode 229`), open overlays, and targets that are inputs or other buttons).
- `DESIGN.md`: calm, app-like; no edge bars, stripes, rails, tints, hero rings or decorative icons beside titles; controls never move the page; right and wrong never by colour alone.

## Design

**Pure deck** `src/services/nounGender/deck.ts`: a small immutable state machine over item ids, no React, no storage. `createDeck(ids)`; `currentOf(deck)`; `answer(deck, id, correct)` returns the next deck: the first answer to a card records `firstTry[id] = correct`; a correct answer removes the card from the queue; a wrong one moves it to the end of the queue (also when it is a returning card); the round is done when the queue is empty; `summaryOf(deck)` gives `{ total, firstTryRight }`. Also a function telling whether an id has been answered before (so the caller knows whether to call `checkItem`).

**View** `src/components/study/grammar/GenderGame.tsx`: starts a round on mount of the "playing" state:
1. `prepareGenderDrills({ pack, count: 12, t })`, `saveUnits`, `getResetToken(unit.id)` (use `useUnitSaver` for the save so a failure keeps the same payload and shows its real error with Retry); while saving the card area shows the existing loading text.
2. One card: the bare lemma in serif (`lang="fr"`), two choice buttons labelled `le` and `la` (visible key hints `1` and `2`; `←` and `→` also pick); focus starts on the first choice; each new card moves focus back to it.
3. On a pick: judge locally with `gradeUnitItem` (deterministic). If this is the card's **first** answer, call `checkItem` once (no Redo ever); if it is a returning card, write nothing. A `checkItem` failure shows its real message in the feedback slot with a Retry for the same pick, and the deck does not advance until it succeeds.
4. Feedback slot, fixed height reserved from the start (same idea as the drill form's `h-16`; size it for three lines at 360 px): a mark with a text label ("Right" / "Not quite", never colour alone), the noun with its article (`la maison`, `le livre`), then the existing rule line (`nounGender.ruleLine`) or the exception line (`nounGender.exception`). One `aria-live="polite"` region. A **Next** button sits in the same fixed row as the choices (the choices are disabled after the answer; Next is enabled and focused); Enter, Space or `→` also advance. Nothing moves the page.
5. A missed card is appended to the queue and shown again later; the card counter is plain `.tnum` text ("5 of 12": cards answered correctly so far).
6. End of round: "12 nouns, 9 right on the first try" (plain counts), one honest line that with two choices guessing alone gets about half right, a link to Mistakes, a link to the rules on this page (scroll anchor is not needed: the reference is below), and two buttons: Play again (a new unit) and Back (return to the page). An "End round" control is available during the round; an abandoned round leaves its set with unchecked items (accepted for the prototype).
7. Keys (document-level `keydown`, only while the game is mounted): `1`/`←` = le, `2`/`→` = la, Enter/Space = Next; ignore `event.repeat`, held keys, IME composition, and targets that are inputs, other buttons or inside an open dialog; clear held keys on `blur`.

**Page** `GenderPage.tsx`: a `Play a round` button in a row above the drill form; pressing it switches the body (below the header) to `GenderGame` in place (state in the page, no route); Back returns to the reference. The reference and the sheet's drill form are unchanged.

**Copy** in `en.json` and `zh.json` under `nounGender.game.*` (title, play, end round, le, la, next, right, not quite, the counter, the summary with counts, the chance line, play again, back, links, saving). The French nouns and articles are data, never inside a translated string. Reuse `practice.genderMasculine`/`practice.genderFeminine` for accessible names if suitable.

## Tests (static and unit only; no browser)

- `tests/nounGenderDeck.test.ts`: the deck: ordering, a miss goes to the end, a returning card answered right leaves the queue, first-try bookkeeping is never overwritten by a later answer, done state, summary counts, the seeded sampling stays in `prepareGenderDrills` (not re-tested).
- A persistence test following the repo's existing exercise-storage test setup: a round's unit is saved as a `GENDER_CHECK` unit with 12 items; a wrong first answer writes one attempt and appears as an open mistake; answering the same card right later writes no second attempt (`created: false`) and the mistake stays open; no Redo is called.
- A render test (server render, the repo's approach) of the first card: the bare lemma, both choices with their key hints, the reserved feedback slot, the counter, and no French inside the translated strings; plus the end screen counts. Key handling is covered by testing a small pure function for the guards (repeat, composition, target kinds) if one is extracted; do not mock the DOM at length.

## Scope

New: `src/services/nounGender/deck.ts`, `src/components/study/grammar/GenderGame.tsx`, the tests above. Edited: `src/components/study/grammar/GenderPage.tsx`, `src/i18n/locales/en.json`, `zh.json`. Not touched: the sheet's control, `fromGender.ts`, storage, Today, FSRS, the sidebar, routes, dependencies. Docs, `CHANGELOG.md`, `TASKS.md`, `PROGRESS.md` and the `docs/architecture.md` row are the lead's.

## What the owner measures by hand

Over a week, without analytics: does the owner choose this over the sheet unprompted; do the misses in Mistakes still look the same a day later; is the ending line read or skipped; does 12 cards feel right; how many sets pile up in Grammar → Exercises. Kill criteria above.
