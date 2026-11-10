/** Canonical SHA-256 vocabulary artifacts and complete-book invariant validation, shared with private tooling. */
import { VocabularyBookSchema, type VocabularyBook, type VocabularyManifest } from '../../types/vocabulary';
const codePointOrder = (a: string, b: string) => {
  const left = Array.from(a, (c) => c.codePointAt(0)!);
  const right = Array.from(b, (c) => c.codePointAt(0)!);
  for (let i = 0; i < Math.min(left.length, right.length); i++) if (left[i] !== right[i]) return left[i] - right[i];
  return left.length - right.length;
};
export function canonicalVocabularyJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalVocabularyJson).join(',')}]`;
  if (value !== null && typeof value === 'object')
    return `{${Object.keys(value)
      .sort(codePointOrder)
      .map((key) => `${JSON.stringify(key)}:${canonicalVocabularyJson((value as Record<string, unknown>)[key])}`)
      .join(',')}}`;
  const json = JSON.stringify(value);
  if (json === undefined) throw new Error('Non-JSON vocabulary value');
  return json;
}
export async function vocabularyHash(value: unknown): Promise<string> {
  const bytes = new TextEncoder().encode(canonicalVocabularyJson(value));
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}
export function vocabularyMetadata(manifest: Omit<VocabularyManifest, 'version'>) {
  return { bookId: manifest.bookId, title: manifest.title };
}
export async function validateVocabularyBook(raw: unknown): Promise<VocabularyBook> {
  const book = VocabularyBookSchema.parse(raw);
  const { version, ...manifestWithoutVersion } = book.manifest;
  if (book.entries.length !== book.manifest.entryCount) throw new Error('Vocabulary entry count mismatch');
  const keys = new Set<string>();
  let position = -1;
  for (const entry of book.entries) {
    if (keys.has(entry.key) || entry.position <= position) throw new Error('Vocabulary key or order mismatch');
    keys.add(entry.key);
    position = entry.position;
  }
  if (
    (await vocabularyHash({ metadata: vocabularyMetadata(manifestWithoutVersion), entries: book.entries })) !==
    book.manifest.review.contentHash
  )
    throw new Error('Vocabulary content hash mismatch');
  if ((await vocabularyHash({ manifestWithoutVersion, entries: book.entries })) !== version)
    throw new Error('Vocabulary served version mismatch');
  return book;
}
