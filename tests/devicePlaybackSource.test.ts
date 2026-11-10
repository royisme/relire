/**
 * The explicit device playback source at every caller boundary: a device sequence (whole text) reads on the
 * platform's own voice without loading, prefetching or synthesizing a clip, pauses/resumes/stops honestly and
 * fails with its real reason when no French voice exists; the sentence toolbars and the practice card pass the
 * option through to their Listen calls; the card's compare keeps the device source for the reference and still
 * plays the take itself through playRecording; with the option absent every path behaves as before. The speech
 * layer's remote edge (clips) and the platform (audio, synthesizer) are faked; no browser, no provider.
 */
import { afterEach, beforeEach, describe, expect, mock, spyOn, test, type Mock } from 'bun:test';
import * as React from 'react';
import * as accessModule from '../src/services/ai/access';
import * as clips from '../src/utils/speech/clips';
import { getSpeechFailure, getSpeechState, speechKey } from '../src/utils/speech/state';
import { stopSpeech } from '../src/utils/speech/playback';
import {
  getSequenceState,
  startSequence,
  stepSequence,
  stopSequence,
  toggleSequence,
} from '../src/utils/speech/sequence';
import { audioStats } from '../src/storage/audio';
import { usePracticeCard, takeKey, type PracticeTarget } from '../src/hooks/usePracticeCard';
import * as storage from '../src/storage/shadowing';
import * as capture from '../src/utils/speech/recorder';
import type { ShadowingTake } from '../src/types/shadowing';
import { freshDb } from './fixtures/storage';

/** The audio elements playback created, so a test can end, fail or inspect them. */
class FakeAudio {
  static instances: FakeAudio[] = [];
  src: string;
  paused = false;
  playbackRate = 1;
  onended: (() => void) | null = null;
  onerror: ((event: unknown) => void) | null = null;
  private listeners: Record<string, (() => void)[]> = {};
  constructor(src: string) {
    this.src = src;
    FakeAudio.instances.push(this);
  }
  addEventListener(type: string, handler: () => void) {
    (this.listeners[type] ??= []).push(handler);
  }
  removeEventListener(type: string, handler: () => void) {
    this.listeners[type] = (this.listeners[type] ?? []).filter((fn) => fn !== handler);
  }
  async play() {
    this.paused = false;
  }
  pause() {
    this.paused = true;
  }
  end() {
    this.paused = true;
    (this.listeners.ended ?? []).forEach((fn) => fn());
    this.onended?.();
  }
  fail() {
    (this.listeners.error ?? []).forEach((fn) => fn());
    this.onerror?.(new Event('error'));
  }
}

class FakeUtterance {
  text: string;
  lang = '';
  rate = 1;
  voice: unknown = null;
  onend: (() => void) | null = null;
  onerror: (() => void) | null = null;
  constructor(text: string) {
    this.text = text;
  }
}

const frenchVoices = [{ lang: 'fr-FR', name: 'Test French voice', default: true }];
const englishVoices = () => {
  frenchVoices.length = 0;
  frenchVoices.push({ lang: 'en-US', name: 'Test English voice', default: true });
};
let spoken: FakeUtterance[] = [];
let cancelled = 0;

const synth = {
  speaking: false,
  paused: false,
  getVoices: () => frenchVoices,
  addEventListener: () => {},
  removeEventListener: () => {},
  cancel: () => {
    cancelled++;
    synth.speaking = false;
  },
  pause: () => {
    synth.paused = true;
  },
  resume: () => {
    synth.paused = false;
  },
  speak: (utterance: FakeUtterance) => {
    spoken.push(utterance);
    synth.speaking = true;
  },
};

const originalWindow = (globalThis as { window?: unknown }).window;
const originalAudio = (globalThis as { Audio?: unknown }).Audio;
const originalUtterance = (globalThis as { SpeechSynthesisUtterance?: unknown }).SpeechSynthesisUtterance;
const spies: Array<{ mockRestore(): void }> = [];
let loadSpeech: Mock<typeof clips.loadSpeech>;
let prefetchSpeech: Mock<typeof clips.prefetchSpeech>;

