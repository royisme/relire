/**
 * the recording hook starts the browser's speech recognition only when the Practice opt-in is on, and
 * reads that setting when the recording starts; a new take also takes over from a Check still in
 * flight (issue #60) and cannot be checked while its microphone is still starting (issue #61). There
 * is no DOM in these tests: React's state, refs, effects and callbacks are stubbed, and the
 * microphone, the recognizer, the file reader and the assessment are fakes.
 */
import { afterEach, beforeEach, expect, mock, spyOn, test } from 'bun:test';
import * as React from 'react';
import { useShadowingRecorder } from '../src/hooks/useShadowingRecorder';
import { cancelCapture, claimCapture, releaseCapture } from '../src/utils/speech/recorder';
import { PronunciationAssessment } from '../src/types';
import * as apiModule from '../src/services/api';

/**
 * What the environment had before this file mocked it. Bun provides a native `navigator`, and every test
 * file shares one process, so a mock that is deleted instead of restored leaks into the next file.
 */
const originalNavigator = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
const nativeNavigator = globalThis.navigator;
/** What `beforeEach` found before mocking it: whatever the previous test's cleanup left behind. */
let navigatorBeforeMocking: unknown;
const originalWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
const originalMediaRecorder = Object.getOwnPropertyDescriptor(globalThis, 'MediaRecorder');
const originalFileReader = Object.getOwnPropertyDescriptor(globalThis, 'FileReader');

const storage = new Map<string, string>();
const originalStorage = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');

/** Every recognizer the hook constructed, so a test can see whether one was even built. */
const built: FakeRecognizer[] = [];

class FakeRecognizer {
  lang = '';
  interimResults = false;
  onresult: ((event: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null = null;
  started = 0;
  stopped = 0;
  constructor() {
    built.push(this);
  }
  start() {
    this.started++;
  }
  stop() {
    this.stopped++;
  }
}

/** The microphone and the recorder are fakes: this file is about the recognizer, not about capture. */
class FakeMediaRecorder {
  state = 'inactive';
  ondataavailable: unknown = null;
  onstop: (() => void) | null = null;
  onerror: unknown = null;
  static isTypeSupported = () => true;
  constructor(_stream: unknown) {}
  start() {
    this.state = 'recording';
  }
  /** The browser fires `onstop` asynchronously, and the take settles only then. */
  stop() {
    this.state = 'inactive';
    queueMicrotask(() => this.onstop?.());
  }
}

/** `stop` base64-encodes the take through a `FileReader`, which Bun does not provide. */
class FakeFileReader {
  result: string | null = null;
  onloadend: (() => void) | null = null;
  readAsDataURL(_blob: Blob) {
    this.result = 'data:;base64,QUJD';
    queueMicrotask(() => this.onloadend?.());
  }
}

const stream = { getTracks: () => [], getAudioTracks: () => [] };

/** What the sheet uses: the hook's controls, with the mount effect already run. */
interface Controls {
  start: () => Promise<void>;
  stop: () => Promise<void>;
  assess: () => Promise<void>;
}

/** The state slots of one hook instance, in `useState` call order; setters write back into them. The
 * cursor moves through methods so a hook-named helper can step it without a direct write. */
const store = {
  slots: [] as unknown[],
  index: 0,
  reset() {
    this.slots.length = 0;
    this.index = 0;
  },
  /** Points the cursor at the first slot again: the next hook pass reads current values, like a re-render. */
  startRender() {
    this.index = 0;
  },
};

let effect: React.EffectCallback = () => undefined;
const spies: Array<{ mockRestore(): void }> = [];

beforeEach(() => {
  navigatorBeforeMocking = globalThis.navigator;
  built.length = 0;
  storage.clear();
  store.reset();
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => storage.set(key, value),
    },
  });
  spies.push(
    spyOn(React, 'useState').mockImplementation(((initial: unknown) => {
      const index = store.index++;
      if (index === store.slots.length)
        store.slots.push(typeof initial === 'function' ? (initial as () => unknown)() : initial);
      return [
        store.slots[index],
        (next: unknown) => {
          store.slots[index] = next;
        },
      ];
    }) as unknown as typeof React.useState),
    spyOn(React, 'useEffect').mockImplementation((callback) => {
      effect = callback;
    }),
    spyOn(React, 'useLayoutEffect').mockImplementation(() => undefined),
    spyOn(React, 'useRef').mockImplementation(((initial: unknown) => ({
      current: initial,
    })) as unknown as typeof React.useRef),
    spyOn(React, 'useCallback').mockImplementation(((fn: unknown) => fn) as unknown as typeof React.useCallback),
  );
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: {
      SpeechRecognition: FakeRecognizer,
      setInterval: globalThis.setInterval,
      clearInterval: globalThis.clearInterval,
    },
  });
  Object.defineProperty(globalThis, 'navigator', {
    configurable: true,
    value: { mediaDevices: { getUserMedia: async () => stream } },
  });
  Object.defineProperty(globalThis, 'MediaRecorder', { configurable: true, value: FakeMediaRecorder });
  Object.defineProperty(globalThis, 'FileReader', { configurable: true, value: FakeFileReader });
});

