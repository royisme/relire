import i18n from '../../../../i18n';
import { errorMessage } from '../../errors';
import { base64ToBlob } from '../../../../utils/binary';
import type { SpeechConfig, SpeechProvider } from '../../types';
import { geminiClient } from './client';

/** Gemini TTS returns raw 16-bit PCM; wrap it in a WAV header so <audio> can play it. */
function pcmToWavBase64(pcmBase64: string, sampleRate: number): string {
  const pcm = Uint8Array.from(atob(pcmBase64), (c) => c.charCodeAt(0));
  const header = new ArrayBuffer(44);
  const v = new DataView(header);
  const str = (o: number, s: string) => [...s].forEach((ch, i) => v.setUint8(o + i, ch.charCodeAt(0)));
  str(0, 'RIFF');
  v.setUint32(4, 36 + pcm.length, true);
  str(8, 'WAVEfmt ');
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true);
  v.setUint16(22, 1, true);
  v.setUint32(24, sampleRate, true);
  v.setUint32(28, sampleRate * 2, true);
  v.setUint16(32, 2, true);
  v.setUint16(34, 16, true);
  str(36, 'data');
  v.setUint32(40, pcm.length, true);
  const wav = new Uint8Array(44 + pcm.length);
  wav.set(new Uint8Array(header), 0);
  wav.set(pcm, 44);
  let bin = '';
  for (let i = 0; i < wav.length; i += 0x8000) bin += String.fromCharCode(...wav.subarray(i, i + 0x8000));
  return btoa(bin);
}

const DEFAULT_STYLE = 'Natural, authentic native French speaker with clear French accent, standard liaisons, and warm tone';

export const geminiSpeech: SpeechProvider = {
  async synthesize(request, config: SpeechConfig): Promise<Blob> {
    const ai = geminiClient(config.apiKey);
    let response;
    try {
      response = await ai.models.generateContent({
        model: config.model,
        contents: [{ role: 'user', parts: [{ text: request.text, speechMetadata: { style: request.style || DEFAULT_STYLE } }] }],
        config: {
          responseModalities: ['AUDIO'],
          speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: config.voice } } },
        },
      } as any);
    } catch (err) {
      throw new Error(errorMessage(err));
    }
    const inline = response.candidates?.[0]?.content?.parts?.[0]?.inlineData;
    if (!inline?.data) throw new Error(i18n.t('errors.noAudio'));
    if (inline.mimeType?.includes('wav')) return base64ToBlob(inline.data);
    const rate = Number(/rate=(\d+)/.exec(inline.mimeType || '')?.[1]) || 24000;
    return base64ToBlob(pcmToWavBase64(inline.data, rate));
  },
};
