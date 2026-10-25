# Lexicon in R2 instead of D1 (step L-R2)

Plan of record. Written 2026-10-24 after the owner's proposal to keep the lexicon in Cloudflare R2 rather than D1 ("it is only a dictionary"). Nothing here is built. Review 1 (gpt-6-astra, verdict fail, eight problems and a decision note) is applied below. **The owner has not yet chosen between options A, B and D;** no worker is dispatched until they do and until R2 enablement and billing (for B) are checked.

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

The script is kept locally as `.pi-runs/lexicon-r2/measure.ts` (not committed; the Morphalou source is not in the repository, so the numbers are reproducible only on the owner's machine with `MORPHALOU_DIR`). One lemma response today is about 780 bytes (`être`). The whole lexicon is therefore about a third of a megabyte compressed: smaller than a typical image. That changes the design: a client can hold all of it.

## Facts (read 2026-10-24)

- **Server.** `worker/migrations/0002_lexicon.sql` creates `lexicon_entries (lemma, pos, gender, data, PK (lemma, pos))` and `lexicon_forms (form, lemma, pos)` with a non-unique index, and seeds `meta('lexiconVersion','0.0.0')`. `worker/src/lexicon.ts` serves `/v1/lexicon/:lemma` and `/v1/lexicon/form/:form`, with the Morphalou `source` object in every response (`worker/NOTICE.md`, `worker/licences/`).
- **Publisher.** `scripts/lexicon/import.ts` builds the model with `loadLexicon`, writes SQL (`DELETE` of the version row first, then both tables, version last) and applies it with `wrangler d1 execute --file`; remote apply is interactive, success is decided by a read-only check of the version row and both row counts (`checkLexiconPublication`). Failure logs go to `.pi-runs/lexicon/failure.log`.
- **Client.** `src/services/lexicon/load.ts` exposes exactly two functions, `lexiconForm(token)` and `lexiconLemma(lemma)`, each one request through `contentRequest` (60 s reuse, IndexedDB fallback only on network errors, so words already looked up stay available offline), validated whole with `LexiconFormResponseSchema` / `LexiconLemmaResponseSchema` (`src/types/lexicon.ts`); a 404 means "not in the lexicon" and is `undefined`. Callers: the word sheet (`useWordSheetPack`) and the verb tenses (`useLexiconVerb`). The word sheet's AI analysis runs in parallel regardless of the dictionary; when the lexicon has nothing, the verb-form lines are simply absent and a link to the conjugation page remains (`DictionaryTenses.tsx:24-34`). There is **no** AI replacement of dictionary entries today; it would be new work. The dictionary data is labelled "From the Morphalou dictionary, not reviewed". The word sheet withholds the whole entry until the lexicon settles (`WordDetailModal.tsx:70`).
- **Gating.** `contentServiceUrl()` returns a URL only when the service is enabled with a URL and key (`service.ts:7-9`), and the word sheet bypasses the lexicon otherwise (`useWordSheetPack.ts:34,59-60`).
- **Tests and fixtures that name the old routes.** `e2e/contentService.helpers.ts:55,77-83`, `e2e/lexicon-word.spec.ts:97,232-236,291,301`, `tests/worker.test.ts:162-184`, `tests/lexiconWorker.test.ts`, `tests/lexiconLoad.test.ts`.
- **Other uses of R2 here.** `my-tanstack-app` already binds an R2 bucket (`AUDIO_BUCKET`) in its `wrangler.jsonc`; whether the owner's account has R2 enabled is not verified.
- **Not verified (to check before building):** Cloudflare's current R2 free-tier limits and whether enabling R2 needs a payment method; whether `getPlatformProxy` and the Cloudflare Vite plugin (RS3) simulate an `r2_buckets` binding locally with persistence under `worker/.wrangler/state/v3/r2`; R2 object-size and operation limits for a single multi-MB object.

## Options

- **A. Keep D1.** Works, tested, but day 1 and day 2 and the 50 KB SQL cutting stay.
- **B. R2, one object, bulk download.** The Worker serves the whole lexicon as one object from a **private** R2 bucket behind the same access key; the client downloads it once per `lexiconVersion` into IndexedDB and answers `lexiconForm` / `lexiconLemma` locally. Per-lookup routes disappear.
- **C. R2, 256 shards, per-lookup.** Keeps one request per tap (3 KB gzip each) and the existing client shape (`contentRequest` keeps already-looked-up words offline), so the client barely changes, but it keeps per-tap traffic and the rate-limit question (issue #31, D-limit), and an unseen word is not available offline.
- **D. Static asset in the public bundle.** At 0.33 MB gzip the lexicon ships lazily with the app (a dynamic `import()` of one data file, no network, offline through the PWA cache), needs no service, no key, no R2 and no IndexedDB store, and **every** user of the free build gets it, not only owner-service users. The cost: the Morphalou-derived data file is committed to the repository (today `worker/NOTICE.md` says no lexicon data is committed) or fetched at build time, and CI builds need it. The licence allows this (see Licence). It is the owner's call.

The review's verdict on the options: **B simplifies publishing, not the whole system.** It adds R2 operations, a bulk transport, a persistent-cache policy and client indexing against an already-built A. D has the smallest client of the three.

Lean (revised after the review; the owner decides): **D** if the owner is willing to commit the derived data file (smallest client, no ops, serves every user, fits an open-source app); **B** if the lexicon must stay behind the access key; **A** (publish on day 2, or leave the lexicon out of the first deployment) costs nothing now and is fully working. B is the option whose client cost I understated before the review.

## Design (option B)

**Format.** One JSON document `lexicon.json` (UTF-8) with `{ version, source, entries, forms }`: `entries` as in the Worker's lemma response (`{ lemma, pos, gender?, data }[]`), `forms` as `Record<form, [lemma, pos][]>`, `source` the Morphalou object that is in every response today. A Zod schema in `src/types/lexicon.ts` (extend the existing file; the Worker does not import Zod). `version` is the SHA-256 (first 16 hex) of the canonical payload **excluding** the `version` field, so any change in bytes (the allowlist, the importer, the serialization) changes the ETag; the Morphalou source identity (`sourceVersion`, `morphalou-3.1+<8 hex>`) is kept separately in `source`.

**Worker.** `worker/wrangler.jsonc` gains `r2_buckets: [{ binding: 'LEXICON', bucket_name: 'relire-content' }]` (the committed file keeps a placeholder like the D1 id; the deploy copy fills the real name). `worker/src/lexicon.ts` serves one route `GET /v1/lexicon` after the existing CORS, limiter and access-key middleware: it reads `lexicon.json` from the binding, answers the object with `ETag: "<version>"` (from the object's custom metadata, not the R2 md5), `Cache-Control: private, no-cache`, `Content-Encoding` as stored. `/v1/lexicon/:lemma` and `/v1/lexicon/form/:form` are **removed** (nothing is released; no shim). No object, or a missing version: `404 lexicon-unavailable`. **The bucket stays private: no `r2.dev` URL, no custom domain, no public access**, otherwise the access key is bypassed.

**D1.** `lexicon_entries`, `lexicon_forms`, the index and the `lexiconVersion` seed leave `0002_lexicon.sql` (nothing is deployed, so the migration is edited, not appended). The D1 migrations then hold topics, meta, vocabulary and readers only. This interacts with `docs/drizzle-plan.md` (fewer tables, even less for Drizzle to type); RS4 stays paused.

**Publisher.** `scripts/lexicon/import.ts` keeps the model and `--apply-local` / `--apply-remote` flags, the `allowRemote` + TTY gates, the failure log and the "success only by the read-only check" rule, but writes one object: through `getPlatformProxy` with the `LEXICON` binding, the way vocabulary and readers already publish, reusing the complete rooted options of `platformProxyOptions` (`scripts/content-service/d1Target.ts:33-37`: remote `persist: false`, env-file exclusion, disposal). The committed `wrangler.jsonc` and the dev configuration keep the binding local; **the deploy copy explicitly marks the `LEXICON` binding `"remote": true`**, as it does for `DB` (`worker/README.md:43`), so a remote publisher run can never read back from a simulated binding and call that success. The read-only check reads the object back and compares its SHA-256 and byte length with the file just built; the object is written last-wins with the version in its custom metadata, **Accepted outcomes of a failed publish:** the old object, the new object, or no object; there is no rollback and no pre-publication verification gate (a successful PUT followed by a failed acknowledgement or read-back leaves the new object live, and a read-back mismatch is detected only after exposure). The read-back verifies the SHA-256, the length, the custom version and the HTTP metadata the Worker serves. R2's per-object atomic replacement is believed, not verified, and is checked in L1. The old D1 protocol is not stronger in every way: missing rows answered 404 before the version check (`worker/src/lexicon.ts:42,52,56`). The object is stored gzip-compressed with its content type and encoding set as HTTP metadata, and the Worker streams it through unchanged (compression is part of the design, not optional: 3.09 MB raw against 0.33 MB). Whether the Workers runtime passes a stored `Content-Encoding: gzip` through without decompressing is **unverified** and is checked in L1.

**Client.** `lexiconForm` and `lexiconLemma` keep their signatures; their callers keep their gating. Because `contentServiceUrl()` requires the service enabled with a key, **the dictionary is used only while the service is on**; the plan does not promise keyless or service-off lookups (that would change `useWordSheetPack` and `useLexiconVerb`). The transport is new, not `contentRequest`: `src/services/lexicon/load.ts` fetches `/v1/lexicon` itself with the key and `If-None-Match`, its own generous timeout (the 5 s request timeout does not fit a download), the real HTTP or network error on failure, and a bulk `404 lexicon-unavailable` is an **error**, unlike a word that is missing from a successfully loaded dictionary (`undefined`). A new `src/storage/lexicon.ts` keeps one cache record `{ serviceUrl, version, etag, data }`: read validation with the schema, isolation by service URL, network-only fallback to that record, a failed commit propagates the error and leaves the previous record, and the next lookup retries. This is a variant of the `vocabularyBook.ts` pattern (one fixed record), not a version-indexed store. Two in-memory maps are built once per session. **First-lookup cost is not measured:** at 1 Mbit/s even 0.33 MB is about 2.6 s before parsing, schema validation, IndexedDB and map building, and the word sheet withholds the entry until the lexicon settles; the owner checks this on a phone before L2 is accepted. This is a user-noticeable change and gets a `CHANGELOG.md` line.

**Docs that go stale.** `worker/NOTICE.md` names the removed endpoints and the SQL rebuild recipe: rewrite the recipe for the object (the source object and licence stay in the payload). `settings.about.servicePrivacy` and `settings.about.lexicon*` (en and zh) change from tapped-word requests to a whole-dictionary download; `AboutSection.tsx:27` keeps showing attribution whenever the service is on. ADR section 8 Q2's "no bulk endpoint" default is superseded in the amendment. `docs/d-remote-plan.md:46,88-89` (day 2) and the paused `docs/drizzle-plan.md:38-40` (schema, seeds, equivalence baseline) are updated, not merely acknowledged.

**Runbook.** `worker/README.md`: create the bucket (`W r2 bucket create relire-content`, keep it private), bind it in the deploy config, remove day 2 (the lexicon publishes on day 1 with the rest), smoke check `GET /v1/lexicon` with and without the key (200 with `ETag` equal to the local version; 401 without), and the Endpoints section drops the two per-lookup routes. `docs/adr-hosted-content-service.md` gets a short amendment. `worker/NOTICE.md` is unchanged: the source object stays in the payload.

## Steps

Each is one small TASKS step: a worker in a worktree (installs and network by the lead only, RULES.md), a review of the diff, the lead re-running every check in the main checkout, a local merge.

- **L1 and L2 are one integration boundary** (like RS1/RS2): a server-only L1 makes the current client silently lose its dictionary results, so the lead merges them back to back.
- **L1 Server side.** Binding, `GET /v1/lexicon`, removal of the old routes and tables, publisher writing the object with the read-only check, tests (Worker tests over a fake R2 binding, including that no R2 read happens before authorization; publisher tests with `getPlatformProxy` in a temp root, the pattern in `tests/d1Target.test.ts`, with refusal-before-input tests and disposable local R2 state shared with the RS3 dev server; PUT and read-back failure cases), the e2e fixtures and specs that name the old routes updated without running browsers, the L1 checks of gzip pass-through and R2 atomicity. Acceptance: Worker and publisher tests pass, access-key tests unchanged, the existing CI checks exit 0, the RS3 dev server serves an authorized `/v1/lexicon` from disposable local state.
- **L2 Client.** The bulk loader behind the two functions, the cache record above, schema, tests (a loader test with a fake fetch; cache tests against the repo's real IndexedDB test setup for commit failure and retry, not only a fake store; the word-sheet and verb-tense tests keep passing). Acceptance: no caller changes; a lookup after the first download makes no request; `304` keeps the stored copy; a failed download shows the real error and the model fallback still labels its answer.
- **L3 Docs.** `worker/README.md`, ADR amendment, `docs/architecture.md`, `docs/development.md`, `TASKS.md`, `PROGRESS.md`; the lead writes them. `CHANGELOG.md`: a line (the dictionary now downloads once and answers on the device).
- The lexicon can stay out of the first deployment (publish topics and the vocabulary book only): the word sheet then shows no verb-form lines, only its AI analysis and the conjugation-page link, which is a real loss for verb forms but not a failure.

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

## Licence (read from `worker/licences/LGPL-LR.txt`, 2026-10-24; not legal advice)

- **No permission from anyone is required.** Sections 1, 2, 6 and 7 grant copying, modification and distribution on conditions; a recipient receives a licence from the original licensor automatically. Section 11 (write to the author for permission) applies only to putting parts into a project whose terms are incompatible.
- **Code under MIT or Apache 2.0 is fine.** Section 3: a program that only reads the resource and contains none of it is outside the licence. No lexicon data is committed today.
- **The data stays LGPL-LR.** A derived data file (the lexicon object, or a committed data file under option D) is a work based on the resource: section 2 requires it to stay under this licence at no charge, with a prominent note that it was changed and when, and the licence text. Every payload already carries the source name, maintainer, licence and URL.
- **Option D bundling is allowed.** Section 4 lets a package that combines the program with the resource be distributed under terms of the maintainer's choice (MIT is fine) if the terms allow modification for the user's own use and reverse engineering for debugging such modifications, the package says prominently that Morphalou is used and is covered by the licence, includes the licence text, and offers the legible form or a suitable replacement mechanism; the rebuild recipe and the importer are that mechanism.
- Keep the data in its own directory with its own notice so the repository's MIT licence does not appear to cover it. The licence of the owner's own content (topics, wordbook, readers) is a separate choice.

## Decision for the owner

Choose A, B or D (lean in "Options"), and for B confirm that R2 can be enabled without a payment method you do not want to give. Until then this plan stays unbuilt.
