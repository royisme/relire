/**
 * What the speaker is doing right now, shared by every control that can start it.
 * Only one clip plays at a time, so one state is enough: buttons compare `key` with
 * their own text and show loading / playing in place instead of the screen adding a player.
 */

export type SpeechPhase = 'idle' | 'loading' | 'playing';

export interface SpeechState {
  phase: SpeechPhase;
  /** Normalized text being loaded or played; null when idle. */
  key: string | null;
}

const IDLE: SpeechState = { phase: 'idle', key: null };

let state: SpeechState = IDLE;
const listeners = new Set<() => void>();

/** Same text however it was typed, so a word and its re-render match the same button. */
export function speechKey(text: string): string {
  return text.trim().replace(/\s+/g, ' ');
}

export function getSpeechState(): SpeechState {
  return state;
}

export function subscribeSpeech(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function setSpeechState(phase: SpeechPhase, key: string | null = null): void {
  if (phase === state.phase && key === state.key) return;
  // A new object each time, as useSyncExternalStore compares snapshots by identity.
  state = phase === 'idle' ? IDLE : { phase, key };
  listeners.forEach((l) => l());
}
