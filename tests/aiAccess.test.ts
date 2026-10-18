/** The replaceable AI boundary owns credentials, independent purpose routing, and real speech checks. */
import { afterEach, beforeEach, describe, expect, mock, spyOn, test } from 'bun:test';
import i18n from '../src/i18n';
import * as accessModule from '../src/services/ai/access';
import { gemini } from '../src/services/ai/providers/gemini';
import { geminiText } from '../src/services/ai/providers/gemini/client';
import { geminiSpeech } from '../src/services/ai/providers/gemini/tts';
import { openaiText } from '../src/services/ai/providers/openai/client';
import { openaiCatalogue } from '../src/services/ai/providers/openai/models';
import { fishSpeech } from '../src/services/ai/providers/fish/tts';
import { getAudio } from '../src/storage/audio';
import type { AiAccess, AiPurpose, TextPurpose } from '../src/services/ai/types';
import { getAppSettings } from '../src/utils/appSettings';
import { loadSpeech, prefetchSpeech } from '../src/utils/speech/clips';
import { testSpeech } from '../src/utils/speech/playback';
import * as api from '../src/services/api';
import { contextOf, fakeProvider } from './fixtures/fakeProvider';
import { draftFixture } from './fixtures/importDraft';
import { failure, freshDb } from './fixtures/storage';

beforeEach(freshDb);
afterEach(() => mock.restore());

const settings = () => ({
  ...getAppSettings(),
  textModel: 'custom-text',
  ocrModel: 'custom-ocr',
  speechModel: 'custom-speech',
  speechVoice: 'Charon',
  apiKeys: { gemini: 'fixture-key' },
});

function fakeAccess(answer: unknown) {
  const provider = fakeProvider(answer);
  const execution = contextOf(provider, 'unknown').execution;
  const text = mock((_purpose: TextPurpose) => execution);
  const synthesize = mock(async () => new Blob(['audio'], { type: 'audio/wav' }));
  const checkConnection = mock(async (_purpose: TextPurpose) => {});
  const listModels = mock(async () => []);
  const isConfigured = mock((_purpose: AiPurpose) => true);
  const access: AiAccess = {
    isConfigured,
    selection: (purpose: AiPurpose) => ({
      providerId: 'gemini',
      model: `custom-${purpose}`,
      voice: 'Charon',
      capabilities: { textGeneration: 'unknown', imageInput: 'unknown', speechOutput: 'unknown' },
    }),
    text,
    synthesize,
    checkConnection,
    listModels,
  };
  return { access, provider, text, synthesize, checkConnection, listModels, isConfigured };
}

const page = { data: 'AAAA', mimeType: 'image/png' };

