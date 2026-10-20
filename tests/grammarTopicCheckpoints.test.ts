/** Owns TEST-only checkpoint boundary, revision, mapping and deterministic grading assertions. */
import { expect, test } from 'bun:test';
import { createHash } from 'node:crypto';
import { GrammarTopicSchema } from '../src/types/grammarTopic';
import { ExerciseUnitSchema } from '../src/types/exercises';
import {
  serializeTopicLearning,
  topicExerciseRevision,
  topicToExerciseUnit,
} from '../src/services/grammarTopics/checkpoints';
import { emptyAnswer } from '../src/services/exercises/answer';
import { gradeUnitItem } from '../src/services/exercises/grading';
import { learningFixture, testBilingual } from './fixtures/grammarLearning';

test('complete 3x2 payload maps a validated self-contained unit and shares browser/tooling hash bytes', async () => {
  const topic = learningFixture();
  const revision = await topicExerciseRevision(topic);
  expect(revision).toBe(createHash('sha256').update(serializeTopicLearning(topic), 'utf8').digest('hex'));
  const unit = topicToExerciseUnit(topic, revision, 123);
  expect(ExerciseUnitSchema.parse(unit)).toEqual(unit);
  expect(unit.id).toBe(`topic:${topic.id}:${revision}`);
  expect(unit.setId).toBe(unit.id);
  expect(unit.items).toHaveLength(6);
  expect(unit.items.map((item) => item.itemNumber)).toEqual([1, 2, 3, 4, 5, 6]);
  expect(unit.items[0].topicQuestion?.feedback).toEqual(topic.learning.checkpoints[0].questions[0].feedback);
  for (const item of unit.items) {
    expect(item.meta?.strictAccents).toBe(true);
    expect(item.explanation).toBeUndefined();
    expect(item.answerSource).toBeUndefined();
    const answer = emptyAnswer(item);
    answer.singleAnswer = String(item.expectedAnswer);
    answer.choiceSelections = [String(item.expectedAnswer)];
    expect(gradeUnitItem(unit, item, answer, { strictAccents: false })).toMatchObject({
      status: 'graded',
      correct: true,
    });
    answer.singleAnswer = 'ecole';
    answer.choiceSelections = ['ete'];
    expect(gradeUnitItem(unit, item, answer, { strictAccents: false })).toMatchObject({
      status: 'graded',
      correct: false,
    });
  }
  const typed = unit.items[1];
  expect(
    gradeUnitItem(unit, typed, { ...emptyAnswer(typed), singleAnswer: ' COLLÈGE ' }, { strictAccents: false }),
  ).toMatchObject({ status: 'graded', correct: true });
});

test('identity includes all learning/title/level/tags but excludes unrelated reference/provenance', async () => {
  const original = learningFixture();
  const hash = await topicExerciseRevision(original);
  const changes: ((topic: ReturnType<typeof learningFixture>) => void)[] = [
    (t) => {
      t.title.en += ' edited';
    },
    (t) => {
      t.level = 'A2';
    },
    (t) => {
      t.tags = ['present'];
    },
    (t) => {
      t.learning.instruction.en += ' edited';
    },
    (t) => {
      t.learning.checkpoints.reverse();
    },
    (t) => {
      t.learning.checkpoints[0].title.en += ' edited';
    },
    (t) => {
      t.learning.checkpoints[0].teaching[0] = { type: 'note', text: testBilingual('TEST edit') };
    },
    (t) => {
      t.learning.checkpoints[0].questions[1].prompt += ' TEST';
    },
    (t) => {
      t.learning.checkpoints[0].questions[1].instruction.en += ' edited';
    },
    (t) => {
      t.learning.checkpoints[0].questions[1].expectedAnswer = 'lycée';
    },
    (t) => {
      t.learning.checkpoints[0].questions[1].acceptableAnswers = ['lycée'];
    },
    (t) => {
      t.learning.checkpoints[0].questions[0].feedback.correct.summary.en += ' edited';
    },
    (t) => {
      t.learning.checkpoints[0].questions[0].feedback.byAnswer![0].message.detail!.en += ' edited';
    },
  ];
  for (const change of changes) {
    const topic = learningFixture();
    change(topic);
    expect(await topicExerciseRevision(topic)).not.toBe(hash);
  }
  original.blocks.push({ type: 'note', text: testBilingual('TEST reference edit') });
  original.provenance.model += ' changed';
  original.related = ['other-test'];
  expect(await topicExerciseRevision(original)).toBe(hash);
  const reordered = Object.fromEntries(Object.entries(original).reverse());
  expect(serializeTopicLearning(reordered as typeof original)).toBe(serializeTopicLearning(original));
});