/** Puts a global back the way this file found it: the original value, or absent when there was none. */
const restoreGlobal = (key: string, original: PropertyDescriptor | undefined) => {
  if (original) Object.defineProperty(globalThis, key, original);
  else Reflect.deleteProperty(globalThis, key);
};

afterEach(() => {
  // A failed assertion would otherwise leave the microphone claimed for the next test.
  cancelCapture();
  for (const spy of spies.splice(0)) spy.mockRestore();
  restoreGlobal('navigator', originalNavigator);
  restoreGlobal('window', originalWindow);
  restoreGlobal('MediaRecorder', originalMediaRecorder);
  restoreGlobal('FileReader', originalFileReader);
  restoreGlobal('localStorage', originalStorage);
});

/** One pass of the hook, named as a hook so lint accepts the call: reads the current slot values, like a re-render that runs no effect. */
const useView = (reference: string, onAssessed?: (assessment: PronunciationAssessment, sentence: string) => void) => {
  store.startRender();
  return useShadowingRecorder(reference, onAssessed);
};

/** Steps a mounted hook, as `tests/grammarTopicsHooks.test.ts` does. */
const controls = (hook: unknown): Controls => {
  effect();
  return hook as Controls;
};

/** Lets a settled promise's continuations run; no timers, no real waiting. */
const flushMicrotasks = async () => {
  for (let i = 0; i < 4; i++) await Promise.resolve();
};

const optIn = (on: boolean) =>
  storage.set('relire_app_settings_v1', JSON.stringify({ practiceBrowserRecognition: on }));

test('with the opt-in off no recognizer is even constructed', async () => {
  optIn(false);
  const recorder = controls(useShadowingRecorder('Bonjour le monde.'));
  await recorder.start();
  expect(built).toHaveLength(0);
  await recorder.stop();
});

test('with no stored setting, the default keeps recognition off', async () => {
  const recorder = controls(useShadowingRecorder('Bonjour le monde.'));
  await recorder.start();
  expect(built).toHaveLength(0);
  await recorder.stop();
});

test('with the opt-in on the recognizer runs in French and is stopped by stop', async () => {
  optIn(true);
  const recorder = controls(useShadowingRecorder('Bonjour le monde.'));
  await recorder.start();
  expect(built).toHaveLength(1);
  expect([built[0].lang, built[0].interimResults, built[0].started]).toEqual(['fr-FR', false, 1]);
  await recorder.stop();
  expect(built[0].stopped).toBe(1);
});

test('the setting is read when recording starts, not once at import', async () => {
  const recorder = controls(useShadowingRecorder('Bonjour le monde.'));
  optIn(false);
  await recorder.start();
  expect(built).toHaveLength(0);
  await recorder.stop();
  optIn(true);
  await recorder.start();
  expect(built).toHaveLength(1);
  await recorder.stop();
});

