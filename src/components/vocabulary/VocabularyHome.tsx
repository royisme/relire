/** Today: truthful introduced-card counts and the review entry. */ import { useTranslation } from 'react-i18next';
import type { VocabularyModel } from '../../hooks/useVocabulary';
import { Check } from 'lucide-react';
import { summarizeRhythm } from '../../services/vocabulary/game/rhythm';
import { vocabularyDue } from '../../utils/srs';
import { Link } from '../shell/Link';
import { VocabularyImport } from './VocabularyImport';
export function VocabularyHome({ model }: { model: VocabularyModel }) {
  const { t, i18n } = useTranslation();
  const rhythm = summarizeRhythm(model.rows, model.now);
  const due = model.rows.filter((row) => vocabularyDue(row.schedule, model.now)).length;
  const learning = model.rows.filter((row) => row.schedule && row.schedule.phase !== 'review').length;
  const remaining = Math.max(0, model.preferences.newPerDay - model.day.introducedKeys.length);
  return (
    <div className="space-y-8">
      <dl className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-3">
        {[
          [t('vocab.due'), due],
          [t('vocab.learning'), learning],
          [t('vocab.remaining'), remaining],
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
      <div className="flex flex-wrap items-center gap-3">
        <Link
          to={{ name: 'wordsReview' }}
          className="inline-flex min-h-10 items-center rounded-md bg-accent-700 px-4 text-sm text-on-fill"
        >
          {t('vocab.continue')}
        </Link>
        <Link
          to={{ name: 'wordsPlay' }}
          className="inline-flex min-h-10 items-center rounded-md border border-ink-300 bg-surface px-4 text-sm text-ink-800 hover:bg-ink-100"
        >
          {t('vocab.play')}
        </Link>
        <Link
          to={{ name: 'wordsMap' }}
          className="inline-flex min-h-10 items-center rounded-md border border-ink-300 bg-surface px-4 text-sm text-ink-800 hover:bg-ink-100"
        >
          {t('vocab.map.title')}
        </Link>
        <VocabularyImport />
      </div>
    </div>
  );
}
