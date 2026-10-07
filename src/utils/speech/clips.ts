import { getSpeechProvider } from '../../services/ai/providers';
import { getAudio, putAudio } from '../../storage/audio';
import { getApiKey, getAppSettings, hasSpeechKey, type AppSettings } from '../appSettings';

/**
 * Where a spoken clip comes from: stored audio first, the user's speech
 * provider otherwise (and the new clip is stored). Knows nothing about playback.
 */

// Clips being synthesized right now, so two requests for the same text cost one call.
const synthesizing = new Map<string, Promise<Blob>>();

/** Returns the clip from storage when we have it, otherwise synthesizes and keeps it. */
export async function loadSpeech(text: string, voice?: string, settings: AppSettings = getAppSettings()): Promise<Blob> {
  const provider = settings.speechProvider;
  const effectiveVoice = voice || settings.speechVoice;
  const model = settings.speechModel;
  const trimmed = text.trim();

  const stored = await getAudio(provider, model, effectiveVoice, trimmed);
  if (stored) return stored;

  const flightKey = `${provider}|${model}|${effectiveVoice}|${trimmed}`;
  const pending = synthesizing.get(flightKey);
  if (pending) return pending;

  const request = getSpeechProvider(provider)
    .synthesize({ text: trimmed }, { apiKey: getApiKey(settings, provider), model, voice: effectiveVoice })
    .then(async (blob) => {
      await putAudio(provider, model, effectiveVoice, trimmed, blob);
      return blob;
    })
    .finally(() => synthesizing.delete(flightKey));
  synthesizing.set(flightKey, request);
  return request;
}

/**
 * Makes sure the clips for these texts are stored (used when a word is saved, so its pronunciation is kept
 * with it, and by `sequence.ts` to fetch the next sentences ahead). Quiet: no key, offline or an error just
 * means nothing is stored. `shouldContinue`, checked before each request, stops the run when it turns false
 * (the listener paused or moved on), without cancelling a request already in flight.
 */
export async function prefetchSpeech(texts: string[], shouldContinue: () => boolean = () => true): Promise<void> {
  if (!hasSpeechKey()) return;
  for (const text of texts) {
    if (!shouldContinue()) return;
    if (!text.trim()) continue;
    try {
      await loadSpeech(text);
    } catch {
      return;
    }
  }
}
