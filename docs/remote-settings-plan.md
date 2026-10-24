# Remote service: routed API, access key, Settings switch, dev in one process

Plan of record for the next code steps on the content service. Written 2026-10-24 after the owner's four decisions below. Nothing here is built. It needs an Argon review before the first worker is dispatched.

## Owner decisions (2026-10-24)

1. The backend becomes a **routed API service**, not a chain of `path.startsWith` checks.
2. The service needs an **access key**: only authorized clients may read it. The key protects the server.
3. Settings gets a **remote service** section: URL and key, **off by default**; the learner fills them in, tests, then turns it on.
4. Dev: the Worker runs inside `vite dev` (one process), so a forgotten Worker no longer breaks the home page.
5. Drizzle for D1 stays on the list, last, with its own plan (see "Not in this plan").

## Facts (read 2026-10-24)

- `worker/src/index.ts` (7.3 KB) is one `handle(request, env)` with a hand-written ladder: method check, rate limit, `OPTIONS`, then `startsWith` branches for `/v1/vocabulary/`, `/v1/readers`, `/v1/topics`, `/v1/tag-index`, `/v1/lexicon/...`. CORS, `ETag`/`If-None-Match` and the error shape are closures inside `handle`. `vocabulary.ts` and `readers.ts` are resource functions returning `{ body, version, pinned } | { error, status }`.
- There is no auth. ADR amendment 3 (2026-10-24) says auth "can be added later as a Worker middleware and one header in `contentServiceFetch`, with no migration". This plan is that.
- `my-tanstack-app/src/server.ts` is also a hand-written `fetch` with `pathname.startsWith` branches around TanStack Start; it has no API router either. Matching its stack would not give us routing.
- Client: `contentServiceUrl()` (`src/services/grammarTopics/service.ts`) reads `import.meta.env.VITE_CONTENT_SERVICE_URL` synchronously; 24 calls in 18 files. `contentServiceFetch` sends no header. There is no CSP, so a runtime URL is not blocked by the browser.
- Settings live in `localStorage` (`src/utils/appSettings.ts`, sync `getAppSettings`/`saveAppSettings`). AI keys are in `apiKeys`; `exportSettingsBackup` drops `apiKeys` and `providerRegions`. Settings sections are `SETTINGS_SECTIONS` in `src/utils/routes.ts`; saves go through the slice pattern in `src/components/settings/slices.ts`.
- The root `.gitignore` ignores `worker/.wrangler/` and `worker/wrangler.deploy.jsonc`; `.dev.vars` is not yet listed.
- Worker tests: `tests/worker.test.ts`, `lexiconWorker.test.ts`, `vocabularyWorker.test.ts`, `readersWorker.test.ts`. Client: `tests/contentService.test.ts`.

## Design

### 1. Routed API (Hono)

Use **Hono** in `worker/`. It is the standard router for Workers, runs on the Workers runtime without Node APIs, and has the middleware this service needs (CORS, bearer auth). It is a new dependency in `worker/package.json` only; the app bundle does not import it. If the owner prefers another router, only this section changes.

