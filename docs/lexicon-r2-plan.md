# Lexicon in R2 instead of D1 (step L-R2)

Plan of record. Written 2026-10-24 after the owner's proposal to keep the lexicon in Cloudflare R2 rather than D1 ("it is only a dictionary"). Nothing here is built. It needs a review (gpt-6-astra while Argon has no quota) before any worker is dispatched.

## Why

The lexicon is the heaviest thing the first deployment has to publish: 49,238 D1 rows plus index entries against the free plan's 100,000 rows written per day, which is why `worker/README.md` splits the runbook into day 1 and day 2 and the importer cuts SQL into 50 KB statements. The data is read-only and read by key, which is what object storage is for.

## Measured 2026-10-24

A throwaway script (not committed) loaded the real allowlisted Morphalou data exactly as `scripts/lexicon/import.ts` does and serialized it (entries as the Worker returns them, forms as `form -> [[lemma, pos]]`):

| Layout | Raw | gzip | brotli |
| --- | --- | --- | --- |
| One file, entries and forms | 3.09 MB | 0.33 MB | 0.23 MB |
| Entries only (5,022) | 1.61 MB | 0.20 MB | 0.13 MB |
| Forms only (42,593 distinct) | 1.48 MB | 0.13 MB | 0.10 MB |
| 64 shards (by SHA-256 of the key) | avg 48 KB, max 63 KB | avg 9 KB, max 11 KB | |
| 256 shards | avg 12 KB, max 22 KB | avg 3 KB, max 4 KB | |

One lemma response today is about 780 bytes (`être`). The whole lexicon is therefore about a third of a megabyte compressed: smaller than a typical image. That changes the design: a client can hold all of it.

## Facts (read 2026-10-24)

- **Server.** `worker/migrations/0002_lexicon.sql` creates `lexicon_entries (lemma, pos, gender, data, PK (lemma, pos))` and `lexicon_forms (form, lemma, pos)` with a non-unique index, and seeds `meta('lexiconVersion','0.0.0')`. `worker/src/lexicon.ts` serves `/v1/lexicon/:lemma` and `/v1/lexicon/form/:form`, with the Morphalou `source` object in every response (`worker/NOTICE.md`, `worker/licences/`).
- **Publisher.** `scripts/lexicon/import.ts` builds the model with `loadLexicon`, writes SQL (`DELETE` of the version row first, then both tables, version last) and applies it with `wrangler d1 execute --file`; remote apply is interactive, success is decided by a read-only check of the version row and both row counts (`checkLexiconPublication`). Failure logs go to `.pi-runs/lexicon/failure.log`.
- **Client.** `src/services/lexicon/load.ts` exposes exactly two functions, `lexiconForm(token)` and `lexiconLemma(lemma)`, each one request through `contentRequest` (60 s reuse, IndexedDB fallback only on network errors), validated whole with `LexiconFormResponseSchema` / `LexiconLemmaResponseSchema` (`src/types/lexicon.ts`); a 404 means "not in the lexicon" and is `undefined`. Callers: the word sheet (`useWordSheetPack`) and the verb tenses (`useLexiconVerb`). When the lexicon has nothing, the word sheet falls back to the model and labels the answer accordingly.
- **Other uses of R2 here.** `my-tanstack-app` already binds an R2 bucket (`AUDIO_BUCKET`) in its `wrangler.jsonc`; whether the owner's account has R2 enabled is not verified.
- **Not verified (to check before building):** Cloudflare's current R2 free-tier limits and whether enabling R2 needs a payment method; whether `getPlatformProxy` and the Cloudflare Vite plugin (RS3) simulate an `r2_buckets` binding locally with persistence under `worker/.wrangler/state/v3/r2`; R2 object-size and operation limits for a single multi-MB object.

## Options

