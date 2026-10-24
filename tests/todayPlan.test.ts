/** TEST-only local-day activity and deterministic Today checklist rules; no storage or UI. */
import { expect, test } from 'bun:test';
import {
  mistakeAttemptsToday,
  readerIdsActiveToday,
  reviewsToday,
  soundAttemptsToday,
  startOfLocalDay,
} from '../src/services/today/activity';
import { buildTodayPlan, type TodayInput } from '../src/services/today/plan';
import { itemStateId, type ExerciseAttempt } from '../src/types/exercises';
import type { ReaderProgress } from '../src/types/readerProgress';
import { initialVocabularySchedule, nextVocabularySchedule } from '../src/utils/srs';
import { publishedReaderFixture } from './fixtures/gradedReaders';
import { readerAnswer } from './fixtures/readerProgress';
import { ITEMS, unitOf } from './fixtures/units';
import { testRow } from './fixtures/vocabulary';

const midnight = new Date(2026, 9, 24, 0, 0, 0, 0).getTime();
const now = new Date(2026, 9, 24, 12, 30).getTime();
const tomorrow = new Date(2026, 9, 25, 0, 0).getTime();

function reviewedRow(word: string, timestamps: number[]) {
  const row = testRow(word);
  row.schedule = initialVocabularySchedule(midnight - 2);
  row.introducedAt = midnight - 2;
  row.history = timestamps.map((reviewedAt, index) => {
    const prior = row.schedule!;
    const next = nextVocabularySchedule(prior, 'remembered', reviewedAt, { newPerDay: 20, retentionPercent: 90 });
    row.schedule = next;
    row.revision = index + 1;
    return {
      operationId: `${word}-${index}`,
      reviewedAt,
      outcome: 'remembered',
      retentionPercent: 90,
      prior,
      next,
      revision: row.revision,
    };
  });
  return row;
}

function progress(readerId: string, changes: Partial<ReaderProgress> = {}): ReaderProgress {
  const snapshot = publishedReaderFixture();
  return {
    readerId,
    version: snapshot.version,
    snapshot,
    openedAt: midnight - 1,
    lastOpenedAt: now,
    lastSentenceId: null,
    answers: {},
    completedAt: null,
    revision: 0,
    ...changes,
  };
}

function attempt(unitId: string, itemId: string, timestamp: number, correct = false): ExerciseAttempt {
  return {
    id: `${unitId}:${itemId}:${timestamp}`,
    learningArea: 'listening',
    unitId,
    itemId,
    grammarTag: 'present',
    prompt: 'TEST prompt',
    userAnswer: 'TEST answer',
    expectedAnswer: 'TEST expected',
    correct,
    timestamp,
  };
}

function input(changes: Partial<TodayInput> = {}): TodayInput {
  return {
    words: { value: { due: 0, newAvailable: 0, reviewsToday: 0 } },
    readers: { value: [] },
    sound: { value: { attemptsToday: 0 } },
    mistakes: { value: { unresolved: 0, attemptsToday: 0 } },
    ...changes,
  };
}

const reader = (order: number, status: 'read' | 'opened' | 'notOpened', activeToday = false, version?: string) => ({
  readerId: `test-reader-${order}`,
  order,
  ...(version !== undefined ? { version } : {}),
  status,
  activeToday,
});

function readStep(readers: TodayInput['readers']) {
  return buildTodayPlan(input({ readers })).steps.find((step) => step.id === 'read');
}

test('local day starts at midnight, including the exact boundary but not the millisecond before', () => {
  expect(startOfLocalDay(now)).toBe(midnight);
  expect(startOfLocalDay(midnight)).toBe(midnight);
  expect(startOfLocalDay(midnight - 1)).toBe(new Date(2026, 9, 23, 0, 0).getTime());
  expect(reviewsToday([reviewedRow('test-yesterday', [midnight - 1])], now)).toBe(0);
  expect(reviewsToday([reviewedRow('test-midnight', [midnight])], now)).toBe(1);
});

test('reviews count every history entry across rows, with no upper timestamp bound', () => {
  expect(
    reviewsToday(
      [
        reviewedRow('test-one', [midnight - 1, midnight, now]),
        reviewedRow('test-two', [midnight, tomorrow]),
        testRow('test-empty'),
      ],
      now,
    ),
  ).toBe(4);
  expect(reviewsToday([], now)).toBe(0);
});

