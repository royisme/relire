/** Flat reveal workbench with permanent controls above prose, guarded physical keys and session-owned speech. */
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { VocabularyBook, VocabularyRating } from '../../types/vocabulary';
import type { VocabularyModel } from '../../hooks/useVocabulary';
import { useVocabularyReview } from '../../hooks/useVocabularyReview';
import { initialVocabularySchedule, nextVocabularySchedule, vocabularyDue } from '../../utils/srs';
import { getSpeechState, speechKey, stopSpeech } from '../../utils/speech';
import { Button } from '../ui/button';
import { SpeakButton } from '../ui/speak-button';
import { Sheet, OverlayHeader } from '../ui/overlay';
import { Link } from '../shell/Link';
import { VocabularyAnswer } from './VocabularyAnswer';
const ratings: VocabularyRating[] = [1, 3, 4, 5];
export function VocabularyReview({ model, book }: { model: VocabularyModel; book?: VocabularyBook }) {
  const { t } = useTranslation();
  const session = useVocabularyReview(model, book);
  const { active, revealed, busy, pending, error, rate } = session;
  const hasActive = active !== null;
  const message = error ?? (session.quotaReached ? t('vocab.quotaReached') : null);
  const [errorOpen, setErrorOpen] = useState(false);
  const revealButton = useRef<HTMLButtonElement>(null);
  const answerHeading = useRef<HTMLHeadingElement>(null);
  const waitHeading = useRef<HTMLHeadingElement>(null);
  const held = useRef(new Set<string>());
  const ownedSpeech = useRef<string | null>(null);
  const stopOwned = () => {
    if (ownedSpeech.current && getSpeechState().key === ownedSpeech.current) stopSpeech();
    ownedSpeech.current = null;
  };
  const key = active?.candidate.key;
  useEffect(() => () => stopOwned(), [key]);
  useLayoutEffect(() => {
    (revealed ? answerHeading.current : hasActive ? revealButton.current : waitHeading.current)?.focus({
      preventScroll: true,
    });
  }, [key, revealed, hasActive]);
  useEffect(() => {
    const keydown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (event.isComposing || event.keyCode === 229) {
        if (target?.closest('[data-vocabulary-review]')) event.preventDefault();
        return;
      }
      const repeated = event.repeat || held.current.has(event.code);
      held.current.add(event.code);
      if (
        repeated &&
        ['Enter', ' ', '1', '2', '3', '4'].includes(event.key) &&
        target?.closest('[data-vocabulary-review]')
      ) {
        event.preventDefault();
        return;
      }
      if (
        repeated ||
        busy ||
        !revealed ||
        !active ||
        document.querySelector('[role="dialog"]') ||
        target?.closest('input,textarea,select,[contenteditable="true"]') ||
        !target?.closest('[data-vocabulary-review]')
      )
        return;
      const index = ['1', '2', '3', '4'].indexOf(event.key);
      if (index >= 0) {
        event.preventDefault();
        void rate(ratings[index]);
      }
    };
    const keyup = (event: KeyboardEvent) => {
      held.current.delete(event.code);
    };
    const blur = () => held.current.clear();
    document.addEventListener('keydown', keydown, true);
    document.addEventListener('keyup', keyup, true);
    window.addEventListener('blur', blur);
    return () => {
      document.removeEventListener('keydown', keydown, true);
      document.removeEventListener('keyup', keyup, true);
      window.removeEventListener('blur', blur);
    };
  }, [rate, busy, revealed, active]);
  const due = model.rows.filter((row) => vocabularyDue(row.schedule, session.now)).length;
  const remaining = Math.max(0, model.preferences.newPerDay - model.day.introducedKeys.length);
  const schedule = active?.row?.schedule ?? initialVocabularySchedule(session.now);
  return (
    <div
      data-vocabulary-review
      className="space-y-5"
      tabIndex={-1}
      onKeyDown={(event) => {
        if (
          event.target === event.currentTarget &&
          !event.repeat &&
          !event.nativeEvent.isComposing &&
          !revealed &&
          ['Enter', ' '].includes(event.key)
        ) {
          event.preventDefault();
          void session.reveal();
        }
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
      <p className="tnum text-sm text-ink-600">{t('vocab.reviewCounts', { due, remaining })}</p>
      {active ? (
        <section className="rounded-lg border border-ink-200 bg-surface p-4 sm:p-6">
          <header className="space-y-3 py-6 text-center">
            <h1 lang="fr" className="break-words font-serif text-[32px] font-semibold leading-tight sm:text-[40px]">
              {active.candidate.word}
            </h1>
            <SpeakButton
              text={active.candidate.word}
              label={t('wordModal.listen')}
              stopLabel={t('reader.stop')}
              variant="ghost"
              showLabel
              onClick={() => {
                ownedSpeech.current = speechKey(active.candidate.word);
              }}
            />
          </header>
          <div data-vocabulary-controls className="space-y-3 border-y border-ink-200 py-4">
            <div className="grid grid-cols-2 gap-2">
              <Button
                ref={revealButton}
                variant={revealed ? 'outline' : 'default'}
                disabled={busy || revealed}
                aria-busy={busy && !revealed}
                onClick={() => {
                  const control = revealButton.current;
                  void session.reveal().then(() => {
                    if (control?.isConnected && !control.disabled) control.focus({ preventScroll: true });
                  });
                }}
              >
                {t(busy && !revealed ? 'vocab.saving' : 'vocab.showAnswer')}
              </Button>
              <Button variant="outline" disabled={busy || !!pending} onClick={session.skip}>
                {t('vocab.skip')}
              </Button>
            </div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {ratings.map((rating) => {
                const preview = nextVocabularySchedule(schedule, rating, session.now);
                return (
                  <Button
                    key={rating}
                    className="h-16 flex-col whitespace-normal px-2"
                    variant={revealed && rating === 4 ? 'default' : 'outline'}
                    disabled={!revealed || busy || (!!pending && pending.rating !== rating)}
                    aria-pressed={pending?.rating === rating}
                    onClick={(event) => {
                      const control = event.currentTarget;
                      void rate(rating).then(() => {
                        if (control.isConnected && !control.disabled && control.getAttribute('aria-pressed') === 'true')
                          control.focus({ preventScroll: true });
                      });
                    }}
                  >
                    <span>{t(`vocab.rating.${rating}`)}</span>
                    <span className="tnum text-xs">
                      {revealed
                        ? preview.phase === 'review'
                          ? t('vocab.days', { count: preview.intervalDays })
                          : t('vocab.minutes', { count: Math.round((preview.dueAt - session.now) / 60_000) })
                        : '—'}
                    </span>
                  </Button>
                );
              })}
            </div>
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
              ) : (
                t(revealed ? 'vocab.revealed' : 'vocab.recall')
              )}
            </div>
          </div>
          {revealed && (
            <section className="space-y-5 pt-6">
              <h2 ref={answerHeading} tabIndex={-1} className="font-serif text-lg font-semibold">
                {t('vocab.answer')}
              </h2>
              <VocabularyAnswer word={{ ...active.candidate, row: active.row }} snapshot />
              <p className="text-xs text-ink-600">{t('vocab.scheduleHelp')}</p>
            </section>
          )}
        </section>
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
