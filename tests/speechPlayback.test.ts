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

const synth = {
  speaking: false,
  paused: false,
  getVoices: () => frenchVoices,
  addEventListener: () => {},
  removeEventListener: () => {},
  cancel: () => {
    cancelled++;
    const current = spoken.at(-1);
    if (current) current.onerror?.();
    synth.speaking = false;
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
    await testSpeech(remoteSettings());
    expect(FakeAudio.instances).toHaveLength(1);
    stopSpeech();
    expect(FakeAudio.instances[0].paused).toBe(true);

    await testSpeech(remoteSettings());
    expect(FakeAudio.instances).toHaveLength(2);
    await speakFrench('Une autre phrase');
    expect(FakeAudio.instances[1].paused).toBe(true);
  });

  test('a repeated preview does not overlap the one before it', async () => {
    const fake = fakeAccess(async () => new Blob(['audio'], { type: 'audio/wav' }));
    spyOn(accessModule, 'getAiAccess').mockReturnValue(fake.access);
    await testSpeech(remoteSettings());
    await testSpeech(remoteSettings());
    expect(FakeAudio.instances).toHaveLength(2);
    expect(FakeAudio.instances[0].paused).toBe(true);
    expect(FakeAudio.instances[1].paused).toBe(false);
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
});
