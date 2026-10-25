# Drizzle for the content service's D1 (step RS4)

Plan of record. Written 2026-10-24 on the owner's instruction ("start writing the RS4 Drizzle plan"). Nothing here is built. It needs a review (gpt-6-astra while Argon has no quota) before any worker is dispatched. `docs/remote-settings-plan.md` "Not in this plan" required this plan to say what Drizzle buys against a new dependency before any code; sections 2 and 3 do that, and section 3 ends in a recommendation the owner decides.

## Facts (read 2026-10-24)

- **Schema.** Four migrations, 56 lines in all, hand-written: `0001_init.sql` (`topics`, `meta`, and the seed row `meta('packVersion','0.0.0')`), `0002_lexicon.sql` (`lexicon_entries`, `lexicon_forms`, the `lexiconVersion` seed and indexes), `0003_vocabulary.sql` (`vocabulary_pages`, composite primary key, `CHECK (page >= 0)`), `0004_readers.sql` (`readers`). `worker/wrangler.jsonc` sets `migrations_dir: "migrations"`. Nothing is deployed and no remote database exists.
- **Worker reads.** Eleven `prepare(...).bind(...).first()/all()` calls in `worker/src/topics.ts`, `lexicon.ts`, `vocabulary.ts`, `readers.ts`, each a single-table `SELECT` with at most one `ORDER BY`. Row types are hand-written generics at the call sites (`first<{ body: string }>()`).
- **Publishers.** Topics (`scripts/grammar-topics/publish.ts`) and the lexicon (`scripts/lexicon/import.ts`) generate SQL **text**: single-row and multi-row `INSERT`s of about 50 KB per statement, applied with `wrangler d1 execute --file` (`d1ExecuteSpawn`). Vocabulary (`scripts/vocabulary/publication.ts`) and readers (`scripts/graded-readers/publication.ts`) run `INSERT OR IGNORE` / `ON CONFLICT ... DO UPDATE` through a `getPlatformProxy` binding with `DB.prepare(...).bind(...)`. Their publisher tests run against a real local Wrangler/D1 in a temp root, so a column that drifts from the migrations already fails a test today.
- **Worker tests.** `tests/fixtures/workerDb.ts` fakes the D1 binding over `bun:sqlite` and implements only `prepare().bind().all()` and `.first()`, loading the four migration files by name (`0001_init.sql` ... `0004_readers.sql`). `tests/d1Target.test.ts` copies `worker/migrations/0001` to `0004` into a temp root.
- **The other project already does this.** `my-tanstack-app` uses `drizzle-orm` ^0.45.3 with `drizzle(env.DB)` from `drizzle-orm/d1`, `drizzle-kit` ^0.31.11 (`drizzle.config.ts`: `schema: ./src/server/schema.ts`, `out: ./drizzle`, `dialect: sqlite`), generated files `0000_silly_mongu.sql` plus a `meta/` folder, and wrangler's `migrations_dir: "drizzle"` pointing at it. So generated migrations coexisting with `wrangler d1 migrations apply` is proven there. Its own unit tests never fake the Drizzle/D1 chain.
- **Not verified here (spike gates):** `drizzle-orm` is not installed in this repo. How the D1 driver calls the binding (it very likely uses `raw()` and `run()` as well as `all()`, which the Worker test fake does not implement); the bundle-size cost in the Worker; whether `drizzle-kit generate` can express every statement of the four migrations (composite primary key, `CHECK`, indexes) and the seed `INSERT`s (it cannot generate data, only a custom migration can carry them); D1's cap on bound parameters per query (believed to be 100; not read from Cloudflare's current documentation), which matters if any multi-row insert moved to a builder.

## What Drizzle would give, and what it would not

Gives:
1. **The schema in one TypeScript file.** Today the table shapes live in four SQL files, in the publishers' column lists and in hand-written row generics; a rename touches all of them.
2. **Typed reads in the Worker.** The eleven queries return rows typed from the schema instead of hand-annotated generics; a misspelt column fails `tsc`.
3. **Generated migrations**, with the `meta/` snapshot for later diffs, the same workflow as `my-tanstack-app`.

Does not give:
- **Safer publishing.** The SQL-text publishers cannot use the query builder (they emit files for `wrangler d1 execute --file` and size statements to about 50 KB). The two proxy publishers could, but a builder produces one parameterized statement per row set and could hit the bound-parameter cap; their current `INSERT OR IGNORE` and `ON CONFLICT` forms are already tested against a real local D1. Drift between a publisher and the schema is already caught by those tests.
- **Fewer lines.** It adds a dependency (`drizzle-orm` in `worker/`, `drizzle-kit` as a dev dependency), a schema file, a config file and a test-fake extension, to replace eleven small queries.
- **A runtime or deployment change.** Responses, ETags and statuses must stay byte-identical.

## Options and recommendation

- **A. Do not adopt Drizzle.** Keep hand-written SQL. Cost: none. Loses the typed reads and the shared schema file with `my-tanstack-app`.
- **B. Minimal adoption (recommended if the owner wants Drizzle).** `worker/src/schema.ts` as the single schema; regenerate migrations from it (allowed: nothing is deployed, AGENTS.md forbids migrations for unreleased states); the Worker's eleven reads move to Drizzle; **publishers and their SQL stay exactly as they are**. The existing publisher tests then prove the schema and the publishers still agree.
- **C. Full adoption.** B plus the two proxy publishers on the builder. Not recommended: no second benefit beyond B, a real risk with statement size and bound parameters, and the remote publishers are the code least safe to churn before a first deployment (they have never touched a remote database).

