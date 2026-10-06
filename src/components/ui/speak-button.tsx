import * as React from 'react';
import { Loader2, Square, Volume2 } from 'lucide-react';
import { cn } from '../../lib/utils';
import { Button, type ButtonProps } from './button';
import {
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

/** Volume2 at rest, a spinner while the clip loads, a stop square while it plays. */
export function SpeakIcon({ phase, className }: { phase: SpeechPhase; className?: string }) {
  const cls = cn('w-4 h-4', className);
  if (phase === 'loading') return <Loader2 className={cn(cls, 'animate-spin')} aria-hidden="true" />;
  if (phase === 'playing') return <Square className={cn(cls, 'fill-current')} aria-hidden="true" />;
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

export function SpeakButton({ text, rate, label, stopLabel, showLabel, variant, onClick, className, ...rest }: SpeakButtonProps) {
  const phase = useSpeechPhase(text);
  const active = phase !== 'idle';
  const name = active ? stopLabel : label;

  return (
    <Button
      type="button"
      variant={active ? 'default' : variant}
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
      <SpeakIcon phase={phase} />
      {showLabel && (
        // Both names share one grid cell, so the button is as wide as the longer one in every state.
        <span className="inline-grid">
          <span className={cn('col-start-1 row-start-1', active && 'invisible')}>{label}</span>
          <span className={cn('col-start-1 row-start-1', !active && 'invisible')} aria-hidden="true">{stopLabel}</span>
        </span>
      )}
    </Button>
  );
}
