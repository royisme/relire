# Relire Plus merge: progress and next steps

Status: living handoff document. Update it at the end of every work session.
Last updated: 2026-10-17 (UTC).
Plan and decisions: `docs/merge-plan.md`. Branch: `claude/sleepy-darwin-lt2eck` (all merged work is pushed there; no PR yet).

## How to resume

Paste this into a new session:

> Continue the Relire Plus merge. Read `docs/merge-progress.md` and `docs/merge-plan.md`, check the state of branch `claude/sleepy-darwin-lt2eck`, then run the next unchecked tasks in "Next tasks" using `openai-codex/gpt-6.1-sol` and `zai/glm-5.3` subagents. All implementation and fixes belong to subagents; the parent coordinates, reviews, verifies, integrates and pushes. Follow first principles and keep the solution minimal. Review, merge, check and push each result, and update this file.

Working method used so far:

1. **Split** each phase into tasks with clear file boundaries. The Sonnet/Haiku labels below describe the original allocation; the user's latest instruction replaces those models with `openai-codex/gpt-6.1-sol` (not Magpie) and `zai/glm-5.3`. P3-A used GPT for logic/fixes and GLM for UI checks, then independent reviews. All code changes go through subagents; avoid unnecessary abstractions, defensive scaffolding and redundant tests.
2. **Isolate** parallel writers in separate worktrees based on the current integration commit, then run `bun install --frozen-lockfile`. Check branch ancestry and dirty files first; do not reset or discard existing work. Serial writers may share one isolated worktree.
3. **Commit, don't push.** Agents commit on their worktree branch and report the branch, the sha, the API they exported and the checks they ran.
4. **Review and merge.** Read the diff, then `git cherry-pick <sha>` onto the branch. Merge locale JSON with a three-way merge of keys, not by hand.
5. **Run every check** (below), send fixes back to subagents, then push. Remove only task-owned worktrees after their results are safely integrated and pushed, and after checking for uncommitted work.
6. **Add `.claude/worktrees/` to `.git/info/exclude`.** Agent worktrees are not part of the repo.

Checks (all must pass before a push):

```sh
bun run typecheck && bun run lint && bun run format:check && bun run test \
  && bun run i18n:check && bun scripts/check-prosody-schema.ts && bun run build
bun run e2e   # installed Chrome; never `playwright install`
# In the cloud container only, set CHROME_PATH to its installed Chromium executable.
```

- **Parallel e2e.** Only one e2e run at a time can own port 5174. Agents running e2e in parallel produce load flakes, so re-run a failing spec on its own before calling it a bug.
- **`impeccable`.** If it is not on PATH, use the installed skill launcher: `~/.agents/skills/impeccable/scripts/impeccable detect --json src index.html`. The P3-A follow-up ran it successfully with `[]` and refreshed the `.impeccable/design.json` sidecar against `DESIGN.md`.
- **Container restarts.** A restart kills running agents. Their committed work survives only in their local worktree branch, and uncommitted edits survive in the worktree directory. Neither is pushed, so check `git worktree list` first and resume from what is there.

## Done

