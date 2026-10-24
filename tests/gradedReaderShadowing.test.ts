/** Graded-edition recording ownership: snapshot-guarded saves, FIFO, backup owners and log resolution. */
import { beforeEach, expect, spyOn, test } from 'bun:test';
import * as translations from 'react-i18next';
import { createInstance } from 'i18next';
import { freshDb, failure, putArticle } from './fixtures/storage';
import { gradedReaderFixture, publishedReaderFixture } from './fixtures/gradedReaders';
import { readerHookProbe } from './fixtures/readerHookProbe';
import { contentHash } from '../scripts/graded-readers/gateInputs';
import { db, exportData, importData } from '../src/storage/db';
import { openReaderEdition } from '../src/storage/gradedReaders';
import { readerProgressKey } from '../src/types/readerProgress';
import {
  addTake,
  ArticleGoneError,
  getShadowingSentence,
  listShadowing,
  parseShadowingBackup,
  shadowingKey,
  sourceOfRecording,
  sourceSentenceKey,
  ShadowingBackupError,
  type ShadowingBackup,
} from '../src/storage/shadowing';
import type { ReaderSource } from '../src/types/readerSource';
import { useShadowingLog } from '../src/hooks/useShadowingLog';
import { parseRoute, routeHref } from '../src/utils/routes';
import en from '../src/i18n/locales/en.json';
import zh from '../src/i18n/locales/zh.json';

beforeEach(freshDb);
const reader = publishedReaderFixture();
const text = reader.body.sentences[0].fr;
const graded: ReaderSource = { kind: 'graded', readerId: reader.body.id, version: reader.version };
const take = (recordedAt = 1) => ({
  blob: new Blob(['audio'], { type: 'audio/webm' }),
  mimeType: 'audio/webm',
  durationMs: 900,
  recordedAt,
});

