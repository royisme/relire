/** Invented TEST-only six-question payload; never shipped or presented as reviewed teaching material. */
import type { GrammarTopic } from '../../src/types/grammarTopic';
import { topicFixture } from './grammarTopics';

export const testBilingual = (en = 'TEST ONLY', zh = '\u6d4b\u8bd5') => ({ en, zh });
const message = (summary: string) => ({ summary: testBilingual(summary), detail: testBilingual('TEST detail') });
export function learningFixture(): GrammarTopic & { learning: NonNullable<GrammarTopic['learning']> } {
  const checkpoint = (id: string): NonNullable<GrammarTopic['learning']>['checkpoints'][number] => ({
    id,
    title: testBilingual(`TEST checkpoint ${id}`, `\u6d4b\u8bd5\u68c0\u67e5\u70b9 ${id}`),
    teaching: [
      { type: 'paragraph' as const, text: testBilingual(`TEST teaching ${id}`, `\u6d4b\u8bd5\u8bb2\u89e3 ${id}`) },
    ],
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

/** A second invented pilot, deliberately unrelated to textbook topic ids or titles. */
export function secondLearningFixture() {
  const topic = learningFixture();
  topic.id = 'test-lantern';
  topic.title = testBilingual('TEST lantern forms', '\u6d4b\u8bd5\u706f\u5149\u8bcd\u5f62');
  topic.blocks = [
    {
      type: 'paragraph',
      heading: testBilingual('TEST lantern reference', '\u6d4b\u8bd5\u706f\u5149\u53c2\u8003'),
      text: testBilingual(
        'TEST invented reference, not teaching material.',
        '\u6d4b\u8bd5\u865a\u6784\u53c2\u8003\u6587\u5b57',
      ),
    },
  ];
  const contexts = [
    ['TEST Le soir, {une lampe|un nuage|des livres} éclaire la table.', 'TEST Le matin, je range [___] sur le bureau.'],
    ['TEST Ici, {une lampe|un nuage|des livres} reste allumée.', 'TEST À midi, nous ouvrons [___] pour écrire.'],
    ['TEST Au fond, {une lampe|un nuage|des livres} brille encore.', 'TEST Après la pause, tu retrouves [___] ici.'],
  ];
  topic.learning.checkpoints.forEach((checkpoint, at) => {
    checkpoint.id = `lantern-${at + 1}`;
    checkpoint.title = testBilingual(
      `TEST lantern checkpoint ${at + 1}`,
      `\u6d4b\u8bd5\u706f\u5149\u68c0\u67e5\u70b9 ${at + 1}`,
    );
    checkpoint.teaching = [
      {
        type: 'paragraph',
        text: testBilingual(
          `TEST invented lantern distinction ${at + 1}`,
          `\u6d4b\u8bd5\u706f\u5149\u8bb2\u89e3 ${at + 1}`,
        ),
      },
    ];
    const [choice, typed] = checkpoint.questions;
    choice.id = `${checkpoint.id}-choice`;
    choice.instruction = testBilingual('TEST choose a phrase', '\u6d4b\u8bd5\u9009\u62e9\u77ed\u8bed');
    choice.prompt = contexts[at][0];
    choice.expectedAnswer = 'une lampe';
    choice.feedback = {
      correct: message('TEST lantern correct'),
      incorrect: message('TEST lantern incorrect'),
      byAnswer: [
        { answer: 'un nuage', message: message('TEST cloud distractor') },
        { answer: 'des livres', message: message('TEST books distractor') },
      ],
    };
    typed.id = `${checkpoint.id}-typed`;
    typed.instruction = testBilingual(
      'TEST include the article',
      '\u6d4b\u8bd5\u586b\u5199\u51a0\u8bcd\u548c\u540d\u8bcd',
    );
    typed.prompt = contexts[at][1];
    typed.expectedAnswer = 'les cahiers';
    typed.acceptableAnswers = ['mes cahiers'];
    typed.feedback = { correct: message('TEST lantern correct'), incorrect: message('TEST lantern typed fallback') };
  });
  return topic;
}

export function referenceOnlyFixture(): GrammarTopic {
  const topic = topicFixture();
  topic.id = 'test-reference';
  topic.title = testBilingual('TEST reference reader', '\u6d4b\u8bd5\u53c2\u8003\u9605\u8bfb');
  topic.blocks[0] = {
    type: 'paragraph',
    heading: testBilingual('TEST reference-only heading', '\u6d4b\u8bd5\u7eaf\u53c2\u8003\u6807\u9898'),
    text: testBilingual(
      'TEST invented reader prose, no questions.',
      '\u6d4b\u8bd5\u9605\u8bfb\u6587\u5b57\uff0c\u6ca1\u6709\u7ec3\u4e60',
    ),
  };
  return topic;
}
