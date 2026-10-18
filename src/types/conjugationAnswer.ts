/**
 * The shape the AI must return for one verb (the `conjugateVerb` task): rule,
 * auxiliary, the forms of the six simple tenses (verb group only), participles
 * and one example sentence per tense, with the structural checks of the pack
 * schema that apply to AI output. Owns this answer contract only. Does not own
 * leads, passé composé or the imperative clitic (the engine composes them from
 * these fields), nor the prompt that asks for it.
 */
import { z } from 'zod';
import { FINITE_PERSONS, RuleIdSchema, TENSES, isPronominalInfinitive, type Person } from './grammarPack';

const text = z.string().trim().min(1);

/** French text: NFC, with the typographic apostrophe U+2019 only. */
const french = text
  .refine((value) => value === value.normalize('NFC'), 'string is not NFC')
  .refine((value) => !value.includes("'"), 'use the typographic apostrophe U+2019');

/** The verb group of one cell, primary form first. */
const forms = z.array(french).min(1);

// Explicit keys, not partialRecord: provider response-schema subsets reject `propertyNames`.
const finite = z.object({
  '1sg': forms.optional(),
  '2sg': forms.optional(),
  '3sg': forms.optional(),
  '1pl': forms.optional(),
  '2pl': forms.optional(),
  '3pl': forms.optional(),
});
const imperatif = z.object({ '2sg': forms, '1pl': forms, '2pl': forms });

const example = z.object({
  fr: french,
  /** One string in the UI language (the cache key already carries the language). */
  gloss: text,
});

export const ConjugationAnswerSchema = z
  .object({
    infinitive: french,
    pronominal: z.boolean(),
    aux: z.enum(['avoir', 'etre']),
    rule: RuleIdSchema,
    defective: z.enum(['impersonal', 'third-person']).optional(),
    /** True only for a verb that starts with an aspirated h; absent (or false) otherwise. */
    hAspire: z.boolean().optional(),
    forms: z.object({
      present: finite,
      imparfait: finite,
      futur: finite,
      conditionnel: finite,
      subjonctif: finite,
      imperatif: imperatif.optional(),
    }),
    participles: z.object({
      present: french.optional(),
      past: z.object({ ms: french, fs: french, mp: french, fp: french }),
    }),
    examples: z.object({
      passeCompose: example,
      present: example,
      imparfait: example,
      futur: example,
      conditionnel: example,
      subjonctif: example,
      imperatif: example.optional(),
    }),
  })
  .superRefine((answer, ctx) => {
    const fail = (path: (string | number)[], message: string) => ctx.addIssue({ code: 'custom', path, message });

    if (answer.pronominal !== isPronominalInfinitive(answer.infinitive))
      fail(['pronominal'], 'pronominal must be true exactly when the infinitive starts with se or s’');
    if (answer.pronominal && answer.aux !== 'etre') fail(['aux'], 'a pronominal verb takes être');

    const persons: readonly Person[] =
      answer.defective === 'impersonal'
        ? ['3sg']
        : answer.defective === 'third-person'
          ? ['3sg', '3pl']
          : FINITE_PERSONS;
    for (const tense of TENSES) {
      if (tense === 'passeCompose' || tense === 'imperatif') continue;
      for (const person of FINITE_PERSONS) {
        const present = answer.forms[tense][person] !== undefined;
        if (persons.includes(person) !== present)
          fail(['forms', tense, person], persons.includes(person) ? 'cell is missing' : 'cell is not allowed');
      }
    }

    // A defective verb has no imperatif and may have no present participle; any other verb has both.
    const defective = answer.defective !== undefined;
    if (defective === (answer.forms.imperatif !== undefined))
      fail(['forms', 'imperatif'], defective ? 'a defective verb has no imperatif' : 'imperatif is missing');
    if (defective === (answer.examples.imperatif !== undefined))
      fail(['examples', 'imperatif'], defective ? 'a defective verb has no imperatif example' : 'example is missing');
    if (!defective && answer.participles.present === undefined)
      fail(['participles', 'present'], 'present participle is missing');

    for (const tense of TENSES) {
      if (tense === 'passeCompose') continue;
      const cells = tense === 'imperatif' ? answer.forms.imperatif : answer.forms[tense];
      for (const [person, list] of Object.entries(cells ?? {}))
        if (new Set(list).size !== list.length) fail(['forms', tense, person], 'duplicate form');
    }
  });
export type ConjugationAnswer = z.infer<typeof ConjugationAnswerSchema>;

/** ASCII `'` and U+2018 to the typographic apostrophe U+2019, which French text here uses everywhere. */
export const foldApostrophes = (text: string) => text.replace(/['\u2018]/g, '\u2019');

/**
 * Folds the apostrophes of every string in a raw model answer before it is parsed: models write `'`, and the
 * schema (which still rejects it) is for what the app stores. `gloss` is in the UI language, where `'` is
 * ordinary English, so it is left alone.
 */
export function foldAnswerApostrophes(value: unknown, key?: string): unknown {
  if (typeof value === 'string') return key === 'gloss' ? value : foldApostrophes(value);
  if (Array.isArray(value)) return value.map((item) => foldAnswerApostrophes(item, key));
  if (value && typeof value === 'object')
    return Object.fromEntries(Object.entries(value).map(([name, item]) => [name, foldAnswerApostrophes(item, name)]));
  return value;
}
