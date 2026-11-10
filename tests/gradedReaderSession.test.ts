/** The integrated reader write queue against fake IndexedDB: drafts, checks, redo, completion, failure and stale sessions. */
import { beforeEach, expect, spyOn, test } from 'bun:test';
import { failure, freshDb } from './fixtures/storage';
import { publishedReaderFixture } from './fixtures/gradedReaders';
import { readerSession } from '../src/services/gradedReaders/session';
import * as storage from '../src/storage/gradedReaders';
import { db, importData } from '../src/storage/db';
import { readerOccurrence } from '../src/services/gradedReaders/occurrence';
import { getVocabularySnapshot, saveVocabularyBookmark } from '../src/storage/vocabulary';
import { emptyAnswer } from '../src/services/exercises/answer';
import { readerQuestionItem } from '../src/services/gradedReaders/checkpoints';

beforeEach(freshDb);
const reader = publishedReaderFixture();
const question = reader.body.learning.checkpoints[0].questions[0];
const id = question.question.id;
const answer = { ...emptyAnswer(readerQuestionItem(question)), choiceSelections: ['un livre'] };

test('open commits before use, then serialized debounced drafts/check/redo and Mark read/unread stay reader-local', async () => {
  const opened = await storage.openReaderEdition(reader, 10);
  let row = opened.row;
  const writer = readerSession(opened, (next) => {
    row = next;
  });
  expect(row.completedAt).toBeNull();
  writer.draft(id, { ...answer, choiceSelections: ['le livre'] });
  writer.draft(id, answer);
  // A single flush persists the latest draft, while Check queues behind it with the advanced revision.
  const saving = writer.flush();
  const checking = writer.check(id);
  expect(row.answers).toEqual({});
  await saving;
  await checking;
  expect(row.answers[id].answer).toEqual(answer);
  expect(row.answers[id].checked?.correct).toBe(true);
  expect(row.revision).toBe(2);
  expect(row.completedAt).toBeNull();
  const completing = writer.complete(true);
  expect(row.completedAt).toBeNull();
  await completing;
  const completedAt = row.completedAt;
  expect(typeof completedAt).toBe('number');
  await writer.redo(id);
  expect(row.answers[id]).toBeUndefined();
  expect(row.completedAt).toBe(completedAt);
  await writer.complete(false);
  expect(row.completedAt).toBeNull();
  expect((await storage.listReaderProgress())[0]).toEqual(row);
  const database = await db();
  for (const store of ['articles', 'units', 'attempts', 'itemStates', 'shadowing'] as const)
    expect(await database.getAll(store)).toEqual([]);
});

test('failed draft and completion writes retain durable state and retry the intended operation', async () => {
  const opened = await storage.openReaderEdition(reader);
  let row = opened.row;
  const writer = readerSession(opened, (next) => {
    row = next;
  });
  const save = spyOn(storage, 'saveReaderAnswer');
  const complete = spyOn(storage, 'setReaderCompletion');
  try {
    writer.draft(id, answer);
    save.mockRejectedValueOnce(new Error('TEST disk full'));
    expect(await failure(writer.check(id))).toMatchObject({ message: 'TEST disk full' });
    expect(row.answers).toEqual({});
    expect((await storage.listReaderProgress())[0].answers).toEqual({});
    await writer.check(id);
    expect(row.answers[id].checked?.correct).toBe(true);
    complete.mockRejectedValueOnce(new Error('TEST completion failed'));
    expect(await failure(writer.complete(true))).toMatchObject({ message: 'TEST completion failed' });
    expect(row.completedAt).toBeNull();
    await writer.complete(true);
    expect(row.completedAt).not.toBeNull();
  } finally {
    save.mockRestore();
    complete.mockRestore();
  }
});

test('Check drains a newer draft arriving while the prior draft commit is in flight', async () => {
  const opened = await storage.openReaderEdition(reader);
  let row = opened.row;
  const writer = readerSession(opened, (next) => {
    row = next;
  });
  const original = storage.saveReaderAnswer;
  let release!: () => void;
  let started!: () => void;
  const pending = new Promise<void>((resolve) => {
    release = resolve;
  });
  const saving = new Promise<void>((resolve) => {
    started = resolve;
  });
  const save = spyOn(storage, 'saveReaderAnswer').mockImplementationOnce(async (...args) => {
    started();
    await pending;
    return original(...args);
  });
  try {
    writer.draft(id, answer);
    const checking = writer.check(id);
    await saving;
    writer.draft(id, { ...answer, choiceSelections: ['le livre'] });
    release();
    await checking;
    expect(row.answers[id].answer.choiceSelections).toEqual(['le livre']);
    expect(row.answers[id].checked?.correct).toBe(false);
    expect(row.revision).toBe(3);
  } finally {
    save.mockRestore();
  }
});

test('a stale revision cannot overwrite a competing answer; a reloaded edition gets that committed revision', async () => {
  const opened = await storage.openReaderEdition(reader);
  const writer = readerSession(opened, () => undefined);
  await storage.saveReaderAnswer(opened.session, id, { ...answer, choiceSelections: ['le livre'] });
  writer.draft(id, answer);
  expect(await failure(writer.check(id))).toBeInstanceOf(storage.StaleReaderError);
  expect(await failure(writer.complete(true))).toBeInstanceOf(storage.StaleReaderError);
  const reloaded = await storage.openReaderEdition(reader);
  expect(reloaded.row.answers[id].answer.choiceSelections).toEqual(['le livre']);
  expect(reloaded.session.revision).toBe(1);
  expect(reloaded.row.completedAt).toBeNull();
  const fresh = readerSession(reloaded, () => undefined);
  await fresh.complete(true);
  expect((await storage.listReaderProgress())[0].completedAt).not.toBeNull();
});

test('a restored epoch invalidates pending drafts rather than resurrecting cleared progress', async () => {
  const opened = await storage.openReaderEdition(reader);
  const writer = readerSession(opened, () => undefined);
  writer.draft(id, answer);
  await importData({ gradedReaders: [] });
  expect(await failure(writer.flush())).toBeInstanceOf(storage.StaleReaderError);
  expect(await storage.listReaderProgress()).toEqual([]);
});

test('saving an elided whole clicked spelling uses its occurrence binding and reader definition, never the lemma', async () => {
  const { lookup, definition } = readerOccurrence(reader, 's1', 0, 'C’est', 'en');
  const row = await saveVocabularyBookmark(lookup, definition);
  expect(row.word).toBe('C’est');
  expect(row.key).toBe('c’est');
  expect(row.contexts[0].definition).toEqual(definition);
  expect(definition.kind).toBe('reader');
  expect(row.contexts[0].source).toEqual(lookup.source);
  expect((await getVocabularySnapshot('ce')).row).toBeUndefined();
});
