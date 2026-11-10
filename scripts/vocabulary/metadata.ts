/** Public vocabulary metadata only; private artifacts, source paths and decisions never belong here. */
import { z } from 'zod';
import { VocabularyBookMetadataSchema, VocabularyHashSchema, VocabularyReviewSchema } from '../../src/types/vocabulary';
export const PublicVocabularyManifestSchema = VocabularyBookMetadataSchema.extend({
  contentHash: VocabularyHashSchema.nullable(),
});
export const PublicVocabularyReviewsSchema = z.strictObject({ records: z.array(VocabularyReviewSchema) });
export function checkVocabularyMetadata(rawManifest: unknown, rawReviews: unknown) {
  const manifest = PublicVocabularyManifestSchema.parse(rawManifest);
  const reviews = PublicVocabularyReviewsSchema.parse(rawReviews);
  if (reviews.records.some((r) => r.bookId !== manifest.bookId)) throw new Error('Unknown reviewed book');
  return { manifest, reviews };
}
export const vocabularyRepository = new URL('../../', import.meta.url);
