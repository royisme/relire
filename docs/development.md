# Development: commands and checks

Bun is the only package manager. The delivery checklist (which checks must pass, changelog, commit, report) belongs to the `ship-change` skill (`.claude/skills/ship-change/SKILL.md`); this page only says what each command does.

Development handoff: [Built-in vocabulary and flashcards specification](vocabulary-flashcards-spec.md) defines the shared wordbook/bookmark identity, scheduling, storage and acceptance contract. The integrated code path uses synthetic verification; real vocabulary corpus application and public delivery remain separate operations. Reviewed publication is the default; the owner has waived linguistic review for local use only.

## Run and build

- `bun install`
- `bun run dev`: Vite on :5173.
- `bun run build`: static site in `dist/`, with the PWA service worker.
- `bun run preview`: serve the built site.
- `bun scripts/grammar-pack/build.ts`: generate `src/data/grammar-pack/pack.json`; P2 requires matching owner reviews for every included verb. `packDate` in `data/grammar-pack/verbs.json` is hand-set; builds never read the clock.
- `bun scripts/grammar-pack/build.ts --check`: regenerate in memory and reject any byte difference from the committed pack (also in CI).
- `bun scripts/grammar-pack/review.ts print <verbId...>`: print the generated tables before review; only the owner runs `record <verbId...> --by "<name>" --ref "<reference>"` to append review records. `data/grammar-pack/reviews.json` holds the owner's records for the four controls.
- `bun scripts/grammar-topics/seed-manifest.ts --reference <directory>`: read only metadata from the reference directory's SQLite database, append missing manifest entries, never overwrite an entry. All new entries are excluded. The 93 hand-proposed English ids and T4 tag defaults need owner approval; the ten chapters use `chapter-one` through `chapter-ten`. Chinese chapter labels live only in `zh.json`.
- `GRAMMAR_REFERENCE_DIR=<directory> bun scripts/grammar-topics/generate.ts generate --chapter <id> [--only K016,K017] [--force] [--retries 2] [--dispatch <script>] [--reference <directory>]`: generate private drafts, sequentially in groups of at most six. `--reference` overrides the environment variable; there is no default. Both commands refuse a reference realpath inside the repository or missing `topics/` or `library.sqlite3`. Resume skips valid drafts; `--force` replaces them only after validation; retries use fresh directories and only failed topics. Any final failure exits 1 and reports the outcome, error, kept temp directory and ignored log path.
- Generation normally calls `scripts/pi-dispatch.sh` with `antigravity/gemini-3.8-flash`, sending topic files to an outside service. **Only the lead runs real generation after owner authorization.** Unit tests use invented TEST references and an executable fake `--dispatch` only. `generate.ts --help` documents the replacement dispatch's five arguments. Each temporary directory contains only that group's topic files, the draft schema, task and dispatch files. The child environment drops `GRAMMAR_REFERENCE_DIR` and names containing `KEY`, `TOKEN` or `SECRET`; this is not a sandbox. Logs may contain private text and stay under ignored `.pi-runs/grammar-topics/`.
- `bun scripts/grammar-topics/generate.ts sheet [--chapter <id>] [--status draft]`: print full private reference/learning text, bilingual instructions/titles/teaching and all question/verdict/distractor feedback, ordered options, expected/accepted forms and strict normalization keys with schema-validated collision results, outline, uncertainty, persisted verbatim-example warnings and stale prompt hashes to the terminal. Do not redirect it into a tracked file. The generator performs only NFC and French apostrophe normalization (`fr`, `prompt`, `expectedAnswer`, `acceptableAnswers[]`, `feedback.byAnswer[].answer`; EN/ZH apostrophes stay unchanged); validation is structural, not a linguistic or licence review. The sheet lists independent review objectives, never automatic linguistic approval. Only K001/K002 are prompted for complete 3×2 learning; reference-only topics remain valid.
- Owner only: `bun scripts/grammar-topics/review.ts mark <topicId...> --by "<name>"` appends content-hash records; `unmark <topicId...>` removes records. It does not edit draft status or manifest inclusion. Never commit drafts; only the owner decides inclusion and publishes reviewed content.