describe('BYOK access', () => {
  test('independent text/OCR configs share one key, snapshotted before asynchronous rendering or settings edits', async () => {
    const configured = settings();
    const access = accessModule.createByokAccess(configured);
    configured.textModel = 'edited-text';
    configured.ocrModel = 'edited-ocr';
    configured.apiKeys.gemini = 'edited-key';
    const provider = fakeProvider(draftFixture);
    const generate = spyOn(geminiText, 'generateJson').mockImplementation(provider.generateJson.bind(provider));
    await api.extractMaterial({ mode: 'complete', text: 'Bonjour' }, access);
    await api.extractMaterial({ mode: 'complete', images: [page], text: 'Page instructions' }, access);
    expect(generate).toHaveBeenCalledTimes(2);
    expect(provider.configs).toEqual([
      { model: 'custom-text', apiKey: 'fixture-key' },
      { model: 'custom-ocr', apiKey: 'fixture-key' },
    ]);
    expect(provider.requests.every((request) => request.singleAttempt)).toBe(true);
    expect(access.selection('speech').model).toBe('custom-speech');
  });

  test('model discovery uses the unsaved purpose key, never makes a generation/check call', async () => {
    const list = spyOn(gemini.catalogue!, 'listModels').mockResolvedValue([]);
    const generation = spyOn(geminiText, 'generateJson');
    const check = spyOn(geminiText, 'checkKey');
    const access = accessModule.createByokAccess(settings());
    const controller = new AbortController();
    expect(await access.listModels('ocr', controller.signal)).toEqual([]);
    expect(list).toHaveBeenCalledWith('fixture-key', controller.signal, undefined);
    expect(generation).not.toHaveBeenCalled();
    expect(check).not.toHaveBeenCalled();
  });

  test('connection checks use the selected purpose model/key without saving or touching other selections', async () => {
    const check = spyOn(geminiText, 'checkKey').mockResolvedValue();
    const configured = settings();
    const access = accessModule.createByokAccess(configured);
    await access.checkConnection('ocr');
    expect(check).toHaveBeenCalledWith({ apiKey: 'fixture-key', model: 'custom-ocr' });
    expect(configured.textModel).toBe('custom-text');
    expect(configured.ocrModel).toBe('custom-ocr');
  });

  test('known incompatible image/speech selections block, unknown selections reach the actual provider', async () => {
    const provider = fakeProvider(draftFixture);
    const generate = spyOn(geminiText, 'generateJson').mockImplementation(provider.generateJson.bind(provider));
    const synthesize = spyOn(geminiSpeech, 'synthesize').mockResolvedValue(new Blob(['audio']));
    const access = accessModule.createByokAccess({
      ...settings(),
      ocrModel: 'gemini-3.8-flash-lite-tts',
      speechModel: 'gemini-2.5-flash',
    });
    expect(await failure(api.extractMaterial({ mode: 'complete', images: [page] }, access))).toBeInstanceOf(
      api.ImageInputUnsupportedError,
    );
    expect(await failure(Promise.resolve().then(() => access.synthesize({ text: 'Bonjour' })))).toBeInstanceOf(Error);
    expect(generate).not.toHaveBeenCalled();
    expect(synthesize).not.toHaveBeenCalled();
    const unknown = accessModule.createByokAccess(settings());
    await api.extractMaterial({ mode: 'complete', images: [page] }, unknown);
    await unknown.synthesize({ text: 'Bonjour' });
    expect(generate).toHaveBeenCalledTimes(1);
    expect(synthesize).toHaveBeenCalledWith(
      { text: 'Bonjour' },
      { apiKey: 'fixture-key', model: 'custom-speech', voice: 'Charon' },
    );
  });
});

