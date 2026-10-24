import React from 'react';
import { useTranslation } from 'react-i18next';
import { ExerciseProgress } from './progress/ExerciseProgress';
import { UserStats } from '../types';
import type { VocabularyRow } from '../types/vocabulary';
import { PageHeader } from './ui/page-header';

interface AnalyticsDashboardProps {
  stats: UserStats;
  vocabList: VocabularyRow[];
  onMissingKey: () => void;
}

export const AnalyticsDashboard: React.FC<AnalyticsDashboardProps> = ({ stats, vocabList, onMissingKey }) => {
  const { t } = useTranslation();
  const bookmarkedCount = vocabList.filter((word) => word.bookmarked).length;
  const introducedCount = vocabList.filter((word) => word.schedule).length;
  const submittedRatings = vocabList.reduce((sum, word) => sum + word.history.length, 0);
  const history = stats.pronunciationHistory ?? [];

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6 space-y-8">
      <PageHeader title={t('analytics.title')} subtitle={t('analytics.subtitle')} />

      <dl className="grid grid-cols-1 sm:grid-cols-3 divide-y sm:divide-y-0 sm:divide-x divide-ink-200 rounded-lg border border-ink-200 bg-surface">
        <div className="p-4 space-y-1">
          <dt className="text-xs text-ink-500">{t('vocab.bookmarked')}</dt>
          <dd className="text-2xl font-serif font-semibold text-ink-900 tnum">{bookmarkedCount}</dd>
          <dd className="text-xs text-ink-500">
            {t('vocab.analyticsCounts', { introduced: introducedCount, ratings: submittedRatings })}
          </dd>
        </div>
        <div className="p-4 space-y-1">
          <dt className="text-xs text-ink-500">{t('analytics.avgScore')}</dt>
          <dd className="text-2xl font-serif font-semibold text-ink-900 tnum">
            {history.length ? stats.averagePronunciationScore : '—'}
            {history.length > 0 && <span className="text-sm font-normal text-ink-400">/100</span>}
          </dd>
        </div>
        <div className="p-4 space-y-1">
          <dt className="text-xs text-ink-500">{t('analytics.oralSessions')}</dt>
          <dd className="text-2xl font-serif font-semibold text-ink-900 tnum">
            {stats.shadowingSessionsCompleted ?? 0}
          </dd>
          <dd className="text-xs text-ink-500">
            {t('analytics.sentencesCount', { count: stats.sentencesAnalyzed ?? 0 })}
          </dd>
        </div>
      </dl>

      <ExerciseProgress onMissingKey={onMissingKey} />

      {history.length > 0 && (
        <section className="space-y-3">
          <h3 className="font-serif font-semibold text-lg text-ink-900">{t('analytics.scoreHistory')}</h3>
          <ul className="rounded-lg border border-ink-200 bg-surface divide-y divide-ink-200">
            {history
              .slice(-5)
              .reverse()
              .map((rec, idx) => (
                <li key={idx} className="flex items-center justify-between gap-3 px-4 py-3">
                  <div className="min-w-0">
                    <p className="font-serif text-ink-900 truncate">« {rec.text} »</p>
                    <p className="text-xs text-ink-500 mt-0.5">{rec.date}</p>
                  </div>
                  <span className="font-serif text-lg font-semibold text-ink-900 tnum shrink-0">
                    {rec.score}
                    <span className="text-xs font-normal text-ink-400"> / 100</span>
                  </span>
                </li>
              ))}
          </ul>
        </section>
      )}
    </div>
  );
};
