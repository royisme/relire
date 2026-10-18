/**
 * Speech playback contracts: a remote engine's failure is never answered with the device's voice, the
 * device engine is an explicit choice that fails honestly, an automatic device replay synthesizes nothing
 * remotely, and the settings preview plays through the same single-playback slot as every other sound.
 * Audio, the platform synthesizer and the AI boundary are faked; nothing here touches a provider.
 */
import { afterEach, beforeEach, describe, expect, mock, spyOn, test } from 'bun:test';
import * as accessModule from '../src/services/ai/access';
import type { AiAccess, AiPurpose, TextPurpose } from '../src/services/ai/types';
import { audioStats } from '../src/storage/audio';
import { getSpeechFailure, getSpeechState } from '../src/utils/speech/state';
import { speakFrench, stopSpeech, testSpeech } from '../src/utils/speech/playback';
import { failure, freshDb } from './fixtures/storage';
import { getAppSettings } from '../src/utils/appSettings';

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
  onerror: ((event?: unknown) => void) | null = null;
  constructor(text: string) {
    this.text = text;
  }
}

const frenchVoices = [{ lang: 'fr-FR', name: 'Test French voice', default: true }];
let spoken: FakeUtterance[] = [];
let cancelled = 0;
/** Cancelled utterances whose error event the platform still owes, as a real engine queues it. */
const queuedErrors: (() => void)[] = [];
let queueCancelledErrors = false;

const synth = {
  speaking: false,
  paused: false,
  getVoices: () => frenchVoices,
  addEventListener: () => {},
  removeEventListener: () => {},
  cancel: () => {
    cancelled++;
    const current = spoken.at(-1);
    synth.speaking = false;
    if (!current) return;
    // A real engine reports the cancelled utterance in an event queued after cancel() returns.
    if (queueCancelledErrors) queuedErrors.push(() => current.onerror?.());
    else current.onerror?.();
  },
  pause: () => {},
  resume: () => {},
  speak: (utterance: FakeUtterance) => {
    spoken.push(utterance);
    synth.speaking = true;
  },
};

const remoteSettings = () => ({ ...getAppSettings(), apiKeys: { gemini: 'fixture-key' } });
const deviceSettings = () => ({ ...getAppSettings(), speechProvider: 'device', speechModel: '', speechVoice: '' });

/** An access whose speech engine is remote (`synthesize` answers `answer`) or the device itself. */
function fakeAccess(answer: (() => Promise<Blob>) | (() => never), device = false) {
  const synthesize = mock(answer);
  const access: AiAccess = {
    isConfigured: mock((_purpose: AiPurpose) => true),
    selection: (purpose: AiPurpose) => ({
      providerId: device ? 'device' : 'gemini',
      model: device ? '' : `custom-${purpose}`,
      voice: device ? '' : 'Charon',
      device,
      capabilities: { textGeneration: 'unknown', imageInput: 'unknown', speechOutput: 'unknown' },
    }),
    text: mock((_purpose: TextPurpose) => {
      throw new Error('not used here');
    }),
    synthesize,
    checkConnection: mock(async () => {}),
    listModels: mock(async () => []),
  };
  return { access, synthesize };
}

const originalWindow = (globalThis as { window?: unknown }).window;
const originalAudio = (globalThis as { Audio?: unknown }).Audio;
const originalUtterance = (globalThis as { SpeechSynthesisUtterance?: unknown }).SpeechSynthesisUtterance;

beforeEach(async () => {
  await freshDb();
  stopSpeech();
  FakeAudio.instances = [];
  spoken = [];
  cancelled = 0;
  queuedErrors.length = 0;
  queueCancelledErrors = false;
  synth.speaking = false;
  (globalThis as { window?: unknown }).window = { speechSynthesis: synth };
  (globalThis as { Audio?: unknown }).Audio = FakeAudio;
  (globalThis as { SpeechSynthesisUtterance?: unknown }).SpeechSynthesisUtterance = FakeUtterance;
});
afterEach(() => {
  stopSpeech();
  mock.restore();
  (globalThis as { window?: unknown }).window = originalWindow;
  (globalThis as { Audio?: unknown }).Audio = originalAudio;
  (globalThis as { SpeechSynthesisUtterance?: unknown }).SpeechSynthesisUtterance = originalUtterance;
});

/** Speaks and reports how the clip settled, so a test can assert ended / interrupted / failed. */
async function settleOf(text: string, options: Parameters<typeof speakFrench>[1] = {}) {
  let outcome: string | null = null;
  await speakFrench(text, { ...options, onSettled: (result) => (outcome = result) });
  return () => outcome;
}

