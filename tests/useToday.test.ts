/** useToday's source gathering: per-source errors, one shared now, and subscription refresh; DOM-less probe with fake IndexedDB. */
import { afterEach, beforeEach, expect, spyOn, test } from 'bun:test';
import * as starterReaders from '../src/services/gradedReaders/load';
import * as readerStorage from '../src/storage/gradedReaders';
import * as vocabularyBook from '../src/storage/vocabularyBook';
import { readerHookProbe } from './fixtures/readerHookProbe';
import { freshDb } from './fixtures/storage';
import { publishedReaderFixture } from './fixtures/gradedReaders';
import { testMatureSchedule, testRow } from './fixtures/vocabulary';
import { ITEMS, unitOf } from './fixtures/units';
import { db } from '../src/storage/db';
import { saveUnits } from '../src/storage/exercises';
import { exercisesChanged } from '../src/storage/exerciseEvents';
import { startOfLocalDay } from '../src/services/today/activity';
import { useToday } from '../src/hooks/useToday';
import type { VocabularyModel } from '../src/hooks/useVocabulary';
import type { ExerciseAttempt } from '../src/types/exercises';

const now = new Date(2026, 9, 24, 12, 30).getTime();
const start = startOfLocalDay(now);
const reader = publishedReaderFixture();
const originalUrl = process.env.VITE_CONTENT_SERVICE_URL;

// The fields useToday reads; the writers the model also carries are irrelevant here.
const model = (changes: Partial<VocabularyModel> = {}) =>
  ({
    rows: [],
    preferences: { newPerDay: 20, retentionPercent: 90 },
    day: { date: '2026-10-24', introducedKeys: [] },
    now,
    ready: true,
    error: null,
    ...changes,
  }) as unknown as VocabularyModel;

let probe: ReturnType<typeof readerHookProbe>;
let load: ReturnType<typeof spyOn<typeof starterReaders, 'loadStarterReaders'>>;
let listProgress: ReturnType<typeof spyOn<typeof readerStorage, 'listReaderProgress'>>;
let subscribe: ReturnType<typeof spyOn<typeof readerStorage, 'subscribeReaders'>>;

beforeEach(async () => {
  await freshDb();
  delete process.env.VITE_CONTENT_SERVICE_URL;
  probe = readerHookProbe();
  load = spyOn(starterReaders, 'loadStarterReaders').mockImplementation(() => Promise.resolve([reader]));
  listProgress = spyOn(readerStorage, 'listReaderProgress').mockImplementation(() => Promise.resolve([]));
  subscribe = spyOn(readerStorage, 'subscribeReaders').mockImplementation(() => () => undefined);
});

afterEach(() => {
  probe.restore();
  for (const spy of [load, listProgress, subscribe]) spy.mockRestore();
  if (originalUrl === undefined) delete process.env.VITE_CONTENT_SERVICE_URL;
  else process.env.VITE_CONTENT_SERVICE_URL = originalUrl;
});

type State = ReturnType<typeof useToday>;

async function drive(vocabulary: VocabularyModel, done: (state: State) => boolean): Promise<State> {
  let state = probe.render(() => useToday(vocabulary));
  probe.effects();
  const end = Date.now() + 5000;
  while (!done(state) && Date.now() < end) {
    await Bun.sleep(2);
    state = probe.render(() => useToday(vocabulary));
    probe.effects();
  }
  return state;
}

const stepOf = (state: State, id: string) =>
  state.status === 'ready' ? state.plan.steps.find((step) => step.id === id) : undefined;

/** One CHOICE_SELECT unit whose first item is a sound-pairs item and whose second is a plain one. */
async function seedPairsUnit() {
  const unit = {
    ...unitOf('CHOICE_SELECT', [
      { ...ITEMS.CHOICE_SELECT, id: 'pair', meta: { source: 'minimal-pairs' } },
      { ...ITEMS.CHOICE_SELECT, id: 'plain' },
    ]),
    id: 'unit-pairs',
  };
  await saveUnits([unit]);
}

const attempt = (itemId: string, timestamp: number, correct = false): ExerciseAttempt => ({
  id: `unit-pairs:${itemId}:${timestamp}`,
  learningArea: 'listening',
  unitId: 'unit-pairs',
  itemId,
  grammarTag: 'present',
  prompt: 'TEST prompt',
  userAnswer: 'TEST answer',
  expectedAnswer: 'TEST expected',
  correct,
  timestamp,
});

