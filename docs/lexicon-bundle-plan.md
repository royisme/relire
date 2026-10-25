# The lexicon ships with the app (option D)

Plan of record. Written 2026-10-24. **Owner decision (2026-10-24): option D**, after a review of the R2 alternative and a reading of the licence. Nothing here is built. It needs a review (gpt-6-astra while Argon has no quota) before any worker is dispatched. This file replaces `docs/lexicon-r2-plan.md` (same history, renamed); the options it considered are summarised at the end.

## Why

The lexicon is read-only open data (Morphalou 3.1, LGPL-LR). It was the heaviest thing the first deployment had to publish (49,238 D1 rows, a separate UTC day, 50 KB SQL statements, a per-tap request with the access key), and the whole selection is only a third of a megabyte compressed. Shipping it with the app removes the Worker route, the D1 tables, the publisher's remote protocol and the lexicon's "day 2", gives **every** user of the free build verb forms and noun genders, works offline, and needs no key or request. The service keeps what is the owner's own curated content (topics, wordbook, readers).

## Measured 2026-10-24

A throwaway script (kept locally at `.pi-runs/lexicon-r2/measure.ts`, not committed; the Morphalou source is not in the repository, so the numbers reproduce only on the owner's machine with `MORPHALOU_DIR`) loaded the real allowlisted data exactly as `scripts/lexicon/import.ts` does and serialized it (entries as the Worker returns them, forms as `form -> [[lemma, pos]]`):

| Layout | Raw | gzip | brotli |
| --- | --- | --- | --- |
| One file, entries and forms | 3.09 MB | 0.33 MB | 0.23 MB |
| Entries only (5,022) | 1.61 MB | 0.20 MB | 0.13 MB |
| Forms only (42,593 distinct) | 1.48 MB | 0.13 MB | 0.10 MB |

One lemma response today is about 780 bytes (`être`).

## Facts (read 2026-10-24)

- **Model and import.** `scripts/lexicon/lexicon.ts` (`loadLexicon`, `entryRow`, `SOURCES`, `morphalouDir`, `parseAllowlist`) builds the model from the three Morphalou CSV files and `data/lexicon/lemmas.txt` (committed, 68.5 KB, the allowlist; chosen offline by `select.ts` with the Lexique frequency list, none of whose data is stored). `scripts/lexicon/import.ts` turns the model into D1 SQL and owns the remote-apply protocol (`--apply-local`, `--apply-remote`, TTY and `allowRemote` gates, `checkLexiconPublication`, the failure log). No lexicon data is committed today (`worker/NOTICE.md` says so).
- **Contract.** `src/types/lexicon.ts` defines `LexiconEntrySchema` (verb, noun with gender, adjective), `LexiconSourceSchema` and the two response shapes `LexiconLemmaResponseSchema` / `LexiconFormResponseSchema`.
- **Client.** `src/services/lexicon/load.ts` exposes `lexiconForm(token)` and `lexiconLemma(lemma)` through `contentRequest`; a 404 is "not in the lexicon" (`undefined`). Callers: `src/hooks/useWordSheetPack.ts` (bypasses the lexicon unless `contentServiceUrl()`, lines 34 and 59-60), `src/hooks/useLexiconVerb.ts` (lines 16 and 19), `src/services/lexicon/verbs.ts`, `src/components/word/packSections` (`lexiconVerbLines`), `DictionaryTenses.tsx`. The word sheet withholds the entry until the lexicon settles (`WordDetailModal.tsx:70`). The AI analysis runs in parallel; with no lexicon the verb-form lines are absent and a conjugation-page link remains. Data is labelled "From the Morphalou dictionary, not reviewed". `AboutSection.tsx:27` shows the Morphalou attribution only when `contentServiceUrl()` is set.
- **Server.** `worker/src/lexicon.ts` (two routes), `worker/migrations/0002_lexicon.sql` (two tables, one index, the `lexiconVersion` seed), `worker/NOTICE.md` and `worker/licences/LGPL-LR.txt`, the lexicon sections of `worker/README.md` (Endpoints, runbook day 2), `scripts/content-service/d1Target.ts` uses (shared with the other publishers; unchanged).
- **Tests and fixtures naming the lexicon:** `tests/lexiconImport.test.ts`, `tests/lexiconWorker.test.ts`, `tests/lexiconLoad.test.ts`, `tests/worker.test.ts:162-184`, `tests/fixtures/workerDb.ts` (migration list), `e2e/contentService.helpers.ts:55,77-83`, `e2e/lexicon-word.spec.ts:97,232-236,291,301`.
- **PWA.** `vite.config.ts` precaches `**/*.{js,css,html,ico,png,svg,woff,woff2}` and `pdfjs/**/*` with `maximumFileSizeToCacheInBytes: 3 * 1024 * 1024`. A `.json` file is not matched today, and the raw lexicon (3.09 MB, 2.95 MiB) sits just under that limit.
- **Licence** (read from `worker/licences/LGPL-LR.txt`; not legal advice): no permission from anyone is required; code under MIT or Apache 2.0 is fine; a derived data file stays LGPL-LR with a prominent "modified, date" note and the licence text (section 2); a package combining the program with the resource may be distributed under terms of the maintainer's choice if it permits modification and reverse engineering for the user's own use, says prominently that Morphalou is used, includes the licence text and offers the legible form or a replacement mechanism (section 4). The repository is MIT (`LICENSE`, `package.json`).
- **Not verified (to check in the steps):** that Vite emits a `?url` JSON import as a hashed asset under `base: './'` and that GitHub Pages serves it compressed; first-lookup time and memory on a phone (3.09 MB parsed into two maps); whether the owner's phone browsers keep a 3 MB cached entry under storage pressure.

## Design

**Data file.** `data/lexicon/lexicon.json`, committed, UTF-8, generated: `{ source, entries, forms }` where `entries` is `{ lemma, ...LexiconEntry }[]` sorted by lemma then pos (the existing entry shapes, so `LexiconEntrySchema` is reused), `forms` is `Record<form, [lemma, pos][]>` sorted by form, and `source` is the existing source object plus the Morphalou source identity (`sourceVersion`, `morphalou-3.1+<8 hex>`), a `changes` sentence ("Selected lemmas and reformatted from Morphalou 3.1; forms unchanged") and `modified` (the ISO date of the build). That `changes` and `modified` pair is the section 2(b) notice. Add `LexiconBundleSchema` to `src/types/lexicon.ts`; the two response schemas stay because they are the types the callers already use.

**Build script.** `scripts/lexicon/build.ts` replaces `import.ts`: it reads Morphalou through the existing `loadLexicon`, applies the allowlist, writes `data/lexicon/lexicon.json`, and with `--check` (the CI mode, with no Morphalou source needed) validates the committed file: it parses with `LexiconBundleSchema`, every form's `[lemma, pos]` names an existing entry, every entry appears under its own forms, counts equal the numbers stated in `data/lexicon/README.md`, and the licence and notice files exist. The generated file is added to `.oxfmtrc.json` `ignorePatterns` (the lesson: never run the formatter over a generated pack). Add `bun scripts/lexicon/build.ts --check` to the CI list and to the lead's checks.

**Licence files.** `git mv worker/NOTICE.md data/lexicon/NOTICE.md` and `worker/licences/LGPL-LR.txt data/lexicon/LGPL-LR.txt`, rewritten for the bundle: the file is a work based on Morphalou, licensed LGPL-LR; the app code is MIT and is not covered; the rebuild recipe is `MORPHALOU_DIR=... bun scripts/lexicon/build.ts`; how to replace the data file. `data/lexicon/README.md` states the counts. The repository README's licence section says the code is MIT and the files under `data/lexicon/` are LGPL-LR.

**Client.** `lexiconForm` and `lexiconLemma` keep their signatures and return the existing response shapes (with `source` taken from the bundle). Implementation in `src/services/lexicon/load.ts`: the first call fetches the data file by URL (`import lexiconUrl from '../../../data/lexicon/lexicon.json?url'`, so Vite emits one hashed asset, not a 3 MB JS chunk), parses it once, validates it with `LexiconBundleSchema`, builds a `Map` by lemma and a `Map` by form, and keeps them for the session; later calls are synchronous lookups wrapped in a resolved promise. A word missing from a successfully loaded lexicon is `undefined`; a failed fetch or a schema failure is a **real error** shown as today. The HTTP cache and the PWA cache hold the file; no IndexedDB store, no version protocol, no key, no service.

**Gating removed.** The lexicon no longer depends on the content service: remove the `contentServiceUrl()` conditions in `useWordSheetPack.ts` (lines 34 and 59-60) and `useLexiconVerb.ts` (lines 16 and 19) and the now unreachable `NO_LEXICON` path; `AboutSection.tsx` shows the Morphalou attribution always (the service paragraphs stay conditional). The first lookup shows the loading phase the word sheet already has.

**PWA.** Add the lexicon asset to the precache so lookups work offline after install (a `json` glob that matches only the hashed lexicon asset) and make sure it is under `maximumFileSizeToCacheInBytes` with a margin, raising that limit by a stated amount if needed. Acceptance is checked on the build output: the generated precache manifest in `dist/sw.js` lists the asset. If precaching it is judged too large for first install (about 0.33 MB over the wire), use a `CacheFirst` runtime rule instead and say that the first lookup needs the network once; the worker reports which and why.

**Server and D1.** `worker/src/lexicon.ts` and its two routes are removed; the lexicon tables, index and `lexiconVersion` seed leave the D1 migrations (nothing is deployed, so `0002_lexicon.sql` is deleted and the other migration names are kept; the gap in numbering is acceptable and recorded in `worker/README.md`). `scripts/lexicon/import.ts`, `checkLexiconPublication`, the lexicon's remote-apply flags, `tests/lexiconImport.test.ts`, `tests/lexiconWorker.test.ts` and the lexicon cases of `tests/worker.test.ts` and `tests/fixtures/workerDb.ts` go. The shared `d1Target.ts` stays (the other three publishers use it). `docs/d-remote-plan.md` day 2 and the lexicon rows of the runbook are removed: the first deployment is one day, topics, the vocabulary book and readers.

**Docs.** `worker/README.md` (Endpoints, runbook day 2 and the lexicon smoke check, the lexicon row counts), `docs/adr-hosted-content-service.md` (a short amendment: the lexicon is open data shipped with the app; the service holds topics, the wordbook and readers; section 8 Q2's lexicon items are superseded), `docs/architecture.md`, `docs/development.md` (the lexicon local import commands), `docs/drizzle-plan.md` (the lexicon tables leave the baseline), the About text in `en.json` and `zh.json` (`settings.about.servicePrivacy` no longer mentions the dictionary request; `settings.about.lexicon*` states that the dictionary is part of the app, from Morphalou under LGPL-LR, and links the notice), `CHANGELOG.md` (a line: verb forms and noun genders now work without a service).

## Steps

Each is one small TASKS step: a worker in a worktree (installs and network by the lead only, RULES.md), a diff review, the lead re-running every check in the main checkout, a local merge. They land separately.

- **LB1 Data and build.** `scripts/lexicon/build.ts` (generate and `--check`), `LexiconBundleSchema`, the committed `data/lexicon/lexicon.json` (generated by the lead on the owner's machine with the real Morphalou files, not by a worker: the source is private to the machine), the notice and licence moves, `data/lexicon/README.md`, `.oxfmtrc.json`, CI step, tests (schema, consistency checks on a small invented fixture, `--check` refusals). Acceptance: `bun scripts/lexicon/build.ts --check` exits 0; the generated file's counts are 5,022 entries and 42,593 forms; `format:check` and the formatter ignore hold.
- **LB2 Client.** The loader, the removed gating, the always-on attribution, the PWA precache, the About and CHANGELOG text, tests (a loader test over the real committed file: lookups for `être`, a form and an unseen word; a failed fetch is an error; the word sheet and verb tenses still pass; the precache manifest check on the build). Acceptance: all checks exit 0 in the main checkout; the lexicon works with the content service off; the owner checks first-lookup time on a phone.
- **LB3 Remove the server side.** The Worker route and tables, `import.ts` and its tests, the e2e fixtures and specs (updated without running browsers), `docs/d-remote-plan.md`, `worker/README.md`, the ADR, the Drizzle plan note. Acceptance: Worker typecheck, full suite and the CI checks exit 0; no remaining reference to `lexicon_entries`, `lexicon/form` or `lexiconVersion` outside history notes (grep).
- The lead writes the docs and the TASKS/PROGRESS entries.

## Risks

- A larger repository and one more generated file that must never be hand-edited or reformatted (ignored by oxfmt, checked by `--check`).
- First lookup cost on a phone (download from cache plus parsing 3.09 MB and building two maps) is not measured; the word sheet waits for it. If it is too slow, store the maps in a compact form or build them in an idle callback, but only after measuring.
- Precache size on first install; the fallback is the runtime-cache rule above.
- Anyone can read the lexicon from the public build, which is intended: it is open data and the owner has chosen this.
- A later correction to the data needs a new release of the app (Morphalou 3.1 is a 2016 release; changes are rare).

## Options considered

- **A. Keep D1:** works, needs day 2 and 50 KB statements.
- **B. One object in a private R2 bucket behind the access key, downloaded once and cached in IndexedDB:** removes SQL and day 2 but adds R2 operations, a bulk transport, a persistent cache with versioning and a new publisher; the review found its client cost larger than first stated. Worth reviving only if the lexicon must stay behind the key.
- **C. R2 shards, per lookup:** keeps per-tap requests and the rate-limit question.
- **D. Bundled (chosen):** smallest client, no operations, serves every user, fits an open-source app. Its cost is a committed derived data file and an app release for any correction.

## Questions for the reviewer

1. Is D really the smallest complete design, counting the build script, `--check`, the PWA change and the removals? Is anything in the removal list wrong, or missing (grep the repo for `lexicon`)?
2. Does the licence section hold against the text in `worker/licences/LGPL-LR.txt` (sections 2, 3, 4)? Is the `changes`/`modified` notice enough for 2(b), and does the plan keep the "prominent notice with each copy" of section 4?
3. Will the client design work with Vite 8, `base: './'` and `vite-plugin-pwa` (the `?url` import, the precache glob and size limit, `registerType: 'autoUpdate'`)? What breaks in tests (Bun has no Vite `?url` import)?
4. Is the sequence LB1, LB2, LB3 landable in separate steps without a broken intermediate state (the client uses the bundle while the Worker route still exists; CI `--check` before the file exists)?
