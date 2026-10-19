# Relire content service (H1)

An optional, public read-only Cloudflare Worker backed by D1. It serves grammar topics without putting their text in the app bundle or repository. It has no learner data, AI keys, write endpoint, admin route or lexicon endpoint. Public read access is not paid access control: a reader can still collect individual topics.

## Endpoints

Only `GET`, `HEAD` and `OPTIONS` are accepted; other methods return `405` with `Allow`.

- `/v1/topics`: summaries (`id`, `chapter`, `level`, `tags`, bilingual `title`), ordered by chapter then id; no body text.
- `/v1/topics/:id`: full stored topic JSON; malformed slug `400`, missing topic `404`.
- `/v1/tag-index`: covered tags mapped to ascending topic ids.

Successful reads use JSON UTF-8, `Cache-Control: public, max-age=300`, and an `ETag` derived from `meta.packVersion`. Matching `If-None-Match` returns `304`. `HEAD` returns the same status and headers without a body. Errors are JSON error codes; database failures return `500 unavailable` without exposing SQL or content.

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

   The migration creates only `topics` and `meta` and sets the empty pack's version to `0.0.0`. Local state lives in gitignored `worker/.wrangler/`.
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
