# Learning content: task plan (LC1 and LC2)

Status: **plan, nothing dispatched.** Written 2026-10-21 from `docs/learning-content-plan.md` (sections 2.1, 2.2, 8, 9). Paths were checked with `ls` or `grep` on 2026-10-21; a path marked *new* does not exist yet. French facts are unverified until the owner confirms them at review.

## Header: how the work runs

- **Implementation workers:** pi `openai-codex/gpt-6.1-sol` through `scripts/pi-dispatch.sh <worktree> <provider/model> <prompt-file> <log> [timeout]`, per `docs/agent-delegation.md` sections 2, 4 and 7. Make each worktree by hand from HEAD: `git worktree add -b pi/<task> ../relire-wt/<task> HEAD`, check `git log -1`, then `ln -s "$PWD/node_modules" ../relire-wt/<task>/node_modules`. Prompt and log live in `.pi-runs/<task>/` in the lead's checkout, passed as absolute paths.
- **Monitor:** the lead attaches a Monitor to every dispatch at dispatch time.
- **No Playwright, no servers.** No e2e task is planned.
- **Review gate:** Gemini 4 Argon is nearly exhausted (about 2% weekly), so the gate is the Opus `reviewer` subagent (read-only), given the diff, the task text and the raw check output.
- **Merge:** the lead merges a reviewed worker branch into `claude/sleepy-darwin-lt2eck` locally (owner decision 2026-10-18), after re-running the checks in the worktree.

## Order of work (changed from the brief's "LC1 then LC2")

1. **LC2.1 to LC2.5:** compound tenses in code, generator, checks, call sites, locales, goldens.
2. **LC2.6 (lead):** rebuild and re-record the four controls under the owner's waiver. The build passes because `verbs.json` still holds only the four reviewed controls.
3. **LC1.1 to LC1.2:** the 15 verbs, their irregular forms and goldens. Goldens cover all 11 tenses, since the engine emits compound cells after step 1.
4. **LC1.3 (lead):** oracle report.
5. **LC1-R (owner, lead records):** one review of the 15 verbs, all cells.
6. **Lead:** CHANGELOG line and `docs/roadmap.md` "Next" item 1.

**Why this order.** `scripts/grammar-pack/build.ts:85-88` refuses every row that is not `reviewed`, and it throws at `:133-138` before writing `pack.json`. Any LC1 row in `verbs.json` before the controls are rebuilt would block the whole build. A review done before LC2 would also lapse, because a review hashes the whole row (`docs/grammar-pack.md` section 5) and LC2 adds cells to every row.

## Shared rules for every worker

Read first: `CLAUDE.md`, `docs/grammar-pack.md` section 5, and the `.claude/rules/*.md` files for the areas touched (pi does not auto-load them).

Red lines:
- **Never invent forms.** Irregular forms in `irregulars.json` are typed by the worker from knowledge. The Morphalou oracle and the owner check them, not the worker. Where unsure, say so in the report by verb and cell; do not guess silently.
- **Never record a review.** `review.ts record` is lead-only. `review.ts print` is allowed.
- **Never write** `data/grammar-pack/reviews.json`, `data/grammar-pack/oracle-attest.json` or `src/data/grammar-pack/pack.json`.
- **Never touch** owner or lead files: `CHANGELOG.md`, `docs/roadmap.md`, `docs/grammar-pack.md`, `docs/learning-content-plan.md`, `docs/HANDOFF.md`, `.handoffs/`, `data/grammar-topics/reviews.json`, `src/components/ReaderView.tsx`, `src/components/reader/ReaderWord.tsx`, `.serena/`.
- Bun only. Never `bun install` or `bun add`. No new dependency.
- Comments and commit messages in English. Commit on the task branch only, staging files by name (never `git add -A`). No push, PR or merge.
- Stay in scope. Problems outside scope are written down, not fixed.

