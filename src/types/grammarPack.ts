/**
 * Grammar pack contract: the Zod schemas of the shipped conjugation corpus
 * (verbs, cells, provenance) and the structural invariants checked at load.
 * Owns what a valid pack looks like. Does not own how forms are generated or
 * linguistically checked (scripts/grammar-pack) nor loading (the pack loader).
 */
import { z } from 'zod';

const text = z.string().trim().min(1);

export const TENSES = [
  'present',
  'passeCompose',
  'imparfait',
  'futur',
  'conditionnel',
  'subjonctif',
  'imperatif',
] as const;
export const FINITE_PERSONS = ['1sg', '2sg', '3sg', '1pl', '2pl', '3pl'] as const;
export const IMPERATIVE_PERSONS = ['2sg', '1pl', '2pl'] as const;
export type Tense = (typeof TENSES)[number];
export type Person = (typeof FINITE_PERSONS)[number];
export type ImperativePerson = (typeof IMPERATIVE_PERSONS)[number];

/** Closed set: one generator function per id, plus the explicit irregular table. */
export const RuleIdSchema = z.enum([
  'er-regular',
  'er-cer',
  'er-ger',
  'er-yer-i',
  'er-e-grave',
  'er-eacute-egrave',
  'er-eler-double',
  'ir-issons',
  'ir-sortir',
  'ir-ouvrir',
  're-regular',
  'irregular',
]);
export type RuleId = z.infer<typeof RuleIdSchema>;

export const ProvenanceSchema = z
  .object({
    origin: z.enum(['rule', 'irregular-table', 'clarte-seed', 'human']),
    checkedAgainst: z.array(z.enum(['consistency', 'control-verbs', 'morphalou-3.1', 'human'])),
    checkedAt: z.iso.date().optional(),
    status: z.enum(['draft', 'auto-checked', 'reviewed', 'rejected']),
    reviewedBy: text.optional(),
  })
  .superRefine((prov, ctx) => {
    if (prov.status !== 'draft' && prov.checkedAt === undefined) {
      ctx.addIssue({ code: 'custom', path: ['checkedAt'], message: 'checkedAt is required unless status is draft' });
    }
    if (prov.status === 'reviewed' && prov.reviewedBy === undefined) {
      ctx.addIssue({ code: 'custom', path: ['reviewedBy'], message: 'reviewedBy is required when status is reviewed' });
    }
  });

export const CellSchema = z.object({
  /** Everything printed before the verb group; "" in imperatif. */
  lead: z.string(),
  /** The verb group only, primary form first: ["paie", "paye"], ["suis allé", "suis allée"]. */
  forms: z.array(text).min(1),
});
export type Cell = z.infer<typeof CellSchema>;

// partialRecord because z.record would demand every key; completeness is an invariant below.
const finite = z.partialRecord(z.enum(FINITE_PERSONS), CellSchema);

