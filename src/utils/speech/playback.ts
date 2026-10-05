import type { AppSettings } from '../appSettings';
import { loadSpeech } from './clips';

/** Playback of French speech (stored or synthesized clips, browser voice as a fallback) and its shared voice/rate settings. */

export interface SpeechOptions {
  rate?: number; // 0.7 - 1.3
  /** Defaults to the voice in Settings. */
  voice?: string;
  onStart?: () => void;
  onEnd?: () => void;
  onError?: (err: any) => void;
}

let currentAudio: HTMLAudioElement | null = null;
let currentUrl: string | null = null;

/** Frees the object URL of the clip that is playing or was playing. */
function releaseUrl() {
  if (currentUrl) {
    URL.revokeObjectURL(currentUrl);
    currentUrl = null;
  }
}
let globalRate = 0.85;

export function setGlobalRate(rate: number) {
  globalRate = rate;
  if (currentAudio) {
    currentAudio.playbackRate = rate;
  }
}

export function getGlobalRate(): number {
  return globalRate;
}

export function stopSpeech() {
  if (currentAudio) {
    currentAudio.pause();
    currentAudio.currentTime = 0;
    currentAudio = null;
  }
  releaseUrl();
  if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
    window.speechSynthesis.cancel();
  }
}

// Play French speech using high-fidelity native Gemini TTS
export async function speakFrench(text: string, options: SpeechOptions = {}) {
  const cleanText = text.trim();
  if (!cleanText) return;

  // Stop any currently playing audio
  stopSpeech();

  let audioUrl: string | null = null;

  try {
    if (options.onStart) options.onStart();

    const clip = await loadSpeech(cleanText, options.voice);
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
      currentAudio = null;
      if (options.onEnd) options.onEnd();
    };

    audio.onerror = (e) => {
      console.warn('Audio playback error, falling back to browser speech:', e);
      currentAudio = null;
      fallbackBrowserSpeech(cleanText, options);
    };

    await audio.play();
  } catch (err) {
    console.warn('Gemini TTS failed, falling back to browser speech:', err);
    // play() can reject after the URL was created; do not leak it.
    if (audioUrl) {
      if (currentUrl === audioUrl) releaseUrl();
      else URL.revokeObjectURL(audioUrl);
      currentAudio = null;
    }
    fallbackBrowserSpeech(cleanText, options);
  }
}

// Fallback browser speech synthesis if remote TTS fails
function fallbackBrowserSpeech(text: string, options: SpeechOptions = {}) {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
    if (options.onError) options.onError(new Error('Speech unsupported'));
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

  utterance.onend = () => {
    if (options.onEnd) options.onEnd();
  };
  utterance.onerror = (err) => {
    if (options.onError) options.onError(err);
  };

  window.speechSynthesis.speak(utterance);
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
