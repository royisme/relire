/** Passage recordings owned by their unit, article keys, transactional ownership and optional backup lifetimes. */
import { beforeEach, expect, test } from 'bun:test';
import { failure, freshDb, putArticle } from './fixtures/storage';
import { CATALOG_EXERCISES } from './fixtures/exerciseCatalog';
import { db, deleteArticleData, deleteSetData, exportData, importData } from '../src/storage/db';
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
  type ShadowingBackup,
} from '../src/storage/shadowing';
import type { RecordableReaderSource as ReaderSource } from '../src/types/readerSource';

beforeEach(freshDb);
const content = 'Nous visitons le jardin. Les oiseaux chantent.';
const text = 'Nous visitons le jardin.';
const take = (recordedAt = 1) => ({
  blob: new Blob(['audio'], { type: 'audio/webm' }),
  mimeType: 'audio/webm',
  durationMs: 900,
  recordedAt,
});
const passage = (unitId = 'passage-1'): ReaderSource => ({ kind: 'passage', unitId });

// Bun has no FileReader; actual browser export is covered by passage-reader.spec.ts.
async function recordingFixture(): Promise<ShadowingBackup[]> {
  return (await listShadowing()).map((record) => ({
    ...(record.passage ? { passage: record.passage } : { articleId: record.articleId }),
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

async function seed(setId = 'set-1', ids = ['passage-1', 'passage-2']) {
  const base = CATALOG_EXERCISES.units.find((u) => u.type === 'READING_CLOZE')!;
  return saveUnits(
    ids.map((id, i) => ({
      ...base,
      id,
      unitNumber: i + 1,
      setId,
      level: 'B1' as const,
      createdAt: 1_700_000_000_000,
      readingPassage: { title: 'Le jardin', content },
    })),
  );
}

test('identical normalized sentences in an article and two passages have independent keys and three-take FIFO', async () => {
  const articleId = 'material|/:é%';
  const ids = ['unit|/%:é', 'unit%7C/%:é'];
  await putArticle(articleId);
  await seed('set-1', ids);
  await addTake(articleId, text, take());
  for (let i = 1; i <= 4; i++) await addTake(passage(ids[0]), `  ${text.toUpperCase()}  `, take(i), content);
  await addTake(passage(ids[1]), text, take());
  const records = await listShadowing();
  expect(new Set(records.map((r) => r.key)).size).toBe(3);
  expect((await getShadowingSentence(articleId, text))?.key).toBe(shadowingKey(articleId, text));
  expect((await getShadowingSentence(passage(ids[0]), text))?.takes.map((t) => t.recordedAt)).toEqual([2, 3, 4]);
  expect((await getShadowingSentence(passage(ids[1]), text))?.takes).toHaveLength(1);
  expect(sourceSentenceKey(passage(ids[0]), text)).not.toContain('|');
  const passageKey = sourceSentenceKey(passage(ids[0]), text);
  expect(shadowingKey(passageKey, text)).not.toBe(passageKey);
  // A passage recording carries its unit and no article.
  expect(records.filter((r) => r.passage).every((r) => r.articleId === undefined)).toBe(true);
});

test('addTake guards absent passage, changed capture content, deleted unit and deleted article inside its write transaction', async () => {
  await seed();
  const d = await db();
  const unit = (await getUnit('passage-1'))!;
  await d.put('units', { ...unit, readingPassage: { content: `${content} Une phrase ajoutée.` } });
  expect(await failure(addTake(passage(), text, take(), content))).toBeInstanceOf(ArticleGoneError);
  await d.put('units', { ...unit, readingPassage: undefined });
  expect(await failure(addTake(passage(), text, take()))).toBeInstanceOf(ArticleGoneError);
  await deleteUnit('passage-1');
  expect(await failure(addTake(passage(), text, take(), content))).toBeInstanceOf(ArticleGoneError);
  expect(await failure(addTake('gone', text, take()))).toBeInstanceOf(ArticleGoneError);
  expect(await listShadowing()).toEqual([]);
});

test('a pending save cannot resurrect a deleted unit, while reset retains recordings and attempts', async () => {
  await seed();
  await putArticle('material-1');
  await addTake(passage(), text, take(), content);
  const d = await db();
  await d.put('attempts', {
    id: 'attempt',
    learningArea: 'reading',
    unitId: 'passage-1',
    itemId: 'rc-1',
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
});

test('deleting an article removes only its own recordings; deleting a set removes its passage recordings and keeps attempts', async () => {
  await putArticle('material-1');
  await seed('set-1', ['passage-1', 'passage-2']);
  await seed('set-2', ['passage-3']);
  await addTake('material-1', text, take());
  await addTake(passage('passage-1'), text, take(), content);
  await addTake(passage('passage-2'), text, take(), content);
  await addTake(passage('passage-3'), text, take(), content);
  const d = await db();
  await d.put('attempts', {
    id: 'attempt',
    learningArea: 'reading',
    unitId: 'passage-1',
    itemId: 'rc-1',
    grammarTag: 'reading-comprehension',
    prompt: 'prompt',
    userAnswer: 'answer',
    expectedAnswer: 'expected',
    correct: false,
    timestamp: 1,
  });

  await deleteArticleData('material-1');
  // The article's own recording is gone; every passage recording stays.
  expect(
    (await listShadowing()).map((r) => r.passage?.unitId).sort((a, b) => String(a).localeCompare(String(b))),
  ).toEqual(['passage-1', 'passage-2', 'passage-3']);
  expect(await getUnit('passage-1')).toBeDefined();

  await deleteSetData('set-1');
  expect((await listShadowing()).map((r) => r.passage?.unitId)).toEqual(['passage-3']);
  expect(await getUnit('passage-1')).toBeUndefined();
  expect(await getUnit('passage-3')).toBeDefined();
  expect(await d.getAll('attempts')).toHaveLength(1);
});

test('optional recording backup roundtrips live passages, removed unit history and article records', async () => {
  await seed();
  await putArticle('material-1');
  await addTake('material-1', text, take());
  await addTake(passage(), text, take(2), content);
  await addTake(passage('passage-2'), text, take(3), content);
  await deleteUnit('passage-2');
  const backup = await exportData();
  const recordings = await recordingFixture();
  const articleRecord = recordings.find((r) => !r.passage)!;
  expect(articleRecord).not.toHaveProperty('passage');
  for (const record of recordings.filter((r) => r.passage)) expect(record).not.toHaveProperty('articleId');
  const original = await listShadowing();
  await freshDb();
  await importData({ ...backup, shadowing: parseShadowingBackup(recordings) });
  const restored = await listShadowing();
  expect(restored.map((r) => [r.key, r.articleId, r.passage, r.text, r.takes.map((t) => t.id)])).toEqual(
    original.map((r) => [r.key, r.articleId, r.passage, r.text, r.takes.map((t) => t.id)]),
  );
  for (const record of restored) expect(await record.takes[0].blob.text()).toBe('audio');
  expect(await getUnit('passage-2')).toBeUndefined();
  // A backup without recordings keeps them even when its units and articles are replaced.
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
  // Exactly one owner: both or neither is refused.
  expect(() => parseShadowingBackup([{ ...record, articleId: 'material-1' }])).toThrow(ShadowingBackupError);
  expect(() => parseShadowingBackup([{ ...record, passage: undefined }])).toThrow(ShadowingBackupError);
  expect(() => parseShadowingBackup([record, { ...record, text: text.toUpperCase() }])).toThrow(ShadowingBackupError);
  const changed = parseShadowingBackup([{ ...record, text: 'Le texte original a changé.' }]);
  await importData({ shadowing: changed });
  expect((await listShadowing())[0].text).toBe('Le texte original a changé.');
});
