import type { AppSettings } from '../appSettings';
import i18n from '../../i18n';
import { getAiAccess } from '../../services/ai/access';
import { DeviceVoiceError, errorMessage } from '../../services/ai/errors';
import { loadSpeech } from './clips';
import { getSpeechFailure, getSpeechState, setSpeechFailure, setSpeechState, speechKey } from './state';

/**
 * Playback of French speech (stored or synthesized clips, the device engine's own voice) and its shared rate.
 * Progress (loading, playing, paused) is published through `state.ts`; UI reads it from there. `onSettled`
 * chains clips: `sequence.ts` for an article, the practice card for reference → recording.
 * The learner's own recordings play through the same machinery (`playRecording`), so only one sound
 * plays at a time and every button shows the right state. A remote engine that fails settles `failed`
 * with its real reason on the control that started it; the device voice is an engine choice, never a
 * silent substitute for one.
 */

export type SpeechOutcome = 'ended' | 'interrupted' | 'failed';

export interface SpeechOptions {
  rate?: number; // 0.5 - 1.5
  /** Defaults to the voice in Settings. */
  voice?: string;
  /** Speaks with the device's own voice whatever engine is selected: the free automatic replay of a
   * checked dictation when the learner has not allowed remote synthesis. Nothing is synthesized or stored. */
  engine?: 'device';
  /**
   * Called once when this clip is done: it played to the end, it was stopped or replaced by another clip,
   * or neither the provider nor the browser voice could play it. Used to chain clips (`sequence.ts`).
   */
  onSettled?: (outcome: SpeechOutcome) => void;
}

let currentAudio: HTMLAudioElement | null = null;
let currentUrl: string | null = null;
let globalRate = 0.85;
/** Bumped by every start and stop, so a clip that finishes loading after being stopped or replaced stays silent. */
let requestId = 0;
/** The current clip's onSettled, cleared once called. */
let settle: ((outcome: SpeechOutcome) => void) | null = null;
/** Paused by the user; a clip that finishes loading while paused waits instead of playing. */
let paused = false;
/** Runs before any sound starts or resumes; the practice card uses it to end a running recording first. */
let beforePlay: (() => void) | null = null;

export function setBeforePlay(hook: (() => void) | null) {
  beforePlay = hook;
}

function settleWith(outcome: SpeechOutcome) {
  const fn = settle;
  settle = null;
  fn?.(outcome);
}

/** Frees the object URL of the clip that is playing or was playing. */
function releaseUrl() {
  if (currentUrl) {
    URL.revokeObjectURL(currentUrl);
    currentUrl = null;
  }
}

export function setGlobalRate(rate: number) {
  globalRate = rate;
  if (currentAudio) {
    currentAudio.playbackRate = rate;
  }
}

export function getGlobalRate(): number {
  return globalRate;
}

/** Stops whatever plays or loads, without publishing a state (callers do that). */
function halt() {
  requestId++;
  paused = false;
  if (currentAudio) {
    currentAudio.pause();
    currentAudio.currentTime = 0;
    currentAudio = null;
  }
  releaseUrl();
  if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
    window.speechSynthesis.cancel();
  }
  settleWith('interrupted');
}

export function stopSpeech() {
  halt();
  setSpeechState('idle');
}

/** A clip that could not be played settles failed and puts its real reason on the control that started it. */
function failSpeech(key: string, message: string) {
  setSpeechFailure({ key, message });
  setSpeechState('idle');
  settleWith('failed');
}

/** Plays French speech: a stored clip if there is one, else the speech provider; the device engine speaks
 *  with the platform's voice. A failure of either engine settles `failed` with its real reason — one engine
 *  is never silently substituted for the other. */
