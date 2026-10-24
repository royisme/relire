# Relire content service (H1)

An optional, public read-only Cloudflare Worker backed by D1. It serves grammar topics without putting their text in the app bundle or repository, and a learner-sized lexicon (Morphalou 3.1, LGPL-LR; see `NOTICE.md`). It also supports a complete paged vocabulary book. It has no learner data, AI keys, write endpoint or admin route. Public read access is not paid access control: a reader can still collect individual topics.

## Endpoints

Only `GET`, `HEAD` and `OPTIONS` are accepted; other methods return `405` with `Allow`.

- `/v1/topics`: summaries (`id`, `chapter`, `level`, `tags`, bilingual `title`), ordered by chapter then id; no body text.
- `/v1/topics/:id`: full stored topic JSON; malformed slug `400`, missing topic `404`.
- `/v1/tag-index`: covered tags mapped to ascending topic ids.
- `/v1/readers`: the current graded-reader catalogue (`readersCurrent` → `readersCatalog:<catalogueHash>`), `no-cache`, ETag is the catalogue hash.
- `/v1/readers/:id?version=<artifactHash>`: exactly that published immutable `PublishedReader` JSON; `version` is required, `public, max-age=300`, ETag is the artifact hash. Malformed slug `400 invalid-id`; missing/duplicate/extra/malformed `version` `400 invalid-query`; unknown id `404 not-found`; no current catalogue `404 readers-unavailable`; unpublished artifact of a known id `410 version-unavailable`; missing/corrupt marked data or D1 failure `500 unavailable`. Read-only: no learner data, no write route.
- `/v1/vocabulary/tcf-7000?page=<n>[&version=<64 hex>]`: one page of the vocabulary book, plus its manifest and source; see below.
- `/v1/lexicon/:lemma`: every entry (`pos` `verb`, `noun` or `adjective`, `gender` for nouns, `data`) of a lemma, plus `source`; `/v1/lexicon/form/:form`: the `{ lemma, pos }` pairs a form belongs to, plus `source`. The parameter is URL-decoded, NFC and lowercased; empty or over 64 characters `400 invalid-id`, unknown `404 not-found`. Shapes: `src/types/lexicon.ts`.

Successful reads use JSON UTF-8, `Cache-Control: public, max-age=300` (`no-cache` for the reader catalogue), and an `ETag` derived from `meta.packVersion` (`meta.lexiconVersion` for the lexicon routes, the catalogue/artifact hash for the reader routes). Matching `If-None-Match` returns `304`. `HEAD` returns the same status and headers without a body. Errors are JSON error codes; database failures return `500 unavailable` without exposing SQL or content.

CORS echoes only exact origins in the comma-separated `ALLOWED_ORIGINS` variable. Its default empty string permits no cross-origin access. Preflights return `204`; allowed origins may send `If-None-Match` and read `ETag` and `Retry-After`.

The `RATE_LIMITER` binding uses namespace `1001` (an application-chosen namespace identifier, not an account id), at 60 requests per 60 seconds, keyed by `CF-Connecting-IP` or a constant when absent. Rejected requests return `429 rate-limited` and `Retry-After: 60`. The handler skips limiting when the binding is absent. No IPs or headers are logged. Cloudflare's distributed production enforcement is not proven by the local simulator. Cloudflare's documentation (read 2026-10-22) says the limit applies per key within each Cloudflare location, counts are eventually consistent, so requests can exceed the configured limit, and the period must be 10 or 60 seconds. Treat 60 per minute as an approximate ceiling, not an exact quota.

## Owner setup

Use Bun. The Worker has its own dependencies and lockfile; do not add its dependencies to the app package. From the repository root:

```sh
bun install --cwd worker --frozen-lockfile
cd worker
bun run typecheck
```

The typecheck uses the repository's TypeScript executable, with the Worker's isolated `tsconfig.json` (no browser DOM types). The root app toolchain must already be installed.

The following account operations are for the owner, using their own Cloudflare access. No credentials belong in this repository.

1. Create the database:

   ```sh
   bunx wrangler d1 create relire-content
   ```

2. Replace `REPLACE_WITH_D1_DATABASE_ID` in `wrangler.jsonc` with the returned database id in the owner's deployment configuration. The committed configuration deliberately contains only the placeholder. Never commit credentials or account ids.
3. Apply the schema locally and, when ready, remotely:

   ```sh
   bunx wrangler d1 migrations apply DB --local
   bunx wrangler d1 migrations apply DB --remote
   ```

   The migrations create `topics`, `meta`, `lexicon_entries`, `lexicon_forms`, `vocabulary_pages` and `readers` and set the empty versions (`packVersion`, `lexiconVersion`) to `0.0.0`. Local state lives in gitignored `worker/.wrangler/`.
