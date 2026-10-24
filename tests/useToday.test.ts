/** useToday's source gathering: per-source errors, one shared now, subscription refresh and the service-gated grammar step; DOM-less probe with fake IndexedDB. */
import { afterEach, beforeEach, expect, spyOn, test } from 'bun:test';
import { createInstance } from 'i18next';
import * as translations from 'react-i18next';
import * as starterReaders from '../src/services/gradedReaders/load';
import * as catalogueService from '../src/services/gradedReaders/service';
import * as grammarLoad from '../src/services/grammarTopics/load';
import * as readerStorage from '../src/storage/gradedReaders';
import * as vocabularyBook from '../src/storage/vocabularyBook';
import { markTopicStudied } from '../src/storage/topicStudied';
import { readerHookProbe } from './fixtures/readerHookProbe';
import { freshDb } from './fixtures/storage';
import { freshSettingsStorage, restoreSettingsStorage, serviceOn } from './fixtures/contentServiceSettings';
import { publishedReaderFixture } from './fixtures/gradedReaders';
import { readerAnswer } from './fixtures/readerProgress';
import { bookList } from './fixtures/grammarTopics';
import { testMatureSchedule, testRow } from './fixtures/vocabulary';
import { ITEMS, unitOf } from './fixtures/units';
import { db } from '../src/storage/db';
import { saveUnits } from '../src/storage/exercises';
import { exercisesChanged } from '../src/storage/exerciseEvents';
import { startOfLocalDay } from '../src/services/today/activity';
import { useToday } from '../src/hooks/useToday';
import { contentHash } from '../scripts/graded-readers/gateInputs';
import type { ReaderProgress } from '../src/types/readerProgress';
import type { VocabularyModel } from '../src/hooks/useVocabulary';
import type { ExerciseAttempt } from '../src/types/exercises';
import type { GrammarTopicList } from '../src/types/grammarTopic';
import en from '../src/i18n/locales/en.json';

const now = new Date(2026, 9, 24, 12, 30).getTime();
const start = startOfLocalDay(now);
const reader = publishedReaderFixture();

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

const i18n = createInstance();
await i18n.init({ lng: 'en', resources: { en: { translation: en } }, initAsync: false });

let probe: ReturnType<typeof readerHookProbe>;
let load: ReturnType<typeof spyOn<typeof starterReaders, 'loadStarterReaders'>>;
let listProgress: ReturnType<typeof spyOn<typeof readerStorage, 'listReaderProgress'>>;
let subscribe: ReturnType<typeof spyOn<typeof readerStorage, 'subscribeReaders'>>;
let translation: ReturnType<typeof spyOn<typeof translations, 'useTranslation'>>;
let catalogueLoad: ReturnType<typeof spyOn<typeof catalogueService, 'loadReaderCatalogue'>>;
let topicsLoad: ReturnType<typeof spyOn<typeof grammarLoad, 'loadGrammarTopics'>>;

beforeEach(async () => {
  await freshDb();
  freshSettingsStorage();
  probe = readerHookProbe();
  load = spyOn(starterReaders, 'loadStarterReaders').mockImplementation(() => Promise.resolve([reader]));
  listProgress = spyOn(readerStorage, 'listReaderProgress').mockImplementation(() => Promise.resolve([]));
  subscribe = spyOn(readerStorage, 'subscribeReaders').mockImplementation(() => () => undefined);
  translation = spyOn(translations, 'useTranslation').mockReturnValue({ i18n } as never);
  // A configured service would otherwise send the catalogue to the network; Today tolerates its failure.
  catalogueLoad = spyOn(catalogueService, 'loadReaderCatalogue').mockRejectedValue(
    new Error('TEST catalogue unavailable'),
  );
  topicsLoad = spyOn(grammarLoad, 'loadGrammarTopics').mockImplementation(() => Promise.resolve(bookList));
});

afterEach(() => {
  probe.restore();
  for (const spy of [load, listProgress, subscribe, translation, catalogueLoad, topicsLoad]) spy.mockRestore();
  restoreSettingsStorage();
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

/** The grammar step's topic id, once the service list has resolved onto the plan. */
const grammarTopicOf = (state: State) => {
  const step = stepOf(state, 'grammar');
  return step !== undefined && 'topicId' in step ? step.topicId : undefined;
};

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
        { id: 'read', done: false, readerId: 'test-book', order: 1, title: 'Un livre', state: 'start' },
        { id: 'sound', done: false },
      ],
      allDone: false,
      nextIndex: 0,
      doneCount: 0,
      counts: { reviews: 0, exercises: 0, readers: 0 },
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
  expect(stepOf(state, 'read')).toEqual({
    id: 'read',
    done: false,
    readerId: 'test-book',
    order: 1,
    title: 'Un livre',
    state: 'start',
  });
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
  if (state.status !== 'ready') throw new Error('expected the driven state to be ready');
  expect(state.plan.counts).toEqual({ reviews: 0, exercises: 0 });
});

test('a progress read error omits the readers count even while the starters also failed', async () => {
  load.mockImplementation(() => Promise.reject(new Error('TEST starter chunk corrupt')));
  listProgress.mockImplementation(() => Promise.reject(new Error('TEST progress read failed')));
  const state = await drive(model(), (s) => s.status === 'ready');
  expect(stepOf(state, 'read')).toEqual({ id: 'read', done: false, error: 'TEST starter chunk corrupt' });
  if (state.status !== 'ready') throw new Error('expected the driven state to be ready');
  expect(state.plan.counts).toEqual({ reviews: 0, exercises: 0 });
});