- `bun scripts/grammar-pack/oracle-diff.ts [verbId...]`: offline-only simple-tense/participle comparison, stdout and ignored `.local/oracle/<verb>.txt` reports; never run in CI or bundle the oracle.
- `bun scripts/grammar-pack/oracle-diff.ts attest [verbId...]`: record current row hashes only for verbs with zero uncovered disagreements; only the owner writes disagreement decisions in `data/grammar-pack/oracle-attest.json`.
- `MORPHALOU_DIR`: oracle directory, default `.local/morphalou/csv/Morphalou3.1_formatCSV` relative to the repository root; stale attestations are ignored and reported by the build.
- `bun scripts/noun-gender/measure.ts`: count dictionary figures per candidate noun ending over single-word gendered lemmas of the offline Morphalou commonNoun file (reads `MORPHALOU_DIR`); prints a table and writes integers only to ignored `.local/noun-gender/measurement.json`.
- `bun scripts/noun-gender/measure.ts attest`: write the last measurement into `data/noun-gender/oracle-attest.json`; owner-only, and only after NQ6 (licence) is confirmed.
- `bun scripts/noun-gender/build.ts`: assemble `src/data/noun-gender/pack.json` from the A1 noun list, candidates, attest and reviews; candidates below the dictionary threshold (80%, n ≥ 30; a candidate's `override` decision ships it anyway, a `hold` never ships it) or without an attest record are dropped, unreviewed rows fail the build. No pack is committed yet.
- `bun scripts/noun-gender/build.ts --check`: regenerate in memory and reject any byte difference from the committed pack (fails while no pack exists).
- `bun scripts/noun-gender/review.ts print <id...>`: print noun rows and derived rule tables (dictionary figure, A1 figure, examples, exceptions) before review; only the owner runs `record <id...> --by "<name>" --ref "<reference>"` to append review records to `data/noun-gender/reviews.json`. An id can name both a noun and a rule (`age` is the noun `âge` and the rule `-age`; so is `eau`): `print` shows both and `record` records both.

## Run the content service locally

From the repository root, install the Worker dependencies, apply the migration to local D1, and start the service on its default port 8787. The origin flag allows the app's local Vite origin (the Worker otherwise denies cross-origin access):

```sh
bun install --cwd worker
cd worker
bunx wrangler d1 migrations apply DB --local
bun run dev --var ALLOWED_ORIGINS:http://localhost:5173
```

In the app root, create the gitignored `.env.local` with `VITE_CONTENT_SERVICE_URL=http://127.0.0.1:8787`, then run `bun run dev` in another terminal and open `http://localhost:5173`. Without that variable, Grammar shows only Conjugation. Local D1 starts with no published topics.

From the repository root, `bun scripts/grammar-topics/publish.ts` runs the existing reviewed-only gate over the manifest, hash-bound reviews and private `.local/grammar-topics/drafts-<chapter>.json` arrays, then writes private `.local/grammar-topics/publish.sql`; `--apply-local` also replaces the local D1 topics (apply the migration above first). Excluded ids are listed; zero included topics clears the published set. Static topic/tag-index artifacts and the `build.ts topics` target are gone. CI uses `bun scripts/grammar-topics/publish.ts --check` to validate public metadata and chapter labels only, without reading `.local/`. See `worker/README.md` for owner publishing instructions.

To load the lexicon locally (common verbs' simple tenses and the word sheet's "Verb form" lines for verbs outside the grammar pack), apply both migrations as above, then from the repository root run `MORPHALOU_DIR=/path/to/Morphalou3.1_formatCSV bun scripts/lexicon/import.ts --apply-local` (the original Morphalou 3.1 download is not in the repository; `MORPHALOU_DIR` defaults to `.local/morphalou/csv/Morphalou3.1_formatCSV`). Without the load every lexicon lookup is a 404 and the word sheet looks as it did before; see `worker/README.md` and `worker/NOTICE.md`.

## Vocabulary private tooling and synthetic verification

- `bun scripts/vocabulary/prepare.ts --source <absolute file>` reads one stable byte snapshot, applies recorded `.local/vocabulary/decisions.json` corrections/omissions and writes ignored normalized content, report and review sheet. No default source path or source rewrite. Set actual attribution metadata before preparation; public files contain metadata/hashes only, never corpus text. Never run against real content without owner authorization.
- Owner only for real content: `bun scripts/vocabulary/review.ts print`, then `mark --by <actual authorized reviewer>`. Content changes invalidate review. C1/Canadian-usage/rights decisions are not machine checks and never filter personal bookmarks.
- `bun scripts/vocabulary/publish.ts --check` validates public metadata only, no private reads. Without flags it prepares private staging SQL only; both staging and `--apply-local` require an actual matching review. Owner-authorized `--apply-local-unreviewed` instead binds `{ bookId, contentHash, status: 'unreviewed' }` to the current prepared artifact, even if an actual matching review exists. It never reads partial correction/omission decisions or writes `reviews.json`. For the owner's original unfiltered local corpus, prepare without partial AI decisions; this mode does not undo omissions already in an artifact. Both apply modes use the same installed local Wrangler, immutable staging, exact body/aggregate validation, publication-marker verification and atomic pointer switch/readback. No remote mode, migration application or validation bypass; never apply `publish.sql` as a substitute. The local waiver is not linguistic/CEFR/Canadian-usage approval or public distribution permission; it makes no official C1 claim. No real import is claimed here. Raw Wrangler output stays ignored; no corpus text printed.
- `bun test tests/srs.test.ts tests/vocabulary.test.ts tests/vocabularyDurability.test.ts tests/vocabularyBook.test.ts tests/vocabularyPublish.test.ts tests/vocabularyUnreviewed.test.ts tests/vocabularyWorker.test.ts tests/grammarTopicBackup.test.ts` uses disposable fake IndexedDB/SQLite and invented content. Worker checks also retain `tests/worker.test.ts` and `tests/lexiconWorker.test.ts`.
- Lead-owned browser milestone: rewritten `e2e/vocabulary-review.spec.ts` and updated saved-word crosslinks cover real routes, durable reveal, hidden answers, failures/quotas/epochs, focus/keys and complete-cache failures. Preserve the topic no-lookup suite. Require the existing free-5174 guard first; workers do not run browsers/servers. Manual visual, real-provider/content/D1/public checks are separate and unclaimed.

## Add a UI component

Run `bunx shadcn@latest add <name> --yes` from the project root. `components.json` selects the Base UI variant and generates files in `src/components/ui/`. The `@/*` alias resolves to `src/*` in `tsconfig.json` (TypeScript and Bun tests) and `vite.config.ts` (Vite). Keep our tokens and themes in `src/index.css`, our `cn` utility and existing components; do not overwrite them as part of adding another component. New dependencies installed by `add` are allowed only for components the owner asked for.

## Static checks

- `bun run typecheck`: `tsc --noEmit`.
- `bun run lint`: oxlint, type-aware, with the React Hooks rules; warnings fail. `bun run lint:fix` applies safe fixes.
- `bun run format` / `bun run format:check`: oxfmt is the only formatter (CI checks it). Markdown, prompt templates and `marketing/` are left as written.
- `bun run i18n:check`: keys exist in both locales, the locales match, and no hard-coded Chinese is in components (CI runs it). See `.claude/rules/i18n.md` and `docs/conventions.md`.
- `bun run shape:check`: the machine-checkable shape of the code: a source file has at most 500 lines, a line at most 200 characters, and no file is named `utils`, `types`, `config`, `helpers`, `common`, `misc`, `shared` or `constants` (name it for what it holds). Old violations are recorded in `scripts/code-shape-ledger.json`, which may only shrink: growing an entry fails, and a shrunk entry must be lowered with `bun scripts/check-code-shape.ts --tighten`. Runs in CI and in the pre-commit hook; turn the hook on once per clone with `git config core.hooksPath .githooks` (it also runs `format:check`).

## Tests

- `bun run test`: `bun test` over `tests/`. Pure logic only: exercise contracts, grading, import drafts, taxonomy. Playwright specs in `e2e/` are separate.
- `bun run e2e`: Playwright specs in `e2e/` drive the real app in installed Chrome with every AI call mocked (`e2e/fixtures.ts`). Playwright starts its own Vite server on :5174 (`playwright.config.ts`), so only one e2e run can own that port at a time. Cover UI changes with a spec; how to write and run one is in the `verify-ui` skill (`.claude/skills/verify-ui/SKILL.md`). Who runs e2e when work is delegated: `docs/agent-delegation.md`. Run it at integration milestones (when a feature batch or phase is assembled), not after every unit of work: units are gated by `bun run test`, typecheck, lint, format, i18n and build (owner decision 2026-10-18).
- Topic-learning synthetic acceptance: first require `lsof -iTCP:5174 -sTCP:LISTEN` to print nothing, then run `CI=1 bunx playwright test e2e/grammar-topic-learning.spec.ts e2e/grammar-topic-learning-workbench.spec.ts`. The saved-data spec covers original-revision Retry, deleted-source feedback, restore/reset tokens, service failure and storage races; the workbench spec covers all six questions, typed/choice controls, draft revisit, review and history-preserving reset. Both use invented TEST-only topics (two interactive and one reference-only), EN/ZH, three themes and the configured desktop/phone projects. Unexpected requests fail acceptance; only static assets and read-only topic metadata/body GETs are allowed. No private authoring, real service or provider is exercised. A targeted iteration can add `--project=desktop -g "<one variant>"`; keep the same port guard and never start a second server by hand.
- Private topic-pipeline synthetic checks: `bun test tests/grammarTopicSchema.test.ts tests/grammarTopicGenerate.test.ts tests/grammarTopicBuild.test.ts tests/grammarTopicPublish.test.ts`. Existing fake dispatch/disposable TEST references cover complete learning generation through sheet, synthetic hash-review assembly, SQL and in-memory Worker body delivery; no real provider or D1 application. Publication review hashes include learning and full reference; exercise revisions deliberately exclude full reference. Real twelve-question review/local acceptance remain a separate pending gate. Worker checks without a server: `cd worker && bun run typecheck`, plus `bun test tests/worker.test.ts tests/lexiconWorker.test.ts` from the root.
- `bun scripts/check-prosody-schema.ts`: guards the prosody marker parser. Run it when markers, the prosody prompt or its parser change.
- `bun scripts/check-import-material.ts` and `bun scripts/check-import-workspace.ts`: production smoke checks for material import (local image/PDF rendering, offline resources), in installed Chrome with no AI. `check-import-material.ts` is described in `docs/architecture.md`; the first line of each script says what it covers.

## UI anti-pattern detector

`impeccable detect --json src index.html` must print `[]`. The CLI is not on PATH; run it through its launcher:

```sh
~/.agents/skills/impeccable/scripts/impeccable detect --json src index.html
```
