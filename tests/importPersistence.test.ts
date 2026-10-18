/** Imported materials and their initial units commit together, with add-only retry identities. */
import { beforeEach, expect, test } from 'bun:test';
import { article, failure, freshDb, seedUnit } from './fixtures/storage';
import { ITEMS, unitOf } from './fixtures/units';
import { db } from '../src/storage/db';
import { createImportedMaterial } from '../src/storage/exercises';
import { prepareImport } from '../src/services/exercises/importDraft';
import { draftFixture } from './fixtures/importDraft';

beforeEach(freshDb);
const material = article('imported');
const units = () => [{ ...unitOf('WORD_TRANSFORM', [ITEMS.WORD_TRANSFORM]), id: 'new-unit', materialId: material.id }];

test('creates article, units and started atomically without changing unrelated rows', async () => {
  const existing = await seedUnit();
  const d = await db();
  const before = await d.get('articles', existing.materialId);
  const prepared = units();
  await createImportedMaterial(material, prepared);
  expect(await d.get('articles', material.id)).toEqual(material);
  expect(await d.get('units', prepared[0].id)).toEqual(prepared[0]);
  expect(await d.get('meta', 'started')).toBe(true);
  expect(await d.get('articles', existing.materialId)).toEqual(before);
  expect(await d.get('units', existing.id)).toEqual(existing);
  expect(await d.count('itemStates')).toBe(0);
  expect(await d.count('attempts')).toBe(0);
});

test('creates an exercises-only workbook with empty source text and fully promoted units', async () => {
  const draft = {
    ...draftFixture,
    sourceText: '',
    units: draftFixture.units.map((unit) => ({
      ...unit,
      items: [{ ...unit.items[0], expectedAnswer: ITEMS.WORD_TRANSFORM.expectedAnswer }],
    })),
  };
  const prepared = prepareImport(draft, { kind: 'text', name: 'Worksheet', pages: [] }, 'complete', {
    materialId: material.id,
  });
  expect(prepared.errors).toEqual([]);
  const workbook = { ...material, kind: 'workbook' as const, content: '' };
  await createImportedMaterial(workbook, prepared.units);
  const d = await db();
  expect(await d.get('articles', material.id)).toEqual(workbook);
  expect(await d.getAll('units')).toEqual(prepared.units);
  expect(prepared.units[0].importSource?.extractedText).toBe('');
  expect(await d.get('meta', 'started')).toBe(true);
});

test('empty source text still requires a readable article or valid workbook units, and always id/title', async () => {
  const workbook = { ...material, kind: 'workbook' as const, content: '' };
  for (const content of ['', '   ']) {
    expect(await failure(createImportedMaterial({ ...material, kind: 'article', content }, units()))).toBeInstanceOf(
      Error,
    );
  }
  expect(await failure(createImportedMaterial(workbook, []))).toBeInstanceOf(Error);
  expect(await failure(createImportedMaterial(workbook, [{ ...units()[0], items: [] }]))).toBeInstanceOf(Error);
  for (const kind of ['article', 'workbook'] as const) {
    expect(await failure(createImportedMaterial({ ...material, kind, id: ' ' }, units()))).toBeInstanceOf(Error);
    expect(await failure(createImportedMaterial({ ...material, kind, title: ' ' }, units()))).toBeInstanceOf(Error);
  }
  const d = await db();
  expect(await d.count('articles')).toBe(0);
  expect(await d.count('units')).toBe(0);
  expect(await d.get('meta', 'started')).toBeUndefined();
});

test('rejects dangling links and duplicate initial ids before writing', async () => {
  const prepared = units();
  expect(await failure(createImportedMaterial(material, [{ ...prepared[0], materialId: 'other' }]))).toBeInstanceOf(
    Error,
  );
  expect(await failure(createImportedMaterial(material, [...prepared, ...prepared]))).toBeInstanceOf(Error);
  const d = await db();
  expect(await d.count('articles')).toBe(0);
  expect(await d.count('units')).toBe(0);
  expect(await d.get('meta', 'started')).toBeUndefined();
});

test('unit collision rolls back article; unchanged prepared identities succeed after removing collision', async () => {
  const existing = await seedUnit();
  const d = await db();
  const prepared = [{ ...units()[0], id: existing.id }];
  const error = await failure(createImportedMaterial(material, prepared));
  expect(error).toBeInstanceOf(DOMException);
  expect(await d.get('articles', material.id)).toBeUndefined();
  expect(await d.get('units', existing.id)).toEqual(existing);
  await d.delete('units', existing.id);
  await createImportedMaterial(material, prepared);
  expect(await d.get('units', existing.id)).toEqual(prepared[0]);
  // Even identical existing data is a collision, never evidence of a successful retry.
  expect(await failure(createImportedMaterial(material, prepared))).toBeInstanceOf(DOMException);
});

test('asynchronous failure preserves original error, consumes tx.done, rolls back started and permits stable retry', async () => {
  const d = await db();
  await d.put('meta', true, 'collision');
  // oxlint-disable-next-line typescript/unbound-method -- Called with the active store and restored below.
  const put = IDBObjectStore.prototype.put;
  const errors: (DOMException | null)[] = [];
  const unhandled: unknown[] = [];
  const onUnhandled = (reason: unknown) => unhandled.push(reason);
  process.on('unhandledRejection', onUnhandled);
  IDBObjectStore.prototype.put = function (value, key) {
    if (this.name !== 'meta' || key !== 'started') return put.call(this, value, key);
    const request = this.add(value, 'collision');
    request.addEventListener('error', () => errors.push(request.error));
    return request;
  };
  const prepared = units();
  try {
    const error = await failure(createImportedMaterial(material, prepared));
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(errors).toHaveLength(1);
    expect(errors[0]?.name).toBe('ConstraintError');
    expect(error).toBe(errors[0]);
    expect(unhandled).toEqual([]);
    expect(await d.count('articles')).toBe(0);
    expect(await d.count('units')).toBe(0);
    expect(await d.get('meta', 'started')).toBeUndefined();
  } finally {
    IDBObjectStore.prototype.put = put;
    process.off('unhandledRejection', onUnhandled);
  }
  await createImportedMaterial(material, prepared);
  expect(await d.get('articles', material.id)).toEqual(material);
  expect(await d.get('units', prepared[0].id)).toEqual(prepared[0]);
});