test('the readers count includes a reader saved offline that is not in the catalogue', async () => {
  // A reader whose edition left the catalogue but whose progress row stays: a checked answer today
  // must still count, while the read step keeps pointing at the catalogue's first unread reader.
  const offline = structuredClone(reader);
  offline.body.id = 'test-offline-reader';
  offline.version = contentHash(offline.body);
  offline.review.contentHash = offline.version;
  const row: ReaderProgress = {
    readerId: offline.body.id,
    version: offline.version,
    snapshot: offline,
    openedAt: start - 1,
    lastOpenedAt: now,
    lastSentenceId: null,
    answers: {
      'recognize-book': {
        answer: readerAnswer(0, 'un livre'),
        checked: { checkedAt: now, correct: true, strictAccents: true },
      },
    },
    completedAt: null,
    revision: 0,
  };
  listProgress.mockImplementation(() => Promise.resolve([row]));
  const state = await drive(model(), (s) => s.status === 'ready');
  expect(stepOf(state, 'read')).toEqual({
    id: 'read',
    done: false,
    readerId: 'test-book',
    order: 1,
    title: 'Un livre',
    state: 'start',
  });
  if (state.status !== 'ready') throw new Error('expected the driven state to be ready');
  expect(state.plan.counts).toEqual({ reviews: 0, exercises: 0, readers: 1 });
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

test('the exercises count is the single attempts list length, not the sound and mistake counters', async () => {
  await seedPairsUnit();
  const d = await db();
  await d.put('attempts', attempt('pair', start - 86400_000)); // wrong before today: a retryable mistake
  await d.put('attempts', attempt('pair', now - 1, true)); // today: the sound-pairs retry
  await d.put('attempts', attempt('plain', now - 2)); // today: plain exercises both step counters miss
  await d.put('attempts', attempt('plain', now - 3));
  const state = await drive(model(), (s) => s.status === 'ready');
  expect(stepOf(state, 'sound')).toEqual({ id: 'sound', done: true });
  expect(stepOf(state, 'mistakes')).toEqual({ id: 'mistakes', done: true, unresolved: 1 });
  if (state.status !== 'ready') throw new Error('expected the driven state to be ready');
  expect(state.plan.counts).toEqual({ reviews: 0, exercises: 3, readers: 0 });
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

test('without a service configured the topic list is never requested and no grammar step exists', async () => {
  const state = await drive(model(), (s) => s.status === 'ready');
  expect(topicsLoad).not.toHaveBeenCalled();
  expect(stepOf(state, 'grammar')).toBeUndefined();
});

test('a configured service adds the grammar step once the list resolves, without holding the four local steps', async () => {
  serviceOn('http://content.test');
  let resolveTopics: (list: GrammarTopicList) => void = () => undefined;
  topicsLoad.mockImplementation(
    () =>
      new Promise<GrammarTopicList>((resolve) => {
        resolveTopics = resolve;
      }),
  );
  const pending = await drive(model(), (s) => s.status === 'ready');
  expect(stepOf(pending, 'grammar')).toBeUndefined();
  expect(stepOf(pending, 'read')).toEqual({
    id: 'read',
    done: false,
    readerId: 'test-book',
    order: 1,
    title: 'Un livre',
    state: 'start',
  });
  expect(stepOf(pending, 'sound')).toEqual({ id: 'sound', done: false });
  resolveTopics(bookList);
  const withGrammar = await drive(model(), (s) => stepOf(s, 'grammar') !== undefined);
  expect(stepOf(withGrammar, 'grammar')).toEqual({
    id: 'grammar',
    done: false,
    topicId: 'test-one',
    title: 'TEST one',
  });
  if (withGrammar.status !== 'ready') throw new Error('expected the driven state to be ready');
  expect(withGrammar.plan.steps.map((step) => step.id)).toEqual(['read', 'sound', 'grammar']);
});

test('a failing topic list shows its real error on the grammar step only', async () => {
  serviceOn('http://content.test');
  topicsLoad.mockImplementation(() => Promise.reject(new Error('TEST topics unavailable')));
  const state = await drive(model(), (s) => stepOf(s, 'grammar') !== undefined);
  expect(stepOf(state, 'grammar')).toEqual({ id: 'grammar', done: false, error: 'TEST topics unavailable' });
  expect(stepOf(state, 'read')).toEqual({
    id: 'read',
    done: false,
    readerId: 'test-book',
    order: 1,
    title: 'Un livre',
    state: 'start',
  });
  expect(stepOf(state, 'sound')).toEqual({ id: 'sound', done: false });
});

test('marking a topic through real storage updates the grammar step via the subscription', async () => {
  serviceOn('http://content.test');
  const state = await drive(model(), (s) => stepOf(s, 'grammar') !== undefined);
  expect(stepOf(state, 'grammar')).toEqual({ id: 'grammar', done: false, topicId: 'test-one', title: 'TEST one' });
  await markTopicStudied('test-one', now);
  const marked = await drive(model(), (s) => grammarTopicOf(s) === 'test-two');
  expect(stepOf(marked, 'grammar')).toEqual({ id: 'grammar', done: true, topicId: 'test-two', title: 'TEST two' });
});
