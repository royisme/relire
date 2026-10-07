import type { AppSettings } from '../appSettings';
import { loadSpeech } from './clips';
import { getSpeechState, setSpeechState, speechKey } from './state';

/**
 * Playback of French speech (stored or synthesized clips, browser voice as a fallback) and its shared rate.
 * Progress (loading, playing, paused) is published through `state.ts`; UI reads it from there. Only
 * `sequence.ts` passes `onSettled`, to chain one clip after another.
 */

export type SpeechOutcome = 'ended' | 'interrupted' | 'failed';

export interface SpeechOptions {
  rate?: number; // 0.5 - 1.5
  /** Defaults to the voice in Settings. */
  voice?: string;
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

/** Plays French speech: a stored clip if there is one, else the speech provider, else the browser voice. */
export async function speakFrench(text: string, options: SpeechOptions = {}) {
  const cleanText = text.trim();
  if (!cleanText) return;

  halt();
  const id = requestId;
  const isCurrent = () => id === requestId;
  const key = speechKey(cleanText);
  settle = options.onSettled ?? null;
  setSpeechState('loading', key);

  let audioUrl: string | null = null;

  try {
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
      console.warn('Audio playback error, falling back to browser speech:', e);
      currentAudio = null;
      fallbackBrowserSpeech(cleanText, key, options, isCurrent);
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
    console.warn('Speech provider failed, falling back to browser speech:', err);
    // play() can reject after the URL was created; do not leak it.
    if (audioUrl) {
      if (currentUrl === audioUrl) releaseUrl();
      else URL.revokeObjectURL(audioUrl);
      currentAudio = null;
    }
    fallbackBrowserSpeech(cleanText, key, options, isCurrent);
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

/** What a speak button does: stop if this text is loading or playing, otherwise play it. */
export function toggleSpeech(text: string, options: SpeechOptions = {}) {
  const { phase, key } = getSpeechState();
  if (phase !== 'idle' && key === speechKey(text)) stopSpeech();
  else void speakFrench(text, options);
}

// Fallback browser speech synthesis if the speech provider fails
function fallbackBrowserSpeech(text: string, key: string, options: SpeechOptions, isCurrent: () => boolean) {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
    setSpeechState('idle');
    settleWith('failed');
    return;
  }

  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = 'fr-FR';
  utterance.rate = options.rate ?? 0.88;

  const voices = window.speechSynthesis.getVoices();
  const frVoice = voices.find(
    (v) => v.lang.startsWith('fr') && (v.name.includes('Google') || v.name.includes('Thomas') || v.name.includes('Audrey'))
  ) || voices.find((v) => v.lang.startsWith('fr'));

  if (frVoice) utterance.voice = frVoice;

  // cancel() reports the old utterance as an error; only the current request may change the state.
  const finish = (outcome: SpeechOutcome) => {
    if (!isCurrent()) return;
    setSpeechState('idle');
    settleWith(outcome);
  };
  utterance.onend = () => finish('ended');
  utterance.onerror = () => finish('failed');

  window.speechSynthesis.speak(utterance);
  // Paused while the provider was failing: the browser voice waits too.
  if (paused) {
    window.speechSynthesis.pause();
    setSpeechState('paused', key);
  } else {
    setSpeechState('playing', key);
  }
}


/**
 * Plays a short phrase with the given (possibly unsaved) settings and reports
 * failure, unlike speakFrench which quietly falls back to the browser voice.
 */
export async function testSpeech(settings: AppSettings): Promise<void> {
  const clip = await loadSpeech('Bonjour ! Bienvenue sur Relire.', undefined, settings);
  const url = URL.createObjectURL(clip);
  const audio = new Audio(url);
  audio.addEventListener('ended', () => URL.revokeObjectURL(url), { once: true });
  await audio.play();
}
