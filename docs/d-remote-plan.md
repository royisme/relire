# Remote publication of the content service (D-remote, D-origins)

Status: draft for review (2026-10-24). Owner decision of 2026-10-24 (ADR `docs/adr-hosted-content-service.md`, amendment): the first deployment has no accounts, is public read-only, rate limited and CORS limited; topics, the lexicon, the vocabulary book (`unreviewed`) and non-bundled graded readers go up together. Platform only: no content changes, no deploy by an agent.

## Why

Every publisher has only a local apply path, so nothing can be loaded into a deployed D1. The owner needs one command per publisher that writes to the remote database with the same safety as the local run, run by the owner with their own Cloudflare access. No agent, script default or CI job may reach remote D1, log in, deploy or read credentials.

## Facts (code, 2026-10-24)

Publishers today (installed Wrangler 4.151.2, `worker/package.json:11`):

| Publisher | Local mechanism | Protocol |
| --- | --- | --- |
| Topics `scripts/grammar-topics/publish.ts` | writes `.local/grammar-topics/publish.sql` (`:76-77`), then `bunx wrangler d1 execute DB --local --file` with `cwd` from the module constant `repository`, not the `root` argument (`:81-82`), `stdout: 'inherit'` (`:84`) | replace in place: `DELETE FROM topics` first, rows, `packVersion` last (`:23-42`). No staging, readback or marker. |
| Lexicon `scripts/lexicon/import.ts` | writes `.local/lexicon/import.sql` in statements of at most 50 KB (`:16`, `:87-95`), then `bunx wrangler d1 execute DB --local --file`, `cwd` from `root` (`:105-110`) | replace in place: both deletes first, rows, `lexiconVersion` last (`:50-68`). No staging, readback or marker. |
| Vocabulary `scripts/vocabulary/publish.ts` | `getPlatformProxy` with `configPath` and `persist: worker/.wrangler/state/v3` taken from `vocabularyRepository`, not `root` (`:52-59`), `remoteBindings: false`, `envFiles: []`; bound parameters; per-command logs in `.pi-runs/vocabulary/` (`:62-74`) | `publishVocabularyBook` (`publication.ts:51-90`): compare existing bodies, `INSERT OR IGNORE` stage, read back every page and the manifest, validate the reassembled book, immutable marker `vocabularyPublished:<book>:<version>` read back, then one `vocabularyCurrent:<book>` upsert read back. |
| Readers `scripts/graded-readers/publishRemote.ts` | `getPlatformProxy`, `configPath` and persist from `root` (`:43-50`), `remoteBindings: false`, `envFiles: []` | `publishReaders` (`publication.ts:31-87`): collision check, stage, verify every body (SHA-256 recomputed) before any marker, `readerPublished:*` markers, immutable `readersCatalog:<hash>`, `readersCurrent` upsert last and read back; zero readers is a no-op (`:37`). |