beforeEach(async () => {
  await freshDb();
  stopSequence();
  stopSpeech();
  FakeAudio.instances = [];
  spoken = [];
  cancelled = 0;
  synth.speaking = false;
  synth.paused = false;
  frenchVoices.length = 0;
  frenchVoices.push({ lang: 'fr-FR', name: 'Test French voice', default: true });
  (globalThis as { window?: unknown }).window = { clearInterval: globalThis.clearInterval, speechSynthesis: synth };
  (globalThis as { Audio?: unknown }).Audio = FakeAudio;
  (globalThis as { SpeechSynthesisUtterance?: unknown }).SpeechSynthesisUtterance = FakeUtterance;
  // The remote edge of the speech layer, mocked so a device request can be seen never reaching it.
  loadSpeech = spyOn(clips, 'loadSpeech').mockResolvedValue(new Blob(['TEST clip'], { type: 'audio/wav' }));
  prefetchSpeech = spyOn(clips, 'prefetchSpeech').mockResolvedValue(undefined);
  spies.push(
    spyOn(accessModule, 'getAiAccess').mockImplementation(() => {
      throw new Error('the device source must not consult AI access');
    }),
  );
});
afterEach(() => {
  stopSequence();
  stopSpeech();
  mock.restore();
  (globalThis as { window?: unknown }).window = originalWindow;
  (globalThis as { Audio?: unknown }).Audio = originalAudio;
  (globalThis as { SpeechSynthesisUtterance?: unknown }).SpeechSynthesisUtterance = originalUtterance;
});

/** Lets the fake synthesis and play promises run, so the platform voice has actually spoken. */
const flush = async () => {
  for (let i = 0; i < 8; i++) await Promise.resolve();
};

describe('a device sequence (whole text)', () => {
  test('reads sentence after sentence on the platform voice with no clip work at all', async () => {
    startSequence('TEST|article', ['Un.', 'Deux.', 'Trois.'], 0, 'device');
    await flush();
    expect(getSequenceState()).toMatchObject({ id: 'TEST|article', index: 0, total: 3, failed: false });
    expect(getSpeechState()).toEqual({ phase: 'playing', key: 'Un.' });
    spoken[0].onend?.();
    await flush();
    spoken[1].onend?.();
    await flush();
    expect(spoken.map((u) => u.text)).toEqual(['Un.', 'Deux.', 'Trois.']);
    spoken[2].onend?.();
    await flush();
    expect(getSequenceState()).toEqual({ id: null, index: 0, total: 0, failed: false });
    expect(getSpeechState().phase).toBe('idle');
    expect(loadSpeech).not.toHaveBeenCalled();
    expect(prefetchSpeech).not.toHaveBeenCalled();
    expect(FakeAudio.instances).toHaveLength(0);
    expect((await audioStats()).clips).toBe(0);
  });

  test('pauses, resumes, steps and stops on the platform voice, still without prefetch', async () => {
    startSequence('TEST|article', ['Un.', 'Deux.'], 0, 'device');
    await flush();
    toggleSequence();
    expect(getSpeechState()).toEqual({ phase: 'paused', key: 'Un.' });
    expect(synth.paused).toBe(true);
    toggleSequence();
    expect(getSpeechState()).toEqual({ phase: 'playing', key: 'Un.' });
    expect(synth.paused).toBe(false);
    stepSequence(1);
    await flush();
    expect(spoken.map((u) => u.text)).toEqual(['Un.', 'Deux.']);
    stopSequence();
    expect(getSequenceState().id).toBeNull();
    expect(getSpeechState().phase).toBe('idle');
    expect(cancelled).toBeGreaterThan(0);
    expect(prefetchSpeech).not.toHaveBeenCalled();
    expect(loadSpeech).not.toHaveBeenCalled();
    expect(FakeAudio.instances).toHaveLength(0);
  });

  test('no French voice fails the sentence with its real reason and no fallback; Retry speaks once one exists', async () => {
    englishVoices();
    startSequence('TEST|article', ['Un.', 'Deux.'], 0, 'device');
    await flush();
    expect(getSequenceState()).toMatchObject({ index: 0, failed: true });
    expect(getSpeechFailure()).toMatchObject({ key: 'Un.' });
    expect(getSpeechFailure()?.message).toBeTruthy();
    expect(getSpeechState().phase).toBe('idle');
    expect(spoken).toHaveLength(0);
    expect(FakeAudio.instances).toHaveLength(0);
    expect(loadSpeech).not.toHaveBeenCalled();
    expect(prefetchSpeech).not.toHaveBeenCalled();

    frenchVoices.length = 0;
    frenchVoices.push({ lang: 'fr-FR', name: 'Test French voice', default: true });
    toggleSequence(); // the player's play button retries the failed sentence
    await flush();
    expect(spoken.map((u) => u.text)).toEqual(['Un.']);
    expect(getSequenceState()).toMatchObject({ index: 0, failed: false });
    expect(getSpeechState()).toEqual({ phase: 'playing', key: 'Un.' });
  });

  test('without the option the selected engine behaves as before: clip load, audio playback, prefetch ahead', async () => {
    startSequence('TEST|article', ['Un.', 'Deux.', 'Trois.']);
    await flush();
    expect(loadSpeech).toHaveBeenCalledWith('Un.');
    expect(FakeAudio.instances).toHaveLength(1);
    expect(spoken).toHaveLength(0);
    expect(getSpeechState()).toEqual({ phase: 'playing', key: 'Un.' });
    FakeAudio.instances[0].end();
    await flush();
    expect(loadSpeech).toHaveBeenCalledWith('Deux.');
    expect(prefetchSpeech).toHaveBeenCalledWith(['Deux.', 'Trois.'], expect.any(Function));
    expect(FakeAudio.instances).toHaveLength(2);
  });
});

