/** Owns retry/cache and independent JSON-loading probes; not content, navigation or UI acceptance. */
import { afterEach, beforeEach, expect, mock, spyOn, test } from 'bun:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { GrammarTopicsPackSchema, GrammarTagIndexSchema } from '../src/types/grammarTopic';
import { topicsFixture } from './fixtures/grammarTopics';

const data = topicsFixture();
const index: Record<string, string[]> = {};
let topicImports = 0;
void mock.module('../src/data/grammar/topics.json', () => {
  topicImports++;
  return { default: data };
});
void mock.module('../src/data/grammar/tag-index.json', () => ({ default: index }));
const {
  loadGrammarTopics,
  loadGrammarTagIndex,
  loadedGrammarTopics,
  loadedGrammarTagIndex,
  resetGrammarTopicsForTests,
} = await import('../src/services/grammarTopics/load');
const { useGrammarTopics } = await import('../src/hooks/useGrammarTopics');
const { useGrammarTagIndex } = await import('../src/hooks/useGrammarTagIndex');
let topicSpy: ReturnType<typeof spyOn<typeof GrammarTopicsPackSchema, 'parse'>>;
let indexSpy: ReturnType<typeof spyOn<typeof GrammarTagIndexSchema, 'parse'>>;

beforeEach(() => {
  resetGrammarTopicsForTests();
  Object.assign(data, topicsFixture());
  for (const key of Object.keys(index)) delete index[key];
  void GrammarTopicsPackSchema.parse;
  void GrammarTagIndexSchema.parse;
  topicSpy = spyOn(GrammarTopicsPackSchema, 'parse');
  indexSpy = spyOn(GrammarTagIndexSchema, 'parse');
});
afterEach(() => {
  topicSpy.mockRestore();
  indexSpy.mockRestore();
});

test('topic requests share one promise and whole-pack parse; malformed data is not cached', async () => {
  data.topics[0].status = 'draft';
  const first = loadGrammarTopics();
  expect(loadGrammarTopics()).toBe(first);
  expect(
    await first.then(
      () => 'unexpected success',
      (error: Error) => error.message,
    ),
  ).toContain('only reviewed topics ship');
  expect(loadedGrammarTopics()).toBeUndefined();
  Object.assign(data, topicsFixture());
  const retry = loadGrammarTopics();
  expect(retry).not.toBe(first);
  const pack = await retry;
  expect(await loadGrammarTopics()).toBe(pack);
  expect(loadGrammarTopics()).toBe(retry);
  expect(topicSpy).toHaveBeenCalledTimes(2);
});

test('tag-index loading never imports or parses topics; failure is retryable and success memoised', async () => {
  const importsBefore = topicImports;
  index.unknown = ['test-only'];
  const first = loadGrammarTagIndex();
  expect(loadGrammarTagIndex()).toBe(first);
  expect(
    await first.then(
      () => 'unexpected success',
      (error: Error) => error.message,
    ),
  ).toContain('unknown');
  expect(loadedGrammarTagIndex()).toBeUndefined();
  delete index.unknown;
  index.articles = ['test-only'];
  const retry = loadGrammarTagIndex();
  expect(retry).not.toBe(first);
  const result = await retry;
  expect(await loadGrammarTagIndex()).toBe(result);
  expect(loadGrammarTagIndex()).toBe(retry);
  expect(indexSpy).toHaveBeenCalledTimes(2);
  expect(topicSpy).not.toHaveBeenCalled();
  expect(topicImports).toBe(importsBefore);
  expect(loadedGrammarTopics()).toBeUndefined();
});

test('hooks render ready immediately after successful loads, otherwise loading', async () => {
  const topics = () => createElement((): string => useGrammarTopics().status);
  const tags = () => createElement((): string => useGrammarTagIndex().status);
  expect(renderToStaticMarkup(topics())).toBe('loading');
  expect(renderToStaticMarkup(tags())).toBe('loading');
  await loadGrammarTagIndex();
  expect(renderToStaticMarkup(tags())).toBe('ready');
  expect(renderToStaticMarkup(topics())).toBe('loading');
  await loadGrammarTopics();
  expect(renderToStaticMarkup(topics())).toBe('ready');
});