The recommendation, stated plainly: the gain is real but modest, and A is a legitimate answer. If the owner's reason is consistency with `my-tanstack-app` or typed reads, take B and run the spike below before committing to it.

## Design (option B)

- `worker/package.json`: `drizzle-orm` (exact version) as a dependency, `drizzle-kit` as a dev dependency, a `db:generate` script. `worker/drizzle.config.ts`: `schema: './src/schema.ts'`, `out: './migrations'`, `dialect: 'sqlite'`. `worker/wrangler.jsonc` keeps `migrations_dir: "migrations"`.
- `worker/src/schema.ts`: `sqliteTable` definitions for `topics`, `meta`, `lexicon_entries`, `lexicon_forms`, `vocabulary_pages` (composite primary key and `check('page >= 0')`), `readers`, with the same column names, types, nullability, primary keys and indexes as today.
- **Migrations regenerated, not appended.** The four hand-written files are replaced by one generated DDL migration plus one custom migration (`drizzle-kit generate --custom`) holding the two seed rows (`packVersion`, `lexiconVersion` = `0.0.0`). Equivalence is proven mechanically, not by reading: a test applies the old four files (kept in the test as a fixture of the previous DDL only for the comparison, then deleted in the same step) and the new set to two empty in-memory databases and compares `sqlite_master` and `PRAGMA table_info` for every table, plus the two seed rows.
- **Worker reads** use `drizzle(env.DB)`; the resource functions keep their signatures and return the same `{ body, version }`/error shapes; `ORDER BY` clauses and `LIMIT`s are unchanged. Hono routes, middleware and auth are not touched.
- **Test fake.** Extend `tests/fixtures/workerDb.ts` only as far as the Drizzle D1 driver needs (`raw()`, `run()` as the spike finds), or, if that grows beyond a few lines, run the Worker tests against a real migrated `bun:sqlite` through Drizzle's own driver adapter. The choice is made in the spike with evidence.
- **Publisher tests and `d1Target.test.ts`** follow the new migration file names (they list `0001` to `0004` by name today); a helper reading the `migrations` directory in order replaces the hard-coded lists.
- Nothing else changes: `scripts/*/publish*.ts`, `d1Target.ts`, the response bodies, the access key, the runbook commands (`wrangler d1 migrations apply DB --local|--remote` still applies the directory).

## Steps

- **RS4a Spike (no commit unless all gates pass).** In a worktree with its own installs: install `drizzle-orm`/`drizzle-kit` in `worker/`; write `schema.ts`; run `drizzle-kit generate` and show the SQL; apply it with `wrangler d1 migrations apply DB --local` into a temp state dir; compare `sqlite_master`/`PRAGMA table_info` with a database built from the four current files (must be identical apart from the order of statements and Drizzle's naming of indexes, which are listed); convert `topics.ts` only and show what the D1 driver calls on a fake binding; measure the Worker bundle size before and after (`wrangler deploy --dry-run --outdir`, no login, no remote); read Cloudflare's bound-parameter limit. Gates: (1) every statement expressible or covered by the custom migration, (2) the schema comparison is identical, (3) the fake needs at most a few lines, (4) no remote command was needed, (5) a bundle-size number is recorded. A failing gate ends in "do not ship" with the evidence.
- **RS4b Wire (option B).** Only after RS4a passes and the owner confirms option B: `schema.ts`, regenerated migrations, the eleven reads, the test fake, the migration-listing helper, `worker/README.md` and `docs/development.md` lines about migrations, `docs/architecture.md`. Acceptance: every existing Worker test passes unchanged in its response expectations; the schema-equivalence test passes; the publisher tests, `d1Target.test.ts`, Worker typecheck, full suite, build and the CI `--check`s exit 0 in the main checkout; `dist` content hash unchanged.
- The lead writes docs, `TASKS.md`, `PROGRESS.md` and any `CHANGELOG.md` line (none expected: nothing a learner can notice). Each worker diff gets a review.

## Risks

- A generated migration name (`0000_adjective_noun.sql`) is random and appears in `wrangler`'s `d1_migrations` table once applied to a real database; regenerating after a first deployment would break the history. So this must land **before** the first remote migration. The owner is about to deploy; if RS4 is not wanted before that, choose A and never regenerate later.
- A dev dependency pulling a second SQLite/driver stack into `worker/node_modules` (CI runs `bun install --cwd worker --frozen-lockfile`): measure install time in the spike.
- Drizzle's `$inferSelect` types for `INTEGER`/`TEXT` columns that store JSON strings stay `string`; no behaviour change, but do not add JSON column modes (the Worker parses bodies itself).
- The `RS3` dev plugin bundles the Worker with Vite; the spike must start `bun run dev` once and read `/v1/topics` with a key to prove Drizzle bundles there too.

## Questions for the reviewer

1. Is option B really smaller and safer than A for what it buys, and is the recommendation honest about A?
2. Does regenerating migrations before the first deployment break anything the runbook or the publishers rely on (file names in `d1Target.ts`, tests, CI, `worker/README.md`)?
3. Are the spike gates enough to decide, and is anything in "Facts" wrong or unverifiable from the repository?
