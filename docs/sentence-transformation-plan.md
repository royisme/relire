# Sentence transformation: reasoning questions from the readers

Plan of record, written 2026-10-26 by the lead after the owner's request ("start with sentence transformation, write the plan"). Nothing here is built. Owner decisions are marked **Open** until answered.

## Why

A graded reader's checkpoint is text-bound: the question is built from one reader sentence and the answer is a stretch of that sentence. The machine gates (G5) rely on this, and it keeps beginners safe from wrong French. The cost is that the question tests only finding the words. Until 2026-10-26 the sentence was even shown above the control, so the answer was visible; the quote is now hidden until the learner asks or answers (HQ1). That leaves "read, then answer", which is comprehension, not use of the grammar.

A **sentence transformation** asks the learner to change a sentence they have just read ("make it negative", "make it plural", "put it in the passé composé"). The learner has to apply the rule, not find it. A wrong rule gives a wrong sentence, so it can be checked.

## Principle: the AI proposes, a rule decides

A wrong expected answer teaches wrong French (`docs/graded-readers-plan.md`: wrong content does more harm to a beginner than anywhere else). So no item is shown because the AI said it is right. Every kind has a **verifier**, plain code over the data we already hold, and an item is shown only if the verifier accepts it.

- The **source sentence is a reader sentence** (authored and reviewed, never AI text). Its tokens are bound to glossary entries with lemma, part of speech, forms and noun gender (`ReaderGlossaryEntrySchema`, `SentenceSchema.tokens`), so a verifier knows which token is the finite verb, which is the noun phrase and which noun is plural.
- Two strengths, stated on every kind and never mixed up:
  - **computed**: the verifier computes the one correct answer from the source sentence and the rule. An AI item is kept only if its `expectedAnswer` equals the computed one; every `acceptableAnswers` entry must also equal a computed variant. The AI cannot put a wrong answer on screen.
  - **checked**: the verifier cannot compute the answer but can reject many wrong ones (required words present, forbidden words absent, structure matches). It is evidence, not proof (the same word the conjugation engine uses for `match`). Items of this strength carry the label "AI-proposed, rule-checked" and are never called reviewed.
- Grading the learner is the existing deterministic `gradeItem` for `WORD_TRANSFORM` (`expectedAnswer` plus `acceptableAnswers`). An unmatched answer is wrong; there is no `needs-ai` path and no AI grade for this type. Free sentence-making (grading by AI, an estimate) is a later step, not this one.

## Kinds

| Kind | The learner does | Strength | Verifier uses |
| --- | --- | --- | --- |
| `negation` | rewrites the sentence with ne…pas (n' before a vowel or mute h) | computed | the verb token's entry; the article after the negation turns `un/une/des/du/de la/de l'` into `de` or `d'` except after être; the answer is built by rule |
| `number` | singular to plural, or plural to singular | computed | each noun's entry (gender, forms), the article and adjective agreement, the verb form from the grammar pack |
| `passe-compose` | present to passé composé | computed | the conjugation engine (`src/services/conjugation`) for the auxiliary and the participle, with être agreement |
| `question` | makes it a question (est-ce que, inversion) | checked | required structure only; several correct forms |
| `pronoun` | replaces the object with le, la, les, y or en | checked | harder; later |

Version 1 is `negation`, `number` and `passe-compose`: all three are computed, so no AI answer can be wrong on screen. `question` and `pronoun` and the combination kinds (joining two sentences with qui or parce que) wait until a spike shows a verifier that is honest about its limits.

## What the AI is for

A hard question has to be answered before building more: **if the verifier can compute the answer, what does the AI add?** For the three computed kinds the app could build the item itself, with no AI call and no key. The honest position:

- Computed kinds need no AI. The plan builds them as code first (TR2), so the feature works on the first run without a key, like the readers.
- The AI earns its place where generation is hard and verification is partial: the `checked` kinds, a chosen mix of kinds for one learner's weak topics, a short explanation in the learner's language, and, later, sentences beyond the three bundled readers. For those it proposes, the verifier filters, and the label says what the filter can and cannot promise.
- Prompt wording lives in `src/services/ai/prompts/defaults/transform.en.txt` and `.zh.txt` (never in TypeScript). The call goes through `src/services/ai`, like `exercises.*.txt`. Input: the reader's sentences with ids and the allowed kinds. Output: JSON with `sentenceId`, `kind`, `instruction`, `expectedAnswer`, `acceptableAnswers`, `explanation`. The existing `keepAnswerable` check (the quoted words must occur in the source) runs first, then the kind's verifier; failures are dropped and counted, and the count is shown ("3 of 8 proposals did not pass the check").

## Data and place

- A generated or computed set is an ordinary exercise unit of type `WORD_TRANSFORM`, saved through the existing unit saver, so attempts, accuracy and the Practice list work unchanged. `meta` carries `{ source: 'reader-transform', readerId, version, sentenceId, kind, strength }`, in the same style as `reader-dictation` (`src/services/exercises/fromReader.ts`, `ReaderDictationMetaSchema`); the schema gets one more `meta` branch.
- Entry point: after the checkpoints in a reader, an optional "Practise this pattern" action. It is separate from the checkpoint results; it never changes the reader's topic-learning state, a vocabulary rating or any schedule.
- The source sentence is shown with the instruction (that is the point of a transformation); the answer is not visible. The reader's own checkpoint quote stays hidden until asked or answered.
- Provenance on screen: computed items say "Built by rule from the reader's sentence"; AI items say "AI-proposed, rule-checked". Neither says reviewed.

## Limits to know

- **Small supply.** The bundled readers have a handful of sentences each; each kind applies only to some of them (negation needs a finite verb with an object, passé composé needs a present-tense verb the engine knows). The number of distinct items per kind may be small. TR1 measures it before any build.
- **Computed does not mean the sentence is natural.** A negated reader sentence can be correct and odd (a beginner sentence). It is still a faithful transformation.
- **Rule exceptions.** Negation after être, with quantity words and with "il y a" differ; v1 either handles a case with a stated rule or skips the sentence. A skipped sentence is not an error.
- **Evidence is not proof** for `checked` kinds, stated on screen.

## Steps (one at a time; code and tests by different models)

| # | Step | Acceptance |
| --- | --- | --- |
| TR1 | Spike: a read-only script over the bundled readers that, per kind, counts the sentences the kind applies to and the computed answer it would give; prints a table and a few examples for the owner to read | the numbers per kind; no code in `src/` |
| TR2 | Pure kinds and verifiers (`negation`, `number`, `passe-compose`) in `src/services/exercises/transform/`, schema branch for `meta`, `fromReaderTransform` building units from a reader | table tests for every rule and exception, a mutation per rule; no AI, no key |
| TR3 | Reader entry: "Practise this pattern", the unit saved to Practice, the provenance line, the empty state when a reader has no applicable sentence | static and unit checks; the owner tries it |
| TR4 | The AI path: `transform.*.txt`, the task, the dropped count, the `checked` kinds (starting with `question`) | the verifier rejects wrong proposals in tests with a mocked AI; owner-gated before any wider use |

## Open decisions for the owner

1. **Version 1 kinds:** `negation`, `number`, `passe-compose` (recommended), or fewer.
2. **Keyless first:** build the computed kinds as code with no AI and no key (recommended; the AI joins in TR4), or require the AI from the start.
3. **Where it lives:** an action after a reader's checkpoints (recommended), or only a Practice set the learner makes from a reader.
