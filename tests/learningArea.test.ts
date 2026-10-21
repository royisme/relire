/** Synthetic classification, mixed-set ownership and retained history contracts; no learner data. */
import { beforeEach, expect, test } from 'bun:test';
import i18n from '../src/i18n';
import { ExtractedUnitSchema, ExerciseUnitSchema } from '../src/types/exercises';
import { LEARNING_AREAS, supportsListening } from '../src/types/learningArea';
import { ExerciseAttemptSchema, parseExerciseBackup } from '../src/storage/exerciseBackup';
import {
  accuracyByGrammarTag,
  checkItem,
  deleteUnit,
  listAttempts,
  listMistakes,
  saveUnits,
} from '../src/storage/exercises';
import { deleteSetData, exportData, importData } from '../src/storage/db';
import { aggregateAreaSets, completeAreaSet } from '../src/services/exercises/sets';
import { importDestination, ImportDraftSchema, prepareImport } from '../src/services/exercises/importDraft';
import { validateGeneratedArea } from '../src/types/exerciseAi';
import { toStoredUnits } from '../src/services/exercises/fromGenerated';
import { freshDb, answered, wrong, failure } from './fixtures/storage';
import { unitOf } from './fixtures/units';
import { draftFixture } from './fixtures/importDraft';
import { contextOf, fakeProvider } from './fixtures/fakeProvider';
import { generateExercises } from '../src/services/ai/tasks';

beforeEach(freshDb);

test('areas are required explicit values at extracted, stored, attempt and backup boundaries', () => {
  const unit = unitOf('FILL_BLANKS');
  const attempt = {
    id: 'a',
    unitId: unit.id,
    itemId: unit.items[0].id,
    learningArea: 'grammar',
    grammarTag: 'present',
    prompt: 'TEST',
    userAnswer: 'x',
    expectedAnswer: 'y',
    correct: false,
    timestamp: 1,
  };
  for (const area of [...LEARNING_AREAS, undefined, null, 'speaking', 'GRAMMAIRE']) {
    const supported = area !== 'listening' && LEARNING_AREAS.includes(area as never);
    expect(ExtractedUnitSchema.safeParse({ ...unit, learningArea: area }).success).toBe(supported);
    expect(ExerciseUnitSchema.safeParse({ ...unit, learningArea: area }).success).toBe(supported);
    expect(ExerciseAttemptSchema.safeParse({ ...attempt, learningArea: area }).success).toBe(
      LEARNING_AREAS.includes(area as never),
    );
  }
  const { learningArea: _unitArea, ...oldUnit } = unit;
  const { learningArea: _attemptArea, ...oldAttempt } = attempt;
  expect(() => parseExerciseBackup({ units: [oldUnit] })).toThrow();
  expect(() => parseExerciseBackup({ attempts: [oldAttempt] })).toThrow();
  expect(() => parseExerciseBackup({ units: [unit], attempts: [{ ...attempt, learningArea: 'reading' }] })).toThrow(
    'learning area',
  );
});

test('Listening requires every effective interaction to be supported dictation, not prompt TTS', () => {
  const dictation = { ...unitOf('NUMBER_DICTATION'), learningArea: 'listening' as const };
  expect(ExerciseUnitSchema.safeParse(dictation).success).toBe(true);
  expect(
    supportsListening({
      ...dictation,
      type: 'FILL_BLANKS',
      items: dictation.items.map((item) => ({ ...item, type: 'NUMBER_DICTATION' })),
    }),
  ).toBe(true);
  for (const unit of [
    {
      ...dictation,
      items: [...dictation.items, { ...unitOf('FILL_BLANKS').items[0], type: 'FILL_BLANKS', audioText: 'Je suis.' }],
    },
    { ...dictation, items: dictation.items.map((item) => ({ ...item, audioText: '' })) },
  ])
    expect(ExerciseUnitSchema.safeParse(unit).success).toBe(false);
});

