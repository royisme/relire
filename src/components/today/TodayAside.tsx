/** Owns the unboxed day-count summary; missing source counts stay absent, never become zero. */
import { useTranslation } from 'react-i18next';
import type { TodayPlan } from '../../services/today/plan';

export function TodayAside({ counts }: { counts: TodayPlan['counts'] }) {
  const { t } = useTranslation();
  return (
    <aside aria-labelledby="today-so-far" className="min-w-0">
      <h3 id="today-so-far" className="mb-3 font-serif text-lg font-semibold text-ink-900">
        {t('today.counts.title')}
      </h3>
      <dl className="divide-y divide-ink-200 border-y border-ink-200">
        {(['reviews', 'exercises', 'readers'] as const).map(
          (key) =>
            counts[key] !== undefined && (
              <div key={key} className="flex items-baseline justify-between gap-4 py-3 text-sm">
                <dt className="text-ink-600">{t(`today.counts.${key}`)}</dt>
                <dd className="tnum text-ink-900">{counts[key]}</dd>
              </div>
            ),
        )}
      </dl>
    </aside>
  );
}
