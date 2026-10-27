/** Reader transformation unit building, provenance and deterministic grading with the real gradeItem; TEST content only. */
import { expect, test } from 'bun:test';
import i18next from 'i18next';
import starterJson from '../src/data/graded-readers/starter.json';
import { emptyAnswer } from '../src/services/exercises/answer';
import { prepareReaderTransform } from '../src/services/exercises/fromReaderTransform';
import { DEFAULT_GRADING, gradeItem } from '../src/services/exercises/grading';
import { ExerciseUnitSchema, type ExerciseItem } from '../src/types/exercises';
import { PublishedReaderSchema } from '../src/types/gradedReader';
import { ReaderTransformMetaSchema } from '../src/types/readerTransform';
import { publishedReaderFixture } from './fixtures/gradedReaders';
import en from '../src/i18n/locales/en.json';
import zh from '../src/i18n/locales/zh.json';

const i18n = i18next.createInstance();
await i18n.init({ lng: 'en', resources: { en: { translation: en }, zh: { translation: zh } } });
const fixture = publishedReaderFixture();
const a103 = PublishedReaderSchema.parse(starterJson.readers[2]);
const prepare = (kind: 'negation' | 'number', reader = fixture, language = 'en') => {
  let id = 0;
  return prepareReaderTransform({
    reader,
    kind,
    t: i18n.getFixedT(language),
    makeId: () => `TEST-${++id}`,
    now: () => 123,
  });
};

test('one grammar WORD_TRANSFORM unit in sentence order with deterministic ids, time, prompt and provenance', () => {
  const units = prepare('negation');
  expect(units).toHaveLength(1);
  const [unit] = units;
  expect(ExerciseUnitSchema.parse(unit)).toEqual(unit);
  expect(unit).toMatchObject({
    id: 'unit-TEST-2',
    setId: 'TEST-1',
    setTitle: fixture.body.title.fr,
    createdAt: 123,
    level: fixture.body.level,
    learningArea: 'grammar',
    section: 'GRAMMAIRE',
    unitNumber: 1,
    type: 'WORD_TRANSFORM',
    grammarTags: ['negation'],
    title: en.readerTransform.negation.title,
    instruction: en.readerTransform.negation.instruction,
  });
  const answers = ['Ce n’est pas un livre.', 'Le livre n’est pas petit.', 'Il n’est pas petit.'];
  expect(unit.items).toHaveLength(3);
  unit.items.forEach((item, index) => {
    const sentence = fixture.body.sentences[index];
    expect(item).toMatchObject({
      id: sentence.id,
      type: 'WORD_TRANSFORM',
      itemNumber: index + 1,
      prompt: sentence.fr,
      expectedAnswer: answers[index],
      explanation: en.readerTransform.negation.explanation,
      grammarTag: 'negation',
    });
    expect(item.meta).toEqual({
      source: 'reader-transform',
      readerId: fixture.body.id,
      version: fixture.version,
      sentenceId: sentence.id,
      kind: 'negation',
      ignoreSentencePunctuation: true,
    });
  });
});

test('number keeps only the covered bundled sentences, still in reader order, tagged gender-number', () => {
  const [unit] = prepare('number', a103);
  expect(unit.items.map((item) => item.id)).toEqual(['a1-03-s1', 'a1-03-s3', 'a1-03-s5']);
  expect(unit.items.map((item) => item.itemNumber)).toEqual([1, 2, 3]);
  expect(unit.grammarTags).toEqual(['gender-number']);
  const prompts = [
    'Il y a un salon dans cet appartement.',
    'Il y a une chambre avec un lit.',
    'Ma mère regarde le salon avec moi.',
  ];
  const answers = [
    'Il y a des salons dans cet appartement.',
    'Il y a des chambres avec un lit.',
    'Ma mère regarde les salons avec moi.',
  ];
  unit.items.forEach((item, index) => {
    expect(item.prompt).toBe(prompts[index]);
    expect(item.expectedAnswer).toBe(answers[index]);
    expect(item.grammarTag).toBe('gender-number');
    expect(item.meta).toMatchObject({
      source: 'reader-transform',
      readerId: 'a1-03',
      kind: 'number',
      ignoreSentencePunctuation: true,
    });
  });
});

test('a kind that covers no sentence of the reader yields no set', () => {
  expect(prepare('number')).toEqual([]);
});

test('the real gradeItem marks the computed answer, its straight-apostrophe twin and nothing else', () => {
  const item = prepare('negation').at(0)!.items[1];
  const answer = (singleAnswer: string) => ({ ...emptyAnswer(item), singleAnswer });
  expect(item.expectedAnswer).toBe('Le livre n’est pas petit.');
  const expected = item.expectedAnswer as string;
  expect(gradeItem('WORD_TRANSFORM', item, answer(expected), DEFAULT_GRADING)).toEqual({
    status: 'graded',
    correct: true,
    recordedAnswer: expected,
  });
  const straight = expected.replaceAll('’', "'");
  expect(gradeItem('WORD_TRANSFORM', item, answer(straight), DEFAULT_GRADING)).toEqual({
    status: 'graded',
    correct: true,
    recordedAnswer: straight,
  });
  expect(gradeItem('WORD_TRANSFORM', item, answer(item.prompt), DEFAULT_GRADING)).toEqual({
    status: 'graded',
    correct: false,
    recordedAnswer: item.prompt,
  });
  for (const wrong of ['Le livre ne est pas petit.', 'Le livre n’est pas un petit.', 'x'])
    expect(gradeItem('WORD_TRANSFORM', item, answer(wrong), DEFAULT_GRADING)).toEqual({
      status: 'graded',
      correct: false,
      recordedAnswer: wrong,
    });
});

test('reader-transform metadata requires word transform with a nonblank answer', () => {
  const [unit] = prepare('negation');
  const item = unit.items[0];
  const valid = (patch: Partial<ExerciseItem>, type = unit.type) =>
    ExerciseUnitSchema.safeParse({ ...unit, type, items: [{ ...item, ...patch }] }).success;
  expect(valid({})).toBe(true);
  expect(valid({ type: 'NUMBER_DICTATION' })).toBe(false);
  expect(valid({ type: undefined }, 'NUMBER_DICTATION')).toBe(false);
  expect(valid({ type: undefined })).toBe(true);
  for (const blank of [undefined, '', '   ']) expect(valid({ expectedAnswer: blank })).toBe(false);
});

test('strict provenance rejects every missing/extra field and invalid marker, identifier or version', () => {
  const [unit] = prepare('negation');
  const meta = unit.items[0].meta!;
  const invalid: Record<string, unknown>[] = [{ ...meta, extra: 'TEST' }];
  for (const key of Object.keys(meta)) {
    const missing = { ...meta };
    delete missing[key];
    invalid.push(missing);
  }
  for (const [key, value] of [
    ['source', 'reader-dictation'],
    ['kind', 'question'],
    ['ignoreSentencePunctuation', false],
    ['readerId', 'Bad slug'],
    ['sentenceId', 'bad_slug'],
    ['version', 'a'.repeat(63)],
    ['version', 'A'.repeat(64)],
  ])
    invalid.push({ ...meta, [String(key)]: value });
  for (const candidate of invalid) {
    expect(ReaderTransformMetaSchema.safeParse(candidate).success).toBe(false);
    if (candidate.source === 'reader-transform')
      expect(ExerciseUnitSchema.safeParse({ ...unit, items: [{ ...unit.items[0], meta: candidate }] }).success).toBe(
        false,
      );
  }
});
