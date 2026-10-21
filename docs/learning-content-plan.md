# Learning content plan: conjugation to B2, numbers, determiners, questions, daily sentences

Status: **proposal for owner sign-off; nothing here is built.** Written 2026-10-21 at the owner's request ("design the grammar content, especially the verb conjugation I practise daily, with every tense needed up to B2, plus numbers, possessive adjectives, interrogatives and everyday sentence building"). It extends `docs/grammar-pack.md` (Part 1 pack, Part 3 engine, Part 2 topics) and `docs/grammar-topic-learning-spec.md`; where it disagrees with them it says so. French-grammar statements here are the author's and **unverified** until the owner or a language reviewer confirms them (section 9).

## 1. Principle: three kinds of content, one gate

Everything the learner is graded on must come from one of three sources, so nothing graded rests on an AI answer at drill time:

| Kind | Source of truth | Checked by | Examples |
| --- | --- | --- | --- |
| **Engine** | Deterministic function in `src/services/` | Golden tables the owner reviews once, plus property tests | conjugation, numbers, possessive selection |
| **Closed table** | A small reviewed table in `data/` | Owner review, schema, build gate | interrogative words, demonstratives, possessive forms |
| **Authored sentence** | Offline-authored, reviewed item (private pipeline like Part 2 topics) | Human review status shown honestly | scenario sentences, topic checkpoints |

