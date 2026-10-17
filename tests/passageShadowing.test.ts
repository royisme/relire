/** Passage provenance, legacy keys, transactional ownership and optional backup lifetimes. */
import { beforeEach, expect, test } from 'bun:test';
import { article, failure, freshDb, putArticle } from './fixtures/storage';
import { CATALOG_EXERCISES } from './fixtures/exerciseCatalog';
import { db, deleteArticleData, exportData, importData } from '../src/storage/db';
import { deleteUnit, getUnit, resetUnit, saveUnits } from '../src/storage/exercises';
import {
  addTake,
  ArticleGoneError,
  getShadowingSentence,
  listShadowing,
  parseShadowingBackup,
  shadowingKey,
  sourceSentenceKey,
  ShadowingBackupError,
} from '../src/storage/shadowing';
import type { ReaderSource } from '../src/types/readerSource';

beforeEach(freshDb);
const content = 'Nous visitons le jardin. Les oiseaux chantent.';
const text = 'Nous visitons le jardin.';
const take = (recordedAt = 1) => ({
  blob: new Blob(['audio'], { type: 'audio/webm' }),
  mimeType: 'audio/webm',
  durationMs: 900,
  recordedAt,
});
const passage = (unitId = 'passage-1', materialId = 'material-1'): ReaderSource => ({
  kind: 'passage',
  materialId,
  unitId,
});

// Bun has no FileReader; actual browser export is covered by passage-reader.spec.ts.
async function recordingFixture() {
  return (await listShadowing()).map((record) => ({
    articleId: record.articleId,
    ...(record.passage ? { passage: record.passage } : {}),
    text: record.text,
    takes: record.takes.map((t) => ({
      id: t.id,
      recordedAt: t.recordedAt,
      mimeType: t.mimeType,
      durationMs: t.durationMs,
      data: btoa('audio'),
    })),
  }));
}

async function seed(materialId = 'material-1', ids = ['passage-1', 'passage-2']) {
  await putArticle(materialId);
  const base = CATALOG_EXERCISES.units.find((u) => u.type === 'READING_CLOZE')!;
  return saveUnits(
    materialId,
    ids.map((id, i) => ({ ...base, id, unitNumber: i + 1, readingPassage: { title: 'Le jardin', content } })),
  );
}

test('identical normalized sentences in material and two passages have independent keys and three-take FIFO', async () => {
  const materialId = 'material|/:é%';
  const ids = ['unit|/%:é', 'unit%7C/%:é'];
  await seed(materialId, ids);
  await addTake(materialId, text, take());
  for (let i = 1; i <= 4; i++)
    await addTake(passage(ids[0], materialId), `  ${text.toUpperCase()}  `, take(i), content);
  await addTake(passage(ids[1], materialId), text, take());
  const records = await listShadowing();
  expect(new Set(records.map((r) => r.key)).size).toBe(3);
  expect((await getShadowingSentence(materialId, text))?.key).toBe(shadowingKey(materialId, text));
  expect((await getShadowingSentence(passage(ids[0], materialId), text))?.takes.map((t) => t.recordedAt)).toEqual([
    2, 3, 4,
  ]);
  expect((await getShadowingSentence(passage(ids[1], materialId), text))?.takes).toHaveLength(1);
  expect(sourceSentenceKey(passage(ids[0], materialId), text)).not.toContain('|');
  const legacyCollision = sourceSentenceKey(passage(ids[0], materialId), text);
  expect(shadowingKey(legacyCollision, text)).not.toBe(legacyCollision);
});

test('addTake guards deleted, wrong-owner, absent passage and changed capture content inside its write transaction', async () => {
  await seed();
  await putArticle('other');
  expect(await failure(addTake(passage('passage-1', 'other'), text, take(), content))).toBeInstanceOf(ArticleGoneError);
  const d = await db();
  const unit = (await getUnit('passage-1'))!;
  await d.put('units', { ...unit, readingPassage: { content: `${content} Une phrase ajoutée.` } });
  expect(await failure(addTake(passage(), text, take(), content))).toBeInstanceOf(ArticleGoneError);
  await d.put('units', { ...unit, readingPassage: undefined });
  expect(await failure(addTake(passage(), text, take()))).toBeInstanceOf(ArticleGoneError);
  await deleteUnit('passage-1');
  expect(await failure(addTake(passage(), text, take(), content))).toBeInstanceOf(ArticleGoneError);
  await deleteArticleData('material-1');
  expect(await failure(addTake(passage('passage-2'), text, take(), content))).toBeInstanceOf(ArticleGoneError);
  expect(await listShadowing()).toEqual([]);
});

