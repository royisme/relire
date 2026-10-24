/** Saved reader-dictation provenance and grading/playback policy; no reader loading or exercise preparation. */
import { z } from 'zod';
import { PublishedReaderSchema, ReaderBodySchema, SentenceSchema } from './gradedReader';

export const ReaderDictationMetaSchema = z.strictObject({
  source: z.literal('reader-dictation'),
  readerId: ReaderBodySchema.shape.id,
  version: PublishedReaderSchema.shape.version,
  sentenceId: SentenceSchema.shape.id,
  strictAccents: z.literal(true),
  ignoreSentencePunctuation: z.literal(true),
  playbackEngine: z.literal('device'),
});