export const VerbSchema = z
  .object({
    id: z.string().regex(/^[a-z]+(-[a-z]+)*$/),
    infinitive: text,
    pronominal: z.boolean(),
    aux: z.enum(['avoir', 'etre']),
    rule: RuleIdSchema,
    defective: z.enum(['impersonal', 'third-person']).optional(),
    /** Passé composé cells carry only the masculine singular participle, for every person. */
    pcInvariable: z.literal(true).optional(),
    tenses: z.object({
      present: finite,
      passeCompose: finite,
      imparfait: finite,
      futur: finite,
      conditionnel: finite,
      subjonctif: finite,
      imperatif: z.partialRecord(z.enum(IMPERATIVE_PERSONS), CellSchema).optional(),
    }),
    participles: z.object({
      present: text.optional(),
      past: z.object({ ms: text, fs: text, mp: text, fp: text }),
    }),
    prov: ProvenanceSchema,
  })
  .superRefine((verb, ctx) => {
    const fail = (path: (string | number)[], message: string) => ctx.addIssue({ code: 'custom', path, message });

    if (verb.pronominal && verb.aux !== 'etre') fail(['aux'], 'a pronominal verb takes être');

    const persons: readonly Person[] =
      verb.defective === 'impersonal' ? ['3sg'] : verb.defective === 'third-person' ? ['3sg', '3pl'] : FINITE_PERSONS;
    for (const tense of TENSES) {
      if (tense === 'imperatif') continue;
      const cells = verb.tenses[tense];
      for (const person of FINITE_PERSONS) {
        const cell = cells[person];
        if (persons.includes(person) !== (cell !== undefined)) {
          fail(['tenses', tense, person], persons.includes(person) ? 'cell is missing' : 'cell is not allowed');
        }
        if (cell && cell.lead === '') fail(['tenses', tense, person, 'lead'], 'lead is empty outside imperatif');
      }
    }

    const imperatif = verb.tenses.imperatif;
    if (verb.defective) {
      if (imperatif) fail(['tenses', 'imperatif'], 'a defective verb has no imperatif');
      // participles.present may be omitted for a defective verb
    } else {
      if (!imperatif) fail(['tenses', 'imperatif'], 'imperatif is missing');
      for (const person of IMPERATIVE_PERSONS) {
        if (imperatif && !imperatif[person]) fail(['tenses', 'imperatif', person], 'cell is missing');
      }
      if (verb.participles.present === undefined) fail(['participles', 'present'], 'present participle is missing');
    }
    for (const [person, cell] of Object.entries(imperatif ?? {})) {
      if (cell.lead !== '') fail(['tenses', 'imperatif', person, 'lead'], 'lead must be empty in imperatif');
    }

    for (const tense of TENSES) {
      for (const [person, cell] of Object.entries(verb.tenses[tense] ?? {})) {
        if (new Set(cell.forms).size !== cell.forms.length) fail(['tenses', tense, person, 'forms'], 'duplicate form');
      }
    }

    // Shipped strings: NFC and the typographic apostrophe only.
    const strings: [(string | number)[], string][] = [[['infinitive'], verb.infinitive]];
    for (const tense of TENSES) {
      for (const [person, cell] of Object.entries(verb.tenses[tense] ?? {})) {
        strings.push([['tenses', tense, person, 'lead'], cell.lead]);
        cell.forms.forEach((form, i) => strings.push([['tenses', tense, person, 'forms', i], form]));
      }
    }
    for (const [key, form] of Object.entries(verb.participles)) {
      if (typeof form === 'string') strings.push([['participles', key], form]);
      else
        for (const [agreement, value] of Object.entries(form)) strings.push([['participles', key, agreement], value]);
    }
    for (const [path, value] of strings) {
      if (value !== value.normalize('NFC')) fail(path, 'string is not NFC');
      if (value.includes("'")) fail(path, 'use the typographic apostrophe U+2019');
    }
  });
export type Verb = z.infer<typeof VerbSchema>;

export const GrammarPackSchema = z
  .object({
    schemaVersion: z.literal(1),
    packVersion: z.string().regex(/^\d+\.\d+\.\d+$/),
    verbs: z.array(VerbSchema).min(1),
  })
  .superRefine((pack, ctx) => {
    const seen = new Set<string>();
    pack.verbs.forEach((verb, i) => {
      if (seen.has(verb.id))
        ctx.addIssue({ code: 'custom', path: ['verbs', i, 'id'], message: `duplicate id ${verb.id}` });
      seen.add(verb.id);
      // The publish gate: draft and rejected rows never ship.
      if (verb.prov.status !== 'auto-checked' && verb.prov.status !== 'reviewed') {
        ctx.addIssue({
          code: 'custom',
          path: ['verbs', i, 'prov', 'status'],
          message: `${verb.id} has status ${verb.prov.status}; only auto-checked or reviewed ship`,
        });
      }
    });
  });
export type GrammarPack = z.infer<typeof GrammarPackSchema>;
