/** Owns short-lived request reuse and validated offline caching; HTTP, JSON and schema errors never use stale content. */
import { getCached, putCached } from '../../storage/cache';
import { contentServiceFetch, contentServiceUrl, ContentServiceNetworkError } from './service';

// Reuse fresh answers for 60 seconds to avoid spending the service's rate limit on repeated word-sheet lookups.
const CONTENT_REUSE_MS = 60_000;
const requests = new Map<string, { promise: Promise<unknown>; expiresAt: number }>();

export function resetContentRequests(): void {
  requests.clear();
}

export async function contentRequest<T>(path: string, parse: (data: unknown) => T): Promise<T> {
  const key = `${contentServiceUrl()}${path}`;
  let request = requests.get(key);
  if (!request || Date.now() >= request.expiresAt) {
    const promise = (async () => {
      const parsed = parse(await contentServiceFetch(path));
      await putCached('content', key, parsed);
      return parsed;
    })();
    request = { promise, expiresAt: Infinity };
    requests.set(key, request);
    const entry = request;
    void promise.then(
      () => {
        entry.expiresAt = Date.now() + CONTENT_REUSE_MS;
      },
      () => {
        requests.delete(key);
      },
    );
  }
  try {
    return (await request.promise) as T;
  } catch (error) {
    if (!(error instanceof ContentServiceNetworkError)) throw error;
    const cached = await getCached<unknown>('content', key);
    if (cached === undefined) throw error;
    return parse(cached);
  }
}
