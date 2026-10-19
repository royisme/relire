/** Draws the floating sentence-action pill; positioning, speech subscriptions and practice state stay in ReaderView. */
import type { TFunction } from 'i18next';
import { Mic, TextSearch } from 'lucide-react';
import type { ReaderToolbarPosition } from '../../hooks/useReaderToolbarPosition';
import { SpeakButton } from '../ui/speak-button';

interface ReaderSentenceToolbarProps {
  t: TFunction;
  toolbar: ReaderToolbarPosition;
  cancelClear: () => void;
  scheduleClear: () => void;
  speechActive: boolean;
  onExplain: () => void;
  onPractise: () => void;
  cardBusy: boolean;
  practisedId: string | null;
}

export function ReaderSentenceToolbar({
  t,
  toolbar,
  cancelClear,
  scheduleClear,
  speechActive,
  onExplain,
  onPractise,
  cardBusy,
  practisedId,
}: ReaderSentenceToolbarProps) {
  const toolbarButton = (active: boolean) =>
    active ? 'bg-accent-700 text-on-fill hover:bg-accent-800' : 'text-ink-700 hover:text-ink-950 hover:bg-ink-100';
  const practiceButton = toolbarButton(practisedId === toolbar.id);

  return (
    <div
      data-sentence-actions
      onPointerEnter={(e) => e.pointerType === 'mouse' && cancelClear()}
      onPointerLeave={(e) => e.pointerType === 'mouse' && scheduleClear()}
      style={{ top: toolbar.top, left: toolbar.left }}
      className="absolute z-20 pl-2 anim-fade select-none"
    >
      <div className="flex items-center gap-0.5 p-1 rounded-lg border border-ink-300 bg-surface text-ink-900 shadow-lg font-sans text-xs">
        <SpeakButton
          text={toolbar.text}
          label={t('reader.playSentence')}
          stopLabel={t('reader.stop')}
          variant="ghost"
          size="icon"
          className={`h-7 w-7 transition-colors ${toolbarButton(speechActive)}`}
        />
        <div className="w-px h-3.5 bg-ink-200" />
        <button
          onClick={onExplain}
          aria-label={t('reader.analyzeSentence')}
          title={t('reader.analyzeSentence')}
          className={`h-7 w-7 inline-flex items-center justify-center rounded-md cursor-pointer transition-colors ${toolbarButton(false)}`}
        >
          <TextSearch className="w-3.5 h-3.5" />
        </button>
        <button
          data-practice-entry
          onClick={onPractise}
          disabled={cardBusy}
          aria-label={cardBusy ? t('practiceCard.finishFirst') : t('practiceCard.open')}
          title={cardBusy ? t('practiceCard.finishFirst') : t('practiceCard.open')}
          className={`h-7 w-7 inline-flex items-center justify-center rounded-md cursor-pointer transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${practiceButton}`}
        >
          <Mic className="w-3.5 h-3.5" aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}