| Phase | What | Commits |
| --- | --- | --- |
| 1 | Plan; scope and name in `CLAUDE.md` / `PRODUCT.md`; oxfmt + oxlint with a zero-finding baseline | `0fb3d17`, `c3ca56b`, `ff5a70d` |
| 2 | Locale labels (grammar areas, 37 tags, 11 exercise types); FrenchLab prompts as `extract/hint/explain/grade/adaptive/exercises` templates | `36af6f3`, `52385da` |
| 2 | Zod exercise contracts, grammar taxonomy and FrenchLab mapping, grading, import drafts, provider JSON schema, `bun test` | `57280cd`, `e17daf7` |
| 2 | AI layer: templates registered, image input, tasks and `api.ts` functions with caching rules | `a32fea4` |
| 2 | Storage: IndexedDB v5 (`units`, `itemStates`, `attempts`), check/reset transactions with reset tokens, backup; Settings restore passes exercise data | `f7c6f80`, `84bb08f` |
| 2b | App shell: collapsible sidebar, Settings as a page with per-section save, hash routes, not-found view | `247b61c` |
| 3 (prep) | Shared 11-type exercise catalogue with right and wrong answers and mock AI answers (`tests/fixtures/exerciseCatalog.ts`) | `888cdba` |
| 3-A | Exercise core: recovered WIP, four controls, article generation, saved drafts/checks/reset, help, character bar, oral practice retained; review fixes for races, reading context, navigation and source changes | `d3b05e9`, `521a351`, `9ebf40c`, `4d49fb2` |
| 3-B1 | Choice and order controls: `GENDER_CHECK`, `ODD_ONE_OUT`, `MATCH_PAIRS`, `DIALOGUE_ORDER` (radio groups with arrow keys, per-line up/down), catalogue e2e right and wrong at 1280px and 360px | `4c8d9f8`, `e8c5db8` |
| 3-B2 | Writing and listening controls: `SENTENCE_BUILD` (tiles, unmatched goes to the AI grader), `READING_CLOZE` (passage beside the questions from `md`, reader link), `NUMBER_DICTATION` (Listen at the dictation speed, clip stored); Settings → Practice (strict accents, dictation speed, speak after checking); all 11 types playable, the placeholder machinery removed | `626e6bd` |

At `4d49fb2`: parent integration checks passed — typecheck, lint, format, 191 unit tests, i18n, 37 prosody checks, build and all 102 e2e tests in installed Chrome. AI responses were mocked; real providers were not exercised. Layout coverage includes 1280px and 360px in light, sepia and dark, with screenshots inspected. The follow-up Impeccable scan of `src` and `index.html` returned `[]` using the skill launcher (the command was absent from PATH, not from the machine). The existing bundle-size warning remains. The integration checkout initially lacked installed Bun types; `bun install --frozen-lockfile` resolved that without dependency-file changes.

At `e8c5db8` (3-B1): parent integration checks passed — typecheck, lint, format, 191 unit tests, i18n, 37 prosody checks, build, all 111 e2e tests in installed Chrome, and the Impeccable detector `[]` via the skill launcher. AI responses were mocked; real providers were not exercised.

At `626e6bd` (3-B2): the same checks re-run by the parent on the integration branch — typecheck, lint, format, 191 unit tests, i18n, 37 prosody checks, build, Impeccable `[]`, and all 119 e2e tests in installed Chrome (9 new in `practice-writing-listening.spec.ts`; the not-built-yet sheet test was removed). AI responses were mocked. The worker's session could not render screenshots, so the P3-D screenshot pass should cover the three new units and Settings → Practice in the three themes.

## Current handoff

- **P3-A, P3-B1 and P3-B2 are complete and pushed**; the B1/B2 worktrees are removed. The old `77ac92e` WIP on `claude/sleepy-darwin-lt2eck-wip-phase3-core` was recovered and finished; do not cherry-pick it again. Every type of the 11 is playable, and the "not built yet" sheet test is replaced by real NUMBER_DICTATION coverage.
- **Next: P3-C** (catalogue in e2e: the mock answers `exercises` with `CATALOG_EXERCISES` against `CATALOG_ARTICLE`, hint/explain/grade from the catalogue's mock answers, remove P3-A's ad-hoc mock defaults). Run it with `zai/glm-5.3` unless the user says otherwise; `openai-codex/gpt-6.1-sol` hit its usage limit twice on 2026-10-17. P3-D (screenshot review pass) follows; phase 3 is not complete.
- The user's pre-existing `.gitignore` addition for `.works/` was left untouched and uncommitted.

## Next tasks

Tasks run in order unless marked parallel. Each one ends with the full checks, a CHANGELOG line for anything a learner can notice, both locales, and the docs it affects (`docs/architecture.md`, `DESIGN.md`, `PRODUCT.md`, `.claude/rules/*`).

