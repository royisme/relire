/** Invented TEST-only six-question payload; never shipped or presented as reviewed teaching material. */
import type { GrammarTopic } from '../../src/types/grammarTopic';
import { topicFixture } from './grammarTopics';

export const testBilingual = (en = 'TEST ONLY') => ({ en, zh: '\u6d4b\u8bd5' });
const message = (summary: string) => ({ summary: testBilingual(summary), detail: testBilingual('TEST detail') });
export function learningFixture(): GrammarTopic & { learning: NonNullable<GrammarTopic['learning']> } {
  const checkpoint = (id: string): NonNullable<GrammarTopic['learning']>['checkpoints'][number] => ({
    id,
    title: testBilingual(`TEST checkpoint ${id}`),
    teaching: [{ type: 'paragraph' as const, text: testBilingual('TEST teaching') }],
    questions: [
      {
        id: `${id}-choice`,
        type: 'CHOICE_SELECT' as const,
        instruction: testBilingual('TEST choose'),
        prompt: 'TEST {été|hiver|printemps}',
        expectedAnswer: 'été',
        feedback: {
          correct: message('TEST correct'),
          incorrect: message('TEST incorrect'),
          byAnswer: [
            { answer: 'hiver', message: message('TEST winter distractor') },
            { answer: 'printemps', message: message('TEST spring distractor') },
          ],
        },
      },
      {
        id: `${id}-typed`,
        type: 'FILL_BLANKS' as const,
        instruction: testBilingual('TEST omit the article'),
        prompt: 'TEST [___]',
        expectedAnswer: 'école',
        acceptableAnswers: ['collège'],
        feedback: { correct: message('TEST correct'), incorrect: message('TEST typed fallback') },
      },
    ],
  });
  // A fresh mutable payload lets each test corrupt one independent boundary.
  return structuredClone({
    ...topicFixture(),
    learning: {
      instruction: testBilingual('TEST learning'),
      checkpoints: [checkpoint('one'), checkpoint('two'), checkpoint('three')],
    },
  });
}
