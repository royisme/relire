# Grammar pack: verified French conjugation data (phase 1 design)

Status: design for review, nothing built. Revised after an external review (Argon); the lead checked every code claim against the repo. Paths marked **(new)** do not exist yet; every other path was checked. Clarte material lives outside this repo under `/Users/royzhu/software/myproject/ts/studypro/clarte-analysis/` (`repo/src/data/frenchData.ts`, `repo/src/types/grammar.ts`, `verbs/input.json`, `verbs/out-glm.json`, `verbs/out-gpt.json`, `out/glm.md`, `out/gpt.md`); `clarte-analysis/...` below means that directory. Inherited owner decisions (2026-10-18, `docs/merge-progress.md` "Grammar tier") are stated once in section 1 and not reopened. Open points are in section 12 as `Q1` to `Q15`, each with a default or marked resolved. French-grammar claims the author could not verify are listed in section 12 under "For the human language reviewer" and must not be read as facts.

## 1. Goals, non-goals, inherited decisions

Goals
- Ship a static, schema-validated, versioned conjugation corpus for the verbs the owner's list targets, inside the app bundle (free GitHub Pages build and any later hosted build).
- Make three things answer from it instead of from the AI: the word-sheet conjugation table, a reverse lookup (form to lemma, tense, person), and conjugation drills as standalone `WORD_TRANSFORM` units.
- Every row says where it came from and how far it was checked; the build refuses to publish anything below the gate.

Non-goals (phase 1)
- No server, D1, API or accounts; no hosted delivery (the loader is the one seam, section 4).
- No bundled third-party data: no Wiktionnaire, Lexique, Morphalou, Verbiste-derived or Clarte-derived tables. Morphalou is an offline oracle only.
- No calculators, example sentences, noun gender or preposition content, daily-verb features, mastery stats, streaks, pronunciation scores, 12-colour token system.
- No IPA (no phase-1 consumer; a future addition when a real consumer exists, Q13), no new grammar tags, no new exercise type, no AI call in the corpus path at runtime or in drills.
- No participle drills, no inversion or negation forms (`va-t-il`, `ne mange pas`), no compound tenses other than passé composé, no spelling-by-sound logic.
- The word sheet still needs an AI key to open: `handleAiError` in `src/App.tsx` closes it on `MissingApiKeyError`, so pack data stays invisible without a key (Q9). Drills do not need a key.

