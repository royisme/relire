# Graded readers for zero-basis learners: development plan

Tracking: epic #65, phases R0 #62, R1 #63, R2 #64.

Status: **planned, nothing implemented** (2026-10-23). The owner widened the audience to learners starting from zero and chose graded readers as the first feature. The design was drafted by the advisor and refined by GPT-6.1 against the code; this plan fixes the decisions, the scope and the tasks. The long working notes (schemas, gate algorithms, file lists) are local-only (`.pi-runs/graded-readers/`); this page is the source of truth for the repository.

## Why

`PRODUCT.md` targeted intermediate learners (A2–C1) who already read in a second language. A beginner cannot use the Reader today: the sample articles are B1, B2 and C1, onboarding step 3 opens the first article, and tapping a word or sentence without an AI key closes the sheet and sends the learner to Settings. The learning tools are strong (FSRS-6 deck, noun-gender drills, sound pairs, Azure assessment, conjugation engine, mistake notebook); the gap is **content and sequence**, not more tools.

## Owner decisions (answer in parallel; the plan assumes the defaults)

| # | Decision | Default assumed | If answered differently |
| --- | --- | --- | --- |
| 1 | Delivery and privacy of reader text | Hybrid: stages 1–5 ship in the static bundle (public), later stages go through the content service | All-private: no starter prose in the bundle, the first week depends on deploying the service (#31). Bundle-only: no Worker table, but every install grows with content |
| 2 | Level label | `level: 'A1'` plus an `order` of 1..12; stage 1 is described as "Start here" | A new Pre-A1 level changes every level contract, filter and editor |
| 3 | Pilot size and new-word budgets | Five readers; new lexical-entry budgets 6, 6, 7, 7, 8 (design knobs, not research figures) | Different caps change the syllabus and force regeneration and re-review of later readers |
| 4 | Human language review before beginners use it | **Required** (French, English, Chinese) | A waiver needs an explicit provenance contract; never reuse AI review as human certification. The safe default holds beginner publication |
| 5 | Sentence translation | Hidden, revealed per sentence in a fixed slot of the sentence drawer | Always visible needs an aligned bilingual layout |
| 6 | Progress in backups | Included, with a snapshot of each opened reader | Excluding it needs an explicit exception to the storage rule and honest copy |
| 7 | Device-only audio on the reader route | Allowed; optional audio may fail on devices without a French voice | Else audio would silently use remote synthesis, which breaks "no key needed" |
| 8 | Reader checkpoints | Reader-local; they do not enter Mistakes or Grammar statistics | Integration is separate product scope |

## Principle

A beginner cannot catch errors, so wrong content does more harm here than anywhere else. Machine gates enforce what a machine can judge (bounded vocabulary, allowed forms, length, completeness, evidence, hashes). They do **not** certify French: the engine verifies forms under a supplied rule, not sentences, agreement, reference or translation. Independent AI review is a second filter. **A qualified human language review of every final sentence, translation, gloss and checkpoint is the release gate for real beginners.** Nothing is called human-reviewed until it is.

## What the code verified

- With no key and a key-requiring provider, a word or sentence tap closes the sheet and navigates to Settings (`useLookupSheets.ts`, `App.tsx`). There is no authored-translation path. Cached answers work without a key.
- Sample articles are a TypeScript constant seeded once into IndexedDB; onboarding opens `articles[0]` (normally the B1 sample). Readers must **not** join that seeding.
- The lexicon (5,022 entries, 49,238 would-be rows) is usable offline by a Bun script; it has no translations and covers verbs, nouns and adjectives only. Homographs such as `est`, `a`, `son` need authored disambiguation.
- Batch G checkpoints: reuse the question, answer and feedback schemas and the grader unchanged; the 3×2 topic envelope does not fit a reader.
- A third reader source must be carried through recordings, the shadowing log, backup and routes; saving a word currently needs an AI-shaped analysis; whole-text listening currently calls the selected engine.

## Architecture

- **Own content shape, not `Article`:** id, order, level, titles (fr/en/zh), sentences (fr/en/zh), a glossary with a local definition for **every** word a learner can tap (only genuinely new entries count against the stage budget), target topic ids, one or two text-bound checkpoint pairs with an evidence sentence.
- **Private drafts, public metadata:** reader text lives in `.local/graded-readers/` and goes to D1 (and the bundled starter export); `data/graded-readers/syllabus.json` and `reviews.json` (hashes) are committed, like `data/grammar-topics/`.
- **Pipeline:** TP5 end to end (prompt template file, schema, generate, independent review by another model family, fix, re-review, owner-marked hash gate, publish), plus build-failing gates G0–G5: schema and dependencies; source-preserving tokenization with explicit elision (`l'`, `j'`, `qu'`, `d'`, `n'`, `s'`, `c'`, `m'`, `t'`) and whole hyphenated forms; lemma and form attestation with authored disambiguation that fails closed; known set and new-word budget; verb groups and the allowed tense table per stage; length and completeness.
- **App:** `#/read/graded` ordered list with real progress; the same Reader with a third source; word tap shows the authored entry at once (lexicon and "ask AI" only as optional extras); the sentence drawer reveals the authored translation; Listen uses an explicitly labelled device voice; shadowing uses the practice card, assessment only when configured; checkpoints after the text; "Mark read" is a self-report; the authored word can be saved (a second definition variant of the same row, no fake analysis); onboarding step 3 opens reader 1 without a key.
- **Delivery:** starter `src/data/graded-readers/starter.json` loaded lazily and validated; budgets (proposed, to be measured): file ≤ 100 KiB, emitted chunk ≤ 120 KiB minified, new eager JS ≤ 5 KiB gzip. A `readers` D1 table with read-only Worker routes for stages 6–12, immutable staged publish with read-back (not the delete-first topic publish).

## Syllabus (editorial default, A1, 12 stages; the pilot is 1–5)

Chapter order of the reference corpus is a taxonomy, not the teaching order. Each stage lists its theme, target topics, allowed tenses (P present, I imperative, PC passé composé, M imparfait, F futur; MI modal+infinitive, NF near future, RP recent past) and its new-entry budget.

| Stage | Theme | Target topics | Tenses | New entries |
| --- | --- | --- | --- | ---: |
| 1 | objects | subject-pronouns, indefinite-article-forms, pattern-cest, present-tense-forms | P | 6 |
| 2 | family | noun-gender-feminine, noun-plurals, possessive-determiners, definite-article-forms | P | 6 |
| 3 | home | pattern-il-y-a, demonstrative-determiners, adjective-agreement, preposition-dans, preposition-avec | P | 7 |
| 4 | routine | present-tense-uses, reflexive-pronouns, pronominal-verb-uses, telling-time, time-prepositions | P | 7 |
| 5 | café | partitive-article-forms, partitive-article-uses, articles-in-negation, negation-ne-pas, shopping, questions-combien | P | 8 |
| 6 | leisure | hobbies, sports, jouer-prepositions, yes-no-questions, questions-est-ce-que, questions-comment, degree-adverbs | P, MI | 8 |
| 7 | neighbourhood | asking-directions, questions-ou, article-contraction-a, article-contraction-de, preposition-a, imperative-forms, pattern-il-faut | P, I, MI | 9 |
| 8 | weekend plan | near-future, future-expressions, dates, cardinal-numbers, expressing-purpose | P, I, MI, NF | 9 |
| 9 | yesterday | compound-past-formation, past-participles, compound-past-uses, holidays, country-prepositions | + PC | 10 |
| 10 | memories | imperfect-forms, imperfect-uses, past-tense-choice, conjunction-quand, weather-expressions | + M | 10 |
| 11 | travel and plans | recent-past, simple-future, expressing-cause, preposition-en, preposition-pour, ordinal-numbers | + F, RP | 10 |
| 12 | community visit | greetings, introductions, information-questions, questions-qui, questions-que-quoi, interrogative-quel, pronoun-on | all | 10 |

Not claimed by any reader (kept in Grammar): overview and taxonomy topics, fractions and percentages, exception-heavy article and determiner topics, object, `y`, `en` and clitic-position pronouns, `conjunction-si`, and a list of refinements that may appear incidentally. The sequence, the exact closed vocabularies and the recycling are unverified until a human reviewer and real learners have seen them; stage 11 may be too dense and would be split, not stretched.

## Phases and tasks

Sizes are relative (S, M, L), not hours. Everything is unit-tested with invented, labelled test content and mocked AI; visual acceptance is the owner's by hand.

### R0: authoring tooling and pilot content (no app change)

| ID | Task | Size | Depends |
| --- | --- | --- | --- |
| R0-1 | Content contracts (`src/types/gradedReader.ts`), `syllabus.json`, `reviews.json` and schema tests | M | |
| R0-2 | Core function-word list and closed candidate vocabularies for stages 1–5 (private) | M | R0-1 |
| R0-3 | Tokenizer and gates G0–G5, fail-closed, with synthetic fixtures | L | R0-1 |
| R0-4 | Private drafts, generator and prompt template (`scripts/graded-readers/`) | M | R0-1 |
| R0-5 | Review sheet, owner-only review marking and hash assembly | M | R0-1 |
| R0-6 | Metadata-only CI check, tests, `docs/graded-readers.md` | M | R0-3, R0-5 |
| R0-7 | Pilot generation, cross-family review loop and **human language review** for stages 1–5 | L | R0-2 to R0-6 |

### R1: five readers in the app, no key needed

One integrated batch: the third reader source, the authored saved-word variant and the backup changes must land together.

| ID | Task | Size | Depends |
| --- | --- | --- | --- |
| R1-1 | Starter export, lazy loader and validation, cache | M | R0-7 |
| R1-2 | `readers` D1 migration, Worker routes, staged publish | M | R0-1 |
| R1-3 | Progress, opened-reader snapshot and backup | L | R1-1 |
| R1-4 | Routes, `#/read/graded` list, navigation | M | R1-1 |
| R1-5 | Reader with a third source and authored word occurrences | M | R1-4 |
| R1-6 | Authored word and sentence sheets (no dummy analysis; a success-only analysis counter) | L | R1-5 |
| R1-7 | Reader checkpoints and Mark read | M | R1-5 |
| R1-8 | Authored saved-word variant across vocabulary storage, search, answer, audio and backup | L | R1-6 |
| R1-9 | Device-voice source for word, sentence, whole text, reference and compare | M | R1-5 |
| R1-10 | Recording ownership, shadowing log and backup for reader editions | L | R1-3 |
| R1-11 | Onboarding step 3, no-key banner wording, copy in both locales, docs, CHANGELOG | M | R1-6 |
| R1-12 | Test suites and build evidence (chunk sizes, precache of the starter chunk) | L | all |

### R2: stages 6–12 on the same runtime

| ID | Task | Size | Depends |
| --- | --- | --- | --- |
| R2-1 | Content for stages 6–8 (modal+infinitive, near future, imperative) | L | R1 |
| R2-2 | Content for stages 9–12 (compound past, imperfect, future, recent past) | L | R2-1 |
| R2-3 | Gate coverage and fixtures for later forms (auxiliary choice, agreement) before enabling stages | M | R0-3 |
| R2-4 | Publish readers 6–12 to the content service and the catalogue | M | R1-2, R2-2 |
| R2-5 | Owner pedagogical acceptance: difficulty, recycling, caps | M | R2-2 |

### Later, separate epics

The "today" session for beginners, spelling-to-sound before IPA, sentence dictation from readers as a new exercise type, a learning order across the existing 93 topics, checkpoints for the 91 reading-only topics, and a Pre-A1 level label if ever wanted.

## Risks, ranked

1. **P0** A wrong sentence, gloss or answer teaches an error nobody can spot. Gates catch shape, attested forms and caps; only a qualified human review catches the rest. Reviewer availability is the foremost release blocker.
2. **P0** Homograph or compound mislabelling passes green gates (`est`, `a`, `son`, `ses`/`ces`, être as adjective or auxiliary). Authored parses are shown on the review sheet; disputed text is simplified.
3. **P0** The third reader source and the authored saved-word variant are the largest integration work; shipping them half-integrated breaks recordings, backup or vocabulary.
4. **P1** "No key needed" silently falling back to remote speech or assessment. Mocked-request tests on every playback path; device voice is labelled and never a silent fallback.
5. **P1** Lost progress, or a late draft resurrecting restored state. Transactions, revision guards, self-contained snapshots.
6. **P1** Word caps and the core list make a text look easier than it is. Owner and learner testing, especially in later stages; no claim of an optimal figure.
7. **P1** Bundled public text conflicts with a future paid tier. Decision 1; the read-only Worker is collectible too, and real access control is a separate project.
8. **P1** Partial service publication. Immutable staging and read-back; no delete-first publish.
9. **P2** Content updates relabelling old completions or takes. Identities carry the body version; the app says which edition was read.
10. **P2** Tokenizer drops punctuation or digits, or merges elisions. Closed inventory and an unconsumed-character gate.
11. **P2** Dictionary licence confusion. Published readers carry no bulk morphology; the Worker's notice policy stays.
12. **P2** Mobile layout. Owner checks at 360 px with long French, English and Chinese text, themes, keyboard and IME.

## Non-goals

Runtime AI generation of readers, a mastery or "level" claim, forced unlocking, a daily programme, audio assets, a new provider or dependency, accounts or deployment, a general French parser, integration with Mistakes or Grammar statistics.

## Verification policy

Static and unit checks are the gate (`bun run typecheck`, `lint`, `format:check`, `test`, `i18n:check`, `shape:check`, the Worker typecheck, plus the new metadata check). The R1 build must show the starter as a precached chunk within budget. Real devices, French voices, microphones, real Azure, the beginner's first-run experience and the Worker's deployment are checked by the owner and stay unclaimed until then.
