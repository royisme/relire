/** Private review sheet and explicit hash-bound reviewer marking; never claims automatic linguistic approval. */
import { prepareArtifact } from './publication';
import { checkVocabularyMetadata, vocabularyRepository } from './metadata';
export async function review(args: string[], root = vocabularyRepository) {
  if (
    !(args.length === 1 && args[0] === 'print') &&
    !(args.length === 3 && args[0] === 'mark' && args[1] === '--by' && args[2].trim())
  )
    throw new Error('Usage: review.ts print | mark --by <actual authorized reviewer>');
  const artifact = await prepareArtifact(root);
  if (args[0] === 'print') {
    console.log(await Bun.file(new URL('.local/vocabulary/review-sheet.txt', root)).text());
    return;
  }
  const { manifest, reviews } = checkVocabularyMetadata(
    await Bun.file(new URL('data/vocabulary/manifest.json', root)).json(),
    await Bun.file(new URL('data/vocabulary/reviews.json', root)).json(),
  );
  if (manifest.contentHash !== artifact.contentHash) throw new Error('Prepared content changed; prepare again');
  reviews.records = reviews.records.filter((r) => r.contentHash !== artifact.contentHash);
  reviews.records.push({
    bookId: 'tcf-7000',
    contentHash: artifact.contentHash,
    reviewedBy: args[2].trim(),
    reviewedAt: new Date().toISOString(),
  });
  await Bun.write(new URL('data/vocabulary/reviews.json', root), JSON.stringify(reviews, null, 2) + '\n');
  console.log('Recorded explicit vocabulary review');
}
if (import.meta.main) {
  try {
    await review(Bun.argv.slice(2));
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