AI (the learner's key) may explain or give feedback on free production, always labelled, never graded and never entering the data. This keeps the hard rules: no invented data, failures show the real error, prompts live in templates.

## 2. Track A: conjugation to B2

### 2.1 Tenses by level

The engine has seven (`present, passeCompose, imparfait, futur, conditionnel, subjonctif, imperatif`). TCF-relevant reading and writing up to B2 needs these added:

| Level | Tenses and forms | New to engine? |
| --- | --- | --- |
| A1 | présent, impératif, passé composé, futur proche (`aller` + infinitive) | futur proche is a pattern, not a tense (`patterns.ts` style) |
| A2 | imparfait, futur simple, passé récent (`venir de`), `être en train de` | patterns |
| B1 | conditionnel présent, plus-que-parfait, subjonctif présent, gérondif | plus-que-parfait, gérondif |
| B2 | conditionnel passé, futur antérieur, subjonctif passé, participe présent in use, passif (`être` + participle) | three compound tenses, passif |
| B2 reading only | passé simple, 3sg and 3pl | new rule data (section 2.4) |

**Compound tenses are generated and stored in the pack, like passé composé.** Advisor check (2026-10-21) corrected the first draft: passé composé is not derived at runtime. `generate.ts:183` writes it into every row, the schema requires it, and the review hash covers it (`scripts/grammar-pack/gate.ts:49`). Plus-que-parfait, futur antérieur, conditionnel passé and subjonctif passé are the auxiliary in imparfait, futur, conditionnel or subjonctif plus the past participle. Storing them keeps every graded cell inside the review gate; deriving them at runtime would make `verifyPackVerb` (`verify.ts:157-175`) call unreviewed cells `reviewed`.

Cost, stated up front:
- `passeComposeForms` hardcodes the auxiliary present (`rules.ts:209-221`, repeated in `cellParts.ts:38-46` and `assemble.ts:71`), so it becomes "auxiliary form in tense X + participle". `composeLead` adds `que` only for `subjonctif` (`rules.ts:279`), so the subjonctif passé needs its own case.
- About a dozen places branch on `tense === 'passeCompose'` (`verify.ts:170,188`, `reverse.ts:29`, `types/lexicon.ts:5`, `types/conjugationAnswer.ts:84,102`, `DictionaryTenses.tsx:43`, `study/grammar/forms.ts:20`, `lexicon/match.ts:22`). Each must be checked. `LEXICON_TENSES` and the strict `VerbDataSchema` must not gain keys the content service does not send. The AI answer schema requires one example per tense, so the `conjugate` templates change. `TENSE_TAG` in `fromConjugation.ts:15` needs grammar tags (existing tags only: `plus-que-parfait`, `conditional`, `subjunctive`, `future`).
- The four reviewed rows in `data/grammar-pack/reviews.json` lapse mechanically when the stored shape changes (the hash covers every cell). Owner decision 2026-10-21: no re-review of the four controls. The records are re-recorded under the owner's name with a reference line saying the re-review was waived and the new compound cells are checked by goldens and the engine only. The new LC1 verbs still go through the normal review gate.
- Outside the pack, compound cells stay `ai-only` (Part 3 F4: the auxiliary and agreement are AI claims). Only pack verbs get graded compound drills.

This changes the `TENSES` enum in `src/types/grammarPack.ts`; nothing has shipped, so no migration. Decision D1.

### 2.2 Verb inventory (about 110 verbs; about 40 bases to review)

Baseline is the owner's list of 68 (`clarte-analysis/verbs/input.json`), of which only the four controls are in the pack today. The rest of the plan adds families so the owner reviews bases, not every verb.

| Tier | Verbs | Review load |
| --- | --- | --- |
| V1 (done, `reviewed`) | être, avoir, aller, s'appeler | 0 |
| V2 owner's list, irregular | faire, prendre (+ reprendre, apprendre), mettre, venir (+ revenir), tenir, se souvenir, pouvoir, vouloir, savoir, voir, dire, lire, écrire, boire, croire, connaître, vivre, suivre, partir, sortir, dormir (+ s'endormir), ouvrir, offrir, pleuvoir, falloir | about 25 bases |
| V2 owner's list, spelling-change or regular | manger, nager, commencer, voyager, acheter, appeler, rappeler, essayer, préférer, se lever, se promener, s'inquiéter, s'ennuyer, finir/choisir/réussir, attendre/descendre/vendre/répondre, the regular pronominals | rule engine, goldens already exist |
| V3 B1 and B2 essentials | devoir, recevoir, valoir, courir, mourir, naître, rire, plaire, se taire, conduire/produire/traduire/construire, craindre/peindre/joindre/éteindre/atteindre, résoudre, conclure, convaincre/vaincre, battre, rompre, fuir, s'asseoir, cueillir, acquérir, paraître, envoyer (irregular future), employer/nettoyer | about 15 bases |
| V3 prefix families, derived | comprendre/surprendre/entreprendre; permettre/promettre/admettre/remettre; obtenir/retenir/maintenir/appartenir/contenir; devenir/parvenir/convenir/prévenir; apparaître/disparaître/reconnaître | 0 extra bases |

**Families: not decided, and not first.** The first draft proposed `like: "prendre", prefix: "com"` with one review of the base. The advisor found it does not fit the gate: reviews are recorded per verb row (`reviews.json`, `build.ts:105-113`), a member's row differs from its base (leads re-elide: `je tiens` / `j'obtiens`), and an unreviewed member would ship `auto-checked` yet show as `reviewed`. Inheriting the auxiliary is also wrong (`devenir`, `parvenir` take `être`; `prévenir` takes `avoir`). If families are built later they need explicit `aux` and form-override fields, and each member row is still reviewed (a short print of only the cells that differ). Not every verb in the table is an irregular base:
- `partir, sortir, dormir, ouvrir, offrir` already have rules (`ir-sortir`, `ir-ouvrir`); `employer, nettoyer` use `er-yer-i`; `se souvenir` belongs to the `venir` family.
- `s'asseoir` has two full conjugations (`assieds` / `assois`) and `IrregularForms` holds one string per person (`generate.ts:48-55`).
- `envoyer` is `er-yer-i` with an irregular future, and regular rules have no future override.
- `prédire, interdire, contredire, médire` (`vous prédisez`), `maudire` (like `finir`), `prévoir`, `pourvoir` (future) break a simple `like + prefix` and are not in the table.
- Aux cases the language reviewer must confirm: `convenir`, `apparaître`.

