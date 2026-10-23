/** Steps the card's real session guards with React state/refs and audio, storage and assessment fakes; no microphone or DOM. */
import { afterEach, beforeEach, expect, mock, spyOn, test } from 'bun:test';
import * as React from 'react';
import { usePracticeCard, type PracticeCardController, type PracticeTarget } from '../src/hooks/usePracticeCard';
import * as api from '../src/services/api';
import * as binary from '../src/utils/binary';
import * as capture from '../src/utils/speech/recorder';
import * as storage from '../src/storage/shadowing';
import type { PronunciationAssessment } from '../src/types';
import type { ShadowingTake } from '../src/types/shadowing';

const originalWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
const slots: unknown[] = [];
let cursor = 0;
let mounting = true;
let effects: React.EffectCallback[] = [];
let cleanups: Array<() => void> = [];
let reload: () => void;
let storedTakes: ShadowingTake[];
const spies: Array<{ mockRestore(): void }> = [];
const onAssessed = mock((_result: PronunciationAssessment, _sentence: string) => undefined);
const result: PronunciationAssessment = { overallScore: 72, accuracyScore: 70, fluencyScore: 74 };
const target: PracticeTarget = {
  source: { kind: 'article', articleId: 'TEST-article' },
  sentenceId: '0-0',
  text: 'Bonjour tout le monde.',
};
const latest: ShadowingTake = {
  id: 'TEST-latest',
  blob: new Blob(['TEST audio'], { type: 'audio/webm' }),
  mimeType: 'audio/webm',
  durationMs: 1200,
  recordedAt: 1,
  bytes: 10,
};

const lifecycle = {
  startRender() {
    cursor = 0;
  },
  mount() {
    if (!mounting) return;
    mounting = false;
    for (const effect of effects) {
      const cleanup = effect();
      if (cleanup) cleanups.push(cleanup);
    }
  },
};

/** Persistent slots model re-renders; layout effects publish the latest callback and stop handler. */
function useView(callback = onAssessed) {
  lifecycle.startRender();
  const card = usePracticeCard(callback);
  lifecycle.mount();
  return card;
}
const flush = async () => {
  for (let i = 0; i < 8; i++) await Promise.resolve();
};
const unmount = () => {
  for (const cleanup of cleanups.splice(0)) cleanup();
};

beforeEach(() => {
  slots.length = 0;
  cursor = 0;
  mounting = true;
  effects = [];
  cleanups = [];
  onAssessed.mockClear();
  storedTakes = [latest];
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: { clearInterval: globalThis.clearInterval },
  });
  spies.push(
    spyOn(React, 'useState').mockImplementation(((initial: unknown) => {
      const index = cursor++;
      if (index === slots.length) slots.push(typeof initial === 'function' ? initial() : initial);
      return [
        slots[index],
        (next: unknown) => {
          slots[index] = typeof next === 'function' ? next(slots[index]) : next;
        },
      ];
    }) as typeof React.useState),
    spyOn(React, 'useRef').mockImplementation(((initial: unknown) => {
      const index = cursor++;
      if (index === slots.length) slots.push({ current: initial });
      return slots[index];
    }) as typeof React.useRef),
    spyOn(React, 'useCallback').mockImplementation(((fn: unknown) => fn) as typeof React.useCallback),
    spyOn(React, 'useLayoutEffect').mockImplementation((effect) => {
      effect();
    }),
    spyOn(React, 'useEffect').mockImplementation((effect) => {
      if (mounting) effects.push(effect);
    }),
    spyOn(storage, 'subscribeShadowing').mockImplementation((listener) => {
      reload = listener;
      return () => undefined;
    }),
    spyOn(storage, 'getShadowingSentence').mockImplementation(async (_source, text) => ({
      key: `TEST|${text}`,
      articleId: 'TEST-article',
      text,
      updatedAt: 1,
      takes: storedTakes,
    })),
    // A failed prompt leaves the saved take available, just as Record again does after a denial.
    spyOn(capture, 'acquireStream').mockRejectedValue(new DOMException('TEST denied', 'NotAllowedError')),
    spyOn(binary, 'blobToBase64').mockResolvedValue('VEVTVCBhdWRpbw=='),
  );
});
afterEach(() => {
  unmount();
  capture.cancelCapture();
  for (const spy of spies.splice(0)) spy.mockRestore();
  if (originalWindow) Object.defineProperty(globalThis, 'window', originalWindow);
  else Reflect.deleteProperty(globalThis, 'window');
});