test('reader activity uses any checked answer or completion, deduplicates ids and ignores opening', () => {
  const checked = (checkedAt: number) => ({
    answer: readerAnswer(0, 'un livre'),
    checked: { checkedAt, correct: false, strictAccents: true as const },
  });
  const rows = [
    progress('test-open-only'),
    progress('test-yesterday', { answers: { q1: checked(midnight - 1) }, completedAt: midnight - 1 }),
    progress('test-draft', { answers: { q1: { answer: readerAnswer(0, 'un livre'), checked: null } } }),
    progress('test-checked', { answers: { q1: checked(midnight - 1), q2: checked(midnight) } }),
    progress('test-completed', { completedAt: midnight }),
    progress('test-completed', { completedAt: now }),
    progress('test-future', { completedAt: tomorrow }),
  ];
  expect(readerIdsActiveToday(rows, now)).toEqual(new Set(['test-checked', 'test-completed', 'test-future']));
  expect(readerIdsActiveToday([], now)).toEqual(new Set());
});

test('sound counts attempts on minimal-pairs items only, not missing units/items or other sources', () => {
  const sound = unitOf('CHOICE_SELECT', [
    { ...ITEMS.CHOICE_SELECT, id: 'pair', meta: { source: 'minimal-pairs' } },
    { ...ITEMS.CHOICE_SELECT, id: 'other', meta: { source: 'noun-gender' } },
    { ...ITEMS.CHOICE_SELECT, id: 'no-meta' },
  ]);
  const other = { ...unitOf('CHOICE_SELECT'), id: 'test-other-unit' };
  const units = new Map([
    [sound.id, sound],
    [other.id, other],
  ]);
  expect(
    soundAttemptsToday(
      [
        attempt(sound.id, 'pair', midnight - 1),
        attempt(sound.id, 'pair', midnight),
        attempt(sound.id, 'pair', now, true),
        attempt(sound.id, 'pair', tomorrow),
        attempt(sound.id, 'other', now),
        attempt(sound.id, 'no-meta', now),
        attempt(sound.id, 'missing-item', now),
        attempt('missing-unit', 'pair', now),
        attempt(other.id, 'pair', now),
      ],
      units,
      now,
    ),
  ).toBe(3);
  expect(soundAttemptsToday([], units, now)).toBe(0);
});

test('mistakes match the full item-state key and count attempts regardless of verdict or unit availability', () => {
  const keys = new Set([itemStateId('test-unit', 'item')]);
  expect(
    mistakeAttemptsToday(
      [
        attempt('test-unit', 'item', midnight - 1),
        attempt('test-unit', 'item', midnight),
        attempt('test-unit', 'item', now, true),
        attempt('test-unit', 'item', tomorrow),
        attempt('other-unit', 'item', now),
        attempt('test-unit', 'other-item', now),
      ],
      keys,
      now,
    ),
  ).toBe(3);
  expect(mistakeAttemptsToday([], keys, now)).toBe(0);
  expect(mistakeAttemptsToday([attempt('test-unit', 'item', now)], new Set(), now)).toBe(0);
});

test('plan order is words, read, sound, mistakes, with real counts and deterministic unmodified inputs', () => {
  const source = input({
    words: { value: { due: 2, newAvailable: 3, reviewsToday: 1 } },
    readers: { value: [reader(1, 'notOpened')] },
    mistakes: { value: { unresolved: 4, attemptsToday: 0 } },
  });
  const before = structuredClone(source);
  const plan = buildTodayPlan(source);
  expect(plan).toEqual({
    steps: [
      { id: 'words', done: false, due: 2, newAvailable: 3 },
      { id: 'read', done: false, readerId: 'test-reader-1', order: 1, state: 'start' },
      { id: 'sound', done: false },
      { id: 'mistakes', done: false, unresolved: 4 },
    ],
    allDone: false,
  });
  expect(buildTodayPlan(source)).toEqual(plan);
  expect(source).toEqual(before);
});

test('empty words, readers and mistakes are omitted; sound is always shown', () => {
  expect(buildTodayPlan(input())).toEqual({ steps: [{ id: 'sound', done: false }], allDone: false });
  expect(buildTodayPlan(input({ sound: { value: { attemptsToday: 1 } } }))).toEqual({
    steps: [{ id: 'sound', done: true }],
    allDone: true,
  });
});

test.each([
  { due: 1, newAvailable: 0, reviewsToday: 0, done: false },
  { due: 0, newAvailable: 2, reviewsToday: 0, done: false },
  { due: 1, newAvailable: 0, reviewsToday: 2, done: false },
  { due: 0, newAvailable: 1, reviewsToday: 2, done: false },
  { due: 0, newAvailable: 0, reviewsToday: 2, done: true },
])('words need a review today and an empty queue to be done: %j', ({ done, ...value }) => {
  expect(buildTodayPlan(input({ words: { value } })).steps[0]).toEqual({
    id: 'words',
    done,
    due: value.due,
    newAvailable: value.newAvailable,
  });
});