Decision D2 becomes: grow the pack by reviewed batches first; build families only when a batch shows they save review work.

### 2.3 Daily practice and study sets

The owner practises daily; the content is arranged for that:

- **Verb sets** on the Conjugation page: `Core 20`, `Owner's list`, `B1 essentials`, `B2 set`. A set is a list of verb ids in a data file, not a new storage object.
- **Drill session** = one set × one tense (or "mixed since last session"), through the existing `prepareConjugationDrills` (Part 3 F7), strict accents, no AI.
- **Contrast drills** (B1/B2, authored items, Track E style): passé composé vs imparfait, subjonctif triggers (`il faut que`, `bien que`, `pour que`), `si` clauses of the three types, concordance of tenses in reported speech.
- **Return path.** Conjugation drills have none today (only Mistakes). If the owner wants spaced review (open question 1 in `HANDOFF.md`), the unit is one card per verb × tense on the **existing FSRS-6 scheduler**, never a second engine. Decision D5.

### 2.4 Passé simple

Reading-only recognition of 3sg and 3pl for about 15 high-frequency verbs (`fut/furent`, `eut/eurent`, `alla/allèrent`, `fit/firent`, `dit/dirent`, `vit/virent`, `put/purent`, `voulut/voulurent`, `vint/vinrent`, `prit/prirent`, `mit/mirent`, `dut/durent`, `sut/surent`, `crut/crurent`, `-a/-èrent` for regular `-er`). Needs a new rule table, so it comes last and only if the owner's reading shows it. Default: defer. Decision D3.

## 3. Track B: numbers (engine `src/services/numbers/`)

One pure module: integer to words and words to integer, ordinals, decimals and percentages, fractions, years, clock times, prices, phone numbers by pairs. Why an engine: the rules are finite and deterministic, so drills need no AI and no authored list.

| Level | Content |
| --- | --- |
| A1 | 0 to 100 including 70, 80, 90; `et un`; ages, phone digits, simple prices |
| A2 | to 10 000; ordinals (`premier/première`, `deuxième`, `vingt et unième`); dates and years; clock times (24 h and 12 h, `midi et demi`, `et quart`, `moins le quart`); prices with the dollar or euro |
| B1 | to millions; `quatre-vingts` and `cent` agreement; `mille` invariable; `un million de`; fractions (`un demi`, `un tiers`, `trois quarts`); decimals with `virgule`; percentages |
| B2 | reading statistics: `une hausse de 3,5 %`, `la moitié`, `un quart des`, `deux fois plus`, approximations (`une dizaine`, `une centaine`, `des milliers`), ranges and comparisons |

Overlap: the Chapter Two manifest already has topics for cardinals, ordinals, fractions, percentages, possessives, demonstratives, `quel` and `tout` (`data/grammar-topics/manifest.json`). Tracks B and C are the drills for those topics; topics teach, engines drill (LC5). Drills reuse existing types, all with working controls (`practice/controls/index.ts:26-34`): `NUMBER_DICTATION` (device voice speaks it; the current prompt templates set its answer as French words, `adaptive.en.txt:20`, so choose one answer convention and accept digit spacing variants like `1 100` / `1100`), `WORD_TRANSFORM` (digits to words and the reverse), `FILL_BLANKS` for agreement cases. Verification: a golden table of about 150 values chosen for the hard cases (21, 71, 80, 81, 91, 100, 101, 200, 201, 1 100, 2 000, 80 000, 1 000 000, 2 000 000, plus the ordinals), reviewed once by the owner, and round-trip property tests that prove internal consistency only. Spelling convention (traditional vs 1990 hyphenation) is a display choice; answers accept both. Decision D4.

## 4. Track C: possessives, demonstratives, other determiners (`src/services/determiners/`)

Closed tables plus a selector over person, possessed noun gender, number and onset.

