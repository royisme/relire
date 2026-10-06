import React from 'react';
import { useTranslation } from 'react-i18next';
import { VocabWord, UserStats } from '../types';
import { toggleSpeech } from '../utils/speech';
import { SpeakIcon, useSpeechPhase } from './ui/speak-button';
import { PageHeader } from './ui/page-header';
import { FRENCH_IPA, IpaGroup } from '../data/frenchIpa';

interface AnalyticsDashboardProps {
  stats: UserStats;
  vocabList: VocabWord[];
}

const GROUPS: IpaGroup[] = ['vowels', 'nasals', 'semivowels', 'consonants'];

/** One sound with an example word; pressing it speaks the word and its icon shows loading / playing in place. */
const IpaTile: React.FC<{ symbol: string; word: string; label: string }> = ({ symbol, word, label }) => {
  const phase = useSpeechPhase(word);
  return (
    <button
      type="button"
      onClick={() => toggleSpeech(word)}
      aria-label={label}
      className="group w-full h-16 rounded-md border border-ink-200 bg-surface hover:border-accent-300 hover:bg-accent-50 flex flex-col items-center justify-center cursor-pointer"
    >
      <span className="text-xl leading-none text-ink-900">[{symbol}]</span>
      <span className="mt-1.5 inline-flex items-center gap-1 font-serif text-sm text-ink-600">
        {word}
        <SpeakIcon phase={phase} className="w-3 h-3 text-ink-400 group-hover:text-accent-900" />
      </span>
    </button>
  );
};

export const AnalyticsDashboard: React.FC<AnalyticsDashboardProps> = ({ stats, vocabList }) => {
  const { t } = useTranslation();
  const masteredCount = vocabList.filter((w) => w.repetitions >= 4).length;
  const history = stats.pronunciationHistory ?? [];

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6 space-y-8">
      <PageHeader title={t('analytics.title')} subtitle={t('analytics.subtitle')} />

      <dl className="grid grid-cols-1 sm:grid-cols-3 divide-y sm:divide-y-0 sm:divide-x divide-ink-200 rounded-lg border border-ink-200 bg-surface">
        <div className="p-4 space-y-1">
          <dt className="text-xs text-ink-500">{t('analytics.wordsLearned')}</dt>
          <dd className="text-2xl font-serif font-semibold text-ink-900 tnum">{vocabList.length}</dd>
          <dd className="text-xs text-ink-500">{t('vocab.mastered')}: <span className="tnum">{masteredCount}</span></dd>
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
          <dd className="text-2xl font-serif font-semibold text-ink-900 tnum">{stats.shadowingSessionsCompleted ?? 0}</dd>
          <dd className="text-xs text-ink-500">
            {t('analytics.sentencesCount', { count: stats.sentencesAnalyzed ?? 0 })}
          </dd>
        </div>
      </dl>

      {history.length > 0 && (
        <section className="space-y-3">
          <h3 className="font-serif font-semibold text-lg text-ink-900">{t('analytics.scoreHistory')}</h3>
          <ul className="rounded-lg border border-ink-200 bg-surface divide-y divide-ink-200">
            {history.slice(-5).reverse().map((rec, idx) => (
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

      <section className="space-y-4">
        <div>
          <h3 className="font-serif font-semibold text-lg text-ink-900">{t('ipa.title')}</h3>
          <p className="text-sm text-ink-500 mt-0.5">{t('ipa.subtitle')}</p>
        </div>
        {GROUPS.map((group) => (
          <div key={group} className="space-y-2">
            <h4 className="text-sm font-medium text-ink-700">{t(`ipa.${group}`)}</h4>
            <ul className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-2">
              {FRENCH_IPA[group].map((s) => (
                <li key={s.symbol}>
                  <IpaTile symbol={s.symbol} word={s.word} label={t('ipa.play', { word: s.word, symbol: s.symbol })} />
                </li>
              ))}
            </ul>
          </div>
        ))}
      </section>
    </div>
  );
};
