/** Reviewed immutable page assembly and ordered stage/readback/mark/switch protocol; no cross-command transaction fiction. */
import { z } from 'zod';
import {
  VocabularyBookMetadataSchema,
  VocabularyEntrySchema,
  VocabularyHashSchema,
  VocabularyPageSchema,
  type VocabularyBook,
  type VocabularyPage,
} from '../../src/types/vocabulary';
import { vocabularyHash, validateVocabularyBook, canonicalVocabularyJson } from '../../src/services/vocabulary/book';
export async function prepareArtifact(root: URL) {
  const artifact = z
    .object({
      metadata: VocabularyBookMetadataSchema,
      entries: z.array(VocabularyEntrySchema).min(1),
      contentHash: VocabularyHashSchema,
    })
    .parse(await Bun.file(new URL('.local/vocabulary/normalized.json', root)).json());
  if ((await vocabularyHash({ metadata: artifact.metadata, entries: artifact.entries })) !== artifact.contentHash)
    throw new Error('Prepared vocabulary content hash mismatch');
  return artifact;
}
export async function assembleVocabularyBook(
  artifact: Awaited<ReturnType<typeof prepareArtifact>>,
  review: VocabularyBook['manifest']['review'],
) {
  if (review.contentHash !== artifact.contentHash) throw new Error('Vocabulary needs matching review');
  const manifestWithoutVersion = {
    ...artifact.metadata,
    entryCount: artifact.entries.length,
    pageCount: Math.ceil(artifact.entries.length / 250),
    pageSize: 250 as const,
    review,
  };
  const version = await vocabularyHash({ manifestWithoutVersion, entries: artifact.entries });
  return validateVocabularyBook({ manifest: { ...manifestWithoutVersion, version }, entries: artifact.entries });
}
export function vocabularyPages(book: VocabularyBook): VocabularyPage[] {
  return Array.from({ length: book.manifest.pageCount }, (_, page) => ({
    manifest: book.manifest,
    page,
    entries: book.entries.slice(page * 250, (page + 1) * 250),
  }));
}
export const sqlQuote = (value: string) => `'${value.replaceAll("'", "''")}'`;
export interface VocabularyPublishAdapter {
  execute(sql: string): Promise<void>;
  read(sql: string): Promise<Record<string, unknown>[]>;
}
export async function publishVocabularyBook(book: VocabularyBook, adapter: VocabularyPublishAdapter) {
  await validateVocabularyBook(book);
  const { version, bookId } = book.manifest;
  const where = `book_id = ${sqlQuote(bookId)} AND version = ${sqlQuote(version)}`;
  const pages = vocabularyPages(book);
  for (const page of pages) {
    const body = canonicalVocabularyJson(page);
    const [existing] = await adapter.read(`SELECT body FROM vocabulary_pages WHERE ${where} AND page = ${page.page};`);
    if (existing && existing.body !== body) throw new Error('Immutable vocabulary page mismatch');
    await adapter.execute(
      `INSERT OR IGNORE INTO vocabulary_pages (book_id, version, page, body) VALUES (${sqlQuote(bookId)}, ${sqlQuote(version)}, ${page.page}, ${sqlQuote(body)});`,
    );
  }
  const readback = await adapter.read(`SELECT page, body FROM vocabulary_pages WHERE ${where} ORDER BY page;`);
  if (readback.length !== pages.length) throw new Error('Vocabulary stage readback count mismatch');
  const entries: VocabularyBook['entries'] = [];
  for (const [index, row] of readback.entries()) {
    if (row.page !== index || row.body !== canonicalVocabularyJson(pages[index]))
      throw new Error('Vocabulary stage body mismatch');
    const page = VocabularyPageSchema.parse(JSON.parse(row.body as string));
    if (page.page !== index || canonicalVocabularyJson(page.manifest) !== canonicalVocabularyJson(book.manifest))
      throw new Error('Vocabulary stage manifest mismatch');
    entries.push(...page.entries);
  }
  await validateVocabularyBook({ manifest: book.manifest, entries });
  const marker = `vocabularyPublished:${bookId}:${version}`;
  const manifest = canonicalVocabularyJson(book.manifest);
  const [priorMarker] = await adapter.read(`SELECT value FROM meta WHERE key = ${sqlQuote(marker)};`);
  if (priorMarker && priorMarker.value !== manifest) throw new Error('Immutable vocabulary publication mismatch');
  await adapter.execute(`INSERT OR IGNORE INTO meta (key, value) VALUES (${sqlQuote(marker)}, ${sqlQuote(manifest)});`);
  const [marked] = await adapter.read(`SELECT value FROM meta WHERE key = ${sqlQuote(marker)};`);
  if (marked?.value !== manifest) throw new Error('Vocabulary publication marker readback mismatch');
  const pointer = `vocabularyCurrent:${bookId}`;
  await adapter.execute(
    `INSERT INTO meta (key, value) VALUES (${sqlQuote(pointer)}, ${sqlQuote(version)}) ON CONFLICT(key) DO UPDATE SET value = excluded.value;`,
  );
  const [current] = await adapter.read(`SELECT value FROM meta WHERE key = ${sqlQuote(pointer)};`);
  if (current?.value !== version) throw new Error('Vocabulary current pointer readback mismatch');
}
