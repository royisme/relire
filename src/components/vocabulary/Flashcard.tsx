/** Controlled two-sided presentation and face focus; no learning commands or persistence. */
import { useLayoutEffect, useRef, type ComponentProps } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '../ui/button';
import { SpeakButton } from '../ui/speak-button';
import type { VocabularyBook } from '../../types/vocabulary';
import { VocabularyAnswer } from './VocabularyAnswer';
export function Flashcard({
  word,
  answer,
  book,
  face,
  busy,
  onFlip,
  onListen,
}: {
  word: string;
  answer: ComponentProps<typeof VocabularyAnswer>['word'] | null;
  book?: VocabularyBook;
  face: 'front' | 'back';
  busy: boolean;
  onFlip: () => void;
  onListen: () => void;
}) {
  const { t } = useTranslation();
  const frontFlip = useRef<HTMLButtonElement>(null);
  const backFlip = useRef<HTMLButtonElement>(null);
  const wordHeading = useRef<HTMLHeadingElement>(null);
  const gesture = useRef<{ x: number; y: number; scrollX: number; scrollY: number; moved: boolean } | null>(null);
  useLayoutEffect(() => {
    (face === 'back' ? wordHeading.current : frontFlip.current)?.focus({ preventScroll: true });
  }, [face]);
  const listen = (
    <span data-vocabulary-independent>
      <SpeakButton
        text={word}
        label={t('wordModal.listen')}
        stopLabel={t('reader.stop')}
        variant="ghost"
        showLabel
        onClick={onListen}
      />
    </span>
  );
  const flipSurface = (back: boolean) => (
    <Button
      ref={back ? backFlip : frontFlip}
      type="button"
      data-vocabulary-flip
      variant="ghost"
      className="pointer-events-none absolute inset-0 h-full w-full rounded-lg p-0 hover:bg-transparent"
      disabled={busy}
      aria-busy={busy && !answer}
      aria-label={t(back ? 'vocab.flipFront' : 'vocab.flip')}
      onClick={onFlip}
    />
  );
  return (
    <div
      data-vocabulary-card
      className="vocabulary-flashcard"
      data-face={face}
      onPointerDown={(event) => {
        gesture.current =
          event.isPrimary && event.button === 0
            ? { x: event.clientX, y: event.clientY, scrollX: window.scrollX, scrollY: window.scrollY, moved: false }
            : null;
      }}
      onPointerMove={(event) => {
        const start = gesture.current;
        if (start && Math.hypot(event.clientX - start.x, event.clientY - start.y) > 8) start.moved = true;
      }}
      onPointerCancel={() => {
        gesture.current = null;
      }}
      onWheelCapture={() => {
        gesture.current = null;
      }}
      onClick={(event) => {
        const target = event.target as HTMLElement;
        if (
          target.closest(
            'button,a,input,textarea,select,[contenteditable="true"],[role="button"],[data-vocabulary-independent]',
          )
        )
          return;
        const start = gesture.current;
        gesture.current = null;
        if (
          busy ||
          event.defaultPrevented ||
          document.querySelector('[role="dialog"],[role="menu"]') ||
          !window.getSelection()?.isCollapsed ||
          (event.detail > 0 &&
            (!start || start.moved || start.scrollX !== window.scrollX || start.scrollY !== window.scrollY))
        )
          return;
        // A sibling native button supplies keyboard semantics without enclosing selectable prose or Listen.
        (face === 'back' ? backFlip.current : frontFlip.current)?.click();
      }}
    >
      <div className="vocabulary-flashcard-turn">
        <section
          data-vocabulary-face="front"
          inert={face !== 'front'}
          aria-hidden={face !== 'front'}
          className="vocabulary-flashcard-face relative flex cursor-pointer flex-col items-center gap-6 rounded-lg border border-ink-200 bg-surface p-6 text-center sm:p-8"
        >
          {flipSurface(false)}
          <div className="flex w-full min-w-0 flex-1 flex-col items-center justify-center gap-4 py-8">
            <h1
              lang="fr"
              className="max-w-full break-words font-serif text-[32px] font-semibold leading-tight sm:text-[40px]"
            >
              {word}
            </h1>
            {listen}
          </div>
          <p className="text-sm text-ink-600">{t('vocab.recall')}</p>
        </section>
        {answer && (
          <section
            data-vocabulary-face="back"
            inert={face !== 'back'}
            aria-hidden={face !== 'back'}
            className="vocabulary-flashcard-face vocabulary-flashcard-back relative flex cursor-pointer flex-col gap-8 rounded-lg border border-ink-200 bg-surface p-6 sm:p-8"
          >
            {flipSurface(true)}
            <header className="flex flex-wrap items-center justify-between gap-3">
              <h2
                ref={wordHeading}
                tabIndex={-1}
                lang="fr"
                className="min-w-0 break-words font-serif text-2xl font-semibold text-ink-700"
              >
                {word}
              </h2>
              {listen}
            </header>
            <VocabularyAnswer word={answer} snapshot book={book} />
          </section>
        )}
      </div>
    </div>
  );
}
