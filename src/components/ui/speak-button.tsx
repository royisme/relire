import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { Loader2, Square, Volume2, VolumeX } from 'lucide-react';
import { cn } from '../../lib/utils';
import { Button, type ButtonProps } from './button';
import {
  getSpeechFailure,
  getSpeechState,
  speechKey,
  subscribeSpeech,
  toggleSpeech,
  type SpeechPhase,
  type SpeechState,
} from '../../utils/speech';

/**
 * Speak controls. Loading and playing show on the control that was pressed (its icon changes,
 * its size does not), so starting a clip never moves the text around it.
 */

export function useSpeechState(): SpeechState {
  return React.useSyncExternalStore(subscribeSpeech, getSpeechState);
}

/** 'idle' unless this exact text is the one loading or playing. */
export function useSpeechPhase(text: string): SpeechPhase {
  const state = useSpeechState();
  return state.phase !== 'idle' && state.key === speechKey(text) ? state.phase : 'idle';
}

/** Why this text's clip last failed, when its control should report the real reason. */
export function useSpeechFailure(text: string): string | null {
  const failure = React.useSyncExternalStore(subscribeSpeech, getSpeechFailure);
  return failure !== null && failure.key === speechKey(text) ? failure.message : null;
}

/** Volume2 at rest, a spinner while the clip loads, a stop square while it plays. */
export function SpeakIcon({
  phase,
  failed,
  className,
}: {
  phase: SpeechPhase;
  /** The clip's real failure, shown in place at the same size. */
  failed?: boolean;
  className?: string;
}) {
  const cls = cn('w-4 h-4', className);
  if (failed) return <VolumeX className={cn('w-4 h-4 text-bad-700', className)} aria-hidden="true" />;
  if (phase === 'loading') return <Loader2 className={cn(cls, 'animate-spin')} aria-hidden="true" />;
  if (phase === 'playing' || phase === 'paused')
    return <Square className={cn(cls, 'fill-current')} aria-hidden="true" />;
  return <Volume2 className={cls} aria-hidden="true" />;
}

interface SpeakButtonProps extends Omit<ButtonProps, 'children'> {
  text: string;
  /** Overrides the shared playback rate for this button. */
  rate?: number;
  /** Idle name; the accessible name of an icon-only button. */
  label: string;
  /** Name while loading or playing, when pressing stops the clip. */
  stopLabel: string;
  /** Icon plus text instead of the icon alone. */
  showLabel?: boolean;
}

/**
 * The reason a Listen failed, as a small overlay under (or, near the bottom of the screen, over) the
 * control: visible on touch, which has no tooltips, outside the button's semantics so it is announced,
 * and clamped inside the viewport however long the provider's message is. The page never grows a row
 * for it, and pressing the control retries and clears it.
 */
function SpeechFailureBubble({ message, host }: { message: string; host: React.RefObject<HTMLSpanElement | null> }) {
  const bubble = React.useRef<HTMLSpanElement>(null);
  // Unclamped until measured, one layout pass before the browser paints.
  const [pos, setPos] = React.useState<{ left: number; above: boolean } | null>(null);
  React.useLayoutEffect(() => {
    const control = host.current;
    const box = bubble.current;
    if (!control || !box) return;
    const anchor = control.getBoundingClientRect();
    const width = box.getBoundingClientRect().width;
    const margin = 8;
    // Clamp the bubble's centre inside the viewport, then translate to the wrapper's own coordinates
    // (`left` positions against the wrapper, which is the containing block).
    const center = anchor.left + anchor.width / 2;
    const left = Math.min(Math.max(center - width / 2, margin), window.innerWidth - width - margin) - anchor.left;
    setPos({ left, above: anchor.top > window.innerHeight / 2 });
  }, [host, message]);
  return (
    <span
      ref={bubble}
      role="alert"
      // Until measured the bubble sits far off-screen left (negative offsets never create scroll
      // overflow), so the measuring layout cannot stretch the page sideways on a phone.
      style={
        pos ? { left: pos.left, ...(pos.above ? { top: 'auto', bottom: '100%' } : { top: '100%' }) } : { left: -9999 }
      }
      className="absolute left-0 top-full z-40 mt-1 mb-1 w-max max-w-[min(20rem,calc(100vw-1rem))] max-h-24 overflow-y-auto rounded-md border border-ink-200 bg-surface px-2 py-1 text-left text-xs leading-snug font-normal whitespace-normal break-words text-bad-700 shadow-lg anim-fade"
    >
      {message}
    </span>
  );
}

export function SpeakButton({
  text,
  rate,
  label,
  stopLabel,
  showLabel,
  variant,
  onClick,
  className,
  ...rest
}: SpeakButtonProps) {
  const { t } = useTranslation();
  const phase = useSpeechPhase(text);
  const failure = useSpeechFailure(text);
  const failed = phase === 'idle' && failure !== null;
  const name = failed ? t('speech.listenFailed', { msg: failure }) : phase !== 'idle' ? stopLabel : label;
  // The wrapper is always there and only positions the reason, so the control sits exactly where it
  // did before, whether a clip is loading, playing or failed.
  const host = React.useRef<HTMLSpanElement>(null);

  return (
    <span ref={host} className="relative inline-flex">
      <Button
        type="button"
        variant={phase !== 'idle' ? 'default' : variant}
        aria-label={name}
        title={name}
        aria-busy={phase === 'loading'}
        className={className}
        onClick={(e) => {
          onClick?.(e);
          toggleSpeech(text, { rate });
        }}
        {...rest}
      >
        <SpeakIcon phase={phase} failed={failed} />
        {showLabel && (
          // Both names share one grid cell, so the button is as wide as the longer one in every state.
          <span className="inline-grid">
            <span className={cn('col-start-1 row-start-1', phase !== 'idle' && 'invisible')}>{label}</span>
            <span className={cn('col-start-1 row-start-1', phase === 'idle' && 'invisible')} aria-hidden="true">
              {stopLabel}
            </span>
          </span>
        )}
      </Button>
      {failed && <SpeechFailureBubble message={name} host={host} />}
    </span>
  );
}
