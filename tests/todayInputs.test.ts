/** Pure Today input joins: queue counts, the merged reader catalogue and the grammar step; no storage, no hooks. */
import { expect, test } from 'bun:test';
import { grammarInput, readerEntries, wordsInput } from '../src/services/today/inputs';
import { publishedReaderFixture } from './fixtures/gradedReaders';
import { bookList } from './fixtures/grammarTopics';
import { readerAnswer } from './fixtures/readerProgress';
import { initialVocabularySchedule } from '../src/utils/srs';
import { testMatureSchedule, testRow, testBook } from './fixtures/vocabulary';
import type { ReaderSummary } from '../src/services/gradedReaders/catalogue';
import type { PublishedReader } from '../src/types/gradedReader';
import type { ReaderProgress } from '../src/types/readerProgress';
import type { TopicStudied } from '../src/types/topicStudied';

const now = new Date(2026, 9, 24, 12, 30).getTime();
const start = new Date(2026, 9, 24).getTime();
const day = (introducedKeys: string[] = []) => ({ date: '2026-10-24', introducedKeys });

function reviewedRow(word: string, timestamps: number[]) {
  const row = testRow(word);
  row.history = timestamps.map((reviewedAt, index) => ({
    operationId: `${word}-${index}`,
    reviewedAt,
    outcome: 'remembered' as const,
    retentionPercent: 90,
    prior: initialVocabularySchedule(reviewedAt - 1),
    next: initialVocabularySchedule(reviewedAt),
    revision: index + 1,
  }));
  return row;
}

test('an empty queue reports no due words, no new cards and no reviews', async () => {
  expect(wordsInput([], undefined, day(), 20, now)).toEqual({ due: 0, newAvailable: 0, reviewsToday: 0 });
});

test('due counts scheduled candidates, excluding cards whose next review is later', () => {
  const due = testRow('test-due');
  due.schedule = testMatureSchedule(now);
  const later = testRow('test-later');
  later.schedule = { ...testMatureSchedule(now), dueAt: now + 2 * 86400_000 };
  expect(wordsInput([due, later], undefined, day(), 20, now)).toEqual({ due: 1, newAvailable: 0, reviewsToday: 0 });
});

test('new cards are capped by the daily allowance and by the cards actually available', async () => {
  const book = await testBook(3, 'TEST');
  expect(wordsInput([], book, day(), 2, now)).toEqual({ due: 0, newAvailable: 2, reviewsToday: 0 });
  expect(wordsInput([], book, day(), 5, now)).toEqual({ due: 0, newAvailable: 3, reviewsToday: 0 });
  expect(wordsInput([], book, day(), 0, now)).toEqual({ due: 0, newAvailable: 0, reviewsToday: 0 });
  const introduced = book!.entries.slice(0, 2).map((entry) => entry.key);
  expect(wordsInput([], book, day(introduced), 2, now)).toEqual({ due: 0, newAvailable: 0, reviewsToday: 0 });
});

test('reviews count every history entry of the local day, boundary included', () => {
  expect(wordsInput([reviewedRow('test-review', [start - 1, start])], undefined, day(), 20, now)).toEqual({
    due: 0,
    newAvailable: 0,
    reviewsToday: 1,
  });
});

const base = publishedReaderFixture();
const bundledOf = (id: string, order: number): PublishedReader => ({ ...base, body: { ...base.body, id, order } });
const summaryOf = (id: string, order: number, version = 'b'.repeat(64)): ReaderSummary => ({
  id,
  order,
  level: 'A1',
  title: base.body.title,
  version,
  artifactHash: 'c'.repeat(64),
});
const progressOf = (readerId: string, version: string, changes: Partial<ReaderProgress> = {}): ReaderProgress => ({
  readerId,
  version,
  snapshot: base,
  openedAt: start - 1,
  lastOpenedAt: now,
  lastSentenceId: null,
  answers: {},
  completedAt: null,
  revision: 0,
  ...changes,
});

test('only bundled readers, sorted by order with their progress status', () => {
  expect(
    readerEntries(
      [bundledOf('test-book-2', 2), bundledOf('test-book-1', 1)],
      [],
      [progressOf('test-book-1', base.version)],
      now,
    ),
  ).toEqual([
    { readerId: 'test-book-1', order: 1, status: 'opened', activeToday: false },
    { readerId: 'test-book-2', order: 2, status: 'notOpened', activeToday: false },
  ]);
});

test('service readers follow the bundled ones by order and carry their edition; a completed edition reads as done', () => {
  const entries = readerEntries(
    [bundledOf('test-book', 3)],
    [summaryOf('test-service', 1), summaryOf('test-service-2', 2, 'd'.repeat(64))],
    [progressOf('test-service', 'b'.repeat(64), { completedAt: now })],
    now,
  );
  expect(entries).toEqual([
    { readerId: 'test-service', order: 1, version: 'b'.repeat(64), status: 'read', activeToday: true },
    { readerId: 'test-service-2', order: 2, version: 'd'.repeat(64), status: 'notOpened', activeToday: false },
    { readerId: 'test-book', order: 3, status: 'notOpened', activeToday: false },
  ]);
  expect('version' in entries[2]).toBe(false);
});

test('a checked answer today marks the reader active even without completion', () => {
  const answers = {
    q1: {
      answer: readerAnswer(0, 'un livre'),
      checked: { checkedAt: now, correct: false, strictAccents: true as const },
    },
  };
  expect(
    readerEntries([bundledOf('test-book', 1)], [], [progressOf('test-book', base.version, { answers })], now)[0],
  ).toEqual({ readerId: 'test-book', order: 1, status: 'opened', activeToday: true });
});

test('an empty catalogue and no progress yields no entries', () => {
  expect(readerEntries([], [], [], now)).toEqual([]);
});

const mark = (topicId: string, at: number): TopicStudied => ({ topicId, at });

test('grammar takes the first unstudied topic in book order, skipping studied ids', () => {
  expect(grammarInput(bookList, [mark('test-one', start - 1)], now, 'en')).toEqual({
    next: { topicId: 'test-two', title: 'TEST two' },
    studiedToday: false,
  });
});

test('grammar counts a studied mark from the local midnight boundary onward', () => {
  expect(grammarInput(bookList, [mark('test-one', start)], now, 'en').studiedToday).toBe(true);
  expect(grammarInput(bookList, [mark('test-one', start - 1)], now, 'en').studiedToday).toBe(false);
});

test('grammar titles follow the interface language; an all-studied book leaves no next topic', () => {
  expect(grammarInput(bookList, [], now, 'zh').next).toEqual({ topicId: 'test-one', title: 'TEST zh one' });
  expect(
    grammarInput(
      bookList,
      bookList.map((entry) => mark(entry.id, start)),
      now,
      'zh',
    ),
  ).toEqual({
    studiedToday: true,
  });
});
