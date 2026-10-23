import React from 'react';
import { useTranslation } from 'react-i18next';
import { Loader2, Pause, Play, SkipBack, SkipForward, X } from 'lucide-react';
import { Button } from './ui/button';
import { panelGhost, panelPrimary, panelSurface } from './reader/panel';
import type { SpeechPhase } from '../utils/speech';

/**
 * The small player shown while an article is read aloud. It sits in the reader's bottom dock (an overlay,
 * never part of the page flow) and only shows controls; the queue lives in `utils/speech/sequence.ts`.
 */

interface ArticlePlayerProps {
  index: number;
  total: number;
  phase: SpeechPhase;
  failed: boolean;
  /** Why the current sentence could not be played, when the player knows the real reason. */
  reason?: string | null;
  onToggle: () => void;
  onStep: (delta: number) => void;
  onStop: () => void;
}

export const ArticlePlayer: React.FC<ArticlePlayerProps> = ({
  index,
  total,
  phase,
  failed,
  reason,
  onToggle,
  onStep,
  onStop,
}) => {
  const { t } = useTranslation();
  const playing = phase === 'playing' || phase === 'loading';
  const toggleLabel = playing ? t('player.pause') : t('player.play');

  return (
    <div
      role="region"
      aria-label={t('player.label')}
      className={`${panelSurface} px-2 py-2 flex items-center gap-1 anim-fade`}
    >
      <Button
        variant="ghost"
        size="icon"
        className={panelGhost}
        onClick={() => onStep(-1)}
        disabled={index === 0}
        aria-label={t('player.previous')}
        title={t('player.previous')}
      >
        <SkipBack className="w-4 h-4" />
      </Button>
      <Button
        size="icon"
        className={panelPrimary}
        onClick={onToggle}
        aria-label={toggleLabel}
        title={toggleLabel}
        aria-busy={phase === 'loading'}
      >
        {phase === 'loading' ? (
          <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
        ) : playing ? (
          <Pause className="w-4 h-4 fill-current" aria-hidden="true" />
        ) : (
          <Play className="w-4 h-4 fill-current" aria-hidden="true" />
        )}
      </Button>
      <Button
        variant="ghost"
        size="icon"
        className={panelGhost}
        onClick={() => onStep(1)}
        disabled={index >= total - 1}
        aria-label={t('player.next')}
        title={t('player.next')}
      >
        <SkipForward className="w-4 h-4" />
      </Button>

      <div className="min-w-0 flex-1 h-10 px-2 flex flex-col justify-center" aria-live="polite">
        {failed ? (
          // The real reason, wrapped and scrollable inside the same 40 px slot as the progress line
          // and bar, so a long one cannot grow the dock or lift these controls.
          <p className="max-h-8 overflow-y-auto break-words text-xs text-panel-bad-ink">
            {reason ? t('player.failedReason', { msg: reason }) : t('player.failed')}
          </p>
        ) : (
          <p className="text-xs text-panel-muted tnum truncate">
            {t('player.progress', { current: index + 1, total })}
          </p>
        )}
        <div className="mt-1 h-1 rounded-full bg-panel-line overflow-hidden" aria-hidden="true">
          <div
            className="h-full bg-panel-wave transition-[width] duration-300"
            style={{ width: `${((index + 1) / total) * 100}%` }}
          />
        </div>
      </div>

      <Button
        variant="ghost"
        size="icon"
        className={panelGhost}
        onClick={onStop}
        aria-label={t('player.stop')}
        title={t('player.stop')}
      >
        <X className="w-4 h-4" />
      </Button>
    </div>
  );
};
