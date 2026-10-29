/**
 * One brick of the sentence workshop: a button (or, in the breakdown, a plain
 * face) whose shape follows its role and whose small label names the role, so
 * colour is never the only cue. The frame's verb brick hangs one notch per
 * socket under it, each named with the real grammar term. Text is ordinary DOM
 * text. Owns how a brick looks and the one motion it plays; which bricks exist
 * and where they sit belongs to the round state.
 */
import { forwardRef, useEffect, useRef } from 'react';
import { X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { cn } from '../../lib/utils';
import type { BrickRole } from '../../types/atelier';
import type { Piece } from '../../services/atelier/roundState';
import { play, type Fx } from './fx';

/**
 * One silhouette per role, in ink tones only: the pill for who acts, a hard
 * double-weight block for the verb, a dashed edge for the small connecting
 * words, a leaf corner for words that describe. The role label repeats it in words.
 */
const SHAPE: Record<BrickRole, string> = {
  subject: 'rounded-full border-ink-400 px-4',
  pronoun: 'rounded-full border-dashed border-ink-400 px-4',
  verb: 'rounded-sm border-2 border-ink-700 bg-ink-100',
  auxiliary: 'rounded-sm border-2 border-dashed border-ink-700 bg-ink-100',
  noun: 'rounded-t-xl rounded-b-sm border-ink-400',
  determiner: 'rounded-md border-2 border-dotted border-ink-400',
  contraction: 'rounded-md border-4 border-double border-ink-500',
  preposition: 'rounded-sm border-dashed border-ink-500',
  adjective: 'rounded-tl-xl rounded-br-xl rounded-bl-sm rounded-tr-sm border-ink-400',
  adverb: 'rounded-tr-xl rounded-bl-xl rounded-br-sm rounded-tl-sm border-ink-400',
  negation: 'rounded-none border-2 border-ink-800 bg-ink-200',
  conjunction: 'rounded-lg border-2 border-dashed border-ink-400',
  expression: 'rounded-lg border-ink-500 bg-ink-100',
  punctuation: 'min-w-10 rounded-sm border-ink-300 bg-ink-100 px-2',
};

export type BrickState = 'rest' | 'flagged' | 'right';

const STATE: Record<BrickState, string> = {
  rest: '',
  flagged: 'border-bad-600 bg-bad-50 text-bad-700',
  right: 'border-ok-700 bg-ok-50',
};

/** What a brick shows: its role label and text, and the notches of a verb's sockets. */
export function BrickFace({ piece, state = 'rest' }: { piece: Piece; state?: BrickState }) {
  const { t } = useTranslation();
  const { brick, sockets } = piece;
  return (
    <>
      <span
        className={cn(
          'relative flex min-h-12 min-w-11 flex-col items-center justify-center border bg-surface px-3 py-1 text-center',
          SHAPE[brick.role],
          STATE[state],
        )}
      >
        <span className={cn('flex items-center gap-1 text-xs leading-4', state === 'flagged' ? '' : 'text-ink-500')}>
          {state === 'flagged' && <X className="h-4 w-4" aria-hidden="true" />}
          {t(`atelier.roles.${brick.role}`)}
        </span>
        <span
          lang="fr"
          className={cn(
            'break-words font-serif text-lg leading-6',
            state === 'flagged' ? 'text-bad-700' : 'text-ink-900',
          )}
        >
          {brick.text}
        </span>
      </span>
      {sockets && sockets.length > 0 && (
        <span className="-mt-px flex gap-2 px-2" aria-hidden="true">
          {sockets.map((label) => (
            <span key={label} className="flex flex-col items-center">
              <span className="h-2 w-4 rounded-b-sm border-2 border-t-0 border-ink-700 bg-surface" />
              <span className="text-xs leading-4 text-ink-600">{label}</span>
            </span>
          ))}
        </span>
      )}
    </>
  );
}

export interface BrickFx {
  /** The round event's counter, so the same effect twice in a row still plays twice. */
  n: number;
  kind: Fx;
  delay?: number;
}

interface BrickProps {
  piece: Piece;
  /** The tray's brick is placed; the row's brick is taken back. */
  mode: 'tray' | 'row';
  state?: BrickState;
  fx?: BrickFx;
  /** Whether motion may play: the effects switch combined with reduced motion. */
  motion: boolean;
  disabled?: boolean;
  onPress: () => void;
}

export const Brick = forwardRef<HTMLButtonElement, BrickProps>(function Brick(
  { piece, mode, state = 'rest', fx, motion, disabled, onPress },
  ref,
) {
  const { t } = useTranslation();
  const wrapper = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (fx) play(wrapper.current, fx.kind, motion, fx.delay);
    // The effect belongs to one event; a re-render with the same event must not play it again.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fx?.n, fx?.kind]);
  return (
    <span ref={wrapper} className="inline-flex origin-bottom flex-col items-start">
      <button
        ref={ref}
        type="button"
        aria-disabled={disabled || undefined}
        aria-label={t(mode === 'tray' ? 'atelier.round.place' : 'atelier.round.take', { text: piece.brick.text })}
        onClick={() => {
          if (!disabled) onPress();
        }}
        className={cn(
          'group flex flex-col items-start rounded-sm bg-transparent p-0 disabled:opacity-100',
          disabled ? 'cursor-default' : 'cursor-pointer',
        )}
      >
        <BrickFace piece={piece} state={state} />
      </button>
    </span>
  );
});

/** The empty slot a placed brick leaves on the tray, so the tray never reflows. */
export function BrickSlot({ piece }: { piece: Piece }) {
  return (
    <span className="relative inline-flex flex-col items-start" aria-hidden="true">
      <span className="invisible inline-flex flex-col items-start">
        <BrickFace piece={piece} />
      </span>
      <span className="absolute inset-x-0 top-0 h-12 rounded-md border border-dashed border-ink-200" />
    </span>
  );
}