Acceptance, run in the worktree: `bun run typecheck`, `bun run lint`, `bun run test`, `bun run format:check`, `bun run shape:check`, plus `bun run i18n:check` where a locale file changed. (Script names checked in `package.json`; `e2e` is excluded.)

Known, expected failures to report verbatim, not to fix: any test comparing `src/data/grammar-pack/pack.json` with the generated pack fails while a row is unreviewed; the build throws `human review required` for changed or new rows.

Report: `<lead-checkout>/.pi-runs/<task>/report.md` (never in the worktree). Include steps done and not done, commit hashes, files changed, raw output of each check, and what was not run or could not be verified.

---

## Phase LC2: store the four compound tenses (first)

Decision D1, owner 2026-10-21: plus-que-parfait, futur antérieur, conditionnel passé and subjonctif passé are **stored** in the pack, like passé composé. The four controls (être, avoir, aller, s-appeler) are not re-reviewed; they are re-recorded under the owner's name with a waiver reference (LC2.6).

Tense names (camelCase, like `passeCompose`): `plusQueParfait`, `futurAnterieur`, `conditionnelPasse`, `subjonctifPasse`. Suggested `TENSES` order: present, passeCompose, imparfait, plusQueParfait, futur, futurAnterieur, conditionnel, conditionnelPasse, subjonctif, subjonctifPasse, imperatif. This order sets the printed review tables; the worker may propose a different order in the report.

Current code (verified 2026-10-21):
- `src/types/grammarPack.ts:11-19` `TENSES`; `:80` `aux`; `:84` `pcInvariable`.
- `src/services/conjugation/rules.ts:209-221` `AUXILIARY_PRESENT` and `passeComposeForms` (present auxiliary only); `:230` the `pcInvariable || aux === 'avoir'` rule; `:274-285` `composeLead`, where `que` is added for `subjonctif` at about `:279`.
- `src/services/conjugation/cellParts.ts:38-40` repeats the auxiliary lookup.
- `src/services/conjugation/assemble.ts:70-72` builds the AI's passé composé with `passeComposeForms`.
- `src/services/conjugation/generate.ts:177-184` writes the `passeCompose` cell into every row.

### LC2.1 Generalise the auxiliary (worker, first)

Files: `src/services/conjugation/rules.ts`, `src/services/conjugation/cellParts.ts`, `src/services/conjugation/assemble.ts`.

1. Replace the present-only auxiliary with the auxiliary of a given tense (imparfait, futur, conditionnel, subjonctif). Participle logic (`passeComposeParticiples`, être agreement, `pcInvariable`) is reused unchanged.
2. Source of the auxiliary forms: prefer deriving them from the reviewed `avoir` and `etre` rows, which avoids a second copy of the tables. Check for an import cycle, since `generate.ts` imports `rules.ts`. If a cycle appears, use a small table in `rules.ts` and check it against the goldens. State which was done.
3. In `composeLead`, `que` applies to `subjonctifPasse` as well as `subjonctif`.
4. Update `cellParts.ts` and `assemble.ts` to call the generalised function.
5. `passeComposeForms` output for `passeCompose` must not change.

Acceptance: `tests/conjugationRules.test.ts`, `tests/conjugationAssemble.test.ts` and `tests/conjugationPatterns.test.ts` pass unchanged, plus typecheck, lint, test, shape:check, format:check.
Do NOT touch: types, `generate.ts`, `checks.ts`, UI, locales, prompts.

### LC2.2 Types, generator, checks (worker, after LC2.1)

Files:
- `src/types/grammarPack.ts`: add the four names to `TENSES`.
- `src/services/conjugation/generate.ts`: add the four cells next to `passeCompose` (`:183-184`).
- `scripts/grammar-pack/checks.ts`: `SIMPLE_TENSES` (`:29`) must exclude every compound tense, not only `passeCompose`. The passé composé check (`:102-113`) generalises to every compound tense: auxiliary in that tense plus participle, with the verb's agreement variants.

