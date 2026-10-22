/** Offline recorder → api → task → request-builder cancellation, with only React/capture and the provider faked. */
import { afterEach, expect, mock, spyOn, test } from 'bun:test';
import * as React from 'react';
import { useShadowingRecorder } from '../src/hooks/useShadowingRecorder';
import * as api from '../src/services/api';
import * as accessModule from '../src/services/ai/access';
import { geminiText } from '../src/services/ai/providers/gemini/client';
import type { JsonRequest } from '../src/services/ai/types';
import type { PronunciationAssessment } from '../src/types';
import { getAppSettings } from '../src/utils/appSettings';
import { FrenchAudioRecorder } from '../src/utils/speech/recorder';

const originalWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
afterEach(() => {
  mock.restore();
  if (originalWindow) Object.defineProperty(globalThis, 'window', originalWindow);
  else Reflect.deleteProperty(globalThis, 'window');
});

function pendingProvider() {
  const requests: JsonRequest[] = [];
  const generate = spyOn(geminiText, 'generateJson').mockImplementation(
    (request) =>
      new Promise((_resolve, reject) => {
        requests.push(request);
        request.signal?.throwIfAborted();
        request.signal?.addEventListener('abort', () => reject(request.signal!.reason), { once: true });
      }),
  );
  const access = accessModule.createByokAccess({
    ...getAppSettings(),
    textProvider: 'gemini',
    apiKeys: { gemini: 'TEST-only-key' },
    providerRegions: {},
  });
  spyOn(accessModule, 'getAiAccess').mockReturnValue(access);
  return { requests, generate };
}

test.each([false, true])(
  'the text provider receives the same signal and rejects its abort (audio: %s)',
  async (audio) => {
    const { requests } = pendingProvider();
    const controller = new AbortController();
    const pending = api.assessPronunciation({
      referenceText: 'Bonjour.',
      userTranscript: audio ? undefined : 'Bonjour.',
      audioBase64: audio ? 'QUJD' : undefined,
      signal: controller.signal,
    });
    expect(requests).toHaveLength(1);
    expect(requests[0].signal).toBe(controller.signal);
    const reason = new DOMException('TEST cancelled', 'AbortError');
    const rejected = pending.catch((error: unknown) => error);
    controller.abort(reason);
    expect(await rejected).toBe(reason);
  },
);

test('Record again settles the pending text Check without a result, error or callback', async () => {
  const { requests } = pendingProvider();
  // One hook instance; setters expose visible state without a DOM or re-render.
  const slots: unknown[] = [];
  spyOn(React, 'useState').mockImplementation(((initial: unknown) => {
    const index = slots.length;
    slots.push(initial);
    return [initial, (next: unknown) => (slots[index] = next)];
  }) as typeof React.useState);
  spyOn(React, 'useCallback').mockImplementation(((fn: unknown) => fn) as typeof React.useCallback);
  spyOn(React, 'useEffect').mockImplementation(() => undefined);
  spyOn(React, 'useLayoutEffect').mockImplementation(() => undefined);
  // Capture and timers are inert doubles: no microphone or browser is used.
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: { setInterval: () => 0, clearInterval: () => undefined },
  });
  spyOn(FrenchAudioRecorder.prototype, 'stop').mockResolvedValue(null);
  spyOn(FrenchAudioRecorder.prototype, 'start').mockResolvedValue(true);
  const loggedError = spyOn(console, 'error').mockImplementation(() => undefined);
  const refs: Array<{ current: unknown }> = [];
  spyOn(React, 'useRef').mockImplementation(((initial: unknown) => {
    const ref = { current: initial };
    refs.push(ref);
    return ref;
  }) as typeof React.useRef);
  const onAssessed = mock((_result: PronunciationAssessment, _sentence: string) => undefined);
  const recorder = useShadowingRecorder('Bonjour.', onAssessed);
  // The recording ref is owned by the hook, alongside recorder/timer/recognition/transcript.
  refs[4].current = { blob: new Blob(['TEST take']), base64: 'QUJD', mimeType: 'audio/webm' };
  const pending = recorder.assess();
  expect(requests).toHaveLength(1);
  expect(slots[4]).toBe(true);
  // Starting a new take aborts before the inert capture starts.
  await recorder.start();
  expect(requests[0].signal?.aborted).toBe(true);
  await pending;
  expect(slots[3]).toBeNull();
  expect(slots[6]).toBeNull();
  expect(loggedError).not.toHaveBeenCalled();
  expect(slots[4]).toBe(false);
  expect(onAssessed).not.toHaveBeenCalled();
  await recorder.stop();
});
