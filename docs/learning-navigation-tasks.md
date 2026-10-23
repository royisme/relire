# Learning navigation implementation tasks

Authority: owner-approved `.pi-runs/learning-navigation/20261021/plan.md` (main worktree).

## Accepted decisions

- Explicit required unit and attempt `learningArea`: reading, grammar, listening, writing; no inference, migration, or legacy fallback.
- Reading, Grammar, Listening and Speaking are learning destinations. Writing appears only for saved writing units. My study retains Words, Mistakes and Shadowing.
- Area lists scope units before aggregation; complete sets retain mixed-area ownership and explicit whole-set deletion.
- Read aloud has durable source/sentence routes and reuses existing recording and assessment ownership.
- Existing stores, controls, transactions and history remain shared. Listening supports number dictation only; no new training products.
- Protected owner files and all real learner data remain untouched. Old shapes intentionally fail validation.

## Checklist

- [x] Inspect required project docs, rules, source callers, schemas, templates and tests.
- [x] Classification: required unit/attempt validation, backup snapshot, explicit producers, grammar-only history.
- [x] Import: editable confirmed area per unit, supported listening validation, mixed save/retry identities.
- [x] Canonical routes, learning sidebar, Study membership and real-link Grammar navigation.
- [x] Area-scoped lists, complete mixed sets, actual-area unit links and explicit deletion scope.
- [x] Durable Speaking / Read aloud entry and workspace using existing recorder/stats callback.
- [x] Update all callers, notebook retries, locale pairs, fixtures and active contracts.
- [x] Add focused unit coverage and mechanically update existing E2E fixtures without running E2E.
- [x] Run all required static/unit/build checks with raw logs; run UI detector once on changed targets.
- [x] Update completion and changelog, normal-hook explicit-file commit, verify final worktree and save implementation report.

## Verification

Checks run in this worktree on the committed content (`bun run …`, raw logs in the lead's ignored
`.pi-runs/learning-navigation/20261021/`):

- `typecheck`, `lint`, `i18n:check`, `shape:check`, `format:check`, `build --configLoader native`: pass.
- `test`: 1157 pass, 0 fail, 9820 assertions, 112 files (AI, speech and storage mocked; `fake-indexeddb`).
- Focused coverage: `tests/learningArea.test.ts` (explicit area at every boundary, listening support,
  mixed import retry identities, scoped aggregation vs complete set, retained history/grammar-only
  accuracy, requested generation goal) and `tests/learningNavigation.test.tsx` (Read aloud durability,
  wrong-area unit, complete tables/deletion scope, notebook retry, sidebar membership, service-free
  Grammar links, producer retry identity).
- UI detector: one mechanical run over the changed source targets returned `[]`. That is a pattern
  scan result, not visual acceptance.

Not verified here: any browser/E2E run, screenshots, real learner data, real AI/content service calls,
and manual visual acceptance. Existing E2E fixtures and selectors were updated mechanically but not run.
Old unreleased unit/attempt/backup shapes are rejected on purpose, with no migration or data reset.
