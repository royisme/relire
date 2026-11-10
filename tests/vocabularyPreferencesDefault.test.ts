/** Preferences saved before studyBook existed still parse, and an explicit studyBook survives parsing. */
import { expect, test } from 'bun:test';
import { VocabularyPreferencesSchema } from '../src/types/vocabulary';

test('preferences without studyBook default to my words', () => {
  const parsed = VocabularyPreferencesSchema.parse({ newPerDay: 10, retentionPercent: 90 });
  expect(parsed.studyBook).toBe('mine');
});

test('an explicit studyBook is kept', () => {
  const parsed = VocabularyPreferencesSchema.parse({ newPerDay: 10, retentionPercent: 90, studyBook: 'builtin' });
  expect(parsed.studyBook).toBe('builtin');
});
