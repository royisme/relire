import React from 'react';
import { useTranslation } from 'react-i18next';
import { Loader2, Pause, Play, SkipBack, SkipForward, X } from 'lucide-react';
import { Button } from './ui/button';
import type { SpeechPhase } from '../utils/speech';

/**
 * The small player shown while an article is read aloud. It floats at the bottom of the screen (an overlay,
 * never part of the page flow) and only shows controls; the queue lives in `utils/speech/sequence.ts`.
 */

interface ArticlePlayerProps {
  index: number;
  total: number;
  phase: SpeechPhase;
  failed: boolean;
  onToggle: () => void;
  onStep: (delta: number) => void;
  onStop: () => void;
}

export const ArticlePlayer: React.FC<ArticlePlayerProps> = ({ index, total, phase, failed, onToggle, onStep, onStop }) => {
  const { t } = useTranslation();
  const playing = phase === 'playing' || phase === 'loading';
  const toggleLabel = playing ? t('player.pause') : t('player.play');

  return (
    <div className="fixed inset-x-0 bottom-0 z-30 px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pointer-events-none">
      <div
        role="region"
        aria-label={t('player.label')}
        className="pointer-events-auto mx-auto max-w-md rounded-lg border border-ink-300 bg-surface shadow-lg px-2 py-2 flex items-center gap-1 anim-fade"
      >
        <Button variant="ghost" size="icon" onClick={() => onStep(-1)} disabled={index === 0} aria-label={t('player.previous')} title={t('player.previous')}>
          <SkipBack className="w-4 h-4" />
        </Button>
        <Button size="icon" onClick={onToggle} aria-label={toggleLabel} title={toggleLabel} aria-busy={phase === 'loading'}>
          {phase === 'loading' ? (
            <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
          ) : playing ? (
            <Pause className="w-4 h-4 fill-current" aria-hidden="true" />
          ) : (
            <Play className="w-4 h-4 fill-current" aria-hidden="true" />
          )}
        </Button>
        <Button variant="ghost" size="icon" onClick={() => onStep(1)} disabled={index >= total - 1} aria-label={t('player.next')} title={t('player.next')}>
          <SkipForward className="w-4 h-4" />
        </Button>

        <div className="min-w-0 flex-1 px-2" aria-live="polite">
          {failed ? (
            <p className="text-xs text-bad-700 truncate">{t('player.failed')}</p>
          ) : (
            <p className="text-xs text-ink-600 tnum truncate">{t('player.progress', { current: index + 1, total })}</p>
          )}
          <div className="mt-1 h-1 rounded-full bg-ink-200 overflow-hidden" aria-hidden="true">
            <div className="h-full bg-accent-600 transition-[width] duration-300" style={{ width: `${((index + 1) / total) * 100}%` }} />
          </div>
        </div>

        <Button variant="ghost" size="icon" onClick={onStop} aria-label={t('player.stop')} title={t('player.stop')}>
          <X className="w-4 h-4" />
        </Button>
      </div>
    </div>
  );
};
