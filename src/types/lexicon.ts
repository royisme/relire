/** Owns the lexicon contract: the two response shapes, the per-part-of-speech `data` and the bundled data file's shape. Not the build or the HTTP code. */
import { z } from 'zod';
import { FINITE_PERSONS, IMPERATIVE_PERSONS, TENSES, isCompoundTense } from './grammarPack';

/** The simple tenses the content service sends; a compound tense is never one of them. */
export const LEXICON_TENSES = TENSES.filter((tense) => !isCompoundTense(tense));
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

const VerbEntrySchema = z.strictObject({ pos: z.literal('verb'), data: VerbDataSchema });
const NounEntrySchema = z.strictObject({ pos: z.literal('noun'), gender: GenderSchema, data: NounDataSchema });
const AdjectiveEntrySchema = z.strictObject({ pos: z.literal('adjective'), data: AdjectiveDataSchema });

export const LexiconEntrySchema = z.discriminatedUnion('pos', [VerbEntrySchema, NounEntrySchema, AdjectiveEntrySchema]);

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

/** One entry of the bundled data file: the response entry plus the lemma it belongs to. */
const LexiconBundleEntrySchema = z.discriminatedUnion('pos', [
  VerbEntrySchema.extend({ lemma: z.string().min(1) }),
  NounEntrySchema.extend({ lemma: z.string().min(1) }),
  AdjectiveEntrySchema.extend({ lemma: z.string().min(1) }),
]);

/** `data/lexicon/lexicon.json`: the generated file the app ships (the response schemas stay the client's contract). */
export const LexiconBundleSchema = z.strictObject({
  source: z.strictObject({
    ...LexiconSourceSchema.shape,
    sourceVersion: z.string().min(1),
    changes: z.string().min(1),
    modified: z.iso.date(),
  }),
  entries: z.array(LexiconBundleEntrySchema),
  forms: z.record(z.string().min(1), z.array(z.tuple([z.string().min(1), z.enum(LEXICON_POS)]))),
});

export type LexiconLemmaResponse = z.infer<typeof LexiconLemmaResponseSchema>;
export type LexiconFormResponse = z.infer<typeof LexiconFormResponseSchema>;
export type LexiconBundle = z.infer<typeof LexiconBundleSchema>;
export type VerbData = z.infer<typeof VerbDataSchema>;
