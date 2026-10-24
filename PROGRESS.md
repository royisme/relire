# PROGRESS

What is done, what broke, what is next, newest first. Short and factual; the next steps are `TASKS.md`, the direction is `docs/roadmap.md`, the history of the FrenchLab merge is `docs/merge-progress.md`, and what a learner can notice is `CHANGELOG.md`. The session-by-session working notes (`docs/HANDOFF.md`) are local only.

"Verified" means a check ran and its exit code was read. Anything that needs a browser, a device, a microphone, a real key or a deployed service is **unverified** until the owner has tried it.

## 2026-10-24: D-remote-3 and Today v2 V1/V2 landed locally

- D-remote-3 (`922448d`): topics and the lexicon get `--apply-remote`, interactive (Wrangler's own confirmation), allowed only with `allowRemote` (from `import.meta.main`) and a TTY on stdin and stdout; success is decided only by a read-only check (topics: version and every id/position/hash/byte length; lexicon: version and both counts), never by Wrangler's exit code; refusals and Wrangler's stderr reach the owner's terminal. Argon: pass. **Unverified:** any remote run (no agent has touched a remote database); the `--json` shape against a remote database is checked only against Wrangler's code.
- Today v2: V1 plan model (`nextIndex`, `doneCount`, `counts`, reader `title`) and V2 view (one card of ordered rows, expanded next step with the one filled button, aside of real counts, practise row, strings in en and zh) merged; `ui/card` written by hand because the shadcn output pulled in a wrong `cn` package and a ring. Verified: all checks, detector `[]`, build. Seen by the lead at 1280 px light and phone width dark, not by the owner. V3 (copy and two fixes) is in progress.

## 2026-10-24: D-remote-1 landed locally (publisher hygiene)

- All four publishers now run a rooted, env-file-free local D1 target through `scripts/content-service/d1Target.ts`: no `.dev.vars`/`.env` read, explicit persist path, no telemetry or banner, failure logs under `<root>/.pi-runs/`, pure `parseArgs`, an `allowRemote` option that is a no-op until the remote steps. The topic and lexicon SQL deletes the version row first. Real local Wrangler and `getPlatformProxy` run in temp-root tests.
- Found on the way: on Node 26 `.bin/wrangler --env-file x` is read by Node and exits 9 (Wrangler's launcher respawns `node` without `--`); the publishers and the owner's `W()` helper run `node --no-warnings -- .../wrangler-dist/cli.js`.
- Verified (exit 0 in the main checkout): typecheck, lint, format, shape, i18n, full suite (2,354), every CI pack `--check`, `vocabulary/publish.ts --check`, Worker typecheck, build. Argon reviewed the diff (fail on three test points; fixed). **Unverified:** any remote run; the typed `getPlatformProxy` import (root cannot resolve `wrangler` types, so it stays annotated by hand). Next: D-remote-2 and 3 (remote flags), D-origins.
- D-remote-2 landed (`8bbe800`): vocabulary `--apply-remote-unreviewed` and readers `--apply-remote` through the same proxy protocol, refused unless `allowRemote` (only from `import.meta.main`) and stdin and stdout are TTYs (one pure guard, both asymmetric cases tested); no test, workflow or default can reach remote. **Unverified:** any remote run. Verified in the main checkout: all checks exit 0, full suite 2,360.
- Today v2: direction B chosen; the plan failed its first Argon review and was redesigned (one card, one ordered sequence); second review pending.

## 2026-10-24: owner decisions on deployment, accounts and content rights (docs only)

- The owner confirmed the vocabulary book is their own work and publishable, and that Morphalou (open, LGPL-LR) needs no permission, only its notices (already built). Recorded as an amendment in `docs/adr-hosted-content-service.md`; the old "local use only / no public distribution / not authorized" lines in `worker/README.md` and `docs/vocabulary-flashcards-spec.md` were removed or reworded.
- Accounts are not part of the first deployment (public read-only, rate limited, CORS-limited). They stay H4 and come with charging, non-public content or sync.
- Found while writing this: the publishers have only a local apply path, so nothing can reach a deployed D1 yet (step D-remote in `TASKS.md`). The vocabulary manifest `attribution` field named a third-party AnkiWeb deck; the owner said the book is their own, so the field was removed everywhere (schema, manifest, scripts, tests). Re-publishing the local D1 is needed to serve the new manifest.

## 2026-10-24: grammar topics in book order, studied marks and a Today step (G1 to G4, C5)

- The Worker used to list topics `ORDER BY chapter, id` (alphabetical, so chapter eight came before chapter one). Topics now carry a `position`, the 1-based index in the committed manifest (the textbook's own order), published to D1 before the id sort and counted in the pack version; `/v1/topics` sorts by it. Position lives only in the list schema, not in full topics, the pack or drafts.
- A learner can mark a topic studied (`meta.topicStudied:<id>`, backed up, restored through the Settings handler too). The Topics page lists chapters in order with numbers, studied marks and a Next link; the topic page has the mark button and a Next topic link, including the two checkpoint topics. Today gains a last Grammar step only when a content service is configured: no request and no step otherwise; a failing list shows the real error on that step and never blocks the other four.
- Argon's review of the plan found six real problems before any code (a position leaking into full topics, the id sort overwriting the order, the reader never loading the list, the Settings restore omission, missing fixtures, a contradictory Today rule); all were fixed in the plan.
- Verified in the main checkout: typecheck, lint, format, shape, i18n, the full suite (2,336 tests), the UI detector, the build, the Worker typecheck and every CI pack `--check` exit 0.
- **Unverified:** a real service round trip after re-publishing local D1, the pages in three themes and at 360 px. **Not a teaching design:** the order is the textbook's; whether it suits zero-basis learners is the owner's or a teacher's call.

## 2026-10-24: Letter sounds practice button (S3b, C4)

- "Practise these sounds" in the Letter sounds section saves a Listening set of spelling-to-sound choices and opens it in Practice; `ItemRow` plays Listen with the device voice for items that declare it. The Practice caption names the spelling drill. Rule files and the `speechAfterCheck` comment name both device-voice sources.
- Verified in the main checkout: typecheck, lint, format, shape, i18n, the full suite (2,288 tests), the UI detector, the build and the pack `--check` exit 0. **Unverified:** hearing it on a real device voice, three themes, 360 px (the owner's).
- Known duplication left alone: the practice button and the reader dictation button share about 25 lines; extract only if a third caller appears.

## 2026-10-24: Letter sounds section and drill preparation (S2, S3a)

- The Speaking page has a Letter sounds section above French sounds: spellings grouped as vowels, nasal vowels, consonants and silent letters; a sheet per spelling with its note, the example words (each with a device-voice Listen button) and a closed "Show IPA" fold. No IPA is visible in the section itself, and the AI-check notice shows while any row is AI-reviewed only.
- `prepareSpellingDrill` and its schema are in (pure, no UI yet): distinct words, two distractor spellings whose sound differs and which are not inside the heard word, same group first, never the silent `h`; listening units accept the new marker. The 200-seed invariant tests run on the real pack.
- Verified in the main checkout: typecheck, lint, format, shape, i18n, the full suite (2,283 tests), the UI detector and the build exit 0.
- **My mistake, fixed:** in S1b I ran the pack `--check` and then `bun run format`, which reformatted the generated `src/data/spelling-sounds/patterns.json`, and I committed that file; the next `--check` failed and CI would have too. The generated pack is now in the formatter's ignore list like the other generated packs, and `--check` passes after `format`.
- **Unverified:** hearing the example words on a real device voice, the section and sheet in three themes and at 360 px. Those are the owner's.

## 2026-10-24: letter sounds data layer, seed content and AI review (S1, C1, C2, S1b)

- A reviewed-pack pipeline for spelling-to-sound content, modelled on the sound-pairs pack: schema (IPA symbols from any chart group, so `oi` is /w a/), a build gate that rejects an example containing a different-sound spelling, a nasal followed by a vowel or `n`/`m`, `oi` before `n`, and a silent `h` not at the word start; the row hash covers both locale notes; the review tool takes `--kind ai|human`; the loader and the CI `--check` line are in. No UI yet.
- Seed content for 16 patterns was written by Gemini (author) and passed the gate with 0 problems. An independent GPT review agreed every example word and IPA target and rejected 12 notes (English comparisons that mislead, nasal conditions too absolute, a circular `eu` note, unclear Chinese) and two example words (`vigne`, `phare`); its own replacement text was applied verbatim. The lead recorded 16 `AI review:` records. **Open:** the `ç` examples `déçu` and `façade` are above A1 and no gate-clean replacement exists.
- The plan was reviewed by Argon first (seven findings, all applied). Verified in the main checkout: typecheck, lint, format, shape, i18n, the full suite (2,265 tests), `--check` and the build exit 0.
- **Unverified:** everything about hearing the words; the labels say AI review, not teacher review, and a human language review is still the release gate for beginners.

## 2026-10-24: reader dictation page and device voice (D2)

- A graded reader page has a "Practise by dictation" section between the checkpoints and Mark read. It saves one Listening set of up to six of the reader's sentences (translation as the clue, French only as audio and as the reference answer) and opens it in Practice. Device voice only, no key, deterministic grading that ignores sentence punctuation; wrong answers go to Mistakes. `NumberDictationControl` takes the device engine from the item and no longer attaches French word lookup to a translated clue. Speech and UI rule files name the exception.
- Verified in the main checkout: typecheck, lint, format, shape, i18n, the full suite (2,240 tests), the UI detector and the build exit 0. The worker also probed that the new tests fail on the old control and on wrong navigation or retry behaviour. The plan was reviewed by Argon first (six findings, all applied).
- **Unverified:** a real device French voice (and iOS Safari), typing a full sentence on a phone, the section in three themes and at 360 px. Those are the owner's.

## 2026-10-24: reader dictation data and grading (D1)

- Added strict saved dictation provenance tied to the effective `NUMBER_DICTATION` type and nonblank audio; reused the reader schemas for identifiers and body versions. Listening gates are unchanged.
- Added pure reader-order-preserving sampling into one standalone Listening unit with translated clues, French audio/answers, edition metadata and save-only retry coverage. The existing published-reader schema owns the three-sentence minimum.
- Scalar grading ignores only the flagged sentence punctuation, replacing it with spaces; hyphens, apostrophes and strict accents remain significant. Unflagged and nonscalar grading are unchanged.
- Verified in the main checkout after the merge: typecheck, lint, format, shape, i18n, the full suite (2,224 tests), the UI detector and the build all exit 0. The grammar CLI test fixture now copies three pure reader modules because exercise metadata imports the reader schemas (`types/exercises.ts` now depends on `types/gradedReader.ts`; no import cycle). The plan was reviewed first by Argon (six findings, all applied). D2 (control, button, rule docs) is not built, so nothing is user-visible and no device voice was exercised.

## 2026-10-24: Today checklist (T1 to T4)

- Today is the page the app opens on (`#/today`; the Library stays at `#/read`). Up to four steps, each a link into an existing page with a status read from stored data: review words (real due and new counts), the next graded reader, sound pairs (always shown), and saved mistakes. "Done today" is derived from review, checkpoint and attempt timestamps in the local day; nothing new is stored. Plan: `docs/today-plan.md`.
- Static checks, the full suite (2,213 tests), the production build and the UI detector all exit 0 in the main checkout after each merge.
- Found while building: `vocabularyQueue` does not cap new cards at the daily limit, so Today caps them by the remaining allowance itself; a first wrong answer today is not a mistake "retry", so retries count only items wrong before today. Both have tests.
- The shared e2e fixture and 12 other specs entered the app with `goto('/')` and would have landed on Today; they now use `/#/read`, the same page as before. **No e2e was run.**
- **Unverified:** the Today page in light, sepia and dark and at 360 px, the first-run flow with onboarding, and Sound pairs audio on a real device voice. Those are the owner's.

## 2026-10-23: graded-reader flow and build evidence (R1-12)

- A real-bundle flow test covers all three bundled readers: strict right and wrong checkpoint answers, redo, read/unread/read, clicked-spelling authored vocabulary, TEST recordings, JSON backup and restore through the Settings import handler, malformed/absent/empty progress imports, and unavailable-edition history. **It found a real bug: Settings restore did not pass the reader grader, so restoring any backup with checked reader answers was refused and restored nothing. Fixed** (`BackupControls` now passes `gradeReaderQuestion`); the unit tests of the storage layer had passed because they injected the grader themselves.
- Build figures are in `docs/graded-readers.md` "Build evidence".

## 2026-10-24: graded-reader local publication and optional catalogue (R1-2b)

- Implemented immutable local D1 staging, exact readback before publication markers/catalogue and a final atomic current-pointer switch. The app retains bundle authority, adds validated remote editions, network-only saved-content fallback, committed Keep offline and guarded detail loading through the existing durable edition open.
- No service URL means no new requests or supplemental status UI. No real reader publication, D1 application, network or deployment performed. Changes are uncommitted for lead review. Static checks, 39 new tests, the full 2,123-test suite, Worker typecheck, build and UI detector all exit 0; raw logs are in the worker report. Visual/device acceptance remains owner-manual.

## 2026-10-24: Speaking information architecture

- Moved French sounds and Sound pairs creation/counts from Progress to Speaking landing with the shared dialog/save/open flow; Read aloud unchanged. Uncommitted; typecheck, lint, format, i18n, 2,077 tests, build and UI detector pass. `shape:check` fails on the unstaged removed file; its current-file logic passes. Visual/device acceptance remains owner-manual.

## 2026-10-23: graded readers, pronunciation result, grammar topics

**Done**
- Integrated starter-only graded-reader list and exact-edition Reader (R1-4b/5/6c/7/9b): snapshot-before-workspace, occurrence-bound authored sheets and saved words, device listening, serialized local checkpoints and explicit completion. Optional Ask AI is deferred; recording stays hidden until R1-10. No service catalogue or Article/unit copies. Static checks, 23 new tests, the full 2,071-test suite, production build and UI detector passed; visual/device acceptance remains unverified.
- Graded-reader authoring pipeline (R0): contracts and syllabus, private draft envelope and generator, tokenizer and machine gates G0 to G5, review sheet, owner-only review marking with `--kind`, assembly with a privacy scan, metadata-only CI check, operator doc. Stages 1 to 3 exist as private drafts with AI review records; they are not human-reviewed.
- Graded readers in the app (R1) so far: routes and navigation entries, Worker read-only readers resource, authored saved-word definitions in vocabulary (storage, search, answer, backup), explicit device-voice playback source through sequence, sentence bar and practice card. The bundled starter loader and export are being finished.
- Readable pronunciation result in the practice card (marks on the sentence, fixed strip, Details sheet) and clearing of a stale result when its take is gone.
- All 93 A1 grammar topics generated, reviewed twice by independent models, fixed and published to the local content database as AI-reviewed (not human-reviewed); a handful of Chinese and kinship wording items are left for a language reviewer.
- PR #32 (the long-running feature branch) merged into `main`; `feat/graded-readers` carries the new work.
- Documentation set reorganised: `AGENTS.md` is the map; `RULES.md`, `TASKS.md` and `PROGRESS.md` added.

**Broken or found along the way (all fixed unless noted)**
- A worktree `node_modules` symlink was committed and a merge replaced the real `worker/node_modules`; typecheck and lint failed while tests passed. Restored; the lesson is in `RULES.md`.
- The first real graded-reader runs exposed gate defects the synthetic tests did not cover: elided words glossed by their surface form, possessive and demonstrative determiners before a noun subject, a pre-nominal adjective between determiner and noun, the stage inventory for `y` and `moi`, subject recovery past clitics in completed prompts. Each now has a test that fails on the old code.
- The policy hash included the publication flags, so including a stage invalidated its own review. Fixed.
- A suite counted a failing run as passing once (a command chain hid the exit code). Fixed in the process; read exit codes.

**Unverified**
- Everything visual or device-bound: the pronunciation marks and strip at 360 px, the Details sheet, real Azure results, the new Words and Grammar screens, device French voices.
- The GitHub CI result of `feat/graded-readers` since its last push.
- Real-learner difficulty and vocabulary coverage of any graded reader; the proposed starter size budgets (not measured yet).
- The content service is not deployed (#31).

## Earlier

Pronunciation line (#49 to #52, Azure assessment #56 and #57), conjugation framework and drills, noun-gender reference and drills, vocabulary with FSRS-6, the hosted read-only content service (local), the Relire Plus merge phases 1 to 5: see `docs/roadmap.md` "Done" and `CHANGELOG.md`.