const invalid: [string, (topic: ReturnType<typeof learningFixture>) => void][] = [
  [
    'extra checkpoint',
    (t) => {
      Object.assign(t.learning.checkpoints, { 3: t.learning.checkpoints[0] });
    },
  ],
  [
    'extra question',
    (t) => {
      Object.assign(t.learning.checkpoints[0].questions, { 2: t.learning.checkpoints[0].questions[0] });
    },
  ],
  [
    'empty teaching',
    (t) => {
      t.learning.checkpoints[0].teaching = [];
    },
  ],
  [
    'missing feedback translation',
    (t) => {
      Object.assign(t.learning.checkpoints[0].questions[0].feedback.correct.summary, { zh: undefined });
    },
  ],
  [
    'invalid teaching table',
    (t) => {
      t.learning.checkpoints[0].teaching = [
        { type: 'table', header: [{ fr: 'TEST' }], rows: [[{ fr: 'TEST' }, { fr: 'TEST' }]] },
      ];
    },
  ],
  [
    'mixed teaching speakers',
    (t) => {
      t.learning.checkpoints[0].teaching = [
        {
          type: 'examples',
          items: [
            { fr: 'TEST', ...testBilingual(), speaker: 'A' },
            { fr: 'TEST', ...testBilingual() },
          ],
        },
      ];
    },
  ],
  [
    'straight prompt apostrophe',
    (t) => {
      t.learning.checkpoints[0].questions[1].prompt = 'TEST l’école [___]'.replace('’', "'");
    },
  ],
  [
    'duplicate typed feedback matches',
    (t) => {
      const message = t.learning.checkpoints[0].questions[1].feedback.incorrect;
      t.learning.checkpoints[0].questions[1].feedback.byAnswer = [
        { answer: 'TEST', message },
        { answer: ' test ', message },
      ];
    },
  ],
  [
    'fewer checkpoints',
    (t) => {
      t.learning.checkpoints.pop();
    },
  ],
  [
    'fewer questions',
    (t) => {
      t.learning.checkpoints[0].questions.pop();
    },
  ],
  [
    'duplicate checkpoints',
    (t) => {
      t.learning.checkpoints[1].id = 'one';
    },
  ],
  [
    'duplicate questions',
    (t) => {
      t.learning.checkpoints[1].questions[0].id = 'one-choice';
    },
  ],
  [
    'wrong order',
    (t) => {
      t.learning.checkpoints[0].questions.reverse();
    },
  ],
  [
    'two choice groups',
    (t) => {
      t.learning.checkpoints[0].questions[0].prompt += ' {a|b}';
    },
  ],
  [
    'bracket choices',
    (t) => {
      t.learning.checkpoints[0].questions[0].prompt = 'TEST [été|hiver]';
    },
  ],
  [
    'empty option',
    (t) => {
      t.learning.checkpoints[0].questions[0].prompt = 'TEST {été| }';
    },
  ],
  [
    'duplicate options',
    (t) => {
      t.learning.checkpoints[0].questions[0].prompt = 'TEST {été| ÉTÉ }';
    },
  ],
  [
    'bad expected option',
    (t) => {
      t.learning.checkpoints[0].questions[0].expectedAnswer = 'autre';
    },
  ],
  [
    'choice variants',
    (t) => {
      t.learning.checkpoints[0].questions[0].acceptableAnswers = ['TEST'];
    },
  ],
  [
    'missing distractor feedback',
    (t) => {
      delete t.learning.checkpoints[0].questions[0].feedback.byAnswer;
    },
  ],
  [
    'incomplete distractor feedback',
    (t) => {
      t.learning.checkpoints[0].questions[0].feedback.byAnswer!.pop();
    },
  ],
  [
    'correct answer feedback match',
    (t) => {
      t.learning.checkpoints[0].questions[0].feedback.byAnswer![0].answer = 'été';
    },
  ],
  [
    'unknown feedback match',
    (t) => {
      t.learning.checkpoints[0].questions[0].feedback.byAnswer![0].answer = 'autre';
    },
  ],
  [
    'duplicate feedback match',
    (t) => {
      t.learning.checkpoints[0].questions[0].feedback.byAnswer![1].answer = ' HIVER ';
    },
  ],
  [
    'no blank',
    (t) => {
      t.learning.checkpoints[0].questions[1].prompt = 'TEST';
    },
  ],
  [
    'two blanks',
    (t) => {
      t.learning.checkpoints[0].questions[1].prompt += ' [___]';
    },
  ],
  [
    'normalized accepted collision',
    (t) => {
      t.learning.checkpoints[0].questions[1].acceptableAnswers = [' ÉCOLE '];
    },
  ],
  [
    'English Han',
    (t) => {
      t.learning.instruction.en = '\u6d4b';
    },
  ],
  [
    'Chinese without Han',
    (t) => {
      t.learning.instruction.zh = 'TEST';
    },
  ],
  [
    'blank translation',
    (t) => {
      t.learning.checkpoints[0].title.zh = '';
    },
  ],
  [
    'French Han',
    (t) => {
      t.learning.checkpoints[0].questions[1].prompt = '\u6d4b [___]';
    },
  ],
  [
    'answer Han',
    (t) => {
      t.learning.checkpoints[0].questions[1].acceptableAnswers = ['\u6d4b'];
    },
  ],
  [
    'non NFC',
    (t) => {
      t.learning.checkpoints[0].questions[1].expectedAnswer = 'e\u0301cole';
    },
  ],
  [
    'straight apostrophe',
    (t) => {
      t.learning.checkpoints[0].questions[1].expectedAnswer = "l'école";
    },
  ],
  [
    'too many examples',
    (t) => {
      t.learning.checkpoints[0].teaching = [
        { type: 'examples', items: [1, 2, 3].map(() => ({ fr: 'TEST', ...testBilingual() })) },
      ];
    },
  ],
];
for (const [name, corrupt] of invalid)
  test(`rejects ${name}`, () => {
    const topic = learningFixture();
    corrupt(topic);
    expect(GrammarTopicSchema.safeParse(topic).success).toBe(false);
  });

