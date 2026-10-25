/** Pure Today input joins: queue counts, the merged reader catalogue and the grammar step; no storage, no hooks. */
import { expect, test } from 'bun:test';
import { grammarInput, nextAvailableAt, readerEntries, wordsInput } from '../src/services/today/inputs';
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
  expect(wordsInput([], undefined, day(), 20, now)).toEqual({
    due: 0,
    newAvailable: 0,
    nextDue: null,
    reviewsToday: 0,
  });
});

test('due counts scheduled candidates, excluding cards whose next review is later', () => {
  const due = testRow('test-due');
  due.schedule = testMatureSchedule(now);
  const later = testRow('test-later');
  later.schedule = { ...testMatureSchedule(now), dueAt: now + 2 * 86400_000 };
  expect(wordsInput([due, later], undefined, day(), 20, now)).toEqual({
    due: 1,
    newAvailable: 0,
    nextDue: new Date(2026, 9, 26).getTime(),
    reviewsToday: 0,
  });
});

test('new cards are capped by the daily allowance and by the cards actually available', async () => {
  const book = await testBook(3, 'TEST');
  expect(wordsInput([], book, day(), 2, now)).toEqual({ due: 0, newAvailable: 2, nextDue: null, reviewsToday: 0 });
  expect(wordsInput([], book, day(), 5, now)).toEqual({ due: 0, newAvailable: 3, nextDue: null, reviewsToday: 0 });
  expect(wordsInput([], book, day(), 0, now)).toEqual({ due: 0, newAvailable: 0, nextDue: null, reviewsToday: 0 });
  const introduced = book!.entries.slice(0, 2).map((entry) => entry.key);
  expect(wordsInput([], book, day(introduced), 2, now)).toEqual({
    due: 0,
    newAvailable: 0,
    nextDue: null,
    reviewsToday: 0,
  });
});

test('reviews count every history entry of the local day, boundary included', () => {
  expect(wordsInput([reviewedRow('test-review', [start - 1, start])], undefined, day(), 20, now)).toEqual({
    due: 0,
    newAvailable: 0,
    nextDue: null,
    reviewsToday: 1,
  });
});

test('a review-phase card due tomorrow supplies nextDue even without a wordbook or new-card allowance', () => {
  const tomorrow = new Date(2026, 9, 25, 15).getTime();
  const row = { ...testRow(), schedule: testMatureSchedule(tomorrow) };
  expect(wordsInput([row], undefined, day(), 0, now)).toEqual({
    due: 0,
    newAvailable: 0,
    nextDue: new Date(2026, 9, 25).getTime(),
    reviewsToday: 0,
  });
});

test.each(['learning', 'relearning'] as const)(
  'nextDue compares exact %s times with the start of the review due day, regardless of row order',
  (phase) => {
    const reviewAt = new Date(2026, 9, 25, 15).getTime();
    for (const [learningAt, expected] of [
      [new Date(2026, 9, 24, 12, 31).getTime(), new Date(2026, 9, 24, 12, 31).getTime()],
      [new Date(2026, 9, 25, 10).getTime(), new Date(2026, 9, 25).getTime()],
    ]) {
      const learning = {
        ...testRow('test-learning'),
        schedule: { ...initialVocabularySchedule(now), phase, dueAt: learningAt },
      };
      const review = { ...testRow('test-review'), schedule: testMatureSchedule(reviewAt) };
      for (const rows of [
        [learning, review],
        [review, learning],
      ]) {
        expect(wordsInput(rows, undefined, day(), 20, now).nextDue).toBe(expected);
      }
    }
  },
);

test('due-now, overdue and unscheduled rows never supply nextDue', () => {
  for (const phase of ['new', 'learning', 'relearning'] as const) {
    const due = { ...testRow('test-now'), schedule: { ...initialVocabularySchedule(now), phase } };
    const overdue = { ...testRow('test-past'), schedule: { ...due.schedule, dueAt: now - 1 } };
    expect(wordsInput([testRow(), due, overdue], undefined, day(), 20, now).nextDue).toBeNull();
    const future = { ...testRow('test-future'), schedule: { ...due.schedule, dueAt: now + 1 } };
    expect(wordsInput([due, future, overdue], undefined, day(), 20, now).nextDue).toBe(now + 1);
  }
});

test('review cards are already due from local midnight, even before dueAt, and cannot supply nextDue', () => {
  const today = { ...testRow('test-today'), schedule: testMatureSchedule(new Date(2026, 9, 24, 15).getTime()) };
  const overdue = { ...testRow('test-overdue'), schedule: testMatureSchedule(new Date(2026, 9, 23, 15).getTime()) };
  const tomorrow = { ...testRow('test-tomorrow'), schedule: testMatureSchedule(new Date(2026, 9, 25, 15).getTime()) };
  expect(wordsInput([today, overdue, testRow()], undefined, day(), 0, now)).toEqual({
    due: 2,
    newAvailable: 0,
    nextDue: null,
    reviewsToday: 0,
  });
  expect(wordsInput([today, tomorrow, overdue], undefined, day(), 0, now).nextDue).toBe(
    new Date(2026, 9, 25).getTime(),
  );
});

