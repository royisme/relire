/** Adaptive promotion refuses partial/context-dependent sets and creates one wholly fresh, self-contained unit. */
import { expect, test } from 'bun:test';
import { prepareDrills } from '../src/services/exercises/fromDrills';
import { ExerciseUnitSchema } from '../src/types/exercises';
import { CATALOG_DRILLS } from './fixtures/exerciseCatalog';
const targets = ['gender-number', 'adjective-agreement', 'present'] as const;
test('one mixed unit, fresh set/unit/item IDs, the form level, explicit types and AI answers without invented provenance', () => {
  let id = 0;
  const first = prepareDrills(CATALOG_DRILLS, targets, 'B1', () => String(++id));
  const second = prepareDrills(CATALOG_DRILLS, targets, 'B2', () => String(++id));
  expect(first.instruction).toBe(CATALOG_DRILLS.focusSummary);
  expect(first.setTitle).toBe(CATALOG_DRILLS.drillTitle);
  expect(first.level).toBe('B1');
  expect(second.level).toBe('B2');
  expect(first).not.toHaveProperty('materialId');
  expect(first.unitNumber).toBe(1);
  expect(first.importSource).toBeUndefined();
  expect(first.readingPassage).toBeUndefined();
  expect(ExerciseUnitSchema.safeParse(first).success).toBe(true);
  expect(first.grammarTags).toEqual([...new Set(CATALOG_DRILLS.items.map((item) => item.grammarTag))]);
  expect(second.setId).not.toBe(first.setId);
  expect(second.id).not.toBe(first.id);
  for (const [index, item] of first.items.entries()) {
    expect(item.id).not.toBe(CATALOG_DRILLS.items[index].id);
    expect(item.id).not.toBe(second.items[index].id);
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