| Level | Content |
| --- | --- |
| A1 | `mon/ma/mes, ton/ta/tes, son/sa/ses, notre/nos, votre/vos, leur/leurs`; `mon amie` (vowel onset, feminine); agreement is with the noun, not the owner; `ce/cet/cette/ces`; `-ci/-là` |
| A2 | `quel/quelle/quels/quelles`; `tout/toute/tous/toutes`; `chaque`, `plusieurs`, `quelques` |
| B1 | possessive pronouns (`le mien`, `la nôtre`, `les leurs`); `celui/celle/ceux/celles` + `qui/que/de`; `lequel` and its contractions with `à` and `de` |
| B2 | `son/sa` ambiguity and when to use `à lui/à elle` (`sa voiture à lui`); `certains`, `aucun`, `chacun`; `dont` as the possessive relative |

Gender ground truth comes only from the reviewed noun-gender pack (337 A1 nouns). Nouns outside it are not graded for article or possessive choice, the same honesty rule as Part 4. This is the limiting factor for A2 to B2 drills and the reason for Question D8.

## 5. Track D: interrogatives (extends `patterns.ts`)

| Level | Content |
| --- | --- |
| A1 | intonation and `est-ce que`; `où, quand, comment, combien (de), pourquoi, qui, que/quoi, quel` |
| A2 | inversion with a pronoun; `qu'est-ce que/qu'est-ce qui`; preposition + interrogative (`avec qui`, `de quoi`) |
| B1 | `qui est-ce qui/que` (many courses teach it at A2); `lequel` |
| B2 | formal inversion with a noun subject (`Marie est-elle partie ?`); indirect questions (`je me demande si/ce que/ce qui/ce dont`); reported speech and tense concordance |

Engine: `whQuestion(wh, cellParts, register)` returns the three register rows (intonation, `est-ce que`, inversion) from the same `CellParts` as negation, so a cell and its question stay in sync. Drills: statement to question for a stated word and register; answer to matching question (`CHOICE_SELECT`); indirect-question transformation.

## 6. Track E: everyday sentences (造句)

The one track that cannot be engine-only. Unit = **scenario**, about 30 across the path:

A1: greet and introduce, spell a name, numbers and prices, ordering at a café, directions, time and dates. A2: shopping, transport, phone calls and appointments, health, housing, weather and plans, past events. B1: work and study, opinions, advice and wishes, hypotheticals (`si` + imparfait). B2: formal email and complaint, argue for and against, report what someone said, summarise a text, express regret and concession.

Each scenario holds:

1. **8 to 12 core sentences**, authored offline, with English and Chinese glosses, owner-reviewed (status shown as `AI-reviewed` or `human-reviewed`, as with topics).
2. **Frames**: a reviewed sentence with slots (`{verb:tense:person} {noun}`) where the engine fills the verb and the closed tables the determiner. A frame multiplies one reviewed sentence into many engine-checked drills without new AI.
3. **Exercises** from existing types: `DIALOGUE_ORDER`, `FILL_BLANKS` (engine-checked slot), `WORD_TRANSFORM` (negate, question, change tense via the engine). `SENTENCE_BUILD` is the exception: an unmatched answer goes to the AI grader (`grading.ts:42,98`), and word order is often not unique (adverb, pronoun placement). Use it only with every valid order listed in `acceptableAnswers`, or leave it out.
4. **Free production** (write your own sentence in the scenario) has no deterministic answer. The learner compares with the model sentences and, with a key, may ask for AI feedback shown as AI. It is never graded and never stored as a score.

Private pipeline: authoring, review hashes and publication follow Part 2 (gitignored drafts, content service database), not the repository.

### Gaps the advisor found for B2 and TCF writing (no track serves them yet)

Passive in every auxiliary tense; past-participle agreement with `avoir` and a preceding direct object; pronoun placement and `y`/`en` in compound and negated tenses (`je ne l'ai pas vu`, `je n'y suis pas allé`); the infinitif passé (`après avoir mangé`); concordance outside reported speech. Topics exist in the manifest. Candidate for a Track F "pronoun and participle placement" engine, only after LC1 and LC2.

