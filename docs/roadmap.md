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
| Conjugation, framework first (CP1 to CP6) | Engine in `src/services/conjugation/`; `conjugateVerb` AI task with engine-side verification (`pack-reviewed`, `rule-checked`, `partly-differs`, `ai-only`); framework copy (drafted, owner reviews); the Conjugation page under My study → Grammar (pack first, AI second, patterns for negation, est-ce que and inversion); word sheet pack table or link and reverse lookup; conjugation drills from reviewed and matching cells with strict accents | `docs/grammar-pack.md` Part 3 |
| Import source step | Thumbnails, up to five images per request (reading order), remove one image or the PDF, clear pasted text, discard in place without the leave dialog; the extraction mode select keeps a fixed height | `docs/merge-progress.md` (import), `CHANGELOG.md` |
| Practice as exercise sets | Practice lists sets in a table (search, level filter, sortable columns, delete with a named confirmation); a set page lists its exercises with per-exercise delete; "Add exercises" dialog holds import and "from an article"; Library and Practice tables share shadcn Table with TanStack Table | `DESIGN.md` "Data tables", `docs/architecture.md` |
| UI component library | shadcn/ui on Base UI is set up (`components.json`, `@/` alias, tokens mapped); only Table is generated so far; existing hand-written primitives are not migrated | `docs/conventions.md` "UI components" |

## Next

1. **Conjugation: owner reviews and content (Part 1 P6, Part 3 F9):** the owner reviews the framework copy (`.pi-runs/cp3/notes.md` has the sources), the reviewer leads in `docs/grammar-pack.md` section 12 item 6, and the irregular verbs to add to the pack (about 25, each `reviewed`). Everything else of Part 3 is built, including the ending highlight and rule table (#20) and device-voice tap-to-hear on forms (#19).
2. **Grammar topics (Part 2):** TP1 to TP4 are built (schema, gate, private generator, review CLI, reader under My study, tag links); three trial topics are generated and wait for the owner's review (`docs/HANDOFF.md`). Topic text is private data: it lives in a gitignored local folder and is published only to the content service's database, never to the repository or the bundle. Next: the owner reviews and approves ids, tags and the trial topics, then TP5 (bulk generation of the other 90, owner review loop, `include`, publish).
2b. **Hosted content service (ADR `docs/adr-hosted-content-service.md`, accepted):** a Cloudflare Worker with D1, read-only, for private topics and a learner-sized lexicon (about 5,000 lemmas); built and proven locally first, deployed by the owner later. Done: H0 (statements amended), H1 (Worker), H2a (app loaders, offline cache, topics hidden without a service), H2b (local publish script), H3a (lexicon data, import, endpoints, Morphalou notice). Next: H3b (word sheet: verb form and dictionary table for common verbs without a key, About attribution), a real local end-to-end run, then the owner's deployment. H4 accounts and paid access come before any charge.
3. **Noun gender tendencies (Part 4):** NP1 is built (schema, measurement, build gate, review sheet) and the Morphalou counts are recorded (15 of 17 candidate endings pass the 80% threshold; `-ure` 74% and `-e` 64% do not). NP2 is drafted: 337 A1 nouns (40 seed plus 297 agy-drafted, every gender agrees with Morphalou), all `draft`; sources and doubts are in `.pi-runs/np2/notes.md`. Next: the owner reviews the nouns and the 15 rules that pass (`bun scripts/noun-gender/review.ts print`, then `record`), then NP3 (Gender section, word-sheet tip, `GENDER_CHECK` drills).
4. **Integration e2e pass** when a batch of the above is assembled; then the owner's visual acceptance (three themes, 360 px, phone drawer).

## Backlog

Follow-ups, owner reviews and tech debt are tracked as GitHub issues on the repository (labels `grammar-pack`, `ux`, `needs-owner`, `tech-debt`); the first backlog is #11 to #27 (2026-10-19). This page keeps the direction, the issues keep the work items.

## Later

- Migrate the hand-written UI primitives (overlay Dialog/Sheet/Drawer, Segmented, MenuButton) to shadcn/Base UI components, one at a time, when the owner asks; the e2e suite asserts their behaviour.
- Lazy-load TanStack Table (it adds about 43 kB to the main chunk through the Library table) if first-load size matters.
- Optional scoring behind a Settings switch (auto-score after each shadowing take); no auto player mode in v1.
- Remaining test gaps recorded in `docs/merge-progress.md` (negative assertions that cannot fail; delete-batch and edited-sentence recordings).
- Real-device checks (iOS Safari, real microphone waveforms, device voices) and a real-provider smoke of `transcribeMaterial`.
- Launch (P6-D): open the PR and archive the FrenchLab repository, only when the owner asks.

## Deferred (decided, not started)

- Hosted tier on Cloudflare (Worker, D1) and accounts (Better Auth): deferred until edit cadence, corpus scale or accounts require it. The free GitHub Pages build stays as the free tier and would link to the hosted deployment. Requires an ADR amending the "no server" statements first. Rationale and the Argon and Opus reviews: `docs/grammar-pack.md` sections 10 and 11.
