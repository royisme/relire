/** Covers pure exercise-set aggregation and filters; no storage, browser or AI. */
import { expect, test } from 'bun:test';
import i18next from 'i18next';
import type { UnitRow } from '../src/hooks/useUnitRows';
import { aggregateSets, filterSets } from '../src/services/exercises/sets';
import { unitOf } from './fixtures/units';

const i18n = i18next.createInstance();
await i18n.init({
  lng: 'en',
  resources: { en: { translation: { exerciseTypes: { FILL_BLANKS: { name: 'Fill in the blanks' } } } } },
});
const t = i18n.t.bind(i18n);
const row = (title: string, checked = 0, total = 1): UnitRow => ({
  unit: { ...unitOf('FILL_BLANKS'), setTitle: title },
  progress: { checked, total, correct: checked },
});

test('empty input stays empty', () => {
  expect(aggregateSets([], t)).toEqual([]);
  expect(filterSets([], '', 'all')).toEqual([]);
});

test('sets sum stored progress, not averages, and keep distinct exercise types', () => {
  const first = row('Lesson', 1, 2);
  const second = { ...row('Lesson', 2, 8), unit: { ...unitOf('OPEN_QA'), setTitle: 'Lesson' } };
  const other = { ...row('Other'), unit: { ...row('Other').unit, setId: 'set-2', level: 'B2' as const } };
  const sets = aggregateSets([first, second, other], t);
  expect(sets).toHaveLength(2);
  expect(sets[0]).toMatchObject({
    title: 'Lesson',
    level: 'A1',
    createdAt: first.unit.createdAt,
    progress: { checked: 3, total: 10, correct: 3 },
    types: ['FILL_BLANKS', 'OPEN_QA'],
  });
  expect(sets[0].rows).toEqual([first, second]);
  expect(sets[1].progress).toEqual({ checked: 0, total: 1, correct: 0 });
});

test('untitled sets use the translated type and id; repeated types appear once', () => {
  const unit = unitOf('FILL_BLANKS');
  const sets = aggregateSets(
    [
      { ...row(''), unit },
      { ...row(''), unit: { ...unit, id: 'unit-2' } },
    ],
    t,
  );
  expect(sets[0].title).toBe('Fill in the blanks · set-');
  expect(sets[0].types).toEqual(['FILL_BLANKS']);
});

test('search trims and ignores case, matches only set title, and combines with level', () => {
  const sets = aggregateSets(
    [row('Le Renard'), { ...row('Le Jardin'), unit: { ...row('Le Jardin').unit, setId: 'set-2', level: 'B2' } }],
    t,
  );
  expect(filterSets(sets, ' RENARD ', 'all')).toEqual([sets[0]]);
  expect(filterSets(sets, '', 'B2')).toEqual([sets[1]]);
  expect(filterSets(sets, 'renard', 'B2')).toEqual([]);
  expect(filterSets(sets, 'Exercice', 'all')).toEqual([]);
  expect(filterSets(sets, '   ', 'all')).toEqual(sets);
});
