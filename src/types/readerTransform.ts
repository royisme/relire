/** Saved reader-transformation provenance; no reader loading, rule or exercise preparation. */
import { z } from 'zod';
import { PublishedReaderSchema, ReaderBodySchema, SentenceSchema } from './gradedReader';

/** The kinds version 1 computes by rule; each is keyless and skips a sentence it cannot cover. */
export const ReaderTransformKindSchema = z.enum(['negation', 'number', 'question']);
export type ReaderTransformKind = z.infer<typeof ReaderTransformKindSchema>;
export const READER_TRANSFORM_KINDS = ReaderTransformKindSchema.options;

export const ReaderTransformMetaSchema = z.strictObject({
  source: z.literal('reader-transform'),
  readerId: ReaderBodySchema.shape.id,
  version: PublishedReaderSchema.shape.version,
  sentenceId: SentenceSchema.shape.id,
  kind: ReaderTransformKindSchema,
  ignoreSentencePunctuation: z.literal(true),
});
