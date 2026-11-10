/** Real SDK recognize-once/receive/connection cancellation regression; only transport and time are offline. */
import { afterEach, beforeEach, expect, spyOn, test } from 'bun:test';
import i18n from '../src/i18n';
import * as loader from '../src/services/assessment/azureSdk';
import { azureAssessment } from '../src/services/ai/providers/azure/client';
import { flushSdk, lifecycleClock } from './fixtures/azureSdkLifecycle';
import { transportAzureSdk } from './fixtures/azureSdkTransport';
import { failure } from './fixtures/storage';

const config = { apiKey: 'TEST-offline-only', region: 'canadaeast' };
let real: ReturnType<typeof transportAzureSdk>;
let clock: ReturnType<typeof lifecycleClock>;
let load: ReturnType<typeof spyOn<typeof loader, 'loadAzureSdk'>>;
beforeEach(() => {
  clock = lifecycleClock();
  real = transportAzureSdk();
  load = spyOn(loader, 'loadAzureSdk').mockResolvedValue(real.sdk);
});
afterEach(async () => {
  try {
    await real.restore();
  } finally {
    load.mockRestore();
    clock.restore();
  }
});
const assess = (signal?: AbortSignal) =>
  azureAssessment.assess({ pcm: new Int16Array([1, 2]), referenceText: 'Bonjour.', locale: 'fr-CA', signal }, config);
function expectReleased(index: number) {
  expect(real.recognizers[index].service.isDisposed()).toBe(true);
  expect(real.recognizers[index].audioClose).not.toHaveBeenCalled();
  expect(real.recognizers[index].speechClose).toHaveBeenCalledTimes(1);
  expect(real.streams[index].close).toHaveBeenCalledTimes(1);
  expect(real.streams[index].formatClose).toHaveBeenCalledTimes(1);
}

for (const cause of ['abort', 'Check timeout'] as const) {
  test(`real receive loop: ${cause} never reconnects during cleanup`, async () => {
    const controller = new AbortController();
    let firstSettled = false;
    const first = failure(cause === 'abort' ? assess(controller.signal) : azureAssessment.checkKey(config)).then(
      (error) => {
        firstSettled = true;
        return error;
      },
    );
    await flushSdk();
    const socket = real.sockets[0];
    socket.message('turn.start');
    await flushSdk();
    let turnEnded = false;
    void real.recognizers[0].service.privRequestSession.turnCompletionPromise.then(() => {
      turnEnded = true;
    });
    let nextSettled = false;
    const next = failure(azureAssessment.checkKey(config)).then((error) => {
      nextSettled = true;
      return error;
    });
    const before = { recognizers: 1, transports: [0], live: [0], disposed: [false] };
    expect(real.snapshot()).toEqual(before);
    if (cause === 'abort') controller.abort();
    else expect(clock.fire(15000)).toBe(1);
    await flushSdk();
    expect(real.snapshot()).toEqual(before);
    expect(firstSettled).toBe(cause === 'abort');
    expect(clock.fire(1000)).toBeGreaterThan(0);
    await flushSdk();
    expect(socket.close).toHaveBeenCalledTimes(1);
    expect(real.snapshot()).toEqual(before);
    expect(nextSettled).toBe(false);
    socket.release();
    await flushSdk();
    // On the bug, owner 0 opens another transport; owner 1 has not even been admitted.
    expect(real.snapshot()).toEqual({ recognizers: 2, transports: [0, 1], live: [1], disposed: [true, false] });
    expectReleased(0);
    expect(turnEnded).toBe(false);
    const error = (await first) as Error;
    if (cause === 'abort') expect(error.name).toBe('AbortError');
    else expect(error.message).toBe(i18n.t('azureAssessment.checkTimeout'));
    socket.phrase(); // Old request-id messages on the closed transport cannot affect the queued Check.
    await flushSdk();
    expect(nextSettled).toBe(false);
    expect(real.snapshot()).toEqual({ recognizers: 2, transports: [0, 1], live: [1], disposed: [true, false] });
    real.sockets[1].message('turn.start');
    real.sockets[1].phrase('NoMatch');
    await flushSdk();
    expect(nextSettled).toBe(false);
    expect(real.sockets[1].close).toHaveBeenCalledTimes(1);
    real.sockets[1].release();
    await flushSdk();
    expect(await next).toBeUndefined();
    expectReleased(1);
    expect(real.snapshot()).toEqual({ recognizers: 2, transports: [0, 1], live: [], disposed: [true, true] });
  });
}

