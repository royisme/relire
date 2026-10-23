/** Invented TEST-only reader snapshots; no private reader or live content-service input. */
import type { VocabularyDefinition } from '../../src/types/vocabulary';
import type { VocabularyLookup } from '../../src/services/vocabulary/identity';
import { vocabularyReaderSourceId } from '../../src/services/vocabulary/identity';
export const testReaderDefinition = (): Extract<VocabularyDefinition, { kind: 'reader' }> => ({
  kind: 'reader',
  readerId: 'test-reader',
  version: 'b'.repeat(64),
  entry: {
    id: 'test-noun',
    lemma: 'test-mot',
    pos: 'noun',
    sense: 'test-sense',
    forms: ['test-mots'],
    gloss: { en: 'TEST authored gloss', zh: '\u6d4b\u8bd5\u91ca\u4e49' },
    gender: 'masculine',
  },
  sentenceTranslation: { en: 'TEST authored sentence translation', zh: '\u6d4b\u8bd5\u53e5\u5b50\u7ffb\u8bd1' },
});
export const testReaderLookup = (): VocabularyLookup => ({
  word: 'Test-mots',
  sentence: 'Les Test-mots TEST.',
  requestLanguage: 'en',
  source: {
    kind: 'reader',
    id: vocabularyReaderSourceId('test-reader', 'b'.repeat(64)),
    title: 'TEST reader snapshot title',
  },
});