4. Set `vars.ALLOWED_ORIGINS` in `wrangler.jsonc` to the deployment origins, separated by commas, for example `https://app.example.com,https://owner.example.com` (no paths or trailing slashes). The empty default is intentional. Keep the deployment configuration local if it contains owner-specific identifiers.
5. Run locally:

   ```sh
   bun run dev
   # Equivalent: bunx wrangler dev --local
   # Choose a free port when needed: bun run dev --port 8789
   ```

6. Only the owner deploys, after reviewing the database and origins:

   ```sh
   bunx wrangler deploy
   ```

## Publishing content

From the repository root, after the owner reviews drafts with `scripts/grammar-topics/review.ts mark` and sets manifest inclusion:

```sh
bun scripts/grammar-topics/publish.ts                # Generate private SQL only
bun scripts/grammar-topics/publish.ts --apply-local  # Generate and replace local D1 topics
```

The existing `buildTopics` gate refuses an included draft without a matching owner review, naming the id. Excluded ids are listed; zero included topics publishes an empty set. SQL contains the exact published topic JSON, mirrored summary fields, JSON tags and canonical content hashes, ordered by id. The pack version is `<manifest.packVersion>+<first 8 SHA-256 hex of sorted id:contentHash lines joined with newlines (no final newline)>`. Wrangler strips explicit transaction wrappers, so SQL orders deletion first, rows next and the version last.

The only output file is gitignored `.local/grammar-topics/publish.sql`: it contains private topic text; never commit or print it. The command prints counts, skipped ids and the path, not text. Apply the migration first (`cd worker && bunx wrangler d1 migrations apply DB --local`); publishing never applies it silently. `--check` instead validates public manifest/review metadata and chapter labels without reading drafts or writing SQL, for CI.

Later, only the owner runs `wrangler d1 execute DB --remote --file .local/grammar-topics/publish.sql` by hand. From the repository root, use the Worker's installed executable and explicit config so the SQL path resolves correctly (requires the owner's configured database and access):

```sh
worker/node_modules/.bin/wrangler d1 execute DB --remote --file .local/grammar-topics/publish.sql --config worker/wrangler.jsonc
```

The publisher itself has only a local execution path; it never logs in or deploys. There is no real topic content or seed content in this package; the TEST-only fixture is used only by tests and the local smoke check.

## Vocabulary (local-only corpus; no public distribution)

Migration `0003_vocabulary.sql` creates immutable `vocabulary_pages(book_id, version, page, body)` without changing topics/lexicon/meta. `/v1/vocabulary/tcf-7000?page=0` resolves the current pointer once; subsequent requests pin `&version=<64 lowercase hex>`. Only published-marker versions serve. Current page0 uses `no-cache`; pinned pages use `public, max-age=300` and their version ETag. Existing methods, CORS, limiter and no-store errors remain shared.

Query errors are 400 `invalid-query`; unknown resources 404 `not-found`; absent current 404 `book-unavailable`; missing pinned marker 410 `version-unavailable`; out-of-bounds page 404 `page-not-found`; corrupt/missing published data or D1 failure 500 `unavailable`. No learner data endpoint exists. Clients intentionally can download the whole book; the shared limiter can interrupt a download.

Run metadata-only CI with `bun scripts/vocabulary/publish.ts --check`. Private preparation needs explicit absolute `--source`, recorded corrections/omissions and actual attribution. Only an authorized owner marks real review (`review.ts mark --by <name>`). Nothing in the public vocabulary metadata claims a reviewed or distributed corpus.

Default `publish.ts` writes ignored staging SQL only; it and `--apply-local` still require an actual matching review. The owner has separately waived linguistic review for original unfiltered **local use only**: `bun scripts/vocabulary/publish.ts --apply-local-unreviewed` publishes the current prepared artifact with strict `{ bookId: 'tcf-7000', contentHash, status: 'unreviewed' }` provenance, even when an actual matching review exists. It does not read partial correction/omission decisions, change the artifact or create/alter public `reviews.json`; preparing without partial AI decisions remains a separate step. This is not a linguistic review, an official C1 claim, Canadian-usage approval, new content or public delivery rights. Reviewed/CEFR/rights policies remain the default; actual AI corpus review is stopped for this local waiver.