for (const outcome of ['Success', 'NoMatch', 'Error'] as const) {
  test(`real receive loop: ${outcome} closes its only transport and resources`, async () => {
    const operation = outcome === 'NoMatch' ? azureAssessment.checkKey(config) : assess();
    const result = failure(operation);
    await flushSdk();
    expect(real.snapshot()).toEqual({ recognizers: 1, transports: [0], live: [0], disposed: [false] });
    real.sockets[0].message('turn.start');
    await flushSdk();
    if (outcome === 'Error') real.sockets[0].release(1007);
    else real.sockets[0].phrase(outcome);
    await flushSdk();
    if (outcome !== 'Error') {
      expect(real.sockets[0].close).toHaveBeenCalledTimes(1);
      real.sockets[0].release();
      await flushSdk();
    }
    expect(real.sockets.map((socket) => socket.owner)).toEqual([0]);
    const error = await result;
    if (outcome === 'Error') expect((error as Error).message).toContain('websocket error code: 1007');
    else {
      expect(error).toBeUndefined();
      if (outcome === 'Success') expect((await operation)!.overallScore).toBe(0);
    }
    expectReleased(0);
    expect(real.snapshot()).toEqual({ recognizers: 1, transports: [0], live: [], disposed: [true] });
  });
}

// Residual case: the service recognizes a phrase but never ends the turn. The SDK hands the result to
// its callback at `speech.phrase` (SpeechServiceRecognizer.js:88-100) yet recognizeOnceAsync only
// returns after `turn.end` resolves turnCompletionPromise (ServiceRecognizerBase.js:538, :710), so
// cleanup still runs with the turn open. A recognized phrase also resets the connection-attempt
// counter (RequestSession.js:162 via SpeechServiceRecognizer.js:46), which is why the zero retry
// limit does not stop this one reconnect: the SDK treats it as a fresh first attempt.
// Pinned behaviour: exactly one extra transport owned by the same recognizer, then, once the browser
// delivers its close event, the first Check fails with the SDK stop timeout, the queue admits the next
// Check, and no recognizer or socket stays live.
test('real receive loop: a phrase without turn.end reconnects once during cleanup and the queue recovers', async () => {
  const first = failure(azureAssessment.checkKey(config));
  await flushSdk();
  real.sockets[0].message('turn.start');
  await flushSdk();
  real.sockets[0].phrase('NoMatch', false);
  await flushSdk();
  // The phrase reset the SDK's attempt counter, so the next connect is attempt 1 of a new request.
  expect(real.recognizers[0].service.privRequestSession.numConnectionAttempts).toBe(0);
  let nextSettled = false;
  const next = failure(azureAssessment.checkKey(config)).then((error) => {
    nextSettled = true;
    return error;
  });
  await flushSdk();
  expect(nextSettled).toBe(false);
  real.sockets[0].release(1000);
  await flushSdk();
  // One recognizer, two transports: the old socket's close re-enters the SDK receive loop
  // (ServiceRecognizerBase.js:630-643) and reconnects while the turn is still open.
  expect(real.snapshot()).toEqual({ recognizers: 1, transports: [0, 0], live: [0], disposed: [false] });
  expect(nextSettled).toBe(false);
  expect(clock.fire(1000)).toBeGreaterThan(0);
  await flushSdk();
  real.sockets[1].release(1000);
  await flushSdk();
  // Bounded: the stop timeout rejects recognizeOnceAsync and the queued Check gets its own recognizer.
  expect(real.snapshot()).toEqual({ recognizers: 2, transports: [0, 0, 1], live: [1], disposed: [true, false] });
  expect(((await first) as Error).message).toContain('Stop operation timed out after 1000ms');
  expect(nextSettled).toBe(false);
  expectReleased(0);
  real.sockets[2].message('turn.start');
  real.sockets[2].phrase('NoMatch');
  await flushSdk();
  expect(real.sockets[2].close).toHaveBeenCalledTimes(1);
  real.sockets[2].release();
  await flushSdk();
  expect(await next).toBeUndefined();
  expectReleased(1);
  expect(real.snapshot()).toEqual({ recognizers: 2, transports: [0, 0, 1], live: [], disposed: [true, true] });
});