### Phase 3: Practise

- [x] **P3-A Exercise core** (completed with GPT + GLM).
  - **Routes:** `#/practice` (pick an article, list its units, "Make exercises from this article" with level and count) and `#/practice/:unitId` (one unit on one sheet).
  - **State:** `useExerciseUnit` (load, autosave drafts with the reset token, `gradeUnitItem` → `checkItem`, `needs-ai` → `gradeOpenAnswer`, drop late results on `StaleResetError`).
  - **Controls:** an interface in `src/components/practice/controls/types.ts` with a registry in `controls/index.ts`. Implement `FILL_BLANKS`, `CHOICE_SELECT`, `WORD_TRANSFORM` and `OPEN_QA`; the other 7 types get placeholders.
  - **Input:** Enter advances to the next blank, then checks; IME composition never submits; a French character bar inserts at the cursor without stealing focus.
  - **Help:** hints show inline; explanations open in a `Sheet`.
  - **Generation:** items whose `articleQuote` is not in the article are dropped and the learner is told how many. It fails only if nothing is left.
  - **Old drills:** remove the drills (task, `drills.*.txt`, `PracticeDeck` types). Keep the open oral-assessment practice as its own section.
  - **e2e:** extend the mock in `e2e/fixtures.ts` to the exercises, hint, explain and grade tasks.
- [x] **P3-B1 Choice and order controls** (done with GLM; commits `4c8d9f8`, `e8c5db8`). Covers `GENDER_CHECK`, `ODD_ONE_OUT` (strike-through), `MATCH_PAIRS` and `DIALOGUE_ORDER`.
  - Keyboard operable; 40px touch targets; one file per control; swap the placeholders in the registry.
  - e2e uses `CATALOG_EXERCISES` / `CATALOG_ANSWERS` to answer each type right and wrong, at 1280px and 360px.
- [x] **P3-B2 Writing and listening controls**. Covers `SENTENCE_BUILD` (AI-graded when unmatched), `READING_CLOZE` (passage beside the questions on desktop, stacked on phones, opens in the reader) and `NUMBER_DICTATION` (plays `audioText` through `utils/speech`, clips stored in the `audio` store).
  - Added a **Practice** section in Settings: strict accents, dictation speed, speak after checking (off by default).
  - e2e as in B1. Done in `9e6b721`; the sheet's not-built-yet test was dropped (no placeholder types remain) and real NUMBER_DICTATION coverage took its place.
- [ ] **P3-C Catalogue in e2e** (Haiku). Make the e2e mock answer `exercises` with `CATALOG_EXERCISES` against `CATALOG_ARTICLE`, and the hint, explain and grade tasks with the catalogue's mock answers. Remove any ad-hoc defaults left by P3-A.
- [ ] **P3-D Review pass** (orchestrator).
  - Screenshots in light, sepia and dark at 1280px and 360px.
  - Check the decisions recorded in `docs/merge-plan.md`; mark phase 3 done there and here.

### Phase 4: Import

- [ ] **P4-A Material handling** (Sonnet).
  - Add `pdfjs-dist`, loaded only when a PDF is chosen, with its worker, cmaps and fonts bundled for offline use.
  - Port FrenchLab `services/import-material.ts`: image limits (10 MiB / 20 MP), PDF limits (20 MiB / 100 pages, at most 3 pages per analysis) and local page rendering. Release handles, canvases and workers when done.
  - Unit tests for the limits.
- [ ] **P4-B Import flow UI** (Sonnet, after A).
  - "Add" in the library offers "Import from image, PDF or text" with choose, drop and clipboard paste.
  - Before sending, show the provider, the model and what will be sent. Refuse up front when the model cannot read images. Cancel goes through `AbortSignal`.
  - The editable draft review is ported from FrenchLab `ImportDraftReview`: edit, exclude, blockers, answer origin labels.
  - Save as exercises (`prepareImport` → `saveUnits` on a new `Article` with `kind: 'workbook'`), as an article, or both.
  - Unconfirmed drafts block navigation, and a failed save keeps the draft.
