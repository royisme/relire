import type { RefObject } from 'react';
import { useTranslation } from 'react-i18next';
import type { VocabularyRow } from '../../../types/vocabulary';
import { Button } from '../../ui/button';
import { Link } from '../../shell/Link';

/**
 * The earliest time any scheduled card comes back, learning or review phase alike; null when nothing waits.
 * The hook's own `nextDue` counts only learning steps, which is not what a finished run wants to say.
 */
export function runNextDue(rows: readonly VocabularyRow[], now: number): number | null {
  const future = rows.flatMap((row) => (row.schedule && row.schedule.dueAt > now ? [row.schedule.dueAt] : []));
  return future.length ? Math.min(...future) : null;
}

/** The line a finished state shows: when the next card really comes back, or that nothing waits. */
export function RunNextDueLine({ due }: { due: number | null }) {
  const { t } = useTranslation();
  return (
    <p className="tnum break-words text-sm text-ink-600">
      {due === null
        ? t('vocab.game.nothingWaiting')
        : t('vocab.game.nextDue', { time: new Date(due).toLocaleString() })}
    </p>
  );
}

/** The end of a chunk: the real counts, the real next due time, Continue and the way back to Words. */
export function RunDone({
  ratings,
  due,
  nextDue,
  onContinue,
  heading,
}: {
  ratings: number;
  due: number;
  nextDue: number | null;
  onContinue: () => void;
  heading: RefObject<HTMLHeadingElement | null>;
}) {
  const { t } = useTranslation();
  return (
    <section className="space-y-3 border-y border-ink-200 py-10">
      <h1 ref={heading} tabIndex={-1} className="font-serif text-2xl font-semibold">
        {t('vocab.game.doneTitle')}
      </h1>
      <p role="status" className="tnum break-words text-sm text-ink-800">
        {t('vocab.game.doneCounts', { ratings, due })}
      </p>
      <RunNextDueLine due={nextDue} />
      <div className="flex flex-wrap items-center gap-3">
        <Button type="button" onClick={onContinue}>
          {t('vocab.game.continueRun')}
        </Button>
        <Link
          to={{ name: 'study', tab: 'words' }}
          className="inline-flex min-h-10 items-center rounded-md border border-ink-300 bg-surface px-4 text-sm text-ink-800 hover:bg-ink-100"
        >
          {t('vocab.back')}
        </Link>
      </div>
    </section>
  );
}

/** The queue with nothing left to play right now: what really comes back next, and the way back to Words. */
export function RunCleared({ nextDue }: { nextDue: number | null }) {
  const { t } = useTranslation();
  return (
    <section className="space-y-3 border-y border-ink-200 py-10">
      <h1 className="font-serif text-2xl font-semibold">{t('vocab.game.queueCleared')}</h1>
      <RunNextDueLine due={nextDue} />
      <Link
        to={{ name: 'study', tab: 'words' }}
        className="inline-flex min-h-10 items-center text-accent-900 underline"
      >
        {t('vocab.back')}
      </Link>
    </section>
  );
}
