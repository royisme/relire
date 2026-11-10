/** Draws the reader's preferences row and floating speed panel; state, speech and anchor preservation stay in ReaderView. */
import type { TFunction } from 'i18next';
import { Volume2, ArrowLeft, ChevronDown, Headphones, ListChecks, Pause, Play } from 'lucide-react';
import { Button, buttonVariants } from '../ui/button';
import { Link } from '../shell/Link';
import { PronunciationControls } from './PronunciationControls';
import type { PronunciationController } from '../../hooks/usePronunciationMarkers';
import type { ReaderSource } from '../../types/readerSource';
import type { SpeechPhase } from '../../utils/speech';

interface ReaderPreferencesProps {
  t: TFunction;
  sourceKind: ReaderSource['kind'];
  onBack: () => void;
  fontSize: 'sm' | 'base' | 'lg' | 'xl';
  setFontSize: (size: 'sm' | 'base' | 'lg' | 'xl') => void;
  toggleListening: () => void;
  listening: boolean;
  speechPhase: SpeechPhase;
  isSpeedControlOpen: boolean;
  setIsSpeedControlOpen: (open: boolean) => void;
  playbackRate: number;
  handlePlaybackRateChange: (rate: number) => void;
  sourceId: string;
  markers: PronunciationController;
  preserveAnchor: (apply: () => void) => void;
}

export function ReaderPreferences({
  t,
  sourceKind,
  onBack,
  fontSize,
  setFontSize,
  toggleListening,
  listening,
  speechPhase,
  isSpeedControlOpen,
  setIsSpeedControlOpen,
  playbackRate,
  handlePlaybackRateChange,
  sourceId,
  markers,
  preserveAnchor,
}: ReaderPreferencesProps) {
  const rateButton = (active: boolean) =>
    `${sourceKind === 'graded' ? 'h-10' : 'h-8'} px-2.5 rounded-md text-xs tnum cursor-pointer ${
      active ? 'bg-accent-700 text-on-fill font-medium' : 'text-ink-700 hover:bg-ink-100'
    }`;

  return (
    <>
      <button
        onClick={onBack}
        className="mr-auto -ml-2 h-10 inline-flex items-center gap-1.5 px-2 rounded-md text-sm text-ink-700 hover:bg-ink-100 hover:text-ink-900 cursor-pointer"
      >
        <ArrowLeft className="w-4 h-4" />
        <span>
          {t(
            sourceKind === 'graded'
              ? 'gradedReader.back'
              : sourceKind === 'passage'
                ? 'reader.backToUnit'
                : 'library.back',
          )}
        </span>
      </button>

      <div
        className="flex items-center rounded-md border border-ink-200 bg-surface p-0.5"
        role="group"
        aria-label={t('reader.textSize')}
      >
        {(['sm', 'base', 'lg', 'xl'] as const).map((sz, i) => (
          <button
            key={sz}
            onClick={() => setFontSize(sz)}
            aria-pressed={fontSize === sz}
            aria-label={sz}
            className={`${sourceKind === 'graded' ? 'h-10 w-10' : 'h-8 w-8'} rounded-md font-serif cursor-pointer ${
              fontSize === sz ? 'bg-ink-100 text-ink-950' : 'text-ink-600 hover:bg-ink-100'
            }`}
            style={{ fontSize: 12 + i * 2.5 }}
          >
            A
          </button>
        ))}
      </div>

      <Button variant="outline" onClick={toggleListening} aria-pressed={listening} title={t('reader.listenAll')}>
        {listening && (speechPhase === 'playing' || speechPhase === 'loading') ? (
          <Pause className="w-4 h-4" aria-hidden="true" />
        ) : listening ? (
          <Play className="w-4 h-4" aria-hidden="true" />
        ) : (
          <Headphones className="w-4 h-4" aria-hidden="true" />
        )}
        <span>{t('reader.listenAll')}</span>
      </Button>

      {sourceKind === 'article' && (
        <Link
          to={{ name: 'practice', area: 'reading' }}
          className={buttonVariants({ variant: 'outline' })}
          title={t('reader.makeExercisesHint')}
        >
          <ListChecks className="w-4 h-4" aria-hidden="true" />
          <span>{t('reader.makeExercises')}</span>
        </Link>
      )}

      <button
        onClick={() => setIsSpeedControlOpen(!isSpeedControlOpen)}
        aria-expanded={isSpeedControlOpen}
        className="h-10 inline-flex items-center gap-1.5 px-3 rounded-md border border-ink-200 bg-surface text-ink-700 hover:bg-ink-100 text-xs cursor-pointer"
        title={t('reader.speedSlider')}
      >
        <Volume2 className="w-4 h-4" />
        <span className="tnum">{playbackRate.toFixed(2)}×</span>
        <ChevronDown
          className={`w-3.5 h-3.5 text-ink-400 transition-transform ${isSpeedControlOpen ? 'rotate-180' : ''}`}
        />
      </button>

      {sourceKind !== 'graded' && (
        <PronunciationControls
          key={sourceId}
          controller={markers}
          onDisplay={() => preserveAnchor(markers.display)}
          onMode={(marked) => preserveAnchor(() => markers.setMode(marked))}
          onOpen={() => setIsSpeedControlOpen(false)}
        />
      )}

      {/* Floats over the article so opening it never moves the text */}
      {isSpeedControlOpen && (
        <div className="absolute inset-x-0 top-full z-20 mt-2 rounded-lg border border-ink-200 bg-surface p-4 space-y-3 shadow-lg anim-fade">
          <div className="flex items-center justify-between text-xs text-ink-600">
            <span className="font-medium text-ink-800">{t('reader.shadowingSpeedRange')}</span>
            <span className="text-ink-500">
              {playbackRate <= 0.65
                ? t('reader.slowPace')
                : playbackRate <= 0.85
                  ? t('reader.shadowingPace')
                  : playbackRate <= 1.05
                    ? t('reader.normalPace')
                    : t('reader.challengePace')}
            </span>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-xs text-ink-500 tnum">0.5×</span>
            <input
              type="range"
              min="0.5"
              max="1.5"
              step="0.05"
              value={playbackRate}
              onChange={(e) => handlePlaybackRateChange(parseFloat(e.target.value))}
              aria-label={t('reader.tempo')}
              className="flex-1 h-2 cursor-pointer accent-accent-700"
            />
            <span className="text-xs text-ink-500 tnum">1.5×</span>
          </div>
          <div className="flex items-center gap-1 flex-wrap">
            {[0.5, 0.75, 1.0, 1.25, 1.5].map((rate) => (
              <button
                key={rate}
                onClick={() => handlePlaybackRateChange(rate)}
                className={rateButton(Math.abs(playbackRate - rate) < 0.01)}
              >
                {rate}×
              </button>
            ))}
          </div>
        </div>
      )}
    </>
  );
}
