/** Adaptive drills are saved as one new batch with no article; retained history feeds targeting after a real set delete. */
import { beforeEach, expect, test } from 'bun:test';
import { freshDb, seedUnit, answered, wrong, failure } from './fixtures/storage';
import { CATALOG_DRILLS } from './fixtures/exerciseCatalog';
import { prepareDrills } from '../src/services/exercises/fromDrills';
import { accuracyByArea, weakGrammarTags } from '../src/services/exercises/accuracy';
import { db, deleteSetData } from '../src/storage/db';
import { accuracyByGrammarTag, checkItem, listMistakes, listUnits, saveUnits } from '../src/storage/exercises';

beforeEach(freshDb);
const targets = ['gender-number', 'adjective-agreement', 'present'] as const;

test('prepared drills are one self-contained unit with the form level and the drill title, and duplicate IDs are never a success receipt', async () => {
  const unit = prepareDrills(CATALOG_DRILLS, targets, 'B1');
  expect(unit.level).toBe('B1');
  expect(unit.setTitle).toBe(CATALOG_DRILLS.drillTitle);
  await saveUnits([unit]);
  const d = await db();
  expect(await listUnits()).toEqual([unit]);
  expect(await d.getAll('articles')).toEqual([]);
  expect(await failure(saveUnits([unit]))).toBeDefined();
  expect(await d.getAll('units')).toEqual([unit]);
  expect(await d.getAll('attempts')).toEqual([]);
  expect(await d.getAll('itemStates')).toEqual([]);
});

test('a collision rolls the save back; the exact unchanged payload can retry once the collision is removed', async () => {
  const existing = prepareDrills(CATALOG_DRILLS, targets, 'B1');
  await saveUnits([existing]);
  const next = prepareDrills(CATALOG_DRILLS, targets, 'B2');
  next.id = existing.id;
  expect(await failure(saveUnits([next]))).toBeDefined();
  const d = await db();
  expect(await d.get('units', existing.id)).toEqual(existing);
  await d.delete('units', existing.id);
  await saveUnits([next]);
  expect(await d.get('units', next.id)).toEqual(next);
});

test('actually deleting a set retains wrong snapshots, weighted counts and adaptive target', async () => {
  const unit = await seedUnit();
  await checkItem({
    unitId: unit.id,
    itemId: unit.items[0].id,
    resetToken: 0,
    answer: answered('wrong'),
    result: wrong,
  });
  await deleteSetData(unit.setId);
  expect(await listUnits()).toEqual([]);
  const tags = await accuracyByGrammarTag();
  expect(accuracyByArea(tags)).toEqual([{ area: 'verbs-forms', correct: 0, total: 1, accuracy: 0 }]);
  expect(weakGrammarTags(tags)).toEqual(['present']);
  expect((await listMistakes())[0].attempt.prompt).toBe(unit.items[0].prompt);
});
