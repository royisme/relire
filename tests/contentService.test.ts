/** Content transport and short-lived reuse contracts: no live service or module mocks. */
import { afterEach, beforeEach, expect, spyOn, test } from 'bun:test';
import {
  contentServiceFetch,
  contentServiceUrl,
  ContentServiceHttpError,
  ContentServiceNetworkError,
} from '../src/services/grammarTopics/service';
import { contentRequest, resetContentRequests } from '../src/services/grammarTopics/request';
import { saveAppSettings } from '../src/utils/appSettings';
import { freshSettingsStorage, restoreSettingsStorage, serviceOff, serviceOn } from './fixtures/contentServiceSettings';
import { failure, freshDb } from './fixtures/storage';

let fetchSpy: ReturnType<typeof spyOn<typeof globalThis, 'fetch'>>;
let clockSpy: ReturnType<typeof spyOn<typeof Date, 'now'>> | undefined;
beforeEach(async () => {
  resetContentRequests();
  await freshDb();
  freshSettingsStorage();
  serviceOn('http://content.test/');
  fetchSpy = spyOn(globalThis, 'fetch');
});
afterEach(() => {
  resetContentRequests();
  clockSpy?.mockRestore();
  clockSpy = undefined;
  fetchSpy.mockRestore();
  restoreSettingsStorage();
});

test('the stored URL is normalized; GET omits credentials and sends the saved key as its bearer header', async () => {
  expect(contentServiceUrl()).toBe('http://content.test');
  fetchSpy.mockResolvedValue(Response.json([]));
  expect(await contentServiceFetch('/v1/topics')).toEqual([]);
  expect(fetchSpy).toHaveBeenCalledWith('http://content.test/v1/topics', {
    credentials: 'omit',
    headers: { Authorization: 'Bearer TEST-access-key' },
    signal: expect.any(AbortSignal),
  });
});

test('the service is an address only while it is enabled with both a URL and a key', () => {
  const on = { enabled: true, url: 'http://content.test', key: 'TEST-access-key' };
  for (const block of [
    { ...on, enabled: false },
    { ...on, url: '' },
    { ...on, key: '' },
  ]) {
    saveAppSettings({ contentService: block });
    expect(contentServiceUrl()).toBeUndefined();
  }
  saveAppSettings({ contentService: on });
  expect(contentServiceUrl()).toBe('http://content.test');
});

test('unconfigured service makes no request', async () => {
  serviceOff();
  expect(contentServiceUrl()).toBeUndefined();
  expect(await failure(contentServiceFetch('/v1/topics'))).toEqual(new Error('Content service is not configured'));
  expect(fetchSpy).not.toHaveBeenCalled();
});

for (const [status, code] of [
  [401, 'unauthorized'],
  [404, 'not-found'],
  [500, 'unavailable'],
] as const) {
  test(`HTTP ${status} preserves the status and service code`, async () => {
    fetchSpy.mockResolvedValue(Response.json({ error: code }, { status }));
    const error = await failure(contentServiceFetch('/v1/topics/test-only'));
    expect(error).toBeInstanceOf(ContentServiceHttpError);
    expect((error as Error).message).toBe(`HTTP ${status}: ${code}`);
  });
}

test('a non-JSON error page still reports its HTTP status, not a parse error', async () => {
  fetchSpy.mockResolvedValue(new Response('<html>TEST ONLY gateway</html>', { status: 502 }));
  const error = await failure(contentServiceFetch('/v1/topics'));
  expect(error).toBeInstanceOf(ContentServiceHttpError);
  expect((error as Error).message).toBe('HTTP 502: unexpected response');
});

test('a service that never answers is cut off by the request timeout and reported as a network failure', async () => {
  const timeout = new AbortController();
  const timeoutSpy = spyOn(AbortSignal, 'timeout').mockReturnValue(timeout.signal);
  try {
    // A request that stays pending until its signal aborts, like a server that accepts the connection and never answers.
    const hang = (_url: unknown, init?: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => reject(init.signal?.reason));
      });
    fetchSpy.mockImplementation(hang as unknown as typeof fetch);
    const pending = failure(contentServiceFetch('/v1/topics/test-only'));
    timeout.abort(new DOMException('The operation timed out.', 'TimeoutError'));
    const error = await pending;
    expect(error).toBeInstanceOf(ContentServiceNetworkError);
    expect((error as Error).message).toBe('The operation timed out.');
    expect(timeoutSpy).toHaveBeenCalledWith(5000);
  } finally {
    timeoutSpy.mockRestore();
  }
});