Both owner-authorized apply modes use the same already-installed local Wrangler, never install tools or apply migrations: compare existing version bodies, stage without overwrite/delete, read back each exact page plus aggregate hash/count/index/manifest, write/verify publication marker, then one final current-pointer upsert and readback. No BEGIN/COMMIT promise across invocations. A failed command/readback fails publication; reruns are idempotent. Old complete versions and incomplete staging remain. Cleanup and any public delivery require separate approval. The owner-authorized local import is complete: 7,362 entries from 7,391 source ids, 30 pages, explicitly unreviewed. No partial AI decisions were applied; actual review records remain empty. Protected topic/lexicon exports were byte-identical before/after; no remote application or public distribution occurred. The publisher uses installed Wrangler's local platform proxy with `remoteBindings: false` and explicit `worker/.wrangler/state/v3` persistence, binding large page bodies to avoid the SQL-statement limit. Literal staging SQL is not an apply path. See the joint kickoff for final hashes and real-browser verification.

## Graded readers (local-only publication)

After applying migrations locally, the owner can publish included non-bundled readers:

```sh
bun scripts/graded-readers/publishRemote.ts --sql          # Private staging SQL only, under .local/graded-readers/
bun scripts/graded-readers/publishRemote.ts --apply-local  # Verified staged publication to local D1 only
```

Both modes reuse `assemble` over the included syllabus prefix, so current hash-bound reviews, gates G0–G5 and the strict privacy allowlist remain required; only `include: true` and `bundled: false` artifacts are selected afterward. Zero selected readers is a no-op, not a catalogue clear. No review is created or waived. The publisher never applies migrations or accesses remote D1, deploys, installs tools or reads env files.

`readers(id,artifact_hash)` rows are immutable. Stage with INSERT OR IGNORE, reject existing-body/column collisions, read every exact stored JSON body and recompute its full SHA-256 before writing any `readerPublished:<id>:<artifactHash>` marker (`bodyVersion`, `artifactHash`). Write and verify the immutable `readersCatalog:<catalogueHash>` JSON next; summaries contain id/order/level/trilingual title/body version/artifact hash in stage order, and the envelope version hashes the canonical envelope without its version. Switch `readersCurrent` last with one atomic upsert and read it back. Failures before this switch preserve the previous catalogue. Retries are idempotent; old and incomplete staging rows stay. No cleanup or fictitious transaction spans commands.

Apply uses the installed Wrangler local platform proxy, `remoteBindings: false`, `envFiles: []`, and `worker/.wrangler/state/v3`. SQL dry output is staging-only and is not a substitute for verified publication. Private raw errors stay in ignored `.pi-runs/graded-readers/publish-failure.log`; no prose is printed. Do not commit either output. No remote publishing procedure is authorized here.

The app requests catalogue metadata and published reader id/artifact version only, never answers, reveals, progress, vocabulary, recordings or keys. Starter ids retain bundle authority; conflicting service editions ask for an app update. Network failure alone may use a validated saved catalogue/body. Explicit Keep offline reports success only after its cache commit; opened edition snapshots independently survive cache expiry/service loss.

## Lexicon

Data comes from Morphalou 3.1 (LGPL-LR); the notice, the licence text and the rebuild steps are in `NOTICE.md` and `licences/`. No lexicon data is in the repository.

- `data/lexicon/lemmas.txt` is the committed allowlist (one `pos:lemma` per line). `bun scripts/lexicon/select.ts` writes it offline from a local frequency table (`LEXIQUE_FILE`, default `.local/lexique/Lexique383.tsv`) and the Morphalou copy (`MORPHALOU_DIR`, default `.local/morphalou/csv/Morphalou3.1_formatCSV`), plus the verbs of the grammar pack and the nouns of the noun-gender data. The size constant `TOP_N` is in that script.
- `bun scripts/lexicon/import.ts` reads the allowlist and the three Morphalou files and writes the private, gitignored `.local/lexicon/import.sql`; it fails if an allowlisted lemma is not in Morphalou. Statements stay under about 50 KB, to stay well inside D1's per-statement size limit (that limit was not verified in this repository's tooling). `--apply-local` also runs it against the local D1 (apply both migrations first: `cd worker && bunx wrangler d1 migrations apply DB --local`).
- Later, only the owner loads the remote database, after the migrations: `wrangler d1 execute DB --remote --file .local/lexicon/import.sql` (same invocation as for topics above).
- Size: the committed allowlist produces 49,238 rows (5,022 lemma rows and 44,216 form rows). Loading all of Morphalou's roughly 600,000 form rows would exceed Cloudflare's free-plan daily write limit, so the allowlist is kept small. Cloudflare's D1 pricing page (read 2026-10-22) lists the free plan at 100,000 rows written per day, 5 million rows read per day and 500 MB per database, so 49,238 rows fit in one day by the row count alone. That page defines rows written as the rows changed by INSERT, UPDATE and DELETE; it did not say whether index updates add to the count, so check the dashboard's row metrics after the first load, and use a paid plan or several days if it runs over.
