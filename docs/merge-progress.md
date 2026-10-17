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

- **Visual acceptance.** The user manually verifies appearance for this and subsequent features. Screenshots are not a delivery gate; do not add capture/review work unless explicitly asked. Keep functional, overflow and layout-stability checks.
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
| 3-C | Catalogue in e2e: the mock's exercise tasks answer from `tests/fixtures/exerciseCatalog.ts` (`exercises` → `CATALOG_EXERCISES` against `CATALOG_ARTICLE`; hint/explain/grade per catalogue item), P3-A's ad-hoc `practiceFixtures.ts` removed, specs rewritten to the catalogue | `049bb7d` |
| 3-D | Review fixes: stable sentence-tile occurrences/focus/layout, dictation replay across reset, required generated cloze passage, saved check-time accent preference and neutral legacy slot markings | `5db998b`, `bb60454` |
| 4 prerequisite | Remove article snapshot autosave; explicit durable-first initialization, single-row save and missing-sample restore; failure-safe editor and original asynchronous request errors preserved | `ff2f63e`, `aa46f0a` |
| 4-A | Bounded local image/PDF handling; lazy PDF.js adapter, disposable rendering, local/offline PDF assets and production-path browser smoke | `92b01c1` |
| 4-B/C | Import source/consent, editable review, atomic add-only creation, history/reload guards and mocked fixtures; review fix permits empty-source exercises-only workbooks | `196eded`, `82c8cd5` |

At `4d49fb2`: parent integration checks passed — typecheck, lint, format, 191 unit tests, i18n, 37 prosody checks, build and all 102 e2e tests in installed Chrome. AI responses were mocked; real providers were not exercised. Layout coverage includes 1280px and 360px in light, sepia and dark, with screenshots inspected. The follow-up Impeccable scan of `src` and `index.html` returned `[]` using the skill launcher (the command was absent from PATH, not from the machine). The existing bundle-size warning remains. The integration checkout initially lacked installed Bun types; `bun install --frozen-lockfile` resolved that without dependency-file changes.

At `e8c5db8` (3-B1): parent integration checks passed — typecheck, lint, format, 191 unit tests, i18n, 37 prosody checks, build, all 111 e2e tests in installed Chrome, and the Impeccable detector `[]` via the skill launcher. AI responses were mocked; real providers were not exercised.

At `626e6bd` (3-B2): the same checks re-run by the parent on the integration branch — typecheck, lint, format, 191 unit tests, i18n, 37 prosody checks, build, Impeccable `[]`, and all 119 e2e tests in installed Chrome (9 new in `practice-writing-listening.spec.ts`; the not-built-yet sheet test was removed). AI responses were mocked. The worker's session could not render screenshots, so the P3-D screenshot pass should cover the three new units and Settings → Practice in the three themes.

At `049bb7d` (3-C): full checks passed again on the integration branch — typecheck, lint, format, 191 unit tests, i18n, 37 prosody checks, build, Impeccable `[]`, and all 119 e2e tests in installed Chrome (no test-count change: the practice specs were rewritten against the catalogue, not added to). The `exercises` default answers with the catalogue's 15 items in 11 units whenever the prompt's article is `CATALOG_ARTICLE`; `hint`/`explain`/`grade` answer with `CATALOG_HINT`/`CATALOG_EXPLANATION`/`CATALOG_OPEN_GRADE` for fb-1, fb-1 and qa-1, and any other request returns HTTP 500 with a message that names the missing `ai.answer` override. `e2e/practiceFixtures.ts` is gone; `seedUnits` seeds `CATALOG_EXERCISES` by default. The worker observed one sub-pixel failure (`the button shows the work and keeps its size`, 264.75 vs 264.0625px under 6 parallel workers); isolated reruns and the final worker suite passed. The parent's integration suite passed all 119 tests on its first run; the exact cause of the earlier failure was not established.

## Current handoff

