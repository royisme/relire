import type {
  Challenge,
  ChallengeGrade,
  ClozeChoice,
  RecognizeChallenge,
} from '../../../services/vocabulary/game/challenge';
import type { VocabularyOutcome } from '../../../types/vocabulary';

const outcomes = ['forgot', 'fuzzy', 'remembered'] as const;

/** The choice form of a challenge (its options and the answer's index); undefined when the answer is typed. */
export function choiceOf(challenge: Challenge): RecognizeChallenge | ClozeChoice | undefined {
  if (challenge.kind === 'recognize') return challenge;
  if (challenge.kind === 'cloze' && challenge.options !== undefined && challenge.answerIndex !== undefined)
    return { ...challenge, options: challenge.options, answerIndex: challenge.answerIndex };
  return undefined;
}

/** One card's progress through the run; says nothing about the rating, which stays the plain review's own. */
export interface RunCardState {
  key: string;
  /** False until the challenge build (with the lexicon's forms) settles; the slot stays busy meanwhile. */
  ready: boolean;
  challenge: Challenge | undefined;
  /** The learner's answer and the challenge's verdict; null until the challenge is answered. */
  result: { gave: string; grade: ChallengeGrade } | null;
}

export type RunPhase = 'loading' | 'challenge' | 'answered' | 'revealed' | 'plain';

/** Where a card is: the challenge before the flip, its result, the revealed answer, or a plain flip card. */
export function runPhase(card: RunCardState | null, revealed: boolean): RunPhase {
  if (revealed) return 'revealed';
  if (!card || !card.ready) return 'loading';
  if (!card.challenge) return 'plain';
  return card.result ? 'answered' : 'challenge';
}

/** "I don't know" gives up on the challenge and reveals, exactly like the plain review's flip; it never skips. */
export const giveUpReveals = (phase: RunPhase) => phase === 'challenge';

/** Just flip (and the answered card's Flip) is the plain review for that card: the same reveal, nothing written. */
export const flipReveals = (revealed: boolean) => !revealed;

export type RunKeyAction =
  | { kind: 'pick'; index: number }
  | { kind: 'reveal' }
  | { kind: 'rate'; outcome: VocabularyOutcome };

export interface RunKeyOutcome {
  /** What the run does with the key, or null when the key belongs to someone else. */
  action: RunKeyAction | null;
  /** True when the browser's own handling must be stopped even though nothing acts. */
  preventDefault: boolean;
}

export interface RunKeyFacts {
  repeated: boolean;
  composing: boolean;
  /** Focus is in another control (the typed answer, a link, another button) that owns its keys. */
  foreignControl: boolean;
  /** A dialog or menu is open anywhere in the document. */
  overlayOpen: boolean;
  /** A write is in flight or waiting on its retry. */
  busy: boolean;
  /** The card is revealed: the rating keys work. */
  revealed: boolean;
  /** The challenge is answered: Enter and Space reveal. */
  answered: boolean;
  /** The option button the key landed on, if any (1-based, as the hints on screen). */
  choice: number | null;
  /** The key landed on one of the run's own buttons. */
  onRunButton: boolean;
  /** Options offered right now; 0 when the answer is typed or the card is past its challenge. */
  options: number;
}

/**
 * The run's key. Guarded keys (repeating, held, busy, an open overlay) never act, but on the run's own buttons
 * their native activation is still cancelled, so a held Enter cannot click an option by itself. A composition
 * keydown is never acted on and never cancelled, so an IME, dead keys and Android virtual keyboards keep typing
 * into the answer; digits rate only on a revealed card and outside every other control.
 */
export function runKey(key: string, facts: RunKeyFacts): RunKeyOutcome {
  if (facts.composing) return { action: null, preventDefault: false };
  if (facts.repeated || facts.busy || facts.overlayOpen) return { action: null, preventDefault: facts.onRunButton };
  if (facts.foreignControl) return { action: null, preventDefault: false };
  // Enter or Space on a focused option button is that option's own pick, never the reveal under it.
  if (facts.choice !== null && !facts.answered && !facts.revealed && (key === 'Enter' || key === ' '))
    return { action: { kind: 'pick', index: facts.choice }, preventDefault: true };
  if (facts.revealed) {
    const outcome = outcomes[['1', '2', '3'].indexOf(key)];
    return outcome
      ? { action: { kind: 'rate', outcome }, preventDefault: true }
      : { action: null, preventDefault: false };
  }
  if (facts.answered)
    return key === 'Enter' || key === ' '
      ? { action: { kind: 'reveal' }, preventDefault: true }
      : { action: null, preventDefault: false };
  const index = /^[1-9]$/.test(key) ? Number(key) - 1 : -1;
  return index >= 0 && index < facts.options
    ? { action: { kind: 'pick', index }, preventDefault: true }
    : { action: null, preventDefault: false };
}

/** True when focus is in a control that owns its keys; the run's own buttons are marked, so they do not count. */
export function ownedByAnotherControl(target: EventTarget | null): boolean {
  if (!(target instanceof Element) || target.closest('[data-run-key]')) return false;
  return (
    target.closest('input, textarea, select, [contenteditable="true"], a, button, [role="dialog"], [role="menu"]') !==
    null
  );
}

/** Where a keydown landed among the run's own controls: on any of its buttons, and on which option. */
export function runTarget(target: EventTarget | null): { onRunButton: boolean; choice: number | null } {
  const button = target instanceof Element ? target.closest('[data-run-key]') : null;
  if (!button) return { onRunButton: false, choice: null };
  const choice = Number(button.getAttribute('data-run-choice'));
  return { onRunButton: true, choice: Number.isInteger(choice) && choice > 0 ? choice - 1 : null };
}

/** Whether this device can speak French at all: the platform lists a French voice for its own speech. */
export function deviceVoiceReady(): boolean {
  return (
    typeof window !== 'undefined' &&
    'speechSynthesis' in window &&
    window.speechSynthesis.getVoices().some((voice) => voice.lang.toLowerCase().startsWith('fr'))
  );
}
