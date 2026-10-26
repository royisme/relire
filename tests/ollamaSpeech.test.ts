/** Ollama Phonon speech: one local request for raw PCM, wrapped as a playable WAV, keyless by default. */
import { afterEach, beforeEach, describe, expect, spyOn, test, type Mock } from 'bun:test';
import i18n from '../src/i18n';
import { SPEECH_AUDIO_MAX_BYTES, SPEECH_TEXT_MAX_LENGTH } from '../src/services/ai/providers/fish/tts';
import { OLLAMA_DEFAULT_BASE_URL } from '../src/services/ai/providers/ollama/models';
import { ollamaSpeech } from '../src/services/ai/providers/ollama/tts';
import type { SpeechConfig } from '../src/services/ai/types';
import { pcmToWav } from '../src/utils/wav';
import { failure } from './fixtures/storage';

let fetchMock: Mock<typeof fetch>;
beforeEach(() => {
  fetchMock = spyOn(globalThis, 'fetch');
});
afterEach(() => fetchMock.mockRestore());

const MODEL = 'phonon:40m-multilingual';
/** Four bytes of 16-bit PCM: two samples. */
const PCM = Uint8Array.from([0x00, 0x01, 0x00, 0x02]);

const rawPcm = (pcm = PCM, headers: Record<string, string> = {}) =>
  new Response(pcm, { headers: { 'content-type': 'audio/pcm', ...headers } });

const config = (patch: Partial<SpeechConfig> = {}): SpeechConfig => ({
  apiKey: '',
  model: MODEL,
  voice: '',
  ...patch,
});

const speak = (text = 'Bonjour', patch: Partial<SpeechConfig> = {}, signal?: AbortSignal) =>
  ollamaSpeech.synthesize({ text, signal }, config(patch));

const sent = () => {
  const [input, init] = fetchMock.mock.calls.at(-1)!;
  const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
  return { url, init: init!, body: JSON.parse(init!.body as string) as Record<string, unknown> };
};

