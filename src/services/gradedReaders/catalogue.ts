/** Owns reader catalogue validation and edition hashes shared by local publication and the app, not transport. */
import { z } from 'zod';
import { ReaderBodySchema, PublishedReaderSchema, type PublishedReader } from '../../types/gradedReader';
import { vocabularyHash } from '../vocabulary/book';

const hash = z.string().regex(/^[0-9a-f]{64}$/);
export const ReaderSummarySchema = z.strictObject({
  id: ReaderBodySchema.shape.id,
  order: ReaderBodySchema.shape.order,
  level: ReaderBodySchema.shape.level,
  title: ReaderBodySchema.shape.title,
  version: hash,
  artifactHash: hash,
});
export type ReaderSummary = z.infer<typeof ReaderSummarySchema>;
export const ReaderCatalogueSchema = z
  .strictObject({
    schemaVersion: z.literal(1),
    syllabusVersion: z.string().regex(/^\d+\.\d+\.\d+$/),
    version: hash,
    readers: z.array(ReaderSummarySchema).max(12),
  })
  .superRefine(({ readers }, ctx) => {
    if (
      new Set(readers.map((reader) => reader.id)).size !== readers.length ||
      readers.some((reader, index) => index > 0 && reader.order <= readers[index - 1].order)
    )
      ctx.addIssue({ code: 'custom', message: 'Reader ids must be unique and stages ordered' });
  });
export type ReaderCatalogue = z.infer<typeof ReaderCatalogueSchema>;

export async function validateReaderCatalogue(raw: unknown): Promise<ReaderCatalogue> {
  const catalogue = ReaderCatalogueSchema.parse(raw);
  const { version, ...body } = catalogue;
  if ((await vocabularyHash(body)) !== version) throw new Error('Reader catalogue hash mismatch');
  return catalogue;
}
export async function validatePublishedReader(raw: unknown): Promise<PublishedReader> {
  const reader = PublishedReaderSchema.parse(raw);
  if ((await vocabularyHash(reader.body)) !== reader.version) throw new Error('Reader body hash mismatch');
  return reader;
}
export async function readerSummary(reader: PublishedReader): Promise<ReaderSummary> {
  const { id, order, level, title } = reader.body;
  return { id, order, level, title, version: reader.version, artifactHash: await vocabularyHash(reader) };
}

/** Bundled ids have one authority; conflicting remote editions remain a notice, never replacement prose. */
export function mergeReaderCatalogue(bundled: ReaderSummary[], remote: ReaderSummary[]) {
  const starters = new Map(bundled.map((reader) => [reader.id, reader]));
  return {
    readers: [...bundled, ...remote.filter((reader) => !starters.has(reader.id))],
    conflicts: remote.filter(
      (reader) => starters.has(reader.id) && starters.get(reader.id)!.artifactHash !== reader.artifactHash,
    ),
  };
}
