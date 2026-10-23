# PROGRESS

What is done, what broke, what is next, newest first. Short and factual; the next steps are `TASKS.md`, the direction is `docs/roadmap.md`, the history of the FrenchLab merge is `docs/merge-progress.md`, and what a learner can notice is `CHANGELOG.md`. The session-by-session working notes (`docs/HANDOFF.md`) are local only.

"Verified" means a check ran and its exit code was read. Anything that needs a browser, a device, a microphone, a real key or a deployed service is **unverified** until the owner has tried it.

## 2026-10-23: graded readers, pronunciation result, grammar topics

**Done**
- Integrated starter-only graded-reader list and exact-edition Reader in the worktree (R1-4b/5/6c/7/9b; uncommitted, lead acceptance pending): snapshot-before-workspace, occurrence-bound authored sheets and saved words, device listening, serialized local checkpoints and explicit completion. Optional Ask AI is deferred; recording stays hidden until R1-10. No service catalogue or Article/unit copies. Static checks, 23 new tests, the full 2,071-test suite, production build and UI detector passed; visual/device acceptance remains unverified.
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