test('read selects the first unread reader in catalogue order', () => {
  expect(readStep({ value: [reader(1, 'read'), reader(2, 'notOpened'), reader(3, 'opened')] })).toEqual({
    id: 'read',
    done: false,
    readerId: 'test-reader-2',
    order: 2,
    state: 'start',
  });
});

test('a reader completed today keeps focus instead of the next unopened reader', () => {
  expect(readStep({ value: [reader(1, 'read', true), reader(2, 'notOpened')] })).toEqual({
    id: 'read',
    done: true,
    readerId: 'test-reader-1',
    order: 1,
    state: 'doneToday',
  });
});

test('read focus is the highest-order active reader, even with earlier unread readers', () => {
  expect(readStep({ value: [reader(1, 'notOpened'), reader(2, 'read', true), reader(3, 'opened', true)] })).toEqual({
    id: 'read',
    done: true,
    readerId: 'test-reader-3',
    order: 3,
    state: 'continue',
  });
});

test('all readers completed with none active today omits read; an active completed reader remains', () => {
  expect(readStep({ value: [reader(1, 'read'), reader(2, 'read')] })).toBeUndefined();
  expect(readStep({ value: [reader(1, 'read', true)] })).toEqual({
    id: 'read',
    done: true,
    readerId: 'test-reader-1',
    order: 1,
    state: 'doneToday',
  });
});

test('an opened reader gives continue but is not done without activity today', () => {
  expect(readStep({ value: [reader(1, 'opened')] })).toEqual({
    id: 'read',
    done: false,
    readerId: 'test-reader-1',
    order: 1,
    state: 'continue',
  });
});

test('a service reader keeps its edition on the read step; a bundled reader has none', () => {
  expect(readStep({ value: [reader(1, 'notOpened')] })).not.toHaveProperty('version');
  expect(readStep({ value: [reader(1, 'read'), reader(2, 'notOpened', false, 'b'.repeat(64))] })).toEqual({
    id: 'read',
    done: false,
    readerId: 'test-reader-2',
    order: 2,
    version: 'b'.repeat(64),
    state: 'start',
  });
});

test.each([
  { unresolved: 3, attemptsToday: 0, done: false },
  { unresolved: 3, attemptsToday: 1, done: true },
  { unresolved: 0, attemptsToday: 1, done: true },
])('mistakes remain shown after attempts even if all are resolved: %j', ({ done, ...value }) => {
  expect(buildTodayPlan(input({ mistakes: { value } })).steps.at(-1)).toEqual({
    id: 'mistakes',
    done,
    unresolved: value.unresolved,
  });
});

test('allDone requires every shown step to be done', () => {
  const source = input({
    words: { value: { due: 0, newAvailable: 0, reviewsToday: 1 } },
    readers: { value: [reader(1, 'opened', true)] },
    sound: { value: { attemptsToday: 1 } },
    mistakes: { value: { unresolved: 2, attemptsToday: 1 } },
  });
  expect(buildTodayPlan(source).allDone).toBe(true);
  expect(buildTodayPlan({ ...source, sound: { value: { attemptsToday: 0 } } }).allDone).toBe(false);
  expect(buildTodayPlan({ ...source, words: { value: { due: 1, newAvailable: 0, reviewsToday: 1 } } }).allDone).toBe(
    false,
  );
});

test('failing sources stay in step order, preserve the actual error and are never done', () => {
  const plan = buildTodayPlan({
    words: { error: 'TEST words read failed' },
    readers: { error: 'TEST readers read failed' },
    sound: { error: 'TEST attempts read failed' },
    mistakes: { error: 'TEST mistakes read failed' },
  });
  expect(plan).toEqual({
    steps: [
      { id: 'words', done: false, error: 'TEST words read failed' },
      { id: 'read', done: false, error: 'TEST readers read failed' },
      { id: 'sound', done: false, error: 'TEST attempts read failed' },
      { id: 'mistakes', done: false, error: 'TEST mistakes read failed' },
    ],
    allDone: false,
  });
});

test.each(['words', 'readers', 'sound', 'mistakes'] as const)(
  'a %s source failure leaves other steps intact',
  (key) => {
    const source = input({
      words: { value: { due: 0, newAvailable: 0, reviewsToday: 1 } },
      readers: { value: [reader(1, 'read', true)] },
      sound: { value: { attemptsToday: 1 } },
      mistakes: { value: { unresolved: 0, attemptsToday: 1 } },
    });
    const expected = buildTodayPlan(source).steps;
    const index = ['words', 'readers', 'sound', 'mistakes'].indexOf(key);
    expected[index] = { id: expected[index].id, done: false, error: 'TEST source failed' };
    expect(buildTodayPlan({ ...source, [key]: { error: 'TEST source failed' } })).toEqual({
      steps: expected,
      allDone: false,
    });
  },
);
