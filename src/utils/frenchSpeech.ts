/**
 * French Native AI Speech Synthesis (Gemini TTS) and Audio Recorder
 */

export interface SpeechOptions {
  rate?: number; // 0.7 - 1.3
  voice?: 'Kore' | 'Charon' | 'Zephyr' | 'Puck' | 'Fenrir'; // Native Gemini French voices
  onStart?: () => void;
  onEnd?: () => void;
  onError?: (err: any) => void;
}

import { synthesizeSpeech } from '../services/gemini';
import { base64ToBlob, getAudio, putAudio } from '../storage/audio';
import { getAppSettings } from './appSettings';

let currentAudio: HTMLAudioElement | null = null;
let currentUrl: string | null = null;

/** Frees the object URL of the clip that is playing or was playing. */
function releaseUrl() {
  if (currentUrl) {
    URL.revokeObjectURL(currentUrl);
    currentUrl = null;
  }
}
let currentVoice: 'Kore' | 'Charon' | 'Zephyr' | 'Puck' = 'Kore';
let globalRate = 0.85;

export function setGlobalVoice(voice: 'Kore' | 'Charon' | 'Zephyr' | 'Puck') {
  currentVoice = voice;
}

export function getGlobalVoice(): 'Kore' | 'Charon' | 'Zephyr' | 'Puck' {
  return currentVoice;
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

// Clips being synthesized right now, so two requests for the same text cost one call.
const synthesizing = new Map<string, Promise<Blob>>();

/** Returns the clip from storage when we have it, otherwise synthesizes and keeps it. */
async function loadSpeech(text: string, voice?: string): Promise<Blob> {
  const settings = getAppSettings();
  const effectiveVoice = voice || settings.ttsVoice || currentVoice || 'Kore';
  const effectiveModel = settings.ttsModel || 'gemini-3.8-flash-lite-tts';
  const trimmed = text.trim();

  const stored = await getAudio(effectiveModel, effectiveVoice, trimmed);
  if (stored) return stored;

  const flightKey = `${effectiveModel}|${effectiveVoice}|${trimmed}`;
  const pending = synthesizing.get(flightKey);
  if (pending) return pending;

  const request = synthesizeSpeech({ text: trimmed, voice: effectiveVoice, model: effectiveModel }, settings.customApiKey)
    .then(async (base64) => {
      const blob = base64ToBlob(base64);
      await putAudio(effectiveModel, effectiveVoice, trimmed, blob);
      return blob;
    })
    .finally(() => synthesizing.delete(flightKey));
  synthesizing.set(flightKey, request);
  return request;
}

/**
 * Makes sure the clips for these texts are stored (used when a word is saved,
 * so its pronunciation is kept with it). Quiet: no key, offline or an error
 * just means nothing is stored.
 */
export async function prefetchSpeech(texts: string[]): Promise<void> {
  if (!getAppSettings().customApiKey?.trim()) return;
  for (const text of texts) {
    if (!text.trim()) continue;
    try {
      await loadSpeech(text);
    } catch {
      return;
    }
  }
}

// Play French speech using high-fidelity native Gemini TTS
export async function speakFrench(text: string, options: SpeechOptions = {}) {
  const cleanText = text.trim();
  if (!cleanText) return;

  // Stop any currently playing audio
  stopSpeech();

  const voiceName = options.voice || currentVoice;
  let audioUrl: string | null = null;

  try {
    if (options.onStart) options.onStart();

    const clip = await loadSpeech(cleanText, voiceName);
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

// Audio Recording utility for Shadowing & Pronunciation
export class FrenchAudioRecorder {
  private mediaRecorder: MediaRecorder | null = null;
  private audioChunks: Blob[] = [];
  private stream: MediaStream | null = null;
  private mimeType: string = 'audio/webm';

  async start(): Promise<boolean> {
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          sampleRate: 44100,
        },
      });

      if (MediaRecorder.isTypeSupported('audio/webm;codecs=opus')) {
        this.mimeType = 'audio/webm;codecs=opus';
      } else if (MediaRecorder.isTypeSupported('audio/webm')) {
        this.mimeType = 'audio/webm';
      } else if (MediaRecorder.isTypeSupported('audio/mp4')) {
        this.mimeType = 'audio/mp4';
      } else if (MediaRecorder.isTypeSupported('audio/ogg')) {
        this.mimeType = 'audio/ogg';
      }

      this.audioChunks = [];
      this.mediaRecorder = new MediaRecorder(this.stream, { mimeType: this.mimeType });

      this.mediaRecorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          this.audioChunks.push(event.data);
        }
      };

      this.mediaRecorder.start(100);
      return true;
    } catch (err) {
      console.error('Microphone access failed:', err);
      return false;
    }
  }

  async stop(): Promise<{ blob: Blob; base64: string; mimeType: string } | null> {
    return new Promise((resolve) => {
      if (!this.mediaRecorder || this.mediaRecorder.state === 'inactive') {
        resolve(null);
        return;
      }

      this.mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(this.audioChunks, { type: this.mimeType });
        if (this.stream) {
          this.stream.getTracks().forEach((track) => track.stop());
        }

        const reader = new FileReader();
        reader.onloadend = () => {
          const base64String = (reader.result as string).split(',')[1];
          resolve({
            blob: audioBlob,
            base64: base64String,
            mimeType: this.mimeType,
          });
        };
        reader.readAsDataURL(audioBlob);
      };

      this.mediaRecorder.stop();
    });
  }
}
