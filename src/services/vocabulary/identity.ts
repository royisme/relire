/** Canonical spelling and frozen lookup-context identity; never folds accents or infers lemmas. */
import type { TokenBinding } from '../../types/gradedReader';
export const vocabularyText = (text: string) =>
  text
    .normalize('NFC')
    .replace(/\p{White_Space}+/gu, ' ')
    .trim();
export const vocabularyKey = (word: string) => vocabularyText(word).replace(/'/g, '’').toLocaleLowerCase('fr');
export const vocabularyId = (key: string) => `word:${key}`;
export const vocabularyReaderSourceId = (readerId: string, bodyVersion: string) =>
  JSON.stringify([readerId, bodyVersion]);
export type VocabularySource =
  | { kind: 'article' | 'unit' | 'reader'; id: string; title: string }
  | { kind: 'import'; id: string; title: string; noteId: string };
export interface VocabularyLookup {
  word: string;
  sentence: string;
  requestLanguage: 'en' | 'zh';
  source?: VocabularySource;
  /** Transient authored occurrence proof for a clicked whole token or elided part not listed in forms. */
  binding?: TokenBinding;
}
export function vocabularyContextKey(lookup: Omit<VocabularyLookup, 'word' | 'binding'>): string {
  if (lookup.source?.kind === 'import') return JSON.stringify(['import', lookup.source.id, lookup.source.noteId]);
  return JSON.stringify([
    lookup.source?.kind ?? null,
    lookup.source?.id ?? null,
    vocabularyText(lookup.sentence),
    lookup.requestLanguage,
  ]);
}
export type VocabularyWordLookup = (
  word: string,
  sentence: string,
  context?: string,
  source?: VocabularySource,
) => void;