- **A. Keep D1.** Works, tested, but day 1 and day 2 and the 50 KB SQL cutting stay.
- **B. R2, one object, bulk download (recommended).** The Worker serves the whole lexicon as one object from a **private** R2 bucket behind the same access key; the client downloads it once per `lexiconVersion` into IndexedDB and answers `lexiconForm` / `lexiconLemma` locally. Per-lookup routes disappear.
- **C. R2, 256 shards, per-lookup.** Keeps one request per tap (3 KB gzip each) and the existing client shape, so the client barely changes, but it keeps per-tap traffic and the rate-limit question (issue #31, D-limit) and offline lookup stays impossible.
- **D. Static asset in the public bundle.** At 0.33 MB gzip it could ship lazily with the app and need no service, no key, no R2. That puts Morphalou-derived data in the public build or repository (LGPL-LR conditions are already built into the notice and rebuild documents), and the owner has so far kept published content behind the service. Not chosen here; it is the owner's call and a possible later move because B's object format is the same file.

Recommendation: **B.** One small object, no SQL, no day 2, offline "attested" lookups without a key, no per-tap requests. C only if the owner wants the client untouched.

## Design (option B)

**Format.** One JSON document `lexicon.json` (UTF-8) with `{ version, source, entries, forms }`: `entries` as in the Worker's lemma response (`{ lemma, pos, gender?, data }[]`), `forms` as `Record<form, [lemma, pos][]>`, `source` the Morphalou object that is in every response today. A Zod schema in `src/types/lexicon.ts` (extend the existing file; the Worker does not import Zod). `version` is the existing `sourceVersion` value (`morphalou-3.1+<8 hex>`).

**Worker.** `worker/wrangler.jsonc` gains `r2_buckets: [{ binding: 'LEXICON', bucket_name: 'relire-content' }]` (the committed file keeps a placeholder like the D1 id; the deploy copy fills the real name). `worker/src/lexicon.ts` serves one route `GET /v1/lexicon` after the existing CORS, limiter and access-key middleware: it reads `lexicon.json` from the binding, answers the object with `ETag: "<version>"` (from the object's custom metadata, not the R2 md5), `Cache-Control: private, no-cache`, `Content-Encoding` as stored. `/v1/lexicon/:lemma` and `/v1/lexicon/form/:form` are **removed** (nothing is released; no shim). No object, or a missing version: `404 lexicon-unavailable`. **The bucket stays private: no `r2.dev` URL, no custom domain, no public access**, otherwise the access key is bypassed.

**D1.** `lexicon_entries`, `lexicon_forms`, the index and the `lexiconVersion` seed leave `0002_lexicon.sql` (nothing is deployed, so the migration is edited, not appended). The D1 migrations then hold topics, meta, vocabulary and readers only. This interacts with `docs/drizzle-plan.md` (fewer tables, even less for Drizzle to type); RS4 stays paused.

**Publisher.** `scripts/lexicon/import.ts` keeps the model and `--apply-local` / `--apply-remote` flags, the `allowRemote` + TTY gates, the failure log and the "success only by the read-only check" rule, but writes one object: through `getPlatformProxy` with the `LEXICON` binding (local persist under `worker/.wrangler/state/v3`; remote only with `remoteBindings: true` from the owner's terminal), the way vocabulary and readers already publish. The read-only check reads the object back and compares its SHA-256 and byte length with the file just built; the object is written last-wins with the version in its custom metadata, so a failed upload leaves either the old complete object or none. A gzip'd copy is not required (R2 serves what it stores; the Worker may compress on the way out).

**Client.** `lexiconForm` and `lexiconLemma` keep their signatures and callers. Implementation: on first use with the service enabled, fetch `/v1/lexicon` with the key (real errors kept), validate once with the schema, store it in IndexedDB under its version (the `useVocabularyBook` complete-cache pattern, `src/storage/vocabularyBook.ts`), build two in-memory maps, and answer from them; a later visit sends `If-None-Match` and keeps the stored copy on `304`. Not in the lexicon is still `undefined`. Download failure surfaces the real error, and the model fallback is unchanged. The first lookup waits for the download (about 0.33 MB compressed); the word sheet already waits for the lexicon before drawing, so no new state is needed beyond a loading phase it already has.

**Runbook.** `worker/README.md`: create the bucket (`W r2 bucket create relire-content`, keep it private), bind it in the deploy config, remove day 2 (the lexicon publishes on day 1 with the rest), smoke check `GET /v1/lexicon` with and without the key (200 with `ETag` equal to the local version; 401 without), and the Endpoints section drops the two per-lookup routes. `docs/adr-hosted-content-service.md` gets a short amendment. `worker/NOTICE.md` is unchanged: the source object stays in the payload.

## Steps

Each is one small TASKS step: a worker in a worktree (installs and network by the lead only, RULES.md), a review of the diff, the lead re-running every check in the main checkout, a local merge.

- **L1 Server side.** Binding, `GET /v1/lexicon`, removal of the old routes and tables, publisher writing the object with the read-only check, tests (Worker tests over a fake R2 binding; publisher tests with `getPlatformProxy` in a temp root, the existing pattern in `tests/d1Target.test.ts`), `.dev.vars`-free. Acceptance: Worker and publisher tests pass, access-key tests unchanged, the existing CI checks exit 0, the RS3 dev server serves an authorized `/v1/lexicon` from disposable local state.
- **L2 Client.** The bulk loader behind the two functions, IndexedDB cache by version, schema, tests (a loader test with a fake fetch and a fake store; the word-sheet and verb-tense tests keep passing). Acceptance: no caller changes; a lookup after the first download makes no request; `304` keeps the stored copy; a failed download shows the real error and the model fallback still labels its answer.
- **L3 Docs.** `worker/README.md`, ADR amendment, `docs/architecture.md`, `docs/development.md`, `TASKS.md`, `PROGRESS.md`; the lead writes them. `CHANGELOG.md`: a line only if a learner notices (offline word lookup).
- The lexicon can stay out of the first deployment: until L1/L2 land, publish topics and the vocabulary book only; the word sheet already falls back to the model.

## Risks

- A multi-MB object read per request through the Worker: acceptable at one download per version per device, but the Worker must stream the object body, not buffer and re-serialize it.
- R2 limits and enabling the service are unverified (see Facts). If R2 needs a payment method the owner does not want to give, B is unavailable and A stays.
- The client's whole-file model makes the first word lookup slower once per device; with 0.33 MB compressed this is measured in tens of milliseconds on a normal connection, but not measured on a phone network.
- Removing per-lookup routes breaks any caller still using them: the only callers are `lexiconForm` and `lexiconLemma`.

## Questions for the reviewer

1. Is B really simpler than A and C overall, counting the client change and the IndexedDB store? Is anything in the measured table misread?
2. Does the plan keep the privacy and access promises (private bucket, key before the object, the About text about what the server receives)?
3. Is the publisher's "write one object, check by SHA-256 and length" as safe as the current "delete the version row first" protocol against a failed or partial upload, and does it fit the `allowRemote` + TTY gates and tests?
4. Is any fact about the repository wrong, and is any step missing (CI, formatting, the `.oxfmtrc.json` ignore for generated data, the RS3 dev plugin with an R2 binding)?