async function ready(render = useView) {
  render().open(target);
  await flush();
  const card = render();
  expect(card.phase).toBe('ready');
  expect(card.latest).toBe(latest);
  return card;
}
function pendingAssessment() {
  let resolve!: (value: PronunciationAssessment) => void;
  let reject!: (error: Error) => void;
  const request = spyOn(api, 'assessPronunciation').mockImplementation(
    () =>
      new Promise((yes, no) => {
        resolve = yes;
        reject = no;
      }),
  );
  request.mockClear();
  spies.push(request);
  return { request, resolve: () => resolve(result), reject: () => reject(new Error('TEST provider failure')) };
}

async function startCheck(card: PracticeCardController) {
  const pending = pendingAssessment();
  const done = card.assess();
  await flush();
  expect(pending.request).toHaveBeenCalledTimes(1);
  return { ...pending, done, signal: pending.request.mock.calls[0][0].signal! };
}

test('Check sends the latest Blob, base64, MIME and exact reference and completes the callback exactly once', async () => {
  const card = await ready();
  const check = await startCheck(card);
  expect(binary.blobToBase64).toHaveBeenCalledWith(latest.blob);
  expect(check.request.mock.calls[0][0]).toEqual({
    referenceText: target.text,
    audio: latest.blob,
    audioBase64: 'VEVTVCBhdWRpbw==',
    mimeType: latest.mimeType,
    signal: check.signal,
  });
  expect(useView().isEvaluating).toBe(true);
  await card.assess(); // A second press, even before React commits, cannot create a second request.
  expect(check.request).toHaveBeenCalledTimes(1);
  check.resolve();
  await check.done;
  expect(useView().assessment).toBe(result);
  expect(useView().assessmentError).toBeNull();
  expect(useView().isEvaluating).toBe(false);
  expect(onAssessed).toHaveBeenCalledTimes(1);
  expect(onAssessed).toHaveBeenCalledWith(result, target.text);
});

test('no take means no assessment, and a closed card cannot assess even with an old handler', async () => {
  const pending = pendingAssessment();
  await useView().assess();
  const card = await ready();
  card.close();
  await card.assess();
  expect(pending.request).not.toHaveBeenCalled();
  expect(binary.blobToBase64).not.toHaveBeenCalled();
  expect(onAssessed).not.toHaveBeenCalled();
});

test('an open card without a saved take cannot Check', async () => {
  spies.push(spyOn(storage, 'getShadowingSentence').mockResolvedValue(undefined));
  const pending = pendingAssessment();
  useView().open(target);
  await flush();
  const card = useView();
  expect(card.phase).toBe('ready');
  expect(card.latest).toBeNull();
  await card.assess();
  expect(pending.request).not.toHaveBeenCalled();
  expect(binary.blobToBase64).not.toHaveBeenCalled();
});

for (const action of ['new take', 'close', 'sentence change', 'unmount'] as const) {
  for (const outcome of ['result', 'error'] as const) {
    test(`${action} aborts Check and a late ${outcome} changes nothing and never updates Progress`, async () => {
      const card = await ready();
      const check = await startCheck(card);
      if (action === 'new take') card.open(target);
      if (action === 'close') card.close();
      if (action === 'sentence change') card.open({ ...target, sentenceId: '0-1', text: 'Une autre phrase.' });
      if (action === 'unmount') unmount();
      expect(check.signal.aborted).toBe(true);
      await flush();
      const before = useView();
      if (outcome === 'result') check.resolve();
      else check.reject();
      await check.done;
      const after = useView();
      expect(after.assessment).toBe(before.assessment);
      expect(after.assessmentError).toBe(before.assessmentError);
      expect(after.isEvaluating).toBe(before.isEvaluating);
      expect(after.error).toBe(before.error);
      expect(after.phase).toBe(before.phase);
      expect(after.target).toBe(before.target);
      expect(onAssessed).not.toHaveBeenCalled();
    });
  }
}