// Bun has no FileReader; the backup fixture is assembled by hand as exportShadowing would.
async function recordingFixture(): Promise<ShadowingBackup[]> {
  return (await listShadowing()).map((record) => ({
    ...(record.graded
      ? { graded: record.graded }
      : record.passage
        ? { passage: record.passage }
        : { articleId: record.articleId }),
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

/** A second body edition of the same reader: identical sentences, different version. */
function secondEdition() {
  const body = gradedReaderFixture();
  body.title.en = 'TEST second edition';
  const version = contentHash(body);
  return { ...reader, body, version, review: { ...reader.review, contentHash: version } };
}

test('a graded take saves only for a locally opened edition and a snapshot sentence, three-take FIFO', async () => {
  expect(await failure(addTake(graded, text, take()))).toBeInstanceOf(ArticleGoneError);
  await openReaderEdition(reader);
  expect(await failure(addTake(graded, 'Une phrase absente du snapshot.', take()))).toBeInstanceOf(ArticleGoneError);
  for (let i = 1; i <= 4; i++) await addTake(graded, `  ${text.toUpperCase()}  `, take(i));
  const record = (await getShadowingSentence(graded, text))!;
  expect(record.key).toBe(sourceSentenceKey(graded, text));
  expect(record.graded).toEqual({ readerId: reader.body.id, version: reader.version });
  expect(record.articleId).toBeUndefined();
  expect(record.passage).toBeUndefined();
  expect(record.takes.map((t) => t.recordedAt)).toEqual([2, 3, 4]);
  expect(await listShadowing()).toHaveLength(1);
});

test('the same sentence text in two editions and an article never merges; article keys stay plain', async () => {
  const second = secondEdition();
  await openReaderEdition(reader);
  await openReaderEdition(second);
  await putArticle('material-1');
  await addTake('material-1', text, take());
  await addTake(graded, text, take(1));
  await addTake({ kind: 'graded', readerId: reader.body.id, version: second.version }, text, take(2));
  const records = await listShadowing();
  expect(records).toHaveLength(3);
  expect(new Set(records.map((r) => r.key)).size).toBe(3);
  expect(records.find((r) => r.articleId)!.key).toBe(shadowingKey('material-1', text));
  expect(sourceSentenceKey(graded, text).startsWith('graded:')).toBe(true);
  expect(sourceSentenceKey(graded, text)).not.toContain('|');
});

test('backup roundtrips a graded owner; without the recordings key existing rows are kept, [] clears them', async () => {
  await openReaderEdition(reader);
  await addTake(graded, text, take());
  const backup = await exportData();
  const recordings = await recordingFixture();
  const [record] = recordings;
  expect(record.graded).toEqual({ readerId: reader.body.id, version: reader.version });
  expect(record).not.toHaveProperty('articleId');
  expect(record).not.toHaveProperty('passage');
  const original = await listShadowing();
  await freshDb();
  // The restore carries no reader progress row: the take stays valid unavailable history.
  await importData({ ...backup, shadowing: parseShadowingBackup(recordings) });
  const restored = await listShadowing();
  expect(restored.map((r) => [r.key, r.graded, r.text, r.takes.map((t) => t.id)])).toEqual(
    original.map((r) => [r.key, r.graded, r.text, r.takes.map((t) => t.id)]),
  );
  expect(await restored[0].takes[0].blob.text()).toBe('audio');
  await importData({ articles: [] });
  expect(await listShadowing()).toHaveLength(1);
  await importData({ shadowing: [] });
  expect(await listShadowing()).toEqual([]);
});

test('each malformed graded owner rejects the whole restore', async () => {
  await openReaderEdition(reader);
  await addTake(graded, text, take());
  const [record] = await recordingFixture();
  const owner = { readerId: reader.body.id, version: reader.version };
  for (const bad of [
    null,
    {},
    { readerId: reader.body.id },
    { readerId: reader.body.id, version: 'not-a-hash' },
    { readerId: 'TEST-Book', version: reader.version },
    { readerId: 'test-book', version: reader.version, extra: 1 },
  ]) {
    expect(() => parseShadowingBackup([{ ...record, graded: bad }])).toThrow(ShadowingBackupError);
  }
  // Mixed or missing owners refuse; an unexpected top-level key refuses.
  expect(() => parseShadowingBackup([{ ...record, graded: owner, articleId: 'material-1' }])).toThrow(
    ShadowingBackupError,
  );
  expect(() => parseShadowingBackup([{ ...record, graded: owner, passage: { unitId: 'unit-1' } }])).toThrow(
    ShadowingBackupError,
  );
  expect(() => parseShadowingBackup([{ ...record, graded: owner, bogus: true }])).toThrow(ShadowingBackupError);
});

test('a recording whose progress row is gone stays playable, is never re-created or re-attributed', async () => {
  await openReaderEdition(reader);
  await addTake(graded, text, take());
  await (await db()).delete('meta', readerProgressKey(reader.body.id, reader.version));
  const [record] = await listShadowing();
  expect(record.graded).toEqual({ readerId: reader.body.id, version: reader.version });
  expect(await record.takes[0].blob.text()).toBe('audio');
  expect(await failure(addTake(graded, text, take(2)))).toBeInstanceOf(ArticleGoneError);
});

/** Renders the log hook against the seeded database; i18next supplies the unavailable label. */
async function drawLog() {
  const i18n = createInstance();
  await i18n.init({ lng: 'en', resources: { en: { translation: en }, zh: { translation: zh } }, initAsync: false });
  const translation = spyOn(translations, 'useTranslation').mockReturnValue({
    t: i18n.t.bind(i18n),
    i18n,
    ready: true,
  } as unknown as ReturnType<typeof translations.useTranslation>);
  const probe = readerHookProbe();
  const log = () => probe.render(() => useShadowingLog([], [], null));
  log();
  probe.effects();
  await Bun.sleep(50);
  const read = () => log();
  return {
    read,
    done: () => {
      probe.restore();
      translation.mockRestore();
    },
  };
}

test('the log groups graded takes under the edition title and deep-links the pinned sentence', async () => {
  await openReaderEdition(reader);
  await addTake(graded, text, take());
  await addTake(graded, reader.body.sentences[1].fr, take(2));
  const view = await drawLog();
  try {
    const { groups, removed, loading } = view.read();
    expect(loading).toBe(false);
    expect(removed).toEqual([]);
    expect(groups).toHaveLength(1);
    const [group] = groups;
    expect(group.document.title).toBe(reader.body.title.fr);
    expect(group.unavailable).toBeUndefined();
    expect(group.rows.map((row) => row.record.text)).toEqual([
      reader.body.sentences[0].fr,
      reader.body.sentences[1].fr,
    ]);
    // The App mapping: an available graded row opens the pinned edition and sentence.
    const source = sourceOfRecording(group.rows[0].record);
    expect(source).toEqual(graded);
    const href = routeHref({
      name: 'gradedReader',
      readerId: source.kind === 'graded' ? source.readerId : '',
      version: source.kind === 'graded' ? source.version : undefined,
      sentence: group.rows[0].record.text,
    });
    expect(href).toBe(`#/read/graded/${reader.body.id}?version=${reader.version}&sentence=${encodeURIComponent(text)}`);
    expect(parseRoute(href).route).toEqual({
      name: 'gradedReader',
      readerId: reader.body.id,
      version: reader.version,
      sentence: text,
    });
  } finally {
    view.done();
  }
});

test('without the snapshot the log lists the takes as an unavailable edition, playable and never removed', async () => {
  await openReaderEdition(reader);
  await addTake(graded, text, take());
  await (await db()).delete('meta', readerProgressKey(reader.body.id, reader.version));
  const view = await drawLog();
  try {
    const { groups, removed } = view.read();
    expect(removed).toEqual([]);
    expect(groups).toHaveLength(1);
    const [group] = groups;
    expect(group.unavailable).toBe(true);
    expect(group.document.title).toBe(en.shadowingLog.unavailableEdition.replace('{{id}}', reader.body.id));
    expect(group.rows).toHaveLength(1);
    expect(group.rows[0].record.takes[0].blob.size).toBeGreaterThan(0);
  } finally {
    view.done();
  }
});
