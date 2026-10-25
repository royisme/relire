/**
 * The bundled lexicon's two loaders and the word sheet's two questions, over the committed data file: only `fetch`
 * is replaced (with the real file), so the lookups, the folding and the response shapes are the app's own.
 */
import { afterEach, beforeEach, expect, spyOn, test } from 'bun:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { useLexiconVerb } from '../src/hooks/useLexiconVerb';
import { lexiconForm, lexiconLemma, resetLexiconForTests } from '../src/services/lexicon/load';
import { lexiconVerb, lexiconVerbLines } from '../src/services/lexicon/verbs';
import { LexiconFormResponseSchema, LexiconLemmaResponseSchema } from '../src/types/lexicon';
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
const answerWith = (response: () => Promise<Response>) =>
  fetchSpy.mockImplementation(Object.assign(response, { preconnect: () => {} }));

test('concurrent first lookups share one fetch of the data file, and every later lookup is free', async () => {
  answerWithFile();
  const [lemma, form] = await Promise.all([lexiconLemma('être'), lexiconForm('sommes')]);
  expect(fetchSpy).toHaveBeenCalledTimes(1);
  expect(fetchSpy.mock.calls[0][0]).toEqual(BUNDLE_URL);
  expect(lemma?.lemma).toBe('être');
  expect(lemma?.entries.map((entry) => entry.pos)).toEqual(['noun', 'verb']);
  expect(form?.form).toBe('sommes');
  expect(form?.lemmas).toEqual([
    { lemma: 'somme', pos: 'noun' },
    { lemma: 'être', pos: 'verb' },
  ]);
  expect((await lexiconForm('chantons'))?.lemmas).toEqual([{ lemma: 'chanter', pos: 'verb' }]);
  expect(fetchSpy).toHaveBeenCalledTimes(1);
});

test('the token and the lemma are folded like the pack lookup: case, curly apostrophe, hyphen, spacing', async () => {
  answerWithFile();
  expect((await lexiconForm('Chef-D’Oeuvre  '))?.form).toBe("chef-d'oeuvre");
  expect((await lexiconForm('BEAU-FRÈRE'))?.form).toBe('beau-frère');
  expect((await lexiconLemma('ÊTRE'))?.lemma).toBe('être');
});

test('a word the file does not hold is undefined, not an error', async () => {
  answerWithFile();
  expect(await lexiconForm('xyzzy')).toBeUndefined();
  expect(await lexiconLemma('xyzzy')).toBeUndefined();
});

test('the response carries the four-field source of the file, not its change notices', async () => {
  answerWithFile();
  const lemma = await lexiconLemma('être');
  expect(lemma?.source.name).toBe('Morphalou 3.1');
  expect(Object.keys(lemma!.source).sort()).toEqual(['licence', 'maintainer', 'name', 'url']);
  expect(LexiconLemmaResponseSchema.safeParse(lemma).success).toBe(true);
  expect(LexiconFormResponseSchema.safeParse(await lexiconForm('chantons')).success).toBe(true);
});

test('a failed fetch keeps its real error, and the next call retries the whole load', async () => {
  answerWith(() => Promise.reject(new TypeError('TEST ONLY offline')));
  expect(((await failure(lexiconForm('chanter'))) as Error).message).toBe('TEST ONLY offline');
  answerWithFile();
  expect((await lexiconForm('chantons'))?.form).toBe('chantons');
  expect(fetchSpy).toHaveBeenCalledTimes(2);
});

test('an HTTP failure says which status the data file answered', async () => {
  answerWith(() => Promise.resolve(new Response('not found', { status: 404 })));
  expect(((await failure(lexiconLemma('être'))) as Error).message).toBe('The lexicon data file answered HTTP 404');
});

test('a data file of the wrong shape is an error that names the field', async () => {
  answerWith(() => Promise.resolve(Response.json({ source: {}, entries: [], forms: {} })));
  expect(((await failure(lexiconLemma('être'))) as Error).message).toContain('source');
});

test('the sheet names the lexicon verb of a tapped form, and skips what the pack already names', async () => {
  answerWithFile();
  expect(await lexiconVerbLines('chantons')).toEqual({
    lines: [
      {
        infinitive: 'chanter',
        match: {
          tenses: [
            { tense: 'present', persons: ['1pl'] },
            { tense: 'imperatif', persons: ['1pl'] },
          ],
          participles: [],
        },
      },
    ],
  });
  // être is a pack verb (the pack names it for `sommes`), a tapped infinitive writes no cell, and an unknown word is no line.
  expect(await lexiconVerbLines('sommes')).toEqual({ lines: [] });
  expect(await lexiconVerbLines('chanter')).toEqual({ lines: [] });
  expect(await lexiconVerbLines('xyzzy')).toEqual({ lines: [] });
});

test('a lemma the AI named is tried as written, then without its pronoun; a non-verb is no verb data', async () => {
  answerWithFile();
  expect((await lexiconVerb('se laver'))?.tenses?.present?.['1pl']).toEqual(['lavons']);
  expect(await lexiconVerb('chant')).toBeUndefined();
  expect(await lexiconVerb('xyzzy')).toBeUndefined();
});

test('the conjugation slot starts loading: no content-service gate is left', () => {
  const status = () => createElement((): string => useLexiconVerb('chanter').status);
  expect(renderToStaticMarkup(status())).toBe('loading');
  expect(fetchSpy).not.toHaveBeenCalled();
});