for (const replacement of ['older take', 'newer take', 'no take'] as const) {
  for (const outcome of ['result', 'error'] as const) {
    test(`reloading ${replacement} clears the result and aborts Check, ignoring a late ${outcome}`, async () => {
      const completed = await startCheck(await ready());
      completed.resolve();
      await completed.done;
      expect(useView().assessment).toBe(result);
      onAssessed.mockClear();

      const check = await startCheck(useView());
      storedTakes = replacement === 'no take' ? [] : [{ ...latest, id: `TEST-${replacement}` }];
      reload();
      await flush();
      const card = useView();
      expect(card.latest).toBe(storedTakes.at(-1) ?? null);
      expect(card.assessment).toBeNull();
      expect(card.assessmentError).toBeNull();
      expect(card.isEvaluating).toBe(false);
      expect(check.signal.aborted).toBe(true);

      if (outcome === 'result') check.resolve();
      else check.reject();
      await check.done;
      expect(useView().assessment).toBeNull();
      expect(useView().assessmentError).toBeNull();
      expect(useView().isEvaluating).toBe(false);
      expect(onAssessed).not.toHaveBeenCalled();
    });
  }
}

test('a reload with the same latest id preserves the result and running Check', async () => {
  const completed = await startCheck(await ready());
  completed.resolve();
  await completed.done;
  expect(useView().assessment).toBe(result);
  onAssessed.mockClear();

  const check = await startCheck(useView());
  storedTakes = [{ ...latest }];
  reload();
  await flush();
  expect(useView().latest).toBe(storedTakes[0]);
  expect(useView().assessment).toBe(result);
  expect(useView().isEvaluating).toBe(true);
  expect(check.signal.aborted).toBe(false);
  check.resolve();
  await check.done;
  expect(useView().assessment).toBe(result);
  expect(onAssessed).toHaveBeenCalledTimes(1);
});

test('the old take is not checkable while its replacement microphone is starting', async () => {
  const card = await ready();
  const check = await startCheck(card);
  let deny!: (error: Error) => void;
  spies.push(
    spyOn(capture, 'acquireStream').mockImplementation(
      () =>
        new Promise((_resolve, reject) => {
          deny = reject;
        }),
    ),
  );
  card.open(target);
  const starting = useView();
  expect(starting.phase).toBe('acquiring');
  expect(starting.latest).toBe(latest);
  expect(starting.isEvaluating).toBe(false);
  expect(check.signal.aborted).toBe(true);
  await starting.assess();
  expect(check.request).toHaveBeenCalledTimes(1);
  deny(new DOMException('TEST denied', 'NotAllowedError'));
  await flush();
  expect(useView().phase).toBe('ready');
  check.resolve();
  await check.done;
  expect(useView().assessment).toBeNull();
  expect(onAssessed).not.toHaveBeenCalled();
});

test('a current provider error keeps its real detail and does not call onAssessed', async () => {
  const check = await startCheck(await ready());
  check.reject();
  await check.done;
  expect(useView().assessmentError).toBe('TEST provider failure');
  expect(useView().isEvaluating).toBe(false);
  expect(onAssessed).not.toHaveBeenCalled();
});

test('cancellation during base64 preparation never starts a provider request', async () => {
  const card = await ready();
  let finish!: (value: string) => void;
  spies.push(
    spyOn(binary, 'blobToBase64').mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    ),
  );
  const pending = pendingAssessment();
  const done = card.assess();
  card.close();
  finish('TEST base64');
  await done;
  expect(pending.request).not.toHaveBeenCalled();
  expect(onAssessed).not.toHaveBeenCalled();
});

test('a stale completion cannot clear the next sentence’s running Check', async () => {
  const old = await startCheck(await ready());
  useView().open({ ...target, text: 'Une autre phrase.' });
  await flush();
  const next = await startCheck(useView());
  old.resolve();
  await old.done;
  expect(useView().isEvaluating).toBe(true);
  expect(useView().assessment).toBeNull();
  expect(onAssessed).not.toHaveBeenCalled();
  next.resolve();
  await next.done;
  expect(onAssessed).toHaveBeenCalledTimes(1);
  expect(onAssessed.mock.calls[0][1]).toBe('Une autre phrase.');
});
