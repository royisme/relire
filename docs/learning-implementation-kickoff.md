# Grammar and vocabulary: joint implementation kickoff

Status: **Sequencing and readiness handoff; implementation not started.** Requested by the owner on 2026-10-19 to combine feedback on the revised specifications and arrange work. This document is not authorization to launch agents, call content-generation providers, publish real data, push or deploy.

Specifications: [Grammar topic learning](grammar-topic-learning-spec.md) and [Vocabulary flashcards](vocabulary-flashcards-spec.md). Runtime source checked at `517ba2d`; `src/`, `scripts/` and `worker/` still match grammar's `2937d25` baseline. Read the latest committed specifications again at execution; do not dispatch from an old snapshot that lacks the owner's revisions.

## 1. Recommended order

**Implement and accept Grammar first; then implement Vocabulary on the accepted Grammar baseline.** The products are not logically dependent, but their integration files overlap. One full-stack writer at a time is the smallest safe arrangement; do not launch two whole-feature agents against this checkout.

| Integration surface | Grammar responsibility | Vocabulary responsibility after Grammar acceptance |
| --- | --- | --- |
| `practice/UnitView.tsx` | Choose topic workbench versus ordinary worksheet, one session | Add actual source descriptors to ordinary worksheet lookup without re-enabling topic lookup/AI. |
| `study/MistakeNotebook.tsx` and lookup callbacks | Render saved authored topic feedback, including deleted-source history | Add personal-bookmark source context only to ordinary worksheet lookup; retain the topic's key-free branch. |
| `study/StudyView.tsx`, App and navigation | Preserve existing grammar entry/ownership | Wire Words routes/read model and request-scoped bookmarks; preserve Grammar routes/ownership. |
| `storage/db.ts`, backup controls and tests | Preserve topic unit/attempt metadata and exercise reset tokens | Validate paired vocabulary metadata and replace only its owned namespaces; retain all topic fields/tokens. |
| Locales, `PRODUCT.md`, `DESIGN.md`, architecture/rules | Document the actual implemented topic pilot | Extend the same documents without reverting topic behavior or reviving removed keys. |
| `InlineMarkup`/worksheet lookup and controls | Optional lookup capability, absent for topic exercises | Pass real callbacks only for ordinary lookup-enabled paths; no interactive no-op or new global lookup layer. |

Grammar does not need a shared scheduler or unified learning-engine abstraction with vocabulary. Exercises have deterministic checks/attempts; vocabulary has self-ratings/minute and day schedules. Keep those models separate.

## 2. Start gates versus content/publication gates

A content decision must not block implementing schemas, UI and storage with synthetic fixtures. Conversely, passing mocked tests does not authorize real publication or establish content quality.

| Gate | What needs authorization/evidence | Work permitted before it |
| --- | --- | --- |
| G-code | Owner says to implement the grammar spec's existing section 12 defaults, including the reference-only scope change and full-learning revision hash. | This documentation/readiness pass only. |
| G-content | Authority to draft/check the twelve private first-chapter questions, record the actual reviewer and apply reviewed payloads to **local** D1. | Once G-code is approved, implement and verify the whole grammar flow using valid synthetic six-question topics. |
| V-code | Owner says to implement the vocabulary spec's existing defaults: shared canonical cards, reveal-time quota, specified scheduler, local durable-first writes and read-only book-delivery code. | Documentation; later execution starts only after G-code integration is accepted. No new scheduler/dependency is implicitly approved. |
| V-content | Owner selects/accepts the C1 omission-review method and corrected stable corpus artifact, names the real review authority and authorizes local D1 application. | After V-code authorization, implement grouping/recorded omissions/pipeline/service/UI and tests with invented fixtures; do not infer C1 from frequency or silently add a new corpus. |
| Public delivery | Owner confirms distribution rights and accepts complete-book download/scraping exposure; paid access additionally requires the ADR's access-control step. | Neither task includes remote D1 writes or deployment. Local synthetic tests need no public-distribution approval. |

Vocabulary C1 decisions apply to the system-supplied book, not deletion/filtering of personal bookmarks. Frequency can be supporting evidence, never an automatic CEFR threshold. The owner must settle whether the broad regional-only exclusion retains standard French-Canadian vocabulary useful for TCF Canada; do not silently choose that policy or a new third-party frequency source. Record concrete private keep/omit decisions before V-content approval.

No UI spacing, alternative course modes or algorithm menus remain to be designed before code authorization. Grammar's full-learning hash is the default, not an instruction for an agent to choose between hashes. Vocabulary's mature equal-interval limitation is likewise explicit, not permission to introduce FSRS.

## 3. Implementation batches and exit evidence

### Batch G: one complete Grammar pilot

