/** Validated service loaders and offline cache; no static JSON imports, module mocks or live service. */
import { afterEach, beforeEach, expect, spyOn, test } from 'bun:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { loadGrammarTopic, loadGrammarTopics } from '../src/services/grammarTopics/load';
import { loadGrammarTagIndex } from '../src/services/grammarTopics/tagIndex';
import { GrammarTopicSchema, GrammarTopicSummarySchema } from '../src/types/grammarTopic';
import { GrammarTagIndexSchema } from '../src/types/grammarTagIndex';
import { useGrammarTopics } from '../src/hooks/useGrammarTopics';
import { useGrammarTagIndex } from '../src/hooks/useGrammarTagIndex';
import { cacheCounts, getCached, putCached } from '../src/storage/cache';
import { failure, freshDb } from './fixtures/storage';
import { topicFixture } from './fixtures/grammarTopics';

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

const loaders = [
  {
    name: 'summaries',
    path: '/v1/topics',
    load: loadGrammarTopics,
    data: () => [GrammarTopicSummarySchema.parse(topicFixture())],
    parse: (data: unknown) => GrammarTopicSummarySchema.array().parse(data),
  },
  {
    name: 'one topic',
    path: '/v1/topics/test-only',
    load: () => loadGrammarTopic('test-only'),
    data: topicFixture,
    parse: (data: unknown) => GrammarTopicSchema.parse(data),
  },
  {
    name: 'tag index',
    path: '/v1/tag-index',
    load: loadGrammarTagIndex,
    data: () => ({ articles: ['test-only'] }),
    parse: (data: unknown) => GrammarTagIndexSchema.parse(data),
  },
];

for (const { name, path, load, data, parse } of loaders) {
  test(`${name}: valid responses are validated and persisted; every new load is network first`, async () => {
    fetchSpy.mockImplementation(Object.assign(async () => Response.json(data()), { preconnect: () => {} }));
    expect(await load()).toEqual(data());
    expect(await getCached('content', `${origin}${path}`)).toEqual(data());
    expect(await load()).toEqual(data());
    expect(fetchSpy).toHaveBeenCalledTimes(2);
    expect(fetchSpy).toHaveBeenCalledWith(`${origin}${path}`, { credentials: 'omit' });
    expect((await cacheCounts()).content).toBe(1);
  });

  test(`${name}: invalid schema keeps the real Zod error and does not replace the last good copy`, async () => {
    await putCached('content', `${origin}${path}`, data());
    fetchSpy.mockResolvedValue(Response.json(null));
    let message = '';
    try {
      parse(null);
    } catch (error) {
      message = (error as Error).message;
    }
    const error = await failure(load());
    expect((error as Error).message).toBe(message);
    expect(await getCached('content', `${origin}${path}`)).toEqual(data());
  });

  for (const status of [404, 500]) {
    test(`${name}: HTTP ${status} never falls back to a cached success`, async () => {
      await putCached('content', `${origin}${path}`, data());
      fetchSpy.mockResolvedValue(Response.json({ error: 'TEST ONLY refused' }, { status }));
      expect(((await failure(load())) as Error).message).toBe(`HTTP ${status}: TEST ONLY refused`);
    });
  }

  test(`${name}: network failure falls back to that request's last good copy`, async () => {
    fetchSpy.mockResolvedValue(Response.json(data()));
    await load();
    fetchSpy.mockRejectedValue(new TypeError('TEST ONLY offline'));
    expect(await load()).toEqual(data());
    process.env.VITE_CONTENT_SERVICE_URL = 'http://other-content.test';
    expect(((await failure(load())) as Error).message).toBe('TEST ONLY offline');
  });

  test(`${name}: an unconfigured build never fetches or uses a stored response`, async () => {
    await putCached('content', `${origin}${path}`, data());
    delete process.env.VITE_CONTENT_SERVICE_URL;
    expect(((await failure(load())) as Error).message).toBe('Content service is not configured');
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  test(`${name}: a network failure without cache shows its real reason`, async () => {
    fetchSpy.mockRejectedValue(new TypeError('TEST ONLY offline'));
    expect(((await failure(load())) as Error).message).toBe('TEST ONLY offline');
  });

  test(`${name}: JSON errors never fall back`, async () => {
    await putCached('content', `${origin}${path}`, data());
    fetchSpy.mockResolvedValue(new Response('not JSON'));
    expect(await failure(load())).toBeInstanceOf(SyntaxError);
  });
}

test('offline cache is request-scoped, validated on read, and expires after 365 days', async () => {
  fetchSpy.mockResolvedValue(Response.json(topicFixture()));
  await loadGrammarTopic('test-only');
  fetchSpy.mockRejectedValue(new TypeError('TEST ONLY offline'));
  expect(((await failure(loadGrammarTopic('another-test'))) as Error).message).toBe('TEST ONLY offline');
  await putCached('content', `${origin}/v1/topics/test-only`, null);
  expect(((await failure(loadGrammarTopic('test-only'))) as Error).message).toContain('Invalid input');
  await putCached('content', `${origin}/v1/topics/test-only`, topicFixture());
  const now = Date.now();
  const clock = spyOn(Date, 'now').mockReturnValue(now + 366 * 24 * 60 * 60 * 1000);
  try {
    expect(((await failure(loadGrammarTopic('test-only'))) as Error).message).toBe('TEST ONLY offline');
  } finally {
    clock.mockRestore();
  }
});

test('tag-index requests share in-flight work without parsing topics, then a later mount fetches again', async () => {
  const topicParse = spyOn(GrammarTopicSchema, 'parse');
  const summaryParse = spyOn(GrammarTopicSummarySchema, 'parse');
  fetchSpy.mockImplementation(Object.assign(async () => Response.json({}), { preconnect: () => {} }));
  try {
    const first = loadGrammarTagIndex();
    expect(loadGrammarTagIndex()).toBe(first);
    await first;
    expect(loadGrammarTagIndex()).not.toBe(first);
    await loadGrammarTagIndex();
    expect(fetchSpy).toHaveBeenCalledTimes(2);
    expect(topicParse).not.toHaveBeenCalled();
    expect(summaryParse).not.toHaveBeenCalled();
  } finally {
    topicParse.mockRestore();
    summaryParse.mockRestore();
  }
});

test('hooks begin loading and an unconfigured tag hook is ready without a request', () => {
  const topics = () => createElement((): string => useGrammarTopics().status);
  const tags = () => createElement((): string => useGrammarTagIndex().status);
  expect(renderToStaticMarkup(topics())).toBe('loading');
  expect(renderToStaticMarkup(tags())).toBe('loading');
  delete process.env.VITE_CONTENT_SERVICE_URL;
  expect(renderToStaticMarkup(tags())).toBe('ready');
  expect(fetchSpy).not.toHaveBeenCalled();
});
