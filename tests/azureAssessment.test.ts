/** Azure provider with a mocked SDK: mapping, one-operation queue, cancellation and resource ownership. */
import { afterEach, beforeEach, expect, spyOn, test } from 'bun:test';
import i18n from '../src/i18n';
import * as loader from '../src/services/assessment/azureSdk';
import { azureAssessment } from '../src/services/ai/providers/azure/client';
import { MissingApiKeyError } from '../src/services/ai/errors';
import type { AssessmentRequest } from '../src/services/ai/types';
import { mockAzureSdk, recognized } from './fixtures/azureSdk';
import { failure } from './fixtures/storage';

let sdk: ReturnType<typeof mockAzureSdk>;
let load: ReturnType<typeof spyOn<typeof loader, 'loadAzureSdk'>>;
const config = { apiKey: ' TEST-only-key ', region: ' canadaeast ' };
const request = (signal?: AbortSignal): AssessmentRequest => ({
  pcm: new Int16Array([1, -2, 3]),
  referenceText: 'Bonjour.',
  locale: 'fr-CA',
  signal,
});
const assess = (signal?: AbortSignal) => azureAssessment.assess(request(signal), config);
const tick = () => Bun.sleep(0);

beforeEach(() => {
  sdk = mockAzureSdk();
  load = spyOn(loader, 'loadAzureSdk').mockResolvedValue(sdk.sdk);
});
afterEach(() => load.mockRestore());

function expectClosed(index = 0) {
  expect(sdk.recognizers[index].stopContinuousRecognitionAsync).toHaveBeenCalledTimes(1);
  expect(sdk.recognizers[index].close).toHaveBeenCalledTimes(1);
  expect(sdk.streams[index].close).toHaveBeenCalledTimes(1);
  expect(sdk.audioConfigs[index].close).not.toHaveBeenCalled();
  expect(sdk.formats[index].close).toHaveBeenCalledTimes(1);
  expect(sdk.speechConfigs[index].close).toHaveBeenCalledTimes(1);
}

test('uses the chosen French locale and exact PCM view bytes, word assessment without prosody', async () => {
  const pcm = new Int16Array([1234, -32768, 0, 32767, 2345]).subarray(1, 4);
  const promise = azureAssessment.assess({ ...request(), pcm }, config);
  await tick();
  expect(sdk.speechConfigs[0]).toMatchObject({
    apiKey: 'TEST-only-key',
    region: 'canadaeast',
    speechRecognitionLanguage: 'fr-CA',
  });
  expect(sdk.speechConfigs[0].setProperty).toHaveBeenCalledWith(sdk.sdk.PropertyId.Recognizer_StopTimeoutMs, '1000');
  expect(sdk.calls.AudioStreamFormat.getWaveFormatPCM).toHaveBeenCalledWith(16000, 16, 1);
  expect(sdk.calls.AudioInputStream.createPushStream).toHaveBeenCalledWith(sdk.formats[0]);
  expect(sdk.calls.AudioConfig.fromStreamInput).toHaveBeenCalledWith(sdk.streams[0]);
  expect(sdk.recognizers[0].audio).toBe(sdk.audioConfigs[0]);
  const bytes = sdk.streams[0].write.mock.calls[0][0] as ArrayBuffer;
  expect([...new Uint8Array(bytes)]).toEqual([...new Uint8Array(pcm.buffer, pcm.byteOffset, pcm.byteLength)]);
  expect(bytes.byteLength).toBe(6);
  expect(sdk.assessments[0]).toMatchObject({ reference: 'Bonjour.', grading: 2, granularity: 2, miscue: true });
  expect(sdk.assessments[0]).not.toHaveProperty('enableProsodyAssessment');
  expect(sdk.assessments[0].applyTo).toHaveBeenCalledWith(sdk.recognizers[0]);
  sdk.recognizers[0].success!(recognized());
  const result = await promise;
  expect(result).toMatchObject({
    overallScore: 72,
    accuracyScore: 70,
    fluencyScore: 74,
    referenceText: 'Bonjour.',
    transcribedSpeech: 'Bonjour.',
  });
  expect(result).not.toHaveProperty('rhythmScore');
  expect(result).not.toHaveProperty('phonemeFeedback');
  expect(result).not.toHaveProperty('coachingNotes');
  expectClosed();
});

