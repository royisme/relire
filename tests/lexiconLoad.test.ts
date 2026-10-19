/** Lexicon loaders and the word sheet's two questions: a fetch spy restored in afterEach, no module mocks, no live service. */
import { afterEach, beforeEach, expect, spyOn, test } from 'bun:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { useLexiconVerb } from '../src/hooks/useLexiconVerb';
import { lexiconForm, lexiconLemma } from '../src/services/lexicon/load';
import { lexiconVerb, lexiconVerbLines } from '../src/services/lexicon/verbs';
import { getCached } from '../src/storage/cache';
import { LexiconFormResponseSchema, LexiconLemmaResponseSchema } from '../src/types/lexicon';
import { failure, freshDb } from './fixtures/storage';
import { chanterData, chanterLemma, formOf, testSource } from './fixtures/lexicon';

const origin = 'http://content.test';
const originalUrl = process.env.VITE_CONTENT_SERVICE_URL;
let fetchSpy: ReturnType<typeof spyOn<typeof globalThis, 'fetch'>>;
beforeEach(async () => {
  await freshDb();
  process.env.VITE_CONTENT_SERVICE_URL = origin;
  fetchSpy = spyOn(globalThis, 'fetch');
});
afterEach(() => {
  fetchSpy.mockRestore();
  if (originalUrl === undefined) delete process.env.VITE_CONTENT_SERVICE_URL;
  else process.env.VITE_CONTENT_SERVICE_URL = originalUrl;
});

const pathOf = (input: string | URL | Request) =>
  (typeof input === 'string' ? input : input instanceof URL ? input.href : input.url).slice(origin.length);

/** Answers each known path with its body and every other path with the service's 404. */
function serve(routes: Record<string, unknown>) {
  fetchSpy.mockImplementation(
    Object.assign(
      async (input: string | URL | Request) => {
        const path = pathOf(input);
        return path in routes ? Response.json(routes[path]) : Response.json({ error: 'not-found' }, { status: 404 });
      },
      { preconnect: () => {} },
    ),
  );
}
const asked = () => fetchSpy.mock.calls.map(([input]) => pathOf(input));

test('a lemma and a form are validated, cached and asked by their encoded, folded name', async () => {
  serve({
    '/v1/lexicon/chanter': chanterLemma(),
    "/v1/lexicon/form/s'appelle": formOf("s'appelle", { lemma: "s'appeler", pos: 'verb' }),
  });
  expect(await lexiconLemma('chanter')).toEqual(LexiconLemmaResponseSchema.parse(chanterLemma()));
  expect(await lexiconForm('S’Appelle ')).toEqual(
    LexiconFormResponseSchema.parse(formOf("s'appelle", { lemma: "s'appeler", pos: 'verb' })),
  );
  expect(asked()).toEqual(['/v1/lexicon/chanter', "/v1/lexicon/form/s'appelle"]);
  expect(fetchSpy).toHaveBeenCalledWith(`${origin}/v1/lexicon/chanter`, {
    credentials: 'omit',
    signal: expect.any(AbortSignal),
  });
  expect(await getCached('content', `${origin}/v1/lexicon/chanter`)).toEqual(chanterLemma());
});

test('an accent and a hyphen are sent percent-encoded and kept', async () => {
  serve({});
  expect(await lexiconForm('Lève-toi')).toBeUndefined();
  expect(asked()).toEqual(['/v1/lexicon/form/l%C3%A8ve-toi']);
});

test('a 404 is no entry and is not kept', async () => {
  serve({});
  expect(await lexiconLemma('rareverb')).toBeUndefined();
  expect(await lexiconForm('rareverb')).toBeUndefined();
  expect(await getCached('content', `${origin}/v1/lexicon/rareverb`)).toBeUndefined();
});

test('a response of the wrong shape keeps the real schema error', async () => {
  serve({ '/v1/lexicon/chanter': { lemma: 'chanter', source: testSource } });
  const error = (await failure(lexiconLemma('chanter'))) as Error;
  expect(error.message).toContain('entries');
});

test('an HTTP 500 keeps its status and service code, and a cached copy is not used for it', async () => {
  serve({ '/v1/lexicon/chanter': chanterLemma() });
  await lexiconLemma('chanter');
  fetchSpy.mockResolvedValue(Response.json({ error: 'unavailable' }, { status: 500 }));
  expect(((await failure(lexiconLemma('chanter'))) as Error).message).toBe('HTTP 500: unavailable');
});

