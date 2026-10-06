import React from 'react';
import { useTranslation } from 'react-i18next';
import { CircleAlert, CircleCheck, CircleDot } from 'lucide-react';
import { PronunciationAssessment, PhonemeFeedback } from '../../types';

/** The score and feedback for one read-aloud attempt. Every text block wraps; nothing here has a fixed width. */

const STATUS_ICON: Record<PhonemeFeedback['status'], { Icon: typeof CircleCheck; tone: string }> = {
  excellent: { Icon: CircleCheck, tone: 'text-ok-800' },
  acceptable: { Icon: CircleDot, tone: 'text-ink-500' },
  needs_work: { Icon: CircleAlert, tone: 'text-bad-700' },
};

const Heading: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <h5 className="text-xs font-medium text-ink-500">{children}</h5>
);

export const AssessmentResult: React.FC<{ assessment: PronunciationAssessment }> = ({ assessment }) => {
  const { t } = useTranslation();
  const metrics = [
    { label: t('shadowing.accuracy'), value: assessment.accuracyScore },
    { label: t('shadowing.fluency'), value: assessment.fluencyScore },
    { label: t('shadowing.rhythm'), value: assessment.rhythmScore },
  ];
  const sounds = assessment.phonemeFeedback ?? [];
  const words = assessment.corrections ?? [];

  return (
    <div className="rounded-lg border border-ink-200 bg-ink-50 p-4 sm:p-5 space-y-5">
      <div className="flex items-baseline justify-between gap-3">
        <h4 className="text-sm font-medium text-ink-800">{t('shadowing.overall')}</h4>
        <p className="font-serif text-ink-900 tnum">
          <span className="text-3xl font-semibold">{assessment.overallScore}</span>
          <span className="ml-1 text-sm text-ink-500">/ 100</span>
        </p>
      </div>

      <dl className="grid grid-cols-3 gap-2">
        {metrics.map((m) => (
          <div key={m.label} className="min-w-0 rounded-md bg-surface border border-ink-200 px-2 py-2 text-center">
            <dt className="text-xs text-ink-500 truncate">{m.label}</dt>
            <dd className="mt-0.5 text-lg font-semibold text-ink-900 tnum">{m.value}</dd>
          </div>
        ))}
      </dl>

      {sounds.length > 0 && (
        <section className="space-y-2">
          <Heading>{t('shadowing.sounds')}</Heading>
          <ul className="space-y-2">
            {sounds.map((item, i) => {
              const { Icon, tone } = STATUS_ICON[item.status] ?? STATUS_ICON.acceptable;
              return (
                <li key={i} className="flex items-start gap-2.5 text-sm text-ink-800">
                  <Icon className={`mt-0.5 w-4 h-4 shrink-0 ${tone}`} aria-hidden="true" />
                  <span className="sr-only">{t(`shadowing.status.${item.status}`)}</span>
                  <p className="min-w-0 break-words">
                    <span className="mr-1.5 rounded-md bg-surface border border-ink-200 px-1.5 py-0.5 font-mono text-xs text-ink-900">
                      {item.phoneme}
                    </span>
                    <span className="font-medium text-ink-900">{item.targetWord}</span>
                    <span className="text-ink-600"> — {item.tip}</span>
                  </p>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {words.length > 0 && (
        <section className="space-y-2">
          <Heading>{t('shadowing.words')}</Heading>
          <ul className="space-y-2">
            {words.map((c, i) => (
              <li key={i} className="text-sm text-ink-800 break-words">
                <span className="font-serif font-semibold text-ink-900">« {c.word} »</span>
                {c.expectedIPA && <span className="ml-1.5 font-mono text-xs text-ink-600">{c.expectedIPA}</span>}
                <p className="text-ink-600">{c.advice}</p>
              </li>
            ))}
          </ul>
        </section>
      )}

      {assessment.coachingNotes && (
        <section className="space-y-1.5">
          <Heading>{t('shadowing.notes')}</Heading>
          <p className="text-sm text-ink-700 leading-relaxed break-words">{assessment.coachingNotes}</p>
        </section>
      )}
    </div>
  );
};
