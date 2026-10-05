import { getCached, putCached, type CacheKind } from '../storage/cache';

// Requests currently in flight, so two quick taps on the same word cost one call.
const inFlight = new Map<string, Promise<unknown>>();

/**
 * Looks in the persistent cache first and only then runs `fetchFresh`, so a
 * repeated word or sentence costs nothing (and cached answers work without a
 * key). `skipCache` forces a new answer, which replaces the saved one.
 */
export async function cachedRequest<T>(
  kind: CacheKind,
  key: string,
  fetchFresh: () => Promise<T>,
  skipCache = false
): Promise<T> {
  const hit = skipCache ? undefined : await getCached<T>(kind, key);
  if (hit) return hit;

  const flightKey = `${kind}:${key}`;
  const pending = inFlight.get(flightKey) as Promise<T> | undefined;
  if (pending) return pending;

  const request = fetchFresh()
    .then(async (value) => {
      await putCached(kind, key, value);
      return value;
    })
    .finally(() => inFlight.delete(flightKey));
  inFlight.set(flightKey, request);
  return request;
}