test('maps real zero scores, optional completeness and word accuracy/error values without inferred coaching', async () => {
  const promise = assess();
  await tick();
  sdk.recognizers[0].success!(
    recognized({
      PronunciationAssessment: {
        PronScore: 0,
        AccuracyScore: 0,
        FluencyScore: 0,
        CompletenessScore: 0,
        ProsodyScore: 99,
      },
      Words: [
        {
          Word: 'Bonjour',
          PronunciationAssessment: { AccuracyScore: 0, ErrorType: 'Mispronunciation' },
          Phonemes: [{ PronunciationAssessment: { AccuracyScore: 12 } }],
        },
        { Word: 'monde', PronunciationAssessment: { ErrorType: 'Omission' } },
      ],
    }),
  );
  const result = await promise;
  expect(result).toMatchObject({
    overallScore: 0,
    accuracyScore: 0,
    fluencyScore: 0,
    completenessScore: 0,
    wordResults: [
      { word: 'Bonjour', accuracyScore: 0, errorType: 'Mispronunciation' },
      { word: 'monde', errorType: 'Omission' },
    ],
  });
  expect(result).not.toHaveProperty('rhythmScore');
  expect(result).not.toHaveProperty('phonemeFeedback');
  expectClosed();
});

test('rejects missing/malformed required scores, empty results and malformed optional scores', async () => {
  for (const detail of [
    undefined,
    {},
    { Words: [] },
    ...[undefined, '70', null, -1, 101, NaN].map((value) => ({
      PronunciationAssessment: { PronScore: 75, AccuracyScore: value, FluencyScore: 80 },
    })),
    { PronunciationAssessment: { PronScore: 70, AccuracyScore: 70, FluencyScore: 70, CompletenessScore: 'bad' } },
  ]) {
    const promise = failure(assess());
    await tick();
    const index = sdk.recognizers.length - 1;
    sdk.recognizers[index].success!({ ...recognized(), detail });
    expect(await promise).toBeInstanceOf(Error);
    expectClosed(index);
  }
  const promise = failure(assess());
  await tick();
  sdk.recognizers.at(-1)!.success!({ reason: 3, text: '', detail: undefined });
  expect(await promise).toBeInstanceOf(Error);
});

test('missing key, region and empty inputs fail before loading the SDK', async () => {
  for (const apiKey of ['', '   '])
    expect(await failure(azureAssessment.assess(request(), { ...config, apiKey }))).toBeInstanceOf(MissingApiKeyError);
  for (const region of ['', ' ', 'https://azure.test', 'canada east', 'x?key=1', 'a/b']) {
    expect(((await failure(azureAssessment.assess(request(), { ...config, region }))) as Error).message).toBe(
      i18n.t('azureAssessment.invalidRegion'),
    );
    expect(await failure(azureAssessment.checkKey({ ...config, region }))).toBeInstanceOf(Error);
  }
  expect(await failure(azureAssessment.assess({ ...request(), pcm: new Int16Array() }, config))).toBeInstanceOf(Error);
  expect(await failure(azureAssessment.assess({ ...request(), referenceText: ' ' }, config))).toBeInstanceOf(Error);
  expect(load).not.toHaveBeenCalled();
});

test('serializes calls, keeps the queue through disposal, and admits the next after a failed request', async () => {
  sdk.deferClose();
  const first = failure(assess());
  const second = assess();
  await tick();
  expect(sdk.recognizers).toHaveLength(1);
  sdk.recognizers[0].error!('429 quota exhausted TEST-only-key');
  await tick();
  expect(sdk.recognizers).toHaveLength(1);
  sdk.recognizers[0].closed!();
  expect(((await first) as Error).message).toBe('429 quota exhausted [redacted]');
  await tick();
  expect(sdk.recognizers).toHaveLength(2);
  sdk.recognizers[1].success!(recognized());
  await tick();
  sdk.recognizers[1].closed!();
  expect((await second).overallScore).toBe(72);
  expectClosed(0);
  expectClosed(1);
});

test('pre-abort and queued cancellation reject without starting an SDK operation', async () => {
  const pre = new AbortController();
  pre.abort();
  expect(((await failure(assess(pre.signal))) as Error).name).toBe('AbortError');
  expect(((await failure(azureAssessment.checkKey(config, pre.signal))) as Error).name).toBe('AbortError');
  expect(load).not.toHaveBeenCalled();
  const first = assess();
  const queued = new AbortController();
  const second = failure(azureAssessment.checkKey(config, queued.signal));
  const third = assess();
  await tick();
  queued.abort();
  expect(((await second) as Error).name).toBe('AbortError');
  expect(sdk.recognizers).toHaveLength(1);
  sdk.recognizers[0].success!(recognized());
  await first;
  await tick();
  expect(sdk.recognizers).toHaveLength(2);
  expect(sdk.assessments).toHaveLength(2);
  sdk.recognizers[1].success!(recognized());
  await third;
});

test('active cancellation ignores stale callbacks and waits for resource closure before the next request', async () => {
  sdk.deferClose();
  const active = new AbortController();
  const first = failure(assess(active.signal));
  const next = azureAssessment.checkKey(config);
  await tick();
  active.abort();
  expect(((await first) as Error).name).toBe('AbortError');
  sdk.recognizers[0].success!(recognized());
  sdk.recognizers[0].error!('stale');
  await tick();
  expect(sdk.recognizers).toHaveLength(1);
  sdk.recognizers[0].closed!();
  await tick();
  expectClosed(0);
  expect(sdk.recognizers).toHaveLength(2);
  sdk.recognizers[1].success!({ reason: 0 });
  await tick();
  sdk.recognizers[1].closed!();
  await next;
  expectClosed(1);
});

