/**
 * Touch screens: the selected sentence's actions (play, explain, practise) docked at the bottom
 * instead of a pill floating over the text, so no line is ever covered. Display only.
 */
import { useTranslation } from 'react-i18next';
import { Mic, TextSearch, X } from 'lucide-react';
import { Button } from '../ui/button';
import { SpeakButton } from '../ui/speak-button';

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
      className="pointer-events-auto flex items-center gap-1 rounded-lg border border-ink-300 bg-surface p-1 pl-3 shadow-lg anim-fade select-none"
    >
      <p className="min-w-0 flex-1 truncate font-serif text-base text-ink-900">{text}</p>
      <SpeakButton text={text} label={t('reader.playSentence')} stopLabel={t('reader.stop')} variant="ghost" size="icon" />
      <Button variant="ghost" size="icon" onClick={onExplain} aria-label={t('reader.analyzeSentence')} title={t('reader.analyzeSentence')}>
        <TextSearch className="w-4 h-4" aria-hidden="true" />
      </Button>
      <Button
        data-practice-entry
        variant="ghost"
        size="icon"
        onClick={onPractise}
        disabled={practiseBlocked}
        aria-label={practiseLabel}
        title={practiseLabel}
      >
        <Mic className="w-4 h-4" aria-hidden="true" />
      </Button>
      <div className="w-px h-5 bg-ink-200" aria-hidden="true" />
      <Button variant="ghost" size="icon" onClick={onDismiss} aria-label={t('common.close')} title={t('common.close')}>
        <X className="w-4 h-4" aria-hidden="true" />
      </Button>
    </section>
  );
}