export async function speakFrench(text: string, options: SpeechOptions = {}) {
  const cleanText = text.trim();
  if (!cleanText) return;

  beforePlay?.();
  halt();
  const id = requestId;
  const isCurrent = () => id === requestId;
  const key = speechKey(cleanText);
  settle = options.onSettled ?? null;
  // Retrying this clip is the one thing that clears its failure.
  if (getSpeechFailure()?.key === key) setSpeechFailure(null);
  setSpeechState('loading', key);

  let audioUrl: string | null = null;

  try {
    // An explicit device source speaks directly: no clip, no synthesis, nothing stored.
    if (options.engine === 'device') return deviceSpeech(cleanText, key, options, isCurrent);
    const clip = await loadSpeech(cleanText, options.voice);
    if (!isCurrent()) return; // stopped or replaced while loading; the clip is already stored for next time

    audioUrl = URL.createObjectURL(clip);
    const url = audioUrl;
    const audio = new Audio(url);
    // Revoke only if this clip is still the current one (a newer clip has its own URL).
    const release = () => {
      if (currentUrl === url) releaseUrl();
      else URL.revokeObjectURL(url);
    };
    audio.addEventListener('ended', release, { once: true });
    audio.addEventListener('error', release, { once: true });
    currentAudio = audio;
    currentUrl = url;

    const effectiveRate = options.rate ?? globalRate;
    if (effectiveRate && effectiveRate > 0) {
      audio.playbackRate = effectiveRate;
    }

    audio.onended = () => {
      if (!isCurrent()) return;
      currentAudio = null;
      setSpeechState('idle');
      settleWith('ended');
    };

    audio.onerror = (e) => {
      if (!isCurrent()) return;
      currentAudio = null;
      console.warn('Audio playback error:', e);
      failSpeech(key, i18n.t('errors.speechPlayback'));
    };

    // Paused while loading: keep the clip ready; resumeSpeech starts it.
    if (paused) {
      setSpeechState('paused', key);
      return;
    }
    await audio.play();
    if (isCurrent() && !paused) setSpeechState('playing', key);
  } catch (err) {
    if (!isCurrent()) {
      if (audioUrl) URL.revokeObjectURL(audioUrl);
      return;
    }
    // play() rejects when it is paused before it starts; that is a pause, not a failure.
    if (paused && currentAudio) return;
    // A device engine is a choice, not a provider failure: it speaks with the platform's voice below.
    if (err instanceof DeviceVoiceError) return deviceSpeech(cleanText, key, options, isCurrent);
    // play() can reject after the URL was created; do not leak it.
    if (audioUrl) {
      if (currentUrl === audioUrl) releaseUrl();
      else URL.revokeObjectURL(audioUrl);
      currentAudio = null;
    }
    failSpeech(key, errorMessage(err));
  }
}

/** Pauses the clip that is playing (or holds one that is still loading); resumeSpeech continues it. */
export function pauseSpeech() {
  const { phase, key } = getSpeechState();
  if (phase === 'idle' || phase === 'paused') return;
  paused = true;
  if (currentAudio && !currentAudio.paused) currentAudio.pause();
  if (typeof window !== 'undefined' && 'speechSynthesis' in window && window.speechSynthesis.speaking) {
    window.speechSynthesis.pause();
  }
  setSpeechState('paused', key);
}

export function resumeSpeech() {
  const { phase, key } = getSpeechState();
  if (phase !== 'paused') return;
  beforePlay?.();
  paused = false;
  if (currentAudio) {
    const audio = currentAudio;
    setSpeechState('playing', key);
    audio.play().catch((err) => {
      if (currentAudio !== audio || paused) return;
      console.warn('Could not resume audio:', err);
      stopSpeech();
    });
  } else if (typeof window !== 'undefined' && 'speechSynthesis' in window && window.speechSynthesis.paused) {
    window.speechSynthesis.resume();
    setSpeechState('playing', key);
  } else {
    // Still loading: it starts as soon as the clip arrives.
    setSpeechState('loading', key);
  }
}

/**
 * Plays one of the learner's recordings at its natural speed. `key` (e.g. `take:<id>`) identifies it in the
 * shared state, apart from any text. No browser-voice fallback: a recording that cannot play reports `failed`.
 */
