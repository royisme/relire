/**
 * The read-aloud check routes through the configured audio assessment provider and never falls
 * back to Text AI, which keeps its old path untouched when no assessment provider is configured
 * (issue #57). The PCM decode itself is browser-owned; here it is a spy, so only the routing,
 * the refusal without a take and the real error surfacing are under test.
 */
import { afterEach, beforeEach, expect, mock, spyOn, test } from 'bun:test';
import i18n from '../src/i18n';
import * as accessModule from '../src/services/ai/access';
import * as api from '../src/services/api';
import * as pcmModule from '../src/utils/speech/pcm';
import type { AiAccess, AiPurpose, AssessmentRequest, TextPurpose } from '../src/services/ai/types';
import { contextOf, fakeProvider } from './fixtures/fakeProvider';
import { failure, freshDb } from './fixtures/storage';

beforeEach(freshDb);
afterEach(() => mock.restore());

/** The boundary the api sees: a text provider, and an assessment provider only when `configured`. */
function fakeAccess(
  answer: unknown,
  configured: boolean,
  assessResult: unknown = { overallScore: 70 },
  listen = false,
) {
  const provider = fakeProvider(answer);
  provider.supportsAudioInput = listen;
  const execution = contextOf(provider, 'unknown').execution;
  const assess = mock(async (_request: AssessmentRequest) => {
    if (assessResult instanceof Error) throw assessResult;
    return assessResult as never;
  });
  const access: AiAccess = {
    isConfigured: mock((purpose: AiPurpose) => (purpose === 'assessment' ? configured : true)),
    selection: (purpose: AiPurpose) => ({
      providerId: 'gemini',
      model: `custom-${purpose}`,
      voice: 'Charon',
      device: false,
      capabilities: { textGeneration: 'unknown', imageInput: 'unknown', speechOutput: 'unknown' },
    }),
    text: mock((_purpose: TextPurpose) => execution),
    synthesize: mock(async () => new Blob(['audio'], { type: 'audio/wav' })),
    assess,
    checkConnection: mock(async (_purpose: TextPurpose) => {}),
    listModels: mock(async () => []),
  };
  return { access, provider, assess };
}

const referenceText = 'Bonjour tout le monde.';
const take = new Blob(['take'], { type: 'audio/webm' });
const decoded = new Int16Array([1, -2, 3]);
const scores = { overallScore: 72, accuracyScore: 70, fluencyScore: 74 };

test('a configured assessment provider decodes the take and scores the audio in fr-FR', async () => {
  const fake = fakeAccess(scores, true, scores);
  spyOn(accessModule, 'getAiAccess').mockReturnValue(fake.access);
  const decode = spyOn(pcmModule, 'decodeTakeToPcm16k').mockResolvedValue(decoded);
  const result = await api.assessPronunciation({ referenceText, audio: take, userTranscript: 'bonjour' });
  expect(result).toEqual(scores);
  expect(decode).toHaveBeenCalledTimes(1);
  expect(decode.mock.calls[0][0]).toBe(take);
  expect(fake.assess).toHaveBeenCalledTimes(1);
  // The browser transcript is not sent: the provider scores the recording itself.
  expect(fake.assess.mock.calls[0][0]).toEqual({ pcm: decoded, referenceText, locale: 'fr-FR', signal: undefined });
  expect(fake.provider.requests).toHaveLength(0);
});

test('a configured assessment provider receives the caller abort signal', async () => {
  const fake = fakeAccess(scores, true, scores);
  spyOn(accessModule, 'getAiAccess').mockReturnValue(fake.access);
  spyOn(pcmModule, 'decodeTakeToPcm16k').mockResolvedValue(decoded);
  const controller = new AbortController();
  await api.assessPronunciation({ referenceText, audio: take, signal: controller.signal });
  expect(fake.assess.mock.calls[0][0].signal).toBe(controller.signal);
});

test('configured with no take refuses with its own wording before decoding or calling any provider', async () => {
  const fake = fakeAccess(scores, true);
  spyOn(accessModule, 'getAiAccess').mockReturnValue(fake.access);
  const decode = spyOn(pcmModule, 'decodeTakeToPcm16k');
  const message = ((await failure(api.assessPronunciation({ referenceText, userTranscript: 'bonjour' }))) as Error)
    .message;
  // The Azure path never uses a transcript, so it must not show the transcript-aware refusal.
  expect(message).toBe(i18n.t('errors.noRecordingToScore'));
  expect(message).not.toBe(i18n.t('errors.noSpeechToScore'));
  expect(decode).not.toHaveBeenCalled();
  expect(fake.assess).not.toHaveBeenCalled();
  expect(fake.provider.requests).toHaveLength(0);
});

test('without a configured assessment provider a take with no audio and no transcript keeps the old refusal', async () => {
  const fake = fakeAccess(scores, false);
  spyOn(accessModule, 'getAiAccess').mockReturnValue(fake.access);
  const decode = spyOn(pcmModule, 'decodeTakeToPcm16k');
  expect(await failure(api.assessPronunciation({ referenceText }))).toEqual(
    new Error(i18n.t('errors.noSpeechToScore')),
  );
  expect(decode).not.toHaveBeenCalled();
  expect(fake.assess).not.toHaveBeenCalled();
  expect(fake.provider.requests).toHaveLength(0);
});

test('a decode failure surfaces its real error and never falls back to Text AI', async () => {
  const fake = fakeAccess(scores, true);
  spyOn(accessModule, 'getAiAccess').mockReturnValue(fake.access);
  spyOn(pcmModule, 'decodeTakeToPcm16k').mockRejectedValue(new Error('TEST decode failed'));
  expect(((await failure(api.assessPronunciation({ referenceText, audio: take }))) as Error).message).toBe(
    'TEST decode failed',
  );
  expect(fake.assess).not.toHaveBeenCalled();
  expect(fake.provider.requests).toHaveLength(0);
});

test('an assessment provider failure surfaces its real error and never falls back to Text AI', async () => {
  const fake = fakeAccess(scores, true, new Error('TEST provider failed'));
  spyOn(accessModule, 'getAiAccess').mockReturnValue(fake.access);
  spyOn(pcmModule, 'decodeTakeToPcm16k').mockResolvedValue(decoded);
  expect(((await failure(api.assessPronunciation({ referenceText, audio: take }))) as Error).message).toBe(
    'TEST provider failed',
  );
  expect(fake.provider.requests).toHaveLength(0);
});

test('without a configured assessment provider the text path is unchanged and the take stays base64', async () => {
  const fake = fakeAccess(scores, false, scores, true);
  spyOn(accessModule, 'getAiAccess').mockReturnValue(fake.access);
  const decode = spyOn(pcmModule, 'decodeTakeToPcm16k');
  await api.assessPronunciation({
    referenceText,
    audio: take,
    audioBase64: 'AAAA',
    mimeType: 'audio/webm',
    userTranscript: 'bonjour',
  });
  expect(decode).not.toHaveBeenCalled();
  expect(fake.assess).not.toHaveBeenCalled();
  expect(fake.provider.requests).toHaveLength(1);
  expect(fake.provider.requests[0].audio).toEqual({ base64: 'AAAA', mimeType: 'audio/webm' });
});
