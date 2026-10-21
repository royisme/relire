/** Owns the visual face and external recall actions, guarded physical keys, errors and session-owned speech. */
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { X, EqualApproximately, Check } from 'lucide-react';
import type { VocabularyBook } from '../../types/vocabulary';
import type { VocabularyModel } from '../../hooks/useVocabulary';
import { useVocabularyReview } from '../../hooks/useVocabularyReview';
import { getSpeechState, speechKey, stopSpeech } from '../../utils/speech';
import { Button } from '../ui/button';
import { Sheet, OverlayHeader } from '../ui/overlay';
import { Link } from '../shell/Link';
import { Flashcard } from './Flashcard';
const outcomes = ['forgot', 'fuzzy', 'remembered'] as const;
const recallIcons = { forgot: X, fuzzy: EqualApproximately, remembered: Check };
const recallColors = {
  forgot: 'border-bad-200 bg-bad-50 text-bad-700 hover:bg-bad-100',
  fuzzy: 'border-ink-300 bg-ink-100 text-ink-800 hover:bg-ink-200',
  remembered: 'border-ok-200 bg-ok-50 text-ok-800 hover:bg-ok-100',
};
export function VocabularyReview({ model, book }: { model: VocabularyModel; book?: VocabularyBook }) {
  const { t } = useTranslation();
  const session = useVocabularyReview(model, book);
  const { active, revealed, busy, pending, error, recall } = session;
  const [face, setFace] = useState<'front' | 'back'>('front');
  // Reset during render, so restore/stale replacement cannot paint a different answer.
  if (!revealed && face !== 'front') setFace('front');
  const back = revealed && face === 'back';
  const hasActive = active !== null;
  const message = error ?? (session.quotaReached ? t('vocab.quotaReached') : null);
  const [errorOpen, setErrorOpen] = useState(false);
  const submittedControl = useRef<HTMLButtonElement | null>(null);
  const recallControls = useRef<Partial<Record<(typeof outcomes)[number], HTMLButtonElement | null>>>({});
  const waitHeading = useRef<HTMLHeadingElement>(null);
  const held = useRef(new Set<string>());
  const flipKey = useRef<string | null>(null);
  const ownedSpeech = useRef<string | null>(null);
  const stopOwned = () => {
    if (ownedSpeech.current && getSpeechState().key === ownedSpeech.current) stopSpeech();
    ownedSpeech.current = null;
  };
  const key = active?.candidate.key;
  useEffect(() => () => stopOwned(), [key]);
  useLayoutEffect(() => {
    if (!hasActive) waitHeading.current?.focus({ preventScroll: true });
  }, [hasActive]);
  useLayoutEffect(() => {
    if (busy) return;
    const control = submittedControl.current;
    submittedControl.current = null;
    // Disabled controls lose focus; wait until React has committed their re-enabled state.
    if (error && control?.isConnected && !control.disabled) control.focus({ preventScroll: true });
  }, [busy, error]);
  useEffect(() => {
    const keydown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (event.isComposing || event.keyCode === 229) {
        if (target?.closest('[data-vocabulary-review]')) event.preventDefault();
        return;
      }
      const repeated = event.repeat || held.current.has(event.code);
      held.current.add(event.code);
      const overlayOpen = document.querySelector('[role="dialog"],[role="menu"]');
      if (
        (repeated || (overlayOpen && !target?.closest('[role="dialog"],[role="menu"]'))) &&
        ['Enter', ' ', '1', '2', '3'].includes(event.key) &&
        target?.closest('[data-vocabulary-review]')
      ) {
        event.preventDefault();
        return;
      }
      const flipControl = target?.closest<HTMLButtonElement>('[data-vocabulary-flip]');
      if (flipControl && ['Enter', ' '].includes(event.key)) {
        flipKey.current = event.code;
        event.preventDefault();
        if (!repeated && !busy && !overlayOpen) flipControl.click();
        return;
      }
      if (
        repeated ||
        busy ||
        !back ||
        !active ||
        overlayOpen ||
        target?.closest(
          'input,textarea,select,[contenteditable="true"],a,button:not([data-vocabulary-recall]),[data-vocabulary-independent]',
        ) ||
        !target?.closest('[data-vocabulary-review]')
      )
        return;
      const outcome = outcomes[['1', '2', '3'].indexOf(event.key)];
      if (outcome) {
        event.preventDefault();
        submittedControl.current = recallControls.current[outcome] ?? null;
        void recall(outcome);
      }
    };
    const keyup = (event: KeyboardEvent) => {
      if (flipKey.current === event.code) {
        event.preventDefault();
        flipKey.current = null;
      }
      held.current.delete(event.code);
    };
    const blur = () => {
      held.current.clear();
      flipKey.current = null;
    };
    document.addEventListener('keydown', keydown, true);
    document.addEventListener('keyup', keyup, true);
    window.addEventListener('blur', blur);
    return () => {
      document.removeEventListener('keydown', keydown, true);
      document.removeEventListener('keyup', keyup, true);
      window.removeEventListener('blur', blur);
    };
  }, [recall, busy, back, active]);
  const flip = async () => {
    if (busy) return;
    if (revealed) setFace(back ? 'front' : 'back');
    else if (await session.reveal()) setFace('back');
  };
  return (
    <div
      data-vocabulary-review
      className="space-y-5"
      tabIndex={-1}
      onClickCapture={(event) => {
        const target = event.target as HTMLElement;
        const button = target.closest('button');
        if (button) submittedControl.current = button;
      }}
    >
      <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
        <Link
          to={{ name: 'study', tab: 'words' }}
          className="inline-flex min-h-10 items-center text-accent-900 underline"
        >
          {t('vocab.back')}
        </Link>
        <span className="tnum">
          {t('vocab.sessionCounts', { ratings: session.ratings, introductions: session.introductions })}
        </span>
      </div>
      <p className="tnum text-sm text-ink-600">
        {t('vocab.reviewCounts', { due: session.due, remaining: session.remaining })}
      </p>
      {active ? (
        <div className="mx-auto w-full max-w-[25rem] space-y-6">
          <Flashcard
            key={key}
            word={active.candidate.word}
            answer={revealed ? { ...active.candidate, row: active.row } : null}
            face={back ? 'back' : 'front'}
            busy={busy}
            onFlip={() => void flip()}
            onListen={() => {
              ownedSpeech.current = speechKey(active.candidate.word);
            }}
          />
          <div data-vocabulary-controls className="space-y-3">
            {back && (
              <div className="mx-auto grid max-w-xs grid-cols-3 gap-3">
                {outcomes.map((outcome) => {
                  const Icon = recallIcons[outcome];
                  return (
                    <div key={outcome} className="flex min-w-0 flex-col items-center gap-1.5">
                      <Button
                        ref={(control) => {
                          recallControls.current[outcome] = control;
                        }}
                        type="button"
                        data-vocabulary-recall={outcome}
                        variant="outline"
                        size="icon"
                        className={`h-12 w-12 shrink-0 rounded-full ${recallColors[outcome]}`}
                        disabled={busy || (!!pending && pending.outcome !== outcome)}
                        aria-label={t(`vocab.${outcome}`)}
                        aria-pressed={pending?.outcome === outcome}
                        aria-busy={busy && pending?.outcome === outcome}
                        onClick={() => void recall(outcome)}
                      >
                        <Icon className="h-5 w-5" aria-hidden="true" />
                      </Button>
                      <span className="text-center text-xs text-ink-700">{t(`vocab.${outcome}`)}</span>
                    </div>
                  );
                })}
              </div>
            )}
            <Button className="w-full" variant="ghost" disabled={busy || !!pending} onClick={session.skip}>
              {t('vocab.skip')}
            </Button>
            <div
              data-vocabulary-status
              className="flex h-16 min-w-0 items-start gap-2 overflow-hidden text-sm text-ink-600"
              role="status"
              aria-live="polite"
            >
              {busy ? (
                t('vocab.saving')
              ) : message ? (
                <>
                  <span className="line-clamp-2 min-w-0 flex-1 break-words text-bad-700">{message}</span>
                  <Button
                    variant="ghost"
                    className="w-28 shrink-0 whitespace-normal px-2 text-xs"
                    onClick={() => setErrorOpen(true)}
                  >
                    {t('vocab.errorDetails')}
                  </Button>
                </>
              ) : back ? (
                t('vocab.revealed')
              ) : null}
            </div>
          </div>
        </div>
      ) : (
        <section className="space-y-3 border-y border-ink-200 py-10">
          <h1 ref={waitHeading} tabIndex={-1} className="font-serif text-2xl font-semibold">
            {t('vocab.waiting')}
          </h1>
          <p className="tnum text-sm text-ink-600">
            {session.nextDue
              ? t('vocab.nextDue', {
                  seconds: Math.max(0, Math.ceil((session.nextDue - session.now) / 1000)),
                  time: new Date(session.nextDue).toLocaleTimeString(),
                })
              : t('vocab.noEligible')}
          </p>
          <div
            data-vocabulary-status
            role="status"
            aria-live="polite"
            className="flex h-16 min-w-0 items-start gap-2 overflow-hidden text-sm"
          >
            {message && (
              <>
                <span className="line-clamp-2 min-w-0 flex-1 break-words text-bad-700">{message}</span>
                <Button
                  variant="ghost"
                  className="w-28 shrink-0 whitespace-normal px-2 text-xs"
                  onClick={() => setErrorOpen(true)}
                >
                  {t('vocab.errorDetails')}
                </Button>
                {error && (
                  <Button variant="outline" className="shrink-0" onClick={session.retry}>
                    {t('common.retry')}
                  </Button>
                )}
              </>
            )}
          </div>
        </section>
      )}
      <Link to={{ name: 'wordsAll' }} className="inline-flex min-h-10 items-center text-sm text-accent-900 underline">
        {t('vocab.browse')}
      </Link>
      {errorOpen && (
        <Sheet label={t('vocab.errorDetails')} onClose={() => setErrorOpen(false)}>
          <OverlayHeader
            title={t('vocab.errorDetails')}
            closeLabel={t('common.close')}
            onClose={() => setErrorOpen(false)}
          />
          <p role="alert" className="overflow-auto break-words p-5 text-sm text-bad-700">
            {message}
          </p>
        </Sheet>
      )}
    </div>
  );
}