export async function playRecording(blob: Blob, key: string, options: Pick<SpeechOptions, 'onSettled'> = {}) {
  beforePlay?.();
  halt();
  const id = requestId;
  const isCurrent = () => id === requestId;
  settle = options.onSettled ?? null;
  setSpeechState('loading', key);
  const url = URL.createObjectURL(blob);
  const audio = new Audio(url);
  currentAudio = audio;
  currentUrl = url;
  audio.onended = () => {
    if (!isCurrent()) return;
    currentAudio = null;
    releaseUrl();
    setSpeechState('idle');
    settleWith('ended');
  };
  audio.onerror = () => {
    if (!isCurrent()) return;
    currentAudio = null;
    releaseUrl();
    setSpeechState('idle');
    settleWith('failed');
  };
  try {
    await audio.play();
    if (isCurrent() && !paused) setSpeechState('playing', key);
  } catch {
    if (!isCurrent() || (paused && currentAudio)) return;
    currentAudio = null;
    releaseUrl();
    setSpeechState('idle');
    settleWith('failed');
  }
}

/** What a speak button does: stop if this text is loading or playing, otherwise play it. */
export function toggleSpeech(text: string, options: SpeechOptions = {}) {
  const { phase, key } = getSpeechState();
  if (phase !== 'idle' && key === speechKey(text)) stopSpeech();
  else void speakFrench(text, options);
}

/** The rate the device's own voice speaks at: a touch slower than natural reading. */
const DEVICE_RATE = 0.88;
/** How long to wait for a browser that fills its voice list after the first frame. */
const DEVICE_VOICE_WAIT_MS = 500;
const TEST_PHRASE = 'Bonjour ! Bienvenue sur Relire.';

/** The platform's French voice, or nothing when the device has none installed. */
function frenchVoice(voices: SpeechSynthesisVoice[]): SpeechSynthesisVoice | undefined {
  return (
    voices.find(
      (v) =>
        v.lang.startsWith('fr') &&
        (v.name.includes('Google') || v.name.includes('Thomas') || v.name.includes('Audrey')),
    ) ?? voices.find((v) => v.lang.startsWith('fr'))
  );
}

/** What the platform's own voice says: French, at the rate this app speaks it. */
function deviceUtterance(
  text: string,
  rate: number,
  voice = frenchVoice(window.speechSynthesis.getVoices()),
): SpeechSynthesisUtterance {
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = 'fr-FR';
  utterance.rate = rate;
  if (voice) utterance.voice = voice;
  return utterance;
}

/** The device's voices, waiting briefly when the list is still empty (Chrome fills it after the first frame). */
async function deviceVoices(): Promise<SpeechSynthesisVoice[]> {
  const synth = window.speechSynthesis;
  if (synth.getVoices().length) return synth.getVoices();
  return new Promise((settle) => {
    const done = () => {
      clearTimeout(timer);
      synth.removeEventListener('voiceschanged', done);
      settle(synth.getVoices());
    };
    const timer = setTimeout(done, DEVICE_VOICE_WAIT_MS);
    synth.addEventListener('voiceschanged', done);
  });
}

/**
 * Speaks with the device's own voice: the playback path of the device engine (chosen in Settings) and of
 * an explicit device source. It is an engine, not a fallback: with no platform speech or no French voice
 * it fails honestly instead of substituting another engine.
 */