- `tests/gradedReaderRemotePublish.test.ts:225` pins that `--remote` is refused. All publisher tests use in-memory adapters or SQLite; no test runs the real `getPlatformProxy` or the Wrangler CLI.
- Wrangler, `wrangler-dist/cli.js`: `--remote --file` does not split the file; it uploads it to the D1 import API (`:238145-238177`). Wrangler prints "if the execution fails to complete, your DB will return to its original state and you can safely retry" (`:238149`) and warns the database "will be unavailable to serve queries" while it runs (`:238113`). It prompts only when interactive and without `--yes`/`--json` (`:238457`). The local path splits the file and runs one `db.batch` (`:238070-238074`); the splitter removes `BEGIN TRANSACTION;`/`COMMIT;` (`:237651-237655`). `--persist-to <dir>` is local only and resolves to `<dir>/v3` (`:238007`, `:238050-238051`).
- `getPlatformProxy` takes `configPath`, `environment`, `envFiles`, `persist`, `remoteBindings` (default `true`) (`cli.d.ts:3398-3441`); a D1 binding is remote only when it has `remote: true` (`cli.d.ts:2384-2385`). A remote proxy session uploads a proxy Worker as an edge preview to the account (`cli.js:185748-185765`, `:185888-185896`).
- `worker/wrangler.jsonc:10` holds `REPLACE_WITH_D1_DATABASE_ID`, `:15` `ALLOWED_ORIGINS: ""`. `main` and `migrations_dir` are relative to the config file. `.gitignore:21` (`*.local`) covers `.local/` and `.env.local` but not a `.jsonc` file; `worker/.wrangler/` (`:38`) and `.pi-runs/` (`:44`) are ignored.
- The Worker serves topics and the lexicon straight from their tables; ETag is `"<packVersion>"` or `"<lexiconVersion>"` (`worker/src/index.ts:64-72`, `:170-174`); any D1 error is `500 unavailable` (`:175-179`).
- The app reads the service URL only from the build-time `VITE_CONTENT_SERVICE_URL`, trailing slash removed (`src/services/grammarTopics/service.ts:3`, `src/vite-env.d.ts:3`). `.github/workflows/pages.yml` sets no such variable, so the public build at `https://royisme.github.io/relire/app/` has no service.
- CI (`.github/workflows/ci.yml:29-41`) runs pack `--check`s for grammar pack, noun gender, minimal pairs, spelling sounds, topics publish, readers assemble and readers publish; it does not run `scripts/vocabulary/publish.ts --check`. No workflow mentions D1 or `--remote`.
- Sizes: lexicon 49,238 rows (5,022 entries, 44,216 forms; `worker/README.md:126`); 93 topics, largest body 13,024 bytes; vocabulary 30 pages of one version, largest body 108,810 bytes (about twice the 50 KB cap, so it cannot go through `--command`/`--file` SQL); readers: `data/graded-readers/syllabus.json` has 3 included stages, all bundled, so **0** non-bundled readers. Owner's local D1: migrations 0001 to 0003 applied, **0004 not applied** (no `readers` table), **lexicon empty**, no `.local/lexicon/import.sql`.
- Free-plan numbers come only from `worker/README.md:126` (pricing page read 2026-10-22): 100,000 rows written and 5 million read per day, 500 MB per database; it did not say whether index updates count.

## Design

1. **One target, two shapes, owner-local config.** A small module `scripts/content-service/d1Target.ts` owns the target: `{ remote: false, persistTo }` or `{ remote: true }`. It exports the Worker's installed executable (`worker/node_modules/.bin/wrangler`, so nothing is fetched by `bunx`), the deploy config path `worker/wrangler.deploy.jsonc`, and two pure functions, each with two real callers:
   - `d1ExecuteArgs(target)` for topics and lexicon: local `--local --persist-to <persistTo>`; remote `--remote --config worker/wrangler.deploy.jsonc`.
   - `platformProxyOptions(target)` for vocabulary and readers: local `{ configPath: worker/wrangler.jsonc, persist: { path: <persistTo>/v3 }, remoteBindings: false, envFiles: [] }`; remote `{ configPath: worker/wrangler.deploy.jsonc, remoteBindings: true, envFiles: [] }` with no `persist`.
   The `--apply-local` default `persistTo` is `<root>/worker/.wrangler/state`, today's directory. The owner's `worker/wrangler.deploy.jsonc` (gitignored) is a copy of the committed file with the real `database_id`, `"remote": true` on `DB` and the deployment `ALLOWED_ORIGINS`. The committed file is never edited.
