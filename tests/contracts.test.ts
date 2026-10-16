import { expect, test } from 'bun:test';
import {
  DrillsSchema,
  ExplanationSchema,
  GeneratedExercisesSchema,
  HintSchema,
  OpenGradeSchema,
} from '../src/types/exerciseAi';
import {
  ExerciseItemSchema,
  ExerciseTypeSchema,
  ExerciseUnitSchema,
  ExtractedUnitSchema,
  type ExerciseItem,
  type ExerciseType,
  type ExerciseUnit,
} from '../src/types/exercises';
import { ITEM_BY_TYPE, ITEMS, unitOf } from './fixtures/units';

const base = unitOf('WORD_TRANSFORM');
const item = ITEMS.WORD_TRANSFORM;
// The playable units, without the material they belong to (what a model returns).
const { materialId: _materialId, ...extracted } = base;

test('every exercise type has a valid sample unit', () => {
  for (const type of ExerciseTypeSchema.options) {
    expect(ExerciseUnitSchema.safeParse(unitOf(type)).success).toBe(true);
  }
  expect(ExerciseTypeSchema.options).toHaveLength(11);
});

test('a playable unit needs a material; a model answer does not carry one', () => {
  expect(ExerciseUnitSchema.safeParse(extracted).success).toBe(false);
  expect(ExerciseUnitSchema.safeParse({ ...base, materialId: '  ' }).success).toBe(false);
  expect(ExtractedUnitSchema.safeParse(extracted).success).toBe(true);
  expect(ExerciseUnitSchema.parse(base).materialId).toBe('material-1');
});

test('per-item type override is preserved and governs validation', () => {
  const mixed = { ...base, items: [{ ...item, type: 'GENDER_CHECK', options: ['M', 'F'], expectedAnswer: 'M' }] };
  expect(ExerciseUnitSchema.parse(mixed).items[0].type).toBe('GENDER_CHECK');
  expect(GeneratedExercisesSchema.parse({ units: [{ ...mixed, materialId: undefined }] }).units[0].items[0].type).toBe(
    'GENDER_CHECK',
  );

  const overridden = {
    ...base,
    type: 'DIALOGUE_ORDER',
    items: [{ ...item, type: 'GENDER_CHECK', options: ['M', 'F'], expectedAnswer: 'M' }],
  };
  expect(ExerciseUnitSchema.safeParse(overridden).success).toBe(true);
  for (const itemType of ['DIALOGUE_ORDER', 'UNKNOWN']) {
    const invalid = { ...base, items: [{ ...item, type: itemType }] };
    expect(ExerciseUnitSchema.safeParse(invalid).success).toBe(false);
    expect(GeneratedExercisesSchema.safeParse({ units: [invalid] }).success).toBe(false);
  }
});

test('drill items must name their own type', () => {
  const { type: _type, ...withoutType } = { ...item, type: 'WORD_TRANSFORM' };
  expect(
    DrillsSchema.safeParse({ drillTitle: 'Missing type', focusSummary: 'Test', items: [withoutType] }).success,
  ).toBe(false);
  expect(
    DrillsSchema.safeParse({ drillTitle: 'Ok', focusSummary: 'Test', items: [{ ...item, type: 'WORD_TRANSFORM' }] })
      .success,
  ).toBe(true);
});

test('rejects empty and whitespace-only reference answers', () => {
  for (const expectedAnswer of ['', '   ', [''], ['bonjour', ' '], []]) {
    expect(ExerciseItemSchema.safeParse({ ...item, expectedAnswer }).success).toBe(false);
  }
});

test('rejects unknown grammar tags, including FrenchLab categories', () => {
  expect(ExerciseItemSchema.safeParse({ ...item, grammarTag: 'gender-agreement' }).success).toBe(false);
  expect(ExerciseItemSchema.safeParse({ ...item, grammarTag: 'gender-number' }).success).toBe(true);
  expect(ExtractedUnitSchema.safeParse({ ...extracted, grammarTags: [] }).success).toBe(false);
});

// [type, item overrides] each of which breaks the shape the controls and grader rely on.
const BAD_SHAPES: Array<[ExerciseType, Partial<ExerciseItem>]> = [
  ['DIALOGUE_ORDER', { options: ['a. Bonjour', 'b. Salut'], expectedAnswer: 'a' }],
  ['DIALOGUE_ORDER', { options: undefined, expectedAnswer: ['a', 'b'] }],
  ['DIALOGUE_ORDER', { options: ['a. Bonjour', 'b. Salut'], expectedAnswer: ['a', 'z'] }],
  ['DIALOGUE_ORDER', { options: ['a. Bonjour', 'b. Salut'], expectedAnswer: ['a'] }],
  ['DIALOGUE_ORDER', { options: ['a. Bonjour', 'a. Salut'], expectedAnswer: ['a', 'a'] }],
  ['MATCH_PAIRS', { options: undefined, expectedAnswer: 'a' }],
  ['MATCH_PAIRS', { options: ['a. Bonjour', 'b. Salut'], expectedAnswer: ['a'] }],
  ['MATCH_PAIRS', { options: ['a. Bonjour', 'b. Salut'], expectedAnswer: 'z' }],
  ['MATCH_PAIRS', { options: ['a. Bonjour', 'a. Salut'], expectedAnswer: 'a' }],
  ['ODD_ONE_OUT', { options: ['bonjour', 'salut'], expectedAnswer: 'absent' }],
  ['ODD_ONE_OUT', { options: ['bonjour', 'bonjour'], expectedAnswer: 'bonjour' }],
  ['ODD_ONE_OUT', { options: ['bonjour'], expectedAnswer: 'bonjour' }],
  ['GENDER_CHECK', { options: ['M', 'F'], expectedAnswer: 'X' }],
  ['GENDER_CHECK', { options: ['M', 'M'], expectedAnswer: 'M' }],
  ['CHOICE_SELECT', { prompt: 'Pas de groupe', expectedAnswer: 'bonjour' }],
  ['CHOICE_SELECT', { prompt: 'Un {seul}', expectedAnswer: 'seul' }],
  ['CHOICE_SELECT', { prompt: 'Vous {êtes|es} ici', expectedAnswer: 'sommes' }],
  ['CHOICE_SELECT', { prompt: 'Vous {êtes|es} ici', expectedAnswer: ['êtes', 'es'] }],
  ['FILL_BLANKS', { prompt: 'A [___] et [___].', expectedAnswer: 'un' }],
  ['FILL_BLANKS', { prompt: 'A [___] et [___].', expectedAnswer: ['un'] }],
  ['FILL_BLANKS', { prompt: 'A [___].', expectedAnswer: ['un', 'deux'] }],
  ['READING_CLOZE', { prompt: 'A [___] et [___].', expectedAnswer: ['un', 'deux', 'trois'] }],
  ['WORD_TRANSFORM', { expectedAnswer: ['un', 'deux'] }],
  ['OPEN_QA', { expectedAnswer: ['un', 'deux'] }],
];