/** Lets the fake synthesis and play promises run, so a preview's audio element exists. */
const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('remote speech failures', () => {
  test('a failed synthesis settles failed with the real reason and never speaks the device voice', async () => {
    const fake = fakeAccess(() => {
      throw new Error('401: API key not valid');
    });
    spyOn(accessModule, 'getAiAccess').mockReturnValue(fake.access);
    const outcome = await settleOf('Bonjour');
    expect(outcome()).toBe('failed');
    expect(spoken).toHaveLength(0);
    expect(FakeAudio.instances).toHaveLength(0);
    expect(getSpeechFailure()).toMatchObject({ key: 'Bonjour' });
    expect(getSpeechFailure()?.message).toContain('401');
    expect(getSpeechState().phase).toBe('idle');
  });

  test('a clip that cannot be played settles failed and never speaks the device voice', async () => {
    const fake = fakeAccess(async () => new Blob(['audio'], { type: 'audio/wav' }));
    spyOn(accessModule, 'getAiAccess').mockReturnValue(fake.access);
    const outcome = await settleOf('Bonjour');
    expect(FakeAudio.instances).toHaveLength(1);
    FakeAudio.instances[0].fail();
    expect(outcome()).toBe('failed');
    expect(spoken).toHaveLength(0);
    expect(getSpeechFailure()?.message).toBeTruthy();
    // Retrying the same text clears the failure and plays when the provider answers again.
    const retry = await settleOf('Bonjour');
    FakeAudio.instances[1].end();
    expect(retry()).toBe('ended');
    expect(getSpeechFailure()).toBeNull();
  });
});

describe('the device engine', () => {
  test('speaks with the platform voice when it is the selected engine', async () => {
    const fake = fakeAccess(() => {
      throw new Error('never called');
    }, true);
    spyOn(accessModule, 'getAiAccess').mockReturnValue(fake.access);
    const outcome = await settleOf('Bonjour', { rate: 1.25 });
    expect(fake.synthesize).not.toHaveBeenCalled();
    expect(spoken.map((utterance) => utterance.text)).toEqual(['Bonjour']);
    expect(spoken[0].rate).toBe(1.25);
    spoken[0].onend?.();
    expect(outcome()).toBe('ended');
    expect(getSpeechFailure()).toBeNull();
    expect((await audioStats()).clips).toBe(0);
  });

  test('fails honestly when the device has no French voice, instead of speaking another way', async () => {
    const fake = fakeAccess(() => {
      throw new Error('never called');
    }, true);
    spyOn(accessModule, 'getAiAccess').mockReturnValue(fake.access);
    frenchVoices.length = 0;
    const outcome = await settleOf('Bonjour');
    expect(outcome()).toBe('failed');
    expect(spoken).toHaveLength(0);
    expect(getSpeechFailure()?.message).toBeTruthy();
    frenchVoices.push({ lang: 'fr-FR', name: 'Test French voice', default: true });
  });

  test('an automatic device replay with a remote engine synthesizes and stores nothing', async () => {
    const fake = fakeAccess(async () => new Blob(['audio'], { type: 'audio/wav' }));
    spyOn(accessModule, 'getAiAccess').mockReturnValue(fake.access);
    const outcome = await settleOf('Bonjour', { engine: 'device', rate: 1 });
    expect(fake.synthesize).not.toHaveBeenCalled();
    expect(spoken.map((utterance) => utterance.text)).toEqual(['Bonjour']);
    spoken[0].onend?.();
    expect(outcome()).toBe('ended');
    expect((await audioStats()).clips).toBe(0);
  });
});

