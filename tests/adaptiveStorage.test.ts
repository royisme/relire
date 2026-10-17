/** Adaptive workbook creation uses the existing add-only transaction; retained history feeds targeting after real deletion. */
import { beforeEach, expect, test } from 'bun:test';
import { freshDb, seedUnit, answered, wrong, failure } from './fixtures/storage';
import { CATALOG_DRILLS } from './fixtures/exerciseCatalog';
import { prepareDrills } from '../src/services/exercises/fromDrills';
import { accuracyByArea, weakGrammarTags } from '../src/services/exercises/accuracy';
import { db, deleteArticleData } from '../src/storage/db';
import {
  createImportedMaterial,
  accuracyByGrammarTag,
  checkItem,
  listMistakes,
  listUnits,
} from '../src/storage/exercises';

beforeEach(freshDb);
const targets = ['gender-number', 'adjective-agreement', 'present'] as const;

test('one complete standalone workbook and unit are durable, and duplicate IDs are never a success receipt', async () => {
  const result = prepareDrills(CATALOG_DRILLS, targets, 'B1');
  await createImportedMaterial(result.article, [result.unit]);
  const d = await db();
  expect(await d.getAll('articles')).toEqual([result.article]);
  expect(await listUnits(result.article.id)).toEqual([result.unit]);
  expect(await failure(createImportedMaterial(result.article, [result.unit]))).toBeDefined();
  expect(await d.getAll('articles')).toEqual([result.article]);
  expect(await d.getAll('units')).toEqual([result.unit]);
  expect(await d.getAll('attempts')).toEqual([]);
  expect(await d.getAll('itemStates')).toEqual([]);
});

test('initial-unit collision rolls back new workbook; exact unchanged payload can retry only after collision removed', async () => {
  const existing = prepareDrills(CATALOG_DRILLS, targets, 'B1');
  await createImportedMaterial(existing.article, [existing.unit]);
  const next = prepareDrills(CATALOG_DRILLS, targets, 'B2');
  next.unit.id = existing.unit.id;
  expect(await failure(createImportedMaterial(next.article, [next.unit]))).toBeDefined();
  const d = await db();
  expect(await d.get('articles', next.article.id)).toBeUndefined();
  expect(await d.get('units', existing.unit.id)).toEqual(existing.unit);
  await d.delete('units', existing.unit.id);
  await createImportedMaterial(next.article, [next.unit]);
  expect(await d.get('articles', next.article.id)).toEqual(next.article);
  expect(await d.get('units', next.unit.id)).toEqual(next.unit);
});

test('actually deleting material retains wrong snapshots, weighted counts and adaptive target', async () => {
  const unit = await seedUnit();
  await checkItem({
    unitId: unit.id,
    itemId: unit.items[0].id,
    resetToken: 0,
    answer: answered('wrong'),
    result: wrong,
  });
  await deleteArticleData(unit.materialId);
  expect(await listUnits()).toEqual([]);
  const tags = await accuracyByGrammarTag();
  expect(accuracyByArea(tags)).toEqual([{ area: 'verbs-forms', correct: 0, total: 1, accuracy: 0 }]);
  expect(weakGrammarTags(tags)).toEqual(['present']);
  expect((await listMistakes())[0].attempt.prompt).toBe(unit.items[0].prompt);
});