describe('Ollama Phonon speech', () => {
  test('any voice name is accepted: the names belong to the local model, not to the provider', () => {
    expect(ollamaSpeech.acceptsVoice?.('anything')).toBe(true);
  });

  test('asks the local server for raw PCM of the chosen model, with no voice when none is chosen', async () => {
    fetchMock.mockResolvedValueOnce(rawPcm());
    const clip = await speak();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const { url, init, body } = sent();
    expect(url).toBe(`${OLLAMA_DEFAULT_BASE_URL}/v1/audio/speech`);
    expect(init.method).toBe('POST');
    // No key is needed, and no empty Authorization header is invented.
    expect(init.headers).toEqual({ 'Content-Type': 'application/json' });
    expect(body).toEqual({ model: MODEL, input: 'Bonjour', response_format: 'pcm' });

    // Raw PCM becomes a WAV clip the browser can play, with the header sizes of this exact payload.
    expect(clip.type).toBe('audio/wav');
    expect(new Uint8Array(await clip.arrayBuffer())).toEqual(pcmToWav(PCM, 24000));
  });

  test('a configured endpoint replaces the local default, without a doubled slash', async () => {
    fetchMock.mockResolvedValueOnce(rawPcm());
    await speak('Bonjour', { baseUrl: ' http://192.168.1.20:11434/ ' });
    expect(sent().url).toBe('http://192.168.1.20:11434/v1/audio/speech');

    fetchMock.mockResolvedValueOnce(rawPcm());
    await speak('Bonjour', { baseUrl: '' });
    expect(sent().url).toBe(`${OLLAMA_DEFAULT_BASE_URL}/v1/audio/speech`);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  test('sends a chosen voice trimmed, and leaves the voice out entirely when it is blank', async () => {
    fetchMock.mockResolvedValueOnce(rawPcm());
    await speak('Bonjour', { voice: '  Fr-voice_01  ' });
    expect(sent().body).toEqual({ model: MODEL, input: 'Bonjour', voice: 'Fr-voice_01', response_format: 'pcm' });

    fetchMock.mockResolvedValueOnce(rawPcm());
    await speak('Bonjour', { voice: '   ' });
    expect(sent().body).toEqual({ model: MODEL, input: 'Bonjour', response_format: 'pcm' });
  });

  test('a key typed for a proxy in front of Ollama goes as a Bearer header', async () => {
    fetchMock.mockResolvedValueOnce(rawPcm());
    await speak('Bonjour', { apiKey: ' fixture-key ' });
    expect(sent().init.headers).toEqual({
      'Content-Type': 'application/json',
      Authorization: 'Bearer fixture-key',
    });
  });

  test('cleans exercise markup before anything is sent', async () => {
    fetchMock.mockResolvedValueOnce(rawPcm());
    await speak('  Il  [___]  {note} arrive — ici  ');
    expect(sent().body.input).toBe('Il arrive ici');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  test('refuses empty, oversized, markup or link text without sending anything', async () => {
    for (const text of [
      '',
      '   ',
      'a'.repeat(SPEECH_TEXT_MAX_LENGTH + 1),
      '<b>Bonjour</b>',
      'Écoute https://example.test',
      'data:audio/wav;base64,AA',
    ]) {
      expect(((await failure(speak(text))) as Error).message).toBe(
        i18n.t('errors.invalidSpeechText', { max: SPEECH_TEXT_MAX_LENGTH }),
      );
    }
    expect(fetchMock).not.toHaveBeenCalled();

    // The bound is inclusive: a full-length sentence still goes out.
    fetchMock.mockResolvedValueOnce(rawPcm());
    await speak('a'.repeat(SPEECH_TEXT_MAX_LENGTH));
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  test('an unusable model or endpoint fails before the request', async () => {
    expect(((await failure(speak('Bonjour', { model: '  ' }))) as Error).message).toBe(i18n.t('errors.invalidModelId'));
    for (const baseUrl of ['ftp://localhost:11434', 'http://user:pw@localhost:11434', 'localhost:11434'])
      expect(((await failure(speak('Bonjour', { baseUrl }))) as Error).message).toBe(i18n.t('errors.invalidBaseUrl'));
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test('reports the status and the provider message, both of Ollama’s error shapes, once', async () => {
    fetchMock.mockResolvedValueOnce(
      Response.json({ error: { message: 'model "phonon:40m-fr" not found' } }, { status: 400 }),
    );
    expect(((await failure(speak())) as Error).message).toBe('400: model "phonon:40m-fr" not found');

    fetchMock.mockResolvedValueOnce(Response.json({ error: 'voice "x" not found' }, { status: 400 }));
    expect(((await failure(speak())) as Error).message).toBe('400: voice "x" not found');

    fetchMock.mockResolvedValueOnce(Response.json({ error: { message: 'rejected key fixture-key' } }, { status: 401 }));
    const redacted = (await failure(speak('Bonjour', { apiKey: 'fixture-key' }))) as Error;
    expect(redacted.message).toBe('401: rejected key [redacted]');
    expect(redacted.message).not.toContain('fixture-key');

    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  test('an error body that is not JSON falls back to the status text', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response('Internal Server Error', { status: 500, statusText: 'Internal Server Error' }),
    );
    expect(((await failure(speak())) as Error).message).toBe('500: Internal Server Error');
  });

  test('an empty clip is refused, and so is one over the audio cap', async () => {
    fetchMock.mockResolvedValueOnce(rawPcm(new Uint8Array()));
    expect(((await failure(speak())) as Error).message).toBe(i18n.t('errors.invalidAudio'));

    fetchMock.mockResolvedValueOnce(rawPcm(PCM, { 'content-length': String(SPEECH_AUDIO_MAX_BYTES + 1) }));
    expect(((await failure(speak())) as Error).message).toBe(i18n.t('errors.speechAudioTooLarge'));
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  test('a request that outlives its deadline fails with the timeout text, not as a cancellation', async () => {
    // A real deadline aborts the fetch, which rejects with an AbortError; the deadline is what explains it.
    const deadline = AbortSignal.abort();
    const timeout = spyOn(AbortSignal, 'timeout').mockReturnValue(deadline);
    try {
      fetchMock.mockRejectedValueOnce(new DOMException('The request timed out.', 'TimeoutError'));
      expect(((await failure(speak())) as Error).message).toBe(i18n.t('errors.speechTimeout'));
    } finally {
      timeout.mockRestore();
    }
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  test('a cancelled request never reaches the server, and a mid-flight cancel is an AbortError, not a failure', async () => {
    const preflight = new AbortController();
    preflight.abort();
    expect(((await failure(speak('Bonjour', {}, preflight.signal))) as Error).name).toBe('AbortError');
    expect(fetchMock).not.toHaveBeenCalled();

    const live = new AbortController();
    fetchMock.mockImplementationOnce(
      Object.assign(
        async () => {
          expect(fetchMock.mock.calls[0][1]?.signal).toBeInstanceOf(AbortSignal);
          live.abort();
          throw new DOMException('The request was cancelled.', 'AbortError');
        },
        { preconnect: () => {} },
      ),
    );
    const cancelled = (await failure(speak('Bonjour', {}, live.signal))) as Error;
    expect(cancelled.name).toBe('AbortError');
    expect(cancelled.message).not.toBe(i18n.t('errors.speechTimeout'));
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
