# Relire content service (H1)

An optional, read-only Cloudflare Worker backed by D1, readable only with an access key (see Access key below). It serves grammar topics without putting their text in the app bundle or repository, and a learner-sized lexicon (Morphalou 3.1, LGPL-LR; see `NOTICE.md`). It also supports a complete paged vocabulary book. It has no learner data, AI keys, write endpoint or admin route. An access key is not paid access control and not an account system: anyone holding a key can read everything and collect it.

## Endpoints

Only `GET`, `HEAD` and `OPTIONS` are accepted; other methods return `405` with `Allow`. Every route except `OPTIONS` needs `Authorization: Bearer <key>` (next section). The Worker is a Hono app (`src/index.ts`): own CORS, method, limiter and key middleware in that order, then prefix routes that read the raw path.

- `/v1/topics`: summaries (`id`, `chapter`, `level`, `tags`, bilingual `title`, `position`), ordered by `position` (the manifest's book order); no body text.
- `/v1/topics/:id`: full stored topic JSON; malformed slug `400`, missing topic `404`.
- `/v1/tag-index`: covered tags mapped to ascending topic ids.
- `/v1/readers`: the current graded-reader catalogue (`readersCurrent` → `readersCatalog:<catalogueHash>`), `no-cache`, ETag is the catalogue hash.
- `/v1/readers/:id?version=<artifactHash>`: exactly that published immutable `PublishedReader` JSON; `version` is required, ETag is the artifact hash. Malformed slug `400 invalid-id`; missing/duplicate/extra/malformed `version` `400 invalid-query`; unknown id `404 not-found`; no current catalogue `404 readers-unavailable`; unpublished artifact of a known id `410 version-unavailable`; missing/corrupt marked data or D1 failure `500 unavailable`. Read-only: no learner data, no write route.
- `/v1/vocabulary/tcf-7000?page=<n>[&version=<64 hex>]`: one page of the vocabulary book, plus its manifest and source; see below.
- `/v1/lexicon/:lemma`: every entry (`pos` `verb`, `noun` or `adjective`, `gender` for nouns, `data`) of a lemma, plus `source`; `/v1/lexicon/form/:form`: the `{ lemma, pos }` pairs a form belongs to, plus `source`. The parameter is URL-decoded, NFC and lowercased; empty or over 64 characters `400 invalid-id`, unknown `404 not-found`. Shapes: `src/types/lexicon.ts`.

Successful reads use JSON UTF-8, `Cache-Control: private, no-cache` and `Vary: Origin, Authorization` (so every reuse is revalidated at the Worker, where the key is checked before the `ETag` is compared), and an `ETag` derived from `meta.packVersion` (`meta.lexiconVersion` for the lexicon routes, the catalogue/artifact hash for the reader routes). Matching `If-None-Match` returns `304`. `HEAD` returns the same status and headers without a body. Errors are JSON error codes; database failures return `500 unavailable` without exposing SQL or content.

CORS echoes only exact origins in the comma-separated `ALLOWED_ORIGINS` variable. Its default empty string permits no cross-origin access. Preflights return `204` before the key check (a preflight carries no credentials); allowed origins may send `Authorization` and `If-None-Match` and read `ETag` and `Retry-After`. A `401` carries the same CORS headers, so a browser can read it.

## Access key

The secret `ACCESS_KEYS` is a comma-separated list of keys, one per person or device, each at least 32 random characters (for example `openssl rand -base64 32`). A request needs `Authorization: Bearer <one of them>`; otherwise the answer is `401 {"error":"unauthorized"}` with `WWW-Authenticate: Bearer`. It fails closed: with `ACCESS_KEYS` unset or empty, every request except `OPTIONS` is `401`. Keys are compared as SHA-256 digests without an early exit, and the rate limiter runs before the check, so guesses count against the caller's IP. Rotating or revoking a key is setting the secret again with the new list. A copy a client already downloaded or stored offline cannot be revoked. The key is not an account: no users, no per-user rows. The public GitHub Pages build never contains one; a learner enters it on their own device (Settings > Content service) and it is never put into a `VITE_` variable or a backup.

For local work put a throwaway key in `worker/.dev.vars` (gitignored): `ACCESS_KEYS=<any long random string>`. Wrangler reads it for `wrangler dev`.

The `RATE_LIMITER` binding (when present, it runs before the key check) uses namespace `1001` (an application-chosen namespace identifier, not an account id), at 60 requests per 60 seconds, keyed by `CF-Connecting-IP` or a constant when absent. Rejected requests return `429 rate-limited` and `Retry-After: 60`. The handler skips limiting when the binding is absent. No IPs or headers are logged. Cloudflare's distributed production enforcement is not proven by the local simulator. Cloudflare's documentation (read 2026-10-22) says the limit applies per key within each Cloudflare location, counts are eventually consistent, so requests can exceed the configured limit, and the period must be 10 or 60 seconds. Treat 60 per minute as an approximate ceiling, not an exact quota.

## Owner setup

Use Bun. The Worker has its own dependencies and lockfile; do not add its dependencies to the app package. From the repository root:

```sh
bun install --cwd worker --frozen-lockfile
cd worker
bun run typecheck
```

The typecheck uses the repository's TypeScript executable, with the Worker's isolated `tsconfig.json` (no browser DOM types). The root app toolchain must already be installed.

Everything that touches the account or a deployed database is the owner's alone, with their own Cloudflare access, through the deployment runbook below. No credentials belong in this repository.

The committed `wrangler.jsonc` keeps the `REPLACE_WITH_D1_DATABASE_ID` placeholder and an empty `ALLOWED_ORIGINS` forever; it is never edited for a deployment. For remote work the owner copies it to `worker/wrangler.deploy.jsonc` (gitignored) and fills in the real `database_id`, `account_id`, `"remote": true` on the `DB` binding, and `vars.ALLOWED_ORIGINS`: the deployment origins, separated by commas, for example `https://app.example.com,https://owner.example.com` (no paths or trailing slashes). The empty default is intentional. Never commit credentials or account ids.

Apply the schema locally and run the Worker:

```sh
bunx wrangler d1 migrations apply DB --local
bun run dev
# Equivalent: bunx wrangler dev --local
# Choose a free port when needed: bun run dev --port 8789
```

The migrations create `topics`, `meta`, `lexicon_entries`, `lexicon_forms`, `vocabulary_pages` and `readers` and set the empty versions (`packVersion`, `lexiconVersion`) to `0.0.0`. Local state lives in gitignored `worker/.wrangler/`.

## Deployment runbook (owner only)

Nothing below has been run by an agent; these are the owner's steps, in an interactive terminal, with their own Cloudflare access, from the repository root. Define once per shell:

```sh
C=worker/wrangler.deploy.jsonc
W() { WRANGLER_SEND_METRICS=false WRANGLER_HIDE_BANNER=true node --no-warnings -- worker/node_modules/wrangler/wrangler-dist/cli.js "$@" --env-file .no-env-files; }
```

`W` invokes the installed Wrangler directly with `node --no-warnings -- worker/node_modules/wrangler/wrangler-dist/cli.js`, never `bunx` and never `worker/node_modules/.bin/wrangler`: that launcher respawns `node` without the `--`, so Node 26 would read `--env-file` itself and exit before Wrangler starts. `--env-file .no-env-files` names a file that does not exist, so no `.env*` file or `.dev.vars` is loaded into Wrangler's process; the two variables disable telemetry and the banner. Do not use `wrangler dev --config $C`: with `"remote": true` it would connect `DB` to the deployed database. Every remote publisher flag below also refuses on its own: `Remote publication requires owner CLI authorization` outside the owner's terminal entrypoint, and `Remote publication requires TTY stdin and stdout` in a non-interactive shell, before any metadata or Wrangler access.

1. **Local reference.** `W d1 migrations apply DB --local --config worker/wrangler.jsonc`, `bun scripts/lexicon/import.ts --apply-local`, then re-publish topics and the vocabulary locally. Note the local `packVersion`, `lexiconVersion` and `vocabularyCurrent:tcf-7000`, and the sizes measured on your machine (largest topic body, largest vocabulary page body, page count) for the checks below.
2. **Limits.** Read Cloudflare's current D1 limits (bound value, row, statement size) and rows-written rules. If the largest page (108,810 bytes when measured) is rejected, the page size must be halved in code first; a smaller page count changes the download pacing.
3. **Account and database.** `W login` (or set `CLOUDFLARE_API_TOKEN`), `W d1 create relire-content`; write `$C` as described above; `W d1 migrations apply DB --remote --config $C`.
4. **Day 1** (migrations, topics, vocabulary and readers fit one free-plan day): `bun scripts/grammar-topics/publish.ts --apply-remote` (answer Wrangler's confirmation yourself; the publisher's read-only check, not the prompt or the exit code, decides success), `bun scripts/vocabulary/publish.ts --apply-remote-unreviewed`, `bun scripts/graded-readers/publishRemote.ts --apply-remote` (with the current syllabus it prints `No non-bundled readers selected; nothing to publish.`). Read each exit code. Read-only counts: `W d1 execute DB --remote --config $C --command "SELECT count(*) FROM topics"` (93) and the same for `vocabulary_pages` (30). Note the dashboard's rows written.
5. **Day 2** (a new UTC day; the lexicon's 49,238 rows plus index entries approach the free plan's 100,000 rows written per day): `bun scripts/lexicon/import.ts --apply-remote` once, no same-day rerun; read-only counts `lexicon_entries` (5,022) and `lexicon_forms` (44,216).
6. **Deploy, set the key, smoke-check.** `W deploy --config $C` (until the secret exists every request is `401`, which is the safe state). Then generate a key (`openssl rand -base64 32`) and set it: `W secret put ACCESS_KEYS --config $C` (paste the list when asked; never put it in a file in the repository). Smoke-check twice. Without a key: `/v1/topics` is `401` with a `WWW-Authenticate: Bearer` header, and the same from an allowed `Origin` also has `Access-Control-Allow-Origin`. With `-H "Authorization: Bearer <key>"`, `GET` the deployed URL: `/v1/topics` 200 with ETag equal to the local `packVersion`; `/v1/lexicon/être` 200 with ETag equal to the local `lexiconVersion` and the Morphalou source in the body; `/v1/vocabulary/tcf-7000?page=0` 200 with `manifest.version` equal to the local `vocabularyCurrent:tcf-7000`, `pageCount` 30, review `unreviewed`; `/v1/readers` 404 `readers-unavailable`. A request with an allowed `Origin` gets `Access-Control-Allow-Origin`, one with another origin gets none; `POST` gets 405. The secret commands above were never run by an agent.
7. **Switch the app on.** On each device open Settings > Content service, enter the deployed URL and an access key from `ACCESS_KEYS`, press Test, then switch the service on (it is off by default and device-local; a backup never carries it). `ALLOWED_ORIGINS` holds each app origin that will call the service (no path; the Pages site would be `https://royisme.github.io`). `VITE_CONTENT_SERVICE_URL` is only a dev prefill for the URL field and never turns the service on. Then the iOS Safari real-device checks that needed HTTPS: topics, wordbook download, lexicon word sheet, device voice.

Two owner decisions stand (2026-10-24): the public GitHub Pages build is not pointed at the service (`pages.yml` sets no `VITE_CONTENT_SERVICE_URL`, so the free build shows no topics), and `http://localhost:5173` is not in production `ALLOWED_ORIGINS`.

## Publishing content

From the repository root, after the owner reviews drafts with `scripts/grammar-topics/review.ts mark` and sets manifest inclusion:

```sh
bun scripts/grammar-topics/publish.ts                # Generate private SQL only
bun scripts/grammar-topics/publish.ts --apply-local  # Generate and replace local D1 topics
bun scripts/grammar-topics/publish.ts --apply-remote # Owner-only: replace the deployed D1 topics (runbook)
```

The existing `buildTopics` gate refuses an included draft without a matching owner review, naming the id. Excluded ids are listed; zero included topics publishes an empty set. SQL contains the exact published topic JSON, mirrored summary fields, JSON tags, canonical content hashes and the 1-based manifest `position` (captured before the id sort), ordered by id. The pack version is `<manifest.packVersion>+<first 8 SHA-256 hex of sorted id:position:contentHash lines joined with newlines (no final newline)>`. Wrangler strips explicit transaction wrappers, so SQL deletes the `packVersion` row first, then replaces rows and writes the new version last: a failed or partial run, local or remote, leaves the service at `500 unavailable`, never stale content under the old ETag.

The only output file is gitignored `.local/grammar-topics/publish.sql`: it contains private topic text; never commit or print it. The command prints counts, skipped ids and the path, not text. Apply the migration first (`cd worker && bunx wrangler d1 migrations apply DB --local`); publishing never applies it silently. `--check` instead validates public manifest/review metadata and chapter labels without reading drafts or writing SQL, for CI.

`--apply-remote` (`publish.ts [--apply-local | --apply-remote | --check]`) is owner-only: it refuses any non-interactive shell (TTY stdin and stdout required), so agents, tests and CI cannot reach it, and it uses only `worker/wrangler.deploy.jsonc`, never the committed config. Wrangler's confirmation prompt is shown to the owner (inherited stdio), but neither the prompt nor the exit code decides success: only the read-only check that follows, a piped `--json` query comparing `packVersion` and every stored `(id, position, content_hash, body byte length)` against the computed values. A failed check or import stops with the real error; rerun the same command. `--remote` and mixed flags are refused. Failures write `.pi-runs/grammar-topics/failure.log` and print one fixed line, because SQL and D1 errors can carry private prose. The publisher itself never logs in or deploys. There is no real topic content or seed content in this package; the TEST-only fixture is used only by tests and the local smoke check.

## Vocabulary (the owner's own book; publishable)

The book is the owner's own work and they have the right to publish it (ADR amendment 2026-10-24). It is currently `unreviewed`, and the deployed book is served as `unreviewed` too: the remote apply is `--apply-remote-unreviewed` only (`publish.ts [--check | --apply-local | --apply-local-unreviewed | --apply-remote-unreviewed]`; `--apply-remote` is refused), owner-only in an interactive terminal; a reviewed remote mode waits for an actual review.

Migration `0003_vocabulary.sql` creates immutable `vocabulary_pages(book_id, version, page, body)` without changing topics/lexicon/meta. `/v1/vocabulary/tcf-7000?page=0` resolves the current pointer once; subsequent requests pin `&version=<64 lowercase hex>`. Only published-marker versions serve. Current page0 uses `no-cache`; pinned pages use `public, max-age=300` and their version ETag. Existing methods, CORS, limiter and no-store errors remain shared.

Query errors are 400 `invalid-query`; unknown resources 404 `not-found`; absent current 404 `book-unavailable`; missing pinned marker 410 `version-unavailable`; out-of-bounds page 404 `page-not-found`; corrupt/missing published data or D1 failure 500 `unavailable`. No learner data endpoint exists. Clients intentionally can download the whole book; the shared limiter can interrupt a download.

Run metadata-only CI with `bun scripts/vocabulary/publish.ts --check`. Private preparation needs explicit absolute `--source`, and recorded corrections/omissions. Only an authorized owner marks real review (`review.ts mark --by <name>`). Nothing in the public vocabulary metadata claims a reviewed or distributed corpus.

Default `publish.ts` writes ignored staging SQL only; it and `--apply-local` still require an actual matching review. The owner has waived linguistic review for the original unfiltered book (it is served as `unreviewed`): `bun scripts/vocabulary/publish.ts --apply-local-unreviewed` publishes the current prepared artifact with strict `{ bookId: 'tcf-7000', contentHash, status: 'unreviewed' }` provenance, even when an actual matching review exists. It does not read partial correction/omission decisions, change the artifact or create/alter public `reviews.json`; preparing without partial AI decisions remains a separate step. This is not a linguistic review, an official C1 claim or a Canadian-usage approval. Reviewed/CEFR policies remain the default; actual AI corpus review is stopped for this waiver.

All apply modes (`--apply-local`, `--apply-local-unreviewed`, `--apply-remote-unreviewed`) use the same already-installed Wrangler, never install tools or apply migrations: compare existing version bodies, stage without overwrite/delete, read back each exact page plus aggregate hash/count/index/manifest, write/verify publication marker, then one final current-pointer upsert and readback. No BEGIN/COMMIT promise across invocations. A failed command/readback fails publication; reruns are idempotent. Old complete versions and incomplete staging remain. Cleanup of old versions requires separate approval. The owner-authorized local import is complete: 7,362 entries from 7,391 source ids, 30 pages, explicitly unreviewed. No partial AI decisions were applied; actual review records remain empty. Protected topic/lexicon exports were byte-identical before/after; nothing has been applied remotely yet. Local applies use Wrangler's local platform proxy (`remoteBindings: false`, explicit `worker/.wrangler/state/v3`); the remote apply uses `worker/wrangler.deploy.jsonc` with `remoteBindings: true`, `persist: false` and an interactive owner terminal, binding large page bodies to avoid the SQL-statement limit. Literal staging SQL is not an apply path. See the joint kickoff for final hashes and real-browser verification.

## Graded readers

After applying migrations locally, the owner can publish included non-bundled readers:

```sh
bun scripts/graded-readers/publishRemote.ts --sql          # Private staging SQL only, under .local/graded-readers/
bun scripts/graded-readers/publishRemote.ts --apply-local  # Verified staged publication to local D1 only
bun scripts/graded-readers/publishRemote.ts --apply-remote # Owner-only: verified publication to the deployed D1
```

All three modes reuse `assemble` over the included syllabus prefix, so current hash-bound reviews, gates G0–G5 and the strict privacy allowlist remain required; only `include: true` and `bundled: false` artifacts are selected afterward. Zero selected readers is a no-op, not a catalogue clear. No review is created or waived. The publisher never applies migrations, deploys, installs tools or reads env files; the remote apply is owner-only (interactive terminal, `worker/wrangler.deploy.jsonc`).

`readers(id,artifact_hash)` rows are immutable. Stage with INSERT OR IGNORE, reject existing-body/column collisions, read every exact stored JSON body and recompute its full SHA-256 before writing any `readerPublished:<id>:<artifactHash>` marker (`bodyVersion`, `artifactHash`). Write and verify the immutable `readersCatalog:<catalogueHash>` JSON next; summaries contain id/order/level/trilingual title/body version/artifact hash in stage order, and the envelope version hashes the canonical envelope without its version. Switch `readersCurrent` last with one atomic upsert and read it back. Failures before this switch preserve the previous catalogue. Retries are idempotent; old and incomplete staging rows stay. No cleanup or fictitious transaction spans commands.

Apply uses the installed Wrangler platform proxy: locally `remoteBindings: false`, `envFiles: ['.no-env-files']` and `worker/.wrangler/state/v3`; remotely `remoteBindings: true` on `worker/wrangler.deploy.jsonc` with `persist: false`, refused outside an interactive owner terminal before any metadata or Wrangler access. SQL dry output is staging-only and is not a substitute for verified publication. Private raw errors stay in ignored `.pi-runs/graded-readers/publish-failure.log`; no prose is printed. Do not commit either output.

The app requests catalogue metadata and published reader id/artifact version only, never answers, reveals, progress, vocabulary, recordings or keys. Starter ids retain bundle authority; conflicting service editions ask for an app update. Network failure alone may use a validated saved catalogue/body. Explicit Keep offline reports success only after its cache commit; opened edition snapshots independently survive cache expiry/service loss.

## Lexicon

Data comes from Morphalou 3.1 (LGPL-LR); the notice, the licence text and the rebuild steps are in `NOTICE.md` and `licences/`. No lexicon data is in the repository.

- `data/lexicon/lemmas.txt` is the committed allowlist (one `pos:lemma` per line). `bun scripts/lexicon/select.ts` writes it offline from a local frequency table (`LEXIQUE_FILE`, default `.local/lexique/Lexique383.tsv`) and the Morphalou copy (`MORPHALOU_DIR`, default `.local/morphalou/csv/Morphalou3.1_formatCSV`), plus the verbs of the grammar pack and the nouns of the noun-gender data. The size constant `TOP_N` is in that script.
- `bun scripts/lexicon/import.ts` reads the allowlist and the three Morphalou files and writes the private, gitignored `.local/lexicon/import.sql`; it fails if an allowlisted lemma is not in Morphalou. Statements stay under about 50 KB, to stay well inside D1's per-statement size limit (that limit was not verified in this repository's tooling). `--apply-local` also runs it against the local D1 (apply both migrations first: `cd worker && bunx wrangler d1 migrations apply DB --local`).
- The owner-only `--apply-remote` (`import.ts [--apply-local | --apply-remote]`) loads the deployed database with the same file import, in an interactive terminal through `worker/wrangler.deploy.jsonc`, with Wrangler's confirmation shown to the owner; success is decided only by the read-only check that follows (`lexiconVersion` plus both row counts), never by the prompt or the exit code. The SQL deletes the `lexiconVersion` row first, so a failed or partial import serves `500 unavailable` for the lexicon, never stale rows; rerun the same command on another day if the budget is spent. Its row count needs its own free-plan day (runbook, day 2); failures write `.pi-runs/lexicon/failure.log` and print one fixed line.
- Size: the committed allowlist produces 49,238 rows (5,022 lemma rows and 44,216 form rows). Loading all of Morphalou's roughly 600,000 form rows would exceed Cloudflare's free-plan daily write limit, so the allowlist is kept small. Cloudflare's D1 pricing page (read 2026-10-22) lists the free plan at 100,000 rows written per day, 5 million rows read per day and 500 MB per database, so 49,238 rows fit in one day by the row count alone. That page defines rows written as the rows changed by INSERT, UPDATE and DELETE; it did not say whether index updates add to the count, so check the dashboard's row metrics after the first load, and use a paid plan or several days if it runs over.
