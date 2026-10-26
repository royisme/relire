/** An imported (Anki) row in the vocabulary run: its pool entry and the challenge built from its two fields. */
import { expect, test } from 'bun:test';
import { testRow } from './fixtures/vocabulary';
import { buildChallenge } from '../src/services/vocabulary/game/challenge';
import { prepareVocabularyImport } from '../src/services/vocabulary/import/prepare';
import { parsePlainText } from '../src/services/vocabulary/import/plainText';

// The run's link, settings and key modules read `window` and `localStorage` when they load.
const originalWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
Object.defineProperty(globalThis, 'window', {
  configurable: true,
  value: Object.assign(new EventTarget(), { location: { hash: '' }, relireHistory: { read: () => 0 } }),
});
Object.defineProperty(globalThis, 'localStorage', {
  configurable: true,
  value: { getItem: () => null, setItem: () => {}, removeItem: () => {} },
});
const run = await import('../src/components/vocabulary/game/VocabularyRun');
if (originalWindow) Object.defineProperty(globalThis, 'window', originalWindow);
else Reflect.deleteProperty(globalThis, 'window');
Reflect.deleteProperty(globalThis, 'localStorage');

test('an imported row enters the real run pool with its answer and deck, and builds a challenge without reader fields', () => {
  const notes = prepareVocabularyImport(
    parsePlainText('chat\tcat\nchien\tdog'),
    { front: 0, back: 1, example: null },
    'TEST deck',
    'en',
    1,
  ).notes;
  const rows = notes.map((note) => ({ ...testRow(note.word), bookSource: undefined, contexts: [note.context] }));
  expect(run.posOf(rows[0])).toBeUndefined();
  const pool = run.runPool(rows);
  expect(pool[0]).toEqual({ word: 'chat', gloss: { en: 'cat', zh: 'cat' }, pos: undefined, deck: 'TEST deck' });
  expect(buildChallenge({ card: rows[0], pool, seed: 'TEST', lang: 'en', voiceAvailable: true })).toMatchObject({
    kind: 'recognize',
    options: expect.arrayContaining(['cat', 'dog']),
  });
});
