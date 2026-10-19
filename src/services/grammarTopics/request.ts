/** Owns validated network-first content caching; HTTP, JSON and schema errors never use stale content. */
import { getCached, putCached } from '../../storage/cache';
import { contentServiceFetch, contentServiceUrl, ContentServiceNetworkError } from './service';

export async function contentRequest<T>(path: string, parse: (data: unknown) => T): Promise<T> {
  const key = `${contentServiceUrl()}${path}`;
  let data: unknown;
  try {
    data = await contentServiceFetch(path);
  } catch (error) {
    if (!(error instanceof ContentServiceNetworkError)) throw error;
    const cached = await getCached<unknown>('content', key);
    if (cached === undefined) throw error;
    return parse(cached);
  }
  const parsed = parse(data);
  await putCached('content', key, parsed);
  return parsed;
}
