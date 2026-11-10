/** Thrown before any request when the provider needs an API key and none is set. */
export class MissingApiKeyError extends Error {
  constructor() {
    super('API key is not set');
    this.name = 'MissingApiKeyError';
  }
}

/** Thrown when a caller asks a `device` speech provider for a clip: the platform's voice speaks directly and
 * produces none, so playback must use the browser's own speech instead, and nothing is stored. */
export class DeviceVoiceError extends Error {
  constructor() {
    super('The device voice speaks directly; it has no audio clip');
    this.name = 'DeviceVoiceError';
  }
}

/** The human-readable part of a provider error: `error.message` (OpenAI, Anthropic), a plain `error` text
 * (Ollama), or the message itself. */
export function errorMessage(err: unknown, secret?: string): string {
  const error = (err as { error?: unknown })?.error;
  const detail =
    (typeof error === 'string' ? error : (error as { message?: unknown } | undefined)?.message) ||
    (err as { message?: unknown })?.message;
  let msg = typeof detail === 'string' ? detail : String(err);
  try {
    const parsed = JSON.parse(msg);
    if (typeof parsed?.error?.message === 'string') msg = parsed.error.message;
    else if (typeof parsed?.error === 'string') msg = parsed.error;
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