test('the same content path reuses its parsed result within the window', async () => {
  fetchSpy.mockImplementation(Object.assign(async () => Response.json({ count: 1 }), { preconnect: () => {} }));
  const parse = (data: unknown) => ({ parsed: data });
  const first = await contentRequest('/v1/topics', parse);
  expect(await contentRequest('/v1/topics', parse)).toBe(first);
  expect(fetchSpy).toHaveBeenCalledTimes(1);
});

test('identical in-flight content requests share one network call', async () => {
  let release!: (response: Response) => void;
  fetchSpy.mockReturnValue(
    new Promise<Response>((resolve) => {
      release = resolve;
    }),
  );
  const first = contentRequest('/v1/topics', (data) => data);
  const second = contentRequest('/v1/topics', (data) => data);
  expect(fetchSpy).toHaveBeenCalledTimes(1);
  release(Response.json([]));
  expect(await Promise.all([first, second])).toEqual([[], []]);
});

test('a failed content request is retried immediately and keeps its real error', async () => {
  fetchSpy.mockRejectedValueOnce(new TypeError('TEST ONLY recovered')).mockResolvedValue(Response.json([]));
  expect(((await failure(contentRequest('/v1/topics', (data) => data))) as Error).message).toBe('TEST ONLY recovered');
  expect(await contentRequest('/v1/topics', (data) => data)).toEqual([]);
  expect(fetchSpy).toHaveBeenCalledTimes(2);
});

test('successful content is reused until exactly 60 seconds after completion', async () => {
  clockSpy = spyOn(Date, 'now').mockReturnValue(1000);
  fetchSpy.mockImplementation(Object.assign(async () => Response.json([]), { preconnect: () => {} }));
  await contentRequest('/v1/topics', (data) => data);
  clockSpy.mockReturnValue(60_999);
  await contentRequest('/v1/topics', (data) => data);
  expect(fetchSpy).toHaveBeenCalledTimes(1);
  clockSpy.mockReturnValue(61_000);
  await contentRequest('/v1/topics', (data) => data);
  expect(fetchSpy).toHaveBeenCalledTimes(2);
});

test('different content paths and service origins do not share requests', async () => {
  fetchSpy.mockImplementation(Object.assign(async () => Response.json([]), { preconnect: () => {} }));
  await contentRequest('/v1/topics', (data) => data);
  await contentRequest('/v1/tag-index', (data) => data);
  serviceOn('http://other-content.test');
  await contentRequest('/v1/topics', (data) => data);
  expect(fetchSpy.mock.calls.map(([url]) => url)).toEqual([
    'http://content.test/v1/topics',
    'http://content.test/v1/tag-index',
    'http://other-content.test/v1/topics',
  ]);
});

test('an offline fallback is not reused when the service recovers', async () => {
  fetchSpy.mockResolvedValueOnce(Response.json(['stored']));
  await contentRequest('/v1/topics', (data) => data);
  resetContentRequests();
  fetchSpy.mockRejectedValueOnce(new TypeError('TEST ONLY offline')).mockResolvedValue(Response.json(['recovered']));
  expect(await contentRequest('/v1/topics', (data) => data)).toEqual(['stored']);
  expect(await contentRequest('/v1/topics', (data) => data)).toEqual(['recovered']);
  expect(fetchSpy).toHaveBeenCalledTimes(3);
});

test('network failure keeps its original text', async () => {
  fetchSpy.mockRejectedValue(new TypeError('TEST ONLY network refused'));
  const error = await failure(contentServiceFetch('/v1/tag-index'));
  expect(error).toBeInstanceOf(ContentServiceNetworkError);
  expect((error as Error).message).toBe('TEST ONLY network refused');
});
