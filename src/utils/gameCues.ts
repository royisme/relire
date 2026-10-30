/**
 * The game surface's sound cues, synthesised with WebAudio (no files, no
 * dependency), and the learner's two game switches: sound and effects. Both
 * are remembered in this browser. Owns the cues and the switches only; what
 * triggers a cue and what moves on screen belongs to the game that calls it.
 */
import { useSyncExternalStore } from 'react';

export type Cue = 'snap' | 'fuse' | 'wrong' | 'right' | 'finish' | 'link';

const SOUND_KEY = 'relire_game_sound';
const EFFECTS_KEY = 'relire_game_effects';

/** Both switches default to on; `0` in storage turns one off. */
function readFlag(key: string): boolean {
  try {
    return localStorage.getItem(key) !== '0';
  } catch {
    return true;
  }
}

let sound = readFlag(SOUND_KEY);
let effects = readFlag(EFFECTS_KEY);
const listeners = new Set<() => void>();

function write(key: string, value: boolean): void {
  try {
    localStorage.setItem(key, value ? '1' : '0');
  } catch {
    // The switch still works for this visit when storage is blocked.
  }
  for (const listener of listeners) listener();
}

export function setGameSound(on: boolean): void {
  sound = on;
  write(SOUND_KEY, on);
}

export function setGameEffects(on: boolean): void {
  effects = on;
  write(EFFECTS_KEY, on);
}

/** Bit 1 is sound, bit 2 is effects: one stable primitive for the store. */
const snapshot = () => (sound ? 1 : 0) | (effects ? 2 : 0);

/** The two switches, live. Reduced motion is the caller's to combine with `effects`. */
export function useGameSwitches(): { sound: boolean; effects: boolean } {
  const bits = useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    snapshot,
    snapshot,
  );
  return { sound: (bits & 1) !== 0, effects: (bits & 2) !== 0 };
}

let context: AudioContext | undefined;
let master: GainNode | undefined;

/** Master level in dB: cues are a touch under the device voice so they never cover it. */
const MASTER_DB = -14;

function audio(): { ctx: AudioContext; out: GainNode } | undefined {
  if (!context) {
    if (typeof AudioContext === 'undefined') return undefined;
    context = new AudioContext();
    master = context.createGain();
    master.gain.value = 10 ** (MASTER_DB / 20);
    master.connect(context.destination);
  }
  if (context.state === 'suspended') void context.resume();
  return { ctx: context, out: master! };
}

interface Tone {
  freq: number;
  /** Glide to this frequency over the tone. */
  to?: number;
  /** Seconds after the cue starts. */
  at?: number;
  seconds: number;
  type: OscillatorType;
  peak: number;
}

function tone(ctx: AudioContext, out: GainNode, spec: Tone): void {
  const start = ctx.currentTime + (spec.at ?? 0);
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = spec.type;
  osc.frequency.setValueAtTime(spec.freq, start);
  if (spec.to) osc.frequency.exponentialRampToValueAtTime(spec.to, start + spec.seconds);
  // A 5 ms attack and an exponential release leave no click at either end.
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.linearRampToValueAtTime(spec.peak, start + 0.005);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + spec.seconds);
  osc.connect(gain).connect(out);
  osc.start(start);
  osc.stop(start + spec.seconds + 0.02);
}

/** Each cue is a few short tones; the snap wobbles in pitch so repeats do not sound like a machine. */
/** The notes a circuit climbs, one per link: a major pentatonic from C5 that runs on into the next octave. */
const PENTATONIC = [1, 9 / 8, 5 / 4, 3 / 2, 5 / 3];

const CUES: Record<Cue, (step: number) => Tone[]> = {
  snap: () => {
    const wobble = 0.95 + Math.random() * 0.1;
    return [
      { freq: 640 * wobble, to: 380 * wobble, seconds: 0.07, type: 'triangle', peak: 0.5 },
      { freq: 1700 * wobble, seconds: 0.025, type: 'sine', peak: 0.2 },
    ];
  },
  fuse: () => [
    { freq: 520, to: 330, seconds: 0.08, type: 'triangle', peak: 0.5 },
    { freq: 440, to: 660, at: 0.05, seconds: 0.16, type: 'sine', peak: 0.4 },
  ],
  // A line landing on its brick: the snap's thump with a note on top that climbs with each link.
  link: (step) => {
    const note = 523 * PENTATONIC[step % PENTATONIC.length] * 2 ** Math.floor(step / PENTATONIC.length);
    return [
      { freq: 360, to: 200, seconds: 0.05, type: 'triangle', peak: 0.4 },
      { freq: 1700, seconds: 0.02, type: 'sine', peak: 0.14 },
      { freq: note, at: 0.02, seconds: 0.16, type: 'sine', peak: 0.3 },
    ];
  },
  wrong: () => [{ freq: 210, to: 150, seconds: 0.2, type: 'triangle', peak: 0.4 }],
  right: () => [
    { freq: 587, at: 0, seconds: 0.12, type: 'sine', peak: 0.35 },
    { freq: 784, at: 0.08, seconds: 0.18, type: 'sine', peak: 0.35 },
  ],
  finish: () => [
    { freq: 523, at: 0, seconds: 0.16, type: 'sine', peak: 0.3 },
    { freq: 659, at: 0.12, seconds: 0.16, type: 'sine', peak: 0.3 },
    { freq: 784, at: 0.24, seconds: 0.3, type: 'sine', peak: 0.3 },
  ],
};

/** Plays a cue unless sound is off or the browser has no WebAudio. It never waits and never throws. `step` is the link's place in the circuit. */
export function playCue(cue: Cue, step = 0): void {
  if (!sound) return;
  const graph = audio();
  if (!graph) return;
  for (const spec of CUES[cue](step)) tone(graph.ctx, graph.out, spec);
}