2. **Topics and lexicon: same file, other flags.** `--apply-remote` runs the same SQL file through `d1ExecuteArgs`. On remote, safety rests on the import API as Wrangler describes it (whole file applied or rolled back), not on staging; this is written down as a limit, not hidden. After the file, both targets run one read-only check through `d1 execute --command ... --json` with stdout **piped and parsed, never echoed**: topics compare `packVersion` and every `(id, position, content_hash)` with the values the script computed (the stored `content_hash` is the value the SQL wrote, not a hash recomputed from the stored body); lexicon compares `lexiconVersion` and the two row counts. The query never selects `body` or `data`. A mismatch fails the run.
3. **Vocabulary and readers: same protocol, other binding.** `publishVocabularyBook` and `publishReaders` are unchanged; only the proxy options come from `platformProxyOptions(target)`. Vocabulary adds `--apply-remote-unreviewed` only (the deployed book is `unreviewed`; a reviewed remote mode waits for a recorded review), readers add `--apply-remote`. `--remote` and mixed flags stay refused. Bound parameters keep the 108 KB pages out of SQL text.
4. **Root and target reach the code.** Topics take `cwd` from `root`; vocabulary takes config and persist from `root`/target. The exported functions accept the target so a test can point at a second local D1; the CLI only maps flags to targets. No other option.
5. **Load order (owner).** Migrations, topics, vocabulary, readers (a no-op today), lexicon last, then `wrangler deploy`, then smoke checks. Loading before the deploy means no Worker serves the database while an import makes it unavailable. Each kind has its own version or pointer, so a stop between loads leaves the finished kinds complete and the others at their empty migration state (`0.0.0`, `404 book-unavailable`, `404 readers-unavailable`), never a half pointer.
6. **Budget.** Day one by row count: lexicon 49,239, topics 94, vocabulary 32 (30 pages, marker, pointer), migration seeds and bookkeeping a few: about 49,400 of 100,000. A same-day lexicon rerun adds about 98,477 (deletes plus inserts) and does not fit, so the lexicon runs at most once per UTC day. Vocabulary and readers reruns write almost nothing (`INSERT OR IGNORE`, one pointer upsert).
7. **Failure.** Topics/lexicon: a failed import leaves the previous state per Wrangler; rerun the same command. A failed readback after a complete import stops with the real error; the owner compares by hand (Owner checks) before rerunning. Vocabulary/readers: a stop leaves staged rows without marker or pointer; the old pointer (or none) keeps serving; rerun is idempotent. Raw errors keep going to the ignored `.pi-runs/*` logs; nothing prints prose.
8. **Hygiene (D-origins).** `.gitignore` gains `worker/wrangler.deploy.jsonc`. `worker/README.md` gets a deployment checklist: create the database, copy the config, set id, `remote: true` and origins, apply migrations with `--config wrangler.deploy.jsonc`, load in the order above, deploy with the same config, smoke checks. Published artifacts stay in `.local/`; logs in `.pi-runs/`. No workflow gains a remote step.

## Limits

- The offline proof does not exercise the remote branch. A second local D1 proves the protocol and readbacks through the real local Wrangler/miniflare; the remote branch is proven only by a pure assertion that it produces exactly the flags and options above. The first real remote run is the owner's.
- Topics and the lexicon are not staged: a later reload on a live service makes D1 unavailable for the import (500 for every route) and relies on the import's rollback. Staging them would need a schema change; not done for the first deployment.
- The lexicon check is aggregate (version and counts), not row-exact; topics are exact on stored hashes, not on bodies.
- The remote vocabulary/readers run creates a temporary edge-preview proxy Worker on the owner's account while it runs.
- Public read-only is not access control (ADR section 6); the limiter is approximate (`worker/README.md:21`).

## To verify before the steps

Before D-remote-1 (worker, local and read-only):
- That `d1 migrations apply DB --local --persist-to <dir>` exists in 4.151.2, so a second local D1 can get the schema.
- How long one real local Wrangler run and one `getPlatformProxy` start take, to decide whether the second-local-D1 tests belong in `bun run test` or run once as a recorded command.
- Whether local Wrangler runs contact the network (metrics, update check); today's `--apply-local` already runs them.

Before the owner's first remote run (owner, or a worker reading Cloudflare docs the owner supplies):
- That a failed `--remote --file` import really rolls back the whole file, and whether its rows written still count.
- Whether index updates and `DELETE` rows count toward rows written (check the dashboard after the first load).
- D1's limits on one bound value, row size and statement size, against the 108,810-byte page and 13,024-byte topic.
- Whether `remote: true` on `DB` changes `wrangler deploy` or `wrangler dev --config wrangler.deploy.jsonc`, and whether the edge-preview session needs a workers.dev subdomain enabled.
- That a non-interactive `--remote --file` (stdin ignored) proceeds after the warning without `--yes`.

## Steps (each lands separately)

The workers (gpt-6.1-sol or glm-5.3; `magpie quota` first) write code; an independent reviewer from another model family (Argon first) checks the diff against this plan. The lead re-runs in the main checkout: `typecheck`, `lint`, `format:check`, `shape:check`, `i18n:check`, the full `bun run test`, the Worker typecheck, every CI pack `--check` (`ci.yml:29-41`) plus `bun scripts/vocabulary/publish.ts --check`, and reads the exit codes. No step runs a remote command.

