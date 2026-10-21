/**
 * The recording hook starts the browser's speech recognition only when the Practice opt-in is on, and
 * reads that setting when the recording starts. There is no DOM in these tests: React's state, refs,
 * effects and callbacks are stubbed, and the microphone and the recognizer are fakes.
 */
import { afterEach, beforeEach, expect, spyOn, test } from 'bun:test';
import * as React from 'react';
import { useShadowingRecorder } from '../src/hooks/useShadowingRecorder';
import { cancelCapture } from '../src/utils/speech/recorder';

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

const stream = { getTracks: () => [], getAudioTracks: () => [] };

/** What the sheet uses: the hook's controls, with the mount effect already run. */
interface Controls {
  start: () => Promise<void>;
  stop: () => Promise<void>;
}

let effect: React.EffectCallback = () => undefined;
const spies: Array<{ mockRestore(): void }> = [];

beforeEach(() => {
  navigatorBeforeMocking = globalThis.navigator;
  built.length = 0;
  storage.clear();
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => storage.set(key, value),
    },
  });
  spies.push(
    spyOn(React, 'useState').mockImplementation(((initial: unknown) => [
      typeof initial === 'function' ? (initial as () => unknown)() : initial,
      () => undefined,
    ]) as unknown as typeof React.useState),
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
  restoreGlobal('localStorage', originalStorage);
});

/** Steps a mounted hook, as `tests/grammarTopicsHooks.test.ts` does. */
const controls = (hook: unknown): Controls => {
  effect();
  return hook as Controls;
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

/**
 * `beforeEach` mocks the navigator for every test, so this one cannot look at it directly: it looks at the
 * navigator the previous test left behind, which is the state the next test file would have inherited.
 */
test('the native navigator is back once the mocking tests above have run', () => {
  expect(navigatorBeforeMocking).toBe(nativeNavigator);
});