test('empty data is ready: the first reader to start, sound always shown, words and mistakes omitted', async () => {
  const state = await drive(model(), (s) => s.status === 'ready');
  expect(state).toEqual({
    status: 'ready',
    now,
    plan: {
      steps: [
        { id: 'read', done: false, readerId: 'test-book', order: 1, state: 'start' },
        { id: 'sound', done: false },
      ],
      allDone: false,
    },
  });
});

test('an unread vocabulary model keeps the hook loading', async () => {
  const vocabulary = model({ ready: false });
  probe.render(() => useToday(vocabulary));
  probe.effects();
  await Bun.sleep(10);
  expect(probe.render(() => useToday(vocabulary))).toEqual({ status: 'loading' });
});

test('a vocabulary model error is the words step error while the other steps stay intact', async () => {
  const state = await drive(model({ error: 'TEST vocab read failed' }), (s) => s.status === 'ready');
  expect(stepOf(state, 'words')).toEqual({ id: 'words', done: false, error: 'TEST vocab read failed' });
  expect(stepOf(state, 'read')).toEqual({ id: 'read', done: false, readerId: 'test-book', order: 1, state: 'start' });
});

test('a book read failure is the words step error', async () => {
  const book = spyOn(vocabularyBook, 'getVocabularyBook').mockImplementation(() =>
    Promise.reject(new Error('TEST cache busy')),
  );
  try {
    const state = await drive(model(), (s) => s.status === 'ready');
    expect(stepOf(state, 'words')).toEqual({ id: 'words', done: false, error: 'TEST cache busy' });
  } finally {
    book.mockRestore();
  }
});

test('a due word shows the words step with its real count', async () => {
  const row = testRow('test-due');
  row.schedule = testMatureSchedule(now);
  const state = await drive(model({ rows: [row] }), (s) => s.status === 'ready');
  expect(stepOf(state, 'words')).toEqual({ id: 'words', done: false, due: 1, newAvailable: 0 });
});

test('a starter failure is the readers step error', async () => {
  load.mockImplementation(() => Promise.reject(new Error('TEST starter chunk corrupt')));
  const state = await drive(model(), (s) => s.status === 'ready');
  expect(stepOf(state, 'read')).toEqual({ id: 'read', done: false, error: 'TEST starter chunk corrupt' });
});

test('a progress read failure is the readers step error', async () => {
  listProgress.mockImplementation(() => Promise.reject(new Error('TEST progress read failed')));
  const state = await drive(model(), (s) => s.status === 'ready');
  expect(stepOf(state, 'read')).toEqual({ id: 'read', done: false, error: 'TEST progress read failed' });
});

test("today's sound-pair practice and a wrong-before retry complete their steps", async () => {
  await seedPairsUnit();
  const d = await db();
  await d.put('attempts', attempt('pair', start - 86400_000)); // wrong before today: a mistake to retry
  await d.put('attempts', attempt('pair', now - 1, true)); // retried today on the sound-pairs item
  await d.put('attempts', attempt('plain', now - 2)); // first wrong answer today: unresolved, not a retry
  const state = await drive(model(), (s) => s.status === 'ready');
  expect(stepOf(state, 'sound')).toEqual({ id: 'sound', done: true });
  expect(stepOf(state, 'mistakes')).toEqual({ id: 'mistakes', done: true, unresolved: 1 });
  if (state.status !== 'ready') throw new Error('expected the driven state to be ready');
  expect(state.plan.allDone).toBe(false);
});

test('an exercises change refreshes sound and mistakes without a remount', async () => {
  await seedPairsUnit();
  const state = await drive(model(), (s) => s.status === 'ready');
  expect(stepOf(state, 'sound')).toEqual({ id: 'sound', done: false });
  const d = await db();
  await d.put('attempts', attempt('pair', now - 1));
  exercisesChanged();
  const refreshed = await drive(model(), (s) => s.status === 'ready' && stepOf(s, 'sound')?.done === true);
  expect(stepOf(refreshed, 'sound')).toEqual({ id: 'sound', done: true });
});
