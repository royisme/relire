/** Adaptive promotion refuses partial/context-dependent sets and creates wholly fresh standalone ownership. */
import { expect, test } from 'bun:test';
import { prepareDrills } from '../src/services/exercises/fromDrills';
import { ExerciseUnitSchema } from '../src/types/exercises';
import { CATALOG_DRILLS } from './fixtures/exerciseCatalog';
const targets = ['gender-number', 'adjective-agreement', 'present'] as const;
test('one mixed unit, fresh material/unit/item IDs, explicit types and AI answers without invented provenance', () => {
  let id = 0;
  const first = prepareDrills(CATALOG_DRILLS, targets, 'B1', () => String(++id));
  const second = prepareDrills(CATALOG_DRILLS, targets, 'B1', () => String(++id));
  expect(first.article.kind).toBe('workbook');
  expect(first.article.content).toBe('');
  expect(first.article.source).toBeUndefined();
  expect(first.article.title).toBe(CATALOG_DRILLS.drillTitle);
  expect(first.unit.instruction).toBe(CATALOG_DRILLS.focusSummary);
  expect(first.unit.materialId).toBe(first.article.id);
  expect(first.unit.unitNumber).toBe(1);
  expect(first.unit.importSource).toBeUndefined();
  expect(first.unit.readingPassage).toBeUndefined();
  expect(ExerciseUnitSchema.safeParse(first.unit).success).toBe(true);
  expect(first.unit.grammarTags).toEqual([...new Set(CATALOG_DRILLS.items.map((item) => item.grammarTag))]);
  expect(second.article.id).not.toBe(first.article.id);
  expect(second.unit.id).not.toBe(first.unit.id);
  for (const [index, item] of first.unit.items.entries()) {
    expect(item.id).not.toBe(CATALOG_DRILLS.items[index].id);
    expect(item.id).not.toBe(second.unit.items[index].id);
    expect(item.type).toBe(CATALOG_DRILLS.items[index].type);
    expect(item.answerSource).toBe('ai');
    expect(item).not.toHaveProperty('articleQuote');
  }
});
test('rejects all of an off-target set, not just the offending item', () => {
  expect(() => prepareDrills(CATALOG_DRILLS, ['present'], 'B1')).toThrow('unrequested tag');
});
test('rejects reading cloze without inventing a passage', () => {
  expect(() =>
    prepareDrills(
      { ...CATALOG_DRILLS, items: [{ ...CATALOG_DRILLS.items[0], type: 'READING_CLOZE', prompt: '[___]' }] },
      targets,
      'B1',
    ),
  ).toThrow('reading passage');
});
test('strict drill validation rejects invalid answer shapes before any preparation', () => {
  expect(() =>
    prepareDrills(
      { ...CATALOG_DRILLS, items: [{ ...CATALOG_DRILLS.items[0], expectedAnswer: ['wrong shape'] }] },
      targets,
      'B1',
    ),
  ).toThrow();
});