test('a pending save cannot resurrect a deleted material or unit, while reset retains recordings and attempts', async () => {
  await seed();
  await addTake(passage(), text, take(), content);
  const d = await db();
  await d.put('attempts', {
    id: 'attempt',
    unitId: 'passage-1',
    itemId: 'rc-1',
    materialId: 'material-1',
    grammarTag: 'reading-comprehension',
    prompt: 'prompt',
    userAnswer: 'answer',
    expectedAnswer: 'expected',
    correct: false,
    timestamp: 1,
  });
  await resetUnit('passage-1');
  expect(await listShadowing()).toHaveLength(1);
  expect(await d.getAll('attempts')).toHaveLength(1);
  // The delete transaction is queued first, as when Stop's asynchronous recorder result arrives late.
  const deletion = deleteUnit('passage-1');
  const save = addTake(passage(), text, take(2), content);
  await deletion;
  expect(await failure(save)).toBeInstanceOf(ArticleGoneError);
  expect((await listShadowing())[0].takes).toHaveLength(1);
  await addTake('material-1', text, take());
  await addTake(passage('passage-2'), text, take(), content);
  await deleteArticleData('material-1');
  expect(await listShadowing()).toEqual([]);
  expect(await d.getAll('attempts')).toHaveLength(1);
});

test('optional recording backup roundtrips live passages, removed unit history and unchanged legacy article records', async () => {
  await seed();
  await addTake('material-1', text, take());
  await addTake(passage(), text, take(2), content);
  await addTake(passage('passage-2'), text, take(3), content);
  await deleteUnit('passage-2');
  const backup = await exportData();
  const recordings = await recordingFixture();
  const legacy = recordings.find((r) => !r.passage)!;
  expect(legacy).not.toHaveProperty('passage');
  const original = await listShadowing();
  await freshDb();
  await importData({ ...backup, shadowing: parseShadowingBackup(recordings) });
  const restored = await listShadowing();
  expect(restored.map((r) => [r.key, r.articleId, r.passage, r.text, r.takes.map((t) => t.id)])).toEqual(
    original.map((r) => [r.key, r.articleId, r.passage, r.text, r.takes.map((t) => t.id)]),
  );
  for (const record of restored) expect(await record.takes[0].blob.text()).toBe('audio');
  expect(await getUnit('passage-2')).toBeUndefined();
  // A backup without recordings keeps them even when its units/materials are replaced.
  await importData({ articles: [], units: [] });
  expect(await listShadowing()).toHaveLength(3);
  const historical = await recordingFixture();
  await importData({ articles: [], units: [], shadowing: parseShadowingBackup(historical) });
  expect(await listShadowing()).toHaveLength(3);
  await importData({ shadowing: [] });
  expect(await listShadowing()).toEqual([]);
});

test('malformed provenance and duplicate source sentences reject; changed historical text remains valid', async () => {
  await seed();
  await addTake(passage(), text, take(), content);
  const [record] = await recordingFixture();
  for (const bad of [null, {}, { unitId: '' }, { unitId: 4 }, { unitId: 'passage-1', materialId: 'other' }]) {
    expect(() => parseShadowingBackup([{ ...record, passage: bad }])).toThrow(ShadowingBackupError);
  }
  expect(() => parseShadowingBackup([record, { ...record, text: text.toUpperCase() }])).toThrow(ShadowingBackupError);
  const changed = parseShadowingBackup([{ ...record, text: 'Le texte original a changé.' }]);
  await importData({ shadowing: changed });
  expect((await listShadowing())[0].text).toBe('Le texte original a changé.');
});

test('restore refuses surviving-unit material mismatch atomically without corrupting existing takes', async () => {
  await seed();
  await putArticle('other');
  await addTake('material-1', text, take());
  const [legacy] = await recordingFixture();
  const inconsistent = parseShadowingBackup([{ ...legacy, articleId: 'other', passage: { unitId: 'passage-1' } }]);
  expect(
    await failure(importData({ articles: [article('material-1'), article('other')], shadowing: inconsistent })),
  ).toBeInstanceOf(Error);
  const [survivor] = await listShadowing();
  expect(survivor.passage).toBeUndefined();
  expect(survivor.key).toBe(shadowingKey('material-1', text));
  expect(await getUnit('passage-1')).toBeDefined();
});