- **D-remote-1 (code, worker).** `d1Target.ts` with both pure functions; topics and lexicon `--apply-remote`, the installed executable, `cwd` from `root`, `--persist-to` for local, the piped read-only check. Tests: exact remote args (`--remote --config worker/wrangler.deploy.jsonc`), exact local args, check parsing and mismatch, nothing printed from stdout, a run against a second local D1 under a temp dir with fixture content (`tests/fixtures/grammarTopics.ts`, `tests/fixtures/morphalouCsv.ts`). Acceptance: `bun test tests/grammarTopicPublish.test.ts tests/lexiconImport.test.ts tests/d1Target.test.ts` exits 0, and `! grep -rnE -- '--apply-remote|--remote' .github/workflows` exits 0.
- **D-remote-2 (code, worker).** Vocabulary `--apply-remote-unreviewed` and readers `--apply-remote` through `platformProxyOptions`; vocabulary config/persist from `root`/target; the `:225` test updated so `--remote` and mixed flags are still refused; remote options asserted exactly (`remoteBindings: true`, deploy config, `envFiles: []`, no `persist`); `publishVocabularyBook` and `publishReaders` run through the real local proxy against a second local D1 with invented fixture content, including an interrupted run and an idempotent rerun. Acceptance: `bun test tests/vocabularyPublish.test.ts tests/gradedReaderRemotePublish.test.ts tests/d1Target.test.ts` exits 0.
- **D-origins (code and docs, worker; glm-5.3 is enough).** `.gitignore` line, the `worker/README.md` checklist and remote commands (replacing the "local only" sentences at `:86`, `:90`, `:100`, `:111`, `:115`), the TASKS/PROGRESS/CHANGELOG lines. Acceptance: `git check-ignore -q worker/wrangler.deploy.jsonc && grep -q REPLACE_WITH_D1_DATABASE_ID worker/wrangler.jsonc && grep -q '"ALLOWED_ORIGINS": ""' worker/wrangler.jsonc` exits 0.

## Owner checks (never done by an agent)

1. Local first: apply 0004 locally, run `bun scripts/lexicon/import.ts --apply-local`, re-publish topics and the vocabulary, so local versions are the reference.
2. Create the D1 database, write `worker/wrangler.deploy.jsonc` (id, `"remote": true` on `DB`, origins), `wrangler d1 migrations apply DB --remote --config wrangler.deploy.jsonc`.
3. Load in order: topics `--apply-remote`, vocabulary `--apply-remote-unreviewed`, readers `--apply-remote` (expects "No non-bundled readers selected"), lexicon `--apply-remote` once that UTC day. Read each exit code.
4. Read-only counts: `wrangler d1 execute DB --remote --config wrangler.deploy.jsonc --command "SELECT count(*) FROM topics"` (93), `lexicon_entries` (5,022), `lexicon_forms` (44,216), `vocabulary_pages` (30); compare with local.
5. `wrangler deploy --config wrangler.deploy.jsonc`. Then `GET` smoke checks on the deployed URL: `/v1/topics` 200 with ETag equal to local `packVersion`; `/v1/lexicon/être` 200 with ETag equal to local `lexiconVersion` and the Morphalou source; `/v1/vocabulary/tcf-7000?page=0` 200, `manifest.version` equal to local `vocabularyCurrent:tcf-7000`, `pageCount` 30, review `unreviewed`; `/v1/readers` `404 readers-unavailable`; an allowed `Origin` gets `Access-Control-Allow-Origin`, another origin gets none; `POST` gets 405.
6. Build the app with `VITE_CONTENT_SERVICE_URL=<deployed URL>` for the owner's own HTTPS build; the CORS list holds each such build's exact origin (no path; for the Pages site that would be `https://royisme.github.io`). Then the iOS Safari real-device checks that needed HTTPS (topics, wordbook download, lexicon word sheet, device voice).
7. Check the dashboard's rows-written figure after the first day.

## Questions for the owner

- **Public Pages build.** Should `pages.yml` set `VITE_CONTENT_SERVICE_URL`, so the free public build shows topics, the wordbook and the lexicon, and `https://royisme.github.io` goes into `ALLOWED_ORIGINS`? Default in these steps: `pages.yml` unchanged; only the owner's own build points at the service. The ADR (section 1) says the free build hides topics without a service.
- **localhost in production CORS.** Should `http://localhost:5173` be allowed so a local dev build can test against the deployed service? Default: not allowed.