describe('the practice card', () => {
  // The card's real session guards run on React state/refs; audio, storage and the microphone are faked.
  const slots: unknown[] = [];
  let cursor = 0;
  let mounting = true;
  let effects: React.EffectCallback[] = [];
  let cleanups: Array<() => void> = [];
  let storedTakes: ShadowingTake[];
  const target: PracticeTarget = {
    source: { kind: 'article', articleId: 'TEST-article' },
    sentenceId: '0-0',
    text: 'Bonjour tout le monde.',
  };
  const latest: ShadowingTake = {
    id: 'TEST-latest',
    blob: new Blob(['TEST take'], { type: 'audio/webm' }),
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

  /** Persistent slots model re-renders; effects mount once, as in tests/practiceCardAssessment.test.ts. */
  function useView(playbackEngine?: 'device') {
    lifecycle.startRender();
    const card = usePracticeCard(undefined, playbackEngine);
    lifecycle.mount();
    return card;
  }
  const unmount = () => {
    for (const cleanup of cleanups.splice(0)) cleanup();
  };

  beforeEach(() => {
    slots.length = 0;
    cursor = 0;
    mounting = true;
    effects = [];
    cleanups = [];
    storedTakes = [latest];
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
      spyOn(storage, 'subscribeShadowing').mockImplementation(() => () => undefined),
      spyOn(storage, 'getShadowingSentence').mockImplementation(async (_source, text) => ({
        key: `TEST|${text}`,
        articleId: 'TEST-article',
        text,
        updatedAt: 1,
        takes: storedTakes,
      })),
      spyOn(capture, 'acquireStream').mockRejectedValue(new DOMException('TEST denied', 'NotAllowedError')),
    );
  });
  afterEach(() => {
    unmount();
    capture.cancelCapture();
  });

  async function ready(playbackEngine?: 'device', render = useView) {
    render(playbackEngine).open(target);
    await flush();
    const card = render(playbackEngine);
    expect(card.phase).toBe('ready');
    expect(card.latest).toBe(latest);
    return card;
  }

  test('a device reference speaks on the platform voice and never loads, prefetches or stores a clip', async () => {
    const card = await ready('device');
    card.playReference();
    await flush();
    expect(spoken.map((u) => u.text)).toEqual(['Bonjour tout le monde.']);
    expect(getSpeechState()).toEqual({ phase: 'playing', key: speechKey('Bonjour tout le monde.') });
    expect(FakeAudio.instances).toHaveLength(0);
    expect(loadSpeech).not.toHaveBeenCalled();
    expect(prefetchSpeech).not.toHaveBeenCalled();
  });

  test('a device reference with no French voice reports the real reason and never falls back', async () => {
    englishVoices();
    const card = await ready('device');
    card.playReference();
    await flush();
    expect(spoken).toHaveLength(0);
    expect(FakeAudio.instances).toHaveLength(0);
    expect(getSpeechFailure()).toMatchObject({ key: speechKey('Bonjour tout le monde.') });
    expect(getSpeechFailure()?.message).toBeTruthy();
    expect(getSpeechState().phase).toBe('idle');
    expect(loadSpeech).not.toHaveBeenCalled();
  });

  test('compare keeps the device source for the reference and then plays the take itself', async () => {
    const card = await ready('device');
    card.compare();
    await flush();
    expect(spoken.map((u) => u.text)).toEqual(['Bonjour tout le monde.']);
    expect(FakeAudio.instances).toHaveLength(0);
    spoken.at(-1)!.onend?.();
    await flush();
    expect(FakeAudio.instances).toHaveLength(1);
    expect(getSpeechState()).toEqual({ phase: 'playing', key: takeKey(latest) });
    FakeAudio.instances[0].end();
    expect(getSpeechState().phase).toBe('idle');
    expect(loadSpeech).not.toHaveBeenCalled();
    expect(prefetchSpeech).not.toHaveBeenCalled();
  });

  test('without the option the reference uses the selected engine as before', async () => {
    const card = await ready();
    card.playReference();
    await flush();
    expect(spoken).toHaveLength(0);
    expect(loadSpeech).toHaveBeenCalledWith('Bonjour tout le monde.', undefined);
    expect(FakeAudio.instances).toHaveLength(1);
    expect(getSpeechState()).toEqual({ phase: 'playing', key: speechKey('Bonjour tout le monde.') });
  });
});
