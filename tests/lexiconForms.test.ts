/** The lexicon's lemma → forms inversion for the vocabulary run's cloze finder: built once, folded like the file, dropped with a failed load. */
import { afterEach, beforeEach, expect, spyOn, test } from 'bun:test';
import { lexiconFormsOf, resetLexiconForTests } from '../src/services/lexicon/load';
import { chanterData } from './fixtures/lexicon';
import { failure } from './fixtures/storage';

/** The committed data file, at the URL the loader resolves. */
const BUNDLE_URL = new URL('../data/lexicon/lexicon.json', import.meta.url);
let fetchSpy: ReturnType<typeof spyOn<typeof globalThis, 'fetch'>>;

beforeEach(() => {
  resetLexiconForTests();
  fetchSpy = spyOn(globalThis, 'fetch');
});
afterEach(() => {
  fetchSpy.mockRestore();
  resetLexiconForTests();
});

/** The only seam: the real file answered the way the browser's own fetch would. */
const answerWithFile = () =>
  fetchSpy.mockImplementation(
    Object.assign(() => Promise.resolve(new Response(Bun.file(BUNDLE_URL))), { preconnect: () => {} }),
  );

test('one inversion serves every lemma: concurrent and later asks share a single fetch', async () => {
  answerWithFile();
  const [concurrent, later, folded] = await Promise.all([
    lexiconFormsOf('chanter'),
    lexiconFormsOf('chanter'),
    lexiconFormsOf('Chanter'),
  ]);
  expect(fetchSpy).toHaveBeenCalledTimes(1);
  expect(concurrent).toBe(later);
  expect(folded).toBe(concurrent);
  // The forms are what the cloze finder tries in the sentence, taken from the file's own form keys.
  for (const form of ['chante', 'chantons', 'chantiez', 'chanté', 'chanteront'])
    expect(concurrent?.has(form)).toBe(true);
  expect(concurrent?.has('chanter')).toBe(true);
  expect(concurrent?.has('xyzzy')).toBe(false);
});

test('a lemma the lexicon does not hold is undefined, not an error, and a form alone is not a lemma', async () => {
  answerWithFile();
  expect(await lexiconFormsOf('xyzzy')).toBeUndefined();
  expect(await lexiconFormsOf('chantons')).toBeUndefined();
});

test('a failed load keeps its real error and drops the inversion, so the retry rebuilds it', async () => {
  fetchSpy.mockImplementation(
    Object.assign(() => Promise.reject(new TypeError('TEST ONLY offline')), { preconnect: () => {} }),
  );
  expect(((await failure(lexiconFormsOf('chanter'))) as Error).message).toBe('TEST ONLY offline');
  answerWithFile();
  const forms = await lexiconFormsOf('chanter');
  expect(forms?.has('chantons')).toBe(true);
  expect(fetchSpy).toHaveBeenCalledTimes(2);
});

test('fixture bundle inversion matches the chanterData fixture', async () => {
  fetchSpy.mockImplementation(
    Object.assign(
      () =>
        Promise.resolve(
          Response.json({
            source: {
              name: 'TEST lexicon',
              maintainer: 'Relire tests',
              licence: 'test-only',
              url: 'https://example.test/lexicon.json',
              sourceVersion: 'test',
              changes: 'Invented test data',
              modified: '2026-01-01',
            },
            entries: [{ lemma: 'chanter', pos: 'verb', data: chanterData() }],
            forms: {
              chante: [['chanter', 'verb']],
              chantons: [['chanter', 'verb']],
              chanté: [['chanter', 'verb']],
            },
          }),
        ),
      { preconnect: () => {} },
    ),
  );
  const forms = await lexiconFormsOf('chanter');
  expect(forms?.has('chante')).toBe(true);
  expect(forms?.has('chantons')).toBe(true);
  expect(forms?.has('chanté')).toBe(true);
  expect(forms?.has('danser')).toBe(false);
});
