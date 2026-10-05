/** Thrown before any request when the provider needs an API key and none is set. */
export class MissingApiKeyError extends Error {
  constructor() {
    super('API key is not set');
    this.name = 'MissingApiKeyError';
  }
}

/** The human-readable part of an SDK error (providers often wrap a JSON body in `message`). */
export function errorMessage(err: unknown): string {
  let msg = (err as { message?: string })?.message || String(err);
  try {
    const parsed = JSON.parse(msg);
    if (parsed?.error?.message) msg = parsed.error.message;
  } catch {
    // message was not JSON
  }
  return msg;
}