Inherited (owner): static pack, clean-room generation with our own deterministic generator, offline Morphalou 3.1 diff as checking oracle, Clarte (the owner's work) only as requirements list and seed for rows that pass verification, per-row provenance, no compatibility code (`docs/conventions.md` "Nothing has shipped"), Zod validation at load with whole-pack rejection, French as content language. The pack is language-neutral: Chinese and English UI text live in the locale files (section 3, Q1).

Known Clarte defects not carried over (`clarte-analysis/out/glm.md` 1.4, `out/gpt.md` 1.4): `volleyer` (unverified, and not in the 68 targets, so it affects seeding only), three flawed gender-rule tips, unsourced "99%" gender percentages, `pronoun + full` string concatenation, translated labels driving logic, spelling-based phonetics, fabricated stats.

## 2. What a "row" is, and how the audit defects are closed

A **row** is the unit that carries provenance and a status: one `Verb` (all its forms and participles). Verb glosses are not in v1: no screen reads them (the word sheet takes meanings from the AI). Rule captions are locale keys, not rows. The publish gate is evaluated per row.

| Defect class in `out/gpt.md` 1.4 | Schema answer |
| --- | --- |
| Subject or clitic glued to the form (`j’ j’ai`, `je avance`) | `lead` and `forms` are separate fields; lead is composed by one exact algorithm (section 3) and re-derived by a check |
| Variants as one slash string (`paie/paye`, `essaie/essaye`) | `forms` is an array, primary first; drills use `expectedAnswer = forms[0]`, rest in `acceptableAnswers` |
| Translated subType labels driving logic (`nettoyer`, `régler`) | closed `RuleId` enum; captions are locale keys `grammarPack.rules.<ruleId>` |
| Elision and h aspiré by first letter of the infinitive | elision computed from the first letter of the first word of the generated form, with an explicit h-aspiré list; the build rejects any verb starting with `h` that is not listed |
| Sound claims from spelling | none; no IPA in v1 |

## 3. Data model (`src/types/grammarPack.ts` (new), Zod 4 like `src/types/exercises.ts`)

```ts
const text = z.string().trim().min(1);
export const TENSES = ['present','passeCompose','imparfait','futur','conditionnel','subjonctif','imperatif'] as const;
export const FINITE_PERSONS = ['1sg','2sg','3sg','1pl','2pl','3pl'] as const;
export const IMPERATIVE_PERSONS = ['2sg','1pl','2pl'] as const;
export const RuleIdSchema = z.enum([                     // closed; one generator function each, plus 'irregular'
  'er-regular','er-cer','er-ger','er-yer-i','er-e-grave','er-eacute-egrave','er-eler-double',
  'ir-issons','ir-sortir','ir-ouvrir','re-regular','irregular']);

export const ProvenanceSchema = z.object({
  origin: z.enum(['rule','irregular-table','clarte-seed','human']),
  checkedAgainst: z.array(z.enum(['consistency','control-verbs','morphalou-3.1','human'])),
  checkedAt: z.iso.date().optional(),          // required unless status is 'draft'
  status: z.enum(['draft','auto-checked','reviewed','rejected']),
  reviewedBy: text.optional(),                 // required when status is 'reviewed'
}).superRefine(/* checkedAt and reviewedBy rules above */);

export const CellSchema = z.object({
  lead: z.string(),                // all printed before the verb group, composed as below; "" in imperatif
  forms: z.array(text).min(1),     // verb group only, primary first: ["paie","paye"], ["suis allé","suis allée"]
});
const finite = z.partialRecord(z.enum(FINITE_PERSONS), CellSchema);  // z.record would demand every key (Zod 4); completeness is an invariant
export const VerbSchema = z.object({
  id: z.string().regex(/^[a-z]+(-[a-z]+)*$/),              // "etre", "se-lever" (ascii slug of the infinitive, unique)
  infinitive: text,                                         // as the learner meets it: "se lever"
  pronominal: z.boolean(),
  aux: z.enum(['avoir','etre']),                            // pronominal implies 'etre'
  rule: RuleIdSchema,
  defective: z.enum(['impersonal','third-person']).optional(), // impersonal: falloir, pleuvoir, 3sg only; third-person: se passer, 3sg and 3pl; neither has an imperatif
  pcInvariable: z.literal(true).optional(),                 // passé composé cells carry only the masculine singular participle, for every person (A5, Q15)
  tenses: z.object({ present: finite, passeCompose: finite, imparfait: finite, futur: finite,
    conditionnel: finite, subjonctif: finite,
    imperatif: z.partialRecord(z.enum(IMPERATIVE_PERSONS), CellSchema).optional() }),  // absent iff defective
  participles: z.object({ present: text.optional(),   // absent for falloir: no attested form, none invented
    past: z.object({ ms: text, fs: text, mp: text, fp: text }) }),  // invariable ones repeat the form
  prov: ProvenanceSchema,         // forms and participles
});
export const GrammarPackSchema = z.object({
  schemaVersion: z.literal(1), packVersion: z.string().regex(/^\d+\.\d+\.\d+$/),
  verbs: z.array(VerbSchema).min(1),
}).superRefine(/* cross-row invariants below */);
```

The shipped schema has no `parts`, `ipa`, `ipaProv`, `base`, rule texts or Chinese: nothing at runtime reads them. `base` and stem/ending parts exist only in `verbs.json` and generator output.

**Lead composition (exact; `generate.ts` builds it, `checks.ts` re-derives it from the stored forms).**
- Subject pronoun by person: `je`, `tu`, `il/elle`, `nous`, `vous`, `ils/elles`. The display form is the slash string, one cell for both genders (decision; passé composé gender variants stay in `forms`). `defective: 'impersonal'` verbs (`falloir`, `pleuvoir`) use `il`, never `il/elle`; `'third-person'` verbs use `il/elle` and `ils/elles`.
- Pronominal verbs add the reflexive pronoun after the subject: `me`, `te`, `se`, `nous`, `vous`, `se`. It elides to `m’`, `t’`, `s’` when the first letter of `forms[0]` is a vowel (accented included) or a mute h. `nous` and `vous` never elide.
- Non-pronominal 1sg `je` elides to `j’` before a vowel or mute h. With a reflexive present, `je` stays and the reflexive carries the elision (`je m’appelle`).
- Subjonctif prefixes `que` to the subject pronoun. `que` elides to `qu’` before `il/elle`, `il`, `ils/elles`: `qu’il/elle`, `qu’ils/elles`, `qu’il`. `que je`, `que tu`, `que nous`, `que vous` keep `que`; the verb-initial elision above still applies (`que j’aille`, `que je m’appelle`, `qu’il/elle s’appelle`).
- Pieces are joined by one space, except after an elided piece (ends in `’`), which takes none. The first letter checked is that of `forms[0]` (the auxiliary for passé composé). Verbs starting with `h` need an entry in the h-aspiré list (default: mute).
- `imperatif` has `lead: ""`; pronominal imperative forms carry the hyphenated clitic (`lève-toi`, `levons-nous`).

Invariants checked at load by `superRefine` (cheap, structural; linguistic checks run only in the build, section 5):
- verb ids unique; a `pronominal` verb has `aux: 'etre'`; `defective: 'impersonal'` has only `3sg` cells, `'third-person'` only `3sg` and `3pl`, neither has `imperatif`, both may omit `participles.present`; any other verb has all six persons per finite tense, all three imperative persons and a present participle.
- `forms` unique inside a cell; `lead` empty iff tense is `imperatif`.
- every `prov.status` in the file is `auto-checked` or `reviewed` (the gate, Q3); `rejected` and `draft` never appear in a shipped pack.
- shipped strings are NFC with the typographic apostrophe U+2019 (as in the owner's list and in article text); lookup normalises, section 6b.

Rule captions and labels are locale keys in `src/i18n/locales/en.json` and `zh.json`: `grammarPack.rules.<ruleId>` (the 11 regular `RuleId`s), `grammarPack.tenses.<tense>`, `grammarPack.persons.<person>`, plus the drill title, instruction and set title keys. They are resolved with `t()` at render time. `agy` may draft the 11 caption strings once as an ordinary copy task; they are reviewed like any locale copy (`.claude/rules/i18n.md`), no pipeline.

Existing types stay as they are. `src/types/index.ts` `ConjugationTense`/`ConjugationForm` (`person`, `form`) is what the word sheet already renders for AI data; the pack gets its own cell shape in the sheet (section 6a). Passé composé is stored expanded (not derived at runtime) so the app contains no conjugation logic at all; the logic lives only in `scripts/`.

## 4. Files, delivery, versioning

```
data/grammar-pack/            (new) authored sources, outside src so Vite never bundles them
  verbs.json                  list: id, infinitive, base, rule, aux, defective, pcInvariable, h-aspiré list (seeded once from the owner's 68 entries)
  irregulars.json             explicit irregular table (section 5)
  reviews.json                human review records (section 5)
  oracle-attest.json          per-verb oracle result and human decisions; no Morphalou text
scripts/grammar-pack/ (new)   rules.ts generate.ts checks.ts build.ts review.ts oracle-diff.ts
src/data/grammar-pack/pack.json (new)   build artifact, committed, immutable per packVersion
src/services/grammarPack/ (new)         load.ts lookup.ts reverse.ts
src/hooks/useGrammarPack.ts (new)       { status: 'loading'|'ready'|'error', pack, error }
.local/                       gitignored: Morphalou copy and oracle reports (add to `.gitignore`)
```

- Loader: `load.ts` does `await import('../../data/grammar-pack/pack.json')`, parses with `GrammarPackSchema`, memoises the promise, and drops the memo on failure so a retry re-parses. A malformed pack rejects whole with the Zod reasons (`errorMessage` in `src/services/ai/errors.ts` style); callers show that text, never an empty table. This is the only seam: a hosted build would swap the import for a versioned fetch of an immutable `pack.<packVersion>.json` with the same schema gate.
- Bundle: `src/data/` already holds static content (`docs/architecture.md`). Dynamic import keeps the main chunk unchanged. **P1 must prove, not assume** (acceptance criterion), that Vite emits the JSON as its own `.js` chunk, that `dist/sw.js` precache lists it, and that the main entry chunk size is unchanged. `vite.config.ts` `workbox.globPatterns` is `**/*.{js,css,html,ico,png,svg,woff,woff2}` plus `pdfjs/**/*`: it has no `json`, so a `public/` fetch design would require adding `json`; the import design should need no change. `maximumFileSizeToCacheInBytes` is 3 MB per file; about 2,900 cells at roughly 40 bytes (no `parts`, no `ipa`) is about 0.12 MB unminified (an estimate to be measured in P1).
- Offline: the chunk is precached with the app, so conjugation works offline; `registerType: 'autoUpdate'` ships a changed pack as a new service-worker version.
- Versioning: `packVersion` is a hand-bumped semver at the top of `data/grammar-pack/verbs.json` that `build.ts` copies into the pack (content change = minor; a schema change also bumps `schemaVersion`). Nothing has shipped, so there is no migration; a schema change rewrites pack and reader together.
- Determinism: `bun scripts/grammar-pack/build.ts --check` regenerates in memory and fails on any byte difference with `pack.json`; add it as a step in `.github/workflows/ci.yml` after Unit tests.

## 5. Generator and verification pipeline

Inputs: `verbs.json`, `irregulars.json`, ending tables in `rules.ts`, the golden control tables in `tests/fixtures/grammarPackGolden.ts` (new).

Seed list. `clarte-analysis/verbs/input.json` has 68 entries (4 `control`, 52 `table`, 12 `rule-covered`). The meaning of those kinds is not defined in any file read; the 12 `rule-covered` entries are all regular pronominal `-er` verbs, which is an inference, not a fact. Reduced to lemmas the list is 66 verbs: `changer` and `changer de` merge, `répondre à` is `répondre`, `il faut` is `falloir` (impersonal), `pleuvoir` is impersonal, `se passer` is `defective: 'third-person'` (it is only used with a third-person subject, so drills never ask 1sg or 2sg), 21 entries are pronominal (Q4). `appeler`, `s’appeler`, `rappeler`, `se rappeler` stay separate entries sharing a `rule`. The rule of each verb is set by hand in `verbs.json`, never inferred from the infinitive (`acheter` and `jeter` both end in `-eter`).

Generation (`generate.ts`, pure, deterministic, no I/O; internally each simple cell is `{stem, ending}` and never serialised):
1. Regular rules: stem + ending tables per tense, with these spelling changes. Cells not named keep the plain stem. A language reviewer checks this table first; it is a design claim, not an audited fact. `er-e-grave` covers both `-e<C>er` with a single consonant (`lever`, `se promener`) and the `-eter` verbs that take a grave accent (`acheter`: `j’achète`); `er-eler-double` covers the doubling verbs (`appeler`, `jeter`).

   | RuleId | Present | Imparfait | Futur, conditionnel | Subjonctif | Imperatif, participle |
   | --- | --- | --- | --- | --- | --- |
   | `er-cer` | `ç` in nous | `ç` in je, tu, il, ils | plain | plain | `ç` in 1pl and present participle |
   | `er-ger` | `ge` in nous | `ge` in je, tu, il, ils | plain | plain | `ge` in 1pl and present participle |
   | `er-yer-i` | `i` for `y` in je, tu, il, ils | plain | `i` in all persons (`-ayer`: `y` also, a variant) | `i` in je, tu, il, ils | `i` in 2sg |
   | `er-e-grave` | `è` in je, tu, il, ils | plain | `è` in all persons | `è` in je, tu, il, ils | `è` in 2sg |
   | `er-eacute-egrave` | `è` in je, tu, il, ils | plain | plain `é` (traditional; `è` is a Q5 variant) | `è` in je, tu, il, ils | `è` in 2sg |
   | `er-eler-double` | `ll` in je, tu, il, ils | plain | `ll` in all persons | `ll` in je, tu, il, ils | `ll` in 2sg |
   | `ir-issons` | `iss` stem in plural | `iss` stem | short stem | `iss` stem | `iss` in 1pl, 2pl and participle |
   | `ir-sortir` | short stem in singular | long stem | long stem | long stem | short stem in 2sg |
   | `ir-ouvrir` | `-er` endings (`ouvre`) | plain | plain | `-er` style | 2sg as present; participle from the irregular table |
   | `re-regular` | `-s -s`, bare stem in 3sg | plain | drop final `e` of the infinitive | plain | 2sg as present |

   `er-regular` has none of these changes. Each rule has exactly one test verb (section 8 table).
2. `irregulars.json` entry per irregular verb: explicit present (six forms), imperfect stem, future stem, explicit subjunctive (six forms) when not derivable, participles. Imperative derives from present (drop `s` of `-es`/`-as` in tu form) with explicit overrides (etre, avoir, savoir, vouloir). Conditionnel derives from future stem. Estimated about 25 irregular verbs.
3. Passé composé = auxiliary present form + past participle; for `être` and pronominal verbs the agreement variants go into `forms` (`suis allé`, `suis allée`; plural masculine and feminine for nous, vous, ils/elles). Participle `fs/mp/fp` from rule (`e`, `s`; no change after `s`/`x`) with an explicit invariable list (`été`, `fallu`, `plu`). Exception: a verb with `pcInvariable` gets only `aux + ms` in every passé composé cell, with no subject-agreement variant. The flag is set only for verbs on the reviewer's list (Q15); until that review, the default list is `se rappeler` and `s’imaginer`.
4. Pronominal: lead composed as in section 3; hyphenated postposed pronoun in imperative forms (`lève-toi`, `levons-nous`).
5. Variants only from the tables, never invented: `payer` (`paie`/`paye`), `essayer` (`essaie`/`essaye`), `pouvoir` (`je puis` is a candidate variant of `je peux`, unverified). Rectified 1990 spellings: Q5. The two present-tense draft outputs `clarte-analysis/verbs/out-glm.json` and `out-gpt.json` differ in only 9 of 408 cells (68 entries by 6 persons), all of these kinds, which makes them a cheap extra cross-check, not an oracle.

Machine checks (`checks.ts`, run by `build.ts` and by tests; they operate on generator output, so stem and ending are checked there and never shipped; every failure names the verb, tense and person):
- all persons present; forms NFC, lowercase, no whitespace anomalies; stem + ending equals the form (so the imperatif hyphen never conflicts: the clitic is outside stem and ending); lead re-derived by the section 3 algorithm equals stored `lead`.
- passé composé equals aux plus participle; auxiliary and agreement variants match `aux`/`pronominal`/`pcInvariable`; imperative derived forms match present.
- per-rule family invariants: every `er-ger` verb has `geons` and `geais`; every `ir-issons` verb has `issons` in nous, imparfait and subjunctive; for `er-cer` and `er-ger`, checked at the stem/ending boundary and only where the stem is the infinitive stem (present, imparfait, subjonctif, imperative, participles; futur and conditionnel keep `-er` in the stem): the `er-cer` stem ends in `ç` iff the ending starts with `a` or `o`; the `er-ger` stem ends in `ge` iff the ending starts with `a` or `o`. The whole word is never scanned.
- reverse-index round trip: every indexed key resolves to a cell that contains it. Homograph report lists collisions (`suis` is both être and suivre, both in the list) and tests assert the expected set.
- control verbs: `s’appeler`, `être`, `aller`, `avoir` must equal the hand-typed golden tables in all seven tenses, participles included. The goldens are typed by a human from a printed or academic reference; the reviewer names it in the review record (Q3). A bug common to generator and checks cannot hide behind goldens that are not generated.

Morphalou oracle (`oracle-diff.ts`, never run in CI, never bundled):
- Input: `MORPHALOU_DIR` pointing at a copy under `.local/` or elsewhere outside the repo. Morphalou lists bare inflected words, not compound tenses, leads or clitic imperatives, so the script compares only: non-pronominal simple-tense forms, the four past-participle forms and the present participle. Pronominal imperatives are compared with the clitic stripped. Compound tenses and leads are verified by our own rules (auxiliary + participle, the lead algorithm) and checks. Morphalou's file format was not verified; the adapter is the only code that knows it and is written in P3 after reading the real file.
- Output: a report on stdout and in `.local/` (gitignored). Each disagreement needs a human decision recorded in `oracle-attest.json` as `{verbId, tense, person, ourForm, decision: keep|fix|variant, note}` plus per verb `{morphalouVersion, ranAt, agree, disagree}`. A resolution is made against a printed reference, never by copying the oracle's form (this keeps the corpus clean-room and Morphalou's LGPL-LR obligations out). No Morphalou string is committed.
- Effect: `checkedAgainst` gains `morphalou-3.1` and `checkedAt` for a verb only when the attest hash matches the verb's current row hash.

Review gate and record:
- Status is derived by `build.ts`, never hand-typed: `rejected` if listed in `reviews.json` as rejected; `reviewed` if `reviews.json` has a record `{rowId, rowHash, reviewedBy, reviewedAt, reference}` whose `rowHash` (sha256 of the canonical row without `prov`) matches; `auto-checked` if all machine checks pass; else `draft`.
- Editing a row changes its hash, so its review lapses and the build fails naming the row.
- `bun scripts/grammar-pack/review.ts print <verbId...>` prints a compact table (7 tenses by 6 persons plus participles) for the reviewer; `review.ts record <verbId...> --by "<name>" --ref "<reference>"` appends records. Reviewer effort: about 44 cells per verb, 66 verbs, about 2,900 cells; roughly 1,100 of them in the irregular verbs, and the 40 or so regular verbs reduce to about 10 rule families plus spot checks if Q3 allows `auto-checked` for them (estimate).
- Publish gate: the build exits non-zero when any included row is `draft` or `auto-checked` beyond what Q3 allows. `rejected` rows are skipped and logged. Excluded verbs are removed from `verbs.json` with a reason in the commit message.

## 6. Integration points

### 6a. Word-sheet conjugation table
Today `handleWordClick` in `src/App.tsx` calls `fetchWordAnalysis` (`src/services/api.ts`), which asks `analyzeWord` (`src/services/ai/tasks.ts`) with `src/services/ai/prompts/defaults/word.en.txt` and `word.zh.txt`; the model fills `conjugationTable` (optional in `WordAnalysis`, `src/types/index.ts`), and `src/components/WordDetailModal.tsx` renders it with `FormTile`. The answer is cached by language, prompt fingerprint, word and sentence (`docs/architecture.md`).
- Resolve the entry from `wordData.lemma` (AI free text, unvalidated): exact `infinitive` match only, after NFC, lowercase, trim, whitespace collapse and apostrophe folding (`s'appeler` equals `s’appeler`). The pronoun is never added or removed: a transitive `lever` never resolves to `se lever`, and there is no `base` fallback. An unknown lemma stays unknown (Q2). The reverse hits of 6b are shown separately, so a disagreement stays visible and the pack never overrides the sheet.
- Known: render the pack table (tense heading from `grammarPack.tenses.<tense>`, one caption line from `grammarPack.rules.<rule>` for regular rules) through a pack cell shape `{ lead, forms: string[] }`; the AI `conjugationTable` is ignored for that word. Unknown: default per Q2, keep the AI table with a visible note that it is AI-made and not verified (no fallback is invented; the model really produced it); the AI cells enter the same tile as `{ lead: person, forms: [form] }`.
- Saved vocabulary: `handleToggleVocab` (`src/App.tsx`) stores the whole `WordAnalysis` as `analysis`, including the unverified AI `conjugationTable`. When the pack covers the verb and is `ready`, drop `conjugationTable` from the saved `analysis` (the sheet shows the pack table on reopen); otherwise keep it unchanged.
- `FormTile` (`src/components/WordDetailModal.tsx`, lines 30 to 50) today speaks `${person} ${form}` and renders person and form as two flex children with `gap-2` and `truncate`. Change it to take `{ lead, forms, wrap }`: speech is the primary form with its lead (`lead + forms[0]`), joined by one space, except no space after a lead ending in `’` or `'` (`j’ai`), and just `forms[0]` when the lead is empty (imperatif); the lead element is not rendered when empty and takes no gap after an elided lead; the visual label joins agreement and spelling variants with ` / `; `aria-label` uses the visible label. Pack cells (`wrap`) use `min-h-9`, `whitespace-normal` and `break-words` instead of `truncate`; AI cells keep today's look.
- Files touched: `src/components/WordDetailModal.tsx`, `src/App.tsx` (the save step), `src/services/grammarPack/lookup.ts` (new), `src/hooks/useGrammarPack.ts` (new), `src/i18n/locales/en.json`, `zh.json`. Prompts, `api.ts` and the cache stay unchanged under the Q2 default.
- States: the sheet already shows a loading state until `wordData` arrives; pack-dependent sections render once the pack is ready as well. A pack load error replaces the section with the real error text in place (no row appears or disappears; `.claude/rules/ui.md`).

### 6b. Reverse lookup in the reader and word sheet
- Index built once in memory from the loaded pack (`reverse.ts`), key to `{verbId, tense, person}[]`: the verb token of each simple-tense cell (every variant), the four past-participle forms, the present participle, and for pronominal imperatives the whole hyphenated token (`lève-toi`). Passé composé cells are not indexed (their participle and auxiliary are).
- Key normalisation matches what reaches the sheet. `readerTokens` in `src/utils/readerTokens.ts` keeps internal apostrophes and hyphens in one token and strips a leading elision prefix (`l’`, `d’`, `j’`, `qu’`, `m’`, `t’`, `s’`, `n’`, `c’`) into `lookup`, so `j’ai` arrives as `ai`; `handleWordClick` only trims outer non-letters.
- Do not reuse or call `normalizeFrench` (`src/services/exercises/grading.ts` lines 17 to 27): it turns `-` into `'` and strips accents when `strictAccents` is false, which would merge `a` with `à` and break `lève-toi`. A dedicated `normalizeLookupToken` (in `src/services/grammarPack/lookup.ts`) keeps diacritics and hyphens, folds U+2018, U+2019 and backtick to `'`, folds U+2010 to U+2015 to `-`, applies NFC and lowercases. The index keys and every query (also the 6a lemma) go through it.
- Display: a "Verb form" section in the sheet, one line per lemma (`manger: présent, nous`), tenses merged per lemma, at most four lemmas, nothing when no hit. All callers get it through the shared `handleWordClick` (reader, unit rows and passages, mistakes).
- Files: `src/services/grammarPack/reverse.ts` (new), `src/services/grammarPack/lookup.ts`, `src/components/WordDetailModal.tsx`, locale keys. Homographs are shown as separate lemmas; the pack does not pick one.

### 6c. Conjugation drills as standalone `WORD_TRANSFORM` units
See section 7. Entry point: a new section in `src/components/practice/PracticePage.tsx` below the article generator, form in `src/components/practice/ConjugationDrillForm.tsx` (new). `src/hooks/useAdaptiveDrills.ts` and `src/services/exercises/fromDrills.ts` are the model for saving (`saveUnits` in `src/storage/exercises.ts`, retry with the same prepared payload).

## 7. Drill generation (`src/services/exercises/fromConjugation.ts` (new), pure)

`prepareConjugationDrills({ pack, tenses, verbIds, level, perUnit = 8, maxPerVerb = 2, rng, makeId, now, t }) => ExerciseUnit[]`, every unit validated with `ExerciseUnitSchema` (`src/types/exercises.ts`).
- One batch, one unit per selected tense. Unit fields: `id = <setId>:<tense>`, `section: 'CONJUGAISON'`, `unitNumber` 1..n, `title` and `instruction` from locale keys (`grammarPack.drill.*`, tense label interpolated), `type: 'WORD_TRANSFORM'`, `items` (at least 1), `grammarTags = [tense tag]` (at least 1); batch fields `setId` from `makeId`, `setTitle` from `t`, `level` from the learner's choice (`ExerciseLevelSchema`), `createdAt = now()` identical on every unit; no `importSource`, no article.
- Items: a sample of `(verb, person)` cells that exist (defective verbs yield only their cells), without replacement, at most `maxPerVerb` per verb per unit, injectable `rng` (tests use a seed); fewer items than `perUnit` when the pool is smaller (counted and shown, like the article generator). Item fields: `id = <verbId>:<tense>:<person>` (unique inside the unit), `itemNumber` = 1-based index, `prompt`, `expectedAnswer = forms[0]` (a scalar, as `refineExerciseItem` requires), `acceptableAnswers = forms.slice(1)`, `grammarTag` = the tense tag, `meta = { source: 'grammar-pack', packVersion, verbId, tense, person, rule, strictAccents: true }`. `answerSource` omitted (Q8).
- Prompt. `ExerciseAttempt` stores only `prompt` (`src/types/exercises.ts` lines 221 to 231) and the Mistake notebook shows only `prompt`, so `prompt` states tense and person on its own: `"<lead> ... (<infinitive>), <tense label>"` (no space between an elided lead and `...`), for imperatif `"... (<infinitive>), <tense label>, <person label>"` (no lead, so the person cue is added). Labels come from `t()` at creation. `secondaryPrompt` may repeat the tense and person line; nothing may depend on it.
- Explanation: omitted for pack drills (the smaller choice). A stored `explanation` is fixed text that cannot follow a later UI-language switch, and showing a caption by key would need the practice feedback UI to read `meta.rule`. The word sheet shows the caption by key (6a); `meta.rule` stays on the item.
- Tags (existing, no new): present to `present`, passeCompose to `passe-compose`, imparfait to `imparfait`, futur to `future`, conditionnel to `conditional`, subjonctif to `subjunctive`, imperatif to `imperative`. Pronominal entries keep the tense tag (Q7). Finer granularity (`er-cer`) rides in `meta.rule`; accuracy and the mistake notebook group by area only (`services/exercises/accuracy.ts`), so learners never see it.
- Levels: none per verb or tense, the learner picks the batch level (Q6).
- Strict accents (Q10 resolved: yes). `normalizeFrench` strips accents unless `strictAccents` is on, and the default is off, so `parle` would be accepted where `parlé` is expected. `CheckedResult.strictAccents` is set from the learner's global setting in `src/hooks/exerciseUnit/actions.ts` (lines 70 to 86, `runCheck`) and `item.meta` cannot influence it today. Add ONE helper exported from `src/services/exercises/grading.ts`: `effectiveStrictAccents(item, options) => item.meta?.strictAccents === true || options.strictAccents`. `gradeItem` calls it for its comparisons and `runCheck` calls it for both `CheckedResult` objects (the graded one and the AI-graded one), so the stored boolean always equals the one used to grade (the controls read `checked.strictAccents` to render the verdict).
- No AI, so drills work without a key and add no cache entry.

## 8. Tests

`bun test` in `tests/` (new files `grammarPackSchema.test.ts`, `grammarPackGenerate.test.ts`, `grammarPackBuild.test.ts`, `grammarPackLookup.test.ts`, `fromConjugation.test.ts`):
- Generator: control goldens (all 7 tenses, participles); exactly these test verbs, one row per RuleId (no rule without a verb):

  | RuleId | Test verb | RuleId | Test verb |
  | --- | --- | --- | --- |
  | `er-regular` | `parler` (fixture only, not in the list) | `ir-issons` | `choisir` |
  | `er-cer` | `commencer` | `ir-sortir` | `sortir` |
  | `er-ger` | `manger` | `ir-ouvrir` | `ouvrir` |
  | `er-yer-i` | `s’ennuyer` (plus `essayer` for variants) | `re-regular` | `vendre` |
  | `er-e-grave` | `se lever` and `acheter` (both spellings of the rule) | `er-eacute-egrave` | `préférer` |
  | `er-eler-double` | `appeler` (plus `jeter` as a fixture) | `irregular` | the 4 control verbs |

  Also: the lead algorithm on `j’ai`, `je m’appelle`, `qu’il/elle s’appelle`, `que j’aille`, `qu’il` for `falloir`; imperative hyphens; passé composé agreement variants and `pcInvariable`; `falloir`, `pleuvoir` and `se passer` cells.
- Checks: each check rejects a mutated copy (wrong lead, missing person, broken stem+ending, wrong aux, `ç` before `e`).
- Schema: a malformed pack is rejected whole (duplicate id, status `draft`, missing person, `imperatif` on a defective verb, `lead` set on imperatif); a valid fixture passes.
- Build: refuses below the gate; a review lapses when a row changes; `--check` is stable; the pack contains no CJK.
- Loader: memoised, failure not cached, rejects whole.
- Locale keys: tense, person and rule labels are built as dynamic keys, which `scripts/check-i18n.ts` does not check (it matches literal `t('...')` only); a test asserts every `TENSES`, person and regular `RuleId` has a key in both locales.
- Reverse and lookup: `suis` gives être and suivre; `mange` gives several cells; `lève-toi`; `a` and `à` stay distinct; elided input after prefix stripping; NFC, apostrophe and dash variants; no hit returns empty; lemma `lever` does not resolve to `se lever`.
- Drills: units pass `ExerciseUnitSchema`; deterministic with a seed; ids and `itemNumber`; every prompt contains the tense label and (imperatif) the person label; tag mapping; variants in `acceptableAnswers`; per-verb cap; shared `setId` and `createdAt`; `effectiveStrictAccents` (meta true wins over a false setting, setting true stays true) and the stored `CheckedResult.strictAccents` equals the grading flag; no AI import.

Playwright (`e2e/grammar-pack-word.spec.ts`, `grammar-pack-reverse.spec.ts`, `grammar-pack-drills.spec.ts` (new), AI mocked by `e2e/fixtures.ts`): the existing `word` fixture is the noun `chose` (`e2e/fixtures.ts` line 56), so add two fixtures, a known verb (lemma `aller` with an AI table containing a deliberately wrong form to prove the pack wins) and an unknown verb (a lemma not in the pack, AI table shown with the note). Also: saving the known verb to vocabulary stores no `conjugationTable`; an elided lead is spoken and shown without a gap (`j’ai`). Reverse: tapping `vais` shows `aller`, present, je. Drills: create a set from Practice with no key configured and assert no AI request, then check a correct and a wrong answer including accents with the global strict-accents setting off. `verify-ui` before/after layout assertions for the new sections; `impeccable detect` stays `[]`.

## 9. Phases (dependency order, one worker each, each ends with docs and a `CHANGELOG.md` line where a user can notice)

| Phase | Scope | Acceptance |
| --- | --- | --- |
| P1 schema, generator, checks, delivery proof | `src/types/grammarPack.ts`, `scripts/grammar-pack/{rules,generate,checks}.ts`, goldens, regular rules, lead algorithm, pronominal, passé composé; an uncommitted throwaway loader and `pack.json` of the 4 controls to measure delivery | `bun test` green; control verbs equal goldens; every RuleId has its test verb; build stays green; the pack is a separate chunk in `dist/assets`; main chunk size unchanged against the baseline below; the chunk is in the `dist/sw.js` precache; numbers recorded in the PR text |
| P2 build, review, loader, first pack | `build.ts` with gate and `--check`, `review.ts`, `load.ts` and `useGrammarPack.ts` (committed together with the first pack, so no import points at a missing file), `irregulars.json` for the 4 controls, CI step | committed `pack.json` of the 4 control verbs at `reviewed`; `build --check` clean; build fails on an unreviewed row; a hand-edited row lapses its review |
| P3 oracle tooling | `oracle-diff.ts` against the real Morphalou file (comparison scope in section 5), `oracle-attest.json` | report on the 4 controls; attest recorded; `checkedAgainst` gains `morphalou-3.1` only on a matching hash; no Morphalou string committed |
| P4 word sheet and reverse lookup | 6a and 6b, hook, locale keys (tenses, persons, rules), 3 e2e blocks | known verb answers from the pack, unknown shows the labelled AI table, saved vocab drops the AI table, reverse hits shown; `bun run lint`, `i18n:check`, `build`, e2e green |
| P5 drills | 6c and section 7, `effectiveStrictAccents` | set saved without a key; correct and wrong answers graded with accents; stored `strictAccents` equals the grading flag; unit tests; e2e green |
| P6 content fill (repeat per batch of about 15 verbs) | irregular rows, `pcInvariable` list after the Q15 review, oracle run, reviews | each batch merges only at the gate; pack covers the Q4 list; reviewer effort logged |

Baseline for the P1 delivery proof, measured on this branch (`bun run build`): main chunk `index-*.js` 1,269.81 kB (342.40 kB gzip), `importPdf-*.js` 431.70 kB, precache 217 entries, 6404.61 KiB.

P3, P4 and P5 are independent after P2 and may run in parallel (P3 needs the real Morphalou file). P6 can start after P2 and runs alongside the others; its oracle step needs P3.

## 10. Licence recommendation and the open-data research

Recommendation: license `data/grammar-pack/` and `src/data/grammar-pack/pack.json` under MIT, the same as the app (`LICENSE`, `package.json` `license`), because forms are produced by our own rules and only compared with, not copied from, third-party data. What would change it: (1) any row or form copied or derived from Wiktionnaire (CC BY-SA) or Verbiste-derived data (GPL); (2) an oracle disagreement resolved by taking Morphalou's form (LGPL-LR duties); (3) a counsel opinion that the automated oracle diff counts as database extraction (Q12); (4) Clarte data turning out to contain third-party material the owner cannot license; (5) wanting others to reuse the data with no attribution (then CC0 for the data only).

Source: `/tmp/agy-research/run2.log` (agy report, the lead spot-checked it; not independently verified here). Relevant conclusions:
- Wiktionnaire is CC BY-SA 4.0 (3.0 before June 2023); derived datasets are share-alike, incompatible with MIT bundling; checking against it is fine.
- Lexique is contradictory: link text says BY-SA, the link targets BY-NC; OpenLexicon says BY-SA. Treat as not usable.
- Morphalou 3.1 is LGPL-LR; bundling needs notices and replaceability. We only use it as an offline oracle, so none apply.
- Verbiste-derived libraries (`verbecc`, `mlconjug3` data, `conjugation-fr`) are GPL or LGPL by lineage; `hbenbel/French-Dictionary` (declared MIT) derives from Wiktionary dumps and cannot be MIT; `french-verbs-lefff` data stays LGPL-LR. None are used.
- The 1990 rectifications are an official norm and may be checked against; the Académie's site text may not be copied.
- Individual forms are unprotectable facts; bulk extraction of a third-party database can trigger the EU database right (Directive 96/9/EC art. 7). The report calls the diff safe in its body and lists it as an open question for counsel at the end.

## 11. Risks

- R1 Linguistic error ships: mitigated by goldens, family invariants, oracle (simple tenses and participles only), human review of irregulars; residual risk stays with the reviewer.
- R2 Reviewer capacity (about 2,900 cells): Q3 default shrinks it; batches in P6 cap the load.
- R3 Morphalou file format or coverage not as assumed: P3 reads the real file first; the oracle scope is already limited to simple tenses and participles.
- R4 Accent-blind grading mis-grades drills: Q10, `effectiveStrictAccents`.
- R5 AI lemma wrong or in another form (`se lever` vs `lever`): exact match only, no fallback; an unknown lemma shows the labelled AI table.
- R6 Homographs and tokenisation (`suis`, hyphenated imperatives, elision prefix): covered by reverse tests and `normalizeLookupToken`; inversion forms are a non-goal.
- R7 A wrong lead (elision, `qu’il`, `il` vs `il/elle`) is visible to every learner: one exact algorithm, re-derived by a check, goldens for the controls.
- R8 Pack size and service-worker churn: measured in P1; a pack change is a new SW version.
- R9 Coverage is 66 verbs; a learner meets thousands. The unknown-verb path (Q2) is therefore the common path, not an edge case.

## 12. Questions for the owner

- **Q1 Where the Chinese texts live. Resolved (Option B).** The project rule `docs/conventions.md` ("Strings and locales") confines Chinese to `src/i18n/locales/zh.json`, `*.zh.txt`, `README.zh-CN.md`, `marketing/zh/`, so the 11 rule captions are locale keys `grammarPack.rules.<ruleId>` in `en.json` and `zh.json`, resolved with `t()` at render time. The pack stays language-neutral; `RuleTextSchema`, `BilingualSchema`, `texts.json` and the agy caption pipeline are removed; no convention amendment.
- **Q2 Unknown verbs.** Default: keep the AI-made table with a visible "AI-made, not verified" note (touches only `WordDetailModal.tsx` and locale keys). Alternative: honest empty state, which removes `conjugationTable` from `word.en.txt`, `word.zh.txt`, `src/types/index.ts` and `e2e/fixtures.ts`, changes the prompt fingerprint (old cached analyses are bypassed), and removes today's table for the thousands of verbs not in the pack.
- **Q3 Publish gate and reviewer.** Default: `reviewed` for irregular verbs; `auto-checked` accepted for regular-rule forms only when all checks pass and the oracle has zero unexplained disagreements. Who is the human reviewer for French forms and for the locale copy, and which printed reference do they use for the control goldens? Strict alternative: `reviewed` for all (about 2,900 cells).
- **Q4 List reconciliation.** Default: 66 verb entries (merge `changer de` into `changer`, `répondre à` into `répondre`), `falloir` and `pleuvoir` as `defective: 'impersonal'`, `se passer` as `defective: 'third-person'`, 21 pronominal entries kept as separate verbs; verb-plus-preposition notes dropped from v1. Is the 68-entry list final?
- **Q5 1990 rectified spellings.** Default: traditional spelling primary (`préférerai` keeps both acute accents); the rectified spelling is an extra `forms` entry only after verification against a printed reference. The agy report's examples (for example `cèderai`) are not verified here. Affects `préférer` and `s’inquiéter` in futur and conditionnel, and the circumflex on `i`/`u` in `s’entraîner` and `connaître`; the 9 draft differences above are `entraîne`/`entraine`, `connaît`/`connait`, `essaie`/`essaye`/`essayes` and `je puis`.
- **Q6 Levels.** Default: no per-verb or per-tense level (the owner's list has none; a mapping is a pedagogical claim needing a source); the learner picks the batch level.
- **Q7 Granularity.** Default: tense tags only; `RuleId` rides in `meta.rule`; pronominal entries keep the tense tag. A finer tag would be a taxonomy change (stable IDs, 37 tags in `src/types/grammar.ts`) for no visible gain, since progress groups by area.
- **Q8 `answerSource`.** Default: omit (no value in `material | ai | user` fits; no consumer found outside creation code). Alternative: add a value to the enum in `src/types/exercises.ts` and the schemas that mirror it.
- **Q9 No key, no sheet.** Default: out of scope. Alternative: let the word sheet open with pack-only content when no key is set; needs a change to `handleAiError` in `src/App.tsx` and a product decision about the missing-key banner.
- **Q10 Strict accents in drills. Resolved: yes.** Conjugation items carry `meta.strictAccents: true`, honoured through the single helper `effectiveStrictAccents` (section 7); accent-only errors are real errors in conjugation.
- **Q11 Corpus licence.** Default: MIT (section 10).
- **Q12 Oracle diff legality.** Default: proceed; the report's own open question 3 suggests counsel could confirm that comparing without retaining Morphalou content is not extraction. The maintainer who downloads Morphalou accepts its terms.
- **Q13 IPA. Resolved: drop.** `ipa`, `ipaProv` and the IPA phase are removed because no phase-1 screen consumes them; add them as a future change when a real consumer exists.
- **Q14 Rule captions. Resolved by `docs/conventions.md`.** 11 locale keys in both locales (Q1), shown under the word-sheet table; drills store no caption (section 7).
- **Q15 Participle agreement of pronominal verbs with an indirect-object reflexive (new).** Default: `pcInvariable` on `se rappeler` and `s’imaginer` only, until the language reviewer returns the list and exact forms (below).

### For the human language reviewer (author could not verify these; nothing here is asserted as fact)
1. Q15: for each of the 21 pronominal lemmas, state whether the passé composé participle agrees with the subject or stays invariable (reflexive pronoun as indirect object), and write the exact six passé composé forms of every invariable one. Confirm `se rappeler` and `s’imaginer`; decide the others, including verbs whose agreement depends on a following direct object (`s’habiller`, `se laver`: drills show a bare cell with no object).
2. The spelling-change table in section 5: which verbs belong to `er-e-grave` (`lever`, `se promener`, `acheter`), `er-eler-double` (`appeler`, `jeter`, `rappeler`) and `er-eacute-egrave`, the `-ayer` variants, and the futur of `préférer`.
3. The lead conventions: `il/elle` and `ils/elles` as the display form, `qu’il/elle`, and the h list (confirm the h of `s’habiller` is mute and no other verb in the 66 starts with `h`).
4. `se passer` as third-person only (3sg and 3pl, no imperatif); `falloir` and `pleuvoir` as 3sg only, no imperatif, no present participle for `falloir`.
5. Variants (`je puis`, `essaie`/`essaye`, `paie`/`paye`) and the 1990 spellings (Q5).