describe('feature execution uses AiAccess', () => {
  test('image extraction asks for OCR while pasted text always asks for Text AI', async () => {
    const fake = fakeAccess(draftFixture);
    await api.extractMaterial({ mode: 'complete', text: 'Bonjour' }, fake.access);
    await api.extractMaterial({ mode: 'complete', images: [page] }, fake.access);
    expect(fake.text.mock.calls.map(([purpose]) => purpose)).toEqual(['text', 'ocr']);
    expect(api.extractionPurpose({ images: [] })).toBe('text');
    expect(api.extractionPurpose({ images: [page] })).toBe('ocr');
  });

  test('lookup/analysis cache hits remain shared across access/model changes', async () => {
    const first = fakeAccess({ word: 'bonjour' });
    const access = spyOn(accessModule, 'getAiAccess').mockReturnValue(first.access);
    const word = await api.fetchWordAnalysis('bonjour', 'Bonjour à tous.');
    expect(word.word).toBe('bonjour');
    const second = fakeAccess(new Error('must not spend twice'));
    access.mockReturnValue(second.access);
    expect(await api.fetchWordAnalysis('bonjour', 'Bonjour à tous.')).toEqual(word);
    expect(first.provider.requests).toHaveLength(1);
    expect(second.provider.requests).toHaveLength(0);
    expect(first.text).toHaveBeenCalledWith('text');
  });

  test('pronunciation scoring, grading, marker sessions and key checks use the same boundary', async () => {
    const scoring = fakeAccess({ overallScore: 70 });
    const access = spyOn(accessModule, 'getAiAccess').mockReturnValue(scoring.access);
    await api.assessPronunciation({ referenceText: 'Bonjour', userTranscript: 'Bonjour' });
    expect(scoring.provider.requests).toHaveLength(1);
    expect(scoring.text).toHaveBeenCalledWith('text');
    const grading = fakeAccess({ isCorrect: true, feedback: 'Correct.' });
    access.mockReturnValue(grading.access);
    await api.gradeOpenAnswer({ prompt: 'Bonjour ?', userAnswer: 'Bonjour.', expectedAnswer: 'Bonjour.' });
    expect(grading.provider.requests).toHaveLength(1);
    expect(grading.text).toHaveBeenCalledWith('text');
    const markers = fakeAccess(new Error('provider marker failure'));
    access.mockReturnValue(markers.access);
    const session = api.createPronunciationSession();
    access.mockReturnValue(scoring.access);
    expect(await failure(session.fetch('Bonjour.'))).toEqual(new Error('provider marker failure'));
    expect(markers.provider.requests).toHaveLength(1);
    await api.checkTextKey('unsaved-key', settings());
    expect(scoring.checkConnection).toHaveBeenCalledWith('text');
    expect(access.mock.calls.at(-1)?.[0]?.apiKeys.gemini).toBe('unsaved-key');
  });

  test('speech and prefetch use the boundary, keeping provider/model/voice clip cache identity', async () => {
    const fake = fakeAccess({});
    spyOn(accessModule, 'getAiAccess').mockReturnValue(fake.access);
    const configured = settings();
    await loadSpeech(' Bonjour ', undefined, configured);
    await loadSpeech('Bonjour', undefined, configured);
    expect(fake.synthesize).toHaveBeenCalledTimes(1);
    expect(fake.synthesize).toHaveBeenCalledWith({ text: 'Bonjour', voice: 'Charon' });
    await loadSpeech('Bonjour', 'Kore', configured);
    expect(fake.synthesize).toHaveBeenCalledTimes(2);
    fake.isConfigured.mockReturnValue(false);
    await prefetchSpeech(['new sentence']);
    expect(fake.synthesize).toHaveBeenCalledTimes(2);
    fake.isConfigured.mockReturnValue(true);
    await prefetchSpeech(['new sentence']);
    expect(fake.synthesize).toHaveBeenCalledTimes(3);
    await prefetchSpeech(['stopped sentence'], () => false);
    expect(fake.synthesize).toHaveBeenCalledTimes(3);
  });

  test('speech preview bypasses stored clips and an aborted stale completion never plays', async () => {
    const fake = fakeAccess({});
    spyOn(accessModule, 'getAiAccess').mockReturnValue(fake.access);
    const configured = settings();
    const phrase = 'Bonjour ! Bienvenue sur Relire.';
    await loadSpeech(phrase, undefined, configured);
    const controller = new AbortController();
    fake.synthesize.mockImplementationOnce(async () => {
      controller.abort();
      return new Blob(['audio']);
    });
    expect(((await failure(testSpeech(configured, controller.signal))) as Error).name).toBe('AbortError');
    expect(fake.synthesize).toHaveBeenCalledTimes(2);
  });

  test('an endpoint override travels in the snapshot to the request, the check and discovery', async () => {
    const generate = spyOn(openaiText, 'generateJson').mockResolvedValue({});
    const check = spyOn(openaiText, 'checkKey').mockResolvedValue();
    const list = spyOn(openaiCatalogue, 'listModels').mockResolvedValue([]);
    const configured = {
      ...getAppSettings(),
      textProvider: 'openai',
      textModel: 'gpt-4o-mini',
      ocrProvider: 'openai',
      ocrModel: 'gpt-4o',
      apiKeys: { openai: 'fixture-key' },
      baseUrls: { openai: 'https://api.deepseek.com/v1' },
    };
    const access = accessModule.createByokAccess(configured);
    // The snapshot is taken at consent time: a later edit cannot redirect the request to another host.
    configured.baseUrls.openai = 'https://elsewhere.test/v1';
    await access.text('text').generateJson({ prompt: 'Bonjour' });
    expect(generate).toHaveBeenCalledWith(
      { prompt: 'Bonjour' },
      { apiKey: 'fixture-key', model: 'gpt-4o-mini', baseUrl: 'https://api.deepseek.com/v1' },
    );
    await access.checkConnection('ocr');
    expect(check).toHaveBeenCalledWith({
      apiKey: 'fixture-key',
      model: 'gpt-4o',
      baseUrl: 'https://api.deepseek.com/v1',
    });
    await access.listModels('text');
    expect(list).toHaveBeenCalledWith('fixture-key', undefined, 'https://api.deepseek.com/v1');

    const plain = accessModule.createByokAccess({ ...configured, baseUrls: {} });
    await plain.text('text').generateJson({ prompt: 'Bonjour' });
    expect(generate).toHaveBeenLastCalledWith({ prompt: 'Bonjour' }, { apiKey: 'fixture-key', model: 'gpt-4o-mini' });
    await plain.listModels('text');
    expect(list).toHaveBeenLastCalledWith('fixture-key', undefined, undefined);
  });

  test('Fish Audio speech carries provider, model, voice and key into the request and blocks its transcription model', async () => {
    const synthesize = spyOn(fishSpeech, 'synthesize').mockResolvedValue(new Blob(['mp3'], { type: 'audio/mpeg' }));
    const voice = '0123456789abcdef0123456789abcdef';
    const configured = {
      ...getAppSettings(),
      speechProvider: 'fish-audio',
      speechModel: 'fish-audio/s2.1-pro-free',
      speechVoice: voice,
      apiKeys: { 'fish-audio': ' fixture-key ' },
    };
    const access = accessModule.createByokAccess(configured);
    const blocked = accessModule.createByokAccess({ ...configured, speechModel: 'fish-audio/transcribe-1' });
    // The snapshot is taken at consent time: a later key edit cannot change what is sent.
    configured.apiKeys['fish-audio'] = 'edited-key';

    expect(access.selection('speech')).toEqual({
      providerId: 'fish-audio',
      model: 'fish-audio/s2.1-pro-free',
      voice,
      capabilities: { textGeneration: 'unsupported', imageInput: 'unsupported', speechOutput: 'supported' },
    });
    expect((await access.synthesize({ text: 'Bonjour' })).type).toBe('audio/mpeg');
    expect(synthesize).toHaveBeenCalledWith(
      { text: 'Bonjour' },
      { apiKey: 'fixture-key', model: 'fish-audio/s2.1-pro-free', voice },
    );
    expect(
      ((await failure(Promise.resolve().then(() => blocked.synthesize({ text: 'Bonjour' })))) as Error).message,
    ).toBe(i18n.t('errors.speechOutputUnsupported', { model: 'fish-audio/transcribe-1' }));
    expect(synthesize).toHaveBeenCalledTimes(1);
  });

  test('a Fish Audio clip is cached by provider, model and voice and keeps its MP3 type', async () => {
    const synthesize = spyOn(fishSpeech, 'synthesize').mockResolvedValue(new Blob(['mp3'], { type: 'audio/mpeg' }));
    const voice = '0123456789abcdef0123456789abcdef';
    const configured = {
      ...getAppSettings(),
      speechProvider: 'fish-audio',
      speechModel: 'fish-audio/s2.1-pro-free',
      speechVoice: voice,
      apiKeys: { 'fish-audio': 'fixture-key' },
    };
    const first = await loadSpeech('Bonjour', undefined, configured);
    const second = await loadSpeech('Bonjour', undefined, configured);
    expect(synthesize).toHaveBeenCalledTimes(1);
    expect([first.type, second.type]).toEqual(['audio/mpeg', 'audio/mpeg']);
    expect((await getAudio('fish-audio', 'fish-audio/s2.1-pro-free', voice, 'Bonjour'))?.type).toBe('audio/mpeg');
    // Another voice is another clip, as the cache key says.
    await loadSpeech('Bonjour', 'fedcba9876543210fedcba9876543210', configured);
    expect(synthesize).toHaveBeenCalledTimes(2);
  });

  test('unknown provider IDs are not silently redirected', () => {
    const configured = { ...settings(), ocrProvider: 'not-registered' };
    expect(() => accessModule.createByokAccess(configured).selection('ocr')).toThrow();
  });
});
