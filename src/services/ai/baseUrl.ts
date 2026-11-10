/**
 * The endpoint override a learner can type for an OpenAI-compatible provider.
 * Owns that one check: storage, Save, Settings and the provider all call it, so a
 * malformed address can never become a request. Empty means the provider default.
 */

const MAX_BASE_URL = 2048;

/** The trimmed `http(s)` endpoint without a trailing slash, or undefined when it is empty or unusable. */
export function normalizeBaseUrl(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > MAX_BASE_URL) return undefined;
  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return undefined;
  }
  // Paths are joined by string: credentials, a query or a fragment would be sent to the host or silently dropped.
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash)
    return undefined;
  return trimmed.replace(/\/+$/, '');
}
