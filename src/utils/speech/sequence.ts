import { pauseSpeech, resumeSpeech, speakFrench, stopSpeech } from './playback';
import { loadSpeech, prefetchSpeech } from './clips';
import { getSpeechState } from './state';

/**
 * Listening to a whole text: plays its sentences one after another, one clip each, so playback starts after
 * the first sentence, clips are shared with the sentence buttons, and nothing past the next two sentences is
 * synthesized until the listener gets there. Pausing or stopping generates nothing more.
 *
 * Owns only the queue and position; play/pause/loading come from the shared speech state.
 */

export interface SequenceState {
  /** What is being read (an article id); null when no sequence is active. */
  id: string | null;
  index: number;
  total: number;
  /** The current sentence could not be played (provider and browser voice both failed). */
  failed: boolean;
}

const IDLE: SequenceState = { id: null, index: 0, total: 0, failed: false };
const PREFETCH_AHEAD = 2;

let state: SequenceState = IDLE;
let items: string[] = [];
/** Bumped whenever the sequence is restarted, moved or stopped, so callbacks from an older clip are ignored. */
let token = 0;
const listeners = new Set<() => void>();

function set(next: SequenceState) {
  state = next;
  listeners.forEach((l) => l());
}

export function getSequenceState(): SequenceState {
  return state;
}

export function subscribeSequence(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function playAt(index: number, t: number) {
  if (t !== token) return;
  if (index >= items.length) {
    token++;
    set(IDLE);
    return;
  }
  set({ ...state, index, failed: false });
  // The current sentence first; the next ones are fetched once it is ready, so they never delay it.
  void loadSpeech(items[index])
    .catch(() => undefined)
    .then(() => {
      if (t === token) void prefetchSpeech(items.slice(index + 1, index + 1 + PREFETCH_AHEAD));
    });
  void speakFrench(items[index], {
    onSettled: (outcome) => {
      if (t !== token) return;
      if (outcome === 'ended') playAt(index + 1, t);
      else if (outcome === 'failed') set({ ...state, failed: true });
      // Interrupted from outside (another speak button, Escape): the listener moved on, so the sequence ends.
      else {
        token++;
        set(IDLE);
      }
    },
  });
}

/** Starts reading `texts` from `from`, replacing whatever was playing. */
export function startSequence(id: string, texts: string[], from = 0) {
  items = texts.map((s) => s.trim()).filter(Boolean);
  if (!items.length) return;
  const t = ++token;
  set({ id, index: Math.min(Math.max(from, 0), items.length - 1), total: items.length, failed: false });
  playAt(state.index, t);
}

/** Play/pause for the player: pauses the current sentence, resumes it, or retries it after a failure. */
export function toggleSequence() {
  if (!state.id) return;
  const { phase } = getSpeechState();
  if (phase === 'paused') resumeSpeech();
  else if (phase === 'loading' || phase === 'playing') pauseSpeech();
  else playAt(state.index, ++token);
}

/** Moves by `delta` sentences and plays from there. */
export function stepSequence(delta: number) {
  if (!state.id) return;
  const index = Math.min(Math.max(state.index + delta, 0), items.length - 1);
  playAt(index, ++token);
}

export function stopSequence() {
  if (!state.id) return;
  token++;
  set(IDLE);
  stopSpeech();
}