- [ ] **P4-C Import e2e data** (Haiku, parallel with B). Mock `extract` answers for text, images and blockers, plus small image and PDF test files. Fixtures only.

### Phase 5: Review loop

- [ ] **P5-A Mistakes** (Sonnet). Add a third tab in My study (`#/study/mistakes`, from `listMistakes`), grouped by grammar area.
  - Per mistake: explanation, retry, "open in material", and "add the word to vocabulary" (reuse `WordDetailModal` / save flow).
- [ ] **P5-B Progress and adaptive drills** (Sonnet, parallel with A). Progress shows accuracy by grammar area from `accuracyByGrammarTag`, empty until there is data. One action generates drills for the weakest tags (`generateAdaptiveDrills` → saved unit → sheet).
- [ ] **P5-C Cross-links** (Sonnet). Exercise prompts, passages and explanations use `ReaderWord`, so words open the word sheet. Settle whether attempts of a deleted material count in Progress (open question from the plan).
- [ ] **P5-D Copy review** (Haiku). Read all new zh strings for tone (plain, no hype) and consistency with existing terms, and fix wording only.

### Phase 6: Migration and launch

- [ ] **P6-A FrenchLab backup import** (Sonnet). Restore accepts a `frenchlab-backup` v1 file:
  - lessons become workbook articles and units; states and attempts are kept;
  - tags are mapped with `mapFrenchLabGrammarTag`; an unknown tag stops the restore with a clear message;
  - prompt overrides are offered for review, never applied silently.
  - Test with a real FrenchLab export.
- [ ] **P6-B Rename to Relire Plus** (Haiku, with an exact file list). Change the display name only: `common.appName`, `index.html` title and meta, the PWA manifest in `vite.config.ts`, `marketing/` (en and zh), both READMEs and `metadata.json`.
  - Keep the `relire` IndexedDB name, the `relire_*` keys, the package name and the repository.
  - Update positioning text to the wider scope without overclaiming (no mock exams, no official scores).
- [ ] **P6-C More providers** (Sonnet, one per provider, `add-ai-provider` skill). OpenAI-compatible, Anthropic (direct-browser-access header) and Ollama (learner sets `OLLAMA_ORIGINS`).
  - Mark vision models for import.
  - Add Fish Audio TTS only if a browser request to its API succeeds; verify that first.
- [ ] **P6-D Launch** (needs the user).
  - Open the PR when asked.
  - Archive `royisme/frenchPracticeApp` with a pointer to Relire Plus.

## Decisions log

- **Server:** none. BYOK in the browser; FrenchLab's server is dropped.
- **Scope:** widened to exercises, including dictation and AI-graded writing. Still no mock exams and no official scores.
- **Taxonomy:** a new A1–C1 grammar taxonomy (37 tags, `src/types/grammar.ts`); FrenchLab tags are mapped and unknown tags are refused.
- **Dependencies:** `zod` and `pdfjs-dist` (P4), oxlint and oxfmt, plus dev-only `@types/bun` and `fake-indexeddb`.
- **Name:** Relire Plus is the display name from phase 6. Internal identifiers stay `relire`.
- **Navigation:** a collapsible sidebar from `lg` up, Settings as a page with per-section save, and hash routes.
- **Generated exercises:** items that do not quote the article are dropped individually and the count is shown.
- **Open answers:** AI text feedback only, no numeric score.

## Known gaps to pick up

- **Sidebar Read link:** it goes to the library, not the last-open article; one-time reader state (`focusText`) is not in the URL. Confirm with the user if it matters.
- **File length:** `tests/exercises.test.ts` is 310 lines, slightly over the ~300-line guideline.
- **Build warning:** the existing chunk-size warning remains; consider code-splitting practice and import screens in P4.
