# PROGRESS

What is done, what broke, what is next, newest first. Short and factual; the next steps are `TASKS.md`, the direction is `docs/roadmap.md`, the history of the FrenchLab merge is `docs/merge-progress.md`, and what a learner can notice is `CHANGELOG.md`. The session-by-session working notes (`docs/HANDOFF.md`) are local only.

"Verified" means a check ran and its exit code was read. Anything that needs a browser, a device, a microphone, a real key or a deployed service is **unverified** until the owner has tried it.

## 2026-10-25: Recordings out of the sidebar

- Owner decision: Recordings is a function of Speaking, not a menu entry. Speaking's only sidebar child is Read aloud; Recordings opens from the Speaking page link and the reader's "All recordings", at the same route, and Speaking stays the highlighted area there. Tests pending (nav tests expect two Speaking children). **Unverified:** no browser.

## 2026-10-25: Recordings page title aligned

- The page at `#/speaking/recordings` is titled Recordings / 跟读录音 like its nav label, and Speaking no longer names the place it links to. Tests pending (some pin the old title and the location sentence). **Unverified:** no browser.

## 2026-10-25: N3 landed (Recordings under Speaking; My study removed)

- Independent N3 tests cover the recordings round trip, the deleted study addresses, the Speaking children at every width and the locale removals; 2,610 tests pass and all six checks exit 0. E2e was updated by a GPT worker (`0057ed4`), typechecked, **not run**. **Unverified:** no browser.

- Recordings is Speaking's second child at `#/speaking/recordings` (route `recordings`, area `speaking`, no badge); My study, `STUDY_TABS`, `StudyTab`, `StudyView` and the `study` area are deleted, so `#/study` and `#/study/shadowing` are not found. `ShadowingLog` owns its page container and a back link to Speaking; Speaking links to Recordings; the reader's "open log" opens it and App drops `logSourceId` when the learner leaves it. Locale keys `nav.vocab`, `study.label` and `study.shadowing` are gone; `nav.recordings` is new. Docs updated. Existing assertions on the old addresses and My study fail until the test worker runs; typecheck needed literal changes in `tests/navBadges.test.tsx` and removal of one obsolete test (and the `STUDY_TABS` import) in `tests/routes.test.ts`. **Unverified:** no browser.

## 2026-10-25: N2 landed (Mistakes at the top level)

- Mistakes is a top-level row before Progress at `#/mistakes` (area `mistakes`), with the unresolved badge on the row at every width; `#/study/mistakes` is not found and bare `#/study` opens Shadowing. My study keeps Shadowing as its single child until N3. `MistakeNotebook` owns its page container; `StudyView` lost the Mistakes tab; the Today and Gender links point at `#/mistakes`. Docs updated. Tests and e2e not yet updated for N2 (existing assertions on the old addresses fail until the test worker runs); typecheck needed three literal changes in `tests/`. **Unverified:** no browser.

- Independent N2 tests cover routes, separate row badges, key-banner decisions and Today/Gender links; 2,605 tests pass and all six requested checks exit 0. E2e updated and typechecked, **not run**; browser acceptance remains manual.

## 2026-10-25: N1 landed (Words at the top level)

