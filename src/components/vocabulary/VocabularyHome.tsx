/** Words Overview: the same queue counts Today shows, one next action, the rhythm strip and the goal. */
import { useTranslation } from 'react-i18next';
import type { VocabularyModel } from '../../hooks/useVocabulary';
import type { VocabularyBook } from '../../types/vocabulary';
import { Check } from 'lucide-react';
import { summarizeRhythm } from '../../services/vocabulary/game/rhythm';
import { wordsInput } from '../../services/today/inputs';
import { Link } from '../shell/Link';
import { VocabularyGoal } from './VocabularyGoal';
import { VocabularyImport } from './VocabularyImport';
const actionClass = 'inline-flex min-h-10 items-center rounded-md bg-accent-700 px-4 text-sm text-on-fill';
export function VocabularyHome({
  model,
  book,
  pending,
  failed,
}: {
  model: VocabularyModel;
  /** The cached or downloaded wordbook, if any. */
  book: VocabularyBook | undefined;
  /** The wordbook is still being read or downloaded with nothing cached, or failed to load. */
  pending: boolean;
  /** The wordbook failed to load; the page status line shows the error, so the slot stays empty and not busy. */
  failed?: boolean;
}) {
  const { t, i18n } = useTranslation();
  const rhythm = summarizeRhythm(model.rows, model.now);
  const { due, newAvailable, nextDue } = wordsInput(
    model.rows,
    book,
    model.day,
    model.preferences.newPerDay,
    model.now,
  );
  const learning = model.rows.filter((row) => row.schedule && row.schedule.phase !== 'review').length;
  const waiting = pending || !model.ready;
  return (
    <div className="space-y-8">
      <div className="flex h-12 items-center" aria-busy={waiting && !failed ? 'true' : undefined}>
        {waiting ? null : due > 0 ? (
          <Link to={{ name: 'wordsReview' }} className={actionClass}>
            {t('vocab.action.review', { count: due })}
          </Link>
        ) : newAvailable > 0 ? (
          <Link to={{ name: 'wordsReview' }} className={actionClass}>
            {t('vocab.action.learn', { count: newAvailable })}
          </Link>
        ) : nextDue !== null ? (
          <p className="text-sm text-ink-700">
            {t('vocab.action.next', {
              time: new Intl.DateTimeFormat(i18n.resolvedLanguage, {
                dateStyle: 'medium',
                ...(new Date(nextDue).setHours(0, 0, 0, 0) === nextDue ? {} : { timeStyle: 'short' }),
              }).format(nextDue),
            })}
          </p>
        ) : (
          <p className="text-sm text-ink-700">{t('vocab.action.empty')}</p>
        )}
      </div>
      <dl className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-3">
        {[
          [t('vocab.due'), waiting ? '–' : due],
          [t('vocab.learning'), waiting ? '–' : learning],
          [t('vocab.available'), waiting ? '–' : newAvailable],
        ].map(([label, count]) => (
          <div key={label}>
            <dt className="text-ink-600">{label}</dt>
            <dd className="tnum text-lg">{count}</dd>
          </div>
        ))}
      </dl>
      <section className="space-y-3" aria-label={t('vocab.rhythm.title')}>
        <p className="tnum text-sm text-ink-700">{t('vocab.rhythm.count', { days: rhythm.ratedDays })}</p>
        <ol className="flex gap-3">
          {rhythm.days.map((day) => (
            <li key={day.date} className="flex w-8 flex-col items-center gap-1 text-xs text-ink-600">
              <time
                dateTime={day.date}
                aria-label={t(day.rated ? 'vocab.rhythm.ratedDay' : 'vocab.rhythm.day', { date: day.date })}
              >
                {new Date(`${day.date}T12:00:00`).toLocaleDateString(i18n.resolvedLanguage, { weekday: 'short' })}
              </time>
              <span
                aria-hidden="true"
                className="flex h-5 w-5 items-center justify-center rounded-full border border-ink-300"
              >
                {day.rated && <Check className="h-4 w-4 text-ink-800" />}
              </span>
            </li>
          ))}
        </ol>
      </section>
      <VocabularyGoal rows={model.rows} now={model.now} mature={rhythm.now.mature} />
      <div className="flex flex-wrap items-center gap-3">
        <Link
          to={{ name: 'wordsPlay' }}
          className="inline-flex min-h-10 items-center rounded-md border border-ink-300 bg-surface px-4 text-sm text-ink-800 hover:bg-ink-100"
        >
          {t('vocab.play')}
        </Link>
        <VocabularyImport />
      </div>
    </div>
  );
}