Acceptance: `tests/grammarPackGenerate.test.ts`, `tests/grammarPackChecks.test.ts`, plus typecheck, lint, test, shape:check, format:check. Run `bun scripts/grammar-pack/build.ts --check` only to confirm the generator and checks run; a review failure for the controls is expected, a crash is not.
Do NOT touch: `reviews.json`, `pack.json`, goldens.

### LC2.3 Every branch on the tense (worker, after LC2.2)

Lines from a grep on 2026-10-21 (about; recheck before editing):

| File | Line | Current | Change |
| --- | --- | --- | --- |
| `src/services/conjugation/verify.ts` | ~170 | `verifyPackVerb` gives engine parts to every cell except passeCompose | exclude all compound tenses from engine parts; pack review is the gate |
| `src/services/conjugation/verify.ts` | ~188 | `verifyAnswer` returns `ai-only` for passeCompose | same for all compound tenses |
| `src/services/grammarPack/reverse.ts` | 29 | skips passeCompose | skip all compound tenses |
| `src/types/lexicon.ts` | 5 | `LEXICON_TENSES` filters passeCompose | filter all compound tenses; `VerbDataSchema` must gain no keys the content service does not send |
| `src/types/conjugationAnswer.ts` | 61, 84, 102 | `examples` keys, form loop | `examples` gets one sentence per tense including the four; `forms` stays simple-only |
| `src/components/word/DictionaryTenses.tsx` | 43 | skips passeCompose | skip compound tenses |
| `src/components/study/grammar/forms.ts` | 20 | filters passeCompose | filter compound tenses |
| `src/services/lexicon/match.ts` | 22 | skips passeCompose | skip compound tenses |
| `src/services/exercises/fromConjugation.ts` | 14-22 | `TENSE_TAG: Record<Tense, GrammarTag>` | map to existing tags only: plusQueParfait → `plus-que-parfait`, futurAnterieur → `future`, conditionnelPasse → `conditional`, subjonctifPasse → `subjunctive` (`src/types/grammar.ts`). No new tag (see risks) |
| `tests/lexiconMatch.test.ts` | 153 | asserts passeCompose absent | extend to the four |

Also run `grep -rn "passeCompose" src tests scripts` and list every hit not changed, with the reason. The 2026-10-21 grep also found `tests/conjugationVerify.test.ts`, `tests/fromConjugation.test.ts`, `tests/grammarPackReverse.test.ts`, `tests/conjugationAnswer.test.ts`, `tests/jsonSchema.test.ts`. Update failing assertions and report each.

Acceptance: typecheck, lint, test, shape:check, format:check.
Do NOT touch: `src/services/ai/prompts/`, locales, goldens, `reviews.json`, `pack.json`.

### LC2.4 Locale keys and AI prompt templates (worker, after LC2.3)

Files:
- `src/i18n/locales/en.json` and `src/i18n/locales/zh.json`: `conjugation.tenses` (en.json `:1266`; `passeCompose` at `:1272-1275` shows the shape `name`, `use`, `form`). Add the four tenses with the same three keys in both files. The zh text is the worker's draft; the owner checks it.
- `src/services/ai/prompts/defaults/conjugate.en.txt` and `conjugate.zh.txt`: the `examples` key list (`:24-26`, `:51`) gains the four tenses. Prompt wording stays in templates only. Read `src/services/ai/prompts/registry.ts` for any template version convention and follow it.
- `exercises.*.txt` and `extract.*.txt` need no change (tags unchanged).

Acceptance: typecheck, lint, test (`tests/conjugationLocale.test.ts` checks keys), **i18n:check**, shape:check, format:check.

### LC2.5 Goldens for the four controls in the new tenses (worker drafts, owner confirms)

File: `tests/fixtures/grammarPackGolden.ts` (exists; holds the four control tables in seven tenses). Add the four new tenses for each control: 4 tenses × 6 persons × 4 controls.