test('unsupported type, non-scalar key, missing translation and empty learning reject at the boundary', () => {
  for (const replacement of [{ type: 'OPEN_QA' }, { expectedAnswer: ['école'] }, { instruction: { en: 'TEST' } }]) {
    const topic = learningFixture();
    Object.assign(topic.learning.checkpoints[0].questions[1], replacement);
    expect(GrammarTopicSchema.safeParse(topic).success).toBe(false);
  }
  expect(GrammarTopicSchema.safeParse({ ...learningFixture(), learning: {} }).success).toBe(false);
});

test('saved unit metadata is paired and malformed topic capabilities cannot become ordinary worksheets', async () => {
  const topic = learningFixture();
  const unit = topicToExerciseUnit(topic, await topicExerciseRevision(topic), 123);
  const corruptions = [
    (u: typeof unit) => {
      delete u.topicOrigin;
      u.items.forEach((item) => {
        delete item.topicQuestion;
      });
    },
    (u: typeof unit) => {
      u.items[0].id = 'not a slug';
    },
    (u: typeof unit) => {
      u.items[1].topicQuestion!.checkpointTitle.en += ' different';
    },
    (u: typeof unit) => {
      delete u.topicOrigin;
    },
    (u: typeof unit) => {
      delete u.items[0].topicQuestion;
    },
    (u: typeof unit) => {
      u.setId = 'other';
    },
    (u: typeof unit) => {
      u.id += 'x';
    },
    (u: typeof unit) => {
      u.items[0].meta = {};
    },
    (u: typeof unit) => {
      u.items[0].type = 'OPEN_QA';
    },
    (u: typeof unit) => {
      u.items[0].expectedAnswer = ['été'];
    },
    (u: typeof unit) => {
      u.items.pop();
    },
  ];
  for (const corrupt of corruptions) {
    const probe = structuredClone(unit);
    corrupt(probe);
    expect(ExerciseUnitSchema.safeParse(probe).success).toBe(false);
  }
});
