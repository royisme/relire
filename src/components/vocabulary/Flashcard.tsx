/** Controlled two-sided presentation and face focus; no learning commands or persistence. */
import { useLayoutEffect, useRef, type ComponentProps } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '../ui/button';
import { SpeakButton } from '../ui/speak-button';
import { VocabularyAnswer } from './VocabularyAnswer';
export function Flashcard({
  word,
  answer,
  face,
  busy,
  onFlip,
  onListen,
}: {
  word: string;
  answer: ComponentProps<typeof VocabularyAnswer>['word'] | null;
  face: 'front' | 'back';
  busy: boolean;
  onFlip: () => void;
  onListen: () => void;
}) {
  const { t } = useTranslation();
  const flipButton = useRef<HTMLButtonElement>(null);
  const answerHeading = useRef<HTMLHeadingElement>(null);
  useLayoutEffect(() => {
    (face === 'back' ? answerHeading.current : flipButton.current)?.focus({ preventScroll: true });
  }, [face]);
  const listen = (
    <SpeakButton
      text={word}
      label={t('wordModal.listen')}
      stopLabel={t('reader.stop')}
      variant="ghost"
      showLabel
      onClick={onListen}
    />
  );
  return (
    <div data-vocabulary-card className="vocabulary-flashcard" data-face={face}>
      <div className="vocabulary-flashcard-turn">
        <section
          data-vocabulary-face="front"
          inert={face !== 'front'}
          aria-hidden={face !== 'front'}
          className="vocabulary-flashcard-face flex min-h-80 flex-col items-center justify-center gap-5 rounded-lg border border-ink-200 bg-surface p-6 text-center"
        >
          <h1
            lang="fr"
            className="max-w-full break-words font-serif text-[32px] font-semibold leading-tight sm:text-[40px]"
          >
            {word}
          </h1>
          {listen}
          <p className="text-sm text-ink-600">{t('vocab.recall')}</p>
          <Button
            ref={flipButton}
            data-vocabulary-flip
            className="w-44"
            disabled={busy}
            aria-busy={busy && !answer}
            onClick={onFlip}
          >
            {t(busy && !answer ? 'vocab.saving' : 'vocab.flip')}
          </Button>
        </section>
        {answer && (
          <section
            data-vocabulary-face="back"
            inert={face !== 'back'}
            aria-hidden={face !== 'back'}
            className="vocabulary-flashcard-face vocabulary-flashcard-back space-y-6 rounded-lg border border-ink-200 bg-surface p-4 sm:p-6"
          >
            <header className="flex flex-wrap items-center justify-between gap-3 border-b border-ink-200 pb-4">
              <p lang="fr" className="min-w-0 break-words font-serif text-2xl font-semibold">
                {word}
              </p>
              <div className="flex flex-wrap gap-2">
                {listen}
                <Button data-vocabulary-flip variant="outline" disabled={busy} onClick={onFlip}>
                  {t('vocab.flipFront')}
                </Button>
              </div>
            </header>
            <h2 ref={answerHeading} tabIndex={-1} className="font-serif text-lg font-semibold">
              {t('vocab.answer')}
            </h2>
            <VocabularyAnswer word={answer} snapshot />
          </section>
        )}
      </div>
    </div>
  );
}