1. Start an isolated worktree from the approved-spec checkpoint on the designated development line, following [agent-delegation](agent-delegation.md). The implementer uses the project's explicitly configured model/tooling; the lead owns scope and acceptance. No real authoring calls/publication are implicit.
2. Build a vertical recognition journey using a complete valid 3×2 synthetic payload: load without exercise writes, retain the missing-row reset token, answer, guarded lazy ensure, deterministic check, authored feedback and same snapshot in Practice/Mistakes. Do not weaken the schema to a one-question payload.
3. Complete typed questions, both topics, bilingual labels/feedback, revision retention, deletion/reset races and backup. Keep ordinary worksheets unchanged. Guarded ensure must validate the entry token in `units`/`meta` before creating a row; stale prepared sessions cannot resurrect deletions.
4. Run the grammar spec's fast checks during work. At the complete batch, the lead re-runs checks and performs the single milestone browser suite after the 5174 port guard. Supply raw results and an independent read-only diff review. Fix real findings before local integration.
5. Accept G-code with no-key synthetic flows, both locales/viewports/themes and the specified persistence/race guarantees. If G-content is unapproved, report **code verified, real content pending**; do not claim the local real-content pilot is complete. With authorization, finish the reviewed twelve-question local acceptance separately.

### Integration checkpoint

Integrate accepted Grammar locally on the designated branch only; no main merge/push/deploy. Record the accepted code commit and check artifacts. Start Vocabulary from **that commit**, not the original `517ba2d` runtime snapshot. This is the serialization boundary for shared files.

Before vocabulary edits, list Grammar's changed shared files and existing new tests. Its topic-specific UI branch and metadata contracts are now the baseline to preserve; do not overwrite them with older vocabulary scaffolding.

### Batch V: one complete Vocabulary feature

1. Implement the vocabulary spec's packages A–D as one integration batch, not independently shipped partial shape changes. Finish canonical bookmark save/remove/context actions, the scheduler/queue, row-owned transactions and paired backup contracts together with their callers.
2. Add the staged/versioned book publisher and read-only delivery using synthetic content, then complete download/cache/browser/review UI. Preserve the owner's cuts: unchanged HTTP error type, no client Retry-After parser, existing vocabulary e2e rewritten, house Input primitive added only if it requires no new package.
3. Re-run all fast checks and one milestone browser suite. Include both specs' scenarios, not only vocabulary tests. In particular prove that vocabulary backup replacement preserves topic snapshots/`topicResult`/exercise reset tokens, and that ordinary worksheet bookmark wiring does not enable lookup/AI in topic practice or its Mistakes feedback.
4. Perform independent read-only diff review and lead verification before local integration. Report V-code separately from V-content/public availability. Apply real book data only through the owner-approved corrected artifact/local publisher gate.

This deliberately leaves no second full-stack worker racing on shared integration files. If the owner later requests parallel implementation, first approve explicit disjoint file ownership and an integration writer; worktree isolation alone does not resolve competing interfaces or test-port ownership.

## 4. Execution safety and evidence

- One writer per checkout, artifacts under ignored `.pi-runs/`; private drafts/data under `.local/`. Never pass `.env`, browser credentials, API keys or the full private corpus to an ordinary code reviewer.
- Test with `freshDb()` and disposable browser contexts/profiles. Do not clear the owner's IndexedDB or create an unreleased migration/legacy reader. Encountering incompatible personal development data means stop and use an owner-approved isolated profile, not automatic destruction/conversion.
- Only one Playwright process across all worktrees. Check 5174 is free, use `CI=1`, isolate a failing spec before diagnosis and preserve user-owned servers on 5173/8787. Manual visual acceptance, no screenshot-diff gate.
- Baseline command groups are in each spec. Grammar's metadata-only publisher check stays green after vocabulary changes; vocabulary's new metadata-only check must not require the real source. Report mocks, actual executed checks, failures and build warnings honestly; old 984-test results are not feature evidence.
- Each user-noticeable code batch gets its real `CHANGELOG.md` entry and updated ownership docs in the same local commit. Stage by named files. Independent reviewers never fix their own findings in the same review pass.
- Content authorship/review is truthful. Do not impersonate owner approval, publish unreviewed data, infer a learner's mastery or fabricate missing examples/audio.
- No new package/provider/service, real-generation call, destructive reset, public-data publication, push/PR/remote D1 write/deployment without the corresponding approval. Check current quotas/availability at actual dispatch, not by repeating the spec's historical smoke-test claims.

## 5. Minimal kickoff instruction

The owner can authorize the code lane with: **Implement Grammar first using its current defaults and synthetic fixtures; after its checked local integration, implement Vocabulary from that baseline. Keep real authoring, review marking, data application and public delivery behind their separate approval gates.**

This is a proposed kickoff instruction, not a claim that it was given. If the owner also authorizes real local content work, record that explicitly against G-content/V-content, with reviewer identity and vocabulary omission policy. Do not ask again about already fixed UI/type details.
