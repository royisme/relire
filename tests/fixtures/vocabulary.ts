/** Invented TEST-only vocabulary content; never reads a real corpus. */
import type { WordAnalysis } from '../../src/types';
import type {
  VocabularyCandidate,
  VocabularyEntry,
  VocabularyRow,
  VocabularySchedule,
} from '../../src/types/vocabulary';
import { vocabularyId, vocabularyKey } from '../../src/services/vocabulary/identity';
import { vocabularyHash } from '../../src/services/vocabulary/book';
import { assembleVocabularyBook } from '../../scripts/vocabulary/publication';
export const testAnalysis = (word = 'test-mot'): WordAnalysis => ({
  word,
  lemma: word,
  partOfSpeech: 'nom TEST',
  ipa: '/test/',
  phoneticsGuide: 'TEST guide',
  translation: 'TEST meaning',
  usageExamples: [{ fr: 'Une phrase TEST.', zh: '\u6d4b\u8bd5', en: 'A TEST sentence.' }],
});
export const testLookup = (word = 'test-mot') => ({
  word,
  sentence: `Une phrase ${word}.`,
  requestLanguage: 'en' as const,
});
export const testEntry = (word = 'test-mot', position = 0): VocabularyEntry => ({
  key: vocabularyKey(word),
  word,
  position,
  sourceIds: [String(position)],
  senses: [{ gloss: { en: `TEST meaning ${word}`, zh: '\u6d4b\u8bd5' }, examples: [] }],
});
export async function testBook(count = 1, label = 'TEST') {
  const metadata = {
    bookId: 'tcf-7000' as const,
    title: { en: label, zh: '\u6d4b\u8bd5' },
    attribution: 'Invented TEST only',
  };
  const entries = Array.from({ length: count }, (_, index) => testEntry(`test-${index}`, index));
  const contentHash = await vocabularyHash({ metadata, entries });
  return assembleVocabularyBook(
    { metadata, entries, contentHash },
    {
      bookId: 'tcf-7000',
      contentHash,
      reviewedBy: 'Synthetic TEST reviewer',
      reviewedAt: '2026-10-20T12:00:00.000Z',
    },
  );
}
export function testCandidate(word = 'test-mot'): VocabularyCandidate {
  const entry = testEntry(word);
  return {
    key: entry.key,
    word: entry.word,
    bookSource: {
      bookId: 'tcf-7000',
      version: 'a'.repeat(64),
      senses: entry.senses,
      sourceIds: entry.sourceIds,
    },
  };
}
export function testMatureSchedule(now: number): VocabularySchedule {
  return {
    phase: 'review',
    dueAt: now,
    lastReviewedAt: now - 20 * 86400_000,
    stability: 20,
    difficulty: 5,
    elapsedDays: 20,
    scheduledDays: 20,
    learningSteps: 0,
    repetitions: 5,
    lapses: 0,
  };
}
export function testRow(word = 'test-mot'): VocabularyRow {
  return {
    ...testCandidate(word),
    id: vocabularyId(vocabularyKey(word)),
    createdAt: 1,
    bookmarked: false,
    bookmarkedAt: null,
    contexts: [],
    schedule: null,
    introducedAt: null,
    revision: 0,
    history: [],
  };
}
