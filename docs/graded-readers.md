# Graded readers: authoring pipeline

How the pilot readers for zero-basis learners are produced and reviewed. Scope, syllabus, owner decisions and risks: [graded-readers-plan.md](graded-readers-plan.md). Status: tooling built (R0); pilot drafts exist only under gitignored `.local/graded-readers/`, no stage is `bundled: true` yet, and nothing ships to learners until R1.

Reader text is private; only metadata is committed. A machine gate verifies forms under a supplied rule — it never verifies French. The release gate for real beginners is a qualified human language review of every final sentence, translation, gloss and checkpoint (owner decision 4). An AI review is a second filter, never human certification.

## Private files

Everything below lives in gitignored `.local/graded-readers/` and is never committed:

- `core.json` — stage-independent reviewed function-word list.
- `candidates-<stage>.json` — the closed candidate vocabulary of one stage.
- `gate-evidence-<stage>.json` — authored evidence for the stage: topic-to-sentence coverage, extraction question ids, compounds, modal lemmas, pronominal base/clitic mappings, compound-past auxiliary and participles, inversions, clause markers, each with a reviewer name and reference.
- `drafts-<stage>.json` — the generated draft envelope (body, analyses, verb groups, provenance).
- `runs/` — dispatch logs, private.

`check.ts` and `sheet.ts` also read the private Morphalou copy through `MORPHALOU_DIR` (default `.local/morphalou/csv/Morphalou3.1_formatCSV`).

## Commands, in order

