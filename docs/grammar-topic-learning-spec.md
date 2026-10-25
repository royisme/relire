# Grammar topic learning: Chapter One specification

Status: **Proposed for owner sign-off; not implemented.**

Source baseline: `2937d25`. Gemini 4 Argon produced a read-only advisory specification at the owner's request on 2026-10-19. The lead checked its recommendations against the source and corrected the design tokens, exercise shapes, storage lifetimes, cache behavior, paths and verification commands. This document, not the unedited advisory output, is the proposed implementation contract.

Revised 2026-10-19 after the owner's review: per-question skip and reference-use tracking are removed, the saved unit is created lazily on the first answer, the content objectives follow the C1 ceiling of `scripts/grammar-topics/prompt.txt`, and choice feedback is required per wrong option. Joint readiness check at `517ba2d`: application/storage/pipeline files still match baseline `2937d25`; documentation has changed. The final readiness feedback is in section 13, with sequencing in [the joint kickoff plan](learning-implementation-kickoff.md).

Authority: [DESIGN.md](../DESIGN.md), [conventions](conventions.md), [architecture](architecture.md), [grammar pack Part 2](grammar-pack.md#part-2-grammar-topics-pack-a1-first-design-for-review) and the [hosted-content ADR](adr-hosted-content-service.md). Nothing below changes their approved scope yet.

## 1. Outcome and boundary

Help A1 learners using the Chinese or English interface understand a distinction, retrieve a form and apply it in another short context. Grammar should not be a long wiki article with an unrelated worksheet button. The visual identity remains the Quiet Reading Room: warm paper, serif French, restrained interface text, headings and rules rather than nested cards.

Recommended pilot:

- Only `noun-gender-feminine` and `noun-plurals` in Chapter One.
- Three checkpoints of two questions per topic: twelve independently reviewed questions total. This is a content budget, not evidence of complete coverage or mastery.
- One active question at a time: a compact teaching slice, recognition, then constrained typed production in a fresh context. Correctness never locks navigation or reference access.
- Only `CHOICE_SELECT` with one inline group and `FILL_BLANKS` with one blank. These two existing types cover this pilot; no new exercise type is needed.
- Authored bilingual feedback and deterministic accent-sensitive checking. No runtime AI generation, grading, hints, explanations, lookup, speech or recording in the topic-learning flow, including its saved Practice and Mistakes entry points.
- One saved exercise snapshot and one session per topic exercise revision, created on the learner's first answer and reused from Grammar, Practice and Mistakes. No second history store.

Part 2 T1 currently says **“no exercises generated from topics.”** Approval would replace that clause with **“allow offline-authored and reviewed topic checkpoints; no runtime AI generation or grading.”** It would not enable on-demand AI worksheets or change the Worker's read-only boundary.

Not building: all remaining chapters, a generic course engine, accounts, another endpoint, a provider, a dependency, a database store or migration, automatic scheduling, topic SRS, streaks, mastery percentages, per-question skip or reference-use tracking, listening, sentence ordering or a conjugation redesign. Existing worksheets retain their current features.

## 2. Places, entry and navigation

Use existing routes through `routeHref` and `shell/Link`, not manually concatenated addresses. Addresses below follow the owner-approved learning-navigation amendment; historical uses of saved Practice refer to the same shared exercise workspace under Grammar, not a separate top-level area:

| Place | Proposed behavior |
| --- | --- |
| `#/grammar` | Existing chapter/topic list. No new progress query or list badges in the pilot; opening the topic shows its actual progress. |
| `#/grammar/topics/:topicId` | Primary teaching-and-question experience for a topic with `learning`; reference-only topics keep their existing reader. |
| `#/grammar/exercises` | Once the learner has answered, the saved topic revision appears as an ordinary saved set with its localized topic title and real item counts. |
| `#/grammar/exercises/set/:setId` | Existing set table; each topic revision is a one-unit set, not a global cross-level topic collection. |
| `#/grammar/exercises/unit/:unitId` | Opens that exact saved revision with the same question workbench and authored feedback, without fetching the topic. Includes an explicitly optional link to the current topic reference. |
| `#/mistakes` | Retry opens the original saved unit, never today's replacement question. A deleted unit retains readable attempts but loses its retry link. |

### Start and resume

Opening a topic containing `learning` performs no **exercise-store writes**. Map the topic to its prepared unit in memory (a pure function with the preparation timestamp supplied by its caller) and look up the deterministic unit id. Always read/capture its reset token, including when no stored unit exists. A stored snapshot owns the session; otherwise use the prepared unit and empty working state. The first draft write or check calls the guarded `ensureTopicUnit` before writing, so Practice gains a saved entry only after answer input. Normal validated content-cache writes may still occur during fetch; read-only browsing means no new units/item states/attempts, not a disabled content cache.

After the unit loads, select the first unchecked question; if all are checked, select the first question for result review. Question selection is transient local state, not a new route or persisted course cursor. Reload restores durable drafts and results, then applies this selection rule.

Show a compact index of six 40px question buttons in two groups of three on a 360px phone; each has a localized accessible name containing its checkpoint, question number and state. Use `aria-current="step"` on the selected question. These are local task selectors, not destination links or a new tab system. Unchecked, right and wrong differ by text or icons as well as color.

All six are selectable at any time, so there is no Skip control: moving to another question without checking is how a learner leaves one unanswered, and nothing about it is recorded. Previous moves one position back; after a check, the primary control moves one position forward. Neither requires success. Checking does **not** automatically advance: the learner has time to read the explanation.

### Teaching and reference

Each checkpoint owns a short authored teaching slice: one distinction and at most two illustrative examples, not an entire reference table. It stays visible for its two questions. Question two uses a new context rather than blanking the immediately preceding example.

The full reference remains freely available in one existing `Collapsible` below the workbench. Keep it closed initially. Opening it has no stored state: the learner may consult it at any time and nothing is recorded about it.

No separate hint system, quick-reference index mapping or answer-revealing cue is needed in this pilot. Initial teaching is part of learning, not a claim of independent assessment. The UI cannot detect outside help or previous exposure, so the pilot shows no “unaided” label and makes no claim of independent recall.

### Completion and retry

Always reserve a summary row: initially “0 of 6 checked”; after six checks, “6 checked, 5 right” using actual current results. Offer final-result review through the same six selectors, not a new results route.

Redo clears only the selected question's working answer and result; it keeps every historical attempt. Reset asks confirmation and clears all six working states while keeping history. Both are immediate repetition, not a delayed memory test. No new timer or self-rating is introduced.

## 3. Composition and visual contract

The existing shell is unchanged: a 56px header, a 56px sidebar rail or 240px expanded sidebar from the documented breakpoints, and a phone drawer below `md`. Do not add top navigation, chapter trees or another sidebar.

Desktop structure inside the existing content column:

```text
Back to topics
Topic title                                      A1
0 of 6 checked, 0 right              [Reset answers]
---------------------------------------------------
Checkpoint title
Short teaching slice and examples (readable measure)

[1] [2] [3] [4] [5] [6]       Question 1 of 6
Bilingual task instruction
French sentence with inline choices or one blank

Fixed local result region:
  status + [Read feedback]
  expected answer after a wrong check + short feedback

[Previous] [Redo] [Check / Next]
---------------------------------------------------
[Full reference disclosure]
Full prose and wide tables when explicitly expanded
```

At 360px, use 16px gutters and a single column. The task index wraps into two rows; the action area is one permanently allocated row of three 40px controls, the same on desktop. Title, instruction and French prompt wrap naturally. No horizontal document overflow; only `ui/table` scrolls sideways when necessary. Both the compact teaching slice and expanded full reference use normal page-level vertical scrolling.

### Tokens and primitives

| Element | Contract |
| --- | --- |
| Page and structure | Existing `surface`, `ink-200` rules and `ink-*` text. One flat page surface; no nested question card, rest shadow, gradient, glass or decorative emoji. |
| Topic title | `font-serif text-2xl font-semibold`, matching Source Serif 4 and the existing Chinese serif fallbacks. |
| Checkpoint heading | Serif 16–18px, semibold. Sentence case; no uppercase eyebrow, tracking or bold heading. |
| French prompt | Existing exercise serif 18px treatment. Teaching prose retains `TopicBlocks` typography and readable `max-w-prose`; do not apply large article reading settings to UI labels. |
| UI and feedback | Public Sans/system CJK, 14px body; 12px metadata minimum. `.tnum` for counts. No new font. |
| Selection | `accent-100` with `text-accent-900`; blue means action or selected. |
| Result | Correct: `ok-800`; wrong: `bad-700`, plus explicit words/icons. |
| Controls | Existing `ui/button`; 40px targets throughout this flow, `rounded-md`, global focus ring. One filled action: Check while editing, Next after a check. Other actions outline/ghost. |
| Spacing | 16px between related groups, 24px between major sections, 12px between controls where available; existing phone 16px and `sm` 24px page gutters. |
| Reference | Existing `ui/collapsible` and `TopicBlocks`; prose readable, tables full content width. |
| Long feedback/error | Existing responsive `Sheet` and `OverlayHeader`: bottom on phones, side from `md` (768px), scrollable body. Use actual component dimensions, not a new 640px breakpoint. |
| Accent input | Reuse the existing floating `practice/CharacterBar`, once per workbench. It stays above the software keyboard and inserts at the bound cursor without stealing focus; do not replace it with an inline alphabet row. |

### Stable transient states

Keep Previous and Redo mounted in fixed cells, disabling unavailable actions rather than adding/removing controls. The third cell always exists: Check becomes Next after a successful committed check. At the last question it remains mounted as disabled Next. Reset and the summary slot are present from the outset; Reset is disabled without working state.

Reserve one local `h-32` result region from first render. It contains the status text, a permanently allocated feedback action, and a bounded text body for the expected answer after a wrong check, the authored summary or a real error. Authoring keeps each summary to one short sentence, so the body's own scroll is a rare fallback rather than a layout. This height is a proposed **local status slot**, not a fixed-height topic reader. At normal size, reviewed summaries should fit without scrolling; at text zoom or with long error details, all text remains reachable rather than line-clamped. Longer authored detail opens in a Sheet. Do not grow the slot on check, show an expanding banner, or silently clip a translation.

Existing exercise controls append `ExpectedBeside` after a wrong answer, which can reflow the prompt. Topic use must put the correction in the reserved result region instead. Add one real-caller presentation choice to the shared control interface (proposed `correctionPlacement: 'inline' | 'feedback'`, default inline for worksheets); the two pilot controls use feedback placement here. Prompt and answer geometry must remain stable across a check.

Busy state swaps the Check icon in place; no assumed storage duration or guaranteed instant success. A failed save leaves the draft editable and shows the real reason in the existing region, with details available in the Sheet.

Explicitly changing questions, opening the full reference, or opening a Sheet is intentional navigation/disclosure, not a transient status change. A question change may change content height. Preserve the workbench heading as a visible anchor when switching checkpoints, using non-animated nearest scrolling only when it would otherwise be offscreen; do not scroll on check or each keystroke.

### Keyboard and accessibility

- Reuse the control registration interface. Controls render and report input; the workbench owns Enter, checking and persistence.
- Enter in the sole typed blank checks a nonblank answer. IME composition (`isComposing` or key code 229) must never check. A checked input stays read-only and focusable; Enter in it does not unexpectedly advance.
- Choice buttons retain their existing selection behavior, focus and pressed labels; selecting an option never checks automatically. Native Enter/Space activates the focused button, not a bubbling page-level submit handler.
- On explicit question navigation, focus the new instruction heading with `tabIndex=-1`; let the learner Tab into its control. Do not steal focus after a check or language switch.
- Connect status with `aria-describedby`; announce the short verdict/save failure via a polite status region. Do not make the entire long explanation a repeating live region.
- Sheet close/Escape returns focus to its opener. Exercise, reference and feedback text in this flow are plain text/limited `InlineMarkup`, not lookup buttons. Hidden answers must not leak through accessibility labels or attributes.
- All states work in light, sepia and dark. Use existing overlay animation only; respect reduced motion. No stepper animation, bounce or progress celebration.

## 4. Proposed content contract

These names describe additions, not APIs already implemented. Use Zod at the private draft, service response, unit save and backup boundaries. Keep the existing reference block union unchanged.

```text
GrammarTopic.learning?: {
  instruction: Bilingual,
  checkpoints: [Checkpoint, Checkpoint, Checkpoint]
}

Checkpoint = {
  id: slug,
  title: Bilingual,
  teaching: TopicBlock[],
  questions: [Question, Question]
}

Question = {
  id: slug,
  type: 'CHOICE_SELECT' | 'FILL_BLANKS',
  instruction: Bilingual,
  prompt: FrenchText,
  expectedAnswer: string,
  acceptableAnswers?: string[],
  feedback: {
    correct: FeedbackMessage,
    incorrect: FeedbackMessage,
    byAnswer?: [{ answer: string, message: FeedbackMessage }]   // required for CHOICE_SELECT, see 2
  }
}

FeedbackMessage = { summary: Bilingual, detail?: Bilingual }
Bilingual = { en: nonblank string, zh: nonblank string }
```

`teaching` contains the actual compact teaching blocks, not positional pointers into a mutable long reference. This deliberately separates the task's teaching payload from unrelated reference edits and removes fragile block-index wiring. Some private teaching text is duplicated, but there is no public content duplication or new content store.

Validation invariants:

1. `learning` is optional, never an empty placeholder. If present in this pilot, it has exactly three uniquely identified checkpoints and six globally unique question ids. First question per checkpoint is recognition; second is typed production.
2. `CHOICE_SELECT` uses exactly one existing **`{a|b|c}`** group, with distinct nonblank French options. The expected scalar answer must equal an option. No invented options-only variant or `[a|b]` syntax. `byAnswer` is required for `CHOICE_SELECT`, with exactly one reviewed entry per wrong option, and optional for `FILL_BLANKS`, where `incorrect` is the fallback.
3. `FILL_BLANKS` contains exactly one **`[___]`** and a scalar expected answer. `acceptableAnswers` is allowed only for this typed scalar path, not for choice groups or multiple slots. The instruction says whether to include an article. No unconstrained multiple-correct-answer writing task.
4. Map a complete `ExerciseItem` before invoking `refineExerciseItem`; include id, type, itemNumber, prompt, expectedAnswer and grammarTag. Validate the whole `ExerciseUnitSchema` too. A schema fragment with missing required fields is not adequate validation.
5. All pilot items map `meta.strictAccents: true`; existing `effectiveStrictAccents`, `normalizeFrench` and `gradeUnitItem` remain the grading authority. Expected and acceptable forms must be distinct after the same strict normalization. Do not introduce another normalizer.
6. Every instruction and feedback message has both languages. Extend the existing topic string scan to all new content, including the unkeyed French prompt/answer fields: NFC, no Han in French/English, Han in Chinese prose, French typographic apostrophes. Render text, never raw HTML.
7. Duplicate normalized feedback-match answers are invalid; choice feedback must correspond to a wrong available option. A typed fallback explanation describes the distinction without pretending to know the learner's reasoning.
8. Linguistic correctness, useful distractors, taught-before-tested exceptions, and absence of answer leakage require independent review. Regexes cannot prove these. Questions test only the rules and tendencies the topic teaches within the C1 ceiling: a rare exception, an isolated lexical pair or a contested form is never tested, and the generation prompt already omits them. A prompt may legitimately contain a matching substring or a grammatical article; do not reject it using an indiscriminate expected-answer substring search.

Before checking, do not render the expected answer, acceptable-answer list or feedback in the DOM, accessible text, tooltips or `data-*` attributes. Correct choice options necessarily appear among the options; the invariant is **no indication of which option is correct**, not “the correct option string is absent.” No gender-coded color/article/agreement should give away a question whose target is gender. There is no hidden IPA/audio channel in this pilot. Explicitly opening the reference may reveal an answer; that is allowed and records nothing.

## 5. Revision identity and saved unit mapping

Add a pure canonical serializer beside the topic mapper. Its payload is `{ topicId, level, tags, title, learning }`; exclude full reference `blocks`, related-topic links, provenance and review timestamps. Recursively sort object keys using code-point comparison, preserve array order and string content, then `JSON.stringify` the validated payload. Do not use locale-dependent ordering.

The browser computes SHA-256 over its UTF-8 bytes using `crypto.subtle.digest`, before starting the storage transaction; use the full 64-character lowercase hex digest as `exerciseRevision`. Build tooling uses the same serialized bytes with Node crypto. Cross-environment fixtures assert identical hashes. No hash is computed during React render or awaited inside an IndexedDB transaction. No new delivered `exerciseRevision` field or asynchronous Zod refinement is necessary.

Changing question wording, order, instructions, accepted answers, feedback, compact teaching, title, level or tags starts a new exercise revision. Editing unrelated full-reference prose does not. Even a feedback typo starts a fresh revision: conservative and simple, with no per-item history merging.

Proposed mapping:

| Stored field | Value |
| --- | --- |
| `id` | `topic:<topicId>:<full exerciseRevision>` |
| `setId` | Same deterministic identity, one unit per revision/set. This avoids mixed levels and misleading shared batch dates in a global set. |
| `learningArea` | Explicit `grammar`, also snapshotted on every attempt; no type/section inference. |
| `section`, `unitNumber` | `GRAMMAIRE`, `1` |
| `type` | `FILL_BLANKS` as the required unit default; every item explicitly overrides its type. Mixed items are already supported. |
| `title`, `instruction` | English values of the topic title and authored `learning.instruction`, satisfying existing required string fields. Topic-aware consumers use the bilingual metadata below, not these strings as a language fallback. |
| `level`, `grammarTags` | Topic level and tags. Each item's `grammarTag` is the first topic tag. |
| `createdAt` | The caller captures a timestamp once and passes it into the pure mapper. The first successful insert owns it; reopening or language switching never rewrites it. |
| `items` | Six items in checkpoint/question order, `itemNumber` 1–6, `id` from the authored globally unique question id, each fully validated. |
| `topicOrigin` **(new)** | `{ topicId, exerciseRevision, title: Bilingual, instruction: Bilingual }` |
| `items[].topicQuestion` **(new)** | `{ checkpointId, checkpointTitle: Bilingual, instruction: Bilingual, feedback }` |

Do not put a monolingual copy in `item.explanation`, set `answerSource: 'material'` for model-authored content, or invent `grammarFocus`/`unitIndex` fields. Ordinary worksheet string fields remain real supported contracts, not legacy shims. `topicOrigin` and `topicQuestion` are paired, schema-validated capabilities for a second real source of exercises.

The saved snapshot contains enough to answer and read feedback in either language from Practice without the service. It need not duplicate the full reference or compact teaching; offline Practice explicitly says it contains saved questions, with the current reference as an optional external-to-the-snapshot link. There is still one history record, not an independent worksheet copy.

Bilingual feedback/instruction metadata shared by topic validation and durable exercise validation belongs in a small proposed `src/types/grammarCheckpoint.ts`. Do not make `exercises.ts` import `grammarTopic.ts` and create a cycle through `ExerciseLevelSchema`.

## 6. Working state, attempts and transactions

Use actual stores **`units`, `itemStates`, `attempts`, `meta`**, owned by `src/storage/`. Keep DB version 1. Cache is separate, disposable data, never the only home of learner answers.

Proposed durable addition, one field; the working-state schema is unchanged:

```text
ExerciseAttempt.topicResult?: {
  topicId: string,
  exerciseRevision: string,
  instruction: Bilingual,
  feedback: FeedbackMessage
}
```

An item state is unchecked (with an optional draft) or checked, exactly as in worksheets. `CheckedResult` needs no second feedback copy; keep its existing correct/strictAccents contract. The topic attempt stores the selected authored feedback because **attempts survive unit deletion**; Mistakes must not need AI or a surviving topic fetch to explain them.

### Creation

Add proposed `ensureTopicUnit(preparedUnit, expectedResetToken)`, called before the session's first write. Validate the prepared unit, then in one **`units` + `meta` read-write transaction** read the current reset token and compare it with the token captured by `getUnitSnapshot` at session entry. A mismatch throws `StaleResetError` before any insert. Only then get the deterministic unit id and return the stored row or insert it. Await commit; notify only after a new insert. Keep ordinary draft/check token validation too: a reset/delete between ensure and the subsequent write still rejects that write.

Do not read/adopt a fresh token to make an old pending answer succeed. Otherwise A can open an unsaved topic, B create/delete its snapshot, and A's late ensure recreate the deleted unit before its answer save detects staleness. Concurrent same-token ensures still share the stored snapshot without overwriting answers or `createdAt`.

Do not change ordinary `saveUnits` collision semantics: it currently rejects duplicates intentionally for imports and generated batches. Deterministic topic reopening is a distinct real need, not permission to turn every duplicate import into success.

### Session and writes

- Extend `useExerciseUnit` with the real prepared-topic bootstrap capability: a missing stored unit is playable from the prepared snapshot only on a fresh Grammar entry. Read its reset token even when missing; never substitute 0 merely because the row is absent. Practice has no prepared fallback and keeps its missing-unit behavior. One session owns all six items; `UnitView` passes its existing session to the workbench.
- Preserve current 350ms draft debounce, independent queues, `pagehide`/unmount flush, same-action deduplication and session guards. Guard the ensure call with the original snapshot token at the write queue's entry; adopt the authoritative stored unit it returns. Reset/delete/restore failure drops stale pending work and reloads or shows missing; it must not re-enable prepared fallback in that stale mounted session. Explicitly leaving and reopening the topic may start a new session.
- Redo is disabled until checked. Whole-unit Reset is disabled while the session has no persisted working state or is performing its initial write; it must not create a unit merely to clear an untouched/prepared page. Once working state is persisted, existing reset/token semantics apply.
- Leaving a question without checking writes nothing beyond its debounced draft. Merely viewing another question never marks the previous one wrong.
- `gradeUnitItem` remains pure. For a topic item, an unexpected `needs-ai` result is a contract failure, never permission to call `gradeOpenAnswer`. Topic actions must not reach AI Hint/Explain entry points.
- Extend existing `checkItem`'s transaction over `units`, `itemStates`, `attempts`, `meta`. Check the reset token; save the result and its `topicResult` together. Resolve feedback from the stored item and the actually submitted answer using the existing strict normalizer. No caller-supplied replacement answer key or explanation becomes authoritative.
- An already checked item returns the committed answer/result without another attempt, including across two tabs. The UI adopts that committed state, not the losing tab's provisional result.
- Update the visible verdict only after commit. If saving fails, including a failed `ensureTopicUnit`, keep the typed answer, unlock it, show the real error and offer storage retry without an AI call. Do not promise a maximum storage latency or mark a merely in-memory check as saved.

### Redo, reset, delete and concurrency

Use current `resetItem`/`clearItemState` for Redo: drop that item's queued draft, clear its current state and keep attempts. Use current `reset`/`resetUnit` for whole-unit reset: clear working states, keep attempts, bump the reset token.

Unit/set deletion removes saved units/current states, **not attempts**. Existing delete confirmation/cascades remain authoritative. Reopening the current topic may recreate its deleted snapshot with no working results while retained historical attempts remain in Mistakes/Progress; say so rather than claiming deletion erased history.

Keep the existing reset-token protection for reset/delete/restore races, and session guards for navigation/unmount. Stale token errors discard late writes and reload the authoritative snapshot; missing units show missing rather than silently recreating themselves from a stale Practice screen. No background auto-recreation loop.

No live collaborative editing or cross-tab message bus is introduced. Concurrent unchecked drafts retain the existing last-committed-write behavior; do not advertise instant synchronization. Same-item Redo in another still-editing tab is not a global cancellation protocol. Safety guarantees are atomic get-or-create/check, no duplicate checked attempts and rejection of stale reset/delete/restore writes. Tests must distinguish these guarantees from unsupported live co-editing.

### Revisions and statistics

Keep old snapshots and attempts when new content changes the hash. Every saved revision shows its short hash as neutral metadata. Do not label “latest” from `createdAt`: an older revision can be restored or opened later. The topic route opens the revision of the topic it actually fetched; Practice opens the revision explicitly selected.

Current checked/right counts come from current item states. Historical grammar accuracy continues to count actual attempts, including retained/deleted revisions, exactly as the existing aggregation does; describe it as practice-answer accuracy, not independent recall or mastery. Do not add a leaderboard or a second percentage system. With no attempts, show no accuracy/“—”, not an observed 0%.

## 7. Practice, Mistakes, cache and backup

### Shared rendering without accidental AI

`UnitView` selects the topic workbench when `unit.topicOrigin` exists; otherwise it keeps `UnitSheet`. Reuse the two existing answer controls, `CharacterBar` and house primitives. Do not paste the existing `ItemRow`/`ItemActions` wholesale: they expose speech, lookup and AI actions.

The shared control interface needs optional `onWord`; pass it conditionally through `InlineMarkup` rather than wrapping an absent callback in an interactive no-op. Ordinary worksheets continue passing their real lookup callback. Topic controls receive none. Apply the feedback correction placement described above to the two pilot controls.

`setLabel`, set/unit tables, Practice subnavigation, unit headers and retry source labels must use the topic's bilingual title when `topicOrigin` exists. Locale changes update title/instruction/feedback only: item ids, hashes, answer values and session ownership remain language-independent. Do not prepare a second unit on language change.

For attempts carrying `topicResult`, `MistakeNotebook` uses plain prompt/answer text and a local authored-feedback Sheet. It must not mount the existing AI `MistakeExplanationSheet` or its lookup callbacks. The selected feedback must describe the original wrong attempt, even after a later correct attempt resolves the mistake. This still works after unit deletion because `topicResult` is self-contained. Ordinary worksheet explanations keep their existing AI behavior.

Retry targets the same surviving `unitId`; the learner can select its wrong question and use Redo. A separate link to the **current reference** is not a retry or a promise of identical content. Hide that optional link when the content service is not configured, since topic routes are then unavailable.

### Cache and service failures

Preserve `src/services/grammarTopics/request.ts`: 60-second request reuse and validated IndexedDB content caching; only `ContentServiceNetworkError` can fall back to cached content. HTTP errors (including rate limits), malformed JSON and schema failures are real failures, not stale-success states.

- Offline first access without cache: unavailable with the actual failure and Retry; do not invent teaching text.
- Cached topic revisit after a network failure: render the validated cached topic and deterministically check locally.
- HTTP/schema failure: show the failure; offer a deliberate link to saved Practice, not an automatic replacement of the failed reference with a saved unit.
- No configured service (`VITE_CONTENT_SERVICE_URL` absent): preserve current no-topics routing. Saved Practice/Mistakes still work without a content fetch. Do not promise an offline Grammar route in this build.
- Unit creation failure (at the first write): keep reference browsing and the typed answer, show the real error and offer retry. No ephemeral success that would disappear on reload.

Expected answers are served **to** the browser as reviewed content; learner answers, attempts, language selection and keys are never sent **to** the Worker. Topic-learning controls do not call AI or speech. Existing explicitly initiated AI features elsewhere in the app are not disabled by this proposal; in particular this does not redesign the separate adaptive-drill feature.

### Backups

Extend the actual Zod schemas in `types/exercises.ts` and `storage/exerciseBackup.ts`, not nonexistent hand-written `isValidUnit` helpers. Back up `topicOrigin`, all `topicQuestion` metadata and attempt `topicResult` through existing `db.ts` export/import.

Validate paired topic metadata, allowed types, valid revision/id relationships, and bilingual text before writing. Malformed metadata must reject rather than be stripped into a seemingly ordinary worksheet. Existing duplicate-id and dangling-current-state checks still apply. Attempts without surviving units remain valid by design, not “dangling” corruption.

Keep current restore semantics: absent store keys keep existing rows, `[]` replaces with empty rows, the full restore is transactional, and reset tokens invalidate stale writers. Do not require a service fetch during restore. Keys and the disposable content cache are never included. A restored snapshot can answer and show feedback offline; full topic-reference content may require a separately cached/fetched topic. Backup files now include private exercise content, so they are the learner's private files, not fixtures to commit.

## 8. State and transition acceptance table

| State/event | Durable effect | Visible result and next action |
| --- | --- | --- |
| Topic has no `learning` | No exercise write | Existing reference reader; no fake empty quiz. |
| First interactive topic load | None: read-only lookup | Loading remains in reserved content area; on success Q1 and 0 checked. |
| Reopen same revision | Read saved unit/states/token | Resume selection rule; restore draft and labels. |
| Edit | Debounced current answer; the first write ensures the unit | Field remains editable; no verdict until checked. |
| Blank Check/IME Enter | No write/attempt | Check disabled/no-op; unanswered is not wrong. |
| Check pending | No provisional success | Fixed-size spinner, read-only input; no movement or auto-next. |
| Correct/wrong committed | State + one attempt | Explicit verdict and authored feedback; correction in reserved slot, no mental-process diagnosis. |
| Duplicate check/two-tab check | Return existing committed state | No second attempt or conflicting displayed verdict. |
| Redo | Clear one working state, keep history | Same question editable. |
| Reset confirmed | Clear working states, bump token, keep attempts | 0 checked; no claim history was deleted. |
| All six checked | No extra completion attempt | Existing summary row says checked/right; all results navigable. |
| New exercise payload | New deterministic unit | Fresh working counts; old revisions remain separately retryable. |
| Answer save failure | Transaction fails, no invented attempt | Keep input/selection; real error in fixed slot, details/Retry available. |
| Stale reset/delete/restore | Reject stale writes | Reload snapshot or missing state; never resurrect stale answers. |
| Service/network/cache failure | No learner data mutation | Apply explicit cache rules; saved Practice is a separate deliberate path. |
| Language/theme change | No new exercise identity | Translate/retheme in place; keep current input, result and focus. |
| Unit/set deletion | Remove source/current states, keep attempts | Retained Mistakes/accuracy; authored feedback still local, retry unavailable. |

## 9. Private authoring and review

Keep drafts under ignored `.local/grammar-topics/`, generation/review logs under ignored `.pi-runs/`, and published payloads in local D1. Never put real teaching text, questions, keys or feedback in tracked app data, example documents or tests. The structural contracts above contain no private lesson text.

Extend `scripts/grammar-topics/prompt.txt`, generator/draft validation and the private sheet to produce and show the complete `learning` payload. The sheet includes both languages, all prompts/options, accepted forms, feedback matches, teaching slices and normalized-answer collisions. The C1-ceiling omission rule already in the prompt applies to `learning` too. Review covers the questions and feedback **together**, not just whether JSON parses. Real generation, review marking and local publishing remain owner-authorized operations; record the actual reviewer, never impersonate owner approval.

Because `learning` is a new top-level field, **explicitly add it to `topicContentHash` in `scripts/grammar-pack/gate.ts`**. The current function hashes title/blocks/tags/related/level/chapter only. Every learning edit must invalidate the publication review even when full-reference blocks are unchanged. Exercise revision hashing and whole-topic review hashing have different purposes; test both. No need to invalidate learning history for an unrelated reference correction, but that correction still needs publication review.

Continue the existing reviewed-only assembly/publisher and `GET /v1/topics/:id`. Nested JSON fits the current topic body; no Worker write API, D1 table or migration is necessary. CI's public-metadata-only `publish.ts --check` must not start requiring private drafts. During pilot implementation, local acceptance requires reviewed checkpoints on both pilot topics; do not hard-code those ids as a permanent schema exception or forbid other reference-only topics.

### Content objectives (not final questions)

| Topic/checkpoint | Recognition | Typed application |
| --- | --- | --- |
| Gender 1 | Regular feminine change versus a taught invariant noun spelling | A different regular feminine form in a new short context; instruction specifies article handling. |
| Gender 2 | One taught productive suffix-family contrast, stated as a tendency, not a law for every noun | A new noun of the same taught family in a new context, not another copy of the displayed example. |
| Gender 3 | The taught general tendency for the gender of country names, stated as a tendency | Apply it to a taught country with the requested determiner/form. Test no exception, no country prepositions and no universal gender for cities. |
| Plurals 1 | Regular plural versus unchanged final `-s/-x/-z` | A fresh regular plural phrase. |
| Plurals 2 | Productive `-eau`/`-al` distinction | A new example of a taught productive pattern. |
| Plurals 3 | The regular `-eu`/`-eau` plural in `-x`, versus the plain `-s` plural | A fresh context applying the regular pattern. No exception is tested. |

Content beyond the C1 ceiling (rare or isolated exceptions, single lexical pairs, outdated or contested forms) is neither taught nor tested in this pilot, consistent with the generation prompt. No listening inference from a written question. No vowel-ending stereotype presented as a universal gender rule. Plausible distractors test a taught contrast; feedback explains it without “you thought X.” These objectives still need reviewed private questions, not just this outline.

## 10. Implementation slices and real file map

Names marked **new** are proposed. This is a cross-cutting feature, not a promised small file count. Each slice includes its tests; integrate one complete vertical pilot before expanding content. First prove one recognition question's payload-to-grading/save/Practice journey using a **fully valid six-question synthetic topic**, then exercise the remaining questions and second topic. This is implementation/acceptance order, not a one-question payload exception or a separately shippable partial schema. Keep the 3×2 contract throughout. Do not finish isolated storage layers before a learner-visible question exists.

| Slice | Existing files to change | New files proposed | Completion evidence |
| --- | --- | --- | --- |
| Contracts, revision and mapping | `src/types/grammarTopic.ts`, `src/types/exercises.ts` | `src/types/grammarCheckpoint.ts`, `src/services/grammarTopics/checkpoints.ts`, `tests/grammarTopicCheckpoints.test.ts` | Validated 3×2 payload, complete unit mapping, canonical hash invariants and no import cycle. |
| Durable lifecycle | `src/storage/exercises.ts`, `src/storage/exerciseBackup.ts`, `src/hooks/useExerciseUnit.ts`, `src/hooks/exerciseUnit/model.ts`, `src/hooks/exerciseUnit/actions.ts`, `src/hooks/exerciseUnit/drafts.ts`; `tests/exercises.test.ts`, `tests/exerciseBackup.test.ts`, `tests/exerciseRedo.test.ts`, `tests/exerciseUnitActions.test.ts`, `tests/exerciseUnitSnapshot.test.ts` | None required beyond focused tests | Atomic ensure/check, lazy ensure on first write, reset/delete/history and backup semantics proved using `freshDb()`. |
| Workbench and controls | `src/components/study/grammar/TopicsPage.tsx`, `TopicBlocks.tsx` in that directory; `src/components/practice/UnitView.tsx`, `controls/types.ts`, `controls/ChoiceSelectControl.tsx`, `controls/FillBlanksControl.tsx` | `src/components/study/grammar/TopicLearning.tsx` (topic initialization/session owner), `src/components/practice/TopicWorkbench.tsx`, `src/components/practice/TopicFeedbackSheet.tsx`, `e2e/grammar-topic-learning.spec.ts` | One session at either entry, existing control reuse with no accidental lookup/AI/speech, fixed controls and readable natural page scroll. |
| Revisit and labels | `src/services/exercises/setLabel.ts`, `src/components/practice/UnitTable.tsx`, `src/components/shell/PracticeSubnav.tsx`, `src/components/study/MistakeNotebook.tsx`, `src/hooks/useMistakes.ts`, `src/i18n/locales/en.json`, `src/i18n/locales/zh.json`; `tests/setLabel.test.ts`, `tests/exercise-sets.test.ts` | Reuse the new authored-feedback Sheet | Bilingual snapshot titles, original revision retry, local deleted-source feedback, ordinary worksheets unchanged. Audit all direct `unit.title` readers, including deleted-source/empty states. |
| Private pipeline | `scripts/grammar-topics/prompt.txt`, `generator.ts`, `drafts.ts`, `sheet.ts`, `scripts/grammar-pack/gate.ts`; `tests/grammarTopicSchema.test.ts`, `tests/grammarTopicGenerate.test.ts`, `tests/grammarTopicBuild.test.ts`, `tests/grammarTopicPublish.test.ts` | Synthetic fixtures only where needed | Review-sheet completeness, changed question invalidates review, metadata-only CI and existing Worker delivery preserved. |
| Approved scope docs and local integration | `docs/grammar-pack.md`, `docs/architecture.md`, `PRODUCT.md`, `DESIGN.md` (topic-learning composition), `docs/development.md`, matching storage/UI rules if changed, `CHANGELOG.md` Unreleased | Ignored review/local verification report | Record the actually built behavior and any limits; real local first-chapter content checked without deployment or a false owner-review attribution. |

`storage/db.ts` export/import already traverses the exercise rows; change it only if tests show a real gap, not to add another export format. `sets.ts`/SetTable should inherit the localized `setLabel`; only change additional consumers that actually bypass it. Do not rewrite `ItemRow` or every exercise type for the two-control pilot.

UI keys belong in both locale files, including status, progress, action labels, sheet titles, errors and accessible names. Authored content remains schema-validated bilingual data, not duplicated into locale JSON. Use existing locale selection conventions rather than component-level `isEn ? ... : ...` strings. No Chinese prose in this English specification.

## 11. Verification contract

No feature code or tests were implemented for this specification. The following is required evidence for the future implementation, not a claim that it already passes.

| Layer | Required coverage |
| --- | --- |
| Contracts/hash | Valid synthetic payload; reject unsupported types, malformed one-group/one-blank markup, duplicate ids/options/normalized matches, missing translations, bad French typography and invalid paired metadata. Hash changes on every learning/answer/feedback/order/compact-teaching edit; full-reference-only edits keep exercise hash but invalidate topic review. Browser/Node hash bytes agree. |
| Grading/feedback | Right, wrong, scalar accepted variant, accent-only wrong with the global accent preference off, apostrophe/case/space normalization, distractor-specific and fallback feedback. No AI result path for either permitted type. |
| Storage/session | Opening creates no unit/state/attempt (content cache may write). Missing-row bootstrap captures the real token, including a previously deleted id's nonzero token. First draft/check ensures with that same token; concurrent ensures retain first snapshot/date. A opens, B creates then deletes/restores/resets, A's late ensure must reject without recreating a row or recording an attempt. No stale fallback/fresh-token retry; Practice still shows missing. Reset never creates an untouched unit; duplicate check writes once; debounce/flush/redo cancellation/history/revisions preserve their contracts. |
| Backup | Roundtrip both languages, original prompts/keys/feedback and retained deleted-source attempts. Malformed topic fields reject the whole restore, not silently strip. Test partial/empty stores, dangling current states, stale writer after restore and no key/cache export. |
| Learner journey | Topic -> recognition -> feedback -> typed context -> leave unanswered/revisit -> complete/review -> redo -> Mistakes original snapshot -> Practice same unit. New revision stays distinct; delete keeps history/feedback, no retry on removed source; restore works with service disabled. |
| Service boundaries | Reference-only topic, no service, no-cache offline first use, cached network-failure revisit, HTTP 429/500, bad JSON/schema, initialization/draft/check storage failures. No stale-success mask or silent ephemeral check. |
| Network | In topic workbench, saved Practice, authored-feedback Mistakes and restored/offline paths, fail tests on any AI/speech/lookup request or request containing learner answers. Permit only expected static assets and read-only topic GETs. Merely asserting “no POST to Worker” is insufficient. Do not exercise separate explicitly initiated AI features in this no-key flow. |
| Interaction/layout | EN and ZH; 1280×900 and 360×740; light/sepia/dark; long synthetic translations, wide tables, keyboard, IME Enter, character insertion, zoom/reduced motion and focus return. Assert stable controls/result-region bounds across busy/right/wrong/error/redo, natural page scrolling and no document horizontal overflow. Do not assert an unchanging whole-document height. |

For a new nontrivial behavior, capture the targeted failing assertion against the old code before implementing it. A missing module alone is not useful regression evidence; the test should demonstrate the broken contract (for example duplicate reopen throws, backup strips `topicResult`, or a check moves the action row). Then record passing output and what was mocked. Never use private textbook content as a fixture.

Repository checks after implementation, from [development](development.md):

```sh
bun run typecheck
bun run lint
bun run format:check
bun run test
bun run i18n:check
bun run shape:check
bun run build
bun scripts/grammar-topics/publish.ts --check
~/.agents/skills/impeccable/scripts/impeccable detect --json src index.html
```

Run Playwright only at the assembled integration milestone, one process across checkouts. First `lsof -iTCP:5174 -sTCP:LISTEN` must show no listener; if occupied, stop rather than reusing/killing another checkout's server. Run `CI=1 bunx playwright test` for the milestone suite; reproduce a failure alone before diagnosing it. Targeted specs include new `grammar-topic-learning.spec.ts` and existing `grammar-topics.spec.ts`/`grammar-crosslinks.spec.ts`. Preserve the owner's local servers on 5173/8787. Visual acceptance is manual, no screenshot-diff gate. AI in automated checks is mocked; real provider calls are neither needed nor evidence for this deterministic feature.

Local content acceptance follows the reviewed private pipeline, then real browser interaction with both local first-chapter topics. No other chapter generation, push, login, remote D1 write or deployment is part of this pilot.

## 12. Owner sign-off and trade-offs

Approve this package before functional implementation:

1. Replace the Part 2 reference-only non-goal with offline-authored, reviewed topic checkpoints; first chapter only, 3×2 questions each, one visible question and free navigation/reference browsing.
2. Persist a topic's snapshot on the learner's first answer (opening a topic writes nothing), expose the same revision in Practice/Mistakes/backups, and retain older revisions and attempt history unless explicitly replaced by restore.
3. Use mandatory accents and only local deterministic checking/authored feedback, with no runtime AI/audio/lookup in this flow.
4. Accept the conservative revision rule: learning/feedback/compact-teaching edits start fresh working progress; full-reference-only edits do not. No cross-revision answer merging. Question-only hashing is not adopted and is not an implementation option; changing this policy requires a later owner decision.
5. Accept that the pilot records neither reference use nor skipping, makes no independent-recall or mastery claims, and adds only minimal teaching before a rule is tested.

Trade-offs: saved revisions grow local storage/backups without an automatic cleanup policy; immediate retry is not delayed retention evidence; six questions cover selected distinctions only; saved Practice carries questions/feedback rather than the full reference; multiple tabs are not collaborative editors. Actual payload size must be measured during implementation, not promised from an invented byte estimate.

Source review found no required new dependency, endpoint, database table or scheduling system. The proposal intentionally changes product scope and stored row fields; it is not implemented or functionally verified. Existing earlier layout/content checks do not verify this new learning flow.

## 13. Joint readiness feedback and kickoff boundary

Source-checked at `517ba2d` after the owner's revisions. Retain the removed Skip/reference-use tracking, lazy persistence, regular C1-bounded content objectives and per-distractor feedback. There is no reason to restore extra learner-state fields or add a course engine.

| Readiness feedback | Contract now fixed |
| --- | --- |
| Lazy ensure can resurrect a deleted unit before the next writer checks staleness | `ensureTopicUnit` takes the original snapshot token and checks it in a `units`/`meta` transaction before any insert; missing-row bootstrap captures the real nonzero token too (2, 6). |
| Initial unsaved state and later missing state are different | Prepared fallback is allowed at fresh Grammar entry only; a stale mounted session cannot silently re-bootstrap or adopt a newer token. Practice retains missing-unit behavior; Reset cannot create an untouched unit (6). |
| Pure mapping and read-only browsing needed precise scope | Caller supplies `createdAt`; ordinary content caching is allowed, but opening creates no exercise unit/state/attempt (2, 5). |
| One-question vertical work could accidentally weaken the fixed schema | First exercise journey uses a complete valid six-question fixture; it is implementation order, not a partial payload or separately shipped shape (10). |
| Revision-hash alternative could be mistaken for an agent decision | Full-learning snapshot hashing remains the specified default; question-only hashing is not adopted (12). |

The remaining owner gate is approval to execute section 12's defaults. Real offline drafting/review marking and local D1 application are separately authorized content work, not implied by a code-only start. Synthetic implementation/testing can proceed after code authorization without waiting for those questions to be published.

Follow [the joint kickoff plan](learning-implementation-kickoff.md): accept Grammar before Vocabulary edits the shared unit/notebook/backup paths. Vocabulary must preserve topic-authored feedback, original-revision retry and exercise reset tokens. This is operational serialization, not a product dependency between grammar learning and vocabulary scheduling.

No implementation, publisher, browser acceptance or new external review was run for this readiness pass. The table records a source-checked specification correction, not a runtime PASS.
