import React from 'react';
import { useTranslation } from 'react-i18next';
import type { PronunciationAssessment } from '../../types';

/**
 * One ruled list of equal rows, each number beside what it measures. The bars are neutral (never
 * pass/fail colours) and static; a metric the provider did not measure leaves no row.
 */
export const AssessmentScores: React.FC<{ assessment: PronunciationAssessment }> = ({ assessment }) => {
  const { t } = useTranslation();
  const rows = [
    { key: 'overall', label: t('shadowing.overall'), value: assessment.overallScore, strong: true },
    { key: 'accuracy', label: t('shadowing.accuracy'), value: assessment.accuracyScore },
    { key: 'fluency', label: t('shadowing.fluency'), value: assessment.fluencyScore },
    { key: 'completeness', label: t('shadowing.completeness'), value: assessment.completenessScore },
    { key: 'rhythm', label: t('shadowing.rhythm'), value: assessment.rhythmScore },
  ].filter((r): r is typeof r & { value: number } => r.value !== undefined);

  return (
    <ul aria-label={t('shadowing.scores')} className="grid gap-x-8 sm:grid-cols-2">
      {rows.map((r) => (
        <li key={r.key} className="flex items-center gap-3 border-b border-ink-200 py-2.5 text-sm">
          <span className={`w-28 shrink-0 ${r.strong ? 'font-semibold text-ink-900' : 'text-ink-700'}`}>{r.label}</span>
          <span className="h-1 flex-1 overflow-hidden rounded-full bg-ink-200" aria-hidden="true">
            <span className="block h-full bg-ink-700" style={{ width: `${Math.min(Math.max(r.value, 0), 100)}%` }} />
          </span>
          <span className={`w-8 text-right tnum text-ink-900 ${r.strong ? 'font-semibold' : ''}`}>{r.value}</span>
        </li>
      ))}
    </ul>
  );
};
