import React from 'react';
import { useTranslation } from 'react-i18next';
import { ShadowingGuide as Guide } from '../../types';

/**
 * How to say the sentence: pace, where to pause, liaisons, intonation. Label above text, so a long
 * tip simply wraps instead of squeezing a column.
 */

const Item: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <div className="space-y-1">
    <dt className="text-xs font-medium text-ink-500">{label}</dt>
    <dd className="text-sm text-ink-800 leading-relaxed break-words">{children}</dd>
  </div>
);

export const ShadowingGuide: React.FC<{ guide: Guide }> = ({ guide }) => {
  const { t } = useTranslation();
  const groups = guide.rhythmGroups ?? [];
  const liaisons = guide.liaisons ?? [];
  if (!guide.speedTip && !groups.length && !liaisons.length && !guide.intonation) return null;

  return (
    <dl className="space-y-4">
      {guide.speedTip && <Item label={t('shadowing.pace')}>{guide.speedTip}</Item>}
      {groups.length > 0 && (
        <Item label={t('shadowing.phrasing')}>
          <span className="flex flex-wrap items-center gap-x-1.5 gap-y-1.5 font-serif text-base">
            {groups.map((g, i) => (
              <React.Fragment key={i}>
                {i > 0 && <span className="text-ink-400" aria-hidden="true">/</span>}
                <span className="rounded-md bg-ink-100 px-2 py-0.5 text-ink-900">{g}</span>
              </React.Fragment>
            ))}
          </span>
        </Item>
      )}
      {liaisons.length > 0 && (
        <Item label={t('shadowing.liaisons')}>
          {liaisons.length === 1 ? (
            liaisons[0]
          ) : (
            <ul className="list-disc pl-4 space-y-0.5">
              {liaisons.map((l, i) => <li key={i}>{l}</li>)}
            </ul>
          )}
        </Item>
      )}
      {guide.intonation && <Item label={t('shadowing.intonation')}>{guide.intonation}</Item>}
    </dl>
  );
};
