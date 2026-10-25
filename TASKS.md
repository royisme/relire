# TASKS

The work queue in small steps, one at a time. `docs/roadmap.md` is the direction (done, next, later, deferred); GitHub issues track deferred problems and owner decisions; this file is what to do **next**, in order, with what makes each step done. Update it when a step starts, lands or is replaced; finished steps move to `PROGRESS.md`.

**A step is done when:** its acceptance line holds, `typecheck`, `lint`, `format:check`, `shape:check`, `i18n:check` and `test` all exit 0 (read the exit codes), the diff has been read by the lead, and the change is merged into the working branch. Visual acceptance, real devices and real keys are the owner's and are listed under "Owner" until done.

## Current epic: graded readers for zero-basis learners

Plan and decisions: `docs/graded-readers-plan.md` (epic #65; phases #62, #63, #64). Platform first; reader content is versioned data that is revised later.

### Now (R1: five readers in the app, no key needed)

| # | Step | Acceptance | State |
| --- | --- | --- | --- |
| R1-1 | Bundled starter export, lazy loader, `useGradedReaders` hook | loader rejects hash/schema errors; `publish.ts --check` in CI; starter becomes a precached lazy chunk within budget | landed |
| R1-2b | Local publish of non-bundled readers into D1 and app service catalogue | exact read-back before markers/catalogue/pointer; bundle precedence, network-only cache fallback and committed Keep offline | landed |
| R1-3 | Reader progress, opened-edition snapshot, backup/restore | snapshot survives service loss; restore rejects malformed input whole | landed |
| R1-4b | `#/read/graded` list page | starter-only states of design §6.3; real progress; no fake rows | landed |
| R1-5 | Reader accepts a third source kind (`graded`) | no Article or unit is created; Back goes to the list | landed |
| R1-6 | Authored word and sentence sheets (no AI key) | meaning appears at once; no dummy analysis; translation reveal in a fixed slot | landed (optional Ask AI landed too) |
| R1-7 | Checkpoints and Mark read | strict-accent grading; verdict committed before shown; no automatic Next | landed |
| R1-10 | Recording ownership, shadowing log and backup for reader editions | takes keyed by reader id + body version | landed |
| R1-9b | Pass `playbackEngine: 'device'` from the graded route | nothing synthesized or fetched; real error without a French voice | landed; owner device check pending |
| R1-11 | Onboarding step 3 opens reader 1; key-banner wording; copy in both locales; docs | a learner with no key reaches a reader | landed |
| R1-12 | Build evidence and the cross-feature test pass | chunk sizes and precache recorded | landed (the flow test found and fixed a Settings restore bug) |

Landed in R1: R1-1, R1-2a (Worker routes), R1-3, R1-4a (routes and navigation), R1-6a (authored word and sentence components), R1-7 (checkpoints component), R1-8 (authored saved-word definitions), R1-9 (device-voice plumbing), R1-10 (recording ownership), R1-11. Integrated pages have landed (visual and device checks are the owner's). R1-2b wires the optional service catalogue and local-only staged publisher. No service configured still means bundle only.

### Landed: Today checklist (`docs/today-plan.md`)

| # | Step | Acceptance | State |
| --- | --- | --- | --- |
| T1 | `services/today/plan.ts` and `activity.ts`, pure | ordering, omission, local-midnight and done-today rules, empty-queue and all-complete cases tested | landed (26 tests; full suite 2165 pass) |
| T2 | `useToday` hook; extract the reader status function from `GradedReadersPage` | one `now`; the shared vocabulary model is passed in; each source reports its own error | landed (full suite 2186 pass; new-card count is capped by the remaining daily allowance) |
| T3 | `TodayPage`, `#/today`, nav item, copy in both locales, `worksWithoutKey`, architecture and changelog lines | steps match the plan; no invented counts | landed (full suite 2213 pass, detector zero, build exit 0); owner visual check pending |
| T4 | Landing change and onboarding exit | `#/` and `''` open Today; Library stays at `#/read`; `notFound`, `'#/read'` fallbacks and onboarding step 3 exit agree | landed (full suite 2213 pass, detector zero, build exit 0); no e2e run; owner visual check pending |

### Landed: sentence dictation from graded readers (`docs/reader-dictation-plan.md`)

| # | Step | Acceptance | State |
| --- | --- | --- | --- |
| D1 | Meta schema and marker-to-type refinement, `gradeItem` flag `ignoreSentencePunctuation`, `prepareReaderDictation` | prepared unit passes `ExerciseUnitSchema`; a sentence typed without its final full stop grades right, a missing hyphen or apostrophe still wrong; published readers require at least 3 sentences; retry through `saveUnits` keeps the batch | landed (full suite 2224 pass, detector zero, build exit 0) |
| D2 | Device engine in `NumberDictationControl` and `ItemRow`; "Practise by dictation" button in `GradedReaderWorkspace`; copy, caption, changelog, architecture | no synthesis or fetch; French text not shown before the check; one filled button per view stays | landed (full suite 2240 pass, detector zero, build exit 0); owner device check pending |

### Landed: letter sounds, spelling to sound before IPA (`docs/spelling-sounds-plan.md`)

| # | Step | Acceptance | State |
| --- | --- | --- | --- |
| S1 | Pack types and schema, build script with the overlap/nasal/silent-h gate, review tool with `--kind`, loader, tests on fixtures only | unreviewed or changed rows (including a changed note) refused; an example with a different-sound spelling rejected | landed |
| C1 | Seed content: 16 patterns' words and en + zh notes (agy gemini-3.8-flash, own task) | passes the S1 gate and `i18n:check` | landed (0 gate problems) |
| C2 | AI review of the seed rows (GPT, findings report only) | the lead records `AI review:` records for agreed rows | landed: every word and sound agreed; 12 notes and 2 examples replaced with the reviewer's own text; `ç` examples `déçu`/`façade` stay open |
| S1b | Generated pack, CI `--check` line (lead) | CI never sees an empty or unreviewed pack | landed (16 AI records, `--check` exit 0; full suite 2265 pass) |
| S2 | Letter sounds section, sheet, IPA fold, review notice | device voice only; IPA closed by default; copy in both locales | landed (full suite 2283 pass, detector zero, build exit 0); owner device check pending |
| S3a | `prepareSpellingDrill`, `supportsListening`, meta schema | distinct words, distractors of a different sound and not a substring of the heard word | landed (200-seed invariant tests on the real pack) |
| S3b | `ItemRow` device branch, "Practise these sounds" button, error text, rule lines | deterministic grading; no synthesis | landed (full suite 2288 pass, detector zero, build and pack check exit 0); owner device check pending |

### Landed: learning order of the 93 grammar topics and a Today step (`docs/grammar-order-plan.md`)

| # | Step | Acceptance | State |
| --- | --- | --- | --- |
| G1 | `position` from the manifest through publish, the D1 column, `/v1/topics` (sorted by it) and the list schema | positions unique and positive; list sorted by position, not alphabetically | landed |
| G2 | `storage/topicStudied.ts` (mark, unmark, list, subscribe) and its backup | idempotent mark; restore validates the whole file; absent keeps, `[]` clears | landed (restore tested through the Settings handler) |
| G3 | Topics page in book order, numbers, studied marks, Next links, mark button (copy by agy Gemini) | no invented progress; one filled button per view | landed (copy C5 by agy Gemini; full suite 2318 pass) |
| G4 | Today `grammar` step (service configured only) | omitted, never faked, without a service; real error on the step | landed (full suite 2336 pass, detector zero, build exit 0, every CI pack check 0) |

### Next: Today v2, an app-like Today with guidance (`docs/today-v2-plan.md`, draft)

Owner feedback 2026-10-24: Today has no app design and no guidance; follow Parlons. The owner chose direction B; V0 to V4 below have landed locally. What is left is the owner's look at it (Owner section).

| # | Step | Acceptance | State |
| --- | --- | --- | --- |
| V0 | Owner chooses A or B | the choice is recorded in the plan | done: B (2026-10-24); three Argon reviews failed with narrowing findings, all applied; V1 may start |
| V1 | Plan model: reader `title`, `nextIndex`, `doneCount`, `counts`; error and no-step cases; fix the shapes in `tests/todayView.test.tsx` and `tests/useToday.test.ts` | the three Today tests, typecheck and the full suite exit 0 | landed (merge of `today-model`); all checks exit 0 in the main checkout; no Argon review (small pure model, broad tests) |
| V2 | View: one card with ordered rows, aside, practise row; keys in en and zh (the lead adds shadcn `card` first) | typecheck, lint, format, shape, i18n exit 0; detector `[]`; component tests per state | landed (`e1f1180`); all checks exit 0, detector `[]`; lead looked at 1280 px light and phone width dark (not acceptance); the owner judges the look |
| V3 | Copy by agy gemini-3.8-flash: `today.*` keys, guidance sentence, why lines | `bun run i18n:check` exits 0; the lead reads the zh | landed (merge of `today-copy`); also fixed the first-run line and the date format; all checks exit 0 |
| V4 | Docs: `DESIGN.md` Today section, architecture, changelog | `format:check` exits 0 | landed: `DESIGN.md` Today section, `docs/architecture.md`, `CHANGELOG.md` |

### Next: remote publication of the content service (owner decision 2026-10-24; plan `docs/d-remote-plan.md` under Argon review)

First deployment: no accounts, public read-only, rate limited, CORS limited to the deployment origins; topics, lexicon and the vocabulary book (the owner's own, `unreviewed`) go up together (ADR amendment). Needs a short plan doc and an Argon review before dispatch.

| # | Step | Acceptance | State |
| --- | --- | --- | --- |
| D-remote-1 | Local hygiene in all four publishers (no `.dev.vars`/`.env` read, explicit persist, paths from `root`, no telemetry), version row deleted first in the topic and lexicon SQL, pure `parseArgs` | `bun test` on the four publisher tests and `d1Target.test.ts` exits 0; a temp-root run writes nothing under the repository | landed (`cf01e0e`); Argon found 3 test points, fixed; all checks exit 0 in the main checkout |
| D-remote-2 | Vocabulary `--apply-remote-unreviewed` and readers `--apply-remote` through the same protocol, TTY gate, `allowRemote` only from `import.meta.main` | refusal tests pass; no workflow mentions `--remote` | landed (`8bbe800`); Argon: no path to remote without `allowRemote` and a TTY, 3 small points fixed; all checks exit 0 in the main checkout |
| D-remote-2b | Halve the vocabulary page size (and pace the download), only if the owner's check of Cloudflare's D1 limits rejects a 108 KB page | the lead's full re-run exits 0 | conditional |
| D-remote-3 | Topics and lexicon `--apply-remote`, interactive, with a read-only check as the only success criterion | tests pass; check mismatch fails the run | landed (`922448d`); Argon pass (no path to remote without `allowRemote` and a TTY; success only by the read-only check); all checks exit 0 in the main checkout |
| D-origins | `.gitignore` for `worker/wrangler.deploy.jsonc`; `worker/README.md` rewritten wherever stale, with a rooted runbook | the placeholder stays in the committed file; the README no longer tells the owner to edit it | landed; the runbook is for the owner and was never run by an agent; acceptance greps exit 0 |
| D-limit | After the first deployment: tap a verb form repeatedly on the deployed URL, read the 429 behaviour and the dashboard row metrics, then set the per-IP limit (issue #31; the duplicate-request half landed in `ee34d4a`) | a measured limit is recorded in `worker/README.md`; the limiter note is updated | not started; owner-run, after D-remote |

Plan `docs/d-remote-plan.md` (written by Opus; two Argon reviews, both fail, every finding the lead verified is applied) is ready to dispatch. Dispatch D-remote-1 first; D-remote-2b waits for the owner's limit check. Each diff then gets an independent Argon review.

Not part of this: accounts (H4). The access key the owner chose on 2026-10-24 is the RS section below, not an account system.

### Next: routed API, access key and remote service in Settings (owner decisions 2026-10-24; plan `docs/remote-settings-plan.md`, two reviews by gpt-6-astra applied)

The Worker becomes a routed API (Hono, kept portable), requires an access key, and the app gets a Settings section (URL, key, Test, Enable; off by default; device-local, never in a backup). RS1 and RS2 merge back to back (one integration boundary). Drizzle for D1 is deliberately last and needs its own plan.

| # | Step | Acceptance | State |
| --- | --- | --- | --- |
| RS1 | Worker: Hono router with our own CORS/limiter/auth middleware in today's order, `ACCESS_KEYS` fail closed, `private, no-cache` on every success, tests and fixtures, runbook, ADR and `AGENTS.md` privacy wording | the four Worker tests keep bodies/ETags/statuses and pass with the new key fixtures; Worker typecheck, full suite and checks exit 0 in the main checkout | landed (`ff3826c`); astra review fixed 2 points; all checks exit 0 (2,400 tests); the local app gets 401 until RS2 |
| RS2 | App: `contentService` settings block (device-local, excluded from backups), `Authorization` header in `contentServiceFetch`, Settings section with Test and Enable, i18n en and zh, client tests | tests in the plan pass; the 23 call sites re-checked; detector `[]`; checks exit 0 | landed (`49846bc` merged, fixes in the following merge); astra review failed on 5 points, all fixed; all checks exit 0 (2,422 tests); the section's look is the owner's to check |
| RS3 | Spike then wire `@cloudflare/vite-plugin` so `vite dev` serves `/v1/*` from the publishers' local D1 | the production `dist` content hash is unchanged; a synthetic publisher write is read through the dev route | landed (`296c252` merged); all six gates passed (plugin 1.63.1 pins an older workerd, so dev runs `compatibility_date` 2026-10-13 by an in-memory override); the lead re-checked: production `dist` content hash identical with and without the plugin, and a dev server answered `/v1/*` from the Worker (401 without a key) and the app elsewhere |
| RS4 | Drizzle for D1: `docs/drizzle-plan.md` (options A none, B minimal, C full; recommends B or A); RS4a spike with gates, then RS4b wire | plan reviewed; spike gates pass or end in "do not ship" | PAUSED (2026-10-24, the lexicon leaves D1 and the service is shrinking; see `docs/lexicon-r2-plan.md`); owner chose B earlier; review 1 (fail, recommends A) applied; next: lead provisions the spike installs, then RS4a; the owner also decides the one-time reset of local D1 state before RS4b |

### Next: the lexicon ships with the app (owner decision 2026-10-24: option D; plan `docs/lexicon-bundle-plan.md`, in review)

Morphalou is open data (LGPL-LR; no permission needed). The selected lexicon is 3.09 MB raw, 0.33 MB gzip, so it is committed as a generated data file under `data/lexicon/`, loaded lazily by the app and cached by the PWA: no key, no service, no R2, no D1 for the lexicon, and the first deployment is one day.

| # | Step | Acceptance | State |
| --- | --- | --- | --- |
| LB1 | `scripts/lexicon/build.ts` (generate and `--check`), `LexiconBundleSchema`, the committed `data/lexicon/lexicon.json` (generated by the lead on the owner's machine), notice and licence moved to `data/lexicon/`, CI step | `build.ts --check` exits 0; 5,022 entries and 42,593 forms; formatter ignores the file | not started; after the review |
| LB2 | Client: bundled loader behind `lexiconForm`/`lexiconLemma`, gating on the service removed, attribution always shown, PWA precache, About and CHANGELOG text | all checks exit 0; lexicon works with the service off; the owner checks first-lookup time on a phone | not started |
| LB3 | Remove the server side: Worker route, D1 tables, `import.ts` and its tests, e2e fixtures, docs | Worker typecheck, full suite and CI checks exit 0; no reference to the lexicon routes or tables outside history | not started |

### Content (paused by the owner's priority)

Stages 1 to 3 have private drafts with AI review records (not human review). Stages 4 to 12 are not written; stage 4 has an unreviewed draft. Resume after the platform: R0-7 for stages 4 to 5, R2 for 6 to 12, a human language review before any real beginner uses the readers.

Speaking IA (French sounds and Sound pairs moved from Progress to Speaking) has landed; owner-manual visual acceptance is pending.

## Owner

- Grammar topics in book order (needs the content service: re-publish local D1 first with `scripts/grammar-topics/publish.ts`, then start the Worker on 8787): chapters in order, studied marks, Next links, the Today grammar step; decide whether the textbook order is acceptable for beginners or a teacher should reorder (the order is the manifest's array order). With `.env.local` pointing at 8787 and no Worker running, Today's Grammar step shows the real error, by design.
- Letter sounds by hand: Speaking page, hear the example words on a real device voice (iOS Safari especially), the IPA fold, "Practise these sounds" and a wrong answer in Mistakes, three themes and 360 px.
- Human language review of the 16 letter-sounds rows (they carry `AI review:` records only; the `ç` examples `déçu` and `façade` are above A1 and need a teacher's pick), before any real beginner uses the section.
- Try reader dictation by hand: "Practise by dictation" on a graded reader page with a real device voice (iOS Safari especially), type a full sentence on a phone, find a wrong answer in Mistakes, three themes and 360 px.
- Try Today by hand (`#/today`, now the landing page): light, sepia, dark and 360 px, a first run through onboarding, and Sound pairs with a device voice. Then run the e2e specs you care about (13 `goto` entries were repointed to `/#/read`; none was run).
- Answer the open decisions in `docs/graded-readers-plan.md` (public bundle of stages 1 to 5, who reviews the language, word budgets).
- Try the graded readers by hand with `docs/graded-readers-trial.md` (no AI key needed), then send back what is wrong.
- Try by hand: the pronunciation features (practice-card marks, strip, Details), Sound pairs, the published local grammar topics; accept or change the open copy items (#16, #17, #24).
- Human language review of the 91 locally published grammar topics (Chinese wording, kinship terms and a handful of Low items; their notes are in the local working notes). Tracked with the letter-sound rows and the readers in #67.
- Re-publish the vocabulary book to local D1 (`bun scripts/vocabulary/publish.ts --apply-local-unreviewed`) so it serves the manifest without the removed `attribution` field.
- Deploy the content service before any real learner depends on topics, the wordbook or later readers: create the D1 database, set `ALLOWED_ORIGINS`, run D-remote once it lands, then `wrangler deploy`. No rights gate remains for the wordbook or the lexicon.

## Not started

Open GitHub issues (2026-10-24) and what each waits for; nothing here is ready for a worker except D-remote above:

| Issue | Waits for |
| --- | --- |
| #31 rate limit vs word-sheet taps | the first deployment (D-limit) |
| #14 irregular verbs | the language-reviewer items (#16) and the owner's row review (#43, branch `pi/ds-flash-40`) |
| #16 conjugation copy and sentence-pattern rules | the owner |
| #17 visual acceptance of the new screens | the owner, on a real browser and phone |
| #21 real-provider check of the conjugation prompt | the owner's real key |
| #24 README screenshot of the pack table | a real provider key (the text is done) |
| #29 split the `-eur` rule | on hold (owner, 2026-10-22) until a meaning-based design exists |
| #62, #63, #64, #65 graded readers | content is paused by the owner's priority; runtime R1 is landed; R0-7 and R2 need content and a human review |
| #67 human language review (topics, letter sounds, readers) | the owner picks the reviewer |

Accounts and a paid tier are deferred in `docs/roadmap.md`. #13 (grammar topics pack, TP1 to TP5) was closed on 2026-10-24.