1. Type the compound cells for être, avoir, aller, s-appeler from knowledge.
2. Mark the new block in the file: `UNVERIFIED: drafted by the worker, owner to confirm.`
3. Extend the control test in `tests/grammarPackChecks.test.ts`.
4. Report every cell you are less sure of.

Do NOT rewrite the existing seven-tense values. If a generator output differs from a drafted cell, report the cell; do not change the generator to match.

### LC2.6 Rebuild and re-record the four controls (lead, not a worker)

1. `bun scripts/grammar-pack/build.ts` fails with `human review required` for the four controls, because their rows changed. Expected.
2. Owner confirms the drafted compound tables (LC2.5) and the waiver wording.
3. Lead runs, with the owner's name as `reviews.json` already uses it (`Roy Zhu`) and the reference the owner gives:
   `bun scripts/grammar-pack/review.ts record etre avoir aller s-appeler --by "Roy Zhu" --ref "owner waived re-review 2026-10-21; compound cells checked by goldens and engine only"`
4. `bun scripts/grammar-pack/build.ts` must now pass and write `src/data/grammar-pack/pack.json`. `verbs.json` still holds only the four controls at this point.

---

## Phase LC1: 15 owner-list verbs into the pack (after LC2.6)

The 15 verbs, all present in `../clarte-analysis/verbs/input.json` (checked 2026-10-21 as `word.<id>`): faire, prendre, venir, pouvoir, vouloir, savoir, voir, dire, mettre, partir, sortir, lire, écrire (`word.ecrire`, text `écrire`), boire, croire.

Pack ids are ASCII, like `etre` and `s-appeler`: id `ecrire`, `"infinitive": "écrire"`.

### LC1.0 Lead: owner confirms the aux per verb (decision, no worker)

`aux` takes one value (`src/types/grammarPack.ts:80`).
- Proposed `avoir`: faire, prendre, pouvoir, vouloir, savoir, voir, dire, mettre, lire, ecrire, boire, croire.
- Proposed `etre`: venir, partir.
- **sortir is ambiguous**: `être` intransitive (il est sorti), `avoir` transitive (il a sorti la voiture). Proposed default `etre`. The owner decides.

### LC1.1 Pack rows and irregular forms (worker)

Files:
- `data/grammar-pack/verbs.json` (exists): add 15 rows.
- `data/grammar-pack/irregulars.json` (exists): add 13 entries.

Steps:
1. Rows. The 13 irregular verbs: `"rule": "irregular"`, `aux` from LC1.0, accented `infinitive`. `partir` and `sortir`: `"rule": "ir-sortir"` and `"base"` = infinitive minus `ir` (`part`, `sort`), as the existing `s-appeler` row has `"base": "appel"`. Check `src/services/conjugation/rules.ts:160-168` for what the rule derives.
2. Irregular entries, shaped like `etre` and `avoir` in `irregulars.json`: `participles` (present, past), `forms` with `present` (six persons), `imparfaitStem`, `futurStem`, `subjonctif` (six persons; the `IrregularForms` type requires the key, `src/services/conjugation/generate.ts:48-55`), and `imperatif` only where it does not derive from the present. Explicit imperative overrides needed for `savoir` (sache, sachons, sachez) and `vouloir` (veuille, veuillons, veuillez).
3. Do not add variants such as `je puis` without a reference.
4. Report every entry you are less sure of, by verb and cell.

Acceptance: typecheck, lint, test, shape:check, format:check. Expected: build throws `human review required` for the 15 verbs; `pack.json` untouched. Do NOT touch goldens, `reviews.json`, `oracle-attest.json`, `pack.json`, `rules.ts`.

### LC1.2 Golden fixtures for the 15 verbs (worker)

Files:
- `tests/fixtures/grammarPackGoldenLc1.ts` (new): tables per verb in all 11 tenses (imperative three persons) and participles. Header: `Drafted by the worker from knowledge. UNVERIFIED until the owner confirms. Checks the generator only, not the forms.`
- `tests/grammarPackLc1.test.ts` (new): compares engine output with the fixture. Copy the pattern of the control test in `tests/grammarPackChecks.test.ts`; read it first.