test('abort while the lazy import is pending never constructs a recognizer', async () => {
  let loaded!: (value: Awaited<ReturnType<typeof loader.loadAzureSdk>>) => void;
  load.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        loaded = resolve;
      }),
  );
  const controller = new AbortController();
  const promise = failure(assess(controller.signal));
  await tick();
  controller.abort();
  expect(((await promise) as Error).name).toBe('AbortError');
  loaded(sdk.sdk);
  await tick();
  expect(sdk.recognizers).toHaveLength(0);
});

test('NoMatch, Canceled and SDK errors are failures for assessments; none can fabricate scores or retry', async () => {
  const outcomes = [
    { result: { reason: 0 }, message: 'InitialSilenceTimeout' },
    {
      result: {
        reason: 1,
        cancellation: { errorDetails: '429 resource quota TEST-only-key', reason: 0, ErrorCode: 3 },
      },
      message: '429 resource quota [redacted]',
    },
    { result: { reason: 99 }, message: 'unexpected' },
  ];
  for (const { result, message } of outcomes) {
    const promise = failure(assess());
    await tick();
    const index = sdk.recognizers.length - 1;
    sdk.recognizers[index].success!(result);
    const error = (await promise) as Error;
    expect(error.message).toContain(message);
    expectClosed(index);
    expect(load).toHaveBeenCalledTimes(index + 1);
  }
});

test('Check contacts recognition exactly once, sends bounded silence without assessment, and only then succeeds', async () => {
  let completed = false;
  const promise = azureAssessment.checkKey(config).then(() => {
    completed = true;
  });
  await tick();
  expect(completed).toBe(false);
  expect(sdk.recognizers[0].recognizeOnceAsync).toHaveBeenCalledTimes(1);
  expect(sdk.assessments).toHaveLength(0);
  expect(sdk.speechConfigs[0].speechRecognitionLanguage).toBe('fr-FR');
  const bytes = sdk.streams[0].write.mock.calls[0][0] as ArrayBuffer;
  expect(bytes.byteLength).toBe(3200);
  expect(new Uint8Array(bytes).every((byte) => byte === 0)).toBe(true);
  sdk.recognizers[0].success!({ reason: 0 });
  await promise;
  expect(completed).toBe(true);
  expectClosed();
  const failed = failure(azureAssessment.checkKey(config));
  await tick();
  sdk.recognizers[1].error!('401 authentication failed');
  expect(((await failed) as Error).message).toBe('401 authentication failed');
  expectClosed(1);
});

test('Check cannot succeed without a service completion: timeout closes resources and frees the queue', async () => {
  const originalTimer = globalThis.setTimeout.bind(globalThis);
  let timeout!: () => void;
  const timer = spyOn(globalThis, 'setTimeout').mockImplementation(((callback: () => void, delay: number) => {
    if (delay === 15000) {
      timeout = callback;
      return originalTimer(() => {}, 60000);
    }
    return originalTimer(callback, delay);
  }) as typeof setTimeout);
  try {
    const promise = failure(azureAssessment.checkKey(config));
    await tick();
    timeout();
    expect(((await promise) as Error).message).toBe(i18n.t('azureAssessment.checkTimeout'));
    expectClosed();
    const next = assess();
    await tick();
    sdk.recognizers[1].success!(recognized());
    expect((await next).overallScore).toBe(72);
    expectClosed(1);
  } finally {
    timer.mockRestore();
  }
});

test('cleanup errors still close other resources and do not poison the next operation', async () => {
  sdk.deferClose();
  const first = failure(assess());
  await tick();
  sdk.recognizers[0].success!(recognized());
  await tick();
  sdk.recognizers[0].closeFailed!('TEST dispose failure');
  expect(((await first) as Error).message).toBe('TEST dispose failure');
  expectClosed();
  const next = assess();
  await tick();
  sdk.recognizers[1].success!(recognized());
  await tick();
  sdk.recognizers[1].closed!();
  expect((await next).overallScore).toBe(72);
  expectClosed(1);
});

test('setup failure closes resources already created, without masking its real reason', async () => {
  sdk.failConstruction(new Error('TEST recognizer construction failed'));
  expect(((await failure(assess())) as Error).message).toBe('TEST recognizer construction failed');
  expect(sdk.recognizers).toHaveLength(0);
  expect(sdk.audioConfigs[0].close).not.toHaveBeenCalled();
  for (const resources of [sdk.streams, sdk.formats, sdk.speechConfigs])
    expect(resources[0].close).toHaveBeenCalledTimes(1);
});
