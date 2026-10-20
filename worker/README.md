# Relire content service (H1)

An optional, public read-only Cloudflare Worker backed by D1. It serves grammar topics without putting their text in the app bundle or repository, and a learner-sized lexicon (Morphalou 3.1, LGPL-LR; see `NOTICE.md`). It also supports a complete paged vocabulary book. It has no learner data, AI keys, write endpoint or admin route. Public read access is not paid access control: a reader can still collect individual topics.

## Endpoints

Only `GET`, `HEAD` and `OPTIONS` are accepted; other methods return `405` with `Allow`.

- `/v1/topics`: summaries (`id`, `chapter`, `level`, `tags`, bilingual `title`), ordered by chapter then id; no body text.
- `/v1/topics/:id`: full stored topic JSON; malformed slug `400`, missing topic `404`.
- `/v1/tag-index`: covered tags mapped to ascending topic ids.
- `/v1/lexicon/:lemma`: every entry (`pos` `verb`, `noun` or `adjective`, `gender` for nouns, `data`) of a lemma, plus `source`; `/v1/lexicon/form/:form`: the `{ lemma, pos }` pairs a form belongs to, plus `source`. The parameter is URL-decoded, NFC and lowercased; empty or over 64 characters `400 invalid-id`, unknown `404 not-found`. Shapes: `src/types/lexicon.ts`.

Successful reads use JSON UTF-8, `Cache-Control: public, max-age=300`, and an `ETag` derived from `meta.packVersion` (`meta.lexiconVersion` for the lexicon routes). Matching `If-None-Match` returns `304`. `HEAD` returns the same status and headers without a body. Errors are JSON error codes; database failures return `500 unavailable` without exposing SQL or content.

CORS echoes only exact origins in the comma-separated `ALLOWED_ORIGINS` variable. Its default empty string permits no cross-origin access. Preflights return `204`; allowed origins may send `If-None-Match` and read `ETag` and `Retry-After`.

The `RATE_LIMITER` binding uses namespace `1001` (an application-chosen namespace identifier, not an account id), at 60 requests per 60 seconds, keyed by `CF-Connecting-IP` or a constant when absent. Rejected requests return `429 rate-limited` and `Retry-After: 60`. The handler skips limiting when the binding is absent. No IPs or headers are logged. Cloudflare's distributed production enforcement is not proven by the local simulator.

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

   The migrations create `topics`, `meta`, `lexicon_entries`, `lexicon_forms` and `vocabulary_pages` and set the empty versions (`packVersion`, `lexiconVersion`) to `0.0.0`. Local state lives in gitignored `worker/.wrangler/`.
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

## Vocabulary (code only; real content not published)

Migration `0003_vocabulary.sql` creates immutable `vocabulary_pages(book_id, version, page, body)` without changing topics/lexicon/meta. `/v1/vocabulary/tcf-7000?page=0` resolves the current pointer once; subsequent requests pin `&version=<64 lowercase hex>`. Only published-marker versions serve. Current page0 uses `no-cache`; pinned pages use `public, max-age=300` and their version ETag. Existing methods, CORS, limiter and no-store errors remain shared.

Query errors are 400 `invalid-query`; unknown resources 404 `not-found`; absent current 404 `book-unavailable`; missing pinned marker 410 `version-unavailable`; out-of-bounds page 404 `page-not-found`; corrupt/missing published data or D1 failure 500 `unavailable`. No learner data endpoint exists. Clients intentionally can download the whole book; the shared limiter can interrupt a download.

Run metadata-only CI with `bun scripts/vocabulary/publish.ts --check`. Private preparation needs explicit absolute `--source`, recorded corrections/omissions and actual attribution. Only an authorized owner marks real review (`review.ts mark --by <name>`). Nothing in the public vocabulary metadata claims a reviewed or distributed corpus.

Default `publish.ts` writes ignored staging SQL only; it and `--apply-local` still require an actual matching review. The owner has separately waived linguistic review for original unfiltered **local use only**: `bun scripts/vocabulary/publish.ts --apply-local-unreviewed` publishes the current prepared artifact with strict `{ bookId: 'tcf-7000', contentHash, status: 'unreviewed' }` provenance, even when an actual matching review exists. It does not read partial correction/omission decisions, change the artifact or create/alter public `reviews.json`; preparing without partial AI decisions remains a separate step. This is not a linguistic review, an official C1 claim, Canadian-usage approval, new content or public delivery rights. Reviewed/CEFR/rights policies remain the default; actual AI corpus review is stopped for this local waiver.

Both owner-authorized apply modes use the same already-installed local Wrangler, never install tools or apply migrations: compare existing version bodies, stage without overwrite/delete, read back each exact page plus aggregate hash/count/index/manifest, write/verify publication marker, then one final current-pointer upsert and readback. No BEGIN/COMMIT promise across invocations. A failed command/readback fails publication; reruns are idempotent. Old complete versions and incomplete staging remain. Cleanup and any public delivery require separate approval. Earlier local import authorization plus the explicit linguistic-review waiver permit the local operation; implementing this mode does not mean a real D1 application has occurred.

## Lexicon

Data comes from Morphalou 3.1 (LGPL-LR); the notice, the licence text and the rebuild steps are in `NOTICE.md` and `licences/`. No lexicon data is in the repository.

- `data/lexicon/lemmas.txt` is the committed allowlist (one `pos:lemma` per line). `bun scripts/lexicon/select.ts` writes it offline from a local frequency table (`LEXIQUE_FILE`, default `.local/lexique/Lexique383.tsv`) and the Morphalou copy (`MORPHALOU_DIR`, default `.local/morphalou/csv/Morphalou3.1_formatCSV`), plus the verbs of the grammar pack and the nouns of the noun-gender data. The size constant `TOP_N` is in that script.
- `bun scripts/lexicon/import.ts` reads the allowlist and the three Morphalou files and writes the private, gitignored `.local/lexicon/import.sql`; it fails if an allowlisted lemma is not in Morphalou. Statements stay under about 50 KB, to stay well inside D1's per-statement size limit (that limit was not verified in this repository's tooling). `--apply-local` also runs it against the local D1 (apply both migrations first: `cd worker && bunx wrangler d1 migrations apply DB --local`).
- Later, only the owner loads the remote database, after the migrations: `wrangler d1 execute DB --remote --file .local/lexicon/import.sql` (same invocation as for topics above).
- Size: the committed allowlist produces 49,238 rows (5,022 lemma rows and 44,216 form rows). Loading all of Morphalou's roughly 600,000 form rows would exceed Cloudflare's free-plan daily write limit, so the allowlist is kept small. Whether 49,238 rows fits the current free-plan daily limit could not be verified here (the limit is not in this repository's tooling and Cloudflare may count index writes too); check Cloudflare's D1 pricing and limits page before loading, and use a paid plan or several days if it does not fit.
