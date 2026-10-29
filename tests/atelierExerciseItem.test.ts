/** Exercise mapping, replay, metadata boundary and real deterministic grading; hand-written French only. */
import { expect, test } from 'bun:test';
import { joinBricks } from '../src/services/atelier/join';
import { toExerciseItem } from '../src/services/atelier/toExerciseItem';
import { emptyAnswer } from '../src/services/exercises/answer';
import { DEFAULT_GRADING, gradeItem } from '../src/services/exercises/grading';
import { AtelierMetaSchema, type AtelierItem } from '../src/types/atelier';
import { ExerciseUnitSchema } from '../src/types/exercises';
import { beach, cinema, coffee, negative } from './fixtures/atelier';
import { unitOf } from './fixtures/units';

const context = {
  id: 'TEST-atelier-1',
  itemNumber: 1,
  themeId: 'leisure',
  subtopicId: 'cinema-screen-media',
  taskId: 'oral-1',
  level: 'A2',
  language: 'en',
} as const;

const negativeItem: AtelierItem = {
  ...structuredClone(beach),
  meaning: { zh: '我们不去海滩。', en: 'We are not going to the beach.' },
  sentence: 'Nous n’allons pas à la plage.',
  variants: [],
  bricks: negative.bricks,
  frame: { verb: 2, sockets: [{ label: 'à + nom', filledBy: [4, 5, 6] }] },
  explanation: { zh: 'ne 在元音前省音为 n’。', en: 'Ne elides to n’ before a vowel.' },
  grammarTag: 'negation',
  modify: undefined,
};

const CASES = [
  {
    source: beach,
    expected: 'Nous allons à la plage.',
    variants: ['À la plage nous allons.'],
    options: ['Nous', 'allons', 'à', 'la', 'plage.', 'au'],
  },
  {
    source: coffee,
    expected: 'J’aime le café.',
    variants: [],
    options: ['J’aime', 'le', 'café.', 'du'],
  },
  {
    source: negativeItem,
    expected: 'Nous n’allons pas à la plage.',
    variants: [],
    options: ['Nous', 'n’allons', 'pas', 'à', 'la', 'plage.', 'au'],
  },
  {
    source: cinema,
    expected: 'Je vais au cinéma.',
    variants: [],
    options: ['Je', 'vais', 'au', 'cinéma.', 'en'],
  },
];

for (const { source, expected, variants, options } of CASES) {
  for (const language of ['zh', 'en'] as const) {
    test(`${expected} maps to a sentence build with ${language} meaning, explanation and complete metadata`, () => {
      const item = toExerciseItem(structuredClone(source), { ...context, language });
      expect(item).toMatchObject({
        id: 'TEST-atelier-1',
        itemNumber: 1,
        type: 'SENTENCE_BUILD',
        prompt: source.meaning[language],
        expectedAnswer: expected,
        acceptableAnswers: variants,
        options,
        explanation: source.explanation[language],
        answerSource: 'ai',
        grammarTag: source.grammarTag,
      });
      expect(item.expectedAnswer).toBe(joinBricks(source.bricks));
      expect(AtelierMetaSchema.parse(item.meta)).toEqual({
        source: 'atelier',
        themeId: 'leisure',
        subtopicId: 'cinema-screen-media',
        taskId: 'oral-1',
        level: 'A2',
        bricks: source.bricks,
        distractors: source.distractors,
        frame: source.frame,
        explanation: source.explanation,
        modify: source.modify,
      });
    });
  }

  test(`${expected} replays from its options tiles with a single space`, () => {
    const item = toExerciseItem(structuredClone(source), context);
    const answerTileCount = options.length - 1;
    const placed = item.options!.slice(0, answerTileCount);
    expect(placed.join(' ')).toBe(expected);
    expect(item.expectedAnswer).toBe(placed.join(' '));
  });

  test(`${expected} is correct through the real grader`, () => {
    const item = toExerciseItem(structuredClone(source), context);
    const answer = { ...emptyAnswer(item), singleAnswer: expected };
    expect(gradeItem('SENTENCE_BUILD', item, answer, DEFAULT_GRADING)).toEqual({
      status: 'graded',
      correct: true,
      recordedAnswer: expected,
    });
  });
}

test('expectedAnswer comes from bricks even when the supplied sentence uses straight apostrophes', () => {
  const source = structuredClone(coffee);
  source.sentence = "J'aime le café.";
  const item = toExerciseItem(source, context);
  expect(item.expectedAnswer).toBe('J’aime le café.');
  expect(item.expectedAnswer).toBe(joinBricks(source.bricks));
  expect(item.expectedAnswer).not.toBe(source.sentence);
  expect(item.options).toEqual(['J’aime', 'le', 'café.', 'du']);
});