describe('the settings preview', () => {
  test('plays through the shared slot: stopping or starting any playback interrupts it', async () => {
    const fake = fakeAccess(async () => new Blob(['audio'], { type: 'audio/wav' }));
    spyOn(accessModule, 'getAiAccess').mockReturnValue(fake.access);
    const preview = testSpeech(remoteSettings());
    await tick();
    expect(FakeAudio.instances).toHaveLength(1);
    stopSpeech();
    expect(FakeAudio.instances[0].paused).toBe(true);
    await failure(preview); // stopped, so cancelled without a failure

    const second = testSpeech(remoteSettings());
    await tick();
    expect(FakeAudio.instances).toHaveLength(2);
    await speakFrench('Une autre phrase');
    expect(FakeAudio.instances[1].paused).toBe(true);
    await failure(second);
  });

  test('claiming the slot clears the clip it interrupted, so no Listen button stays playing', async () => {
    const fake = fakeAccess(async () => new Blob(['audio'], { type: 'audio/wav' }));
    spyOn(accessModule, 'getAiAccess').mockReturnValue(fake.access);
    await settleOf('Bonjour');
    expect(getSpeechState()).toMatchObject({ phase: 'playing', key: 'Bonjour' });
    const preview = testSpeech(remoteSettings());
    expect(getSpeechState()).toMatchObject({ phase: 'idle', key: null });
    expect(FakeAudio.instances[0].paused).toBe(true);
    await tick();
    FakeAudio.instances[1].end();
    expect(await failure(preview)).toBeUndefined();
  });

  test('a clip that errors while the preview plays reports the failure, not a false success', async () => {
    const fake = fakeAccess(async () => new Blob(['audio'], { type: 'audio/wav' }));
    spyOn(accessModule, 'getAiAccess').mockReturnValue(fake.access);
    const preview = testSpeech(remoteSettings());
    await tick();
    FakeAudio.instances[0].fail();
    const error = await failure(preview);
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toBeTruthy();
  });

  test('interrupting a remote preview cancels it, and its late error cannot fail the new sound', async () => {
    const fake = fakeAccess(async () => new Blob(['audio'], { type: 'audio/wav' }));
    spyOn(accessModule, 'getAiAccess').mockReturnValue(fake.access);
    const preview = testSpeech(remoteSettings());
    await tick();
    await speakFrench('Une autre phrase');
    expect(await failure(preview)).toBeUndefined();
    // The interrupted preview's element can still emit its error (its URL was revoked): a new clip must not fail.
    FakeAudio.instances[0].fail();
    expect(getSpeechFailure()).toBeNull();
  });

  test('a repeated preview does not overlap the one before it', async () => {
    const fake = fakeAccess(async () => new Blob(['audio'], { type: 'audio/wav' }));
    spyOn(accessModule, 'getAiAccess').mockReturnValue(fake.access);
    const first = testSpeech(remoteSettings());
    await tick();
    const second = testSpeech(remoteSettings());
    expect(FakeAudio.instances[0].paused).toBe(true);
    await tick();
    expect(FakeAudio.instances[1].paused).toBe(false);
    FakeAudio.instances[1].end();
    expect(await failure(first)).toBeUndefined();
    expect(await failure(second)).toBeUndefined();
  });

  test('interrupting a device preview is a cancellation, not a reported failure', async () => {
    const fake = fakeAccess(() => {
      throw new Error('never called');
    }, true);
    spyOn(accessModule, 'getAiAccess').mockReturnValue(fake.access);
    const preview = testSpeech(deviceSettings());
    await new Promise((resolve) => setTimeout(resolve, 0)); // the voice list resolves on a microtask
    expect(spoken).toHaveLength(1);
    await speakFrench('Une autre phrase');
    expect(cancelled).toBeGreaterThan(0);
    expect(await failure(preview)).toBeUndefined();
  });

  test('a stale device preview abort cannot cancel the device speech that replaced it', async () => {
    const fake = fakeAccess(() => {
      throw new Error('never called');
    }, true);
    spyOn(accessModule, 'getAiAccess').mockReturnValue(fake.access);
    queueCancelledErrors = true;
    const controller = new AbortController();
    const preview = testSpeech(deviceSettings(), controller.signal);
    await tick();
    expect(spoken).toHaveLength(1);
    // A newer device clip takes the single slot; the platform still owes the preview's cancellation event.
    await speakFrench('Une autre phrase', { engine: 'device' });
    expect(spoken).toHaveLength(2);
    expect(queuedErrors).toHaveLength(1);
    // Settings is left after the preview was already replaced: the abort is stale and must leave B playing.
    controller.abort();
    queuedErrors.splice(0).forEach((fire) => fire());
    expect(getSpeechState()).toEqual({ phase: 'playing', key: 'Une autre phrase' });
    expect(getSpeechFailure()).toBeNull();
    // The replaced preview had already settled, so the stale abort changes nothing about it either.
    expect(await failure(preview)).toBeUndefined();
  });

  test('cancelling a device preview while the voice list is still loading speaks nothing and reports nothing', async () => {
    const fake = fakeAccess(() => {
      throw new Error('never called');
    }, true);
    spyOn(accessModule, 'getAiAccess').mockReturnValue(fake.access);
    frenchVoices.length = 0; // the platform fills its list after the first frame; here it never arrives
    const controller = new AbortController();
    const preview = testSpeech(deviceSettings(), controller.signal);
    await tick();
    controller.abort();
    expect(await failure(preview)).toMatchObject({ name: 'AbortError' });
    expect(spoken).toHaveLength(0);
    expect(getSpeechFailure()).toBeNull();
    frenchVoices.push({ lang: 'fr-FR', name: 'Test French voice', default: true });
  });
});