test('mixed review corrections preserve provenance, identities and chosen destination across save-only retries', async () => {
  const base = draftFixture.units[0];
  const draft = ImportDraftSchema.parse({
    materialTitle: 'TEST mixed',
    units: [
      { ...base, id: 'one', learningArea: 'grammar', items: [{ ...base.items[0], expectedAnswer: 'étudiant' }] },
      { ...base, id: 'two', learningArea: 'reading', items: [{ ...base.items[0], expectedAnswer: 'étudiant' }] },
      {
        ...unitOf('NUMBER_DICTATION'),
        id: 'three',
        learningArea: 'listening',
        items: unitOf('NUMBER_DICTATION').items,
      },
    ],
  });
  // The learner corrects the model: same interaction and section, different primary goal.
  draft.units[1].learningArea = 'writing';
  const prepared = prepareImport(draft, { kind: 'text', name: 'TEST', pages: [] }, 'complete', {
    setId: 'mixed',
    level: 'A1',
    createdAt: 1,
  });
  expect(prepared.errors).toEqual([]);
  const units = prepared.units;
  expect(units.map((unit) => unit.learningArea)).toEqual(['grammar', 'writing', 'listening']);
  expect(units[0].items[0].answerSource).toBe('ai');
  expect(importDestination(units, 'reading')).toEqual({ name: 'practiceSet', area: 'grammar', setId: 'mixed' });
  expect(importDestination(units, 'writing')).toEqual({ name: 'practiceSet', area: 'writing', setId: 'mixed' });
  const originalIds = units.map((unit) => [unit.id, unit.items.map((item) => item.id)]);
  await saveUnits(units);
  expect(units.map((unit) => [unit.id, unit.items.map((item) => item.id)])).toEqual(originalIds);
  // Unsupported classification is rejected before the caller can save anything.
  draft.units[0].learningArea = 'listening';
  expect(
    prepareImport(draft, { kind: 'text', name: 'TEST', pages: [] }, 'complete', {
      setId: 'bad',
      level: 'A1',
      createdAt: 1,
    }).errors[0].issues.join(' '),
  ).toContain('Listening');
});

test('area aggregation scopes before counting; set addresses show the complete batch only in a real entry area', () => {
  const rows = [
    {
      unit: { ...unitOf('FILL_BLANKS'), id: 'g', learningArea: 'grammar' as const },
      progress: { total: 2, checked: 1, correct: 0 },
    },
    {
      unit: { ...unitOf('OPEN_QA'), id: 'w', learningArea: 'writing' as const },
      progress: { total: 3, checked: 3, correct: 2 },
    },
  ];
  const t = i18n.getFixedT('en');
  expect(aggregateAreaSets(rows, 'grammar', t)[0].progress).toEqual({ total: 2, checked: 1, correct: 0 });
  expect(aggregateAreaSets(rows, 'reading', t)).toEqual([]);
  const complete = completeAreaSet(rows, 'grammar', 'set-1', t)!;
  expect(complete.rows.map(({ unit }) => unit.learningArea)).toEqual(['grammar', 'writing']);
  expect(complete.progress).toEqual({ total: 5, checked: 4, correct: 2 });
  expect(completeAreaSet(rows, 'listening', 'set-1', t)).toBeUndefined();
});

test('one shared history retains area through deletion and backup; grammar accuracy excludes non-grammar attempts', async () => {
  const grammar = { ...unitOf('FILL_BLANKS'), id: 'g' };
  const reading = { ...grammar, id: 'r', learningArea: 'reading' as const };
  const writing = { ...grammar, id: 'w', learningArea: 'writing' as const };
  await saveUnits([grammar, reading, writing]);
  for (const unit of [grammar, reading, writing])
    await checkItem({
      unitId: unit.id,
      itemId: unit.items[0].id,
      resetToken: 0,
      answer: answered('TEST wrong'),
      result: wrong,
    });
  await deleteUnit(grammar.id);
  expect((await listMistakes()).map(({ attempt }) => attempt.learningArea).sort()).toEqual([
    'grammar',
    'reading',
    'writing',
  ]);
  expect(await accuracyByGrammarTag()).toEqual([{ grammarTag: 'present', correct: 0, total: 1, accuracy: 0 }]);
  const backup = await exportData();
  expect(backup.attempts?.map((attempt) => attempt.learningArea).sort()).toEqual(['grammar', 'reading', 'writing']);
  await freshDb();
  await importData(backup);
  expect((await listAttempts()).map((attempt) => attempt.learningArea).sort()).toEqual([
    'grammar',
    'reading',
    'writing',
  ]);
  await deleteSetData('set-1');
  expect(await accuracyByGrammarTag()).toEqual([{ grammarTag: 'present', correct: 0, total: 1, accuracy: 0 }]);
  expect(await listAttempts()).toHaveLength(3);
});

test('article generation prompts and validates the requested explicit goal instead of relabelling output', async () => {
  const articleText = 'TEST article.';
  for (const learningArea of ['reading', 'grammar'] as const) {
    const unit = { ...unitOf('FILL_BLANKS'), learningArea };
    const provider = fakeProvider({ units: [unit] });
    const generated = await generateExercises(
      { articleText, learningArea, count: 1, level: 'A1' },
      contextOf(provider),
    );
    expect(provider.requests[0].prompt).toContain(`Requested learning area: ${learningArea}`);
    expect(toStoredUnits(generated.units, { setId: 'TEST', createdAt: 1, level: 'A1' })[0].learningArea).toBe(
      learningArea,
    );
    expect(() => validateGeneratedArea(generated, learningArea === 'reading' ? 'grammar' : 'reading')).toThrow();
  }
  const provider = fakeProvider({ units: [unitOf('FILL_BLANKS')] });
  const error = await failure(
    generateExercises({ articleText, learningArea: 'reading', count: 1, level: 'A1' }, contextOf(provider)),
  );
  expect((error as Error).message).toContain('requested learning area');
});
