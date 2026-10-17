/** Thrown before any request when the provider needs an API key and none is set. */
export class MissingApiKeyError extends Error {
  constructor() {
    super('API key is not set');
    this.name = 'MissingApiKeyError';
  }
}

/** The human-readable part of an SDK error (providers often wrap a JSON body in `message`). */
export function errorMessage(err: unknown, secret?: string): string {
  const detail =
    (err as { error?: { message?: unknown }; message?: unknown })?.error?.message ||
    (err as { message?: unknown })?.message;
  let msg = typeof detail === 'string' ? detail : String(err);
  try {
    const parsed = JSON.parse(msg);
    if (typeof parsed?.error?.message === 'string') msg = parsed.error.message;
  } catch {
    // message was not JSON
  }
  const key = secret?.trim();
  return key ? msg.split(key).join('[redacted]') : msg;
}

/** Thrown before any request when images are sent to a model that cannot read them. */
export class ImageInputUnsupportedError extends Error {
  readonly model: string;
  constructor(model: string) {
    super(`The selected model "${model}" cannot read images. Choose a model that accepts images in Settings.`);
    this.name = 'ImageInputUnsupportedError';
    this.model = model;
  }
}

/**
 * The model answered, but not in the shape the task needs. Carries the schema's
 * own reasons so the UI can show what was wrong instead of a generic failure.
 */
export class InvalidAnswerError extends Error {
  readonly issues: string[];
  constructor(task: string, issues: string[]) {
    super(`The AI answer for ${task} was not usable: ${issues.join('; ')}`);
    this.name = 'InvalidAnswerError';
    this.issues = issues;
  }
}

/** A request cancelled through its AbortSignal (not a failure to report). */
export const isAbortError = (err: unknown): boolean => (err as { name?: string } | null)?.name === 'AbortError';
