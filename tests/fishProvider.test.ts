/** Fish Audio speech: one bounded MP3 request with the learner's key, refusing what it cannot send. */
import { afterEach, beforeEach, describe, expect, spyOn, test, type Mock } from 'bun:test';
import i18n from '../src/i18n';
import { MissingApiKeyError } from '../src/services/ai/errors';
import { FISH_BASE_URL } from '../src/services/ai/providers/fish/models';
import {
  SPEECH_AUDIO_MAX_BYTES,
  SPEECH_TEXT_MAX_LENGTH,
  fishSpeech,
  speechText,
} from '../src/services/ai/providers/fish/tts';
import { isValidFishVoiceId } from '../src/services/ai/providers/fish/voice';
import type { SpeechConfig } from '../src/services/ai/types';
import { failure } from './fixtures/storage';

let fetchMock: Mock<typeof fetch>;
beforeEach(() => {
  fetchMock = spyOn(globalThis, 'fetch');
});
afterEach(() => fetchMock.mockRestore());

/** A short valid reference id; Fish ids are long, and an OpenAI preset is shorter. */
const VOICE = '0123456789abcdef0123456789abcdef';
const MP3 = Uint8Array.from([0x49, 0x44, 0x33, 0x04, 0x00, 0x00, 0x00]);

const audio = (status = 200, headers: Record<string, string> = {}) =>
  new Response(MP3, { status, headers: { 'content-type': 'audio/mpeg', ...headers } });

const config = (patch: Partial<SpeechConfig> = {}): SpeechConfig => ({
  apiKey: 'fixture-key',
  model: 'fish-audio/s2.1-pro-free',
  voice: '',
  ...patch,
});

const speak = (text = 'Bonjour', patch: Partial<SpeechConfig> = {}, signal?: AbortSignal) =>
  fishSpeech.synthesize({ text, signal }, config(patch));

const sent = () => {
  const [input, init] = fetchMock.mock.calls.at(-1)!;
  const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
  return { url, init: init!, body: JSON.parse(init!.body as string) as Record<string, unknown> };
};

