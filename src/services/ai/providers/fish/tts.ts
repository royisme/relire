/**
 * Fish Audio speech through its OpenAI-compatible endpoint, called from the browser with the learner's own key.
 * One chosen model, one attempt, no retry and no substitution (never a paid model for the free one): the
 * provider's real error comes back with the key redacted, and only bounded MP3 audio is kept.
 */
import i18n from '../../../../i18n';
import { normalizeModelId } from '../../catalogue';
import { MissingApiKeyError, errorMessage } from '../../errors';
import type { SpeechConfig, SpeechProvider } from '../../types';
import { FISH_BASE_URL } from './models';
import { isValidFishVoiceId } from './voice';

/** One clip's worth of French: an exercise item or an article sentence, never a whole document. */
export const SPEECH_TEXT_MAX_LENGTH = 600;
/** Far longer than any sentence; a bigger body is refused instead of buffered. */
export const SPEECH_AUDIO_MAX_BYTES = 8 * 1024 * 1024;
export const SPEECH_TIMEOUT_MS = 30_000;

const MARKUP_OR_LINK = /<\s*\/?\s*[a-zA-Z][^>]*>|https?:\/\/|\bdata:[a-z]+\/[a-z0-9.+-]+/i;

/** Blanks, braces and long dashes become pauses so synthesised speech reads natural sentences. */
export function cleanForSpeech(text: string): string {
  return text
    .replace(/\[___\]/g, ' ')
    .replace(/\{[^}]*\}/g, ' ')
    .replace(/[–—]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** The text the provider may receive: cleaned, nonempty, bounded, and free of markup or links. */
export function speechText(text: string): string {
  const clean = cleanForSpeech(text);
  if (!clean || clean.length > SPEECH_TEXT_MAX_LENGTH || MARKUP_OR_LINK.test(clean))
    throw new Error(i18n.t('errors.invalidSpeechText', { max: SPEECH_TEXT_MAX_LENGTH }));
  return clean;
}

/** Reads audio bytes under the cap, refusing a declared or actual size over it rather than buffering it. */
export async function readAudio(response: Response): Promise<Uint8Array<ArrayBuffer>> {
  const declared = Number(response.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > SPEECH_AUDIO_MAX_BYTES)
    throw new Error(i18n.t('errors.speechAudioTooLarge'));
  if (!response.body) throw new Error(i18n.t('errors.invalidAudio'));
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > SPEECH_AUDIO_MAX_BYTES) {
        // Do not await cancellation: a slow transport must not delay the refusal.
        void reader.cancel().catch(() => {});
        throw new Error(i18n.t('errors.speechAudioTooLarge'));
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const audio = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    audio.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return audio;
}

export const fishSpeech: SpeechProvider = {
  acceptsVoice: isValidFishVoiceId,

  async synthesize(request, config: SpeechConfig): Promise<Blob> {
    request.signal?.throwIfAborted();
    const key = config.apiKey?.trim();
    if (!key) throw new MissingApiKeyError();
    const model = normalizeModelId(config.model);
    if (!model) throw new Error(i18n.t('errors.invalidModelId'));
    const voice = config.voice.trim();
    if (!isValidFishVoiceId(voice)) throw new Error(i18n.t('errors.invalidVoice'));
    const input = speechText(request.text);
    // The request is bounded in time as well as in size; a deadline is a failure, a cancellation is not.
    const deadline = AbortSignal.timeout(SPEECH_TIMEOUT_MS);
    try {
      const response = await fetch(`${FISH_BASE_URL}/audio/speech`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
        // response_format is explicit: Fish defaults to PCM, and a non-MP3 body is refused below.
        body: JSON.stringify({ model, input, ...(voice ? { voice } : {}), response_format: 'mp3' }),
        signal: request.signal ? AbortSignal.any([request.signal, deadline]) : deadline,
      });
      if (!response.ok)
        throw new Error(`${response.status}: ${errorMessage(await response.json().catch(() => response.statusText))}`);
      const type = (response.headers.get('content-type') ?? '').split(';')[0].trim();
      if (type !== 'audio/mpeg') throw new Error(i18n.t('errors.invalidAudio'));
      const audio = await readAudio(response);
      if (!audio.byteLength) throw new Error(i18n.t('errors.invalidAudio'));
      return new Blob([audio], { type: 'audio/mpeg' });
    } catch (err) {
      // A cancelled request is the learner's choice: never report it as a failure.
      request.signal?.throwIfAborted();
      if (deadline.aborted) throw new Error(i18n.t('errors.speechTimeout'));
      throw new Error(errorMessage(err, key));
    }
  },
};