- **Phase 3 is complete: all P3-A/B/C/D work is integrated and checked** (P3-C: `049bb7d`); the B1/B2 worktrees are removed. The old `77ac92e` WIP on `claude/sleepy-darwin-lt2eck-wip-phase3-core` was recovered and finished; do not cherry-pick it again. Every type of the 11 is playable, the e2e mock practises the shared catalogue, and the "not built yet" sheet test is replaced by real NUMBER_DICTATION coverage.
- **P3-D integration evidence:** at `bb60454`, parent checks passed: typecheck, lint, format, 198 unit tests, i18n, 37 prosody checks, build, Impeccable `[]`, and all 128 e2e tests in installed Chrome at 1280px/360px. AI/speech responses were mocked; real providers were not exercised. Regression tests cover both accent-preference directions, reload and backup restore, legacy neutral slots, tile focus/layout, and dictation reset. The user waived screenshot acceptance and will check appearance manually. Existing build-size warning remains.
- **Subagent outcome:** GPT committed both fixes before timing out on the later screenshot follow-up; both commits are safely integrated. No task changes remained uncommitted. Do not rerun the implementation or screenshot collection.
- **Phase 4 entry gate is resolved:** Phase 3 is accepted, and `ff2f63e` / `aa46f0a` remove the competing article snapshot writer instead of adding coordination locks. Startup awaits transactional initialization; saves and sample restores update React only after commit. Vocabulary/stats `usePersist` is unchanged. Parent checks at `aa46f0a` passed: typecheck, lint, format, 204 unit tests, i18n, 37 prosody checks, build, Impeccable `[]` via the installed launcher, and all 132 default e2e tests in installed Chrome. AI was mocked; no extra screenshots were requested or reviewed. Existing bundle-size warning remains.
- **Focused evidence:** `e2e/articlePersistence.spec.ts` covers stale-tab writes preserving unrelated creation/unit links, edits and deletion; failed/pending editor saves keeping the draft at both widths; and seed failure, intentionally empty libraries and restoring edited samples. `tests/articlePersistence.test.ts` covers atomic initialization/restore and asynchronous request errors across all three APIs. Parent review reproduced an auto-aborted transaction masking the real error and an unhandled rejection; the separate follow-up preserves the original error. Existing geometry checks now wait for fonts/layout using the shared helper, without changing assertions.
- **P4-A is complete:** `92b01c1` adds image validation (10 MiB / 20 MP), PDF validation (20 MiB / 100 pages), sorted/deduplicated selection of up to three pages, local rendering and cancellation/disposal. `openMaterial(file, signal)` returns `ImportMaterial`; `render(pages, signal)` returns plain-base64 `ImageInput[]`. Abort the opening signal or await `dispose()` when replacing/leaving a material. PDF.js loads only on the PDF path; local worker, cmaps, fonts, wasm and ICC profiles are bundled/pre-cached without a CDN.
- **P4-A parent evidence:** typecheck, lint, format, 208 unit tests, i18n, 37 prosody checks, build, Impeccable `[]`, and all 132 default mocked e2e tests passed at `92b01c1`. `bun scripts/check-import-material.ts` passed in installed Chrome under `/app/`: image handling without PDF.js loading; real PDF rendering and font/worker URLs; protected and 101-page rejection; render/open cancellation and cleanup; offline rendering and all 201 PDF resources available. Logs: `/tmp/relire-p4a-parent-checks.log`, `/tmp/relire-p4a-parent-material.log`, `/tmp/relire-p4a-parent-e2e.log`. The first parent lint attempt overlapped the temporary harness build and scanned its generated files; serialized checks passed after the harness removed its output. Run the harness separately from repository-wide lint/format checks. No screenshot acceptance was requested; real providers were not exercised. Existing bundle-size warning remains.
- **P4-B/C is complete:** `196eded` connects the material services to a separate `#/import` workspace in Read, preserving manual entry and existing `#/read/import` material links. Choose/drop/clipboard and text inputs show provider/model and outbound text/page selection before extraction; settings are pinned in memory across rendering. Review supports editing, exclusion, blockers and answer provenance. All included exercise units must pass promotion; no partial exercise save. Exercises-only opens Practice with a workbook; article-only opens Reader; both stores one readable article with attached units.
- **Persistence and guards:** `createImportedMaterial(article, units)` is add-only over articles/units/meta in one transaction, publishes after commit, and preserves the original request error. Any id collision rejects, with no recovery receipts/schema metadata. Failed saves retain the draft, guard and prepared identities. Pending writes block duplicate saves, edits and discard. `index.html` records history positions synchronously before deferred modules; the import coordinator preserves real Back/Forward entries through Keep/Discard, direct hashes and middle-of-history truncation. Tests also hide Navigation API and delay module loading. Pre-earliest-script fabricated untagged entries without Navigation API are outside the documented recording boundary.
- **Parent review fix:** the first implementation required source prose even for exercises-only. `82c8cd5` permits an empty-source workbook with valid included units, while article/both still require source text and every destination requires a title. Worker regression tests demonstrated red/green at desktop and phone sizes; no placeholder prose is invented.
- **P4-B/C parent evidence at `82c8cd5`:** typecheck, lint, format, 215 unit tests, i18n, 37 prosody checks, build, Impeccable `[]` via the installed launcher, and all 144 mocked e2e tests passed in installed Chrome (1280×900 and 360×740). `bun scripts/check-import-workspace.ts` passed on the actual production `/app/` workspace: PDF code remains lazy on initial load and a locally selected PDF renders offline through the bundled worker into mocked extraction review. `bun scripts/check-import-material.ts` separately passed real PDF/image validation, cancellation, cleanup, protected/101-page rejection and offline availability of all 201 PDF resources. Production now emits a separate PDF library chunk. Logs: `/tmp/relire-p4b-parent-{checks,e2e,production,material}.log`.
- **Additional parent browser probes:** actual drop and clipboard image events reached review, a mocked provider failure retained source input, and a missing API key sent no AI request while retaining source, route and leave protection. The initial extra probe incorrectly counted a blocked Google Fonts stylesheet as an AI request; the corrected provider-specific assertion passed. Logs: `/tmp/relire-p4b-parent-extra.log`, `/tmp/relire-p4b-parent-missing-key.log`. No real providers or new screenshot acceptance were exercised; visual acceptance is manual. Existing bundle-size warning remains.
- **Next: Phase 5 review loop**, starting with its approved tasks below; no Phase 5 worker has been launched. Settle deleted-material attempt counting with the user before implementing that Progress behavior. Concurrent explicit operations on the same article remain last-write-wins; cross-tab live synchronization and vocabulary/stats races stay out of scope.
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
  - e2e as in B1. Done in `626e6bd`; the sheet's not-built-yet test was dropped (no placeholder types remain) and real NUMBER_DICTATION coverage took its place.
