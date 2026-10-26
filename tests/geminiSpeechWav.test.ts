/** Gemini TTS raw PCM keeps becoming the same WAV bytes it produced before the shared helper existed. */
import { afterEach, beforeEach, expect, spyOn, test, type Mock } from 'bun:test';
import { geminiSpeech } from '../src/services/ai/providers/gemini/tts';
import type { SpeechConfig } from '../src/services/ai/types';

let fetchMock: Mock<typeof fetch>;
beforeEach(() => {
  fetchMock = spyOn(globalThis, 'fetch');
});
afterEach(() => fetchMock.mockRestore());

const config = (patch: Partial<SpeechConfig> = {}): SpeechConfig => ({
  apiKey: 'fixture-key',
  model: 'gemini-3.8-flash-lite-tts',
  voice: 'Kore',
  ...patch,
});

/** The Gemini SDK parses this body; the speech provider reads only the inline PCM part out of it. */
const answer = (mimeType: string, base64: string) =>
  Response.json({
    candidates: [{ content: { parts: [{ inlineData: { mimeType, data: base64 } }] } }],
  });

const clipBytes = async () => {
  const clip = await geminiSpeech.synthesize({ text: 'Bonjour' }, config());
  expect(clip.type).toBe('audio/wav');
  return new Uint8Array(await clip.arrayBuffer());
};

test('raw 16-bit PCM at 24 kHz is wrapped with the exact header the old inline helper wrote', async () => {
  // Three bytes: the base64 body 'AAEC' decodes to 00 01 02.
  fetchMock.mockResolvedValueOnce(answer('audio/L16;rate=24000', 'AAEC'));

  expect(Array.from(await clipBytes())).toEqual([
    // RIFF chunk, 36 + 3 payload bytes.
    82, 73, 70, 70, 39, 0, 0, 0,
    // WAVE, then the 16-byte fmt chunk.
    87, 65, 86, 69, 102, 109, 116, 32, 16, 0, 0, 0,
    // PCM format 1, one channel, 24000 Hz, 48000 bytes/s, 2-byte blocks, 16 bits per sample.
    1, 0, 1, 0, 192, 93, 0, 0, 128, 187, 0, 0, 2, 0, 16, 0,
    // data chunk of 3 bytes, then the samples themselves.
    100, 97, 116, 97, 3, 0, 0, 0, 0, 1, 2,
  ]);
  expect(fetchMock).toHaveBeenCalledTimes(1);
});

test('a 16 kHz answer writes its own rate and byte rate', async () => {
  fetchMock.mockResolvedValueOnce(answer('audio/L16;rate=16000', 'AAEC'));

  const bytes = await clipBytes();
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  expect(view.getUint32(24, true)).toBe(16000);
  expect(view.getUint32(28, true)).toBe(16000 * 2);
  expect(bytes.length).toBe(47);
  expect(Array.from(bytes.subarray(44))).toEqual([0, 1, 2]);
});

test('a mime type without a rate keeps the 24 kHz default', async () => {
  fetchMock.mockResolvedValueOnce(answer('audio/L16', 'AAEC'));

  const bytes = await clipBytes();
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  expect(view.getUint32(24, true)).toBe(24000);
  expect(view.getUint32(28, true)).toBe(24000 * 2);
});
