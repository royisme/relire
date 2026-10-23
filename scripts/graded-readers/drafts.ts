/** Owns private reader/input contracts and atomic JSON storage, not linguistic or review gates. */
import { randomUUID } from 'node:crypto';
import { mkdir, rename, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { z } from 'zod';
import { ReaderBodySchema, ReaderGlossaryEntrySchema } from '../../src/types/gradedReader';
import { normalizeLookupToken } from '../../src/services/grammarPack/lookup';
import { repositoryRoot } from '../grammar-topics/reference';

const slug = ReaderGlossaryEntrySchema.shape.id;
const text = z
  .string()
  .min(1)
  .refine(
    (value) => value === value.trim() && value === value.normalize('NFC') && !/\p{Cc}|\p{Cf}|<[^>]*>/u.test(value),
    'Text must be trimmed NFC without controls or HTML',
  );
const hash = text.regex(/^[0-9a-f]{64}$/);
const stage = z.number().int().min(1).max(12);

export const VerbAnalysisSchema = z.discriminatedUnion('kind', [
  z.strictObject({
    kind: z.literal('finite'),
    tense: z.enum(['present', 'imparfait', 'futur', 'conditionnel', 'subjonctif', 'imperatif']),
    person: z.enum(['1sg', '2sg', '3sg', '1pl', '2pl', '3pl']),
  }),
  z.strictObject({ kind: z.literal('infinitive') }),
  z.strictObject({ kind: z.literal('past-participle'), agreement: z.enum(['ms', 'fs', 'mp', 'fp']) }),
  z.strictObject({ kind: z.literal('present-participle') }),
]);
export const AtomAnalysisSchema = z.strictObject({
  targetId: slug,
  ordinal: z.number().int().nonnegative(),
  part: z.number().int().nonnegative(),
  entryId: slug,
  verb: VerbAnalysisSchema.optional(),
});
export const VerbGroupSchema = z.strictObject({
  targetId: slug,
  atomIds: z.array(text).min(1),
  kind: z.enum(['simple', 'modal-infinitive', 'near-future', 'recent-past', 'passeCompose']),
  finiteAtomId: text,
});
export const ReaderDraftSchema = z.strictObject({
  status: z.literal('draft'),
  body: ReaderBodySchema,
  analyses: z.array(AtomAnalysisSchema).min(1),
  verbGroups: z.array(VerbGroupSchema),
  provenance: z.strictObject({
    origin: z.literal('ai-authored'),
    model: text,
    generatedAt: z.iso.date(),
    promptHash: hash,
    syllabusHash: hash,
    dependencyHashes: z.array(z.strictObject({ readerId: slug, contentHash: hash })),
  }),
  issues: z.array(text),
});
export type ReaderDraft = z.infer<typeof ReaderDraftSchema>;
// Provenance belongs to the tool, never the model.
export const ReaderDraftOutputSchema = ReaderDraftSchema.omit({ provenance: true });

const { id: _id, ...entryFields } = ReaderGlossaryEntrySchema.shape;
const candidateEntry = z.strictObject(entryFields).superRefine((entry, ctx) => {
  if ((entry.pos === 'noun') !== (entry.gender !== undefined))
    ctx.addIssue({ code: 'custom', path: ['gender'], message: 'Gender is required exactly for nouns' });
  if (new Set(entry.forms).size !== entry.forms.length)
    ctx.addIssue({ code: 'custom', path: ['forms'], message: 'Forms must be unique' });
});
const coreEntry = z
  .strictObject({
    headword: entryFields.lemma,
    pos: z.literal('function'),
    sense: entryFields.sense,
    forms: entryFields.forms,
    gloss: entryFields.gloss,
  })
  .superRefine((entry, ctx) => {
    if (new Set(entry.forms).size !== entry.forms.length)
      ctx.addIssue({ code: 'custom', path: ['forms'], message: 'Forms must be unique' });
  });

export const CoreSchema = z
  .array(coreEntry)
  .min(1)
  .superRefine((entries, ctx) => {
    const keys = entries.map((entry) => JSON.stringify([entry.pos, normalizeLookupToken(entry.headword), entry.sense]));
    if (new Set(keys).size !== keys.length)
      ctx.addIssue({ code: 'custom', message: 'Core lexical keys must be unique' });
  });
export const CandidatesSchema = z
  .strictObject({
    stage,
    entries: z.array(candidateEntry).min(1),
  })
  .superRefine(({ entries }, ctx) => {
    const keys = entries.map((entry) => JSON.stringify([entry.pos, normalizeLookupToken(entry.lemma), entry.sense]));
    if (new Set(keys).size !== keys.length)
      ctx.addIssue({ code: 'custom', path: ['entries'], message: 'Candidate lexical keys must be unique' });
  });
export type Core = z.infer<typeof CoreSchema>;
export type Candidates = z.infer<typeof CandidatesSchema>;
export const privateDraftDirectory = join(repositoryRoot, '.local/graded-readers');

async function writeJson(file: string, value: unknown): Promise<void> {
  const temporary = `${file}.${randomUUID()}.tmp`;
  try {
    await Bun.write(temporary, JSON.stringify(value, null, 2) + '\n');
    await rename(temporary, file);
  } finally {
    await rm(temporary, { force: true });
  }
}

export async function readDraft(directory: string, order: number): Promise<ReaderDraft | undefined> {
  const file = Bun.file(join(directory, `drafts-${stage.parse(order)}.json`));
  return (await file.exists()) ? ReaderDraftSchema.parse(await file.json()) : undefined;
}
export async function storeDraft(directory: string, order: number, value: ReaderDraft): Promise<void> {
  const draft = ReaderDraftSchema.parse(value);
  stage.parse(order);
  await mkdir(directory, { recursive: true });
  await writeJson(join(directory, `drafts-${order}.json`), draft);
}
export async function readCore(directory: string): Promise<Core> {
  return CoreSchema.parse(await Bun.file(join(directory, 'core.json')).json());
}
export async function storeCore(directory: string, value: Core): Promise<void> {
  const core = CoreSchema.parse(value);
  await mkdir(directory, { recursive: true });
  await writeJson(join(directory, 'core.json'), core);
}
export async function readCandidates(directory: string, order: number): Promise<Candidates> {
  const candidates = CandidatesSchema.parse(
    await Bun.file(join(directory, `candidates-${stage.parse(order)}.json`)).json(),
  );
  if (candidates.stage !== order) throw new Error(`Candidate stage ${candidates.stage} does not match ${order}`);
  return candidates;
}
export async function storeCandidates(directory: string, value: Candidates): Promise<void> {
  const candidates = CandidatesSchema.parse(value);
  await mkdir(directory, { recursive: true });
  await writeJson(join(directory, `candidates-${candidates.stage}.json`), candidates);
}
