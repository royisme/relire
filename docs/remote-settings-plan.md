# Remote service: routed API, access key, Settings switch, dev in one process

Plan of record for the next code steps on the content service. Written 2026-10-24 after the owner's four decisions below. Nothing here is built. Review 1 (gpt-6-astra, because Argon had no quota; verdict fail, nine findings) is applied below.

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
- Client: `contentServiceUrl()` (`src/services/grammarTopics/service.ts`) reads `import.meta.env.VITE_CONTENT_SERVICE_URL` synchronously; 23 calls in 18 files plus the declaration. Calls happen at render, in loaders and in effects (`useGrammarTagIndex.ts:18` has a mount-only effect; `useRoute.ts:28` memoizes by hash), so a re-render alone does not refresh every consumer. `contentServiceFetch` sends no header. There is no CSP, so a runtime URL is not blocked by the browser.
- Settings live in `localStorage` (`src/utils/appSettings.ts`, sync `getAppSettings`/`saveAppSettings`). AI keys are in `apiKeys`; `exportSettingsBackup` drops `apiKeys` and `providerRegions`. Settings sections are `SETTINGS_SECTIONS` in `src/utils/routes.ts`; saves go through the slice pattern in `src/components/settings/slices.ts`.
- The root `.gitignore` ignores `worker/.wrangler/` and `worker/wrangler.deploy.jsonc`; `.dev.vars` is not yet listed.
- Worker tests: `tests/worker.test.ts`, `lexiconWorker.test.ts`, `vocabularyWorker.test.ts`, `readersWorker.test.ts`, fixtures in `tests/fixtures/workerDb.ts` (no keys today). The publisher tests and `tests/d1Target.test.ts` import `handle`; many client tests enable the service only through the env variable. Client: `tests/contentService.test.ts`.
- Today every successful response carries `Cache-Control: public, max-age=300` (pinned resources and `/v1/topics`, `/v1/tag-index`, `/v1/lexicon/*`, `worker/src/index.ts:175`) or `no-cache`, with `Vary: Origin`.
- Bun 1.3.14 has no `crypto.subtle.timingSafeEqual`; `@cloudflare/workers-types` 5.20261019.1 declares it. Tests call the handler directly under Bun.
- Pinned error responses the router must keep: `/v1/topics/` (empty id), `/v1/topics/test/only`, `/v1/lexicon/`, `/v1/lexicon/form/` answer `400 invalid-id` (`tests/worker.test.ts:87`, `tests/lexiconWorker.test.ts:137`). A 405 and a 429 carry the CORS headers set before them. Stock CORS middleware is not byte-compatible with the pinned values (`tests/worker.test.ts:163,191`).
- Vocabulary and readers publish through `getPlatformProxy` with `DB.prepare(...).bind(...)` (`scripts/vocabulary/publish.ts`, `scripts/graded-readers/publishRemote.ts`); topics and the lexicon through `wrangler d1 execute --file`.

## Design

### 1. Routed API (Hono)

Use **Hono** in `worker/`. It is the standard router for Workers, runs on the Workers runtime without Node APIs, and has the middleware this service needs (CORS, bearer auth). It is a new dependency in `worker/package.json` only; the app bundle does not import it. If the owner prefers another router, only this section changes.

