/** Steps mount-scoped hook state/effects without a DOM or leaking module mocks. */
import { afterEach, beforeEach, expect, spyOn, test } from 'bun:test';
import * as React from 'react';
import { useGrammarTopics } from '../src/hooks/useGrammarTopics';
import { useGrammarTagIndex } from '../src/hooks/useGrammarTagIndex';
import { freshDb } from './fixtures/storage';
import { topicFixture } from './fixtures/grammarTopics';

const originalUrl = process.env.VITE_CONTENT_SERVICE_URL;
let effect: React.EffectCallback;
let state: unknown;
let changed: Promise<void>;
let fetchSpy: ReturnType<typeof spyOn<typeof globalThis, 'fetch'>>;
let stateSpy: ReturnType<typeof spyOn<typeof React, 'useState'>>;
let effectSpy: ReturnType<typeof spyOn<typeof React, 'useEffect'>>;

beforeEach(async () => {
  await freshDb();
  process.env.VITE_CONTENT_SERVICE_URL = 'http://content.test';
  let resolve!: () => void;
  changed = new Promise<void>((done) => {
    resolve = done;
  });
  stateSpy = spyOn(React, 'useState').mockImplementation(((initial: unknown) => {
    state = typeof initial === 'function' ? initial() : initial;
    return [
      state,
      (next: unknown) => {
        state = next;
        resolve();
      },
    ];
  }) as typeof React.useState);
  effectSpy = spyOn(React, 'useEffect').mockImplementation((callback) => {
    effect = callback;
  });
  fetchSpy = spyOn(globalThis, 'fetch');
});
afterEach(() => {
  fetchSpy.mockRestore();
  stateSpy.mockRestore();
  effectSpy.mockRestore();
  if (originalUrl === undefined) delete process.env.VITE_CONTENT_SERVICE_URL;
  else process.env.VITE_CONTENT_SERVICE_URL = originalUrl;
});

test('without a configured service a mounted tag hook stays plain and makes no request', () => {
  delete process.env.VITE_CONTENT_SERVICE_URL;
  expect(useGrammarTagIndex()).toEqual({ status: 'ready' });
  expect(effect()).toBeUndefined();
  expect(fetchSpy).not.toHaveBeenCalled();
});

test('the list hook becomes ready with summaries', async () => {
  fetchSpy.mockResolvedValue(Response.json([topicFixture()]));
  expect(useGrammarTopics()).toEqual({ status: 'loading' });
  effect();
  await changed;
  expect(state).toMatchObject({ status: 'ready', topics: [{ id: 'test-only' }] });
  expect(state).not.toHaveProperty('topic');
  expect(fetchSpy).toHaveBeenCalledWith('http://content.test/v1/topics', {
    credentials: 'omit',
    signal: expect.any(AbortSignal),
  });
});

test('the reader hook receives a full topic without fetching the list', async () => {
  fetchSpy.mockResolvedValue(Response.json(topicFixture()));
  expect(useGrammarTopics('test-only')).toEqual({ status: 'loading' });
  effect();
  await changed;
  expect(state).toEqual({ status: 'ready', topic: topicFixture() });
  expect(fetchSpy).toHaveBeenCalledTimes(1);
  expect(fetchSpy).toHaveBeenCalledWith('http://content.test/v1/topics/test-only', {
    credentials: 'omit',
    signal: expect.any(AbortSignal),
  });
});

for (const [id, status, expected] of [
  ['unknown', 404, 'notFound'],
  ['test-only', 500, 'error'],
  [undefined, 404, 'error'],
] as const) {
  test(`HTTP ${status} for ${id ?? 'the list'} becomes ${expected} with its real error`, async () => {
    fetchSpy.mockResolvedValue(Response.json({ error: 'TEST ONLY error' }, { status }));
    useGrammarTopics(id);
    effect();
    await changed;
    expect(state).toEqual({ status: expected, error: `HTTP ${status}: TEST ONLY error` });
  });
}
