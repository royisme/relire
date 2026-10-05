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

import { getAppSettings } from './appSettings';

// Client-side cache for instant playback on repeated words/sentences
const clientTtsCache = new Map<string, string>();
let currentAudio: HTMLAudioElement | null = null;
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
  if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
    window.speechSynthesis.cancel();
  }
}

// Fetch TTS audio from server with configured model and voice
async function fetchTtsAudio(text: string, voice?: string): Promise<string> {
  const settings = getAppSettings();
  const effectiveVoice = voice || settings.ttsVoice || currentVoice || 'Kore';
  const effectiveModel = settings.ttsModel || 'gemini-3.8-flash-lite-tts';
  const cacheKey = `${effectiveModel}_${effectiveVoice}_${text.trim()}`;

  if (clientTtsCache.has(cacheKey)) {
    return clientTtsCache.get(cacheKey)!;
  }

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (settings.customApiKey?.trim()) {
    headers['x-gemini-api-key'] = settings.customApiKey.trim();
  }

  const res = await fetch('/api/tts', {
    method: 'POST',
    headers,
    body: JSON.stringify({
      text: text.trim(),
      voice: effectiveVoice,
      model: effectiveModel,
    }),
  });

  if (!res.ok) {
    throw new Error(`TTS server responded with ${res.status}`);
  }

  const data = await res.json();
  if (!data.audioBase64) {
    throw new Error('No audio data received');
  }

  // Cache up to 300 entries in client memory
  if (clientTtsCache.size > 300) {
    const firstKey = clientTtsCache.keys().next().value;
    if (firstKey) clientTtsCache.delete(firstKey);
  }
  clientTtsCache.set(cacheKey, data.audioBase64);

  return data.audioBase64;
}

// Play French speech using high-fidelity native Gemini TTS
export async function speakFrench(text: string, options: SpeechOptions = {}) {
  const cleanText = text.trim();
  if (!cleanText) return;

  // Stop any currently playing audio
  stopSpeech();

  const voiceName = options.voice || currentVoice;

  try {
    if (options.onStart) options.onStart();

    const audioBase64 = await fetchTtsAudio(cleanText, voiceName);
    const audioUrl = `data:audio/wav;base64,${audioBase64}`;
    const audio = new Audio(audioUrl);
    currentAudio = audio;

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
