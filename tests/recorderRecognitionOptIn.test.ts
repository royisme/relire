/**
 * The recording hook starts the browser's speech recognition only when the Practice opt-in is on, and
 * reads that setting when the recording starts; a new take also takes over from a Check still in
 * flight (issue #60). There is no DOM in these tests: React's state, refs, effects and callbacks are
 * stubbed, and the microphone, the recognizer and the assessment are fakes.
 */
import { afterEach, beforeEach, expect, spyOn, test } from 'bun:test';
import * as React from 'react';
import { useShadowingRecorder } from '../src/hooks/useShadowingRecorder';
import { cancelCapture } from '../src/utils/speech/recorder';
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

/** One pass of the hook, named as a hook so lint accepts the call: reads the current slot values, like a re-render that runs no effect. */
const useView = (reference: string) => {
  store.startRender();
  return useShadowingRecorder(reference);
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
  const recorder = controls(useView('Bonjour le monde.'));
  void recorder.assess(); // pending until this test settles it
  expect(useView('Bonjour le monde.').isEvaluating).toBe(true);
  await recorder.start();
  expect(signal?.aborted).toBe(true);
  expect(useView('Bonjour le monde.').isEvaluating).toBe(false);
  settleAssess({ overallScore: 90 });
  await flushMicrotasks();
  // The stale Check settles after its take was dropped: no assessment, no error, button still free.
  const view = useView('Bonjour le monde.');
  expect(view.assessment).toBeNull();
  expect(view.error).toBeNull();
  expect(view.isEvaluating).toBe(false);
  await recorder.stop();
});

/**
 * `beforeEach` mocks the navigator for every test, so this one cannot look at it directly: it looks at the
 * navigator the previous test left behind, which is the state the next test file would have inherited.
 */
test('the native navigator is back once the mocking tests above have run', () => {
  expect(navigatorBeforeMocking).toBe(nativeNavigator);
});
