/** Invented TEST-only six-question payload; never shipped or presented as reviewed teaching material. */
import type { GrammarTopic } from '../../src/types/grammarTopic';
import { topicFixture } from './grammarTopics';

export const testBilingual = (en = 'TEST ONLY', zh = '\u6d4b\u8bd5') => ({ en, zh });
const message = (summary: string) => ({ summary: testBilingual(summary), detail: testBilingual('TEST detail') });
export function learningFixture(): GrammarTopic & { learning: NonNullable<GrammarTopic['learning']> } {
  const checkpoint = (id: string): NonNullable<GrammarTopic['learning']>['checkpoints'][number] => ({
    id,
    title: testBilingual(`TEST checkpoint ${id}`, `\u6d4b\u8bd5\u68c0\u67e5\u70b9 ${id}`),
    teaching: [{ type: 'paragraph' as const, text: testBilingual('TEST teaching') }],
    questions: [
      {
        id: `${id}-choice`,
        type: 'CHOICE_SELECT' as const,
        instruction: testBilingual('TEST choose', '\u6d4b\u8bd5\u9009\u62e9\u8bf4\u660e'),
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
        instruction: testBilingual('TEST omit the article', '\u6d4b\u8bd5\u586b\u7a7a\u8bf4\u660e'),
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
    title: testBilingual('TEST topic title', '\u6d4b\u8bd5\u4e3b\u9898'),
    learning: {
      instruction: testBilingual('TEST learning', '\u6d4b\u8bd5\u5b66\u4e60\u8bf4\u660e'),
      checkpoints: [checkpoint('one'), checkpoint('two'), checkpoint('three')],
    },
  });
}