Steps: read the control test and fixture; write the fixture; write the test; run `bun run test`. A failing cell is reported with the form from LC1.1; do not change the golden to match the generator without saying so.

Goldens written by the same author as `irregulars.json` add no independent check. The independent checks are the oracle (LC1.3) and the owner (LC1-R).

### LC1.3 Oracle report (lead, in the lead's checkout)

`.local/` is gitignored, so worktrees do not have it.
1. `MORPHALOU_DIR=<path the owner confirms> bun scripts/grammar-pack/oracle-diff.ts <15 ids>`. Report only. **Never** run `attest` mode: it writes `oracle-attest.json` and needs an owner decision per disagreement.
2. `MORPHALOU_DIR` comes from the owner. The default in `scripts/grammar-pack/oracle-diff.ts:88` is `.local/morphalou/csv/Morphalou3.1_formatCSV`, which exists in this checkout (verified). The owner confirms it is the intended copy.
3. The oracle compares simple tenses, participles and the present participle only. Compound tenses are checked by goldens and the engine only.

### LC1-R Owner review of the 15 verbs (lead runs, after LC1.3)

1. `bun scripts/grammar-pack/review.ts print <15 ids>`. The owner reviews the printed tables (all 11 tenses).
2. Each defect goes back to a worker dispatch (LC1.1 or LC1.2 scope), then is printed again.
3. On approval: `bun scripts/grammar-pack/review.ts record <15 ids> --by "<owner name>" --ref "<the reference the owner gives>"`. The lead does not write the reference.
4. `bun scripts/grammar-pack/build.ts` must pass and write `pack.json` with 19 verbs.
5. Lead adds the CHANGELOG (Unreleased) line and updates `docs/roadmap.md` "Next" item 1.

---

## Risks / things a worker must flag instead of guessing

- **Unverified French.** Every irregular form, participle, aux, tense assignment and the `savoir`/`vouloir` imperatives (plan section 9 list). Goldens by the same author catch generator bugs, not wrong forms. Independent checks: the Morphalou oracle (simple tenses only) and the owner.
- **Aux per verb.** The brief's note says all new LC1 verbs except venir, partir and sortir take `avoir`. Confirm each row in code and with the owner; the note is a claim to check, not a fact. None of the 15 is pronominal. venir and partir are proposed `etre`; sortir is ambiguous (LC1.0).
- **No oracle for compound tenses.** Morphalou does not list them.
- **Tags.** futur antérieur, conditionnel passé and subjonctif passé have no tag of their own (`src/types/grammar.ts`: `future`, `conditional`, `subjunctive`). Adding a tag changes a taxonomy whose IDs are stable storage values: owner decides.
- **Shipped status.** `verifyPackVerb` (`src/services/conjugation/verify.ts`, about `:157-175`) marks every cell of a pack verb `reviewed`. A row that reaches `pack.json` unreviewed would show as reviewed. The build gate must stay the only route into `pack.json`.
- **Review lapse.** Any change to a row lapses its review (hash covers the whole row). This is why LC2 comes first.
- **Build gate.** Any unreviewed row blocks the whole build (`build.ts:85-88`). This is why LC1 rows wait until the controls are recorded.
- **`ir-sortir` base.** `part` and `sort` are inferred from the infinitive; the LC1.2 golden is the check.
- **Morphalou directory.** Present in the lead's checkout and the default in `oracle-diff.ts:88`; the owner confirms before use.
- **Shape ledger.** `rules.ts` is 287 lines (limit 500, `scripts/check-code-shape.ts`). Keep new lines under 200 characters.
- **AI answer schema.** Four more `examples` keys change the `conjugate` request and the schema in `conjugationAnswer.ts`. Tests use mocks; real model behaviour is unverified.
