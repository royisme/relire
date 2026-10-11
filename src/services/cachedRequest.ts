import { deleteCached, getCached, putCached, type CacheKind } from '../storage/cache';

// Requests currently in flight, so two quick taps on the same word cost one call.
const inFlight = new Map<string, Promise<unknown>>();

/** Invalid disposable answers are deleted, not partially trusted. */
export async function readCachedAnswer<T>(kind: CacheKind, key: string, validate: (value: unknown) => T): Promise<T | undefined> {
  const hit = await getCached<unknown>(kind, key);
  if (hit === undefined) return undefined;
  try {
    return validate(hit);
  } catch {
    await deleteCached(kind, key);
    return undefined;
  }
}

/**
 * Looks in the persistent cache first and only then runs `fetchFresh`, so a
 * repeated word or sentence costs nothing (and cached answers work without a
 * key). `skipCache` forces a new answer, which replaces the saved one.
 */
export async function cachedRequest<T>(
  kind: CacheKind,
  key: string,
  fetchFresh: () => Promise<T>,
  skipCache = false,
  validate?: (value: unknown) => T
): Promise<T> {
  const hit = skipCache ? undefined : validate ? await readCachedAnswer(kind, key, validate) : await getCached<T>(kind, key);
  if (hit) return hit;

  const flightKey = `${kind}:${key}`;
  const pending = inFlight.get(flightKey) as Promise<T> | undefined;
  if (pending) return validate ? pending.then(validate) : pending;

  const request = fetchFresh()
    .then(async (value) => {
      const answer = validate ? validate(value) : value;
      await putCached(kind, key, answer);
      return answer;
    })
    .finally(() => inFlight.delete(flightKey));
  inFlight.set(flightKey, request);
  return request;
}
