# PROGRESS

What is done, what broke, what is next, newest first. Short and factual; the next steps are `TASKS.md`, the direction is `docs/roadmap.md`, the history of the FrenchLab merge is `docs/merge-progress.md`, and what a learner can notice is `CHANGELOG.md`. The session-by-session working notes (`docs/HANDOFF.md`) are local only.

"Verified" means a check ran and its exit code was read. Anything that needs a browser, a device, a microphone, a real key or a deployed service is **unverified** until the owner has tried it.

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