Shape (one file per concern, names are the worker's to settle inside these limits):

- `worker/src/index.ts`: builds the app, keeps the exported `handle(request, env)` (so the publisher and `d1Target` tests keep importing it) and `default { fetch }`.
- Middleware, in this order, each a few lines and written here, **not** Hono's stock `cors`: (1) CORS headers for an allowed origin, with exactly today's values (`Allow-Methods: GET, HEAD, OPTIONS`, `Allow-Headers: Authorization, If-None-Match`, `Expose-Headers: ETag, Retry-After`, `Vary: Origin, Authorization`); (2) method guard (`405` with `Allow`, carrying the CORS headers as today); (3) rate limit; (4) `OPTIONS` answers `204`; (5) access key; (6) routes. This is today's order (method, limiter, `OPTIONS`) plus the key.
- Routes: `GET /v1/topics`, `/v1/tag-index`, and prefix routes `/v1/topics/*`, `/v1/lexicon/*`, `/v1/vocabulary/*`, `/v1/readers` and `/v1/readers/*`. A prefix handler takes the **raw pathname remainder** exactly as `handle` does today and applies the same checks; it does not use Hono's `:id` parameters (they skip empty parameters and extra segments, and decode once more before `lexiconKey`). No trailing-slash normalization. Unknown path: `404 {"error":"not-found"}`.
  (Superseded by `docs/lexicon-bundle-plan.md`: the lexicon is bundled, not served.)
- The existing validation rules stay byte for byte: topic slug regex, `lexiconKey` (NFC, lowercase, length 64), `invalid-id` `400`, the `{ error: code }` JSON body, `Cache-Control: no-store` on errors. The shared conditional-request helper (`cached`) becomes one function used by every route.
  (Superseded by `docs/lexicon-bundle-plan.md`: the lexicon is bundled, not served.)
- **No behaviour change for a valid, authorized request**, except the cache policy in section 2. The pinned bodies, ETags and statuses must not change; the existing Worker tests keep their bodies, ETags, conditional statuses and `HEAD` parity. Their expectations change only where this plan changes them: the key in the fixtures, the cache policy (`tests/worker.test.ts:112`, `lexiconWorker.test.ts:175`, `vocabularyWorker.test.ts:73`, `readersWorker.test.ts:85,92`), `Vary: Origin, Authorization` (`worker.test.ts:163`) and `Allow-Headers: Authorization, If-None-Match` (`:191-192`).
- **Keep it portable** (a later move to TanStack Start server routes, or a `/v1/$` route calling `app.fetch(request, env)`): route handlers only read parameters, call the resource function and return a `Response`; no Hono RPC, `hono/validator` or `c.set`; `Env` comes in as a parameter, not a global; tests call `handle(Request, env)`, never Hono internals.

### 2. Access key

- Secret `ACCESS_KEYS` (Wrangler secret): comma-separated, one key per person or device. Each key is at least 32 random characters (`openssl rand -base64 32`). Rotating or revoking is `wrangler secret put ACCESS_KEYS` with the new list.
- The client sends `Authorization: Bearer <key>`.
- **Fail closed.** With `ACCESS_KEYS` unset or empty, every request that passes the method guard and the limiter, except `OPTIONS`, answers `401` (a bad method is still `405`, an over-limit caller `429`). Local dev sets a throwaway key in `worker/.dev.vars` (add it to `.gitignore`; agents never read it). Tests pass a synthetic key in the fixtures.
- Compare in constant time: SHA-256 digests of the presented key and of each configured key (fixed 32 bytes), compared with a plain XOR-accumulate loop. That runs the same under Bun and in the Workers runtime; do **not** use `crypto.subtle.timingSafeEqual` (Bun 1.3.14 lacks it, so direct handler tests would throw) and do not add a runtime-dependent fallback.
- Order is the middleware order in section 1:
  1. `OPTIONS` answers `204` before auth, because a preflight carries no credentials.
  2. The rate limiter runs **before** auth, so failed guesses count against the caller's IP.
  3. A failed auth answers `401 {"error":"unauthorized"}` with `WWW-Authenticate: Bearer` **and the CORS headers**. Without them the browser reports "Failed to fetch" and hides the real cause.
- **Cache policy for every successful response, 200 and 304:** `Cache-Control: private, no-cache`, `Vary: Origin, Authorization`. `no-cache` makes every HTTP-cache reuse revalidate at the origin, where the key is checked first (auth runs before the conditional-request match), so a revoked key cannot read through an ETag. (The app's own stores, the 60-second request reuse in `src/services/grammarTopics/request.ts`, the IndexedDB fallbacks and the saved wordbook, ignore HTTP cache headers and are covered by the revocation limit below.) This removes today's `public, max-age=300` everywhere. Errors stay `no-store`. Limit, stated in the runbook: a copy a client already downloaded or stored offline cannot be revoked.
- Never log the key or the `Authorization` header.
- **What it does and does not do.** It keeps out clients and scrapers that do not hold a valid key, and lets the owner revoke one holder for new requests. It does not hide content from a holder: anyone with a key sees it in the Network tab. The public GitHub Pages build never contains a key (it is entered per device, never in a `VITE_` variable). This is not an account system: no users, no per-user rows.
- Docs to amend in the same step: ADR amendment 3 and the privacy sentence ("never receives keys" becomes "never an AI key; it receives only the access key you set for it"), `AGENTS.md` line 5 ("never sees a key": distinguish AI keys from the service access key; edit AGENTS.md, never CLAUDE.md), `settings.about.servicePrivacy` (en and zh), `worker/README.md` runbook (generate the key, `wrangler secret put ACCESS_KEYS`, how to hand it to a learner, rotation), `docs/architecture.md`.

### 3. Client settings and the switch

- `AppSettings.contentService: { enabled: boolean; url: string; key: string }`, default `{ enabled: false, url: <VITE_CONTENT_SERVICE_URL or ''>, key: '' }`. The env variable only **prefills** the URL for dev; it never turns the service on, and the public build has none.
- The whole block is **device-local and excluded from backups** (export drops it; restore keeps the local one), like `apiKeys` and `providerRegions`. Reason: a restored `enabled: true` without a key would break the app on a new device.
- `contentServiceUrl()` keeps its **signature and its 23 callers**. It returns the normalized URL only when `enabled`, `url` and `key` are all set, else `undefined`, so "not configured" hiding (navigation, Today, About, lexicon, readers) works as today. Reading `localStorage` stays synchronous.
  (Superseded by `docs/lexicon-bundle-plan.md`: the lexicon is bundled, not served.)
- `contentServiceFetch` sends `Authorization: Bearer <key>`. A `401` surfaces as the real `HTTP 401: unauthorized`; a settings hint may point to the section but never replaces the error.
- New Settings section `service` (title "Content service"): URL field (reuse `normalizeBaseUrl` from `src/services/ai/baseUrl.ts` rather than a second URL check), key field (password type, same treatment as the AI key), a **Test** button, an **Enable** switch.
  - Test sends one `GET /v1/topics` with the draft URL and key (not the saved ones), with `cache: 'no-store'` so a browser-cached 200 cannot pass for a live connection, and no offline or application cache. A 200 counts as connected only if the body parses with the existing topic-list schema, so an HTML or unrelated 200 fails with that real reason. It shows the real result: connected; `401` "the service rejected the key"; `429` rate limited; other HTTP status; or a network failure, whose text names all three causes ("the service is not running, the address is wrong, or the service does not allow this site (CORS)"). It invents no counts and adds no health route. A Test that finishes after the draft changed is ignored (compare against the current draft).
  - The switch can be turned **on only after a Test passed for the current URL and key**. Editing either field turns it off and clears the pass. Turning it off needs no test.
  - Slice name `service`, saved independently like `ai` and `practice`.
- Effect on save, **no reload and no subscription.** A reload would move the page and discard the unsaved AI, practice, prompt and Words drafts that `SettingsPage` keeps in state. None is needed: of the 23 call sites, every mounted React consumer is a page or subtree that is not on screen while Settings shows (Today, Topics, Study, Practice, Reader, About, `LearningNavigation`, `GrammarTagLabel`, the closed word sheet), and each reads the new state when it mounts after navigation. `useRoute` reparses on the next hash change. `NavTree` reads the service only inside its grammar area. Settings → Words (`useVocabularyBook`) unmounts when the learner opens the service section and remounts on return. The remaining sites are call-time helpers (transport, cache keys, guards). A test proves a Settings draft in another slice survives a service save.
- Today: when the service is off the Grammar step is absent as today; when it is on and unreachable, the real error shows (this is the case that prompted this plan).

### 4. Dev in one process

Use `@cloudflare/vite-plugin` so `vite dev` serves the Worker routes next to the app. This is a **spike first** (step RS3): the measurements decide whether it ships.

- Config: the plugin points at `worker/wrangler.jsonc` and must read and write the **same local D1 files** the publishers use (`worker/.wrangler/state/v3`, see `scripts/content-service/d1Target.ts`), not a second database.
- It applies to `serve` only. The production bundle must not change: build `dist` before and after the change with identical inputs and compare a content hash of the whole tree (exit code); `dist` must not contain Worker code or Hono.
- Unresolved until the spike (not facts): the plugin version and its Vite 8 peer range (the root has Vite `^8.3.0`), and whether its persistence option can point at `worker/.wrangler/state/v3`. The spike writes a synthetic row through a publisher path and reads it through the dev route, then proves the Worker has local bindings only.
- Worker routes are matched before the SPA fallback only for `/v1/*`.
- In dev the service URL is the Vite origin (`.env.local` prefill `http://localhost:5173`); the key comes from `worker/.dev.vars`. `wrangler dev` in `worker/` keeps working.
- If the spike cannot meet these, stop and report; do not bend the production build for dev convenience.

## Steps

Each is one small TASKS step: worker in a worktree, Argon review of the diff for RS1 and RS2, lead re-runs every check in the main checkout, local merge. Never push.

- **RS1 Routed API with the access key** (Worker, its tests and fixtures, docs): section 1 and 2. `worker/package.json` gains Hono; `bun.lock` in `worker/` updates; the Worker typecheck is the lead's gate. The publisher tests and `d1Target.test.ts` that import `handle` get the key in their fixtures in this step.
- **RS2 Settings: remote service** (app only): section 3, i18n en and zh, and the client tests that enabled the service through the env variable (they set the settings block instead). **RS1 and RS2 are one integration boundary:** RS1 makes the Worker require a key that the app can send only after RS2, so the lead merges them back to back and the branch between them is not used. Nothing is released or deployed, so no one meets the gap.
- The runbook edit (in RS1, finished in RS2) has an exact order: provision `ACCESS_KEYS` with the deployment config before any smoke check; smoke checks run twice, with the key (200/404 as documented) and without it (401); the app is switched on by Settings Test and Enable, replacing the env-only activation sentence in `worker/README.md`.
- **RS3 Dev in one process** (spike, then wire): section 4. Report the measurements before wiring.
- Docs per step: `TASKS.md`, `PROGRESS.md`, `CHANGELOG.md` (RS2 is user-visible), `DESIGN.md` for the Settings section if it adds a component, `docs/development.md` for the new dev command. The lead writes them; workers do not edit them.

## Tests

- Worker (extend the four existing worker tests, do not duplicate): no `ACCESS_KEYS` answers `401`; wrong key `401`; right key `200`; a second key in the list works and a removed one fails; `OPTIONS` without a key `204` with `Allow-Headers` containing `Authorization`; a `401` carries `Access-Control-Allow-Origin` for an allowed origin and `WWW-Authenticate`; a failed attempt consumes the rate limit; a request with a **matching `If-None-Match` and a missing, wrong or revoked key** answers `401`, never `304`; with a valid key `ETag`/`304` still work; every success carries `private, no-cache` and `Vary: Origin, Authorization`; every previously pinned body, status and error (including the four `400 invalid-id` paths, `404`, `405`, `429`, `HEAD`) is unchanged; `POST` `405` still carries the CORS headers.
- Client: `contentServiceUrl()` is `undefined` unless enabled with URL and key; the header is sent; `401` and network failures surface as the real error; Test uses the draft values with `cache: 'no-store'`, fails on an HTML or malformed 200, and ignores a result that completes after the draft changed; the switch cannot turn on without a pass for the current values; editing resets it; backup export omits the block and restore keeps the local one; the default is off with the env prefill; a Settings draft in another slice survives a service save; opening Settings → Words after a save uses the new state.
- Settings view test for the section (render, Test result texts, disabled switch).
- Nothing runs against a remote. No e2e unless the owner asks.

## Not in this plan

- **Drizzle for D1** (owner item 5). Its own plan, after RS1 to RS3, because it touches the schema, the migrations and four publishers. Facts to settle there: nothing is deployed, so migrations `0001` to `0004` may be regenerated from a schema file; topics and the lexicon publish SQL text through `wrangler d1 execute --file`, while vocabulary and readers use `getPlatformProxy` with `DB.prepare(...).bind(...)`, so Drizzle's D1 driver could wrap the binding for those two and cover the Worker's reads and typed rows; the SQL-text publishers would stay as they are. The plan must state concretely what it buys against a new dependency before any code.
- Accounts, per-user rows, quotas per key, key hashing at rest (the secret store is the boundary), key delivery UI. The ADR's H4 conditions still apply.
- The D-remote publishers: unchanged. They write through Wrangler, not through the routes.

## Risks to check in review

- Hono's `HEAD` dispatch (it runs the GET handler and drops the body) versus today's exact responses; `OPTIONS` is answered by our own middleware, not Hono's.
- Whether the plugin can share the publishers' local D1 directory without a second copy (RS3).
- A mounted consumer that reads the service and is still on screen beside Settings. The second review found none; the worker re-checks the 23 call sites before writing code and reports any it finds instead of adding a subscription.