## 7. Curriculum map

| Level | A Conjugation | B Numbers | C Determiners | D Questions | E Scenarios |
| --- | --- | --- | --- | --- | --- |
| A1 | présent, impératif, passé composé, futur proche | 0 to 100 | possessives, demonstratives | est-ce que, basic wh-words | greet, café, directions, time |
| A2 | imparfait, futur, passé récent | to 10 000, ordinals, time, dates | quel, tout, quantifiers | inversion, qu'est-ce que | shopping, health, phone |
| B1 | conditionnel, plus-que-parfait, subjonctif, gérondif | millions, fractions, percent | possessive pronouns, celui | lequel, qui est-ce qui | work, opinions, hypotheticals |
| B2 | conditionnel passé, futur antérieur, subjonctif passé, passif | statistics, approximations | dont, indefinites | indirect, formal inversion | formal email, argue, report |

No exam, score or readiness claim is made (`PRODUCT.md`).

## 8. Phases (each ends with docs and a `CHANGELOG.md` line; implementation by workers per `docs/agent-delegation.md`)

| Phase | Scope | Why this order |
| --- | --- | --- |
| LC1 | Pack growth: about 15 verbs of the owner's list, existing rules where they apply, reviewed in one batch | Smallest slice that serves the daily practice; no schema change |
| LC2 | Store the four compound tenses in the pack (generator, schema, the dozen call sites in 2.1, copy in en and zh, goldens), then review the four controls plus LC1 verbs once | One decision (D1); doing it after LC1 would force a second review, so LC1 and LC2 share one review pass |
| LC3 | Numbers engine, goldens, `NUMBER_DICTATION` and `WORD_TRANSFORM` sets (A1 to B1 first; B2 statistics later) | Self-contained, listening value |
| LC4 | Determiner tables and selector (needs the reviewed noun-gender pack, A1 nouns only); `whQuestion` only when a second caller exists | Depends on Part 4, not LC2 |
| LC5 | Chapter Two (22 topics) and the question topics through the Part 2 pipeline; topic page gets a "Practise" link to the matching engine drill | Teaching text plus drills; depends on open question 2 for sources beyond A1 |
| LC6 | Scenario packs, frames, set generation | Largest authored volume; start with 3 scenarios as a pilot |
| LC7 | V3 verbs, B2 contrast drills, passé simple only if wanted | Last |

## 9. Decisions for the owner (default in brackets) and unverified claims

- **D1** DECIDED 2026-10-21: store the four compound tenses in the pack; no re-review of the four controls (records re-recorded with a waiver reference).
- **D2** Prefix families for irregular verbs. [not now: grow the pack by reviewed batches; revisit when families clearly save review]
- **Deferred as over-built until a real caller exists:** slot frames (6.2), three-register `whQuestion`, number statistics layer, four named verb sets, contrast drills, spaced review (D5).
- **D3** Passé simple: recognition only, 3sg and 3pl, later. [defer]
- **D4** Number spelling: which form to display, both accepted. [traditional shown, rectified accepted]
- **D5** Spaced review of conjugation: one FSRS-6 card per verb × tense, or none. [decide after hands-on use]
- **D6** Free sentence production feedback through the learner's AI key, labelled. [yes, optional]
- **D7** Verb list sign-off: the V2 and V3 tables above are proposals. [owner edits]
- **D8** Source for A2 to C1 topics and noun gender beyond A1 (open question 2). [needs owner]
- **D9** Standard French with Canadian notes shown as glosses only (for example `magasiner`). [yes]

Unverified, for the language reviewer: every tense-level assignment in 2.1; the verb families in 2.2 (which verbs share a conjugation); the number rules in section 3 including `quatre-vingts`, `cent` and `mille` agreement; the spoken form of dollar prices; the possessive and demonstrative rules in section 4; the register labels in section 5.
