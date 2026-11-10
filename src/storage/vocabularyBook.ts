/** One complete, validated content cache; unlike disposable answer caching, a commit failure propagates. */
import { validateVocabularyBook } from '../services/vocabulary/book';
import type { VocabularyBook } from '../types/vocabulary';
import { db } from './db';
const key = 'content:vocabulary:tcf-7000';
const ttl = 365 * 24 * 60 * 60 * 1000;
export async function getVocabularyBook(now = Date.now()): Promise<VocabularyBook | undefined> {
  const entry = await (await db()).get('cache', key);
  if (!entry || now - entry.createdAt > ttl) return undefined;
  return validateVocabularyBook(entry.value);
}
export async function putVocabularyBook(book: VocabularyBook, now = Date.now()) {
  const validated = await validateVocabularyBook(book);
  const tx = (await db()).transaction('cache', 'readwrite');
  try {
    await tx.store.put({ key, kind: 'content', value: validated, createdAt: now });
    await tx.done;
  } catch (error) {
    await tx.done.catch(() => undefined);
    throw error;
  }
}
