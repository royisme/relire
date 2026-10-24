/** Owns the content service GETs (address, access key, transport errors); validation and offline storage belong to loaders. */
import { getAppSettings } from '../../utils/appSettings';
import { GrammarTopicListSchema } from '../../types/grammarTopic';

/** The address consumers may call right now: only a service the learner enabled with both a URL and a key. */
export function contentServiceUrl(): string | undefined {
  const { enabled, url, key } = getAppSettings().contentService;
  return enabled && url && key ? url : undefined;
}

export class ContentServiceHttpError extends Error {
  constructor(
    public status: number,
    code: string,
  ) {
    super(`HTTP ${status}: ${code}`);
  }
}

export class ContentServiceNetworkError extends Error {}

// The word sheet waits for the lexicon before it draws, so a service that accepts the connection and never answers
// must not hold a core screen: an overdue request counts as a network failure (cached copy, else the real error).
const REQUEST_TIMEOUT_MS = 5000;

export function contentServiceFetch(path: string, format: 'text'): Promise<string>;
export function contentServiceFetch(path: string): Promise<unknown>;
export async function contentServiceFetch(path: string, format?: 'text'): Promise<unknown> {
  const url = contentServiceUrl();
  if (!url) throw new Error('Content service is not configured');
  let response: Response;
  try {
    response = await fetch(`${url}${path}`, {
      credentials: 'omit',
      headers: { Authorization: `Bearer ${getAppSettings().contentService.key}` },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch (error) {
    throw new ContentServiceNetworkError(error instanceof Error ? error.message : String(error));
  }
  if (!response.ok) {
    // The service answers its own errors as JSON; a platform page (a gateway or rate-limit error) is not JSON.
    const body = (await response.json().catch(() => undefined)) as { error?: string } | undefined;
    throw new ContentServiceHttpError(response.status, body?.error ?? 'unexpected response');
  }
  return format === 'text' ? response.text() : response.json();
}

/**
 * One live probe of the given (draft) address and key, for Settings' Test button: it bypasses the saved
 * configuration and every cache (`no-store`), and a 200 counts only when the body is the real topic list,
 * so an HTML or unrelated page cannot pass for a connection. Throws the transport's own errors.
 */
export async function testContentService(url: string, key: string): Promise<void> {
  let response: Response;
  try {
    response = await fetch(`${url}/v1/topics`, {
      credentials: 'omit',
      cache: 'no-store',
      headers: { Authorization: `Bearer ${key}` },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch (error) {
    throw new ContentServiceNetworkError(error instanceof Error ? error.message : String(error));
  }
  if (!response.ok) {
    const body = (await response.json().catch(() => undefined)) as { error?: string } | undefined;
    throw new ContentServiceHttpError(response.status, body?.error ?? 'unexpected response');
  }
  GrammarTopicListSchema.parse(await response.json());
}