test('a new take cancels a Check still in flight, frees its button and drops the stale result', async () => {
  let signal: AbortSignal | undefined;
  let settleAssess!: (value: { overallScore: number }) => void;
  const assessment = spyOn(apiModule, 'assessPronunciation').mockImplementation(((params: { signal?: AbortSignal }) => {
    signal = params.signal;
    return new Promise((resolve) => {
      settleAssess = resolve;
    });
  }) as never);
  spies.push(assessment);
  const onAssessed = mock((_assessment: PronunciationAssessment, _sentence: string) => undefined);
  spies.push(onAssessed);
  const recorder = controls(useView('Bonjour le monde.', onAssessed));
  void recorder.assess(); // pending until this test settles it
  expect(useView('Bonjour le monde.').isEvaluating).toBe(true);
  await recorder.start();
  expect(signal?.aborted).toBe(true);
  expect(useView('Bonjour le monde.').isEvaluating).toBe(false);
  settleAssess({ overallScore: 90 });
  await flushMicrotasks();
  // The stale Check settles after its take was dropped: no assessment, no error, no callback, button still free.
  const view = useView('Bonjour le monde.', onAssessed);
  expect(view.assessment).toBeNull();
  expect(view.error).toBeNull();
  expect(view.isEvaluating).toBe(false);
  expect(onAssessed).not.toHaveBeenCalled();
  await recorder.stop();
});

test('while the microphone for a new take is starting, the old take cannot be checked', async () => {
  const recorder = controls(useView('Bonjour le monde.'));
  await recorder.start();
  await recorder.stop();
  expect(useView('Bonjour le monde.').phase).toBe('recorded');
  // The second take hangs at the permission prompt until the test lets it through.
  let allowMic!: () => void;
  Object.defineProperty(globalThis, 'navigator', {
    configurable: true,
    value: { mediaDevices: { getUserMedia: () => new Promise((resolve) => (allowMic = () => resolve(stream))) } },
  });
  const starting = recorder.start();
  const during = useView('Bonjour le monde.');
  expect(during.isStarting).toBe(true);
  // The old take is still the one on screen; the Check button is disabled against it.
  expect(during.phase).toBe('recorded');
  allowMic();
  await starting;
  const after = useView('Bonjour le monde.');
  expect(after.isStarting).toBe(false);
  expect(after.phase).toBe('recording');
  await recorder.stop();
});

test('a microphone failure on Record again ends the starting window and keeps the old take checkable', async () => {
  let prompts = 0;
  Object.defineProperty(globalThis, 'navigator', {
    configurable: true,
    value: {
      mediaDevices: {
        // The first prompt is granted; the second is denied, as when the user refuses again.
        getUserMedia: () =>
          ++prompts === 1 ? Promise.resolve(stream) : Promise.reject(new DOMException('denied', 'NotAllowedError')),
      },
    },
  });
  const recorder = controls(useView('Bonjour le monde.'));
  await recorder.start();
  await recorder.stop();
  await recorder.start();
  const view = useView('Bonjour le monde.');
  expect(view.isStarting).toBe(false);
  expect(view.isEvaluating).toBe(false);
  // The take before the failed restart is untouched, so Check works on it again.
  expect(view.phase).toBe('recorded');
  expect(view.audioUrl).not.toBeNull();
  expect(view.error).toEqual({ kind: 'mic' });
});

test('a busy microphone on Record again also ends the starting window', async () => {
  const recorder = controls(useView('Bonjour le monde.'));
  await recorder.start();
  await recorder.stop();
  const token = claimCapture('card', () => undefined);
  await recorder.start();
  releaseCapture(token);
  const view = useView('Bonjour le monde.');
  expect(view.error).toEqual({ kind: 'busy' });
  expect(view.isStarting).toBe(false);
});

/**
 * `beforeEach` mocks the navigator for every test, so this one cannot look at it directly: it looks at the
 * navigator the previous test left behind, which is the state the next test file would have inherited.
 */
test('the native navigator is back once the mocking tests above have run', () => {
  expect(navigatorBeforeMocking).toBe(nativeNavigator);
});
