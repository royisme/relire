/** Canonical spelling and frozen lookup-context identity; never folds accents or infers lemmas. */
export const vocabularyText = (text: string) =>
  text
    .normalize('NFC')
    .replace(/\p{White_Space}+/gu, ' ')
    .trim();
export const vocabularyKey = (word: string) => vocabularyText(word).replace(/'/g, '’').toLocaleLowerCase('fr');
export const vocabularyId = (key: string) => `word:${key}`;
export interface VocabularySource {
  kind: 'article' | 'unit';
  id: string;
  title: string;
}
export interface VocabularyLookup {
  word: string;
  sentence: string;
  requestLanguage: 'en' | 'zh';
  source?: VocabularySource;
}
export function vocabularyContextKey(lookup: VocabularyLookup): string {
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
