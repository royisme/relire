/** Today: truthful introduced-card counts and the review entry. */ import { useTranslation } from 'react-i18next';
import type { VocabularyModel } from '../../hooks/useVocabulary';
import { vocabularyDue } from '../../utils/srs';
import { Link } from '../shell/Link';
export function VocabularyHome({ model }: { model: VocabularyModel }) {
  const { t } = useTranslation();
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
      <Link
        to={{ name: 'wordsReview' }}
        className="inline-flex min-h-10 items-center rounded-md bg-accent-700 px-4 text-sm text-on-fill"
      >
        {t('vocab.continue')}
      </Link>
    </div>
  );
}
