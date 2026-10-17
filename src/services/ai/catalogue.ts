/** Shared model ID validation and purpose capability lookup; no provider calls or persisted catalogue. */
import type { AiPurpose, Capability, ModelCapabilities } from './types';

/** Provider resource prefixes are not part of the model ID used in settings or SDK calls. */
export function normalizeModelId(value: unknown): string | undefined {
  // oxlint-disable-next-line no-control-regex -- Model IDs must never contain control characters.
  if (typeof value !== 'string' || /[\u0000-\u001f\u007f-\u009f]/.test(value)) return undefined;
  const id = value.trim().replace(/^models\//, '');
  return id && id.length <= 512 ? id : undefined;
}

export function purposeCapability(capabilities: ModelCapabilities, purpose: AiPurpose): Capability {
  if (purpose === 'ocr') return capabilities.imageInput;
  if (purpose === 'speech') return capabilities.speechOutput;
  return capabilities.textGeneration;
}
