/**
 * Body of the sentence sheet for a graded reader: the French sentence, then a reserved translation slot whose
 * reveal is controlled by the caller, and an optional slot for a later explicit action. Presentational only: no
 * syntax, collocation or shadowing analysis, no AI call, no speech.
 */
import type { ReactNode } from 'react';
import { useId } from 'react';
import { useTranslation } from 'react-i18next';
import type { Sentence } from '../types/gradedReader';
import { authoredText } from '../utils/authoredText';
import { Button } from './ui/button';

interface SentenceAuthoredProps {
  sentence: Pick<Sentence, 'fr' | 'translation'>;
  /** Reveal is ephemeral per open; the caller decides when it resets. */
  revealed: boolean;
  onToggle: () => void;
  /** Room for a later optional action, such as an explicit AI request. */
  extra?: ReactNode;
}

export function SentenceAuthored({ sentence, revealed, onToggle, extra }: SentenceAuthoredProps) {
  const { t, i18n } = useTranslation();
  const slot = useId();

  return (
    <div className="space-y-5">
      <section className="space-y-1.5">
        <p className="text-xs font-medium text-ink-500">{t('sentenceDrawer.original')}</p>
        <p className="font-serif text-xl sm:text-2xl font-semibold text-ink-900 leading-relaxed break-words">
          « {sentence.fr} »
        </p>
      </section>

      <div className="space-y-2">
        <Button variant="outline" size="sm" aria-expanded={revealed} aria-controls={slot} onClick={onToggle}>
          {t(revealed ? 'gradedReader.hideTranslation' : 'gradedReader.showTranslation')}
        </Button>
        {/* Fixed height in both states, so revealing never moves the controls around it. */}
        <div id={slot} className="h-24 overflow-y-auto">
          {revealed && (
            <p className="text-sm text-ink-700 break-words">{authoredText(sentence.translation, i18n.language)}</p>
          )}
        </div>
      </div>

      {extra}
    </div>
  );
}