test('timezone: the same review instant returns at the local midnight of its due day, not a fixed one', async () => {
  // Bun caches timezone state across test files. Keep TZ changes out of the suite's other tests.
  if (!process.env.RELIRE_TEST_INPUTS_TZ) {
    const child = Bun.spawn([process.execPath, 'test', import.meta.path, '-t', 'timezone'], {
      env: { ...process.env, RELIRE_TEST_INPUTS_TZ: '1' },
      stdout: 'pipe',
      stderr: 'pipe',
    });
    const output = await new Response(child.stderr).text();
    expect(await child.exited, output).toBe(0);
    return;
  }
  const original = process.env.TZ;
  try {
    // One instant, 2026-10-25 02:30 UTC: still October 24 in Toronto (EDT, UTC-4), already October 25 in Shanghai (UTC+8).
    const dueAt = Date.UTC(2026, 9, 25, 2, 30);
    const before = Date.UTC(2026, 9, 24, 1);
    const review = { ...testRow('test-review'), schedule: testMatureSchedule(dueAt) };
    process.env.TZ = 'America/Toronto';
    // Toronto local due day: October 24, 22:30; available from Toronto's October 24 midnight.
    expect(nextAvailableAt([review], before)).toBe(new Date(2026, 9, 24).getTime());
    // A review card due later in the local day is already available and waits no more.
    const laterToday = { ...testRow('test-today'), schedule: testMatureSchedule(new Date(2026, 9, 24, 23).getTime()) };
    expect(nextAvailableAt([laterToday], new Date(2026, 9, 24, 21).getTime())).toBeNull();
    // A learning step keeps its exact instant in every zone.
    const learning = {
      ...testRow('test-learning'),
      schedule: { ...initialVocabularySchedule(before), phase: 'learning' as const, dueAt: before + 10 * 60_000 },
    };
    expect(nextAvailableAt([learning], before)).toBe(before + 10 * 60_000);
    process.env.TZ = 'Asia/Shanghai';
    // The same instant is Shanghai's October 25, 10:30; available from Shanghai's October 25 midnight.
    expect(nextAvailableAt([review], before)).toBe(new Date(2026, 9, 25).getTime());
    expect(nextAvailableAt([learning], before)).toBe(before + 10 * 60_000);
  } finally {
    if (original === undefined) delete process.env.TZ;
    else process.env.TZ = original;
  }
});

const base = publishedReaderFixture();
const bundledOf = (id: string, order: number, fr = 'Un livre'): PublishedReader => ({
  ...base,
  body: { ...base.body, id, order, title: { ...base.body.title, fr } },
});
const summaryOf = (id: string, order: number, version = 'b'.repeat(64), fr = 'Un livre'): ReaderSummary => ({
  id,
  order,
  level: 'A1',
  title: { ...base.body.title, fr },
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

test('only bundled readers, sorted by order with their French titles and progress status', () => {
  expect(
    readerEntries(
      [bundledOf('test-book-2', 2, 'Le marché'), bundledOf('test-book-1', 1)],
      [],
      [progressOf('test-book-1', base.version)],
      now,
    ),
  ).toEqual([
    { readerId: 'test-book-1', order: 1, title: 'Un livre', status: 'opened', activeToday: false },
    { readerId: 'test-book-2', order: 2, title: 'Le marché', status: 'notOpened', activeToday: false },
  ]);
});

test('service readers follow the bundled ones by order and carry their edition; a completed edition reads as done', () => {
  const entries = readerEntries(
    [bundledOf('test-book', 3)],
    [summaryOf('test-service', 1, 'b'.repeat(64), 'Une histoire'), summaryOf('test-service-2', 2, 'd'.repeat(64))],
    [progressOf('test-service', 'b'.repeat(64), { completedAt: now })],
    now,
  );
  expect(entries).toEqual([
    {
      readerId: 'test-service',
      order: 1,
      title: 'Une histoire',
      version: 'b'.repeat(64),
      status: 'read',
      activeToday: true,
    },
    {
      readerId: 'test-service-2',
      order: 2,
      title: 'Un livre',
      version: 'd'.repeat(64),
      status: 'notOpened',
      activeToday: false,
    },
    { readerId: 'test-book', order: 3, title: 'Un livre', status: 'notOpened', activeToday: false },
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
  ).toEqual({ readerId: 'test-book', order: 1, title: 'Un livre', status: 'opened', activeToday: true });
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