test('contracts enforce type-compatible answers and usable controls', () => {
  BAD_SHAPES.forEach(([type, overrides], index) => {
    const bad: ExerciseItem = { ...ITEM_BY_TYPE[type], ...overrides };
    const label = `${type} #${index}`;
    expect([label, ExerciseUnitSchema.safeParse(unitOf(type, [bad])).success]).toEqual([label, false]);
    expect([
      label,
      DrillsSchema.safeParse({ drillTitle: 'T', focusSummary: 'G', items: [{ ...bad, type }] }).success,
    ]).toEqual([label, false]);
  });
});

test('well formed variants of the same types are accepted', () => {
  const ok: Array<[ExerciseType, Partial<ExerciseItem>]> = [
    ['DIALOGUE_ORDER', { options: ['a. Bonjour', 'b. Salut'], expectedAnswer: ['b', 'a'] }],
    ['DIALOGUE_ORDER', { options: ['a. Bonjour', 'b. Salut'], expectedAnswer: ['B', 'A'] }],
    ['MATCH_PAIRS', { expectedAnswer: 'B' }],
    ['GENDER_CHECK', { options: undefined, expectedAnswer: 'M' }],
    ['GENDER_CHECK', { options: ['Masculin', 'Féminin'], expectedAnswer: 'Féminin' }],
    ['CHOICE_SELECT', { prompt: 'Vous {êtes|es} ici', expectedAnswer: 'êtes' }],
    ['FILL_BLANKS', { prompt: 'A [___] et [___].', expectedAnswer: ['un', 'deux'] }],
    ['READING_CLOZE', { prompt: 'Un seul [___].', expectedAnswer: 'blanc' }],
  ];
  for (const [type, overrides] of ok) {
    expect(ExerciseUnitSchema.safeParse(unitOf(type, [{ ...ITEM_BY_TYPE[type], ...overrides }])).success).toBe(true);
  }
});

test('refinement issues point at the offending field', () => {
  const result = ExerciseUnitSchema.safeParse(
    unitOf('ODD_ONE_OUT', [{ ...ITEMS.ODD_ONE_OUT, expectedAnswer: 'absent' }]),
  );
  expect(result.success).toBe(false);
  expect(result.error?.issues[0].path).toEqual(['items', 0, 'expectedAnswer']);
});

test('duplicate item and unit IDs are rejected', () => {
  expect(ExerciseUnitSchema.safeParse(unitOf('WORD_TRANSFORM', [item, item])).success).toBe(false);
  const unit = unitOf('WORD_TRANSFORM');
  const { materialId: _m, ...noMaterial } = unit;
  expect(GeneratedExercisesSchema.safeParse({ units: [noMaterial, noMaterial] }).success).toBe(false);
  const drill = { ...item, type: 'WORD_TRANSFORM' };
  expect(DrillsSchema.safeParse({ drillTitle: 'T', focusSummary: 'G', items: [drill, drill] }).success).toBe(false);
});

test('empty unit and incomplete model answers are rejected', () => {
  expect(ExerciseUnitSchema.safeParse({ ...base, items: [] }).success).toBe(false);
  expect(GeneratedExercisesSchema.safeParse({ units: [{}] }).success).toBe(false);
  expect(GeneratedExercisesSchema.safeParse({ units: [] }).success).toBe(false);
  expect(DrillsSchema.safeParse({ items: [{}] }).success).toBe(false);
  expect(HintSchema.safeParse({}).success).toBe(false);
  expect(ExplanationSchema.safeParse({}).success).toBe(false);
  expect(OpenGradeSchema.safeParse({}).success).toBe(false);
  expect(OpenGradeSchema.safeParse({ isCorrect: true, feedback: 'Bien.' }).success).toBe(true);
});

test('answerSource and importSource round-trip; unknown fields are stripped', () => {
  const importSource: ExerciseUnit['importSource'] = {
    kind: 'pdf',
    name: 'a.pdf',
    pages: [1, 2],
    mode: 'complete',
    extractedText: 'texte',
  };
  const unit = ExerciseUnitSchema.parse({
    ...base,
    sourceImage: 'data:image/png;base64,SECRET',
    importSource,
    items: [{ ...item, answerSource: 'material' }],
  });
  expect(unit.importSource).toEqual(importSource);
  expect(unit.items[0].answerSource).toBe('material');
  expect(JSON.stringify(unit)).not.toContain('SECRET');
  for (const answerSource of ['robot', '']) {
    expect(ExerciseItemSchema.safeParse({ ...item, answerSource }).success).toBe(false);
  }
});
