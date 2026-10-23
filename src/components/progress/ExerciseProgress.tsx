/** Honest weighted grammar-area totals beside the adaptive action; existing dashboard surfaces stay separate. */
import { useTranslation } from 'react-i18next';
import type { GrammarAreaId } from '../../types/grammar';
import { useExerciseAccuracy } from '../../hooks/useExerciseAccuracy';
import { accuracyByArea, weakGrammarTags } from '../../services/exercises/accuracy';
import { AdaptiveDrills } from './AdaptiveDrills';

const AREA_LABELS: Record<GrammarAreaId, string> = {
  'nouns-determiners': 'nouns',
  'adjectives-adverbs': 'adjectives',
  'verbs-forms': 'verbForms',
  'verbs-use': 'verbUse',
  pronouns: 'pronouns',
  sentence: 'sentence',
  skills: 'skills',
};

export function ExerciseProgress({ onMissingKey }: { onMissingKey: () => void }) {
  const { t } = useTranslation();
  const { tags, loading, error } = useExerciseAccuracy();
  const areas = accuracyByArea(tags);
  return (
    <section className="space-y-5 border-y border-ink-200 py-6 min-w-0" aria-label={t('exerciseProgress.title')}>
      <div>
        <h2 className="font-serif text-lg text-ink-900">{t('exerciseProgress.title')}</h2>
        <p className="text-sm text-ink-600 mt-1">{t('exerciseProgress.history')}</p>
      </div>
      {areas.length > 0 && (
        <dl className="divide-y divide-ink-200">
          {areas.map((row) => (
            <div key={row.area} className="flex flex-wrap justify-between gap-x-4 gap-y-1 py-2 text-sm">
              <dt className="text-ink-800">{t(`grammarAreas.${AREA_LABELS[row.area]}`)}</dt>
              <dd className="text-ink-700 tnum">
                {t('exerciseProgress.accuracy', {
                  percent: Math.round(row.accuracy * 100),
                  correct: row.correct,
                  total: row.total,
                })}
              </dd>
            </div>
          ))}
        </dl>
      )}
      <p role="status" className={`h-16 overflow-auto text-sm break-words ${error ? 'text-bad-700' : 'text-ink-600'}`}>
        {error
          ? t('exerciseProgress.readFailed', { reason: error })
          : loading
            ? t('exerciseProgress.loading')
            : !areas.length
              ? t('exerciseProgress.empty')
              : ''}
      </p>
      <AdaptiveDrills targets={weakGrammarTags(tags)} disabled={loading || !!error} onMissingKey={onMissingKey} />
    </section>
  );
}
