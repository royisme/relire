/**
 * A pronunciation take the provider cannot listen to and the browser gave no
 * words for has nothing to score: the reference text must never be scored as if
 * the learner had read it (issue #45). Owns only that refusal; the audio and
 * transcript paths are checked here as the unchanged surroundings.
 */
import { afterEach, beforeEach, expect, mock, spyOn, test } from 'bun:test';
import i18n from '../src/i18n';
import * as accessModule from '../src/services/ai/access';
import * as api from '../src/services/api';
import { pronunciationRequest } from '../src/services/ai/prompts';
import type { AiAccess, AiPurpose, TextPurpose } from '../src/services/ai/types';
import { contextOf, fakeProvider } from './fixtures/fakeProvider';
import { failure, freshDb } from './fixtures/storage';

beforeEach(freshDb);
afterEach(() => mock.restore());

/** The boundary the api sees: one fake provider behind a `text` selection, listening only when `listen` is true. */
function fakeAccess(answer: unknown, listen = false) {
  const provider = fakeProvider(answer);
  provider.supportsAudioInput = listen;
  const execution = contextOf(provider, 'unknown').execution;
  const access: AiAccess = {
    isConfigured: mock((_purpose: AiPurpose) => true),
    selection: (purpose: AiPurpose) => ({
      providerId: 'gemini',
      model: `custom-${purpose}`,
      voice: 'Charon',
      device: false,
      capabilities: { textGeneration: 'unknown', imageInput: 'unknown', speechOutput: 'unknown' },
    }),
    text: mock((_purpose: TextPurpose) => execution),
    synthesize: mock(async () => new Blob(['audio'], { type: 'audio/wav' })),
    assess: mock(async () => {
      throw new Error('assessment not used here');
    }),
    checkConnection: mock(async (_purpose: TextPurpose) => {}),
    listModels: mock(async () => []),
  };
  return { access, provider };
}

const assessment = { overallScore: 70 };
const referenceText = 'Bonjour tout le monde.';
const noSpeech = () => new Error(i18n.t('errors.noSpeechToScore'));

test('a take with no audio and no transcript is refused before any request', async () => {
  const { access, provider } = fakeAccess(assessment);
  spyOn(accessModule, 'getAiAccess').mockReturnValue(access);
  expect(await failure(api.assessPronunciation({ referenceText }))).toEqual(noSpeech());
  expect(provider.requests).toHaveLength(0);
});

test('a whitespace-only transcript is as empty as no transcript', async () => {
  const { access, provider } = fakeAccess(assessment);
  spyOn(accessModule, 'getAiAccess').mockReturnValue(access);
  expect(await failure(api.assessPronunciation({ referenceText, userTranscript: '   ' }))).toEqual(noSpeech());
  expect(provider.requests).toHaveLength(0);
});

test('a real transcript is scored as the learner words, never as the reference text', async () => {
  const { access, provider } = fakeAccess(assessment);
  spyOn(accessModule, 'getAiAccess').mockReturnValue(access);
  const transcript = 'bonjour le monde';
  await api.assessPronunciation({ referenceText, userTranscript: transcript });
  expect(provider.requests).toHaveLength(1);
  const prompt = provider.requests[0].prompt;
  expect(prompt).toContain(transcript);
  // The reference is quoted once, as the text to read; the transcript slot holds the learner's own words.
  expect(prompt.split(referenceText)).toHaveLength(2);
});

test('the request builder never lets the reference text stand in for the learner', () => {
  const prompt = pronunciationRequest({ referenceText }, 'en').prompt;
  // Only the text to read is quoted; an empty transcript stays empty.
  expect(prompt.split(referenceText)).toHaveLength(2);
});

test('a provider that can listen still gets the audio when there is one', async () => {
  const { access, provider } = fakeAccess(assessment, true);
  spyOn(accessModule, 'getAiAccess').mockReturnValue(access);
  await api.assessPronunciation({ referenceText, audioBase64: 'AAAA', mimeType: 'audio/webm' });
  expect(provider.requests).toHaveLength(1);
  expect(provider.requests[0].audio).toEqual({ base64: 'AAAA', mimeType: 'audio/webm' });
});