- [x] **P3-C Catalogue in e2e** (done; commit `049bb7d`). The e2e mock answers `exercises` with `CATALOG_EXERCISES` against `CATALOG_ARTICLE`, and `hint`/`explain`/`grade` with the catalogue's mock answers (`fb-1`, `fb-1`, `qa-1`); any other request fails with a message naming the missing `ai.answer` override. P3-A's ad-hoc defaults are removed (`e2e/practiceFixtures.ts` deleted).
- [x] **P3-D Review pass** (orchestrator). Fixes reviewed and integrated (`5db998b`, `bb60454`); full parent checks passed with 198 unit and 128 mocked e2e tests. Screenshot gate waived by the user; visual acceptance is manual. Approved grading/import decisions are recorded in `docs/merge-plan.md`.

### Phase 4: Import

- [x] **P4-A Material handling** (GPT; integrated as `92b01c1`).
  - Added lazy `pdfjs-dist` adapter and local worker/cmaps/fonts/wasm/ICC resources with relative deployment URLs and offline precaching.
  - Images: 10 MiB / 20 MP; PDFs: 20 MiB / 100 pages; at most 3 selected pages per analysis. Local rendering returns `ImageInput[]`; cancellation and disposal release canvases/workers.
  - Four focused unit tests and installed-Chrome production-harness smoke cover limits, rendering, cancellation, protected PDFs, `/app/` paths and offline resources. Full parent checks passed; actual app import/offline integration awaits B.
- [x] **P4-B Import flow UI** (GPT; `196eded`, `82c8cd5`).
  - "Add" in the library offers "Import from image, PDF or text" with choose, drop and clipboard paste.
  - Before sending, show the provider, the model and what will be sent. Refuse up front when the model cannot read images. Cancel goes through `AbortSignal`.
  - The editable draft review is ported from FrenchLab `ImportDraftReview`: edit, exclude, blockers, answer origin labels.
  - Save as exercises, as an article, or both. Prepare once, retain request identities across retries, and create the material plus its initial units atomically (`prepareImport` → cross-store import save, not separate article and unit saves). The prerequisite removed article snapshot autosave; only explicit durable-first operations may update the material list. Existing ids alone are not proof of a successful retry.
  - 'Both' creates one readable material with attached units. Open Practice when exercises were saved, otherwise Reader.
  - Unconfirmed drafts stay in memory and block navigation; reload/close uses the browser warning. A failed save keeps the draft and guard. Verify Back/Forward and existing material links before choosing a guard mechanism.
- [x] **P4-C Import e2e data** (minimal fixtures integrated with B in `196eded`). The mock detects `extract` with per-test draft/blocker answers, reuses the shared draft fixture and generated small PDF, and supplies a small inline PNG. Import and navigation specs cover source selection, cancellation, review, destinations, failed/pending saves and history; `82c8cd5` adds empty-source workbook regressions.

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
