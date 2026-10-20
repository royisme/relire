/** Private stable-snapshot normalization with recorded corrections/omissions; never infers language quality or C1. */
import { z } from 'zod';
import { vocabularyKey, vocabularyText } from '../../src/services/vocabulary/identity';
import { vocabularyHash, canonicalVocabularyJson } from '../../src/services/vocabulary/book';
import { VocabularyBookMetadataSchema, VocabularyEntrySchema, type VocabularyEntry } from '../../src/types/vocabulary';
const SourceRowSchema = z.object({
  id: z.union([z.string().min(1), z.number().int()]),
  word: z.string().min(1),
  pos: z.string(),
  gloss: z.string(),
  gloss_en: z.string(),
  tags: z.array(z.string()).optional(),
  example: z.object({ fr: z.string().optional(), en: z.string().optional(), zh: z.string().optional() }).optional(),
});
const PatchSchema = SourceRowSchema.omit({ id: true, tags: true }).partial().strict();
export const VocabularyDecisionsSchema = z.strictObject({
  corrections: z.array(z.strictObject({ sourceId: z.string(), reason: z.string().min(1), patch: PatchSchema })),
  omissions: z.array(
    z.discriminatedUnion('kind', [
      z.strictObject({ kind: z.literal('entry'), key: z.string(), reason: z.string().min(1) }),
      z.strictObject({ kind: z.enum(['sense', 'example']), sourceId: z.string(), reason: z.string().min(1) }),
    ]),
  ),
});
export const EMPTY_VOCABULARY_DECISIONS = { corrections: [], omissions: [] };
const french = (s: string) => vocabularyText(s).replace(/'/g, '’');
export async function prepareVocabulary(raw: unknown, rawMetadata: unknown, rawDecisions: unknown) {
  const source = z.array(SourceRowSchema).parse(raw);
  const metadata = VocabularyBookMetadataSchema.parse(rawMetadata);
  const decisions = VocabularyDecisionsSchema.parse(rawDecisions);
  const ids = new Set(source.map((row) => String(row.id)));
  if (ids.size !== source.length) throw new Error('Duplicate source id');
  const patched = source.map((row) => ({ ...row, id: String(row.id) }));
  const corrected = new Set<string>();
  for (const correction of decisions.corrections) {
    if (!ids.has(correction.sourceId) || corrected.has(correction.sourceId))
      throw new Error('Unknown or duplicate correction');
    const index = patched.findIndex((row) => row.id === correction.sourceId);
    patched[index] = { ...patched[index], ...correction.patch };
    corrected.add(correction.sourceId);
  }
  const keys = new Set(patched.map((row) => vocabularyKey(row.word)));
  const omissions = new Set<string>();
  for (const omission of decisions.omissions) {
    const identity = omission.kind === 'entry' ? `entry:${omission.key}` : `${omission.kind}:${omission.sourceId}`;
    if (omissions.has(identity) || (omission.kind === 'entry' ? !keys.has(omission.key) : !ids.has(omission.sourceId)))
      throw new Error('Unknown or duplicate omission');
    omissions.add(identity);
  }
  const report = {
    qualityBasis: 'after-recorded-corrections-before-omissions',
    sourceRows: source.length,
    canonicalGroups: keys.size,
    entries: 0,
    corrections: corrected.size,
    missingPos: 0,
    missingExamples: 0,
    partialExamples: 0,
    conflictingSenses: 0,
    omittedEntries: 0,
    omittedSenses: 0,
    omittedExamples: 0,
    issues: [] as string[],
  };
  const grouped = new Map<string, VocabularyEntry>();
  const omittedEntries = new Set<string>();
  for (const [position, row] of patched.entries()) {
    const key = vocabularyKey(row.word);
    const pos = vocabularyText(row.pos);
    const fields = row.example ? [row.example.fr, row.example.en, row.example.zh].map((s) => s?.trim() ?? '') : [];
    const partial = fields.some(Boolean) && !fields.every(Boolean);
    if (!pos) {
      report.missingPos++;
      report.issues.push(`${row.id}: missing POS`);
    }
    if (!fields.some(Boolean)) report.missingExamples++;
    if (partial) {
      report.partialExamples++;
      report.issues.push(`${row.id}: partial example`);
    }
    if (omissions.has(`entry:${key}`)) {
      omittedEntries.add(key);
      continue;
    }
    if (omissions.has(`sense:${row.id}`)) {
      report.omittedSenses++;
      continue;
    }
    const omitExample = omissions.has(`example:${row.id}`);
    if (omitExample) {
      if (!fields.some(Boolean)) throw new Error(`${row.id}: cannot omit absent example`);
      report.omittedExamples++;
    }
    if (partial && !omitExample) throw new Error(`${row.id}: partial example requires recorded omission or correction`);
    const sense = {
      ...(pos ? { pos } : {}),
      gloss: { en: vocabularyText(row.gloss_en), zh: vocabularyText(row.gloss) },
      examples:
        fields.every(Boolean) && fields.length && !omitExample
          ? [
              {
                fr: french(row.example!.fr!),
                en: vocabularyText(row.example!.en!),
                zh: vocabularyText(row.example!.zh!),
              },
            ]
          : [],
    };
    let entry = grouped.get(key);
    if (!entry) {
      entry = { key, word: french(row.word), position, sourceIds: [], senses: [] };
      grouped.set(key, entry);
    }
    entry.sourceIds.push(row.id);
    const same = entry.senses.find(
      (s) => s.pos === sense.pos && canonicalVocabularyJson(s.gloss) === canonicalVocabularyJson(sense.gloss),
    );
    if (same) {
      for (const example of sense.examples)
        if (!same.examples.some((old) => canonicalVocabularyJson(old) === canonicalVocabularyJson(example)))
          same.examples.push(example);
    } else entry.senses.push(sense);
  }
  const entries = [...grouped.values()].map((entry) => VocabularyEntrySchema.parse(entry));
  report.entries = entries.length;
  report.omittedEntries = omittedEntries.size;
  report.conflictingSenses = entries.filter((entry) => entry.senses.length > 1).length;
  for (const entry of entries)
    if (entry.senses.length > 1) report.issues.push(`${entry.key}: conflicting/distinct senses retained for review`);
  if (!entries.length) throw new Error('No publishable entries after omissions');
  return { metadata, entries, contentHash: await vocabularyHash({ metadata, entries }), report };
}
