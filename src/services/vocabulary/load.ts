/** Memory-only pinned download, validated and durably cached before a caller can install it. */
import { contentServiceFetch } from '../grammarTopics/service';
import { VocabularyPageSchema } from '../../types/vocabulary';
import { putVocabularyBook } from '../../storage/vocabularyBook';
import { canonicalVocabularyJson, validateVocabularyBook } from './book';
export async function downloadVocabularyBook(onProgress: (page: number, total: number) => void) {
  const first = VocabularyPageSchema.parse(await contentServiceFetch('/v1/vocabulary/tcf-7000?page=0'));
  if (first.page !== 0) throw new Error('Vocabulary page index mismatch');
  const { manifest } = first;
  const entries = [...first.entries];
  const acceptCount = (page: number, count: number) => {
    if (count !== Math.min(manifest.pageSize, manifest.entryCount - page * manifest.pageSize))
      throw new Error('Vocabulary page count mismatch');
  };
  acceptCount(0, first.entries.length);
  onProgress(1, manifest.pageCount);
  for (let page = 1; page < manifest.pageCount; page++) {
    const next = VocabularyPageSchema.parse(
      await contentServiceFetch(`/v1/vocabulary/tcf-7000?page=${page}&version=${manifest.version}`),
    );
    if (next.page !== page || canonicalVocabularyJson(next.manifest) !== canonicalVocabularyJson(manifest))
      throw new Error('Vocabulary pinned manifest or page mismatch');
    acceptCount(page, next.entries.length);
    entries.push(...next.entries);
    onProgress(page + 1, manifest.pageCount);
  }
  const book = await validateVocabularyBook({ manifest, entries });
  await putVocabularyBook(book);
  return book;
}