describe('Fish Audio speech', () => {
  test('posts the chosen free model to the fixed endpoint as MP3, with no voice when none is chosen', async () => {
    fetchMock.mockResolvedValueOnce(audio());
    const clip = await speak();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const { url, init, body } = sent();
    expect(url).toBe(`${FISH_BASE_URL}/audio/speech`);
    expect(url).not.toContain('fixture-key');
    expect(init.method).toBe('POST');
    expect(init.headers).toEqual({ 'Content-Type': 'application/json', Authorization: 'Bearer fixture-key' });
    expect(body).toEqual({ model: 'fish-audio/s2.1-pro-free', input: 'Bonjour', response_format: 'mp3' });
    expect(clip.type).toBe('audio/mpeg');
    expect(new Uint8Array(await clip.arrayBuffer())).toEqual(MP3);
  });

  test('sends a chosen voice id and never moves to another model', async () => {
    fetchMock.mockResolvedValueOnce(audio());
    await speak('Bonjour', { voice: VOICE });
    expect(sent().body).toEqual({
      model: 'fish-audio/s2.1-pro-free',
      input: 'Bonjour',
      voice: VOICE,
      response_format: 'mp3',
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  test('cleans exercise markup the way the source app did before anything is sent', async () => {
    fetchMock.mockImplementation(Object.assign(async () => audio(), { preconnect: () => {} }));
    await speak('  Il  [___]  {note} arrive — ici  ');
    expect(sent().body.input).toBe('Il arrive ici');
    await speak('«\u00a0Bonjour\u00a0»\u00a0!');
    expect(sent().body.input).toBe('« Bonjour » !');
    expect(speechText('a\t b')).toBe('a b');
  });

  test('refuses empty, oversized, markup or link text without sending anything', async () => {
    const tooLong = 'a'.repeat(SPEECH_TEXT_MAX_LENGTH + 1);
    for (const text of [
      '',
      '   ',
      tooLong,
      '<b>Bonjour</b>',
      'Écoute https://example.test',
      'data:audio/wav;base64,AA',
    ]) {
      expect((await failure(speak(text))) as Error).toMatchObject({
        message: i18n.t('errors.invalidSpeechText', { max: SPEECH_TEXT_MAX_LENGTH }),
      });
    }
    expect(fetchMock).not.toHaveBeenCalled();
    // The bound is inclusive: a full-length sentence still goes out.
    fetchMock.mockResolvedValueOnce(audio());
    await speak('a'.repeat(SPEECH_TEXT_MAX_LENGTH));
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  test('an empty voice means the model default; an OpenAI preset or a non-id is refused', async () => {
    expect(isValidFishVoiceId('')).toBe(true);
    expect(isValidFishVoiceId('   ')).toBe(true);
    expect(isValidFishVoiceId(VOICE)).toBe(true);
    for (const voice of ['alloy', 'nova', 'onyx', 'shimmer', 'Alloy', 'short', 'has space', 'bad/id', 'id!']) {
      expect(isValidFishVoiceId(voice)).toBe(false);
      expect((await failure(speak('Bonjour', { voice }))) as Error).toMatchObject({
        message: i18n.t('errors.invalidVoice'),
      });
    }
    expect(fishSpeech.acceptsVoice?.('alloy')).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test('a missing key or an unusable model is refused before the request', async () => {
    expect(await failure(speak('Bonjour', { apiKey: '  ' }))).toBeInstanceOf(MissingApiKeyError);
    expect((await failure(speak('Bonjour', { model: '  ' }))) as Error).toMatchObject({
      message: i18n.t('errors.invalidModelId'),
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test('reports the provider status and message with the key redacted, and never retries', async () => {
    const cases: [number, string][] = [
      [401, '{"error":{"code":401,"message":"missing API key: pass fixture-key as Bearer"}}'],
      [400, '{"error":{"message":"model fish-audio/s2.1-pro-free is not available"}}'],
      [429, '{"error":{"message":"rate limited"}}'],
      [500, '{"error":{"message":"boom"}}'],
    ];
    for (const [status, body] of cases) {
      fetchMock.mockResolvedValueOnce(Response.json(JSON.parse(body), { status }));
      const error = (await failure(speak())) as Error;
      expect(error.message).toStartWith(`${status}: `);
      expect(error.message).not.toContain('fixture-key');
      if (body.includes('fixture-key')) expect(error.message).toContain('[redacted]');
      expect(fetchMock).toHaveBeenCalledTimes(1);
      fetchMock.mockClear();
    }
  });

  test('refuses a body that is not MP3, or is empty, or is over the byte cap', async () => {
    fetchMock.mockResolvedValueOnce(new Response(MP3, { headers: { 'content-type': 'audio/wav' } }));
    expect(((await failure(speak())) as Error).message).toBe(i18n.t('errors.invalidAudio'));
    fetchMock.mockResolvedValueOnce(new Response(new Uint8Array(), { headers: { 'content-type': 'audio/mpeg' } }));
    expect(((await failure(speak())) as Error).message).toBe(i18n.t('errors.invalidAudio'));

    fetchMock.mockResolvedValueOnce(audio(200, { 'content-length': String(SPEECH_AUDIO_MAX_BYTES + 1) }));
    expect(((await failure(speak())) as Error).message).toBe(i18n.t('errors.speechAudioTooLarge'));

    // Without a declared length the stream itself is cut off at the cap.
    const oversized = new Uint8Array(SPEECH_AUDIO_MAX_BYTES + 1);
    fetchMock.mockResolvedValueOnce(new Response(oversized, { headers: { 'content-type': 'audio/mpeg' } }));
    expect(((await failure(speak())) as Error).message).toBe(i18n.t('errors.speechAudioTooLarge'));
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });

  test('a cancelled request never reaches the provider, and a mid-flight cancellation is an AbortError', async () => {
    const preflight = new AbortController();
    preflight.abort();
    expect(((await failure(speak('Bonjour', {}, preflight.signal))) as Error).name).toBe('AbortError');
    expect(fetchMock).not.toHaveBeenCalled();

    const controller = new AbortController();
    fetchMock.mockImplementationOnce(
      Object.assign(
        async () => {
          expect(fetchMock.mock.calls[0][1]?.signal).toBeInstanceOf(AbortSignal);
          controller.abort();
          throw new DOMException('The request was cancelled.', 'AbortError');
        },
        { preconnect: () => {} },
      ),
    );
    expect(((await failure(speak('Bonjour', {}, controller.signal))) as Error).name).toBe('AbortError');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
