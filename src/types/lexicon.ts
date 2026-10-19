/** Owns the lexicon service contract: the two response shapes and the per-part-of-speech `data`. Not the import or the HTTP code. */
import { z } from 'zod';
import { FINITE_PERSONS, IMPERATIVE_PERSONS, TENSES } from './grammarPack';

export const LEXICON_TENSES = TENSES.filter((tense) => tense !== 'passeCompose');
export const AGREEMENTS = ['ms', 'fs', 'mp', 'fp'] as const;
export const LEXICON_POS = ['verb', 'noun', 'adjective'] as const;

/** Morphalou can list several variants for one cell. */
const forms = z.array(z.string().min(1)).min(1);
const byKey = <const K extends readonly [string, ...string[]]>(keys: K) =>
  z.partialRecord(z.enum(keys), forms).refine((cells) => Object.keys(cells).length > 0);

export const VerbDataSchema = z.strictObject({
  tenses: z.strictObject({
    present: byKey(FINITE_PERSONS).optional(),
    imparfait: byKey(FINITE_PERSONS).optional(),
    futur: byKey(FINITE_PERSONS).optional(),
    conditionnel: byKey(FINITE_PERSONS).optional(),
    subjonctif: byKey(FINITE_PERSONS).optional(),
    imperatif: byKey(IMPERATIVE_PERSONS).optional(),
  }),
  participles: z.strictObject({
    present: forms.optional(),
    past: z.partialRecord(z.enum(AGREEMENTS), forms),
  }),
});
export const NounDataSchema = z.strictObject({ singular: forms.optional(), plural: forms.optional() });
export const AdjectiveDataSchema = z.partialRecord(z.enum(AGREEMENTS), forms);

/** Morphalou's own GENRE values, stored as they are. A noun with two different genders is refused at import. */
export const GenderSchema = z.enum(['masculine', 'feminine', 'invariable', '-']);

export const LexiconEntrySchema = z.discriminatedUnion('pos', [
  z.strictObject({ pos: z.literal('verb'), data: VerbDataSchema }),
  z.strictObject({ pos: z.literal('noun'), gender: GenderSchema, data: NounDataSchema }),
  z.strictObject({ pos: z.literal('adjective'), data: AdjectiveDataSchema }),
]);

export const LexiconSourceSchema = z.strictObject({
  name: z.string().min(1),
  maintainer: z.string().min(1),
  licence: z.string().min(1),
  url: z.url(),
});

export const LexiconLemmaResponseSchema = z.strictObject({
  lemma: z.string().min(1),
  entries: z.array(LexiconEntrySchema).min(1),
  source: LexiconSourceSchema,
});
export const LexiconFormResponseSchema = z.strictObject({
  form: z.string().min(1),
  lemmas: z.array(z.strictObject({ lemma: z.string().min(1), pos: z.enum(LEXICON_POS) })).min(1),
  source: LexiconSourceSchema,
});

export type LexiconLemmaResponse = z.infer<typeof LexiconLemmaResponseSchema>;
export type LexiconFormResponse = z.infer<typeof LexiconFormResponseSchema>;
export type VerbData = z.infer<typeof VerbDataSchema>;