test('a network failure uses the last good copy of that request, and without one shows its reason', async () => {
  serve({ '/v1/lexicon/chanter': chanterLemma() });
  await lexiconLemma('chanter');
  fetchSpy.mockRejectedValue(new TypeError('TEST ONLY offline'));
  expect(await lexiconLemma('chanter')).toEqual(chanterLemma());
  expect(((await failure(lexiconLemma('other'))) as Error).message).toBe('TEST ONLY offline');
});

test('without a content service nothing is asked and nothing is found', async () => {
  delete process.env.VITE_CONTENT_SERVICE_URL;
  expect(await lexiconLemma('chanter')).toBeUndefined();
  expect(await lexiconForm('chantons')).toBeUndefined();
  expect(await lexiconVerb('chanter')).toBeUndefined();
  expect(await lexiconVerbLines('chantons')).toEqual({ lines: [] });
  expect(fetchSpy).not.toHaveBeenCalled();
});

test('a lemma the AI named is tried as written, then without a pronoun, with curly apostrophes folded', async () => {
  serve({ '/v1/lexicon/laver': { ...chanterLemma(), lemma: 'laver' } });
  expect(await lexiconVerb('se laver')).toEqual(chanterData());
  expect(asked()).toEqual(['/v1/lexicon/se%20laver', '/v1/lexicon/laver']);
  fetchSpy.mockClear();
  serve({ "/v1/lexicon/s'appeler": chanterLemma() });
  await lexiconVerb('S’appeler');
  expect(asked()).toEqual(["/v1/lexicon/s'appeler"]);
});

test('a plain lemma is asked once; a lemma that is only a noun or unknown is no verb', async () => {
  serve({
    '/v1/lexicon/chant': {
      lemma: 'chant',
      entries: [{ pos: 'noun', gender: 'masculine', data: {} }],
      source: testSource,
    },
  });
  expect(await lexiconVerb('chant')).toBeUndefined();
  expect(await lexiconVerb('inconnu')).toBeUndefined();
  expect(asked()).toEqual(['/v1/lexicon/chant', '/v1/lexicon/inconnu']);
});

test('verb lines name the lexicon verb, skip the pack verbs and the nouns, and draw nothing for an infinitive', async () => {
  serve({
    '/v1/lexicon/form/chantons': formOf(
      'chantons',
      { lemma: 'chanter', pos: 'verb' },
      { lemma: 'chanton', pos: 'noun' },
    ),
    '/v1/lexicon/chanter': chanterLemma(),
    '/v1/lexicon/form/vais': formOf('vais', { lemma: 'aller', pos: 'verb' }),
    '/v1/lexicon/form/chanter': formOf('chanter', { lemma: 'chanter', pos: 'verb' }),
  });
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
  expect(asked()).toEqual(['/v1/lexicon/form/chantons', '/v1/lexicon/chanter']);
  fetchSpy.mockClear();
  // aller is a pack verb: the pack names it, so the lexicon neither asks for its entry nor repeats it.
  expect(await lexiconVerbLines('vais')).toEqual({ lines: [] });
  expect(asked()).toEqual(['/v1/lexicon/form/vais']);
  expect(await lexiconVerbLines('chanter')).toEqual({ lines: [] });
  expect(await lexiconVerbLines('inconnu')).toEqual({ lines: [] });
});

test('a lexicon failure leaves no lines and carries its real text', async () => {
  fetchSpy.mockResolvedValue(Response.json({ error: 'unavailable' }, { status: 500 }));
  expect(await lexiconVerbLines('chantons')).toEqual({ lines: [], error: 'HTTP 500: unavailable' });
});

test('the conjugation slot starts ready with no entry and asks nothing when no service is configured', () => {
  const status = () => createElement((): string => useLexiconVerb('chanter').status);
  delete process.env.VITE_CONTENT_SERVICE_URL;
  expect(renderToStaticMarkup(status())).toBe('ready');
  process.env.VITE_CONTENT_SERVICE_URL = origin;
  expect(renderToStaticMarkup(status())).toBe('loading');
  expect(fetchSpy).not.toHaveBeenCalled();
});