async function deviceSpeech(text: string, key: string, options: SpeechOptions, isCurrent: () => boolean) {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
    failSpeech(key, i18n.t('errors.deviceVoiceUnavailable'));
    return;
  }
  const voice = frenchVoice(await deviceVoices());
  if (!isCurrent()) return; // stopped or replaced while the voice list was loading
  if (!voice) {
    failSpeech(key, i18n.t('errors.deviceVoiceNoFrench'));
    return;
  }

  const utterance = deviceUtterance(text, options.rate ?? DEVICE_RATE, voice);

  // cancel() reports the old utterance as an error; only the current request may change the state.
  const finish = (outcome: SpeechOutcome) => {
    if (!isCurrent()) return;
    if (outcome === 'failed') setSpeechFailure({ key, message: i18n.t('errors.deviceVoiceFailed') });
    setSpeechState('idle');
    settleWith(outcome);
  };
  utterance.onend = () => finish('ended');
  utterance.onerror = () => finish('failed');

  window.speechSynthesis.speak(utterance);
  // Paused while the engine was starting: the browser voice waits too.
  if (paused) {
    window.speechSynthesis.pause();
    setSpeechState('paused', key);
  } else {
    setSpeechState('playing', key);
  }
}

/** The device voice's own check: speaks the test phrase, or reports that this device cannot speak French. */
async function previewDeviceVoice(signal?: AbortSignal, isCurrent: () => boolean = () => true): Promise<void> {
  if (typeof window === 'undefined' || !('speechSynthesis' in window))
    throw new Error(i18n.t('errors.deviceVoiceUnavailable'));
  const voice = frenchVoice(await deviceVoices());
  if (!voice) throw new Error(i18n.t('errors.deviceVoiceNoFrench'));
  signal?.throwIfAborted();
  // Another sound took over the single slot while the voice list loaded: the preview is moot, not failed.
  if (!isCurrent()) return;
  const synth = window.speechSynthesis;
  synth.cancel();
  const utterance = deviceUtterance(TEST_PHRASE, DEVICE_RATE, voice);
  await new Promise<void>((resolve, reject) => {
    const end = (error?: Error) => {
      signal?.removeEventListener('abort', abort);
      if (error) reject(error);
      else resolve();
    };
    const abort = () => {
      synth.cancel();
      end(new DOMException('Aborted', 'AbortError'));
    };
    utterance.onend = () => end();
    // Another sound interrupting the preview is a cancellation, not a failure to report.
    utterance.onerror = () => (isCurrent() ? end(new Error(i18n.t('errors.deviceVoiceFailed'))) : end());
    signal?.addEventListener('abort', abort, { once: true });
    synth.speak(utterance);
  });
}

/**
 * Plays a short phrase with the given (possibly unsaved) settings and reports failure; a cached clip
 * cannot stand in for a check. The preview is a sound like any other: it interrupts whatever plays, is
 * interrupted by any new playback or stop, and is cancelled with its request when Settings is left.
 * A device engine is its own check: it reports whether this device has a French voice.
 */
export async function testSpeech(settings: AppSettings, signal?: AbortSignal): Promise<void> {
  const access = getAiAccess(settings);
  const device = access.selection('speech').device;
  beforePlay?.();
  halt();
  const id = requestId;
  const isCurrent = () => id === requestId;
  if (device) return previewDeviceVoice(signal, isCurrent);
  // A cached clip cannot verify the current draft key or model.
  const clip = await access.synthesize({ text: TEST_PHRASE, signal });
  signal?.throwIfAborted();
  // Superseded by other playback while the clip was synthesized: nothing plays, and no sound overlaps.
  if (!isCurrent()) return;
  const url = URL.createObjectURL(clip);
  const audio = new Audio(url);
  // Registered as the current sound, so stopSpeech and any new playback interrupt the preview too.
  currentAudio = audio;
  currentUrl = url;
  const release = () => {
    if (currentUrl === url) currentUrl = null;
    if (currentAudio === audio) currentAudio = null;
    URL.revokeObjectURL(url);
    signal?.removeEventListener('abort', abort);
  };
  const abort = () => {
    audio.pause();
    release();
  };
  signal?.addEventListener('abort', abort, { once: true });
  audio.addEventListener('ended', release, { once: true });
  audio.addEventListener('error', release, { once: true });
  try {
    await audio.play();
    signal?.throwIfAborted();
  } catch (err) {
    release();
    throw err;
  }
}