test('acceptable answers normalize whitespace and apostrophes and omit a variant equal to the answer', () => {
  const source = structuredClone(coffee);
  source.variants = [" \t J'aime  le café. \n", "\t j'aime\u00a0 le café. "];
  const item = toExerciseItem(source, context);
  expect(item.acceptableAnswers).toEqual(['j’aime le café.']);
});

test('a reordered accepted variant is normalized and kept', () => {
  const source = structuredClone(beach);
  source.variants = [' \t À la\u00a0plage  nous allons.\n', 'Nous  allons à la plage.'];
  expect(toExerciseItem(source, context).acceptableAnswers).toEqual(['À la plage nous allons.']);
});

test('options keep repeated words, attached punctuation and each token of a multi-word distractor', () => {
  const source = structuredClone(beach);
  source.sentence = 'Nous allons à la plage avec la famille.';
  source.variants = [];
  source.bricks.splice(
    5,
    0,
    { text: 'avec', role: 'preposition' },
    { text: 'la', role: 'determiner' },
    { text: 'famille', role: 'noun' },
  );
  source.distractors = [
    {
      text: 'du tout',
      role: 'adverb',
      reason: { zh: 'du tout 不能引出目的地。', en: 'Du tout does not introduce a destination.' },
    },
  ];
  const item = toExerciseItem(source, context);
  expect(item.expectedAnswer).toBe('Nous allons à la plage avec la famille.');
  expect(item.options).toEqual(['Nous', 'allons', 'à', 'la', 'plage', 'avec', 'la', 'famille.', 'du', 'tout']);
  expect(item.options!.filter((tile) => tile === 'la')).toHaveLength(2);
  expect(item.options!.slice(0, 8).join(' ')).toBe('Nous allons à la plage avec la famille.');
});

test('the real grader accepts a legal reordered variant', () => {
  const item = toExerciseItem(structuredClone(beach), context);
  const answer = { ...emptyAnswer(item), singleAnswer: 'À la plage nous allons.' };
  expect(gradeItem('SENTENCE_BUILD', item, answer, DEFAULT_GRADING)).toEqual({
    status: 'graded',
    correct: true,
    recordedAnswer: 'À la plage nous allons.',
  });
});

test('the real grader accepts an expected answer typed with straight apostrophes', () => {
  const item = toExerciseItem(structuredClone(coffee), context);
  const answer = { ...emptyAnswer(item), singleAnswer: "J'aime le café." };
  expect(gradeItem('SENTENCE_BUILD', item, answer, DEFAULT_GRADING)).toEqual({
    status: 'graded',
    correct: true,
    recordedAnswer: "J'aime le café.",
  });
});

test('a build using a distractor needs AI instead of counting as an exact match', () => {
  const item = toExerciseItem(structuredClone(beach), context);
  const answer = { ...emptyAnswer(item), singleAnswer: 'Nous allons au la plage.' };
  expect(gradeItem('SENTENCE_BUILD', item, answer, DEFAULT_GRADING)).toEqual({
    status: 'needs-ai',
    recordedAnswer: 'Nous allons au la plage.',
  });
});

test('the mapped ExerciseItem is accepted inside a valid sentence-build unit', () => {
  const item = toExerciseItem(structuredClone(beach), context);
  const unit = unitOf('SENTENCE_BUILD', [item]);
  expect(ExerciseUnitSchema.parse(unit)).toEqual(unit);
});

test('atelier metadata on a WORD_TRANSFORM unit is rejected under meta', () => {
  const item = toExerciseItem(structuredClone(beach), context);
  const good = unitOf('SENTENCE_BUILD', [{ ...item, type: undefined }]);
  expect(ExerciseUnitSchema.safeParse(good).success).toBe(true);
  const bad = structuredClone(good);
  bad.type = 'WORD_TRANSFORM';
  expect(ExerciseUnitSchema.safeParse(bad).error!.issues).toContainEqual(
    expect.objectContaining({
      path: ['items', 0, 'meta'],
      message: 'Atelier metadata requires sentence build with a nonblank answer',
    }),
  );
});

test.each([
  { key: 'extra', value: 'TEST', path: [] },
  { key: 'themeId', value: 'unknown-theme', path: ['themeId'] },
  { key: 'level', value: 'C2', path: ['level'] },
])('invalid atelier meta $key is rejected under meta', ({ key, value, path }) => {
  const item = toExerciseItem(structuredClone(beach), context);
  const good = unitOf('SENTENCE_BUILD', [item]);
  expect(ExerciseUnitSchema.safeParse(good).success).toBe(true);
  const bad = structuredClone(good);
  bad.items[0].meta![key] = value;
  const result = ExerciseUnitSchema.safeParse(bad);
  expect(result.success).toBe(false);
  expect(result.error!.issues.map((issue) => issue.path)).toContainEqual(['items', 0, 'meta', ...path]);
});
