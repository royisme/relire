/** Content transport contract only: no live service or module mocks. */
import { afterEach, beforeEach, expect, spyOn, test } from 'bun:test';
import {
  contentServiceFetch,
  contentServiceUrl,
  ContentServiceHttpError,
  ContentServiceNetworkError,
} from '../src/services/grammarTopics/service';
import { failure } from './fixtures/storage';

let fetchSpy: ReturnType<typeof spyOn<typeof globalThis, 'fetch'>>;
const originalUrl = process.env.VITE_CONTENT_SERVICE_URL;
beforeEach(() => {
  process.env.VITE_CONTENT_SERVICE_URL = 'http://content.test/';
  fetchSpy = spyOn(globalThis, 'fetch');
});
afterEach(() => {
  fetchSpy.mockRestore();
  if (originalUrl === undefined) delete process.env.VITE_CONTENT_SERVICE_URL;
  else process.env.VITE_CONTENT_SERVICE_URL = originalUrl;
});

test('build-time URL trims one trailing slash; GET omits credentials and custom headers', async () => {
  expect(contentServiceUrl()).toBe('http://content.test');
  fetchSpy.mockResolvedValue(Response.json([]));
  expect(await contentServiceFetch('/v1/topics')).toEqual([]);
  expect(fetchSpy).toHaveBeenCalledWith('http://content.test/v1/topics', { credentials: 'omit' });
});

test('unconfigured service makes no request', async () => {
  delete process.env.VITE_CONTENT_SERVICE_URL;
  expect(contentServiceUrl()).toBeUndefined();
  expect(await failure(contentServiceFetch('/v1/topics'))).toEqual(new Error('Content service is not configured'));
  expect(fetchSpy).not.toHaveBeenCalled();
});

for (const [status, code] of [
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

test('network failure keeps its original text', async () => {
  fetchSpy.mockRejectedValue(new TypeError('TEST ONLY network refused'));
  const error = await failure(contentServiceFetch('/v1/tag-index'));
  expect(error).toBeInstanceOf(ContentServiceNetworkError);
  expect((error as Error).message).toBe('TEST ONLY network refused');
});