Shape (one file per concern, names are the worker's to settle inside these limits):

- `worker/src/index.ts`: builds the app and exports `default { fetch }` and, for tests, `app`.
- Middleware, in this order: method guard (only `GET`, `HEAD`, `OPTIONS`; `405` with `Allow`), CORS, rate limit, access key, then routes.
- Routes: `GET /v1/topics`, `/v1/topics/:id`, `/v1/tag-index`, `/v1/lexicon/:lemma`, `/v1/lexicon/form/:form`, `/v1/vocabulary/*`, `/v1/readers`, `/v1/readers/*`. Unknown path: `404 {"error":"not-found"}`.
- The existing validation rules stay byte for byte: topic slug regex, `lexiconKey` (NFC, lowercase, length 64), `invalid-id` `400`, the `{ error: code }` JSON body, `Cache-Control: no-store` on errors. The shared conditional-request helper (`cached`) becomes one function used by every route.
- **No behaviour change for a valid, authorized request.** The response bodies, ETags and status codes the tests pin today must not change. This is a refactor plus auth, not a new API.

### 2. Access key

- Secret `ACCESS_KEYS` (Wrangler secret): comma-separated, one key per person or device. Each key is at least 32 random characters (`openssl rand -base64 32`). Rotating or revoking is `wrangler secret put ACCESS_KEYS` with the new list.
- The client sends `Authorization: Bearer <key>`.
- **Fail closed.** With `ACCESS_KEYS` unset or empty, every request except `OPTIONS` answers `401`. Local dev sets a throwaway key in `worker/.dev.vars` (add it to `.gitignore`; agents never read it).
- Compare in constant time (`crypto.subtle.timingSafeEqual` over fixed-length digests of the presented key and of each configured key).
- Order matters:
  1. `OPTIONS` answers `204` before auth, because a preflight carries no credentials. `Access-Control-Allow-Headers` becomes `Authorization, If-None-Match`.
  2. The rate limiter runs **before** auth, so failed guesses count against the caller's IP.
  3. A failed auth answers `401 {"error":"unauthorized"}` with `WWW-Authenticate: Bearer` **and the CORS headers**. Without them the browser reports "Failed to fetch" and hides the real cause.
- `Cache-Control: public, max-age=300` on pinned resources becomes `private, max-age=300`; `no-cache` stays.
- Never log the key or the `Authorization` header.
- **What it does and does not do.** It keeps uninvited clients and scrapers out and lets the owner revoke one holder. It does not hide content from a holder: anyone with a key sees it in the Network tab. The public GitHub Pages build never contains a key (it is entered per device, never in a `VITE_` variable). This is not an account system: no users, no per-user rows.
- Docs to amend in the same step: ADR amendment 3 and the privacy sentence ("never receives keys" becomes "never an AI key; it receives only the access key you set for it"), `settings.about.servicePrivacy` (en and zh), `worker/README.md` runbook (generate the key, `wrangler secret put ACCESS_KEYS`, how to hand it to a learner, rotation), `docs/architecture.md`.

### 3. Client settings and the switch

- `AppSettings.contentService: { enabled: boolean; url: string; key: string }`, default `{ enabled: false, url: <VITE_CONTENT_SERVICE_URL or ''>, key: '' }`. The env variable only **prefills** the URL for dev; it never turns the service on, and the public build has none.
- The whole block is **device-local and excluded from backups** (export drops it; restore keeps the local one), like `apiKeys` and `providerRegions`. Reason: a restored `enabled: true` without a key would break the app on a new device.
- `contentServiceUrl()` keeps its **signature and its 24 callers**. It returns the normalized URL only when `enabled`, `url` and `key` are all set, else `undefined`, so "not configured" hiding (navigation, Today, About, lexicon, readers) works as today. Reading `localStorage` stays synchronous.
- `contentServiceFetch` sends `Authorization: Bearer <key>`. A `401` surfaces as the real `HTTP 401: unauthorized`; a settings hint may point to the section but never replaces the error.
- New Settings section `service` (title "Content service"): URL field (reuse `normalizeBaseUrl` from `src/services/ai/baseUrl.ts` rather than a second URL check), key field (password type, same treatment as the AI key), a **Test** button, an **Enable** switch.
  - Test sends one `GET /v1/topics` with the draft URL and key (not the saved ones) and shows the real result: connected; `401` "the service rejected the key"; `429` rate limited; other HTTP status; or a network failure, whose text must name all three causes ("the service is not running, the address is wrong, or the service does not allow this site (CORS)"). It invents no counts.
  - The switch can be turned **on only after a Test passed for the current URL and key**. Editing either field turns it off and clears the pass. Turning it off needs no test.
  - Slice name `service`, saved independently like `ai` and `practice`.
- Effect on save: the 24 callers read at render time and do not subscribe. Default: after saving the `service` slice the page reloads (the hash route survives), so every hook starts from the new state. If the worker finds a cheap reactive path, it may use it; it must not leave a mix of old and new state.
- Today: when the service is off the Grammar step is absent as today; when it is on and unreachable, the real error shows (this is the case that prompted this plan).

### 4. Dev in one process

Use `@cloudflare/vite-plugin` so `vite dev` serves the Worker routes next to the app. This is a **spike first** (step RS3): the measurements decide whether it ships.

- Config: the plugin points at `worker/wrangler.jsonc` and must read and write the **same local D1 files** the publishers use (`worker/.wrangler/state/v3`, see `scripts/content-service/d1Target.ts`), not a second database.
- It applies to `serve` only. `bun run build` output (the GitHub Pages bundle) must be byte-identical in its file list and must not contain Worker code or Hono.
- Worker routes are matched before the SPA fallback only for `/v1/*`.
- In dev the service URL is the Vite origin (`.env.local` prefill `http://localhost:5173`); the key comes from `worker/.dev.vars`. `wrangler dev` in `worker/` keeps working.
- If the spike cannot meet these, stop and report; do not bend the production build for dev convenience.

## Steps

Each is one small TASKS step: worker in a worktree, Argon review of the diff for RS1 and RS2, lead re-runs every check in the main checkout, local merge. Never push.

- **RS1 Routed API with the access key** (Worker only): section 1 and 2, tests (see below), `worker/README.md`, ADR, privacy copy keys. `worker/package.json` gains Hono; `bun.lock` in `worker/` updates; the Worker typecheck is the lead's gate.
- **RS2 Settings: remote service** (app only): section 3, i18n en and zh, tests. Depends on RS1 only for the `Authorization` contract.
- **RS3 Dev in one process** (spike, then wire): section 4. Report the measurements before wiring.
- Docs per step: `TASKS.md`, `PROGRESS.md`, `CHANGELOG.md` (RS2 is user-visible), `DESIGN.md` for the Settings section if it adds a component, `docs/development.md` for the new dev command. The lead writes them; workers do not edit them.

## Tests

- Worker (extend the four existing worker tests, do not duplicate): no `ACCESS_KEYS` answers `401`; wrong key `401`; right key `200`; a second key in the list works and a removed one fails; `OPTIONS` without a key `204` with `Allow-Headers` containing `Authorization`; a `401` carries `Access-Control-Allow-Origin` for an allowed origin and `WWW-Authenticate`; a failed attempt consumes the rate limit; `ETag`/`304` still work with a key; every previously pinned body and status is unchanged; unknown path `404`; `POST` `405`.
- Client: `contentServiceUrl()` is `undefined` unless enabled with URL and key; the header is sent; `401` and network failures surface as the real error; Test uses the draft values; the switch cannot turn on without a pass for the current values; editing resets it; backup export omits the block and restore keeps the local one; the default is off with the env prefill.
- Settings view test for the section (render, Test result texts, disabled switch).
- Nothing runs against a remote. No e2e unless the owner asks.

## Not in this plan

- **Drizzle for D1** (owner item 5). Its own plan, after RS1 to RS3, because it touches the schema, the migrations and four publishers. Facts to settle there: nothing is deployed, so migrations `0001` to `0004` may be regenerated from a schema file; the publishers generate SQL text for `wrangler d1 execute --file` and cannot use the query builder; so Drizzle would cover the Worker's reads, the schema as one source of truth and typed rows. The plan must state concretely what it buys against a new dependency before any code.
- Accounts, per-user rows, quotas per key, key hashing at rest (the secret store is the boundary), key delivery UI. The ADR's H4 conditions still apply.
- The D-remote publishers: unchanged. They write through Wrangler, not through the routes.

## Risks to check in review

- Hono's `HEAD` and `OPTIONS` handling versus today's exact responses.
- Whether the plugin can share the publishers' local D1 directory without a second copy (RS3).
- A reload after save losing unsaved edits in another settings section: the other slices must not be affected by the service save.
- `crypto.subtle.timingSafeEqual` availability in the Worker typings (`@cloudflare/workers-types`).