- Words is a top-level row after Reading at `#/words` (`#/words/all`, `/review`, `/play`, `/map`), with the due badge on the row at every width; `#/study` now opens Mistakes and `#/study/words…` is not found. `StudyView` lost the Words tab. The Words home tab is now called Overview, and the Chinese Words label is aligned. Docs and the DESIGN.md badge rules are updated.
- Independent N1 tests (GPT, a different model from the code's author) cover routes, top-level navigation, separate badges, Overview/locales and key-banner decisions; e2e addresses and selectors are updated and typechecked, **not run**. Baseline 2,582 tests with 14 failing; the test worker first left 4 Today assertions red, but the lead's acceptance line was wrong: Today's words step keeps opening Review at `#/words/review` (`plan`: `TodayCard.tsx:37` unchanged), so those assertions now expect that and the suite is green (2,596). Typecheck, lint, i18n, format and shape exit 0. **Unverified:** no browser, no e2e run.

## 2026-10-25: N0 landed (App.tsx split, `app-split`)

- `App.tsx` (498 of 500 lines) is now 142. `useAppData` owns startup, articles, stats, failed saves and the guide flag; `useReaderLookup` keeps the reader document, lookup sheets, bookmark and assessment callback together; `AppShell` (with `SaveFailedBanner` and `MissingKeyBanner`) draws the frame; `AppRoutes` is the route-to-page switch with the lazy pages and their Suspense boundaries unchanged. Markup, props, keys and behaviour are unchanged; state that outlives a page (key request, log source, hasKey) stays in `App`.
- Verified: see the check chain in the commit's report (typecheck, lint, test, i18n, format, build, detector). **Unverified:** no browser.

## 2026-10-25: vocabulary review fixes (`vocab-fixes`, awaiting lead review)

- Confirmed all eight findings against the code. ZIP collections are bounded by declared expansion before inflation; Zstandard output is capped during streaming (200 MiB database limit), including frames without a declared content size. Plain text is capped before reading (10 MiB) and at 20,000 logical notes. Importer-authored refusals retain translation keys/parameters through the result UI.
- Run loading/failure no longer means queue completion; the unchanged hook's queue inputs determine exhaustion. Revealed game speech explicitly uses the device. Closed-class AI/reader cards keep their gloss and ask for recognition. Challenge, action, card and recall slots keep fixed heights. Small run-model and logging modules keep the run view below 500 lines.
- Game logging records unlogged ratings on exhaustion/unmount, flushes the previous size when size changes, and resets the logging baseline on size/Continue. No plain-mode writer was added. The two protected review files are unchanged; test namespace imports were replaced with dynamic imports.
- Verified in this worktree: requested typecheck → lint → test → i18n → format → build chain exit 0 (2,579 tests, no flaky failure); detector exit 0 with `[]`; shape and diff checks exit 0. AI/speech are mocked, IndexedDB/Anki fixtures synthetic. **Unverified:** browser layout/focus at 360 px and in themes, IME/phone keyboards, a real French device voice and real Anki exports. Build retains its large-chunk warning. Lead review remains pending.

## 2026-10-25: VG6 landed (the opt-in goal); the vocabulary plan is complete except VG7

- An optional exam date and a mature-word target in `appSettings` (device-local, excluded from backups in both directions, validated once in `goal.ts`: a past date and a non-positive target are refused with real messages). With a goal set the Words home shows the days left (calendar days, DST-safe), the real mature count now, the target and the last four weekly "words gained" numbers from `weeklyGained`, which `gainedThisWeek` now uses too (one first-attainment rule). No forecast, no "on track" wording; with no goal set nothing about goals shows.
- Verified (exit 0) on the merged tree in the main checkout: typecheck, lint, full suite (2,565), i18n, format and shape, build, detector `[]`. **Unverified:** no browser.
- State of `docs/vocab-game-plan.md`: VG1 to VG6 and VG8 landed; VG7 (feel) is deferred by the plan and owner-gated; seeding FSRS from a revlog is not built.

## 2026-10-25: VG8 landed (`.apkg` import)

- `apkg.ts` reads a package with `fflate` (zip), `fzstd` (the zstd-compressed `collection.anki21b`) and `sql.js` (the collection), preferring `anki21b`, then `anki21`, then `anki2`, and refusing a stub-only package, a corrupt file or an oversize file with a real message. Notes of the chosen note type feed the same normalization, column picker, preview and merge as the text import. The dialog and the whole import pipeline (parser, `prepare.ts`, the 40 KB entity table, the three libraries) now load by dynamic import on the first file pick; the VG4 follow-up about the Words chunk is closed.
- Verified (exit 0) in the worktree, whose base already held VG5: typecheck, lint, full suite (2,551), i18n, format and shape, build, detector `[]`; the lead grepped the built chunks (the entity table only in `prepare-*.js`) and the clean merge into the main checkout. **Unverified:** no browser, no REAL Anki export; FSRS seeding from a revlog is not done.

## 2026-10-25: VG5 landed (the map and the leech group)

- `#/study/words/map` with a "Map" link on the Words home: regions (book pages, imported decks, saved, other) with counts as text and a segmented bar, collapsible word lists with a tier label (new, learning, young, mature), a Leeches group (8 lapses or more, with memory trick and examples), and a boss card: a leech shows that extra context after the reveal in the run, never extra rating chances. `collection.ts` holds the pure `tierOf`, `leechesOf` and `bossContextOf`; `summarizeRegions` now returns member keys.
- Verified (exit 0): typecheck, lint, full suite (2,536), i18n, format and shape, build, detector `[]`. **Unverified:** no browser.

## 2026-10-25: VG4 landed (Anki plain-text import)

- Parser for Anki "Notes in Plain Text", TSV and CSV (headers, separators, quotes, BOM), normalization before validation (HTML, entities, `[sound:]`, apostrophes, NFC), refusals with row number and real reason, the `imported` definition and `import` source kinds, one atomic import transaction (duplicates merge without touching schedule or history; increasing `bookmarkedAt` in deck order), `cardContent`, regions and the run's pool learn the third kind, backup round-trip, and an import dialog on the Words home. `src/components/ui/dialog.tsx` was written by hand on Base UI (no network for `shadcn add`).
- Entity names come from `entities.json` (Python's `html.entities.html5`, 2,125 names, 40 KB); numeric references are decoded in code. The merge with VG3 conflicted only in `CHANGELOG.md`; the combined run test file went over the 500-line shape limit, so its imported-row test moved to `tests/vocabularyRunImport.test.tsx`. Verified (exit 0) after the merge in the main checkout: typecheck, lint, full suite (2,525), i18n, format and shape, build, detector `[]`. **Unverified:** no browser; the dialog's look and focus; a real Anki export (only invented fixtures).

## 2026-10-25: VG3 landed (weekly rhythm, run summary, device-local run log)

- `rhythm.ts` (seven local days by calendar arithmetic, "now" vs "gained this week" with the first-attainment rule), seven marks and a text count on the Words home, both numbers in the run's done state, and `runLog.ts` (last 90 finished chunks in `appSettings`, excluded from backups in both directions, written once per chunk; no UI). No streak or loss state exists.
- Verified in the worktree (exit 0): typecheck, lint, full suite (2,510), i18n, format, build, detector `[]`; the protected files are unchanged. **Unverified:** no browser; the look of the marks.

## 2026-10-25: VG2 landed (the vocabulary run)

- `#/study/words/play`, a "Play a run" link beside Start, `lexiconFormsOf`, and the run view in `src/components/vocabulary/game/` (challenge before the flip, "I don't know" reveals, Just flip, runs of 5, 10 or 20 ratings counted from a baseline in one hook instance, done-for-now and queue-cleared states, its own pure key function). `useVocabularyReview.ts`, `storage/vocabulary.ts`, `VocabularyReview.tsx` and the VG1 core are unchanged.
- GLM 5.3 hit its 5-hour limit before committing; its uncommitted work was audited, completed and committed by Gemini 3.8 flash (owner allowed the fallback). Verified in the worktree (exit 0): typecheck, lint, full suite (2,499; one flaky grammar-topic test failed once and passed alone and on re-run), i18n, format, build, detector `[]`.
- **Unverified:** no browser, phone or IME run; the write-count test drives the existing hook through a hand-built harness, not the run view. No second-model review of the diff yet.

## 2026-10-25: Debt review of LB1 to LB3 and LG1 (gpt-6-astra, verdict fail, nine findings); fixes merged

- The review (`ac1d207`, read-only) found one high, five medium and three low problems: the Le ou la round's keyboard and save flow, a stale lexicon error in the word sheet, 36 px targets, stale docs and dead re-exports. The lead checked findings 2, 3 and 4 against the code before dispatching.
- Fixed by three workers, each merged after the lead re-ran the checks in its worktree: `gender-fixes` (GLM 5.3; held Enter, Enter/Space on a choice, the deck advances only after the save, a token-read Retry reuses the saved set, recap focus and announcement, 40 px targets), `docs-debt` (Gemini 3.8 flash; the lead restored the closed D-limit row it had reopened), `lexicon-retry` (GLM 5.3; the verb-form section asks again after a failed load, the dead `packSections` re-exports, stale comments).
- Verified (exit 0 in each worktree): typecheck, lint, full suite (2,472 and 2,473 tests), i18n, format, build, detector `[]`. **Unverified:** key handling is tested as pure functions only (no DOM test library); held-key, focus and live-region behaviour have not run in a browser. No second review of the fixes yet.

## 2026-10-25: Opus review of the vocabulary game plan and VG1; fixes merged (VG1b)

- An Opus `reviewer` read `docs/vocab-game-plan.md` and the VG1 code (verdict fail, 20 findings; verified the checkable ones: `removeVocabularyBookmark` keeps the schedule, `resetVocabularySchedule` keeps history, `routes.ts` sends any third segment other than `all` to review, book positions have 29 gaps (0 to 7,390), the review screen's key guard blocks composition keys). The plan now defines a chunk by ratings in one hook instance and shows `nextDue`, keeps Today unchanged, drops the forecast for a weekly series, says the self-rating hypothesis cannot be measured without a device-local run log (fork 1e), adds an "Other words" region and the VG2 and VG4 dependencies. The code findings were fixed by glm-5.3 (`49a1cb0`): the card's own word never a distractor, choice cloze options are headwords with gloss exclusion, one language per recognize question, an `other` region, pages by index, NFC and `\p{M}`, word boundaries and hyphen rule, `produce`/`listen` grading through `normalizeFrench` with nouns-only article stripping, a real fall-back ladder; 40 tests in the two files.
- Verified in the main checkout (exit 0): typecheck, lint, format, shape, i18n, full suite (2,470), Worker typecheck, build, detector `[]`; the finder on the real book reaches 88.6% (96 entries gained from hyphenated headwords, 16 lost to the boundary and hyphen rules, listed in the plan). **Billing note:** Pro moved from 82% to 83% weekly and 57% to 64% in five hours during the Opus review (my own turns are included); the Team account stayed at 0%. The owner says the accounts switch automatically, so no action.
- The codex review of LB1 to LB3 and LG1 has run and its fixes are merged (next entry above).

## 2026-10-25: CV1 landed (the owner-run check of the conjugation prompt, issue #21)

- `scripts/grammar-pack/check-conjugate-providers.ts`: four cases (`parler`, `prendre`, `se lever`, `haïr`), `--repeat` (3), `--providers`, `--dry-run`; providers from the registry; keys, models and base URLs only from `RELIRE_KEY_/RELIRE_MODEL_/RELIRE_BASEURL_<PROVIDER>`; it calls the app's own `conjugateVerb` path and the engine-side verification and classifies each run (ok, network or HTTP, JSON, schema, engine disagreement); every error text and answer preview is redacted of key values and header text; the table goes to stdout, the detail to `.local/conjugate-check/`. Worker: `magpie/deepseek/deepseek-flash` (`6937e65`, the right route this time), 15 mock-only tests, a subsection in `docs/development.md`.
- Verified (exit 0 in the main checkout): typecheck, lint, format, shape, i18n, full suite (2,459), Worker typecheck, build, and `--dry-run` with no keys set (all three providers skipped). **Unverified:** no real provider has been called; the owner runs it. The lead read where keys flow (a redact function applied to messages and previews; `process.env` is read only for the planned variables).

## 2026-10-24: Wrong deepseek route used for four worker runs (corrected)

- The owner wanted pi's **magpie** route for deepseek-flash (`magpie/deepseek/deepseek-flash`); the lead dispatched `deepseek/deepseek-flash`, which pi reads as the direct `deepseek` provider, a route that `docs/agent-delegation.md` lists under "Never" (the lead did not consult that table when switching models). Affected runs: LB2, LB3, Le ou la (LG1) and VG1, about 2 CNY of the direct balance. The code from those runs was checked and merged on its own merits (all checks, a real-data measurement for VG1), and the model is the same, but the route was not the owner's. The delegation table now has the magpie row (smoke-tested, "smoke ok" in about 3 s) and the lead uses it from here.

## 2026-10-24: VG1 landed (the vocabulary game's pure core)

- `src/services/vocabulary/game/challenge.ts` (kinds chosen from the card's real state, the surface-form finder with the plan's tiers, distractor rules, a seed with the appearance index, typed and choice grading) and `regions.ts` (counts per wordbook page and "Saved from reading": introduced, learning, young, mature at 21 days or more, leeches at 8 lapses, unseen), 29 tests. Worker: deepseek-flash (`5ee0ae4`, about 0.5 CNY). No UI, no storage, no existing file touched.
- Verified (exit 0 in the main checkout): typecheck, lint, format, shape, i18n, full suite (2,444), Worker typecheck, build, detector `[]`. The lead re-ran the cloze measurement with the real finder on the owner's private book: **87.5%** of 7,362 entries have an example where a surface form is found (my first script said 86.3%; the finder is a little more generous), and a spot check of the 1,460 matches that differ from the headword (`commettre` found as `commis`, `national, e` as `nationale`, `placer` as `placé`) looked correct. **Unverified:** nothing runs in a browser yet; the diff has not been reviewed (codex window); the plan has not been reviewed.

## 2026-10-24: Vocabulary game research (Gemini 3.8) and how far to trust it

- `.pi-runs/vocab-game-research/report.md` (local, 53 KB): products (Duolingo, Memrise, Quizlet, Anki add-ons, WaniKani, Clozemaster, Lingvist, Drops, roguelike/deck-builder learning games), a mechanics taxonomy, evidence, SRS-plus-game pitfalls, DOM/CSS implementation, Anki file formats.
- Spot-check by the lead (Crossref DOIs): the five core papers exist with the stated titles, authors and journals, and the Chen, Tseng and Hsiao statistics match the abstract. **The report over-reads several of them:** Shahiwala and Rahul 2026 (g about 1.1) is about commercial off-the-shelf games, not game layers on flashcards; Sailer and Homner 2020 found small positive effects on cognitive outcomes (g .49), so it does not support "points and badges have no effect on retention"; Hanus and Fox 2015 is a university classroom with badges and leaderboards and does not say beginners or adult self-learners are demoted; Chen et al. propose, not find, that adventure games raise engagement; the Karpicke and Roediger figures (80% against 30%) are not in the abstract. Treat the report as a map of products and mechanics with real references, not as settled evidence. What holds: spacing and active retrieval have strong support; gamification overall is small, unstable and novelty-sensitive; the game should make retrieval the play.
- Not yet spot-checked: the product descriptions (Duolingo, Memrise and the others) and the Anki format claims.

## 2026-10-24: Cloudflare limits read; D-remote-2b closed

- Gemini 3.8 (agy) read the official Cloudflare pages (D1 limits and pricing, Workers limits, the Rate Limiting binding) and wrote a cited report (`.pi-runs/cf-limits/report.md`, local); I re-checked the D1 figures against the two D1 pages myself. Result: one TEXT value of 108,810 bytes fits (2,000,000-byte row/string limit), bound as a parameter; a literal inside a `wrangler d1 execute --file` statement would not (100,000-byte statement limit). The vocabulary and reader publishers bind the body, and the largest topic `INSERT` is 16,091 bytes, so **D-remote-2b is closed as not needed**. An indexed column adds a written row; the first deployment is a few hundred rows against 100,000 per day. The page does not say whether the Rate Limiting binding is available on the free plan: that is checked at the first deploy. The figures and URLs are in `worker/README.md` ("Cloudflare limits"). The report's section E was cut off mid-sentence in the file; its final reply and the figures settle the question. Unverified: the quotes of the pages I did not re-fetch (Workers limits, rate limiting).

## 2026-10-24: LG1 landed (Le ou la, a noun-gender round prototype)

- Grammar → Gender gets a "Play a round" button that swaps the page body in place for `GenderGame`: a saved twelve-noun `GENDER_CHECK` unit, one bare lemma at a time, `1`/`←` for le and `2`/`→` for la, a fixed feedback slot with the ending tendency or the exception, Next, and an end line with first-try counts and the plain note that guessing between two options gets about half right. The pure deck (`src/services/nounGender/deck.ts`) sends a miss to the end of the queue; only each card's first answer is written through `checkItem` (a returning card writes nothing, never Redo, no FSRS write, as the study recommends). Worker: deepseek-flash (`ac7e89b`, about 0.5 CNY, 12 new tests).
- Verified (exit 0 in the main checkout): typecheck, lint, format, shape, i18n, full suite (2,415), Worker typecheck, build, detector `[]`. **Unverified:** the look at 360 px and in the themes, real keyboard use, how a round abandoned mid-way looks in Grammar → Exercises; the diff has not been reviewed (codex quota). The owner's week of use decides whether it stays (kill criteria in `docs/le-ou-la-plan.md`).

## 2026-10-24: LB3 landed; the lexicon is fully out of the service

- Removed: `worker/src/lexicon.ts` and its routes, `worker/migrations/0002_lexicon.sql` (the numbering keeps a gap, nothing is deployed), `scripts/lexicon/import.ts` and its remote-apply protocol (`sourceVersion` moved to `scripts/lexicon/lexicon.ts`), the Worker lexicon tests and the lexicon parts of the D1 target and publisher tests. The Worker holds topics, the wordbook and readers. Worker: deepseek-flash (`3ecaed6`, about 0.4 CNY). Docs updated by the lead: `worker/README.md` (no day 2; one-day first deployment), ADR amendment 5, `docs/d-remote-plan.md` note, `AGENTS.md`, `PRODUCT.md`, `docs/architecture.md`, `docs/roadmap.md`, `docs/grammar-pack.md`, `docs/development.md`.
- Verified (exit 0 in the main checkout): typecheck, lint, format, shape, i18n, full suite (2,403), Worker typecheck, every CI `--check`, build, detector `[]`, and the removal grep. **Not yet done:** a review of the LB1 to LB3 diffs (waiting for codex quota), and the owner's checks (phone lookup time, the About links, the unrun `e2e/lexicon-word.spec.ts`).

## 2026-10-24: LB2 landed (the client reads the bundled lexicon)

- `lexiconForm` and `lexiconLemma` keep their signatures and now read `data/lexicon/lexicon.json` through `new URL(..., import.meta.url)`: one fetch bounded at 10 s over the fetch and the body read, `LexiconBundleSchema`, two maps, the four-field `source`, a shared in-flight promise cleared on failure. The `contentServiceUrl()` gating and the no-service fast path are removed from `useWordSheetPack` and `useLexiconVerb`; the file is in the PWA precache (limit raised from 3 to 4 MiB; raw size 3,092,981 bytes). Worker: deepseek-flash (`f4ee290`, about 0.4 CNY).
- Verified (exit 0 in the main checkout): typecheck, lint, format, shape, i18n, full suite (2,430), Worker typecheck, `build.ts --check`, build (asset in `dist/assets` and in `sw.js`), detector `[]`. **Unverified:** first-lookup time and memory on a phone; browser behaviour; the e2e edits (`e2e/lexicon-word.spec.ts` lost most of its stubs and was never run). The diffs of LB1 and LB2 are not yet reviewed (codex and zai were above 80% of their 5-hour windows); review is pending.

## 2026-10-24: LB1 landed (the lexicon as a committed data file)

- Plan `docs/lexicon-bundle-plan.md` (option D, owner decision; one review by gpt-6-astra, nine problems applied). `LexiconBundleSchema`, `scripts/lexicon/build.ts` (generate and `--check`; `--check` also requires the unique `(lemma, pos)` set to equal `data/lexicon/lemmas.txt`), the Morphalou notice and licence moved to `data/lexicon/` (licence text unchanged), the About page links to local copies emitted by Vite and precached (`?no-inline`), scope notes in `LICENSE` and both READMEs. Worker: glm-5.3 (`91f68c9`). I generated `data/lexicon/lexicon.json` on the owner's machine from the real Morphalou files: 5,022 entries, 42,593 forms, `morphalou-3.1+76763fc2`, byte-identical on a second run, and added the CI step in the same commit.
- Verified (exit 0 in the main checkout): typecheck, lint, format, shape, i18n, full suite (2,432), Worker typecheck, every CI `--check` including the new one, build (the two licence assets in `dist/assets` and in the `sw.js` precache), detector `[]`. **Unverified:** the real-data run is the owner's machine only; fidelity of the file to the CSVs cannot be checked in CI; the About links in a browser. Next: LB2 (the client loader), then LB3 (remove the server side).

## 2026-10-24: RS3 landed (the Worker inside `vite dev`)

- `@cloudflare/vite-plugin` 1.63.1 (newest stable at least two weeks old; peer range includes Vite 8) is applied in `vite.config.ts` for `serve` only, with `configPath` `worker/wrangler.jsonc`, `persistState` the publishers' `worker/.wrangler/state` (the plugin appends `v3`), `remoteBindings: false` (its default is true), and in-memory overrides: `assets.run_worker_first: ['/v1/*']` and `compatibility_date` 2026-10-13 (the plugin's workerd is older than the Worker's 2026-10-19). `wrangler dev` in `worker/` still works. Worker: glm-5.3 (`296c252`), spike first, all six gates passed with evidence.
- Verified by the lead in the main checkout (exit 0): typecheck, lint, format, shape, i18n, Worker typecheck, build, detector `[]`; the `dist` content hash is identical with the plugin config and with the previous config (`be6255bc…`, same env); a dev server on port 5290 answered `/v1/topics` 401 with `WWW-Authenticate` and CORS for an allowed origin, `/` and `/icon.svg` 200 from Vite. **Unverified:** an authorized read in the main checkout (needs the owner's `worker/.dev.vars`), the compat-date divergence beyond the Worker's current APIs, Settings Test against this dev origin in a browser.
- Incident: the worker's `pkill -f workerd` killed the workerd child of an old `wrangler dev` (started Monday from this checkout, `--persist-to /tmp/relire-it-d1`); that port-8787 listener was already absent when I checked at the start of the session, so nothing the owner relied on changed, but a stale `wrangler` parent (PID 29466) is still running. Lesson: workers must never `pkill` by name; stop only the PID they started.

## 2026-10-24: RS2 landed (Settings > Content service)

- A device-local `contentService` settings block (`enabled`, `url`, `key`), off by default, dropped from backups on export and kept on restore. `contentServiceUrl()` is `undefined` unless enabled with URL and key, so the 23 call sites are unchanged; `contentServiceFetch` sends `Authorization: Bearer`. New section `service` in Settings: URL, key, Test (draft values, `cache: 'no-store'`, topic-list schema, stale results ignored, the real error after each hint), and a Test-gated Enable switch (new `ui/switch`, Base UI; `shadcn add switch` again generated a wrong `cn` import and was hand-fixed). The 23 call sites were re-checked: nothing stays mounted beside Settings, so no reload and no subscription.
- Worker: glm-5.3 (`49846bc`). gpt-6-astra reviewed the diff (fail, 5 points: replaced real errors, unstable slots, a hand-drawn switch, missing page-level test, star imports; plus a stale About sentence); deepseek-flash fixed them (`d8a25f6`, about 0.3 CNY), I simplified one nested ternary. The reader's labelled toggle `Button` keeps its own markup (a switch cannot nest in a button).
- Verified (exit 0 in the main checkout): typecheck, lint, format, shape, i18n, full suite (2,422), Worker typecheck, build, detector `[]`. **Unverified:** the section's look at 360 px and in the three themes, a real Test against a running Worker, Enable end to end in a browser.

## 2026-10-24: RS1 landed (routed Worker API with access keys)

- Plan `docs/remote-settings-plan.md` (two reviews by gpt-6-astra because Argon had no quota; every finding applied). The Worker is a Hono app (`worker/src/index.ts`) with its own CORS, method, limiter, `OPTIONS` and access-key middleware in that order, prefix routes over the raw path, resources split into `topics.ts` and `lexicon.ts`. `ACCESS_KEYS` fails closed; SHA-256 digests compared without an early exit (Bun has no `timingSafeEqual`); 401 carries the CORS headers and `WWW-Authenticate`; every success is `private, no-cache` with `Vary: Origin, Authorization`; auth runs before the `ETag` match.
- Worker written by gpt-6.1-sol (`43a320f`); review of the diff by gpt-6-astra failed on two points (the Bearer scheme was case- and space-sensitive; the `pinned` field was dead), both fixed in the merge `ff3826c`. Docs: `worker/README.md` (Access key section, runbook order: deploy, then `secret put`, then smoke checks with and without a key), ADR amendment, `AGENTS.md`, `docs/architecture.md`.
- Verified (exit 0 in the main checkout): typecheck, lint, format, shape, i18n, full suite (2,400), every CI pack `--check`, `vocabulary/publish.ts --check`, Worker typecheck and `bun install --cwd worker --frozen-lockfile`, build (no Hono in `dist`), detector `[]`. **Unverified:** a real `wrangler secret put`, a deployed Worker, a browser call with a key. **Open:** the app cannot send a key until RS2, so a configured local app gets `401` from this Worker until then (the plan treats RS1 and RS2 as one integration boundary).

## 2026-10-24: D-origins landed; D-remote code is complete

- `.gitignore` ignores `worker/wrangler.deploy.jsonc`; `worker/README.md` no longer tells the owner to edit the committed config and carries the owner-only deployment runbook (day 1: migrations, topics, vocabulary, readers; day 2: the lexicon alone; smoke checks; CORS origin). `docs/development.md`'s "No remote mode" sentence is corrected. Nothing in the runbook has been run: the owner's own Cloudflare login, the D1 limits check (decides D-remote-2b) and the deploy are the next steps (TASKS Owner).

## 2026-10-24: D-remote-3 and Today v2 V1/V2 landed locally

- D-remote-3 (`922448d`): topics and the lexicon get `--apply-remote`, interactive (Wrangler's own confirmation), allowed only with `allowRemote` (from `import.meta.main`) and a TTY on stdin and stdout; success is decided only by a read-only check (topics: version and every id/position/hash/byte length; lexicon: version and both counts), never by Wrangler's exit code; refusals and Wrangler's stderr reach the owner's terminal. Argon: pass. **Unverified:** any remote run (no agent has touched a remote database); the `--json` shape against a remote database is checked only against Wrangler's code.
- Today v2: V1 plan model (`nextIndex`, `doneCount`, `counts`, reader `title`) and V2 view (one card of ordered rows, expanded next step with the one filled button, aside of real counts, practise row, strings in en and zh) merged; `ui/card` written by hand because the shadcn output pulled in a wrong `cn` package and a ring. Verified: all checks, detector `[]`, build. Seen by the lead at 1280 px light and phone width dark, not by the owner. V3 (copy pass, one-sentence first-run line, full date) and V4 (DESIGN.md Today section, architecture, changelog) landed. **Owner check pending:** look at Today in light, sepia and dark at 360 and 1280 px, a first run and a finished day.

## 2026-10-24: D-remote-1 landed locally (publisher hygiene)

- All four publishers now run a rooted, env-file-free local D1 target through `scripts/content-service/d1Target.ts`: no `.dev.vars`/`.env` read, explicit persist path, no telemetry or banner, failure logs under `<root>/.pi-runs/`, pure `parseArgs`, an `allowRemote` option that is a no-op until the remote steps. The topic and lexicon SQL deletes the version row first. Real local Wrangler and `getPlatformProxy` run in temp-root tests.
- Found on the way: on Node 26 `.bin/wrangler --env-file x` is read by Node and exits 9 (Wrangler's launcher respawns `node` without `--`); the publishers and the owner's `W()` helper run `node --no-warnings -- .../wrangler-dist/cli.js`.
- Verified (exit 0 in the main checkout): typecheck, lint, format, shape, i18n, full suite (2,354), every CI pack `--check`, `vocabulary/publish.ts --check`, Worker typecheck, build. Argon reviewed the diff (fail on three test points; fixed). **Unverified:** any remote run; the typed `getPlatformProxy` import (root cannot resolve `wrangler` types, so it stays annotated by hand). Next: D-remote-2 and 3 (remote flags), D-origins.
- D-remote-2 landed (`8bbe800`): vocabulary `--apply-remote-unreviewed` and readers `--apply-remote` through the same proxy protocol, refused unless `allowRemote` (only from `import.meta.main`) and stdin and stdout are TTYs (one pure guard, both asymmetric cases tested); no test, workflow or default can reach remote. **Unverified:** any remote run. Verified in the main checkout: all checks exit 0, full suite 2,360.
- Today v2: direction B chosen; the plan failed its first Argon review and was redesigned (one card, one ordered sequence); second review pending.

## 2026-10-24: owner decisions on deployment, accounts and content rights (docs only)

- The owner confirmed the vocabulary book is their own work and publishable, and that Morphalou (open, LGPL-LR) needs no permission, only its notices (already built). Recorded as an amendment in `docs/adr-hosted-content-service.md`; the old "local use only / no public distribution / not authorized" lines in `worker/README.md` and `docs/vocabulary-flashcards-spec.md` were removed or reworded.
- Accounts are not part of the first deployment (public read-only, rate limited, CORS-limited). They stay H4 and come with charging, non-public content or sync.
- Found while writing this: the publishers have only a local apply path, so nothing can reach a deployed D1 yet (step D-remote in `TASKS.md`). The vocabulary manifest `attribution` field named a third-party AnkiWeb deck; the owner said the book is their own, so the field was removed everywhere (schema, manifest, scripts, tests). Re-publishing the local D1 is needed to serve the new manifest.

## 2026-10-24: grammar topics in book order, studied marks and a Today step (G1 to G4, C5)

- The Worker used to list topics `ORDER BY chapter, id` (alphabetical, so chapter eight came before chapter one). Topics now carry a `position`, the 1-based index in the committed manifest (the textbook's own order), published to D1 before the id sort and counted in the pack version; `/v1/topics` sorts by it. Position lives only in the list schema, not in full topics, the pack or drafts.
- A learner can mark a topic studied (`meta.topicStudied:<id>`, backed up, restored through the Settings handler too). The Topics page lists chapters in order with numbers, studied marks and a Next link; the topic page has the mark button and a Next topic link, including the two checkpoint topics. Today gains a last Grammar step only when a content service is configured: no request and no step otherwise; a failing list shows the real error on that step and never blocks the other four.
- Argon's review of the plan found six real problems before any code (a position leaking into full topics, the id sort overwriting the order, the reader never loading the list, the Settings restore omission, missing fixtures, a contradictory Today rule); all were fixed in the plan.
- Verified in the main checkout: typecheck, lint, format, shape, i18n, the full suite (2,336 tests), the UI detector, the build, the Worker typecheck and every CI pack `--check` exit 0.
- **Unverified:** a real service round trip after re-publishing local D1, the pages in three themes and at 360 px. **Not a teaching design:** the order is the textbook's; whether it suits zero-basis learners is the owner's or a teacher's call.

## 2026-10-24: Letter sounds practice button (S3b, C4)

- "Practise these sounds" in the Letter sounds section saves a Listening set of spelling-to-sound choices and opens it in Practice; `ItemRow` plays Listen with the device voice for items that declare it. The Practice caption names the spelling drill. Rule files and the `speechAfterCheck` comment name both device-voice sources.
- Verified in the main checkout: typecheck, lint, format, shape, i18n, the full suite (2,288 tests), the UI detector, the build and the pack `--check` exit 0. **Unverified:** hearing it on a real device voice, three themes, 360 px (the owner's).
- Known duplication left alone: the practice button and the reader dictation button share about 25 lines; extract only if a third caller appears.

## 2026-10-24: Letter sounds section and drill preparation (S2, S3a)

- The Speaking page has a Letter sounds section above French sounds: spellings grouped as vowels, nasal vowels, consonants and silent letters; a sheet per spelling with its note, the example words (each with a device-voice Listen button) and a closed "Show IPA" fold. No IPA is visible in the section itself, and the AI-check notice shows while any row is AI-reviewed only.
- `prepareSpellingDrill` and its schema are in (pure, no UI yet): distinct words, two distractor spellings whose sound differs and which are not inside the heard word, same group first, never the silent `h`; listening units accept the new marker. The 200-seed invariant tests run on the real pack.
- Verified in the main checkout: typecheck, lint, format, shape, i18n, the full suite (2,283 tests), the UI detector and the build exit 0.
- **My mistake, fixed:** in S1b I ran the pack `--check` and then `bun run format`, which reformatted the generated `src/data/spelling-sounds/patterns.json`, and I committed that file; the next `--check` failed and CI would have too. The generated pack is now in the formatter's ignore list like the other generated packs, and `--check` passes after `format`.
- **Unverified:** hearing the example words on a real device voice, the section and sheet in three themes and at 360 px. Those are the owner's.

## 2026-10-24: letter sounds data layer, seed content and AI review (S1, C1, C2, S1b)

- A reviewed-pack pipeline for spelling-to-sound content, modelled on the sound-pairs pack: schema (IPA symbols from any chart group, so `oi` is /w a/), a build gate that rejects an example containing a different-sound spelling, a nasal followed by a vowel or `n`/`m`, `oi` before `n`, and a silent `h` not at the word start; the row hash covers both locale notes; the review tool takes `--kind ai|human`; the loader and the CI `--check` line are in. No UI yet.
- Seed content for 16 patterns was written by Gemini (author) and passed the gate with 0 problems. An independent GPT review agreed every example word and IPA target and rejected 12 notes (English comparisons that mislead, nasal conditions too absolute, a circular `eu` note, unclear Chinese) and two example words (`vigne`, `phare`); its own replacement text was applied verbatim. The lead recorded 16 `AI review:` records. **Open:** the `ç` examples `déçu` and `façade` are above A1 and no gate-clean replacement exists.
- The plan was reviewed by Argon first (seven findings, all applied). Verified in the main checkout: typecheck, lint, format, shape, i18n, the full suite (2,265 tests), `--check` and the build exit 0.
- **Unverified:** everything about hearing the words; the labels say AI review, not teacher review, and a human language review is still the release gate for beginners.

## 2026-10-24: reader dictation page and device voice (D2)

- A graded reader page has a "Practise by dictation" section between the checkpoints and Mark read. It saves one Listening set of up to six of the reader's sentences (translation as the clue, French only as audio and as the reference answer) and opens it in Practice. Device voice only, no key, deterministic grading that ignores sentence punctuation; wrong answers go to Mistakes. `NumberDictationControl` takes the device engine from the item and no longer attaches French word lookup to a translated clue. Speech and UI rule files name the exception.
- Verified in the main checkout: typecheck, lint, format, shape, i18n, the full suite (2,240 tests), the UI detector and the build exit 0. The worker also probed that the new tests fail on the old control and on wrong navigation or retry behaviour. The plan was reviewed by Argon first (six findings, all applied).
- **Unverified:** a real device French voice (and iOS Safari), typing a full sentence on a phone, the section in three themes and at 360 px. Those are the owner's.

## 2026-10-24: reader dictation data and grading (D1)

- Added strict saved dictation provenance tied to the effective `NUMBER_DICTATION` type and nonblank audio; reused the reader schemas for identifiers and body versions. Listening gates are unchanged.
- Added pure reader-order-preserving sampling into one standalone Listening unit with translated clues, French audio/answers, edition metadata and save-only retry coverage. The existing published-reader schema owns the three-sentence minimum.
- Scalar grading ignores only the flagged sentence punctuation, replacing it with spaces; hyphens, apostrophes and strict accents remain significant. Unflagged and nonscalar grading are unchanged.
- Verified in the main checkout after the merge: typecheck, lint, format, shape, i18n, the full suite (2,224 tests), the UI detector and the build all exit 0. The grammar CLI test fixture now copies three pure reader modules because exercise metadata imports the reader schemas (`types/exercises.ts` now depends on `types/gradedReader.ts`; no import cycle). The plan was reviewed first by Argon (six findings, all applied). D2 (control, button, rule docs) is not built, so nothing is user-visible and no device voice was exercised.

## 2026-10-24: Today checklist (T1 to T4)

- Today is the page the app opens on (`#/today`; the Library stays at `#/read`). Up to four steps, each a link into an existing page with a status read from stored data: review words (real due and new counts), the next graded reader, sound pairs (always shown), and saved mistakes. "Done today" is derived from review, checkpoint and attempt timestamps in the local day; nothing new is stored. Plan: `docs/today-plan.md`.
- Static checks, the full suite (2,213 tests), the production build and the UI detector all exit 0 in the main checkout after each merge.
- Found while building: `vocabularyQueue` does not cap new cards at the daily limit, so Today caps them by the remaining allowance itself; a first wrong answer today is not a mistake "retry", so retries count only items wrong before today. Both have tests.
- The shared e2e fixture and 12 other specs entered the app with `goto('/')` and would have landed on Today; they now use `/#/read`, the same page as before. **No e2e was run.**
- **Unverified:** the Today page in light, sepia and dark and at 360 px, the first-run flow with onboarding, and Sound pairs audio on a real device voice. Those are the owner's.

## 2026-10-23: graded-reader flow and build evidence (R1-12)

- A real-bundle flow test covers all three bundled readers: strict right and wrong checkpoint answers, redo, read/unread/read, clicked-spelling authored vocabulary, TEST recordings, JSON backup and restore through the Settings import handler, malformed/absent/empty progress imports, and unavailable-edition history. **It found a real bug: Settings restore did not pass the reader grader, so restoring any backup with checked reader answers was refused and restored nothing. Fixed** (`BackupControls` now passes `gradeReaderQuestion`); the unit tests of the storage layer had passed because they injected the grader themselves.
- Build figures are in `docs/graded-readers.md` "Build evidence".

## 2026-10-24: graded-reader local publication and optional catalogue (R1-2b)

- Implemented immutable local D1 staging, exact readback before publication markers/catalogue and a final atomic current-pointer switch. The app retains bundle authority, adds validated remote editions, network-only saved-content fallback, committed Keep offline and guarded detail loading through the existing durable edition open.
- No service URL means no new requests or supplemental status UI. No real reader publication, D1 application, network or deployment performed. Changes are uncommitted for lead review. Static checks, 39 new tests, the full 2,123-test suite, Worker typecheck, build and UI detector all exit 0; raw logs are in the worker report. Visual/device acceptance remains owner-manual.

## 2026-10-24: Speaking information architecture

- Moved French sounds and Sound pairs creation/counts from Progress to Speaking landing with the shared dialog/save/open flow; Read aloud unchanged. Uncommitted; typecheck, lint, format, i18n, 2,077 tests, build and UI detector pass. `shape:check` fails on the unstaged removed file; its current-file logic passes. Visual/device acceptance remains owner-manual.

## 2026-10-23: graded readers, pronunciation result, grammar topics

**Done**
- Integrated starter-only graded-reader list and exact-edition Reader (R1-4b/5/6c/7/9b): snapshot-before-workspace, occurrence-bound authored sheets and saved words, device listening, serialized local checkpoints and explicit completion. Optional Ask AI is deferred; recording stays hidden until R1-10. No service catalogue or Article/unit copies. Static checks, 23 new tests, the full 2,071-test suite, production build and UI detector passed; visual/device acceptance remains unverified.
- Graded-reader authoring pipeline (R0): contracts and syllabus, private draft envelope and generator, tokenizer and machine gates G0 to G5, review sheet, owner-only review marking with `--kind`, assembly with a privacy scan, metadata-only CI check, operator doc. Stages 1 to 3 exist as private drafts with AI review records; they are not human-reviewed.
- Graded readers in the app (R1) so far: routes and navigation entries, Worker read-only readers resource, authored saved-word definitions in vocabulary (storage, search, answer, backup), explicit device-voice playback source through sequence, sentence bar and practice card. The bundled starter loader and export are being finished.
- Readable pronunciation result in the practice card (marks on the sentence, fixed strip, Details sheet) and clearing of a stale result when its take is gone.
- All 93 A1 grammar topics generated, reviewed twice by independent models, fixed and published to the local content database as AI-reviewed (not human-reviewed); a handful of Chinese and kinship wording items are left for a language reviewer.
- PR #32 (the long-running feature branch) merged into `main`; `feat/graded-readers` carries the new work.
- Documentation set reorganised: `AGENTS.md` is the map; `RULES.md`, `TASKS.md` and `PROGRESS.md` added.

**Broken or found along the way (all fixed unless noted)**
- A worktree `node_modules` symlink was committed and a merge replaced the real `worker/node_modules`; typecheck and lint failed while tests passed. Restored; the lesson is in `RULES.md`.
- The first real graded-reader runs exposed gate defects the synthetic tests did not cover: elided words glossed by their surface form, possessive and demonstrative determiners before a noun subject, a pre-nominal adjective between determiner and noun, the stage inventory for `y` and `moi`, subject recovery past clitics in completed prompts. Each now has a test that fails on the old code.
- The policy hash included the publication flags, so including a stage invalidated its own review. Fixed.
- A suite counted a failing run as passing once (a command chain hid the exit code). Fixed in the process; read exit codes.

**Unverified**
- Everything visual or device-bound: the pronunciation marks and strip at 360 px, the Details sheet, real Azure results, the new Words and Grammar screens, device French voices.
- The GitHub CI result of `feat/graded-readers` since its last push.
- Real-learner difficulty and vocabulary coverage of any graded reader; the proposed starter size budgets (not measured yet).
- The content service is not deployed (#31).

## Earlier

Pronunciation line (#49 to #52, Azure assessment #56 and #57), conjugation framework and drills, noun-gender reference and drills, vocabulary with FSRS-6, the hosted read-only content service (local), the Relire Plus merge phases 1 to 5: see `docs/roadmap.md` "Done" and `CHANGELOG.md`.
