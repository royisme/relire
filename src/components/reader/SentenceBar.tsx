/**
 * Touch screens: the selected sentence's actions (play, explain, practise) docked at the bottom
 * instead of a pill floating over the text, so no line is ever covered. Display only.
 */
import { useTranslation } from 'react-i18next';
import { Mic, TextSearch, X } from 'lucide-react';
import { Button } from '../ui/button';
import { SpeakButton } from '../ui/speak-button';
import { panelGhost, panelSurface } from './panel';

interface Props {
  text: string;
  /** Recording is under way elsewhere; practising another sentence must wait. */
  practiseBlocked: boolean;
  onExplain: () => void;
  onPractise: () => void;
  onDismiss: () => void;
}

export function SentenceBar({ text, practiseBlocked, onExplain, onPractise, onDismiss }: Props) {
  const { t } = useTranslation();
  const practiseLabel = practiseBlocked ? t('practiceCard.finishFirst') : t('practiceCard.open');
  return (
    <section
      data-sentence-actions
      aria-label={t('reader.sentenceActions')}
      className={`${panelSurface} flex items-center gap-1 p-1 pl-3 anim-fade select-none`}
    >
      <p className="min-w-0 flex-1 truncate font-serif text-base">{text}</p>
      <SpeakButton
        text={text}
        label={t('reader.playSentence')}
        stopLabel={t('reader.stop')}
        variant="ghost"
        size="icon"
        className={panelGhost}
      />
      <Button
        variant="ghost"
        size="icon"
        className={panelGhost}
        onClick={onExplain}
        aria-label={t('reader.analyzeSentence')}
        title={t('reader.analyzeSentence')}
      >
        <TextSearch className="w-4 h-4" aria-hidden="true" />
      </Button>
      <Button
        data-practice-entry
        variant="ghost"
        size="icon"
        className={panelGhost}
        onClick={onPractise}
        disabled={practiseBlocked}
        aria-label={practiseLabel}
        title={practiseLabel}
      >
        <Mic className="w-4 h-4" aria-hidden="true" />
      </Button>
      <div className="w-px h-5 bg-panel-line" aria-hidden="true" />
      <Button
        variant="ghost"
        size="icon"
        className={panelGhost}
        onClick={onDismiss}
        aria-label={t('common.close')}
        title={t('common.close')}
      >
        <X className="w-4 h-4" aria-hidden="true" />
      </Button>
    </section>
  );
}
