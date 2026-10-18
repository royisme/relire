/** An import saves either an article or one batch of units; a batch commits whole or not at all, with add-only retry identities. */
import { beforeEach, expect, test } from 'bun:test';
import { article, failure, freshDb, seedUnit } from './fixtures/storage';
import { ITEMS, unitOf } from './fixtures/units';
import { db, saveArticle } from '../src/storage/db';
import { listUnits, saveUnits } from '../src/storage/exercises';
import { prepareImport } from '../src/services/exercises/importDraft';
import { draftFixture } from './fixtures/importDraft';

beforeEach(freshDb);
const batch = () => [
  { ...unitOf('WORD_TRANSFORM', [ITEMS.WORD_TRANSFORM]), id: 'new-1', unitNumber: 1, setId: 'import-1' },
  { ...unitOf('OPEN_QA'), id: 'new-2', unitNumber: 2, setId: 'import-1' },
];

test('an article import writes the article and started, and touches no unit', async () => {
  const existing = await seedUnit();
  await saveArticle(article('imported'));
  const d = await db();
  expect(await d.get('articles', 'imported')).toEqual(article('imported'));
  expect(await d.get('meta', 'started')).toBe(true);
  expect(await d.get('units', existing.id)).toEqual(existing);
});

test('an exercises import saves one batch without any article and leaves unrelated rows alone', async () => {
  const existing = await seedUnit();
  const prepared = batch();
  await saveUnits(prepared);
  const d = await db();
  expect(await d.getAll('articles')).toEqual([]);
  expect((await listUnits()).map((unit) => unit.id).sort()).toEqual(['new-1', 'new-2', existing.id].sort());
  expect(await d.getAllFromIndex('units', 'setId', 'import-1')).toHaveLength(2);
  expect(await d.get('units', existing.id)).toEqual(existing);
  expect(await d.count('itemStates')).toBe(0);
  expect(await d.count('attempts')).toBe(0);
});

test('a prepared import keeps the set id, the draft title, the chosen level and creation time', async () => {
  const draft = {
    ...draftFixture,
    units: draftFixture.units.map((unit) => ({
      ...unit,
      items: [{ ...unit.items[0], expectedAnswer: ITEMS.WORD_TRANSFORM.expectedAnswer }],
    })),
  };
  const prepared = prepareImport(draft, { kind: 'text', name: 'Worksheet', pages: [] }, 'complete', {
    setId: 'set-import',
    level: 'C1',
    createdAt: 1_700_000_000_000,
  });
  expect(prepared.errors).toEqual([]);
  await saveUnits(prepared.units);
  const d = await db();
  expect(await d.getAll('units')).toEqual(prepared.units);
  expect(prepared.units[0]).toMatchObject({
    setId: 'set-import',
    setTitle: 'Mon document',
    level: 'C1',
    createdAt: 1_700_000_000_000,
  });
});

test('rejects an empty unit, a duplicate id and a mixed batch before writing', async () => {
  const prepared = batch();
  expect(await failure(saveUnits([{ ...prepared[0], items: [] }]))).toBeInstanceOf(Error);
  expect(await failure(saveUnits([...prepared, ...prepared]))).toBeInstanceOf(Error);
  expect(await failure(saveUnits([prepared[0], { ...prepared[1], setId: 'other' }]))).toBeInstanceOf(Error);
  expect(await (await db()).count('units')).toBe(0);
});

test('a collision rolls the whole batch back; unchanged prepared identities succeed after removing it', async () => {
  const existing = await seedUnit();
  const d = await db();
  const prepared = batch();
  prepared[1].id = existing.id;
  expect(await failure(saveUnits(prepared))).toBeInstanceOf(Error);
  expect(await d.get('units', 'new-1')).toBeUndefined();
  expect(await d.get('units', existing.id)).toEqual(existing);
  await d.delete('units', existing.id);
  await saveUnits(prepared);
  expect(await d.get('units', existing.id)).toEqual(prepared[1]);
  // Even identical existing data is a collision, never evidence of a successful retry.
  expect(await failure(saveUnits(prepared))).toBeInstanceOf(Error);
});
