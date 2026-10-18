# Roadmap

What is done, what is next, what comes later and what is deferred. Updated whenever a task lands or a decision changes (owner rule, 2026-10-18). Merge history lives in `docs/merge-progress.md`; the live task state is the local-only `docs/HANDOFF.md`.

Principles that shape every item: nothing has shipped, so no compatibility code; smallest design; e2e only at integration milestones, units are gated by unit tests (`docs/conventions.md`, `docs/development.md`); implementation by workers (`docs/agent-delegation.md`).

## Done

| Area | What | Where |
| --- | --- | --- |
| Relire Plus merge | Phases 1 to 5 (foundation, practise, import, review loop), providers, speech, three-wave review | `docs/merge-progress.md` |
| Phase 6 | Display name "Relire Plus" (P6-B); FrenchLab backup import cancelled (P6-A); providers (P6-C) | `docs/merge-progress.md` |
| Cleanup | Compatibility code removed; one schema at DB version 1 | `docs/merge-progress.md` |
| Exercise model | Self-contained units (`setId`, `setTitle?`, `level`, `createdAt`); no material binding | `docs/merge-progress.md` |
| Import | Article import (Read) and exercise import (Practise); batches newest first, deletable | `docs/merge-progress.md` |
| Grammar pack P1 | Schema, generator, machine checks, delivery proof | `docs/grammar-pack.md` section 9 |
| Grammar pack P2 | Build with publish gate (only `reviewed` rows ship), review CLI, validated lazy loader, first pack of the 4 control verbs (reviewed by the owner 2026-10-18) | `docs/grammar-pack.md` section 9 |
| Conjugation engine to `src/` (CP1) and Morphalou oracle (P3) | Generator and rule tables live in `src/services/conjugation/`; offline oracle against Morphalou 3.1 (all four controls attested; the extra `st` for `être` 3pl is not adopted) | `docs/grammar-pack.md` Part 3 F2, section 5 |

## Next

1. **Conjugation, framework first (Part 1 P3 and Part 3):** CP2 `conjugateVerb` task and verification; CP3 framework copy; CP4 Conjugation screen, word-sheet change, reverse lookup; CP5 drills from any verb; CP6 sentence patterns (negation, questions, inversion); P6 reviewed irregulars. Owner reviews the language-reviewer lists (Part 1 section 12, Part 3 F9).
2. **Grammar topics (Part 2):** schema and builder, generator script (Gemini regenerates each topic from the local reference database; the owner reviews), reader under My study, cross-links from mistakes, practice items and Progress. Owner decides the open questions TQ1 to TQ11.
3. **Noun gender tendencies (Part 4):** measured rules by ending with real accuracy and exceptions, an A1 noun list, a Gender section, a word-sheet tip and `GENDER_CHECK` drills. Depends on the P3 Morphalou adapter. Owner decides NQ1 to NQ6.
4. **Integration e2e pass** when a batch of the above is assembled; then the owner's visual acceptance (three themes, 360 px, phone drawer).

## Later

- Optional scoring behind a Settings switch (auto-score after each shadowing take); no auto player mode in v1.
- Remaining test gaps recorded in `docs/merge-progress.md` (negative assertions that cannot fail; delete-batch and edited-sentence recordings).
- Real-device checks (iOS Safari, real microphone waveforms, device voices) and a real-provider smoke of `transcribeMaterial`.
- Launch (P6-D): open the PR and archive the FrenchLab repository, only when the owner asks.

## Deferred (decided, not started)

- Hosted tier on Cloudflare (Worker, D1) and accounts (Better Auth): deferred until edit cadence, corpus scale or accounts require it. The free GitHub Pages build stays as the free tier and would link to the hosted deployment. Requires an ADR amending the "no server" statements first. Rationale and the Argon and Opus reviews: `docs/grammar-pack.md` sections 10 and 11.
