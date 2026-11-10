/** Local speech: one chosen model, one attempt, no retry or fallback. */
import i18n from '../../../../i18n';
import { pcmToWav } from '../../../../utils/wav';
import { normalizeModelId } from '../../catalogue';
import { errorMessage } from '../../errors';
import type { SpeechConfig, SpeechProvider } from '../../types';
import { readAudio, speechText, SPEECH_TIMEOUT_MS } from '../fish/tts';
import { ollamaBaseUrl, ollamaHeaders } from './models';

export const ollamaSpeech: SpeechProvider = {
  // Voice names belong to the model; an unknown name must return its real error and available voices.
  acceptsVoice: () => true,

  async synthesize(request, config: SpeechConfig): Promise<Blob> {
    request.signal?.throwIfAborted();
    const key = config.apiKey?.trim() ?? '';
    const model = normalizeModelId(config.model);
    if (!model) throw new Error(i18n.t('errors.invalidModelId'));
    const voice = config.voice.trim();
    const input = speechText(request.text);
    const deadline = AbortSignal.timeout(SPEECH_TIMEOUT_MS);
    try {
      const response = await fetch(`${ollamaBaseUrl(config.baseUrl)}/v1/audio/speech`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...ollamaHeaders(key) },
        // Ollama's streaming WAV has maximum-value sizes; raw PCM lets us write the actual clip sizes.
        body: JSON.stringify({ model, input, response_format: 'pcm', ...(voice ? { voice } : {}) }),
        signal: request.signal ? AbortSignal.any([request.signal, deadline]) : deadline,
      });
      if (!response.ok)
        throw new Error(`${response.status}: ${errorMessage(await response.json().catch(() => response.statusText))}`);
      const audio = await readAudio(response);
      if (!audio.byteLength) throw new Error(i18n.t('errors.invalidAudio'));
      return new Blob([pcmToWav(audio, 24000)], { type: 'audio/wav' });
    } catch (err) {
      // A cancelled request is the learner's choice: never report it as a failure.
      request.signal?.throwIfAborted();
      if (deadline.aborted) throw new Error(i18n.t('errors.speechTimeout'));
      throw new Error(errorMessage(err, key));
    }
  },
};