1. `bun scripts/graded-readers/generate.ts generate --stage <n> [--force] [--retries <n>] [--model <provider/model>] [--dispatch <script>]` — dispatch `prompt.txt` with the stage inputs through `scripts/pi-dispatch.sh` and write `drafts-<n>.json`. Needs every earlier stage's draft. Validation is schema-only: not gates, not language. The default author model is `openai-codex/gpt-6.1-sol`; review runs on another family (the owner chose Gemini 3.8), so the author never reviews its own text. Real generation needs owner authorization and a fresh `magpie quota` check by the lead.
2. `bun scripts/graded-readers/check.ts --stage <n>` — print G0–G5 diagnostics for one draft; exit 1 on any error. An empty list means the gates passed, nothing more.
3. `bun scripts/graded-readers/sheet.ts [--stage <n>]` — print the private review sheet (every sentence and translation, the whole glossary, the authored parse of every atom with its candidates, verb groups, the full learning payload, counts, evidence, provenance, current diagnostics). Terminal only; never redirect it into a tracked file.
4. Independent review of the sheet by a model of the other family, then fix and re-check.
5. Owner only: `bun scripts/graded-readers/review.ts mark <readerId...> --by "<name>" --kind ai|human` appends a content-hash record to `data/graded-readers/reviews.json`; `unmark <readerId...>` removes records. The record's `reviewedBy` carries the prefix `AI review: ` or `Human review: `. Any later body edit lapses the record (hash mismatch). A worker never marks or unmarks a review.
6. `bun scripts/graded-readers/assemble.ts --check` — the metadata-only check (also a CI step): syllabus and reviews parse, no review names an unknown reader, every included stage has a review record, excluded readers are listed. It reads nothing under `.local/` and passes without any private file.
7. Owner only: `bun scripts/graded-readers/publish.ts` — assemble the reviewed bundled stages (the existing gates, review hashes and privacy scan re-run through `assemble`) and atomically write `src/data/graded-readers/starter.json` = `{schemaVersion, syllabusVersion, readers}` in syllabus order, then read it back through the check below. `publish.ts --check` (also a CI step) is metadata-and-artifact only: the committed starter parses as the strict public shape, is exactly the bundled stages of the committed syllabus in order under the committed `syllabusVersion`, every `version` is the canonical body hash and matches the current `reviews.json` record, and the file stays within the 100 KiB budget. The emitted lazy chunk for the same file was measured at 64 kB minified for a 165 KiB TEST starter (well inside the 120 KiB chunk budget the loader's design sets), because minification collapses the JSON. It reads nothing under `.local/` and passes with an empty reader list.

8. Owner only: `bun scripts/graded-readers/publishRemote.ts --sql | --apply-local` assembles the included prefix through the same gates/current reviews/privacy scan, then selects non-bundled readers for staged local D1 publication. Zero non-bundled readers is a no-op. `--sql` writes ignored staging SQL only; `--apply-local` verifies every exact artifact before markers, verifies the immutable catalogue, then switches the current pointer last and reads it back. Installed local Wrangler only, env files/remote bindings disabled; no remote execution or deploy. Full procedure: `worker/README.md`.

## What the gates check

- **G0 schema and dependencies** — draft, syllabus, core, candidates, reviews and evidence parse; the reader matches its syllabus stage (id, order, topics); topic ids exist; the policy hash is current; every included earlier stage has exactly one valid, review-current draft and the dependency hashes chain in order.
- **G1 tokenization and binding** — source-preserving expansion over a closed inventory: elisions, hyphenated forms and compounds expand deterministically; digits, symbols, unconsumed characters and unsupported apostrophes or dashes fail; every expanded part of every target (title, sentences, scaffolds, options) has exactly one authored analysis; whole-token bindings are the ordered union of their part ids.
- **G2 attestation** — each selected reading is an allowed expansion of the source token; verb analyses exist exactly for verbs; noun, verb and adjective atoms are attested in the offline lexicon at the exact lemma, part of speech and slot; pronominals and question phrases need reviewed evidence.
- **G3 known set and budget** — every lexical key comes from the reviewed core, an earlier reader's glossary or the closed stage candidates, unchanged where reused; no unused or unencountered gloss; new keys within the stage budget.
- **G4 verbs** — every verb atom belongs to exactly one group; group shape and tense follow the stage's allowed tense/construction table; the finite verb agrees with its subject frame; imperatives are subjectless with the right person; passé composé matches reviewed auxiliary, participle and engine composition.
- **G5 length, inventory and evidence** — title, sentence and text caps; function words and clause markers are introduced by this stage; finite-clause counts; noun gender matches the reviewed noun pack; each targeted topic has sentence evidence; every checkpoint answer is a contiguous atom span inside its quoted evidence sentence.

## What the gates cannot catch

Whether a sentence is correct, idiomatic French; whether the English and Chinese are faithful; whether a gloss fits the sentence's sense; whether homographs and compounds were parsed as intended (the gates check the authored parse, they never choose among readings — the sheet shows candidates for that); whether a checkpoint teaches anything; whether the caps make the text easy. Those are the reviews' job, and the human language review is the one that gates beginner release.

## File map

- `src/types/gradedReader.ts` — public Zod contracts (syllabus, review records, published reader).
- `data/graded-readers/syllabus.json` — committed public syllabus, twelve stages.
- `data/graded-readers/reviews.json` — committed review records, hashes and names only, no prose.
- `src/data/graded-readers/starter.json` — committed generated starter export (empty until a stage is `bundled: true`); loaded lazily and validated whole by `src/services/gradedReaders/load.ts`, never seeded into IndexedDB.
- `scripts/graded-readers/` — `prompt.txt`, `generate.ts`/`generator.ts`, `tokenize.ts`, the `gate*.ts` set, `check.ts`, `sheet.ts`, `review.ts`, `assemble.ts`, `publish.ts` (bundle), `publishRemote.ts` / `publication.ts` (local D1).
- `tests/gradedReader*.test.ts` — synthetic fixtures with a fake dispatch; no real model or private file.
- `docs/graded-readers-plan.md` — the plan this pipeline implements.

## Build evidence — 2026-10-23 (R1-12)

Ran `bun run build` once (exit 0) against the committed three-reader starter. Sizes below are emitted minified bytes and Vite's reported gzip kB (decimal); all three exact asset URLs occur in the generated `dist/sw.js` precache list.

| Chunk (`dist/assets/`) | Minified bytes | Gzip kB | Precached |
| --- | ---: | ---: | --- |
| `starter-C7ZkPwxw.js` | 20,075 | 5.38 | yes |
| `GradedReadersPage-BOUiGdHx.js` | 6,422 | 1.94 | yes |
| `GradedReaderPage-BVHVc-rI.js` | 21,891 | 6.85 | yes |

`src/data/graded-readers/starter.json` is 44,248 UTF-8 bytes, below the 100 KiB (102,400-byte) file budget. Its emitted starter chunk is 20,075 bytes, below the 120 KiB (122,880-byte) minified budget (also below the detailed design's 30 KiB gzip budget). No budget is exceeded; no move to D1 is needed. Byte counts came from `Bun.file(path).bytes().byteLength`; precache membership was checked against each `assets/<name>` URL in `dist/sw.js`. The build reports 289 precache entries (7,434.02 KiB) and an unrelated >500 kB chunk warning; it does not prove device or offline browser behaviour.

`tests/gradedReaderFlow.test.ts` guards the committed starter's 100 KiB size and exercises every real bundled edition through checkpoints, completion, authored vocabulary, TEST recording export/restore and unavailable-edition history. The explicit-grader storage roundtrip passes, but the DOM-free regression invoking the actual Settings file-import handler fails: `BackupControls` omits the grader required for checked-reader backups. R1-12 is blocked pending that caller correction; the test is neither skipped nor marked expected-failing.
