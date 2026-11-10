import i18n from '../../../../i18n';
import { errorMessage } from '../../errors';
import { base64ToBlob } from '../../../../utils/binary';
import { pcmToWav } from '../../../../utils/wav';
import type { SpeechConfig, SpeechProvider } from '../../types';
import { geminiClient } from './client';

const DEFAULT_STYLE =
  'Natural, authentic native French speaker with clear French accent, standard liaisons, and warm tone';

export const geminiSpeech: SpeechProvider = {
  async synthesize(request, config: SpeechConfig): Promise<Blob> {
    request.signal?.throwIfAborted();
    const ai = geminiClient(config.apiKey);
    let response;
    try {
      response = await ai.models.generateContent({
        model: config.model,
        contents: [
          { role: 'user', parts: [{ text: request.text, speechMetadata: { style: request.style || DEFAULT_STYLE } }] },
        ],
        config: {
          abortSignal: request.signal,
          responseModalities: ['AUDIO'],
          speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: config.voice } } },
        },
      });
    } catch (err) {
      request.signal?.throwIfAborted();
      throw new Error(errorMessage(err, config.apiKey));
    }
    request.signal?.throwIfAborted();
    const inline = response.candidates?.[0]?.content?.parts?.[0]?.inlineData;
    if (!inline?.data) throw new Error(i18n.t('errors.noAudio'));
    if (inline.mimeType?.includes('wav')) return base64ToBlob(inline.data);
    const rate = Number(/rate=(\d+)/.exec(inline.mimeType || '')?.[1]) || 24000;
    const pcm = Uint8Array.from(atob(inline.data), (c) => c.charCodeAt(0));
    return new Blob([pcmToWav(pcm, rate)], { type: 'audio/wav' });
  },
};
