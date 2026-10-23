/** Offline regressions against installed SDK 1.52.0 push resources and started-but-unfinished turns. */
import { afterEach, beforeEach, expect, spyOn, test } from 'bun:test';
import * as sdk from 'microsoft-cognitiveservices-speech-sdk';
import i18n from '../src/i18n';
import * as loader from '../src/services/assessment/azureSdk';
import { azureAssessment } from '../src/services/ai/providers/azure/client';
import { flushSdk, lifecycleClock, realAssessmentResult, realAzureSdk } from './fixtures/azureSdkLifecycle';
import { failure } from './fixtures/storage';

const config = { apiKey: 'TEST-offline-only', region: 'canadaeast' };
let real: ReturnType<typeof realAzureSdk>;
let clock: ReturnType<typeof lifecycleClock>;
let load: ReturnType<typeof spyOn<typeof loader, 'loadAzureSdk'>>;
beforeEach(() => {
  clock = lifecycleClock();
});
afterEach(async () => {
  try {
    await real?.restore();
  } finally {
    load?.mockRestore();
    clock.restore();
  }
});
function setup(stalled = false) {
  real = realAzureSdk(stalled);
  load = spyOn(loader, 'loadAzureSdk').mockResolvedValue(real.sdk);
}
function expectReleased(index = 0) {
  const recognizer = real.recognizers[index];
  expect(recognizer.service.isDisposed()).toBe(true);
  expect(real.streamCloses[index]).toHaveBeenCalledTimes(1);
  expect(recognizer.audioClose).not.toHaveBeenCalled();
  expect(recognizer.formatClose).toHaveBeenCalledTimes(1);
  expect(recognizer.speechClose).toHaveBeenCalledTimes(1);
}

test('real SDK push input succeeds for assessment and Check without AudioConfig.close ownership error', async () => {
  setup();
  const assessment = azureAssessment.assess(
    {
      pcm: new Int16Array([1, 2]),
      referenceText: 'Bonjour.',
      locale: 'fr-FR',
    },
    config,
  );
  const result = failure(assessment);
  await flushSdk();
  real.recognizers[0].success!(realAssessmentResult());
  await flushSdk();
  expect(await result).toBeUndefined();
  expect((await assessment).overallScore).toBe(0);
  expectReleased();
  const check = failure(azureAssessment.checkKey(config));
  await flushSdk();
  real.recognizers[1].success!(new sdk.SpeechRecognitionResult('TEST', sdk.ResultReason.NoMatch));
  expect(await check).toBeUndefined();
  expectReleased(1);
});

test('real push cleanup preserves the recognition error and closes all owned resources', async () => {
  setup();
  const check = failure(azureAssessment.checkKey(config));
  await flushSdk();
  real.recognizers[0].error!('TEST real recognition failure');
  expect(((await check) as Error).message).toBe('TEST real recognition failure');
  expectReleased();
});

for (const cause of ['abort', 'Check timeout'] as const) {
  test(`real SDK unfinished turn: ${cause} releases transport before admitting next Check and ignores late callbacks`, async () => {
    setup(true);
    const controller = new AbortController();
    const first = failure(
      cause === 'abort'
        ? azureAssessment.assess(
            { pcm: new Int16Array([1, 2]), referenceText: 'Bonjour.', locale: 'fr-CA', signal: controller.signal },
            config,
          )
        : azureAssessment.checkKey(config),
    );
    let nextSettled = false;
    const next = failure(azureAssessment.checkKey(config)).then((error) => {
      nextSettled = true;
      return error;
    });
    await flushSdk();
    const recognizer = real.recognizers[0];
    let turnEnded = false;
    void recognizer.service.privRequestSession.turnCompletionPromise.then(() => {
      turnEnded = true;
    });
    expect(real.recognizers).toHaveLength(1);
    if (cause === 'abort') controller.abort();
    else expect(clock.fire(15000)).toBe(1);
    await flushSdk();
    expect(turnEnded).toBe(false);
    expect(clock.fire(1000)).toBeGreaterThan(0);
    await flushSdk();
    // SDK timeout must actually request socket closure, not merely abandon a Promise.race.
    expect(real.sockets[0].close).toHaveBeenCalledTimes(1);
    expect(real.recognizers).toHaveLength(1);
    expect(recognizer.service.isDisposed()).toBe(false);
    expect(nextSettled).toBe(false);
    real.sockets[0].release();
    await flushSdk();
    expect(real.recognizers).toHaveLength(2);
    expect(recognizer.connection!.isDisposed()).toBe(true);
    expectReleased();
    expect(turnEnded).toBe(false); // Recovery did not depend on ever receiving turn.end.
    const error = (await first) as Error;
    if (cause === 'abort') expect(error.name).toBe('AbortError');
    else expect(error.message).toBe(i18n.t('azureAssessment.checkTimeout'));
    recognizer.success!(realAssessmentResult());
    recognizer.error!('TEST late result must not affect either operation');
    await flushSdk();
    expect(nextSettled).toBe(false);
    // Finish the second operation normally, exercising the same real stop/disposal path.
    await real.recognizers[1].service.privRequestSession.onServiceTurnEndResponse(false);
    real.recognizers[1].success!(new sdk.SpeechRecognitionResult('TEST', sdk.ResultReason.NoMatch));
    await flushSdk();
    expect(nextSettled).toBe(false); // Normal close also awaits transport, with no overlap.
    expect(real.sockets[1].close).toHaveBeenCalledTimes(1);
    real.sockets[1].release();
    await flushSdk();
    expect(await next).toBeUndefined();
    expectReleased(1);
    expect(real.recognizers).toHaveLength(2);
  });
}
