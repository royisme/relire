/** Steps mount-scoped hook state/effects without a DOM or leaking module mocks. */
import { afterEach, beforeEach, expect, spyOn, test } from 'bun:test';
import * as React from 'react';
import { useGrammarTopics } from '../src/hooks/useGrammarTopics';
import { useGrammarTagIndex } from '../src/hooks/useGrammarTagIndex';
import { resetContentRequests } from '../src/services/grammarTopics/request';
import { freshDb } from './fixtures/storage';
import { freshSettingsStorage, restoreSettingsStorage, serviceOff, serviceOn } from './fixtures/contentServiceSettings';
import { topicFixture } from './fixtures/grammarTopics';

async function until(done: () => boolean) {
  for (let i = 0; i < 100 && !done(); i++) await Bun.sleep(5);
  expect(done()).toBe(true);
}

let effect: React.EffectCallback;
let state: unknown;
let changed: Promise<void>;
let fetchSpy: ReturnType<typeof spyOn<typeof globalThis, 'fetch'>>;
let stateSpy: ReturnType<typeof spyOn<typeof React, 'useState'>>;
let effectSpy: ReturnType<typeof spyOn<typeof React, 'useEffect'>>;

beforeEach(async () => {
  resetContentRequests();
  await freshDb();
  freshSettingsStorage();
  serviceOn('http://content.test');
  let resolve!: () => void;
  changed = new Promise<void>((done) => {
    resolve = done;
  });
  stateSpy = spyOn(React, 'useState').mockImplementation(((initial: unknown) => {
    state = typeof initial === 'function' ? initial() : initial;
    return [
      state,
      (next: unknown) => {
        state = typeof next === 'function' ? next(state) : next;
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
  resetContentRequests();
  fetchSpy.mockRestore();
  stateSpy.mockRestore();
  effectSpy.mockRestore();
  restoreSettingsStorage();
});

test('without a configured service a mounted tag hook stays plain and makes no request', () => {
  serviceOff();
  expect(useGrammarTagIndex()).toEqual({ status: 'ready' });
  expect(effect()).toBeUndefined();
  expect(fetchSpy).not.toHaveBeenCalled();
});

test('the list hook becomes ready with summaries', async () => {
  fetchSpy.mockResolvedValue(Response.json([{ ...topicFixture(), position: 1 }]));
  expect(useGrammarTopics()).toEqual({ status: 'loading' });
  effect();
  await changed;
  expect(state).toMatchObject({ status: 'ready', topics: [{ id: 'test-only' }] });
  expect(state).not.toHaveProperty('topic');
  expect(fetchSpy).toHaveBeenCalledWith('http://content.test/v1/topics', {
    credentials: 'omit',
    headers: { Authorization: 'Bearer TEST-access-key' },
    signal: expect.any(AbortSignal),
  });
});

test('the reader hook receives a full topic and summaries, reusing the list request cache', async () => {
  fetchSpy.mockImplementation((async (url) =>
    Response.json(
      typeof url === 'string' && url.endsWith('/v1/topics') ? [{ ...topicFixture(), position: 1 }] : topicFixture(),
    )) as typeof fetch);
  expect(useGrammarTopics('test-only')).toEqual({ status: 'loading' });
  effect();
  await until(() => (state as { status: string }).status === 'ready' && 'topics' in (state as object));
  expect(state).toMatchObject({ status: 'ready', topic: topicFixture(), topics: [{ id: 'test-only', position: 1 }] });
  expect(fetchSpy).toHaveBeenCalledTimes(2);
  useGrammarTopics();
  effect();
  await until(() => (state as { status: string }).status === 'ready');
  expect(fetchSpy).toHaveBeenCalledTimes(2);
  expect(fetchSpy).toHaveBeenCalledWith('http://content.test/v1/topics/test-only', {
    credentials: 'omit',
    headers: { Authorization: 'Bearer TEST-access-key' },
    signal: expect.any(AbortSignal),
  });
});

test('a pending list does not block the topic, and a failed list preserves the reader and real error', async () => {
  let release!: (response: Response) => void;
  fetchSpy.mockImplementation((async (url) =>
    typeof url === 'string' && url.endsWith('/v1/topics')
      ? new Promise<Response>((resolve) => {
          release = resolve;
        })
      : Response.json(topicFixture())) as typeof fetch);
  useGrammarTopics('test-only');
  effect();
  await until(() => (state as { status: string }).status === 'ready');
  expect(state).toEqual({ status: 'ready', topic: topicFixture() });
  release(Response.json({ error: 'TEST list denied' }, { status: 500 }));
  await until(() => 'listError' in (state as object));
  expect(state).toEqual({ status: 'ready', topic: topicFixture(), listError: 'HTTP 500: TEST list denied' });
});

test('unmount discards both late list and reader loads', async () => {
  const releases: ((response: Response) => void)[] = [];
  fetchSpy.mockImplementation(
    Object.assign(async () => new Promise<Response>((resolve) => releases.push(resolve)), { preconnect() {} }),
  );
  useGrammarTopics('test-only');
  const cleanup = effect();
  if (typeof cleanup === 'function') cleanup();
  releases[0](Response.json([{ ...topicFixture(), position: 1 }]));
  releases[1](Response.json(topicFixture()));
  await Bun.sleep(10);
  expect(state).toEqual({ status: 'loading' });
});

for (const [id, status, expected] of [
  ['unknown', 404, 'notFound'],
  ['test-only', 500, 'error'],
  [undefined, 404, 'error'],
] as const) {
  test(`HTTP ${status} for ${id ?? 'the list'} becomes ${expected} with its real error`, async () => {
    fetchSpy.mockImplementation(
      Object.assign(async () => Response.json({ error: 'TEST ONLY error' }, { status }), { preconnect() {} }),
    );
    useGrammarTopics(id);
    effect();
    await until(() => (state as { status: string }).status === expected);
    expect(state).toMatchObject({ status: expected, error: `HTTP ${status}: TEST ONLY error` });
  });
}
