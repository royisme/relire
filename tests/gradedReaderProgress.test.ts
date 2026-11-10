/** Reader-owned durability and session guards on invented TEST editions, without UI or exercise writes. */
import { beforeEach, expect, test } from 'bun:test';
import { freshDb, failure } from './fixtures/storage';
import { publishedReaderFixture } from './fixtures/gradedReaders';
import { readerAnswer, testReaderGrader } from './fixtures/readerProgress';
import { db, exportData, importData } from '../src/storage/db';
import { readerProgressKey } from '../src/types/readerProgress';
import {
  openReaderEdition,
  listReaderProgress,
  saveReaderAnswer,
  checkReaderAnswer,
  redoReaderQuestion,
  setReaderCompletion,
  subscribeReaders,
  StaleReaderError,
  ReaderEditionConflictError,
} from '../src/storage/gradedReaders';
import { vocabularyHash } from '../src/services/vocabulary/book';

beforeEach(freshDb);
test('open commits a snapshot; explicit reopen preserves it and progress without counting reading time', async () => {
  const reader = publishedReaderFixture();
  const opened = await openReaderEdition(reader, 10);
  expect(opened.row).toMatchObject({
    snapshot: reader,
    openedAt: 10,
    lastOpenedAt: 10,
    completedAt: null,
    answers: {},
  });
  const saved = await saveReaderAnswer(opened.session, 'type-size', readerAnswer(1, 'petit'));
  expect(saved.row.lastOpenedAt).toBe(10);
  const reopened = await openReaderEdition(reader, 20);
  expect(reopened.row).toEqual({ ...saved.row, lastOpenedAt: 20 });
  expect(await listReaderProgress()).toEqual([reopened.row]);
});
test('invalid hashes and different snapshots under an existing edition never replace it', async () => {
  const reader = publishedReaderFixture();
  const original = await openReaderEdition(reader, 10);
  const changed = structuredClone(reader);
  changed.body.title.en = 'TEST changed title';
  expect(await failure(openReaderEdition(changed))).toBeInstanceOf(ReaderEditionConflictError);
  const changedReview = structuredClone(reader);
  changedReview.review.reviewedBy = 'TEST different review';
  expect(await failure(openReaderEdition(changedReview))).toBeInstanceOf(ReaderEditionConflictError);
  // Simulate a conflicting persisted snapshot to exercise collision comparison after valid input hashing.
  const key = readerProgressKey(reader.body.id, reader.version);
  await (await db()).put('meta', { ...original.row, snapshot: changed }, key);
  expect(await failure(openReaderEdition(reader))).toBeInstanceOf(ReaderEditionConflictError);
});
test('each save merges its question only; stale cross-tab revisions reject and checking is idempotent', async () => {
  const first = await openReaderEdition(publishedReaderFixture(), 10);
  const saved = await saveReaderAnswer(first.session, 'type-size', readerAnswer(1, 'petit'));
  expect(await failure(saveReaderAnswer(first.session, 'recognize-book', readerAnswer(0, 'un livre')))).toBeInstanceOf(
    StaleReaderError,
  );
  const choice = await saveReaderAnswer(saved.session, 'recognize-book', readerAnswer(0, 'un livre'));
  expect(choice.row.answers['type-size']).toEqual(saved.row.answers['type-size']);
  let calls = 0;
  const checked = await checkReaderAnswer(
    choice.session,
    'type-size',
    (question, answer) => {
      calls++;
      return testReaderGrader(question, answer);
    },
    30,
  );
  const duplicate = await checkReaderAnswer(
    choice.session,
    'type-size',
    () => {
      throw new Error('Duplicate must not grade');
    },
    40,
  );
  expect(duplicate).toEqual(checked);
  expect(calls).toBe(1);
  expect(checked.row.answers['type-size'].checked).toEqual({ correct: true, strictAccents: true, checkedAt: 30 });
  expect(checked.row.completedAt).toBeNull();
  expect((await exportData()).attempts).toEqual([]);
  expect((await exportData()).units).toEqual([]);
});
test('redo clears only one question and invalidates queued drafts; completion is independent and reversible', async () => {
  const first = await openReaderEdition(publishedReaderFixture(), 10);
  const typed = await saveReaderAnswer(first.session, 'type-size', readerAnswer(1, 'petit'));
  const choice = await saveReaderAnswer(typed.session, 'recognize-book', readerAnswer(0, 'un livre'));
  const checked = await checkReaderAnswer(choice.session, 'type-size', testReaderGrader, 20);
  const completed = await setReaderCompletion(checked.session, true, 30);
  expect(completed.row.completedAt).toBe(30);
  const redo = await redoReaderQuestion(completed.session, 'type-size');
  expect(redo.row.answers).toEqual({ 'recognize-book': choice.row.answers['recognize-book'] });
  expect(redo.row.completedAt).toBe(30);
  expect(
    await failure(saveReaderAnswer(completed.session, 'type-size', readerAnswer(1, 'old queued draft'))),
  ).toBeInstanceOf(StaleReaderError);
  const cleared = await setReaderCompletion(redo.session, false);
  expect(cleared.row.completedAt).toBeNull();
  expect(cleared.row.answers).toEqual(redo.row.answers);
});
test('completion needs no answers; failed checks preserve drafts and strict verdicts remain reader-local', async () => {
  const opened = await openReaderEdition(publishedReaderFixture(), 10);
  const completed = await setReaderCompletion(opened.session, true, 20);
  expect(completed.row.answers).toEqual({});
  const saved = await saveReaderAnswer(completed.session, 'type-size', readerAnswer(1, 'pétit'));
  expect(
    await failure(
      checkReaderAnswer(saved.session, 'type-size', () => {
        throw new Error('TEST grader failure');
      }),
    ),
  ).toBeInstanceOf(Error);
  expect(await listReaderProgress()).toEqual([saved.row]);
  const checked = await checkReaderAnswer(saved.session, 'type-size', testReaderGrader, 30);
  expect(checked.row.answers['type-size'].checked?.correct).toBe(false);
  expect(checked.row.completedAt).toBe(20);
  const cleared = await setReaderCompletion(checked.session, false);
  expect(await failure(checkReaderAnswer(saved.session, 'type-size', testReaderGrader))).toBeInstanceOf(
    StaleReaderError,
  );
  expect(cleared.row.completedAt).toBeNull();
  expect(cleared.row.answers).toEqual(checked.row.answers);
});
test('restore epoch rejects mounted sessions, including a removed edition without resurrection', async () => {
  const opened = await openReaderEdition(publishedReaderFixture());
  const backup = await exportData();
  await importData(backup, testReaderGrader);
  expect(await failure(setReaderCompletion(opened.session, true))).toBeInstanceOf(StaleReaderError);
  const reopened = await openReaderEdition(publishedReaderFixture());
  await importData({ gradedReaders: [] });
  expect(await failure(saveReaderAnswer(reopened.session, 'type-size', readerAnswer(1, 'petit')))).toBeInstanceOf(
    StaleReaderError,
  );
  expect(await listReaderProgress()).toEqual([]);
});
test('lists follow stage then stable edition identity; empty is not a swallowed read failure', async () => {
  expect(await listReaderProgress()).toEqual([]);
  const later = publishedReaderFixture();
  later.body.id = 'test-later';
  later.body.order = 2;
  later.version = later.review.contentHash = await vocabularyHash(later.body);
  await openReaderEdition(later);
  await openReaderEdition(publishedReaderFixture());
  expect((await listReaderProgress()).map((row) => row.readerId)).toEqual(['test-book', 'test-later']);
  const d = await db();
  d.close();
  expect(await failure(listReaderProgress())).toBeInstanceOf(Error);
});
test('native post-request abort leaves no durable mutation or notification, then retry commits before notification', async () => {
  const first = await openReaderEdition(publishedReaderFixture());
  let notifications = 0;
  const unsubscribe = subscribeReaders(async () => {
    expect((await listReaderProgress())[0].answers['type-size'].answer.singleAnswer).toBe('petit');
    notifications++;
  });
  // oxlint-disable-next-line typescript/unbound-method -- Native abort injection restores the method below.
  const put = IDBObjectStore.prototype.put;
  IDBObjectStore.prototype.put = function (value, key) {
    const request = put.call(this, value, key);
    if (this.name === 'meta') request.addEventListener('success', () => this.transaction.abort());
    return request;
  };
  try {
    expect(await failure(saveReaderAnswer(first.session, 'type-size', readerAnswer(1, 'petit')))).toBeInstanceOf(Error);
    expect(await listReaderProgress()).toEqual([first.row]);
    expect(notifications).toBe(0);
  } finally {
    IDBObjectStore.prototype.put = put;
  }
  try {
    await saveReaderAnswer(first.session, 'type-size', readerAnswer(1, 'petit'));
    expect(notifications).toBe(1);
  } finally {
    unsubscribe();
  }
});
