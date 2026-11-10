/** Owns the allowlist selection logic on an invented frequency table; no real Lexique or Morphalou data. */
import { expect, test } from 'bun:test';
import { forcedIds, scoreLemmas, selectLemmas } from '../scripts/lexicon/select';

/** The message a promise rejects with, or `resolved`. */
const rejection = (promise: Promise<unknown>) =>
  promise.then(
    () => 'resolved',
    (error: Error) => error.message,
  );

// Columns in an order unlike the real file: they are found by name.
const header = ['ortho', 'freqlemlivres', 'cgram', 'lemme', 'freqlemfilms2'].join('\t');
const row = (ortho: string, lemma: string, cgram: string, books: number, films: number) =>
  [ortho, books, cgram, lemma, films].join('\t');
const TABLE = [
  header,
  // One lemma repeated per inflected form with the same lemma frequencies: counted once (10 + 20), not three times.
  row('testmarche', 'testmarcher', 'VER', 10, 20),
  row('testmarches', 'testmarcher', 'VER', 10, 20),
  row('testmarchons', 'testmarcher', 'VER', 10, 20),
  row('testmaison', 'testmaison', 'NOM', 5, 5),
  row('testrare', 'testrare', 'VER', 1, 1),
  row('testbeau', 'testbeau', 'ADJ', 7, 7),
  row('testnombre', 'testnombre', 'ADJ:num', 100, 100),
  row('testvite', 'testvite', 'ADV', 100, 100),
  // High score, but Morphalou has no such noun.
  row('testabsent', 'testabsent', 'NOM', 90, 90),
  // The same word as noun and verb are two lemmas.
  row('testdouble', 'testdouble', 'NOM', 3, 3),
  row('testdouble', 'testdouble', 'VER', 4, 4),
].join('\n');
const available = new Set([
  'testmarcher\0verb',
  'testmaison\0noun',
  'testrare\0verb',
  'testbeau\0adjective',
  'testdouble\0noun',
  'testdouble\0verb',
  'testforced\0noun',
]);

test('a lemma scores the sum of its two lemma frequencies once, whatever the number of inflected rows', async () => {
  const scores = await scoreLemmas(TABLE.split('\n'));
  expect(scores.get('testmarcher\0verb')).toBe(30);
  expect(scores.get('testdouble\0noun')).toBe(6);
  expect(scores.get('testdouble\0verb')).toBe(8);
  // Only VER, NOM and ADJ count.
  expect(scores.has('testnombre\0adjective')).toBe(false);
  expect(scores.has('testvite\0verb')).toBe(false);
});

test('a missing column names itself', async () => {
  expect(await rejection(scoreLemmas(['ortho\tlemme\tcgram', 'a\ta\tVER']))).toBe(
    'Lexique header has no column freqlemfilms2',
  );
});

test('top N by score among lemmas Morphalou has, sorted `pos:lemma` lines, ties by id', async () => {
  const scores = await scoreLemmas(TABLE.split('\n'));
  const { lines, ranked, missing } = selectLemmas(scores, available, [], 3);
  expect(ranked).toEqual([
    'testmarcher\0verb',
    'testbeau\0adjective',
    'testmaison\0noun',
    'testdouble\0verb',
    'testdouble\0noun',
    'testrare\0verb',
  ]);
  expect(lines).toEqual(['adjective:testbeau', 'noun:testmaison', 'verb:testmarcher']);
  expect(missing).toEqual([]);
  // The absent lemma never appears, however high it scores.
  expect(selectLemmas(scores, available, [], 100).lines).not.toContain('noun:testabsent');
});

test('forced lemmas join even with no score; forced ones Morphalou lacks are reported, not listed', async () => {
  const scores = await scoreLemmas(TABLE.split('\n'));
  const { lines, missing } = selectLemmas(
    scores,
    available,
    ['testforced\0noun', 'testmarcher\0verb', 'testunknown\0noun'],
    1,
  );
  expect(lines).toEqual(['noun:testforced', 'verb:testmarcher']);
  expect(missing).toEqual(['testunknown\0noun']);
});

test('the real forced sources: pack verbs with the apostrophe folded and the noun-gender nouns', async () => {
  const ids = await forcedIds(new URL('../', import.meta.url));
  for (const id of ['être\0verb', "s'appeler\0verb", 'maison\0noun']) expect(ids).toContain(id);
  expect(ids.some((id) => id.includes('’'))).toBe(false);
});
